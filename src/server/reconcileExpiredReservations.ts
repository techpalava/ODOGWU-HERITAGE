/**
 * Expired ACTIVE inventory reservation reconciler.
 *
 * Vercel cron hook (recommended): POST /api/orders/reconcile-expired-reservations
 * every 5–15 minutes with header `x-reservation-reconcile-secret` matching
 * env `RESERVATION_RECONCILE_SECRET` (or a Firebase admin bearer token).
 */
import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import {
  confirmDepositCheckoutBatchWithAdminDb,
  createAdminReservationTransactionRunner,
  loadDepositCheckoutQuote,
} from "./fabricInventoryAdmin.js";
import {
  INVENTORY_RESERVATIONS_COLLECTION,
  releaseInventoryReservation,
  type InventoryReservationRecord,
} from "./fabricInventoryReservation.js";
import { makePaymentIntentNonPayableBeforeReservationRelease } from "./depositCheckoutLifecycle.js";

export type ReconcileExpiredReservationsResult = {
  scanned: number;
  released: number;
  confirmed: number;
  skipped: number;
  errors: Array<{ checkoutId: string; message: string }>;
};

const isExpiredActive = (
  reservation: InventoryReservationRecord,
  nowIso: string,
): boolean =>
  reservation.status === "ACTIVE" &&
  typeof reservation.expiresAt === "string" &&
  reservation.expiresAt <= nowIso;

export const listActiveExpiredReservations = async (
  db: Firestore,
  now: Date,
): Promise<InventoryReservationRecord[]> => {
  const nowIso = now.toISOString();
  const snap = await db
    .collection(INVENTORY_RESERVATIONS_COLLECTION)
    .where("status", "==", "ACTIVE")
    .get();
  return snap.docs
    .map((doc) => doc.data() as InventoryReservationRecord)
    .filter((reservation) => isExpiredActive(reservation, nowIso));
};

const releaseExpired = async (input: {
  db: Firestore;
  checkoutId: string;
  ownerUid: string;
  now: Date;
}): Promise<void> => {
  const run = createAdminReservationTransactionRunner(input.db);
  await run(async (store) => {
    await releaseInventoryReservation({
      store,
      checkoutId: input.checkoutId,
      ownerUid: input.ownerUid,
      reason: "expired",
      now: input.now,
      requireOwnerMatch: true,
    });
  });
};

/**
 * For each ACTIVE reservation past expiresAt:
 * - With paymentIntentId: use central makePaymentIntentNonPayableBeforeReservationRelease
 *   - finalize => confirmDepositCheckoutBatchWithAdminDb (do NOT release)
 *   - retain => skip
 *   - release_allowed => release
 * - Without PI => release expired
 */
export const reconcileExpiredReservations = async (input: {
  db: Firestore;
  stripe: Stripe | null;
  now?: () => Date;
}): Promise<ReconcileExpiredReservationsResult> => {
  const clock = input.now || (() => new Date());
  const now = clock();
  const expired = await listActiveExpiredReservations(input.db, now);
  const result: ReconcileExpiredReservationsResult = {
    scanned: expired.length,
    released: 0,
    confirmed: 0,
    skipped: 0,
    errors: [],
  };

  for (const reservation of expired) {
    try {
      const paymentIntentId =
        typeof reservation.paymentIntentId === "string" &&
        reservation.paymentIntentId.trim()
          ? reservation.paymentIntentId.trim()
          : null;

      if (!paymentIntentId) {
        await releaseExpired({
          db: input.db,
          checkoutId: reservation.checkoutId,
          ownerUid: reservation.ownerUid,
          now,
        });
        result.released += 1;
        continue;
      }

      if (!input.stripe) {
        result.skipped += 1;
        result.errors.push({
          checkoutId: reservation.checkoutId,
          message: "Stripe client unavailable; cannot inspect PaymentIntent.",
        });
        continue;
      }

      const stripe = input.stripe;
      const decision = await makePaymentIntentNonPayableBeforeReservationRelease({
        stripe: {
          retrieve: async (id) => {
            const live = await stripe.paymentIntents.retrieve(id);
            return { id: live.id, status: live.status };
          },
          cancel: async (id) => {
            const canceled = await stripe.paymentIntents.cancel(id);
            return { id: canceled.id, status: canceled.status };
          },
        },
        paymentIntentId,
      });

      if (decision.outcome === "finalize") {
        const quote = await loadDepositCheckoutQuote(
          input.db,
          reservation.checkoutId,
        );
        if (!quote) {
          result.errors.push({
            checkoutId: reservation.checkoutId,
            message: "PaymentIntent succeeded but checkout quote was missing.",
          });
          continue;
        }
        await confirmDepositCheckoutBatchWithAdminDb({
          db: input.db,
          quote,
          paymentProof: {
            provider: "stripe",
            paymentIntentId,
          },
          authenticatedUid: reservation.ownerUid,
          stripe: input.stripe,
          now: clock,
        });
        result.confirmed += 1;
        continue;
      }

      if (decision.outcome === "retain") {
        result.skipped += 1;
        continue;
      }

      await releaseExpired({
        db: input.db,
        checkoutId: reservation.checkoutId,
        ownerUid: reservation.ownerUid,
        now,
      });
      result.released += 1;
    } catch (error) {
      result.errors.push({
        checkoutId: reservation.checkoutId,
        message:
          error instanceof Error ? error.message : "Unknown reconcile error.",
      });
    }
  }

  return result;
};
