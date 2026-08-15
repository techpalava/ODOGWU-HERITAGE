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
import { reconcileGarmentTypeStepSelection } from "./garmentTypeStepState";
import { normalizeAiTryOnWorkflowState } from "./aiTryOnWorkflow";
import { isFutureMeasurementStageUnlocked } from "./measurementBlueprint";

export type GarmentTypeStageBlockerCode =
  "GARMENT_REQUIRED" | "DEMOGRAPHIC_REQUIRED" | "CONSTRUCTION_UNRESOLVED";

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
  currentStageId: DesignStudioStageId;
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
  persistedDraft,
  normalizedCustomDetailCatalog,
  isFabricStageComplete = false,
  isCustomDetailsStageReady = false,
}: {
  persistedDraft?: Pick<
    GuestDesignDraft,
    "garmentTypeSelection" | "currentStageId" | "aiTryOnWorkflow"
  > | null;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
  isFabricStageComplete?: boolean;
  isCustomDetailsStageReady?: boolean;
}): DormantDesignStudioJourneyState => {
  const garmentTypeSelection = reconcileGarmentTypeStepSelection({
    persistedSelection: persistedDraft?.garmentTypeSelection,
    normalizedCustomDetailCatalog,
  }).selection;

  const completion = getGarmentTypeStageCompletion(garmentTypeSelection);
  const requestedStageId = persistedDraft?.currentStageId;
  const aiTryOnWorkflow = normalizeAiTryOnWorkflowState(
    persistedDraft?.aiTryOnWorkflow,
  );
  const canEnterMeasurement = Boolean(
    aiTryOnWorkflow && isFutureMeasurementStageUnlocked(aiTryOnWorkflow),
  );
  const currentStageId =
    requestedStageId === "measurement" &&
    completion.isComplete &&
    isFabricStageComplete &&
    isCustomDetailsStageReady &&
    canEnterMeasurement
      ? "measurement"
      : requestedStageId === "try_on" &&
          completion.isComplete &&
          isFabricStageComplete &&
          isCustomDetailsStageReady
        ? "try_on"
        : requestedStageId === "try_on" &&
            completion.isComplete &&
            isFabricStageComplete
          ? "custom_details"
          : requestedStageId === "custom_details" &&
              completion.isComplete &&
              isFabricStageComplete
            ? "custom_details"
            : requestedStageId === "design_style" &&
                completion.isComplete &&
                isFabricStageComplete
              ? "design_style"
              : (requestedStageId === "fabric" ||
                    requestedStageId === "design_style" ||
                    requestedStageId === "custom_details") &&
                  completion.isComplete
                ? "fabric"
                : "garment_type";

  return {
    currentStageId,
    nextStageId: completion.isComplete ? "fabric" : null,
    canAdvance: completion.isComplete,
    constructionSelectionMode: "garment_type_locked",
    garmentTypeSelection,
    completion,
  };
};

export const updateDormantGarmentTypeSelection = ({
  currentSelection,
  normalizedCustomDetailCatalog,
  selectedGarmentTypes,
  selectedDemographics,
  selectedDemographic,
}: {
  currentSelection: GarmentTypeStepSelection;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
  selectedGarmentTypes?: readonly FabricGarmentType[];
  selectedDemographics?: readonly CustomDetailDemographic[];
  selectedDemographic?: CustomDetailDemographic;
}): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    persistedSelection: currentSelection,
    normalizedCustomDetailCatalog,
    ...(selectedGarmentTypes !== undefined ? { selectedGarmentTypes } : {}),
    ...(selectedDemographics !== undefined ? { selectedDemographics } : {}),
    ...(selectedDemographic !== undefined ? { selectedDemographic } : {}),
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
  draft,
  garmentTypeSelection,
  currentStageId = "garment_type",
}: {
  draft: T;
  garmentTypeSelection: GarmentTypeStepSelection;
  currentStageId?: DesignStudioStageId;
}): T => {
  return {
    ...draft,
    journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
    currentStageId,
    garmentTypeSelection,
  };
};
