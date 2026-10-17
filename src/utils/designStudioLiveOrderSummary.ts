import { isCustomerAvailableCustomDetailSelectionGroup } from "../config/GarmentDetailsConfig";
import type {
  AdditionalGarmentConstructionStateV1,
  DesignSource,
  DesignStudioStageId,
  FabricAllocationState,
  FutureMeasurementStateV1,
} from "../types";
import type { CustomDetailCatalogInspection } from "./catalogHelpers";
import {
  garmentConstructionInclusionNote,
  SELECTED_DESIGN_PRICE_SUPPORTING_TEXT,
} from "./designPriceBreakdownPresentation";
import { resolveIndividualInboundShippingDisplay } from "./individualInboundShippingDisplay";
import type { FutureShippingStageResolution } from "./designStudioFutureShipping";
import { getStep8OrderSummaryRows } from "./designStudioFutureShipping";
import type { FutureDesignStudioSummary } from "./designStudioFutureSummary";
import { CUSTOM_DETAILS_CONSTRUCTION_GROUPS } from "./futureCustomDetailsCatalogue";
import type { FutureOrderCandidatePricingV1 } from "./futureOrderCandidate";
import type { WearerOrderMeasurementCompletion } from "./wearerOrder";
import {
  countRemainingCustomerRequiredMeasurementUnits,
  isSelectedMeasurementMethod,
  type MeasurementRequirementPlan,
} from "./measurementBlueprint";
import { PRICING_CURRENCY_SYMBOL } from "./money";

export const LIVE_ORDER_SUMMARY_HIDDEN_STAGES = ["summary", "payment"] as const;

export const shouldShowPersistentLiveOrderSummary = (
  stageId: DesignStudioStageId,
): boolean =>
  !(LIVE_ORDER_SUMMARY_HIDDEN_STAGES as readonly string[]).includes(stageId);

export const LIVE_ORDER_SUMMARY_HEADING = "Order Summary";
export const LIVE_ORDER_SUMMARY_PENDING_LABEL = "Not selected yet";
export const LIVE_ORDER_SUMMARY_NOT_COMPLETED_LABEL = "Not completed yet";
export const LIVE_ORDER_SUMMARY_OWN_DESIGN_TITLE = "Own Design Upload";
export const LIVE_ORDER_SUMMARY_OWN_DESIGN_DETAIL = "Uploaded design selected";
export const LIVE_ORDER_SUMMARY_STANDARD_SHIPPING_LABEL =
  "Lagos → Eindhoven Standard Shipping";
export const LIVE_ORDER_SUMMARY_CONSTRUCTION_SUBTOTAL_LABEL =
  "Garment Subtotal";
export const LIVE_ORDER_SUMMARY_CONSTRUCTION_INCLUSION_NOTE =
  SELECTED_DESIGN_PRICE_SUPPORTING_TEXT;

export const LIVE_ORDER_SUMMARY_TOTAL_LABEL = "Total";
export const LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL = "Current Total";
/** @deprecated Use LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL. */
export const LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL =
  LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL;
export const LIVE_ORDER_SUMMARY_PERSONALIZED_ADDITIONS_SUBTOTAL_LABEL =
  "Personalized Additions Subtotal";

export type LiveOrderSummaryTotalStatus =
  | "exact"
  | "current"
  | "subtotal"
  | "quote_required"
  | "pending"
  | "hidden";

export interface LiveOrderSummaryConstructionOption {
  readonly id: string;
  readonly label: string;
  readonly amountLabel: string;
}

export interface LiveOrderSummaryLine {
  readonly id: string;
  readonly label: string;
  readonly detail: string | null;
  /** A second customer-facing status line, used when the primary detail is construction. */
  readonly supportingDetail?: string | null;
  /**
   * Assigned person's public name on a Garments Ordered row.
   * Set when the summary garment has a wearerLabel.
   */
  readonly wearerLabel?: string | null;
  /**
   * Assigned person's fit on a Garments Ordered row.
   * Set when the summary garment has a fitLabel.
   */
  readonly fitLabel?: string | null;
  readonly amountLabel: string | null;
  /** Canonical selected Design thumbnail, scoped to this exact occurrence. */
  readonly imageUrl?: string | null;
  /** Selected construction/customization rows owned by this exact garment. */
  readonly constructionOptions?: readonly LiveOrderSummaryConstructionOption[];
  /**
   * Stable physical occurrence identity for Edit/Remove from the live Summary.
   * Present on Garments Ordered lines (base and additional).
   */
  readonly focusGarmentKey?: string | null;
}

export interface LiveOrderSummarySectionFooter {
  readonly id: string;
  readonly label: string;
  readonly amountLabel: string;
  readonly amountCents: number;
  readonly note: string;
}

export interface LiveOrderSummarySubsection {
  readonly id: "additional_garments" | "additional_garment_fabrics";
  readonly title: string;
  /** Only the additional-garments subsection is an edit destination. */
  readonly editStage?: "custom_details" | "personalized_additions";
  /**
   * The exact Step 5 occurrence to bring into view when Fabric is missing.
   * A null target means focus the Additional Garment management section.
   */
  readonly focusGarmentKey?: string | null;
  readonly lines: readonly LiveOrderSummaryLine[];
}

export interface LiveOrderSummarySection {
  readonly id:
    | "garments"
    | "fabrics"
    | "design_style"
    | "construction"
    | "custom_details"
    | "style_and_options"
    | "personalized_additions"
    | "optional_extras"
    | "additional_clothes"
    | "measurements"
    | "delivery";
  readonly title: string;
  readonly editStage:
    | "garment_type"
    | "fabric"
    | "design_style"
    | "custom_details"
    | "personalized_additions"
    | "measurement"
    | "shipping"
    | null;
  /** Visible copy remains EDIT while the accessible name can be ownership-specific. */
  readonly editLabel?: string;
  /** Optional second edit destination (Style & Options → Custom Details). */
  readonly secondaryEditStage?: "custom_details" | null;
  readonly secondaryEditLabel?: string;
  readonly lines: readonly LiveOrderSummaryLine[];
  readonly subsections?: readonly LiveOrderSummarySubsection[];
  /** Prefer `footers` when multiple money rows are needed. */
  readonly footer?: LiveOrderSummarySectionFooter | null;
  readonly footers?: readonly LiveOrderSummarySectionFooter[];
}

export interface LiveOrderSummaryCostBreakdownLine {
  readonly label: string;
  readonly valueLabel: string;
  readonly amountCents: number | null;
  /** @deprecated The Lagos band is a priced line and is part of the total. */
  readonly included?: boolean;
}

export interface LiveOrderSummaryCostBreakdown {
  readonly subtotal: LiveOrderSummaryCostBreakdownLine;
  /** Individual Lagos→Eindhoven band. Omitted for Community and other batches. */
  readonly includedInboundShipping?: LiveOrderSummaryCostBreakdownLine | null;
  /** Omitted for a confirmed no-shipping collection method. */
  readonly shipping: LiveOrderSummaryCostBreakdownLine | null;
}

export interface LiveOrderSummaryView {
  readonly sections: readonly LiveOrderSummarySection[];
  readonly totalStatus: LiveOrderSummaryTotalStatus;
  readonly totalLabel: string;
  readonly totalValueLabel: string;
  readonly totalAmountCents: number | null;
  readonly quoteRequired: boolean;
  /** Derived from the released candidate and Step 8 resolution; never recalculated here. */
  readonly costBreakdown?: LiveOrderSummaryCostBreakdown | null;
}

const moneyFromCents = (cents: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${(cents / 100).toFixed(2)}`;

const isUncommittedSummaryLine = (line: LiveOrderSummaryLine): boolean => {
  if (
    line.label === LIVE_ORDER_SUMMARY_PENDING_LABEL ||
    line.label === LIVE_ORDER_SUMMARY_NOT_COMPLETED_LABEL
  ) {
    return true;
  }
  return (
    line.detail === LIVE_ORDER_SUMMARY_PENDING_LABEL && !line.amountLabel
  );
};

const committedLines = (
  lines: readonly LiveOrderSummaryLine[],
): LiveOrderSummaryLine[] =>
  lines.filter((line) => !isUncommittedSummaryLine(line));

const occurrenceLabels = (
  items: readonly { garmentKey: string; label: string }[],
): Map<string, string> => {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    counts.set(item.label, (counts.get(item.label) || 0) + 1);
  });
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  items.forEach((item) => {
    const prior = seen.get(item.label) || 0;
    seen.set(item.label, prior + 1);
    labels.set(
      item.garmentKey,
      (counts.get(item.label) || 0) > 1
        ? `${item.label} ${prior + 1}`
        : item.label,
    );
  });
  return labels;
};

const fabricByGarmentKey = (
  summary: FutureDesignStudioSummary,
): Map<string, { name: string; code: string }> => {
  const assigned = new Map<string, { name: string; code: string }>();
  summary.fabricSummary.forEach((allocation) => {
    allocation.garments.forEach((garment) => {
      assigned.set(garment.garmentKey, {
        name: allocation.fabricName,
        code: allocation.fabricCode,
      });
    });
  });
  return assigned;
};

const amountLabelForCustomDetail = (
  priceCents: number | null,
  priceStatus: "exact" | "evaluation_required" | "invalid",
): string => {
  if (priceStatus !== "exact") return "Price requires evaluation";
  return priceCents && priceCents > 0 ? moneyFromCents(priceCents) : "Included";
};

/**
 * Clothing-price construction groups: shirt and dress length/sleeve,
 * fastening, and skirt length.
 */
const isMainGarmentConstructionGroup = (selectionGroup: string): boolean =>
  (CUSTOM_DETAILS_CONSTRUCTION_GROUPS as ReadonlySet<string>).has(selectionGroup);

/**
 * Selected main-construction option labels, in catalogue component order.
 * Multiple clothing-price parts of one garment (for example Agbada shirt and
 * trouser) stay one identity. Empty when construction is unresolved.
 */
const mainConstructionIdentityLabel = (
  garment: FutureDesignStudioSummary["garmentSummary"][number],
): string | null => {
  const labels = garment.construction.flatMap((component) => {
    if (!isMainGarmentConstructionGroup(component.selectionGroup)) return [];
    const label = component.label.trim();
    return label.length > 0 ? [label] : [];
  });
  return labels.length > 0 ? labels.join(" + ") : null;
};

const constructionOptionsForGarment = (
  summary: FutureDesignStudioSummary,
  garment: FutureDesignStudioSummary["garmentSummary"][number],
  showAdditionalClothesCosts: boolean | undefined,
): LiveOrderSummaryConstructionOption[] => {
  // Main construction is the Garments Ordered identity. Do not repeat those
  // clothing-price choices here, including when custom details echo them.
  const baseConstructionKeys = new Set(
    garment.construction
      .filter((component) =>
        isMainGarmentConstructionGroup(component.selectionGroup),
      )
      .map((component) => `${component.selectionGroup}:${component.optionId}`),
  );
  return (
    summary.customDetailsSummary
      .find((group) => group.garmentKey === garment.garmentKey)
      ?.occurrences.filter(
        (occurrence) =>
          occurrence.selectionGroup !== "order_optional_detail" &&
          !isMainGarmentConstructionGroup(occurrence.selectionGroup) &&
          !baseConstructionKeys.has(
            `${occurrence.selectionGroup}:${occurrence.optionId}`,
          ) &&
          isCustomerAvailableCustomDetailSelectionGroup(
            occurrence.selectionGroup,
            { showAdditionalClothesCosts },
          ),
      )
      .map((occurrence) => ({
        id: `custom-detail-option:${occurrence.occurrenceKey}`,
        label: occurrence.optionLabel,
        amountLabel: amountLabelForCustomDetail(
          occurrence.priceCents,
          occurrence.priceStatus,
        ),
      })) || []
  );
};

const constructionOptionsForOrder = (
  summary: FutureDesignStudioSummary,
  showAdditionalClothesCosts: boolean | undefined,
): LiveOrderSummaryConstructionOption[] =>
  summary.customDetailsSummary
    .find((group) => group.garmentKey === "order")
    ?.occurrences.filter((occurrence) =>
      occurrence.selectionGroup !== "order_optional_detail" &&
      isCustomerAvailableCustomDetailSelectionGroup(
        occurrence.selectionGroup,
        { showAdditionalClothesCosts },
      ),
    )
    .map((occurrence) => ({
      id: `custom-detail-option:${occurrence.occurrenceKey}`,
      label: occurrence.optionLabel,
      amountLabel: amountLabelForCustomDetail(
        occurrence.priceCents,
        occurrence.priceStatus,
      ),
    })) || [];

type PersonalizedAdditionCategory =
  | "Monogram"
  | "Embroidery Design"
  | "Accessories";

const PERSONALIZED_ADDITION_CATEGORY_ORDER: readonly PersonalizedAdditionCategory[] = [
  "Monogram",
  "Embroidery Design",
  "Accessories",
];

const getPersonalizedAdditionCategory = (
  optionId: string,
): PersonalizedAdditionCategory => {
  if (optionId === "Name Monogram" || optionId === "Monogram Trimming") {
    return "Monogram";
  }
  if (optionId === "Embroidery") return "Embroidery Design";
  return "Accessories";
};

type PersonalizedAdditionOccurrence = {
  occurrenceKey: string;
  garmentKey: string;
  garmentLabel: string;
  optionId: string;
  optionLabel: string;
  priceStatus: "exact" | "evaluation_required" | "invalid";
  priceCents: number | null;
  personalizedText: string | null;
  monogramPlacementLabel: string | null;
};

const collectPersonalizedAdditionOccurrences = (
  summary: FutureDesignStudioSummary,
): PersonalizedAdditionOccurrence[] => {
  const garmentScopedSelections = summary.customDetailsSummary
    .filter((group) => group.garmentKey !== "order")
    .flatMap((group) =>
      group.occurrences
        .filter(
          (occurrence) =>
            occurrence.selectionGroup === "order_optional_detail",
        )
        .map((occurrence) => ({
          occurrenceKey: occurrence.occurrenceKey,
          garmentKey: occurrence.garmentKey,
          garmentLabel: group.garmentLabel || occurrence.garmentLabel,
          optionId: occurrence.optionId,
          optionLabel: occurrence.optionLabel,
          priceStatus: occurrence.priceStatus,
          priceCents: occurrence.priceCents,
          personalizedText: occurrence.personalizedText,
          monogramPlacementLabel: occurrence.monogramPlacementLabel ?? null,
        })),
    );
  const orderLevelSelections =
    summary.customDetailsSummary
      .find((group) => group.garmentKey === "order")
      ?.occurrences.filter(
        (occurrence) => occurrence.selectionGroup === "order_optional_detail",
      )
      .map((occurrence) => ({
        occurrenceKey: occurrence.occurrenceKey,
        garmentKey: occurrence.garmentKey,
        garmentLabel: occurrence.garmentLabel,
        optionId: occurrence.optionId,
        optionLabel: occurrence.optionLabel,
        priceStatus: occurrence.priceStatus,
        priceCents: occurrence.priceCents,
        personalizedText: occurrence.personalizedText,
        monogramPlacementLabel: occurrence.monogramPlacementLabel ?? null,
      })) || [];
  return [...garmentScopedSelections, ...orderLevelSelections];
};

const personalizedAdditionsSubtotalCents = (
  selections: readonly PersonalizedAdditionOccurrence[],
): number =>
  selections.reduce((total, occurrence) => {
    if (occurrence.priceStatus !== "exact" || !occurrence.priceCents) {
      return total;
    }
    return total + occurrence.priceCents;
  }, 0);

const formatPersonalizedAdditionDetail = (
  occurrence: PersonalizedAdditionOccurrence,
): string => {
  const base =
    occurrence.garmentKey === "order"
      ? occurrence.optionLabel
      : `${occurrence.garmentLabel}: ${occurrence.optionLabel}`;
  if (occurrence.optionId !== "Name Monogram") return base;
  const name = occurrence.personalizedText?.trim();
  const placement = occurrence.monogramPlacementLabel?.trim();
  if (!name && !placement) return base;
  const namePart = name ? ` “${name}”` : "";
  const placementPart = placement ? `, ${placement}` : "";
  return `${base}${namePart}${placementPart}`;
};

/**
 * Embroidery/monogram rows are garment-scoped; accessories remain order-level.
 * An exact price above zero shows that euro amount on the row. A zero or
 * missing exact price stays Included, and a non-exact price says it requires
 * evaluation. Personalized Additions Subtotal is the rollup at the bottom of
 * this section, after the line items.
 */
const personalizedAdditionLines = (
  selections: readonly PersonalizedAdditionOccurrence[],
): LiveOrderSummaryLine[] =>
  PERSONALIZED_ADDITION_CATEGORY_ORDER.flatMap((category) =>
    selections
      .filter(
        (occurrence) =>
          getPersonalizedAdditionCategory(occurrence.optionId) === category,
      )
      .map((occurrence) => ({
        id: `personalized-addition:${occurrence.occurrenceKey}`,
        label: category,
        detail: formatPersonalizedAdditionDetail(occurrence),
        amountLabel: amountLabelForCustomDetail(
          occurrence.priceCents,
          occurrence.priceStatus,
        ),
      })),
  );

const measurementStatusLine = (
  summary: FutureDesignStudioSummary,
  measurementState: FutureMeasurementStateV1,
  measurementPlan: MeasurementRequirementPlan,
  orderMeasurementCompletion?: WearerOrderMeasurementCompletion | null,
): LiveOrderSummaryLine => {
  const routeLabel = summary.measurementSummary.routeLabel;
  if (orderMeasurementCompletion) {
    if (orderMeasurementCompletion.complete) {
      return {
        id: "measurements-complete",
        label: `${routeLabel} — Complete`,
        detail: null,
        amountLabel: null,
      };
    }
    const remaining = orderMeasurementCompletion.remainingRequiredCount;
    return {
      id: "measurements-pending",
      label:
        remaining > 0
          ? `${routeLabel} — ${remaining} required measurements remaining`
          : `${routeLabel} — Incomplete`,
      detail: null,
      amountLabel: null,
    };
  }
  const route = measurementState.route;
  if (!isSelectedMeasurementMethod(route)) {
    return {
      id: "measurements",
      label: LIVE_ORDER_SUMMARY_NOT_COMPLETED_LABEL,
      detail: null,
      amountLabel: null,
    };
  }
  if (measurementState.calculationStatus === "complete") {
    return {
      id: "measurements-complete",
      label: `${routeLabel} — Complete`,
      detail: null,
      amountLabel: null,
    };
  }
  const remaining = countRemainingCustomerRequiredMeasurementUnits({
    plan: measurementPlan,
    state: measurementState,
  });
  return {
    id: "measurements-pending",
    label:
      remaining > 0
        ? `${routeLabel} — ${remaining} required measurements remaining`
        : `${routeLabel} — Incomplete`,
    detail: null,
    amountLabel: null,
  };
};

const constructionSubtotalFromSelectedGarments = (
  summary: FutureDesignStudioSummary,
): number | null => {
  const garments = summary.garmentSummary;
  if (garments.length === 0) return null;
  let totalCents = 0;
  for (const garment of garments) {
    if (garment.constructionTotalCents === null) {
      return null;
    }
    totalCents += garment.constructionTotalCents;
  }
  return totalCents;
};

const authoritativeConstructionSubtotalCents = (
  summary: FutureDesignStudioSummary,
): number | null => {
  if (summary.pricingSummary.garmentConstructionSubtotal !== null) {
    return Math.round(summary.pricingSummary.garmentConstructionSubtotal * 100);
  }
  return constructionSubtotalFromSelectedGarments(summary);
};

const knownSubtotalCents = ({
  summary,
  candidatePricing,
}: {
  summary: FutureDesignStudioSummary;
  candidatePricing: FutureOrderCandidatePricingV1 | null;
}): number | null => {
  if (candidatePricing?.selectedDesignTotalCents != null) {
    return candidatePricing.selectedDesignTotalCents;
  }
  if (summary.pricingSummary.selectedDesignPrice?.selectedDesignPrice != null) {
    return Math.round(
      summary.pricingSummary.selectedDesignPrice.selectedDesignPrice * 100,
    );
  }
  return authoritativeConstructionSubtotalCents(summary);
};

/**
 * Cents to add for the Individual Lagos band.
 * An exact candidate that already records the same separately charged amount
 * already contains it in `exactTotalCents`.
 */
const individualInboundChargeToAddCents = ({
  summary,
  candidatePricing,
  orderType,
  fulfilmentMethod = null,
}: {
  summary: FutureDesignStudioSummary;
  candidatePricing: FutureOrderCandidatePricingV1 | null;
  orderType?: string | null;
  fulfilmentMethod?: string | null;
}): number => {
  const inbound = resolveIndividualInboundShippingDisplay({
    orderType,
    physicalGarmentCount: summary.garmentSummary.length,
    fulfilmentMethod,
  });
  if (!inbound) {
    // A restored exact snapshot can still carry a delivery-era Lagos band.
    // Pickup drops that stored charge instead of keeping it in the total.
    const storedLagos = candidatePricing?.components.lagosToEindhovenShipping;
    if (
      fulfilmentMethod === "eindhoven_pickup" &&
      candidatePricing?.status === "exact" &&
      candidatePricing.exactTotalCents !== null &&
      storedLagos?.status === "separately_charged" &&
      typeof storedLagos.amountCents === "number" &&
      storedLagos.amountCents > 0
    ) {
      return -storedLagos.amountCents;
    }
    return 0;
  }
  const lagos = candidatePricing?.components.lagosToEindhovenShipping;
  if (
    candidatePricing?.status === "exact" &&
    candidatePricing.exactTotalCents !== null &&
    lagos?.status === "separately_charged" &&
    lagos.amountCents === inbound.amountCents
  ) {
    return 0;
  }
  return inbound.amountCents;
};

const resolveTotal = ({
  summary,
  candidatePricing,
  shippingResolution,
  orderType = null,
}: {
  summary: FutureDesignStudioSummary;
  candidatePricing: FutureOrderCandidatePricingV1 | null;
  shippingResolution: FutureShippingStageResolution | null;
  orderType?: string | null;
}): Pick<
  LiveOrderSummaryView,
  "totalStatus" | "totalLabel" | "totalValueLabel" | "totalAmountCents" | "quoteRequired"
> => {
  const quoteRequired = Boolean(shippingResolution?.quoteRequired);
  const inboundCents = individualInboundChargeToAddCents({
    summary,
    candidatePricing,
    orderType,
    fulfilmentMethod: shippingResolution?.state.fulfilmentMethod,
  });
  if (
    candidatePricing?.status === "exact" &&
    candidatePricing.exactTotalCents !== null
  ) {
    const totalAmountCents = candidatePricing.exactTotalCents + inboundCents;
    return {
      totalStatus: "exact",
      totalLabel: LIVE_ORDER_SUMMARY_TOTAL_LABEL,
      totalValueLabel: moneyFromCents(totalAmountCents),
      totalAmountCents,
      quoteRequired,
    };
  }
  const subtotalCents = knownSubtotalCents({ summary, candidatePricing });
  const projectedTotalCents =
    !quoteRequired &&
    shippingResolution?.projectedTotalCents !== null &&
    shippingResolution?.projectedTotalCents !== undefined
      ? shippingResolution.projectedTotalCents
      : null;
  if (projectedTotalCents !== null) {
    const totalAmountCents = projectedTotalCents + inboundCents;
    return {
      totalStatus: "current",
      totalLabel: LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL,
      totalValueLabel: moneyFromCents(totalAmountCents),
      totalAmountCents,
      quoteRequired,
    };
  }
  if (subtotalCents !== null) {
    const totalAmountCents = subtotalCents + inboundCents;
    return {
      totalStatus: quoteRequired ? "quote_required" : "subtotal",
      totalLabel: LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL,
      totalValueLabel: moneyFromCents(totalAmountCents),
      totalAmountCents,
      quoteRequired,
    };
  }
  if (summary.garmentSummary.length === 0 && !quoteRequired) {
    return {
      totalStatus: "hidden",
      totalLabel: "",
      totalValueLabel: "",
      totalAmountCents: null,
      quoteRequired: false,
    };
  }
  return {
    totalStatus: quoteRequired ? "quote_required" : "pending",
    totalLabel: LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL,
    totalValueLabel: "Pending",
    totalAmountCents: null,
    quoteRequired,
  };
};

const resolveCostBreakdown = ({
  summary,
  candidatePricing,
  shippingResolution,
  orderType = null,
}: {
  summary: FutureDesignStudioSummary;
  candidatePricing: FutureOrderCandidatePricingV1 | null;
  shippingResolution: FutureShippingStageResolution | null;
  orderType?: string | null;
}): LiveOrderSummaryCostBreakdown | null => {
  const method = shippingResolution?.state.fulfilmentMethod;
  const subtotalCents =
    candidatePricing?.selectedDesignTotalCents ??
    knownSubtotalCents({ summary, candidatePricing });
  const includedInbound = resolveIndividualInboundShippingDisplay({
    orderType,
    physicalGarmentCount: summary.garmentSummary.length,
    fulfilmentMethod: method,
  });
  const subtotal = subtotalCents === null
    ? null
    : {
        label: "Order Subtotal",
        valueLabel: moneyFromCents(subtotalCents),
        amountCents: subtotalCents,
      };
  const includedInboundShipping = includedInbound
    ? {
        label: includedInbound.label,
        valueLabel: moneyFromCents(includedInbound.amountCents),
        amountCents: includedInbound.amountCents,
      }
    : null;

  // Before Step 8 chooses a delivery method, only an Individual order with a
  // known subtotal shows the Lagos band. Community stays without a cost
  // breakdown. The band is added to the displayed total.
  if (!method) {
    if (!subtotal || !includedInboundShipping) return null;
    return {
      subtotal,
      includedInboundShipping,
      shipping: null,
    };
  }

  if (!subtotal) return null;

  const shippingCents =
    candidatePricing?.postEindhovenAdjustmentCents ??
    shippingResolution?.postEindhovenAdjustmentCents ??
    null;
  const isPickup = method === "eindhoven_pickup";
  const shipping =
    isPickup || shippingCents === 0
      ? null
      : {
          label: "Shipping",
          valueLabel: shippingResolution?.quoteRequired
            ? "Custom shipping quote required"
            : shippingCents === null
              ? "Pending"
              : moneyFromCents(shippingCents),
          amountCents: shippingCents,
        };

  return {
    subtotal,
    includedInboundShipping,
    shipping,
  };
};

export const projectDesignStudioLiveOrderSummary = ({
  summary,
  shippingResolution,
  candidatePricing,
  fabricAllocationState: _fabricAllocationState,
  measurementState,
  measurementPlan,
  orderMeasurementCompletion = null,
  designSource: _designSource,
  additionalConstructionState: _additionalConstructionState = null,
  catalogInspection: _catalogInspection = null,
  showAdditionalClothesCosts,
  orderType = null,
}: {
  summary: FutureDesignStudioSummary;
  shippingResolution: FutureShippingStageResolution | null;
  candidatePricing: FutureOrderCandidatePricingV1 | null;
  fabricAllocationState: FabricAllocationState;
  measurementState: FutureMeasurementStateV1;
  measurementPlan: MeasurementRequirementPlan;
  orderMeasurementCompletion?: WearerOrderMeasurementCompletion | null;
  designSource: DesignSource | null;
  additionalConstructionState?: AdditionalGarmentConstructionStateV1 | null;
  catalogInspection?: CustomDetailCatalogInspection | null;
  showAdditionalClothesCosts?: boolean;
  orderType?: string | null;
}): LiveOrderSummaryView => {
  const assignedFabric = fabricByGarmentKey(summary);
  const garmentItems = summary.garmentSummary.map((garment) => ({
    garmentKey: garment.garmentKey,
    label: garment.label,
  }));
  const garmentLabels = occurrenceLabels(garmentItems);

  const fabricLineFor = (
    garment: (typeof summary.garmentSummary)[number],
    includeMissingFabric: boolean,
  ): LiveOrderSummaryLine | null => {
    const fabric = assignedFabric.get(garment.garmentKey);
    if (!fabric && !includeMissingFabric) return null;
    return {
      id: `fabric-${garment.garmentKey}`,
      label: garmentLabels.get(garment.garmentKey) || garment.label,
      detail: fabric?.name || "Needs fabric",
      amountLabel: null,
    };
  };
  const fabricLines = committedLines(
    summary.garmentSummary
      .map((garment) => fabricLineFor(garment, false))
      .filter((line): line is LiveOrderSummaryLine => line !== null),
  );

  const designStyleByGarmentKey = new Map(
    (summary.designStyleOccurrences || []).map((occurrence) => [
      occurrence.garmentKey,
      occurrence,
    ] as const),
  );

  const constructionLineFor = (
    garment: (typeof summary.garmentSummary)[number],
  ): LiveOrderSummaryLine => {
    return {
      id: `construction-${garment.garmentKey}`,
      // The selected clothing-price construction is this line's identity.
      // Step 1 garment.label remains only when that choice is unresolved.
      label:
        mainConstructionIdentityLabel(garment) ||
        garmentLabels.get(garment.garmentKey) ||
        garment.label,
      detail: null,
      ...(garment.wearerLabel ? { wearerLabel: garment.wearerLabel } : {}),
      ...(garment.fitLabel ? { fitLabel: garment.fitLabel } : {}),
      amountLabel:
        garment.constructionTotalCents === null
          ? null
          : moneyFromCents(garment.constructionTotalCents),
      focusGarmentKey: garment.garmentKey,
    };
  };
  const baseConstructionLines = committedLines(
    summary.garmentSummary
      .filter((garment) => garment.role !== "additional")
      .map(constructionLineFor),
  );
  const additionalConstructionLines = committedLines(
    summary.garmentSummary
      .filter((garment) => garment.role === "additional")
      .map(constructionLineFor),
  );
  const orderConstructionOptions = constructionOptionsForOrder(
    summary,
    showAdditionalClothesCosts,
  );
  const styleAndOptionsLines = committedLines([
    ...summary.garmentSummary.map((garment) => {
      const occurrence = designStyleByGarmentKey.get(garment.garmentKey);
      const constructionOptions = constructionOptionsForGarment(
        summary,
        garment,
        showAdditionalClothesCosts,
      );
      return {
        id: `style-and-options-${garment.garmentKey}`,
        // The garment roster owns customer labels; Design Style runtime labels
        // use Fabric terminology and cannot substitute for Step 1 labels here.
        label: garmentLabels.get(garment.garmentKey) || garment.label,
        // Composition/applicability is catalogue metadata, not the selected Design name.
        detail: occurrence?.name || "Not selected",
        amountLabel: null,
        imageUrl: occurrence?.image || null,
        ...(constructionOptions.length > 0 ? { constructionOptions } : {}),
      };
    }),
    ...(orderConstructionOptions.length > 0
      ? [
          {
            id: "style-and-options-order",
            label: "Order Details",
            detail: null,
            amountLabel: null,
            constructionOptions: orderConstructionOptions,
          },
        ]
      : []),
  ]);
  const additionalGarments = summary.garmentSummary.filter(
    (garment) => garment.role === "additional",
  );

  const deliveryLines = shippingResolution?.state.fulfilmentMethod
    ? getStep8OrderSummaryRows(shippingResolution).map((row) => ({
        id: row.label,
        label: row.label,
        detail: row.value,
        amountLabel: null,
      }))
    : [];

  const measurementLine = measurementStatusLine(
    summary,
    measurementState,
    measurementPlan,
    orderMeasurementCompletion,
  );
  const personalizedSelections = collectPersonalizedAdditionOccurrences(summary);
  const selectedPersonalizedAdditions =
    personalizedAdditionLines(personalizedSelections);
  const personalizedSubtotalCents =
    personalizedAdditionsSubtotalCents(personalizedSelections);
  const constructionSubtotalCents =
    authoritativeConstructionSubtotalCents(summary);
  const constructionFooters: LiveOrderSummarySectionFooter[] = [];
  if (constructionSubtotalCents !== null) {
    constructionFooters.push({
      id: "construction-subtotal",
      label: LIVE_ORDER_SUMMARY_CONSTRUCTION_SUBTOTAL_LABEL,
      amountLabel: moneyFromCents(constructionSubtotalCents),
      amountCents: constructionSubtotalCents,
      note: garmentConstructionInclusionNote(orderType),
    });
  }
  const constructionFooter = constructionFooters[0] || null;
  const personalizedAdditionsFooter: LiveOrderSummarySectionFooter | null =
    personalizedSubtotalCents > 0
      ? {
          id: "personalized-additions-subtotal",
          label: LIVE_ORDER_SUMMARY_PERSONALIZED_ADDITIONS_SUBTOTAL_LABEL,
          amountLabel: moneyFromCents(personalizedSubtotalCents),
          amountCents: personalizedSubtotalCents,
          note: "",
        }
      : null;
  const firstAdditionalMissingFabric = summary.garmentSummary.find(
    (garment) =>
      garment.role === "additional" &&
      !assignedFabric.has(garment.garmentKey),
  );
  const additionalGarmentSubsection: LiveOrderSummarySubsection | null =
    additionalGarments.length === 0
      ? null
      : {
          id: "additional_garments",
          title: "Additional Garments",
          editStage: "personalized_additions",
          focusGarmentKey: firstAdditionalMissingFabric?.garmentKey || null,
          // Additional occurrences appear once in Garments Ordered, with the
          // existing exact-occurrence Step 4 correction route retained.
          lines: additionalConstructionLines,
        };

  const total = resolveTotal({
    summary,
    candidatePricing,
    shippingResolution,
    orderType,
  });
  const costBreakdown = resolveCostBreakdown({
    summary,
    candidatePricing,
    shippingResolution,
    orderType,
  });

  const allSections: LiveOrderSummarySection[] = [
    {
      id: "construction",
      title: "Garments Ordered",
      editStage: "garment_type",
      editLabel: "Edit base garments",
      lines: baseConstructionLines,
      footer: constructionFooter,
      footers: constructionFooters,
      ...(additionalGarmentSubsection
        ? { subsections: [additionalGarmentSubsection] }
        : {}),
    },
    ...(selectedPersonalizedAdditions.length > 0
      ? [{
          id: "personalized_additions" as const,
          title: "Personalized Additions",
          editStage: "personalized_additions" as const,
          lines: selectedPersonalizedAdditions,
          footer: personalizedAdditionsFooter,
          ...(personalizedAdditionsFooter
            ? { footers: [personalizedAdditionsFooter] }
            : {}),
        }]
      : []),
    {
      id: "fabrics",
      title: "Fabrics",
      editStage: "fabric",
      lines: fabricLines,
    },
    {
      id: "style_and_options",
      title: "Style & Options",
      editStage: "design_style",
      editLabel: "Edit Style",
      secondaryEditStage: "custom_details",
      secondaryEditLabel: "Edit Options",
      lines: styleAndOptionsLines,
    },
    {
      id: "measurements",
      title: "Measurements",
      editStage: "measurement",
      lines: isUncommittedSummaryLine(measurementLine) ? [] : [measurementLine],
    },
    {
      id: "delivery",
      title: "Delivery & Pickup",
      editStage: "shipping",
      lines: deliveryLines,
    },
  ];
  const sections = allSections.filter(
    (section) =>
      section.lines.length > 0 ||
      Boolean(section.subsections?.length) ||
      Boolean(section.footer) ||
      Boolean(section.footers?.length),
  );

  return {
    ...total,
    sections,
    costBreakdown,
  };
};
