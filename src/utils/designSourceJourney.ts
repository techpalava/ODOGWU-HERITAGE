import type { DesignStudioStageId } from "../types";

export type DesignStudioStageImplementationStatus = "existing" | "planned";
export const DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION = 1;

export type DesignStudioInternalScreenId =
  | "style"
  | "fabric"
  | "details"
  | "try_on"
  | "measurement"
  | "shipping"
  | "review";

export interface DesignStudioStageDefinition {
  id: DesignStudioStageId;
  position: number;
  title: string;
  shortLabel: string;
  internalScreenId: DesignStudioInternalScreenId | null;
  implementationStatus: DesignStudioStageImplementationStatus;
}

/**
 * Typed foundation for the approved future journey. Runtime consumers must
 * continue using DESIGN_STUDIO_CUSTOMER_FLOW_STEPS until a later activation.
 */
const defineFutureStage = (
  id: DesignStudioStageId,
  position: number,
  title: string,
  shortLabel: string,
  internalScreenId: DesignStudioInternalScreenId | null,
  implementationStatus: DesignStudioStageImplementationStatus,
): DesignStudioStageDefinition => ({
  id,
  position,
  title,
  shortLabel,
  internalScreenId,
  implementationStatus,
});

export const DESIGN_STUDIO_NINE_STAGE_FOUNDATION = [
  defineFutureStage("garment_type", 1, "Garment Type", "Garment", null, "planned"),
  defineFutureStage("fabric", 2, "Fabric", "Fabric", "fabric", "existing"),
  defineFutureStage("design_style", 3, "Design Style", "Style", "style", "existing"),
  defineFutureStage("custom_details", 4, "Custom Details", "Details", "details", "existing"),
  defineFutureStage("try_on", 5, "AI Try-on", "Try-on", "try_on", "existing"),
  defineFutureStage("measurement", 6, "Dimension / Measurement", "Dimension", "measurement", "existing"),
  defineFutureStage("summary", 7, "Summary", "Summary", "review", "planned"),
  defineFutureStage("shipping", 8, "Shipping", "Shipping", "shipping", "existing"),
  defineFutureStage("payment", 9, "Payment / Cart", "Payment", null, "planned"),
] as const satisfies readonly DesignStudioStageDefinition[];

const LEGACY_NUMERIC_STAGE_IDS: Readonly<Record<number, DesignStudioStageId>> = {
  1: "design_style",
  2: "fabric",
  3: "custom_details",
  4: "try_on",
  5: "measurement",
  6: "measurement",
  7: "shipping",
  8: "summary",
  9: "summary",
};

const LEGACY_SEMANTIC_STAGE_IDS: Readonly<
  Record<string, DesignStudioStageId>
> = {
  style: "design_style",
  fabric: "fabric",
  details: "custom_details",
  shipping: "shipping",
  review: "summary",
};

export const migrateLegacyDesignStudioStage = (
  legacyStage: unknown,
): DesignStudioStageId => {
  if (typeof legacyStage === "number") {
    return Number.isInteger(legacyStage)
      ? LEGACY_NUMERIC_STAGE_IDS[legacyStage] || "garment_type"
      : "garment_type";
  }
  if (typeof legacyStage === "string") {
    return LEGACY_SEMANTIC_STAGE_IDS[legacyStage.trim().toLowerCase()] ||
      "garment_type";
  }
  return "garment_type";
};

export const prepareLegacyDraftForNineStageJourney = <T extends object>(
  draft: T,
  legacyStage: unknown,
): T & { journeySchemaVersion: number; currentStageId: DesignStudioStageId } => ({
  ...draft,
  journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
  currentStageId: migrateLegacyDesignStudioStage(legacyStage),
});

/**
 * The canonical customer-facing Design Studio journey after a design source
 * has been confirmed. Internal legacy steps are intentionally not exposed.
 */
export const DESIGN_STUDIO_CUSTOMER_FLOW_STEPS = [
  { internalStep: 1, title: "Garment / Style", shortLabel: "Style" },
  { internalStep: 2, title: "Fabric", shortLabel: "Fabric" },
  { internalStep: 3, title: "Custom Details", shortLabel: "Details" },
  {
    internalStep: 7,
    title: "Shipping & Delivery",
    shortLabel: "Shipping",
  },
  { internalStep: 9, title: "Review / Add to Cart", shortLabel: "Review" },
] as const;

export type DesignStudioCustomerFlowTitle =
  (typeof DESIGN_STUDIO_CUSTOMER_FLOW_STEPS)[number]["title"];

export const getCustomerFlowStepInternal = (
  title: DesignStudioCustomerFlowTitle,
): number => {
  const step = DESIGN_STUDIO_CUSTOMER_FLOW_STEPS.find(
    (entry) => entry.title === title,
  );
  if (!step) {
    throw new Error(`Missing customer flow step definition: ${title}`);
  }
  return step.internalStep;
};

export const normalizeCustomerFlowStep = (step: number): number => {
  if (
    DESIGN_STUDIO_CUSTOMER_FLOW_STEPS.some(
      (item) => item.internalStep === step,
    )
  ) {
    return step;
  }
  if (step >= 4 && step <= 6) return 7;
  if (step === 8) return 9;
  return 1;
};

export const getNextCustomerFlowStep = (step: number): number | null => {
  const index = DESIGN_STUDIO_CUSTOMER_FLOW_STEPS.findIndex(
    (item) => item.internalStep === step,
  );
  return index >= 0
    ? DESIGN_STUDIO_CUSTOMER_FLOW_STEPS[index + 1]?.internalStep ?? null
    : null;
};

export const getPreviousCustomerFlowStep = (step: number): number | null => {
  const index = DESIGN_STUDIO_CUSTOMER_FLOW_STEPS.findIndex(
    (item) => item.internalStep === step,
  );
  return index > 0
    ? DESIGN_STUDIO_CUSTOMER_FLOW_STEPS[index - 1].internalStep
    : null;
};

export type DesignStudioStepNavigationState =
  | "current"
  | "completed"
  | "locked";

export const getFurthestReachedCustomerFlowStepIndex = (
  currentIndex: number,
  furthestReachedIndex: number,
): number => Math.max(0, currentIndex, furthestReachedIndex);

export const getCustomerFlowStepNavigationState = ({
  targetIndex,
  currentIndex,
  furthestReachedIndex,
}: {
  targetIndex: number;
  currentIndex: number;
  furthestReachedIndex: number;
}): DesignStudioStepNavigationState => {
  if (targetIndex === currentIndex) return "current";
  if (targetIndex <= furthestReachedIndex) return "completed";
  return "locked";
};

export const canNavigateToCustomerFlowStep = (
  navigationState: DesignStudioStepNavigationState,
): boolean => navigationState === "completed";
