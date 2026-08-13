import type {
  CustomDetailDemographic,
  CustomDetailOption,
  DesignStudioStageId,
  FabricGarmentType,
  GarmentConstructionPricingResolution,
  GarmentConstructionSelectionMode,
  GarmentTypeStepSelection,
  GuestDesignDraft,
} from "../types";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./designSourceJourney";
import {
  normalizePersistedGarmentTypeStepSelection,
  reconcileGarmentTypeStepSelection,
} from "./garmentTypeStepState";

export type DesignStudioJourneyMode =
  | "legacy_five_stage"
  | "future_nine_stage";

export const DEFAULT_DESIGN_STUDIO_JOURNEY_MODE =
  "legacy_five_stage" as const;

export const normalizeDesignStudioJourneyMode = (
  value: unknown,
): DesignStudioJourneyMode =>
  value === "future_nine_stage"
    ? "future_nine_stage"
    : DEFAULT_DESIGN_STUDIO_JOURNEY_MODE;

export type GarmentTypeStageBlockerCode =
  | "GARMENT_REQUIRED"
  | "DEMOGRAPHIC_REQUIRED"
  | "CONSTRUCTION_UNRESOLVED";

export interface GarmentTypeStageBlocker {
  code: GarmentTypeStageBlockerCode;
  garmentType?: FabricGarmentType;
}

export interface DormantGarmentTypeStageCompletion {
  isComplete: boolean;
  blockers: GarmentTypeStageBlocker[];
  unresolvedGarmentTypes: FabricGarmentType[];
}

export interface DormantDesignStudioJourneyState {
  mode: DesignStudioJourneyMode;
  currentStageId: DesignStudioStageId | null;
  nextStageId: null;
  canAdvance: false;
  constructionSelectionMode: GarmentConstructionSelectionMode;
  garmentTypeSelection: GarmentTypeStepSelection;
  completion: DormantGarmentTypeStageCompletion;
}

export const getGarmentTypeStageCompletion = (
  selection: GarmentTypeStepSelection,
): DormantGarmentTypeStageCompletion => {
  const unresolvedGarmentTypes = selection.garmentTypes.filter(
    (garmentType) =>
      selection.constructionByGarment[garmentType]?.status !== "resolved",
  );
  const blockers: GarmentTypeStageBlocker[] = [];
  if (selection.garmentTypes.length === 0) {
    blockers.push({ code: "GARMENT_REQUIRED" });
  }
  if (!selection.demographic) {
    blockers.push({ code: "DEMOGRAPHIC_REQUIRED" });
  }
  unresolvedGarmentTypes.forEach((garmentType) =>
    blockers.push({ code: "CONSTRUCTION_UNRESOLVED", garmentType }),
  );
  return {
    isComplete: blockers.length === 0,
    blockers,
    unresolvedGarmentTypes,
  };
};

export const createDormantDesignStudioJourneyState = ({
  mode,
  persistedDraft,
  normalizedCustomDetailCatalog,
}: {
  mode?: unknown;
  persistedDraft?: Pick<GuestDesignDraft, "garmentTypeSelection"> | null;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
}): DormantDesignStudioJourneyState => {
  const normalizedMode = normalizeDesignStudioJourneyMode(mode);
  const garmentTypeSelection =
    normalizedMode === "future_nine_stage"
      ? reconcileGarmentTypeStepSelection({
          persistedSelection: persistedDraft?.garmentTypeSelection,
          normalizedCustomDetailCatalog,
        }).selection
      : normalizePersistedGarmentTypeStepSelection(undefined);

  return {
    mode: normalizedMode,
    currentStageId:
      normalizedMode === "future_nine_stage" ? "garment_type" : null,
    nextStageId: null,
    canAdvance: false,
    constructionSelectionMode:
      normalizedMode === "future_nine_stage"
        ? "garment_type_locked"
        : "legacy_custom_details",
    garmentTypeSelection,
    completion: getGarmentTypeStageCompletion(garmentTypeSelection),
  };
};

export const updateDormantGarmentTypeSelection = ({
  currentSelection,
  normalizedCustomDetailCatalog,
  selectedGarmentTypes,
  selectedDemographic,
}: {
  currentSelection: GarmentTypeStepSelection;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
  selectedGarmentTypes?: readonly FabricGarmentType[];
  selectedDemographic?: CustomDetailDemographic;
}): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    persistedSelection: currentSelection,
    normalizedCustomDetailCatalog,
    ...(selectedGarmentTypes !== undefined
      ? { selectedGarmentTypes }
      : {}),
    ...(selectedDemographic !== undefined
      ? { selectedDemographic }
      : {}),
  }).selection;

export const acceptDormantGarmentConstructionDefaults = ({
  currentSelection,
  resolutions,
  normalizedCustomDetailCatalog,
}: {
  currentSelection: GarmentTypeStepSelection;
  resolutions: readonly GarmentConstructionPricingResolution[];
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
}): GarmentTypeStepSelection => {
  const resolutionByGarment = new Map(
    resolutions.map((resolution) => [resolution.garmentType, resolution]),
  );
  const constructionByGarment = Object.fromEntries(
    currentSelection.garmentTypes.flatMap((garmentType) => {
      const resolution = resolutionByGarment.get(garmentType);
      return resolution ? [[garmentType, resolution]] : [];
    }),
  );
  return reconcileGarmentTypeStepSelection({
    persistedSelection: {
      ...currentSelection,
      constructionByGarment,
    },
    normalizedCustomDetailCatalog,
  }).selection;
};

export const persistDormantGarmentTypeStage = <T extends GuestDesignDraft>({
  mode,
  draft,
  garmentTypeSelection,
}: {
  mode?: unknown;
  draft: T;
  garmentTypeSelection: GarmentTypeStepSelection;
}): T => {
  if (normalizeDesignStudioJourneyMode(mode) !== "future_nine_stage") {
    return draft;
  }
  return {
    ...draft,
    journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
    currentStageId: "garment_type",
    garmentTypeSelection,
  };
};
