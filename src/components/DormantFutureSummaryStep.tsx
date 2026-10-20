import {
  AlertTriangle,
  ArrowDown,
  Check,
  CheckCircle2,
  Pencil,
  Trash2,
} from "lucide-react";
import { DesignStudioStepActions } from "./DesignStudioBackButton";
import { DualUnitMeasurementPill } from "./DualUnitMeasurementPill";
import { formatDesignStudioStepCounter } from "../utils/designSourceJourney";
import { useRef, useState } from "react";
import type React from "react";
import {
  BLOCKED_GARMENT_REMOVAL_BUTTON_CLASS,
  BlockedGarmentRemovalReason,
} from "./BlockedGarmentRemovalReason";
import {
  garmentConstructionInclusionNote,
  SELECTED_DESIGN_PRICE_SUPPORTING_TEXT,
} from "../utils/designPriceBreakdownPresentation";
import {
  type FutureDesignStudioSummary,
  type FutureSummaryFabricAllocation,
  type FutureSummaryMeasurementValue,
} from "../utils/designStudioFutureSummary";
import {
  isSampleClothMeasurementMethod,
  isSelectedMeasurementMethod,
  MEASUREMENT_METHOD_LABELS,
} from "../utils/measurementBlueprint";
import type { FutureShippingStageResolution } from "../utils/designStudioFutureShipping";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import {
  formatCustomerFacingFabricCapacityAmount,
  formatCustomerFacingFabricCapacityNoun,
} from "../config/StyleFabricCapacityConfig";
import type { FutureGarmentRemovalTarget } from "./FutureGarmentRemovalConfirmationDialog";
import { OrderContextDetails } from "./CustomerOrderContext";
import type { CustomerOrderContextPresentation } from "../utils/customerOrderContextPresentation";
import { resolveIndividualInboundShippingDisplay } from "../utils/individualInboundShippingDisplay";
import { useImageLoadRetry } from "../hooks/useImageLoadRetry";
import {
  formatSummaryGarmentTypeRoleLine,
  getSummaryGarmentReferenceImage,
  groupSummaryGarmentsByWearer,
} from "../utils/summaryGarmentGroups";

export interface SummaryMeasurementGroupEditTarget {
  /** Person to open in Step 7; null for a sole wearer. */
  wearerId: string | null;
  /** "shared" or the garment occurrence key. */
  groupKey: string;
}

interface DormantFutureSummaryStepProps {
  summary: FutureDesignStudioSummary;
  orderContext?: CustomerOrderContextPresentation;
  /** Effective studio order type. Falls back to the visible order context. */
  inboundOrderType?: string | null;
  onBack: () => void;
  onEditGarments: () => void;
  onEditFabrics: () => void;
  onEditDesignStyle: () => void;
  onEditCustomDetails: () => void;
  onEditAiTryOn: () => void;
  onEditMeasurements: () => void;
  /**
   * Section-level Edit: open Step 7 on this person's shared or garment group.
   * When omitted, section Edit links fall back to onEditMeasurements.
   */
  onEditMeasurementGroup?: (target: SummaryMeasurementGroupEditTarget) => void;
  /** Per-garment Edit — focuses that garmentKey in Fabric (return lease). */
  onEditGarment?: (garmentKey: string) => void;
  onChangeGarmentFabric?: (garmentKey: string) => void;
  onRemoveGarmentFabric?: (garmentKey: string) => void;
  onChangeGarmentDesignStyle?: (garmentKey: string) => void;
  onRemoveGarmentDesignStyle?: (garmentKey: string) => void;
  onEditGarmentCustomDetails?: (garmentKey: string) => void;
  canContinueToShipping: boolean;
  onContinueToShipping: () => void;
  shippingResolution?: FutureShippingStageResolution | null;
  removalTargets?: readonly FutureGarmentRemovalTarget[];
  onRequestGarmentRemoval?: (
    target: FutureGarmentRemovalTarget,
    trigger: HTMLButtonElement,
  ) => void;
  /** Draft-only; omit when the order is no longer freely editable. */
  onRequestCancelOrder?: () => void;
}

const money = (value: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${value.toFixed(2)}`;

const defaultOrderContext: CustomerOrderContextPresentation = {
  kind: "individual",
  studioLabel: "Individual Order",
  detailsOrderType: "Individual Order",
  batchName: null,
  role: null,
};

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

const Section = ({
  title,
  description,
  editLabel,
  onEdit,
  removalHeadingMarker,
  jumpTarget,
  headingRef,
  children,
}: {
  title: string;
  description?: string;
  editLabel: string;
  onEdit: () => void;
  removalHeadingMarker?: string;
  /** Focus target for the Garments jump links (e.g. "fabrics"). */
  jumpTarget?: string;
  headingRef?: (element: HTMLHeadingElement | null) => void;
  children: React.ReactNode;
}) => (
  <section className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6">
    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <h3
          ref={headingRef}
          tabIndex={removalHeadingMarker || jumpTarget ? -1 : undefined}
          data-garment-removal-list-heading={removalHeadingMarker}
          data-summary-jump-target={jumpTarget}
          className={`font-serif text-lg font-bold text-heritage-green outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2${jumpTarget ? " scroll-mt-24" : ""}`}
        >
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">
            {description}
          </p>
        )}
      </div>
      <EditButton label={editLabel} onClick={onEdit} />
    </div>
    <div className="mt-4 min-w-0">{children}</div>
  </section>
);

/** One line of the per-garment choice list: link left, actions right, never wraps the actions. */
const CHOICE_ROW_CLASS =
  "flex min-w-0 items-center justify-between gap-1 px-1.5 py-0.5 sm:gap-2 sm:px-3";

/** Right-hand actions of a choice row, separated by a dot. */
const ChoiceActions = ({ children }: { children: React.ReactNode }) => {
  const actions = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (actions.length === 0) return null;
  return (
    <div className="flex shrink-0 items-center">
      {actions.map((action, index) => (
        <span key={index} className="flex items-center">
          {index > 0 ? (
            <span aria-hidden="true" className="px-0.5 text-heritage-ink/30">
              ·
            </span>
          ) : null}
          {action}
        </span>
      ))}
    </div>
  );
};

const ChoiceActionButton = ({
  label,
  ariaLabel,
  onClick,
  tone = "neutral",
  testId,
}: {
  label: string;
  /** Full accessible name; the visible label is short (e.g. "Change"). */
  ariaLabel?: string;
  onClick: () => void;
  tone?: "neutral" | "danger";
  testId?: string;
}) => (
  <button
    type="button"
    aria-label={ariaLabel}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    data-summary-choice-action={testId}
    className={`inline-flex min-h-9 shrink-0 items-center rounded px-0.5 text-xs font-semibold underline sm:px-1.5 underline-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
      tone === "danger"
        ? "text-red-700 hover:text-red-900 focus-visible:ring-red-500"
        : "text-heritage-green hover:text-heritage-bronze focus-visible:ring-heritage-gold"
    }`}
  >
    {label}
  </button>
);

/** Stage 8 design thumb: retries a failed load once before "Image unavailable". */
const SummaryDesignPreview = ({
  imageUrl,
  alt,
}: {
  imageUrl: string | null | undefined;
  alt: string;
}) => {
  const image = useImageLoadRetry(imageUrl);
  if (image.failed) {
    return (
      <span className="flex h-full items-center justify-center p-2 text-center text-[10px] text-heritage-ink/45">
        Image unavailable
      </span>
    );
  }
  return (
    <img
      src={image.src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-contain"
      referrerPolicy="no-referrer"
      onError={image.onError}
    />
  );
};

/** Stage 8 garment card photo: the Step 1 garment-type reference, never the customer's design. */
const SummaryGarmentReferencePhoto = ({
  garmentKey,
  imageUrl,
}: {
  garmentKey: string;
  imageUrl: string | null;
}) => {
  const image = useImageLoadRetry(imageUrl);
  return (
    <figure className="min-w-0" data-summary-garment-reference={garmentKey}>
      <div className="aspect-[4/5] overflow-hidden rounded-xl border border-heritage-green/10 bg-white">
        {imageUrl && !image.failed ? (
          <img
            src={image.src}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={image.onError}
            data-summary-garment-reference-image="true"
          />
        ) : (
          <span className="flex h-full items-center justify-center p-1 text-center text-[9px] font-bold uppercase tracking-wider text-heritage-ink/45">
            No photo
          </span>
        )}
      </div>
      <figcaption className="mt-1 text-center text-[9px] uppercase tracking-wider text-heritage-ink/45">
        Reference photo
      </figcaption>
    </figure>
  );
};

type SummaryGarmentJumpStatus = "chosen" | "needed" | "none";

/** "Fabric ↓" style link with a tick (chosen) or "!" (still needed). */
const SummaryGarmentJumpLink = ({
  label,
  status,
  ariaLabel,
  testId,
  onClick,
}: {
  label: string;
  status: SummaryGarmentJumpStatus;
  ariaLabel: string;
  testId: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    aria-label={ariaLabel}
    data-summary-garment-jump={testId}
    data-summary-jump-status={status}
    className="inline-flex min-h-9 min-w-0 items-center gap-1 rounded text-left text-[13px] font-semibold sm:gap-1.5 sm:text-sm text-heritage-green transition hover:text-heritage-bronze focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-1"
  >
    {status === "chosen" ? (
      <span
        aria-hidden="true"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-heritage-green text-white"
      >
        <Check size={11} strokeWidth={3} />
      </span>
    ) : status === "needed" ? (
      <span
        aria-hidden="true"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-heritage-gold bg-heritage-gold/15 text-[10px] font-bold text-heritage-bronze"
      >
        !
      </span>
    ) : (
      <span
        aria-hidden="true"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-heritage-ink/20"
      />
    )}
    <span className="min-w-0">{label}</span>
    <ArrowDown aria-hidden="true" size={13} className="shrink-0 text-heritage-gold" />
  </button>
);

/** Stage 8 fabric thumb: usable image, else colour swatch, else the Fabric step's "No preview". */
const SummaryFabricPreview = ({
  allocation,
}: {
  allocation: FutureSummaryFabricAllocation;
}) => {
  const image = useImageLoadRetry(allocation.image);
  const showImage = !image.failed;
  return (
    <div
      className="aspect-[4/3] w-24 max-w-full overflow-hidden rounded-xl bg-heritage-cream/40"
      data-summary-fabric-preview={allocation.allocationId}
    >
      {showImage ? (
        <img
          src={image.src}
          alt={`${allocation.fabricName} fabric swatch`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={image.onError}
          data-summary-fabric-image="true"
        />
      ) : allocation.colorHex ? (
        <div
          className="h-full w-full"
          style={{ backgroundColor: allocation.colorHex }}
          aria-label={`${allocation.fabricName} fabric color`}
          data-summary-fabric-swatch="true"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-heritage-cream/70 px-1 text-center text-[10px] font-bold uppercase tracking-wider text-heritage-ink/45"
          aria-label={`${allocation.fabricName} fabric preview unavailable`}
          data-summary-fabric-fallback="true"
        >
          No preview
        </div>
      )}
    </div>
  );
};

/** One gold-headed measurement group (shared or per garment) with split-pill rows. */
const MEASUREMENT_METHOD_BADGE_TONES: Record<
  keyof typeof MEASUREMENT_METHOD_LABELS,
  string
> = {
  low_risk: "border-emerald-200 bg-emerald-50 text-emerald-800",
  medium_risk: "border-amber-200 bg-amber-50 text-amber-800",
  high_risk: "border-red-200 bg-red-50 text-red-700",
  critical_risk: "border-red-300 bg-red-100 text-red-800",
  sample_cloth: "border-heritage-gold/30 bg-heritage-cream text-heritage-green",
};

/** Measurement method (risk level) as a small coloured badge. Display only. */
const MeasurementMethodBadge = ({
  route,
}: {
  route: FutureDesignStudioSummary["measurementSummary"]["route"];
}) =>
  isSelectedMeasurementMethod(route) ? (
    <span
      data-summary-measurement-method-badge={route}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${MEASUREMENT_METHOD_BADGE_TONES[route]}`}
    >
      <span className="sr-only">Measurement method: </span>
      {MEASUREMENT_METHOD_LABELS[route]}
    </span>
  ) : (
    <span
      data-summary-measurement-method-badge="none"
      className="text-xs text-heritage-ink/60"
    >
      Measurement method not selected
    </span>
  );

/** One gold-headed measurement group (shared or per garment) with split-pill rows. */
const SummaryMeasurementGroup = ({
  title,
  values,
  headingLevel = "h4",
  editLabel,
  onEdit,
}: {
  title: string;
  values: readonly FutureSummaryMeasurementValue[];
  headingLevel?: "h4" | "h5";
  /** Accessible name of this group's Edit link, e.g. "Edit Standard Shirt measurements". */
  editLabel: string;
  /** Opens Step 7 Measurements on this group (falls back to the top of Step 7). */
  onEdit: () => void;
}) => {
  const Heading = headingLevel;
  return (
    <div data-summary-measurement-section className="mt-5 border-t border-heritage-gold/20 pt-4">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <Heading className="min-w-0 break-words text-base font-extrabold uppercase tracking-wider text-heritage-gold">
          {title}
        </Heading>
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel}
          data-summary-measurement-section-edit
          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded px-1 text-xs font-semibold text-heritage-green underline underline-offset-2 transition hover:text-heritage-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
        >
          <Pencil aria-hidden="true" size={12} />
          Edit
        </button>
      </div>
      <ul className="mt-3 space-y-2 text-sm text-heritage-ink/75">
        {values.map((measurement) => (
          <li key={measurement.requirementKey} className="flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0 break-words">{measurement.label}</span>
            <span className="shrink-0 text-right">
              <DualUnitMeasurementPill
                parts={measurement.formattedParts}
                outsideUsualRange={measurement.outsideUsualRange}
              />
              {measurement.convertedFormattedParts && (
                <span
                  data-sample-converted="true"
                  className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-heritage-ink/60"
                >
                  Production equivalent
                  <DualUnitMeasurementPill parts={measurement.convertedFormattedParts} size="sm" />
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const DormantFutureSummaryStep = ({
  summary,
  orderContext = defaultOrderContext,
  inboundOrderType = null,
  onBack,
  onEditGarments,
  onEditFabrics,
  onEditDesignStyle,
  onEditCustomDetails,
  onEditAiTryOn,
  onEditMeasurements,
  onEditMeasurementGroup,
  onEditGarment,
  onChangeGarmentFabric,
  onRemoveGarmentFabric,
  onChangeGarmentDesignStyle,
  onRemoveGarmentDesignStyle,
  onEditGarmentCustomDetails,
  canContinueToShipping,
  onContinueToShipping,
  shippingResolution = null,
  removalTargets = [],
  onRequestGarmentRemoval,
  onRequestCancelOrder,
}: DormantFutureSummaryStepProps) => {
  const [revealedBlockedRemovalKey, setRevealedBlockedRemovalKey] = useState<
    string | null
  >(null);
  const jumpTargetsRef = useRef(new Map<string, HTMLElement>());
  const registerJumpTarget =
    (key: string) => (element: HTMLElement | null) => {
      if (element) jumpTargetsRef.current.set(key, element);
      else jumpTargetsRef.current.delete(key);
    };
  /** Scrolls to and focuses a section (or in-card list) below. Display only. */
  const jumpToSummaryTarget = (key: string) => {
    const target = jumpTargetsRef.current.get(key);
    if (!target) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView?.({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
    target.focus?.({ preventScroll: true });
  };
  const garmentPersonGroups = groupSummaryGarmentsByWearer(summary);
  const customDetailsNeeded = summary.blockers.some(
    (blocker) =>
      blocker.code === "CUSTOM_DETAILS_INVALID" ||
      blocker.code === "CUSTOM_DETAILS_INCOMPLETE",
  );
  const isReady = summary.status === "ready";
  const editMeasurementGroup = (wearerId: string | null, groupKey: string) => () => {
    if (onEditMeasurementGroup) onEditMeasurementGroup({ wearerId, groupKey });
    else onEditMeasurements();
  };
  const firstBlocker = summary.blockers[0] || null;
  const blockerEditAction = firstBlocker
    ? {
        garments: { label: "Edit Garments", onClick: onEditGarments },
        fabrics: { label: "Edit Fabrics", onClick: onEditFabrics },
        design_style: { label: "Edit Design Style", onClick: onEditDesignStyle },
        custom_details: { label: "Edit Custom Details", onClick: onEditCustomDetails },
        ai_try_on: { label: "Edit AI Try-on", onClick: onEditAiTryOn },
        measurements: { label: "Edit Measurements", onClick: onEditMeasurements },
        pricing: { label: "Edit Custom Details", onClick: onEditCustomDetails },
      }[firstBlocker.section]
    : null;
  const statusTitle = isReady
    ? "Your design summary is ready"
    : summary.status === "pricing_pending"
      ? "Evaluation pending"
      : summary.status === "measurement_calculation_pending"
        ? "Measurement calculation pending"
        : summary.status === "profile_mapping_pending"
          ? "Measurement setup pending"
          : "Review needed";
  const statusDescription = isReady
    ? "Review your selections below. You can return to any completed step to make changes."
    : summary.status === "pricing_pending"
      ? "The total today is the base garment. Personalized additions are reviewed after you order."
      : firstBlocker?.message || "Review the first incomplete selection before continuing.";
  const knownConfirmedPrice =
    summary.pricingSummary.garmentConstructionSubtotal === null
      ? null
      : summary.pricingSummary.garmentConstructionSubtotal +
        summary.pricingSummary.customDetailsExactSubtotal;
  const orderSubtotal =
    summary.pricingSummary.status === "exact" &&
    summary.pricingSummary.selectedDesignPrice
      ? summary.pricingSummary.selectedDesignPrice.selectedDesignPrice
      : knownConfirmedPrice;
  const summaryOrderType =
    inboundOrderType ??
    (orderContext.kind === "individual"
      ? "Individual"
      : orderContext.kind === "community"
        ? "Community"
        : orderContext.role === "Member"
          ? "Group Member"
          : "Group Organizer");
  const includedInbound = resolveIndividualInboundShippingDisplay({
    orderType: summaryOrderType,
    physicalGarmentCount: summary.garmentSummary.length,
    fulfilmentMethod: shippingResolution?.state.fulfilmentMethod,
  });
  const constructionInclusionNote =
    garmentConstructionInclusionNote(summaryOrderType) ===
    SELECTED_DESIGN_PRICE_SUPPORTING_TEXT
      ? SELECTED_DESIGN_PRICE_SUPPORTING_TEXT
      : garmentConstructionInclusionNote(summaryOrderType);
  const deliveryMethod = shippingResolution?.state.fulfilmentMethod || null;
  const isDestinationDelivery = deliveryMethod === "destination_delivery";
  const shippingAmountCents =
    shippingResolution?.postEindhovenAdjustmentCents ?? null;
  const shippingValue = shippingResolution?.quoteRequired
    ? "Custom shipping quote required"
    : shippingAmountCents === null
      ? "Pending"
      : money(shippingAmountCents / 100);
  const projectedTotalCents = shippingResolution?.projectedTotalCents ?? null;
  const inboundChargeCents = includedInbound?.amountCents ?? 0;
  const payableTotalCents =
    projectedTotalCents === null
      ? orderSubtotal === null
        ? null
        : Math.round(orderSubtotal * 100) + inboundChargeCents
      : projectedTotalCents + inboundChargeCents;
  const totalLabel = projectedTotalCents === null ? "Current Subtotal" : "Total";
  const totalValue =
    payableTotalCents === null ? "Pending" : money(payableTotalCents / 100);
  const garmentKeys = new Set(
    summary.garmentSummary.map((garment) => garment.garmentKey),
  );
  // Construction defaults and scoped Custom Details are separate authorities.
  // Present both beneath their owner without rendering a duplicate when a
  // legacy Custom Details record names the same authoritative base component.
  const customDetailsForGarment = (garment: (typeof summary.garmentSummary)[number]) => {
    const baseComponents = new Set(
      garment.construction.map(
        (component) => `${component.selectionGroup}:${component.optionId}`,
      ),
    );
    return (
      summary.customDetailsSummary.find(
        (group) => group.garmentKey === garment.garmentKey,
      )?.occurrences.filter(
        (occurrence) =>
          !baseComponents.has(`${occurrence.selectionGroup}:${occurrence.optionId}`),
      ) || []
    );
  };
  const unmatchedCustomDetails = summary.customDetailsSummary.filter(
    (group) => !garmentKeys.has(group.garmentKey),
  );

  return (
    <section
      aria-labelledby="future-summary-title"
      data-stage-id="summary"
      data-summary-status={summary.status}
      className="mx-auto min-w-0 max-w-6xl space-y-5 font-sans [overflow-wrap:anywhere]"
    >
      <header className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <DesignStudioStepActions
          slot="header"
          backDestination="Measurement"
          onBack={onBack}
          className="mb-5"
          forward={{
            destination: "Delivery",
            onClick: onContinueToShipping,
            disabled: !canContinueToShipping,
            locked: !canContinueToShipping,
            ariaLabel: "Continue to Delivery",
          }}
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          {formatDesignStudioStepCounter("summary")}
        </p>
        <h2
          id="future-summary-title"
          className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
        >
          Summary
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
          Review the choices from Garment Type through Measurements before
          Shipping becomes available. You can edit or remove individual choices
          without leaving this summary.
        </p>
        {onRequestCancelOrder ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={onRequestCancelOrder}
              data-summary-cancel-order="true"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 px-4 text-xs font-bold uppercase tracking-wider text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              Cancel Order
            </button>
          </div>
        ) : null}
      </header>

      <OrderContextDetails context={orderContext} />

      <div
        role="status"
        aria-live="polite"
        className={`rounded-2xl border p-4 sm:p-5 ${
          isReady
            ? "border-heritage-green/20 bg-heritage-green/5"
            : "border-heritage-gold/35 bg-heritage-gold/8"
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {isReady ? (
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-green"
              size={19}
            />
          ) : (
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-gold"
              size={19}
            />
          )}
          <div className="min-w-0">
            <h3 className="font-serif text-lg font-bold text-heritage-green">
              {statusTitle}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-heritage-ink/70">
              {statusDescription}
            </p>
            {firstBlocker && !isReady && blockerEditAction && (
              <div className="mt-3">
                <EditButton
                  label={blockerEditAction.label}
                  onClick={blockerEditAction.onClick}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <Section
        title="Garments"
        description="Each garment keeps its own construction and fabric requirements."
        editLabel="Edit Garments"
        onEdit={onEditGarments}
        removalHeadingMarker="summary"
      >
        {(() => {
          const renderGarmentCard = (
            garment: (typeof summary.garmentSummary)[number],
            grouped: boolean,
          ) => {
            const index = summary.garmentSummary.indexOf(garment);
            const removalTarget = removalTargets.find(
              (target) => target.garmentKey === garment.garmentKey,
            );
            const reasonId = `summary-removal-reason-${index}`;
            const selectedCustomDetails = customDetailsForGarment(garment);
            const fabricAllocation = summary.fabricSummary.find((allocation) =>
              allocation.garments.some(
                (assigned) => assigned.garmentKey === garment.garmentKey,
              ),
            );
            const designStyle =
              (summary.designStyleOccurrences || []).find(
                (occurrence) => occurrence.garmentKey === garment.garmentKey,
              ) || null;
            const hasFabric = Boolean(fabricAllocation);
            const hasDesignStyle =
              Boolean(designStyle) && designStyle?.status === "selected";
            const hasConstructionList =
              garment.construction.length > 0 || selectedCustomDetails.length > 0;
            const customDetailsStatus: SummaryGarmentJumpStatus =
              selectedCustomDetails.length > 0
                ? "chosen"
                : customDetailsNeeded
                  ? "needed"
                  : "none";
            const referenceImage = getSummaryGarmentReferenceImage(garment.garmentType);
            const GarmentHeading = grouped ? "h5" : "h4";
            return (
              <article
                key={garment.garmentKey}
                className="min-w-0 rounded-xl border border-heritage-green/12 bg-heritage-cream/20 p-2.5 sm:p-4"
                data-garment-removal-row={garment.garmentKey}
                data-summary-garment-card={garment.garmentKey}
              >
                {/* Phone: photo + header side by side, details full width below.
                    Desktop: photo column on the left, everything else beside it. */}
                <div className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)] gap-x-3 gap-y-3 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-x-4">
                  <div className="min-w-0 sm:row-span-2">
                    <SummaryGarmentReferencePhoto
                      garmentKey={garment.garmentKey}
                      imageUrl={referenceImage?.src ?? null}
                    />
                  </div>
                  <div className="min-w-0">
                <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <p
                      data-summary-garment-type-role={garment.garmentKey}
                      className="text-[10px] font-bold uppercase tracking-wider text-heritage-gold"
                    >
                      {formatSummaryGarmentTypeRoleLine(garment)}
                    </p>
                    <GarmentHeading
                      tabIndex={-1}
                      data-garment-removal-row-heading={garment.garmentKey}
                      className="mt-0.5 min-w-0 break-words font-serif text-lg font-bold text-heritage-green outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                    >
                      {garment.label}
                    </GarmentHeading>
                    <BlockedGarmentRemovalReason
                      id={reasonId}
                      reason={removalTarget?.disabledReason}
                      revealed={
                        revealedBlockedRemovalKey === garment.garmentKey
                      }
                      className="mt-2 break-words text-xs leading-relaxed text-heritage-ink/65"
                    />
                  </div>
                  <div
                    className="flex min-w-0 flex-wrap gap-2 *:w-auto *:flex-1 sm:flex-col sm:flex-nowrap sm:items-end sm:*:flex-none"
                  >
                    {onEditGarment ? (
                      <button
                        type="button"
                        aria-label={`Edit ${garment.label}`}
                        data-summary-edit-garment={garment.garmentKey}
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditGarment(garment.garmentKey);
                        }}
                        className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-heritage-green/20 px-2 sm:px-3 text-xs font-bold text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:w-auto"
                      >
                        <Pencil aria-hidden="true" className="shrink-0" size={15} />
                        Edit
                      </button>
                    ) : null}
                    {removalTarget && (
                      <button
                        type="button"
                        aria-disabled={
                          !removalTarget.canRequestRemoval || undefined
                        }
                        title={removalTarget.disabledReason ?? undefined}
                        aria-label={removalTarget.accessibleName}
                        aria-describedby={
                          removalTarget.disabledReason ? reasonId : undefined
                        }
                        data-garment-removal-button={garment.garmentKey}
                        data-garment-removal-origin-stage="summary"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!removalTarget.canRequestRemoval) {
                            setRevealedBlockedRemovalKey(garment.garmentKey);
                            return;
                          }
                          onRequestGarmentRemoval?.(
                            removalTarget,
                            event.currentTarget,
                          );
                        }}
                        className={`inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-red-200 px-2 sm:px-3 text-xs font-bold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto ${BLOCKED_GARMENT_REMOVAL_BUTTON_CLASS}`}
                      >
                        <Trash2 aria-hidden="true" className="shrink-0" size={15} />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                  </div>
                  <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">
                <ul
                  className="divide-y divide-heritage-green/10 overflow-hidden rounded-lg border border-heritage-green/12 bg-white/80 sm:max-w-md"
                  data-summary-garment-choices={garment.garmentKey}
                >
                  <li className={CHOICE_ROW_CLASS} data-summary-garment-choice-row="fabric">
                    <SummaryGarmentJumpLink
                      label="Fabric"
                      status={hasFabric ? "chosen" : "needed"}
                      ariaLabel={`Fabric ${hasFabric ? "chosen" : "still needed"} for ${garment.label}. Go to Fabrics`}
                      testId={`fabric:${garment.garmentKey}`}
                      onClick={() => jumpToSummaryTarget("fabrics")}
                    />
                    <ChoiceActions>
                      {onChangeGarmentFabric ? (
                        <ChoiceActionButton
                          label={hasFabric ? "Change" : "Select"}
                          ariaLabel={`${hasFabric ? "Change" : "Select"} Fabric for ${garment.label}`}
                          testId={`change-fabric:${garment.garmentKey}`}
                          onClick={() => onChangeGarmentFabric(garment.garmentKey)}
                        />
                      ) : null}
                      {hasFabric && onRemoveGarmentFabric ? (
                        <ChoiceActionButton
                          label="Remove"
                          ariaLabel={`Remove Fabric from ${garment.label}`}
                          tone="danger"
                          testId={`remove-fabric:${garment.garmentKey}`}
                          onClick={() => onRemoveGarmentFabric(garment.garmentKey)}
                        />
                      ) : null}
                    </ChoiceActions>
                  </li>
                  <li className={CHOICE_ROW_CLASS} data-summary-garment-choice-row="design-style">
                    <SummaryGarmentJumpLink
                      label="Design Style"
                      status={hasDesignStyle ? "chosen" : "needed"}
                      ariaLabel={`Design Style ${hasDesignStyle ? "chosen" : "still needed"} for ${garment.label}. Go to Design Style`}
                      testId={`design-style:${garment.garmentKey}`}
                      onClick={() => jumpToSummaryTarget("design-style")}
                    />
                    <ChoiceActions>
                      {onChangeGarmentDesignStyle ? (
                        <ChoiceActionButton
                          label={hasDesignStyle ? "Change" : "Select"}
                          ariaLabel={`${hasDesignStyle ? "Change" : "Select"} Design Style for ${garment.label}`}
                          testId={`change-style:${garment.garmentKey}`}
                          onClick={() =>
                            onChangeGarmentDesignStyle(garment.garmentKey)
                          }
                        />
                      ) : null}
                      {hasDesignStyle && onRemoveGarmentDesignStyle ? (
                        <ChoiceActionButton
                          label="Remove"
                          ariaLabel={`Remove Design Style from ${garment.label}`}
                          tone="danger"
                          testId={`remove-style:${garment.garmentKey}`}
                          onClick={() =>
                            onRemoveGarmentDesignStyle(garment.garmentKey)
                          }
                        />
                      ) : null}
                    </ChoiceActions>
                  </li>
                  <li className={CHOICE_ROW_CLASS} data-summary-garment-choice-row="custom-details">
                    {hasConstructionList ? (
                      <SummaryGarmentJumpLink
                        label={`Custom Details (${selectedCustomDetails.length})`}
                        status={customDetailsStatus}
                        ariaLabel={`${selectedCustomDetails.length} Custom Details for ${garment.label}${customDetailsStatus === "needed" ? ", still needed" : ""}. Go to this garment's construction list`}
                        testId={`custom-details:${garment.garmentKey}`}
                        onClick={() =>
                          jumpToSummaryTarget(`custom-details:${garment.garmentKey}`)
                        }
                      />
                    ) : (
                      <span className="inline-flex min-h-9 min-w-0 items-center gap-1.5 text-sm font-semibold text-heritage-green">
                        <span
                          aria-hidden="true"
                          className="inline-flex h-4 w-4 shrink-0 rounded-full border border-heritage-ink/20"
                        />
                        Custom Details ({selectedCustomDetails.length})
                      </span>
                    )}
                    <ChoiceActions>
                      {onEditGarmentCustomDetails ? (
                        <ChoiceActionButton
                          label="Edit"
                          ariaLabel={`Edit Custom Details for ${garment.label}`}
                          testId={`edit-details:${garment.garmentKey}`}
                          onClick={() =>
                            onEditGarmentCustomDetails(garment.garmentKey)
                          }
                        />
                      ) : null}
                    </ChoiceActions>
                  </li>
                </ul>
              {garment.physicalComponents.length > 1 && (
                <p className="mt-3 text-xs text-heritage-ink/70">
                  Components: {garment.physicalComponents.map((component) => component.label).join(", ")}
                </p>
              )}
              {(garment.construction.length > 0 || selectedCustomDetails.length > 0) && (
                <section className="mt-3" data-summary-garment-construction={garment.garmentKey}>
                  <p
                    ref={registerJumpTarget(`custom-details:${garment.garmentKey}`)}
                    tabIndex={-1}
                    data-summary-jump-target={`custom-details:${garment.garmentKey}`}
                    className="scroll-mt-24 text-[10px] font-bold uppercase tracking-wider text-heritage-gold outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                  >
                    Garment Construction
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm text-heritage-ink/75">
                    {garment.construction.map((component) => (
                      <li
                        key={component.componentKey}
                        className="flex min-w-0 justify-between gap-2"
                      >
                        <span className="min-w-0 break-words">{component.label}</span>
                        <span className="shrink-0 whitespace-nowrap font-mono font-bold text-heritage-green">
                          {component.priceCents === 0
                            ? "Included"
                            : money(component.priceCents / 100)}
                        </span>
                      </li>
                    ))}
                    {selectedCustomDetails.map((occurrence) => (
                      <li
                        key={occurrence.occurrenceKey}
                        data-summary-selected-customization={occurrence.occurrenceKey}
                        className="flex min-w-0 justify-between gap-2"
                      >
                        <span className="min-w-0 break-words">{occurrence.optionLabel}</span>
                        <span className="shrink-0 whitespace-nowrap font-mono font-bold text-heritage-green">
                          {occurrence.priceStatus === "evaluation_required"
                            ? "Price requires evaluation"
                            : occurrence.priceCents === null || occurrence.priceCents === 0
                              ? "Included"
                              : money(occurrence.priceCents / 100)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
                  </div>
                </div>
              </article>
            );
          };
          if (!garmentPersonGroups) {
            return (
              <div className="space-y-3">
                {summary.garmentSummary.map((garment) =>
                  renderGarmentCard(garment, false),
                )}
              </div>
            );
          }
          return (
            <div className="space-y-4">
              {garmentPersonGroups.map((group) => (
                <section
                  key={group.key}
                  data-summary-garment-person={group.key}
                  data-summary-garment-person-kind={group.kind}
                  aria-label={`${group.label}: ${group.garments.length} ${group.garments.length === 1 ? "garment" : "garments"}`}
                  className="min-w-0 rounded-2xl border border-heritage-gold/25 p-2 sm:p-4"
                >
                  <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={
                        group.kind === "unassigned"
                          ? "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-heritage-ink/30 text-sm font-bold text-heritage-ink/50"
                          : "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-heritage-green font-serif text-sm font-bold text-heritage-gold"
                      }
                    >
                      {group.initial ?? "?"}
                    </span>
                    <h4 className="min-w-0 break-words font-serif text-base font-bold text-heritage-green">
                      {group.label}
                    </h4>
                    <span className="text-xs text-heritage-ink/55">
                      {group.garments.length}{" "}
                      {group.garments.length === 1 ? "garment" : "garments"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {group.garments.map((garment) =>
                      renderGarmentCard(garment, true),
                    )}
                  </div>
                </section>
              ))}
            </div>
          );
        })()}
      </Section>

      <Section
        title="Fabrics"
        description="Each fabric selection is shown once for its assigned garments."
        editLabel="Edit Fabrics"
        onEdit={onEditFabrics}
        jumpTarget="fabrics"
        headingRef={registerJumpTarget("fabrics")}
      >
        <div className="space-y-3">
          {summary.fabricSummary.map((allocation, index) => (
            <article
              key={allocation.allocationId}
              className="min-w-0 rounded-xl border border-heritage-green/12 bg-heritage-cream/20 p-4"
              data-summary-fabric-card={allocation.allocationId}
            >
              <div className="grid min-w-0 gap-3 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-start">
                <SummaryFabricPreview allocation={allocation} />
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
                        Fabric Selection {index + 1}
                      </p>
                      <h4 className="mt-1 break-words font-bold text-heritage-green">
                        {allocation.fabricName}
                      </h4>
                      <p
                        title={allocation.fabricCode}
                        className="mt-1 break-words font-mono text-xs text-heritage-ink/60"
                      >
                        {allocation.fabricCode}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="block font-mono font-bold text-heritage-green">
                        {allocation.materialPrice === null
                          ? "Price unavailable"
                          : "Included"}
                      </span>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          allocation.availability === "available"
                            ? "bg-heritage-green/10 text-heritage-green"
                            : "bg-heritage-gold/15 text-heritage-ink/70"
                        }`}
                      >
                        {allocation.availability === "available"
                          ? "Available"
                          : allocation.availability === "unavailable"
                            ? "Unavailable"
                            : "Needs review"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-heritage-ink/65">
                    {allocation.garments.map((garment) => garment.label).join(", ")} | {formatCustomerFacingFabricCapacityAmount(allocation.capacityUnits)} capacity {formatCustomerFacingFabricCapacityNoun(allocation.capacityUnits)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        title="Design Style"
        description="Your selected style remains separate from garment and fabric pricing."
        editLabel="Edit Design Style"
        onEdit={onEditDesignStyle}
        jumpTarget="design-style"
        headingRef={registerJumpTarget("design-style")}
      >
        {(summary.designStyleOccurrences || []).length > 0 ? (
          <div className="space-y-4">
            {(summary.designStyleOccurrences || []).map((occurrence) => (
          <div key={occurrence.garmentKey} className="grid min-w-0 gap-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center">
            <div className="aspect-[4/5] w-24 max-w-full overflow-hidden rounded-xl bg-heritage-cream/35">
              <SummaryDesignPreview
                imageUrl={occurrence.image}
                alt={
                  occurrence.sourceKind === "uploaded"
                    ? `Uploaded design preview for ${occurrence.occurrenceLabel}`
                    : `${occurrence.name} design for ${occurrence.occurrenceLabel}`
                }
              />
            </div>
            <div className="min-w-0">
              <h4 className="break-words font-bold text-heritage-green">
                {occurrence.occurrenceLabel}: {occurrence.name}
              </h4>
              {occurrence.detail ? <p className="mt-1 break-words text-sm text-heritage-ink/70">{occurrence.detail}</p> : null}
              {occurrence.status !== "selected" ? <p className="mt-1 text-xs capitalize text-heritage-ink/55">{occurrence.status.replaceAll("_", " ")}</p> : null}
            </div>
          </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-heritage-ink/65">Design Style needs review.</p>
        )}
      </Section>

      {unmatchedCustomDetails.length > 0 && (
      <Section
        title="Custom Details"
        description="Selections remain grouped with the garment they apply to."
        editLabel="Edit Custom Details"
        onEdit={onEditCustomDetails}
      >
          <div className="space-y-4">
            {unmatchedCustomDetails.map((garment) => (
              <article key={garment.garmentKey} className="min-w-0">
                <h4 className="font-bold text-heritage-green">{garment.garmentLabel}</h4>
                <ul className="mt-2 divide-y divide-heritage-green/10 rounded-xl border border-heritage-green/12">
                  {garment.occurrences.map((occurrence) => (
                    <li key={occurrence.occurrenceKey} className="min-w-0 p-3">
                      <div className="flex min-w-0 flex-wrap justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
                            {occurrence.selectionGroupTitle}
                          </p>
                          <p className="mt-1 break-words text-sm text-heritage-ink/80">
                            {occurrence.optionLabel}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-bold text-heritage-green">
                          {occurrence.priceStatus === "evaluation_required"
                            ? "Price requires evaluation"
                            : occurrence.priceCents === null
                              ? "Price unavailable"
                              : occurrence.priceCents === 0
                                ? "Included"
                                : money(occurrence.priceCents / 100)}
                        </span>
                      </div>
                      {occurrence.personalizedText && (
                        <p className="mt-2 break-words rounded-lg bg-heritage-cream/45 px-3 py-2 text-xs leading-relaxed text-heritage-ink/70">
                          {occurrence.personalizedText}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
      </Section>
      )}

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <Section
          title="AI Try-on"
          description="Your private try-on status is shown without exposing any image or provider details."
          editLabel="Edit AI Try-on"
          onEdit={onEditAiTryOn}
        >
          <p className="text-sm font-semibold text-heritage-green">
            {summary.aiTryOnSummary.label}
          </p>
        </Section>
        <Section
          title="Measurements"
          description="Both inches and centimetres are shown, with your preferred unit first."
          editLabel="Edit Measurements"
          onEdit={onEditMeasurements}
        >
          {summary.measurementSummary.wearerGroups &&
          summary.measurementSummary.wearerGroups.length > 1 ? (
            <div>
              {summary.measurementSummary.wearerGroups.map((wearer) => {
                const garmentLines = wearer.garmentKeys.flatMap((garmentKey) => {
                  const garment = summary.garmentSummary.find(
                    (candidate) => candidate.garmentKey === garmentKey,
                  );
                  const garmentLabel =
                    wearer.personGarmentLabels?.[garmentKey] ||
                    garment?.label ||
                    wearer.byGarment.find((group) => group.garmentKey === garmentKey)
                      ?.garmentLabel;
                  if (!garmentLabel) return [];
                  return [
                    garment?.fitLabel
                      ? `${garmentLabel} · ${garment.fitLabel}`
                      : garmentLabel,
                  ];
                });
                return (
                  <section
                    key={wearer.wearerId}
                    data-summary-measurement-wearer={wearer.wearerId}
                    className="mt-5 border-t-2 border-heritage-green pt-4 first:mt-1"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <h4
                        data-summary-measurement-person-heading
                        className="min-w-0 break-words font-serif text-2xl font-semibold leading-tight text-heritage-green"
                      >
                        {wearer.displayName}
                      </h4>
                      <MeasurementMethodBadge route={wearer.route} />
                    </div>
                    {garmentLines.length > 0 && (
                      <p
                        data-summary-measurement-person-garments
                        className="mt-0.5 break-words text-sm text-heritage-ink/65"
                      >
                        {garmentLines.join(", ")}
                      </p>
                    )}
                    <p className="text-xs text-heritage-ink/60">
                      Status: {wearer.status}.
                    </p>
                    {wearer.shared.length > 0 && (
                      <SummaryMeasurementGroup
                        title={
                          isSampleClothMeasurementMethod(wearer.route)
                            ? "Shared sample measurements"
                            : "Shared body measurements"
                        }
                        values={wearer.shared}
                        headingLevel="h5"
                        editLabel={`Edit ${wearer.displayName}'s shared measurements`}
                        onEdit={editMeasurementGroup(wearer.wearerId, "shared")}
                      />
                    )}
                    {wearer.byGarment.map((garment) => (
                      <SummaryMeasurementGroup
                        key={garment.garmentKey}
                        title={garment.garmentLabel}
                        values={garment.values}
                        headingLevel="h5"
                        editLabel={`Edit ${wearer.displayName}'s ${garment.garmentLabel} measurements`}
                        onEdit={editMeasurementGroup(wearer.wearerId, garment.garmentKey)}
                      />
                    ))}
                  </section>
                );
              })}
            </div>
          ) : (
          <div>
            {(() => {
              const soleName =
                summary.measurementSummary.wearerGroups?.length === 1
                  ? summary.measurementSummary.wearerGroups[0].displayName.trim()
                  : "";
              // Blank / "You" sole wearer stays unnamed (never "Person 1"): badge only.
              const showSoleName = Boolean(soleName) && soleName.toLowerCase() !== "you";
              return (
                <div
                  data-summary-measurement-sole-header
                  className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
                >
                  {showSoleName && (
                    <p className="min-w-0 break-words text-sm font-semibold text-heritage-green">
                      {soleName}
                    </p>
                  )}
                  <MeasurementMethodBadge route={summary.measurementSummary.route} />
                </div>
              );
            })()}
            {summary.measurementSummary.wearerGroups?.length === 1
              ? summary.measurementSummary.wearerGroups[0].garmentKeys.map(
                  (garmentKey) => {
                    const garmentLabel =
                      summary.garmentSummary.find(
                        (garment) => garment.garmentKey === garmentKey,
                      )?.label ||
                      summary.measurementSummary.wearerGroups?.[0].byGarment.find(
                        (garment) => garment.garmentKey === garmentKey,
                      )?.garmentLabel;
                    if (!garmentLabel) return null;
                    return (
                      <p
                        key={garmentKey}
                        className="text-sm text-heritage-ink/75"
                      >
                        {garmentLabel}
                      </p>
                    );
                  },
                )
              : null}
          </div>
          )}
          {summary.measurementSummary.shared.length > 0 && (
            <SummaryMeasurementGroup
              title={
                isSampleClothMeasurementMethod(summary.measurementSummary.route)
                  ? "Shared sample measurements"
                  : "Shared body measurements"
              }
              values={summary.measurementSummary.shared}
              editLabel="Edit shared measurements"
              onEdit={editMeasurementGroup(null, "shared")}
            />
          )}
          {summary.measurementSummary.byGarment.map((garment) => (
            <SummaryMeasurementGroup
              key={garment.garmentKey}
              title={garment.garmentLabel}
              values={garment.values}
              editLabel={`Edit ${garment.garmentLabel} measurements`}
              onEdit={editMeasurementGroup(null, garment.garmentKey)}
            />
          ))}
        </Section>
      </div>

      <section
        data-summary-cost-breakdown
        className="rounded-2xl border border-heritage-gold/30 bg-heritage-green p-5 text-white shadow-sm sm:p-6"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-heritage-gold">
          Cost Breakdown
        </p>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/75">
          {constructionInclusionNote}
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex min-w-0 flex-wrap justify-between gap-3 text-white/80">
            <dt className="min-w-0">Order Subtotal</dt>
            <dd className="shrink-0 text-right font-mono font-medium text-white">
              {orderSubtotal === null ? "Pending" : money(orderSubtotal)}
            </dd>
          </div>
          {includedInbound ? (
            <div
              data-summary-included-inbound="true"
              data-amount-cents={includedInbound.amountCents}
              className="flex min-w-0 flex-wrap justify-between gap-3 text-white/80"
            >
              <dt className="min-w-0">{includedInbound.label}</dt>
              <dd className="shrink-0 text-right font-mono font-medium text-white">
                {money(includedInbound.priceEur)}
              </dd>
            </div>
          ) : null}
          {deliveryMethod ? (
            <div className="flex min-w-0 flex-wrap justify-between gap-3 text-white/80">
              <dt className="min-w-0">Delivery</dt>
              <dd className="min-w-0 max-w-full break-words text-right">
                {isDestinationDelivery
                  ? "Ship to final destination"
                  : "Pick Up in Eindhoven"}
              </dd>
            </div>
          ) : null}
          {deliveryMethod === "eindhoven_pickup" &&
          shippingResolution?.state.pickupLocation.trim() ? (
            <div className="flex min-w-0 flex-wrap justify-between gap-3 text-white/80">
              <dt className="min-w-0">Pickup location</dt>
              <dd className="min-w-0 max-w-full break-words text-right">
                {shippingResolution.state.pickupLocation.trim()}
              </dd>
            </div>
          ) : null}
          {isDestinationDelivery ? (
            <div className="flex min-w-0 flex-wrap justify-between gap-3 text-white/80">
              <dt className="min-w-0">Shipping</dt>
              <dd className="min-w-0 max-w-full break-words text-right font-mono font-medium text-white">
                {shippingValue}
              </dd>
            </div>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-3 border-t-2 border-white/35 pt-3">
            <dt className="min-w-0 text-base font-bold uppercase tracking-wide text-white">
              {totalLabel}
            </dt>
            <dd className="shrink-0 text-right font-serif text-2xl font-bold text-white sm:text-3xl">
              {totalValue}
            </dd>
          </div>
        </dl>
        {summary.pricingSummary.status === "pending" && knownConfirmedPrice !== null && (
          <p className="mt-3 text-xs leading-relaxed text-white/75">
            Known priced selections: {money(knownConfirmedPrice)}. This is not a final total.
          </p>
        )}
      </section>

      <footer className="rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
        <DesignStudioStepActions
          slot="footer"
          backDestination="Measurement"
          onBack={onBack}
          note={(
            <p id="summary-shipping-lock-reason" className="w-full text-xs leading-relaxed text-heritage-ink/60">
              {canContinueToShipping
                ? summary.status === "pricing_pending"
                  ? "Continue to choose pickup or additional delivery. Exact totals update after personalised evaluation."
                  : "Your Summary is ready. Continue to choose pickup or additional delivery."
                : "Delivery & Pickup becomes available when this Summary is fully ready."}
            </p>
          )}
          forward={{
            destination: "Delivery",
            onClick: onContinueToShipping,
            disabled: !canContinueToShipping,
            locked: !canContinueToShipping,
            describedBy: "summary-shipping-lock-reason",
            ariaLabel: "Continue to Delivery",
          }}
        />
      </footer>
    </section>
  );
};
