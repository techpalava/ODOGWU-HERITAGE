import { createHash } from "node:crypto";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
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
 * - `aiTryOnUsage/global`: lifetime count of generations. The base cap is
 *   1,000. `purchasedTries` is added only by a verified Stripe test top-up
 *   (1,000 per paid Checkout Session) and is never written by the browser.
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
 * - `aiTryOnUsage/day-YYYY-MM-DD` (Lagos day, UTC+1): counts only, for the
 *   admin usage page: `started` (tries reserved), `failed` (tries refunded
 *   with no preview made) and `timedOut` (refunds after the time limit; also
 *   counted in `failed`). Written in the same transactions as the counters
 *   above; `expiresAt` is about 400 days later, so the same TTL policy
 *   removes it. No customer data.
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
  resetGeneration?: number;
}

export type AiTryOnReservation =
  | {
      ok: true;
      orderDocId: string;
      orderResetGeneration: number;
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

/** Paid top-ups cannot raise the cap without bound if a document is corrupt. */
export const AI_TRY_ON_MAX_PURCHASED_TRIES = 1_000_000;

/** Extra tries bought with Stripe. Missing or unusable values count as zero. */
export const readPurchasedTries = (data: unknown): number => {
  const value = (data as { purchasedTries?: unknown } | undefined)?.purchasedTries;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(AI_TRY_ON_MAX_PURCHASED_TRIES, Math.floor(value));
};

/** Base cap plus paid top-ups. The browser cannot change either part. */
export const aiTryOnEffectiveGlobalCap = (
  purchasedTries: number,
  baseCap: number = AI_TRY_ON_GLOBAL_GENERATION_CAP,
): number => {
  const base = typeof baseCap === "number" && Number.isFinite(baseCap) && baseCap > 0
    ? Math.floor(baseCap)
    : AI_TRY_ON_GLOBAL_GENERATION_CAP;
  return base + readPurchasedTries({ purchasedTries });
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

/** Days are cut at Lagos time (Africa/Lagos is UTC+1 all year, no DST). */
export const AI_TRY_ON_USAGE_DAY_OFFSET_MS = 60 * 60 * 1000;
export const AI_TRY_ON_DAILY_USAGE_RETENTION_MS = 400 * 24 * 60 * 60 * 1000;
export const aiTryOnUsageDay = (ms: number): string =>
  new Date(ms + AI_TRY_ON_USAGE_DAY_OFFSET_MS).toISOString().slice(0, 10);
export const aiTryOnUsageDayDocId = (ms: number): string => `day-${aiTryOnUsageDay(ms)}`;
/** Why a try was refunded; only "timeout" is counted separately. */
export type AiTryOnRefundReason = "timeout" | "other";

const readTally = (data: unknown, field: "started" | "failed" | "timedOut"): number => {
  const value = (data as Record<string, unknown> | undefined)?.[field];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
};

export interface AiTryOnUsageLimits {
  readGlobalCount(): Promise<number>;
  /** Used tries, paid extra tries, and the cap those two imply. */
  readGlobalCapacity(): Promise<{ count: number; purchasedTries: number; cap: number }>;
  readOrderTriesRemaining(orderKey: string): Promise<number>;
  /** Signed-in accounts only. */
  readAccountTriesRemaining(uid: string): Promise<number>;
  reserve(orderKey: string, options?: { accountUid?: string | null }): Promise<AiTryOnReservation>;
  release(orderDocId: string, account?: AiTryOnAccountReservation | null, orderResetGeneration?: number, reason?: AiTryOnRefundReason): Promise<void>;
  /**
   * Releases a try held by `guard` (a busy job holding `orderDocId` and
   * `account`) exactly once: only while the guard exists and `accept`s its
   * data, deleting it in the same transaction. True when released.
   */
  releaseHeld(guard: DocumentReference, accept: (data: Record<string, unknown>) => boolean, reason?: AiTryOnRefundReason): Promise<boolean>;
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

  /** Reads what a release needs; the returned function writes it (reads first, as Firestore requires). */
  const readRelease = async (
    transaction: Transaction,
    orderDocId: string,
    account: AiTryOnAccountReservation | null,
    orderResetGeneration = 0,
    reason: AiTryOnRefundReason = "other",
  ) => {
    const orderRef = collection().doc(orderDocId);
    const global = globalRef();
    const accountRef = account ? collection().doc(account.docId) : null;
    const dayRef = collection().doc(aiTryOnUsageDayDocId(now()));
    const [globalSnapshot, orderSnapshot, accountSnapshot, daySnapshot] = await Promise.all([
      transaction.get(global),
      transaction.get(orderRef),
      accountRef ? transaction.get(accountRef) : Promise.resolve(null),
      transaction.get(dayRef),
    ]);
    return () => {
      const at = new Date(now());
      // Usage page: a refunded try is a failure (no preview made).
      const day = daySnapshot.exists ? daySnapshot.data() : undefined;
      transaction.set(dayRef, {
        kind: "day",
        day: aiTryOnUsageDay(at.getTime()),
        failed: readTally(day, "failed") + 1,
        ...(reason === "timeout" ? { timedOut: readTally(day, "timedOut") + 1 } : {}),
        updatedAt: at,
        expiresAt: new Date(at.getTime() + AI_TRY_ON_DAILY_USAGE_RETENTION_MS),
      }, { merge: true });
      const globalCount = globalSnapshot.exists ? readCount(globalSnapshot.data()) : 0;
      const orderCount = orderSnapshot.exists ? readLiveOrderCount(orderSnapshot.data(), at.getTime()) : 0;
      if (globalCount > 0) {
        transaction.set(global, { count: globalCount - 1, updatedAt: at }, { merge: true });
      }
      // A delayed refund must not consume a try reserved after an admin reset.
      const currentGeneration = accountSnapshot?.data()?.resetGeneration ?? 0;
      const sameGeneration = !account || currentGeneration === (account.resetGeneration ?? 0);
      if (orderCount > 0 && (orderSnapshot.data()?.resetGeneration ?? 0) === orderResetGeneration) {
        transaction.set(orderRef, { count: orderCount - 1, updatedAt: at }, { merge: true });
      }
      if (account && accountRef && accountSnapshot && accountSnapshot.exists && sameGeneration) {
        const uses = readLiveAccountUses(accountSnapshot.data(), at.getTime(), windowMs);
        const index = uses.indexOf(account.reservedAtMs);
        if (index >= 0) {
          uses.splice(index, 1);
          transaction.set(accountRef, {
            kind: "account",
            ...(currentGeneration ? { resetGeneration: currentGeneration } : {}),
            uses,
            updatedAt: at,
            expiresAt: new Date((uses.length ? uses[uses.length - 1]! : at.getTime()) + windowMs),
          });
        }
      }
    };
  };

  return {
    async readGlobalCount() {
      const snapshot = await globalRef().get();
      return snapshot.exists ? readCount(snapshot.data()) : 0;
    },
    async readGlobalCapacity() {
      const snapshot = await globalRef().get();
      const data = snapshot.exists ? snapshot.data() : undefined;
      const count = data ? readCount(data) : 0;
      const purchasedTries = readPurchasedTries(data);
      return { count, purchasedTries, cap: aiTryOnEffectiveGlobalCap(purchasedTries, globalCap) };
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
      const dayRef = collection().doc(aiTryOnUsageDayDocId(now()));
      return db.runTransaction(async (transaction) => {
        const [globalSnapshot, orderSnapshot, accountSnapshot, daySnapshot] = await Promise.all([
          transaction.get(global),
          transaction.get(orderRef),
          accountRef ? transaction.get(accountRef) : Promise.resolve(null),
          transaction.get(dayRef),
        ]);
        const globalData = globalSnapshot.exists ? globalSnapshot.data() : undefined;
        const globalCount = globalData ? readCount(globalData) : 0;
        const effectiveCap = aiTryOnEffectiveGlobalCap(readPurchasedTries(globalData), globalCap);
        const nowMs = now();
        const orderCount = orderSnapshot.exists
          ? readLiveOrderCount(orderSnapshot.data(), nowMs)
          : 0;
        const accountUses =
          accountSnapshot && accountSnapshot.exists
            ? readLiveAccountUses(accountSnapshot.data(), nowMs, windowMs)
            : [];
        if (globalCount >= effectiveCap) {
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
        const orderResetGeneration = orderSnapshot.data()?.resetGeneration ?? 0;
        transaction.set(global, { count: globalCount + 1, cap: effectiveCap, updatedAt: at }, { merge: true });
        // Usage page: one more try started today (Lagos day).
        transaction.set(dayRef, {
          kind: "day",
          day: aiTryOnUsageDay(nowMs),
          started: readTally(daySnapshot.exists ? daySnapshot.data() : undefined, "started") + 1,
          updatedAt: at,
          expiresAt: new Date(nowMs + AI_TRY_ON_DAILY_USAGE_RETENTION_MS),
        }, { merge: true });
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
          const resetGeneration = accountSnapshot?.data()?.resetGeneration ?? 0;
          // Keep the reset generation only after this account has been reset.
          transaction.set(accountRef, {
            kind: "account",
            ...(resetGeneration ? { resetGeneration } : {}),
            uses,
            updatedAt: at,
            expiresAt: new Date(nowMs + windowMs),
          });
          account = { docId: accountDocId, reservedAtMs: nowMs, resetGeneration };
        }
        return {
          ok: true,
          orderDocId,
          orderResetGeneration,
          orderTriesRemaining: Math.max(0, triesPerOrder - (orderCount + 1)),
          account,
          accountTriesRemaining: account
            ? Math.max(0, accountLimit - (accountUses.length + 1))
            : null,
        } as const;
      });
    },
    async release(orderDocId, account = null, orderResetGeneration = 0, reason = "other") {
      await db.runTransaction(async (transaction) => {
        const apply = await readRelease(transaction, orderDocId, account, orderResetGeneration, reason);
        apply();
      });
    },
    async releaseHeld(guard, accept, reason = "other") {
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(guard);
        const data = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : null;
        if (!data || !accept(data) || typeof data.orderDocId !== "string") return false;
        const account = (data.account ?? null) as AiTryOnAccountReservation | null;
        const apply = await readRelease(transaction, data.orderDocId, account, typeof data.orderResetGeneration === "number" ? data.orderResetGeneration : 0, reason);
        apply();
        transaction.delete(guard);
        return true;
      });
    },
  };
};
