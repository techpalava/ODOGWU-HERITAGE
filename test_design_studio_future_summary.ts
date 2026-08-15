import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  AiTryOnWorkflowStateV1,
  BusinessSettings,
  Fabric,
  FabricAllocationState,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  getFutureFabricCapacityComposition,
  getFutureFabricStageCompletion,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileFutureDesignStyleSelection } from "./src/utils/designStudioFutureDesignStyle";
import { projectFutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
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
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
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
        garmentType === "kaftan" ||
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
      garmentType === "kaftan" ||
      garmentType === "full_length_gown" ||
      garmentType === "agbada"
        ? 2
        : 1,
  })),
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
  });
  const customDetailsPricing = calculateGarmentScopedCustomDetailsPricing({
    reconciliation: customDetailsReconciliation,
    catalogInspection: inspection,
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
  exactSummary.pricingSummary.selectedDesignPrice?.includedComponents
    .lagosToEindhovenShipping,
  "INCLUDED_IN_GARMENT_CONSTRUCTION",
);
assert.equal(
  exactSummary.fabricSummary[0].pricingTreatment,
  "included_in_garment_construction",
);

const decorativeInput = {
  ...exactInput,
  basePricing: {
    ...exactInput.basePricing!,
    customDetailsPrice: 12,
    monogramPrice: 12,
    decorativeFeatures: [
      { label: "Embroidery", price: 12, includedByStyle: false },
    ],
  },
};
const decorativeSummary = projectFutureDesignStudioSummary(decorativeInput);
assert.equal(
  decorativeSummary.pricingSummary.customDetailsExactSubtotal,
  exactSummary.pricingSummary.customDetailsExactSubtotal + 12,
  "central decorative pricing is included once in the future Custom Details subtotal",
);
assert.equal(
  decorativeSummary.customDetailsSummary
    .flatMap((group) => group.occurrences)
    .filter((occurrence) => occurrence.optionLabel === "Embroidery").length,
  1,
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
  calculationStatus: "calculation_formula_pending",
};
assert.equal(
  projectFutureDesignStudioSummary(mediumInput).status,
  "measurement_calculation_pending",
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
assert.match(summarySource, /Back to Measurements/);
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
