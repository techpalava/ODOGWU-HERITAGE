import assert from "node:assert/strict";
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

// --- resolve: step 5 Continue → try_on ---
assert.equal(
  resolveOrderFeedbackTrigger({
    fromStageId: "personalized_additions",
    toStageId: "try_on",
  }),
  "after_step_5",
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
assert.equal(DESIGN_STUDIO_TEN_STAGE_FOUNDATION[9].position, 10);

console.log("PASS: design studio order feedback prompt");
