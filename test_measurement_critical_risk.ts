import assert from "node:assert/strict";
import {
  MEASUREMENT_FORMULA_VERSION,
  MEASUREMENT_PROFILES,
  getMeasurementProfileField,
  getRequiredMeasurementIdsForRoute,
} from "./src/config/MeasurementBlueprintConfig";
import type {
  AdditionalGarmentConstructionStateV1,
  CustomDetailSelectionGroup,
  GarmentTypeStepSelection,
} from "./src/types";
import {
  countRemainingCustomerRequiredMeasurementUnits,
  createEmptyFutureMeasurementState,
  isCriticalRiskCompleteSetCalculable,
  isCriticalRiskSupportedForSelection,
  isFutureSummaryUnlockedByMeasurements,
  isSelectedMeasurementRiskRoute,
  normalizeFutureMeasurementState,
  planMeasurementRequirements,
  projectMeasurementRequirementsForPresentation,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  setFutureMeasurementRoute,
} from "./src/utils/measurementBlueprint";
import { calculateMeasurementFromAverageFactor } from "./src/utils/measurementFactorEngine";

const construction = (
  garmentType: keyof GarmentTypeStepSelection["constructionByGarment"],
  optionId: string,
  selectionGroup: CustomDetailSelectionGroup,
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

const selectionFor = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: NonNullable<GarmentTypeStepSelection["demographic"]>,
  constructionByGarment: GarmentTypeStepSelection["constructionByGarment"],
): GarmentTypeStepSelection => ({
  garmentTypes,
  demographic,
  constructionByGarment,
});

const shirtA = selectionFor(["shirt"], "male", {
  shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
});
const shirtB = selectionFor(["shirt"], "male", {
  shirt: construction("shirt", "shirt_std_midlong", "shirt_construction"),
});
const shirtC = selectionFor(["shirt"], "male", {
  shirt: construction("shirt", "shirt_long_short", "shirt_construction"),
});
const shirtD = selectionFor(["shirt"], "male", {
  shirt: construction("shirt", "shirt_long_midlong", "shirt_construction"),
});
const dressE = selectionFor(["dress"], "female", {
  dress: construction("dress", "dress_std_short", "dress_construction"),
});
const dressF = selectionFor(["dress"], "female", {
  dress: construction("dress", "dress_std_midlong", "dress_construction"),
});
const dressG = selectionFor(["dress"], "female", {
  dress: construction("dress", "dress_long_short", "dress_construction"),
});
const dressH = selectionFor(["dress"], "female", {
  dress: construction("dress", "dress_long_midlong", "dress_construction"),
});
const trouserI = selectionFor(["trouser"], "male", {
  trouser: construction("trouser", "trouser_rope", "trouser_fastening"),
});
const nikkaJ = selectionFor(["standard_shorts"], "male", {
  standard_shorts: construction("standard_shorts", "shorts_zip", "standard_shorts_fastening"),
});
const bumK = selectionFor(["bum_shorts"], "female", {
  bum_shorts: construction("bum_shorts", "bum_rope", "bum_shorts_fastening"),
});
const skirtL = selectionFor(["skirt"], "female", {
  skirt: construction("skirt", "skirt_std", "skirt_length"),
});
const skirtM = selectionFor(["skirt"], "female", {
  skirt: construction("skirt", "skirt_long", "skirt_length"),
});
const shirtAndNikka = selectionFor(["shirt", "standard_shorts"], "male", {
  shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  standard_shorts: construction("standard_shorts", "shorts_zip", "standard_shorts_fastening"),
});
const shirtAndTrouser = selectionFor(["shirt", "trouser"], "male", {
  shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  trouser: construction("trouser", "trouser_rope", "trouser_fastening"),
});

const garment = (garmentKey: string, garmentType: GarmentTypeStepSelection["garmentTypes"][number]) => ({
  garmentKey,
  garmentType,
});

const additionalConstruction = (
  garmentKey: string,
  garmentType: keyof GarmentTypeStepSelection["constructionByGarment"],
  optionId: string,
  selectionGroup: CustomDetailSelectionGroup,
): AdditionalGarmentConstructionStateV1 => ({
  schemaVersion: 1,
  byGarmentKey: {
    [garmentKey]: construction(garmentType, optionId, selectionGroup),
  },
});

assert.equal(MEASUREMENT_FORMULA_VERSION, "height-average-factor-v1");
assert.equal(isSelectedMeasurementRiskRoute("critical_risk"), true);
assert.deepEqual(getRequiredMeasurementIdsForRoute("A", "critical_risk"), ["total_height"]);
assert.equal(getMeasurementProfileField("A", "chest_bust_circumference")?.averageFactor, 0.571563968173318);

const profileById = Object.fromEntries(
  MEASUREMENT_PROFILES.map((profile) => [profile.id, profile]),
);

assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.A,
    constructionOptionId: "shirt_std_short",
  }),
  true,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.B,
    constructionOptionId: "shirt_std_midlong",
  }),
  false,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.C,
    constructionOptionId: "shirt_long_short",
  }),
  true,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.D,
    constructionOptionId: "shirt_long_midlong",
  }),
  true,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.D,
    constructionOptionId: null,
  }),
  false,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: {
      ...profileById.D,
      alternativeSelectionByConstructionId: {
        shirt_long_midlong: "sleeve_length_mid",
      },
    },
    constructionOptionId: "shirt_long_midlong",
  }),
  false,
  "Resolved Mid Sleeve still cannot be Critical Risk without an approved factor.",
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.E,
    constructionOptionId: "dress_std_short",
  }),
  false,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.F,
    constructionOptionId: "dress_std_midlong",
  }),
  false,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.G,
    constructionOptionId: "dress_long_short",
  }),
  false,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.H,
    constructionOptionId: "dress_long_midlong",
  }),
  false,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.I,
    constructionOptionId: null,
  }),
  false,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.J,
    constructionOptionId: null,
  }),
  true,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.K,
    constructionOptionId: null,
  }),
  false,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.L,
    constructionOptionId: "skirt_std",
  }),
  false,
);
assert.equal(
  isCriticalRiskCompleteSetCalculable({
    profile: profileById.M,
    constructionOptionId: "skirt_long",
  }),
  false,
);

const support = (
  garmentTypeSelection: GarmentTypeStepSelection,
  physicalGarments: Array<{ garmentKey: string; garmentType: GarmentTypeStepSelection["garmentTypes"][number] }>,
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1,
) =>
  isCriticalRiskSupportedForSelection({
    garmentTypeSelection,
    physicalGarments,
    additionalGarmentConstructions,
  });

assert.equal(support(shirtA, [garment("base:shirt", "shirt")]), true);
assert.equal(support(shirtB, [garment("base:shirt", "shirt")]), false);
assert.equal(support(shirtC, [garment("base:shirt", "shirt")]), true);
assert.equal(support(shirtD, [garment("base:shirt", "shirt")]), true);
assert.equal(support(dressE, [garment("base:dress", "dress")]), false);
assert.equal(support(dressF, [garment("base:dress", "dress")]), false);
assert.equal(support(dressG, [garment("base:dress", "dress")]), false);
assert.equal(support(dressH, [garment("base:dress", "dress")]), false);
assert.equal(support(trouserI, [garment("base:trouser", "trouser")]), false);
assert.equal(support(nikkaJ, [garment("base:standard_shorts", "standard_shorts")]), true);
assert.equal(support(bumK, [garment("base:bum_shorts", "bum_shorts")]), false);
assert.equal(support(skirtL, [garment("base:skirt", "skirt")]), false);
assert.equal(support(skirtM, [garment("base:skirt", "skirt")]), false);
assert.equal(
  support(shirtAndNikka, [
    garment("base:shirt", "shirt"),
    garment("base:standard_shorts", "standard_shorts"),
  ]),
  true,
);
assert.equal(
  support(shirtAndTrouser, [
    garment("base:shirt", "shirt"),
    garment("base:trouser", "trouser"),
  ]),
  false,
);
assert.equal(
  support(
    shirtA,
    [
      garment("base:shirt", "shirt"),
      garment("additional:shirt:1", "shirt"),
    ],
    additionalConstruction("additional:shirt:1", "shirt", "shirt_std_short", "shirt_construction"),
  ),
  true,
);
assert.equal(
  support(
    shirtA,
    [
      garment("base:shirt", "shirt"),
      garment("additional:trouser:1", "trouser"),
    ],
    additionalConstruction("additional:trouser:1", "trouser", "trouser_rope", "trouser_fastening"),
  ),
  false,
);

const planCritical = (
  garmentTypeSelection: GarmentTypeStepSelection,
  physicalGarments: Array<{ garmentKey: string; garmentType: GarmentTypeStepSelection["garmentTypes"][number] }>,
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1,
) =>
  planMeasurementRequirements({
    route: "critical_risk",
    garmentTypeSelection,
    physicalGarments,
    additionalGarmentConstructions,
  });

const supportedPlan = planCritical(shirtA, [garment("base:shirt", "shirt")]);
assert.equal(supportedPlan.criticalRiskSupported, true);
assert.equal(supportedPlan.canCalculate, true);
const supportedDirect = supportedPlan.requirements.filter((requirement) => requirement.directInput);
assert.deepEqual(
  supportedDirect.map((requirement) => requirement.measurementId),
  ["total_height"],
);
assert.equal(supportedDirect[0]?.manualValueKey, "shared:total_height");
assert.equal(
  supportedPlan.requirements.some((requirement) =>
    requirement.directInput && requirement.measurementId !== "total_height",
  ),
  false,
);
for (const requirement of supportedPlan.requirements) {
  if (requirement.measurementId === "total_height") continue;
  assert.equal(requirement.inputSource, "calculated_average_factor");
  assert.equal(requirement.directInput, false);
  assert.ok(requirement.averageFactor !== null);
}
assert.equal(
  supportedPlan.requirements.some((requirement) =>
    requirement.measurementId === "chest_bust_circumference" && requirement.directInput,
  ),
  false,
);
assert.equal(
  supportedPlan.requirements.some((requirement) =>
    requirement.measurementId === "belly_circumference" && requirement.directInput,
  ),
  false,
);
const presentedSupported = projectMeasurementRequirementsForPresentation({
  requirements: supportedPlan.requirements,
});
assert.equal(presentedSupported[0]?.measurementId, "total_height");
assert.equal(presentedSupported.filter((requirement) => requirement.section === "required").length, 1);

const heightRequirement = supportedDirect[0]!;
let state = reconcileFutureMeasurementState({
  state: createEmptyFutureMeasurementState("critical_risk", "cm"),
  plan: supportedPlan,
});
assert.equal(state.schemaVersion, 1);
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({ plan: supportedPlan, state }),
  1,
);
assert.equal(isFutureSummaryUnlockedByMeasurements(state), false);
assert.equal(state.calculationStatus, "incomplete");

state = setFutureMeasurementInput({
  state,
  requirement: heightRequirement,
  displayValue: 0,
});
state = reconcileFutureMeasurementState({ state, plan: supportedPlan });
assert.equal(isFutureSummaryUnlockedByMeasurements(state), false);

state = setFutureMeasurementInput({
  state,
  requirement: heightRequirement,
  displayValue: 180,
});
state = reconcileFutureMeasurementState({ state, plan: supportedPlan });
assert.equal(state.calculationStatus, "complete");
assert.equal(isFutureSummaryUnlockedByMeasurements(state), true);
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({ plan: supportedPlan, state }),
  0,
);
assert.equal(state.entered.shared.total_height?.provenance, "customer_entered");
assert.equal(state.entered.shared.chest_bust_circumference, undefined);
assert.equal(
  state.derived.byGarmentKey["base:shirt"]?.chest_bust_circumference?.valueCm,
  calculateMeasurementFromAverageFactor(180, getMeasurementProfileField("A", "chest_bust_circumference")!.averageFactor!),
);
assert.equal(
  state.derived.byGarmentKey["base:shirt"]?.head_circumference?.valueCm,
  calculateMeasurementFromAverageFactor(180, getMeasurementProfileField("A", "head_circumference")!.averageFactor!),
);

state = setFutureMeasurementInput({
  state,
  requirement: heightRequirement,
  displayValue: 170,
});
state = reconcileFutureMeasurementState({ state, plan: supportedPlan });
assert.equal(
  state.derived.byGarmentKey["base:shirt"]?.chest_bust_circumference?.valueCm,
  calculateMeasurementFromAverageFactor(170, getMeasurementProfileField("A", "chest_bust_circumference")!.averageFactor!),
);

state = setFutureMeasurementInput({
  state,
  requirement: heightRequirement,
  displayValue: null,
});
state = reconcileFutureMeasurementState({ state, plan: supportedPlan });
assert.equal(state.entered.shared.total_height, undefined);
assert.equal(state.derived.byGarmentKey["base:shirt"]?.chest_bust_circumference, undefined);
assert.equal(isFutureSummaryUnlockedByMeasurements(state), false);

const restored = reconcileFutureMeasurementState({
  state: normalizeFutureMeasurementState(JSON.parse(JSON.stringify(
    setFutureMeasurementInput({
      state: createEmptyFutureMeasurementState("critical_risk", "cm"),
      requirement: heightRequirement,
      displayValue: 180,
    }),
  )))!,
  plan: supportedPlan,
});
assert.equal(restored.route, "critical_risk");
assert.equal(restored.calculationStatus, "complete");
assert.equal(
  restored.derived.byGarmentKey["base:shirt"]?.chest_bust_circumference?.valueCm,
  calculateMeasurementFromAverageFactor(180, getMeasurementProfileField("A", "chest_bust_circumference")!.averageFactor!),
);

const lowUnchanged = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: shirtA,
  physicalGarments: [garment("base:shirt", "shirt")],
});
assert.ok(lowUnchanged.requirements.filter((requirement) => requirement.directInput).length > 1);
assert.equal(
  lowUnchanged.requirements.some((requirement) =>
    requirement.measurementId === "chest_bust_circumference" && requirement.directInput,
  ),
  true,
);
const highUnchanged = planMeasurementRequirements({
  route: "high_risk",
  garmentTypeSelection: shirtA,
  physicalGarments: [garment("base:shirt", "shirt")],
});
assert.deepEqual(
  highUnchanged.requirements.filter((requirement) => requirement.directInput).map((requirement) => requirement.measurementId).sort(),
  ["belly_circumference", "chest_bust_circumference", "total_height"],
);

const mixedPlan = planCritical(shirtAndNikka, [
  garment("base:shirt", "shirt"),
  garment("base:standard_shorts", "standard_shorts"),
]);
assert.equal(mixedPlan.criticalRiskSupported, true);
assert.deepEqual(
  [...new Set(
    mixedPlan.requirements
      .filter((requirement) => requirement.directInput)
      .map((requirement) => requirement.manualValueKey),
  )],
  ["shared:total_height"],
);
assert.equal(
  mixedPlan.requirements.filter((requirement) => requirement.directInput).length,
  2,
);
let mixedState = reconcileFutureMeasurementState({
  state: createEmptyFutureMeasurementState("critical_risk", "cm"),
  plan: mixedPlan,
});
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({ plan: mixedPlan, state: mixedState }),
  1,
);
mixedState = setFutureMeasurementInput({
  state: mixedState,
  requirement: mixedPlan.requirements.find((requirement) => requirement.directInput)!,
  displayValue: 180,
});
mixedState = reconcileFutureMeasurementState({ state: mixedState, plan: mixedPlan });
assert.equal(mixedState.calculationStatus, "complete");
assert.ok(mixedState.derived.byGarmentKey["base:shirt"]?.chest_bust_circumference);
assert.ok(mixedState.derived.byGarmentKey["base:standard_shorts"]?.waist_circumference);
assert.equal(
  mixedState.derived.byGarmentKey["base:shirt"]?.waist_circumference,
  undefined,
);

const additionalSupportedPlan = planCritical(
  shirtA,
  [
    garment("base:shirt", "shirt"),
    garment("additional:shirt:1", "shirt"),
  ],
  additionalConstruction("additional:shirt:1", "shirt", "shirt_std_short", "shirt_construction"),
);
assert.equal(additionalSupportedPlan.criticalRiskSupported, true);
assert.equal(
  additionalSupportedPlan.requirements.filter((requirement) =>
    requirement.garmentKey === "additional:shirt:1" &&
    requirement.inputSource === "calculated_average_factor",
  ).length > 0,
  true,
);
assert.deepEqual(
  [...new Set(additionalSupportedPlan.requirements.map((requirement) => requirement.garmentKey))].sort(),
  ["additional:shirt:1", "base:shirt"],
);

const unsupportedPlan = planCritical(trouserI, [garment("base:trouser", "trouser")]);
assert.equal(unsupportedPlan.criticalRiskSupported, false);
assert.equal(unsupportedPlan.canCalculate, false);
assert.equal(unsupportedPlan.requirements.length, 0);
assert.ok(
  unsupportedPlan.diagnostics.some((diagnostic) => diagnostic.code === "calculation_configuration_pending"),
);
let unsupportedState = reconcileFutureMeasurementState({
  state: createEmptyFutureMeasurementState("critical_risk", "cm"),
  plan: unsupportedPlan,
});
assert.equal(unsupportedState.calculationStatus, "incomplete");
assert.equal(isFutureSummaryUnlockedByMeasurements(unsupportedState), false);

const staleCritical = normalizeFutureMeasurementState({
  schemaVersion: 1,
  route: "critical_risk",
  unit: "cm",
  entered: {
    shared: {
      total_height: { valueCm: 180, provenance: "customer_entered" },
    },
    byGarmentKey: {},
  },
  enteredByRoute: {
    low_risk: { shared: {}, byGarmentKey: {} },
    medium_risk: { shared: {}, byGarmentKey: {} },
    high_risk: { shared: {}, byGarmentKey: {} },
    critical_risk: {
      shared: {
        total_height: { valueCm: 180, provenance: "customer_entered" },
      },
      byGarmentKey: {},
    },
  },
  derived: { shared: {}, byGarmentKey: {} },
  blueprintVersion: "x",
  formulaVersion: MEASUREMENT_FORMULA_VERSION,
  inputFingerprint: "",
  calculationStatus: "complete",
  diagnostics: [],
  invalidInputKeys: [],
});
assert.ok(staleCritical);
const restoredUnsupported = reconcileFutureMeasurementState({
  state: staleCritical!,
  plan: unsupportedPlan,
});
assert.equal(restoredUnsupported.route, "critical_risk");
assert.equal(restoredUnsupported.calculationStatus, "incomplete");
assert.equal(isFutureSummaryUnlockedByMeasurements(restoredUnsupported), false);

const lowDraft = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: shirtA,
  physicalGarments: [garment("base:shirt", "shirt")],
});
let lowState = createEmptyFutureMeasurementState("low_risk", "cm");
for (const requirement of lowDraft.requirements.filter((item) => item.directInput)) {
  lowState = setFutureMeasurementInput({
    state: lowState,
    requirement,
    displayValue: 20,
  });
}
lowState = reconcileFutureMeasurementState({ state: lowState, plan: lowDraft });
const restoredLow = reconcileFutureMeasurementState({
  state: normalizeFutureMeasurementState(JSON.parse(JSON.stringify(lowState)))!,
  plan: lowDraft,
});
assert.equal(restoredLow.route, "low_risk");
assert.equal(restoredLow.calculationStatus, "complete");

assert.equal(normalizeFutureMeasurementState({
  schemaVersion: 1,
  route: "not_a_route",
  unit: "cm",
  entered: { shared: {}, byGarmentKey: {} },
  derived: { shared: {}, byGarmentKey: {} },
}), null);

const switched = setFutureMeasurementRoute(lowState, "critical_risk");
assert.equal(switched.route, "critical_risk");
assert.ok(switched.enteredByRoute?.low_risk);
assert.ok(switched.enteredByRoute?.critical_risk);

console.log("PASS: measurement critical risk supported-profile authority");
