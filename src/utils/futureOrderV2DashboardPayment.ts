import type { FutureOrderV2PaymentRecordResult } from "../services/futureOrderV2PaymentRecordClient";
import type {
  FutureOrderV2PaymentAttempt,
  FutureOrderV2PaymentAuthorizationResult,
} from "./futureOrderV2Payment";
import type { FutureOrderV2PaymentRecord } from "./futureOrderV2PaymentRecord";
import type { PersistedFutureOrderV2 } from "./futureOrderV2PersistenceContract";

export interface FutureOrderV2DashboardPaymentActions {
  readonly authorize: (
    attempt: FutureOrderV2PaymentAttempt,
  ) => Promise<FutureOrderV2PaymentAuthorizationResult>;
  readonly record: (input: {
    orderId: string;
    paymentIntentId: string;
  }) => Promise<FutureOrderV2PaymentRecordResult>;
}

export type FutureOrderV2DashboardPaymentOutcome =
  | { readonly status: "paid"; readonly record: FutureOrderV2PaymentRecord }
  | { readonly status: "failed"; readonly message: string }
  | {
      readonly status: "record_failed";
      readonly paymentIntentId: string;
      readonly message: string;
    };

export const createFutureOrderV2DashboardPaymentAttempt = (
  order: PersistedFutureOrderV2,
): FutureOrderV2PaymentAttempt => ({
  orderId: order.orderId,
  cartItemId: order.masterOrder.cartItem.cartItemId,
  paymentReference: `future-v2-payment-${order.orderId}`,
  masterOrder: order.masterOrder,
});

/** Saves the payment record only; it never starts a new charge. */
export const retryFutureOrderV2DashboardRecord = async ({
  orderId,
  paymentIntentId,
  record,
}: {
  orderId: string;
  paymentIntentId: string;
  record: FutureOrderV2DashboardPaymentActions["record"];
}): Promise<FutureOrderV2DashboardPaymentOutcome> => {
  const result = await record({ orderId, paymentIntentId });
  return result.status === "recorded"
    ? { status: "paid", record: result.record }
    : { status: "record_failed", paymentIntentId, message: result.message };
};

export const payFutureOrderV2FromDashboard = async ({
  order,
  authorize,
  record,
}: {
  order: PersistedFutureOrderV2;
} & FutureOrderV2DashboardPaymentActions): Promise<FutureOrderV2DashboardPaymentOutcome> => {
  let authorization: FutureOrderV2PaymentAuthorizationResult;
  try {
    authorization = await authorize(createFutureOrderV2DashboardPaymentAttempt(order));
  } catch {
    return {
      status: "failed",
      message: "The card could not be confirmed. Retry this same order safely.",
    };
  }
  if (authorization.status !== "authorized") {
    return { status: "failed", message: authorization.message };
  }
  return retryFutureOrderV2DashboardRecord({
    orderId: order.orderId,
    paymentIntentId: authorization.providerTransactionReference,
    record,
  });
};
