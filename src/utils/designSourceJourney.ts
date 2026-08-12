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
