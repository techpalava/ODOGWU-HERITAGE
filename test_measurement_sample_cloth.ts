import assert from "node:assert/strict";
import type {
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  MeasurementMethodId,
} from "./src/types";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { getFuturePaymentReviewMeasurementGroups } from "./src/utils/designStudioFuturePaymentReview";
import { projectFutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import {
  collectRequiredAlternativeGroups,
  classifyFutureMeasurementHydration,
  countRemainingCustomerRequiredMeasurementUnits,
  countRequiredMeasurementUnits,
  createEmptyFutureMeasurementState,
  deriveActiveCalculatedMeasurements,
  fromCanonicalCentimetres,
  getActiveFutureMeasurementEntered,
  getSampleClothProductionEquivalentCm,
  isFutureMeasurementEnteredBagEmpty,
  isFutureMeasurementSelectedPathInputComplete,
  isFutureMeasurementStageComplete,
  isFutureSummaryUnlockedByMeasurements,
  isSampleClothMeasurementMethod,
  isSelectedMeasurementMethod,
  isSelectedMeasurementRiskRoute,
  MEASUREMENT_METHOD_LABELS,
  MEASUREMENT_SAMPLE_CLOTH_DESCRIPTION,
  MEASUREMENT_SAMPLE_CLOTH_FORM_TITLE,
  MEASUREMENT_SAMPLE_CLOTH_LABEL,
  MEASUREMENT_SAMPLE_CLOTH_METHOD,
  normalizeFutureMeasurementState,
  planMeasurementRequirements,
  projectActiveFutureMeasurementState,
  projectMeasurementRequirementsForPresentation,
  reconcileFutureMeasurementState,
  resolvePersistedFutureMeasurementState,
  roundMeasurementDisplayValue,
  setFutureMeasurementInput,
  setFutureMeasurementRoute,
  setFutureMeasurementUnit,
} from "./src/utils/measurementBlueprint";
import { MEASUREMENT_BLUEPRINT_VERSION } from "./src/config/MeasurementBlueprintConfig";

const SAMPLE_OMITTED_IDS = [
  "total_height",
  "height_head_to_lower_neck",
  "height_lower_neck_to_waist",
  "height_waist_to_feet",
  "head_circumference",
] as const;

const construction = (
  garmentType: keyof GarmentTypeStepSelection["constructionByGarment"],
  optionId: string,
  selectionGroup: any,
) => ({
  status: "resolved" as const,
  garmentType,
  components: [{
    componentKey: `${garmentType}:${selectionGroup}:${optionId}`,
    optionId,
    selectionGroup,
    priceCents: 1,
    price: 0.01,
  }],
  totalPriceCents: 1,
  totalPrice: 0.01,
});

const shirtSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};
const shirtGarments = [{ garmentKey: "shirt:1", garmentType: "shirt" as const }];

const dressSelection: GarmentTypeStepSelection = {
  garmentTypes: ["dress"],
  demographic: "female",
  constructionByGarment: {
    dress: construction("dress", "dress_std_short", "dress_construction"),
  },
};
const dressGarments = [{ garmentKey: "dress:1", garmentType: "dress" as const }];

const trouserSelection: GarmentTypeStepSelection = {
  garmentTypes: ["trouser"],
  demographic: "male",
  constructionByGarment: {},
};
const trouserGarments = [{ garmentKey: "trouser:1", garmentType: "trouser" as const }];

const mixedSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};
const mixedGarments = [
  { garmentKey: "shirt:1", garmentType: "shirt" as const },
  { garmentKey: "trouser:1", garmentType: "trouser" as const },
];

const midLongShirtSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_midlong", "shirt_construction"),
  },
};

const displayInches = (valueCm: number | undefined): number | null =>
  valueCm == null
    ? null
    : roundMeasurementDisplayValue(fromCanonicalCentimetres(valueCm, "inch"));

const planFor = (
  route: MeasurementMethodId,
  garmentTypeSelection: GarmentTypeStepSelection,
  physicalGarments: Array<{ garmentKey: string; garmentType: "shirt" | "dress" | "trouser" }>,
) =>
  planMeasurementRequirements({
    route,
    garmentTypeSelection,
    physicalGarments,
  });

const fillDirect = (
  method: MeasurementMethodId,
  garmentTypeSelection: GarmentTypeStepSelection,
  physicalGarments: Array<{ garmentKey: string; garmentType: "shirt" | "dress" | "trouser" }>,
  existing: FutureMeasurementStateV1 = createEmptyFutureMeasurementState(method, "inch"),
  displayValue = 10,
): { state: FutureMeasurementStateV1; plan: ReturnType<typeof planMeasurementRequirements> } => {
  const plan = planFor(method, garmentTypeSelection, physicalGarments);
  let state = existing.route === method
    ? existing
    : setFutureMeasurementRoute(existing, method);
  for (const requirement of plan.requirements.filter((candidate) => candidate.directInput)) {
    state = setFutureMeasurementInput({
      state,
      requirement,
      displayValue,
    });
  }
  const filledGroups = new Set<string>();
  for (const members of collectRequiredAlternativeGroups(plan.requirements).values()) {
    const first = members[0];
    if (!first) continue;
    const groupId = `${first.garmentKey}:${first.alternativeGroup}`;
    if (filledGroups.has(groupId)) continue;
    filledGroups.add(groupId);
    state = setFutureMeasurementInput({
      state,
      requirement: first,
      displayValue,
    });
  }
  state = reconcileFutureMeasurementState({ state, plan });
  return { state, plan };
};

assert.equal(MEASUREMENT_SAMPLE_CLOTH_METHOD, "sample_cloth");
assert.equal(MEASUREMENT_SAMPLE_CLOTH_LABEL, "Sample Cloth Measurements");
assert.equal(
  MEASUREMENT_SAMPLE_CLOTH_DESCRIPTION,
  "Measure these on the sample garment. Production equivalent (sample circumference = laid-flat width × 2). No extra ease is added, because the sample already includes the fit you like.",
);
assert.equal(MEASUREMENT_SAMPLE_CLOTH_FORM_TITLE, "Sample Cloth Measurements");
assert.equal(MEASUREMENT_METHOD_LABELS.sample_cloth, "Sample Cloth Measurements");
assert.equal(isSelectedMeasurementRiskRoute("sample_cloth"), false);
assert.equal(isSelectedMeasurementMethod("sample_cloth"), true);
assert.equal(isSampleClothMeasurementMethod("sample_cloth"), true);

const empty = createEmptyFutureMeasurementState();
assert.equal(empty.route, null);
assert.equal(empty.schemaVersion, 1);
assert.ok(empty.enteredByRoute?.sample_cloth);
assert.equal(isFutureMeasurementEnteredBagEmpty(empty.enteredByRoute?.sample_cloth), true);

for (const [label, selection, garments] of [
  ["upper-body shirt", shirtSelection, shirtGarments],
  ["Dress", dressSelection, dressGarments],
  ["lower-body trouser", trouserSelection, trouserGarments],
  ["mixed shirt+trouser", mixedSelection, mixedGarments],
] as const) {
  const lowPlan = planFor("low_risk", selection, garments);
  const samplePlan = planFor("sample_cloth", selection, garments);
  assert.equal(samplePlan.route, "sample_cloth", `${label} sample plan route`);
  assert.equal(samplePlan.canCalculate, false, `${label} sample cannot calculate`);
  assert.equal(
    samplePlan.requirements.some((requirement) =>
      SAMPLE_OMITTED_IDS.includes(requirement.measurementId as typeof SAMPLE_OMITTED_IDS[number]),
    ),
    false,
    `${label} sample omits body-only height and head fields`,
  );
  assert.ok(
    lowPlan.requirements.some((requirement) => requirement.measurementId === "total_height"),
    `${label} Low Risk still asks for height`,
  );
  assert.notEqual(
    samplePlan.requirements.map((requirement) => requirement.measurementId).sort().join(","),
    lowPlan.requirements.map((requirement) => requirement.measurementId).sort().join(","),
    `${label} sample field set is not a Low Risk clone`,
  );
  assert.equal(
    samplePlan.requirements.every((requirement) => requirement.key.startsWith("sample_cloth:")),
    true,
    `${label} sample keys stay method-scoped`,
  );
  assert.equal(
    samplePlan.requirements.some((requirement) => requirement.inputSource === "calculated_average_factor"),
    false,
    `${label} sample stays manual-only`,
  );
  assert.ok(
    samplePlan.requirements.every((requirement) => Boolean(requirement.sampleGeometry)),
    `${label} sample marks half-width vs length/opening`,
  );
  assert.ok(
    samplePlan.requirements.some((requirement) => requirement.sampleGeometry === "laid_flat_half_width"),
    `${label} sample has laid-flat half-width fields`,
  );
  assert.ok(
    samplePlan.requirements.some((requirement) => requirement.sampleGeometry === "length_or_opening"),
    `${label} sample has 1:1 length/opening fields`,
  );
  const presented = projectMeasurementRequirementsForPresentation({
    requirements: samplePlan.requirements,
    state: createEmptyFutureMeasurementState("sample_cloth", "inch"),
  });
  assert.notEqual(presented[0]?.measurementId, "total_height", `${label} does not start with height`);
}

const sampleShirtPlan = planFor("sample_cloth", shirtSelection, shirtGarments);
const chestRequirement = sampleShirtPlan.requirements.find(
  (requirement) => requirement.measurementId === "chest_bust_circumference",
)!;
const lengthRequirement = sampleShirtPlan.requirements.find(
  (requirement) => requirement.measurementId === "shirt_length_standard",
)!;
const neckRequirement = sampleShirtPlan.requirements.find(
  (requirement) => requirement.measurementId === "neck_circumference",
)!;
assert.equal(chestRequirement.sampleGeometry, "laid_flat_half_width");
assert.equal(lengthRequirement.sampleGeometry, "length_or_opening");
assert.equal(neckRequirement.sampleGeometry, "length_or_opening");

const chestOnly = setFutureMeasurementInput({
  state: createEmptyFutureMeasurementState("sample_cloth", "inch"),
  requirement: chestRequirement,
  displayValue: 20,
});
const chestOnlyReconciled = reconcileFutureMeasurementState({
  state: chestOnly,
  plan: sampleShirtPlan,
});
assert.equal(displayInches(chestOnlyReconciled.entered.shared.chest_bust_circumference?.valueCm), 20);
assert.equal(Object.keys(chestOnlyReconciled.derived.shared).length, 0);
assert.equal(Object.keys(chestOnlyReconciled.derived.byGarmentKey).length, 0);
assert.equal(
  Object.keys(chestOnlyReconciled.entered.shared).length,
  1,
  "Entering one Sample field must not populate other Sample fields.",
);
assert.deepEqual(
  deriveActiveCalculatedMeasurements({
    route: "sample_cloth",
    entered: chestOnlyReconciled.entered,
    plan: sampleShirtPlan,
    requiredComplete: false,
  }),
  { shared: {}, byGarmentKey: {} },
);

const lowFilled = fillDirect("low_risk", shirtSelection, shirtGarments);
assert.equal(lowFilled.state.route, "low_risk");
const switchedToSample = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(lowFilled.state, "sample_cloth"),
  plan: sampleShirtPlan,
});
assert.equal(switchedToSample.route, "sample_cloth");
assert.equal(isFutureMeasurementEnteredBagEmpty(getActiveFutureMeasurementEntered(switchedToSample)), true);
assert.equal(isFutureMeasurementStageComplete(switchedToSample), false);
assert.equal(isFutureSummaryUnlockedByMeasurements(switchedToSample), false);
assert.equal(
  isFutureMeasurementEnteredBagEmpty(switchedToSample.enteredByRoute?.low_risk),
  false,
  "Inactive Low Risk values stay isolated.",
);

const sampleFilled = fillDirect("sample_cloth", shirtSelection, shirtGarments, switchedToSample, 10);
assert.equal(sampleFilled.state.route, "sample_cloth");
assert.equal(isFutureMeasurementStageComplete(sampleFilled.state), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(sampleFilled.state), true);
assert.equal(
  isFutureMeasurementEnteredBagEmpty(sampleFilled.state.enteredByRoute?.low_risk),
  false,
);

const chestFilled = reconcileFutureMeasurementState({
  state: setFutureMeasurementInput({
    state: sampleFilled.state,
    requirement: chestRequirement,
    displayValue: 20,
  }),
  plan: sampleShirtPlan,
});
assert.equal(displayInches(chestFilled.entered.shared.chest_bust_circumference?.valueCm), 20);
assert.equal(displayInches(chestFilled.derived.shared.chest_bust_circumference?.valueCm), 40);
assert.equal(chestFilled.derived.shared.chest_bust_circumference?.provenance, "system_derived");
assert.equal(
  displayInches(chestFilled.entered.byGarmentKey[lengthRequirement.garmentKey]?.shirt_length_standard?.valueCm),
  10,
);
assert.equal(
  chestFilled.derived.byGarmentKey[lengthRequirement.garmentKey]?.shirt_length_standard,
  undefined,
  "Lengths must not be doubled into derived.",
);
assert.equal(displayInches(chestFilled.entered.shared.neck_circumference?.valueCm), 10);
assert.equal(
  chestFilled.derived.shared.neck_circumference,
  undefined,
  "Openings measured around the cloth must stay 1:1.",
);

const projectedSample = projectActiveFutureMeasurementState({
  state: chestFilled,
  plan: sampleShirtPlan,
});
assert.equal(displayInches(projectedSample.entered.shared.chest_bust_circumference?.valueCm), 20);
assert.equal(displayInches(projectedSample.derived.shared.chest_bust_circumference?.valueCm), 40);
assert.equal(projectedSample.derived.shared.chest_bust_circumference?.provenance, "system_derived");

const paymentGroups = getFuturePaymentReviewMeasurementGroups({
  garments: [{ garmentKey: "shirt:1", label: "Standard Shirt" }],
  measurements: chestFilled,
} as never);
const sharedPayment = paymentGroups.find((group) => group.garmentKey === null)?.items || [];
const chestPayment = sharedPayment.find((item) => item.measurementId === "chest_bust_circumference");
const neckPayment = sharedPayment.find((item) => item.measurementId === "neck_circumference");
assert.equal(chestPayment?.displayValue, 40);
assert.equal(chestPayment?.provenanceLabel, "Converted from sample cloth");
assert.equal(neckPayment?.displayValue, 10);
assert.equal(neckPayment?.provenanceLabel, "Customer entered");
const leftoverHeightState = reconcileFutureMeasurementState({
  state: {
    ...chestFilled,
    entered: {
      ...chestFilled.entered,
      shared: {
        ...chestFilled.entered.shared,
        total_height: { valueCm: 177.8, provenance: "customer_entered" },
      },
    },
    enteredByRoute: {
      ...chestFilled.enteredByRoute!,
      sample_cloth: {
        ...chestFilled.entered,
        shared: {
          ...chestFilled.entered.shared,
          total_height: { valueCm: 177.8, provenance: "customer_entered" },
        },
      },
    },
  },
  plan: sampleShirtPlan,
});
assert.equal(leftoverHeightState.entered.shared.total_height, undefined);
assert.equal(
  leftoverHeightState.diagnostics.some((diagnostic) => diagnostic.code === "measurement_range_recheck"),
  false,
  "Sample must not range-check laid-flat widths against leftover height.",
);
const lengthPayment = paymentGroups
  .find((group) => group.garmentKey === "shirt:1")
  ?.items.find((item) => item.measurementId === "shirt_length_standard");
assert.equal(lengthPayment?.displayValue, 10);
assert.equal(lengthPayment?.provenanceLabel, "Customer entered");

const summary = projectFutureDesignStudioSummary({
  step1GarmentTypeSelection: shirtSelection,
  garmentTypeSelection: shirtSelection,
  designSourceKind: "catalogue",
  catalogInspection: inspectCustomDetailCatalog([]),
  fabricAllocationState: { fabricAllocations: [] },
  fabricCompletion: { blockers: [] },
  materialPricing: null,
  designStyleSelection: { status: "incomplete" },
  customDetailsReconciliation: null,
  customDetailsCompletion: null,
  customDetailsPricing: null,
  personalizedInputs: null,
  aiTryOnWorkflow: { status: "skipped" },
  measurementPlan: sampleShirtPlan,
  measurementState: chestFilled,
  basePricing: null,
} as never);
assert.equal(summary.measurementSummary.routeLabel, "Sample Cloth Measurements");
const chestSummary = summary.measurementSummary.shared.find(
  (value) => value.measurementId === "chest_bust_circumference",
);
assert.equal(chestSummary?.formattedValue, "20 in");
assert.equal(chestSummary?.convertedFormattedValue, "40 in");
assert.equal(chestSummary?.convertedLabel, "Converted from sample cloth");
assert.match(chestSummary?.label || "", /laid flat/i);
const lengthSummary = summary.measurementSummary.byGarment
  .flatMap((garment) => garment.values)
  .find((value) => value.measurementId === "shirt_length_standard");
assert.equal(lengthSummary?.formattedValue, "10 in");
assert.equal(lengthSummary?.convertedFormattedValue, null);

const switchedToHigh = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(chestFilled, "high_risk"),
  plan: planFor("high_risk", shirtSelection, shirtGarments),
});
assert.equal(switchedToHigh.route, "high_risk");
assert.equal(isFutureMeasurementEnteredBagEmpty(getActiveFutureMeasurementEntered(switchedToHigh)), true);
assert.equal(isFutureMeasurementStageComplete(switchedToHigh), false);
assert.equal(
  switchedToHigh.entered.shared.chest_bust_circumference,
  undefined,
  "Sample laid-flat chest must not leak into High Risk.",
);

const restoredSample = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(switchedToHigh, "sample_cloth"),
  plan: sampleShirtPlan,
});
assert.equal(restoredSample.route, "sample_cloth");
assert.deepEqual(restoredSample.entered, chestFilled.entered);
assert.equal(displayInches(restoredSample.derived.shared.chest_bust_circumference?.valueCm), 40);
assert.equal(isFutureMeasurementStageComplete(restoredSample), true);
assert.deepEqual(
  restoredSample.enteredByRoute?.low_risk.shared.total_height,
  lowFilled.state.entered.shared.total_height,
);

const remainingBefore = countRemainingCustomerRequiredMeasurementUnits({
  plan: sampleShirtPlan,
  state: switchedToSample,
});
assert.ok(remainingBefore > 0);
const remainingAfter = countRemainingCustomerRequiredMeasurementUnits({
  plan: sampleShirtPlan,
  state: chestFilled,
});
assert.equal(remainingAfter, 0);
const presentedRequired = projectMeasurementRequirementsForPresentation({
  requirements: sampleShirtPlan.requirements,
  state: chestFilled,
}).filter((requirement) => requirement.section === "required");
assert.equal(
  countRequiredMeasurementUnits(presentedRequired) > 0,
  true,
);
assert.notEqual(sampleShirtPlan.requirements.length, 26);

const clearedChest = reconcileFutureMeasurementState({
  state: setFutureMeasurementInput({
    state: chestFilled,
    requirement: chestRequirement,
    displayValue: null,
  }),
  plan: sampleShirtPlan,
});
assert.equal(isFutureMeasurementStageComplete(clearedChest), false);
assert.equal(isFutureSummaryUnlockedByMeasurements(clearedChest), false);
assert.ok(
  countRemainingCustomerRequiredMeasurementUnits({
    plan: sampleShirtPlan,
    state: clearedChest,
  }) > 0,
);

const unitSwitched = setFutureMeasurementUnit(chestFilled, "cm");
assert.equal(unitSwitched.unit, "cm");
assert.equal(
  unitSwitched.entered.shared.chest_bust_circumference?.valueCm,
  chestFilled.entered.shared.chest_bust_circumference?.valueCm,
);
const unitReconciled = reconcileFutureMeasurementState({
  state: unitSwitched,
  plan: sampleShirtPlan,
});
assert.equal(
  roundMeasurementDisplayValue(
    fromCanonicalCentimetres(unitReconciled.entered.shared.chest_bust_circumference!.valueCm, "cm"),
  ),
  50.8,
);
assert.equal(
  roundMeasurementDisplayValue(
    fromCanonicalCentimetres(unitReconciled.derived.shared.chest_bust_circumference!.valueCm, "cm"),
  ),
  101.6,
);
assert.equal(
  unitReconciled.derived.shared.chest_bust_circumference?.valueCm,
  getSampleClothProductionEquivalentCm(
    unitReconciled.entered.shared.chest_bust_circumference!.valueCm,
  ),
);
assert.equal(
  displayInches(unitReconciled.entered.shared.chest_bust_circumference?.valueCm),
  20,
  "Unit switch must not turn the entered width into its doubled equivalent.",
);

const cmFilled = fillDirect(
  "sample_cloth",
  shirtSelection,
  shirtGarments,
  createEmptyFutureMeasurementState("sample_cloth", "cm"),
  10,
);
const cmChest = reconcileFutureMeasurementState({
  state: setFutureMeasurementInput({
    state: cmFilled.state,
    requirement: chestRequirement,
    displayValue: 50.8,
  }),
  plan: sampleShirtPlan,
});
assert.equal(cmChest.unit, "cm");
assert.equal(cmChest.entered.shared.chest_bust_circumference?.valueCm, 50.8);
assert.equal(cmChest.derived.shared.chest_bust_circumference?.valueCm, 101.6);

for (const invalidDisplay of [0, -1, Number.NaN]) {
  const rejected = reconcileFutureMeasurementState({
    state: setFutureMeasurementInput({
      state: chestFilled,
      requirement: chestRequirement,
      displayValue: invalidDisplay,
    }),
    plan: sampleShirtPlan,
  });
  assert.equal(rejected.entered.shared.chest_bust_circumference, undefined);
  assert.equal(rejected.derived.shared.chest_bust_circumference, undefined);
}

const oneOfSample = planFor("sample_cloth", midLongShirtSelection, shirtGarments);
const sleeveGroup = [...collectRequiredAlternativeGroups(oneOfSample.requirements).values()];
assert.equal(sleeveGroup.length, 1);
assert.equal(sleeveGroup[0]?.length, 2);
assert.ok(
  sleeveGroup[0]?.every((requirement) => requirement.sampleGeometry === "length_or_opening"),
);
const oneOfFilledDirect = fillDirect("sample_cloth", midLongShirtSelection, shirtGarments);
assert.equal(isFutureMeasurementStageComplete(oneOfFilledDirect.state), true);
const bothSleeves = oneOfSample.requirements.filter(
  (requirement) =>
    requirement.measurementId === "sleeve_length_mid" ||
    requirement.measurementId === "sleeve_length_long",
);
assert.equal(bothSleeves.length, 2);

const twoShirtGarments = [
  { garmentKey: "base:shirt", garmentType: "shirt" as const },
  { garmentKey: "additional:shirt:1", garmentType: "shirt" as const },
];
const twoShirtSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};
const twoShirtSample = planMeasurementRequirements({
  route: "sample_cloth",
  garmentTypeSelection: twoShirtSelection,
  physicalGarments: twoShirtGarments,
  additionalGarmentConstructions: {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:shirt:1": construction("shirt", "shirt_std_short", "shirt_construction"),
    },
  },
});
const shirtLengths = twoShirtSample.requirements.filter(
  (requirement) => requirement.measurementId === "shirt_length_standard",
);
assert.equal(shirtLengths.length, 2);
assert.notEqual(shirtLengths[0]?.garmentKey, shirtLengths[1]?.garmentKey);
assert.equal(
  twoShirtSample.requirements.some((requirement) => requirement.measurementId === "total_height"),
  false,
);
let twoShirtState = createEmptyFutureMeasurementState("sample_cloth", "inch");
for (const requirement of twoShirtSample.requirements.filter((candidate) => candidate.directInput)) {
  const displayValue = requirement.measurementId === "shirt_length_standard"
    ? requirement.garmentKey === "base:shirt" ? 28 : 32
    : requirement.measurementId === "chest_bust_circumference"
      ? 20
      : 10;
  twoShirtState = setFutureMeasurementInput({
    state: twoShirtState,
    requirement,
    displayValue,
  });
}
const filledTwoShirtGroups = new Set<string>();
for (const members of collectRequiredAlternativeGroups(twoShirtSample.requirements).values()) {
  const first = members[0];
  if (!first) continue;
  const groupId = `${first.garmentKey}:${first.alternativeGroup}`;
  if (filledTwoShirtGroups.has(groupId)) continue;
  filledTwoShirtGroups.add(groupId);
  twoShirtState = setFutureMeasurementInput({
    state: twoShirtState,
    requirement: first,
    displayValue: 10,
  });
}
twoShirtState = reconcileFutureMeasurementState({
  state: twoShirtState,
  plan: twoShirtSample,
});
assert.equal(
  displayInches(twoShirtState.entered.byGarmentKey["base:shirt"]?.shirt_length_standard?.valueCm),
  28,
);
assert.equal(
  displayInches(twoShirtState.entered.byGarmentKey["additional:shirt:1"]?.shirt_length_standard?.valueCm),
  32,
);
assert.equal(twoShirtState.derived.byGarmentKey["base:shirt"]?.shirt_length_standard, undefined);
assert.equal(twoShirtState.derived.byGarmentKey["additional:shirt:1"]?.shirt_length_standard, undefined);
assert.equal(displayInches(twoShirtState.entered.shared.chest_bust_circumference?.valueCm), 20);
assert.equal(displayInches(twoShirtState.derived.shared.chest_bust_circumference?.valueCm), 40);
assert.equal(twoShirtState.derived.byGarmentKey["base:shirt"]?.chest_bust_circumference, undefined);

const oldThreeRoute = normalizeFutureMeasurementState({
  schemaVersion: 1,
  route: "low_risk",
  unit: "inch",
  entered: lowFilled.state.entered,
  derived: { shared: {}, byGarmentKey: {} },
  blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
  formulaVersion: null,
  inputFingerprint: "",
  calculationStatus: "complete",
  diagnostics: [],
  invalidInputKeys: [],
});
assert.equal(oldThreeRoute?.route, "low_risk");
assert.equal(isFutureMeasurementEnteredBagEmpty(oldThreeRoute?.enteredByRoute?.sample_cloth), true);
assert.equal(isFutureMeasurementEnteredBagEmpty(oldThreeRoute?.enteredByRoute?.critical_risk), true);
assert.deepEqual(oldThreeRoute?.enteredByRoute?.low_risk, lowFilled.state.entered);

const oldFourRoute = normalizeFutureMeasurementState({
  schemaVersion: 1,
  route: "medium_risk",
  unit: "cm",
  entered: { shared: { total_height: { valueCm: 180, provenance: "customer_entered" } }, byGarmentKey: {} },
  enteredByRoute: {
    low_risk: { shared: {}, byGarmentKey: {} },
    medium_risk: { shared: { total_height: { valueCm: 180, provenance: "customer_entered" } }, byGarmentKey: {} },
    high_risk: { shared: {}, byGarmentKey: {} },
    critical_risk: { shared: {}, byGarmentKey: {} },
  },
  derived: { shared: {}, byGarmentKey: {} },
  blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
  formulaVersion: null,
  inputFingerprint: "",
  calculationStatus: "incomplete",
  diagnostics: [],
  invalidInputKeys: [],
});
assert.equal(oldFourRoute?.route, "medium_risk");
assert.equal(oldFourRoute?.entered.shared.total_height?.valueCm, 180);
assert.equal(isFutureMeasurementEnteredBagEmpty(oldFourRoute?.enteredByRoute?.sample_cloth), true);

const restoredSampleDraft = normalizeFutureMeasurementState({
  schemaVersion: 1,
  route: "sample_cloth",
  unit: "inch",
  entered: chestFilled.entered,
  enteredByRoute: chestFilled.enteredByRoute,
  derived: chestFilled.derived,
  blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
  formulaVersion: null,
  inputFingerprint: "",
  calculationStatus: "complete",
  diagnostics: [],
  invalidInputKeys: [],
});
assert.equal(restoredSampleDraft?.route, "sample_cloth");
assert.deepEqual(restoredSampleDraft?.entered, chestFilled.entered);
const restoredSampleReconciled = reconcileFutureMeasurementState({
  state: restoredSampleDraft!,
  plan: sampleShirtPlan,
});
assert.equal(isFutureMeasurementStageComplete(restoredSampleReconciled), true);
assert.equal(isFutureMeasurementSelectedPathInputComplete(restoredSampleReconciled), true);
assert.equal(displayInches(restoredSampleReconciled.derived.shared.chest_bust_circumference?.valueCm), 40);

assert.equal(
  normalizeFutureMeasurementState({
    schemaVersion: 1,
    route: "sample_cloth",
    unit: "inch",
    entered: { shared: {}, byGarmentKey: {} },
    enteredByRoute: {
      low_risk: { shared: {}, byGarmentKey: {} },
      medium_risk: { shared: {}, byGarmentKey: {} },
      high_risk: { shared: {}, byGarmentKey: {} },
      critical_risk: { shared: {}, byGarmentKey: {} },
      sample_cloth: "malformed",
    },
    derived: { shared: {}, byGarmentKey: {} },
    blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
    formulaVersion: null,
    inputFingerprint: "",
    calculationStatus: "complete",
    diagnostics: [],
    invalidInputKeys: [],
  }),
  null,
  "Malformed present Sample state must not become valid empty state.",
);

assert.equal(
  normalizeFutureMeasurementState({
    schemaVersion: 1,
    route: "not_a_method",
    unit: "inch",
    entered: { shared: {}, byGarmentKey: {} },
    derived: { shared: {}, byGarmentKey: {} },
  }),
  null,
);

assert.equal(
  classifyFutureMeasurementHydration(undefined).status,
  "absent",
);
assert.equal(
  classifyFutureMeasurementHydration(createEmptyFutureMeasurementState()).status,
  "valid",
);
assert.equal(classifyFutureMeasurementHydration(null).status, "invalid");
assert.equal(classifyFutureMeasurementHydration(oldThreeRoute).status, "valid");
assert.equal(classifyFutureMeasurementHydration(oldFourRoute).status, "valid");
assert.equal(classifyFutureMeasurementHydration(chestFilled).status, "valid");
const malformedSampleHydration = classifyFutureMeasurementHydration({
  schemaVersion: 1,
  route: "sample_cloth",
  unit: "inch",
  entered: { shared: {}, byGarmentKey: {} },
  enteredByRoute: {
    low_risk: { shared: {}, byGarmentKey: {} },
    medium_risk: { shared: {}, byGarmentKey: {} },
    high_risk: { shared: {}, byGarmentKey: {} },
    critical_risk: { shared: {}, byGarmentKey: {} },
    sample_cloth: "malformed",
  },
  derived: { shared: {}, byGarmentKey: {} },
});
assert.equal(malformedSampleHydration.status, "invalid");
if (malformedSampleHydration.status === "invalid") {
  assert.equal(
    (malformedSampleHydration.preservedRaw as { enteredByRoute: { sample_cloth: string } })
      .enteredByRoute.sample_cloth,
    "malformed",
  );
  const emptyReplacement = createEmptyFutureMeasurementState();
  assert.deepEqual(
    resolvePersistedFutureMeasurementState({
      hydration: malformedSampleHydration,
      reconciled: emptyReplacement,
    }),
    malformedSampleHydration.preservedRaw,
  );
}
const malformedLowHydration = classifyFutureMeasurementHydration({
  schemaVersion: 1,
  route: "low_risk",
  unit: "inch",
  entered: { shared: {}, byGarmentKey: {} },
  enteredByRoute: {
    low_risk: "malformed",
    medium_risk: { shared: {}, byGarmentKey: {} },
    high_risk: { shared: {}, byGarmentKey: {} },
    critical_risk: { shared: {}, byGarmentKey: {} },
    sample_cloth: { shared: {}, byGarmentKey: {} },
  },
  derived: { shared: {}, byGarmentKey: {} },
});
assert.equal(malformedLowHydration.status, "invalid");

console.log("PASS: sample cloth laid-flat field policy, 2x conversion, isolation, and draft compatibility");
