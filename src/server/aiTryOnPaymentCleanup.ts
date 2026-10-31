import type { Firestore } from "firebase-admin/firestore";
import { getAdminServices } from "./firebaseAdmin.js";
import {
  createAiTryOnPreviewStore,
  type AiTryOnPreviewBucket,
  type AiTryOnPreviewStore,
} from "./aiTryOnPreviewStore.js";
import { createAiTryOnSessions, type AiTryOnSessions } from "./aiTryOnSession.js";

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
 *   30-day expiry is the final backstop.
 */
export const AI_TRY_ON_PAYMENT_CLEANUP_TIMEOUT_MS = 3000;

export interface AiTryOnPaymentCleanupDependencies {
  getDb?: () => Firestore;
  createSessions?: (db: Firestore) => AiTryOnSessions;
  createStore?: (db: Firestore) => AiTryOnPreviewStore;
  log?: (line: string) => void;
  timeoutMs?: number;
}

export type AiTryOnPaymentCleanupResult = "deleted" | "no_session" | "failed" | "timeout";

export const retireAiTryOnSessionForPaidOrder = async (
  { ownerUid }: { ownerUid: string },
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
    const store = (
      dependencies.createStore ??
      ((database) =>
        createAiTryOnPreviewStore(
          database,
          getAdminServices().storage.bucket() as unknown as AiTryOnPreviewBucket,
        ))
    )(db);
    const deleted = await store.remove(sessionId, null);
    await sessions.close(sessionId);
    log(JSON.stringify({ event: "ai_try_on_payment_cleanup", status: "deleted", previews: deleted }));
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
