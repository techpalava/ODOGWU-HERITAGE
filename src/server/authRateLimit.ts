import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { HttpRequest } from "./httpTypes.js";

/**
 * Fixed-window rate limiting for /api/auth/* backed by the existing
 * Firestore database (Admin SDK). Documents live in `authRateLimits`, which
 * client rules already deny through the catch-all rule. Keys are hashed so
 * no raw email address or IP address is stored.
 *
 * Each document carries `expiresAt`; a Firestore TTL policy on that field
 * removes old windows automatically once enabled in the console.
 */
export const AUTH_RATE_LIMIT_COLLECTION = "authRateLimits";

export type AuthRateLimitRule = {
  bucket: string;
  limit: number;
  windowMs: number;
};

const MINUTE = 60 * 1000;

export const AUTH_RATE_LIMITS = {
  pinLoginPerIp: { bucket: "pin-login-ip", limit: 30, windowMs: 15 * MINUTE },
  pinLoginPerIdentifier: {
    bucket: "pin-login-identifier",
    limit: 10,
    windowMs: 15 * MINUTE,
  },
  pinRegisterPerIp: {
    bucket: "pin-register-ip",
    limit: 10,
    windowMs: 60 * MINUTE,
  },
  pinRegisterPerEmail: {
    bucket: "pin-register-email",
    limit: 5,
    windowMs: 60 * MINUTE,
  },
  bootstrapPerIp: { bucket: "bootstrap-ip", limit: 300, windowMs: 10 * MINUTE },
  bootstrapPerUser: {
    bucket: "bootstrap-uid",
    limit: 60,
    windowMs: 10 * MINUTE,
  },
} as const satisfies Record<string, AuthRateLimitRule>;

export class AuthRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("RATE_LIMITED");
    this.name = "AuthRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function hashRateLimitKey(bucket: string, key: string): string {
  return createHash("sha256").update(`${bucket}\u0000${key}`).digest("hex");
}

/**
 * Vercel sets `x-forwarded-for` (client first) and `x-real-ip`. Anything
 * unparseable falls into one shared "unknown" bucket so a missing header
 * cannot bypass the per-IP limit.
 */
export function getClientIp(req: HttpRequest): string {
  const read = (name: string) => {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const forwarded = read("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = read("x-real-ip")?.trim();
  return forwarded || realIp || "unknown";
}

type StoredWindow = { count?: number; windowStart?: number };

/**
 * Atomically counts one attempt. Throws AuthRateLimitError when the window
 * is already full. Concurrent requests serialize through the transaction.
 */
export async function consumeAuthRateLimit(
  db: Firestore,
  rule: AuthRateLimitRule,
  key: string,
  now: () => number = Date.now,
): Promise<void> {
  const reference = db
    .collection(AUTH_RATE_LIMIT_COLLECTION)
    .doc(hashRateLimitKey(rule.bucket, key));

  const retryAfterSeconds = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const stored = (snapshot.exists ? snapshot.data() : undefined) as
      | StoredWindow
      | undefined;
    const currentTime = now();
    const windowActive =
      typeof stored?.windowStart === "number" &&
      currentTime - stored.windowStart < rule.windowMs;
    const windowStart = windowActive ? stored!.windowStart! : currentTime;
    const count = windowActive ? stored?.count || 0 : 0;

    if (count >= rule.limit) {
      return Math.max(
        1,
        Math.ceil((windowStart + rule.windowMs - currentTime) / 1000),
      );
    }

    transaction.set(reference, {
      bucket: rule.bucket,
      count: count + 1,
      windowStart,
      expiresAt: new Date(windowStart + rule.windowMs),
    });
    return 0;
  });

  if (retryAfterSeconds > 0) {
    throw new AuthRateLimitError(retryAfterSeconds);
  }
}
