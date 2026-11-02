import type {
  CustomDetailDemographic,
  CustomDetailOption,
  DesignStudioStageId,
  FabricGarmentType,
  GarmentConstructionPricingResolution,
  GarmentConstructionSelectionMode,
  GarmentTypeStepSelection,
  GuestDesignDraft,
} from "../types.js";
import { DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION } from "./designSourceJourney.js";
import { reconcileGarmentTypeStepSelection } from "./garmentTypeStepState.js";

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
  nextStageId:
    | "fabric"
    | "design_style"
    | "custom_details"
    | "personalized_additions"
    | null;
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

export interface GarmentTypeStillNeededItem {
  code: GarmentTypeStageBlockerCode;
  label: string;
}

/**
 * Customer copy for the Step 1 blockers that already keep Fabric locked.
 * The completion rules stay in getGarmentTypeStageCompletion.
 */
export const describeGarmentTypeStageBlockers = (
  blockers: readonly GarmentTypeStageBlocker[],
): GarmentTypeStillNeededItem[] => {
  const items: GarmentTypeStillNeededItem[] = [];
  if (blockers.some((blocker) => blocker.code === "GARMENT_REQUIRED")) {
    items.push({
      code: "GARMENT_REQUIRED",
      label: "Select at least one garment.",
    });
  }
  if (blockers.some((blocker) => blocker.code === "DEMOGRAPHIC_REQUIRED")) {
    items.push({
      code: "DEMOGRAPHIC_REQUIRED",
      label:
        "Choose who this design is for (Male, Female, or Unisex / Family).",
    });
  }
  if (blockers.some((blocker) => blocker.code === "CONSTRUCTION_UNRESOLVED")) {
    items.push({
      code: "CONSTRUCTION_UNRESOLVED",
      label:
        "Construction pricing needs review before this order can continue.",
    });
  }
  return items;
};

export const createDormantDesignStudioJourneyState = ({
  persistedDraft,
  normalizedCustomDetailCatalog,
  isFabricStageComplete = false,
  isCustomDetailsStageReady = false,
  isPersonalizedAdditionsStageReady = isCustomDetailsStageReady,
}: {
  persistedDraft?: Pick<
    GuestDesignDraft,
    "garmentTypeSelection" | "currentStageId" | "aiTryOnWorkflow"
  > | null;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
  isFabricStageComplete?: boolean;
  isCustomDetailsStageReady?: boolean;
  isPersonalizedAdditionsStageReady?: boolean;
}): DormantDesignStudioJourneyState => {
  const garmentTypeSelection = reconcileGarmentTypeStepSelection({
    persistedSelection: persistedDraft?.garmentTypeSelection,
    normalizedCustomDetailCatalog,
  }).selection;

  const completion = getGarmentTypeStageCompletion(garmentTypeSelection);
  const requestedStageId = persistedDraft?.currentStageId;
  // Measurement is not locked behind AI Try-on being completed or skipped.
  const currentStageId =
    requestedStageId === "measurement" &&
    completion.isComplete &&
    isFabricStageComplete &&
    isCustomDetailsStageReady &&
    isPersonalizedAdditionsStageReady
      ? "measurement"
      : requestedStageId === "try_on" &&
          completion.isComplete &&
          isFabricStageComplete &&
          isCustomDetailsStageReady &&
          isPersonalizedAdditionsStageReady
        ? "try_on"
        : requestedStageId === "try_on" &&
            completion.isComplete &&
            isFabricStageComplete &&
            isCustomDetailsStageReady
          ? "personalized_additions"
          : requestedStageId === "try_on" &&
              completion.isComplete &&
              isFabricStageComplete
            ? "custom_details"
          : requestedStageId === "personalized_additions" &&
              completion.isComplete &&
              isFabricStageComplete &&
              isCustomDetailsStageReady
            ? "personalized_additions"
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
    journeySchemaVersion: DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION,
    currentStageId,
    garmentTypeSelection,
  };
};
