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
 *   order key is hashed so no raw draft id is stored.
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

export interface AiTryOnUsageLimits {
  readGlobalCount(): Promise<number>;
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
        const orderCount = orderSnapshot.exists ? readCount(orderSnapshot.data()) : 0;
        if (globalCount >= globalCap) {
          return { ok: false, code: "GLOBAL_LIMIT_REACHED" } as const;
        }
        if (orderCount >= triesPerOrder) {
          return { ok: false, code: "ORDER_TRY_LIMIT_REACHED" } as const;
        }
        const at = new Date(now());
        transaction.set(global, { count: globalCount + 1, cap: globalCap, updatedAt: at }, { merge: true });
        transaction.set(
          orderRef,
          { kind: "order", count: orderCount + 1, limit: triesPerOrder, updatedAt: at },
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
        const orderCount = orderSnapshot.exists ? readCount(orderSnapshot.data()) : 0;
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
