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
  tryOnFinishedForSummary,
  tryOnUnlockedByMeasurements,
  inlineAdditionalGarmentFabricTransaction,
  additionalGarmentFabricRepairTargeted = false,
}: {
  currentStageId: DesignStudioStageId;
  garmentTypeComplete: boolean;
  fabricComplete: boolean;
  designSourceReady: boolean;
  customDetailsReady: boolean;
  personalizedAdditionsReady?: boolean;
  /** Order-level Try-on is completed or skipped, so Summary may be entered. */
  tryOnFinishedForSummary: boolean;
  /** Measurements are complete, so AI Try-on may be entered. */
  tryOnUnlockedByMeasurements: boolean;
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
    (currentStageId !== "try_on" || tryOnUnlockedByMeasurements) &&
    (currentStageId !== "summary" || tryOnFinishedForSummary) &&
    (currentStageId !== "summary" || tryOnUnlockedByMeasurements);

  if (canRemainOnCurrentStage) {
    return null;
  }

  if (!garmentTypeComplete) return "garment_type";
  if (!fabricCompleteForCorrection) return "fabric";
  if (!designSourceReadyForCorrection) return "design_style";
  if (!customDetailsReady) return "custom_details";
  if (!personalizedAdditionsReady) return "personalized_additions";
  // Measurement (6) precedes AI Try-on (7). Incomplete measurements send
  // Try-on and Summary back to Measurement. Summary (8) also waits until
  // the order-level Try-on workflow is completed or skipped. That flag is
  // one wearer's preview or an order skip, not a preview for every wearer.
  if (
    (currentStageId === "try_on" || currentStageId === "summary") &&
    !tryOnUnlockedByMeasurements
  ) {
    return "measurement";
  }
  if (currentStageId === "summary" && !tryOnFinishedForSummary) return "try_on";
  return "measurement";
};

/**
 * A saved AI Try-on step that misses an explicit restore gate.
 * Returns the earliest stage that is actually blocking, so the customer is
 * not dropped on Step 1 when Fabric or a later step is the real stop.
 * Null means every Try-on gate passed and the caller should keep Step 7.
 */
export const resolveTryOnRestoreFallback = ({
  garmentTypeComplete,
  fabricComplete,
  designSourceReady,
  customDetailsReady,
  personalizedAdditionsReady,
  measurementsReady,
}: {
  garmentTypeComplete: boolean;
  fabricComplete: boolean;
  designSourceReady: boolean;
  customDetailsReady: boolean;
  personalizedAdditionsReady: boolean;
  measurementsReady: boolean;
}): DesignStudioStageId | null =>
  resolveFutureStageCorrection({
    currentStageId: "try_on",
    garmentTypeComplete,
    fabricComplete,
    designSourceReady,
    customDetailsReady,
    personalizedAdditionsReady,
    tryOnFinishedForSummary: false,
    tryOnUnlockedByMeasurements: measurementsReady,
    inlineAdditionalGarmentFabricTransaction: null,
  });
