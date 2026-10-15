import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, FileText, LockKeyhole, Printer, X } from "lucide-react";
import { FutureOrderV2PaymentAlert } from "./FutureOrderV2PaymentAlert";
import { FutureOrderV2StripeCard } from "./FutureOrderV2StripeCard";
import type { PersistedFutureOrderV2 } from "../utils/futureOrderV2PersistenceContract";
import {
  payFutureOrderV2FromDashboard,
  payPersonalizedAdditionDifference,
  retryFutureOrderV2DashboardRecord,
  type FutureOrderV2DashboardPaymentActions,
  type FutureOrderV2DashboardPaymentOutcome,
} from "../utils/futureOrderV2DashboardPayment";
import type { FutureOrderV2WorkshopProgress } from "../utils/futureOrderV2WorkshopProgress";
import {
  presentWorkshopStageLines,
  workshopDispatchLabel,
} from "../utils/futureOrderV2WorkshopProgress";
import { WorkshopStageList } from "./WorkshopStageList";
import {
  futureOrderV2RedirectingMessage,
  futureOrderV2RedirectingPayLabel,
  getFuturePaymentReviewGarments,
  getFuturePaymentReviewMeasurementGroups,
  getFuturePaymentReviewPricingRows,
} from "../utils/designStudioFuturePaymentReview";
import type { FutureOrderV2PaymentMethod } from "../utils/futureOrderV2Payment";
import {
  formatCustomerOrderDate,
  formatFutureOrderV2PaidAmount,
  type FutureOrderV2PaymentRecord,
} from "../utils/futureOrderV2PaymentRecord";
import {
  formatPersonalizedPriceEuros,
  PERSONALIZED_BASE_PAYMENT_NOTICE,
  personalizedAdditionCustomerStatusLabel,
  presentPersonalizedAdditionLines,
  readAcceptedPersonalizedDifferenceCents,
  readFutureOrderV2ChargeableCents,
  type FutureOrderV2PersonalizedPriceRecord,
} from "../utils/futureOrderV2PersonalizedPrice";

interface CustomerFutureOrderV2DetailsProps {
  order: PersistedFutureOrderV2;
  payment: FutureOrderV2PaymentRecord | undefined;
  workshop?: FutureOrderV2WorkshopProgress;
  onClose: () => void;
  paymentActions?: FutureOrderV2DashboardPaymentActions;
  personalizedPrice?: FutureOrderV2PersonalizedPriceRecord | null;
  onDecidePersonalizedPrice?: (input: {
    orderId: string;
    occurrenceKey: string;
    decision: "accepted" | "declined";
  }) => Promise<
    | { readonly status: "updated"; readonly record: FutureOrderV2PersonalizedPriceRecord }
    | { readonly status: "failed"; readonly message: string }
  >;
  initialPayOutcome?: Exclude<
    FutureOrderV2DashboardPaymentOutcome,
    { status: "paid" } | { status: "redirecting" }
  > | null;
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
  workshop,
  onClose,
  paymentActions,
  personalizedPrice = null,
  onDecidePersonalizedPrice,
  initialPayOutcome = null,
}: CustomerFutureOrderV2DetailsProps) => {
  const [localPayment, setLocalPayment] = useState<FutureOrderV2PaymentRecord | null>(null);
  const [payPhase, setPayPhase] = useState<DashboardPayPhase>("idle");
  const [payOutcome, setPayOutcome] = useState<
    Exclude<FutureOrderV2DashboardPaymentOutcome, { status: "paid" } | { status: "redirecting" }> | null
  >(initialPayOutcome);
  const [paymentReady, setPaymentReady] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<FutureOrderV2PaymentMethod>("card");
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [localPrice, setLocalPrice] = useState<FutureOrderV2PersonalizedPriceRecord | null>(null);
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
  const [decidingKey, setDecidingKey] = useState<string | null>(null);
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
  const pricingRows = getFuturePaymentReviewPricingRows(candidate.pricing, {
    orderType: candidate.orderIdentity?.orderType ?? null,
    physicalGarmentCount: candidate.garments.length,
  });
  const shipping = candidate.shipping.state;
  const customer = shipping.customerInformation;
  const address = customer.deliveryAddress;
  const isDelivery = shipping.fulfilmentMethod === "destination_delivery";
  const headingId = `customer-v2-order-details-${order.orderId}`;
  const priceRecord = localPrice ?? personalizedPrice;
  const additionLines = presentPersonalizedAdditionLines(candidate, priceRecord);
  const payableCents = readFutureOrderV2ChargeableCents(candidate, priceRecord);
  const differenceCents = readAcceptedPersonalizedDifferenceCents(candidate, priceRecord);
  const payBusy = payPhase !== "idle";
  const canPay =
    Boolean(paymentActions) && payableCents !== null && !localPayment && (!payment || payBusy);
  const canPayDifference = Boolean(paymentActions) && differenceCents !== null;
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
      else if (outcome.status === "redirecting") setIsRedirecting(true);
      else setPayOutcome(outcome);
    } finally {
      payInFlightRef.current = false;
      setPayPhase("idle");
    }
  };
  const handlePay = () =>
    runPayment((actions) =>
      payFutureOrderV2FromDashboard({
        order,
        personalizedPrice: priceRecord,
        ...actions,
      }),
    );
  const handlePayDifference = async () => {
    if (!paymentActions || payInFlightRef.current || differenceCents === null) return;
    payInFlightRef.current = true;
    setPayOutcome(null);
    setPayPhase("processing");
    try {
      const outcome = await payPersonalizedAdditionDifference({
        order,
        personalizedPrice: priceRecord,
        authorize: paymentActions.authorize,
        record: (input) => {
          setPayPhase("recording");
          return paymentActions.record(input);
        },
      });
      if (outcome.status === "paid") {
        if (priceRecord) {
          setLocalPrice({
            ...priceRecord,
            additionPaidCents: (priceRecord.additionPaidCents ?? 0) + outcome.record.amountCents,
          });
        }
      } else if (outcome.status === "redirecting") setIsRedirecting(true);
      else setPayOutcome(outcome);
    } finally {
      payInFlightRef.current = false;
      setPayPhase("idle");
    }
  };
  const handleDecide = async (
    occurrenceKey: string,
    decision: "accepted" | "declined",
  ) => {
    if (!onDecidePersonalizedPrice || decidingKey) return;
    setDecidingKey(occurrenceKey);
    setDecisionMessage(null);
    try {
      const result = await onDecidePersonalizedPrice({
        orderId: order.orderId,
        occurrenceKey,
        decision,
      });
      if (result.status === "failed") setDecisionMessage(result.message);
      else setLocalPrice(result.record);
    } finally {
      setDecidingKey(null);
    }
  };
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
  const redirectingMessage = futureOrderV2RedirectingMessage(paymentMethod);
  const redirectingPayLabel = futureOrderV2RedirectingPayLabel(paymentMethod);
  const payLabel =
    payPhase === "processing"
      ? "Processing payment..."
      : payPhase === "recording"
        ? "Confirming payment..."
        : isRedirecting
          ? redirectingPayLabel
          : `Pay ${formatFutureOrderV2PaidAmount(payableCents ?? 0)}`;
  const payStatusMessage =
    payPhase === "processing"
      ? "Processing your payment..."
      : payPhase === "recording"
        ? "Payment received. Saving it to your order..."
        : payOutcome?.status === "record_failed"
          ? "Your payment went through."
          : isRedirecting
            ? redirectingMessage
            : canPay
              ? additionLines.length > 0
                ? PERSONALIZED_BASE_PAYMENT_NOTICE
                : "Choose Apple Pay, Google Pay, card, iDEAL, or Klarna and pay to complete your order."
              : "Pay only the accepted addition. Accepting did not charge you.";

  const dialog = (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-heritage-ink/60 backdrop-blur-sm">
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

            {workshop ? (
              <DetailsSection title="Production">
                <div className="text-xs">
                  <WorkshopStageList
                    orderId={order.orderId}
                    stageLines={presentWorkshopStageLines(workshop)}
                  />
                </div>
              </DetailsSection>
            ) : null}

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
              {shipping.fulfilmentMethod === "eindhoven_pickup" &&
                shipping.pickupLocation.trim() && (
                  <p data-customer-v2-order-pickup-location>
                    Pickup location: {shipping.pickupLocation.trim()}
                  </p>
                )}
              {workshop ? (
                <p data-customer-v2-order-dispatch={order.orderId}>
                  Dispatch: {workshopDispatchLabel(workshop.dispatchStatus)}
                </p>
              ) : null}
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
                  ) : row.presentation === "included" ? (
                    <div
                      key={row.id}
                      data-pricing-row={row.id}
                      className="flex justify-between gap-3"
                    >
                      <dt>{row.label}</dt>
                      <dd className="font-mono">
                        {row.amountCents === null
                          ? "Pending"
                          : formatFutureOrderV2PaidAmount(row.amountCents)}
                      </dd>
                    </div>
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
                {candidate.pricing.exactTotalCents === null && payableCents !== null && (
                  <div className="flex justify-between gap-3 border-t border-heritage-green/15 pt-1 font-bold text-heritage-green">
                    <dt>Base total</dt>
                    <dd className="font-mono">{formatFutureOrderV2PaidAmount(payableCents)}</dd>
                  </div>
                )}
              </dl>
            </DetailsSection>

            {additionLines.length > 0 && (
              <DetailsSection title="Personalized addition">
                <p className="text-xs leading-relaxed text-heritage-ink/75">
                  {PERSONALIZED_BASE_PAYMENT_NOTICE}
                </p>
                <ul className="space-y-3">
                  {additionLines.map((line) => (
                    <li
                      key={line.occurrenceKey}
                      data-personalized-addition={line.occurrenceKey}
                      className="rounded-xl border border-heritage-gold/20 p-3 text-xs"
                    >
                      <p className="font-semibold text-heritage-green">What you asked for</p>
                      <p className="mt-1">{line.requirementText}</p>
                      {line.status === "evaluation_pending" && (
                        <p className="mt-2 text-amber-800">
                          {personalizedAdditionCustomerStatusLabel(line.status)}. We review this after your order and contact you by email or WhatsApp.
                        </p>
                      )}
                      {line.status === "price_ready" && line.amountCents !== null && (
                        <>
                          <p className="mt-2 font-semibold text-heritage-green">
                            {personalizedAdditionCustomerStatusLabel(line.status)}
                          </p>
                          <p className="mt-1 font-semibold">
                            Evaluated price: {formatPersonalizedPriceEuros(line.amountCents)}
                          </p>
                          {line.tailorNote ? <p className="mt-1">Tailor note: {line.tailorNote}</p> : null}
                          <p className="mt-2 text-heritage-ink/70">
                            You pay this extra only if you accept. Accepting does not charge you.
                            If you do not reply, we follow up once after a few days, then leave the addition off.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                            <button
                              type="button"
                              data-personalized-addition-accept={line.occurrenceKey}
                              disabled={!onDecidePersonalizedPrice || decidingKey !== null}
                              onClick={() => handleDecide(line.occurrenceKey, "accepted")}
                              className="rounded-lg bg-heritage-green px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
                            >
                              {decidingKey === line.occurrenceKey ? "Saving..." : "Accept"}
                            </button>
                            <button
                              type="button"
                              data-personalized-addition-decline={line.occurrenceKey}
                              disabled={!onDecidePersonalizedPrice || decidingKey !== null}
                              onClick={() => handleDecide(line.occurrenceKey, "declined")}
                              className="rounded-lg border border-heritage-green/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-heritage-green disabled:opacity-50"
                            >
                              Decline addition
                            </button>
                          </div>
                        </>
                      )}
                      {line.status === "accepted" && line.amountCents !== null && (
                        <p className="mt-2 text-heritage-green">
                          {personalizedAdditionCustomerStatusLabel(line.status)}{" "}
                          {formatPersonalizedPriceEuros(line.amountCents)}.
                          {differenceCents !== null
                            ? " Pay the difference for this addition when you are ready. You have not been charged for it."
                            : " This addition is paid."}
                        </p>
                      )}
                      {line.status === "declined" && (
                        <p className="mt-2 text-heritage-ink/70">
                          {personalizedAdditionCustomerStatusLabel(line.status)}. This addition is left off. Your base garment stays.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {decisionMessage && <p className="text-xs text-red-700">{decisionMessage}</p>}
              </DetailsSection>
            )}

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
              {(canPay || canPayDifference) && (
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
                      <FutureOrderV2StripeCard
                        disabled={payBusy || isRedirecting}
                        orderId={order.orderId}
                        returnSurface="dashboard"
                        amountCents={canPay ? payableCents ?? 0 : differenceCents ?? 0}
                        onExpressCheckoutConfirm={canPay ? handlePay : handlePayDifference}
                        onReadyChange={setPaymentReady}
                        onMethodChange={setPaymentMethod}
                        shippingState={shipping}
                      />
                      {payOutcome?.status === "failed" && !payBusy && (
                        <FutureOrderV2PaymentAlert message={payOutcome.message} />
                      )}
                      {isRedirecting ? (
                        <>
                          <p
                            data-customer-v2-order-redirecting={paymentMethod}
                            {...(paymentMethod === "klarna"
                              ? { "data-customer-v2-order-klarna-redirecting": true }
                              : { "data-customer-v2-order-ideal-redirecting": true })}
                            className="text-sm leading-relaxed text-heritage-ink/80"
                          >
                            {redirectingMessage}
                          </p>
                          <button
                            type="button"
                            data-customer-v2-order-pay
                            data-customer-v2-order-redirecting-pay={paymentMethod}
                            disabled
                            aria-busy="true"
                            aria-describedby={`${headingId}-pay-status`}
                            className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-heritage-gold px-5 py-2 text-xs font-bold uppercase tracking-wider text-heritage-green opacity-60 sm:w-auto"
                          >
                            <LockKeyhole size={14} aria-hidden="true" />
                            {redirectingPayLabel}
                          </button>
                        </>
                      ) : (
                        <>
                          {canPay ? (
                            <button
                              type="button"
                              data-customer-v2-order-pay
                              disabled={!paymentReady || payBusy}
                              aria-busy={payBusy}
                              aria-describedby={`${headingId}-pay-status`}
                              onClick={handlePay}
                              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-gold px-5 py-2 text-xs font-bold uppercase tracking-wider text-heritage-green disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                            >
                              <LockKeyhole size={14} aria-hidden="true" />
                              {payLabel}
                            </button>
                          ) : null}
                          {canPayDifference ? (
                            <button
                              type="button"
                              data-customer-v2-order-pay-difference
                              disabled={!paymentReady || payBusy}
                              aria-busy={payBusy}
                              onClick={handlePayDifference}
                              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-2 text-xs font-bold uppercase tracking-wider text-heritage-green disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                            >
                              {payBusy
                                ? "Processing payment..."
                                : `Pay the difference ${formatFutureOrderV2PaidAmount(differenceCents ?? 0)}`}
                            </button>
                          ) : null}
                        </>
                      )}
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
  if (typeof document !== "undefined" && document.body) {
    return createPortal(dialog, document.body);
  }
  return dialog;
};
