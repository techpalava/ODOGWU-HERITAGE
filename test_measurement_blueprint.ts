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
  getActiveFutureMeasurementEntered,
  getMeasurementPhysicalGarments,
  inchesToCentimetres,
  isFutureMeasurementEnteredBagEmpty,
  isFutureMeasurementSelectedPathInputComplete,
  isFutureMeasurementStageComplete,
  isFutureMeasurementStageUnlocked,
  isFutureSummaryUnlockedByMeasurements,
  isSelectedMeasurementRiskRoute,
  MEASUREMENT_RISK_ROUTE_LABELS,
  MEASUREMENT_RISK_SELECTION_NOTICE,
  migrateLegacyManualMeasurements,
  normalizeFutureMeasurementState,
  planMeasurementRequirements,
  projectActiveFutureMeasurementState,
  projectMeasurementRequirementsForPresentation,
  reconcileFutureMeasurementState,
  resolveMeasurementProfile,
  setFutureMeasurementInput,
  setFutureMeasurementRoute,
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
    `${profile.id} has the canonical height basis for Mid and High Risk routes`,
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
      field.minFactor,
      field.maxFactor,
      field.stdFactor,
      field.conditionalRule ?? null,
      field.alternativeGroup ?? null,
    ]),
  ])))
  .digest("hex");
assert.equal(markerDigest, "a0fd5d7d3920d6402fbbbb5618b5d8947e3839d3a436130f6e76810e5c69be4d");

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
  3,
  "Every garment profile keeps its own Height requirement instance.",
);
assert.equal(
  projectMeasurementRequirementsForPresentation({
    requirements: lowPlan.requirements,
  }).filter(({ measurementId }) => measurementId === "total_height").length,
  1,
  "Compatible shared manual Height instances render as one customer input.",
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
    false,
  );
  assert.equal(plan.canCalculate, true);
  assert.equal(
    plan.requirements.some((requirement) => requirement.measurementId === "total_height" && requirement.directInput),
    true,
    "Height remains an explicit calculation basis.",
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
    section: factorlessManualPlan.requirements.find(
      ({ measurementId }) => measurementId === "dress_length_long",
    )?.section,
  },
  { directInput: false, inputSource: "optional_manual", section: "optional" },
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
assert.equal(mediumState.calculationStatus, "complete");
assert.equal(
  Object.values(mediumState.derived.byGarmentKey).some((values) =>
    Object.values(values).some(
      (value) => value.provenance === "calculated_average_factor",
    ),
  ),
  true,
);

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
assert.equal(highState.calculationStatus, "complete");

const unmappedPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: selection,
  physicalGarments: [{ garmentKey: "kaftan:1", garmentType: "kaftan" }],
});
assert.equal(
  reconcileFutureMeasurementState({
    state: createEmptyFutureMeasurementState("low_risk"),
    plan: unmappedPlan,
  }).calculationStatus,
  "profile_mapping_pending",
);

const invalidState = setFutureMeasurementInput({
  state: createEmptyFutureMeasurementState("medium_risk"),
  requirement: factorlessManualPlan.requirements.find(
    ({ inputSource }) => inputSource === "optional_manual",
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
assert.notEqual(
  setFutureMeasurementRoute(mediumState, "high_risk").entered,
  mediumState.entered,
);
assert.equal(
  isFutureMeasurementEnteredBagEmpty(
    getActiveFutureMeasurementEntered(setFutureMeasurementRoute(mediumState, "high_risk")),
  ),
  true,
  "Switching route must not keep the previous route's active entered bag.",
);
assert.deepEqual(
  setFutureMeasurementRoute(mediumState, "high_risk").enteredByRoute?.medium_risk,
  mediumState.entered,
  "Previous-route values stay isolated in enteredByRoute.",
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
assert.equal(MEASUREMENT_FORMULA_VERSION, "height-average-factor-v1");
assert.equal(state.blueprintVersion, MEASUREMENT_BLUEPRINT_VERSION);

assert.deepEqual(MEASUREMENT_RISK_ROUTE_LABELS, {
  low_risk: "Low Risk",
  medium_risk: "Mid Risk",
  high_risk: "High Risk",
});
assert.equal(
  MEASUREMENT_RISK_SELECTION_NOTICE,
  "Choose one measurement risk level and complete only the measurements shown for your selected option.",
);

const unresolvedEmpty = createEmptyFutureMeasurementState();
assert.equal(unresolvedEmpty.route, null);
assert.equal(isSelectedMeasurementRiskRoute(unresolvedEmpty.route), false);
const unresolvedPlan = planMeasurementRequirements({
  route: unresolvedEmpty.route,
  garmentTypeSelection: selection,
  physicalGarments,
});
assert.equal(unresolvedPlan.requirements.length, 0);
const unresolvedReconciled = reconcileFutureMeasurementState({
  state: unresolvedEmpty,
  plan: unresolvedPlan,
});
assert.equal(unresolvedReconciled.calculationStatus, "incomplete");
assert.equal(isFutureMeasurementSelectedPathInputComplete(unresolvedReconciled), false);
assert.equal(isFutureMeasurementStageComplete(unresolvedReconciled), false);
assert.equal(isFutureSummaryUnlockedByMeasurements(unresolvedReconciled), false);

assert.equal(isFutureMeasurementSelectedPathInputComplete(state), true);
assert.equal(isFutureMeasurementStageComplete(state), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(state), true);
assert.equal(isFutureMeasurementSelectedPathInputComplete(mediumState), true);
assert.equal(isFutureMeasurementStageComplete(mediumState), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(mediumState), true);
assert.equal(isFutureMeasurementSelectedPathInputComplete(highState), true);
assert.equal(isFutureMeasurementStageComplete(highState), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(highState), true);

const lowOnlyField = lowPlan.requirements.find(
  (requirement) =>
    requirement.directInput &&
    !mediumPlan.requirements.some(
      (candidate) =>
        candidate.directInput &&
        candidate.garmentKey === requirement.garmentKey &&
        candidate.profileId === requirement.profileId &&
        candidate.measurementId === requirement.measurementId,
    ),
);
assert.ok(lowOnlyField, "Low Risk must require at least one field that Mid Risk does not.");
let switchedFromLow = setFutureMeasurementRoute(state, "medium_risk");
assert.equal(
  getActiveFutureMeasurementEntered(switchedFromLow).shared[lowOnlyField.measurementId] === undefined &&
    getActiveFutureMeasurementEntered(switchedFromLow).byGarmentKey[lowOnlyField.garmentKey || ""]?.[lowOnlyField.measurementId] === undefined,
  true,
  "Active Mid entered values must not include preserved Low-only fields.",
);
assert.equal(
  switchedFromLow.enteredByRoute?.low_risk.shared[lowOnlyField.measurementId] !== undefined ||
    switchedFromLow.enteredByRoute?.low_risk.byGarmentKey[lowOnlyField.garmentKey || ""]?.[lowOnlyField.measurementId] !== undefined,
  true,
  "Low-only values must remain preserved under Low after switching away.",
);
const switchedMediumPlan = planMeasurementRequirements({
  route: "medium_risk",
  garmentTypeSelection: selection,
  physicalGarments,
});
const switchedMediumReconciled = reconcileFutureMeasurementState({
  state: switchedFromLow,
  plan: switchedMediumPlan,
});
assert.equal(
  switchedMediumReconciled.diagnostics.some((diagnostic) =>
    diagnostic.measurementId === lowOnlyField.measurementId &&
    diagnostic.garmentKey === lowOnlyField.garmentKey &&
    diagnostic.profileId === lowOnlyField.profileId &&
    diagnostic.code === "required_measurement_missing",
  ),
  false,
  "Low-only missing/present fields must not be required while Mid Risk is active.",
);
assert.equal(switchedMediumReconciled.route, "medium_risk");

let incompleteMedium = reconcileFutureMeasurementState({
  state: createEmptyFutureMeasurementState("medium_risk", "cm"),
  plan: mediumPlan,
});
assert.equal(isFutureMeasurementSelectedPathInputComplete(incompleteMedium), false);
assert.equal(
  incompleteMedium.diagnostics.some((diagnostic) => diagnostic.code === "required_measurement_missing"),
  true,
);

const restoredLow = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(switchedFromLow, "low_risk"),
  plan: lowPlan,
});
assert.equal(isFutureMeasurementSelectedPathInputComplete(restoredLow), true);
assert.equal(isFutureMeasurementStageComplete(restoredLow), true);

const hydratedOldDraft = normalizeFutureMeasurementState({
  schemaVersion: 1,
  route: "low_risk",
  unit: "inch",
  entered: state.entered,
  derived: { shared: {}, byGarmentKey: {} },
  blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
  formulaVersion: MEASUREMENT_FORMULA_VERSION,
  inputFingerprint: "",
  calculationStatus: "complete",
  diagnostics: [],
  invalidInputKeys: [],
});
assert.equal(hydratedOldDraft?.route, "low_risk");
assert.deepEqual(hydratedOldDraft?.entered, state.entered);
assert.equal(
  isFutureMeasurementEnteredBagEmpty(hydratedOldDraft?.enteredByRoute?.medium_risk),
  true,
  "Legacy Low drafts must not smear entered values into Mid.",
);
assert.equal(
  isFutureMeasurementEnteredBagEmpty(hydratedOldDraft?.enteredByRoute?.high_risk),
  true,
  "Legacy Low drafts must not smear entered values into High.",
);
assert.deepEqual(hydratedOldDraft?.enteredByRoute?.low_risk, state.entered);

const hydratedUnresolved = normalizeFutureMeasurementState({
  schemaVersion: 1,
  route: null,
  unit: "inch",
  entered: state.entered,
  derived: { shared: {}, byGarmentKey: {} },
  blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
  formulaVersion: MEASUREMENT_FORMULA_VERSION,
  inputFingerprint: "",
  calculationStatus: "complete",
  diagnostics: [],
  invalidInputKeys: [],
});
assert.equal(hydratedUnresolved?.route, null);
assert.equal(
  isFutureMeasurementEnteredBagEmpty(hydratedUnresolved?.entered),
  true,
  "Unresolved legacy values must not be active.",
);
assert.deepEqual(hydratedUnresolved?.unassignedEntered, state.entered);
assert.equal(isFutureMeasurementEnteredBagEmpty(hydratedUnresolved?.enteredByRoute?.low_risk), true);
assert.equal(isFutureMeasurementEnteredBagEmpty(hydratedUnresolved?.enteredByRoute?.medium_risk), true);
assert.equal(isFutureMeasurementEnteredBagEmpty(hydratedUnresolved?.enteredByRoute?.high_risk), true);
assert.equal(
  isFutureMeasurementEnteredBagEmpty(
    getActiveFutureMeasurementEntered(setFutureMeasurementRoute(hydratedUnresolved!, "medium_risk")),
  ),
  true,
  "Selecting a route later must not guess that unassigned legacy values belong to it.",
);
assert.equal(
  reconcileFutureMeasurementState({
    state: hydratedUnresolved!,
    plan: planMeasurementRequirements({
      route: hydratedUnresolved!.route,
      garmentTypeSelection: selection,
      physicalGarments,
    }),
  }).calculationStatus,
  "incomplete",
  "Preserved values must not complete Measurement until a risk level is selected.",
);

const overlappingId = "chest_bust_circumference";
assert.ok(state.entered.shared[overlappingId], "Low Shirt must enter overlapping chest.");
assert.ok(
  mediumPlan.requirements.some(
    (requirement) => requirement.directInput && requirement.measurementId === overlappingId,
  ),
  "Mid Shirt must also require overlapping chest.",
);

const switchedToUntouchedMid = setFutureMeasurementRoute(state, "medium_risk");
assert.equal(switchedToUntouchedMid.entered.shared[overlappingId], undefined);
assert.equal(
  getActiveFutureMeasurementEntered(switchedToUntouchedMid).shared[overlappingId],
  undefined,
);
const untouchedMidReconciled = reconcileFutureMeasurementState({
  state: switchedToUntouchedMid,
  plan: mediumPlan,
});
assert.equal(isFutureMeasurementSelectedPathInputComplete(untouchedMidReconciled), false);
assert.equal(
  untouchedMidReconciled.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "required_measurement_missing" &&
      diagnostic.measurementId === overlappingId,
  ),
  true,
  "Overlapping Low chest must not satisfy Mid chest.",
);

const projectedUntouchedMid = projectActiveFutureMeasurementState({
  state: switchedToUntouchedMid,
  plan: mediumPlan,
});
assert.equal(projectedUntouchedMid.entered.shared[overlappingId], undefined);
assert.equal(
  isFutureMeasurementEnteredBagEmpty(projectedUntouchedMid.enteredByRoute?.low_risk),
  true,
  "Active projection must not include preserved Low values under another route.",
);

const midChestRequirement = mediumPlan.requirements.find(
  (requirement) => requirement.directInput && requirement.measurementId === overlappingId,
)!;
const midWithOwnChest = setFutureMeasurementInput({
  state: switchedToUntouchedMid,
  requirement: midChestRequirement,
  displayValue: 42,
});
assert.equal(midWithOwnChest.entered.shared[overlappingId]?.valueCm, inchesToCentimetres(42));
assert.equal(midWithOwnChest.enteredByRoute?.low_risk.shared[overlappingId]?.valueCm, state.entered.shared[overlappingId]?.valueCm);
assert.notEqual(
  midWithOwnChest.entered.shared[overlappingId]?.valueCm,
  state.entered.shared[overlappingId]?.valueCm,
);
assert.equal(
  setFutureMeasurementRoute(midWithOwnChest, "low_risk").entered.shared[overlappingId]?.valueCm,
  state.entered.shared[overlappingId]?.valueCm,
);
assert.equal(
  setFutureMeasurementRoute(
    setFutureMeasurementRoute(midWithOwnChest, "low_risk"),
    "medium_risk",
  ).entered.shared[overlappingId]?.valueCm,
  inchesToCentimetres(42),
);

const projectedMidOwnChest = projectActiveFutureMeasurementState({
  state: midWithOwnChest,
  plan: mediumPlan,
});
assert.equal(projectedMidOwnChest.entered.shared[overlappingId]?.valueCm, inchesToCentimetres(42));
assert.equal(projectedMidOwnChest.enteredByRoute?.low_risk.shared[overlappingId], undefined);

const projectedMediumFromEnumOnly = projectActiveFutureMeasurementState({
  state: { ...state, route: "medium_risk" },
  plan: mediumPlan,
});
assert.equal(projectedMediumFromEnumOnly.route, "medium_risk");
assert.equal(
  projectedMediumFromEnumOnly.entered.shared[overlappingId],
  undefined,
  "Changing only the route enum must not project Low-origin overlapping IDs as Mid.",
);
assert.equal(
  projectedMediumFromEnumOnly.entered.shared[lowOnlyField.measurementId] === undefined &&
    projectedMediumFromEnumOnly.entered.byGarmentKey[lowOnlyField.garmentKey || ""]?.[lowOnlyField.measurementId] === undefined,
  true,
  "Inactive Low / No Risk values must not project as active Mid Risk measurements.",
);
const projectedLow = projectActiveFutureMeasurementState({
  state,
  plan: lowPlan,
});
assert.equal(projectedLow.route, "low_risk");
assert.ok(Object.keys(projectedLow.entered.shared).length + Object.keys(projectedLow.entered.byGarmentKey).length > 0);
assert.equal(projectedLow.entered.shared[overlappingId]?.valueCm, state.entered.shared[overlappingId]?.valueCm);

const isolatedHydrated = normalizeFutureMeasurementState(JSON.parse(JSON.stringify(midWithOwnChest)));
assert.equal(isolatedHydrated?.route, "medium_risk");
assert.equal(isolatedHydrated?.entered.shared[overlappingId]?.valueCm, inchesToCentimetres(42));
assert.equal(
  isolatedHydrated?.enteredByRoute?.low_risk.shared[overlappingId]?.valueCm,
  state.entered.shared[overlappingId]?.valueCm,
);
assert.equal(
  setFutureMeasurementRoute(isolatedHydrated!, "low_risk").entered.shared[overlappingId]?.valueCm,
  state.entered.shared[overlappingId]?.valueCm,
);

console.log("PASS: authoritative measurement blueprint, planning, units, and state");
