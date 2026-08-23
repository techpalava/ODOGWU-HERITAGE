import type { DepositCheckoutQuote } from "../utils/depositOrderFingerprint.js";
import {
  reservationLinesMatchQuantities,
  type InventoryReservationLine,
  type InventoryReservationRecord,
} from "./fabricInventoryReservation.js";

export type DepositPaymentBindingFailureReason =
  | "missing_quote"
  | "missing_reservation"
  | "quote_not_prepared"
  | "reservation_not_active"
  | "owner_mismatch"
  | "checkout_mismatch"
  | "fingerprint_mismatch"
  | "payment_intent_mismatch"
  | "missing_metadata"
  | "lines_mismatch";

/**
 * Strict binding between a Stripe PaymentIntent event/retrieve result and the
 * trusted Design Studio quote + reservation. checkoutId metadata alone is never
 * sufficient release/finalize authority.
 */
export const assertTrustedDepositPaymentBinding = (input: {
  paymentIntentId: string;
  metadata: {
    ownerUid?: unknown;
    checkoutId?: unknown;
    checkoutFingerprint?: unknown;
  };
  quote: DepositCheckoutQuote | null;
  reservation: InventoryReservationRecord | null;
  requireActiveReservation?: boolean;
  expectedLines?: InventoryReservationLine[] | Map<string, number>;
}):
  | { ok: true; quote: DepositCheckoutQuote; reservation: InventoryReservationRecord }
  | { ok: false; reason: DepositPaymentBindingFailureReason } => {
  const metaOwner =
    typeof input.metadata.ownerUid === "string"
      ? input.metadata.ownerUid.trim()
      : "";
  const metaCheckout =
    typeof input.metadata.checkoutId === "string"
      ? input.metadata.checkoutId.trim()
      : "";
  const metaFingerprint =
    typeof input.metadata.checkoutFingerprint === "string"
      ? input.metadata.checkoutFingerprint.trim()
      : "";

  if (!metaOwner || !metaCheckout || !metaFingerprint) {
    return { ok: false, reason: "missing_metadata" };
  }
  if (!input.quote) {
    return { ok: false, reason: "missing_quote" };
  }
  if (!input.reservation) {
    return { ok: false, reason: "missing_reservation" };
  }

  const quote = input.quote;
  const reservation = input.reservation;

  if (metaCheckout !== quote.checkoutId) {
    return { ok: false, reason: "checkout_mismatch" };
  }
  if (metaOwner !== quote.ownerUid) {
    return { ok: false, reason: "owner_mismatch" };
  }
  if (metaFingerprint !== quote.canonicalCheckoutFingerprint) {
    return { ok: false, reason: "fingerprint_mismatch" };
  }
  if (reservation.checkoutId !== quote.checkoutId) {
    return { ok: false, reason: "checkout_mismatch" };
  }
  if (reservation.ownerUid !== quote.ownerUid) {
    return { ok: false, reason: "owner_mismatch" };
  }
  if (reservation.checkoutFingerprint !== quote.canonicalCheckoutFingerprint) {
    return { ok: false, reason: "fingerprint_mismatch" };
  }

  const quotePi =
    typeof quote.paymentIntentId === "string" && quote.paymentIntentId.trim()
      ? quote.paymentIntentId.trim()
      : null;
  const reservationPi =
    typeof reservation.paymentIntentId === "string" &&
    reservation.paymentIntentId.trim()
      ? reservation.paymentIntentId.trim()
      : null;
  // Bound checkouts require exact PI equality on quote, reservation, and event.
  if (quotePi !== reservationPi) {
    return { ok: false, reason: "payment_intent_mismatch" };
  }
  if (quotePi !== input.paymentIntentId) {
    return { ok: false, reason: "payment_intent_mismatch" };
  }
  if (input.requireActiveReservation !== false) {
    if (reservation.status !== "ACTIVE") {
      return { ok: false, reason: "reservation_not_active" };
    }
    if (quote.status !== "PREPARED") {
      return { ok: false, reason: "quote_not_prepared" };
    }
  }
  if (input.expectedLines) {
    const quantities =
      input.expectedLines instanceof Map
        ? input.expectedLines
        : new Map(
            input.expectedLines.map((line) => [line.fabricCode, line.quantity]),
          );
    if (!reservationLinesMatchQuantities(reservation.lines, quantities)) {
      return { ok: false, reason: "lines_mismatch" };
    }
  }

  return { ok: true, quote, reservation };
};

/** PI statuses that must never allow customer/expiry inventory release. */
export const PAYMENT_INTENT_RELEASE_BLOCKED_STATUSES = [
  "succeeded",
  "processing",
  "requires_action",
  "requires_capture",
] as const;

export type PaymentIntentReleaseBlockedStatus =
  (typeof PAYMENT_INTENT_RELEASE_BLOCKED_STATUSES)[number];

export const isPaymentIntentReleaseBlocked = (
  status: string,
): status is PaymentIntentReleaseBlockedStatus =>
  (PAYMENT_INTENT_RELEASE_BLOCKED_STATUSES as readonly string[]).includes(
    status,
  );

/** Unpaid statuses where cancellation then release may be appropriate. */
export const PAYMENT_INTENT_SAFE_CANCEL_STATUSES = [
  "requires_payment_method",
  "requires_confirmation",
] as const;
