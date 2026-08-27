import { CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE } from "../config/GarmentDetailsConfig";
import { resolveCustomDetailPhysicalComponents } from "../config/CustomDetailPhysicalComponentConfig";
import { createStyleBaseGarmentSpec } from "../config/StyleFabricCapacityConfig";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type {
  AiTryOnWorkflowStateV1,
  CanonicalPhysicalGarmentType,
  FabricAllocationState,
  FutureMeasurementStateV1,
  FutureMeasurementValueV1,
  GarmentScopedCustomDetailInputsV1,
  GarmentTypeStepSelection,
  StyleCategory,
} from "../types";
import type { CustomDetailCatalogInspection } from "./catalogHelpers";
import type {
  FabricAllocationPricingResult,
  ResolvedFabricAllocationPricing,
} from "./fabricAllocationPricing";
import type { FutureFabricStageCompletion } from "./designStudioFutureFabricStage";
import {
  getFutureDesignStyleCompositionLabel,
  type FutureDesignStyleSelectionResolution,
} from "./designStudioFutureDesignStyle";
import {
  calculateSelectedDesignPrice,
  type AllInclusiveSelectedDesignPriceBreakdown,
  type AuthoritativeDesignPricing,
} from "./designPricing";
import {
  type GarmentScopedCustomDetailsCompletionResult,
  type GarmentScopedCustomDetailsPricingResult,
  type GarmentScopedCustomDetailsReconciliationResult,
} from "./garmentScopedCustomDetailsDomain";
import { enumerateGarmentScopedCustomDetailInputs } from "./garmentScopedCustomDetailInputsState";
import { fromCanonicalCentimetres, getResolvedMeasurementValue, isSelectedMeasurementRiskRoute, MEASUREMENT_RISK_ROUTE_LABELS, projectMeasurementRequirementsForPresentation, roundMeasurementDisplayValue, type MeasurementRequirementPlan, type PlannedMeasurementRequirement } from "./measurementBlueprint";

export type FutureDesignStudioSummaryStatus =
  | "ready"
  | "incomplete"
  | "invalid"
  | "pricing_pending"
  | "measurement_calculation_pending"
  | "profile_mapping_pending";

export type FutureDesignStudioSummarySection =
  | "garments"
  | "fabrics"
  | "design_style"
  | "custom_details"
  | "ai_try_on"
  | "measurements"
  | "pricing";

export interface FutureDesignStudioSummaryBlocker {
  code: string;
  section: FutureDesignStudioSummarySection;
  message: string;
  garmentKey?: string;
  allocationId?: string;
}

export interface FutureSummaryConstructionOccurrence {
  componentKey: string;
  optionId: string;
  label: string;
  priceCents: number;
}

export interface FutureSummaryGarment {
  garmentKey: string;
  garmentType: CanonicalPhysicalGarmentType;
  label: string;
  role: "main" | "additional";
  demographic: GarmentTypeStepSelection["demographic"];
  fabricUnits: number;
  physicalComponents: Array<{
    garmentKey: string;
    garmentType: CanonicalPhysicalGarmentType;
    label: string;
  }>;
  construction: FutureSummaryConstructionOccurrence[];
  constructionTotalCents: number | null;
}

export interface FutureSummaryFabricAllocation {
  allocationId: string;
  fabricCode: string;
  fabricName: string;
  availability: "available" | "unavailable" | "missing";
  capacityUnits: number;
  materialPrice: number | null;
  pricingTreatment: "included_in_garment_construction";
  garments: Array<{
    garmentKey: string;
    garmentType: string;
    label: string;
  }>;
}

export interface FutureSummaryDesignStyle {
  styleId: string;
  name: string;
  image: string | null;
  demographic: string;
  compositionLabel: string;
}

export interface FutureSummaryCustomDetailOccurrence {
  occurrenceKey: string;
  garmentKey: string;
  garmentLabel: string;
  selectionGroup: string;
  selectionGroupTitle: string;
  optionId: string;
  optionLabel: string;
  priceStatus: "exact" | "evaluation_required" | "invalid";
  priceCents: number | null;
  personalizedText: string | null;
}

export interface FutureSummaryAiTryOn {
  status: "completed" | "skipped" | "unavailable" | "retry_required" | "incomplete";
  label: string;
}

export interface FutureSummaryMeasurementValue {
  requirementKey: string;
  measurementId: string;
  garmentKey: string | null;
  label: string;
  formattedValue: string;
  value: number;
  unit: FutureMeasurementStateV1["unit"];
  provenance: FutureMeasurementValueV1["provenance"];
  profileId: string | null;
  averageFactor: number | null;
}

export interface FutureSummaryMeasurements {
  route: FutureMeasurementStateV1["route"];
  routeLabel: string;
  unit: FutureMeasurementStateV1["unit"];
  shared: FutureSummaryMeasurementValue[];
  byGarment: Array<{
    garmentKey: string;
    garmentLabel: string;
    values: FutureSummaryMeasurementValue[];
  }>;
}

export interface FutureSummaryPricing {
  status: "exact" | "pending" | "invalid";
  garmentConstructionSubtotal: number | null;
  customDetailsExactSubtotal: number;
  selectedDesignPrice: AllInclusiveSelectedDesignPriceBreakdown | null;
}

export interface FutureDesignStudioSummary {
  status: FutureDesignStudioSummaryStatus;
  blockers: FutureDesignStudioSummaryBlocker[];
  garmentSummary: FutureSummaryGarment[];
  fabricSummary: FutureSummaryFabricAllocation[];
  designStyleSummary: FutureSummaryDesignStyle | null;
  customDetailsSummary: Array<{
    garmentKey: string;
    garmentLabel: string;
    occurrences: FutureSummaryCustomDetailOccurrence[];
  }>;
  aiTryOnSummary: FutureSummaryAiTryOn;
  measurementSummary: FutureSummaryMeasurements;
  pricingSummary: FutureSummaryPricing;
}

export interface FutureDesignStudioSummaryInput {
  garmentTypeSelection: GarmentTypeStepSelection;
  catalogInspection: CustomDetailCatalogInspection;
  fabricAllocationState: FabricAllocationState;
  fabricCompletion: FutureFabricStageCompletion;
  materialPricing: FabricAllocationPricingResult | null;
  designStyleSelection: FutureDesignStyleSelectionResolution;
  customDetailsReconciliation: GarmentScopedCustomDetailsReconciliationResult | null;
  customDetailsCompletion: GarmentScopedCustomDetailsCompletionResult | null;
  customDetailsPricing: GarmentScopedCustomDetailsPricingResult | null;
  personalizedInputs: GarmentScopedCustomDetailInputsV1 | null;
  aiTryOnWorkflow: AiTryOnWorkflowStateV1;
  measurementPlan: MeasurementRequirementPlan;
  measurementState: FutureMeasurementStateV1;
  basePricing: AuthoritativeDesignPricing | null;
}

const getPhysicalSubjectLabel = (
  parentType: CanonicalPhysicalGarmentType,
  componentType: CanonicalPhysicalGarmentType,
): string =>
  parentType === componentType
    ? getFabricGarmentLabel(componentType)
    : `${getFabricGarmentLabel(parentType)} - ${getFabricGarmentLabel(componentType)}`;

const getAiTryOnSummary = (
  workflow: AiTryOnWorkflowStateV1,
): FutureSummaryAiTryOn => {
  if (workflow.status === "completed") {
    return { status: "completed", label: "Completed" };
  }
  if (workflow.status === "skipped") {
    return { status: "skipped", label: "Skipped by choice" };
  }
  if (workflow.status === "unavailable") {
    return { status: "unavailable", label: "Currently unavailable" };
  }
  if (workflow.status === "failed" || workflow.status === "stale") {
    return { status: "retry_required", label: "Retry required" };
  }
  return { status: "incomplete", label: "Not completed" };
};

const getMeasurementValue = (
  state: FutureMeasurementStateV1,
  requirement: PlannedMeasurementRequirement,
) => getResolvedMeasurementValue(state, requirement);

const getMeasurementRouteLabel = (
  route: FutureMeasurementStateV1["route"],
): string =>
  isSelectedMeasurementRiskRoute(route)
    ? MEASUREMENT_RISK_ROUTE_LABELS[route]
    : "Not selected";

const getSummaryStatus = ({
  blockers,
  customDetailsCompletion,
  measurementState,
}: {
  blockers: readonly FutureDesignStudioSummaryBlocker[];
  customDetailsCompletion: GarmentScopedCustomDetailsCompletionResult | null;
  measurementState: FutureMeasurementStateV1;
}): FutureDesignStudioSummaryStatus => {
  if (
    measurementState.calculationStatus === "profile_mapping_pending" ||
    measurementState.diagnostics.some(
      (diagnostic) => diagnostic.code === "measurement_profile_unmapped",
    )
  ) {
    return "profile_mapping_pending";
  }
  if (
    blockers.some((blocker) =>
      ["garments", "fabrics", "design_style", "custom_details", "measurements", "pricing"].includes(
        blocker.section,
      ) && blocker.code.includes("INVALID"),
    ) ||
    customDetailsCompletion?.status === "invalid" ||
    measurementState.calculationStatus === "invalid"
  ) {
    return "invalid";
  }
  const nonPricingBlockers = blockers.filter(
    (blocker) => blocker.code !== "CUSTOM_DETAIL_PRICE_EVALUATION_REQUIRED",
  );
  if (
    nonPricingBlockers.length === 0 &&
    customDetailsCompletion?.status === "pricing_pending"
  ) {
    return "pricing_pending";
  }
  return blockers.length === 0 ? "ready" : "incomplete";
};

const mapGarments = ({
  garmentTypeSelection,
  catalogInspection,
  fabricAllocationState,
  blockers,
}: Pick<
  FutureDesignStudioSummaryInput,
  "garmentTypeSelection" | "catalogInspection" | "fabricAllocationState"
> & { blockers: FutureDesignStudioSummaryBlocker[] }): FutureSummaryGarment[] =>
  garmentTypeSelection.garmentTypes.map((garmentType) => {
    const garmentKey = createStyleBaseGarmentSpec(garmentType).key;
    const allocationAssignment = fabricAllocationState.fabricAllocations
      .flatMap((allocation) => allocation.garmentAssignments)
      .find((assignment) => assignment.garmentKey === garmentKey);
    const construction = garmentTypeSelection.constructionByGarment[garmentType];
    const physicalResolution = resolveCustomDetailPhysicalComponents({
      parentGarmentKey: garmentKey,
      garmentType,
    });
    if (construction?.status !== "resolved") {
      blockers.push({
        code: "GARMENT_CONSTRUCTION_INVALID",
        section: "garments",
        message: `${getFabricGarmentLabel(garmentType)} construction needs review.`,
        garmentKey,
      });
    }
    if (physicalResolution.status !== "resolved") {
      blockers.push({
        code: "GARMENT_COMPONENT_INVALID",
        section: "garments",
        message: `${getFabricGarmentLabel(garmentType)} components could not be resolved.`,
        garmentKey,
      });
    }
    const constructionOccurrences =
      construction?.status === "resolved"
        ? construction.components.map((component) => {
            const option = catalogInspection.byOptionId.get(component.optionId)?.option;
            if (!option) {
              blockers.push({
                code: "GARMENT_CONSTRUCTION_PRICE_INVALID",
                section: "garments",
                message: `${getFabricGarmentLabel(garmentType)} construction pricing is unavailable.`,
                garmentKey,
              });
            }
            return {
              componentKey: component.componentKey,
              optionId: component.optionId,
              label: option?.label || "Construction option unavailable",
              priceCents: component.priceCents,
            };
          })
        : [];
    return {
      garmentKey,
      garmentType,
      label: getFabricGarmentLabel(garmentType),
      role: allocationAssignment?.sourceRole || "main",
      demographic: garmentTypeSelection.demographic,
      fabricUnits:
        allocationAssignment?.fabricUnits ||
        createStyleBaseGarmentSpec(garmentType).fabricUnits,
      physicalComponents:
        physicalResolution.status === "resolved"
          ? physicalResolution.components.map((component) => ({
              garmentKey: component.garmentKey,
              garmentType: component.garmentType,
              label: getPhysicalSubjectLabel(garmentType, component.garmentType),
            }))
          : [],
      construction: constructionOccurrences,
      constructionTotalCents:
        construction?.status === "resolved" ? construction.totalPriceCents : null,
    };
  });

const mapFabrics = ({
  fabricAllocationState,
  fabricCompletion,
  materialPricing,
  blockers,
}: Pick<
  FutureDesignStudioSummaryInput,
  "fabricAllocationState" | "fabricCompletion" | "materialPricing"
> & { blockers: FutureDesignStudioSummaryBlocker[] }): FutureSummaryFabricAllocation[] => {
  fabricCompletion.blockers.forEach((blocker) => {
    blockers.push({
      code: `FABRIC_${blocker.code}`,
      section: "fabrics",
      message: "One fabric assignment needs review.",
      garmentKey: blocker.garmentKey,
      allocationId: blocker.allocationId,
    });
  });
  if (materialPricing?.status === "unresolved") {
    blockers.push({
      code: "FABRIC_PRICE_INVALID",
      section: "fabrics",
      message: "One selected fabric is missing current authoritative pricing.",
      allocationId: materialPricing.allocationId,
    });
  }
  const pricingByAllocation = new Map(
    materialPricing?.status === "resolved"
      ? materialPricing.allocationLines.map((line) => [line.allocationId, line])
      : [],
  );
  return fabricAllocationState.fabricAllocations.map((allocation) => {
    const line = pricingByAllocation.get(allocation.allocationId);
    return {
      allocationId: allocation.allocationId,
      fabricCode: allocation.fabricCode,
      fabricName: line?.fabric.name || "Fabric unavailable",
      availability: !line
        ? "missing"
        : line.fabric.stockStatus === "IN_STOCK" ||
            line.fabric.stockStatus === "LOW_STOCK"
          ? "available"
          : "unavailable",
      capacityUnits: allocation.garmentAssignments.reduce(
        (total, assignment) => total + assignment.fabricUnits,
        0,
      ),
      materialPrice: line?.materialPrice ?? null,
      pricingTreatment: "included_in_garment_construction",
      garments: allocation.garmentAssignments.map((assignment) => ({
        garmentKey: assignment.garmentKey,
        garmentType: assignment.garmentType,
        label: getFabricGarmentLabel(assignment.garmentType),
      })),
    };
  });
};

const mapStyle = (
  selection: FutureDesignStyleSelectionResolution,
  blockers: FutureDesignStudioSummaryBlocker[],
): FutureSummaryDesignStyle | null => {
  if (selection.status !== "selected" || !selection.selectedStyle) {
    blockers.push({
      code: "DESIGN_STYLE_INVALID",
      section: "design_style",
      message: "Select a current compatible Design Style.",
    });
    return null;
  }
  const style: StyleCategory = selection.selectedStyle;
  return {
    styleId: style.id,
    name: style.name,
    image: style.image?.trim() || null,
    demographic: style.targetDemographic || style.gender,
    compositionLabel: getFutureDesignStyleCompositionLabel(style),
  };
};

const mapCustomDetails = ({
  customDetailsReconciliation,
  customDetailsCompletion,
  customDetailsPricing,
  personalizedInputs,
  basePricing,
  blockers,
}: Pick<
  FutureDesignStudioSummaryInput,
  | "customDetailsReconciliation"
  | "customDetailsCompletion"
  | "customDetailsPricing"
  | "personalizedInputs"
  | "basePricing"
> & { blockers: FutureDesignStudioSummaryBlocker[] }): FutureDesignStudioSummary["customDetailsSummary"] => {
  if (!customDetailsReconciliation || !customDetailsCompletion || !customDetailsPricing) {
    blockers.push({
      code: "CUSTOM_DETAILS_INVALID",
      section: "custom_details",
      message: "Custom Details could not be resolved.",
    });
    return [];
  }
  if (customDetailsCompletion.status === "invalid") {
    blockers.push({
      code: "CUSTOM_DETAILS_INVALID",
      section: "custom_details",
      message: "One Custom Details selection needs review.",
    });
  } else if (customDetailsCompletion.status === "incomplete") {
    blockers.push({
      code: "CUSTOM_DETAILS_INCOMPLETE",
      section: "custom_details",
      message: "Complete every required Custom Details selection.",
    });
  } else if (customDetailsCompletion.status === "pricing_pending") {
    blockers.push({
      code: "CUSTOM_DETAIL_PRICE_EVALUATION_REQUIRED",
      section: "custom_details",
      message: "One personalized detail requires a price evaluation.",
    });
  }
  const subjectOrder = new Map(
    customDetailsReconciliation.subjects.map((subject, index) => [
      subject.garmentKey,
      index,
    ]),
  );
  const subjectByKey = new Map(
    customDetailsReconciliation.subjects.map((subject) => [
      subject.garmentKey,
      subject,
    ]),
  );
  const textByIdentity = new Map(
    personalizedInputs
      ? enumerateGarmentScopedCustomDetailInputs(personalizedInputs).map((entry) => [
          `${entry.garmentKey}:${entry.selectionGroup}:${entry.optionId}`,
          entry.text,
        ])
      : [],
  );
  const grouped = new Map<string, FutureSummaryCustomDetailOccurrence[]>();
  [...customDetailsPricing.lines]
    .sort(
      (left, right) =>
        (subjectOrder.get(left.garmentKey) ?? Number.MAX_SAFE_INTEGER) -
          (subjectOrder.get(right.garmentKey) ?? Number.MAX_SAFE_INTEGER) ||
        left.selectionGroup.localeCompare(right.selectionGroup) ||
        left.optionId.localeCompare(right.optionId),
    )
    .forEach((line) => {
      const subject = subjectByKey.get(line.garmentKey);
      const garmentLabel = subject
        ? getPhysicalSubjectLabel(subject.parentGarmentType, subject.garmentType)
        : "Garment";
      const occurrence: FutureSummaryCustomDetailOccurrence = {
        occurrenceKey: line.occurrenceKey,
        garmentKey: line.garmentKey,
        garmentLabel,
        selectionGroup: line.selectionGroup,
        selectionGroupTitle:
          CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE[line.selectionGroup],
        optionId: line.optionId,
        optionLabel: line.label,
        priceStatus: line.status,
        priceCents: line.lineTotalCents ?? null,
        personalizedText:
          textByIdentity.get(
            `${line.garmentKey}:${line.selectionGroup}:${line.optionId}`,
          ) || null,
      };
      grouped.set(line.garmentKey, [
        ...(grouped.get(line.garmentKey) || []),
        occurrence,
      ]);
    });
  const scopedGroups = [...grouped.entries()]
    .sort(
      ([left], [right]) =>
        (subjectOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (subjectOrder.get(right) ?? Number.MAX_SAFE_INTEGER) ||
        left.localeCompare(right),
    )
    .map(([garmentKey, occurrences]) => ({
      garmentKey,
      garmentLabel: occurrences[0]?.garmentLabel || "Garment",
      occurrences,
    }));
  const orderLevelOccurrences: FutureSummaryCustomDetailOccurrence[] = [
    ...(basePricing?.decorativeFeatures || []),
    ...(basePricing?.traditionalAccessories || []),
  ].map((item, index) => ({
    occurrenceKey: `order-detail:${index + 1}:${item.label}`,
    garmentKey: "order",
    garmentLabel: "Order",
    selectionGroup: "order_optional_detail",
    selectionGroupTitle: "Monogram, Embroidery and Accessories",
    optionId: item.label,
    optionLabel: item.label,
    priceStatus: "exact",
    priceCents: Math.round(item.price * 100),
    personalizedText: null,
  }));
  return orderLevelOccurrences.length > 0
    ? [
        ...scopedGroups,
        {
          garmentKey: "order",
          garmentLabel: "Order",
          occurrences: orderLevelOccurrences,
        },
      ]
    : scopedGroups;
};

const mapMeasurements = ({
  measurementPlan,
  measurementState,
  blockers,
}: Pick<
  FutureDesignStudioSummaryInput,
  "measurementPlan" | "measurementState"
> & { blockers: FutureDesignStudioSummaryBlocker[] }): FutureSummaryMeasurements => {
  if (!isSelectedMeasurementRiskRoute(measurementState.route)) {
    blockers.push({
      code: "MEASUREMENT_INCOMPLETE",
      section: "measurements",
      message: "Choose one measurement risk level and complete the measurements for that option.",
    });
  } else if (measurementState.calculationStatus !== "complete") {
    blockers.push({
      code:
        measurementState.calculationStatus === "invalid"
          ? "MEASUREMENT_INVALID"
          : "MEASUREMENT_INCOMPLETE",
      section: "measurements",
      message: "Complete every required measurement before reviewing Summary.",
    });
  }
  const values = projectMeasurementRequirementsForPresentation({
    requirements: measurementPlan.requirements,
    state: measurementState,
  }).flatMap((requirement) => {
    const stored = getMeasurementValue(measurementState, requirement);
    if (!stored || !Number.isFinite(stored.valueCm) || stored.valueCm <= 0) {
      return [];
    }
    const value = roundMeasurementDisplayValue(
      fromCanonicalCentimetres(stored.valueCm, measurementState.unit),
    );
    const occurrenceOwned =
      requirement.scope === "garment" ||
      stored.provenance === "calculated_average_factor";
    return [{
      requirementKey: requirement.key,
      measurementId: requirement.measurementId,
      garmentKey: occurrenceOwned ? requirement.garmentKey : null,
      label: requirement.definition.customerLabel,
      formattedValue: `${value} ${measurementState.unit === "inch" ? "in" : "cm"}`,
      value,
      unit: measurementState.unit,
      provenance: stored.provenance,
      profileId: occurrenceOwned ? requirement.profileId : null,
      averageFactor: stored.calculation?.averageFactor ?? null,
    } satisfies FutureSummaryMeasurementValue];
  });
  const byGarment = new Map<string, FutureSummaryMeasurementValue[]>();
  values.filter((value) => value.garmentKey).forEach((value) => {
    const garmentKey = value.garmentKey!;
    byGarment.set(garmentKey, [...(byGarment.get(garmentKey) || []), value]);
  });
  const garmentTypeByKey = new Map(
    measurementPlan.requirements.flatMap((requirement) =>
      requirement.garmentKey && requirement.garmentType
        ? [[requirement.garmentKey, requirement.garmentType] as const]
        : [],
    ),
  );
  return {
    route: measurementState.route,
    routeLabel: getMeasurementRouteLabel(measurementState.route),
    unit: measurementState.unit,
    shared: values.filter((value) => !value.garmentKey),
    byGarment: [...byGarment.entries()].map(([garmentKey, garmentValues]) => ({
      garmentKey,
      garmentLabel: getFabricGarmentLabel(
        garmentTypeByKey.get(garmentKey) || "other",
      ),
      values: garmentValues,
    })),
  };
};

const mapPricing = ({
  basePricing,
  customDetailsPricing,
  blockers,
}: Pick<
  FutureDesignStudioSummaryInput,
  "basePricing" | "customDetailsPricing"
> & { blockers: FutureDesignStudioSummaryBlocker[] }): FutureSummaryPricing => {
  if (
    !basePricing ||
    basePricing.pricingModel !== "all_inclusive_garment_construction" ||
    basePricing.baseGarmentPricingStatus !== "resolved" ||
    basePricing.additionalGarmentPricingStatus !== "resolved"
  ) {
    blockers.push({
      code: "PRICING_INVALID",
      section: "pricing",
      message: "Current garment or fabric pricing needs review.",
    });
    return {
      status: "invalid",
      garmentConstructionSubtotal: null,
      customDetailsExactSubtotal: 0,
      selectedDesignPrice: null,
    };
  }
  if (!customDetailsPricing || customDetailsPricing.status === "invalid") {
    blockers.push({
      code: "PRICING_INVALID",
      section: "pricing",
      message: "Current Custom Details pricing needs review.",
    });
    return {
      status: "invalid",
      garmentConstructionSubtotal: basePricing.garmentConstructionSubtotal,
      customDetailsExactSubtotal: 0,
      selectedDesignPrice: null,
    };
  }
  const scopedCustomDetailsExactSubtotal =
    customDetailsPricing.status === "exact"
      ? customDetailsPricing.subtotal
      : customDetailsPricing.exactSubtotalCents / 100;
  const customDetailsExactSubtotal =
    scopedCustomDetailsExactSubtotal + basePricing.customDetailsPrice;
  if (customDetailsPricing.status === "pending") {
    return {
      status: "pending",
      garmentConstructionSubtotal: basePricing.garmentConstructionSubtotal,
      customDetailsExactSubtotal,
      selectedDesignPrice: null,
    };
  }
  const selectedDesignPrice = calculateSelectedDesignPrice({
    pricingModel: "all_inclusive_garment_construction",
    garmentConstructionSubtotal: basePricing.garmentConstructionSubtotal,
    customDetailsSubtotal: customDetailsExactSubtotal,
    eindhovenToDestinationShipping: null,
  });
  if (selectedDesignPrice.status !== "READY") {
    blockers.push({
      code: "PRICING_INVALID",
      section: "pricing",
      message: "The garment construction or Custom Details total needs review.",
    });
    return {
      status: "invalid",
      garmentConstructionSubtotal: basePricing.garmentConstructionSubtotal,
      customDetailsExactSubtotal,
      selectedDesignPrice,
    };
  }
  return {
    status: "exact",
    garmentConstructionSubtotal: basePricing.garmentConstructionSubtotal,
    customDetailsExactSubtotal,
    selectedDesignPrice,
  };
};

export const projectFutureDesignStudioSummary = (
  input: FutureDesignStudioSummaryInput,
): FutureDesignStudioSummary => {
  const blockers: FutureDesignStudioSummaryBlocker[] = [];
  if (!input.garmentTypeSelection.demographic || input.garmentTypeSelection.garmentTypes.length === 0) {
    blockers.push({
      code: "GARMENTS_INCOMPLETE",
      section: "garments",
      message: "Complete Garment Type before reviewing Summary.",
    });
  }
  const garmentSummary = mapGarments({
    garmentTypeSelection: input.garmentTypeSelection,
    catalogInspection: input.catalogInspection,
    fabricAllocationState: input.fabricAllocationState,
    blockers,
  });
  const fabricSummary = mapFabrics({
    fabricAllocationState: input.fabricAllocationState,
    fabricCompletion: input.fabricCompletion,
    materialPricing: input.materialPricing,
    blockers,
  });
  const designStyleSummary = mapStyle(input.designStyleSelection, blockers);
  const customDetailsSummary = mapCustomDetails({
    customDetailsReconciliation: input.customDetailsReconciliation,
    customDetailsCompletion: input.customDetailsCompletion,
    customDetailsPricing: input.customDetailsPricing,
    personalizedInputs: input.personalizedInputs,
    basePricing: input.basePricing,
    blockers,
  });
  const aiTryOnSummary = getAiTryOnSummary(input.aiTryOnWorkflow);
  if (!(["completed", "skipped"] as const).includes(aiTryOnSummary.status as "completed" | "skipped")) {
    blockers.push({
      code: "AI_TRY_ON_INCOMPLETE",
      section: "ai_try_on",
      message: "Complete or skip AI Try-on before reviewing Summary.",
    });
  }
  const measurementSummary = mapMeasurements({
    measurementPlan: input.measurementPlan,
    measurementState: input.measurementState,
    blockers,
  });
  const pricingSummary = mapPricing({
    basePricing: input.basePricing,
    customDetailsPricing: input.customDetailsPricing,
    blockers,
  });
  return {
    status: getSummaryStatus({
      blockers,
      customDetailsCompletion: input.customDetailsCompletion,
      measurementState: input.measurementState,
    }),
    blockers,
    garmentSummary,
    fabricSummary,
    designStyleSummary,
    customDetailsSummary,
    aiTryOnSummary,
    measurementSummary,
    pricingSummary,
  };
};

export const getFutureSummaryMaterialPricing = (
  pricing: FabricAllocationPricingResult | null,
): ResolvedFabricAllocationPricing | null =>
  pricing?.status === "resolved" ? pricing : null;
