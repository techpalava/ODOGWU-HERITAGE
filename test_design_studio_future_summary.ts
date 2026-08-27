import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  AiTryOnWorkflowStateV1,
  AdditionalGarmentConstructionStateV1,
  BusinessSettings,
  Fabric,
  FabricAllocationState,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  StyleCategory,
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
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import { reconcileAdditionalGarmentConstructionState } from "./src/utils/additionalGarmentConstructionState";
import {
  getFutureFabricCapacityComposition,
  getFutureFabricStageCompletion,
  removeFutureFabricAssignment,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileFutureDesignStyleSelection } from "./src/utils/designStudioFutureDesignStyle";
import { projectFutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
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
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";

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
    fabricGarments: fabricAllocationState.fabricAllocations.flatMap(
      (allocation) => allocation.garmentAssignments,
    ),
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
      displayValue: 10,
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
    garmentTypeSelection,
    catalogInspection: inspection,
    fabricAllocationState,
    fabricCompletion,
    materialPricing,
    designStyleSelection,
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

const emptyAdditionalConstructionState =
  (): AdditionalGarmentConstructionStateV1 => ({
    schemaVersion: 1,
    byGarmentKey: {},
  });

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
assert.equal(exactSummary.designStyleSummary?.styleId, "style-shirt");
assert.equal(exactSummary.customDetailsSummary[0].occurrences[0].priceCents, 0);
assert.equal(exactSummary.aiTryOnSummary.label, "Skipped by choice");
assert.ok(exactSummary.measurementSummary.shared.length > 0);
assert.ok(
  exactSummary.measurementSummary.shared.every((value) => value.formattedValue.endsWith(" in")),
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
    garmentLabel: "Shirt",
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
assert.equal(inactiveConstructionLabelBreakdown.status, "complete");
assert.deepEqual(
  inactiveConstructionLabelBreakdown.rows.map((row) => [
    row.constructionLabel,
    row.priceCents,
  ]),
  [[CONSTRUCTION_OPTION_FALLBACK_LABEL, 6500]],
  "an inactive catalogue label falls back without hiding authoritative money",
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
assert.equal(blankConstructionLabelBreakdown.status, "complete");
assert.deepEqual(
  blankConstructionLabelBreakdown.rows.map((row) => [
    row.constructionLabel,
    row.priceCents,
  ]),
  [[CONSTRUCTION_OPTION_FALLBACK_LABEL, 6500]],
  "a blank catalogue label falls back without changing the Step 7 amount",
);
assert.equal(
  blankConstructionLabelBreakdown.rows[0].priceCents,
  Math.round(exactSummary.pricingSummary.garmentConstructionSubtotal! * 100),
  "Step 6 and Step 7 remain monetarily consistent when labels are unavailable",
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
      garmentLabel: "Shirt",
      constructionLabel: "Standard Length Shirt, Mid-Long Sleeve",
      role: "main",
      priceCents: 7000,
    }],
    "a selected construction alternative replaces the existing Shirt occurrence row and price",
  );
}

const additionalShirtSelection = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  existingAssignments: exactInput.fabricAllocationState.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
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
const repeatedShirtConstruction = reconcileAdditionalGarmentConstructionState({
  existingState: emptyAdditionalConstructionState(),
  assignments: repeatedShirtAssignments,
  normalizedCustomDetailCatalog: inspection.activeOptions,
});
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
    existingAssignments:
      repeatedShirtFabricState.fabricAllocations.flatMap(
        (allocation) => allocation.garmentAssignments,
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
  existingConstructionState: repeatedShirtConstruction.state,
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
  ["additional:shirt:1"],
);
assert.deepEqual(
  oneAdditionalRemovedScenario.breakdown.rows.map((row) => [
    row.garmentKey,
    row.priceCents,
  ]),
  [
    ["base:shirt", 6500],
    ["additional:shirt:2", 6500],
  ],
  "removing one repeated Additional occurrence preserves the other keyed row",
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
assert.equal(
  decorativeSummary.customDetailsSummary
    .flatMap((group) => group.occurrences)
    .filter((occurrence) => occurrence.optionLabel === "Name Monogram").length,
  1,
);
assert.equal(
  decorativeSummary.pricingSummary.selectedDesignPrice?.selectedDesignPrice,
  exactSummary.pricingSummary.selectedDesignPrice!.selectedDesignPrice! + 12,
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
  { decorativeFeatures: ["Name Monogram"] },
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
assert.match(summarySource, /Continue to Shipping/);
assert.match(summarySource, /disabled/);
assert.match(summarySource, /DesignStudioBackButton/);
assert.match(summarySource, /destination="Measurement"/);
assert.match(summarySource, /SELECTED_DESIGN_PRICE_SUPPORTING_TEXT/);
assert.match(summarySource, /Your design summary is ready/);
assert.match(
  summarySource,
  /Review your selections below\. You can return to any completed step to make changes\./,
);
assert.match(summarySource, /Price evaluation required/);
assert.match(
  summarySource,
  /One or more personalised requirements must be evaluated before an exact total can be confirmed\./,
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

console.log("PASS: dormant future Summary projection and Step 7 integration");
