import {
  createHash,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

/**
 * One-time 6-digit email codes for passwordless sign-in.
 *
 * - One document per email in `authEmailCodes`, keyed by a hash of the
 *   canonical address (no raw address in the document ID).
 * - Only a salted scrypt hash of the code is stored.
 * - Codes expire after 10 minutes, are single use, allow 5 tries, and can be
 *   re-sent once every 60 seconds. A new code replaces the previous one.
 * - Issuing behaves the same whether or not an account exists.
 */
export const AUTH_EMAIL_CODE_COLLECTION = "authEmailCodes";
export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
export const EMAIL_CODE_RESEND_COOLDOWN_MS = 60 * 1000;

export type EmailCodePurpose = "sign-in" | "pin-confirmation";

type StoredEmailCode = {
  codeHash?: string;
  expiresAt?: Date | { toDate(): Date };
  attempts?: number;
  lastSentAt?: number;
  consumedAt?: number | null;
  name?: string;
  purpose?: EmailCodePurpose;
};

export function isValidEmailCode(code: unknown): code is string {
  return typeof code === "string" && /^\d{6}$/.test(code);
}

export function generateEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashEmailCode(code: string, salt = randomBytes(16).toString("hex")) {
  return `scrypt$${salt}$${scryptSync(code, salt, 32).toString("hex")}`;
}

function emailCodeMatches(code: string, stored?: string): boolean {
  if (!stored) return false;
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = scryptSync(code, salt, 32);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function toMillis(value: StoredEmailCode["expiresAt"]): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  return typeof value.toDate === "function" ? value.toDate().getTime() : 0;
}

export function emailCodeDocumentId(canonicalEmail: string): string {
  return createHash("sha256")
    .update(`email-code\u0000${canonicalEmail}`)
    .digest("hex");
}

export type IssueEmailCodeResult = {
  sent: boolean;
  resendAfterSeconds: number;
  expiresInSeconds: number;
};

/**
 * Creates a fresh code and hands it to `send`. Inside the resend cooldown it
 * sends nothing and reports how long to wait. If sending fails, the cooldown
 * is cleared so the person can retry straight away.
 */
export async function issueEmailCode(
  db: Firestore,
  canonicalEmail: string,
  options: {
    purpose: EmailCodePurpose;
    name?: string;
    send: (code: string) => Promise<void>;
    now?: () => number;
    generate?: () => string;
  },
): Promise<IssueEmailCodeResult> {
  const now = options.now || Date.now;
  const reference = db
    .collection(AUTH_EMAIL_CODE_COLLECTION)
    .doc(emailCodeDocumentId(canonicalEmail));

  const issued = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const stored = (snapshot.exists ? snapshot.data() : undefined) as
      | StoredEmailCode
      | undefined;
    const currentTime = now();
    const sinceLast = currentTime - (stored?.lastSentAt || 0);
    if (stored?.lastSentAt && sinceLast < EMAIL_CODE_RESEND_COOLDOWN_MS) {
      return {
        code: null,
        resendAfterSeconds: Math.ceil(
          (EMAIL_CODE_RESEND_COOLDOWN_MS - sinceLast) / 1000,
        ),
      };
    }
    const code = (options.generate || generateEmailCode)();
    const name = options.name?.trim().slice(0, 120);
    transaction.set(reference, {
      codeHash: hashEmailCode(code),
      purpose: options.purpose,
      ...(name ? { name } : {}),
      attempts: 0,
      lastSentAt: currentTime,
      consumedAt: null,
      expiresAt: new Date(currentTime + EMAIL_CODE_TTL_MS),
    });
    return {
      code,
      resendAfterSeconds: Math.ceil(EMAIL_CODE_RESEND_COOLDOWN_MS / 1000),
    };
  });

  if (!issued.code) {
    return {
      sent: false,
      resendAfterSeconds: issued.resendAfterSeconds,
      expiresInSeconds: EMAIL_CODE_TTL_MS / 1000,
    };
  }

  try {
    await options.send(issued.code);
  } catch (error) {
    await reference.set({ lastSentAt: 0 }, { merge: true });
    throw error;
  }
  return {
    sent: true,
    resendAfterSeconds: issued.resendAfterSeconds,
    expiresInSeconds: EMAIL_CODE_TTL_MS / 1000,
  };
}

/**
 * Checks a code in one transaction. Wrong codes count toward the 5-try
 * limit; a correct code is marked used so it cannot be replayed.
 * Throws INVALID_CODE or CODE_ATTEMPTS_EXCEEDED.
 */
export async function verifyEmailCode(
  db: Firestore,
  canonicalEmail: string,
  code: string,
  options: { purpose?: EmailCodePurpose; now?: () => number } = {},
): Promise<{ name?: string; purpose?: EmailCodePurpose }> {
  if (!isValidEmailCode(code)) throw new Error("INVALID_CODE");
  const now = options.now || Date.now;
  const reference = db
    .collection(AUTH_EMAIL_CODE_COLLECTION)
    .doc(emailCodeDocumentId(canonicalEmail));

  const outcome = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const stored = (snapshot.exists ? snapshot.data() : undefined) as
      | StoredEmailCode
      | undefined;
    const currentTime = now();
    if (
      !stored?.codeHash ||
      stored.consumedAt ||
      toMillis(stored.expiresAt) <= currentTime ||
      (options.purpose && stored.purpose !== options.purpose)
    ) {
      return { error: "INVALID_CODE" as const };
    }
    const attempts = stored.attempts || 0;
    if (attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      return { error: "CODE_ATTEMPTS_EXCEEDED" as const };
    }
    if (!emailCodeMatches(code, stored.codeHash)) {
      const nextAttempts = attempts + 1;
      transaction.set(reference, { attempts: nextAttempts }, { merge: true });
      return {
        error:
          nextAttempts >= EMAIL_CODE_MAX_ATTEMPTS
            ? ("CODE_ATTEMPTS_EXCEEDED" as const)
            : ("INVALID_CODE" as const),
      };
    }
    transaction.set(reference, { consumedAt: currentTime }, { merge: true });
    return { name: stored.name, purpose: stored.purpose };
  });

  if ("error" in outcome && outcome.error) throw new Error(outcome.error);
  return outcome as { name?: string; purpose?: EmailCodePurpose };
}
