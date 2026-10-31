import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthRateLimitRule } from "./authRateLimit.js";
import {
  AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW,
  AI_TRY_ON_ACCOUNT_WINDOW_MS,
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
 * - `aiTryOnUsage/account-<sha256>`: signed-in accounts only, at most 15
 *   generations in any rolling 30 days, across all orders. The doc holds
 *   only the epoch-ms times of the uses still inside the window (never more
 *   than 15 numbers) and `expiresAt` = newest use + 30 days, so the same TTL
 *   policy deletes it once it no longer limits anything. The uid is hashed.
 *   Guests have no account counter.
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

export const hashAiTryOnAccountUid = (uid: string): string =>
  createHash("sha256").update(`ai-try-on-account\u0000${uid}`).digest("hex");

export const aiTryOnAccountUsageDocId = (uid: string): string =>
  `account-${hashAiTryOnAccountUid(uid)}`;

/** The account part of a reservation, needed to refund it. */
export interface AiTryOnAccountReservation {
  docId: string;
  reservedAtMs: number;
}

export type AiTryOnReservation =
  | {
      ok: true;
      orderDocId: string;
      orderTriesRemaining: number;
      /** Null for guests. */
      account: AiTryOnAccountReservation | null;
      accountTriesRemaining: number | null;
    }
  | {
      ok: false;
      code: "ORDER_TRY_LIMIT_REACHED" | "ACCOUNT_TRY_LIMIT_REACHED" | "GLOBAL_LIMIT_REACHED";
    };

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

/** Uses still inside the rolling window, oldest first. */
const readLiveAccountUses = (data: unknown, nowMs: number, windowMs: number): number[] => {
  const uses = (data as { uses?: unknown } | undefined)?.uses;
  if (!Array.isArray(uses)) return [];
  return uses
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .filter((value) => value > nowMs - windowMs && value <= nowMs + windowMs)
    .sort((a, b) => a - b);
};

export interface AiTryOnUsageLimits {
  readGlobalCount(): Promise<number>;
  readOrderTriesRemaining(orderKey: string): Promise<number>;
  /** Signed-in accounts only. */
  readAccountTriesRemaining(uid: string): Promise<number>;
  reserve(orderKey: string, options?: { accountUid?: string | null }): Promise<AiTryOnReservation>;
  release(orderDocId: string, account?: AiTryOnAccountReservation | null): Promise<void>;
}

export const createAiTryOnUsageLimits = (
  db: Firestore,
  options: {
    now?: () => number;
    globalCap?: number;
    triesPerOrder?: number;
    accountTriesPerWindow?: number;
    accountWindowMs?: number;
  } = {},
): AiTryOnUsageLimits => {
  const now = options.now ?? Date.now;
  const globalCap = options.globalCap ?? AI_TRY_ON_GLOBAL_GENERATION_CAP;
  const triesPerOrder = options.triesPerOrder ?? AI_TRY_ON_TRIES_PER_ORDER;
  const accountLimit = options.accountTriesPerWindow ?? AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW;
  const windowMs = options.accountWindowMs ?? AI_TRY_ON_ACCOUNT_WINDOW_MS;
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
    async readAccountTriesRemaining(uid) {
      const snapshot = await collection().doc(aiTryOnAccountUsageDocId(uid)).get();
      const uses = snapshot.exists ? readLiveAccountUses(snapshot.data(), now(), windowMs) : [];
      return Math.max(0, accountLimit - uses.length);
    },
    async reserve(orderKey, reserveOptions = {}) {
      const orderDocId = `order-${hashAiTryOnOrderKey(orderKey)}`;
      const orderRef = collection().doc(orderDocId);
      const global = globalRef();
      const accountUid = reserveOptions.accountUid || null;
      const accountDocId = accountUid ? aiTryOnAccountUsageDocId(accountUid) : null;
      const accountRef = accountDocId ? collection().doc(accountDocId) : null;
      return db.runTransaction(async (transaction) => {
        const [globalSnapshot, orderSnapshot, accountSnapshot] = await Promise.all([
          transaction.get(global),
          transaction.get(orderRef),
          accountRef ? transaction.get(accountRef) : Promise.resolve(null),
        ]);
        const globalCount = globalSnapshot.exists ? readCount(globalSnapshot.data()) : 0;
        const nowMs = now();
        const orderCount = orderSnapshot.exists
          ? readLiveOrderCount(orderSnapshot.data(), nowMs)
          : 0;
        const accountUses =
          accountSnapshot && accountSnapshot.exists
            ? readLiveAccountUses(accountSnapshot.data(), nowMs, windowMs)
            : [];
        if (globalCount >= globalCap) {
          return { ok: false, code: "GLOBAL_LIMIT_REACHED" } as const;
        }
        // The account cap is checked first: a fresh order would not help.
        if (accountRef && accountUses.length >= accountLimit) {
          return { ok: false, code: "ACCOUNT_TRY_LIMIT_REACHED" } as const;
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
        let account: AiTryOnAccountReservation | null = null;
        if (accountRef && accountDocId) {
          const uses = [...accountUses, nowMs];
          // Minimal record: only the window's use times and the TTL field.
          transaction.set(accountRef, {
            kind: "account",
            uses,
            updatedAt: at,
            expiresAt: new Date(nowMs + windowMs),
          });
          account = { docId: accountDocId, reservedAtMs: nowMs };
        }
        return {
          ok: true,
          orderDocId,
          orderTriesRemaining: Math.max(0, triesPerOrder - (orderCount + 1)),
          account,
          accountTriesRemaining: account
            ? Math.max(0, accountLimit - (accountUses.length + 1))
            : null,
        } as const;
      });
    },
    async release(orderDocId, account = null) {
      const orderRef = collection().doc(orderDocId);
      const global = globalRef();
      const accountRef = account ? collection().doc(account.docId) : null;
      await db.runTransaction(async (transaction) => {
        const [globalSnapshot, orderSnapshot, accountSnapshot] = await Promise.all([
          transaction.get(global),
          transaction.get(orderRef),
          accountRef ? transaction.get(accountRef) : Promise.resolve(null),
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
        if (account && accountRef && accountSnapshot && accountSnapshot.exists) {
          const uses = readLiveAccountUses(accountSnapshot.data(), at.getTime(), windowMs);
          const index = uses.indexOf(account.reservedAtMs);
          if (index >= 0) {
            uses.splice(index, 1);
            transaction.set(accountRef, {
              kind: "account",
              uses,
              updatedAt: at,
              expiresAt: new Date((uses.length ? uses[uses.length - 1]! : at.getTime()) + windowMs),
            });
          }
        }
      });
    },
  };
};
