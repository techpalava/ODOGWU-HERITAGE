import assert from "node:assert/strict";
import type {
  AdditionalGarmentConstructionStateV1,
  CustomDetailSelectionGroup,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  MeasurementRiskRoute,
} from "./src/types";
import {
  countRemainingCustomerRequiredMeasurementUnits,
  createEmptyFutureMeasurementState,
  isFutureMeasurementStageComplete,
  isFutureSummaryUnlockedByMeasurements,
  normalizeFutureMeasurementState,
  planMeasurementRequirements,
  projectMeasurementRequirementsForPresentation,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  type MeasurementRequirementPlan,
  type PlannedMeasurementRequirement,
} from "./src/utils/measurementBlueprint";
import {
  DESIGN_STUDIO_STEPS,
  getDesignStudioJourneyStepState,
} from "./src/components/DesignStudioJourneyStepper";

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

const sleevelessDressSelection: GarmentTypeStepSelection = {
  garmentTypes: ["dress"],
  demographic: "female",
  constructionByGarment: {
    dress: construction("dress", "dress_std_sleeveless", "dress_construction"),
  },
};

const midLongDressSelection: GarmentTypeStepSelection = {
  garmentTypes: ["dress"],
  demographic: "female",
  constructionByGarment: {
    dress: construction("dress", "dress_std_midlong", "dress_construction"),
  },
};

const midLongShirtSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_midlong", "shirt_construction"),
  },
};

const visibleRequired = (
  plan: MeasurementRequirementPlan,
  state = createEmptyFutureMeasurementState(plan.route || "low_risk", "cm"),
): PlannedMeasurementRequirement[] =>
  projectMeasurementRequirementsForPresentation({
    requirements: plan.requirements,
    state,
  }).filter((requirement) => requirement.directInput);

const alternativeMembers = (
  plan: MeasurementRequirementPlan,
  alternativeGroup?: string,
): PlannedMeasurementRequirement[] =>
  plan.requirements.filter((requirement) =>
    requirement.alternativeGroup &&
    (!alternativeGroup || requirement.alternativeGroup === alternativeGroup),
  );

const fillAlternative = (
  plan: MeasurementRequirementPlan,
  state: ReturnType<typeof createEmptyFutureMeasurementState>,
  measurementId: string,
  displayValue: number | null,
) => {
  const requirement = alternativeMembers(plan).find(
    (item) => item.measurementId === measurementId,
  );
  assert.ok(requirement, `missing alternative ${measurementId}`);
  return reconcileFutureMeasurementState({
    state: setFutureMeasurementInput({
      state,
      requirement,
      displayValue,
    }),
    plan,
  });
};

const fillVisibleRequired = (
  plan: MeasurementRequirementPlan,
  existing = createEmptyFutureMeasurementState(plan.route || "low_risk", "cm"),
  skipMeasurementId?: string,
) => {
  let state = existing;
  for (const requirement of visibleRequired(plan, existing)) {
    if (requirement.measurementId === skipMeasurementId) continue;
    state = setFutureMeasurementInput({
      state,
      requirement,
      displayValue: requirement.measurementId === "total_height" ? 180 : 90,
    });
  }
  return reconcileFutureMeasurementState({ state, plan });
};

const summaryIndex = DESIGN_STUDIO_STEPS.findIndex((step) => step.id === "summary");
const measurementIndex = DESIGN_STUDIO_STEPS.findIndex((step) => step.id === "measurement");

const assertSummaryUnlock = (complete: boolean) => {
  assert.equal(
    getDesignStudioJourneyStepState({
      stepIndex: summaryIndex,
      currentStageIndex: measurementIndex,
      isUnlocked: complete,
    }),
    complete ? "available" : "locked",
  );
};

const shirtLowPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
});
const incompleteShirt = reconcileFutureMeasurementState({
  state: createEmptyFutureMeasurementState("low_risk", "cm"),
  plan: shirtLowPlan,
});
assert.equal(isFutureMeasurementStageComplete(incompleteShirt), false);
assert.equal(isFutureSummaryUnlockedByMeasurements(incompleteShirt), false);
assertSummaryUnlock(false);

const shirtLowComplete = fillVisibleRequired(shirtLowPlan);
assert.equal(isFutureMeasurementStageComplete(shirtLowComplete), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(shirtLowComplete), true);
assertSummaryUnlock(true);

const lastShirtRequired = visibleRequired(shirtLowPlan).at(-1);
assert.ok(lastShirtRequired);
let missingFinal = fillVisibleRequired(
  shirtLowPlan,
  createEmptyFutureMeasurementState("low_risk", "cm"),
  lastShirtRequired.measurementId,
);
assert.equal(isFutureMeasurementStageComplete(missingFinal), false);
assert.equal(isFutureSummaryUnlockedByMeasurements(missingFinal), false);
missingFinal = reconcileFutureMeasurementState({
  state: setFutureMeasurementInput({
    state: missingFinal,
    requirement: lastShirtRequired,
    displayValue: 90,
  }),
  plan: shirtLowPlan,
});
assert.equal(isFutureMeasurementStageComplete(missingFinal), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(missingFinal), true);

const clearedRequired = reconcileFutureMeasurementState({
  state: setFutureMeasurementInput({
    state: missingFinal,
    requirement: lastShirtRequired,
    displayValue: null,
  }),
  plan: shirtLowPlan,
});
assert.equal(isFutureMeasurementStageComplete(clearedRequired), false);
assert.equal(isFutureSummaryUnlockedByMeasurements(clearedRequired), false);

const invalidRequired = reconcileFutureMeasurementState({
  state: setFutureMeasurementInput({
    state: missingFinal,
    requirement: lastShirtRequired,
    displayValue: 0,
  }),
  plan: shirtLowPlan,
});
assert.equal(invalidRequired.calculationStatus, "invalid");
assert.equal(isFutureMeasurementStageComplete(invalidRequired), false);
assert.equal(isFutureSummaryUnlockedByMeasurements(invalidRequired), false);

const dressLowPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: dressSelection,
  physicalGarments: [{ garmentKey: "base:dress", garmentType: "dress" }],
});
assert.equal(
  dressLowPlan.diagnostics.some((diagnostic) => diagnostic.code === "applicability_unresolved"),
  false,
);
assert.equal(
  visibleRequired(dressLowPlan).some((requirement) =>
    [
      "under_bust_circumference",
      "hip_circumference",
      "square_neck_length",
      "square_neck_width",
      "shoulder_to_under_bust_length",
    ].includes(requirement.measurementId),
  ),
  false,
  "Hidden/unproven Dress IF APPLICABLE fields must not be required.",
);
const dressLowComplete = fillVisibleRequired(dressLowPlan);
assert.equal(isFutureMeasurementStageComplete(dressLowComplete), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(dressLowComplete), true);

const squareNeckDetails: GarmentScopedCustomDetailsStateV1 = {
  schemaVersion: 1,
  selectionsByGarmentKey: {
    "base:dress": { neck_design: "neck_no_u" },
  },
  snapshotsByGarmentKey: {},
};
const squareNeckPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: dressSelection,
  physicalGarments: [{ garmentKey: "base:dress", garmentType: "dress" }],
  garmentScopedCustomDetails: squareNeckDetails,
});
assert.equal(
  visibleRequired(squareNeckPlan).some(
    (requirement) => requirement.measurementId === "square_neck_length",
  ),
  true,
  "A proven square-neck construction must keep square-neck length required.",
);
const squareNeckWithoutLength = fillVisibleRequired(
  squareNeckPlan,
  createEmptyFutureMeasurementState("low_risk", "cm"),
  "square_neck_length",
);
assert.equal(isFutureMeasurementStageComplete(squareNeckWithoutLength), false);

const sleevelessDressPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: sleevelessDressSelection,
  physicalGarments: [{ garmentKey: "base:dress", garmentType: "dress" }],
});
assert.equal(
  visibleRequired(sleevelessDressPlan).some(
    (requirement) => requirement.measurementId === "sleeve_length_sleeveless",
  ),
  true,
);
assert.equal(
  sleevelessDressPlan.requirements.some((requirement) =>
    ["sleeve_length_short", "sleeve_length_mid", "sleeve_length_long"].includes(
      requirement.measurementId,
    ),
  ),
  false,
  "Sleeveless construction must exclude short/mid/long sleeve alternatives.",
);
const sleevelessComplete = fillVisibleRequired(sleevelessDressPlan);
assert.equal(isFutureMeasurementStageComplete(sleevelessComplete), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(sleevelessComplete), true);

const midLongDressPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: midLongDressSelection,
  physicalGarments: [{ garmentKey: "base:dress", garmentType: "dress" }],
});
const midLongAlternatives = alternativeMembers(midLongDressPlan, "F_sleeve_length");
assert.deepEqual(
  midLongAlternatives.map((requirement) => requirement.measurementId).sort(),
  ["sleeve_length_long", "sleeve_length_mid"],
);
assert.equal(
  midLongAlternatives.every((requirement) =>
    requirement.section === "required" &&
    !requirement.directInput &&
    requirement.inputSource === "route_marker",
  ),
  true,
);
assert.equal(
  visibleRequired(midLongDressPlan).some((requirement) =>
    ["sleeve_length_mid", "sleeve_length_long"].includes(requirement.measurementId),
  ),
  false,
  "One-of sleeve members must not each be independently required.",
);
const midLongBothEmpty = fillVisibleRequired(midLongDressPlan);
assert.equal(isFutureMeasurementStageComplete(midLongBothEmpty), false);
assert.equal(isFutureSummaryUnlockedByMeasurements(midLongBothEmpty), false);
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({
    plan: midLongDressPlan,
    state: midLongBothEmpty,
  }),
  1,
  "empty mid/long one-of counts as one remaining customer unit",
);
assert.equal(
  midLongBothEmpty.diagnostics.some((diagnostic) => diagnostic.code === "required_measurement_missing"),
  true,
);

const midOnly = fillAlternative(midLongDressPlan, midLongBothEmpty, "sleeve_length_mid", 42);
assert.equal(isFutureMeasurementStageComplete(midOnly), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(midOnly), true);
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({
    plan: midLongDressPlan,
    state: midOnly,
  }),
  0,
);
assert.equal(
  Boolean(midOnly.entered.byGarmentKey["base:dress"]?.sleeve_length_long),
  false,
);

const clearedMid = fillAlternative(midLongDressPlan, midOnly, "sleeve_length_mid", null);
assert.equal(isFutureMeasurementStageComplete(clearedMid), false);

const longOnly = fillAlternative(midLongDressPlan, midLongBothEmpty, "sleeve_length_long", 58);
assert.equal(isFutureMeasurementStageComplete(longOnly), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(longOnly), true);
assert.equal(
  Boolean(longOnly.entered.byGarmentKey["base:dress"]?.sleeve_length_mid),
  false,
);

const invalidMid = fillAlternative(midLongDressPlan, midLongBothEmpty, "sleeve_length_mid", 0);
assert.equal(invalidMid.calculationStatus, "invalid");
assert.equal(isFutureMeasurementStageComplete(invalidMid), false);

const restoredMidOnly = reconcileFutureMeasurementState({
  state: normalizeFutureMeasurementState(JSON.parse(JSON.stringify(midOnly)))!,
  plan: midLongDressPlan,
});
assert.equal(isFutureMeasurementStageComplete(restoredMidOnly), true);
const restoredLongOnly = reconcileFutureMeasurementState({
  state: normalizeFutureMeasurementState(JSON.parse(JSON.stringify(longOnly)))!,
  plan: midLongDressPlan,
});
assert.equal(isFutureMeasurementStageComplete(restoredLongOnly), true);
const restoredNeither = reconcileFutureMeasurementState({
  state: normalizeFutureMeasurementState(JSON.parse(JSON.stringify(midLongBothEmpty)))!,
  plan: midLongDressPlan,
});
assert.equal(isFutureMeasurementStageComplete(restoredNeither), false);

const midLongLowPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: midLongShirtSelection,
  physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
});
assert.equal(
  alternativeMembers(midLongLowPlan, "B_sleeve_length").length,
  2,
);
const midLongShirtBothEmpty = fillVisibleRequired(midLongLowPlan);
assert.equal(isFutureMeasurementStageComplete(midLongShirtBothEmpty), false);
const midLongShirtMidOnly = fillAlternative(
  midLongLowPlan,
  midLongShirtBothEmpty,
  "sleeve_length_mid",
  40,
);
assert.equal(isFutureMeasurementStageComplete(midLongShirtMidOnly), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(midLongShirtMidOnly), true);

for (const route of ["medium_risk", "high_risk"] as MeasurementRiskRoute[]) {
  const highOrMidPlan = planMeasurementRequirements({
    route,
    garmentTypeSelection: dressSelection,
    physicalGarments: [{ garmentKey: "base:dress", garmentType: "dress" }],
  });
  const filled = fillVisibleRequired(highOrMidPlan);
  assert.equal(
    isFutureMeasurementStageComplete(filled),
    true,
    `${route} must complete from the visible required matrix`,
  );
  assert.equal(isFutureSummaryUnlockedByMeasurements(filled), true);
}

const midLongHighPlan = planMeasurementRequirements({
  route: "high_risk",
  garmentTypeSelection: midLongDressSelection,
  physicalGarments: [{ garmentKey: "base:dress", garmentType: "dress" }],
});
assert.equal(alternativeMembers(midLongHighPlan).length, 0);
const midLongHighComplete = fillVisibleRequired(midLongHighPlan);
assert.equal(isFutureMeasurementStageComplete(midLongHighComplete), true);
assert.deepEqual(
  visibleRequired(midLongHighPlan).map((requirement) => requirement.measurementId),
  ["total_height", "chest_bust_circumference", "belly_circumference"],
);

const additionalMidLongConstructions: AdditionalGarmentConstructionStateV1 = {
  schemaVersion: 1,
  byGarmentKey: {
    "additional:shirt:1": construction("shirt", "shirt_std_midlong", "shirt_construction"),
  },
};
const repeatedMidLongPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: midLongShirtSelection,
  physicalGarments: [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ],
  additionalGarmentConstructions: additionalMidLongConstructions,
});
assert.deepEqual(
  [...new Set(
    alternativeMembers(repeatedMidLongPlan).map(
      (requirement) => `${requirement.garmentKey}:${requirement.alternativeGroup}`,
    ),
  )].sort(),
  [
    "additional:shirt:1:B_sleeve_length",
    "base:shirt:B_sleeve_length",
  ],
);
let repeatedMidLongState = fillVisibleRequired(repeatedMidLongPlan);
assert.equal(isFutureMeasurementStageComplete(repeatedMidLongState), false);
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({
    plan: repeatedMidLongPlan,
    state: repeatedMidLongState,
  }),
  2,
  "repeated occurrences keep separate one-of remaining units",
);
const baseMid = alternativeMembers(repeatedMidLongPlan).find(
  (requirement) =>
    requirement.garmentKey === "base:shirt" &&
    requirement.measurementId === "sleeve_length_mid",
)!;
const additionalLong = alternativeMembers(repeatedMidLongPlan).find(
  (requirement) =>
    requirement.garmentKey === "additional:shirt:1" &&
    requirement.measurementId === "sleeve_length_long",
)!;
repeatedMidLongState = reconcileFutureMeasurementState({
  state: setFutureMeasurementInput({
    state: repeatedMidLongState,
    requirement: baseMid,
    displayValue: 40,
  }),
  plan: repeatedMidLongPlan,
});
assert.equal(isFutureMeasurementStageComplete(repeatedMidLongState), false);
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({
    plan: repeatedMidLongPlan,
    state: repeatedMidLongState,
  }),
  1,
);
repeatedMidLongState = reconcileFutureMeasurementState({
  state: setFutureMeasurementInput({
    state: repeatedMidLongState,
    requirement: additionalLong,
    displayValue: 58,
  }),
  plan: repeatedMidLongPlan,
});
assert.equal(isFutureMeasurementStageComplete(repeatedMidLongState), true);
assert.equal(
  countRemainingCustomerRequiredMeasurementUnits({
    plan: repeatedMidLongPlan,
    state: repeatedMidLongState,
  }),
  0,
);
const clearedAdditionalSleeve = reconcileFutureMeasurementState({
  state: setFutureMeasurementInput({
    state: repeatedMidLongState,
    requirement: additionalLong,
    displayValue: null,
  }),
  plan: repeatedMidLongPlan,
});
assert.equal(isFutureMeasurementStageComplete(clearedAdditionalSleeve), false);
assert.equal(
  Boolean(clearedAdditionalSleeve.entered.byGarmentKey["base:shirt"]?.sleeve_length_mid),
  true,
);

const additionalConstructions: AdditionalGarmentConstructionStateV1 = {
  schemaVersion: 1,
  byGarmentKey: {
    "additional:shirt:1": construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};
const repeatedPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments: [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ],
  additionalGarmentConstructions: additionalConstructions,
});
const shirtLengthFields = visibleRequired(repeatedPlan).filter(
  (requirement) => requirement.measurementId === "shirt_length_standard",
);
assert.deepEqual(
  shirtLengthFields.map((requirement) => requirement.garmentKey).sort(),
  ["additional:shirt:1", "base:shirt"],
);
let repeatedState = fillVisibleRequired(
  repeatedPlan,
  createEmptyFutureMeasurementState("low_risk", "cm"),
  "shirt_length_standard",
);
assert.equal(isFutureMeasurementStageComplete(repeatedState), false);
for (const requirement of shirtLengthFields) {
  repeatedState = setFutureMeasurementInput({
    state: repeatedState,
    requirement,
    displayValue: 90,
  });
}
repeatedState = reconcileFutureMeasurementState({
  state: repeatedState,
  plan: repeatedPlan,
});
assert.equal(isFutureMeasurementStageComplete(repeatedState), true);
const clearedAdditionalOnly = reconcileFutureMeasurementState({
  state: setFutureMeasurementInput({
    state: repeatedState,
    requirement: shirtLengthFields.find((item) => item.garmentKey === "additional:shirt:1")!,
    displayValue: null,
  }),
  plan: repeatedPlan,
});
assert.equal(isFutureMeasurementStageComplete(clearedAdditionalOnly), false);
assert.equal(
  Boolean(
    clearedAdditionalOnly.entered.byGarmentKey["base:shirt"]?.shirt_length_standard,
  ),
  true,
);

const restored = reconcileFutureMeasurementState({
  state: normalizeFutureMeasurementState(JSON.parse(JSON.stringify(shirtLowComplete)))!,
  plan: shirtLowPlan,
});
assert.equal(isFutureMeasurementStageComplete(restored), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(restored), true);

const unresolvedConstructionPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: {
    garmentTypes: ["kaftan"],
    demographic: "male",
    constructionByGarment: {
      kaftan: construction("kaftan", "shirt_std_short", "shirt_construction"),
    },
  },
  physicalGarments: [{ garmentKey: "base:kaftan", garmentType: "kaftan" }],
});
assert.equal(unresolvedConstructionPlan.requirements.length, 0);
const unresolvedConstruction = reconcileFutureMeasurementState({
  state: createEmptyFutureMeasurementState("low_risk", "cm"),
  plan: unresolvedConstructionPlan,
});
assert.equal(isFutureMeasurementStageComplete(unresolvedConstruction), false);
assert.equal(isFutureSummaryUnlockedByMeasurements(unresolvedConstruction), false);

console.log("PASS: measurement completion next-step unlock authority");
