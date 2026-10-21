import { CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE } from "../config/GarmentDetailsConfig.js";
import { resolveCustomDetailPhysicalComponents } from "../config/CustomDetailPhysicalComponentConfig.js";
import { getStep1GarmentDisplayLabel } from "./garmentConstructionPricing.js";
import {
  wearerAssignmentLabel,
  wearerNamesReadyForGarmentLabels,
  wearerPublicLabel,
} from "./wearerOrder.js";
import type {
  AdditionalGarmentConstructionStateV1,
  AiTryOnWorkflowStateV1,
  CanonicalPhysicalGarmentType,
  DesignSelections,
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FutureMeasurementStateV1,
  FutureMeasurementValueV1,
  GarmentScopedCustomDetailInputsV1,
  GarmentTypeStepSelection,
  StyleCategory,
  WearerOrderStateV2,
} from "../types.js";
import type { CustomDetailCatalogInspection } from "./catalogHelpers.js";
import type {
  FabricAllocationPricingResult,
  ResolvedFabricAllocationPricing,
} from "./fabricAllocationPricing.js";
import { hasUsableFabricImage } from "./fabricCatalogueAvailability.js";
import { isUsableFabricColorHex } from "../components/AssignedFabricPreview.js";
import type { FutureFabricStageCompletion } from "./designStudioFutureFabricStage.js";
import {
  getFutureDesignStyleCompositionLabel,
  type FutureDesignStyleSelectionResolution,
} from "./designStudioFutureDesignStyle.js";
import {
  calculateSelectedDesignPrice,
  type AllInclusiveSelectedDesignPriceBreakdown,
  type AuthoritativeDesignPricing,
} from "./designPricing.js";
import { projectAuthoritativePhysicalOccurrences, resolveOccurrenceConstruction } from "./designSourceState.js";
import { projectOccurrenceDisplayLabels, projectPersonGarmentLabels } from "./occurrenceDisplayLabel.js";
import type { DesignStyleStepOccurrencePresentation } from "./designStyleStepRuntime.js";
import {
  type GarmentScopedCustomDetailsCompletionResult,
  type GarmentScopedCustomDetailsPricingResult,
  type GarmentScopedCustomDetailsReconciliationResult,
} from "./garmentScopedCustomDetailsDomain.js";
import { enumerateGarmentScopedCustomDetailInputs } from "./garmentScopedCustomDetailInputsState.js";
import {
  getMonogramPlacementForGarment,
  getMonogramPlacementLabel,
  getMonogramTextForGarment,
} from "./decorativePricing.js";
import { formatDualUnitMeasurementDisplay, fromCanonicalCentimetres, getDualUnitMeasurementParts, type DualUnitMeasurementParts, isMeasurementOutsideUsualRange, getResolvedMeasurementValue, getSampleClothCustomerLabel, getSampleClothProductionEquivalentCm, isSampleClothMeasurementMethod, isSelectedMeasurementMethod, isSharedPresentationRequirement, MEASUREMENT_METHOD_LABELS, projectMeasurementRequirementsForPresentation, roundMeasurementDisplayValue, type MeasurementRequirementPlan, type PlannedMeasurementRequirement } from "./measurementBlueprint.js";

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
  selectionGroup: string;
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
  /**
   * Public name of the assigned person. Null when the garment is unassigned,
   * its wearer is missing, or the order is not yet multi-person with every
   * additional person's name saved (wearerNamesReadyForGarmentLabels).
   */
  wearerLabel: string | null;
  /** Retired per-person fit label. Always null: Step 7 no longer asks for a fit. */
  fitLabel: string | null;
}

export interface FutureSummaryFabricAllocation {
  allocationId: string;
  fabricCode: string;
  fabricName: string;
  /** Trimmed catalogue image URL, or null when the fabric has no usable image. */
  image: string | null;
  /** Trimmed catalogue hex, or null when the fabric has no usable colour. */
  colorHex: string | null;
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

export interface FutureSummaryDesignStyleOccurrence {
  /** Stable physical-garment owner for this selected Design Style. */
  garmentKey: string;
  occurrenceLabel: string;
  sourceKind: "catalogue" | "uploaded" | "unassigned";
  status: "selected" | "unassigned" | "needs_review" | "unavailable" | "awaiting_validation" | "upload_pending";
  name: string;
  image: string | null;
  detail: string | null;
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
  /** Present for Name Monogram when a placement is stored. */
  monogramPlacementLabel?: string | null;
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
  /** Preferred / alternate unit text for the split pill (same values as formattedValue). */
  formattedParts: DualUnitMeasurementParts;
  convertedFormattedValue: string | null;
  convertedFormattedParts: DualUnitMeasurementParts | null;
  /** Step 7 flagged this value as outside its usual range. Informational only. */
  outsideUsualRange: boolean;
  convertedLabel: string | null;
  value: number;
  unit: FutureMeasurementStateV1["unit"];
  provenance: FutureMeasurementValueV1["provenance"];
  profileId: string | null;
  averageFactor: number | null;
}

export interface FutureSummaryWearerMeasurements {
  wearerId: string;
  displayName: string;
  garmentKeys: string[];
  route: FutureMeasurementStateV1["route"];
  routeLabel: string;
  unit: FutureMeasurementStateV1["unit"];
  status: FutureMeasurementStateV1["calculationStatus"];
  /**
   * 2+ wearers only: garmentKey -> label inside this person's group, without the
   * order-wide " 2" suffix unless the person has two garments of the same name.
   */
  personGarmentLabels?: Record<string, string>;
  shared: FutureSummaryMeasurementValue[];
  byGarment: Array<{
    garmentKey: string;
    garmentLabel: string;
    values: FutureSummaryMeasurementValue[];
  }>;
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
  wearerGroups?: FutureSummaryWearerMeasurements[];
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
  /** Exact customer-safe occurrence rows. The legacy scalar remains null so
   * downstream Candidate authority cannot infer a representative style. */
  designStyleOccurrences?: FutureSummaryDesignStyleOccurrence[];
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
  step1GarmentTypeSelection: GarmentTypeStepSelection;
  garmentTypeSelection: GarmentTypeStepSelection;
  designSourceKind: "catalogue" | "uploaded";
  uploadedCompositionSpecs?: readonly FabricCapacityGarmentSpec[] | null;
  additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1 | null;
  pendingAdditionalGarment?: FabricGarmentAssignment | null;
  catalogInspection: CustomDetailCatalogInspection;
  fabricAllocationState: FabricAllocationState;
  fabricCompletion: FutureFabricStageCompletion;
  materialPricing: FabricAllocationPricingResult | null;
  designStyleSelection: FutureDesignStyleSelectionResolution;
  designStyleOccurrences?: readonly DesignStyleStepOccurrencePresentation[];
  uploadedPreviewByOccurrenceToken?: Readonly<Record<string, string>>;
  styles?: readonly StyleCategory[];
  customDetailsReconciliation: GarmentScopedCustomDetailsReconciliationResult | null;
  customDetailsCompletion: GarmentScopedCustomDetailsCompletionResult | null;
  customDetailsPricing: GarmentScopedCustomDetailsPricingResult | null;
  personalizedInputs: GarmentScopedCustomDetailInputsV1 | null;
  designSelections?: DesignSelections | null;
  aiTryOnWorkflow: AiTryOnWorkflowStateV1;
  measurementPlan: MeasurementRequirementPlan;
  measurementState: FutureMeasurementStateV1;
  /** Assignment authority for garment-card names and fit. Absent projections stay unlabeled. */
  wearerOrder?: WearerOrderStateV2 | null;
  /**
   * Step 7 people panel: wearers whose name was edited since the last Save /
   * blur. Garment wearer labels stay off until every wearer after the first has
   * a saved, non-blank name (see wearerNamesReadyForGarmentLabels).
   */
  unsavedWearerNameIds?: readonly string[] | null;
  wearerRuntimes?: readonly {
    wearerId: string;
    displayName: string;
    fitContext: "male" | "female" | "unisex" | null;
    garmentKeys: string[];
    plan: MeasurementRequirementPlan;
    measurement: FutureMeasurementStateV1;
  }[];
  basePricing: AuthoritativeDesignPricing | null;
}

const getPhysicalSubjectLabel = (
  parentType: CanonicalPhysicalGarmentType,
  componentType: CanonicalPhysicalGarmentType,
): string =>
  parentType === componentType
    ? getStep1GarmentDisplayLabel(componentType)
    : `${getStep1GarmentDisplayLabel(parentType)} - ${getStep1GarmentDisplayLabel(componentType)}`;

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

/** One named wearer stays on the method line. "You" stays the method label alone. */
export const formatCompactWearerRouteLabel = (
  displayName: string,
  routeLabel: string,
): string => {
  const name = displayName.trim();
  if (name.toLowerCase() === "you") return routeLabel;
  return `${name} — ${routeLabel}`;
};

const getMeasurementRouteLabel = (
  route: FutureMeasurementStateV1["route"],
): string =>
  isSelectedMeasurementMethod(route)
    ? MEASUREMENT_METHOD_LABELS[route]
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

const assignedWearerForGarment = (
  wearerOrder: WearerOrderStateV2 | null | undefined,
  garmentKey: string,
) => {
  if (!wearerOrder) return null;
  const wearerId = wearerOrder.assignmentByGarmentKey[garmentKey];
  if (!wearerId) return null;
  return (
    wearerOrder.wearers.find((candidate) => candidate.wearerId === wearerId) ??
    null
  );
};

const wearerLabelForAssignedGarment = (
  wearerOrder: WearerOrderStateV2 | null | undefined,
  garmentKey: string,
  labelsReady: boolean,
): string | null => {
  if (!labelsReady) return null;
  const wearer = assignedWearerForGarment(wearerOrder, garmentKey);
  if (!wearer) return null;
  return wearerPublicLabel(wearer.displayName, wearer.presentationOrder);
};

const mapGarments = ({
  step1GarmentTypeSelection,
  garmentTypeSelection,
  designSourceKind,
  uploadedCompositionSpecs,
  additionalGarmentConstructionState,
  catalogInspection,
  fabricAllocationState,
  wearerOrder,
  unsavedWearerNameIds,
  blockers,
}: Pick<
  FutureDesignStudioSummaryInput,
  | "step1GarmentTypeSelection"
  | "garmentTypeSelection"
  | "designSourceKind"
  | "uploadedCompositionSpecs"
  | "additionalGarmentConstructionState"
  | "catalogInspection"
  | "fabricAllocationState"
  | "wearerOrder"
  | "unsavedWearerNameIds"
  | "wearerRuntimes"
> & { blockers: FutureDesignStudioSummaryBlocker[] }): FutureSummaryGarment[] => {
  const occurrences = projectAuthoritativePhysicalOccurrences({
    sourceKind: designSourceKind,
    step1GarmentTypeSelection,
    effectiveGarmentTypeSelection: garmentTypeSelection,
    uploadedCompositionSpecs,
    additionalGarmentConstructionState,
  });
  const occurrenceLabels = projectOccurrenceDisplayLabels(occurrences);
  const wearerLabelsReady = wearerNamesReadyForGarmentLabels(
    wearerOrder,
    unsavedWearerNameIds,
  );
  return occurrences.map((occurrence) => {
    const { garmentKey, garmentType, sourceRole, fabricUnits } = occurrence;
    const allocationAssignment = fabricAllocationState.fabricAllocations
      .flatMap((allocation) => allocation.garmentAssignments)
      .find((assignment) => assignment.garmentKey === garmentKey);
    const construction = resolveOccurrenceConstruction({
      garmentKey,
      garmentType,
      sourceRole,
      garmentTypeSelection,
      additionalGarmentConstructionState,
    });
    const physicalResolution = resolveCustomDetailPhysicalComponents({
      parentGarmentKey: garmentKey,
      garmentType,
    });
    if (construction?.status !== "resolved") {
      blockers.push({
        code: "GARMENT_CONSTRUCTION_INVALID",
        section: "garments",
        message: `${getStep1GarmentDisplayLabel(garmentType)} construction needs review.`,
        garmentKey,
      });
    }
    if (physicalResolution.status !== "resolved") {
      blockers.push({
        code: "GARMENT_COMPONENT_INVALID",
        section: "garments",
        message: `${getStep1GarmentDisplayLabel(garmentType)} components could not be resolved.`,
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
                message: `${getStep1GarmentDisplayLabel(garmentType)} construction pricing is unavailable.`,
                garmentKey,
              });
            }
            return {
              componentKey: component.componentKey,
              selectionGroup: component.selectionGroup,
              optionId: component.optionId,
              label: option?.label || "Construction option unavailable",
              priceCents: component.priceCents,
            };
          })
        : [];
    return {
      garmentKey,
      garmentType,
      label:
        occurrenceLabels.get(garmentKey)?.conciseLabel ||
        getStep1GarmentDisplayLabel(garmentType),
      role: allocationAssignment?.sourceRole || sourceRole,
      // Measurement gender follows the Studio garment demographic, not a per-person fit.
      demographic: garmentTypeSelection.demographic,
      fabricUnits:
        allocationAssignment?.fabricUnits || fabricUnits,
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
      wearerLabel: wearerLabelForAssignedGarment(
        wearerOrder,
        garmentKey,
        wearerLabelsReady,
      ),
      fitLabel: null,
    };
  });
};

const mapFabrics = ({
  fabricAllocationState,
  fabricCompletion,
  materialPricing,
  garmentLabels,
  blockers,
}: Pick<
  FutureDesignStudioSummaryInput,
  "fabricAllocationState" | "fabricCompletion" | "materialPricing"
> & {
  garmentLabels: ReadonlyMap<string, string>;
  blockers: FutureDesignStudioSummaryBlocker[];
}): FutureSummaryFabricAllocation[] => {
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
    const previewFabric = line?.fabric;
    const rawHex = previewFabric?.colorHex;
    return {
      allocationId: allocation.allocationId,
      fabricCode: allocation.fabricCode,
      fabricName: previewFabric?.name || "Fabric unavailable",
      image:
        previewFabric && hasUsableFabricImage(previewFabric)
          ? previewFabric.image!.trim()
          : null,
      colorHex: isUsableFabricColorHex(rawHex) ? rawHex.trim() : null,
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
        label:
          garmentLabels.get(assignment.garmentKey) ||
          getStep1GarmentDisplayLabel(assignment.garmentType),
      })),
    };
  });
};

const mapOccurrenceStyles = ({
  occurrences,
  styles,
  uploadedPreviewByOccurrenceToken,
  blockers,
}: {
  occurrences: readonly DesignStyleStepOccurrencePresentation[];
  styles: readonly StyleCategory[];
  uploadedPreviewByOccurrenceToken: Readonly<Record<string, string>>;
  blockers: FutureDesignStudioSummaryBlocker[];
}): FutureSummaryDesignStyleOccurrence[] => {
  const stylesById = new Map(styles.map((style) => [style.id, style] as const));
  const rows: FutureSummaryDesignStyleOccurrence[] = occurrences.map((occurrence) => {
    const assignment = occurrence.assignment;
    if (assignment?.sourceKind === "catalog") {
      const style = stylesById.get(assignment.catalogStyleId);
      if (style) return {
        garmentKey: occurrence.target.garmentKey,
        occurrenceLabel: occurrence.label,
        sourceKind: "catalogue" as const,
        status: "selected" as const,
        name: style.name,
        image: style.image?.trim() || null,
        detail: getFutureDesignStyleCompositionLabel(style),
      };
    }
    if (assignment?.sourceKind === "uploaded") return {
      garmentKey: occurrence.target.garmentKey,
      occurrenceLabel: occurrence.label,
      sourceKind: "uploaded" as const,
      status: "selected" as const,
      name: "Uploaded design",
      image: uploadedPreviewByOccurrenceToken[occurrence.target.occurrenceToken]?.trim() || null,
      detail: "Uploaded design selected",
    };
    const status: FutureSummaryDesignStyleOccurrence["status"] = occurrence.status === "needs_review" || occurrence.status === "unavailable" ||
      occurrence.status === "awaiting_validation" || occurrence.status === "upload_pending"
      ? occurrence.status
      : "unassigned";
    return {
      garmentKey: occurrence.target.garmentKey,
      occurrenceLabel: occurrence.label,
      sourceKind: "unassigned" as const,
      status,
      name: status === "unassigned" ? "Not selected" : "Design Style needs review",
      image: null,
      detail: null,
    };
  });
  if (rows.some((row) => row.status !== "selected")) blockers.push({
    code: "DESIGN_STYLE_INVALID",
    section: "design_style",
    message: "Choose a current Design Style for each garment.",
  });
  return rows;
};

const monogramPresentationForGarment = (
  designSelections: DesignSelections | null | undefined,
  garmentKey: string,
  label: string,
): { personalizedText: string | null; monogramPlacementLabel: string | null } => {
  if (label !== "Name Monogram" || !designSelections) {
    return { personalizedText: null, monogramPlacementLabel: null };
  }
  return {
    personalizedText: getMonogramTextForGarment(designSelections, garmentKey) || null,
    monogramPlacementLabel: getMonogramPlacementLabel(
      getMonogramPlacementForGarment(designSelections, garmentKey),
    ),
  };
};

const mapCustomDetails = ({
  customDetailsReconciliation,
  customDetailsCompletion,
  customDetailsPricing,
  personalizedInputs,
  basePricing,
  designSelections,
  blockers,
}: Pick<
  FutureDesignStudioSummaryInput,
  | "customDetailsReconciliation"
  | "customDetailsCompletion"
  | "customDetailsPricing"
  | "personalizedInputs"
  | "basePricing"
  | "designSelections"
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
  const scopedGroups: Array<{
    garmentKey: string;
    garmentLabel: string;
    occurrences: FutureSummaryCustomDetailOccurrence[];
  }> = [...grouped.entries()]
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
  const garmentScopedDecorativeOccurrences = (
    basePricing?.decorativeFeatures || []
  ).filter(
    (item) =>
      Boolean(item.garmentKey) &&
      item.garmentKey !== "order" &&
      !item.includedByStyle,
  );
  garmentScopedDecorativeOccurrences.forEach((item) => {
    const garmentKey = item.garmentKey as string;
    const subject = subjectByKey.get(garmentKey);
    const parentSubject = subject
      ? subject
      : customDetailsReconciliation.subjects.find(
          (candidate) => candidate.parentGarmentKey === garmentKey,
        );
    const garmentLabel = parentSubject
      ? getPhysicalSubjectLabel(
          parentSubject.parentGarmentType,
          parentSubject.parentGarmentType,
        )
      : garmentKey;
    const occurrence: FutureSummaryCustomDetailOccurrence = {
      occurrenceKey: `${garmentKey}:decorative:${item.label}`,
      garmentKey,
      garmentLabel,
      selectionGroup: "order_optional_detail",
      selectionGroupTitle: "Monogram and Embroidery",
      optionId: item.label,
      optionLabel: item.label,
      priceStatus: "exact",
      priceCents: Math.round(item.price * 100),
      ...monogramPresentationForGarment(
        designSelections,
        garmentKey,
        item.label,
      ),
    };
    const existingIndex = scopedGroups.findIndex(
      (group) => group.garmentKey === garmentKey,
    );
    if (existingIndex >= 0) {
      scopedGroups[existingIndex] = {
        ...scopedGroups[existingIndex],
        occurrences: [
          ...scopedGroups[existingIndex].occurrences,
          occurrence,
        ],
      };
      return;
    }
    scopedGroups.push({
      garmentKey,
      garmentLabel,
      occurrences: [occurrence],
    });
  });
  const orderLevelDecorativeFeatures = (
    basePricing?.decorativeFeatures || []
  ).filter(
    (item) =>
      !item.includedByStyle &&
      (!item.garmentKey || item.garmentKey === "order"),
  );
  const orderLevelOccurrences: FutureSummaryCustomDetailOccurrence[] = [
    ...orderLevelDecorativeFeatures,
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
    ...monogramPresentationForGarment(
      designSelections,
      "order",
      item.label,
    ),
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
  garmentLabels,
  blockers,
}: Pick<
  FutureDesignStudioSummaryInput,
  "measurementPlan" | "measurementState"
> & {
  garmentLabels: ReadonlyMap<string, string>;
  blockers: FutureDesignStudioSummaryBlocker[];
}): FutureSummaryMeasurements => {
  if (!isSelectedMeasurementMethod(measurementState.route)) {
    blockers.push({
      code: "MEASUREMENT_INCOMPLETE",
      section: "measurements",
      message: "Choose one measurement option and complete the measurements for that method.",
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
    const sampleMode = isSampleClothMeasurementMethod(measurementState.route);
    const value = roundMeasurementDisplayValue(
      fromCanonicalCentimetres(stored.valueCm, measurementState.unit),
    );
    const derivedValue = requirement.scope === "shared"
      ? measurementState.derived.shared[requirement.measurementId]
      : measurementState.derived.byGarmentKey[requirement.garmentKey]?.[
        requirement.measurementId
      ];
    const convertedCm = requirement.sampleGeometry === "laid_flat_half_width"
      ? derivedValue?.valueCm ?? getSampleClothProductionEquivalentCm(stored.valueCm)
      : null;
    const occurrenceOwned =
      !isSharedPresentationRequirement(requirement) &&
      (requirement.scope === "garment" ||
        stored.provenance === "calculated_average_factor");
    return [{
      requirementKey: requirement.key,
      measurementId: requirement.measurementId,
      garmentKey: occurrenceOwned ? requirement.garmentKey : null,
      label: sampleMode
        ? getSampleClothCustomerLabel(
            requirement.measurementId,
            requirement.definition.customerLabel,
            requirement.labelDemographic,
          )
        : requirement.definition.customerLabel,
      formattedValue: formatDualUnitMeasurementDisplay(
        stored.valueCm,
        measurementState.unit,
      ),
      formattedParts: getDualUnitMeasurementParts(
        stored.valueCm,
        measurementState.unit,
      ),
      convertedFormattedValue:
        convertedCm != null && Number.isFinite(convertedCm)
          ? formatDualUnitMeasurementDisplay(convertedCm, measurementState.unit)
          : null,
      convertedFormattedParts:
        convertedCm != null && Number.isFinite(convertedCm)
          ? getDualUnitMeasurementParts(convertedCm, measurementState.unit)
          : null,
      convertedLabel:
        convertedCm != null && Number.isFinite(convertedCm)
          ? "Converted from sample cloth"
          : null,
      outsideUsualRange: isMeasurementOutsideUsualRange(
        measurementState.diagnostics,
        requirement.measurementId,
        requirement.scope === "shared" ? null : requirement.garmentKey,
      ),
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
      garmentLabel:
        garmentLabels.get(garmentKey) ||
        getStep1GarmentDisplayLabel(garmentTypeByKey.get(garmentKey) || "other"),
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

/** One person's Summary measurement groups (shared + per garment). Exported for regression tests. */
export const projectFutureSummaryMeasurementGroups = mapMeasurements;

const summarizeOrderMeasurements = ({
  measurementPlan,
  measurementState,
  wearerRuntimes,
  garmentLabels,
  garmentTypes,
  blockers,
}: {
  measurementPlan: MeasurementRequirementPlan;
  measurementState: FutureMeasurementStateV1;
  wearerRuntimes?: FutureDesignStudioSummaryInput["wearerRuntimes"];
  garmentLabels: ReadonlyMap<string, string>;
  garmentTypes: ReadonlyMap<string, string>;
  blockers: FutureDesignStudioSummaryBlocker[];
}): FutureSummaryMeasurements => {
  if (!wearerRuntimes || wearerRuntimes.length === 0) {
    return mapMeasurements({ measurementPlan, measurementState, garmentLabels, blockers });
  }
  if (wearerRuntimes.length === 1) {
    const wearer = wearerRuntimes[0];
    const summary = mapMeasurements({
      measurementPlan: wearer.plan,
      measurementState: wearer.measurement,
      garmentLabels,
      blockers,
    });
    return {
      ...summary,
      wearerGroups: [
        {
          wearerId: wearer.wearerId,
          displayName: wearerAssignmentLabel(wearer.displayName, 0),
          garmentKeys: [...wearer.garmentKeys],
          route: summary.route,
          routeLabel: summary.routeLabel,
          unit: summary.unit,
          status: wearer.measurement.calculationStatus,
          shared: summary.shared,
          byGarment: summary.byGarment,
        },
      ],
    };
  }
  const wearerGroups = wearerRuntimes.map((wearer, index) => {
    const personKeys = [
      ...new Set([
        ...wearer.garmentKeys,
        ...wearer.plan.requirements.flatMap((requirement) =>
          requirement.garmentKey ? [requirement.garmentKey] : [],
        ),
      ]),
    ].filter((garmentKey) => garmentLabels.has(garmentKey));
    const personGarmentLabels = projectPersonGarmentLabels(
      personKeys.map((garmentKey) => ({
        garmentKey,
        garmentType: garmentTypes.get(garmentKey),
        label: garmentLabels.get(garmentKey)!,
      })),
    );
    const summary = mapMeasurements({
      measurementPlan: wearer.plan,
      measurementState: wearer.measurement,
      garmentLabels: new Map([...garmentLabels, ...personGarmentLabels]),
      blockers: [],
    });
    return {
      wearerId: wearer.wearerId,
      displayName: wearerPublicLabel(wearer.displayName, index),
      garmentKeys: [...wearer.garmentKeys],
      route: summary.route,
      routeLabel: summary.routeLabel,
      unit: summary.unit,
      status: wearer.measurement.calculationStatus,
      personGarmentLabels: Object.fromEntries(personGarmentLabels),
      shared: summary.shared,
      byGarment: summary.byGarment,
    };
  });
  if (
    wearerGroups.some(
      (wearer) => wearer.route === null || wearer.status !== "complete",
    )
  ) {
    blockers.push({
      code: "MEASUREMENT_INCOMPLETE",
      section: "measurements",
      message: "Complete measurements for every person in this order.",
    });
  }
  return {
    route: null,
    routeLabel: `${wearerGroups.length} people`,
    unit: wearerGroups[0]?.unit || measurementState.unit,
    shared: [],
    byGarment: [],
    wearerGroups,
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
    step1GarmentTypeSelection: input.step1GarmentTypeSelection,
    garmentTypeSelection: input.garmentTypeSelection,
    designSourceKind: input.designSourceKind,
    uploadedCompositionSpecs: input.uploadedCompositionSpecs,
    additionalGarmentConstructionState: input.additionalGarmentConstructionState,
    catalogInspection: input.catalogInspection,
    fabricAllocationState: input.fabricAllocationState,
    wearerOrder: input.wearerOrder,
    unsavedWearerNameIds: input.unsavedWearerNameIds,
    wearerRuntimes: input.wearerRuntimes,
    blockers,
  });
  const fabricSummary = mapFabrics({
    fabricAllocationState: input.fabricAllocationState,
    fabricCompletion: input.fabricCompletion,
    materialPricing: input.materialPricing,
    garmentLabels: new Map(
      garmentSummary.map((garment) => [garment.garmentKey, garment.label]),
    ),
    blockers,
  });
  // Do not carry a representative scalar forward: Candidate remains fail closed
  // until Task 5F-C owns immutable occurrence-to-style submission data.
  void input.designStyleSelection;
  const designStyleSummary = null;
  const designStyleOccurrences = mapOccurrenceStyles({
    occurrences: input.designStyleOccurrences || [],
    styles: input.styles || [],
    uploadedPreviewByOccurrenceToken: input.uploadedPreviewByOccurrenceToken || {},
    blockers,
  });
  const customDetailsSummary = mapCustomDetails({
    customDetailsReconciliation: input.customDetailsReconciliation,
    customDetailsCompletion: input.customDetailsCompletion,
    customDetailsPricing: input.customDetailsPricing,
    personalizedInputs: input.personalizedInputs,
    basePricing: input.basePricing,
    designSelections: input.designSelections,
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
  const measurementSummary = summarizeOrderMeasurements({
    measurementPlan: input.measurementPlan,
    measurementState: input.measurementState,
    wearerRuntimes: input.wearerRuntimes,
    garmentLabels: new Map(
      garmentSummary.map((garment) => [garment.garmentKey, garment.label]),
    ),
    garmentTypes: new Map(
      garmentSummary.map((garment) => [garment.garmentKey, garment.garmentType]),
    ),
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
    designStyleOccurrences,
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
