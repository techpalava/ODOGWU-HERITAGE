import {
  formatCustomerOrderDate,
  formatFutureOrderV2PaidAmount,
  type FutureOrderV2PaymentRecord,
} from "./futureOrderV2PaymentRecord.js";

export type FutureOrderV2AdminPaymentPresentation =
  | {
      readonly kind: "paid";
      readonly amountLabel: string;
      readonly paidOnLabel: string;
      readonly paymentIntentId: string;
      readonly stripeUrl: string;
    }
  | { readonly kind: "awaiting" };

export const presentFutureOrderV2AdminPayment = (
  record: FutureOrderV2PaymentRecord | undefined,
): FutureOrderV2AdminPaymentPresentation =>
  record
    ? {
        kind: "paid",
        amountLabel: formatFutureOrderV2PaidAmount(record.amountCents),
        paidOnLabel: formatCustomerOrderDate(record.recordedAt),
        paymentIntentId: record.paymentIntentId,
        stripeUrl: `https://dashboard.stripe.com/test/payments/${encodeURIComponent(record.paymentIntentId)}`,
      }
    : { kind: "awaiting" };

export type AdminPaymentFilter = "all" | "paid" | "awaiting";

export type AdminOrderPaymentState = "paid" | "awaiting" | "unknown";

/** Rows whose payment state cannot be read only appear under "all". */
export const matchesAdminPaymentFilter = (
  filter: AdminPaymentFilter,
  state: AdminOrderPaymentState,
): boolean => filter === "all" || filter === state;

/**
 * A legacy order with no payment object is awaiting payment. Reading `payment.isPaid`
 * directly throws for those records and takes down the whole admin panel.
 */
export const adminOrderPaymentState = ({
  historyStatus,
  hasV2PaymentRecord,
  legacyIsPaid,
}: {
  historyStatus: "valid" | "invalid_history" | "not_v2";
  hasV2PaymentRecord: boolean;
  legacyIsPaid: boolean | undefined;
}): AdminOrderPaymentState => {
  if (historyStatus === "invalid_history") return "unknown";
  if (historyStatus === "valid") return hasV2PaymentRecord ? "paid" : "awaiting";
  return legacyIsPaid === true ? "paid" : "awaiting";
};
