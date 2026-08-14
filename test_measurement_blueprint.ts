import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  EXPECTED_MEASUREMENT_SOURCE_MARKER_COUNTS,
  MEASUREMENT_BLUEPRINT_VERSION,
  MEASUREMENT_DEFINITIONS,
  MEASUREMENT_FORMULA_VERSION,
  MEASUREMENT_PROFILES,
  MEASUREMENT_ROUTE_MARKER_STYLE,
} from "./src/config/MeasurementBlueprintConfig";
import type {
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  MeasurementRiskRoute,
} from "./src/types";
import {
  centimetresToInches,
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  inchesToCentimetres,
  isFutureMeasurementStageUnlocked,
  migrateLegacyManualMeasurements,
  normalizeFutureMeasurementState,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  resolveMeasurementProfile,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";
import { createDormantDesignStudioJourneyState } from "./src/utils/designStudioJourneyMode";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";

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

const selection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser", "skirt"],
  demographic: "female",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
    trouser: construction("trouser", "trouser_rope", "trouser_fastening"),
    skirt: construction("skirt", "skirt_long", "skirt_length"),
  },
};

assert.equal(MEASUREMENT_PROFILES.length, 13);
assert.deepEqual(MEASUREMENT_PROFILES.map(({ id }) => id), [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
]);
assert.equal(MEASUREMENT_PROFILES.some(({ id }) => ["N", "O"].includes(id)), false);
assert.equal(
  MEASUREMENT_PROFILES.flatMap(({ fields }) => fields).some(({ sourceRow }) => sourceRow >= 267),
  false,
);
assert.equal(JSON.stringify(MEASUREMENT_PROFILES).includes("#REF!"), false);
assert.equal(MEASUREMENT_DEFINITIONS.length, 38);
assert.equal(
  MEASUREMENT_DEFINITIONS.find(({ id }) => id === "total_height")
    ?.futureCalculationBasis,
  "height",
);
assert.deepEqual(MEASUREMENT_ROUTE_MARKER_STYLE, {
  conditionalFormattingRange: "G13:H405",
  rule: "containsText:Yes, Provide",
  fillArgb: "FF66FFCC",
  mediumRiskColumn: "G",
  highRiskColumn: "H",
});

for (const profile of MEASUREMENT_PROFILES) {
  for (const route of ["low_risk", "medium_risk", "high_risk"] as const) {
    assert.equal(
      profile.fields.filter(({ directRoutes }) => directRoutes.includes(route)).length,
      EXPECTED_MEASUREMENT_SOURCE_MARKER_COUNTS[profile.id][route],
      `${profile.id} ${route} source-marker count`,
    );
  }
  assert.equal(
    profile.fields.some(
      ({ measurementId, directRoutes }) =>
        measurementId === "total_height" &&
        directRoutes.includes("medium_risk") &&
        directRoutes.includes("high_risk"),
    ),
    true,
    `${profile.id} has the canonical height basis for pending routes`,
  );
}

const markerDigest = createHash("sha256")
  .update(JSON.stringify(MEASUREMENT_PROFILES.map((profile) => [
    profile.id,
    profile.fields.map((field) => [
      field.sourceRow,
      field.measurementId,
      field.directRoutes,
      field.averageFactor,
      field.conditionalRule ?? null,
      field.alternativeGroup ?? null,
    ]),
  ])))
  .digest("hex");
assert.equal(markerDigest, "d7446e38d46e2d41be65c5cf0aa8ec3dd30cd547fa6b5b553c6f3784f76fbf7c");

assert.equal(
  MEASUREMENT_PROFILES.find(({ id }) => id === "A")?.fields.find(
    ({ measurementId }) => measurementId === "total_height",
  )?.averageFactor,
  1,
);
assert.equal(
  MEASUREMENT_PROFILES.find(({ id }) => id === "G")?.fields.find(
    ({ measurementId }) => measurementId === "dress_length_long",
  )?.factorStatus,
  "missing",
);
assert.equal(
  MEASUREMENT_PROFILES.find(({ id }) => id === "I")?.fields.find(
    ({ measurementId }) => measurementId === "waist_to_feet_back_length",
  )?.averageFactor,
  null,
);
assert.equal(
  MEASUREMENT_PROFILES.find(({ id }) => id === "E")?.fields.find(
    ({ measurementId }) => measurementId === "under_bust_circumference",
  )?.conditionalRule,
  "applicability_unresolved",
);
assert.equal(
  MEASUREMENT_PROFILES.find(({ id }) => id === "B")?.fields.filter(
    ({ alternativeGroup }) => alternativeGroup === "B_sleeve_length",
  ).length,
  2,
);

const shirtResolution = resolveMeasurementProfile({
  garment: { garmentKey: "shirt:1", garmentType: "shirt" },
  garmentTypeSelection: selection,
});
assert.equal(shirtResolution.status, "resolved");
assert.equal(shirtResolution.status === "resolved" && shirtResolution.profile.id, "A");
assert.equal(
  resolveMeasurementProfile({
    garment: { garmentKey: "kaftan:1", garmentType: "kaftan" },
    garmentTypeSelection: selection,
  }).status,
  "unmapped",
);
for (const garmentType of ["kaftan", "full_length_gown", "agbada"] as const) {
  const result = resolveMeasurementProfile({
    garment: { garmentKey: `${garmentType}:1`, garmentType },
    garmentTypeSelection: selection,
  });
  assert.equal(result.status, "unmapped");
}

const maleBumSelection: GarmentTypeStepSelection = {
  garmentTypes: ["bum_shorts"],
  demographic: "male",
  constructionByGarment: {
    bum_shorts: construction("bum_shorts", "bum_rope", "bum_shorts_fastening"),
  },
};
assert.equal(
  resolveMeasurementProfile({
    garment: { garmentKey: "bum:1", garmentType: "bum_shorts" },
    garmentTypeSelection: maleBumSelection,
  }).status,
  "unresolved",
);

const physicalGarments = getMeasurementPhysicalGarments({
  garmentTypeSelection: selection,
  fabricGarments: [
    { garmentKey: "shirt:1", garmentType: "shirt", code: "shirt", fabricUnits: 1 },
    { garmentKey: "trouser:1", garmentType: "trouser", code: "trouser", fabricUnits: 1 },
    { garmentKey: "skirt:1", garmentType: "skirt", code: "skirt", fabricUnits: 1 },
  ],
});
const lowPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: selection,
  physicalGarments,
});
assert.equal(
  lowPlan.requirements.filter(({ measurementId }) => measurementId === "total_height").length,
  1,
  "Shared body measurements must be deduplicated for one wearer.",
);
assert.equal(
  lowPlan.requirements.filter(({ measurementId }) =>
    ["shirt_length_standard", "waist_to_ankle_length"].includes(measurementId),
  ).every(({ scope, garmentKey }) => scope === "garment" && Boolean(garmentKey)),
  true,
);
assert.equal(
  lowPlan.diagnostics.some(({ code }) => code === "applicability_unresolved"),
  false,
  "Profile M has no unresolved alternative group.",
);

for (const route of ["medium_risk", "high_risk"] as MeasurementRiskRoute[]) {
  const plan = planMeasurementRequirements({
    route,
    garmentTypeSelection: selection,
    physicalGarments,
  });
  assert.equal(
    plan.diagnostics.some(({ code }) => code === "calculation_configuration_pending"),
    true,
  );
  assert.equal(plan.canCalculate, false);
  assert.equal(
    plan.requirements.some((requirement) => requirement.measurementId === "total_height" && requirement.directInput),
    true,
    "Height remains an explicit future-calculation basis.",
  );
}

const longDressSelection: GarmentTypeStepSelection = {
  garmentTypes: ["dress"],
  demographic: "female",
  constructionByGarment: {
    dress: construction("dress", "dress_long_short", "dress_construction"),
  },
};
const factorlessManualPlan = planMeasurementRequirements({
  route: "medium_risk",
  garmentTypeSelection: longDressSelection,
  physicalGarments: [{ garmentKey: "dress:1", garmentType: "dress" }],
});
assert.deepEqual(
  factorlessManualPlan.requirements.find(
    ({ measurementId }) => measurementId === "dress_length_long",
  ) && {
    directInput: factorlessManualPlan.requirements.find(
      ({ measurementId }) => measurementId === "dress_length_long",
    )?.directInput,
    inputSource: factorlessManualPlan.requirements.find(
      ({ measurementId }) => measurementId === "dress_length_long",
    )?.inputSource,
  },
  { directInput: true, inputSource: "factorless_manual" },
);

let state = createEmptyFutureMeasurementState("low_risk", "inch");
for (const requirement of lowPlan.requirements.filter(({ directInput }) => directInput)) {
  state = setFutureMeasurementInput({ state, requirement, displayValue: 10 });
}
state = reconcileFutureMeasurementState({ state, plan: lowPlan });
assert.equal(state.calculationStatus, "complete");
assert.equal(Object.keys(state.derived.shared).length, 0);
assert.equal(
  Object.values(state.entered.shared).every(({ provenance }) => provenance === "customer_entered"),
  true,
);

const staleState: FutureMeasurementStateV1 = {
  ...state,
  inputFingerprint: "old",
  derived: {
    shared: { total_height: { valueCm: 180, provenance: "system_derived" } },
    byGarmentKey: {},
  },
  invalidInputKeys: [],
};
assert.deepEqual(
  reconcileFutureMeasurementState({ state: staleState, plan: lowPlan }).derived,
  { shared: {}, byGarmentKey: {} },
);

const mediumPlan = planMeasurementRequirements({
  route: "medium_risk",
  garmentTypeSelection: selection,
  physicalGarments,
});
let mediumState = createEmptyFutureMeasurementState("medium_risk", "cm");
for (const requirement of mediumPlan.requirements.filter(({ directInput }) => directInput)) {
  mediumState = setFutureMeasurementInput({ state: mediumState, requirement, displayValue: 10 });
}
mediumState = reconcileFutureMeasurementState({ state: mediumState, plan: mediumPlan });
assert.equal(mediumState.calculationStatus, "calculation_formula_pending");
assert.equal(Object.keys(mediumState.derived.shared).length, 0);

const highPlan = planMeasurementRequirements({
  route: "high_risk",
  garmentTypeSelection: selection,
  physicalGarments,
});
let highState = createEmptyFutureMeasurementState("high_risk", "cm");
for (const requirement of highPlan.requirements.filter(({ directInput }) => directInput)) {
  highState = setFutureMeasurementInput({ state: highState, requirement, displayValue: 10 });
}
highState = reconcileFutureMeasurementState({ state: highState, plan: highPlan });
assert.equal(highState.calculationStatus, "calculation_formula_pending");

const unmappedPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: selection,
  physicalGarments: [{ garmentKey: "kaftan:1", garmentType: "kaftan" }],
});
assert.equal(
  reconcileFutureMeasurementState({
    state: createEmptyFutureMeasurementState(),
    plan: unmappedPlan,
  }).calculationStatus,
  "profile_mapping_pending",
);

const invalidState = setFutureMeasurementInput({
  state: createEmptyFutureMeasurementState(),
  requirement: factorlessManualPlan.requirements.find(
    ({ inputSource }) => inputSource === "factorless_manual",
  )!,
  displayValue: 0,
});
assert.equal(
  reconcileFutureMeasurementState({ state: invalidState, plan: factorlessManualPlan }).calculationStatus,
  "invalid",
);

const inches = 70.25;
assert.ok(Math.abs(centimetresToInches(inchesToCentimetres(inches)) - inches) < 1e-10);
const roundTripped = normalizeFutureMeasurementState(JSON.parse(JSON.stringify(state)));
assert.deepEqual(roundTripped?.entered, state.entered);
assert.equal(normalizeFutureMeasurementState({ schemaVersion: 1, route: "unknown" }), null);
const legacyMeasurements = {
  neck: 15,
  shoulder: 18,
  chest: 40,
  waist: 34,
  hip: 40,
  sleeve: 24,
  trouserLength: 42,
  height: 178,
  weight: 80,
  age: 35,
  bodyBuild: "Average" as const,
  fitPreference: "Standard" as const,
  isAiEstimated: false,
  unit: "inch" as const,
};
assert.equal(
  migrateLegacyManualMeasurements(legacyMeasurements, "ai"),
  null,
  "Legacy AI measurements must never complete future Step 6.",
);
const migratedLegacyManual = migrateLegacyManualMeasurements(
  legacyMeasurements,
  "manual",
);
assert.equal(migratedLegacyManual?.entered.shared.total_height?.valueCm, 178);
assert.equal(migratedLegacyManual?.entered.shared.neck_circumference?.valueCm, 38.1);
assert.deepEqual(
  normalizeFutureMeasurementState(JSON.parse(JSON.stringify(mediumState)))?.entered,
  mediumState.entered,
  "Formula-pending Mid Risk inputs survive draft JSON persistence.",
);
assert.deepEqual(
  normalizeFutureMeasurementState(JSON.parse(JSON.stringify(highState)))?.entered,
  highState.entered,
  "Formula-pending High Risk inputs survive draft JSON persistence.",
);
assert.deepEqual(
  { ...mediumState, route: "high_risk" as const }.entered,
  mediumState.entered,
  "Changing route preserves entered values for later reconciliation.",
);

const catalog = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const journeySelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};
assert.equal(
  createDormantDesignStudioJourneyState({
    mode: "future_nine_stage",
    persistedDraft: {
      currentStageId: "measurement",
      garmentTypeSelection: journeySelection,
      aiTryOnWorkflow: { schemaVersion: 1, status: "skipped", inputFingerprint: "x" },
    },
    normalizedCustomDetailCatalog: catalog.activeOptions,
    isFabricStageComplete: true,
    isCustomDetailsStageReady: true,
  }).currentStageId,
  "measurement",
);
assert.equal(
  createDormantDesignStudioJourneyState({
    mode: "future_nine_stage",
    persistedDraft: {
      currentStageId: "measurement",
      garmentTypeSelection: journeySelection,
      aiTryOnWorkflow: { schemaVersion: 1, status: "unavailable", inputFingerprint: "x" },
    },
    normalizedCustomDetailCatalog: catalog.activeOptions,
    isFabricStageComplete: true,
    isCustomDetailsStageReady: true,
  }).currentStageId === "measurement",
  false,
);
assert.equal(
  isFutureMeasurementStageUnlocked({ schemaVersion: 1, status: "completed", inputFingerprint: "x", resultReference: { kind: "verified_private_try_on_result", assetId: "a", ownerBindingId: "u" } }),
  true,
);
assert.equal(MEASUREMENT_FORMULA_VERSION, null);
assert.equal(state.blueprintVersion, MEASUREMENT_BLUEPRINT_VERSION);

console.log("PASS: authoritative measurement blueprint, planning, units, and state");
