import type { DesignStudioStageId } from "../types";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./designSourceJourney";

const LEGACY_NUMERIC_STAGE_IDS: Readonly<Record<number, DesignStudioStageId>> =
  {
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

const LEGACY_SEMANTIC_STAGE_IDS: Readonly<Record<string, DesignStudioStageId>> =
  {
    style: "design_style",
    fabric: "fabric",
    details: "custom_details",
    shipping: "shipping",
    review: "summary",
  };

/**
 * Read-only compatibility for non-destructive one-time draft migration. This
 * mapping is not imported by the active journey or its navigation.
 */
export const migrateLegacyDesignStudioStage = (
  legacyStage: unknown,
): DesignStudioStageId => {
  if (typeof legacyStage === "number") {
    return Number.isInteger(legacyStage)
      ? LEGACY_NUMERIC_STAGE_IDS[legacyStage] || "garment_type"
      : "garment_type";
  }
  if (typeof legacyStage === "string") {
    return (
      LEGACY_SEMANTIC_STAGE_IDS[legacyStage.trim().toLowerCase()] ||
      "garment_type"
    );
  }
  return "garment_type";
};

export const prepareLegacyDraftForNineStageJourney = <T extends object>(
  draft: T,
  legacyStage: unknown,
): T & {
  journeySchemaVersion: number;
  currentStageId: DesignStudioStageId;
} => ({
  ...draft,
  journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
  currentStageId: migrateLegacyDesignStudioStage(legacyStage),
});
