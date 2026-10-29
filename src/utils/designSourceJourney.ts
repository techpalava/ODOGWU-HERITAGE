import type { DesignStudioStageId } from "../types.js";

export const DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION = 1;
export const DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION = 2;

/** Both persisted journey versions use stable semantic stage IDs. */
export const isSupportedDesignStudioJourneySchemaVersion = (
  value: unknown,
): value is
  | typeof DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION
  | typeof DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION =>
  value === DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION ||
  value === DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION;

export type DesignStudioInternalScreenId =
  | "garment_type"
  | "fabric"
  | "design_style"
  | "custom_details"
  | "personalized_additions"
  | "measurement"
  | "try_on"
  | "summary"
  | "shipping"
  | "payment";

export interface DesignStudioStageDefinition {
  id: DesignStudioStageId;
  position: number;
  title: string;
  shortLabel: string;
  internalScreenId: DesignStudioInternalScreenId;
}

const defineStage = (
  id: DesignStudioStageId,
  position: number,
  title: string,
  shortLabel: string,
): DesignStudioStageDefinition => ({
  id,
  position,
  title,
  shortLabel,
  internalScreenId: id,
});

/** The only supported customer-facing Design Studio journey. */
export const DESIGN_STUDIO_TEN_STAGE_FOUNDATION = [
  defineStage("garment_type", 1, "Garment Type", "Garment"),
  defineStage("fabric", 2, "Fabric", "Fabric"),
  defineStage("design_style", 3, "Design Style", "Style"),
  defineStage("custom_details", 4, "Custom Details", "Details"),
  defineStage(
    "personalized_additions",
    5,
    "Personalized Additions",
    "Additions",
  ),
  defineStage("measurement", 6, "Measurement", "Measurement"),
  defineStage("try_on", 7, "AI Try-on", "AI Try-on"),
  defineStage("summary", 8, "Summary", "Summary"),
  defineStage("shipping", 9, "Delivery & Pickup", "Delivery"),
  defineStage("payment", 10, "Order Review & Payment", "Review"),
] as const satisfies readonly DesignStudioStageDefinition[];

export const DESIGN_STUDIO_STAGE_IDS = DESIGN_STUDIO_TEN_STAGE_FOUNDATION.map(
  (stage) => stage.id,
) as readonly DesignStudioStageId[];

export type DesignStudioOrderFlow = "individual" | "community";
export type DesignStudioFulfilmentChoice = "delivery" | "pickup";

export interface DesignStudioFlowVariant {
  orderFlow: DesignStudioOrderFlow;
  fulfilment: DesignStudioFulfilmentChoice;
}

/** Every customer path the Design Studio step counter must stay consistent for. */
export const DESIGN_STUDIO_FLOW_VARIANTS = [
  { orderFlow: "individual", fulfilment: "delivery" },
  { orderFlow: "individual", fulfilment: "pickup" },
  { orderFlow: "community", fulfilment: "delivery" },
  { orderFlow: "community", fulfilment: "pickup" },
] as const satisfies readonly DesignStudioFlowVariant[];

export interface DesignStudioStepCounter {
  stageId: DesignStudioStageId;
  title: string;
  step: number;
  total: number;
  label: string;
}

/**
 * Stage list for one customer path.
 * Individual and community orders share these stages. Pickup and delivery are
 * choices on Delivery & Pickup, so neither path adds or removes a stage.
 */
const DESIGN_STUDIO_STAGES_BY_FLOW = {
  individual: {
    delivery: DESIGN_STUDIO_TEN_STAGE_FOUNDATION,
    pickup: DESIGN_STUDIO_TEN_STAGE_FOUNDATION,
  },
  community: {
    delivery: DESIGN_STUDIO_TEN_STAGE_FOUNDATION,
    pickup: DESIGN_STUDIO_TEN_STAGE_FOUNDATION,
  },
} as const satisfies Record<
  DesignStudioOrderFlow,
  Record<DesignStudioFulfilmentChoice, readonly DesignStudioStageDefinition[]>
>;

export const getDesignStudioActiveStages = (
  variant?: Partial<DesignStudioFlowVariant>,
): readonly DesignStudioStageDefinition[] => {
  const orderFlow = variant?.orderFlow ?? "individual";
  const fulfilment = variant?.fulfilment ?? "delivery";
  return DESIGN_STUDIO_STAGES_BY_FLOW[orderFlow][fulfilment];
};

/** The only step number and total used by Design Studio headers and the stepper. */
export const getDesignStudioStepCounter = (
  stageId: DesignStudioStageId,
  variant?: Partial<DesignStudioFlowVariant>,
): DesignStudioStepCounter => {
  const stages = getDesignStudioActiveStages(variant);
  const index = stages.findIndex((stage) => stage.id === stageId);
  if (index < 0) {
    throw new Error(`Unknown Design Studio stage: ${stageId}`);
  }
  const stage = stages[index];
  const step = index + 1;
  const total = stages.length;
  if (stage.position !== step) {
    throw new Error(
      `Design Studio stage ${stageId} position ${stage.position} does not match its place in the active stage list (${step} of ${total}).`,
    );
  }
  return {
    stageId,
    title: stage.title,
    step,
    total,
    label: `Step ${step} of ${total}`,
  };
};

export const formatDesignStudioStepCounter = (
  stageId: DesignStudioStageId,
  variant?: Partial<DesignStudioFlowVariant>,
): string => getDesignStudioStepCounter(stageId, variant).label;
