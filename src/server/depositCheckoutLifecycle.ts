import type { DepositCheckoutQuote } from "../utils/depositOrderFingerprint.js";
import {
  releaseInventoryReservation,
  reservationLinesMatchQuantities,
  type InventoryReservationRecord,
  type ReservationTransactionStore,
} from "./fabricInventoryReservation.js";
import {
  PAYMENT_INTENT_SAFE_CANCEL_STATUSES,
  isPaymentIntentReleaseBlocked,
} from "./depositPaymentBinding.js";

const hasPaymentIntentId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const normalizeOptionalPaymentIntentId = (
  value: unknown,
): string | null => (hasPaymentIntentId(value) ? value.trim() : null);

export type PayableCheckoutValidationFailure =
  | "STALE_CHECKOUT"
  | "CHECKOUT_STATE_CONFLICT"
  | "PREPARE_IDEMPOTENCY_CONFLICT";

export class PayableCheckoutValidationError extends Error {
  readonly code: PayableCheckoutValidationFailure;

  constructor(code: PayableCheckoutValidationFailure, message: string) {
    super(message);
    this.name = "PayableCheckoutValidationError";
    this.code = code;
  }
}

/**
 * Exact quote↔reservation PaymentIntent symmetry.
 * Pre-PI: both absent. Bound: both present and equal. Anything else is corruption.
 */
export const assertSymmetricPaymentIntentBinding = (input: {
  quote: DepositCheckoutQuote;
  reservation: InventoryReservationRecord;
}): { mode: "pre_pi" | "bound"; paymentIntentId: string | null } => {
  const quotePi = normalizeOptionalPaymentIntentId(input.quote.paymentIntentId);
  const reservationPi = normalizeOptionalPaymentIntentId(
    input.reservation.paymentIntentId,
  );

  if (quotePi === null && reservationPi === null) {
    return { mode: "pre_pi", paymentIntentId: null };
  }
  if (quotePi !== null && reservationPi !== null && quotePi === reservationPi) {
    return { mode: "bound", paymentIntentId: quotePi };
  }
  throw new PayableCheckoutValidationError(
    "CHECKOUT_STATE_CONFLICT",
    "Quote and reservation PaymentIntent binding is asymmetric or mismatched.",
  );
};

/**
 * No payable PaymentIntent may be created or returned unless quote is PREPARED
 * and reservation is ACTIVE with matching owner/fingerprint/lines.
 */
export const assertPayablePreparedCheckout = (input: {
  quote: DepositCheckoutQuote;
  reservation: InventoryReservationRecord | null;
  ownerUid: string;
  checkoutId: string;
  checkoutFingerprint: string;
  quantities: Map<string, number>;
}): {
  reservation: InventoryReservationRecord;
  piMode: "pre_pi" | "bound";
  paymentIntentId: string | null;
} => {
  if (input.quote.status !== "PREPARED") {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      `Checkout quote status ${input.quote.status} cannot receive a payable PaymentIntent.`,
    );
  }
  if (input.quote.checkoutId !== input.checkoutId) {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      "Checkout quote identity mismatch.",
    );
  }
  if (input.quote.ownerUid !== input.ownerUid) {
    throw new PayableCheckoutValidationError(
      "PREPARE_IDEMPOTENCY_CONFLICT",
      "Checkout quote owner does not match the authenticated customer.",
    );
  }
  if (input.quote.canonicalCheckoutFingerprint !== input.checkoutFingerprint) {
    throw new PayableCheckoutValidationError(
      "PREPARE_IDEMPOTENCY_CONFLICT",
      "Checkout fingerprint mismatch.",
    );
  }
  if (!input.reservation) {
    throw new PayableCheckoutValidationError(
      "STALE_CHECKOUT",
      "Prepared checkout has no inventory reservation.",
    );
  }
  const reservation = input.reservation;
  if (reservation.status === "RELEASED" || reservation.status === "EXPIRED") {
    throw new PayableCheckoutValidationError(
      "STALE_CHECKOUT",
      `Inventory reservation is ${reservation.status}; prepare a new checkout.`,
    );
  }
  if (reservation.status === "CONSUMED") {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      "Inventory reservation was already consumed without an agreed confirmed checkout.",
    );
  }
  if (reservation.status !== "ACTIVE") {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      `Inventory reservation status ${reservation.status} cannot receive a payable PaymentIntent.`,
    );
  }
  if (reservation.checkoutId !== input.checkoutId) {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      "Reservation checkout identity mismatch.",
    );
  }
  if (reservation.ownerUid !== input.ownerUid) {
    throw new PayableCheckoutValidationError(
      "PREPARE_IDEMPOTENCY_CONFLICT",
      "Reservation owner does not match the authenticated customer.",
    );
  }
  if (reservation.checkoutFingerprint !== input.checkoutFingerprint) {
    throw new PayableCheckoutValidationError(
      "PREPARE_IDEMPOTENCY_CONFLICT",
      "Reservation fingerprint does not match the prepared checkout.",
    );
  }
  if (!reservationLinesMatchQuantities(reservation.lines, input.quantities)) {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      "Reservation fabric lines do not match the canonical checkout quantities.",
    );
  }

  const symmetry = assertSymmetricPaymentIntentBinding({
    quote: input.quote,
    reservation,
  });
  return {
    reservation,
    piMode: symmetry.mode,
    paymentIntentId: symmetry.paymentIntentId,
  };
};

export type AbortPreparedCheckoutStore = ReservationTransactionStore & {
  getQuote(checkoutId: string): Promise<DepositCheckoutQuote | null>;
  setQuote(checkoutId: string, quote: DepositCheckoutQuote): void;
};

/**
 * Atomically release ACTIVE reservation and mark quote CANCELLED after PI
 * creation failure. Both transitions commit together or neither does.
 */
export const abortPreparedCheckoutAfterPaymentIntentFailure = async (input: {
  store: AbortPreparedCheckoutStore;
  checkoutId: string;
  ownerUid: string;
  checkoutFingerprint: string;
  reason: string;
  now: Date;
}): Promise<{
  quote: DepositCheckoutQuote;
  reservation: InventoryReservationRecord;
}> => {
  const quote = await input.store.getQuote(input.checkoutId);
  if (!quote) {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      "Cannot abort prepare: checkout quote is missing.",
    );
  }
  if (quote.ownerUid !== input.ownerUid) {
    throw new PayableCheckoutValidationError(
      "PREPARE_IDEMPOTENCY_CONFLICT",
      "Cannot abort prepare: owner mismatch.",
    );
  }
  if (quote.canonicalCheckoutFingerprint !== input.checkoutFingerprint) {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      "Cannot abort prepare: fingerprint mismatch.",
    );
  }
  if (quote.status !== "PREPARED" && quote.status !== "CANCELLED") {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      `Cannot abort prepare for quote status ${quote.status}.`,
    );
  }

  const reservation = await input.store.getReservation(input.checkoutId);
  if (reservation && reservation.status === "ACTIVE") {
    await releaseInventoryReservation({
      store: input.store,
      checkoutId: input.checkoutId,
      ownerUid: input.ownerUid,
      reason: input.reason,
      now: input.now,
      requireOwnerMatch: true,
    });
  } else if (
    reservation &&
    reservation.status !== "RELEASED" &&
    reservation.status !== "EXPIRED"
  ) {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      `Cannot abort prepare for reservation status ${reservation.status}.`,
    );
  }

  const released =
    (await input.store.getReservation(input.checkoutId)) ||
    reservation ||
    null;
  const cancelledQuote: DepositCheckoutQuote = {
    ...quote,
    status: "CANCELLED",
    clientSecret: null,
  };
  input.store.setQuote(input.checkoutId, cancelledQuote);

  if (!released) {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      "Cannot abort prepare: reservation missing after cleanup.",
    );
  }
  return { quote: cancelledQuote, reservation: released };
};

/**
 * Atomically bind the same PaymentIntent id onto PREPARED quote + ACTIVE
 * reservation. Both must previously have no PI.
 */
export const bindPaymentIntentToCheckout = async (input: {
  store: AbortPreparedCheckoutStore;
  checkoutId: string;
  ownerUid: string;
  checkoutFingerprint: string;
  paymentIntentId: string;
  quantities: Map<string, number>;
  clientSecret: string | null;
  paymentProvider: "stripe" | "simulated";
  simulationToken?: string;
}): Promise<{
  quote: DepositCheckoutQuote;
  reservation: InventoryReservationRecord;
}> => {
  const quote = await input.store.getQuote(input.checkoutId);
  const reservation = await input.store.getReservation(input.checkoutId);
  if (!quote || !reservation) {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      "Cannot bind PaymentIntent: quote or reservation missing.",
    );
  }
  assertPayablePreparedCheckout({
    quote,
    reservation,
    ownerUid: input.ownerUid,
    checkoutId: input.checkoutId,
    checkoutFingerprint: input.checkoutFingerprint,
    quantities: input.quantities,
  });
  const symmetry = assertSymmetricPaymentIntentBinding({ quote, reservation });
  if (symmetry.mode !== "pre_pi") {
    throw new PayableCheckoutValidationError(
      "CHECKOUT_STATE_CONFLICT",
      "Cannot bind PaymentIntent: checkout already has a bound PaymentIntent.",
    );
  }

  const boundQuote: DepositCheckoutQuote = {
    ...quote,
    paymentProvider: input.paymentProvider,
    paymentIntentId: input.paymentIntentId,
    clientSecret: input.clientSecret,
    ...(input.simulationToken ? { simulationToken: input.simulationToken } : {}),
  };
  const boundReservation: InventoryReservationRecord = {
    ...reservation,
    paymentIntentId: input.paymentIntentId,
  };
  input.store.setQuote(input.checkoutId, boundQuote);
  input.store.setReservation(input.checkoutId, boundReservation);
  return { quote: boundQuote, reservation: boundReservation };
};

export type PaymentIntentReleaseDecision =
  | { action: "finalize" }
  | { action: "retain"; reason: string }
  | { action: "release"; reason: string }
  | { action: "cancel_then_release" };

/**
 * Central policy: if a PaymentIntent can still become succeeded, keep reservation.
 */
export const evaluatePaymentIntentReleasePolicy = (
  status: string,
): PaymentIntentReleaseDecision => {
  if (status === "succeeded") {
    return { action: "finalize" };
  }
  if (isPaymentIntentReleaseBlocked(status)) {
    return { action: "retain", reason: status };
  }
  if (status === "canceled") {
    return { action: "release", reason: "canceled" };
  }
  if (
    (PAYMENT_INTENT_SAFE_CANCEL_STATUSES as readonly string[]).includes(status)
  ) {
    return { action: "cancel_then_release" };
  }
  return { action: "retain", reason: `unknown_status_${status}` };
};

export type StripePaymentIntentController = {
  retrieve(paymentIntentId: string): Promise<{ id: string; status: string }>;
  cancel(paymentIntentId: string): Promise<{ id: string; status: string }>;
};

/**
 * Ensure PI is terminal/non-payable before reservation release is allowed.
 * payment_failed with requires_payment_method MUST cancel successfully first.
 */
export const makePaymentIntentNonPayableBeforeReservationRelease = async (input: {
  stripe: StripePaymentIntentController;
  paymentIntentId: string;
}): Promise<
  | { outcome: "finalize" }
  | { outcome: "retain"; reason: string; status: string }
  | { outcome: "release_allowed"; status: string }
> => {
  const intent = await input.stripe.retrieve(input.paymentIntentId);
  const decision = evaluatePaymentIntentReleasePolicy(intent.status);

  if (decision.action === "finalize") {
    return { outcome: "finalize" };
  }
  if (decision.action === "retain") {
    return {
      outcome: "retain",
      reason: decision.reason,
      status: intent.status,
    };
  }
  if (decision.action === "release") {
    return { outcome: "release_allowed", status: intent.status };
  }

  // cancel_then_release
  try {
    const canceled = await input.stripe.cancel(input.paymentIntentId);
    if (canceled.status !== "canceled") {
      return {
        outcome: "retain",
        reason: "cancel_did_not_reach_canceled",
        status: canceled.status,
      };
    }
    return { outcome: "release_allowed", status: "canceled" };
  } catch {
    return {
      outcome: "retain",
      reason: "cancel_failed",
      status: intent.status,
    };
  }
};
