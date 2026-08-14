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
import { normalizeAiTryOnWorkflowState } from "./aiTryOnWorkflow";
import { isFutureMeasurementStageUnlocked } from "./measurementBlueprint";

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
  nextStageId: "fabric" | "design_style" | "custom_details" | null;
  canAdvance: boolean;
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
  isFabricStageComplete = false,
  isCustomDetailsStageReady = false,
}: {
  mode?: unknown;
  persistedDraft?: Pick<
    GuestDesignDraft,
    "garmentTypeSelection" | "currentStageId" | "aiTryOnWorkflow"
  > | null;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
  isFabricStageComplete?: boolean;
  isCustomDetailsStageReady?: boolean;
}): DormantDesignStudioJourneyState => {
  const normalizedMode = normalizeDesignStudioJourneyMode(mode);
  const garmentTypeSelection =
    normalizedMode === "future_nine_stage"
      ? reconcileGarmentTypeStepSelection({
          persistedSelection: persistedDraft?.garmentTypeSelection,
          normalizedCustomDetailCatalog,
        }).selection
      : normalizePersistedGarmentTypeStepSelection(undefined);

  const completion = getGarmentTypeStageCompletion(garmentTypeSelection);
  const requestedStageId = persistedDraft?.currentStageId;
  const aiTryOnWorkflow = normalizeAiTryOnWorkflowState(
    persistedDraft?.aiTryOnWorkflow,
  );
  const canEnterMeasurement = Boolean(
    aiTryOnWorkflow && isFutureMeasurementStageUnlocked(aiTryOnWorkflow),
  );
  const currentStageId =
    normalizedMode === "future_nine_stage" &&
    requestedStageId === "measurement" &&
    completion.isComplete &&
    isFabricStageComplete &&
    isCustomDetailsStageReady &&
    canEnterMeasurement
      ? "measurement"
      : normalizedMode === "future_nine_stage" &&
    requestedStageId === "try_on" &&
    completion.isComplete &&
    isFabricStageComplete &&
    isCustomDetailsStageReady
      ? "try_on"
      : normalizedMode === "future_nine_stage" &&
          requestedStageId === "try_on" &&
          completion.isComplete &&
          isFabricStageComplete
        ? "custom_details"
      : normalizedMode === "future_nine_stage" &&
    requestedStageId === "custom_details" &&
    completion.isComplete &&
    isFabricStageComplete
      ? "custom_details"
      : normalizedMode === "future_nine_stage" &&
          requestedStageId === "design_style" &&
          completion.isComplete &&
          isFabricStageComplete
        ? "design_style"
      : normalizedMode === "future_nine_stage" &&
          (requestedStageId === "fabric" ||
            requestedStageId === "design_style" ||
            requestedStageId === "custom_details") &&
          completion.isComplete
        ? "fabric"
      : normalizedMode === "future_nine_stage"
        ? "garment_type"
        : null;

  return {
    mode: normalizedMode,
    currentStageId,
    nextStageId:
      normalizedMode === "future_nine_stage" && completion.isComplete
        ? "fabric"
        : null,
    canAdvance:
      normalizedMode === "future_nine_stage" && completion.isComplete,
    constructionSelectionMode:
      normalizedMode === "future_nine_stage"
        ? "garment_type_locked"
        : "legacy_custom_details",
    garmentTypeSelection,
    completion,
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
  currentStageId = "garment_type",
}: {
  mode?: unknown;
  draft: T;
  garmentTypeSelection: GarmentTypeStepSelection;
  currentStageId?:
    | "garment_type"
    | "fabric"
    | "design_style"
    | "custom_details"
    | "try_on"
    | "measurement";
}): T => {
  if (normalizeDesignStudioJourneyMode(mode) !== "future_nine_stage") {
    return draft;
  }
  return {
    ...draft,
    journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
    currentStageId,
    garmentTypeSelection,
  };
};
