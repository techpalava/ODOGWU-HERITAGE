import type { DesignStudioStageId } from "../types";

/**
 * A customer-initiated Design Studio move. State changes caused by hydration,
 * background reconciliation, and modal sub-flows deliberately do not create
 * one of these requests.
 */
export type DesignStudioNavigationTarget =
  | { kind: "stage_top" }
  | { kind: "additional_garment"; garmentKey: string | null }
  | { kind: "validation_target" };

export interface DesignStudioNavigationRequest {
  readonly id: number;
  readonly stage: DesignStudioStageId;
  readonly target: DesignStudioNavigationTarget;
}

export const createDesignStudioNavigationRequest = ({
  id,
  stage,
  target = { kind: "stage_top" },
}: {
  id: number;
  stage: DesignStudioStageId;
  target?: DesignStudioNavigationTarget;
}): DesignStudioNavigationRequest => ({ id, stage, target });

/** Main-stage moves always land at the destination top. */
export const getMainStageNavigationTarget = (): DesignStudioNavigationTarget => ({
  kind: "stage_top",
});

/**
 * The persistent Order Summary owns the stage mapping; its only subsection
 * target is the existing exact-additional-garment request mechanism.
 */
export const getOrderSummaryNavigationTarget = ({
  focusAdditionalGarmentKey,
}: {
  focusAdditionalGarmentKey?: string | null;
} = {}): DesignStudioNavigationTarget =>
  focusAdditionalGarmentKey === undefined
    ? getMainStageNavigationTarget()
    : {
        kind: "additional_garment",
        garmentKey: focusAdditionalGarmentKey,
      };

export const getValidationNavigationTarget = (): DesignStudioNavigationTarget => ({
  kind: "validation_target",
});
