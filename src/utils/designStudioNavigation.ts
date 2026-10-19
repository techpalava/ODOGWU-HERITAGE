import type { DesignStudioStageId } from "../types";
import type { ContextualReentryGuidance } from "./designStudioContextualReentryGuidance";

/**
 * A customer-initiated Design Studio move. State changes caused by hydration,
 * background reconciliation, and modal sub-flows deliberately do not create
 * one of these requests.
 */
export type DesignStudioNavigationTarget =
  | { kind: "stage_top" }
  | { kind: "additional_garment"; garmentKey: string | null }
  | { kind: "validation_target" }
  | { kind: "fabric_unassigned"; garmentKey: string }
  | { kind: "design_style_incomplete"; occurrenceToken: string }
  | {
      kind: "measurement_group";
      /** Step 7 person to show; null for a sole wearer (keep the current one). */
      wearerId: string | null;
      /** "shared" or the garment occurrence key of a per-garment group. */
      groupKey: string;
    };

export interface DesignStudioNavigationRequest {
  readonly id: number;
  readonly stage: DesignStudioStageId;
  readonly target: DesignStudioNavigationTarget;
  /** Transient Contextual Re-entry Guidance; omitted on ordinary moves. */
  readonly reentryGuidance?: ContextualReentryGuidance | null;
}

export const createDesignStudioNavigationRequest = ({
  id,
  stage,
  target = { kind: "stage_top" },
  reentryGuidance = null,
}: {
  id: number;
  stage: DesignStudioStageId;
  target?: DesignStudioNavigationTarget;
  reentryGuidance?: ContextualReentryGuidance | null;
}): DesignStudioNavigationRequest => ({
  id,
  stage,
  target,
  reentryGuidance,
});

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

/** Scroll/flash a specific unassigned Fabric garment card. */
export const getFabricUnassignedNavigationTarget = (
  garmentKey: string,
): DesignStudioNavigationTarget => ({
  kind: "fabric_unassigned",
  garmentKey,
});

/** Scroll/highlight a Design Style occurrence that still needs a design. */
export const getDesignStyleIncompleteNavigationTarget = (
  occurrenceToken: string,
): DesignStudioNavigationTarget => ({
  kind: "design_style_incomplete",
  occurrenceToken,
});

export const MEASUREMENT_SHARED_GROUP_KEY = "shared";

/**
 * Summary section Edit: open Step 7 on one person's shared or garment group.
 * Transient: lives only on the navigation request, never in drafts.
 */
export const getMeasurementGroupNavigationTarget = ({
  wearerId,
  groupKey,
}: {
  wearerId: string | null;
  groupKey: string;
}): DesignStudioNavigationTarget => ({
  kind: "measurement_group",
  wearerId,
  groupKey,
});
