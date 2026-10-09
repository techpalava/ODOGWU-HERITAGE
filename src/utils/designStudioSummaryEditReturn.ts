import type { DesignStudioStageId } from "../types";

/**
 * When the customer starts an edit from Summary (or Payment Review), remember
 * where to return after they finish the focused stage Continue/save.
 * Step 7 Measurement also uses it for its Add Garment trip to Step 5.
 * Sibling of RemovalStageRetentionLease — navigation only, not authority.
 */
export type SummaryEditReturnStageId = "summary" | "payment" | "measurement";

export type SummaryEditFocusStageId = Extract<
  DesignStudioStageId,
  | "garment_type"
  | "fabric"
  | "design_style"
  | "custom_details"
  | "personalized_additions"
  | "try_on"
  | "measurement"
  | "shipping"
>;

export interface SummaryEditReturnLease {
  kind: "summary_edit_return";
  returnStageId: SummaryEditReturnStageId;
  focusStageId: SummaryEditFocusStageId;
  focusGarmentKey: string | null;
  generation: number;
  sessionIdentityKey: string;
}

export const createSummaryEditReturnLease = ({
  returnStageId,
  focusStageId,
  focusGarmentKey = null,
  generation,
  sessionIdentityKey,
}: {
  returnStageId: SummaryEditReturnStageId;
  focusStageId: SummaryEditFocusStageId;
  focusGarmentKey?: string | null;
  generation: number;
  sessionIdentityKey: string;
}): SummaryEditReturnLease => ({
  kind: "summary_edit_return",
  returnStageId,
  focusStageId,
  focusGarmentKey: focusGarmentKey ?? null,
  generation,
  sessionIdentityKey,
});

export const isSummaryEditReturnLeaseActive = ({
  lease,
  generation,
  sessionIdentityKey,
  currentStageId,
}: {
  lease: SummaryEditReturnLease | null;
  generation: number;
  sessionIdentityKey: string;
  currentStageId: DesignStudioStageId;
}): boolean =>
  Boolean(
    lease &&
      lease.kind === "summary_edit_return" &&
      lease.generation === generation &&
      lease.sessionIdentityKey === sessionIdentityKey &&
      lease.focusStageId === currentStageId,
  );

/**
 * Stages whose Continue should consume the lease and return to Summary/Payment
 * instead of advancing forward in the ten-stage journey.
 */
export const shouldConsumeSummaryEditReturnOnContinue = ({
  lease,
  generation,
  sessionIdentityKey,
  currentStageId,
}: {
  lease: SummaryEditReturnLease | null;
  generation: number;
  sessionIdentityKey: string;
  currentStageId: DesignStudioStageId;
}): boolean =>
  isSummaryEditReturnLeaseActive({
    lease,
    generation,
    sessionIdentityKey,
    currentStageId,
  });

/**
 * Where the customer is relative to the lease's focus stage:
 * - "approach": started, not on the focus stage yet (e.g. the edit was gated
 *   back to an earlier stage first);
 * - "focus": on the focus stage;
 * - "detour": the stage-correction safety net moved them from the focus stage
 *   to an earlier stage (e.g. a Step 5 Add Garment session left a new garment
 *   without Fabric / Design Style), and the normal Continue chain leads back.
 */
export type SummaryEditReturnTripPhase = "approach" | "focus" | "detour";

/**
 * M2: one rule for every stage change while a return lease exists. The lease
 * survives only while the customer is on its focus stage or still on the way
 * back to it (approach / correction detour on an earlier stage). Leaving the
 * focus stage any other way (stepper jump, live summary edit, any explicit
 * navigation) drops it, so a later Back or Continue behaves normally.
 * Intentional Back / Continue consume the lease before navigating, so they
 * never reach this check with a lease.
 */
export const resolveSummaryEditReturnOnStageChange = ({
  lease,
  phase,
  nextStageId,
  correctionTargetStageId,
  stageOrder,
}: {
  lease: SummaryEditReturnLease | null;
  phase: SummaryEditReturnTripPhase;
  nextStageId: DesignStudioStageId;
  /** Set only when the stage-correction safety net produced this change. */
  correctionTargetStageId: DesignStudioStageId | null;
  stageOrder: readonly DesignStudioStageId[];
}): { keep: boolean; phase: SummaryEditReturnTripPhase } => {
  if (!lease) return { keep: false, phase: "approach" };
  if (nextStageId === lease.focusStageId) return { keep: true, phase: "focus" };
  const nextIndex = stageOrder.indexOf(nextStageId);
  const focusIndex = stageOrder.indexOf(lease.focusStageId);
  const beforeFocus = nextIndex >= 0 && focusIndex >= 0 && nextIndex < focusIndex;
  if (phase === "focus") {
    return beforeFocus && correctionTargetStageId === nextStageId
      ? { keep: true, phase: "detour" }
      : { keep: false, phase: "approach" };
  }
  return beforeFocus ? { keep: true, phase } : { keep: false, phase: "approach" };
};

/**
 * Back honours the lease only on its focus stage. Elsewhere it is "approach"
 * or "detour" Back (kept, normal previous stage) or a stale lease (cleared,
 * normal previous stage).
 */
export const resolveSummaryEditReturnOnBack = ({
  lease,
  phase,
  generation,
  sessionIdentityKey,
  currentStageId,
}: {
  lease: SummaryEditReturnLease | null;
  phase: SummaryEditReturnTripPhase;
  generation: number;
  sessionIdentityKey: string;
  currentStageId: DesignStudioStageId;
}): "return" | "fallback_keep" | "fallback_clear" => {
  if (
    isSummaryEditReturnLeaseActive({ lease, generation, sessionIdentityKey, currentStageId })
  ) {
    return "return";
  }
  if (
    lease &&
    lease.generation === generation &&
    lease.sessionIdentityKey === sessionIdentityKey &&
    phase !== "focus"
  ) {
    return "fallback_keep";
  }
  return "fallback_clear";
};

export interface SummaryEditReturnLeaseContext {
  generation: number;
  sessionIdentityKey: string;
  currentStageId: DesignStudioStageId;
}

/**
 * The one owner of the return lease and its trip phase. Design Studio keeps a
 * single instance and calls it from beginSummaryEditReturn, the focus stage's
 * Continue (consumeOnContinue) and Back (back), stepper / live-summary jumps
 * (clear), the stage-correction safety net (markCorrection) and one effect on
 * every stage change (onStageChange).
 */
export const createSummaryEditReturnTripController = (
  stageOrder: readonly DesignStudioStageId[],
) => {
  let lease: SummaryEditReturnLease | null = null;
  let phase: SummaryEditReturnTripPhase = "approach";
  let correctionPending = false;
  const clear = () => {
    lease = null;
    phase = "approach";
  };
  return {
    get lease() {
      return lease;
    },
    get phase() {
      return phase;
    },
    begin(next: SummaryEditReturnLease, currentStageId: DesignStudioStageId) {
      lease = next;
      phase = currentStageId === next.focusStageId ? "focus" : "approach";
    },
    clear,
    /** The next stage change comes from the stage-correction safety net. */
    markCorrection() {
      correctionPending = true;
    },
    onStageChange(nextStageId: DesignStudioStageId) {
      const correction = correctionPending;
      correctionPending = false;
      if (!lease) return;
      const result = resolveSummaryEditReturnOnStageChange({
        lease,
        phase,
        nextStageId,
        correctionTargetStageId: correction ? nextStageId : null,
        stageOrder,
      });
      if (!result.keep) {
        clear();
        return;
      }
      phase = result.phase;
    },
    /** Focus stage Continue: the return stage, consumed; otherwise null. */
    consumeOnContinue(context: SummaryEditReturnLeaseContext): SummaryEditReturnStageId | null {
      if (!shouldConsumeSummaryEditReturnOnContinue({ lease, ...context })) return null;
      const returnStageId = lease!.returnStageId;
      clear();
      return returnStageId;
    },
    /** Focus stage Back: the return stage, consumed; otherwise null (normal Back). */
    back(context: SummaryEditReturnLeaseContext): SummaryEditReturnStageId | null {
      const decision = resolveSummaryEditReturnOnBack({ lease, phase, ...context });
      if (decision === "return") {
        const returnStageId = lease!.returnStageId;
        clear();
        return returnStageId;
      }
      if (decision === "fallback_clear") clear();
      return null;
    },
  };
};

export type SummaryEditReturnTripController = ReturnType<
  typeof createSummaryEditReturnTripController
>;
