import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, FileText, LockKeyhole, Printer, X } from "lucide-react";
import { FutureOrderV2PaymentAlert } from "./FutureOrderV2PaymentAlert";
import { FutureOrderV2StripeCard } from "./FutureOrderV2StripeCard";
import type { PersistedFutureOrderV2 } from "../utils/futureOrderV2PersistenceContract";
import {
  payFutureOrderV2FromDashboard,
  retryFutureOrderV2DashboardRecord,
  type FutureOrderV2DashboardPaymentActions,
  type FutureOrderV2DashboardPaymentOutcome,
} from "../utils/futureOrderV2DashboardPayment";
import {
  formatCustomerOrderDate,
  formatFutureOrderV2PaidAmount,
  type FutureOrderV2PaymentRecord,
} from "../utils/futureOrderV2PaymentRecord";
import {
  getFuturePaymentReviewGarments,
  getFuturePaymentReviewMeasurementGroups,
  getFuturePaymentReviewPricingRows,
} from "../utils/designStudioFuturePaymentReview";

interface CustomerFutureOrderV2DetailsProps {
  order: PersistedFutureOrderV2;
  payment: FutureOrderV2PaymentRecord | undefined;
  onClose: () => void;
  paymentActions?: FutureOrderV2DashboardPaymentActions;
}

type DashboardPayPhase = "idle" | "processing" | "recording";

const DetailsSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-2">
    <h4 className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/55">{title}</h4>
    {children}
  </section>
);

export const CustomerFutureOrderV2Details = ({
  order,
  payment: subscribedPayment,
  onClose,
  paymentActions,
}: CustomerFutureOrderV2DetailsProps) => {
  const [localPayment, setLocalPayment] = useState<FutureOrderV2PaymentRecord | null>(null);
  const [payPhase, setPayPhase] = useState<DashboardPayPhase>("idle");
  const [payOutcome, setPayOutcome] = useState<
    Exclude<FutureOrderV2DashboardPaymentOutcome, { status: "paid" }> | null
  >(null);
  const [cardReady, setCardReady] = useState(false);
  const payInFlightRef = useRef(false);
  const payment = subscribedPayment ?? localPayment ?? undefined;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const candidate = order.masterOrder.cartItem.candidate;
  const styleByGarmentKey = new Map(
    candidate.occurrenceStyleSnapshots.map((snapshot) => [
      snapshot.occurrence.garmentKey,
      snapshot.sourceKind === "catalogue" ? snapshot.catalogue!.name : "Uploaded design",
    ]),
  );
  const garments = getFuturePaymentReviewGarments(candidate);
  const measurementGroups = getFuturePaymentReviewMeasurementGroups(candidate);
  const pricingRows = getFuturePaymentReviewPricingRows(candidate.pricing);
  const shipping = candidate.shipping.state;
  const customer = shipping.customerInformation;
  const address = customer.deliveryAddress;
  const isDelivery = shipping.fulfilmentMethod === "destination_delivery";
  const headingId = `customer-v2-order-details-${order.orderId}`;
  const totalCents = candidate.pricing.exactTotalCents;
  const payBusy = payPhase !== "idle";
  const canPay =
    Boolean(paymentActions) && totalCents !== null && !localPayment && (!payment || payBusy);
  const successPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!localPayment) return;
    successPanelRef.current?.focus();
    successPanelRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [localPayment]);

  const runPayment = async (
    pay: (actions: FutureOrderV2DashboardPaymentActions) => Promise<FutureOrderV2DashboardPaymentOutcome>,
  ) => {
    if (!paymentActions || payInFlightRef.current) return;
    payInFlightRef.current = true;
    setPayOutcome(null);
    setPayPhase("processing");
    try {
      const outcome = await pay({
        authorize: paymentActions.authorize,
        record: (input) => {
          setPayPhase("recording");
          return paymentActions.record(input);
        },
      });
      if (outcome.status === "paid") setLocalPayment(outcome.record);
      else setPayOutcome(outcome);
    } finally {
      payInFlightRef.current = false;
      setPayPhase("idle");
    }
  };
  const handlePay = () =>
    runPayment((actions) => payFutureOrderV2FromDashboard({ order, ...actions }));
  const handleRetrySaving = () => {
    if (payOutcome?.status !== "record_failed") return;
    const { paymentIntentId } = payOutcome;
    return runPayment((actions) =>
      retryFutureOrderV2DashboardRecord({
        orderId: order.orderId,
        paymentIntentId,
        record: actions.record,
      }),
    );
  };
  const payLabel =
    payPhase === "processing"
      ? "Processing payment..."
      : payPhase === "recording"
        ? "Confirming payment..."
        : `Pay ${formatFutureOrderV2PaidAmount(totalCents ?? 0)}`;
  const payStatusMessage =
    payPhase === "processing"
      ? "Processing your card payment..."
      : payPhase === "recording"
        ? "Payment received. Saving it to your order..."
        : payOutcome?.status === "record_failed"
          ? "Your card payment went through."
          : "Enter your card details and pay to complete your order.";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-heritage-ink/60 backdrop-blur-sm">
      <div data-customer-v2-order-dialog-frame className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          data-customer-v2-order-dialog={order.orderId}
          className="bg-white rounded-3xl max-w-2xl w-full border border-heritage-gold/20 shadow-2xl overflow-hidden"
        >
          <div className="bg-heritage-cream/60 px-6 py-4 border-b border-heritage-gold/15 flex justify-between items-center gap-3 print:hidden">
            <span className="flex items-center gap-1.5 text-heritage-green font-serif text-sm font-bold">
              <FileText size={16} className="text-heritage-gold" aria-hidden="true" />
              Order details
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
              >
                <Printer size={12} aria-hidden="true" /> Print / Save PDF
              </button>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close order details"
                data-customer-v2-order-dialog-close
                onClick={onClose}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 transition p-1.5 rounded-xl cursor-pointer"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6 text-left text-sm text-heritage-ink/80">
            <div className="flex flex-wrap justify-between items-start gap-3 border-b-2 border-heritage-green pb-4">
              <div className="min-w-0">
                <h3 id={headingId} className="font-serif text-xl font-bold text-heritage-green">
                  Order placed {formatCustomerOrderDate(order.persistedAt)}
                </h3>
                <p className="break-all font-mono text-[11px] text-heritage-ink/60">{order.orderId}</p>
              </div>
              {payment ? (
                <span className="px-2 py-1 rounded text-[10px] font-bold uppercase border bg-emerald-50 text-emerald-800 border-emerald-200">
                  Paid (test) {formatFutureOrderV2PaidAmount(payment.amountCents)}
                </span>
              ) : (
                <span className="px-2 py-1 rounded text-[10px] font-bold uppercase border bg-amber-50 text-amber-800 border-amber-200">
                  Awaiting payment
                </span>
              )}
            </div>

            <DetailsSection title="Garments">
              <ul className="space-y-3">
                {garments.map(({ garment, fabricAllocations, customDetails }) => (
                  <li
                    key={garment.garmentKey}
                    data-customer-v2-order-garment={garment.garmentKey}
                    className="rounded-xl border border-heritage-green/10 p-3"
                  >
                    <p className="font-serif font-bold text-heritage-green">{garment.label}</p>
                    <p className="text-xs">Style: {styleByGarmentKey.get(garment.garmentKey) || "Not recorded"}</p>
                    {fabricAllocations.map((allocation) => (
                      <p key={allocation.allocationId} className="text-xs">
                        Fabric: {allocation.fabricName}{" "}
                        <span className="font-mono text-heritage-ink/55">({allocation.fabricCode})</span>
                      </p>
                    ))}
                    {customDetails.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {customDetails.map((detail) => (
                          <li key={detail.occurrenceKey}>
                            {detail.selectionGroupTitle}: {detail.optionLabel}
                            {detail.personalizedText ? ` "${detail.personalizedText}"` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </DetailsSection>

            {measurementGroups.length > 0 && (
              <DetailsSection title="Measurements">
                <div className="space-y-3">
                  {measurementGroups.map((group) => (
                    <div key={`${group.garmentKey ?? "shared"}:${group.title}`}>
                      <p className="font-semibold text-heritage-green">{group.title}</p>
                      <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
                        {group.items.map((item) => (
                          <div key={item.measurementId} className="flex justify-between gap-2">
                            <dt>{item.label}</dt>
                            <dd className="font-mono font-semibold">
                              {item.displayValue} {item.unitLabel}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              </DetailsSection>
            )}

            <DetailsSection title="Delivery">
              <p className="font-semibold text-heritage-green">
                {shipping.fulfilmentMethod === "eindhoven_pickup"
                  ? "Pick Up in Eindhoven"
                  : isDelivery
                    ? "Deliver to an Address"
                    : "Delivery method pending"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <p className="font-semibold">{customer.fullName}</p>
                  <p>{customer.email}</p>
                  <p>{customer.phone}</p>
                </div>
                {isDelivery && (
                  <div data-customer-v2-order-address>
                    {[
                      address.addressLine1,
                      address.addressLine2,
                      [address.postalCode, address.city].filter(Boolean).join(" "),
                      address.stateRegion,
                      address.countryCode,
                    ]
                      .filter(Boolean)
                      .map((line, index) => (
                        <p key={index}>{line}</p>
                      ))}
                  </div>
                )}
              </div>
              {customer.comment && <p className="text-xs italic">Note: {customer.comment}</p>}
            </DetailsSection>

            <DetailsSection title="Price">
              <dl className="space-y-1">
                {pricingRows.map((row) =>
                  row.presentation === "supporting_note" ? (
                    <p key={row.id} className="text-xs text-heritage-ink/60">
                      {row.label}
                    </p>
                  ) : (
                    <div key={row.id} className="flex justify-between gap-3">
                      <dt>{row.label}</dt>
                      <dd className="font-mono">
                        {row.amountCents === null ? "Pending" : formatFutureOrderV2PaidAmount(row.amountCents)}
                      </dd>
                    </div>
                  ),
                )}
                {candidate.pricing.exactTotalCents !== null && (
                  <div className="flex justify-between gap-3 border-t border-heritage-green/15 pt-1 font-bold text-heritage-green">
                    <dt>Total</dt>
                    <dd className="font-mono">{formatFutureOrderV2PaidAmount(candidate.pricing.exactTotalCents)}</dd>
                  </div>
                )}
              </dl>
            </DetailsSection>

            <DetailsSection title="Payment">
              {localPayment ? (
                <div
                  ref={successPanelRef}
                  tabIndex={-1}
                  role="status"
                  data-customer-v2-order-pay-success
                  className="flex items-start gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <CheckCircle2 size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600" />
                  <div className="min-w-0 space-y-1">
                    <p className="font-serif text-lg font-bold">Payment successful</p>
                    <p className="text-sm">
                      {formatFutureOrderV2PaidAmount(localPayment.amountCents)} paid. Reference{" "}
                      <span className="break-all font-mono text-xs">{localPayment.paymentIntentId}</span>
                    </p>
                    <p className="text-xs text-emerald-800/80">Test payment: no real money was charged.</p>
                    <button
                      type="button"
                      data-customer-v2-order-pay-done
                      onClick={onClose}
                      className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-6 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-heritage-gold hover:text-heritage-forest print:hidden"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : payment ? (
                <div data-customer-v2-order-payment className="text-xs space-y-0.5">
                  <p className="font-semibold text-heritage-green">
                    Paid (test) {formatFutureOrderV2PaidAmount(payment.amountCents)} on{" "}
                    {formatCustomerOrderDate(payment.recordedAt)}
                  </p>
                  <p>
                    Payment reference: <span className="break-all font-mono">{payment.paymentIntentId}</span>
                  </p>
                  <p className="text-heritage-ink/60">Test payment: no real money was charged.</p>
                </div>
              ) : (
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold text-amber-800">Awaiting payment</p>
                  <p>Your order is saved but has not been paid yet.</p>
                </div>
              )}
              {canPay && (
                <div
                  data-customer-v2-order-pay-section
                  className="space-y-3 rounded-2xl bg-heritage-green p-4 text-white print:hidden"
                >
                  <p
                    id={`${headingId}-pay-status`}
                    role="status"
                    aria-atomic="true"
                    className="text-xs text-white/85"
                  >
                    {payStatusMessage}
                  </p>
                  {payOutcome?.status === "record_failed" ? (
                    <>
                      <FutureOrderV2PaymentAlert
                        title="Payment received, not saved yet"
                        message={payOutcome.message}
                      />
                        <button
                        type="button"
                        data-customer-v2-order-retry-record
                        disabled={payBusy}
                        aria-busy={payBusy}
                        aria-describedby={`${headingId}-pay-status`}
                        onClick={handleRetrySaving}
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-gold px-5 py-2 text-xs font-bold uppercase tracking-wider text-heritage-green disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        {payBusy ? "Saving..." : "Retry saving"}
                      </button>
                    </>
                  ) : (
                    <>
                      <FutureOrderV2StripeCard disabled={payBusy} onReadyChange={setCardReady} />
                      {payOutcome?.status === "failed" && !payBusy && (
                        <FutureOrderV2PaymentAlert message={payOutcome.message} />
                      )}
                      <button
                        type="button"
                        data-customer-v2-order-pay
                        disabled={!cardReady || payBusy}
                        aria-busy={payBusy}
                        aria-describedby={`${headingId}-pay-status`}
                        onClick={handlePay}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-gold px-5 py-2 text-xs font-bold uppercase tracking-wider text-heritage-green disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        <LockKeyhole size={14} aria-hidden="true" />
                        {payLabel}
                      </button>
                    </>
                  )}
                </div>
              )}
            </DetailsSection>
          </div>
        </div>
      </div>
    </div>
  );
};
