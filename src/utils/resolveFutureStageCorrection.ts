import type { DesignStudioStageId } from "../types";

export type InlineAdditionalGarmentFabricTransactionLike = {
  garmentKey: string;
  phase?: string;
} | null;

/**
 * Pure stage-correction decision used by DesignStudioView.
 * Returns null when the current stage should stay mounted.
 *
 * While an inline Optional Extra Garment Fabric transaction is active
 * (including the terminal "committed" stabilization phase), Step 4 stays
 * mounted even if Fabric/Design Source readiness briefly flickers.
 */
export const resolveFutureStageCorrection = ({
  currentStageId,
  garmentTypeComplete,
  fabricComplete,
  designSourceReady,
  customDetailsReady,
  measurementUnlocked,
  summaryUnlocked,
  inlineAdditionalGarmentFabricTransaction,
}: {
  currentStageId: DesignStudioStageId;
  garmentTypeComplete: boolean;
  fabricComplete: boolean;
  designSourceReady: boolean;
  customDetailsReady: boolean;
  measurementUnlocked: boolean;
  summaryUnlocked: boolean;
  inlineAdditionalGarmentFabricTransaction: InlineAdditionalGarmentFabricTransactionLike;
}): DesignStudioStageId | null => {
  if (
    currentStageId !== "design_style" &&
    currentStageId !== "custom_details" &&
    currentStageId !== "try_on" &&
    currentStageId !== "measurement" &&
    currentStageId !== "summary"
  ) {
    return null;
  }

  const inlineActive = inlineAdditionalGarmentFabricTransaction !== null;
  const suppressFabricIncompleteRedirect =
    currentStageId === "custom_details" && inlineActive;
  const suppressDesignSourceRedirect =
    currentStageId === "custom_details" && inlineActive;

  const fabricCompleteForCorrection =
    fabricComplete || suppressFabricIncompleteRedirect;
  const designSourceReadyForCorrection =
    designSourceReady || suppressDesignSourceRedirect;

  const canRemainOnCurrentStage =
    fabricCompleteForCorrection &&
    designSourceReadyForCorrection &&
    ((currentStageId !== "try_on" &&
      currentStageId !== "measurement" &&
      currentStageId !== "summary") ||
      customDetailsReady) &&
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
  if (!measurementUnlocked) return "try_on";
  return "measurement";
};
