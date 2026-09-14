import type { DesignStudioStageId } from "../types";
import type {
  GarmentScopedCustomDetailsCompletionBlocker,
  GarmentScopedCustomDetailsCompletionResult,
  GarmentScopedCustomDetailsReconciliationResult,
} from "./garmentScopedCustomDetailsDomain";

export type CustomDetailsPresentationStageId = Extract<
  DesignStudioStageId,
  "custom_details" | "personalized_additions"
>;

export const CUSTOM_DETAILS_STAGE_SECTION_ORDER = [
  { id: "catalogue_core", stage: "custom_details" },
  { id: "additional_clothes_costs", stage: "custom_details" },
  { id: "personalized_additional", stage: "personalized_additions" },
  { id: "monogram_embroidery", stage: "personalized_additions" },
  { id: "accessories", stage: "personalized_additions" },
  { id: "additional_garment_management", stage: "personalized_additions" },
] as const satisfies readonly {
  id: string;
  stage: CustomDetailsPresentationStageId;
}[];

export const getCustomDetailsSectionIdsForStage = (
  stage: CustomDetailsPresentationStageId,
): readonly string[] =>
  CUSTOM_DETAILS_STAGE_SECTION_ORDER.filter((section) => section.stage === stage).map(
    (section) => section.id,
  );

const completionStatusFor = (
  blockers: readonly GarmentScopedCustomDetailsCompletionBlocker[],
): GarmentScopedCustomDetailsCompletionResult["status"] => {
  const hasInvalid = blockers.some(
    (blocker) =>
      blocker.code === "physical_subject_invalid" ||
      blocker.code === "selection_reconciled" ||
      blocker.code === "snapshot_missing" ||
      blocker.code === "personalized_requirement_invalid",
  );
  const hasPending = blockers.some(
    (blocker) => blocker.code === "pricing_evaluation_required",
  );
  const hasIncomplete = blockers.some(
    (blocker) =>
      blocker.code === "earlier_stage_incomplete" ||
      blocker.code === "required_selection_missing" ||
      blocker.code === "personalized_requirement_missing",
  );
  return hasInvalid
    ? "invalid"
    : hasIncomplete
      ? "incomplete"
      : hasPending
        ? "pricing_pending"
        : "complete";
};

/**
 * Splits only presentation completion. The canonical selection, personalized
 * input, and pricing models remain a single garment-scoped Custom Details
 * domain. Additional-garment detail management appears after the explicit
 * personalized boundary, so its blockers belong to Step 5.
 */
export const getCustomDetailsStageCompletion = ({
  stage,
  completion,
  reconciliation,
}: {
  stage: CustomDetailsPresentationStageId;
  completion: GarmentScopedCustomDetailsCompletionResult;
  reconciliation: GarmentScopedCustomDetailsReconciliationResult;
}): GarmentScopedCustomDetailsCompletionResult => {
  const additionalGarmentKeys = new Set(
    reconciliation.subjects
      .filter((subject) => subject.parentGarmentKey.startsWith("additional:"))
      .map((subject) => subject.garmentKey),
  );
  const ownsBlocker = (
    blocker: GarmentScopedCustomDetailsCompletionBlocker,
  ): boolean => {
    if (blocker.selectionGroup === "personalized_additional") {
      return stage === "personalized_additions";
    }
    if (
      blocker.garmentKey &&
      additionalGarmentKeys.has(blocker.garmentKey)
    ) {
      return stage === "personalized_additions";
    }
    return stage === "custom_details";
  };
  const blockers = completion.blockers.filter(ownsBlocker);
  return { status: completionStatusFor(blockers), blockers };
};
