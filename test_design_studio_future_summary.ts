import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type {
  AiTryOnWorkflowStateV1,
  AdditionalGarmentConstructionStateV1,
  BusinessSettings,
  Fabric,
  FabricAllocationState,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  StyleCategory,
  WearerOrderStateV2,
} from "./src/types";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import {
  createCustomDetailCatalogTombstone,
  inspectCustomDetailCatalog,
} from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  CONSTRUCTION_OPTION_FALLBACK_LABEL,
  projectCustomerGarmentConstructionBreakdown,
} from "./src/utils/designPriceBreakdownPresentation";
import { createCatalogueAdditionalGarmentSelection, projectCatalogueStep1PhysicalOccurrences } from "./src/utils/additionalGarmentDomain";
import { reconcileAdditionalGarmentConstructionState, cloneGarmentConstructionPricingResolution } from "./src/utils/additionalGarmentConstructionState";
import {
  getFutureFabricCapacityComposition,
  getFutureFabricStageCompletion,
  removeFutureFabricAssignment,
  assignFutureFabricToGarment,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileFutureDesignStyleSelection } from "./src/utils/designStudioFutureDesignStyle";
import { projectDesignStudioLiveOrderSummary } from "./src/utils/designStudioLiveOrderSummary";
import { projectAuthoritativeOrderMeasurements } from "./src/utils/futureOrderCandidate";
import { projectPersonGarmentLabels } from "./src/utils/occurrenceDisplayLabel";
import { isWearerOrderStateV2 } from "./src/utils/wearerOrder";
import {
  formatCompactWearerRouteLabel,
  projectFutureDesignStudioSummary,
} from "./src/utils/designStudioFutureSummary";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { appendCustomerFabricGarment } from "./src/utils/fabricGarmentAppendFlow";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import {
  createEmptyGarmentScopedCustomDetailsState,
  setGarmentScopedCustomDetailSelection,
} from "./src/utils/garmentScopedCustomDetailsState";
import {
  createEmptyGarmentScopedCustomDetailInputs,
  setGarmentScopedCustomDetailText,
} from "./src/utils/garmentScopedCustomDetailInputsState";
import {
  reconcileGarmentTypeStepSelection,
  selectGarmentConstructionOption,
} from "./src/utils/garmentTypeStepState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import {
  createEmptyFutureMeasurementState,
  formatDualUnitMeasurementDisplay,
  getDualUnitMeasurementParts,
  getMeasurementPhysicalGarments,
  isMeasurementOutsideUsualRange,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";
import {
  buildEffectiveUploadedJourneyGarmentTypeSelection,
  mergeUploadedDesignCompositionWithStep1,
} from "./src/utils/uploadedDesignStep1";
import {
  createEmptyFutureShippingState,
  reconcileFutureShippingState,
} from "./src/utils/designStudioFutureShipping";
import { DormantFutureSummaryStep } from "./src/components/DormantFutureSummaryStep";
import { setDefaultImageRetryDelaysForTests } from "./src/hooks/useImageLoadRetry";

const inspection = inspectCustomDetailCatalog([]);
const fabric: Fabric = {
  code: "FAB-HI",
  name: "HiTarget Royal",
  description: "Royal patterned fabric",
  color: "Royal Blue",
  colorHex: "#002397",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
};
const businessSettings = {
  pricingSettings: {
    depositPercentage: 50,
    balancePercentage: 50,
    currency: "EUR",
    vatTaxPercentage: 7.5,
    discountRulesEnabled: false,
    standardAccessoryCharge: 10,
  },
} as BusinessSettings;

const buildSelection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: "male",
    normalizedCustomDetailCatalog: inspection.activeOptions,
  }).selection;

const makeAllocationState = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): FabricAllocationState => ({
  fabricAllocations: garmentTypes.map((garmentType, index) => ({
    allocationId: `allocation-${index + 1}`,
    fabricCode: fabric.code,
    garmentAssignments: [{
      garmentKey: `base:${garmentType}`,
      code: `BASE_${garmentType.toUpperCase()}`,
      garmentType,
      fabricUnits:
        garmentType === "full_length_gown" ||
        garmentType === "agbada"
          ? 2
          : 1,
      sourceRole: "main",
    }],
  })),
  activeAllocationId: "allocation-1",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
});

const makeStyle = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  overrides: Partial<StyleCategory> = {},
): StyleCategory => ({
  id: `style-${garmentTypes.join("-")}`,
  name: "Heritage Complete Look",
  description: "A compatible catalog style.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  image: "https://example.invalid/private-safe-fallback.jpg",
  fabricCapacityComposition: garmentTypes.map((garmentType) => ({
    key: `style:${garmentType}`,
    garmentType,
    fabricUnits:
      garmentType === "full_length_gown" ||
      garmentType === "agbada"
        ? 2
        : 1,
  })),
  ...overrides,
} as StyleCategory);

const skipWorkflow: AiTryOnWorkflowStateV1 = {
  schemaVersion: 1,
  status: "skipped",
  inputFingerprint: null,
};

const buildSummaryInput = ({
  garmentTypes = ["shirt"],
  customState = createEmptyGarmentScopedCustomDetailsState(),
  personalizedText,
  aiTryOnWorkflow = skipWorkflow,
}: {
  garmentTypes?: GarmentTypeStepSelection["garmentTypes"];
  customState?: GarmentScopedCustomDetailsStateV1;
  personalizedText?: string;
  aiTryOnWorkflow?: AiTryOnWorkflowStateV1;
} = {}) => {
  const garmentTypeSelection = buildSelection(garmentTypes);
  const fabricAllocationState = makeAllocationState(garmentTypes);
  const fabrics = [fabric];
  const fabricCompletion = getFutureFabricStageCompletion({
    garmentTypeSelection,
    fabricAllocationState,
    fabrics,
  });
  const materialPricing = resolveFabricAllocationMaterialPricing(
    fabricAllocationState.fabricAllocations,
    fabrics,
  );
  assert.equal(materialPricing.status, "resolved");
  const style = makeStyle(garmentTypes);
  const designStyleSelection = reconcileFutureDesignStyleSelection({
    selectedStyleId: style.id,
    styles: [style],
    garmentTypeSelection,
  });
  const customDetailsReconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    style,
    catalogInspection: inspection,
    existingState: customState,
  });
  let personalizedInputs = createEmptyGarmentScopedCustomDetailInputs();
  if (personalizedText) {
    personalizedInputs = setGarmentScopedCustomDetailText({
      state: personalizedInputs,
      garmentKey: "base:shirt",
      selectionGroup: "personalized_additional",
      optionId: "personalized_additional_evaluation",
      text: personalizedText,
    }).state;
  }
  const personalizedReconciliation = reconcileGarmentScopedPersonalizedInputs({
    reconciliation: customDetailsReconciliation,
    catalogInspection: inspection,
    existingInputs: personalizedInputs,
  });
  const customDetailsCompletion = validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation: customDetailsReconciliation,
    personalizedInputs: personalizedReconciliation,
    showAdditionalClothesCosts: true,
  });
  const customDetailsPricing = calculateGarmentScopedCustomDetailsPricing({
    reconciliation: customDetailsReconciliation,
    catalogInspection: inspection,
    showAdditionalClothesCosts: true,
  });
  const physicalGarments = getMeasurementPhysicalGarments({
    garmentTypeSelection,
  });
  const measurementPlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection,
    physicalGarments,
    garmentScopedCustomDetails: customDetailsReconciliation.state,
  });
  let measurementState = createEmptyFutureMeasurementState("low_risk", "inch");
  for (const requirement of measurementPlan.requirements.filter(
    (candidate) => candidate.directInput,
  )) {
    measurementState = setFutureMeasurementInput({
      state: measurementState,
      requirement,
      displayValue:
        requirement.measurementId === "total_height" ||
        requirement.measurementId === "chest_bust_circumference"
          ? 40
          : 10,
    });
  }
  measurementState = reconcileFutureMeasurementState({
    state: measurementState,
    plan: measurementPlan,
  });
  const basePricing = calculateDesignPricing({
    route: "alone",
    design: {},
    materialPricing,
    decorativeFeatureApplicabilityStyle: style,
    baseGarmentComposition: getFutureFabricCapacityComposition(
      garmentTypeSelection,
    ),
    catalog: inspection.activeOptions,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection,
  });
  return {
    step1GarmentTypeSelection: garmentTypeSelection,
    garmentTypeSelection,
    designSourceKind: "catalogue" as const,
    uploadedCompositionSpecs: null,
    additionalGarmentConstructionState: null,
    pendingAdditionalGarment: null,
    catalogInspection: inspection,
    fabricAllocationState,
    fabricCompletion,
    materialPricing,
    designStyleSelection,
    designStyleOccurrences: garmentTypes.map((garmentType) => ({
      target: {
        garmentKey: `base:${garmentType}`,
        occurrenceToken: `base:${garmentType}#1`,
      },
      garmentType,
      label: garmentType[0].toUpperCase() + garmentType.slice(1),
      status: "complete" as const,
      assignment: {
        garmentKey: `base:${garmentType}`,
        occurrenceToken: `base:${garmentType}#1`,
        assignmentRevision: 1,
        sourceKind: "catalog" as const,
        sourceKey: `catalog-style:${style.id}`,
        catalogStyleId: style.id,
        eligibilityFingerprint: "fixture-eligible",
      },
      assignmentLabel: style.name,
    })),
    styles: [style],
    customDetailsReconciliation,
    customDetailsCompletion,
    customDetailsPricing,
    personalizedInputs: personalizedReconciliation.state,
    aiTryOnWorkflow,
    measurementPlan,
    measurementState,
    basePricing,
  };
};

const buildUploadedSummaryInput = ({
  step1GarmentTypes = ["shirt"] as GarmentTypeStepSelection["garmentTypes"],
  uploadedExtraGarmentTypes = ["trouser"] as GarmentTypeStepSelection["garmentTypes"],
  additionalGarmentConstructionState = null as AdditionalGarmentConstructionStateV1 | null,
  effectiveGarmentTypeSelectionOverride = null as GarmentTypeStepSelection | null,
} = {}) => {
  const step1GarmentTypeSelection = buildSelection(step1GarmentTypes);
  const uploadedCompositionSpecs = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes,
    additionalGarmentTypes: uploadedExtraGarmentTypes,
  });
  const garmentTypeSelection =
    effectiveGarmentTypeSelectionOverride ??
    buildEffectiveUploadedJourneyGarmentTypeSelection({
      step1Selection: step1GarmentTypeSelection,
      uploadedComposition: uploadedCompositionSpecs,
      normalizedCustomDetailCatalog: inspection.activeOptions,
    });
  const fabrics = [fabric];
  let fabricAllocationState = FabricAllocationStateEngine.initialize();
  for (const garmentType of garmentTypeSelection.garmentTypes) {
    const assignResult = assignFutureFabricToGarment({
      state: fabricAllocationState,
      garmentTypeSelection,
      garmentKey: `base:${garmentType}`,
      fabricCode: fabric.code,
      fabrics,
    });
    if (assignResult.status === "assigned") {
      fabricAllocationState = assignResult.state;
    }
  }
  const fabricCompletion = getFutureFabricStageCompletion({
    garmentTypeSelection,
    fabricAllocationState,
    fabrics,
  });
  const materialPricing = resolveFabricAllocationMaterialPricing(
    fabricAllocationState.fabricAllocations,
    fabrics,
  );
  assert.equal(materialPricing.status, "resolved");
  const style = makeStyle(garmentTypeSelection.garmentTypes);
  const designStyleSelection = reconcileFutureDesignStyleSelection({
    selectedStyleId: style.id,
    styles: [style],
    garmentTypeSelection,
  });
  const customDetailsReconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    style,
    catalogInspection: inspection,
    existingState: createEmptyGarmentScopedCustomDetailsState(),
  });
  const personalizedReconciliation = reconcileGarmentScopedPersonalizedInputs({
    reconciliation: customDetailsReconciliation,
    catalogInspection: inspection,
    existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
  });
  const customDetailsCompletion = validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation: customDetailsReconciliation,
    personalizedInputs: personalizedReconciliation,
    showAdditionalClothesCosts: true,
  });
  const customDetailsPricing = calculateGarmentScopedCustomDetailsPricing({
    reconciliation: customDetailsReconciliation,
    catalogInspection: inspection,
    showAdditionalClothesCosts: true,
  });
  const measurementPlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection,
    physicalGarments: getMeasurementPhysicalGarments({
      garmentTypeSelection,
    }),
    garmentScopedCustomDetails: customDetailsReconciliation.state,
  });
  let measurementState = createEmptyFutureMeasurementState("low_risk", "inch");
  for (const requirement of measurementPlan.requirements.filter(
    (candidate) => candidate.directInput,
  )) {
    measurementState = setFutureMeasurementInput({
      state: measurementState,
      requirement,
      displayValue:
        requirement.measurementId === "total_height" ||
        requirement.measurementId === "chest_bust_circumference"
          ? 40
          : 10,
    });
  }
  measurementState = reconcileFutureMeasurementState({
    state: measurementState,
    plan: measurementPlan,
  });
  const basePricing = calculateDesignPricing({
    route: "alone",
    design: {},
    materialPricing,
    baseGarmentComposition: uploadedCompositionSpecs,
    catalog: inspection.activeOptions,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection,
  });
  return {
    step1GarmentTypeSelection,
    garmentTypeSelection,
    designSourceKind: "uploaded" as const,
    uploadedCompositionSpecs,
    additionalGarmentConstructionState,
    pendingAdditionalGarment: null,
    catalogInspection: inspection,
    fabricAllocationState,
    fabricCompletion,
    materialPricing,
    designStyleSelection,
    customDetailsReconciliation,
    customDetailsCompletion,
    customDetailsPricing,
    personalizedInputs: personalizedReconciliation.state,
    aiTryOnWorkflow: skipWorkflow,
    measurementPlan,
    measurementState,
    basePricing,
  };
};

const emptyAdditionalConstructionState =
  (): AdditionalGarmentConstructionStateV1 => ({
    schemaVersion: 1,
    byGarmentKey: {},
  });

const authorizedAdditionalConstructionState = (
  garmentKey: string,
  garmentType: GarmentTypeStepSelection["garmentTypes"][number],
  priceCents = 6500,
): AdditionalGarmentConstructionStateV1 => {
  const base = resolveGarmentConstructionPricing(
    garmentType,
    inspection.activeOptions,
  );
  assert.equal(base.status, "resolved");
  const resolved = cloneGarmentConstructionPricingResolution(base);
  assert.equal(resolved.status, "resolved");
  return {
    schemaVersion: 1,
    byGarmentKey: {
      [garmentKey]: {
        ...resolved,
        totalPriceCents: priceCents,
        totalPrice: priceCents / 100,
        components: resolved.components.map((component, index) =>
          index === 0 ? { ...component, priceCents } : { ...component, priceCents: 0 },
        ),
      },
    },
  };
};

const projectConstructionBreakdown = ({
  input,
  summary,
  additionalGarmentConstructions = emptyAdditionalConstructionState(),
}: {
  input: ReturnType<typeof buildSummaryInput>;
  summary: ReturnType<typeof projectFutureDesignStudioSummary>;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
}) => projectCustomerGarmentConstructionBreakdown({
  pricing: input.basePricing,
  subjects: input.customDetailsReconciliation.subjects,
  garmentTypeSelection: input.garmentTypeSelection,
  additionalGarments: input.fabricAllocationState.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .filter((assignment) => assignment.sourceRole === "additional"),
  additionalGarmentConstructions,
  catalogInspection: input.catalogInspection,
  constructionSubtotal: summary.pricingSummary.garmentConstructionSubtotal,
});

const completeShirtDetails = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
): GarmentScopedCustomDetailsStateV1 =>
  setGarmentScopedCustomDetailSelection(
    setGarmentScopedCustomDetailSelection(
      state,
      garmentKey,
      "shirt_pockets",
      "shirt_pocket_0",
    ),
    garmentKey,
    "neck_design",
    "neck_no_round",
  );

const exactCustomState = setGarmentScopedCustomDetailSelection(
  completeShirtDetails(
    createEmptyGarmentScopedCustomDetailsState(),
    "base:shirt",
  ),
  "base:shirt",
  "neck_additional",
  "neck_additional_no_cost",
);
const exactInput = buildSummaryInput({ customState: exactCustomState });
const exactSummary = projectFutureDesignStudioSummary(exactInput);
assert.equal(exactSummary.status, "ready");
assert.deepEqual(
  projectFutureDesignStudioSummary(exactInput),
  exactSummary,
  "projection must be deterministic",
);
assert.deepEqual(exactSummary.garmentSummary.map((row) => row.garmentType), ["shirt"]);
assert.equal(exactSummary.garmentSummary[0]?.label, "Standard Shirt");
assert.equal(exactSummary.garmentSummary[0]?.label.includes(" 1"), false);
assert.equal(exactSummary.designStyleSummary, null);
assert.deepEqual(exactSummary.designStyleOccurrences?.map((row) => row.name), ["Heritage Complete Look"]);
assert.equal(exactSummary.customDetailsSummary[0].occurrences[0].priceCents, 0);
assert.equal(exactSummary.aiTryOnSummary.label, "Skipped by choice");
assert.ok(exactSummary.measurementSummary.shared.length > 0);
const dualInchDisplay = /^\d+(?:\.\d{1,2})? in \(\d+(?:\.\d{1,2})? cm\)$/;
const dualCentimetreDisplay = /^\d+(?:\.\d{1,2})? cm \(\d+(?:\.\d{1,2})? in\)$/;
assert.equal(formatDualUnitMeasurementDisplay(106.68, "inch"), "42 in (106.68 cm)");
assert.equal(formatDualUnitMeasurementDisplay(106.68, "cm"), "106.68 cm (42 in)");
assert.deepEqual(getDualUnitMeasurementParts(106.68, "inch"), {
  preferred: "42 in",
  alternate: "106.68 cm",
});
assert.deepEqual(getDualUnitMeasurementParts(106.68, "cm"), {
  preferred: "106.68 cm",
  alternate: "42 in",
});
assert.ok(
  [
    ...exactSummary.measurementSummary.shared,
    ...exactSummary.measurementSummary.byGarment.flatMap((garment) => garment.values),
  ].every(
    (value) =>
      `${value.formattedParts.preferred} (${value.formattedParts.alternate})` ===
        value.formattedValue &&
      value.formattedParts.preferred.endsWith(" in") &&
      value.formattedParts.alternate.endsWith(" cm"),
  ),
  "split-pill parts carry the same canonical values, inches first when inches are preferred",
);
assert.ok(
  exactSummary.measurementSummary.shared.every((value) =>
    dualInchDisplay.test(value.formattedValue),
  ),
  "inch-preferred summary rows show inches first and centimetres in parentheses",
);
assert.ok(
  exactSummary.measurementSummary.shared.some(
    (value) => value.formattedValue === "10 in (25.4 cm)",
  ),
  "a 10 inch entry stays canonical and renders both units",
);
assert.ok(
  exactSummary.measurementSummary.byGarment.every((garment) =>
    garment.values.every((value) => dualInchDisplay.test(value.formattedValue)),
  ),
  "garment measurement rows use the same dual-unit format",
);
const centimetrePreferredSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  measurementState: {
    ...exactInput.measurementState,
    unit: "cm",
  },
});
assert.ok(
  centimetrePreferredSummary.measurementSummary.shared.every((value) =>
    dualCentimetreDisplay.test(value.formattedValue),
  ),
  "centimetre-preferred summary rows show centimetres first and inches in parentheses",
);
assert.ok(
  centimetrePreferredSummary.measurementSummary.shared.some(
    (value) => value.formattedValue === "25.4 cm (10 in)",
  ),
  "the same canonical centimetres render centimetres first when that unit is preferred",
);
assert.ok(
  centimetrePreferredSummary.measurementSummary.shared.some(
    (value) =>
      value.formattedParts.preferred === "25.4 cm" &&
      value.formattedParts.alternate === "10 in",
  ),
  "centimetre-preferred split-pill parts put centimetres on the left",
);
assert.ok(
  exactSummary.measurementSummary.byGarment.some(
    (garment) => garment.garmentKey === "base:shirt" && garment.values.length > 0,
  ),
  "garment-specific measurements remain separate from shared measurements",
);
assert.equal(exactSummary.pricingSummary.status, "exact");
assert.equal(
  exactSummary.pricingSummary.selectedDesignPrice?.eindhovenToDestinationShipping,
  null,
  "future final-mile shipping must remain excluded",
);
assert.equal(
  exactSummary.pricingSummary.selectedDesignPrice?.selectedDesignPrice,
  Number((
    exactSummary.pricingSummary.garmentConstructionSubtotal! +
    exactSummary.pricingSummary.customDetailsExactSubtotal
  ).toFixed(2)),
  "construction and occurrence-priced Custom Details reconcile exactly once",
);
assert.equal(
  exactSummary.pricingSummary.garmentConstructionSubtotal,
  65,
  "Standard Shirt construction remains the all-inclusive €65 price",
);
assert.equal(
  exactSummary.pricingSummary.customDetailsExactSubtotal,
  0,
  "included Neck, pocket, and other zero-price details stay outside paid totals",
);
const exactConstructionBreakdown = projectConstructionBreakdown({
  input: exactInput,
  summary: exactSummary,
});
assert.equal(exactConstructionBreakdown.status, "complete");
assert.deepEqual(
  exactConstructionBreakdown.rows,
  [{
    garmentKey: "base:shirt",
    garmentLabel: "Standard Shirt",
    constructionLabel: "Standard Length Shirt, Short Sleeve",
    role: "main",
    priceCents: 6500,
  }],
  "the authoritative Shirt occurrence row supplies its selected construction and all-inclusive price once",
);
assert.equal(
  exactConstructionBreakdown.rows.reduce(
    (totalCents, row) => totalCents + (row.priceCents || 0),
    0,
  ),
  Math.round(exactSummary.pricingSummary.garmentConstructionSubtotal! * 100),
  "displayed construction rows reconcile to the pricing engine subtotal in integer cents",
);
const inactiveConstructionLabelBreakdown =
  projectCustomerGarmentConstructionBreakdown({
    pricing: exactInput.basePricing,
    subjects: exactInput.customDetailsReconciliation.subjects,
    garmentTypeSelection: exactInput.garmentTypeSelection,
    additionalGarments: [],
    additionalGarmentConstructions: emptyAdditionalConstructionState(),
    catalogInspection: inspectCustomDetailCatalog([
      createCustomDetailCatalogTombstone("shirt_std_short"),
    ]),
    constructionSubtotal:
      exactSummary.pricingSummary.garmentConstructionSubtotal,
  });
assert.equal(inactiveConstructionLabelBreakdown.status, "pending");
assert.deepEqual(
  inactiveConstructionLabelBreakdown.rows.map((row) => [
    row.constructionLabel,
    row.priceCents,
  ]),
  [[CONSTRUCTION_OPTION_FALLBACK_LABEL, null]],
  "a missing exact-garment construction default fails closed instead of substituting another option",
);
const activeShirtConstructionOption = inspection.activeOptions.find(
  (option) => option.id === "shirt_std_short",
)!;
const blankConstructionLabelBreakdown =
  projectCustomerGarmentConstructionBreakdown({
    pricing: exactInput.basePricing,
    subjects: exactInput.customDetailsReconciliation.subjects,
    garmentTypeSelection: exactInput.garmentTypeSelection,
    additionalGarments: [],
    additionalGarmentConstructions: emptyAdditionalConstructionState(),
    catalogInspection: inspectCustomDetailCatalog([{
      ...activeShirtConstructionOption,
      label: "   ",
    }]),
    constructionSubtotal:
      exactSummary.pricingSummary.garmentConstructionSubtotal,
  });
assert.equal(blankConstructionLabelBreakdown.status, "pending");
assert.deepEqual(
  blankConstructionLabelBreakdown.rows.map((row) => [
    row.constructionLabel,
    row.priceCents,
  ]),
  [[CONSTRUCTION_OPTION_FALLBACK_LABEL, null]],
  "a malformed exact-garment construction default remains unresolved rather than borrowing another option",
);
assert.equal(
  blankConstructionLabelBreakdown.rows[0].priceCents,
  null,
  "an unresolved exact-garment construction must not expose a stale subtotal row",
);
const unresolvedConstructionCatalog = inspection.activeOptions.map((option) =>
  option.selectionGroup === "shirt_construction"
    ? { ...option, active: false }
    : option,
);
const unresolvedGarmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: unresolvedConstructionCatalog,
}).selection;
const unresolvedConstructionReconciliation =
  reconcileGarmentScopedCustomDetails({
    garmentTypeSelection: unresolvedGarmentTypeSelection,
    style: makeStyle(["shirt"]),
    catalogInspection: inspection,
    existingState: createEmptyGarmentScopedCustomDetailsState(),
  });
const unresolvedConstructionPricing = calculateDesignPricing({
  route: "alone",
  design: {},
  materialPricing: exactInput.materialPricing,
  decorativeFeatureApplicabilityStyle: makeStyle(["shirt"]),
  baseGarmentComposition: getFutureFabricCapacityComposition(
    unresolvedGarmentTypeSelection,
  ),
  catalog: unresolvedConstructionCatalog,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection: unresolvedGarmentTypeSelection,
});
assert.equal(
  unresolvedConstructionPricing?.baseGarmentPricingStatus,
  "unresolved",
);
const unresolvedConstructionBreakdown =
  projectCustomerGarmentConstructionBreakdown({
    pricing: unresolvedConstructionPricing,
    subjects: unresolvedConstructionReconciliation.subjects,
    garmentTypeSelection: unresolvedGarmentTypeSelection,
    additionalGarments: [],
    additionalGarmentConstructions: emptyAdditionalConstructionState(),
    catalogInspection: inspection,
    constructionSubtotal:
      unresolvedConstructionPricing?.garmentConstructionSubtotal ?? null,
  });
assert.equal(unresolvedConstructionBreakdown.status, "pending");
assert.equal(
  unresolvedConstructionBreakdown.rows.every(
    (row) => row.priceCents === null,
  ),
  true,
  "genuinely unresolved authoritative construction remains Price pending",
);
const malformedAuthoritativeMoneyBreakdown =
  projectCustomerGarmentConstructionBreakdown({
    pricing: {
      ...exactInput.basePricing!,
      baseGarmentPriceRows: exactInput.basePricing!.baseGarmentPriceRows.map(
        (row) => ({ ...row, price: Number.NaN }),
      ),
    },
    subjects: exactInput.customDetailsReconciliation.subjects,
    garmentTypeSelection: exactInput.garmentTypeSelection,
    additionalGarments: [],
    additionalGarmentConstructions: emptyAdditionalConstructionState(),
    catalogInspection: inspection,
    constructionSubtotal:
      exactSummary.pricingSummary.garmentConstructionSubtotal,
  });
assert.equal(malformedAuthoritativeMoneyBreakdown.status, "pending");
assert.equal(malformedAuthoritativeMoneyBreakdown.rows[0].priceCents, null);
assert.equal(
  malformedAuthoritativeMoneyBreakdown.rows.some(
    (row) => row.priceCents === 0,
  ),
  false,
  "malformed authoritative money never falls back to zero",
);
assert.equal(
  exactSummary.pricingSummary.selectedDesignPrice?.includedComponents
    .lagosToEindhovenShipping,
  "INCLUDED_IN_GARMENT_CONSTRUCTION",
);
assert.equal(
  exactSummary.fabricSummary[0].pricingTreatment,
  "included_in_garment_construction",
);

const shirtTrouserInput = buildSummaryInput({ garmentTypes: ["shirt", "trouser"] });
const shirtTrouserSummary = projectFutureDesignStudioSummary(shirtTrouserInput);
const shirtTrouserConstructionBreakdown = projectConstructionBreakdown({
  input: shirtTrouserInput,
  summary: shirtTrouserSummary,
});
assert.equal(shirtTrouserConstructionBreakdown.status, "complete");
assert.deepEqual(
  shirtTrouserConstructionBreakdown.rows.map((row) => [
    row.garmentKey,
    row.constructionLabel,
    row.priceCents,
  ]),
  [
    ["base:shirt", "Standard Length Shirt, Short Sleeve", 6500],
    ["base:trouser", "With Rope", 7500],
  ],
  "Shirt and Trouser retain independent authoritative construction rows",
);
assert.equal(
  shirtTrouserConstructionBreakdown.rows.reduce(
    (totalCents, row) => totalCents + (row.priceCents || 0),
    0,
  ),
  Math.round(shirtTrouserSummary.pricingSummary.garmentConstructionSubtotal! * 100),
  "multiple garment construction rows remain a once-only explanation of the subtotal",
);

const selectedTrouserRopeElastic = selectGarmentConstructionOption({
  resolution: shirtTrouserInput.garmentTypeSelection.constructionByGarment.trouser!,
  selectionGroup: "trouser_fastening",
  optionId: "trouser_rope_elastic",
  normalizedCustomDetailCatalog: inspection.activeOptions,
});
assert.equal(selectedTrouserRopeElastic.status, "selected");
if (selectedTrouserRopeElastic.status === "selected") {
  assert.equal(selectedTrouserRopeElastic.resolution.status, "resolved");
  if (selectedTrouserRopeElastic.resolution.status === "resolved") {
    assert.equal(
      selectedTrouserRopeElastic.resolution.totalPriceCents,
      8500,
      "With Rope Plus Elastic Band is an €85 Trouser construction total, not a surcharge",
    );
    assert.equal(
      selectedTrouserRopeElastic.resolution.components.length,
      1,
      "Rope Plus Elastic replaces Rope/Elastic/Belt instead of stacking",
    );
  }
  const ropeElasticGarmentTypeSelection = {
    ...shirtTrouserInput.garmentTypeSelection,
    constructionByGarment: {
      ...shirtTrouserInput.garmentTypeSelection.constructionByGarment,
      trouser: selectedTrouserRopeElastic.resolution,
    },
  };
  const ropeElasticPricing = calculateDesignPricing({
    route: "alone",
    design: {},
    materialPricing: shirtTrouserInput.materialPricing,
    baseGarmentComposition: getFutureFabricCapacityComposition(
      ropeElasticGarmentTypeSelection,
    ),
    catalog: inspection.activeOptions,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection: ropeElasticGarmentTypeSelection,
  });
  const ropeElasticSummary = projectFutureDesignStudioSummary({
    ...shirtTrouserInput,
    garmentTypeSelection: ropeElasticGarmentTypeSelection,
    basePricing: ropeElasticPricing,
  });
  const ropeElasticConstructionBreakdown = projectCustomerGarmentConstructionBreakdown({
    pricing: ropeElasticPricing,
    subjects: shirtTrouserInput.customDetailsReconciliation.subjects,
    garmentTypeSelection: ropeElasticGarmentTypeSelection,
    additionalGarments: [],
    additionalGarmentConstructions: emptyAdditionalConstructionState(),
    catalogInspection: inspection,
    constructionSubtotal:
      ropeElasticSummary.pricingSummary.garmentConstructionSubtotal,
  });
  assert.equal(ropeElasticConstructionBreakdown.status, "complete");
  assert.deepEqual(
    ropeElasticConstructionBreakdown.rows.map((row) => [
      row.garmentKey,
      row.constructionLabel,
      row.priceCents,
    ]),
    [
      ["base:shirt", "Standard Length Shirt, Short Sleeve", 6500],
      ["base:trouser", "With Rope Plus Elastic Band", 8500],
    ],
    "selecting Rope Plus Elastic on garmentTypeSelection projects that Trouser construction total",
  );
  assert.equal(
    ropeElasticSummary.garmentSummary.find(
      (row) => row.garmentKey === "base:trouser",
    )?.constructionTotalCents,
    8500,
    "Garments Ordered keeps the Trouser occurrence at €85",
  );
  assert.equal(
    ropeElasticSummary.garmentSummary.find(
      (row) => row.garmentKey === "base:shirt",
    )?.constructionTotalCents,
    6500,
    "one Trouser occurrence at €85 must not change Shirt construction",
  );
  const defaultConstructionSubtotalCents = Math.round(
    shirtTrouserSummary.pricingSummary.garmentConstructionSubtotal! * 100,
  );
  const ropeElasticConstructionSubtotalCents = Math.round(
    ropeElasticSummary.pricingSummary.garmentConstructionSubtotal! * 100,
  );
  assert.equal(defaultConstructionSubtotalCents, 14000);
  assert.equal(ropeElasticConstructionSubtotalCents, 15000);
  assert.equal(
    ropeElasticConstructionSubtotalCents - defaultConstructionSubtotalCents,
    1000,
    "75→85 is +10 once; Rope Plus Elastic replaces Rope instead of stacking",
  );
  const ropeElasticLiveSummary = projectDesignStudioLiveOrderSummary({
    summary: ropeElasticSummary,
    shippingResolution: reconcileFutureShippingState({
      state: createEmptyFutureShippingState(),
      garmentCount: ropeElasticSummary.garmentSummary.length,
      selectedDesignPrice:
        ropeElasticSummary.pricingSummary.selectedDesignPrice
          ?.selectedDesignPrice ?? null,
    }),
    candidatePricing: null,
    fabricAllocationState: shirtTrouserInput.fabricAllocationState,
    measurementState: shirtTrouserInput.measurementState,
    measurementPlan: shirtTrouserInput.measurementPlan,
    designSource: null,
  });
  const garmentsOrdered = ropeElasticLiveSummary.sections.find(
    (section) => section.id === "construction",
  );
  assert.equal(
    garmentsOrdered?.lines.find((line) => line.id === "construction-base:trouser")
      ?.amountLabel,
    "€85.00",
    "Garments Ordered line for the Trouser occurrence is €85.00",
  );
  assert.equal(
    garmentsOrdered?.lines.find((line) => line.id === "construction-base:shirt")
      ?.amountLabel,
    "€65.00",
  );
  assert.equal(garmentsOrdered?.footer?.amountLabel, "€150.00");
  const switchedBackToRope = selectGarmentConstructionOption({
    resolution: selectedTrouserRopeElastic.resolution,
    selectionGroup: "trouser_fastening",
    optionId: "trouser_rope",
    normalizedCustomDetailCatalog: inspection.activeOptions,
  });
  assert.equal(switchedBackToRope.status, "selected");
  if (switchedBackToRope.status === "selected") {
    const restoredGarmentTypeSelection = {
      ...ropeElasticGarmentTypeSelection,
      constructionByGarment: {
        ...ropeElasticGarmentTypeSelection.constructionByGarment,
        trouser: switchedBackToRope.resolution,
      },
    };
    const restoredPricing = calculateDesignPricing({
      route: "alone",
      design: {},
      materialPricing: shirtTrouserInput.materialPricing,
      baseGarmentComposition: getFutureFabricCapacityComposition(
        restoredGarmentTypeSelection,
      ),
      catalog: inspection.activeOptions,
      businessSettings,
      garmentConstructionSelectionMode: "garment_type_locked",
      garmentTypeSelection: restoredGarmentTypeSelection,
    });
    const restoredSummary = projectFutureDesignStudioSummary({
      ...shirtTrouserInput,
      garmentTypeSelection: restoredGarmentTypeSelection,
      basePricing: restoredPricing,
    });
    assert.equal(
      restoredSummary.garmentSummary.find(
        (row) => row.garmentKey === "base:trouser",
      )?.constructionTotalCents,
      7500,
      "switching back to Rope removes the €85 construction total",
    );
    assert.equal(
      Math.round(restoredSummary.pricingSummary.garmentConstructionSubtotal! * 100),
      14000,
    );
  }
}

const selectedShirtAlternative = selectGarmentConstructionOption({
  resolution: exactInput.garmentTypeSelection.constructionByGarment.shirt!,
  selectionGroup: "shirt_construction",
  optionId: "shirt_std_midlong",
  normalizedCustomDetailCatalog: inspection.activeOptions,
});
assert.equal(selectedShirtAlternative.status, "selected");
if (selectedShirtAlternative.status === "selected") {
  const alternativeGarmentTypeSelection = {
    ...exactInput.garmentTypeSelection,
    constructionByGarment: {
      ...exactInput.garmentTypeSelection.constructionByGarment,
      shirt: selectedShirtAlternative.resolution,
    },
  };
  const alternativePricing = calculateDesignPricing({
    route: "alone",
    design: {},
    materialPricing: exactInput.materialPricing,
    baseGarmentComposition: getFutureFabricCapacityComposition(alternativeGarmentTypeSelection),
    catalog: inspection.activeOptions,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection: alternativeGarmentTypeSelection,
  });
  const alternativeSummary = projectFutureDesignStudioSummary({
    ...exactInput,
    garmentTypeSelection: alternativeGarmentTypeSelection,
    basePricing: alternativePricing,
  });
  const alternativeConstructionBreakdown = projectCustomerGarmentConstructionBreakdown({
    pricing: alternativePricing,
    subjects: exactInput.customDetailsReconciliation.subjects,
    garmentTypeSelection: alternativeGarmentTypeSelection,
    additionalGarments: [],
    additionalGarmentConstructions: emptyAdditionalConstructionState(),
    catalogInspection: inspection,
    constructionSubtotal:
      alternativeSummary.pricingSummary.garmentConstructionSubtotal,
  });
  assert.equal(alternativeConstructionBreakdown.status, "complete");
  assert.deepEqual(
    alternativeConstructionBreakdown.rows,
    [{
      garmentKey: "base:shirt",
      garmentLabel: "Standard Shirt",
      constructionLabel: "Standard Length Shirt, Mid-Long Sleeve",
      role: "main",
      priceCents: 7000,
    }],
    "selecting shirt_std_midlong on garmentTypeSelection projects that construction total, not the Step 1 short default",
  );
}

for (const [garmentType, selectionGroup, optionId, garmentKey, defaultCents] of [
  ["standard_shorts", "standard_shorts_fastening", "shorts_std_rope_elastic", "base:standard_shorts", 7000],
  ["bum_shorts", "bum_shorts_fastening", "bum_rope_elastic", "base:bum_shorts", 7000],
] as const) {
  const shortsInput = buildSummaryInput({ garmentTypes: [garmentType] });
  const defaultShortsSummary = projectFutureDesignStudioSummary(shortsInput);
  assert.equal(
    defaultShortsSummary.garmentSummary.find((row) => row.garmentKey === garmentKey)
      ?.constructionTotalCents,
    defaultCents,
  );
  const selectedShorts = selectGarmentConstructionOption({
    resolution: shortsInput.garmentTypeSelection.constructionByGarment[garmentType]!,
    selectionGroup,
    optionId,
    normalizedCustomDetailCatalog: inspection.activeOptions,
  });
  assert.equal(selectedShorts.status, "selected", `${garmentType} must accept Rope Plus Elastic`);
  if (selectedShorts.status !== "selected") continue;
  const shortsSelection = {
    ...shortsInput.garmentTypeSelection,
    constructionByGarment: {
      ...shortsInput.garmentTypeSelection.constructionByGarment,
      [garmentType]: selectedShorts.resolution,
    },
  };
  const shortsPricing = calculateDesignPricing({
    route: "alone",
    design: {},
    materialPricing: shortsInput.materialPricing,
    baseGarmentComposition: getFutureFabricCapacityComposition(shortsSelection),
    catalog: inspection.activeOptions,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection: shortsSelection,
  });
  const shortsSummary = projectFutureDesignStudioSummary({
    ...shortsInput,
    garmentTypeSelection: shortsSelection,
    basePricing: shortsPricing,
  });
  assert.equal(
    shortsSummary.garmentSummary.find((row) => row.garmentKey === garmentKey)
      ?.constructionTotalCents,
    8500,
    `Garments Ordered keeps the ${garmentType} occurrence at €85`,
  );
  const defaultSubtotalCents = Math.round(
    defaultShortsSummary.pricingSummary.garmentConstructionSubtotal! * 100,
  );
  const selectedSubtotalCents = Math.round(
    shortsSummary.pricingSummary.garmentConstructionSubtotal! * 100,
  );
  assert.equal(defaultSubtotalCents, defaultCents);
  assert.equal(selectedSubtotalCents, 8500);
  assert.equal(
    selectedSubtotalCents - defaultSubtotalCents,
    1500,
    `70→85 is +15 once; ${garmentType} Rope Plus Elastic replaces Rope`,
  );
}

const additionalShirtSelection = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt", "trouser"]),
});
assert.equal(additionalShirtSelection.status, "resolved");
if (additionalShirtSelection.status !== "resolved") {
  throw new Error("Expected the catalogue Shirt addition to resolve");
}
const repeatedShirtFabricState = appendCustomerFabricGarment(
  exactInput.fabricAllocationState,
  fabric.code,
  additionalShirtSelection.selection,
);
assert.equal(repeatedShirtFabricState.pendingFabricGarment, null);
const repeatedShirtAssignments = repeatedShirtFabricState.fabricAllocations
  .flatMap((allocation) => allocation.garmentAssignments)
  .filter((assignment) => assignment.sourceRole === "additional");
assert.deepEqual(
  repeatedShirtAssignments.map((assignment) => assignment.garmentKey),
  ["additional:shirt:1"],
);
const repeatedShirtAuthorizedConstruction = authorizedAdditionalConstructionState(
  "additional:shirt:1",
  "shirt",
);
const repeatedShirtConstruction = reconcileAdditionalGarmentConstructionState({
  existingState: repeatedShirtAuthorizedConstruction,
  assignments: repeatedShirtAssignments,
  normalizedCustomDetailCatalog: inspection.activeOptions,
});
const repeatedShirtSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  fabricAllocationState: repeatedShirtFabricState,
  additionalGarmentConstructionState: repeatedShirtConstruction.state,
});
assert.deepEqual(
  repeatedShirtSummary.garmentSummary.map((row) => row.garmentKey).sort(),
  ["additional:shirt:1", "base:shirt"],
  "summary must project every fabric assignment occurrence once",
);
assert.deepEqual(
  repeatedShirtSummary.garmentSummary.map((row) => [row.garmentKey, row.label]),
  [
    ["base:shirt", "Standard Shirt"],
    ["additional:shirt:1", "Standard Shirt 2"],
  ],
);
assert.equal(
  repeatedShirtSummary.garmentSummary.filter((row) => row.label === "Standard Shirt")
    .length,
  1,
);
const repeatedAssignedLabels = repeatedShirtSummary.fabricSummary.flatMap(
  (allocation) => allocation.garments.map((garment) => garment.label),
);
assert.equal(repeatedAssignedLabels.join(", "), "Standard Shirt, Standard Shirt 2");
const repeatedSummaryMarkup = renderToStaticMarkup(
  createElement(DormantFutureSummaryStep, {
    summary: repeatedShirtSummary,
    onBack: () => {},
    onEditGarments: () => {},
    onEditFabrics: () => {},
    onEditDesignStyle: () => {},
    onEditCustomDetails: () => {},
    onEditAiTryOn: () => {},
    onEditMeasurements: () => {},
    canContinueToShipping: false,
    onContinueToShipping: () => {},
  }),
);
assert.ok(repeatedSummaryMarkup.includes(">Standard Shirt</h4>"));
assert.ok(repeatedSummaryMarkup.includes(">Standard Shirt 2</h4>"));
assert.equal(repeatedSummaryMarkup.includes(">Standard Shirt 1</h4>"), false);
assert.ok(repeatedSummaryMarkup.includes("Standard Shirt, Standard Shirt 2"));
const chiefAdaRuntimes = [
  {
    wearerId: "wearer-chief",
    displayName: "Chief",
    fitContext: "male" as const,
    garmentKeys: ["base:shirt"],
    plan: exactInput.measurementPlan,
    measurement: exactInput.measurementState,
  },
  {
    wearerId: "wearer-ada",
    displayName: "Ada",
    fitContext: "female" as const,
    garmentKeys: ["additional:shirt:1"],
    plan: exactInput.measurementPlan,
    measurement: exactInput.measurementState,
  },
];
const chiefAdaSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  fabricAllocationState: repeatedShirtFabricState,
  additionalGarmentConstructionState: repeatedShirtConstruction.state,
  wearerRuntimes: chiefAdaRuntimes,
});
const chiefAdaAgain = projectFutureDesignStudioSummary({
  ...exactInput,
  fabricAllocationState: repeatedShirtFabricState,
  additionalGarmentConstructionState: repeatedShirtConstruction.state,
  wearerRuntimes: chiefAdaRuntimes,
});
// Measurement gender follows the Studio garment demographic, never a per-person fit.
for (const row of chiefAdaSummary.garmentSummary) {
  assert.equal(row.demographic, exactInput.garmentTypeSelection.demographic);
}
assert.deepEqual(
  chiefAdaAgain.garmentSummary.map((row) => [row.garmentKey, row.demographic, row.label]),
  chiefAdaSummary.garmentSummary.map((row) => [row.garmentKey, row.demographic, row.label]),
);
assert.deepEqual(
  chiefAdaSummary.garmentSummary.map((row) => row.garmentKey),
  ["base:shirt", "additional:shirt:1"],
);
assert.equal(chiefAdaRuntimes[0].fitContext, "male");
assert.equal(chiefAdaRuntimes[1].fitContext, "female");
const projectedWearers = projectAuthoritativeOrderMeasurements({
  wearerRuntimes: chiefAdaRuntimes,
  measurementState: exactInput.measurementState,
  measurementPlan: exactInput.measurementPlan,
});
assert.equal(isWearerOrderStateV2(projectedWearers), true);
if (isWearerOrderStateV2(projectedWearers)) {
  assert.equal(
    projectedWearers.wearers.find((wearer) => wearer.wearerId === "wearer-ada")?.fitContext,
    "female",
  );
  assert.equal(projectedWearers.assignmentByGarmentKey["additional:shirt:1"], "wearer-ada");
  assert.equal(projectedWearers.assignmentByGarmentKey["base:shirt"], "wearer-chief");
}
const chiefAdaMarkup = renderToStaticMarkup(
  createElement(DormantFutureSummaryStep, {
    summary: chiefAdaSummary,
    onBack: () => {},
    onEditGarments: () => {},
    onEditFabrics: () => {},
    onEditDesignStyle: () => {},
    onEditCustomDetails: () => {},
    onEditAiTryOn: () => {},
    onEditMeasurements: () => {},
    canContinueToShipping: false,
    onContinueToShipping: () => {},
  }),
);
const standardShirtCard = chiefAdaMarkup.split(">Standard Shirt 2</h4>")[0] || "";
const standardShirt2Card = chiefAdaMarkup.split(">Standard Shirt 2</h4>")[1] || "";
assert.doesNotMatch(standardShirtCard, /Fit pending/);
assert.doesNotMatch(standardShirt2Card, /Fit pending/);
assert.doesNotMatch(chiefAdaMarkup, />male \|/);
assert.doesNotMatch(chiefAdaMarkup, />female \|/);
assert.equal(chiefAdaMarkup.includes(">base:shirt<"), false);
assert.equal(chiefAdaMarkup.includes(">additional:shirt:1<"), false);
assert.ok(chiefAdaMarkup.includes("Standard Shirt"));
assert.ok(chiefAdaMarkup.includes("Standard Shirt 2"));
const aggregateSidebar = projectDesignStudioLiveOrderSummary({
  summary: chiefAdaSummary,
  shippingResolution: null,
  candidatePricing: null,
  fabricAllocationState: repeatedShirtFabricState,
  measurementState: exactInput.measurementState,
  measurementPlan: exactInput.measurementPlan,
  orderMeasurementCompletion: { complete: false, remainingRequiredCount: 14 },
  designSource: null,
});
const aggregateLine = aggregateSidebar.sections.find((section) => section.id === "measurements")
  ?.lines[0]?.label || "";
assert.equal(aggregateLine.includes("Complete"), false);
assert.match(aggregateLine, /14 required measurements remaining/);
assert.deepEqual(repeatedShirtConstruction.unresolvedGarmentKeys, []);
const repeatedShirtReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: exactInput.garmentTypeSelection,
  additionalGarments: repeatedShirtAssignments,
  additionalGarmentConstructions: repeatedShirtConstruction.state,
  style: exactInput.designStyleSelection.selectedStyle,
  catalogInspection: inspection,
  existingState: exactInput.customDetailsReconciliation.state,
});
const repeatedShirtMaterialPricing = resolveFabricAllocationMaterialPricing(
  repeatedShirtFabricState.fabricAllocations,
  [fabric],
);
assert.equal(repeatedShirtMaterialPricing.status, "resolved");
const repeatedShirtPricing = calculateDesignPricing({
  route: "alone",
  design: {
    additionalGarmentConstructions: repeatedShirtConstruction.state,
  },
  materialPricing: repeatedShirtMaterialPricing,
  decorativeFeatureApplicabilityStyle:
    exactInput.designStyleSelection.selectedStyle,
  baseGarmentComposition: getFutureFabricCapacityComposition(
    exactInput.garmentTypeSelection,
  ),
  additionalGarments: repeatedShirtAssignments,
  catalog: inspection.activeOptions,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection: exactInput.garmentTypeSelection,
});
const repeatedShirtBreakdown = projectCustomerGarmentConstructionBreakdown({
  pricing: repeatedShirtPricing,
  subjects: repeatedShirtReconciliation.subjects,
  garmentTypeSelection: exactInput.garmentTypeSelection,
  additionalGarments: repeatedShirtAssignments,
  additionalGarmentConstructions: repeatedShirtConstruction.state,
  catalogInspection: inspection,
  constructionSubtotal: repeatedShirtPricing.garmentConstructionSubtotal,
});
assert.equal(repeatedShirtBreakdown.status, "complete");
assert.deepEqual(
  repeatedShirtBreakdown.rows.map((row) => [
    row.garmentKey,
    row.constructionLabel,
    row.priceCents,
  ]),
  [
    ["base:shirt", "Standard Length Shirt, Short Sleeve", 6500],
    ["additional:shirt:1", "Standard Length Shirt, Short Sleeve", 6500],
  ],
  "base and repeated additional Shirt occurrences reconcile by stable key",
);
assert.equal(
  repeatedShirtBreakdown.rows.reduce(
    (totalCents, row) => totalCents + (row.priceCents || 0),
    0,
  ),
  Math.round(repeatedShirtPricing.garmentConstructionSubtotal * 100),
);

const repeatedShirtAlternative = selectGarmentConstructionOption({
  resolution:
    repeatedShirtConstruction.state.byGarmentKey["additional:shirt:1"],
  selectionGroup: "shirt_construction",
  optionId: "shirt_std_midlong",
  normalizedCustomDetailCatalog: inspection.activeOptions,
});
assert.equal(repeatedShirtAlternative.status, "selected");
if (repeatedShirtAlternative.status !== "selected") {
  throw new Error("Expected the repeated Shirt construction alternative to resolve");
}
const changedRepeatedShirtConstruction: AdditionalGarmentConstructionStateV1 = {
  schemaVersion: 1,
  byGarmentKey: {
    ...repeatedShirtConstruction.state.byGarmentKey,
    "additional:shirt:1": repeatedShirtAlternative.resolution,
  },
};
const changedRepeatedShirtPricing = calculateDesignPricing({
  route: "alone",
  design: {
    additionalGarmentConstructions: changedRepeatedShirtConstruction,
  },
  materialPricing: repeatedShirtMaterialPricing,
  decorativeFeatureApplicabilityStyle:
    exactInput.designStyleSelection.selectedStyle,
  baseGarmentComposition: getFutureFabricCapacityComposition(
    exactInput.garmentTypeSelection,
  ),
  additionalGarments: repeatedShirtAssignments,
  catalog: inspection.activeOptions,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection: exactInput.garmentTypeSelection,
});
const changedRepeatedShirtBreakdown = projectCustomerGarmentConstructionBreakdown({
  pricing: changedRepeatedShirtPricing,
  subjects: repeatedShirtReconciliation.subjects,
  garmentTypeSelection: exactInput.garmentTypeSelection,
  additionalGarments: repeatedShirtAssignments,
  additionalGarmentConstructions: changedRepeatedShirtConstruction,
  catalogInspection: inspection,
  constructionSubtotal:
    changedRepeatedShirtPricing.garmentConstructionSubtotal,
});
assert.equal(changedRepeatedShirtBreakdown.status, "complete");
assert.deepEqual(
  changedRepeatedShirtBreakdown.rows.map((row) => [row.garmentKey, row.priceCents]),
  [["base:shirt", 6500], ["additional:shirt:1", 7000]],
  "changing one repeated occurrence replaces only its exact keyed row",
);

const secondAdditionalShirtSelection =
  createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: Object.keys(
      changedRepeatedShirtConstruction.byGarmentKey,
    ),
  });
assert.equal(secondAdditionalShirtSelection.status, "resolved");
if (secondAdditionalShirtSelection.status !== "resolved") {
  throw new Error("Expected the second catalogue Shirt addition to resolve");
}
const twiceRepeatedShirtPendingState = appendCustomerFabricGarment(
  repeatedShirtFabricState,
  fabric.code,
  secondAdditionalShirtSelection.selection,
);
assert.equal(
  twiceRepeatedShirtPendingState.pendingFabricGarment?.garmentKey,
  "additional:shirt:2",
);
const twiceRepeatedShirtFabricState =
  FabricAllocationStateEngine.useSameFabricForPendingGarment(
    twiceRepeatedShirtPendingState,
  );
const resolveRepeatedShirtScenario = ({
  fabricState,
  existingConstructionState,
}: {
  fabricState: FabricAllocationState;
  existingConstructionState: AdditionalGarmentConstructionStateV1;
}) => {
  const assignments = fabricState.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .filter((assignment) => assignment.sourceRole === "additional");
  const construction = reconcileAdditionalGarmentConstructionState({
    existingState: existingConstructionState,
    assignments,
    normalizedCustomDetailCatalog: inspection.activeOptions,
  });
  const reconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection: exactInput.garmentTypeSelection,
    additionalGarments: assignments,
    additionalGarmentConstructions: construction.state,
    style: exactInput.designStyleSelection.selectedStyle,
    catalogInspection: inspection,
    existingState: repeatedShirtReconciliation.state,
  });
  const materialPricing = resolveFabricAllocationMaterialPricing(
    fabricState.fabricAllocations,
    [fabric],
  );
  assert.equal(materialPricing.status, "resolved");
  const pricing = calculateDesignPricing({
    route: "alone",
    design: {
      additionalGarmentConstructions: construction.state,
    },
    materialPricing,
    decorativeFeatureApplicabilityStyle:
      exactInput.designStyleSelection.selectedStyle,
    baseGarmentComposition: getFutureFabricCapacityComposition(
      exactInput.garmentTypeSelection,
    ),
    additionalGarments: assignments,
    catalog: inspection.activeOptions,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection: exactInput.garmentTypeSelection,
  });
  assert.ok(pricing);
  const breakdown = projectCustomerGarmentConstructionBreakdown({
    pricing,
    subjects: reconciliation.subjects,
    garmentTypeSelection: exactInput.garmentTypeSelection,
    additionalGarments: assignments,
    additionalGarmentConstructions: construction.state,
    catalogInspection: inspection,
    constructionSubtotal: pricing.garmentConstructionSubtotal,
  });
  return {
    assignments,
    construction,
    reconciliation,
    materialPricing,
    pricing,
    breakdown,
  };
};
const twiceRepeatedShirtScenario = resolveRepeatedShirtScenario({
  fabricState: twiceRepeatedShirtFabricState,
  existingConstructionState: {
    schemaVersion: 1,
    byGarmentKey: {
      ...repeatedShirtConstruction.state.byGarmentKey,
      ...authorizedAdditionalConstructionState("additional:shirt:2", "shirt")
        .byGarmentKey,
    },
  },
});
assert.deepEqual(
  twiceRepeatedShirtScenario.assignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["additional:shirt:1", "additional:shirt:2"],
);
assert.equal(twiceRepeatedShirtScenario.breakdown.status, "complete");
assert.deepEqual(
  twiceRepeatedShirtScenario.breakdown.rows.map((row) => [
    row.garmentKey,
    row.priceCents,
  ]),
  [
    ["base:shirt", 6500],
    ["additional:shirt:1", 6500],
    ["additional:shirt:2", 6500],
  ],
);
const twiceRepeatedSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  fabricAllocationState: twiceRepeatedShirtFabricState,
  additionalGarmentConstructionState: twiceRepeatedShirtScenario.construction.state,
});
assert.equal(twiceRepeatedSummary.garmentSummary.length, 3);
assert.deepEqual(
  twiceRepeatedSummary.garmentSummary.map((row) => row.garmentKey).sort(),
  ["additional:shirt:1", "additional:shirt:2", "base:shirt"],
);
assert.equal(
  twiceRepeatedShirtScenario.breakdown.rows.reduce(
    (totalCents, row) => totalCents + (row.priceCents ?? 0),
    0,
  ),
  Math.round(
    twiceRepeatedShirtScenario.pricing.garmentConstructionSubtotal * 100,
  ),
  "all repeated Additional occurrences reconcile to the authoritative subtotal",
);
const twiceRepeatedShirtSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  fabricAllocationState: twiceRepeatedShirtFabricState,
  materialPricing: twiceRepeatedShirtScenario.materialPricing,
  customDetailsReconciliation:
    twiceRepeatedShirtScenario.reconciliation,
  basePricing: twiceRepeatedShirtScenario.pricing,
});
assert.equal(
  twiceRepeatedShirtSummary.pricingSummary.selectedDesignPrice
    ?.selectedDesignPrice,
  twiceRepeatedShirtScenario.pricing.garmentConstructionSubtotal +
    twiceRepeatedShirtSummary.pricingSummary.customDetailsExactSubtotal,
  "explanatory rows do not add construction to the downstream total again",
);

const oneAdditionalRemovedFabricState = removeFutureFabricAssignment({
  state: twiceRepeatedShirtFabricState,
  garmentKey: "additional:shirt:1",
});
const oneAdditionalRemovedScenario = resolveRepeatedShirtScenario({
  fabricState: oneAdditionalRemovedFabricState,
  existingConstructionState:
    twiceRepeatedShirtScenario.construction.state,
});
assert.deepEqual(
  oneAdditionalRemovedScenario.construction.removedGarmentKeys,
  [],
  "authorized construction ledger rows persist when Fabric assignment is removed",
);
assert.ok(
  oneAdditionalRemovedScenario.construction.state.byGarmentKey["additional:shirt:1"],
  "customer-authorized construction remains even without Fabric assignment",
);
assert.deepEqual(
  oneAdditionalRemovedScenario.breakdown.rows.map((row) => [
    row.garmentKey,
    row.priceCents,
  ]),
  [
    ["base:shirt", 6500],
    ["additional:shirt:1", 6500],
    ["additional:shirt:2", 6500],
  ],
  "Fabric removal keeps authorized construction membership and occurrence pricing",
);
assert.equal(
  oneAdditionalRemovedScenario.breakdown.rows.reduce(
    (totalCents, row) => totalCents + (row.priceCents ?? 0),
    0,
  ),
  Math.round(
    oneAdditionalRemovedScenario.pricing.garmentConstructionSubtotal * 100,
  ),
);

const mismatchedRepeatedShirtBreakdown = projectCustomerGarmentConstructionBreakdown({
  pricing: {
    ...repeatedShirtPricing,
    additionalGarmentPriceRows: repeatedShirtPricing.additionalGarmentPriceRows.map(
      (row) => ({ ...row, assignmentId: "additional:shirt:unmatched" }),
    ),
  },
  subjects: repeatedShirtReconciliation.subjects,
  garmentTypeSelection: exactInput.garmentTypeSelection,
  additionalGarments: repeatedShirtAssignments,
  additionalGarmentConstructions: repeatedShirtConstruction.state,
  catalogInspection: inspection,
  constructionSubtotal: repeatedShirtPricing.garmentConstructionSubtotal,
});
assert.equal(mismatchedRepeatedShirtBreakdown.status, "pending");
assert.equal(
  mismatchedRepeatedShirtBreakdown.rows.every((row) => row.priceCents === null),
  true,
  "an unmatched authoritative occurrence fails the entire display projection closed",
);

const reloadedRepeatedShirtFabricState = JSON.parse(
  JSON.stringify(repeatedShirtFabricState),
) as FabricAllocationState;
const reloadedRepeatedShirtConstruction = JSON.parse(
  JSON.stringify(repeatedShirtConstruction.state),
) as AdditionalGarmentConstructionStateV1;
const reloadedRepeatedShirtAssignments = reloadedRepeatedShirtFabricState.fabricAllocations
  .flatMap((allocation) => allocation.garmentAssignments)
  .filter((assignment) => assignment.sourceRole === "additional");
const reloadedRepeatedShirtReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: exactInput.garmentTypeSelection,
  additionalGarments: reloadedRepeatedShirtAssignments,
  additionalGarmentConstructions: reloadedRepeatedShirtConstruction,
  style: exactInput.designStyleSelection.selectedStyle,
  catalogInspection: inspection,
  existingState: repeatedShirtReconciliation.state,
});
const reloadedRepeatedShirtMaterialPricing = resolveFabricAllocationMaterialPricing(
  reloadedRepeatedShirtFabricState.fabricAllocations,
  [fabric],
);
assert.equal(reloadedRepeatedShirtMaterialPricing.status, "resolved");
const reloadedRepeatedShirtPricing = calculateDesignPricing({
  route: "alone",
  design: {
    additionalGarmentConstructions: reloadedRepeatedShirtConstruction,
  },
  materialPricing: reloadedRepeatedShirtMaterialPricing,
  decorativeFeatureApplicabilityStyle:
    exactInput.designStyleSelection.selectedStyle,
  baseGarmentComposition: getFutureFabricCapacityComposition(
    exactInput.garmentTypeSelection,
  ),
  additionalGarments: reloadedRepeatedShirtAssignments,
  catalog: inspection.activeOptions,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection: exactInput.garmentTypeSelection,
});
assert.deepEqual(
  projectCustomerGarmentConstructionBreakdown({
    pricing: reloadedRepeatedShirtPricing,
    subjects: reloadedRepeatedShirtReconciliation.subjects,
    garmentTypeSelection: exactInput.garmentTypeSelection,
    additionalGarments: reloadedRepeatedShirtAssignments,
    additionalGarmentConstructions: reloadedRepeatedShirtConstruction,
    catalogInspection: inspection,
    constructionSubtotal:
      reloadedRepeatedShirtPricing.garmentConstructionSubtotal,
  }),
  repeatedShirtBreakdown,
  "reload restores the same repeated occurrence keys, rows, and amounts",
);

const decorativeStyle = exactInput.designStyleSelection.selectedStyle;
assert.ok(decorativeStyle);
const calculateFutureDecorativePricing = (
  design: Parameters<typeof calculateDesignPricing>[0]["design"],
  applicabilityStyle: StyleCategory = decorativeStyle,
) => {
  const pricing = calculateDesignPricing({
    route: "alone",
    design,
    materialPricing: exactInput.materialPricing,
    decorativeFeatureApplicabilityStyle: applicabilityStyle,
    baseGarmentComposition: getFutureFabricCapacityComposition(
      exactInput.garmentTypeSelection,
    ),
    catalog: inspection.activeOptions,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection: exactInput.garmentTypeSelection,
  });
  assert.ok(pricing);
  return pricing;
};
const decorativePricing = calculateFutureDecorativePricing({
  decorativeFeaturesByGarmentKey: {
    "base:shirt": ["Name Monogram"],
  },
  decorativeFeatures: ["Name Monogram"],
});
assert.equal(decorativePricing.customDetailsPrice, 12);
assert.equal(decorativePricing.monogramPrice, 12);
const decorativeInput = { ...exactInput, basePricing: decorativePricing };
const decorativeSummary = projectFutureDesignStudioSummary(decorativeInput);
assert.equal(
  decorativeSummary.pricingSummary.customDetailsExactSubtotal,
  exactSummary.pricingSummary.customDetailsExactSubtotal + 12,
  "the real selected-style pricing path includes a paid monogram exactly once",
);
const decorativeMonogramOccurrences = decorativeSummary.customDetailsSummary
  .flatMap((group) => group.occurrences)
  .filter((occurrence) => occurrence.optionLabel === "Name Monogram");
assert.equal(decorativeMonogramOccurrences.length, 1);
assert.equal(decorativeMonogramOccurrences[0]?.garmentKey, "base:shirt");
assert.equal(
  decorativeMonogramOccurrences[0]?.occurrenceKey,
  "base:shirt:decorative:Name Monogram",
);
assert.equal(
  decorativeMonogramOccurrences[0]?.personalizedText,
  null,
  "a Name Monogram without a stored name keeps the existing summary line",
);
const namedDecorativeSummary = projectFutureDesignStudioSummary({
  ...decorativeInput,
  designSelections: {
    decorativeFeaturesByGarmentKey: {
      "base:shirt": ["Name Monogram"],
    },
    monogramTextByGarmentKey: {
      "base:shirt": "ADEBAYO",
    },
    monogramPlacementByGarmentKey: {
      "base:shirt": "left_chest",
    },
  },
});
const namedDecorativeOccurrence = namedDecorativeSummary.customDetailsSummary
  .flatMap((group) => group.occurrences)
  .find((occurrence) => occurrence.optionLabel === "Name Monogram");
assert.equal(namedDecorativeOccurrence?.personalizedText, "ADEBAYO");
assert.equal(namedDecorativeOccurrence?.monogramPlacementLabel, "Left Chest");
assert.equal(namedDecorativeOccurrence?.priceCents, 1200);
assert.equal(
  decorativeSummary.pricingSummary.selectedDesignPrice?.selectedDesignPrice,
  exactSummary.pricingSummary.selectedDesignPrice!.selectedDesignPrice! + 12,
);
const multiGarmentDecorativePricing = calculateFutureDecorativePricing({
  decorativeFeaturesByGarmentKey: {
    "base:shirt": ["Name Monogram"],
    "base:trouser": ["Name Monogram"],
  },
  decorativeFeatures: ["Name Monogram"],
});
assert.equal(
  multiGarmentDecorativePricing.monogramPrice,
  24,
  "Name Monogram selected on two garments charges 2 × unit price",
);
const multiGarmentDecorativeSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  basePricing: multiGarmentDecorativePricing,
});
assert.equal(
  multiGarmentDecorativeSummary.customDetailsSummary
    .flatMap((group) => group.occurrences)
    .filter((occurrence) => occurrence.optionLabel === "Name Monogram").length,
  2,
  "Summary projects one Name Monogram occurrence per selected garment",
);
assert.equal(
  multiGarmentDecorativeSummary.pricingSummary.customDetailsExactSubtotal,
  exactSummary.pricingSummary.customDetailsExactSubtotal + 24,
);

const formerlyInapplicableDecorativeStyle = makeStyle(["trouser"]);
const formerlyInapplicableDecorativePricing = calculateFutureDecorativePricing(
  {
    decorativeFeaturesByGarmentKey: {
      "base:shirt": ["Name Monogram"],
    },
    decorativeFeatures: ["Name Monogram"],
  },
  formerlyInapplicableDecorativeStyle,
);
assert.equal(
  formerlyInapplicableDecorativePricing.monogramPrice,
  12,
  "a selected Name Monogram retains its configured surcharge when old Design Style applicability excludes it",
);
const formerlyInapplicableDecorativeSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  basePricing: formerlyInapplicableDecorativePricing,
});
const formerlyInapplicableMonogramOccurrence =
  formerlyInapplicableDecorativeSummary.customDetailsSummary
    .flatMap((group) => group.occurrences)
    .find((occurrence) => occurrence.optionLabel === "Name Monogram");
assert.equal(
  formerlyInapplicableMonogramOccurrence?.priceCents,
  1200,
  "Summary projects the formerly inapplicable customer selection through the existing authority",
);
assert.equal(
  formerlyInapplicableDecorativeSummary.pricingSummary.customDetailsExactSubtotal,
  exactSummary.pricingSummary.customDetailsExactSubtotal + 12,
  "Summary applies the existing surcharge exactly once",
);
const noDecorativeSelectionPricing =
  calculateFutureDecorativePricing({});
assert.equal(noDecorativeSelectionPricing.monogramPrice, 0);
assert.equal(noDecorativeSelectionPricing.customDetailsPrice, 0);
for (const includedDesignFeatures of [
  { hasMonogram: true },
  { hasEmbroidery: true },
  { hasMonogramTrimming: true },
]) {
  const includedOnlyPricing = calculateFutureDecorativePricing(
    {},
    makeStyle(["shirt"], { includedDesignFeatures }),
  );
  assert.equal(
    includedOnlyPricing.monogramPrice,
    0,
    "style-included decorative metadata alone is not a customer-paid selection",
  );
  assert.equal(includedOnlyPricing.customDetailsPrice, 0);
  assert.deepEqual(includedOnlyPricing.decorativeFeatures, []);
}
const explicitIncludedMonogramPricing = calculateFutureDecorativePricing(
  {
    decorativeFeaturesByGarmentKey: {
      "base:shirt": ["Name Monogram"],
    },
    decorativeFeatures: ["Name Monogram"],
  },
  makeStyle(["shirt"], {
    includedDesignFeatures: { hasMonogram: true },
  }),
);
assert.equal(explicitIncludedMonogramPricing.monogramPrice, 12);
assert.equal(explicitIncludedMonogramPricing.customDetailsPrice, 12);
assert.equal(explicitIncludedMonogramPricing.decorativeFeatures.length, 1);
const accessoryPricing = calculateFutureDecorativePricing({
  accessories: ["Traditional Hat"],
});
assert.equal(accessoryPricing.traditionalAccessoriesPrice, 12);
assert.equal(accessoryPricing.customDetailsPrice, 12);
assert.equal(accessoryPricing.monogramPrice, 0);

const unfilteredOrderLevelDesign = {
  customDetails: {
    dress_additional: "dress_additional_net",
  },
};
const priorOrderLevelPricing = calculateDesignPricing({
  route: "alone",
  design: unfilteredOrderLevelDesign,
  materialPricing: exactInput.materialPricing,
  baseGarmentComposition: getFutureFabricCapacityComposition(
    exactInput.garmentTypeSelection,
  ),
  catalog: inspection.activeOptions,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection: exactInput.garmentTypeSelection,
});
const narrowContextOrderLevelPricing = calculateFutureDecorativePricing(
  unfilteredOrderLevelDesign,
);
assert.ok(priorOrderLevelPricing);
assert.equal(
  priorOrderLevelPricing.constructionUpgradesPrice,
  10,
  "the order-level fixture is genuinely paid before comparing context behavior",
);
assert.equal(
  narrowContextOrderLevelPricing.constructionUpgradesPrice,
  priorOrderLevelPricing.constructionUpgradesPrice,
  "decorative applicability context does not activate style-based order-level filtering",
);
assert.equal(
  narrowContextOrderLevelPricing.includedSewingCost,
  priorOrderLevelPricing.includedSewingCost,
  "decorative applicability context does not activate style-based sewing accounting",
);
assert.equal(priorOrderLevelPricing.includedSewingCost > 0, true);
assert.equal(
  narrowContextOrderLevelPricing.garmentSubtotal,
  priorOrderLevelPricing.garmentSubtotal,
  "the narrow context has no charged-total side effect without a decorative selection",
);

const legacyIncludedStylePricing = calculateDesignPricing({
  route: "alone",
  design: {},
  materialPricing: exactInput.materialPricing,
  style: makeStyle(["shirt"], {
    includedDesignFeatures: { hasMonogram: true },
  }),
  baseGarmentComposition: getFutureFabricCapacityComposition(
    exactInput.garmentTypeSelection,
  ),
  catalog: inspection.activeOptions,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection: exactInput.garmentTypeSelection,
});
assert.equal(
  legacyIncludedStylePricing?.monogramPrice,
  12,
  "existing catalogue pricing semantics remain unchanged outside the narrow future context",
);

const shirtKaftanState = setGarmentScopedCustomDetailSelection(
  setGarmentScopedCustomDetailSelection(
    completeShirtDetails(
      completeShirtDetails(
        createEmptyGarmentScopedCustomDetailsState(),
        "base:shirt",
      ),
      "base:kaftan",
    ),
    "base:shirt",
    "neck_additional",
    "neck_additional_no_cost",
  ),
  "base:kaftan",
  "neck_additional",
  "neck_additional_no_cost",
);
const shirtKaftanSummary = projectFutureDesignStudioSummary(
  buildSummaryInput({
    garmentTypes: ["kaftan", "shirt"],
    customState: shirtKaftanState,
  }),
);
assert.deepEqual(
  shirtKaftanSummary.garmentSummary.map((row) => row.garmentType),
  ["shirt", "kaftan"],
  "garments use canonical Step 1 ordering",
);
assert.equal(shirtKaftanSummary.garmentSummary.length, 2);
assert.deepEqual(
  shirtKaftanSummary.garmentSummary.map((row) => row.label),
  ["Standard Shirt", "Long Shirt"],
);
assert.equal(shirtKaftanSummary.fabricSummary.length, 2);
assert.deepEqual(
  shirtKaftanSummary.fabricSummary.map((row) => row.fabricCode),
  [fabric.code, fabric.code],
  "same fabric product remains separate by allocation identity",
);
assert.equal(
  shirtKaftanSummary.customDetailsSummary.flatMap((group) => group.occurrences)
    .filter((row) => row.optionId === "neck_additional_no_cost").length,
  2,
  "repeated option IDs remain separate garment occurrences",
);

const agbadaInput = buildSummaryInput({ garmentTypes: ["agbada"] });
const agbadaSummary = projectFutureDesignStudioSummary(agbadaInput);
assert.deepEqual(
  agbadaSummary.garmentSummary[0].physicalComponents.map((row) => row.garmentType),
  ["shirt", "trouser"],
  "Agbada preserves authoritative physical components",
);

const pendingState = setGarmentScopedCustomDetailSelection(
  completeShirtDetails(
    createEmptyGarmentScopedCustomDetailsState(),
    "base:shirt",
  ),
  "base:shirt",
  "personalized_additional",
  ["personalized_additional_evaluation"],
);
const pendingSummary = projectFutureDesignStudioSummary(
  buildSummaryInput({
    customState: pendingState,
    personalizedText: "Add a hand-finished family crest.",
  }),
);
assert.equal(pendingSummary.status, "pricing_pending");
const pendingOccurrence = pendingSummary.customDetailsSummary
  .flatMap((group) => group.occurrences)
  .find((row) => row.optionId === "personalized_additional_evaluation")!;
assert.equal(pendingOccurrence.priceStatus, "evaluation_required");
assert.equal(pendingOccurrence.priceCents, null);
assert.equal(pendingOccurrence.personalizedText, "Add a hand-finished family crest.");
assert.equal(pendingSummary.pricingSummary.selectedDesignPrice, null);

const completedWorkflow: AiTryOnWorkflowStateV1 = {
  schemaVersion: 1,
  status: "completed",
  inputFingerprint: "safe-fingerprint",
  jobReference: { kind: "resumable_job", jobId: "private-job-123" },
  resultReference: {
    kind: "verified_private_try_on_result",
    assetId: "private-asset-123",
    ownerBindingId: "private-owner-123",
  },
};
const completedSummary = projectFutureDesignStudioSummary(
  buildSummaryInput({
    customState: exactCustomState,
    aiTryOnWorkflow: completedWorkflow,
  }),
);
assert.equal(completedSummary.aiTryOnSummary.label, "Completed");
const safeJson = JSON.stringify(completedSummary);
for (const privateValue of ["private-job-123", "private-asset-123", "private-owner-123"]) {
  assert.equal(safeJson.includes(privateValue), false);
}

const mediumInput = buildSummaryInput({ customState: exactCustomState });
mediumInput.measurementState = {
  ...mediumInput.measurementState,
  route: "medium_risk",
  calculationStatus: "incomplete",
};
assert.equal(
  projectFutureDesignStudioSummary(mediumInput).status,
  "incomplete",
);
assert.equal(
  projectFutureDesignStudioSummary(mediumInput).blockers.some(
    (blocker) => blocker.code === "MEASUREMENT_CALCULATION_PENDING",
  ),
  false,
);

const reloadedInput = buildSummaryInput({
  customState: JSON.parse(JSON.stringify(exactCustomState)),
});
assert.deepEqual(
  projectFutureDesignStudioSummary(reloadedInput),
  projectFutureDesignStudioSummary(buildSummaryInput({ customState: exactCustomState })),
  "draft reload rebuilds the same derived Summary",
);

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const stepperSource = readFileSync("src/components/DesignStudioJourneyStepper.tsx", "utf8");
const summarySource = readFileSync("src/components/DormantFutureSummaryStep.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
assert.match(studioSource, /handleOpenDormantSummaryStage/);
assert.match(studioSource, /futureStageId === "summary"/);
assert.match(studioSource, /onEditGarments/);
assert.match(stepperSource, /canEnterSummary/);
assert.equal(stepperSource.includes('step.id === "shipping" &&'), true);
assert.equal(stepperSource.includes('step.id === "payment" &&'), true);
assert.match(stepperSource, /canEnterPayment/);
assert.match(stepperSource, /onSelectPayment/);
assert.match(summarySource, /Continue to Delivery/);
assert.match(summarySource, /disabled/);
assert.match(summarySource, /DesignStudioBackButton/);
assert.match(summarySource, /backDestination="Measurement"/);
assert.match(
  summarySource,
  /Both inches and centimetres are shown, with your preferred unit first\./,
);
assert.equal(summarySource.includes("Display unit:"), false);
assert.match(summarySource, /SELECTED_DESIGN_PRICE_SUPPORTING_TEXT/);
assert.match(summarySource, /Your design summary is ready/);
assert.match(
  summarySource,
  /Review your selections below\. You can return to any completed step to make changes\./,
);
assert.match(summarySource, /Evaluation pending/);
assert.match(
  summarySource,
  /The total today is the base garment\. Personalized additions are reviewed after you order\./,
);
const renderSummaryMarkup = (
  shippingResolution: ReturnType<typeof reconcileFutureShippingState>,
  orderContext?: {
    kind: "community" | "individual" | "private";
    studioLabel: "Community Order" | "Individual Order" | "Private Batch";
    detailsOrderType: "Community Batch" | "Individual Order" | "Private Batch";
    batchName: string | null;
    role: "Organizer" | "Member" | null;
  },
) =>
  renderToStaticMarkup(
    createElement(DormantFutureSummaryStep, {
      summary: exactSummary,
      ...(orderContext ? { orderContext } : {}),
      onBack: () => {},
      onEditGarments: () => {},
      onEditFabrics: () => {},
      onEditDesignStyle: () => {},
      onEditCustomDetails: () => {},
      onEditAiTryOn: () => {},
      onEditMeasurements: () => {},
      canContinueToShipping: true,
      onContinueToShipping: () => {},
      shippingResolution,
    }),
  );

const selectedDesignPrice =
  exactSummary.pricingSummary.selectedDesignPrice?.selectedDesignPrice ?? null;
const destinationDeliveryResolution = reconcileFutureShippingState({
  state: {
    ...createEmptyFutureShippingState(),
    fulfilmentMethod: "destination_delivery",
    customerInformation: {
      fullName: "Ada Heritage",
      phone: "+31 6 1234 5678",
      email: "ada@example.com",
      deliveryAddress: {
        addressLine1: "1 Heritage Way",
        addressLine2: "",
        city: "Paris",
        stateRegion: "Ile-de-France",
        postalCode: "75001",
        countryCode: "FR",
      },
      comment: "",
    },
  },
  garmentCount: exactSummary.garmentSummary.length,
  selectedDesignPrice,
});
assert.equal(destinationDeliveryResolution.status, "quote_ready");
if (destinationDeliveryResolution.projectedTotalCents === null) {
  throw new Error("destination delivery must supply an authoritative payable projection");
}
const destinationDeliveryMarkup = renderSummaryMarkup(destinationDeliveryResolution);
// Split pill: preferred unit left, alternate right; hidden parentheses keep the read order.
assert.match(
  destinationDeliveryMarkup,
  /<span data-measurement-preferred="true"[^>]*>10 in<\/span><span data-measurement-alternate="true"[^>]*><span class="sr-only"> \(<\/span>25\.4 cm<span class="sr-only">\)<\/span><\/span>/,
);
assert.match(
  destinationDeliveryMarkup.replace(/<[^>]+>/g, ""),
  /10 in \(25\.4 cm\)/,
  "pill text still reads preferred then alternate in parentheses",
);
assert.match(destinationDeliveryMarkup, /data-measurement-preferred="true" class="[^"]*bg-\[#f3ece0\][^"]*font-bold text-heritage-green/);
assert.match(destinationDeliveryMarkup, /data-measurement-alternate="true" class="[^"]*border-l border-\[#e3d6bd\]/);
assert.match(destinationDeliveryMarkup, /data-measurement-pill="true" class="[^"]*rounded-full border border-\[#e3d6bd\][^"]*tabular-nums/);
// Garment group headings: spaced from the line above and larger than the row labels.
const measurementSectionHeadings = [
  ...destinationDeliveryMarkup.matchAll(
    /<div data-summary-measurement-section="true" class="([^"]*)"><div class="[^"]*"><h4 class="([^"]*)">([^<]*)<\/h4>/g,
  ),
];
assert.ok(measurementSectionHeadings.length >= 2, "shared and garment measurement sections render");
assert.ok(
  measurementSectionHeadings.some((match) => match[3] === "Shared body measurements"),
);
assert.ok(measurementSectionHeadings.some((match) => match[3] === "Standard Shirt"));
for (const [, wrapperClass, headingClass] of measurementSectionHeadings) {
  assert.match(wrapperClass, /\bmt-5\b/);
  assert.match(wrapperClass, /\bborder-t\b/);
  assert.match(wrapperClass, /\bpt-4\b/);
  assert.match(headingClass, /\btext-base\b/);
  assert.match(headingClass, /\bfont-extrabold\b/);
  assert.match(headingClass, /\buppercase\b/);
  assert.match(headingClass, /\btext-heritage-gold\b/);
}
// Idea 3: every measurement group heading carries its own Edit link to Step 7.
const sectionEditButtons = [
  ...destinationDeliveryMarkup.matchAll(
    /<h4 class="[^"]*">([^<]*)<\/h4><button type="button" aria-label="([^"]*)" data-summary-measurement-section-edit="true"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Edit<\/button>/g,
  ),
];
assert.equal(
  sectionEditButtons.length,
  measurementSectionHeadings.length,
  "one Edit link per measurement group",
);
assert.ok(sectionEditButtons.some(([, title, label]) =>
  title === "Shared body measurements" && label === "Edit shared measurements"));
assert.ok(sectionEditButtons.some(([, title, label]) =>
  title === "Standard Shirt" && label === "Edit Standard Shirt measurements"));
// Idea 2: the solo header shows the method as a badge; a blank sole wearer is still unnamed.
const soleHeader =
  destinationDeliveryMarkup.split("data-summary-measurement-sole-header")[1]?.split("</div>")[0] || "";
assert.match(
  soleHeader,
  new RegExp(
    `<span data-summary-measurement-method-badge="${exactSummary.measurementSummary.route}" class="[^"]*rounded-full[^"]*"><span class="sr-only">Measurement method: </span>${exactSummary.measurementSummary.routeLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</span>`,
  ),
);
assert.equal(soleHeader.includes("Person 1"), false);
assert.equal(soleHeader.includes("<p"), false, "blank sole wearer: badge only, no name line");
// Item 4: "Check this?" mirrors Step 7's existing range diagnostics (workbook height
// factors + MANUAL_RANGE_RECHECK_TOLERANCE, or plausibility bounds). Informational only.
assert.equal(isMeasurementOutsideUsualRange(
  [{ code: "measurement_range_recheck", garmentKey: "base:shirt", measurementId: "neck_circumference" }],
  "neck_circumference",
  null,
), true, "a shared value matches its diagnostic on any garment");
assert.equal(isMeasurementOutsideUsualRange(
  [{ code: "measurement_range_recheck", garmentKey: "base:shirt", measurementId: "sleeve_length_short" }],
  "sleeve_length_short",
  "base:trouser",
), false, "a garment value only matches its own garment's diagnostic");
assert.equal(isMeasurementOutsideUsualRange(
  [{ code: "implausible_measurement_value", garmentKey: "base:shirt", measurementId: "total_height" }],
  "total_height",
  null,
), true, "plausibility-bound diagnostics also flag");
assert.equal(isMeasurementOutsideUsualRange(
  [{ code: "required_measurement_missing", garmentKey: "base:shirt", measurementId: "total_height" }],
  "total_height",
  null,
), false, "other diagnostics never flag");
const rangeRecheckIds = new Set(
  exactInput.measurementState.diagnostics
    .filter((diagnostic) => diagnostic.code === "measurement_range_recheck")
    .map((diagnostic) => diagnostic.measurementId),
);
assert.ok(rangeRecheckIds.size > 0, "the 40 in / 10 in fixture trips Step 7's recheck hint");
const exactMeasurementValues = [
  ...exactSummary.measurementSummary.shared,
  ...exactSummary.measurementSummary.byGarment.flatMap((garment) => garment.values),
];
assert.deepEqual(
  exactMeasurementValues.filter((value) => value.outsideUsualRange).map((value) => value.measurementId).sort(),
  [...rangeRecheckIds].sort(),
  "exactly the Step 7 recheck rows carry the flag",
);
assert.ok(exactMeasurementValues.some((value) => !value.outsideUsualRange));
assert.equal(exactSummary.status, "ready", "the flag never blocks Summary / Continue");
const checkFlagMatches = destinationDeliveryMarkup.match(/data-measurement-check-flag="true"/g) || [];
assert.equal(checkFlagMatches.length, rangeRecheckIds.size);
assert.match(
  destinationDeliveryMarkup,
  /<span data-measurement-check-flag="true" title="Value outside the usual range, check this" class="[^"]*amber[^"]*"><span aria-hidden="true">Check this\?<\/span><span class="sr-only">Value outside the usual range, check this<\/span><\/span><span data-measurement-pill="true"/,
  "the quiet amber tag sits left of the pill with an accessible description",
);
const totalHeightRow =
  destinationDeliveryMarkup.split(">Total Height</span>")[1]?.split("</li>")[0] || "";
assert.ok(totalHeightRow.includes("data-measurement-pill"));
assert.equal(totalHeightRow.includes("data-measurement-check-flag"), false, "in-range rows stay unflagged");
assert.match(destinationDeliveryMarkup, /aria-label="Continue to Delivery"/);
// Item 5: every pill of a size has the same fixed width with 50/50 halves.
const mdPillClasses = new Set(
  [...destinationDeliveryMarkup.matchAll(/data-measurement-pill="true" class="([^"]*)"/g)].map((match) => match[1]),
);
assert.equal(mdPillClasses.size, 1, "all Summary pills share one class list");
const [mdPillClass] = [...mdPillClasses];
assert.match(mdPillClass, /\bw-\[10\.5rem\]/);
assert.match(mdPillClass, /\bwhitespace-nowrap\b/);
assert.match(destinationDeliveryMarkup, /data-measurement-preferred="true" class="[^"]*\bw-1\/2\b/);
assert.match(destinationDeliveryMarkup, /data-measurement-alternate="true" class="[^"]*\bw-1\/2\b/);
assert.equal(destinationDeliveryMarkup.includes("Display unit:"), false);
assert.match(
  destinationDeliveryMarkup,
  /Both inches and centimetres are shown, with your preferred unit first\./,
);
assert.match(destinationDeliveryMarkup, /data-summary-cost-breakdown/);
assert.match(destinationDeliveryMarkup, />Cost Breakdown</);
assert.match(destinationDeliveryMarkup, />Order Subtotal</);
assert.match(destinationDeliveryMarkup, /<dt[^>]*>Shipping<\/dt>/);
const projectedTotalText = `€${(
  destinationDeliveryResolution.projectedTotalCents / 100
).toFixed(2)}`;
const individualTotalText = `€${(
  (destinationDeliveryResolution.projectedTotalCents + 13125) / 100
).toFixed(2)}`;
assert.match(
  destinationDeliveryMarkup,
  new RegExp(`>Total</dt>[\\s\\S]*?>${individualTotalText}</dd>`),
  "Individual Summary Total adds the Lagos band on top of projected delivery",
);
assert.match(destinationDeliveryMarkup, /Lagos → Eindhoven shipping/);
assert.match(destinationDeliveryMarkup, /data-summary-included-inbound="true"/);
assert.equal(destinationDeliveryMarkup.includes("data-excluded-from-total"), false);
assert.match(destinationDeliveryMarkup, /data-amount-cents="13125"/);
assert.equal(
  destinationDeliveryMarkup.match(
    /data-summary-included-inbound="true"[\s\S]*?<\/div>/,
  )?.[0].includes("Included"),
  false,
);
assert.match(destinationDeliveryMarkup, /€131\.25/);
assert.match(destinationDeliveryMarkup, /data-summary-lagos-note="true"/);
assert.match(
  destinationDeliveryMarkup,
  /Shipping covers up to 10 garments \(under 5 kg\)\./,
);
assert.match(destinationDeliveryMarkup, /Includes fabric, tax, and sewing\./);
assert.equal(exactSummary.garmentSummary.length, 1);
const communitySummaryMarkup = renderSummaryMarkup(destinationDeliveryResolution, {
  kind: "community",
  studioLabel: "Community Order",
  detailsOrderType: "Community Batch",
  batchName: "Avatars",
  role: null,
});
assert.equal(communitySummaryMarkup.includes("Lagos → Eindhoven shipping"), false);
assert.equal(communitySummaryMarkup.includes("data-summary-included-inbound"), false);
assert.equal(communitySummaryMarkup.includes("data-summary-lagos-note"), false);
assert.match(
  communitySummaryMarkup,
  /Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing\./,
);
assert.match(
  communitySummaryMarkup,
  new RegExp(`>Total</dt>[\\s\\S]*?>${projectedTotalText}</dd>`),
  "Community Summary keeps the same payable total with no inbound band",
);

const pickupResolution = reconcileFutureShippingState({
  state: {
    ...createEmptyFutureShippingState(),
    fulfilmentMethod: "eindhoven_pickup",
    customerInformation: {
      fullName: "Ada Heritage",
      phone: "+31 6 1234 5678",
      email: "ada@example.com",
      deliveryAddress: createEmptyFutureShippingState().customerInformation.deliveryAddress,
      comment: "",
    },
  },
  garmentCount: exactSummary.garmentSummary.length,
  selectedDesignPrice,
});
assert.equal(pickupResolution.status, "quote_ready");
assert.equal(pickupResolution.postEindhovenAdjustmentCents, 0);
const pickupSummaryMarkup = renderSummaryMarkup(pickupResolution);
assert.doesNotMatch(
  pickupSummaryMarkup,
  /<dt[^>]*>Shipping<\/dt>/,
  "pickup must omit a misleading monetary Shipping row",
);
assert.match(pickupSummaryMarkup, /data-summary-lagos-note="true"/);
assert.match(
  pickupSummaryMarkup,
  /Lagos → Eindhoven shipping/,
  "pickup summary keeps the Lagos band",
);
assert.match(pickupSummaryMarkup, /data-summary-included-inbound="true"/);
assert.match(pickupSummaryMarkup, /data-amount-cents="13125"/);
if (pickupResolution.projectedTotalCents === null) {
  throw new Error("pickup must supply an authoritative payable projection");
}
const pickupTotalText = `€${((pickupResolution.projectedTotalCents + 13125) / 100).toFixed(2)}`;
assert.match(
  pickupSummaryMarkup,
  new RegExp(`>Total</dt>[\\s\\S]*?>${pickupTotalText}</dd>`),
  "pickup total is the design total plus the Lagos band, with no extra pickup fee",
);
assert.match(summarySource, /canContinueToShipping/);
assert.match(summarySource, /onContinueToShipping/);
assert.match(summarySource, /Your Summary is ready\./);
assert.match(summarySource, /aria-label=\{label\}/);
assert.match(summarySource, /min-h-11/);
assert.match(summarySource, /min-w-0/);
assert.match(summarySource, /break-words/);
assert.match(summarySource, /Known priced selections:/);
assert.match(summarySource, /This is not a final total\./);
assert.equal(appSource.includes("future_nine_stage"), false);
assert.equal(studioSource.includes("legacy_five_stage"), false);

// H5 — uploaded base construction authority
const uploadedShirtTrouserInput = buildUploadedSummaryInput();
const uploadedShirtTrouserSummary = projectFutureDesignStudioSummary(
  uploadedShirtTrouserInput,
);
assert.deepEqual(
  uploadedShirtTrouserSummary.garmentSummary.map((row) => row.garmentKey),
  ["base:shirt", "base:trouser"],
  "uploaded effective journey must surface both authoritative base rows",
);
assert.equal(
  uploadedShirtTrouserSummary.blockers.some(
    (blocker) => blocker.code === "GARMENT_CONSTRUCTION_INVALID",
  ),
  false,
  "upload-only base garments must resolve from effective uploaded construction",
);
assert.equal(uploadedShirtTrouserSummary.garmentSummary[0]?.constructionTotalCents, 6500);
assert.equal(uploadedShirtTrouserSummary.garmentSummary[1]?.constructionTotalCents, 7500);
assert.ok(
  uploadedShirtTrouserSummary.garmentSummary
    .find((row) => row.garmentKey === "base:trouser")
    ?.construction.some((component) => component.selectionGroup === "trouser_fastening"),
  "uploaded Trouser construction metadata must include authoritative selectionGroup",
);
assert.equal(
  uploadedShirtTrouserSummary.garmentSummary.reduce(
    (totalCents, row) => totalCents + (row.constructionTotalCents || 0),
    0,
  ),
  Math.round(
    uploadedShirtTrouserSummary.pricingSummary.garmentConstructionSubtotal! * 100,
  ),
  "uploaded construction rows must reconcile the effective uploaded subtotal once",
);
const uploadedShippingGarmentCount =
  uploadedShirtTrouserSummary.garmentSummary.length;
assert.equal(uploadedShippingGarmentCount, 2);
assert.equal(uploadedShippingGarmentCount * 0.5, 1);

const uploadedMixedInput = buildUploadedSummaryInput({
  additionalGarmentConstructionState: authorizedAdditionalConstructionState(
    "additional:shirt:1",
    "shirt",
    7000,
  ),
});
const uploadedMixedSummary = projectFutureDesignStudioSummary(uploadedMixedInput);
assert.deepEqual(
  uploadedMixedSummary.garmentSummary.map((row) => row.garmentKey),
  ["base:shirt", "base:trouser", "additional:shirt:1"],
);
assert.equal(
  uploadedMixedSummary.garmentSummary.find((row) => row.garmentKey === "base:shirt")
    ?.constructionTotalCents,
  6500,
);
assert.equal(
  uploadedMixedSummary.garmentSummary.find((row) => row.garmentKey === "base:trouser")
    ?.constructionTotalCents,
  7500,
);
assert.equal(
  uploadedMixedSummary.garmentSummary.find(
    (row) => row.garmentKey === "additional:shirt:1",
  )?.constructionTotalCents,
  7000,
  "Step 4 additional construction remains occurrence-keyed",
);

const catalogueShirtOnlyInput = buildSummaryInput({ garmentTypes: ["shirt"] });
const catalogueShirtWithTrouserStyleInput = {
  ...catalogueShirtOnlyInput,
  designStyleSelection: reconcileFutureDesignStyleSelection({
    selectedStyleId: makeStyle(["shirt", "trouser"]).id,
    styles: [makeStyle(["shirt", "trouser"])],
    garmentTypeSelection: catalogueShirtOnlyInput.garmentTypeSelection,
  }),
};
const catalogueControlSummary = projectFutureDesignStudioSummary(
  catalogueShirtWithTrouserStyleInput,
);
assert.deepEqual(
  catalogueControlSummary.garmentSummary.map((row) => row.garmentKey),
  ["base:shirt"],
  "catalogue base construction remains Step-1-authoritative",
);

const uploadedJourney = buildEffectiveUploadedJourneyGarmentTypeSelection({
  step1Selection: buildSelection(["shirt"]),
  uploadedComposition: mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: ["trouser"],
  }),
  normalizedCustomDetailCatalog: inspection.activeOptions,
});
const { trouser: _removedTrouserConstruction, ...constructionWithoutTrouser } =
  uploadedJourney.constructionByGarment;
const missingUploadConstructionInput = buildUploadedSummaryInput({
  effectiveGarmentTypeSelectionOverride: {
    ...uploadedJourney,
    constructionByGarment: constructionWithoutTrouser,
  },
});
const missingUploadConstructionSummary = projectFutureDesignStudioSummary(
  missingUploadConstructionInput,
);
assert.ok(
  missingUploadConstructionSummary.blockers.some(
    (blocker) =>
      blocker.code === "GARMENT_CONSTRUCTION_INVALID" &&
      blocker.garmentKey === "base:trouser",
  ),
  "missing effective uploaded construction must still fail closed",
);

const uploadedLiveSummary = projectDesignStudioLiveOrderSummary({
  summary: uploadedShirtTrouserSummary,
  shippingResolution: reconcileFutureShippingState({
    state: createEmptyFutureShippingState(),
    garmentCount: uploadedShirtTrouserSummary.garmentSummary.length,
    selectedDesignPrice:
      uploadedShirtTrouserSummary.pricingSummary.selectedDesignPrice
        ?.selectedDesignPrice ?? null,
  }),
  candidatePricing: null,
  fabricAllocationState: uploadedShirtTrouserInput.fabricAllocationState,
  measurementState: uploadedShirtTrouserInput.measurementState,
  measurementPlan: uploadedShirtTrouserInput.measurementPlan,
  designSource: {
    kind: "uploaded",
    sourceKey: "uploaded:h5-shirt-trouser",
    displayLabel: "Own upload",
    demographic: "male",
    fabricCapacityComposition: uploadedShirtTrouserInput.uploadedCompositionSpecs!,
    uploadReference: {
      designReferenceId: "ref-h5-shirt-trouser",
      ownerUid: "owner-h5",
      storagePath: "designs/owner-h5/ref-h5-shirt-trouser.jpg",
      mimeType: "image/jpeg",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  },
});
const uploadedConstructionSection = uploadedLiveSummary.sections.find(
  (section) => section.id === "construction",
);
const uploadedGarmentSection = uploadedLiveSummary.sections.find(
  (section) => section.id === "garments",
);
assert.equal(uploadedConstructionSection?.lines.length, 2);
assert.equal(uploadedGarmentSection?.lines.length ?? 0, 0);
assert.deepEqual(
  uploadedConstructionSection?.lines.map((line) => line.id.replace("construction-", "")).sort(),
  ["base:shirt", "base:trouser"],
  "Live Summary must show both uploaded base rows without duplication",
);

const amakaSummaryInput = buildSummaryInput({ garmentTypes: ["dress"] });
const amakaSummary = projectFutureDesignStudioSummary({
  ...amakaSummaryInput,
  wearerRuntimes: [
    {
      wearerId: "wearer-amaka",
      displayName: "Amaka",
      fitContext: "female",
      garmentKeys: ["base:dress"],
      plan: amakaSummaryInput.measurementPlan,
      measurement: amakaSummaryInput.measurementState,
    },
  ],
});
const amakaGroup = amakaSummary.measurementSummary.wearerGroups?.[0];
assert.equal(amakaGroup?.displayName, "Amaka");
assert.deepEqual(amakaGroup?.garmentKeys, ["base:dress"]);
assert.match(
  formatCompactWearerRouteLabel(
    amakaGroup?.displayName || "",
    amakaGroup?.routeLabel || "",
  ),
  /Amaka/,
);
const amakaMarkup = renderToStaticMarkup(
  createElement(DormantFutureSummaryStep, {
    summary: amakaSummary,
    onBack: () => {},
    onEditGarments: () => {},
    onEditFabrics: () => {},
    onEditDesignStyle: () => {},
    onEditCustomDetails: () => {},
    onEditAiTryOn: () => {},
    onEditMeasurements: () => {},
    canContinueToShipping: false,
    onContinueToShipping: () => {},
  }),
);
assert.match(amakaMarkup, /Amaka/);
// Idea 2 (solo, named): name then the method badge, no "Amaka — Route" text.
assert.match(
  amakaMarkup,
  new RegExp(
    `data-summary-measurement-sole-header="true" class="[^"]*"><p class="[^"]*">Amaka</p><span data-summary-measurement-method-badge="${amakaGroup?.route}"`,
  ),
);
assert.equal(amakaMarkup.includes(">base:dress<"), false);
assert.match(amakaMarkup, /Standard Dress/);
const youSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  wearerRuntimes: [
    {
      wearerId: "wearer-you",
      displayName: "You",
      fitContext: "male",
      garmentKeys: ["base:shirt"],
      plan: exactInput.measurementPlan,
      measurement: exactInput.measurementState,
    },
  ],
});
assert.equal(
  formatCompactWearerRouteLabel(
    "You",
    youSummary.measurementSummary.wearerGroups?.[0]?.routeLabel || "",
  ),
  youSummary.measurementSummary.wearerGroups?.[0]?.routeLabel,
);
const blankSoleSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  wearerRuntimes: [
    {
      wearerId: "wearer-blank",
      displayName: "",
      fitContext: "male",
      garmentKeys: ["base:shirt"],
      plan: exactInput.measurementPlan,
      measurement: {
        ...exactInput.measurementState,
        route: "high_risk",
      },
    },
  ],
});
const blankSoleGroup = blankSoleSummary.measurementSummary.wearerGroups?.[0];
assert.equal(blankSoleGroup?.displayName, "You");
assert.equal(blankSoleGroup?.routeLabel, "High Risk (Key Measurements)");
const blankSoleCompact = formatCompactWearerRouteLabel(
  blankSoleGroup?.displayName || "",
  blankSoleGroup?.routeLabel || "",
);
assert.equal(blankSoleCompact, "High Risk (Key Measurements)");
assert.equal(blankSoleCompact.includes("Person 1"), false);
const blankSoleMarkup = renderToStaticMarkup(
  createElement(DormantFutureSummaryStep, {
    summary: blankSoleSummary,
    onBack: () => {},
    onEditGarments: () => {},
    onEditFabrics: () => {},
    onEditDesignStyle: () => {},
    onEditCustomDetails: () => {},
    onEditAiTryOn: () => {},
    onEditMeasurements: () => {},
    canContinueToShipping: false,
    onContinueToShipping: () => {},
  }),
);
assert.equal(blankSoleMarkup.includes("Person 1"), false);
assert.match(blankSoleMarkup, /High Risk \(Key Measurements\)/);
assert.match(
  blankSoleMarkup,
  /data-summary-measurement-sole-header="true" class="[^"]*"><span data-summary-measurement-method-badge="high_risk" class="[^"]*border-red-200 bg-red-50 text-red-700[^"]*"><span class="sr-only">Measurement method: <\/span>High Risk \(Key Measurements\)<\/span><\/div>/,
  "blank sole wearer: High Risk (Key Measurements) badge only",
);
const twoWearerSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  wearerRuntimes: [
    {
      wearerId: "wearer-you",
      displayName: "You",
      fitContext: "male",
      garmentKeys: ["base:shirt"],
      plan: exactInput.measurementPlan,
      measurement: exactInput.measurementState,
    },
    {
      wearerId: "wearer-amaka",
      displayName: "Amaka",
      fitContext: "female",
      garmentKeys: ["base:dress"],
      plan: amakaSummaryInput.measurementPlan,
      measurement: amakaSummaryInput.measurementState,
    },
  ],
});
assert.equal(twoWearerSummary.measurementSummary.routeLabel, "2 people");
assert.deepEqual(
  twoWearerSummary.measurementSummary.wearerGroups?.map((wearer) => wearer.displayName),
  ["You", "Amaka"],
);
// Item 6: with 2+ wearers each block opens with a serif person heading over a dark rule.
const renderMeasurementSummaryMarkup = (summary: typeof twoWearerSummary) =>
  renderToStaticMarkup(
    createElement(DormantFutureSummaryStep, {
      summary,
      onBack: () => {},
      onEditGarments: () => {},
      onEditFabrics: () => {},
      onEditDesignStyle: () => {},
      onEditCustomDetails: () => {},
      onEditAiTryOn: () => {},
      onEditMeasurements: () => {},
      canContinueToShipping: false,
      onContinueToShipping: () => {},
    }),
  );
const wearerBlocks = [
  ...chiefAdaMarkup.matchAll(
    /<section data-summary-measurement-wearer="([^"]+)" class="([^"]*)"><div class="[^"]*"><h4 data-summary-measurement-person-heading="true" class="([^"]*)">([^<]*)<\/h4><span data-summary-measurement-method-badge="([^"]+)" class="([^"]*)"><span class="sr-only">Measurement method: <\/span>([^<]*)<\/span><\/div><p data-summary-measurement-person-garments="true" class="[^"]*">([^<]*)<\/p>/g,
  ),
];
assert.deepEqual(
  wearerBlocks.map((match) => [match[1], match[4], match[8]]),
  [
    ["wearer-chief", "Chief", "Standard Shirt"],
    ["wearer-ada", "Ada", "Standard Shirt 2"],
  ],
);
// Idea 2: each person heading carries their measurement method as a coloured badge,
// replacing the old "Method: …" text line (status stays).
assert.deepEqual(
  wearerBlocks.map((match) => [match[5], match[7]]),
  chiefAdaSummary.measurementSummary.wearerGroups!.map((wearer) => [
    wearer.route,
    wearer.routeLabel,
  ]),
);
for (const match of wearerBlocks) {
  assert.match(match[6], /\brounded-full\b/);
  assert.match(match[6], /\bborder-emerald-200\b|\bborder-amber-200\b|\bborder-red-200\b|\bborder-red-300\b|\bborder-heritage-gold\/30\b/);
}
assert.equal(chiefAdaMarkup.includes("Method: "), false);
assert.match(chiefAdaMarkup, /Status: (complete|incomplete)\./);
// Idea 3: per-person, per-group Edit links name the person and the group.
assert.match(chiefAdaMarkup, /aria-label="Edit Chief&#x27;s shared measurements" data-summary-measurement-section-edit="true"/);
assert.match(chiefAdaMarkup, /aria-label="Edit Ada&#x27;s Standard Shirt measurements" data-summary-measurement-section-edit="true"/);
{
  let measurementEdits = 0;
  let otherEdits = 0;
  let editRenderer!: ReturnType<typeof create>;
  act(() => {
    editRenderer = create(
      createElement(DormantFutureSummaryStep, {
        summary: chiefAdaSummary,
        onBack: () => {},
        onEditGarments: () => { otherEdits += 1; },
        onEditFabrics: () => { otherEdits += 1; },
        onEditDesignStyle: () => { otherEdits += 1; },
        onEditCustomDetails: () => { otherEdits += 1; },
        onEditAiTryOn: () => { otherEdits += 1; },
        onEditMeasurements: () => { measurementEdits += 1; },
        canContinueToShipping: false,
        onContinueToShipping: () => {},
      }),
    );
  });
  const sectionEdits = editRenderer.root.findAll(
    (node) => node.type === "button" && node.props["data-summary-measurement-section-edit"] === true,
  );
  assert.ok(sectionEdits.length >= 4, "two people × shared + garment groups");
  for (const button of sectionEdits) act(() => { button.props.onClick(); });
  assert.equal(measurementEdits, sectionEdits.length, "each group Edit opens Step 7 Measurements");
  assert.equal(otherEdits, 0, "group Edit links never open another stage");
  act(() => { editRenderer.unmount(); });
}
for (const [, , sectionClass, headingClass] of wearerBlocks) {
  assert.match(sectionClass, /\bborder-t-2\b/);
  assert.match(sectionClass, /\bborder-heritage-green\b/);
  assert.match(headingClass, /\bfont-serif\b/);
  assert.match(headingClass, /\btext-2xl\b/, "person headings (24px) outrank gold group headings (text-base, 16px) and row labels (text-sm, 14px)");
  assert.match(headingClass, /\bfont-semibold\b/);
  assert.match(headingClass, /\btext-heritage-green\b/);
}
// Person garment labels: plain family name inside a person's group, numbered only
// when the same person has two garments with the same name.
assert.deepEqual(
  Object.fromEntries(projectPersonGarmentLabels([
    { garmentKey: "additional:shirt:1", garmentType: "shirt", label: "Standard Shirt 2" },
    { garmentKey: "base:trouser", garmentType: "trouser", label: "Trouser" },
  ])),
  { "additional:shirt:1": "Standard Shirt", "base:trouser": "Trouser" },
);
assert.deepEqual(
  Object.fromEntries(projectPersonGarmentLabels([
    { garmentKey: "base:shirt", garmentType: "shirt", label: "Standard Shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt", label: "Standard Shirt 2" },
  ])),
  { "base:shirt": "Standard Shirt", "additional:shirt:1": "Standard Shirt 2" },
  "same person, two identical garments: numbers stay",
);
assert.deepEqual(
  Object.fromEntries(projectPersonGarmentLabels([
    { garmentKey: "base:shirt", garmentType: "shirt", label: "Own upload 2" },
  ])),
  { "base:shirt": "Own upload 2" },
  "labels that are not a family name are left alone",
);
const adaOwnPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: exactInput.garmentTypeSelection,
  physicalGarments: getMeasurementPhysicalGarments({
    garmentTypeSelection: exactInput.garmentTypeSelection,
    physicalOccurrences: [{ garmentKey: "additional:shirt:1", garmentType: "shirt" }],
  }),
  additionalGarmentConstructions: repeatedShirtConstruction.state,
});
let adaOwnState = createEmptyFutureMeasurementState("low_risk", "cm");
for (const requirement of adaOwnPlan.requirements.filter((candidate) => candidate.directInput)) {
  adaOwnState = setFutureMeasurementInput({
    state: adaOwnState,
    requirement,
    displayValue: requirement.measurementId === "total_height"
      ? 165
      : Math.round((requirement.averageFactor ?? 0.3) * 165 * 10) / 10,
  });
}
adaOwnState = reconcileFutureMeasurementState({ state: adaOwnState, plan: adaOwnPlan });
const chiefAdaOwnSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  fabricAllocationState: repeatedShirtFabricState,
  additionalGarmentConstructionState: repeatedShirtConstruction.state,
  wearerRuntimes: [
    chiefAdaRuntimes[0],
    { ...chiefAdaRuntimes[1], plan: adaOwnPlan, measurement: adaOwnState },
  ],
});
const adaOwnGroup = chiefAdaOwnSummary.measurementSummary.wearerGroups?.[1];
assert.deepEqual(adaOwnGroup?.personGarmentLabels, { "additional:shirt:1": "Standard Shirt" });
assert.deepEqual(adaOwnGroup?.byGarment.map((garment) => garment.garmentLabel), ["Standard Shirt"]);
assert.ok(
  chiefAdaOwnSummary.garmentSummary.some((garment) => garment.label === "Standard Shirt 2"),
  "the order-wide numbered label is unchanged outside the person group",
);
const chiefAdaOwnMarkup = renderMeasurementSummaryMarkup(chiefAdaOwnSummary);
const adaOwnBlock =
  chiefAdaOwnMarkup.split('data-summary-measurement-wearer="wearer-ada"')[1]?.split("</section>")[0] || "";
assert.match(adaOwnBlock, /data-summary-measurement-person-garments="true" class="[^"]*">Standard Shirt<\/p>/);
assert.match(adaOwnBlock, /<h5 class="[^"]*">Standard Shirt<\/h5>/);
assert.equal(adaOwnBlock.includes("Standard Shirt 2"), false);
assert.match(
  chiefAdaOwnMarkup,
  /data-garment-removal-row-heading="additional:shirt:1"[^>]*>Standard Shirt 2<\/h5>/,
  "Garments card keeps Standard Shirt 2 (inside its person group)",
);
const adaBlock = chiefAdaMarkup.split('data-summary-measurement-wearer="wearer-ada"')[1] || "";
assert.match(
  adaBlock,
  /<div data-summary-measurement-section="true" class="[^"]*"><div class="[^"]*"><h5 class="[^"]*text-base font-extrabold uppercase[^"]*">Shared body measurements<\/h5>/,
  "group headings sit under the person heading",
);
assert.ok(adaBlock.includes("data-measurement-pill"));
assert.ok(adaBlock.includes("data-measurement-check-flag"), "flags also show per person");
assert.equal(
  chiefAdaMarkup.includes("Standard Shirt — "),
  false,
  "garment rows no longer repeat the garment name in each label",
);
const blankSecondWearerSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  wearerRuntimes: [
    {
      wearerId: "wearer-you",
      displayName: "You",
      fitContext: "male" as const,
      garmentKeys: ["base:shirt"],
      plan: exactInput.measurementPlan,
      measurement: exactInput.measurementState,
    },
    {
      wearerId: "wearer-blank",
      displayName: "",
      fitContext: "female" as const,
      garmentKeys: ["base:dress"],
      plan: amakaSummaryInput.measurementPlan,
      measurement: amakaSummaryInput.measurementState,
    },
  ],
});
assert.match(
  renderMeasurementSummaryMarkup(blankSecondWearerSummary),
  /data-summary-measurement-person-heading="true" class="[^"]*">Person 2<\/h4>/,
  "a blank name among 2+ wearers keeps its Person N heading",
);
assert.equal(
  blankSoleMarkup.includes("data-summary-measurement-person-heading"),
  false,
  "solo keeps the compact header (no person heading, no Person 1)",
);
assert.equal(exactSummary.measurementSummary.wearerGroups, undefined);
assert.equal(exactSummary.measurementSummary.routeLabel.includes("Amaka"), false);
assert.equal(
  exactSummary.designStyleOccurrences?.[0]?.image,
  "https://example.invalid/private-safe-fallback.jpg",
);
const uploadedSummaryOccurrence = {
  target: {
    garmentKey: "base:shirt",
    occurrenceToken: "base:shirt#1",
  },
  garmentType: "shirt" as const,
  label: "Shirt",
  status: "complete" as const,
  assignmentLabel: "Uploaded design",
  assignment: {
    garmentKey: "base:shirt",
    occurrenceToken: "base:shirt#1",
    assignmentRevision: 1,
    sourceKind: "uploaded" as const,
    sourceKey: "uploaded:source-1",
    uploadedSourceRef: "source-1",
  },
};
const uploadedWithPreview = projectFutureDesignStudioSummary({
  ...exactInput,
  designStyleOccurrences: [uploadedSummaryOccurrence],
  uploadedPreviewByOccurrenceToken: { "base:shirt#1": "blob:preview-shirt" },
});
assert.equal(uploadedWithPreview.designStyleOccurrences?.[0]?.image, "blob:preview-shirt");
assert.equal(uploadedWithPreview.designStyleOccurrences?.[0]?.sourceKind, "uploaded");
const uploadedWithoutPreview = projectFutureDesignStudioSummary({
  ...exactInput,
  designStyleOccurrences: [uploadedSummaryOccurrence],
});
assert.equal(uploadedWithoutPreview.designStyleOccurrences?.[0]?.image, null);
const uploadedSummaryMarkup = renderToStaticMarkup(
  createElement(DormantFutureSummaryStep, {
    summary: uploadedWithPreview,
    onBack: () => undefined,
    onEditGarments: () => undefined,
    onEditFabrics: () => undefined,
    onEditDesignStyle: () => undefined,
    onEditCustomDetails: () => undefined,
    onEditAiTryOn: () => undefined,
    onEditMeasurements: () => undefined,
    canContinueToShipping: false,
    onContinueToShipping: () => undefined,
  }),
);
assert.match(uploadedSummaryMarkup, /src="blob:preview-shirt"/);
assert.match(uploadedSummaryMarkup, /alt="Uploaded design preview for Shirt"/);
assert.match(
  readFileSync("src/components/DesignStudioView.tsx", "utf8"),
  /uploadedPreviewByOccurrenceToken: futureDesignStylePreviewByOccurrenceToken/,
);

const directText = (node: ReactTestInstance): string =>
  node.children.filter((child): child is string => typeof child === "string").join("");

const renderSummaryGarmentCards = (
  summary: ReturnType<typeof projectFutureDesignStudioSummary>,
  extras: {
    onEditGarment?: (garmentKey: string) => void;
    removalTargets?: ReadonlyArray<{
      garmentKey: string;
      occurrenceLabel: string;
      roleLabel: string;
      presentationOrdinal: number;
      canRequestRemoval: boolean;
      disabledReason: string | null;
      accessibleName: string;
    }>;
  } = {},
) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(DormantFutureSummaryStep, {
        summary,
        onBack: () => {},
        onEditGarments: () => {},
        onEditFabrics: () => {},
        onEditDesignStyle: () => {},
        onEditCustomDetails: () => {},
        onEditAiTryOn: () => {},
        onEditMeasurements: () => {},
        onEditGarment: extras.onEditGarment,
        removalTargets: extras.removalTargets,
        onRequestGarmentRemoval: extras.removalTargets ? () => {} : undefined,
        canContinueToShipping: false,
        onContinueToShipping: () => {},
      }),
    );
  });
  const cards = renderer.root.findAll(
    (node) =>
      node.type === "article" &&
      typeof node.props["data-summary-garment-card"] === "string",
  );
  const wearerChips = renderer.root.findAll(
    (node) =>
      node.type === "span" &&
      typeof node.props["data-summary-garment-wearer"] === "string",
  );
  const fitChips = renderer.root.findAll(
    (node) =>
      node.type === "span" &&
      typeof node.props["data-summary-garment-fit"] === "string",
  );
  // Garment headings are h4 in plain cards and h5 inside a person group.
  const headings = renderer.root.findAll(
    (node) =>
      (node.type === "h4" || node.type === "h5") &&
      typeof node.props["data-garment-removal-row-heading"] === "string",
  );
  const personGroups = renderer.root
    .findAll(
      (node) =>
        node.type === "section" &&
        typeof node.props["data-summary-garment-person"] === "string",
    )
    .map((group) => [
      group.props["data-summary-garment-person-kind"],
      directText(group.find((node) => node.type === "h4")),
      group
        .findAll(
          (node) =>
            node.type === "article" &&
            typeof node.props["data-summary-garment-card"] === "string",
        )
        .map((card) => card.props["data-summary-garment-card"]),
    ]);
  return { renderer, cards, wearerChips, fitChips, headings, personGroups };
};

const wearerOrderFor = (
  wearers: ReadonlyArray<{
    wearerId: string;
    displayName: string;
    presentationOrder: number;
    fitContext?: "male" | "female" | "unisex" | null;
  }>,
  assignmentByGarmentKey: Record<string, string>,
): WearerOrderStateV2 => ({
  schemaVersion: 2,
  wearers: wearers.map((wearer) => ({
    wearerId: wearer.wearerId,
    displayName: wearer.displayName,
    fitContext: wearer.fitContext === undefined ? "male" : wearer.fitContext,
    presentationOrder: wearer.presentationOrder,
    measurement: exactInput.measurementState,
  })),
  assignmentByGarmentKey,
});

// The Garments card no longer repeats the fabric capacity line (the Fabrics
// section shows it), so this is empty for every card.
const fabricCapacityMeta = (card: ReactTestInstance): string =>
  card
    .findAll(
      (node) =>
        node.type === "p" && directText(node).includes("fabric capacity"),
    )
    .map(directText)
    .join("");

const repeatedWearerSummary = (
  wearerOrder: WearerOrderStateV2,
) =>
  projectFutureDesignStudioSummary({
    ...exactInput,
    fabricAllocationState: repeatedShirtFabricState,
    additionalGarmentConstructionState: repeatedShirtConstruction.state,
    wearerOrder,
  });

assert.equal(exactSummary.garmentSummary[0]?.wearerLabel, null);
assert.equal(exactSummary.garmentSummary[0]?.fitLabel, null);

const namedWearerSummary = repeatedWearerSummary(
  wearerOrderFor(
    [
      { wearerId: "wearer-chief", displayName: "Chief", presentationOrder: 0 },
      {
        wearerId: "wearer-ada",
        displayName: "Ada",
        presentationOrder: 1,
        fitContext: "female",
      },
    ],
    {
      "base:shirt": "wearer-chief",
      "additional:shirt:1": "wearer-ada",
    },
  ),
);
assert.equal(
  namedWearerSummary.garmentSummary.find((row) => row.garmentKey === "base:shirt")?.wearerLabel,
  "Chief",
);
assert.equal(
  namedWearerSummary.garmentSummary.find((row) => row.garmentKey === "base:shirt")?.fitLabel,
  null,
);
assert.equal(
  namedWearerSummary.garmentSummary.find((row) => row.garmentKey === "additional:shirt:1")?.wearerLabel,
  "Ada",
);
assert.equal(
  namedWearerSummary.garmentSummary.find((row) => row.garmentKey === "additional:shirt:1")?.fitLabel,
  null,
);
const namedCards = renderSummaryGarmentCards(namedWearerSummary, {
  onEditGarment: () => {},
  removalTargets: [
    {
      garmentKey: "base:shirt",
      occurrenceLabel: "Standard Shirt",
      roleLabel: "main",
      presentationOrdinal: 1,
      canRequestRemoval: true,
      disabledReason: null,
      accessibleName: "Remove Standard Shirt",
    },
    {
      garmentKey: "additional:shirt:1",
      occurrenceLabel: "Standard Shirt 2",
      roleLabel: "additional",
      presentationOrdinal: 2,
      canRequestRemoval: true,
      disabledReason: null,
      accessibleName: "Remove Standard Shirt 2",
    },
  ],
});
assert.deepEqual(
  namedCards.headings.map((heading) => [
    heading.props["data-garment-removal-row-heading"],
    directText(heading),
  ]),
  [
    ["base:shirt", "Standard Shirt"],
    ["additional:shirt:1", "Standard Shirt 2"],
  ],
);
// 2+ wearers: one person block each; the per-card wearer chip is gone.
assert.deepEqual(namedCards.personGroups, [
  ["wearer", "Chief", ["base:shirt"]],
  ["wearer", "Ada", ["additional:shirt:1"]],
]);
assert.deepEqual(namedCards.wearerChips, []);
assert.deepEqual(
  namedCards.fitChips.map((chip) => [
    chip.props["data-summary-garment-fit"],
    directText(chip),
  ]),
  [],
);
assert.equal(namedCards.cards.every((card) => !/fit/i.test(fabricCapacityMeta(card))), true);
assert.equal(
  namedCards.headings.some((heading) =>
    heading.findAll(
      (node) => node.props["data-summary-garment-wearer"] !== undefined,
    ).length > 0,
  ),
  false,
);
assert.deepEqual(
  namedCards.renderer.root
    .findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props["data-summary-edit-garment"] === "string",
    )
    .map((button) => button.props["data-summary-edit-garment"]),
  ["base:shirt", "additional:shirt:1"],
);
assert.deepEqual(
  namedCards.renderer.root
    .findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props["data-garment-removal-button"] === "string",
    )
    .map((button) => [
      button.props["data-garment-removal-button"],
      button.props["data-garment-removal-origin-stage"],
    ]),
  [
    ["base:shirt", "summary"],
    ["additional:shirt:1", "summary"],
  ],
);
act(() => {
  namedCards.renderer.unmount();
});

const blankNameSummary = repeatedWearerSummary(
  wearerOrderFor(
    [
      { wearerId: "wearer-blank", displayName: "", presentationOrder: 0 },
      { wearerId: "wearer-spaces", displayName: "   ", presentationOrder: 1 },
    ],
    {
      "base:shirt": "wearer-blank",
      "additional:shirt:1": "wearer-spaces",
    },
  ),
);
// Second person's name not saved yet: no wearer labels (no Person 1 / Person 2).
assert.deepEqual(
  blankNameSummary.garmentSummary.map((row) => [
    row.garmentKey,
    row.wearerLabel,
    row.fitLabel,
  ]),
  [
    ["base:shirt", null, null],
    ["additional:shirt:1", null, null],
  ],
);
const blankCards = renderSummaryGarmentCards(blankNameSummary);
assert.deepEqual(blankCards.personGroups, []);
assert.deepEqual(blankCards.wearerChips, []);
assert.deepEqual(
  blankCards.fitChips.map((chip) => [
    chip.props["data-summary-garment-fit"],
    directText(chip),
  ]),
  [],
);
assert.deepEqual(
  blankCards.headings.map((heading) => directText(heading)),
  ["Standard Shirt", "Standard Shirt 2"],
);
act(() => {
  blankCards.renderer.unmount();
});

// Second person typing (stored name, still unsaved in Step 7): labels stay off.
const typingSecondSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  fabricAllocationState: repeatedShirtFabricState,
  additionalGarmentConstructionState: repeatedShirtConstruction.state,
  wearerOrder: wearerOrderFor(
    [
      { wearerId: "wearer-blank", displayName: "", presentationOrder: 0 },
      { wearerId: "wearer-ada", displayName: "Ad", presentationOrder: 1 },
    ],
    {
      "base:shirt": "wearer-blank",
      "additional:shirt:1": "wearer-ada",
    },
  ),
  unsavedWearerNameIds: ["wearer-ada"],
});
assert.deepEqual(
  typingSecondSummary.garmentSummary.map((row) => row.wearerLabel),
  [null, null],
);

// Second name saved: labels show; a still-blank first person reads Person 1.
const savedSecondSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  fabricAllocationState: repeatedShirtFabricState,
  additionalGarmentConstructionState: repeatedShirtConstruction.state,
  wearerOrder: wearerOrderFor(
    [
      { wearerId: "wearer-blank", displayName: "", presentationOrder: 0 },
      { wearerId: "wearer-ada", displayName: "Ada", presentationOrder: 1 },
    ],
    {
      "base:shirt": "wearer-blank",
      "additional:shirt:1": "wearer-ada",
    },
  ),
  unsavedWearerNameIds: [],
});
assert.deepEqual(
  savedSecondSummary.garmentSummary.map((row) => [row.garmentKey, row.wearerLabel]),
  [
    ["base:shirt", "Person 1"],
    ["additional:shirt:1", "Ada"],
  ],
);
const savedSecondCards = renderSummaryGarmentCards(savedSecondSummary);
assert.deepEqual(savedSecondCards.personGroups, [
  ["wearer", "Person 1", ["base:shirt"]],
  ["wearer", "Ada", ["additional:shirt:1"]],
]);
act(() => {
  savedSecondCards.renderer.unmount();
});

const soloWearerSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  wearerOrder: wearerOrderFor(
    [{
      wearerId: "wearer-amaka",
      displayName: "Amaka",
      presentationOrder: 0,
      fitContext: "female",
    }],
    { "base:shirt": "wearer-amaka" },
  ),
});
// Solo: no wearer label, even with a saved name.
assert.equal(soloWearerSummary.garmentSummary[0]?.wearerLabel, null);
assert.equal(soloWearerSummary.garmentSummary[0]?.fitLabel, null);
const soloCards = renderSummaryGarmentCards(soloWearerSummary);
assert.equal(soloCards.cards.length, 1);
// One wearer: plain cards, no person block and no wearer chip.
assert.deepEqual(soloCards.personGroups, []);
assert.deepEqual(soloCards.wearerChips, []);
assert.deepEqual(
  soloCards.fitChips.map((chip) => [
    chip.props["data-summary-garment-fit"],
    directText(chip),
  ]),
  [],
);
assert.equal(/fit/i.test(fabricCapacityMeta(soloCards.cards[0])), false);
assert.equal(directText(soloCards.headings[0]), "Standard Shirt");
act(() => {
  soloCards.renderer.unmount();
});

const soloBlankNameSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  wearerOrder: wearerOrderFor(
    [{ wearerId: "wearer-blank", displayName: "  ", presentationOrder: 0, fitContext: "male" }],
    { "base:shirt": "wearer-blank" },
  ),
});
assert.equal(soloBlankNameSummary.garmentSummary[0]?.wearerLabel, null);
assert.equal(soloBlankNameSummary.garmentSummary[0]?.fitLabel, null);
const soloBlankCards = renderSummaryGarmentCards(soloBlankNameSummary);
assert.deepEqual(soloBlankCards.personGroups, []);
assert.deepEqual(soloBlankCards.wearerChips, []);
assert.equal(
  soloBlankCards.cards.some((card) =>
    card.findAll((node) => node.children.some((child) => child === "Person 1")).length > 0,
  ),
  false,
  "a sole wearer is never shown as Person 1 on the garment cards",
);
assert.deepEqual(
  soloBlankCards.fitChips.map((chip) => directText(chip)),
  [],
);
act(() => {
  soloBlankCards.renderer.unmount();
});

const soloFitUnsetSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  wearerOrder: wearerOrderFor(
    [{ wearerId: "wearer-amaka", displayName: "Amaka", presentationOrder: 0, fitContext: null }],
    { "base:shirt": "wearer-amaka" },
  ),
});
assert.equal(soloFitUnsetSummary.garmentSummary[0]?.wearerLabel, null);
assert.equal(soloFitUnsetSummary.garmentSummary[0]?.fitLabel, null);
const soloFitUnsetCards = renderSummaryGarmentCards(soloFitUnsetSummary);
assert.deepEqual(soloFitUnsetCards.wearerChips, []);
assert.equal(soloFitUnsetCards.fitChips.length, 0);
assert.equal(/fit/i.test(fabricCapacityMeta(soloFitUnsetCards.cards[0])), false);
act(() => {
  soloFitUnsetCards.renderer.unmount();
});

const soloUnisexSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  wearerOrder: wearerOrderFor(
    [{ wearerId: "wearer-amaka", displayName: "Amaka", presentationOrder: 0, fitContext: "unisex" }],
    { "base:shirt": "wearer-amaka" },
  ),
});
assert.equal(soloUnisexSummary.garmentSummary[0]?.fitLabel, null);

const unassignedSoloSummary = projectFutureDesignStudioSummary({
  ...exactInput,
  wearerOrder: wearerOrderFor(
    [{ wearerId: "wearer-amaka", displayName: "Amaka", presentationOrder: 0, fitContext: "female" }],
    {},
  ),
});
assert.equal(unassignedSoloSummary.garmentSummary[0]?.wearerLabel, null);
assert.equal(unassignedSoloSummary.garmentSummary[0]?.fitLabel, null);
const unassignedSoloCards = renderSummaryGarmentCards(unassignedSoloSummary);
assert.equal(unassignedSoloCards.wearerChips.length, 0);
assert.equal(unassignedSoloCards.fitChips.length, 0);
assert.equal(/fit/i.test(fabricCapacityMeta(unassignedSoloCards.cards[0])), false);
act(() => {
  unassignedSoloCards.renderer.unmount();
});

const partialAssignmentSummary = repeatedWearerSummary(
  wearerOrderFor(
    [
      { wearerId: "wearer-chief", displayName: "Chief", presentationOrder: 0 },
      { wearerId: "wearer-ada", displayName: "Ada", presentationOrder: 1 },
    ],
    { "base:shirt": "wearer-chief" },
  ),
);
assert.equal(
  partialAssignmentSummary.garmentSummary.find((row) => row.garmentKey === "base:shirt")
    ?.wearerLabel,
  "Chief",
);
assert.equal(
  partialAssignmentSummary.garmentSummary.find((row) => row.garmentKey === "base:shirt")
    ?.fitLabel,
  null,
);
assert.equal(
  partialAssignmentSummary.garmentSummary.find(
    (row) => row.garmentKey === "additional:shirt:1",
  )?.wearerLabel,
  null,
);
assert.equal(
  partialAssignmentSummary.garmentSummary.find(
    (row) => row.garmentKey === "additional:shirt:1",
  )?.fitLabel,
  null,
);
const partialCards = renderSummaryGarmentCards(partialAssignmentSummary);
// Without measurement wearer groups only one person is named, so the cards
// stay plain (the Unassigned group is covered with wearer groups in
// test_summary_garment_cards.tsx).
assert.deepEqual(partialCards.personGroups, []);
assert.deepEqual(partialCards.wearerChips, []);
assert.deepEqual(
  partialCards.fitChips.map((chip) => [
    chip.props["data-summary-garment-fit"],
    directText(chip),
  ]),
  [],
);
assert.equal(partialCards.cards.every((card) => !/fit/i.test(fabricCapacityMeta(card))), true);
act(() => {
  partialCards.renderer.unmount();
});

const projectFabricPreviewSummary = (fabricOverrides: Partial<Fabric>) => {
  const input = buildSummaryInput();
  if (input.materialPricing.status !== "resolved") {
    throw new Error("expected resolved fabric pricing");
  }
  const previewFabric: Fabric = {
    ...input.materialPricing.baseFabric,
    ...fabricOverrides,
  };
  return projectFutureDesignStudioSummary({
    ...input,
    materialPricing: {
      ...input.materialPricing,
      baseFabric: previewFabric,
      allocationLines: input.materialPricing.allocationLines.map((line) => ({
        ...line,
        fabric: previewFabric,
      })),
    },
  });
};

const renderFabricSummaryMarkup = (
  summary: ReturnType<typeof projectFutureDesignStudioSummary>,
) =>
  renderToStaticMarkup(
    createElement(DormantFutureSummaryStep, {
      summary,
      onBack: () => {},
      onEditGarments: () => {},
      onEditFabrics: () => {},
      onEditDesignStyle: () => {},
      onEditCustomDetails: () => {},
      onEditAiTryOn: () => {},
      onEditMeasurements: () => {},
      canContinueToShipping: false,
      onContinueToShipping: () => {},
    }),
  );

const imagePreviewSummary = projectFabricPreviewSummary({
  image: "  https://example.test/ankara.jpg  ",
  colorHex: "  #0D3E26  ",
});
assert.equal(
  imagePreviewSummary.fabricSummary[0]?.image,
  "https://example.test/ankara.jpg",
);
assert.equal(imagePreviewSummary.fabricSummary[0]?.colorHex, "#0D3E26");
const imagePreviewMarkup = renderFabricSummaryMarkup(imagePreviewSummary);
assert.match(imagePreviewMarkup, /data-summary-fabric-image="true"/);
assert.match(imagePreviewMarkup, /src="https:\/\/example\.test\/ankara\.jpg"/);
assert.equal(imagePreviewMarkup.includes("data-summary-fabric-swatch"), false);
assert.equal(imagePreviewMarkup.includes("data-summary-fabric-fallback"), false);
assert.equal(imagePreviewMarkup.includes("No preview"), false);

const swatchPreviewSummary = projectFabricPreviewSummary({
  image: "   ",
  colorHex: "  #abc  ",
});
assert.equal(swatchPreviewSummary.fabricSummary[0]?.image, null);
assert.equal(swatchPreviewSummary.fabricSummary[0]?.colorHex, "#abc");
const swatchPreviewMarkup = renderFabricSummaryMarkup(swatchPreviewSummary);
assert.match(swatchPreviewMarkup, /data-summary-fabric-swatch="true"/);
assert.match(swatchPreviewMarkup, /background-color:#abc/);
assert.equal(swatchPreviewMarkup.includes("data-summary-fabric-image"), false);
assert.equal(swatchPreviewMarkup.includes("No preview"), false);

const missingPreviewSummary = projectFabricPreviewSummary({
  image: "",
  colorHex: "not-a-hex",
});
assert.equal(missingPreviewSummary.fabricSummary[0]?.image, null);
assert.equal(missingPreviewSummary.fabricSummary[0]?.colorHex, null);
const missingPreviewMarkup = renderFabricSummaryMarkup(missingPreviewSummary);
assert.match(missingPreviewMarkup, /data-summary-fabric-fallback="true"/);
assert.match(missingPreviewMarkup, /No preview/);
assert.equal(missingPreviewMarkup.includes("data-summary-fabric-image"), false);
assert.equal(missingPreviewMarkup.includes("data-summary-fabric-swatch"), false);

const unresolvedPreviewSummary = projectFutureDesignStudioSummary({
  ...buildSummaryInput(),
  materialPricing: { status: "unresolved", reason: "FABRIC_NOT_FOUND" },
});
assert.equal(unresolvedPreviewSummary.fabricSummary[0]?.fabricName, "Fabric unavailable");
assert.equal(unresolvedPreviewSummary.fabricSummary[0]?.image, null);
assert.equal(unresolvedPreviewSummary.fabricSummary[0]?.colorHex, null);
assert.match(renderFabricSummaryMarkup(unresolvedPreviewSummary), /No preview/);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// Production retry gaps are 1, 2, 4, 8 s; shorten them to 5, 10, 20, 40 ms.
const SUMMARY_TEST_RETRY_DELAYS_MS = [5, 10, 20, 40];
setDefaultImageRetryDelaysForTests(SUMMARY_TEST_RETRY_DELAYS_MS);
const failSummaryFabricImageEveryTime = async () => {
  for (let attempt = 0; attempt <= SUMMARY_TEST_RETRY_DELAYS_MS.length; attempt += 1) {
    act(() => {
      fabricPreviewRenderer.root
        .findByProps({ "data-summary-fabric-image": "true" })
        .props.onError();
    });
    if (attempt < SUMMARY_TEST_RETRY_DELAYS_MS.length) {
      await act(async () => {
        await new Promise((resolve) =>
          setTimeout(resolve, SUMMARY_TEST_RETRY_DELAYS_MS[attempt]! + 30),
        );
      });
      assert.match(
        fabricPreviewRenderer.root.findByProps({ "data-summary-fabric-image": "true" }).props.src,
        new RegExp(`imgRetry=${attempt + 1}`),
      );
    }
  }
};
let fabricPreviewRenderer!: ReturnType<typeof create>;
act(() => {
  fabricPreviewRenderer = create(
    createElement(DormantFutureSummaryStep, {
      summary: imagePreviewSummary,
      onBack: () => {},
      onEditGarments: () => {},
      onEditFabrics: () => {},
      onEditDesignStyle: () => {},
      onEditCustomDetails: () => {},
      onEditAiTryOn: () => {},
      onEditMeasurements: () => {},
      canContinueToShipping: false,
      onContinueToShipping: () => {},
    }),
  );
});
assert.equal(
  fabricPreviewRenderer.root.findAllByProps({ "data-summary-fabric-image": "true" }).length,
  1,
);
// Retries with growing gaps, then the swatch fallback with a reload button.
await failSummaryFabricImageEveryTime();
assert.equal(
  fabricPreviewRenderer.root.findAllByProps({ "data-summary-fabric-image": "true" }).length,
  0,
);
assert.equal(
  fabricPreviewRenderer.root.findAllByProps({ "data-summary-fabric-swatch": "true" }).length,
  1,
);

const brokenImageSummary = projectFabricPreviewSummary({
  image: "https://example.test/broken.jpg",
  colorHex: "blue",
});
act(() => {
  fabricPreviewRenderer.update(
    createElement(DormantFutureSummaryStep, {
      summary: brokenImageSummary,
      onBack: () => {},
      onEditGarments: () => {},
      onEditFabrics: () => {},
      onEditDesignStyle: () => {},
      onEditCustomDetails: () => {},
      onEditAiTryOn: () => {},
      onEditMeasurements: () => {},
      canContinueToShipping: false,
      onContinueToShipping: () => {},
    }),
  );
});
await failSummaryFabricImageEveryTime();
assert.equal(
  fabricPreviewRenderer.root.findAllByProps({ "data-summary-fabric-fallback": "true" }).length,
  1,
);
const summaryFallbackText = (node: { children: unknown[] }): string =>
  node.children
    .map((child) =>
      typeof child === "string"
        ? child
        : summaryFallbackText(child as { children: unknown[] }),
    )
    .join("");
assert.match(
  summaryFallbackText(
    fabricPreviewRenderer.root.findByProps({ "data-summary-fabric-fallback": "true" }),
  ),
  /No preview/,
);
// A photo that existed but failed offers "Tap to reload photo", which starts again.
const summaryReload = fabricPreviewRenderer.root.findByProps({
  "data-fabric-photo-reload": "true",
});
assert.match(String(summaryReload.props["aria-label"]), /^Tap to reload photo/);
act(() => {
  summaryReload.props.onClick({ stopPropagation: () => {} });
});
assert.equal(
  fabricPreviewRenderer.root.findAllByProps({ "data-summary-fabric-image": "true" }).length,
  1,
);
setDefaultImageRetryDelaysForTests(null);
act(() => {
  fabricPreviewRenderer.unmount();
});

console.log("PASS: dormant future Summary projection and Step 7 integration");
