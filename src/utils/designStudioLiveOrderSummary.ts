import { isCustomerAvailableCustomDetailSelectionGroup } from "../config/GarmentDetailsConfig";
import type {
  AdditionalGarmentConstructionStateV1,
  DesignSource,
  DesignStudioStageId,
  FabricAllocationState,
  FutureMeasurementStateV1,
} from "../types";
import type { CustomDetailCatalogInspection } from "./catalogHelpers";
import { SELECTED_DESIGN_PRICE_SUPPORTING_TEXT } from "./designPriceBreakdownPresentation";
import type { FutureShippingStageResolution } from "./designStudioFutureShipping";
import { getStep8OrderSummaryRows } from "./designStudioFutureShipping";
import type { FutureDesignStudioSummary } from "./designStudioFutureSummary";
import type { FutureOrderCandidatePricingV1 } from "./futureOrderCandidate";
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
export const LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL = "Current Subtotal";

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
  readonly amountLabel: string | null;
  /** Canonical selected Design thumbnail, scoped to this exact occurrence. */
  readonly imageUrl?: string | null;
  /** Selected construction/customization rows owned by this exact garment. */
  readonly constructionOptions?: readonly LiveOrderSummaryConstructionOption[];
  /**
   * Present only for an editable Additional Garment construction occurrence.
   * This preserves the stable occurrence identity through the Summary UI.
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
  readonly lines: readonly LiveOrderSummaryLine[];
  readonly subsections?: readonly LiveOrderSummarySubsection[];
  readonly footer?: LiveOrderSummarySectionFooter | null;
}

export interface LiveOrderSummaryCostBreakdownLine {
  readonly label: string;
  readonly valueLabel: string;
  readonly amountCents: number | null;
}

export interface LiveOrderSummaryCostBreakdown {
  readonly subtotal: LiveOrderSummaryCostBreakdownLine;
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

const constructionOptionsForGarment = (
  summary: FutureDesignStudioSummary,
  garment: FutureDesignStudioSummary["garmentSummary"][number],
  showAdditionalClothesCosts: boolean | undefined,
): LiveOrderSummaryConstructionOption[] => {
  const baseSelectionKeys = new Set<string>();
  const baseOptions = garment.construction.map((component) => {
    const selectionKey = `${component.selectionGroup}:${component.optionId}`;
    baseSelectionKeys.add(selectionKey);
    return {
      id: `construction-option:${garment.garmentKey}:${component.componentKey}`,
      label: component.label,
      // Base construction belongs in Garment Construction. These selected
      // base options add no second charge in Construction Options.
      amountLabel: "Included",
    };
  });
  const selectedCustomDetails =
    summary.customDetailsSummary
      .find((group) => group.garmentKey === garment.garmentKey)
      ?.occurrences.filter(
        (occurrence) =>
          !baseSelectionKeys.has(
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
      })) || [];
  return [...baseOptions, ...selectedCustomDetails];
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

/**
 * Step 5 decorative selections are intentionally order-level. The Future
 * Summary already projects their authoritative pricing rows under the `order`
 * owner; this only gives those rows their own customer-facing section.
 */
const personalizedAdditionLines = (
  summary: FutureDesignStudioSummary,
): LiveOrderSummaryLine[] => {
  const orderLevelSelections =
    summary.customDetailsSummary
      .find((group) => group.garmentKey === "order")
      ?.occurrences.filter(
        (occurrence) => occurrence.selectionGroup === "order_optional_detail",
      ) || [];

  return PERSONALIZED_ADDITION_CATEGORY_ORDER.flatMap((category) =>
    orderLevelSelections
      .filter(
        (occurrence) =>
          getPersonalizedAdditionCategory(occurrence.optionId) === category,
      )
      .map((occurrence) => ({
        id: `personalized-addition:${occurrence.occurrenceKey}`,
        label: category,
        detail: occurrence.optionLabel,
        amountLabel: amountLabelForCustomDetail(
          occurrence.priceCents,
          occurrence.priceStatus,
        ),
      })),
  );
};

const measurementStatusLine = (
  summary: FutureDesignStudioSummary,
  measurementState: FutureMeasurementStateV1,
  measurementPlan: MeasurementRequirementPlan,
): LiveOrderSummaryLine => {
  const route = measurementState.route;
  if (!isSelectedMeasurementMethod(route)) {
    return {
      id: "measurements",
      label: LIVE_ORDER_SUMMARY_NOT_COMPLETED_LABEL,
      detail: null,
      amountLabel: null,
    };
  }
  const routeLabel = summary.measurementSummary.routeLabel;
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

const resolveTotal = ({
  summary,
  candidatePricing,
  shippingResolution,
}: {
  summary: FutureDesignStudioSummary;
  candidatePricing: FutureOrderCandidatePricingV1 | null;
  shippingResolution: FutureShippingStageResolution | null;
}): Pick<
  LiveOrderSummaryView,
  "totalStatus" | "totalLabel" | "totalValueLabel" | "totalAmountCents" | "quoteRequired"
> => {
  const quoteRequired = Boolean(shippingResolution?.quoteRequired);
  if (
    candidatePricing?.status === "exact" &&
    candidatePricing.exactTotalCents !== null
  ) {
    return {
      totalStatus: "exact",
      totalLabel: LIVE_ORDER_SUMMARY_TOTAL_LABEL,
      totalValueLabel: moneyFromCents(candidatePricing.exactTotalCents),
      totalAmountCents: candidatePricing.exactTotalCents,
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
    return {
      totalStatus: "current",
      totalLabel: LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL,
      totalValueLabel: moneyFromCents(projectedTotalCents),
      totalAmountCents: projectedTotalCents,
      quoteRequired,
    };
  }
  if (subtotalCents !== null) {
    return {
      totalStatus: quoteRequired ? "quote_required" : "subtotal",
      totalLabel: LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL,
      totalValueLabel: moneyFromCents(subtotalCents),
      totalAmountCents: subtotalCents,
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
    totalLabel: LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL,
    totalValueLabel: "Pending",
    totalAmountCents: null,
    quoteRequired,
  };
};

const resolveCostBreakdown = ({
  summary,
  candidatePricing,
  shippingResolution,
}: {
  summary: FutureDesignStudioSummary;
  candidatePricing: FutureOrderCandidatePricingV1 | null;
  shippingResolution: FutureShippingStageResolution | null;
}): LiveOrderSummaryCostBreakdown | null => {
  const method = shippingResolution?.state.fulfilmentMethod;
  if (!method) return null;

  const subtotalCents =
    candidatePricing?.selectedDesignTotalCents ??
    knownSubtotalCents({ summary, candidatePricing });
  if (subtotalCents === null) return null;

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
    subtotal: {
      label: "Order Subtotal",
      valueLabel: moneyFromCents(subtotalCents),
      amountCents: subtotalCents,
    },
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
  designSource: _designSource,
  additionalConstructionState: _additionalConstructionState = null,
  catalogInspection: _catalogInspection = null,
  showAdditionalClothesCosts,
}: {
  summary: FutureDesignStudioSummary;
  shippingResolution: FutureShippingStageResolution | null;
  candidatePricing: FutureOrderCandidatePricingV1 | null;
  fabricAllocationState: FabricAllocationState;
  measurementState: FutureMeasurementStateV1;
  measurementPlan: MeasurementRequirementPlan;
  designSource: DesignSource | null;
  additionalConstructionState?: AdditionalGarmentConstructionStateV1 | null;
  catalogInspection?: CustomDetailCatalogInspection | null;
  showAdditionalClothesCosts?: boolean;
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
  const designStyleLines = committedLines(
    summary.garmentSummary.map((garment) => {
      const occurrence = designStyleByGarmentKey.get(garment.garmentKey);
      return {
        id: `design-style-${garment.garmentKey}`,
        // The garment roster owns customer labels; Design Style runtime labels
        // use Fabric terminology and cannot substitute for Step 1 labels here.
        label: garmentLabels.get(garment.garmentKey) || garment.label,
        // Composition/applicability is catalogue metadata, not the selected Design name.
        detail: occurrence?.name || "Not selected",
        amountLabel: null,
        imageUrl: occurrence?.image || null,
      };
    }),
  );

  const constructionLineFor = (
    garment: (typeof summary.garmentSummary)[number],
  ): LiveOrderSummaryLine => {
    return {
      id: `construction-${garment.garmentKey}`,
      label: garmentLabels.get(garment.garmentKey) || garment.label,
      detail: null,
      amountLabel:
        garment.constructionTotalCents === null
          ? null
          : moneyFromCents(garment.constructionTotalCents),
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
      .map((garment) => ({
        ...constructionLineFor(garment),
        focusGarmentKey: garment.garmentKey,
      })),
  );
  const constructionOptionLines = committedLines([
    ...summary.garmentSummary.map((garment) => ({
      id: `construction-options-${garment.garmentKey}`,
      label: garmentLabels.get(garment.garmentKey) || garment.label,
      detail: null,
      amountLabel: null,
      constructionOptions: constructionOptionsForGarment(
        summary,
        garment,
        showAdditionalClothesCosts,
      ),
    })),
    ...(constructionOptionsForOrder(summary, showAdditionalClothesCosts).length > 0
      ? [{
          id: "construction-options-order",
          label: "Order Details",
          detail: null,
          amountLabel: null,
          constructionOptions: constructionOptionsForOrder(
            summary,
            showAdditionalClothesCosts,
          ),
        }]
      : []),
  ]).filter((line) => (line.constructionOptions?.length || 0) > 0);
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
  );
  const selectedPersonalizedAdditions = personalizedAdditionLines(summary);
  const constructionSubtotalCents =
    authoritativeConstructionSubtotalCents(summary);
  const constructionFooter: LiveOrderSummarySectionFooter | null =
    constructionSubtotalCents === null
      ? null
      : {
          id: "construction-subtotal",
          label: LIVE_ORDER_SUMMARY_CONSTRUCTION_SUBTOTAL_LABEL,
          amountLabel: moneyFromCents(constructionSubtotalCents),
          amountCents: constructionSubtotalCents,
          note: LIVE_ORDER_SUMMARY_CONSTRUCTION_INCLUSION_NOTE,
        };
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
  });
  const costBreakdown = resolveCostBreakdown({
    summary,
    candidatePricing,
    shippingResolution,
  });

  const allSections: LiveOrderSummarySection[] = [
    {
      id: "construction",
      title: "Garments Ordered",
      editStage: "garment_type",
      editLabel: "Edit base garments",
      lines: baseConstructionLines,
      footer: constructionFooter,
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
        }]
      : []),
    {
      id: "fabrics",
      title: "Fabrics",
      editStage: "fabric",
      lines: fabricLines,
    },
    {
      id: "design_style",
      title: "Design Style",
      editStage: "design_style",
      lines: designStyleLines,
    },
    {
      id: "custom_details",
      title: "Construction Options",
      editStage: "custom_details",
      lines: constructionOptionLines,
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
      Boolean(section.footer),
  );

  return {
    ...total,
    sections,
    costBreakdown,
  };
};
