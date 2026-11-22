import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import type {
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  GuestDesignDraft,
  MeasurementMethodId,
  WearerOrderStateV2,
} from "./src/types";
import { FUTURE_PICKUP_ATELIER_WHATSAPP_URL } from "./src/utils/designStudioFutureShipping";
import {
  buildAiTryOnFitHints,
  buildAiTryOnFitHintsForWearer,
} from "./src/utils/aiTryOnFitHints";
import { migrateLegacyAgbadaActiveDraft } from "./src/utils/legacyAgbadaActiveDraftMigration";
import {
  classifyFutureMeasurementHydration,
  createEmptyFutureMeasurementState,
  getActiveFutureMeasurementEntered,
  isFutureMeasurementEnteredBagEmpty,
  isFutureMeasurementSelectedPathInputComplete,
  isFutureMeasurementStageComplete,
  isOnsitePhysicalMeasurementMethod,
  isSelectedMeasurementMethod,
  isSelectedMeasurementRiskRoute,
  isTryOnUnlockedByMeasurements,
  MEASUREMENT_METHOD_LABELS,
  MEASUREMENT_METHOD_STAFF_LABELS,
  MEASUREMENT_ONSITE_ACKNOWLEDGEMENT_LABEL,
  MEASUREMENT_ONSITE_BOOKING_INSTRUCTION,
  MEASUREMENT_ONSITE_BOOKING_REASON,
  MEASUREMENT_ONSITE_PHYSICAL_LABEL,
  MEASUREMENT_ONSITE_PHYSICAL_METHOD,
  MEASUREMENT_ONSITE_WHATSAPP_BUTTON_LABEL,
  normalizeFutureMeasurementState,
  planMeasurementRequirements,
  projectActiveFutureMeasurementState,
  reconcileFutureMeasurementState,
  resolvePersistedFutureMeasurementState,
  setFutureMeasurementInput,
  setFutureMeasurementOnsiteAcknowledged,
  setFutureMeasurementRoute,
} from "./src/utils/measurementBlueprint";
import {
  addWearer,
  assignGarmentToWearer,
  createEmptyWearerOrder,
  isWearerOrderMeasurementComplete,
  normalizeWearerOrderState,
  planWearerOrderMeasurements,
  removeGarmentFromWearerOrder,
  summarizeWearerOrderMeasurementCompletion,
  updateWearerMeasurement,
} from "./src/utils/wearerOrder";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const twoShirtSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};
const twoShirtGarments = [
  { garmentKey: "shirt:1", garmentType: "shirt" as const },
  { garmentKey: "shirt:2", garmentType: "shirt" as const },
];

const collectText = (node: { children?: unknown } | string | number | boolean | null | undefined): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node !== "object") return "";
  const children = Array.isArray(node.children) ? node.children : node.children != null ? [node.children] : [];
  return children.map((child) => collectText(child as never)).join("");
};

// ---------------------------------------------------------------------------
// 0. Canonical method identity & labels
// ---------------------------------------------------------------------------
assert.equal(MEASUREMENT_ONSITE_PHYSICAL_METHOD, "onsite_physical");
assert.equal(MEASUREMENT_ONSITE_PHYSICAL_LABEL, "Onsite Physical Measurements");
assert.equal(MEASUREMENT_METHOD_LABELS.onsite_physical, "Onsite Physical Measurements");
assert.equal(MEASUREMENT_METHOD_STAFF_LABELS.onsite_physical, "Onsite Physical Measurements");
assert.equal(isSelectedMeasurementMethod("onsite_physical"), true);
assert.equal(isSelectedMeasurementRiskRoute("onsite_physical"), false);
assert.equal(isOnsitePhysicalMeasurementMethod("onsite_physical"), true);

// ---------------------------------------------------------------------------
// 1. Old-draft compatibility (DOMAIN_INVARIANTS.md §6)
// Genuinely omits enteredByRoute.onsite_physical AND onsiteBookingAcknowledged
// ---------------------------------------------------------------------------
const oldDraftRaw = {
  schemaVersion: 1,
  route: "low_risk",
  unit: "cm",
  entered: {
    shared: {
      total_height: { valueCm: 178, provenance: "customer_entered" },
    },
    byGarmentKey: {},
  },
  enteredByRoute: {
    low_risk: {
      shared: {
        total_height: { valueCm: 178, provenance: "customer_entered" },
      },
      byGarmentKey: {},
    },
    medium_risk: { shared: {}, byGarmentKey: {} },
    high_risk: { shared: {}, byGarmentKey: {} },
    critical_risk: { shared: {}, byGarmentKey: {} },
    sample_cloth: { shared: {}, byGarmentKey: {} },
    // onsite_physical intentionally omitted
  },
  derived: { shared: {}, byGarmentKey: {} },
  blueprintVersion: "measurement-blueprint-v1",
  formulaVersion: null,
  inputFingerprint: "old-fp",
  calculationStatus: "incomplete",
  diagnostics: [],
  invalidInputKeys: [],
  invalidInputKeysByRoute: {
    low_risk: [],
    medium_risk: [],
    high_risk: [],
    critical_risk: [],
    sample_cloth: [],
    // onsite_physical intentionally omitted
  },
  // onsiteBookingAcknowledged intentionally omitted
};
const oldHydration = classifyFutureMeasurementHydration(oldDraftRaw);
assert.equal(oldHydration.status, "valid", "Old draft without onsite_physical or onsiteBookingAcknowledged must normalize cleanly");
if (oldHydration.status !== "valid") throw new Error("Expected valid hydration");
assert.equal(oldHydration.state.schemaVersion, 1);
assert.equal(oldHydration.state.route, "low_risk");
assert.equal(oldHydration.state.onsiteBookingAcknowledged, false);
assert.equal(oldHydration.state.entered.shared.total_height?.valueCm, 178);
assert.deepEqual(oldHydration.state.enteredByRoute?.onsite_physical, { shared: {}, byGarmentKey: {} });
assert.deepEqual(oldHydration.state.invalidInputKeysByRoute?.onsite_physical, []);

// ---------------------------------------------------------------------------
// 2. Fail-closed malformed state (non-boolean onsiteBookingAcknowledged & bad bag)
// ---------------------------------------------------------------------------
for (const malformedAck of ["true", "false", 1, 0, null, {}, []]) {
  const malformedRaw = {
    ...oldDraftRaw,
    route: "onsite_physical",
    onsiteBookingAcknowledged: malformedAck,
  };
  assert.equal(
    normalizeFutureMeasurementState(malformedRaw),
    null,
    `Malformed onsiteBookingAcknowledged (${JSON.stringify(malformedAck)}) must fail closed`,
  );
  const hydration = classifyFutureMeasurementHydration(malformedRaw);
  assert.equal(hydration.status, "invalid");
  assert.equal(
    resolvePersistedFutureMeasurementState({
      hydration,
      reconciled: createEmptyFutureMeasurementState(),
    }),
    malformedRaw,
    "Invalid hydration must preserve raw draft without overwriting",
  );
}

const malformedOnsiteBag = {
  ...oldDraftRaw,
  enteredByRoute: {
    ...oldDraftRaw.enteredByRoute,
    onsite_physical: "corrupted",
  },
};
assert.equal(
  normalizeFutureMeasurementState(malformedOnsiteBag),
  null,
  "Malformed enteredByRoute.onsite_physical must fail closed",
);

// ---------------------------------------------------------------------------
// 3. Completion & unlock gate (0 numbers required, gated on checkbox, reload)
// ---------------------------------------------------------------------------
const onsitePlan = planMeasurementRequirements({
  route: "onsite_physical",
  garmentTypeSelection: shirtSelection,
  physicalGarments: shirtGarments,
});
assert.equal(onsitePlan.route, "onsite_physical");
assert.equal(onsitePlan.requirements.length, 0);
assert.equal(onsitePlan.diagnostics.length, 0);
assert.equal(onsitePlan.canCalculate, false);

const onsiteUnacked = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "onsite_physical"),
  plan: onsitePlan,
});
assert.equal(onsiteUnacked.calculationStatus, "incomplete");
assert.equal(onsiteUnacked.onsiteBookingAcknowledged, false);
assert.equal(isFutureMeasurementStageComplete(onsiteUnacked), false);
assert.equal(isTryOnUnlockedByMeasurements(onsiteUnacked), false);
assert.equal(isFutureMeasurementSelectedPathInputComplete(onsiteUnacked), false);
assert.deepEqual(
  onsiteUnacked.diagnostics.map((d) => d.code),
  ["onsite_booking_acknowledgement_required"],
);

const onsiteAcked = reconcileFutureMeasurementState({
  state: setFutureMeasurementOnsiteAcknowledged(onsiteUnacked, true),
  plan: onsitePlan,
});
assert.equal(onsiteAcked.calculationStatus, "complete");
assert.equal(onsiteAcked.onsiteBookingAcknowledged, true);
assert.equal(onsiteAcked.diagnostics.length, 0);
assert.equal(isFutureMeasurementStageComplete(onsiteAcked), true);
assert.equal(isTryOnUnlockedByMeasurements(onsiteAcked), true);
assert.equal(isFutureMeasurementSelectedPathInputComplete(onsiteAcked), true);
assert.equal(isFutureMeasurementEnteredBagEmpty(onsiteAcked.entered), true);

// Reload round-trip preserves acknowledgement and completion
const reloadedRaw = JSON.parse(JSON.stringify(onsiteAcked));
const reloadedNorm = normalizeFutureMeasurementState(reloadedRaw);
assert.ok(reloadedNorm);
assert.equal(reloadedNorm.route, "onsite_physical");
assert.equal(reloadedNorm.onsiteBookingAcknowledged, true);
const reloadedReconciled = reconcileFutureMeasurementState({
  state: reloadedNorm,
  plan: onsitePlan,
});
assert.equal(reloadedReconciled.calculationStatus, "complete");
assert.equal(isTryOnUnlockedByMeasurements(reloadedReconciled), true);

// Unchecking re-locks Continue
const onsiteReUnchecked = reconcileFutureMeasurementState({
  state: setFutureMeasurementOnsiteAcknowledged(reloadedReconciled, false),
  plan: onsitePlan,
});
assert.equal(onsiteReUnchecked.calculationStatus, "incomplete");
assert.equal(onsiteReUnchecked.onsiteBookingAcknowledged, false);
assert.equal(isTryOnUnlockedByMeasurements(onsiteReUnchecked), false);

// Active projection stays clean for onsite_physical
const projectedOnsite = projectActiveFutureMeasurementState({
  state: onsiteAcked,
  plan: onsitePlan,
});
assert.equal(projectedOnsite.route, "onsite_physical");
assert.equal(projectedOnsite.onsiteBookingAcknowledged, true);
assert.equal(isFutureMeasurementEnteredBagEmpty(projectedOnsite.entered), true);

// ---------------------------------------------------------------------------
// 4. Method isolation (no silent copy/wipe between low_risk, sample_cloth, onsite_physical)
// ---------------------------------------------------------------------------
const lowPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments: shirtGarments,
});
const samplePlan = planMeasurementRequirements({
  route: "sample_cloth",
  garmentTypeSelection: shirtSelection,
  physicalGarments: shirtGarments,
});
const heightReq = lowPlan.requirements.find((r) => r.measurementId === "total_height")!;
const chestLowReq = lowPlan.requirements.find((r) => r.measurementId === "chest_bust_circumference")!;
const chestSampleReq = samplePlan.requirements.find((r) => r.measurementId === "chest_bust_circumference")!;

let isoState = createEmptyFutureMeasurementState("low_risk", "cm");
isoState = setFutureMeasurementInput({ state: isoState, requirement: heightReq, displayValue: 180 });
isoState = setFutureMeasurementInput({ state: isoState, requirement: chestLowReq, displayValue: -5 }); // invalid key on low_risk
isoState = reconcileFutureMeasurementState({ state: isoState, plan: lowPlan });
assert.equal(isoState.calculationStatus, "invalid");
assert.equal(isoState.invalidInputKeys.length, 1);

// Enter a sample_cloth value too
isoState = setFutureMeasurementRoute(isoState, "sample_cloth");
isoState = setFutureMeasurementInput({ state: isoState, requirement: chestSampleReq, displayValue: 52 });
isoState = reconcileFutureMeasurementState({ state: isoState, plan: samplePlan });
assert.equal(isoState.entered.shared.chest_bust_circumference?.valueCm, 52);

// Switch to onsite_physical: invalid low_risk key and sample_cloth value must NOT affect onsite validation
isoState = setFutureMeasurementRoute(isoState, "onsite_physical");
isoState = setFutureMeasurementOnsiteAcknowledged(isoState, true);
isoState = reconcileFutureMeasurementState({ state: isoState, plan: onsitePlan });
assert.equal(isoState.calculationStatus, "complete");
assert.equal(isoState.invalidInputKeys.length, 0);
assert.equal(isFutureMeasurementEnteredBagEmpty(getActiveFutureMeasurementEntered(isoState)), true);
assert.equal(isoState.enteredByRoute?.low_risk.shared.total_height?.valueCm, 180);
assert.equal(isoState.enteredByRoute?.sample_cloth.shared.chest_bust_circumference?.valueCm, 52);

// Switch back to low_risk: entered value & invalid key are intact; onsiteBookingAcknowledged does NOT complete low_risk
isoState = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(isoState, "low_risk"),
  plan: lowPlan,
});
assert.equal(isoState.route, "low_risk");
assert.equal(isoState.entered.shared.total_height?.valueCm, 180);
assert.equal(isoState.invalidInputKeys.length, 1);
assert.equal(isoState.calculationStatus, "invalid");
assert.equal(isTryOnUnlockedByMeasurements(isoState), false);

// Switch back to sample_cloth: entered sample value is intact
isoState = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(isoState, "sample_cloth"),
  plan: samplePlan,
});
assert.equal(isoState.entered.shared.chest_bust_circumference?.valueCm, 52);
assert.equal(isTryOnUnlockedByMeasurements(isoState), false);

// ---------------------------------------------------------------------------
// 5. Multi-wearer isolation
// Wearer 1 = onsite_physical + acknowledged, Wearer 2 = low_risk incomplete -> LOCKED
// Completing Wearer 2 -> UNLOCKED
// ---------------------------------------------------------------------------
let wearerOrder: WearerOrderStateV2 = createEmptyWearerOrder();
const add1 = addWearer({
  order: wearerOrder,
  physicalGarmentCount: 2,
  displayName: "Chief",
  fitContext: "male",
});
assert.equal(add1.status, "updated");
wearerOrder = add1.order;
const w1 = wearerOrder.wearers[0]!.wearerId;

const add2 = addWearer({
  order: wearerOrder,
  physicalGarmentCount: 2,
  displayName: "Ada",
  fitContext: "male",
});
assert.equal(add2.status, "updated");
wearerOrder = add2.order;
const w2 = wearerOrder.wearers[1]!.wearerId;

const assign1 = assignGarmentToWearer({
  order: wearerOrder,
  garmentKey: "shirt:1",
  wearerId: w1,
  garment: twoShirtGarments[0]!,
  garmentTypeSelection: twoShirtSelection,
});
assert.equal(assign1.status, "updated");
wearerOrder = assign1.order;
const assign2 = assignGarmentToWearer({
  order: wearerOrder,
  garmentKey: "shirt:2",
  wearerId: w2,
  garment: twoShirtGarments[1]!,
  garmentTypeSelection: twoShirtSelection,
});
assert.equal(assign2.status, "updated");
wearerOrder = assign2.order;

wearerOrder = updateWearerMeasurement(
  wearerOrder,
  w1,
  setFutureMeasurementOnsiteAcknowledged(
    setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "onsite_physical"),
    true,
  ),
);
wearerOrder = updateWearerMeasurement(
  wearerOrder,
  w2,
  setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk"),
);

const runtimesMixed = planWearerOrderMeasurements({
  order: wearerOrder,
  garmentTypeSelection: twoShirtSelection,
  physicalGarments: twoShirtGarments,
});
const summaryMixed = summarizeWearerOrderMeasurementCompletion({
  order: wearerOrder,
  runtimes: runtimesMixed,
  physicalGarmentKeys: ["shirt:1", "shirt:2"],
});
assert.equal(summaryMixed.byWearerId?.[w1]?.complete, true);
assert.equal(summaryMixed.byWearerId?.[w1]?.requiredCount, 0);
assert.equal(summaryMixed.byWearerId?.[w2]?.complete, false);
assert.equal(summaryMixed.complete, false, "Order must stay locked while Wearer 2 is incomplete");
assert.equal(
  isWearerOrderMeasurementComplete({
    order: wearerOrder,
    runtimes: runtimesMixed,
    physicalGarmentKeys: ["shirt:1", "shirt:2"],
  }),
  false,
);

// Now complete Wearer 2 (using onsite_physical + acknowledged too, or filling low_risk)
const w2Plan = runtimesMixed.find((r) => r.wearerId === w2)!.plan;
let w2CompleteState = wearerOrder.wearers.find((w) => w.wearerId === w2)!.measurement;
for (const req of w2Plan.requirements.filter((r) => r.directInput)) {
  w2CompleteState = setFutureMeasurementInput({
    state: w2CompleteState,
    requirement: req,
    displayValue: req.measurementId === "total_height" ? 175 : 45,
  });
}
wearerOrder = updateWearerMeasurement(wearerOrder, w2, w2CompleteState);
const runtimesBothComplete = planWearerOrderMeasurements({
  order: wearerOrder,
  garmentTypeSelection: twoShirtSelection,
  physicalGarments: twoShirtGarments,
});
assert.equal(
  isWearerOrderMeasurementComplete({
    order: wearerOrder,
    runtimes: runtimesBothComplete,
    physicalGarmentKeys: ["shirt:1", "shirt:2"],
  }),
  true,
  "Order must unlock once both Wearer 1 (onsite) and Wearer 2 (low_risk) are complete",
);

// Reload wearer order round-trip
const normalizedWearerOrder = normalizeWearerOrderState(JSON.parse(JSON.stringify(wearerOrder)));
assert.ok(normalizedWearerOrder);
assert.equal(normalizedWearerOrder.wearers[0]?.measurement.route, "onsite_physical");
assert.equal(normalizedWearerOrder.wearers[0]?.measurement.onsiteBookingAcknowledged, true);

// ---------------------------------------------------------------------------
// 6. Pre-normalizer & cleanup paths + aiTryOnFitHints
// ---------------------------------------------------------------------------
// 6a. aiTryOnFitHints must return [] for onsite_physical (even if bags contain stale values)
assert.deepEqual(
  buildAiTryOnFitHints({
    measurement: {
      ...onsiteAcked,
      entered: {
        shared: { total_height: { valueCm: 180, provenance: "customer_entered" } },
        byGarmentKey: {},
      },
    },
    garmentKeys: ["shirt:1"],
  }),
  [],
);
assert.deepEqual(
  buildAiTryOnFitHintsForWearer({
    wearerOrder,
    wearerId: w1,
  }),
  [],
);

// 6b. removeGarmentFromWearerOrder on an OLD pre-normalized WearerOrderStateV2 missing enteredByRoute.onsite_physical
const oldPreNormalizedWearerOrder = {
  schemaVersion: 2,
  wearers: [
    {
      wearerId: "w-old",
      displayName: "Legacy",
      fitContext: "male",
      presentationOrder: 0,
      measurement: oldDraftRaw,
    },
  ],
  assignmentByGarmentKey: { "shirt:1": "w-old", "shirt:2": "w-old" },
} as unknown as WearerOrderStateV2;
const strippedOldOrder = removeGarmentFromWearerOrder(oldPreNormalizedWearerOrder, "shirt:2");
assert.equal(strippedOldOrder.assignmentByGarmentKey["shirt:2"], undefined);
assert.equal(strippedOldOrder.assignmentByGarmentKey["shirt:1"], "w-old");
assert.deepEqual(strippedOldOrder.wearers[0]?.measurement.enteredByRoute?.onsite_physical, {
  shared: {},
  byGarmentKey: {},
});

// 6c. legacyAgbadaActiveDraftMigration preserves onsiteBookingAcknowledged and cleans up safely
const agbadaOnsiteDraft = {
  currentStep: 6,
  currentStageId: "measurement",
  garmentTypeSelection: {
    garmentTypes: ["shirt", "agbada"],
    demographic: "male",
    constructionByGarment: {
      shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
    },
  },
  selectedFabricCode: null,
  selectedStyleId: null,
  designSource: null,
  confirmedStyleId: null,
  confirmedDesignSourceKey: null,
  priceActivatedFabricCode: null,
  selectedGarment: null,
  designSelections: {},
  futureMeasurementState: onsiteAcked,
  pricingBreakdown: {},
  shippingSnapshot: {},
  garmentPieceCount: 2,
} as unknown as GuestDesignDraft;
const agbadaMigration = migrateLegacyAgbadaActiveDraft(agbadaOnsiteDraft);
assert.equal(agbadaMigration.changed, true);
assert.equal(
  (agbadaMigration.draft.futureMeasurementState as FutureMeasurementStateV1).route,
  "onsite_physical",
);
assert.equal(
  (agbadaMigration.draft.futureMeasurementState as FutureMeasurementStateV1)
    .onsiteBookingAcknowledged,
  true,
);

// ---------------------------------------------------------------------------
// 7. Step 6 UI details (DormantFutureMeasurementStep)
// ---------------------------------------------------------------------------
const StepHarness = ({
  initialState = createEmptyFutureMeasurementState(),
}: {
  initialState?: FutureMeasurementStateV1;
}) => {
  const [state, setState] = useState(initialState);
  const plan = planMeasurementRequirements({
    route: state.route,
    garmentTypeSelection: shirtSelection,
    physicalGarments: shirtGarments,
  });
  const reconciled = reconcileFutureMeasurementState({ state, plan });
  return createElement(DormantFutureMeasurementStep, {
    plan,
    state: reconciled,
    physicalGarments: shirtGarments,
    onChange: setState,
    onRouteChange: (route: MeasurementMethodId) => {
      setState((current) => setFutureMeasurementRoute(current, route));
    },
    onBack: () => undefined,
    onContinue: () => undefined,
  });
};

let renderer!: ReactTestRenderer;
act(() => {
  renderer = create(createElement(StepHarness));
});

const getContinueButtons = () =>
  renderer.root.findAllByProps({ "aria-label": "Continue to AI Try-on" });

// Initially no method selected; WhatsApp link exists outside radio label, Option 4 disabled
const alternateSection = renderer.root.findByProps({
  "data-measurement-option-section": "alternate_contact",
});
const whatsappLink = alternateSection.findByProps({ "data-measurement-onsite-whatsapp": "true" });
assert.equal(whatsappLink.type, "a");
assert.equal(whatsappLink.props.href, FUTURE_PICKUP_ATELIER_WHATSAPP_URL);
assert.equal(whatsappLink.props.href, "https://wa.me/31644533190");
assert.equal(whatsappLink.props.target, "_blank");
assert.equal(whatsappLink.props.rel, "noopener noreferrer");
assert.equal(whatsappLink.props.onClick, undefined);
assert.match(String(whatsappLink.props.className), /min-h-11/);
assert.equal(collectText(whatsappLink), MEASUREMENT_ONSITE_WHATSAPP_BUTTON_LABEL);
assert.ok(collectText(alternateSection).includes(MEASUREMENT_ONSITE_BOOKING_INSTRUCTION));
assert.ok(collectText(alternateSection).includes(MEASUREMENT_ONSITE_BOOKING_REASON));
// Confirm WhatsApp link is NOT inside any <label> (so clicking it cannot toggle radio or checkbox)
const allLabelsInOption3 = alternateSection.findAllByType("label");
for (const lbl of allLabelsInOption3) {
  assert.equal(
    lbl.findAllByProps({ "data-measurement-onsite-whatsapp": "true" }).length,
    0,
    "WhatsApp link must not be nested inside a radio or checkbox label",
  );
}

// Option 4 stays disabled Coming soon
const aiSection = renderer.root.findByProps({ "data-measurement-option-section": "ai_measurements" });
assert.equal(aiSection.findByProps({ "data-measurement-ai-coming-soon": "true" }).props["aria-disabled"], "true");
assert.match(collectText(aiSection), /Coming soon/);

// Select Option 3 radio WITHOUT ticking checkbox -> Continue stays locked, unit & input rows hidden
const onsiteRadio = alternateSection.findByProps({
  type: "radio",
  name: "future-measurement-route",
  value: "onsite_physical",
});
act(() => {
  onsiteRadio.props.onChange({ target: { value: "onsite_physical" } });
});
assert.equal(
  renderer.root.findByProps({ "data-stage-id": "measurement" }).props["data-measurement-method-selected"],
  "onsite_physical",
);
assert.equal(
  renderer.root.findByProps({ "data-stage-id": "measurement" }).props["data-measurement-status"],
  "incomplete",
);
assert.equal(
  renderer.root.findByProps({ "data-stage-id": "measurement" }).props["data-measurement-order-complete"],
  "false",
);
for (const btn of getContinueButtons()) {
  assert.equal(btn.props["aria-disabled"], "true");
}
// Measurement unit row & measurement sections MUST be hidden
assert.equal(
  renderer.root.findAllByProps({ "data-measurement-unit-garment-row": "true" }).length,
  0,
  "Measurement unit row must hide when onsite_physical is active",
);
assert.equal(
  renderer.root.findAllByProps({ "data-measurement-section": "required" }).length,
  0,
);
assert.equal(
  renderer.root.findAllByProps({ "data-measurement-section": "calculated" }).length,
  0,
);
assert.equal(
  renderer.root.findAllByProps({ "data-measurement-section": "optional" }).length,
  0,
);
assert.doesNotMatch(collectText(renderer.root), /0 \/ 0 saved/);

// Checkbox visible with canonical wording; WhatsApp link STILL not inside any <label>
const ackCheckbox = renderer.root.findByProps({ "data-measurement-onsite-ack": "true" });
assert.equal(ackCheckbox.props.type, "checkbox");
assert.equal(ackCheckbox.props.checked, false);
assert.ok(collectText(renderer.root).includes(MEASUREMENT_ONSITE_ACKNOWLEDGEMENT_LABEL));
for (const lbl of renderer.root
  .findByProps({ "data-measurement-option-section": "alternate_contact" })
  .findAllByType("label")) {
  assert.equal(lbl.findAllByProps({ "data-measurement-onsite-whatsapp": "true" }).length, 0);
}

// Tick checkbox -> transitions to complete & unlocks Continue with 0 numbers
act(() => {
  ackCheckbox.props.onChange({ target: { checked: true } });
});
assert.equal(
  renderer.root.findByProps({ "data-stage-id": "measurement" }).props["data-measurement-status"],
  "complete",
);
assert.equal(
  renderer.root.findByProps({ "data-stage-id": "measurement" }).props["data-measurement-order-complete"],
  "true",
);
for (const btn of getContinueButtons()) {
  assert.notEqual(btn.props["aria-disabled"], "true");
}

// Uncheck checkbox -> re-locks Continue
act(() => {
  renderer.root
    .findByProps({ "data-measurement-onsite-ack": "true" })
    .props.onChange({ target: { checked: false } });
});
assert.equal(
  renderer.root.findByProps({ "data-stage-id": "measurement" }).props["data-measurement-status"],
  "incomplete",
);
for (const btn of getContinueButtons()) {
  assert.equal(btn.props["aria-disabled"], "true");
}

// Switching to low_risk shows Measurement unit row and Required Measurements again
act(() => {
  renderer.root
    .findByProps({ type: "radio", name: "future-measurement-route", value: "low_risk" })
    .props.onChange({ target: { value: "low_risk" } });
});
assert.equal(
  renderer.root.findAllByProps({ "data-measurement-unit-garment-row": "true" }).length,
  1,
);
assert.equal(
  renderer.root.findAllByProps({ "data-measurement-section": "required" }).length,
  1,
);

// Domain wording invariant check
assert.doesNotMatch(collectText(renderer.root), /\bKaftan\b/i);

console.log("PASS: onsite physical measurement selectable method, persistence, isolation, multi-wearer, and Step 6 UI");
