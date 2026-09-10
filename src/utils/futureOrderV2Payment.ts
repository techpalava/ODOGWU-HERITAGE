import type { FutureOrderMasterOrderV2 } from "./futureOrderV2Storage";
import { parseFutureOrderMasterOrderV2 } from "./futureOrderV2Storage";
import type { FutureOrderV2PreparationAttempt } from "./futureOrderV2Preparation";

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
  | { readonly status: "failed"; readonly message: string };

export type FutureOrderV2PaymentOutcome =
  | {
      readonly status: "authorized";
      readonly attempt: FutureOrderV2PaymentAttempt;
      readonly providerTransactionReference: string;
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
  authorize,
}: {
  prepared: FutureOrderV2PreparationAttempt;
  existingAttempt?: FutureOrderV2PaymentAttempt | null;
  authorize(input: FutureOrderV2PaymentAttempt): Promise<FutureOrderV2PaymentAuthorizationResult>;
}): Promise<FutureOrderV2PaymentOutcome> => {
  const payment = createFutureOrderV2PaymentAttempt({
    prepared,
    existingAttempt,
  });
  if (payment.status !== "valid") return payment;

  try {
    const result = await authorize(payment.attempt);
    return result.status === "authorized"
      ? {
          status: "authorized",
          attempt: payment.attempt,
          providerTransactionReference: result.providerTransactionReference,
        }
      : { status: "failed", attempt: payment.attempt, message: result.message };
  } catch {
    return {
      status: "failed",
      attempt: payment.attempt,
      message: "Payment authorization could not be confirmed. Retry this same order safely.",
    };
  }
};

/**
 * The existing checkout uses a local simulated authorization. Keep that
 * temporary provider behavior separate from V2 order persistence and bind its
 * transaction identity to the stable V2 payment reference.
 */
export const authorizeFutureOrderV2Payment = async (
  attempt: FutureOrderV2PaymentAttempt,
): Promise<FutureOrderV2PaymentAuthorizationResult> =>
  new Promise((resolve) => {
    setTimeout(
      () =>
        resolve({
        status: "authorized",
        providerTransactionReference: attempt.paymentReference,
        }),
      2000,
    );
  });
