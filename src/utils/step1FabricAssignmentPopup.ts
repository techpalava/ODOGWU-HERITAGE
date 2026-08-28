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
  getFutureFabricBulkChoiceCandidates,
  getFutureFabricStep1AssignmentTargets,
  type FutureFabricAssignmentTarget,
  type FutureFabricBulkAssignmentResult,
} from "./designStudioFutureFabricStage";

export const STEP1_FABRIC_ASSIGNMENT_TITLE = "Assign Fabric to Garments";
export const STEP1_FABRIC_ASSIGNMENT_DESCRIPTION =
  "Choose which garments should use this Fabric.";
export const STEP1_USE_FOR_ALL_LABEL = "YES — Use for All";
export const STEP1_INSUFFICIENT_CAPACITY_REASON = "Insufficient Fabric capacity";
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
        | "ASSIGNMENT_FAILED";
      failedGarmentKey?: string;
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
}): FutureFabricBulkAssignmentResult =>
  assignSameFabricProductToGarments({
    state,
    garmentTypeSelection,
    fabricCode,
    garmentKeys,
  });

const canExistingAllocationsCoverUnits = ({
  fabricAllocationState,
  fabricCode,
  requiredUnits,
}: {
  fabricAllocationState: FabricAllocationState;
  fabricCode: string;
  requiredUnits: number;
}): boolean => {
  if (requiredUnits <= 0) return true;
  if (!hasExistingFabricProductAllocation(fabricAllocationState, fabricCode)) {
    return true;
  }
  return (
    getRemainingCapacityUnitsOnExistingFabricAllocations({
      fabricAllocationState,
      fabricCode,
    }) >= requiredUnits
  );
};

export const canAssignFabricProductToStep1Garment = ({
  garmentTypeSelection,
  fabricAllocationState,
  fabricCode,
  garmentKey,
  fabricUnits,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  fabricCode: string;
  garmentKey: string;
  fabricUnits: number;
}): boolean => {
  if (
    !canExistingAllocationsCoverUnits({
      fabricAllocationState,
      fabricCode,
      requiredUnits: fabricUnits,
    })
  ) {
    return false;
  }
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
  requiredUnits,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  fabricCode: string;
  garmentKeys: readonly string[];
  requiredUnits: number;
}): boolean => {
  if (garmentKeys.length === 0) return false;
  if (
    !canExistingAllocationsCoverUnits({
      fabricAllocationState,
      fabricCode,
      requiredUnits,
    })
  ) {
    return false;
  }
  const result = dryRunAssignGarmentKeys({
    state: fabricAllocationState,
    garmentTypeSelection,
    fabricCode,
    garmentKeys,
  });
  return result.status === "assigned";
};

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
    const individuallyAssignable = canAssignFabricProductToStep1Garment({
      garmentTypeSelection,
      fabricAllocationState,
      fabricCode,
      garmentKey: assignment.garmentKey,
      fabricUnits: assignment.fabricUnits,
    });
    return {
      garmentKey: assignment.garmentKey,
      garmentType: assignment.garmentType,
      fabricUnits: assignment.fabricUnits,
      capacityUsageCopy: getGarmentFabricCapacityUsageCopy(assignment.garmentType),
      individuallyAssignable,
      disabledReason: individuallyAssignable
        ? null
        : STEP1_INSUFFICIENT_CAPACITY_REASON,
    };
  });

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
}): {
  selectedCount: number;
  canAssignSelected: boolean;
  canUseForAll: boolean;
  selectedCapacityMessage: string | null;
  remainingCapacityMessage: string | null;
} => {
  const candidateKeys = new Set(candidates.map((candidate) => candidate.garmentKey));
  const selected = selectedGarmentKeys.filter((garmentKey) =>
    candidateKeys.has(garmentKey),
  );
  const selectedUnits = selected.reduce((total, garmentKey) => {
    const candidate = candidates.find((row) => row.garmentKey === garmentKey);
    return total + (candidate?.fabricUnits ?? 0);
  }, 0);
  const remainingUnits = candidates.reduce(
    (total, candidate) => total + candidate.fabricUnits,
    0,
  );
  const remainingKeys = candidates.map((candidate) => candidate.garmentKey);
  const canUseForAll =
    remainingKeys.length > 0 &&
    canAssignFabricProductToStep1GarmentKeys({
      garmentTypeSelection,
      fabricAllocationState,
      fabricCode,
      garmentKeys: remainingKeys,
      requiredUnits: remainingUnits,
    });
  const canAssignSelected =
    selected.length > 0 &&
    selected.every((garmentKey) => {
      const candidate = candidates.find((row) => row.garmentKey === garmentKey);
      return candidate?.individuallyAssignable;
    }) &&
    canAssignFabricProductToStep1GarmentKeys({
      garmentTypeSelection,
      fabricAllocationState,
      fabricCode,
      garmentKeys: selected,
      requiredUnits: selectedUnits,
    });

  return {
    selectedCount: selected.length,
    canAssignSelected,
    canUseForAll,
    selectedCapacityMessage:
      selected.length > 0 && !canAssignSelected
        ? STEP1_SELECTED_CAPACITY_MESSAGE
        : null,
    remainingCapacityMessage: canUseForAll
      ? null
      : remainingKeys.length > 0
        ? STEP1_REMAINING_CAPACITY_MESSAGE
        : null,
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
  const candidates = buildStep1FabricAssignmentCandidates({
    garmentTypeSelection,
    fabricAllocationState: state,
    fabricCode: currentFabricCode,
  });
  const requiredUnits = garmentKeys.reduce((total, garmentKey) => {
    const candidate = candidates.find((row) => row.garmentKey === garmentKey);
    return total + (candidate?.fabricUnits ?? 0);
  }, 0);
  if (
    !canAssignFabricProductToStep1GarmentKeys({
      garmentTypeSelection,
      fabricAllocationState: state,
      fabricCode: currentFabricCode,
      garmentKeys,
      requiredUnits,
    })
  ) {
    return {
      status: "blocked",
      state,
      error:
        mode === "all_remaining"
          ? STEP1_REMAINING_CAPACITY_MESSAGE
          : STEP1_SELECTED_CAPACITY_MESSAGE,
      reason: "INVALID_CAPACITY",
    };
  }
  const result = assignSameFabricProductToGarments({
    state,
    garmentTypeSelection,
    fabricCode: currentFabricCode,
    garmentKeys,
  });
  if (result.status !== "assigned") {
    return {
      status: "blocked",
      state,
      error: STEP1_ASSIGNMENT_FAILED_MESSAGE,
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
