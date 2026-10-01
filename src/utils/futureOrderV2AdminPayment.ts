import { presentFutureOrderV2History } from "./futureOrderV2History.js";
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

interface LegacyWorkshopOrder {
  shipment?: { currentStage?: number; status?: string };
  payment?: {
    isPaid?: boolean;
    secondPaymentStatus?: string;
    subtotal?: unknown;
    deposit?: unknown;
    remaining?: unknown;
  };
}

/** V2 orders have no legacy shipment or payment object. The documentation cards must skip them. */
export const selectLegacyWorkshopOrders = (orders: readonly unknown[]): LegacyWorkshopOrder[] =>
  orders.filter((order): order is LegacyWorkshopOrder => {
    try {
      return presentFutureOrderV2History(order).status === "not_v2";
    } catch {
      return false;
    }
  });

const legacyAmount = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export const summarizeAdminDocumentationOrders = (orders: readonly unknown[]) => {
  const legacy = selectLegacyWorkshopOrders(orders);
  const collected = (order: LegacyWorkshopOrder) =>
    order.payment?.isPaid || order.payment?.secondPaymentStatus === "paid"
      ? legacyAmount(order.payment?.subtotal)
      : legacyAmount(order.payment?.deposit);
  const outstanding = (order: LegacyWorkshopOrder) =>
    order.payment?.secondPaymentStatus !== "paid" ? legacyAmount(order.payment?.remaining) : 0;
  return {
    pending: legacy.filter((order) => [1, 2].includes(order.shipment?.currentStage ?? -1)).length,
    production: legacy.filter((order) => [3, 4].includes(order.shipment?.currentStage ?? -1)).length,
    completed: legacy.filter((order) => (order.shipment?.currentStage ?? 0) >= 5).length,
    cancelled: legacy.filter((order) => String(order.shipment?.status ?? "").toLowerCase().includes("cancel")).length,
    pendingPayments: legacy.reduce((sum, order) => sum + outstanding(order), 0),
    completedPayments: legacy.reduce((sum, order) => sum + collected(order), 0),
    outstandingBalance: legacy.reduce((sum, order) => sum + outstanding(order), 0),
  };
};
