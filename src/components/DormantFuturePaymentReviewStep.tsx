import {
  AlertTriangle,
  CheckCircle2,
  LockKeyhole,
  Pencil,
  Ruler,
  Shirt,
  Sparkles,
  Trash2,
  Truck,
} from "lucide-react";
import { DesignStudioBackButton } from "./DesignStudioBackButton";
import type React from "react";
import type { DesignStudioStageId } from "../types";
import {
  type FutureOrderCandidateV2,
} from "../utils/futureOrderCandidate";
import {
  FUTURE_ORDER_NOT_SUBMITTED_MESSAGE,
  FUTURE_PAYMENT_UNAVAILABLE_MESSAGE,
  FUTURE_ORDER_V2_PAYMENT_ACTIVATION_PENDING_MESSAGE,
  FUTURE_ORDER_V2_PERSISTENCE_PENDING_MESSAGE,
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
  type FuturePaymentReviewCandidate,
  type FuturePaymentReviewResult,
  type FutureOrderV2PreparationPresentation,
} from "../utils/designStudioFuturePaymentReview";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import {
  formatCustomerFacingFabricCapacityAmount,
  formatCustomerFacingFabricCapacityNoun,
} from "../config/StyleFabricCapacityConfig";
import type { FutureDesignStudioSummary } from "../utils/designStudioFutureSummary";
import type { FutureGarmentRemovalTarget } from "./FutureGarmentRemovalConfirmationDialog";

interface DormantFuturePaymentReviewStepProps {
  result: FuturePaymentReviewResult;
  onBack: () => void;
  onEditStage: (stage: Exclude<DesignStudioStageId, "payment">) => void;
  survivorSummary?: FutureDesignStudioSummary | null;
  removalTargets?: readonly FutureGarmentRemovalTarget[];
  onRequestGarmentRemoval?: (
    target: FutureGarmentRemovalTarget,
    trigger: HTMLButtonElement,
  ) => void;
  onPrepareOrder?: () => void;
}

const moneyFromCents = (amountCents: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${(amountCents / 100).toFixed(2)}`;

const PendingAmount = () => (
  <span className="font-sans text-xs font-semibold text-heritage-ink/55">
    Pending
  </span>
);

const isV2PaymentReviewCandidate = (
  candidate: FuturePaymentReviewCandidate | null,
): candidate is FutureOrderCandidateV2 => candidate?.schemaVersion === 2;

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

const GarmentRemovalAction = ({
  target,
  originStage,
  reasonId,
  onRequest,
}: {
  target: FutureGarmentRemovalTarget;
  originStage: "payment";
  reasonId: string;
  onRequest?: DormantFuturePaymentReviewStepProps["onRequestGarmentRemoval"];
}) => (
  <div className="min-w-0 sm:text-right">
    <button
      type="button"
      disabled={!target.canRequestRemoval}
      aria-label={target.accessibleName}
      aria-describedby={target.disabledReason ? reasonId : undefined}
      data-garment-removal-button={target.garmentKey}
      data-garment-removal-origin-stage={originStage}
      onClick={(event) => {
        event.stopPropagation();
        onRequest?.(target, event.currentTarget);
      }}
      className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
    >
      <Trash2 aria-hidden="true" size={15} />
      Remove
    </button>
    {target.disabledReason && (
      <p
        id={reasonId}
        className="mt-2 break-words text-left text-xs leading-relaxed text-heritage-ink/65 sm:max-w-56 sm:text-right"
      >
        {target.disabledReason}
      </p>
    )}
  </div>
);

const ReviewSection = ({
  title,
  description,
  editLabel,
  onEdit,
  removalHeadingMarker,
  children,
}: {
  title: string;
  description?: string;
  editLabel?: string;
  onEdit?: () => void;
  removalHeadingMarker?: string;
  children: React.ReactNode;
}) => (
  <section className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6">
    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <h3
          tabIndex={removalHeadingMarker ? -1 : undefined}
          data-garment-removal-list-heading={removalHeadingMarker}
          className="break-words font-serif text-lg font-bold text-heritage-green outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
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
  result: FuturePaymentReviewResult;
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
  removalTargets,
  onRequestGarmentRemoval,
}: {
  candidate: FuturePaymentReviewCandidate;
  onEditStage: DormantFuturePaymentReviewStepProps["onEditStage"];
  removalTargets: readonly FutureGarmentRemovalTarget[];
  onRequestGarmentRemoval?: DormantFuturePaymentReviewStepProps["onRequestGarmentRemoval"];
}) => {
  const garments = getFuturePaymentReviewGarments(candidate);
  return (
    <ReviewSection
      title="Garments"
      description="Each physical garment keeps its own construction, fabric assignment, and Custom Details."
      editLabel="Edit Garments"
      onEdit={() => onEditStage("garment_type")}
      removalHeadingMarker="payment"
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {garments.map(({ garment, fabricAllocations, customDetails }, index) => {
          const removalTarget = removalTargets.find(
            (target) => target.garmentKey === garment.garmentKey,
          );
          const reasonId = `payment-removal-reason-${index}`;
          return (
            <article
              key={garment.garmentKey}
              className="min-w-0 rounded-2xl border border-heritage-green/15 bg-heritage-cream/20 p-4 sm:p-5"
              data-garment-removal-row={garment.garmentKey}
            >
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Shirt aria-hidden="true" className="shrink-0 text-heritage-gold" size={18} />
                  <h4
                    tabIndex={-1}
                    data-garment-removal-row-heading={garment.garmentKey}
                    className="min-w-0 break-words font-serif text-lg font-bold text-heritage-green outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                  >
                    {garment.label}
                  </h4>
                  <span className="shrink-0 rounded-full border border-heritage-gold/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-heritage-gold">
                    {garment.role}
                  </span>
                </div>
                {removalTarget && (
                  <GarmentRemovalAction
                    target={removalTarget}
                    originStage="payment"
                    reasonId={reasonId}
                    onRequest={onRequestGarmentRemoval}
                  />
                )}
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
          );
        })}
      </div>
    </ReviewSection>
  );
};

const RetainedGarmentReview = ({
  summary,
  removalTargets,
  onEditStage,
  onRequestGarmentRemoval,
}: {
  summary: FutureDesignStudioSummary;
  removalTargets: readonly FutureGarmentRemovalTarget[];
  onEditStage: DormantFuturePaymentReviewStepProps["onEditStage"];
  onRequestGarmentRemoval?: DormantFuturePaymentReviewStepProps["onRequestGarmentRemoval"];
}) => (
  <ReviewSection
    title="Garments"
    description="Your surviving garments remain visible while the updated order is reviewed."
    editLabel="Edit Garments"
    onEdit={() => onEditStage("garment_type")}
    removalHeadingMarker="payment"
  >
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {summary.garmentSummary.map((garment, index) => {
        const removalTarget = removalTargets.find(
          (target) => target.garmentKey === garment.garmentKey,
        );
        const fabricAllocations = summary.fabricSummary.filter((allocation) =>
          allocation.garments.some(
            (assigned) => assigned.garmentKey === garment.garmentKey,
          ),
        );
        const customDetails = summary.customDetailsSummary.find(
          (group) => group.garmentKey === garment.garmentKey,
        )?.occurrences || [];
        const reasonId = `payment-retained-removal-reason-${index}`;
        return (
          <article
            key={garment.garmentKey}
            data-retained-payment-garment="true"
            data-garment-removal-row={garment.garmentKey}
            className="min-w-0 rounded-2xl border border-heritage-green/15 bg-heritage-cream/20 p-4 sm:p-5"
          >
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Shirt
                  aria-hidden="true"
                  className="shrink-0 text-heritage-gold"
                  size={18}
                />
                <h4
                  tabIndex={-1}
                  data-garment-removal-row-heading={garment.garmentKey}
                  className="min-w-0 break-words font-serif text-lg font-bold text-heritage-green outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                >
                  {garment.label}
                </h4>
                <span className="shrink-0 rounded-full border border-heritage-gold/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-heritage-gold">
                  {garment.role}
                </span>
              </div>
              {removalTarget && (
                <GarmentRemovalAction
                  target={removalTarget}
                  originStage="payment"
                  reasonId={reasonId}
                  onRequest={onRequestGarmentRemoval}
                />
              )}
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              {garment.construction.map((component) => (
                <div
                  key={component.componentKey}
                  className="flex min-w-0 flex-wrap justify-between gap-2"
                >
                  <dt className="min-w-0 break-words text-heritage-ink/70">
                    {component.label}
                  </dt>
                  <dd className="shrink-0 font-mono font-bold text-heritage-green">
                    {moneyFromCents(component.priceCents)}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 rounded-xl border border-heritage-gold/15 bg-white p-3">
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
                        {allocation.fabricCode}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-heritage-ink/60">
                  Fabric assignment needs review.
                </p>
              )}
            </div>

            <div className="mt-4 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/55">
                Custom Details
              </p>
              {customDetails.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {customDetails.map((detail) => (
                    <li
                      key={detail.occurrenceKey}
                      className="flex min-w-0 flex-wrap justify-between gap-2 rounded-xl bg-white/80 p-3 text-sm"
                    >
                      <span className="min-w-0 break-words text-heritage-ink/70">
                        {detail.optionLabel}
                      </span>
                      <span className="shrink-0 font-mono font-bold text-heritage-green">
                        {detail.priceStatus === "evaluation_required"
                          ? "Price requires evaluation"
                          : detail.priceCents === null
                            ? "Price unavailable"
                            : detail.priceCents === 0
                              ? "Included"
                              : moneyFromCents(detail.priceCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-heritage-ink/60">
                  No optional details selected.
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  </ReviewSection>
);

export const DormantFuturePaymentReviewStep = ({
  result,
  onBack,
  onEditStage,
  survivorSummary = null,
  removalTargets = [],
  onRequestGarmentRemoval,
  onPrepareOrder,
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
  const preparation: FutureOrderV2PreparationPresentation | null =
    "preparation" in result ? result.preparation : null;
  const preparationIsPending = preparation?.status === "preparing";
  const preparationIsComplete = preparation?.status === "prepared";
  const preparationMessage =
    preparation?.status === "authentication_required" ||
    preparation?.status === "error"
      ? preparation.message
      : preparationIsComplete
        ? FUTURE_ORDER_V2_PAYMENT_ACTIVATION_PENDING_MESSAGE
        : FUTURE_ORDER_V2_PERSISTENCE_PENDING_MESSAGE;

  return (
    <main
      aria-labelledby="future-payment-review-title"
      data-stage-id="payment"
      data-candidate-status={result.status}
      className="mx-auto max-w-6xl space-y-5 font-sans"
    >
      <header className="min-w-0 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <DesignStudioBackButton
          destination="Delivery & Pickup"
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

      {!candidate && survivorSummary && (
        <RetainedGarmentReview
          summary={survivorSummary}
          removalTargets={removalTargets}
          onEditStage={onEditStage}
          onRequestGarmentRemoval={onRequestGarmentRemoval}
        />
      )}

      {candidate && (
        <>
          <ReviewSection
            title="Your Order"
            description="One active future Design Studio configuration."
            editLabel="Edit Design Style"
            onEdit={() => onEditStage("design_style")}
          >
            {isV2PaymentReviewCandidate(candidate) ? (
              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                {candidate.occurrenceStyleSnapshots.map((snapshot) => (
                  <article
                    key={snapshot.occurrence.occurrenceToken}
                    data-occurrence-style-snapshot={snapshot.occurrence.garmentKey}
                    className="min-w-0 rounded-xl border border-heritage-green/12 bg-heritage-cream/20 p-4"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
                      {snapshot.occurrence.label}
                    </p>
                    <h3 className="mt-1 break-words font-serif text-lg font-bold text-heritage-green">
                      {snapshot.sourceKind === "catalogue"
                        ? snapshot.catalogue?.name
                        : snapshot.uploaded?.displayLabel}
                    </h3>
                    <p className="mt-1 break-words font-mono text-xs text-heritage-ink/55">
                      {snapshot.sourceKind === "catalogue"
                        ? `Catalogue style: ${snapshot.catalogue?.styleId}`
                        : "Confirmed uploaded design"}
                    </p>
                    {snapshot.sourceKind === "catalogue" && snapshot.catalogue && (
                      <p className="mt-2 break-words text-xs text-heritage-ink/60">
                        Eligibility revision {snapshot.catalogue.eligibilityRevision}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : candidate.design ? (
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

          <GarmentReview
            candidate={candidate}
            onEditStage={onEditStage}
            removalTargets={removalTargets}
            onRequestGarmentRemoval={onRequestGarmentRemoval}
          />

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
            title="Delivery & Pickup"
            description="Contact and destination details are kept within this dedicated review section."
            editLabel="Edit Delivery & Pickup"
            onEdit={() => onEditStage("shipping")}
          >
            <div className="flex min-w-0 items-start gap-3 rounded-xl bg-heritage-green/5 p-4">
              <Truck aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-green" size={19} />
              <div className="min-w-0">
                <p className="break-words font-bold text-heritage-green">
                  {candidate.shipping.state.fulfilmentMethod === "eindhoven_pickup"
                    ? "Pick Up in Eindhoven"
                    : candidate.shipping.state.fulfilmentMethod === "destination_delivery"
                      ? "Deliver to an Address"
                      : "Delivery method pending"}
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
                          shippingAddress?.stateRegion,
                          shippingAddress?.postalCode,
                          shippingAddress?.countryCode ||
                            candidate.shipping.state.otherDestinationCountry,
                        ].filter(Boolean).join(", ") || "Address pending"
                      : candidate.shipping.destinationLabel || "Pick Up in Eindhoven"}
                  </dd>
                  {candidate.shipping.destinationLabel && (
                    <dd className="mt-2 break-words text-xs text-heritage-ink/60">
                      Zone: {candidate.shipping.destinationLabel}
                    </dd>
                  )}
                  {candidate.shipping.parcelWeightKg !== null && (
                    <dd className="mt-1 break-words text-xs text-heritage-ink/60">
                      Estimated shipment weight: {candidate.shipping.parcelWeightKg.toFixed(1)} kg
                    </dd>
                  )}
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
              Standard Shipping to Eindhoven is included in Garment Construction.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-heritage-ink/60">
              {candidate.shipping.quoteRequired
                ? "Custom shipping quote required. Additional Delivery is not a final charge yet."
                : candidate.pricing.postEindhovenAdjustmentCents === null
                  ? "Additional Delivery is still pending."
                  : "Additional Delivery is itemized once in the price breakdown below."}
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
              {isV2PaymentReviewCandidate(candidate)
                ? preparationMessage
                : FUTURE_ORDER_NOT_SUBMITTED_MESSAGE}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/65">
              Authentication and a verified payment provider will be required before real payment can begin.
            </p>
            {isV2PaymentReviewCandidate(candidate) && onPrepareOrder && (
              <>
                {preparationIsComplete ? (
                  <p
                    data-future-order-v2-prepared={preparation?.status}
                    className="mt-4 text-sm font-semibold text-heritage-gold"
                  >
                    Order prepared with ID {preparation.orderId}. Payment remains unavailable.
                  </p>
                ) : (
                  <button
                    type="button"
                    data-future-order-v2-prepare
                    disabled={!isReviewable || preparationIsPending}
                    onClick={onPrepareOrder}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-gold px-5 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    <CheckCircle2 aria-hidden="true" size={14} />
                    {preparationIsPending
                      ? "Preparing order..."
                      : "Prepare order for future payment"}
                  </button>
                )}
              </>
            )}
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
          destination="Delivery & Pickup"
          onClick={onBack}
          className="w-full sm:w-auto"
        />
      </footer>
    </main>
  );
};
