import type { FutureOrderMasterOrderV2 } from "./futureOrderV2Storage";
import { parseFutureOrderMasterOrderV2 } from "./futureOrderV2Storage";
import type { FutureOrderV2PreparationAttempt } from "./futureOrderV2Preparation";
import type { Batch } from "../types";
import { getRetainedCommunityBatchEligibilityBlocker } from "./futureOrderCandidate";

export type FutureOrderV2PaymentMethod = "card" | "ideal";

export interface FutureOrderV2PaymentAttempt {
  readonly orderId: string;
  readonly cartItemId: string;
  /** A deterministic provider idempotency key for this immutable V2 order. */
  readonly paymentReference: string;
  readonly masterOrder: FutureOrderMasterOrderV2;
}

export type FutureOrderV2PaymentPreparationResult =
  | { readonly status: "valid"; readonly attempt: FutureOrderV2PaymentAttempt }
  | { readonly status: "invalid"; readonly message: string };

export type FutureOrderV2PaymentAuthorizationResult =
  | { readonly status: "authorized"; readonly providerTransactionReference: string }
  | { readonly status: "redirecting" }
  | { readonly status: "failed"; readonly message: string };

export type FutureOrderV2PaymentEligibilityResult =
  | { readonly status: "valid" }
  | { readonly status: "invalid"; readonly message: string };

/**
 * This is deliberately evaluated at payment time. A prepared Community order
 * remains bound to its retained batch ID, never the current homepage batch.
 */
export const validatePreparedFutureOrderV2PaymentEligibility = ({
  prepared,
  liveBatches,
}: {
  prepared: FutureOrderV2PreparationAttempt;
  liveBatches: readonly Batch[];
}): FutureOrderV2PaymentEligibilityResult => {
  const identity = prepared.cartItem.candidate.orderIdentity;
  if (!identity) return { status: "valid" };
  const blocker = getRetainedCommunityBatchEligibilityBlocker(
    identity,
    liveBatches,
  );
  return blocker
    ? { status: "invalid", message: blocker.message }
    : { status: "valid" };
};

export type FutureOrderV2PaymentOutcome =
  | {
      readonly status: "authorized";
      readonly attempt: FutureOrderV2PaymentAttempt;
      readonly providerTransactionReference: string;
    }
  | {
      readonly status: "redirecting";
      readonly attempt: FutureOrderV2PaymentAttempt;
    }
  | {
      readonly status: "failed";
      readonly attempt: FutureOrderV2PaymentAttempt;
      readonly message: string;
    }
  | { readonly status: "invalid"; readonly message: string };

const samePreparedIdentity = (
  left: FutureOrderV2PaymentAttempt,
  right: FutureOrderV2PaymentAttempt,
): boolean =>
  left.orderId === right.orderId &&
  left.cartItemId === right.cartItemId &&
  left.paymentReference === right.paymentReference &&
  left.masterOrder === right.masterOrder;

export const createFutureOrderV2PaymentAttempt = ({
  prepared,
  existingAttempt = null,
}: {
  prepared: FutureOrderV2PreparationAttempt;
  existingAttempt?: FutureOrderV2PaymentAttempt | null;
}): FutureOrderV2PaymentPreparationResult => {
  const parsed = parseFutureOrderMasterOrderV2(prepared.masterOrder);
  if (
    parsed.status !== "valid" ||
    parsed.value.orderId !== prepared.orderId ||
    parsed.value.cartItem.cartItemId !== prepared.cartItemId
  ) {
    return {
      status: "invalid",
      message: "The prepared V2 order identity could not be verified for payment.",
    };
  }

  const attempt: FutureOrderV2PaymentAttempt = {
    orderId: prepared.orderId,
    cartItemId: prepared.cartItemId,
    paymentReference: `future-v2-payment-${prepared.orderId}`,
    // Preserve the immutable snapshot object that persistence already accepted.
    masterOrder: prepared.masterOrder,
  };
  if (existingAttempt && !samePreparedIdentity(existingAttempt, attempt)) {
    return {
      status: "invalid",
      message: "The existing payment attempt belongs to a different prepared order.",
    };
  }
  return { status: "valid", attempt: existingAttempt || attempt };
};

export const executeFutureOrderV2Payment = async ({
  prepared,
  existingAttempt = null,
  validateBeforeAuthorization = () => ({ status: "valid" as const }),
  authorize,
}: {
  prepared: FutureOrderV2PreparationAttempt;
  existingAttempt?: FutureOrderV2PaymentAttempt | null;
  validateBeforeAuthorization?: () => FutureOrderV2PaymentEligibilityResult;
  authorize(input: FutureOrderV2PaymentAttempt): Promise<FutureOrderV2PaymentAuthorizationResult>;
}): Promise<FutureOrderV2PaymentOutcome> => {
  const payment = createFutureOrderV2PaymentAttempt({
    prepared,
    existingAttempt,
  });
  if (payment.status !== "valid") return payment;
  const eligibility = validateBeforeAuthorization();
  if (eligibility.status !== "valid") return eligibility;

  try {
    const result = await authorize(payment.attempt);
    if (result.status === "authorized") {
      return {
        status: "authorized",
        attempt: payment.attempt,
        providerTransactionReference: result.providerTransactionReference,
      };
    }
    if (result.status === "redirecting") {
      return { status: "redirecting", attempt: payment.attempt };
    }
    return { status: "failed", attempt: payment.attempt, message: result.message };
  } catch {
    return {
      status: "failed",
      attempt: payment.attempt,
      message: "Payment authorization could not be confirmed. Retry this same order safely.",
    };
  }
};

export type FutureOrderV2PaymentConfirmation =
  | { readonly status: "confirmed"; readonly paymentIntentId: string }
  | { readonly status: "redirecting" }
  | { readonly status: "failed"; readonly message: string };

export interface FutureOrderV2PaymentConfirmContext {
  readonly paymentIntentId: string;
  readonly orderId: string;
  readonly paymentMethodTypes: readonly string[];
}

/** Confirms the PaymentIntent client secret with the selected Stripe method. */
export type FutureOrderV2PaymentConfirmer = (
  clientSecret: string,
  context: FutureOrderV2PaymentConfirmContext,
) => Promise<FutureOrderV2PaymentConfirmation>;

/** @deprecated Use FutureOrderV2PaymentConfirmer. Kept for existing call sites/tests. */
export type FutureOrderV2CardConfirmation = FutureOrderV2PaymentConfirmation;
/** @deprecated Use FutureOrderV2PaymentConfirmer. */
export type FutureOrderV2CardConfirmer = FutureOrderV2PaymentConfirmer;

let paymentConfirmer: FutureOrderV2PaymentConfirmer | null = null;

export const registerFutureOrderV2PaymentConfirmer = (
  confirmer: FutureOrderV2PaymentConfirmer | null,
): void => {
  paymentConfirmer = confirmer;
};

/** @deprecated Prefer registerFutureOrderV2PaymentConfirmer. */
export const registerFutureOrderV2CardConfirmer = (
  confirmer: FutureOrderV2PaymentConfirmer | null,
): void => {
  registerFutureOrderV2PaymentConfirmer(confirmer);
};

const MINIMUM_CHARGE_CENTS = 50;

export const readFutureOrderV2ReviewedTotalCents = (
  attempt: FutureOrderV2PaymentAttempt,
): number | null => {
  const pricing = attempt.masterOrder.cartItem.candidate.pricing;
  const amountCents = pricing.exactTotalCents;
  if (
    pricing.status !== "exact" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < MINIMUM_CHARGE_CENTS
  ) {
    return null;
  }
  return amountCents;
};

/**
 * Creates one Stripe test PaymentIntent for the reviewed euro total, then
 * confirms the selected method in the browser. The payment reference is the
 * idempotency key, so a retry of the same prepared order cannot create a
 * second charge.
 */
export const authorizeFutureOrderV2Payment = async (
  attempt: FutureOrderV2PaymentAttempt,
): Promise<FutureOrderV2PaymentAuthorizationResult> => {
  const amountCents = readFutureOrderV2ReviewedTotalCents(attempt);
  if (
    amountCents === null ||
    attempt.paymentReference !== `future-v2-payment-${attempt.orderId}`
  ) {
    return {
      status: "failed",
      message: "The reviewed total is not ready to charge.",
    };
  }
  const confirmer = paymentConfirmer;
  if (!confirmer) {
    return {
      status: "failed",
      message: "Choose a payment method before authorizing this payment.",
    };
  }

  let payload: unknown;
  try {
    const response = await fetch("/api/future-order-v2/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: attempt.orderId,
        paymentReference: attempt.paymentReference,
        masterOrder: attempt.masterOrder,
      }),
    });
    payload = await response.json();
    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "Stripe could not start this payment. Retry this same order.";
      return { status: "failed", message };
    }
  } catch {
    return {
      status: "failed",
      message: "Stripe could not start this payment. Retry this same order.",
    };
  }

  const clientSecret =
    payload &&
    typeof payload === "object" &&
    "clientSecret" in payload &&
    typeof payload.clientSecret === "string"
      ? payload.clientSecret
      : "";
  const paymentIntentId =
    payload &&
    typeof payload === "object" &&
    "paymentIntentId" in payload &&
    typeof payload.paymentIntentId === "string"
      ? payload.paymentIntentId
      : "";
  const paymentMethodTypes =
    payload &&
    typeof payload === "object" &&
    "paymentMethodTypes" in payload &&
    Array.isArray(payload.paymentMethodTypes)
      ? payload.paymentMethodTypes.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
  if (!clientSecret || !paymentIntentId.startsWith("pi_")) {
    return {
      status: "failed",
      message: "Stripe did not return a payment that can be confirmed.",
    };
  }

  try {
    const confirmed = await confirmer(clientSecret, {
      paymentIntentId,
      orderId: attempt.orderId,
      paymentMethodTypes,
    });
    if (confirmed.status === "redirecting") {
      return { status: "redirecting" };
    }
    if (confirmed.status !== "confirmed") {
      return { status: "failed", message: confirmed.message };
    }
    if (confirmed.paymentIntentId !== paymentIntentId) {
      return {
        status: "failed",
        message: "The confirmed payment does not match this order.",
      };
    }
    return {
      status: "authorized",
      providerTransactionReference: confirmed.paymentIntentId,
    };
  } catch {
    return {
      status: "failed",
      message: "The payment could not be confirmed. Retry this same order safely.",
    };
  }
};
