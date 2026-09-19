import assert from "node:assert/strict";
import {
  MEASUREMENT_BLUEPRINT_VERSION,
  MEASUREMENT_FORMULA_VERSION,
  getMeasurementProfileField,
} from "./src/config/MeasurementBlueprintConfig";
import type {
  CustomDetailSelectionGroup,
  GarmentTypeStepSelection,
  MeasurementRiskRoute,
} from "./src/types";
import {
  countRemainingCustomerRequiredMeasurementUnits,
  createEmptyFutureMeasurementState,
  isFutureSummaryUnlockedByMeasurements,
  normalizeFutureMeasurementState,
  planMeasurementRequirements,
  projectMeasurementRequirementsForPresentation,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
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

const shirtSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};
const dressSelection: GarmentTypeStepSelection = {
  garmentTypes: ["dress"],
  demographic: "female",
  constructionByGarment: {
    dress: construction("dress", "dress_std_short", "dress_construction"),
  },
};
const shirtOccurrences = [
  { garmentKey: "base:shirt" as const, garmentType: "shirt" as const },
  { garmentKey: "additional:shirt:1" as const, garmentType: "shirt" as const },
];

assert.equal(MEASUREMENT_BLUEPRINT_VERSION, "measurements-steps-website-v1@8b59ab07");
assert.equal(MEASUREMENT_FORMULA_VERSION, "height-average-factor-v1");
assert.equal(
  getMeasurementProfileField("A", "head_circumference")?.averageFactor,
  0.343366501291449,
);
assert.equal(
  getMeasurementProfileField("A", "chest_bust_circumference")?.averageFactor,
  0.571563968173318,
);
assert.equal(getMeasurementProfileField("E", "hip_circumference")?.averageFactor, null);
assert.equal(getMeasurementProfileField("E", "under_bust_circumference")?.averageFactor, null);
assert.equal(
  getMeasurementProfileField("E", "shoulder_to_under_bust_length")?.averageFactor,
  null,
);

const ROUTES: MeasurementRiskRoute[] = ["low_risk", "medium_risk", "high_risk"];
for (const route of ROUTES) {
  const plan = planMeasurementRequirements({
    route,
    garmentTypeSelection: shirtSelection,
    physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
  });
  const presented = projectMeasurementRequirementsForPresentation({
    requirements: plan.requirements,
  });
  assert.equal(
    presented[0]?.measurementId,
    "total_height",
    `Total Height renders first on ${route}.`,
  );
  assert.equal(
    plan.requirements.some((requirement) =>
      requirement.measurementId === "total_height" && requirement.directInput,
    ),
    true,
    `Total Height is required on ${route}.`,
  );
}

const lowPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
});
for (const requirement of lowPlan.requirements) {
  if (requirement.averageFactor === null) continue;
  assert.equal(
    requirement.inputSource,
    "route_marker",
    `${requirement.measurementId} stays a Low Risk manual marker.`,
  );
  assert.notEqual(requirement.inputSource, "calculated_average_factor");
}

const dressLowPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: dressSelection,
  physicalGarments: [{ garmentKey: "base:dress", garmentType: "dress" }],
});
for (const measurementId of [
  "hip_circumference",
  "under_bust_circumference",
  "shoulder_to_under_bust_length",
] as const) {
  const requirement = dressLowPlan.requirements.find(
    (candidate) => candidate.measurementId === measurementId,
  );
  assert.ok(requirement, `${measurementId} remains planned.`);
  assert.equal(requirement.inputSource, "optional_manual");
  assert.equal(requirement.averageFactor, null);
}

const highPlan = planMeasurementRequirements({
  route: "high_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
});
const highRequiredIds = highPlan.requirements
  .filter((requirement) => requirement.directInput)
  .map((requirement) => requirement.measurementId)
  .sort();
assert.deepEqual(highRequiredIds, [
  "belly_circumference",
  "chest_bust_circumference",
  "total_height",
]);
const presentedHighRequired = projectMeasurementRequirementsForPresentation({
  requirements: highPlan.requirements,
}).filter((requirement) => requirement.section === "required");
assert.deepEqual(
  presentedHighRequired.map((requirement) => requirement.measurementId),
  ["total_height", "chest_bust_circumference", "belly_circumference"],
);
const heightRequirement = highPlan.requirements.find(
  (requirement) => requirement.measurementId === "total_height" && requirement.directInput,
)!;
const chestRequirement = highPlan.requirements.find(
  (requirement) => requirement.measurementId === "chest_bust_circumference" && requirement.directInput,
)!;
const bellyRequirement = highPlan.requirements.find(
  (requirement) => requirement.measurementId === "belly_circumference" && requirement.directInput,
)!;
const headRequirement = highPlan.requirements.find(
  (requirement) => requirement.measurementId === "head_circumference",
)!;
assert.equal(chestRequirement.inputSource, "route_marker");
assert.equal(bellyRequirement.inputSource, "route_marker");
assert.equal(headRequirement.inputSource, "calculated_average_factor");
assert.equal(chestRequirement.manualValueKey, "shared:chest_bust_circumference");
assert.equal(bellyRequirement.manualValueKey, "shared:belly_circumference");

const fillHighManual = (
  state: ReturnType<typeof createEmptyFutureMeasurementState>,
  values: Partial<Record<"total_height" | "chest_bust_circumference" | "belly_circumference", number | null>>,
) => {
  let next = state;
  const byId = {
    total_height: heightRequirement,
    chest_bust_circumference: chestRequirement,
    belly_circumference: bellyRequirement,
  } as const;
  for (const [measurementId, displayValue] of Object.entries(values) as Array<
    [keyof typeof byId, number | null]
  >) {
    next = setFutureMeasurementInput({
      state: next,
      requirement: byId[measurementId],
      displayValue,
    });
  }
  return reconcileFutureMeasurementState({ state: next, plan: highPlan });
};

let highState = reconcileFutureMeasurementState({
  state: createEmptyFutureMeasurementState("high_risk", "cm"),
  plan: highPlan,
});
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({ plan: highPlan, state: highState }),
  3,
);
highState = fillHighManual(highState, { total_height: 180 });
assert.equal(isFutureSummaryUnlockedByMeasurements(highState), false);
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({ plan: highPlan, state: highState }),
  2,
);
assert.equal(highState.derived.byGarmentKey["base:shirt"]?.head_circumference, undefined);
assert.equal(highState.derived.byGarmentKey["base:shirt"]?.chest_bust_circumference, undefined);

highState = fillHighManual(highState, { chest_bust_circumference: 90 });
assert.equal(isFutureSummaryUnlockedByMeasurements(highState), false);
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({ plan: highPlan, state: highState }),
  1,
);

highState = fillHighManual(highState, { belly_circumference: 80 });
assert.equal(isFutureSummaryUnlockedByMeasurements(highState), true);
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({ plan: highPlan, state: highState }),
  0,
);
assert.equal(
  highState.derived.byGarmentKey["base:shirt"]?.head_circumference?.valueCm,
  calculateMeasurementFromAverageFactor(180, headRequirement.averageFactor!),
);
assert.equal(
  highState.derived.byGarmentKey["base:shirt"]?.chest_bust_circumference,
  undefined,
  "Approved chest factor must not replace the High Risk YES, PROVIDE manual.",
);
assert.equal(highState.entered.shared.chest_bust_circumference?.provenance, "customer_entered");
assert.equal(highState.entered.shared.belly_circumference?.provenance, "customer_entered");

highState = setFutureMeasurementInput({
  state: highState,
  requirement: heightRequirement,
  displayValue: 170,
});
highState = reconcileFutureMeasurementState({ state: highState, plan: highPlan });
assert.equal(
  highState.derived.byGarmentKey["base:shirt"]?.head_circumference?.valueCm,
  calculateMeasurementFromAverageFactor(170, headRequirement.averageFactor!),
);

const restored = reconcileFutureMeasurementState({
  state: normalizeFutureMeasurementState(JSON.parse(JSON.stringify(highState)))!,
  plan: highPlan,
});
assert.equal(
  restored.derived.byGarmentKey["base:shirt"]?.head_circumference?.valueCm,
  calculateMeasurementFromAverageFactor(170, headRequirement.averageFactor!),
);

highState = setFutureMeasurementInput({
  state: highState,
  requirement: heightRequirement,
  displayValue: null,
});
highState = reconcileFutureMeasurementState({ state: highState, plan: highPlan });
assert.equal(highState.entered.shared.total_height, undefined);
assert.equal(highState.derived.byGarmentKey["base:shirt"]?.head_circumference, undefined);
assert.equal(isFutureSummaryUnlockedByMeasurements(highState), false);

highState = fillHighManual(highState, { total_height: 180, chest_bust_circumference: 90, belly_circumference: 80 });
highState = fillHighManual(highState, { chest_bust_circumference: null });
assert.equal(isFutureSummaryUnlockedByMeasurements(highState), false);
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({ plan: highPlan, state: highState }),
  1,
);

highState = setFutureMeasurementInput({
  state: highState,
  requirement: heightRequirement,
  displayValue: 0,
});
highState = reconcileFutureMeasurementState({ state: highState, plan: highPlan });
assert.equal(isFutureSummaryUnlockedByMeasurements(highState), false);

const dressHighPlan = planMeasurementRequirements({
  route: "high_risk",
  garmentTypeSelection: dressSelection,
  physicalGarments: [{ garmentKey: "base:dress", garmentType: "dress" }],
});
assert.deepEqual(
  dressHighPlan.requirements
    .filter((requirement) => requirement.directInput)
    .map((requirement) => requirement.measurementId)
    .sort(),
  ["belly_circumference", "chest_bust_circumference", "total_height"],
);
const dressHeight = dressHighPlan.requirements.find(
  (requirement) => requirement.measurementId === "total_height" && requirement.directInput,
)!;
const dressChest = dressHighPlan.requirements.find(
  (requirement) => requirement.measurementId === "chest_bust_circumference" && requirement.directInput,
)!;
const dressBelly = dressHighPlan.requirements.find(
  (requirement) => requirement.measurementId === "belly_circumference" && requirement.directInput,
)!;
let dressHighState = setFutureMeasurementInput({
  state: createEmptyFutureMeasurementState("high_risk", "cm"),
  requirement: dressHeight,
  displayValue: 180,
});
dressHighState = reconcileFutureMeasurementState({
  state: dressHighState,
  plan: dressHighPlan,
});
assert.equal(isFutureSummaryUnlockedByMeasurements(dressHighState), false);
dressHighState = setFutureMeasurementInput({
  state: dressHighState,
  requirement: dressChest,
  displayValue: 90,
});
dressHighState = setFutureMeasurementInput({
  state: dressHighState,
  requirement: dressBelly,
  displayValue: 80,
});
dressHighState = reconcileFutureMeasurementState({
  state: dressHighState,
  plan: dressHighPlan,
});
assert.equal(isFutureSummaryUnlockedByMeasurements(dressHighState), true);
for (const measurementId of [
  "hip_circumference",
  "under_bust_circumference",
  "shoulder_to_under_bust_length",
] as const) {
  const requirement = dressHighPlan.requirements.find(
    (candidate) => candidate.measurementId === measurementId,
  );
  assert.equal(requirement?.inputSource, "optional_manual");
  assert.equal(
    dressHighState.derived.byGarmentKey["base:dress"]?.[measurementId],
    undefined,
    `${measurementId} has no invented High Risk calculation.`,
  );
}

const repeatedPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments: shirtOccurrences,
  additionalGarmentConstructions: {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:shirt:1": construction("shirt", "shirt_std_short", "shirt_construction"),
    },
  },
});
const presentedRepeated = projectMeasurementRequirementsForPresentation({
  requirements: repeatedPlan.requirements,
});
assert.equal(
  presentedRepeated.filter((requirement) => requirement.measurementId === "total_height").length,
  1,
);
assert.equal(presentedRepeated[0]?.measurementId, "total_height");
assert.deepEqual(
  [...new Set(
    repeatedPlan.requirements
      .filter((requirement) => requirement.measurementId === "shirt_length_standard")
      .map((requirement) => requirement.garmentKey),
  )].sort(),
  ["additional:shirt:1", "base:shirt"],
);

console.log("PASS: measurement height-first presentation, required height, and approved-factor reuse");
