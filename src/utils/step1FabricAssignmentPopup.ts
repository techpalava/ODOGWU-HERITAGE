import { getGarmentFabricCapacityUsageCopy } from "../config/StyleFabricCapacityConfig";
import { FabricCapacityEngine } from "../engine/FabricCapacityEngine";
import type {
  Fabric,
  FabricAllocationState,
  FabricGarmentType,
  GarmentTypeStepSelection,
} from "../types";
import { resolveCurrentCatalogueFabricForAssignment } from "./additionalGarmentFabricPicker";
import {
  assignFutureFabricToGarment,
  assignSameFabricProductToGarments,
  formatFabricQuantityLimitChangeCopy,
  getFutureFabricBulkChoiceCandidates,
  getFutureFabricStep1AssignmentTargets,
  getFutureGarmentFabricPlanning,
  type FutureFabricAssignmentTarget,
  type FutureFabricBulkAssignmentResult,
} from "./designStudioFutureFabricStage";

export const STEP1_FABRIC_ASSIGNMENT_TITLE = "Assign Fabric to Garments";
export const STEP1_FABRIC_ASSIGNMENT_DESCRIPTION =
  "Choose which garments should use this Fabric.";
export const STEP1_USE_FOR_ALL_LABEL = "YES — Use for All";
export const STEP1_INSUFFICIENT_CAPACITY_REASON =
  "Not enough available Fabric capacity for this garment in the current assignment.";
export const STEP1_GARMENT_CAPACITY_MESSAGE = STEP1_INSUFFICIENT_CAPACITY_REASON;
export const STEP1_SELECTED_CAPACITY_MESSAGE =
  "This Fabric cannot cover all selected garments. Select fewer garments.";
export const STEP1_REMAINING_CAPACITY_MESSAGE =
  "This Fabric cannot cover all remaining garments. Select fewer garments.";
export const STEP1_GARMENT_ALREADY_ASSIGNED_MESSAGE =
  "One of the selected garments already has fabric assigned. No garments were changed.";
export const STEP1_ASSIGNMENT_FAILED_MESSAGE =
  "That fabric could not be assigned. No garments were changed.";
export const STEP1_FABRIC_NO_LONGER_AVAILABLE_MESSAGE =
  "This Fabric is no longer available. Close this window and choose another Fabric.";
export const STEP1_NO_GARMENTS_TO_ASSIGN_STATUS = "ALL GARMENTS HAVE FABRIC";

export type Step1FabricAssignmentDisplaySnapshot = {
  fabricCode: string;
  fabricName: string;
  description: string;
  color: string;
  colorHex: string;
  image?: string;
  stockStatus: Fabric["stockStatus"];
  stock?: number;
  category?: string;
};

export type PendingStep1FabricAssignment = {
  fabricCode: string;
  selectedGarmentKeys: string[];
  displayFabric: Step1FabricAssignmentDisplaySnapshot;
};

export type Step1FabricAssignmentCandidate = {
  garmentKey: string;
  garmentType: FabricGarmentType;
  fabricUnits: 1 | 2;
  capacityUsageCopy: string;
  individuallyAssignable: boolean;
  disabledReason: string | null;
};

export type Step1FabricCatalogueCardStatus =
  | "SELECT"
  | "USE AGAIN"
  | "IN USE"
  | "ALL GARMENTS HAVE FABRIC"
  | "UNAVAILABLE";

export type Step1FabricCatalogueCardAction = "select" | "use_again" | "none";

export type Step1FabricCatalogueCardPresentation = {
  status: Step1FabricCatalogueCardStatus;
  action: Step1FabricCatalogueCardAction;
};

export type Step1FabricAssignmentCommitResult =
  | {
      status: "assigned";
      state: FabricAllocationState;
      assignedGarmentKeys: string[];
    }
  | {
      status: "blocked";
      state: FabricAllocationState;
      error: string;
      reason:
        | "FABRIC_UNAVAILABLE"
        | "GARMENT_ALREADY_ASSIGNED"
        | "INVALID_CAPACITY"
        | "FABRIC_QUANTITY_LIMIT_REACHED"
        | "ASSIGNMENT_FAILED";
      failedGarmentKey?: string;
    };

export type Step1FabricAssignmentFailure = {
  garmentKey: string;
  message: string;
};

export type Step1FabricAssignmentEvaluation = {
  selectedCount: number;
  canAssignSelected: boolean;
  canUseForAll: boolean;
  selectedCapacityMessage: string | null;
  remainingCapacityMessage: string | null;
  candidateMessages: Record<string, string | null>;
  selectedFailure: Step1FabricAssignmentFailure | null;
  remainingFailure: Step1FabricAssignmentFailure | null;
};

const candidateGarmentKeys = (
  candidates: readonly FutureFabricAssignmentTarget[],
): string[] => candidates.map(({ assignment }) => assignment.garmentKey);

export const getUnassignedStep1FabricAssignmentCandidates = ({
  garmentTypeSelection,
  fabricAllocationState,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
}): FutureFabricAssignmentTarget[] =>
  getFutureFabricBulkChoiceCandidates({
    garmentTypeSelection,
    fabricAllocationState,
  });

export const shouldPromptStep1FabricAssignmentSelection = (
  eligibleCandidateCount: number,
): boolean => eligibleCandidateCount >= 2;

const hasExistingStep1FabricProductAllocation = (
  state: FabricAllocationState,
  garmentTypeSelection: GarmentTypeStepSelection,
  fabricCode: string,
): boolean => {
  const step1Keys = new Set(
    getFutureFabricStep1AssignmentTargets(garmentTypeSelection).map(
      ({ assignment }) => assignment.garmentKey,
    ),
  );
  return state.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === fabricCode &&
      allocation.garmentAssignments.some((assignment) =>
        step1Keys.has(assignment.garmentKey),
      ),
  );
};

const hasExistingFabricProductAllocation = (
  state: FabricAllocationState,
  fabricCode: string,
): boolean =>
  state.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === fabricCode &&
      allocation.garmentAssignments.length > 0,
  );

export const createStep1FabricAssignmentDisplaySnapshot = (
  fabric: Fabric,
): Step1FabricAssignmentDisplaySnapshot => ({
  fabricCode: fabric.code,
  fabricName: fabric.name,
  description: fabric.description,
  color: fabric.color,
  colorHex: fabric.colorHex,
  image: fabric.image,
  stockStatus: fabric.stockStatus,
  stock: fabric.stock,
  category: fabric.category,
});

export const toStep1AssignmentDisplayFabric = (
  snapshot: Step1FabricAssignmentDisplaySnapshot,
): Fabric => ({
  code: snapshot.fabricCode,
  name: snapshot.fabricName,
  description: snapshot.description,
  color: snapshot.color,
  colorHex: snapshot.colorHex,
  image: snapshot.image,
  stockStatus: snapshot.stockStatus,
  stock: snapshot.stock,
  category: snapshot.category,
  priceMultiplier: 1,
});

export const resolveStep1AssignmentDialogFabric = ({
  fabrics,
  fabricCode,
  displaySnapshot,
}: {
  fabrics: readonly Fabric[];
  fabricCode: string;
  displaySnapshot: Step1FabricAssignmentDisplaySnapshot;
}): {
  currentFabric: Fabric | null;
  displayFabric: Fabric;
  unavailableError: string | null;
} => {
  const resolution = resolveCurrentCatalogueFabricForAssignment({
    fabrics,
    fabricCode,
  });
  if (resolution.status === "resolved") {
    return {
      currentFabric: resolution.fabric,
      displayFabric: resolution.fabric,
      unavailableError: null,
    };
  }
  const liveMatch =
    fabrics.find((candidate) => candidate.code === fabricCode) ?? null;
  return {
    currentFabric: null,
    displayFabric: liveMatch ?? toStep1AssignmentDisplayFabric(displaySnapshot),
    unavailableError:
      resolution.code === "missing"
        ? STEP1_FABRIC_NO_LONGER_AVAILABLE_MESSAGE
        : resolution.reason,
  };
};

export const getRemainingCapacityUnitsOnExistingFabricAllocations = ({
  fabricAllocationState,
  fabricCode,
}: {
  fabricAllocationState: FabricAllocationState;
  fabricCode: string;
}): number =>
  fabricAllocationState.fabricAllocations
    .filter((allocation) => allocation.fabricCode === fabricCode)
    .reduce((remaining, allocation) => {
      const usedUnits = allocation.garmentAssignments.reduce(
        (total, assignment) => total + assignment.fabricUnits,
        0,
      );
      return (
        remaining +
        Math.max(0, FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION - usedUnits)
      );
    }, 0);

const dryRunAssignGarmentKeys = ({
  state,
  garmentTypeSelection,
  fabricCode,
  garmentKeys,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricCode: string;
  garmentKeys: readonly string[];
}): FutureFabricBulkAssignmentResult => {
  if (garmentKeys.length === 0) {
    return {
      status: "blocked",
      state,
      reason: "INVALID_CAPACITY",
    };
  }
  return assignSameFabricProductToGarments({
    state,
    garmentTypeSelection,
    fabricCode,
    garmentKeys,
  });
};

export const dryRunAssignFabricProductToStep1GarmentKeys = dryRunAssignGarmentKeys;

export const canAssignFabricProductToStep1Garment = ({
  garmentTypeSelection,
  fabricAllocationState,
  fabricCode,
  garmentKey,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  fabricCode: string;
  garmentKey: string;
}): boolean => {
  const result = assignFutureFabricToGarment({
    state: fabricAllocationState,
    garmentTypeSelection,
    garmentKey,
    fabricCode,
  });
  return result.status === "assigned";
};

export const canAssignFabricProductToStep1GarmentKeys = ({
  garmentTypeSelection,
  fabricAllocationState,
  fabricCode,
  garmentKeys,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  fabricCode: string;
  garmentKeys: readonly string[];
}): boolean =>
  dryRunAssignGarmentKeys({
    state: fabricAllocationState,
    garmentTypeSelection,
    fabricCode,
    garmentKeys,
  }).status === "assigned";

export const buildStep1FabricAssignmentCandidates = ({
  garmentTypeSelection,
  fabricAllocationState,
  fabricCode,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  fabricCode: string;
}): Step1FabricAssignmentCandidate[] =>
  getUnassignedStep1FabricAssignmentCandidates({
    garmentTypeSelection,
    fabricAllocationState,
  }).map(({ assignment }) => {
    const result = assignFutureFabricToGarment({
      state: fabricAllocationState,
      garmentTypeSelection,
      garmentKey: assignment.garmentKey,
      fabricCode,
    });
    const individuallyAssignable = result.status === "assigned";
    const requiredFabricQuantity = getFutureGarmentFabricPlanning({
      garmentTypeSelection,
      fabricAllocationState,
    }).requiredFabricQuantity;
    return {
      garmentKey: assignment.garmentKey,
      garmentType: assignment.garmentType,
      fabricUnits: assignment.fabricUnits,
      capacityUsageCopy: getGarmentFabricCapacityUsageCopy(assignment.garmentType),
      individuallyAssignable,
      disabledReason: individuallyAssignable
        ? null
        : result.status === "blocked" &&
            result.reason === "FABRIC_QUANTITY_LIMIT_REACHED"
          ? formatFabricQuantityLimitChangeCopy(requiredFabricQuantity)
          : STEP1_INSUFFICIENT_CAPACITY_REASON,
    };
  });

const failureFromDryRun = (
  result: FutureFabricBulkAssignmentResult | null,
): Step1FabricAssignmentFailure | null => {
  if (!result || result.status !== "blocked" || !result.failedGarmentKey) {
    return null;
  }
  if (result.reason === "FABRIC_QUANTITY_LIMIT_REACHED") {
    return null;
  }
  return {
    garmentKey: result.failedGarmentKey,
    message: STEP1_GARMENT_CAPACITY_MESSAGE,
  };
};

const globalMessageForBlockedDryRun = ({
  result,
  failure,
  fallback,
  requiredFabricQuantity,
}: {
  result: FutureFabricBulkAssignmentResult | null;
  failure: Step1FabricAssignmentFailure | null;
  fallback: string;
  requiredFabricQuantity: number;
}): string | null => {
  if (!result || result.status === "assigned") return null;
  if (failure) return null;
  if (result.reason === "FABRIC_QUANTITY_LIMIT_REACHED") {
    return formatFabricQuantityLimitChangeCopy(requiredFabricQuantity);
  }
  return fallback;
};

export const evaluateStep1FabricAssignmentSelection = ({
  candidates,
  selectedGarmentKeys,
  garmentTypeSelection,
  fabricAllocationState,
  fabricCode,
}: {
  candidates: readonly Step1FabricAssignmentCandidate[];
  selectedGarmentKeys: readonly string[];
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  fabricCode: string;
}): Step1FabricAssignmentEvaluation => {
  const requiredFabricQuantity = getFutureGarmentFabricPlanning({
    garmentTypeSelection,
    fabricAllocationState,
  }).requiredFabricQuantity;
  const candidateKeys = new Set(candidates.map((candidate) => candidate.garmentKey));
  const selected = selectedGarmentKeys.filter((garmentKey) =>
    candidateKeys.has(garmentKey),
  );
  const remainingKeys = candidates.map((candidate) => candidate.garmentKey);
  const selectedResult =
    selected.length === 0
      ? null
      : dryRunAssignGarmentKeys({
          state: fabricAllocationState,
          garmentTypeSelection,
          fabricCode,
          garmentKeys: selected,
        });
  const remainingResult =
    remainingKeys.length === 0
      ? null
      : dryRunAssignGarmentKeys({
          state: fabricAllocationState,
          garmentTypeSelection,
          fabricCode,
          garmentKeys: remainingKeys,
        });
  const canAssignSelected = selectedResult?.status === "assigned";
  const canUseForAll = remainingResult?.status === "assigned";
  const selectedFailure =
    selected.length > 0 && !canAssignSelected
      ? failureFromDryRun(selectedResult)
      : null;
  const remainingFailure = !canUseForAll
    ? failureFromDryRun(remainingResult)
    : null;
  const candidateMessages: Record<string, string | null> = {};
  for (const candidate of candidates) {
    const messages: string[] = [];
    if (candidate.disabledReason) {
      messages.push(candidate.disabledReason);
    }
    if (selectedFailure?.garmentKey === candidate.garmentKey) {
      messages.push(selectedFailure.message);
    }
    if (remainingFailure?.garmentKey === candidate.garmentKey) {
      messages.push(remainingFailure.message);
    }
    candidateMessages[candidate.garmentKey] = [...new Set(messages)][0] ?? null;
  }

  return {
    selectedCount: selected.length,
    canAssignSelected,
    canUseForAll,
    selectedCapacityMessage:
      selected.length > 0 && !canAssignSelected
        ? globalMessageForBlockedDryRun({
            result: selectedResult,
            failure: selectedFailure,
            fallback: STEP1_SELECTED_CAPACITY_MESSAGE,
            requiredFabricQuantity,
          })
        : null,
    remainingCapacityMessage:
      remainingKeys.length > 0 && !canUseForAll
        ? globalMessageForBlockedDryRun({
            result: remainingResult,
            failure: remainingFailure,
            fallback: STEP1_REMAINING_CAPACITY_MESSAGE,
            requiredFabricQuantity,
          })
        : null,
    candidateMessages,
    selectedFailure,
    remainingFailure,
  };
};

export const resolveStep1FabricCatalogueCardPresentation = ({
  fabricCode,
  garmentTypeSelection,
  fabricAllocationState,
  availabilityMessage,
}: {
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  availabilityMessage: string | null;
}): Step1FabricCatalogueCardPresentation => {
  if (availabilityMessage) {
    return { status: "UNAVAILABLE", action: "none" };
  }
  const candidates = buildStep1FabricAssignmentCandidates({
    garmentTypeSelection,
    fabricAllocationState,
    fabricCode,
  });
  const usedOnStep1 = hasExistingStep1FabricProductAllocation(
    fabricAllocationState,
    garmentTypeSelection,
    fabricCode,
  );
  const canServeRemaining = candidates.some(
    (candidate) => candidate.individuallyAssignable,
  );
  if (!usedOnStep1 && candidates.length > 0 && canServeRemaining) {
    return { status: "SELECT", action: "select" };
  }
  if (usedOnStep1 && candidates.length > 0 && canServeRemaining) {
    return { status: "USE AGAIN", action: "use_again" };
  }
  if (
    usedOnStep1 ||
    hasExistingFabricProductAllocation(fabricAllocationState, fabricCode)
  ) {
    return { status: "IN USE", action: "none" };
  }
  if (candidates.length > 0) {
    return { status: "SELECT", action: "none" };
  }
  return { status: "ALL GARMENTS HAVE FABRIC", action: "none" };
};

const resolveCommitTargets = ({
  garmentTypeSelection,
  fabricAllocationState,
  selectedGarmentKeys,
  mode,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  selectedGarmentKeys: readonly string[];
  mode: "selected" | "all_remaining";
}): { garmentKeys: string[]; error?: Step1FabricAssignmentCommitResult } => {
  const currentCandidates = getUnassignedStep1FabricAssignmentCandidates({
    garmentTypeSelection,
    fabricAllocationState,
  });
  const currentKeys = candidateGarmentKeys(currentCandidates);
  if (mode === "all_remaining") {
    return { garmentKeys: currentKeys };
  }
  const requested = [...selectedGarmentKeys];
  if (requested.some((garmentKey) => !currentKeys.includes(garmentKey))) {
    return {
      garmentKeys: [],
      error: {
        status: "blocked",
        state: fabricAllocationState,
        error: STEP1_GARMENT_ALREADY_ASSIGNED_MESSAGE,
        reason: "GARMENT_ALREADY_ASSIGNED",
        failedGarmentKey: requested.find(
          (garmentKey) => !currentKeys.includes(garmentKey),
        ),
      },
    };
  }
  return { garmentKeys: requested };
};

export const commitStep1FabricAssignment = ({
  state,
  garmentTypeSelection,
  fabrics,
  fabricCode,
  selectedGarmentKeys,
  mode,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabrics: readonly Fabric[];
  fabricCode: string;
  selectedGarmentKeys: readonly string[];
  mode: "selected" | "all_remaining";
}): Step1FabricAssignmentCommitResult => {
  const resolved = resolveCurrentCatalogueFabricForAssignment({
    fabrics,
    fabricCode,
  });
  if (resolved.status !== "resolved") {
    return {
      status: "blocked",
      state,
      error: resolved.reason,
      reason: "FABRIC_UNAVAILABLE",
    };
  }
  const currentFabricCode = resolved.fabric.code;
  const targets = resolveCommitTargets({
    garmentTypeSelection,
    fabricAllocationState: state,
    selectedGarmentKeys,
    mode,
  });
  if (targets.error) {
    return targets.error;
  }
  const garmentKeys = targets.garmentKeys;
  if (garmentKeys.length === 0) {
    return {
      status: "blocked",
      state,
      error: STEP1_ASSIGNMENT_FAILED_MESSAGE,
      reason: "ASSIGNMENT_FAILED",
    };
  }
  const result = assignSameFabricProductToGarments({
    state,
    garmentTypeSelection,
    fabricCode: currentFabricCode,
    garmentKeys,
  });
  if (result.status !== "assigned") {
    const requiredFabricQuantity = getFutureGarmentFabricPlanning({
      garmentTypeSelection,
      fabricAllocationState: state,
    }).requiredFabricQuantity;
    if (result.reason === "FABRIC_QUANTITY_LIMIT_REACHED") {
      return {
        status: "blocked",
        state,
        error: formatFabricQuantityLimitChangeCopy(requiredFabricQuantity),
        reason: "FABRIC_QUANTITY_LIMIT_REACHED",
        failedGarmentKey: result.failedGarmentKey,
      };
    }
    return {
      status: "blocked",
      state,
      error: result.failedGarmentKey
        ? STEP1_GARMENT_CAPACITY_MESSAGE
        : STEP1_ASSIGNMENT_FAILED_MESSAGE,
      reason:
        result.reason === "INVALID_CAPACITY"
          ? "INVALID_CAPACITY"
          : "ASSIGNMENT_FAILED",
      failedGarmentKey: result.failedGarmentKey,
    };
  }
  return {
    status: "assigned",
    state: result.state,
    assignedGarmentKeys: result.assignedGarmentKeys,
  };
};
