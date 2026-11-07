import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DESIGN_STUDIO_FLOW_VARIANTS,
  DESIGN_STUDIO_TEN_STAGE_FOUNDATION,
  getDesignStudioActiveStages,
} from "./src/utils/designSourceJourney.js";
import {
  EMPTY_ORDER_FEEDBACK_PROMPT_STATE,
  decideOrderFeedbackPromptAfterNavigation,
  getOrderFeedbackSecondTriggerStep,
  markOrderFeedbackPromptShown,
  markOrderFeedbackSubmittedAfterStep5,
  readOrderFeedbackPromptState,
  resolveOrderFeedbackTrigger,
  shouldShowOrderFeedbackPrompt,
  writeOrderFeedbackPromptState,
} from "./src/utils/designStudioOrderFeedbackPrompt.js";

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
};

// --- second trigger step ---
assert.equal(getOrderFeedbackSecondTriggerStep(10), 10);
assert.equal(getOrderFeedbackSecondTriggerStep(8), 8);
assert.equal(getOrderFeedbackSecondTriggerStep(1), 1);

// --- every live flow variant has the same 10 stages ---
for (const variant of DESIGN_STUDIO_FLOW_VARIANTS) {
  const stages = getDesignStudioActiveStages(variant);
  assert.equal(stages.length, 10, JSON.stringify(variant));
  assert.equal(stages[4].id, "personalized_additions");
  assert.equal(stages[9].id, "payment");
}

// --- resolve: normal Step 5 Continue lands on Measurement ---
assert.equal(
  resolveOrderFeedbackTrigger({
    fromStageId: "personalized_additions",
    toStageId: "measurement",
  }),
  "after_step_5",
);
// A direct forward leave to AI Try-on (stepper) is the same trigger, not a second one.
assert.equal(
  resolveOrderFeedbackTrigger({
    fromStageId: "personalized_additions",
    toStageId: "try_on",
  }),
  "after_step_5",
);
assert.equal(
  resolveOrderFeedbackTrigger({
    fromStageId: "personalized_additions",
    toStageId: "summary",
  }),
  "after_step_5",
  "summary-edit Continue from step 5 is still a forward leave",
);
assert.equal(
  resolveOrderFeedbackTrigger({
    fromStageId: "measurement",
    toStageId: "try_on",
  }),
  null,
  "Step 6 Continue must not repeat the step-5 prompt",
);
assert.equal(
  resolveOrderFeedbackTrigger({
    fromStageId: "personalized_additions",
    toStageId: "custom_details",
  }),
  null,
  "Back from step 5 does not prompt",
);
assert.equal(
  resolveOrderFeedbackTrigger({
    fromStageId: "custom_details",
    toStageId: "personalized_additions",
  }),
  null,
  "arriving on step 5 is not a trigger",
);
assert.equal(
  resolveOrderFeedbackTrigger({
    fromStageId: "try_on",
    toStageId: "personalized_additions",
  }),
  null,
  "Back never triggers",
);

// --- resolve: Review order → payment (step 10) ---
assert.equal(
  resolveOrderFeedbackTrigger({
    fromStageId: "shipping",
    toStageId: "payment",
  }),
  "after_step_10",
);
assert.equal(
  resolveOrderFeedbackTrigger({
    fromStageId: "summary",
    toStageId: "shipping",
  }),
  null,
);
assert.equal(
  resolveOrderFeedbackTrigger({
    fromStageId: "payment",
    toStageId: "shipping",
  }),
  null,
);

// Other Continues must not open the popup.
for (const [from, to] of [
  ["garment_type", "fabric"],
  ["fabric", "design_style"],
  ["design_style", "custom_details"],
  ["try_on", "measurement"],
  ["measurement", "summary"],
  ["summary", "shipping"],
] as const) {
  assert.equal(
    resolveOrderFeedbackTrigger({ fromStageId: from, toStageId: to }),
    null,
    `${from} -> ${to}`,
  );
}

// --- once per draft ---
let state = { ...EMPTY_ORDER_FEEDBACK_PROMPT_STATE };
assert.equal(
  shouldShowOrderFeedbackPrompt({ trigger: "after_step_5", state }),
  true,
);
state = markOrderFeedbackPromptShown(state, "after_step_5");
assert.equal(
  shouldShowOrderFeedbackPrompt({ trigger: "after_step_5", state }),
  false,
);
assert.equal(
  shouldShowOrderFeedbackPrompt({ trigger: "after_step_10", state }),
  true,
);

// --- skip step 10 if submitted after step 5 ---
state = markOrderFeedbackSubmittedAfterStep5(state);
assert.equal(
  shouldShowOrderFeedbackPrompt({ trigger: "after_step_10", state }),
  false,
);

// Fresh draft still gets step 10 if step 5 was only dismissed.
state = markOrderFeedbackPromptShown(
  { ...EMPTY_ORDER_FEEDBACK_PROMPT_STATE },
  "after_step_5",
);
assert.equal(
  shouldShowOrderFeedbackPrompt({ trigger: "after_step_10", state }),
  true,
);

// --- decide helper marks shown when opening ---
const first = decideOrderFeedbackPromptAfterNavigation({
  draftKey: "draft-a",
  fromStageId: "personalized_additions",
  toStageId: "try_on",
  state: EMPTY_ORDER_FEEDBACK_PROMPT_STATE,
});
assert.equal(first.shouldOpen, true);
assert.equal(first.trigger, "after_step_5");
assert.deepEqual(first.nextState.shownTriggers, ["after_step_5"]);

const again = decideOrderFeedbackPromptAfterNavigation({
  draftKey: "draft-a",
  fromStageId: "personalized_additions",
  toStageId: "try_on",
  state: first.nextState,
});
assert.equal(again.shouldOpen, false);

const step10 = decideOrderFeedbackPromptAfterNavigation({
  draftKey: "draft-a",
  fromStageId: "shipping",
  toStageId: "payment",
  state: first.nextState,
});
assert.equal(step10.shouldOpen, true);
assert.equal(step10.trigger, "after_step_10");

const afterSubmit = decideOrderFeedbackPromptAfterNavigation({
  draftKey: "draft-a",
  fromStageId: "shipping",
  toStageId: "payment",
  state: markOrderFeedbackSubmittedAfterStep5(first.nextState),
});
assert.equal(afterSubmit.shouldOpen, false);

// Actual Step 5 Continue destination (Measurement) shares that once-per-draft rule.
const step5Continue = decideOrderFeedbackPromptAfterNavigation({
  draftKey: "draft-measurement",
  fromStageId: "personalized_additions",
  toStageId: "measurement",
  state: EMPTY_ORDER_FEEDBACK_PROMPT_STATE,
});
assert.equal(step5Continue.shouldOpen, true);
assert.equal(step5Continue.trigger, "after_step_5");
assert.equal(
  decideOrderFeedbackPromptAfterNavigation({
    draftKey: "draft-measurement",
    fromStageId: "personalized_additions",
    toStageId: "measurement",
    state: step5Continue.nextState,
  }).shouldOpen,
  false,
);
assert.equal(
  decideOrderFeedbackPromptAfterNavigation({
    draftKey: "draft-measurement",
    fromStageId: "shipping",
    toStageId: "payment",
    state: step5Continue.nextState,
  }).shouldOpen,
  true,
);
assert.equal(
  decideOrderFeedbackPromptAfterNavigation({
    draftKey: "draft-measurement",
    fromStageId: "shipping",
    toStageId: "payment",
    state: markOrderFeedbackSubmittedAfterStep5(step5Continue.nextState),
  }).shouldOpen,
  false,
);
assert.equal(
  decideOrderFeedbackPromptAfterNavigation({
    draftKey: "draft-measurement",
    fromStageId: "measurement",
    toStageId: "try_on",
    state: EMPTY_ORDER_FEEDBACK_PROMPT_STATE,
  }).shouldOpen,
  false,
);

// --- session storage round-trip ---
const storage = memoryStorage();
writeOrderFeedbackPromptState(storage, "draft-b", first.nextState);
assert.deepEqual(
  readOrderFeedbackPromptState(storage, "draft-b"),
  first.nextState,
);
assert.deepEqual(
  readOrderFeedbackPromptState(storage, "other"),
  EMPTY_ORDER_FEEDBACK_PROMPT_STATE,
);

// Foundation positions match the customer counter.
assert.equal(DESIGN_STUDIO_TEN_STAGE_FOUNDATION[4].position, 5);
assert.equal(DESIGN_STUDIO_TEN_STAGE_FOUNDATION[4].id, "personalized_additions");
assert.equal(DESIGN_STUDIO_TEN_STAGE_FOUNDATION[5].id, "measurement");
assert.equal(DESIGN_STUDIO_TEN_STAGE_FOUNDATION[9].position, 10);

// Design Studio wires the normal Step 5 Continue through Measurement, and only
// that successful leave (plus the existing Step 10 arrive) opens the popup.
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const sliceConstArrow = (name: string) => {
  const marker = `const ${name} = `;
  const start = studioSource.indexOf(marker);
  assert.ok(start >= 0, `missing ${name}`);
  const next = studioSource.indexOf("\n  const ", start + marker.length);
  assert.ok(next > start, `unterminated ${name}`);
  return studioSource.slice(start, next);
};
const measurementOpener = sliceConstArrow("handleOpenDormantMeasurementStage");
const blockedAt = measurementOpener.indexOf(
  "!isFuturePersonalizedAdditionsNavigationReady",
);
assert.ok(blockedAt > 0, "measurement opener keeps its readiness gate");
const returnLeave = measurementOpener.slice(0, blockedAt);
const afterGate = measurementOpener.slice(blockedAt);
assert.match(
  returnLeave,
  /if \(returnStage\) \{\s*const fromStageId = futureStageId;\s*navigateToFutureStage\(returnStage\);\s*if \(fromStageId === "personalized_additions"\) \{\s*promptOrderFeedbackAfterSuccessfulContinue\(fromStageId, returnStage\);\s*\}\s*return;\s*\}/,
);
const successAt = afterGate.indexOf('const fromStageId = futureStageId;');
assert.ok(successAt > 0, "successful measurement leave records the stage it left");
assert.equal(
  afterGate.slice(0, successAt).includes("promptOrderFeedbackAfterSuccessfulContinue"),
  false,
  "a blocked Step 5 Continue must not open feedback",
);
assert.match(
  afterGate.slice(successAt),
  /const fromStageId = futureStageId;\s*navigateToFutureStage\("measurement"\);\s*if \(fromStageId === "personalized_additions"\) \{\s*promptOrderFeedbackAfterSuccessfulContinue\(fromStageId, "measurement"\);\s*\}/,
);
assert.match(
  studioSource,
  /onContinue=\{\s*futureStageId === "custom_details"\s*\?\s*handleOpenDormantPersonalizedAdditionsStage\s*:\s*handleOpenDormantMeasurementStage\s*\}/,
);
assert.match(studioSource, /onContinue=\{handleOpenDormantAiTryOnStage\}/);
const tryOnOpener = sliceConstArrow("handleOpenDormantAiTryOnStage");
assert.equal(
  (
    tryOnOpener.match(/promptOrderFeedbackAfterSuccessfulContinue\(/g) || []
  ).length,
  2,
);
assert.equal(
  (
    tryOnOpener.match(/fromStageId === "personalized_additions"/g) || []
  ).length,
  2,
  "Step 6 Continue calls the try-on opener while stage is measurement, so it must stay guarded",
);
const paymentOpener = sliceConstArrow("handleOpenDormantPaymentReviewStage");
assert.match(
  paymentOpener,
  /const fromStageId = futureStageId;\s*navigateToFutureStage\("payment"\);\s*if \(fromStageId === "shipping"\) \{\s*promptOrderFeedbackAfterSuccessfulContinue\(fromStageId, "payment"\);\s*\}/,
);
for (const untouched of [
  "handleOpenDormantSummaryStage",
  "handleOpenDormantShippingStage",
  "handleOpenDormantPersonalizedAdditionsStage",
  "handleOpenDormantCustomDetailsStage",
]) {
  assert.equal(
    sliceConstArrow(untouched).includes("promptOrderFeedbackAfterSuccessfulContinue"),
    false,
    untouched,
  );
}
assert.equal(
  (studioSource.match(/promptOrderFeedbackAfterSuccessfulContinue\(/g) || []).length,
  5,
);

console.log("PASS: design studio order feedback prompt");
