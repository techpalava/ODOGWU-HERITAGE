import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthRateLimitRule } from "./authRateLimit.js";
import {
  AI_TRY_ON_GLOBAL_GENERATION_CAP,
  AI_TRY_ON_TRIES_PER_ORDER,
} from "../utils/aiTryOnGatewayContract.js";

/**
 * AI Try-on usage limits, kept in the existing Firestore database through
 * the Admin SDK (client rules deny `aiTryOnUsage` through the catch-all rule).
 *
 * - `aiTryOnUsage/global`: lifetime count of generations, capped at 1000.
 * - `aiTryOnUsage/order-<sha256>`: tries for one order, capped at 5. The
 *   order key is hashed so no raw draft id is stored. Each order counter
 *   carries `expiresAt` (90 days after its first try); a Firestore TTL
 *   policy on `aiTryOnUsage.expiresAt` deletes it, and an expired counter
 *   still waiting for TTL deletion is treated as a fresh one.
 * - Per-IP fixed window: reuses `consumeAuthRateLimit` (`authRateLimits`).
 *
 * A try is reserved in one transaction before Gemini is called, so concurrent
 * requests can never overshoot either cap. If Gemini returns no image the
 * reservation is released, so only real generations count.
 */
export const AI_TRY_ON_USAGE_COLLECTION = "aiTryOnUsage";
export const AI_TRY_ON_GLOBAL_USAGE_DOC = "global";

export const AI_TRY_ON_IP_RATE_LIMIT: AuthRateLimitRule = {
  bucket: "ai-try-on-ip",
  limit: 10,
  windowMs: 60 * 60 * 1000,
};

/** Per-order counters are kept for 90 days (Xavier, privacy policy). */
export const AI_TRY_ON_ORDER_USAGE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export const hashAiTryOnOrderKey = (orderKey: string): string =>
  createHash("sha256").update(`ai-try-on-order\u0000${orderKey}`).digest("hex");

export type AiTryOnReservation =
  | { ok: true; orderDocId: string; orderTriesRemaining: number }
  | { ok: false; code: "ORDER_TRY_LIMIT_REACHED" | "GLOBAL_LIMIT_REACHED" };

const readCount = (data: unknown): number => {
  const count = (data as { count?: unknown } | undefined)?.count;
  return typeof count === "number" && Number.isFinite(count) && count > 0
    ? Math.floor(count)
    : 0;
};

/** Firestore Timestamp (Admin SDK) or Date (tests) → epoch ms. */
const readMillis = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime();
  const toMillis = (value as { toMillis?: unknown } | null | undefined)?.toMillis;
  return typeof toMillis === "function" ? Number(toMillis.call(value)) : null;
};

/** Order count that ignores an expired counter (TTL deletion can lag). */
const readLiveOrderCount = (data: unknown, nowMs: number): number => {
  const expiresAt = readMillis((data as { expiresAt?: unknown } | undefined)?.expiresAt);
  if (expiresAt !== null && expiresAt <= nowMs) return 0;
  return readCount(data);
};

export interface AiTryOnUsageLimits {
  readGlobalCount(): Promise<number>;
  readOrderTriesRemaining(orderKey: string): Promise<number>;
  reserve(orderKey: string): Promise<AiTryOnReservation>;
  release(orderDocId: string): Promise<void>;
}

export const createAiTryOnUsageLimits = (
  db: Firestore,
  options: {
    now?: () => number;
    globalCap?: number;
    triesPerOrder?: number;
  } = {},
): AiTryOnUsageLimits => {
  const now = options.now ?? Date.now;
  const globalCap = options.globalCap ?? AI_TRY_ON_GLOBAL_GENERATION_CAP;
  const triesPerOrder = options.triesPerOrder ?? AI_TRY_ON_TRIES_PER_ORDER;
  const collection = () => db.collection(AI_TRY_ON_USAGE_COLLECTION);
  const globalRef = () => collection().doc(AI_TRY_ON_GLOBAL_USAGE_DOC);

  return {
    async readGlobalCount() {
      const snapshot = await globalRef().get();
      return snapshot.exists ? readCount(snapshot.data()) : 0;
    },
    async readOrderTriesRemaining(orderKey) {
      const snapshot = await collection().doc(`order-${hashAiTryOnOrderKey(orderKey)}`).get();
      const count = snapshot.exists ? readLiveOrderCount(snapshot.data(), now()) : 0;
      return Math.max(0, triesPerOrder - count);
    },
    async reserve(orderKey) {
      const orderDocId = `order-${hashAiTryOnOrderKey(orderKey)}`;
      const orderRef = collection().doc(orderDocId);
      const global = globalRef();
      return db.runTransaction(async (transaction) => {
        const [globalSnapshot, orderSnapshot] = await Promise.all([
          transaction.get(global),
          transaction.get(orderRef),
        ]);
        const globalCount = globalSnapshot.exists ? readCount(globalSnapshot.data()) : 0;
        const nowMs = now();
        const orderCount = orderSnapshot.exists
          ? readLiveOrderCount(orderSnapshot.data(), nowMs)
          : 0;
        if (globalCount >= globalCap) {
          return { ok: false, code: "GLOBAL_LIMIT_REACHED" } as const;
        }
        if (orderCount >= triesPerOrder) {
          return { ok: false, code: "ORDER_TRY_LIMIT_REACHED" } as const;
        }
        const at = new Date(nowMs);
        transaction.set(global, { count: globalCount + 1, cap: globalCap, updatedAt: at }, { merge: true });
        transaction.set(
          orderRef,
          {
            kind: "order",
            count: orderCount + 1,
            limit: triesPerOrder,
            updatedAt: at,
            // A new (or expired) counter starts a fresh 90-day window.
            ...(orderCount === 0
              ? { expiresAt: new Date(nowMs + AI_TRY_ON_ORDER_USAGE_RETENTION_MS) }
              : {}),
          },
          { merge: true },
        );
        return {
          ok: true,
          orderDocId,
          orderTriesRemaining: Math.max(0, triesPerOrder - (orderCount + 1)),
        } as const;
      });
    },
    async release(orderDocId) {
      const orderRef = collection().doc(orderDocId);
      const global = globalRef();
      await db.runTransaction(async (transaction) => {
        const [globalSnapshot, orderSnapshot] = await Promise.all([
          transaction.get(global),
          transaction.get(orderRef),
        ]);
        const at = new Date(now());
        const globalCount = globalSnapshot.exists ? readCount(globalSnapshot.data()) : 0;
        const orderCount = orderSnapshot.exists
          ? readLiveOrderCount(orderSnapshot.data(), at.getTime())
          : 0;
        if (globalCount > 0) {
          transaction.set(global, { count: globalCount - 1, updatedAt: at }, { merge: true });
        }
        if (orderCount > 0) {
          transaction.set(orderRef, { count: orderCount - 1, updatedAt: at }, { merge: true });
        }
      });
    },
  };
};
