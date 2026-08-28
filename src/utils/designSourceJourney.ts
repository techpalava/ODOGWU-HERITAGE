import type { DesignStudioStageId } from "../types";

export const DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION = 1;

export type DesignStudioInternalScreenId =
  | "garment_type"
  | "fabric"
  | "design_style"
  | "custom_details"
  | "try_on"
  | "measurement"
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
export const DESIGN_STUDIO_NINE_STAGE_FOUNDATION = [
  defineStage("garment_type", 1, "Garment Type", "Garment"),
  defineStage("fabric", 2, "Fabric", "Fabric"),
  defineStage("design_style", 3, "Design Style", "Style"),
  defineStage("custom_details", 4, "Custom Details", "Details"),
  defineStage("try_on", 5, "AI Try-on", "AI Try-on"),
  defineStage("measurement", 6, "Measurement", "Measurement"),
  defineStage("summary", 7, "Summary", "Summary"),
  defineStage("shipping", 8, "Delivery & Pickup", "Delivery"),
  defineStage("payment", 9, "Order Review & Payment", "Review"),
] as const satisfies readonly DesignStudioStageDefinition[];

export const DESIGN_STUDIO_STAGE_IDS = DESIGN_STUDIO_NINE_STAGE_FOUNDATION.map(
  (stage) => stage.id,
) as readonly DesignStudioStageId[];
