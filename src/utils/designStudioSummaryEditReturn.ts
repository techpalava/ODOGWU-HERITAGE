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
