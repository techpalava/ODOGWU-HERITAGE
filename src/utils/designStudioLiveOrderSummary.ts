import {
  isCustomerAvailableCustomDetailSelectionGroup,
  isCustomerFacingAdditionalClothesCostGroup,
} from "../config/GarmentDetailsConfig";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
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
import { isSelectedMeasurementRiskRoute } from "./measurementBlueprint";
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
  "Garment Construction Subtotal";
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

export interface LiveOrderSummaryLine {
  readonly id: string;
  readonly label: string;
  readonly detail: string | null;
  readonly amountLabel: string | null;
}

export interface LiveOrderSummarySectionFooter {
  readonly id: string;
  readonly label: string;
  readonly amountLabel: string;
  readonly amountCents: number;
  readonly note: string;
}

export interface LiveOrderSummarySection {
  readonly id:
    | "garments"
    | "fabrics"
    | "design_style"
    | "construction"
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
    | "measurement"
    | "shipping"
    | null;
  readonly lines: readonly LiveOrderSummaryLine[];
  readonly footer?: LiveOrderSummarySectionFooter | null;
}

export interface LiveOrderSummaryView {
  readonly sections: readonly LiveOrderSummarySection[];
  readonly totalStatus: LiveOrderSummaryTotalStatus;
  readonly totalLabel: string;
  readonly totalValueLabel: string;
  readonly totalAmountCents: number | null;
  readonly quoteRequired: boolean;
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

const constructionLabel = (
  summary: FutureDesignStudioSummary,
  garmentKey: string,
): string | null => {
  const garment = summary.garmentSummary.find(
    (candidate) => candidate.garmentKey === garmentKey,
  );
  if (!garment) return null;
  if (garment.construction.length === 0) return null;
  return garment.construction.map((component) => component.label).join(", ");
};

const measurementStatusLine = (
  summary: FutureDesignStudioSummary,
  measurementState: FutureMeasurementStateV1,
): LiveOrderSummaryLine => {
  const route = measurementState.route;
  if (!isSelectedMeasurementRiskRoute(route)) {
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
  const remaining = measurementState.diagnostics.filter(
    (diagnostic) => diagnostic.code === "required_measurement_missing",
  ).length;
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

const extraConstructionPresentation = ({
  garmentKey,
  additionalConstructionState,
  catalogInspection,
}: {
  garmentKey: string;
  additionalConstructionState: AdditionalGarmentConstructionStateV1 | null;
  catalogInspection: CustomDetailCatalogInspection | null;
}): { label: string | null; amountCents: number | null } => {
  const resolution = additionalConstructionState?.byGarmentKey[garmentKey];
  if (!resolution || resolution.status !== "resolved") {
    return { label: null, amountCents: null };
  }
  const labels = resolution.components.map(
    (component) =>
      catalogInspection?.byOptionId.get(component.optionId)?.option?.label ||
      null,
  );
  const resolved = labels.filter((label): label is string => Boolean(label));
  return {
    label: resolved.length > 0 ? resolved.join(", ") : null,
    amountCents: resolution.totalPriceCents,
  };
};

export const projectDesignStudioLiveOrderSummary = ({
  summary,
  shippingResolution,
  candidatePricing,
  fabricAllocationState,
  measurementState,
  designSource,
  additionalConstructionState = null,
  catalogInspection = null,
  showAdditionalClothesCosts,
}: {
  summary: FutureDesignStudioSummary;
  shippingResolution: FutureShippingStageResolution | null;
  candidatePricing: FutureOrderCandidatePricingV1 | null;
  fabricAllocationState: FabricAllocationState;
  measurementState: FutureMeasurementStateV1;
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
  const pendingExtraKey = fabricAllocationState.awaitingFabricForPendingGarment
    ? fabricAllocationState.pendingFabricGarment?.garmentKey || null
    : null;
  const extraAssignments = fabricAllocationState.fabricAllocations.flatMap(
    (allocation) =>
      allocation.garmentAssignments.filter(
        (assignment) =>
          assignment.sourceRole === "additional" &&
          assignment.garmentKey !== pendingExtraKey,
      ),
  );
  const extraItems = extraAssignments.map((assignment) => ({
    garmentKey: assignment.garmentKey,
    label: getFabricGarmentLabel(assignment.garmentType),
  }));
  const extraLabels = occurrenceLabels(extraItems);

  const garmentLines = committedLines(
    summary.garmentSummary.map((garment) => ({
      id: garment.garmentKey,
      label: garmentLabels.get(garment.garmentKey) || garment.label,
      detail: null,
      amountLabel: null,
    })),
  );

  const fabricLines: LiveOrderSummaryLine[] = [
    ...summary.garmentSummary.flatMap((garment) => {
      const fabric = assignedFabric.get(garment.garmentKey);
      if (!fabric) return [];
      return [
        {
          id: `fabric-${garment.garmentKey}`,
          label: garmentLabels.get(garment.garmentKey) || garment.label,
          detail: fabric.name,
          amountLabel: null,
        },
      ];
    }),
    ...extraAssignments.flatMap((assignment) => {
      const fabric = assignedFabric.get(assignment.garmentKey);
      if (!fabric) return [];
      return [
        {
          id: `fabric-${assignment.garmentKey}`,
          label:
            extraLabels.get(assignment.garmentKey) ||
            getFabricGarmentLabel(assignment.garmentType),
          detail: fabric.name,
          amountLabel: null,
        },
      ];
    }),
  ];

  const designStyleLines = committedLines(
    summary.designStyleSummary
      ? [
          {
            id: summary.designStyleSummary.styleId,
            label: summary.designStyleSummary.name,
            detail: summary.designStyleSummary.compositionLabel,
            amountLabel: null,
          },
        ]
      : designSource?.kind === "uploaded"
        ? [
            {
              id: designSource.sourceKey,
              label: LIVE_ORDER_SUMMARY_OWN_DESIGN_TITLE,
              detail: LIVE_ORDER_SUMMARY_OWN_DESIGN_DETAIL,
              amountLabel: null,
            },
          ]
        : [],
  );

  const constructionLines = committedLines(
    summary.garmentSummary.map((garment) => ({
      id: `construction-${garment.garmentKey}`,
      label: garmentLabels.get(garment.garmentKey) || garment.label,
      detail: constructionLabel(summary, garment.garmentKey),
      amountLabel:
        garment.constructionTotalCents === null
          ? null
          : moneyFromCents(garment.constructionTotalCents),
    })),
  );

  const extraLines: LiveOrderSummaryLine[] = extraAssignments
    .filter((assignment) => assignedFabric.has(assignment.garmentKey))
    .map((assignment) => {
      const fabric = assignedFabric.get(assignment.garmentKey);
      const construction = extraConstructionPresentation({
        garmentKey: assignment.garmentKey,
        additionalConstructionState,
        catalogInspection,
      });
      const details = [fabric?.name, construction.label].filter(Boolean);
      return {
        id: assignment.garmentKey,
        label:
          extraLabels.get(assignment.garmentKey) ||
          getFabricGarmentLabel(assignment.garmentType),
        detail: details.join(" · ") || null,
        amountLabel:
          construction.amountCents === null
            ? null
            : moneyFromCents(construction.amountCents),
      };
    });

  const additionalClothesLines: LiveOrderSummaryLine[] = summary.customDetailsSummary.flatMap((group) =>
    group.occurrences
      .filter((occurrence) =>
        isCustomerFacingAdditionalClothesCostGroup(occurrence.selectionGroup),
      )
      .filter((occurrence) =>
        isCustomerAvailableCustomDetailSelectionGroup(
          occurrence.selectionGroup,
          { showAdditionalClothesCosts },
        ),
      )
      .map((occurrence) => ({
        id: occurrence.occurrenceKey,
        label: occurrence.optionLabel,
        detail: occurrence.garmentLabel,
        amountLabel:
          occurrence.priceStatus === "evaluation_required"
            ? "Price requires evaluation"
            : occurrence.priceCents === null
              ? null
              : occurrence.priceCents === 0
                ? "Included"
                : moneyFromCents(occurrence.priceCents),
      })),
  );

  const deliveryLines = shippingResolution?.state.fulfilmentMethod
    ? getStep8OrderSummaryRows(shippingResolution).map((row) => ({
        id: row.label,
        label: row.label,
        detail: row.value,
        amountLabel: null,
      }))
    : [];

  const measurementLine = measurementStatusLine(summary, measurementState);
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
  const visibleConstructionLines = constructionLines.filter(
    (line) => line.amountLabel || line.detail,
  );

  const total = resolveTotal({
    summary,
    candidatePricing,
    shippingResolution,
  });

  const allSections: LiveOrderSummarySection[] = [
    {
      id: "construction",
      title: "Garment Construction",
      editStage: "garment_type",
      lines: visibleConstructionLines,
      footer: constructionFooter,
    },
    {
      id: "optional_extras",
      title: "Optional Extra Garments",
      editStage: "custom_details",
      lines: extraLines,
    },
    {
      id: "additional_clothes",
      title: "Additional Clothes Costs",
      editStage: "custom_details",
      lines: additionalClothesLines,
    },
    {
      id: "garments",
      title: "Garments",
      editStage: "garment_type",
      lines: constructionLines.length > 0 ? [] : garmentLines,
    },
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
    (section) => section.lines.length > 0 || Boolean(section.footer),
  );

  return {
    ...total,
    sections,
  };
};
