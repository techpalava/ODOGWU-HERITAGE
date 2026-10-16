import type { GuestDesignDraft } from "../types";
import type { HomepageDraftInspectionResult } from "../services/homepageDraftReplacement";
import { getDesignStudioStepCounter } from "./designSourceJourney";

/**
 * Starting an Individual Order never resumes a saved draft.
 * A valid draft must be confirmed before it is replaced. Invalid storage is
 * left untouched.
 */
export type IndividualOrderStartDecision =
  | Readonly<{ kind: "start_fresh" }>
  | Readonly<{
      kind: "confirm_replacement";
      existing: Extract<HomepageDraftInspectionResult, { status: "valid" }>["existing"];
    }>
  | Readonly<{ kind: "blocked"; reason: string }>;

export const classifyIndividualOrderStart = (
  inspection: HomepageDraftInspectionResult,
): IndividualOrderStartDecision => {
  if (inspection.status === "empty") return { kind: "start_fresh" };
  if (inspection.status === "valid") {
    return { kind: "confirm_replacement", existing: inspection.existing };
  }
  return { kind: "blocked", reason: inspection.reason };
};

/**
 * The Design Studio nav uses the same rule as Start Individual Order.
 * A saved Community, Individual, or group draft is never opened silently.
 */
export const classifyDesignStudioNavEntry = classifyIndividualOrderStart;

/** Resume action that names the saved draft, so a Community draft is not offered as an Individual resume. */
export const designStudioNavResumeActionLabel = (
  draft: Pick<GuestDesignDraft, "batchType">,
): string => {
  if (draft.batchType === "community") return "Resume community order";
  if (draft.batchType === "personalized") return "Resume group order";
  if (draft.batchType === "alone") return "Resume individual order";
  return "Resume unfinished order";
};

const orderKindLabel = (
  draft: Pick<GuestDesignDraft, "batchName" | "batchType">,
): string => {
  const batchName = draft.batchName?.trim();
  if (batchName) return batchName;
  if (draft.batchType === "alone") return "Individual Order";
  if (draft.batchType === "community") return "Community order";
  if (draft.batchType === "personalized") return "Group order";
  return "Unfinished order";
};

/** A short label so the customer can recognise a draft before replacing it. */
export const describeUnfinishedOrder = (
  draft: Pick<
    GuestDesignDraft,
    "currentStageId" | "batchName" | "batchType" | "futureShippingState" | "customerName"
  >,
): string => {
  const kind = orderKindLabel(draft);
  const stage = draft.currentStageId
    ? getDesignStudioStepCounter(draft.currentStageId).label
    : null;
  const recipient =
    draft.futureShippingState?.customerInformation?.fullName?.trim() ||
    draft.customerName?.trim() ||
    "";
  const parts = [kind, stage, recipient ? `recipient ${recipient}` : ""]
    .filter(Boolean);
  return parts.join(", ");
};
