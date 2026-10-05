import type { DesignStudioStageId } from "../types";

export type InlineAdditionalGarmentFabricTransactionLike = {
  garmentKey: string;
  phase?: string;
  designStyleReuse?: unknown;
} | null;

/**
 * Pure stage-correction decision used by DesignStudioView.
 * Returns null when the current stage should stay mounted.
 *
 * While an inline Optional Extra Garment Fabric / Step 5 configuration
 * session is active (catalogue through design_style / custom_details_choice,
 * plus the terminal "committed" stabilization phase), Step 5 stays mounted
 * even if Fabric/Design Source readiness briefly flickers.
 */
export const resolveFutureStageCorrection = ({
  currentStageId,
  garmentTypeComplete,
  fabricComplete,
  designSourceReady,
  customDetailsReady,
  personalizedAdditionsReady = customDetailsReady,
  measurementUnlocked,
  summaryUnlocked,
  inlineAdditionalGarmentFabricTransaction,
  additionalGarmentFabricRepairTargeted = false,
}: {
  currentStageId: DesignStudioStageId;
  garmentTypeComplete: boolean;
  fabricComplete: boolean;
  designSourceReady: boolean;
  customDetailsReady: boolean;
  personalizedAdditionsReady?: boolean;
  measurementUnlocked: boolean;
  summaryUnlocked: boolean;
  inlineAdditionalGarmentFabricTransaction: InlineAdditionalGarmentFabricTransactionLike;
  /** A Summary-to-Step-4 repair target owned by an additional garment. */
  additionalGarmentFabricRepairTargeted?: boolean;
}): DesignStudioStageId | null => {
  if (
    currentStageId !== "design_style" &&
    currentStageId !== "custom_details" &&
    currentStageId !== "personalized_additions" &&
    currentStageId !== "try_on" &&
    currentStageId !== "measurement" &&
    currentStageId !== "summary"
  ) {
    return null;
  }

  const inlineActive = inlineAdditionalGarmentFabricTransaction !== null;
  const reuseInDesignStyle =
    currentStageId === "design_style" &&
    Boolean(inlineAdditionalGarmentFabricTransaction?.designStyleReuse);
  // Step 5 Add Additional Garment keeps the customer on Personalized Additions
  // for the whole Fabric → Design Style → Copy session, even while the new
  // occurrence briefly makes Fabric / Design Source / Step 4 look incomplete.
  if (currentStageId === "personalized_additions" && inlineActive) {
    return null;
  }
  const suppressFabricIncompleteRedirect =
    (currentStageId === "personalized_additions" &&
      additionalGarmentFabricRepairTargeted) ||
    reuseInDesignStyle;
  const suppressDesignSourceRedirect = reuseInDesignStyle;

  const fabricCompleteForCorrection =
    fabricComplete || suppressFabricIncompleteRedirect;
  const designSourceReadyForCorrection =
    designSourceReady || suppressDesignSourceRedirect;

  const requiresStep4Completion =
    currentStageId === "personalized_additions" ||
    currentStageId === "try_on" ||
    currentStageId === "measurement" ||
    currentStageId === "summary";
  const requiresStep5Completion =
    currentStageId === "try_on" ||
    currentStageId === "measurement" ||
    currentStageId === "summary";
  const canRemainOnCurrentStage =
    fabricCompleteForCorrection &&
    designSourceReadyForCorrection &&
    (!requiresStep4Completion || customDetailsReady) &&
    (!requiresStep5Completion || personalizedAdditionsReady) &&
    ((currentStageId !== "measurement" && currentStageId !== "summary") ||
      measurementUnlocked) &&
    (currentStageId !== "summary" || summaryUnlocked);

  if (canRemainOnCurrentStage) {
    return null;
  }

  if (!garmentTypeComplete) return "garment_type";
  if (!fabricCompleteForCorrection) return "fabric";
  if (!designSourceReadyForCorrection) return "design_style";
  if (!customDetailsReady) return "custom_details";
  if (!personalizedAdditionsReady) return "personalized_additions";
  if (!measurementUnlocked) return "try_on";
  return "measurement";
};
