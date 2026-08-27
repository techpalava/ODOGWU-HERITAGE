import assert from "node:assert/strict";
import type {
  AdditionalGarmentConstructionStateV1,
  CanonicalPhysicalGarmentType,
  CustomDetailSelectionGroup,
  FutureMeasurementStateV1,
  GarmentConstructionPricingResolution,
  GarmentTypeStepSelection,
  MeasurementRiskRoute,
} from "./src/types";
import {
  createEmptyFutureMeasurementState,
  getResolvedMeasurementValue,
  planMeasurementRequirements,
  projectActiveFutureMeasurementState,
  projectMeasurementRequirementsForPresentation,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  type MeasurementPhysicalGarment,
  type MeasurementRequirementPlan,
} from "./src/utils/measurementBlueprint";
import { calculateMeasurementFromAverageFactor } from "./src/utils/measurementFactorEngine";

const construction = (
  garmentType: CanonicalPhysicalGarmentType,
  optionId: string,
  selectionGroup: CustomDetailSelectionGroup,
): GarmentConstructionPricingResolution => ({
  status: "resolved",
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

const selection = ({
  garmentTypes,
  demographic,
  constructions,
}: {
  garmentTypes: CanonicalPhysicalGarmentType[];
  demographic: "male" | "female";
  constructions?: Partial<
    Record<CanonicalPhysicalGarmentType, GarmentConstructionPricingResolution>
  >;
}): GarmentTypeStepSelection => ({
  garmentTypes,
  demographic,
  constructionByGarment: constructions || {},
});

const additionalConstructions = (
  byGarmentKey: AdditionalGarmentConstructionStateV1["byGarmentKey"],
): AdditionalGarmentConstructionStateV1 => ({ schemaVersion: 1, byGarmentKey });

const fillRequired = (
  plan: MeasurementRequirementPlan,
  route: MeasurementRiskRoute,
): FutureMeasurementStateV1 => {
  let state = createEmptyFutureMeasurementState(route, "cm");
  plan.requirements
    .filter((requirement) => requirement.directInput)
    .forEach((requirement) => {
      state = setFutureMeasurementInput({
        state,
        requirement,
        displayValue: requirement.measurementId === "total_height" ? 180 : 90,
      });
    });
  return reconcileFutureMeasurementState({ state, plan });
};

const semanticRequirements = (plan: MeasurementRequirementPlan) =>
  plan.requirements.map((requirement) => ({
    key: requirement.key,
    manualValueKey: requirement.manualValueKey,
    garmentKey: requirement.garmentKey,
    garmentType: requirement.garmentType,
    profileId: requirement.profileId,
    measurementId: requirement.measurementId,
    section: requirement.section,
    inputSource: requirement.inputSource,
    averageFactor: requirement.averageFactor,
    minFactor: requirement.minFactor,
    maxFactor: requirement.maxFactor,
    stdFactor: requirement.stdFactor,
  }));

const planFor = ({
  route = "high_risk",
  garmentTypeSelection,
  physicalGarments,
  occurrenceConstructions,
}: {
  route?: MeasurementRiskRoute;
  garmentTypeSelection: GarmentTypeStepSelection;
  physicalGarments: MeasurementPhysicalGarment[];
  occurrenceConstructions?: AdditionalGarmentConstructionStateV1;
}) => planMeasurementRequirements({
  route,
  garmentTypeSelection,
  physicalGarments,
  additionalGarmentConstructions: occurrenceConstructions,
});

const dressTrouserSelection = selection({
  garmentTypes: ["dress", "trouser"],
  demographic: "female",
  constructions: {
    dress: construction("dress", "dress_std_short", "dress_construction"),
  },
});
const dressTrouserGarments: MeasurementPhysicalGarment[] = [
  { garmentKey: "base:dress", garmentType: "dress" },
  { garmentKey: "base:trouser", garmentType: "trouser" },
];
const dressFirstPlan = planFor({
  garmentTypeSelection: dressTrouserSelection,
  physicalGarments: dressTrouserGarments,
});
const trouserFirstPlan = planFor({
  garmentTypeSelection: dressTrouserSelection,
  physicalGarments: [...dressTrouserGarments].reverse(),
});
assert.deepEqual(
  semanticRequirements(dressFirstPlan),
  semanticRequirements(trouserFirstPlan),
  "Dress + Trouser requirements must not depend on physical garment order.",
);
assert.equal(dressFirstPlan.inputFingerprint, trouserFirstPlan.inputFingerprint);

const dressHip = dressFirstPlan.requirements.find(
  (requirement) =>
    requirement.garmentKey === "base:dress" &&
    requirement.measurementId === "hip_circumference",
)!;
const trouserHip = dressFirstPlan.requirements.find(
  (requirement) =>
    requirement.garmentKey === "base:trouser" &&
    requirement.measurementId === "hip_circumference",
)!;
assert.deepEqual(
  {
    profileId: dressHip.profileId,
    inputSource: dressHip.inputSource,
    averageFactor: dressHip.averageFactor,
  },
  { profileId: "E", inputSource: "optional_manual", averageFactor: null },
);
assert.deepEqual(
  {
    profileId: trouserHip.profileId,
    inputSource: trouserHip.inputSource,
    averageFactor: trouserHip.averageFactor,
  },
  {
    profileId: "I",
    inputSource: "calculated_average_factor",
    averageFactor: 0.584591437335114,
  },
);

const dressFirstState = fillRequired(dressFirstPlan, "high_risk");
const trouserFirstState = fillRequired(trouserFirstPlan, "high_risk");
const projectedDressFirst = projectActiveFutureMeasurementState({
  state: dressFirstState,
  plan: dressFirstPlan,
});
const projectedTrouserFirst = projectActiveFutureMeasurementState({
  state: trouserFirstState,
  plan: trouserFirstPlan,
});
assert.deepEqual(
  projectedDressFirst,
  projectedTrouserFirst,
  "The active candidate measurement payload must be order independent.",
);
assert.equal(
  projectedDressFirst.derived.byGarmentKey["base:dress"]?.hip_circumference,
  undefined,
  "Dress Profile E Hip has no workbook factor.",
);
const calculatedTrouserHip =
  projectedDressFirst.derived.byGarmentKey["base:trouser"]?.hip_circumference;
assert.ok(calculatedTrouserHip);
assert.equal(calculatedTrouserHip.provenance, "calculated_average_factor");
assert.deepEqual(calculatedTrouserHip.calculation, {
  route: "high_risk",
  profileId: "I",
  garmentKey: "base:trouser",
  measurementId: "hip_circumference",
  averageFactor: 0.584591437335114,
});
assert.equal(
  calculatedTrouserHip.valueCm,
  calculateMeasurementFromAverageFactor(180, 0.584591437335114),
);

let manualHipState = setFutureMeasurementInput({
  state: dressFirstState,
  requirement: dressHip,
  displayValue: 104,
});
manualHipState = reconcileFutureMeasurementState({
  state: manualHipState,
  plan: dressFirstPlan,
});
assert.equal(
  manualHipState.derived.byGarmentKey["base:trouser"]?.hip_circumference,
  undefined,
  "A real shared Hip measurement suppresses the unnecessary Trouser estimate.",
);
assert.equal(getResolvedMeasurementValue(manualHipState, trouserHip)?.valueCm, 104);
assert.equal(
  getResolvedMeasurementValue(manualHipState, trouserHip)?.provenance,
  "customer_entered",
);
assert.equal(
  projectMeasurementRequirementsForPresentation({
    requirements: dressFirstPlan.requirements,
    state: manualHipState,
  }).filter((requirement) => requirement.measurementId === "hip_circumference").length,
  1,
  "A manual shared body value renders once even when several profile instances consume it.",
);

const shirtSelection = selection({
  garmentTypes: ["shirt"],
  demographic: "male",
  constructions: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  },
});
const shirtOccurrences: MeasurementPhysicalGarment[] = [
  { garmentKey: "base:shirt", garmentType: "shirt" },
  { garmentKey: "additional:shirt:1", garmentType: "shirt" },
];
const shirtADConstructions = additionalConstructions({
  "additional:shirt:1": construction(
    "shirt",
    "shirt_long_midlong",
    "shirt_construction",
  ),
});
const shirtADPlan = planFor({
  garmentTypeSelection: shirtSelection,
  physicalGarments: shirtOccurrences,
  occurrenceConstructions: shirtADConstructions,
});
const shirtADReversedPlan = planFor({
  garmentTypeSelection: shirtSelection,
  physicalGarments: [...shirtOccurrences].reverse(),
  occurrenceConstructions: shirtADConstructions,
});
assert.deepEqual(
  shirtADPlan.profiles.map((profile) =>
    profile.status === "resolved" ? [profile.garmentKey, profile.profile.id] : null,
  ),
  [["additional:shirt:1", "D"], ["base:shirt", "A"]],
);
assert.deepEqual(semanticRequirements(shirtADPlan), semanticRequirements(shirtADReversedPlan));

const dressSelection = selection({
  garmentTypes: ["dress"],
  demographic: "female",
  constructions: {
    dress: construction("dress", "dress_std_short", "dress_construction"),
  },
});
const dressEHPlan = planFor({
  garmentTypeSelection: dressSelection,
  physicalGarments: [
    { garmentKey: "base:dress", garmentType: "dress" },
    { garmentKey: "additional:dress:1", garmentType: "dress" },
  ],
  occurrenceConstructions: additionalConstructions({
    "additional:dress:1": construction(
      "dress",
      "dress_long_midlong",
      "dress_construction",
    ),
  }),
});
assert.deepEqual(
  dressEHPlan.profiles.map((profile) =>
    profile.status === "resolved" ? [profile.garmentKey, profile.profile.id] : null,
  ),
  [["additional:dress:1", "H"], ["base:dress", "E"]],
);

const additionalShirtAPlan = planFor({
  garmentTypeSelection: shirtSelection,
  physicalGarments: shirtOccurrences,
  occurrenceConstructions: additionalConstructions({
    "additional:shirt:1": construction(
      "shirt",
      "shirt_std_short",
      "shirt_construction",
    ),
  }),
});
const additionalShirtAState = fillRequired(additionalShirtAPlan, "high_risk");
const changedAdditionalShirtState = reconcileFutureMeasurementState({
  state: additionalShirtAState,
  plan: shirtADPlan,
});
assert.notEqual(additionalShirtAPlan.inputFingerprint, shirtADPlan.inputFingerprint);
assert.equal(
  Object.values(
    changedAdditionalShirtState.derived.byGarmentKey["additional:shirt:1"] || {},
  ).every((value) => value.calculation?.profileId === "D"),
  true,
  "Changing one occurrence to Profile D invalidates its Profile A calculations.",
);
assert.equal(
  Object.values(changedAdditionalShirtState.derived.byGarmentKey["base:shirt"] || {})
    .every((value) => value.calculation?.profileId === "A"),
  true,
  "Changing the additional Shirt leaves the base Shirt profile untouched.",
);

const longDressShirtPlan = planFor({
  garmentTypeSelection: selection({
    garmentTypes: ["dress", "shirt"],
    demographic: "female",
    constructions: {
      dress: construction("dress", "dress_long_short", "dress_construction"),
      shirt: construction("shirt", "shirt_long_short", "shirt_construction"),
    },
  }),
  physicalGarments: [
    { garmentKey: "base:dress", garmentType: "dress" },
    { garmentKey: "base:shirt", garmentType: "shirt" },
  ],
});
const longDressLength = longDressShirtPlan.requirements.find(
  (requirement) =>
    requirement.garmentKey === "base:dress" &&
    requirement.measurementId === "dress_length_long",
)!;
const longShirtLength = longDressShirtPlan.requirements.find(
  (requirement) =>
    requirement.garmentKey === "base:shirt" &&
    requirement.measurementId === "shirt_length_long",
)!;
assert.equal(longDressLength.averageFactor, null);
assert.equal(longDressLength.inputSource, "optional_manual");
assert.equal(longShirtLength.averageFactor, 0.597092331523786);
assert.equal(longShirtLength.inputSource, "calculated_average_factor");

const shirtTrouserDressSelection = selection({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: "female",
  constructions: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
    dress: construction("dress", "dress_std_short", "dress_construction"),
  },
});
const shirtTrouserDressGarments: MeasurementPhysicalGarment[] = [
  { garmentKey: "base:shirt", garmentType: "shirt" },
  { garmentKey: "base:trouser", garmentType: "trouser" },
  { garmentKey: "base:dress", garmentType: "dress" },
];
const shirtTrouserDressBaseline = planFor({
  garmentTypeSelection: shirtTrouserDressSelection,
  physicalGarments: shirtTrouserDressGarments,
});
[
  [shirtTrouserDressGarments[2], shirtTrouserDressGarments[0], shirtTrouserDressGarments[1]],
  [shirtTrouserDressGarments[1], shirtTrouserDressGarments[2], shirtTrouserDressGarments[0]],
].forEach((physicalGarments) => {
  const permutation = planFor({
    garmentTypeSelection: shirtTrouserDressSelection,
    physicalGarments,
  });
  assert.deepEqual(
    semanticRequirements(permutation),
    semanticRequirements(shirtTrouserDressBaseline),
  );
  assert.equal(permutation.inputFingerprint, shirtTrouserDressBaseline.inputFingerprint);
});

const skirtTrouserPlan = planFor({
  garmentTypeSelection: selection({
    garmentTypes: ["skirt", "trouser"],
    demographic: "female",
    constructions: {
      skirt: construction("skirt", "skirt_std", "skirt_length"),
    },
  }),
  physicalGarments: [
    { garmentKey: "base:skirt", garmentType: "skirt" },
    { garmentKey: "base:trouser", garmentType: "trouser" },
  ],
});
assert.equal(
  skirtTrouserPlan.requirements.find(
    (requirement) =>
      requirement.garmentKey === "base:skirt" &&
      requirement.measurementId === "waist_to_knee_length",
  )?.averageFactor,
  0.242042112706051,
);
assert.equal(
  skirtTrouserPlan.requirements.find(
    (requirement) =>
      requirement.garmentKey === "base:trouser" &&
      requirement.measurementId === "waist_to_knee_length",
  )?.averageFactor,
  0.289493733847171,
);

const missingAdditionalConstructionPlan = planFor({
  garmentTypeSelection: shirtSelection,
  physicalGarments: shirtOccurrences,
  occurrenceConstructions: additionalConstructions({}),
});
assert.equal(
  missingAdditionalConstructionPlan.profiles.some(
    (profile) =>
      profile.status === "unresolved" &&
      profile.garmentKey === "additional:shirt:1" &&
      profile.code === "construction_unresolved",
  ),
  true,
  "An active additional occurrence without committed construction fails closed.",
);
const omittedAdditionalConstructionPlan = planFor({
  garmentTypeSelection: shirtSelection,
  physicalGarments: shirtOccurrences,
});
assert.equal(
  omittedAdditionalConstructionPlan.profiles.some(
    (profile) =>
      profile.status === "unresolved" &&
      profile.garmentKey === "additional:shirt:1" &&
      profile.code === "construction_unresolved",
  ),
  true,
  "An additional occurrence never inherits Step 1 construction when its occurrence map is omitted.",
);

console.log(
  "PASS: mixed-profile planning, occurrence construction, manual precedence, and candidate projection determinism",
);
