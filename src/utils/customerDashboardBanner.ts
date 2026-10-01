import {
  presentFutureOrderV2History,
  unwrapDocumentProjection,
} from "./futureOrderV2History.js";
import { parsePersistedFutureOrderV2 } from "./futureOrderV2PersistenceContract.js";
import { formatCustomerOrderDate } from "./futureOrderV2PaymentRecord.js";

export interface CustomerDashboardBannerAction {
  readonly orderId: string;
  readonly label: "View details";
}

export interface CustomerDashboardBanner {
  readonly message: string;
  readonly action: CustomerDashboardBannerAction | null;
}

interface BannerOrder {
  readonly orderId: string;
  readonly persistedAt: string;
  readonly paid: boolean;
}

const bannerOrders = (
  orders: readonly unknown[],
  paymentsByOrderId: ReadonlyMap<string, unknown>,
): BannerOrder[] =>
  orders.flatMap((order) => {
    try {
      const parsed = parsePersistedFutureOrderV2(unwrapDocumentProjection(order));
      if (parsed.status !== "valid") return [];
      const history = presentFutureOrderV2History(parsed.value);
      if (history.status !== "valid") return [];
      return [{
        orderId: history.value.orderId,
        persistedAt: history.value.persistedAt,
        paid: paymentsByOrderId.has(history.value.orderId),
      }];
    } catch {
      return [];
    }
  });

export const presentCustomerDashboardBanner = (
  orders: readonly unknown[],
  paymentsByOrderId: ReadonlyMap<string, unknown>,
): CustomerDashboardBanner | null => {
  const listed = bannerOrders(orders, paymentsByOrderId);
  if (listed.length === 0) return null;
  if (listed.length === 1) {
    const order = listed[0];
    const placed = `Order placed ${formatCustomerOrderDate(order.persistedAt)}`;
    return {
      message: order.paid
        ? `${placed} is paid. Production has not started.`
        : `${placed} is waiting for payment.`,
      action: { orderId: order.orderId, label: "View details" },
    };
  }
  const unpaid = listed.filter((order) => !order.paid);
  if (unpaid.length === 0) {
    return {
      message: `You have ${listed.length} orders. ${listed.length} paid. Production has not started.`,
      action: null,
    };
  }
  if (unpaid.length === 1) {
    return {
      message: `You have ${listed.length} orders. 1 is waiting for payment.`,
      action: { orderId: unpaid[0].orderId, label: "View details" },
    };
  }
  return {
    message: `You have ${listed.length} orders. ${unpaid.length} are waiting for payment.`,
    action: null,
  };
};
