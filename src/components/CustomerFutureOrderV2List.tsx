import { ShoppingBag } from "lucide-react";
import {
  presentFutureOrderV2History,
  type FutureOrderV2HistoryPresentation,
} from "../utils/futureOrderV2History";
import {
  formatFutureOrderV2PaidAmount,
  type FutureOrderV2PaymentRecord,
} from "../utils/futureOrderV2PaymentRecord";

interface CustomerFutureOrderV2ListProps {
  orders: readonly unknown[];
  paymentsByOrderId: ReadonlyMap<string, FutureOrderV2PaymentRecord>;
}

const formatOrderDate = (persistedAt: string): string => {
  const date = new Date(persistedAt);
  return Number.isNaN(date.getTime())
    ? persistedAt
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export const CustomerFutureOrderV2List = ({
  orders,
  paymentsByOrderId,
}: CustomerFutureOrderV2ListProps) => {
  const presentations = orders
    .map((order) => presentFutureOrderV2History(order))
    .flatMap((result) => (result.status === "valid" ? [result.value] : []))
    .sort((left, right) => right.persistedAt.localeCompare(left.persistedAt));
  if (presentations.length === 0) return null;

  return (
    <section
      data-customer-v2-orders
      className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-4"
    >
      <div className="flex items-center gap-3 border-b pb-4 border-gray-100">
        <ShoppingBag className="text-heritage-gold" size={18} />
        <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif">
          My orders
        </h3>
      </div>
      <div className="space-y-4">
        {presentations.map((order: FutureOrderV2HistoryPresentation) => {
          const payment = paymentsByOrderId.get(order.orderId);
          return (
            <div
              key={order.orderId}
              data-customer-v2-order={order.orderId}
              className="border border-heritage-gold/20 rounded-2xl p-4 space-y-3 flex flex-col"
            >
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <h5 className="font-serif font-bold text-heritage-green">
                    Order placed {formatOrderDate(order.persistedAt)}
                  </h5>
                  <div className="break-all text-[10px] font-mono text-heritage-ink/60">
                    {order.orderId}
                  </div>
                </div>
                {payment ? (
                  <span
                    data-customer-v2-order-paid={order.orderId}
                    className="px-2 py-1 rounded text-[8px] font-bold uppercase border bg-emerald-50 text-emerald-800 border-emerald-200 h-fit shrink-0"
                  >
                    Paid (test) {formatFutureOrderV2PaidAmount(payment.amountCents)}
                  </span>
                ) : (
                  <span
                    data-customer-v2-order-unpaid={order.orderId}
                    className="px-2 py-1 rounded text-[8px] font-bold uppercase border bg-amber-50 text-amber-800 border-amber-200 h-fit shrink-0"
                  >
                    Awaiting payment
                  </span>
                )}
              </div>
              <ul className="space-y-1 text-[10px] text-heritage-ink/75">
                {order.occurrences.map((occurrence) => (
                  <li key={`${occurrence.garmentKey}:${occurrence.occurrenceToken}`}>
                    <span className="font-semibold">{occurrence.garmentLabel}</span>
                    {" · "}
                    {occurrence.style.kind === "catalogue"
                      ? occurrence.style.name
                      : "Uploaded design"}
                  </li>
                ))}
              </ul>
              {order.exactTotalCents !== null && (
                <div className="text-[10px] text-heritage-ink/75">
                  Total: <span className="font-bold text-heritage-green">
                    {formatFutureOrderV2PaidAmount(order.exactTotalCents)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
