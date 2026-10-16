import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import {
  presentFutureOrderV2History,
  unwrapDocumentProjection,
  type FutureOrderV2HistoryPresentation,
} from "../utils/futureOrderV2History";
import {
  parsePersistedFutureOrderV2,
  type PersistedFutureOrderV2,
} from "../utils/futureOrderV2PersistenceContract";
import {
  formatCustomerOrderDate,
  formatFutureOrderV2PaidAmount,
  type FutureOrderV2PaymentRecord,
} from "../utils/futureOrderV2PaymentRecord";
import type { FutureOrderV2DashboardPaymentActions } from "../utils/futureOrderV2DashboardPayment";
import { presentFutureOrderV2WorkshopCard, type FutureOrderV2WorkshopProgress } from "../utils/futureOrderV2WorkshopProgress";
import {
  PERSONALIZED_BASE_PAYMENT_NOTICE,
  readFutureOrderV2ChargeableCents,
  type FutureOrderV2PersonalizedPriceRecord,
} from "../utils/futureOrderV2PersonalizedPrice";
import { CustomerFutureOrderV2Details } from "./CustomerFutureOrderV2Details";
import { WorkshopStageList } from "./WorkshopStageList";

interface CustomerFutureOrderV2ListProps {
  orders: readonly unknown[];
  paymentsByOrderId: ReadonlyMap<string, FutureOrderV2PaymentRecord>;
  paymentActions?: FutureOrderV2DashboardPaymentActions;
  openOrderId?: string | null;
  onOpenOrderChange?: (orderId: string | null) => void;
  workshopByOrderId?: ReadonlyMap<string, FutureOrderV2WorkshopProgress>;
  personalizedPricesByOrderId?: ReadonlyMap<string, FutureOrderV2PersonalizedPriceRecord>;
  onDecidePersonalizedPrice?: (input: {
    orderId: string;
    occurrenceKey: string;
    decision: "accepted" | "declined";
  }) => Promise<
    | { readonly status: "updated"; readonly record: FutureOrderV2PersonalizedPriceRecord }
    | { readonly status: "failed"; readonly message: string }
  >;
}

interface CustomerFutureOrderV2Entry {
  readonly persisted: PersistedFutureOrderV2;
  readonly presentation: FutureOrderV2HistoryPresentation;
}

export const CustomerFutureOrderV2List = ({
  orders,
  paymentsByOrderId,
  paymentActions,
  openOrderId: controlledOpenOrderId,
  onOpenOrderChange,
  workshopByOrderId = new Map(),
  personalizedPricesByOrderId = new Map(),
  onDecidePersonalizedPrice,
}: CustomerFutureOrderV2ListProps) => {
  const [internalOpenOrderId, setInternalOpenOrderId] = useState<string | null>(null);
  const openOrderId = controlledOpenOrderId !== undefined ? controlledOpenOrderId : internalOpenOrderId;
  const setOpenOrderId = (orderId: string | null) => {
    onOpenOrderChange?.(orderId);
    if (controlledOpenOrderId === undefined) setInternalOpenOrderId(orderId);
  };
  const entries = orders
    .flatMap((order): CustomerFutureOrderV2Entry[] => {
      const parsed = parsePersistedFutureOrderV2(unwrapDocumentProjection(order));
      if (parsed.status !== "valid") return [];
      const presentation = presentFutureOrderV2History(parsed.value);
      return presentation.status === "valid"
        ? [{ persisted: parsed.value, presentation: presentation.value }]
        : [];
    })
    .sort((left, right) =>
      right.presentation.persistedAt.localeCompare(left.presentation.persistedAt),
    );
  if (entries.length === 0) return null;
  const openEntry = entries.find((entry) => entry.persisted.orderId === openOrderId);

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
        {entries.map(({ persisted, presentation: order }) => {
          const payment = paymentsByOrderId.get(order.orderId);
          const personalizedPrice = personalizedPricesByOrderId.get(order.orderId) ?? null;
          const chargeableCents = readFutureOrderV2ChargeableCents(
            persisted.masterOrder.cartItem.candidate,
            personalizedPrice,
          );
          return (
            <div
              key={order.orderId}
              data-customer-v2-order={order.orderId}
              className="border border-heritage-gold/20 rounded-2xl p-4 space-y-3 flex flex-col"
            >
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <h5 className="font-serif font-bold text-heritage-green">
                    Order placed {formatCustomerOrderDate(order.persistedAt)}
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
              {(() => {
                const progress = presentFutureOrderV2WorkshopCard(
                  workshopByOrderId.get(order.orderId),
                );
                return (
                  <div
                    data-customer-v2-order-progress={order.orderId}
                    className="space-y-1 text-[10px] text-heritage-ink/75"
                  >
                    {progress.stageLines.length > 0 ? (
                      <WorkshopStageList
                        orderId={order.orderId}
                        stageLines={progress.stageLines}
                      />
                    ) : (
                      <p>{progress.statusLabel}</p>
                    )}
                    <p>
                      Est. Delivery: {progress.deliveryLabel}
                      {progress.dispatchLabel ? <><br />Dispatch: {progress.dispatchLabel}</> : null}
                      {progress.pickupPinLabel ? <><br />Pickup PIN: {progress.pickupPinLabel}</> : null}
                    </p>
                  </div>
                );
              })()}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {chargeableCents !== null ? (
                  <div className="text-[10px] text-heritage-ink/75">
                    {persisted.masterOrder.cartItem.candidate.pricing.status === "exact"
                      ? "Total"
                      : "Base total"}
                    : <span className="font-bold text-heritage-green">
                      {formatFutureOrderV2PaidAmount(chargeableCents)}
                    </span>
                    {persisted.masterOrder.cartItem.candidate.pricing.status !== "exact" ? (
                      <p>{PERSONALIZED_BASE_PAYMENT_NOTICE}</p>
                    ) : null}
                  </div>
                ) : (
                  <span />
                )}
                <div className="flex flex-wrap gap-2">
                  {!payment && paymentActions && chargeableCents !== null && (
                    <button
                      type="button"
                      data-customer-v2-order-pay-now={order.orderId}
                      onClick={() => setOpenOrderId(order.orderId)}
                      className="rounded-lg bg-heritage-gold px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white cursor-pointer"
                    >
                      Pay now
                    </button>
                  )}
                  <button
                    type="button"
                    data-customer-v2-order-details={order.orderId}
                    onClick={() => setOpenOrderId(order.orderId)}
                    className="rounded-lg border border-heritage-green/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white cursor-pointer"
                  >
                    View details
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {openEntry && (
        <CustomerFutureOrderV2Details
          order={openEntry.persisted}
          payment={paymentsByOrderId.get(openEntry.persisted.orderId)}
          workshop={workshopByOrderId.get(openEntry.persisted.orderId)}
          personalizedPrice={personalizedPricesByOrderId.get(openEntry.persisted.orderId) ?? null}
          onDecidePersonalizedPrice={onDecidePersonalizedPrice}
          onClose={() => setOpenOrderId(null)}
          paymentActions={paymentActions}
        />
      )}
    </section>
  );
};
