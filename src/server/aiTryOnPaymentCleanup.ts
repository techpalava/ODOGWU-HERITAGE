import type { Firestore } from "firebase-admin/firestore";
import { getAdminServices } from "./firebaseAdmin.js";
import { aiTryOnStorageBucket } from "./aiTryOnStorageBucket.js";
import {
  createAiTryOnPreviewStore,
  type AiTryOnPreviewBucket,
  type AiTryOnPreviewStore,
} from "./aiTryOnPreviewStore.js";
import { createAiTryOnSessions, type AiTryOnSessions } from "./aiTryOnSession.js";
import { createAiTryOnUsageLimits } from "./aiTryOnUsageLimits.js";
import { createAiTryOnBusyJobs, type AiTryOnBusyJobs } from "./aiTryOnBusyJobs.js";
import { copyAiTryOnOrderImagesForPaidOrder } from "./aiTryOnOrderImages.js";

/**
 * Step 7: when an order's payment is recorded, delete every stored AI
 * Try-on preview of the paying account's open session and close that
 * session ("until you place your order"), on the server, so it works on
 * any device.
 *
 * - Never blocks or fails a payment: everything is caught, and the work is
 *   capped at `timeoutMs`; the caller awaits this AFTER the payment is saved.
 * - Idempotent: a repeat (webhook + browser, or a Stripe retry) finds no
 *   open session and does nothing.
 * - Logs carry no PII: no uid, order id or session id, only counts.
 * - Previews are deleted BEFORE the session closes, so a failure part-way
 *   leaves the session open for the next payment event to retry; the
 *   30-day expiry is the final backstop. A second sweep after the close
 *   catches a background preview saved in between; the generate route
 *   removes any saved after the close itself.
 * - A try still held for a busy retry is refunded once (its retries now
 *   get 409 SESSION_CLOSED).
 * - With the order id, the previews chosen for that order are first copied
 *   to the order (60 days, aiTryOnOrderImages.ts). A failed copy never stops
 *   the payment or the cleanup.
 */
export const AI_TRY_ON_PAYMENT_CLEANUP_TIMEOUT_MS = 3000;

export interface AiTryOnPaymentCleanupDependencies {
  getDb?: () => Firestore;
  createSessions?: (db: Firestore) => AiTryOnSessions;
  createStore?: (db: Firestore) => AiTryOnPreviewStore;
  createBusyJobs?: (db: Firestore) => AiTryOnBusyJobs;
  /** The try-on bucket (order images are copied into it). */
  getBucket?: () => AiTryOnPreviewBucket;
  log?: (line: string) => void;
  timeoutMs?: number;
}

export type AiTryOnPaymentCleanupResult = "deleted" | "no_session" | "failed" | "timeout";

export const retireAiTryOnSessionForPaidOrder = async (
  { ownerUid, orderId }: { ownerUid: string; orderId?: string },
  dependencies: AiTryOnPaymentCleanupDependencies = {},
): Promise<AiTryOnPaymentCleanupResult> => {
  const log = dependencies.log ?? ((line: string) => console.info(line));
  const work = async (): Promise<AiTryOnPaymentCleanupResult> => {
    const db = (dependencies.getDb ?? (() => getAdminServices().db as Firestore))();
    const sessions = (dependencies.createSessions ?? ((database) => createAiTryOnSessions(database)))(db);
    const sessionId = await sessions.findOpenForUid(ownerUid);
    if (!sessionId) {
      log(JSON.stringify({ event: "ai_try_on_payment_cleanup", status: "no_session" }));
      return "no_session";
    }
    const bucket = () =>
      (dependencies.getBucket ?? (() => aiTryOnStorageBucket() as unknown as AiTryOnPreviewBucket))();
    const store = (
      dependencies.createStore ?? ((database) => createAiTryOnPreviewStore(database, bucket()))
    )(db);
    if (orderId) {
      try {
        const copied = await copyAiTryOnOrderImagesForPaidOrder({
          db,
          store,
          bucket: bucket(),
          sessionId,
          orderId,
          ownerUid,
        });
        log(JSON.stringify({ event: "ai_try_on_order_images", status: copied.result, images: copied.images }));
      } catch (error) {
        log(
          JSON.stringify({
            event: "ai_try_on_order_images",
            status: "failed",
            error: error instanceof Error ? error.name : "unknown",
          }),
        );
      }
    }
    let deleted = await store.remove(sessionId, null);
    await sessions.close(sessionId);
    // A preview made in the background can be saved between the delete and
    // the close; sweep once more now that no new one can be saved.
    deleted += await store.remove(sessionId, null);
    let busyRefunded = 0;
    try {
      busyRefunded = await (
        dependencies.createBusyJobs ?? ((database) => createAiTryOnBusyJobs(database, createAiTryOnUsageLimits(database)))
      )(db).sweep(sessionId, { all: true });
    } catch {
      // Held jobs expire on their own; the TTL policy removes them.
    }
    log(JSON.stringify({ event: "ai_try_on_payment_cleanup", status: "deleted", previews: deleted, busyRefunded }));
    return "deleted";
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (typeof ownerUid !== "string" || !ownerUid) return "no_session";
    const timeout = new Promise<AiTryOnPaymentCleanupResult>((resolve) => {
      timer = setTimeout(
        () => resolve("timeout"),
        dependencies.timeoutMs ?? AI_TRY_ON_PAYMENT_CLEANUP_TIMEOUT_MS,
      );
    });
    const result = await Promise.race([work(), timeout]);
    if (result === "timeout") {
      log(JSON.stringify({ event: "ai_try_on_payment_cleanup", status: "timeout" }));
    }
    return result;
  } catch (error) {
    log(
      JSON.stringify({
        event: "ai_try_on_payment_cleanup",
        status: "failed",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return "failed";
  } finally {
    if (timer) clearTimeout(timer);
  }
};
