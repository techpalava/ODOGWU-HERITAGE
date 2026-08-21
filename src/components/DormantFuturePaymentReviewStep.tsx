import {
  AlertTriangle,
  CheckCircle2,
  LockKeyhole,
  Pencil,
  Ruler,
  Shirt,
  Sparkles,
  Truck,
} from "lucide-react";
import { DesignStudioBackButton } from "./DesignStudioBackButton";
import type React from "react";
import type { DesignStudioStageId } from "../types";
import {
  type FutureOrderCandidateBuildResult,
  type FutureOrderCandidateV1,
} from "../utils/futureOrderCandidate";
import {
  FUTURE_ORDER_NOT_SUBMITTED_MESSAGE,
  FUTURE_PAYMENT_UNAVAILABLE_MESSAGE,
  getFuturePaymentReviewAiStatusLabel,
  getFuturePaymentReviewContentBlockers,
  getFuturePaymentReviewContentStatusLabel,
  getFuturePaymentReviewEditLabel,
  getFuturePaymentReviewEditStage,
  getFuturePaymentReviewGarments,
  getFuturePaymentReviewMeasurementGroups,
  getFuturePaymentReviewPricingRows,
  getFuturePaymentReviewShippingStatusLabel,
  isFuturePaymentReviewStageUnlocked,
} from "../utils/designStudioFuturePaymentReview";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import {
  formatCustomerFacingFabricCapacityAmount,
  formatCustomerFacingFabricCapacityNoun,
} from "../config/StyleFabricCapacityConfig";

interface DormantFuturePaymentReviewStepProps {
  result: FutureOrderCandidateBuildResult;
  onBack: () => void;
  onEditStage: (stage: Exclude<DesignStudioStageId, "payment">) => void;
}

const moneyFromCents = (amountCents: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${(amountCents / 100).toFixed(2)}`;

const PendingAmount = () => (
  <span className="font-sans text-xs font-semibold text-heritage-ink/55">
    Pending
  </span>
);

const EditButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-heritage-green/20 px-3 text-[10px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:w-auto"
  >
    <Pencil aria-hidden="true" size={13} />
    {label}
  </button>
);

const ReviewSection = ({
  title,
  description,
  editLabel,
  onEdit,
  children,
}: {
  title: string;
  description?: string;
  editLabel?: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) => (
  <section className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6">
    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <h3 className="break-words font-serif text-lg font-bold text-heritage-green">
          {title}
        </h3>
        {description && (
          <p className="mt-1 break-words text-xs leading-relaxed text-heritage-ink/60">
            {description}
          </p>
        )}
      </div>
      {editLabel && onEdit && <EditButton label={editLabel} onClick={onEdit} />}
    </div>
    <div className="mt-4 min-w-0">{children}</div>
  </section>
);

const CandidateAttention = ({
  result,
  onEditStage,
}: {
  result: FutureOrderCandidateBuildResult;
  onEditStage: DormantFuturePaymentReviewStepProps["onEditStage"];
}) => {
  const blockers = getFuturePaymentReviewContentBlockers(result);
  if (blockers.length === 0) return null;
  const firstBlocker = blockers[0];
  const editStage = getFuturePaymentReviewEditStage(firstBlocker);
  return (
    <section
      aria-labelledby="future-order-attention-title"
      className="min-w-0 rounded-2xl border border-heritage-gold/35 bg-heritage-gold/8 p-5 sm:p-6"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-heritage-gold"
          size={20}
        />
        <div className="min-w-0 flex-1">
          <h2
            id="future-order-attention-title"
            className="font-serif text-xl font-bold text-heritage-green"
          >
            Your order needs attention
          </h2>
          <p className="mt-1 break-words text-sm leading-relaxed text-heritage-ink/70">
            {firstBlocker.message}
          </p>
          {editStage && (
            <div className="mt-3">
              <EditButton
                label={getFuturePaymentReviewEditLabel(editStage)}
                onClick={() => onEditStage(editStage)}
              />
            </div>
          )}
          {blockers.length > 1 && (
            <ul className="mt-4 space-y-2 border-t border-heritage-gold/20 pt-4 text-sm text-heritage-ink/65">
              {blockers.slice(1).map((blocker) => (
                <li
                  key={`${blocker.stage}:${blocker.code}:${blocker.garmentKey || ""}:${blocker.allocationId || ""}`}
                  className="break-words"
                >
                  {blocker.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

const GarmentReview = ({
  candidate,
  onEditStage,
}: {
  candidate: FutureOrderCandidateV1;
  onEditStage: DormantFuturePaymentReviewStepProps["onEditStage"];
}) => {
  const garments = getFuturePaymentReviewGarments(candidate);
  return (
    <ReviewSection
      title="Garments"
      description="Each physical garment keeps its own construction, fabric assignment, and Custom Details."
      editLabel="Edit Garments"
      onEdit={() => onEditStage("garment_type")}
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {garments.map(({ garment, fabricAllocations, customDetails }) => (
          <article
            key={garment.garmentKey}
            className="min-w-0 rounded-2xl border border-heritage-green/15 bg-heritage-cream/20 p-4 sm:p-5"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Shirt aria-hidden="true" className="shrink-0 text-heritage-gold" size={18} />
              <h4 className="min-w-0 break-words font-serif text-lg font-bold text-heritage-green">
                {garment.label}
              </h4>
              <span className="shrink-0 rounded-full border border-heritage-gold/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-heritage-gold">
                {garment.role}
              </span>
            </div>
            {garment.physicalComponents.length > 1 && (
              <div className="mt-3 rounded-xl bg-white/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/55">
                  Garment components
                </p>
                <ul className="mt-2 space-y-1 text-sm text-heritage-ink/70">
                  {garment.physicalComponents.map((component) => (
                    <li key={component.garmentKey} className="break-words">
                      {component.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/55">
                Construction
              </p>
              <dl className="mt-2 space-y-2 text-sm">
                {garment.construction.map((component) => (
                  <div
                    key={component.componentKey}
                    className="flex min-w-0 flex-wrap justify-between gap-2"
                  >
                    <dt className="min-w-0 break-words text-heritage-ink/70">
                      {component.label}
                    </dt>
                    <dd className="min-w-0 max-w-full break-words text-right font-mono font-bold text-heritage-green">
                      {moneyFromCents(component.priceCents)}
                    </dd>
                  </div>
                ))}
                <div className="flex min-w-0 flex-wrap justify-between gap-2 border-t border-heritage-green/10 pt-2">
                  <dt className="font-bold text-heritage-green">Construction total</dt>
                  <dd className="min-w-0 max-w-full break-words text-right font-mono font-bold text-heritage-green">
                    {garment.constructionTotalCents === null ? (
                      <PendingAmount />
                    ) : (
                      moneyFromCents(garment.constructionTotalCents)
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-4 rounded-xl border border-heritage-gold/15 bg-white p-3">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/55">
                    Assigned fabric
                  </p>
                  {fabricAllocations.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {fabricAllocations.map((allocation) => (
                        <li key={allocation.allocationId} className="min-w-0">
                          <p className="break-words text-sm font-bold text-heritage-green">
                            {allocation.fabricName}
                          </p>
                          <p className="break-words font-mono text-xs text-heritage-ink/55">
                            {allocation.fabricCode} | Quantity 1 | {formatCustomerFacingFabricCapacityAmount(allocation.capacityUnits)} capacity {formatCustomerFacingFabricCapacityNoun(allocation.capacityUnits)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-heritage-ink/60">Fabric assignment pending.</p>
                  )}
                </div>
                <EditButton
                  label={`Edit ${garment.label} fabric`}
                  onClick={() => onEditStage("fabric")}
                />
              </div>
            </div>

            <div className="mt-4 min-w-0">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/55">
                  Custom Details
                </p>
                <EditButton
                  label={`Edit ${garment.label} Custom Details`}
                  onClick={() => onEditStage("custom_details")}
                />
              </div>
              {customDetails.length === 0 ? (
                <p className="mt-2 text-sm text-heritage-ink/60">No optional details selected.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {customDetails.map((detail) => (
                    <li
                      key={detail.occurrenceKey}
                      className="min-w-0 rounded-xl bg-white/80 p-3"
                    >
                      <div className="flex min-w-0 flex-wrap justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-bold text-heritage-green">
                            {detail.optionLabel}
                          </p>
                          <p className="mt-0.5 break-words text-xs text-heritage-ink/55">
                            {detail.selectionGroupTitle}
                          </p>
                        </div>
                        <span className="min-w-0 max-w-full break-words text-right font-mono text-sm font-bold text-heritage-green">
                          {detail.priceStatus === "evaluation_required" ? (
                            <span className="font-sans text-xs text-heritage-gold">
                              Price requires evaluation.
                            </span>
                          ) : detail.priceCents === null ? (
                            <PendingAmount />
                          ) : (
                            moneyFromCents(detail.priceCents)
                          )}
                        </span>
                      </div>
                      {detail.personalizedText && (
                        <div className="mt-2 rounded-lg border border-heritage-gold/15 bg-heritage-cream/30 p-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/50">
                            Personalized requirement
                          </p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-heritage-ink/70">
                            {detail.personalizedText}
                          </p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>
    </ReviewSection>
  );
};

export const DormantFuturePaymentReviewStep = ({
  result,
  onBack,
  onEditStage,
}: DormantFuturePaymentReviewStepProps) => {
  const candidate = result.candidate;
  const isReviewable = isFuturePaymentReviewStageUnlocked(result);
  const measurementGroups = candidate
    ? getFuturePaymentReviewMeasurementGroups(candidate)
    : [];
  const pricingRows = candidate
    ? getFuturePaymentReviewPricingRows(candidate.pricing)
    : [];
  const shippingCustomer = candidate?.shipping.state.customerInformation;
  const shippingAddress = shippingCustomer?.deliveryAddress;
  const garmentLabelByKey = new Map(
    candidate?.garments.map((garment) => [garment.garmentKey, garment.label]) ||
      [],
  );
  const isDelivery =
    candidate?.shipping.state.fulfilmentMethod === "destination_delivery";

  return (
    <main
      aria-labelledby="future-payment-review-title"
      data-stage-id="payment"
      data-candidate-status={result.status}
      className="mx-auto max-w-6xl space-y-5 font-sans"
    >
      <header className="min-w-0 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <DesignStudioBackButton
          destination="Shipping"
          onClick={onBack}
          className="mb-5"
        />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
            Step 9 of 9
          </p>
          <span className="rounded-full border border-heritage-green/15 bg-heritage-green/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-heritage-green">
            1 Design
          </span>
        </div>
        <h1
          id="future-payment-review-title"
          className="mt-2 break-words font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
        >
          Order Review &amp; Payment
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
          Review your selections and totals before payment.
        </p>
      </header>

      <div
        role="status"
        aria-live="polite"
        className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${
          isReviewable
            ? "border-heritage-green/20 bg-heritage-green/5"
            : "border-heritage-gold/35 bg-heritage-gold/8"
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {isReviewable ? (
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-green"
              size={20}
            />
          ) : (
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-gold"
              size={20}
            />
          )}
          <div className="min-w-0">
            <h2 className="font-serif text-lg font-bold text-heritage-green">
              {isReviewable ? "Your order review is ready" : "Review is currently locked"}
            </h2>
            <p className="mt-1 break-words text-sm leading-relaxed text-heritage-ink/70">
              {isReviewable
                ? "Your selections and authoritative total are ready to review."
                : "Complete the highlighted requirement before opening this stage through normal navigation."}
            </p>
          </div>
        </div>
      </div>

      <CandidateAttention result={result} onEditStage={onEditStage} />

      {candidate && (
        <>
          <ReviewSection
            title="Your Order"
            description="One active future Design Studio configuration."
            editLabel="Edit Design Style"
            onEdit={() => onEditStage("design_style")}
          >
            {candidate.design ? (
              <div className="grid min-w-0 gap-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center">
                <div className="aspect-[4/5] overflow-hidden rounded-xl bg-heritage-cream/35">
                  {candidate.design.image ? (
                    <img
                      src={candidate.design.image}
                      alt={`${candidate.design.name} design`}
                      className="h-full w-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center p-3 text-center text-xs text-heritage-ink/45">
                      Design image unavailable
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
                    Design Style
                  </p>
                  <h2 className="mt-1 break-words font-serif text-xl font-bold text-heritage-green">
                    {candidate.design.name}
                  </h2>
                  <p className="mt-1 break-words text-sm text-heritage-ink/70">
                    {candidate.design.compositionLabel}
                  </p>
                  <p className="mt-2 text-xs capitalize text-heritage-ink/55">
                    For: {candidate.design.demographic}
                  </p>
                  <p className="mt-1 break-words font-mono text-xs text-heritage-ink/50">
                    Catalog style: {candidate.source.styleId}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-heritage-green">
                    Status: {getFuturePaymentReviewContentStatusLabel(candidate)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-heritage-ink/65">Design Style needs review.</p>
            )}
          </ReviewSection>

          <GarmentReview candidate={candidate} onEditStage={onEditStage} />

          <ReviewSection
            title="Fabric selections"
            description="Each authoritative fabric allocation appears once."
            editLabel="Edit Fabrics"
            onEdit={() => onEditStage("fabric")}
          >
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              {candidate.fabricAllocations.map((allocation, index) => (
                <article
                  key={allocation.allocationId}
                  className="min-w-0 rounded-xl border border-heritage-green/12 bg-heritage-cream/20 p-4"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
                    Fabric Selection {index + 1}
                  </p>
                  <h4 className="mt-1 break-words font-bold text-heritage-green">
                    {allocation.fabricName}
                  </h4>
                  <p className="mt-1 break-words font-mono text-xs text-heritage-ink/55">
                    {allocation.fabricCode}
                  </p>
                  <p className="mt-2 break-words text-xs text-heritage-ink/65">
                    Assigned to: {allocation.garmentAssignments.map(
                      (assignment) =>
                        garmentLabelByKey.get(assignment.garmentKey) ||
                        "Garment",
                    ).join(", ")}
                  </p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex min-w-0 flex-wrap justify-between gap-2">
                      <dt>Quantity</dt>
                      <dd className="font-bold">1</dd>
                    </div>
                    <div className="flex min-w-0 flex-wrap justify-between gap-2">
                      <dt>Capacity</dt>
                      <dd className="font-bold">
                        {formatCustomerFacingFabricCapacityAmount(allocation.capacityUnits)} {formatCustomerFacingFabricCapacityNoun(allocation.capacityUnits)}
                      </dd>
                    </div>
                    <div className="flex min-w-0 flex-wrap justify-between gap-2">
                      <dt>Material price</dt>
                      <dd className="min-w-0 max-w-full break-words text-right font-mono font-bold text-heritage-green">
                        {allocation.materialPriceCents === null ? (
                          <PendingAmount />
                        ) : (
                          moneyFromCents(allocation.materialPriceCents)
                        )}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs font-semibold capitalize text-heritage-ink/60">
                    Availability: {allocation.availability}
                  </p>
                </article>
              ))}
            </div>
          </ReviewSection>

          <ReviewSection
            title="AI Try-on"
            description="Only the safe workflow status is shown."
            editLabel="Edit AI Try-on"
            onEdit={() => onEditStage("try_on")}
          >
            <div className="flex min-w-0 items-start gap-3 rounded-xl bg-heritage-cream/20 p-4">
              <Sparkles aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-gold" size={19} />
              <div className="min-w-0">
                <p className="font-bold text-heritage-green">
                  {getFuturePaymentReviewAiStatusLabel(candidate)}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">
                  Your AI Try-on choice is recorded for this design.
                </p>
              </div>
            </div>
          </ReviewSection>

          <ReviewSection
            title="Measurements"
            description="Shared and garment-specific measurements use your preferred display unit."
            editLabel="Edit Measurements"
            onEdit={() => onEditStage("measurement")}
          >
            <div className="flex min-w-0 items-start gap-3 rounded-xl bg-heritage-cream/20 p-4">
              <Ruler aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-gold" size={19} />
              <div className="min-w-0">
                <p className="font-bold capitalize text-heritage-green">
                  {candidate.measurements.route.replace("_", " ")} route
                </p>
                <p className="mt-1 text-xs text-heritage-ink/60">
                  Status: {candidate.measurements.calculationStatus.replaceAll("_", " ")}
                </p>
              </div>
            </div>
            {measurementGroups.length === 0 ? (
              <p className="mt-3 text-sm text-heritage-ink/60">
                Measurement values are pending.
              </p>
            ) : (
              <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
                {measurementGroups.map((group) => (
                  <article
                    key={group.garmentKey || "shared"}
                    className="min-w-0 rounded-xl border border-heritage-green/12 p-4"
                  >
                    <h4 className="break-words font-bold text-heritage-green">
                      {group.title}
                    </h4>
                    <dl className="mt-3 space-y-2 text-sm">
                      {group.items.map((item) => (
                        <div
                          key={item.measurementId}
                          className="flex min-w-0 flex-wrap justify-between gap-2"
                        >
                          <dt className="min-w-0 break-words text-heritage-ink/70">
                            {item.label}
                            <span className="ml-1 text-[10px] text-heritage-ink/45">
                              ({item.provenanceLabel})
                            </span>
                          </dt>
                          <dd className="min-w-0 max-w-full break-words text-right font-mono font-bold text-heritage-green">
                            {item.displayValue} {item.unitLabel}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </ReviewSection>

          <ReviewSection
            title="Shipping"
            description="Contact and destination details are kept within this dedicated review section."
            editLabel="Edit Shipping"
            onEdit={() => onEditStage("shipping")}
          >
            <div className="flex min-w-0 items-start gap-3 rounded-xl bg-heritage-green/5 p-4">
              <Truck aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-green" size={19} />
              <div className="min-w-0">
                <p className="break-words font-bold text-heritage-green">
                  {candidate.shipping.state.fulfilmentMethod === "eindhoven_pickup"
                    ? "Collect in Eindhoven"
                    : candidate.shipping.state.fulfilmentMethod === "destination_delivery"
                      ? "Delivery to destination"
                      : "Shipping method pending"}
                </p>
                <p className="mt-1 break-words text-xs text-heritage-ink/60">
                  {getFuturePaymentReviewShippingStatusLabel(candidate)}
                </p>
              </div>
            </div>
            {shippingCustomer && (
              <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                <div className="min-w-0 rounded-xl border border-heritage-green/10 p-3">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/50">Contact</dt>
                  <dd className="mt-1 break-words font-semibold text-heritage-green">{shippingCustomer.fullName || "Pending"}</dd>
                  <dd className="break-words text-heritage-ink/65">{shippingCustomer.email || "Email pending"}</dd>
                  <dd className="break-words text-heritage-ink/65">{shippingCustomer.phone || "Phone pending"}</dd>
                </div>
                <div className="min-w-0 rounded-xl border border-heritage-green/10 p-3">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/50">Destination</dt>
                  <dd className="mt-1 break-words text-heritage-ink/70">
                    {isDelivery
                      ? [
                          shippingAddress?.addressLine1,
                          shippingAddress?.addressLine2,
                          shippingAddress?.city,
                          shippingAddress?.postalCode,
                          shippingAddress?.countryCode,
                        ].filter(Boolean).join(", ") || "Address pending"
                      : candidate.shipping.destinationLabel || "Eindhoven pickup"}
                  </dd>
                </div>
              </dl>
            )}
            {shippingCustomer?.comment && (
              <div className="mt-3 min-w-0 rounded-xl border border-heritage-gold/15 bg-heritage-cream/20 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/50">Comment</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-heritage-ink/70">
                  {shippingCustomer.comment}
                </p>
              </div>
            )}
            <p className="mt-4 break-words text-sm font-semibold text-heritage-green">
              Lagos-to-Eindhoven shipping: Included in Garment Construction.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-heritage-ink/60">
              {candidate.pricing.postEindhovenAdjustmentCents === null
                ? "The post-Eindhoven adjustment is pending confirmation."
                : "The authoritative post-Eindhoven adjustment is itemized once in the price breakdown below."}
            </p>
          </ReviewSection>

          <ReviewSection title="Price breakdown">
            <dl className="space-y-3 text-sm">
              {pricingRows.map((row) => (
                <div
                  key={row.id}
                  data-pricing-row={row.id}
                  className="flex min-w-0 flex-wrap justify-between gap-2"
                >
                  <dt className="min-w-0 break-words text-heritage-ink/70">{row.label}</dt>
                  <dd className="min-w-0 max-w-full break-words text-right font-mono font-bold text-heritage-green">
                    {row.valueLabel ? (
                      row.valueLabel
                    ) : row.amountCents === null ? (
                      <PendingAmount />
                    ) : (
                      moneyFromCents(row.amountCents)
                    )}
                  </dd>
                </div>
              ))}
              <div className="flex min-w-0 flex-wrap justify-between gap-2 border-t border-heritage-green/15 pt-4 text-base">
                <dt className="font-bold text-heritage-green">Exact total</dt>
                <dd className="min-w-0 max-w-full break-words text-right font-mono text-lg font-bold text-heritage-green">
                  {candidate.pricing.status === "exact" &&
                  candidate.pricing.exactTotalCents !== null ? (
                    moneyFromCents(candidate.pricing.exactTotalCents)
                  ) : (
                    "Available after all prices are confirmed"
                  )}
                </dd>
              </div>
            </dl>
          </ReviewSection>
        </>
      )}

      <section
        aria-labelledby="future-payment-unavailable-title"
        className="min-w-0 rounded-2xl border border-heritage-gold/30 bg-heritage-green p-5 text-white shadow-sm sm:p-6"
      >
        <div className="flex min-w-0 items-start gap-3">
          <LockKeyhole aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-gold" size={20} />
          <div className="min-w-0 flex-1">
            <h2
              id="future-payment-unavailable-title"
              className="font-serif text-xl font-bold"
            >
              {FUTURE_PAYMENT_UNAVAILABLE_MESSAGE}
            </h2>
            <p id="future-payment-pending-explanation" className="mt-2 break-words text-sm leading-relaxed text-white/80">
              {FUTURE_ORDER_NOT_SUBMITTED_MESSAGE}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/65">
              Authentication and a verified payment provider will be required before real payment can begin.
            </p>
            <button
              type="button"
              disabled
              aria-describedby="future-payment-unavailable-title future-payment-pending-explanation"
              className="mt-4 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-white/20 px-5 text-xs font-bold uppercase tracking-wider text-white sm:w-auto"
            >
              <LockKeyhole aria-hidden="true" size={14} />
              Payment integration pending
            </button>
          </div>
        </div>
      </section>

      <footer className="rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
        <DesignStudioBackButton
          destination="Shipping"
          onClick={onBack}
          className="w-full sm:w-auto"
        />
      </footer>
    </main>
  );
};
