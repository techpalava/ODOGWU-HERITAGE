import { createHash, randomUUID } from "node:crypto";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import type { AuthRateLimitRule } from "./authRateLimit.js";
import { hashAiTryOnOrderKey, type AiTryOnAccountReservation, type AiTryOnUsageLimits } from "./aiTryOnUsageLimits.js";

/**
 * "Busy" retries (Xavier, item 1): when Gemini is still over capacity after
 * the one in-function retry, the try stays reserved in a held job instead of
 * being refunded, and the browser sends the same request again a few times
 * over about 4 minutes. A repeat request with the job id is not charged
 * again (no new try, no IP window, no global count); the try is refunded
 * exactly once, in the same transaction that deletes the job, if no
 * preview is ever made.
 *
 * `aiTryOnJobs/{job-<sha256(session, wearer)>}` (server-only, Admin SDK):
 * one doc per session and wearer, so there is at most one live job per
 * wearer. Minimal record, no customer content: the random job id, the
 * hashed order-counter doc id, the design fingerprint, the hashed account
 * reservation (signed in only), a request count, status, two times and
 * `expiresAt` (5 minutes after the first request; a TTL policy on it is
 * the storage backstop). A job is deleted when a preview is made or the
 * try is refunded.
 */
export const AI_TRY_ON_JOB_COLLECTION = "aiTryOnJobs";
/** Server expiry of a held job, from the first request. */
export const AI_TRY_ON_BUSY_JOB_EXPIRY_MS = 5 * 60_000;
/** Shortest gap between the end of one request and the next retry. */
export const AI_TRY_ON_BUSY_MIN_GAP_MS = 10_000;
/** The first request plus at most 5 browser retries. */
export const AI_TRY_ON_BUSY_MAX_REQUESTS = 6;
/** A running retry holds the job this long (maxDuration 130 s + slack). */
export const AI_TRY_ON_BUSY_LEASE_MS = 150_000;
/** Light per-IP limit on retry requests only (they never use the try window). */
export const AI_TRY_ON_BUSY_RETRY_IP_LIMIT: AuthRateLimitRule = {
  bucket: "ai-try-on-busy-ip",
  limit: 30,
  windowMs: 10 * 60_000,
};
export const AI_TRY_ON_BUSY_JOB_ID_PATTERN = /^busy-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const aiTryOnBusyJobDocId = (sessionId: string, wearerKey: string): string =>
  `job-${createHash("sha256").update(`ai-try-on-job\u0000${sessionId}\u0000${wearerKey}`).digest("hex").slice(0, 40)}`;

export const createAiTryOnBusyJobId = () => `busy-${randomUUID()}`;

/**
 * Deep check M5: one generation at a time per session and wearer, across
 * tabs and devices. `aiTryOnJobs/{run-<sha256(session, wearer)>}` holds only
 * a random lease id and its end time while a new request runs (deleted when
 * it ends; `expiresAt` lets the TTL policy remove one left by a crash).
 */
export const aiTryOnRunLeaseDocId = (sessionId: string, wearerKey: string): string =>
  `run-${createHash("sha256").update(`ai-try-on-run\u0000${sessionId}\u0000${wearerKey}`).digest("hex").slice(0, 40)}`;

interface StoredJob {
  jobId: string;
  orderDocId: string;
  orderResetGeneration?: number;
  inputFingerprint: string;
  account: AiTryOnAccountReservation | null;
  requests: number;
  status: "held" | "running";
  lastAt: number;
  leaseUntil: number;
  expiresAt: Date;
}

const readMillis = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  const toMillis = (value as { toMillis?: unknown } | null | undefined)?.toMillis;
  return typeof toMillis === "function" ? Number(toMillis.call(value)) : 0;
};

const readJob = (data: unknown): (StoredJob & { expiresAtMs: number }) | null => {
  const job = data as Partial<StoredJob> | undefined;
  if (!job || typeof job.jobId !== "string" || typeof job.orderDocId !== "string") return null;
  return {
    jobId: job.jobId,
    orderDocId: job.orderDocId,
    orderResetGeneration: job.orderResetGeneration ?? 0,
    inputFingerprint: typeof job.inputFingerprint === "string" ? job.inputFingerprint : "",
    account: job.account ?? null,
    requests: typeof job.requests === "number" ? job.requests : AI_TRY_ON_BUSY_MAX_REQUESTS,
    status: job.status === "running" ? "running" : "held",
    lastAt: typeof job.lastAt === "number" ? job.lastAt : 0,
    leaseUntil: typeof job.leaseUntil === "number" ? job.leaseUntil : 0,
    expiresAt: job.expiresAt as Date,
    expiresAtMs: readMillis(job.expiresAt),
  };
};

/** A job nobody is working on: waiting between retries, or a lapsed lease. */
const isIdle = (job: StoredJob, nowMs: number) => job.status === "held" || job.leaseUntil <= nowMs;

export type AiTryOnBusyClaim =
  | { kind: "claimed"; jobDocId: string; jobId: string; requests: number; expiresAtMs: number }
  /** Missing, someone else's, another design, or already refunded. */
  | { kind: "gone" }
  | { kind: "too_soon"; retryAfterMs: number }
  /** Past its expiry or out of attempts: refunded now (exactly once). */
  | { kind: "exhausted"; refunded: boolean };

export const createAiTryOnBusyJobs = (
  db: Firestore,
  limits: AiTryOnUsageLimits,
  { now = Date.now }: { now?: () => number } = {},
) => {
  const ref = (docId: string) => db.collection(AI_TRY_ON_JOB_COLLECTION).doc(docId) as unknown as DocumentReference;
  /** Refunds the job's try and deletes it, once, if `accept` still holds. */
  const refund = (docId: string, accept: (job: NonNullable<ReturnType<typeof readJob>>) => boolean) =>
    limits.releaseHeld(ref(docId), (data) => {
      const job = readJob(data);
      return job !== null && accept(job);
    });

  const refundClaim = (claim: { jobDocId: string; jobId: string }) =>
    refund(claim.jobDocId, (job) => job.jobId === claim.jobId);

  return {
    /** First request hit capacity: hold its reserved try. False if one exists. */
    async hold({
      sessionId,
      wearerKey,
      inputFingerprint,
      orderDocId,
      orderResetGeneration = 0,
      account,
    }: {
      sessionId: string;
      wearerKey: string;
      inputFingerprint: string;
      orderDocId: string;
      orderResetGeneration?: number;
      account: AiTryOnAccountReservation | null;
    }): Promise<{ jobId: string } | null> {
      const docRef = ref(aiTryOnBusyJobDocId(sessionId, wearerKey));
      const jobId = createAiTryOnBusyJobId();
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(docRef);
        if (snapshot.exists) return null;
        const nowMs = now();
        const job: StoredJob = {
          jobId,
          orderDocId,
          ...(orderResetGeneration ? { orderResetGeneration } : {}),
          inputFingerprint,
          account,
          requests: 1,
          status: "held",
          lastAt: nowMs,
          leaseUntil: 0,
          expiresAt: new Date(nowMs + AI_TRY_ON_BUSY_JOB_EXPIRY_MS),
        };
        transaction.set(docRef, job);
        return { jobId };
      });
    },

    /** A retry with a job id: take the job for this request, or say why not. */
    async claim({
      sessionId,
      wearerKey,
      jobId,
      inputFingerprint,
    }: {
      sessionId: string;
      wearerKey: string;
      jobId: string;
      inputFingerprint: string;
    }): Promise<AiTryOnBusyClaim> {
      const jobDocId = aiTryOnBusyJobDocId(sessionId, wearerKey);
      const docRef = ref(jobDocId);
      const orderDocId = `order-${hashAiTryOnOrderKey(sessionId)}`;
      const result = await db.runTransaction(async (transaction): Promise<AiTryOnBusyClaim | "exhausted"> => {
        const job = readJob((await transaction.get(docRef)).data());
        const nowMs = now();
        if (!job || job.jobId !== jobId || job.orderDocId !== orderDocId || job.inputFingerprint !== inputFingerprint) {
          return { kind: "gone" };
        }
        if (!isIdle(job, nowMs)) return { kind: "too_soon", retryAfterMs: AI_TRY_ON_BUSY_MIN_GAP_MS };
        if (job.expiresAtMs <= nowMs || job.requests >= AI_TRY_ON_BUSY_MAX_REQUESTS) return "exhausted";
        const wait = job.lastAt + AI_TRY_ON_BUSY_MIN_GAP_MS - nowMs;
        if (wait > 0) return { kind: "too_soon", retryAfterMs: wait };
        transaction.set(
          docRef,
          { status: "running", requests: job.requests + 1, lastAt: nowMs, leaseUntil: nowMs + AI_TRY_ON_BUSY_LEASE_MS },
          { merge: true },
        );
        return { kind: "claimed", jobDocId, jobId, requests: job.requests + 1, expiresAtMs: job.expiresAtMs };
      });
      if (result !== "exhausted") return result;
      const refunded = await refund(jobDocId, (job) => job.jobId === jobId && isIdle(job, now()));
      return { kind: "exhausted", refunded };
    },

    /** The retry hit capacity again: wait for the next one, if any is left. */
    async release(claim: Extract<AiTryOnBusyClaim, { kind: "claimed" }>): Promise<"held" | "refunded" | "gone"> {
      const nowMs = now();
      const more =
        claim.requests < AI_TRY_ON_BUSY_MAX_REQUESTS && nowMs + AI_TRY_ON_BUSY_MIN_GAP_MS < claim.expiresAtMs;
      if (!more) return (await refundClaim(claim)) ? "refunded" : "gone";
      const docRef = ref(claim.jobDocId);
      const held = await db.runTransaction(async (transaction) => {
        const job = readJob((await transaction.get(docRef)).data());
        if (!job || job.jobId !== claim.jobId) return false;
        transaction.set(docRef, { status: "held", lastAt: now(), leaseUntil: 0 }, { merge: true });
        return true;
      });
      return held ? "held" : "gone";
    },

    /** The try ends without a preview: refund it (once) and drop the job. */
    refund: refundClaim,

    /** A preview was made: the held try is used; drop the job. */
    async complete(claim: { jobDocId: string; jobId: string }) {
      const docRef = ref(claim.jobDocId);
      await db.runTransaction(async (transaction) => {
        const job = readJob((await transaction.get(docRef)).data());
        if (job && job.jobId === claim.jobId) transaction.delete(docRef);
      });
    },

    /** The browser gave up (or a reload found no preview): refund an idle job. */
    giveUp: ({ sessionId, wearerKey, jobId }: { sessionId: string; wearerKey: string; jobId: string }) =>
      refund(aiTryOnBusyJobDocId(sessionId, wearerKey), (job) => job.jobId === jobId && isIdle(job, now())),

    /**
     * A new request for this wearer. A job still waiting for its retries is
     * refunded (the customer started again); one running right now blocks
     * the new request (one live job per wearer). Returns false when blocked.
     */
    async beforeNewRequest({ sessionId, wearerKey }: { sessionId: string; wearerKey: string }): Promise<boolean> {
      const jobDocId = aiTryOnBusyJobDocId(sessionId, wearerKey);
      const job = readJob((await ref(jobDocId).get()).data());
      if (!job) return true;
      if (!isIdle(job, now())) return false;
      await refund(jobDocId, (current) => current.jobId === job.jobId && isIdle(current, now()));
      return true;
    },

    /**
     * Starts a new (not busy-retry) request for this wearer. Returns the
     * lease id, or null while another request for the wearer is running.
     */
    async acquireRun({ sessionId, wearerKey }: { sessionId: string; wearerKey: string }): Promise<string | null> {
      const docRef = ref(aiTryOnRunLeaseDocId(sessionId, wearerKey));
      const leaseId = randomUUID();
      return db.runTransaction(async (transaction) => {
        const data = (await transaction.get(docRef)).data() as { leaseUntil?: unknown } | undefined;
        const at = now();
        if (data && typeof data.leaseUntil === "number" && data.leaseUntil > at) return null;
        transaction.set(docRef, {
          leaseId,
          leaseUntil: at + AI_TRY_ON_BUSY_LEASE_MS,
          expiresAt: new Date(at + AI_TRY_ON_BUSY_LEASE_MS),
        });
        return leaseId;
      });
    },

    /** The request ended: drop its lease (only if it is still the holder). */
    async releaseRun({ sessionId, wearerKey, leaseId }: { sessionId: string; wearerKey: string; leaseId: string }) {
      const docRef = ref(aiTryOnRunLeaseDocId(sessionId, wearerKey));
      await db.runTransaction(async (transaction) => {
        const data = (await transaction.get(docRef)).data() as { leaseId?: unknown } | undefined;
        if (data?.leaseId === leaseId) transaction.delete(docRef);
      });
    },

    /**
     * Refunds this session's jobs. `all`: every job (order paid or cleared);
     * otherwise only expired idle ones (a browser that never came back).
     */
    async sweep(sessionId: string, { all = false }: { all?: boolean } = {}): Promise<number> {
      const orderDocId = `order-${hashAiTryOnOrderKey(sessionId)}`;
      const snapshot = await db.collection(AI_TRY_ON_JOB_COLLECTION).where("orderDocId", "==", orderDocId).get();
      let refunded = 0;
      for (const doc of snapshot.docs) {
        const job = readJob(doc.data());
        if (!job) continue;
        if (!all && !(job.expiresAtMs <= now() && isIdle(job, now()))) continue;
        const done = await refund(doc.id, (current) =>
          current.jobId === job.jobId && (all || (current.expiresAtMs <= now() && isIdle(current, now()))),
        );
        if (done) refunded += 1;
      }
      return refunded;
    },
  };
};

export type AiTryOnBusyJobs = ReturnType<typeof createAiTryOnBusyJobs>;
