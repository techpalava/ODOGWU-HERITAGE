import assert from "node:assert/strict";
import type {
  CanonicalPhysicalGarmentType,
  CustomDetailSelectionGroup,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  MeasurementRiskRoute,
} from "./src/types";
import type { MeasurementProfileId } from "./src/config/MeasurementBlueprintConfig";
import { getMeasurementProfileField } from "./src/config/MeasurementBlueprintConfig";
import {
  centimetresToInches,
  createEmptyFutureMeasurementState,
  isFutureMeasurementSelectedPathInputComplete,
  isFutureMeasurementStageComplete,
  isFutureSummaryUnlockedByMeasurements,
  planMeasurementRequirements,
  projectActiveFutureMeasurementState,
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

const PROFILE_FIXTURES: Record<
  MeasurementProfileId,
  {
    garmentType: CanonicalPhysicalGarmentType;
    garmentKey: string;
    optionId?: string;
    selectionGroup?: CustomDetailSelectionGroup;
    demographic: "male" | "female";
  }
> = {
  A: { garmentType: "shirt", garmentKey: "shirt:1", optionId: "shirt_std_short", selectionGroup: "shirt_construction", demographic: "male" },
  B: { garmentType: "shirt", garmentKey: "shirt:1", optionId: "shirt_std_midlong", selectionGroup: "shirt_construction", demographic: "male" },
  C: { garmentType: "shirt", garmentKey: "shirt:1", optionId: "shirt_long_short", selectionGroup: "shirt_construction", demographic: "male" },
  D: { garmentType: "shirt", garmentKey: "shirt:1", optionId: "shirt_long_midlong", selectionGroup: "shirt_construction", demographic: "male" },
  E: { garmentType: "dress", garmentKey: "dress:1", optionId: "dress_std_short", selectionGroup: "dress_construction", demographic: "female" },
  F: { garmentType: "dress", garmentKey: "dress:1", optionId: "dress_std_midlong", selectionGroup: "dress_construction", demographic: "female" },
  G: { garmentType: "dress", garmentKey: "dress:1", optionId: "dress_long_short", selectionGroup: "dress_construction", demographic: "female" },
  H: { garmentType: "dress", garmentKey: "dress:1", optionId: "dress_long_midlong", selectionGroup: "dress_construction", demographic: "female" },
  I: { garmentType: "trouser", garmentKey: "trouser:1", demographic: "male" },
  J: { garmentType: "standard_shorts", garmentKey: "standard_shorts:1", demographic: "male" },
  K: { garmentType: "bum_shorts", garmentKey: "bum_shorts:1", demographic: "female" },
  L: { garmentType: "skirt", garmentKey: "skirt:1", optionId: "skirt_std", selectionGroup: "skirt_length", demographic: "female" },
  M: { garmentType: "skirt", garmentKey: "skirt:1", optionId: "skirt_long", selectionGroup: "skirt_length", demographic: "female" },
};

const selectionFor = (profileId: MeasurementProfileId): {
  garmentTypeSelection: GarmentTypeStepSelection;
    physicalGarments: Array<{ garmentKey: string; garmentType: CanonicalPhysicalGarmentType }>;
} => {
  const fixture = PROFILE_FIXTURES[profileId];
  const constructionByGarment = fixture.optionId && fixture.selectionGroup
    ? {
        [fixture.garmentType]: construction(
          fixture.garmentType as keyof GarmentTypeStepSelection["constructionByGarment"],
          fixture.optionId,
          fixture.selectionGroup,
        ),
      }
    : {};
  return {
    garmentTypeSelection: {
      garmentTypes: [fixture.garmentType],
      demographic: fixture.demographic,
      constructionByGarment,
    },
    physicalGarments: [{ garmentKey: fixture.garmentKey, garmentType: fixture.garmentType }],
  };
};

const planFor = (profileId: MeasurementProfileId, route: MeasurementRiskRoute) => {
  const { garmentTypeSelection, physicalGarments } = selectionFor(profileId);
  return planMeasurementRequirements({
    route,
    garmentTypeSelection,
    physicalGarments,
  });
};

const fillRequired = (
  profileId: MeasurementProfileId,
  route: MeasurementRiskRoute,
  height = 180,
  otherValue = 90,
) => {
  const plan = planFor(profileId, route);
  let state = createEmptyFutureMeasurementState(route, "cm");
  for (const requirement of plan.requirements.filter((item) => item.directInput)) {
    state = setFutureMeasurementInput({
      state,
      requirement,
      displayValue: requirement.measurementId === "total_height" ? height : otherValue,
    });
  }
  state = reconcileFutureMeasurementState({ state, plan });
  return { state, plan };
};

const nearlyEqual = (actual: number, expected: number) => {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, received ${actual}`);
};

const derivedFor = (
  state: FutureMeasurementStateV1,
  requirement: ReturnType<typeof planFor>["requirements"][number],
) => state.derived.byGarmentKey[requirement.garmentKey]?.[requirement.measurementId];

const lowShirt = fillRequired("A", "low_risk");
assert.equal(
  lowShirt.plan.requirements.every((requirement) => requirement.section === "required"),
  true,
);
assert.equal(
  lowShirt.plan.requirements.some((requirement) => requirement.inputSource === "calculated_average_factor"),
  false,
);
assert.equal(Object.keys(lowShirt.state.derived.shared).length, 0);
assert.equal(isFutureMeasurementStageComplete(lowShirt.state), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(lowShirt.state), true);

const missingLow = reconcileFutureMeasurementState({
  state: createEmptyFutureMeasurementState("low_risk", "cm"),
  plan: lowShirt.plan,
});
assert.equal(isFutureMeasurementStageComplete(missingLow), false);
assert.equal(
  missingLow.diagnostics.some((diagnostic) => diagnostic.code === "required_measurement_missing"),
  true,
);

const dressLowPlan = planFor("E", "low_risk");
assert.equal(
  dressLowPlan.diagnostics.some((diagnostic) => diagnostic.code === "applicability_unresolved"),
  false,
  "Unproven IF APPLICABLE rows must not hide-and-block Dress Low Risk completion.",
);
assert.equal(
  dressLowPlan.requirements.some(
    (requirement) =>
      requirement.measurementId === "under_bust_circumference" &&
      !requirement.directInput &&
      requirement.section === "optional",
  ),
  true,
  "Unproven Dress IF APPLICABLE rows remain optional and enterable.",
);
const dressLowFilled = fillRequired("E", "low_risk");
assert.equal(isFutureMeasurementStageComplete(dressLowFilled.state), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(dressLowFilled.state), true);

const midLongShirtLowFilled = fillRequired("B", "low_risk");
assert.equal(isFutureMeasurementStageComplete(midLongShirtLowFilled.state), false);
assert.equal(isFutureSummaryUnlockedByMeasurements(midLongShirtLowFilled.state), false);
const midSleeve = midLongShirtLowFilled.plan.requirements.find(
  (requirement) => requirement.measurementId === "sleeve_length_mid",
);
assert.ok(midSleeve);
assert.equal(midSleeve.directInput, false);
assert.equal(midSleeve.section, "required");
assert.equal(midSleeve.alternativeGroup, "B_sleeve_length");
assert.equal(midSleeve.inputSource, "route_marker");
const midLongShirtOneSleeve = reconcileFutureMeasurementState({
  state: setFutureMeasurementInput({
    state: midLongShirtLowFilled.state,
    requirement: midSleeve,
    displayValue: 40,
  }),
  plan: midLongShirtLowFilled.plan,
});
assert.equal(isFutureMeasurementStageComplete(midLongShirtOneSleeve), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(midLongShirtOneSleeve), true);
assert.equal(
  midLongShirtLowFilled.plan.requirements.some(
    (requirement) =>
      requirement.measurementId === "sleeve_length_long" &&
      !requirement.directInput &&
      requirement.section === "required" &&
      requirement.alternativeGroup === "B_sleeve_length",
  ),
  true,
  "Unresolved sleeve alternatives stay a required one-of group, not two independent required rows.",
);

for (const profileId of ["A", "E", "I", "L"] as const) {
  const before = fillRequired(profileId, "medium_risk");
  const requiredIds = before.plan.requirements
    .filter((requirement) => requirement.section === "required")
    .map((requirement) => requirement.measurementId);
  assert.equal(
    before.plan.requirements
      .filter((requirement) => requirement.section === "required")
      .every((requirement) => requirement.directInput && requirement.inputSource === "route_marker"),
    true,
    `${profileId} Mid required stay manual`,
  );
  const calculated = before.plan.requirements.filter(
    (requirement) => requirement.inputSource === "calculated_average_factor",
  );
  assert.ok(calculated.length > 0, `${profileId} Mid has factor-backed optionals`);
  assert.equal(
    Object.keys(before.state.derived.shared).length + Object.keys(before.state.derived.byGarmentKey).length > 0,
    true,
    `${profileId} Mid derived after required complete; status=${before.state.calculationStatus}; diags=${before.state.diagnostics.map((d) => d.code).join(",")}`,
  );
  const optionalManual = before.plan.requirements.filter(
    (requirement) => requirement.inputSource === "optional_manual",
  );
  assert.equal(
    optionalManual.every((requirement) => !requirement.directInput),
    true,
  );
  const chest = calculated.find((requirement) => requirement.measurementId === "chest_bust_circumference")
    || before.plan.requirements.find((requirement) => requirement.measurementId === "head_circumference");
  const derived = chest ? derivedFor(before.state, chest) : undefined;
  if (chest?.averageFactor != null && derived) {
    nearlyEqual(
      derived.valueCm,
      calculateMeasurementFromAverageFactor(180, chest.averageFactor),
    );
    assert.equal(
      derived.provenance,
      "calculated_average_factor",
    );
    assert.equal(derived.calculation?.profileId, chest.profileId);
    assert.equal(derived.calculation?.garmentKey, chest.garmentKey);
  }
  assert.equal(isFutureSummaryUnlockedByMeasurements(before.state), true);
  assert.ok(!requiredIds.includes("under_bust_circumference"));
}

const pendingMid = reconcileFutureMeasurementState({
  state: createEmptyFutureMeasurementState("medium_risk", "cm"),
  plan: planFor("A", "medium_risk"),
});
assert.equal(Object.keys(pendingMid.derived.shared).length, 0);
assert.equal(Object.keys(pendingMid.derived.byGarmentKey).length, 0);
assert.equal(isFutureMeasurementSelectedPathInputComplete(pendingMid), false);

for (const profileId of ["A", "C", "E", "I", "K", "M"] as const) {
  const filled = fillRequired(profileId, "high_risk");
  assert.equal(isFutureMeasurementStageComplete(filled.state), true);
  assert.equal(isFutureSummaryUnlockedByMeasurements(filled.state), true);
  assert.equal(
    filled.plan.requirements
      .filter((requirement) => requirement.section === "required")
      .every((requirement) => requirement.directInput),
    true,
  );
  assert.ok(
    filled.plan.requirements.some((requirement) => requirement.inputSource === "calculated_average_factor"),
  );
  assert.equal(
    Object.keys(filled.state.derived.shared).length > 0 ||
      Object.keys(filled.state.derived.byGarmentKey).length > 0,
    true,
  );
}

const dressMid = fillRequired("E", "medium_risk");
const dressHip = dressMid.plan.requirements.find(
  (requirement) => requirement.measurementId === "hip_circumference",
);
assert.ok(dressHip);
assert.equal(dressHip.directInput, false);
assert.equal(dressHip.inputSource, "optional_manual");
assert.equal(dressHip.averageFactor, null);
assert.equal(dressMid.state.derived.byGarmentKey["dress:1"]?.hip_circumference, undefined);
assert.equal(getMeasurementProfileField("I", "hip_circumference")?.averageFactor, 0.584591437335114);

const longDressMid = fillRequired("G", "medium_risk");
const longDressLength = longDressMid.plan.requirements.find(
  (requirement) => requirement.measurementId === "dress_length_long",
);
assert.ok(longDressLength);
assert.equal(longDressLength.inputSource, "optional_manual");
assert.equal(longDressLength.averageFactor, null);
assert.equal(
  longDressMid.state.derived.byGarmentKey["dress:1"]?.dress_length_long,
  undefined,
);

const skirtMid = fillRequired("L", "medium_risk");
const skirtKnee = skirtMid.plan.requirements.find(
  (requirement) => requirement.measurementId === "waist_to_knee_length",
);
assert.ok(skirtKnee);
assert.equal(skirtKnee.section, "required");
nearlyEqual(skirtKnee.averageFactor!, 0.242042112706051);

const pantsOptionalKnee = fillRequired("I", "medium_risk").plan.requirements.find(
  (requirement) => requirement.measurementId === "waist_to_knee_length",
);
assert.equal(pantsOptionalKnee?.inputSource, "calculated_average_factor");
nearlyEqual(pantsOptionalKnee!.averageFactor!, 0.289493733847171);

const heightA = fillRequired("A", "medium_risk", 180, 90);
const headRequirement = heightA.plan.requirements.find(
  (requirement) => requirement.measurementId === "head_circumference",
)!;
const headAt180 = derivedFor(heightA.state, headRequirement)!.valueCm;
const requiredChest = heightA.state.entered.shared.chest_bust_circumference!.valueCm;
const heightRequirement = heightA.plan.requirements.find(
  (requirement) => requirement.measurementId === "total_height",
)!;
let heightB = setFutureMeasurementInput({
  state: heightA.state,
  requirement: heightRequirement,
  displayValue: 170,
});
heightB = reconcileFutureMeasurementState({ state: heightB, plan: heightA.plan });
nearlyEqual(
  derivedFor(heightB, headRequirement)!.valueCm,
  calculateMeasurementFromAverageFactor(
    170,
    heightA.plan.requirements.find((requirement) => requirement.measurementId === "head_circumference")!.averageFactor!,
  ),
);
assert.notEqual(derivedFor(heightB, headRequirement)!.valueCm, headAt180);
assert.equal(heightB.entered.shared.chest_bust_circumference!.valueCm, requiredChest);

const isolatedLow = fillRequired("A", "low_risk");
const switchedMid = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(isolatedLow.state, "medium_risk"),
  plan: planFor("A", "medium_risk"),
});
assert.equal(switchedMid.entered.shared.chest_bust_circumference, undefined);
assert.equal(switchedMid.derived.byGarmentKey[headRequirement.garmentKey]?.head_circumference, undefined);
assert.ok(isolatedLow.state.entered.shared.chest_bust_circumference);

const midOwn = fillRequired("A", "medium_risk");
const midHeadRequirement = midOwn.plan.requirements.find(
  (requirement) => requirement.measurementId === "head_circumference",
)!;
const midHead = derivedFor(midOwn.state, midHeadRequirement)!.valueCm;
const switchedHigh = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(midOwn.state, "high_risk"),
  plan: planFor("A", "high_risk"),
});
assert.equal(switchedHigh.entered.shared.shoulder_length, undefined);
assert.equal(switchedHigh.derived.byGarmentKey[midHeadRequirement.garmentKey]?.head_circumference, undefined);
assert.equal(
  switchedHigh.entered.shared.chest_bust_circumference,
  undefined,
);
const restoredMid = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(switchedHigh, "medium_risk"),
  plan: midOwn.plan,
});
assert.equal(
  restoredMid.entered.shared.chest_bust_circumference?.valueCm,
  midOwn.state.entered.shared.chest_bust_circumference?.valueCm,
);
nearlyEqual(derivedFor(restoredMid, midHeadRequirement)!.valueCm, midHead);

const projected = projectActiveFutureMeasurementState({
  state: midOwn.state,
  plan: midOwn.plan,
});
assert.equal(projected.entered.shared.head_circumference, undefined);
assert.equal(
  projected.derived.byGarmentKey[midHeadRequirement.garmentKey]?.head_circumference?.provenance,
  "calculated_average_factor",
);
assert.equal(projected.entered.shared.chest_bust_circumference?.provenance, "customer_entered");
assert.equal(projected.enteredByRoute?.low_risk.shared.chest_bust_circumference, undefined);
assert.equal(projected.enteredByRoute?.high_risk.shared.chest_bust_circumference, undefined);

const optionalBlank = fillRequired("G", "medium_risk");
assert.equal(
  optionalBlank.state.entered.byGarmentKey["dress:1"]?.dress_length_long,
  undefined,
);
assert.equal(isFutureSummaryUnlockedByMeasurements(optionalBlank.state), true);

// Fred's supplied High-Risk report: a standard mid/long-sleeve shirt (B) and
// Bum Shorts (K), with 66.9 in as the only customer measurement input.
const fredSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "bum_shorts"],
  demographic: "female",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_midlong", "shirt_construction"),
    bum_shorts: construction("bum_shorts", "bum_rope", "bum_shorts_fastening"),
  },
};
const fredPlan = planMeasurementRequirements({
  route: "high_risk",
  garmentTypeSelection: fredSelection,
  physicalGarments: [
    { garmentKey: "fred:shirt:1", garmentType: "shirt" },
    { garmentKey: "fred:bum-shorts:1", garmentType: "bum_shorts" },
  ],
});
assert.deepEqual(
  fredPlan.profiles.map((profile) =>
    profile.status === "resolved" ? profile.profile.id : profile.status,
  ),
  ["K", "B"],
);
assert.deepEqual(
  [...new Set(
    fredPlan.requirements
      .filter((requirement) => requirement.directInput)
      .map((requirement) => requirement.measurementId),
  )],
  ["total_height"],
  "High Risk accepts Total Height as its only measurement input.",
);

let fredState = createEmptyFutureMeasurementState("high_risk", "inch");
const fredHeightRequirement = fredPlan.requirements.find(
  (requirement) => requirement.directInput && requirement.measurementId === "total_height",
)!;
fredState = setFutureMeasurementInput({
  state: fredState,
  requirement: fredHeightRequirement,
  displayValue: 66.9,
});
fredState = reconcileFutureMeasurementState({ state: fredState, plan: fredPlan });
assert.equal(fredState.calculationStatus, "complete");
assert.deepEqual(Object.keys(fredState.entered.shared), ["total_height"]);

const fredAutomaticRows = [
  ["fred:shirt:1", "head_circumference", 22.97],
  ["fred:shirt:1", "neck_circumference", 15.89],
  ["fred:shirt:1", "shoulder_length", 17.19],
  ["fred:shirt:1", "shirt_length_standard", 29.96],
  ["fred:shirt:1", "sleeve_length_long", 23.2],
  ["fred:shirt:1", "chest_bust_circumference", 38.24],
  ["fred:shirt:1", "belly_circumference", 34.01],
  ["fred:shirt:1", "bicep_circumference", 13.37],
  ["fred:shirt:1", "elbow_circumference", 11.52],
  ["fred:shirt:1", "armhole_circumference", 19.76],
  ["fred:shirt:1", "height_head_to_lower_neck", 10.15],
  ["fred:shirt:1", "height_lower_neck_to_waist", 19.24],
  ["fred:shirt:1", "height_waist_to_feet", 37.68],
  ["fred:bum-shorts:1", "waist_circumference", 34.29],
  ["fred:bum-shorts:1", "hip_circumference", 39.11],
  ["fred:bum-shorts:1", "thigh_circumference", 23.02],
  ["fred:bum-shorts:1", "knee_circumference", 16.19],
  ["fred:bum-shorts:1", "waist_to_hip_length", 6],
  ["fred:bum-shorts:1", "waist_to_crotch_depth_length", 8.82],
  ["fred:bum-shorts:1", "height_head_to_lower_neck", 10.15],
  ["fred:bum-shorts:1", "height_lower_neck_to_waist", 19.24],
  ["fred:bum-shorts:1", "height_waist_to_feet", 37.68],
] as const;

for (const [garmentKey, measurementId, expectedDisplayInches] of fredAutomaticRows) {
  const requirement = fredPlan.requirements.find(
    (candidate) =>
      candidate.garmentKey === garmentKey &&
      candidate.measurementId === measurementId,
  );
  assert.ok(requirement, `${garmentKey} ${measurementId} is planned.`);
  assert.equal(requirement.inputSource, "calculated_average_factor");
  const derived = fredState.derived.byGarmentKey[garmentKey]?.[measurementId];
  assert.ok(derived, `${garmentKey} ${measurementId} is derived from height.`);
  const actualInches = centimetresToInches(derived.valueCm);
  nearlyEqual(actualInches, 66.9 * requirement.averageFactor!);
  assert.equal(Math.round(actualInches * 100) / 100, expectedDisplayInches);
}

for (const garmentKey of ["fred:shirt:1", "fred:bum-shorts:1"]) {
  const genericWaistToFeet = fredState.derived.byGarmentKey[garmentKey]?.height_waist_to_feet;
  assert.ok(genericWaistToFeet);
  assert.equal(
    Math.round(centimetresToInches(genericWaistToFeet.valueCm) * 10) / 10,
    37.7,
    "The generic Height 4 / Waist-to-Floor-under-feet reference rounds from 37.68 to 37.7.",
  );
}

for (const [garmentKey, measurementId] of [
  ["fred:shirt:1", "sleeve_length_mid"],
  ["fred:bum-shorts:1", "waist_to_lap_length"],
] as const) {
  const requirement = fredPlan.requirements.find(
    (candidate) => candidate.garmentKey === garmentKey && candidate.measurementId === measurementId,
  );
  assert.equal(requirement?.inputSource, "optional_manual");
  assert.equal(fredState.derived.byGarmentKey[garmentKey]?.[measurementId], undefined);
}

const fredReloaded = reconcileFutureMeasurementState({
  state: JSON.parse(JSON.stringify(fredState)),
  plan: fredPlan,
});
nearlyEqual(
  centimetresToInches(
    fredReloaded.derived.byGarmentKey["fred:shirt:1"]!.chest_bust_circumference!.valueCm,
  ),
  66.9 * fredPlan.requirements.find(
    (requirement) =>
      requirement.garmentKey === "fred:shirt:1" &&
      requirement.measurementId === "chest_bust_circumference",
  )!.averageFactor!,
);
let fredAfterHeightChange = setFutureMeasurementInput({
  state: fredReloaded,
  requirement: fredHeightRequirement,
  displayValue: 67.9,
});
fredAfterHeightChange = reconcileFutureMeasurementState({
  state: fredAfterHeightChange,
  plan: fredPlan,
});
assert.notEqual(
  fredAfterHeightChange.derived.byGarmentKey["fred:shirt:1"]!.chest_bust_circumference!.valueCm,
  fredReloaded.derived.byGarmentKey["fred:shirt:1"]!.chest_bust_circumference!.valueCm,
  "A height change must replace, rather than retain, a High-Risk derived value.",
);

console.log("PASS: measurement factor routes, height change, isolation, and summary readiness");
