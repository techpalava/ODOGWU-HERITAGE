import type { DesignStudioStageId } from "../types.js";
import {
  DESIGN_STUDIO_TEN_STAGE_FOUNDATION,
  getDesignStudioActiveStages,
  type DesignStudioFlowVariant,
} from "./designSourceJourney.js";

/**
 * After a successful Continue (or Review order → Step 10), decide whether to
 * open the existing Site Feedback panel once per order draft at each trigger.
 * Pure helpers so Design Studio and tests share one decision path.
 */

export const ORDER_FEEDBACK_PROMPT_STORAGE_KEY_PREFIX =
  "odogwu_order_feedback_prompt_v1";

export type OrderFeedbackTriggerId = "after_step_5" | "after_step_10";

export interface OrderFeedbackPromptState {
  shownTriggers: OrderFeedbackTriggerId[];
  /** True when the customer submitted feedback after the step-5 prompt. */
  submittedAfterStep5: boolean;
}

export const EMPTY_ORDER_FEEDBACK_PROMPT_STATE: OrderFeedbackPromptState = {
  shownTriggers: [],
  submittedAfterStep5: false,
};

const TRIGGER_IDS: readonly OrderFeedbackTriggerId[] = [
  "after_step_5",
  "after_step_10",
];

export function orderFeedbackPromptStorageKey(draftKey: string): string {
  return `${ORDER_FEEDBACK_PROMPT_STORAGE_KEY_PREFIX}:${draftKey}`;
}

export function readOrderFeedbackPromptState(
  storage: Pick<Storage, "getItem"> | null,
  draftKey: string,
): OrderFeedbackPromptState {
  if (!storage || !draftKey) return { ...EMPTY_ORDER_FEEDBACK_PROMPT_STATE };
  try {
    const raw = storage.getItem(orderFeedbackPromptStorageKey(draftKey));
    if (!raw) return { ...EMPTY_ORDER_FEEDBACK_PROMPT_STATE };
    const parsed = JSON.parse(raw) as Partial<OrderFeedbackPromptState>;
    const shownTriggers = Array.isArray(parsed.shownTriggers)
      ? parsed.shownTriggers.filter((id): id is OrderFeedbackTriggerId =>
          (TRIGGER_IDS as readonly string[]).includes(id),
        )
      : [];
    return {
      shownTriggers,
      submittedAfterStep5: parsed.submittedAfterStep5 === true,
    };
  } catch {
    return { ...EMPTY_ORDER_FEEDBACK_PROMPT_STATE };
  }
}

export function writeOrderFeedbackPromptState(
  storage: Pick<Storage, "setItem"> | null,
  draftKey: string,
  state: OrderFeedbackPromptState,
): void {
  if (!storage || !draftKey) return;
  try {
    storage.setItem(
      orderFeedbackPromptStorageKey(draftKey),
      JSON.stringify({
        shownTriggers: state.shownTriggers,
        submittedAfterStep5: state.submittedAfterStep5,
      }),
    );
  } catch {
    // Private mode / full storage: in-memory callers still work for the session.
  }
}

/** Step number that owns the second prompt (10, or the final step when fewer). */
export function getOrderFeedbackSecondTriggerStep(totalSteps: number): number {
  if (!Number.isFinite(totalSteps) || totalSteps < 1) return 10;
  return Math.min(10, Math.floor(totalSteps));
}

export function getOrderFeedbackStageStepNumber(
  stageId: DesignStudioStageId,
  variant?: Partial<DesignStudioFlowVariant>,
): number {
  const stages = getDesignStudioActiveStages(variant);
  const index = stages.findIndex((stage) => stage.id === stageId);
  return index >= 0 ? index + 1 : -1;
}

/**
 * Map a successful forward navigation to a prompt trigger, or null.
 * - after_step_5: left Personalized Additions (step 5) for a later stage
 * - after_step_10: arrived on step 10 (or, when the journey has fewer than 10
 *   stages, left the final stage via its Continue)
 */
export function resolveOrderFeedbackTrigger(args: {
  fromStageId: DesignStudioStageId;
  toStageId: DesignStudioStageId;
  variant?: Partial<DesignStudioFlowVariant>;
}): OrderFeedbackTriggerId | null {
  const stages = getDesignStudioActiveStages(args.variant);
  const total = stages.length;
  const fromStep = getOrderFeedbackStageStepNumber(args.fromStageId, args.variant);
  const toStep = getOrderFeedbackStageStepNumber(args.toStageId, args.variant);
  if (fromStep < 0 || toStep < 0) return null;
  // Only forward success paths (Continue / Review order), never Back.
  if (toStep <= fromStep) return null;

  if (args.fromStageId === "personalized_additions" && fromStep === 5) {
    return "after_step_5";
  }

  const secondStep = getOrderFeedbackSecondTriggerStep(total);
  if (total >= 10) {
    // Xavier: after Step 9 Review order succeeds and Step 10 loads.
    if (toStep === secondStep && args.toStageId === stages[secondStep - 1]?.id) {
      return "after_step_10";
    }
    return null;
  }

  // Fewer than 10 stages: second prompt on the final step's Continue
  // (leaving the final stage for… nowhere in the current 10-stage app; when a
  // shorter list exists, Continue from the last stage fires this).
  if (fromStep === secondStep && fromStep === total) {
    return "after_step_10";
  }
  return null;
}

export function shouldShowOrderFeedbackPrompt(args: {
  trigger: OrderFeedbackTriggerId;
  state: OrderFeedbackPromptState;
}): boolean {
  if (args.state.shownTriggers.includes(args.trigger)) return false;
  if (args.trigger === "after_step_10" && args.state.submittedAfterStep5) {
    return false;
  }
  return true;
}

export function markOrderFeedbackPromptShown(
  state: OrderFeedbackPromptState,
  trigger: OrderFeedbackTriggerId,
): OrderFeedbackPromptState {
  if (state.shownTriggers.includes(trigger)) return state;
  return {
    ...state,
    shownTriggers: [...state.shownTriggers, trigger],
  };
}

export function markOrderFeedbackSubmittedAfterStep5(
  state: OrderFeedbackPromptState,
): OrderFeedbackPromptState {
  return { ...state, submittedAfterStep5: true };
}

/**
 * One call site for Design Studio: given a successful forward navigation and
 * draft key, return whether to open the feedback panel and the updated state.
 */
export function decideOrderFeedbackPromptAfterNavigation(args: {
  draftKey: string;
  fromStageId: DesignStudioStageId;
  toStageId: DesignStudioStageId;
  state: OrderFeedbackPromptState;
  variant?: Partial<DesignStudioFlowVariant>;
}): {
  trigger: OrderFeedbackTriggerId | null;
  shouldOpen: boolean;
  nextState: OrderFeedbackPromptState;
} {
  const trigger = resolveOrderFeedbackTrigger({
    fromStageId: args.fromStageId,
    toStageId: args.toStageId,
    variant: args.variant,
  });
  if (!trigger) {
    return { trigger: null, shouldOpen: false, nextState: args.state };
  }
  if (!shouldShowOrderFeedbackPrompt({ trigger, state: args.state })) {
    return { trigger, shouldOpen: false, nextState: args.state };
  }
  return {
    trigger,
    shouldOpen: true,
    nextState: markOrderFeedbackPromptShown(args.state, trigger),
  };
}

/** Stage id for step 5 in the shared foundation (Personalized Additions). */
export const ORDER_FEEDBACK_STEP_5_STAGE_ID: DesignStudioStageId =
  DESIGN_STUDIO_TEN_STAGE_FOUNDATION[4].id;

/** Stage id for step 10 in the shared foundation (Order Review & Payment). */
export const ORDER_FEEDBACK_STEP_10_STAGE_ID: DesignStudioStageId =
  DESIGN_STUDIO_TEN_STAGE_FOUNDATION[9].id;
