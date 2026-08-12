import { FabricCapacityEngine } from "./FabricCapacityEngine";
import type {
  AdditionalGarmentDependencyStatus,
  FabricAllocation,
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentRole,
  FabricGarmentType,
  FabricGarmentInputAssignment,
} from "../types";

export interface FabricAllocationSelection {
  code?: string;
  lowerGarmentType?: "trousers" | "skirt";
  garmentSpec?: FabricCapacityGarmentSpec;
  sourceRole?: FabricGarmentRole;
  mainGarmentKey?: string;
  mainGarmentType?: FabricGarmentType;
  dependencyStatus?: AdditionalGarmentDependencyStatus;
}

export interface UnassignedPhysicalGarmentResolution {
  totalGarmentCount: number;
  assignedGarmentCount: number;
  unassignedGarments: FabricGarmentAssignment[];
}

interface RemoveGarmentAssignmentsOptions {
  preserveEmptyAllocationId?: string;
}

export class FabricAllocationStateEngine {
  static initialize(): FabricAllocationState {
    return {
      fabricAllocations: [],
      activeAllocationId: null,
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };
  }

  static selectPrimaryFabric(
    state: FabricAllocationState,
    selectedFabricCode: string | null,
    selectedGarment: FabricAllocationSelection | null,
  ): FabricAllocationState {
    if (state.awaitingFabricForPendingGarment) {
      return state;
    }

    if (!selectedFabricCode) {
      return {
        fabricAllocations: state.fabricAllocations,
        activeAllocationId: null,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      };
    }

    const primaryAllocation = state.fabricAllocations[0];
    if (primaryAllocation) {
      if (primaryAllocation.fabricCode === selectedFabricCode) {
        return state;
      }

      return {
        fabricAllocations: state.fabricAllocations.map((allocation, index) =>
          index === 0
            ? { ...allocation, fabricCode: selectedFabricCode }
            : allocation,
        ),
        activeAllocationId: state.activeAllocationId,
        pendingFabricGarment: state.pendingFabricGarment,
        awaitingFabricForPendingGarment:
          state.awaitingFabricForPendingGarment,
      };
    }

    const nextAssignments = this.resolveSelectedGarment(selectedGarment);
    const allocationId = this.generateAllocationId(selectedFabricCode, []);
    const allocation: FabricAllocation = {
      allocationId,
      fabricCode: selectedFabricCode,
      garmentAssignments: nextAssignments || [],
    };

    return {
      fabricAllocations: [allocation],
      activeAllocationId: allocationId,
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };
  }

  static syncPrimaryGarmentSelection(
    state: FabricAllocationState,
    selectedFabricCode: string | null,
    selectedGarment: FabricAllocationSelection | null,
  ): FabricAllocationState {
    const fabricState = this.selectPrimaryFabric(
      state,
      selectedFabricCode,
      selectedGarment,
    );
    if (
      fabricState.awaitingFabricForPendingGarment ||
      !selectedFabricCode
    ) {
      return fabricState;
    }

    const primaryAllocation = fabricState.fabricAllocations[0];
    if (!primaryAllocation) {
      return fabricState;
    }

    const nextAssignments = this.resolveSelectedGarment(selectedGarment);

    if (!selectedGarment) {
      return {
        fabricAllocations: fabricState.fabricAllocations.map(
          (allocation, index) =>
            index === 0
              ? { ...allocation, garmentAssignments: [] }
              : allocation,
        ),
        activeAllocationId: fabricState.activeAllocationId,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      };
    }

    if (!nextAssignments) {
      return fabricState;
    }

    const prospectiveAllocation: FabricAllocation = {
      ...primaryAllocation,
      garmentAssignments: nextAssignments,
    };

    const resolution = FabricCapacityEngine.resolveFabricAllocation(
      prospectiveAllocation,
    );

    if (resolution.status === "resolved") {
      return {
        fabricAllocations: fabricState.fabricAllocations.map(
          (allocation, index) =>
            index === 0
              ? { ...allocation, garmentAssignments: nextAssignments }
              : allocation,
        ),
        activeAllocationId: fabricState.activeAllocationId,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      };
    }

    if (resolution.status === "capacity_exceeded") {
      return {
        fabricAllocations: fabricState.fabricAllocations,
        activeAllocationId: fabricState.activeAllocationId,
        pendingFabricGarment: resolution.attemptedGarment,
        awaitingFabricForPendingGarment: false,
      };
    }

    return fabricState;
  }

  static syncPrimaryGarmentComposition(
    state: FabricAllocationState,
    selectedFabricCode: string | null,
    selectedGarments: readonly FabricAllocationSelection[],
  ): FabricAllocationState {
    const fabricState = this.selectPrimaryFabric(
      state,
      selectedFabricCode,
      null,
    );
    if (!selectedFabricCode || fabricState.awaitingFabricForPendingGarment) {
      return fabricState;
    }

    const primaryAllocation = fabricState.fabricAllocations[0];
    if (!primaryAllocation) return fabricState;

    const resolvedGarments = selectedGarments.map((selection) =>
      this.resolveSelectedGarment(selection),
    );
    if (resolvedGarments.some((assignments) => assignments === null)) {
      return fabricState;
    }

    const nextBaseAssignments = resolvedGarments.flatMap(
      (assignments) => assignments || [],
    );
    const nextBaseGarmentKeys = new Set(
      nextBaseAssignments.map((assignment) => assignment.garmentKey),
    );
    const currentBaseAssignments = fabricState.fabricAllocations
      .flatMap((allocation) => allocation.garmentAssignments)
      .filter((assignment) => nextBaseGarmentKeys.has(assignment.garmentKey));
    const hasSameBaseComposition =
      currentBaseAssignments.length === nextBaseAssignments.length &&
      currentBaseAssignments.every((assignment, index) => {
        const candidate = nextBaseAssignments[index];
        return (
          candidate?.garmentKey === assignment.garmentKey &&
          candidate.fabricUnits === assignment.fabricUnits &&
          candidate.garmentType === assignment.garmentType
        );
      });
    if (hasSameBaseComposition && !fabricState.pendingFabricGarment) {
      return fabricState;
    }

    const retainedAdditionalAllocations = fabricState.fabricAllocations.map(
      (allocation) => ({
        ...allocation,
        garmentAssignments: allocation.garmentAssignments.flatMap(
          (assignment) => {
            const isLegacyAdditionalGarment =
              assignment.code.startsWith("CUSTOM_DETAIL_ADDITIONAL_GARMENT_") ||
              assignment.garmentSpec?.key.startsWith(
                "custom-detail:additional_physical_garment:",
              );
            if (assignment.sourceRole !== "additional" && !isLegacyAdditionalGarment) {
              return [];
            }
            return [{
              ...assignment,
              sourceRole: "additional" as const,
              mainGarmentKey: assignment.mainGarmentKey,
              mainGarmentType: assignment.mainGarmentType || assignment.garmentType,
              dependencyStatus: assignment.dependencyStatus || "valid",
            }];
          },
        ),
      }),
    );
    let nextState: FabricAllocationState = {
      fabricAllocations: retainedAdditionalAllocations,
      activeAllocationId: primaryAllocation.allocationId,
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };

    for (const selection of selectedGarments) {
      nextState = this.attemptAppendGarment(nextState, selection);
      if (nextState.pendingFabricGarment) break;
    }

    return nextState;
  }

  static attemptAppendGarment(
    state: FabricAllocationState,
    attemptedGarment: FabricAllocationSelection,
  ): FabricAllocationState {
    if (!state.activeAllocationId || !attemptedGarment?.code) {
      return state;
    }

    const activeAllocation = state.fabricAllocations.find(
      (allocation) => allocation.allocationId === state.activeAllocationId,
    );
    if (!activeAllocation) {
      return state;
    }

    const resolvedAssignments = this.resolveSelectedGarment(attemptedGarment);
    if (!resolvedAssignments) {
      return {
        fabricAllocations: state.fabricAllocations,
        activeAllocationId: state.activeAllocationId,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      };
    }

    const nextAssignments = [
      ...activeAllocation.garmentAssignments,
      ...resolvedAssignments,
    ];

    const prospectiveAllocation: FabricAllocation = {
      ...activeAllocation,
      garmentAssignments: nextAssignments,
    };

    const resolution = FabricCapacityEngine.resolveFabricAllocation(
      prospectiveAllocation,
    );

    if (resolution.status === "resolved") {
      return {
        fabricAllocations: state.fabricAllocations.map((allocation) =>
          allocation.allocationId === state.activeAllocationId
            ? { ...allocation, garmentAssignments: nextAssignments }
            : allocation,
        ),
        activeAllocationId: state.activeAllocationId,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      };
    }

    if (resolution.status === "capacity_exceeded") {
      return {
        fabricAllocations: state.fabricAllocations,
        activeAllocationId: state.activeAllocationId,
        pendingFabricGarment: resolution.attemptedGarment,
        awaitingFabricForPendingGarment: false,
      };
    }

    return {
      fabricAllocations: state.fabricAllocations,
      activeAllocationId: state.activeAllocationId,
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };
  }

  static useSameFabricForPendingGarment(
    state: FabricAllocationState,
  ): FabricAllocationState {
    if (!state.pendingFabricGarment || !state.activeAllocationId) {
      return state;
    }

    const activeAllocation = state.fabricAllocations.find(
      (allocation) => allocation.allocationId === state.activeAllocationId,
    );
    if (!activeAllocation) {
      return state;
    }

    const allocationId = this.generateAllocationId(
      activeAllocation.fabricCode,
      state.fabricAllocations,
    );
    const newAllocation: FabricAllocation = {
      allocationId,
      fabricCode: activeAllocation.fabricCode,
      garmentAssignments: [state.pendingFabricGarment],
    };

    return {
      fabricAllocations: [...state.fabricAllocations, newAllocation],
      activeAllocationId: allocationId,
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };
  }

  static resolveUnassignedPhysicalGarments(
    state: FabricAllocationState,
    selectedGarments: readonly FabricAllocationSelection[],
  ): UnassignedPhysicalGarmentResolution {
    const requestedGarments = selectedGarments.flatMap(
      (selection) => this.resolveSelectedGarment(selection) || [],
    );
    const assignedGarmentKeys = new Set(
      state.fabricAllocations.flatMap((allocation) =>
        allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
      ),
    );
    const unassignedGarments = requestedGarments.filter(
      (assignment) => !assignedGarmentKeys.has(assignment.garmentKey),
    );

    return {
      totalGarmentCount: requestedGarments.length,
      assignedGarmentCount: requestedGarments.length - unassignedGarments.length,
      unassignedGarments,
    };
  }

  static continueUnassignedPhysicalGarments(
    state: FabricAllocationState,
    selectedGarments: readonly FabricAllocationSelection[],
  ): FabricAllocationState {
    if (
      state.pendingFabricGarment ||
      state.awaitingFabricForPendingGarment ||
      !state.activeAllocationId
    ) {
      return state;
    }

    const nextGarment = this.resolveUnassignedPhysicalGarments(
      state,
      selectedGarments,
    ).unassignedGarments[0];
    if (!nextGarment) return state;

    return {
      ...state,
      pendingFabricGarment: nextGarment,
      awaitingFabricForPendingGarment: false,
    };
  }

  static useSameFabricForPendingGarmentAndContinue(
    state: FabricAllocationState,
    selectedGarments: readonly FabricAllocationSelection[],
  ): FabricAllocationState {
    let nextState = this.useSameFabricForPendingGarment(state);

    while (!nextState.pendingFabricGarment) {
      const nextGarment = this.resolveUnassignedPhysicalGarments(
        nextState,
        selectedGarments,
      ).unassignedGarments[0];
      if (!nextGarment) return nextState;

      nextState = this.attemptAppendResolvedGarments(nextState, [nextGarment]);
      const wasAssigned = nextState.fabricAllocations.some((allocation) =>
        allocation.garmentAssignments.some(
          (assignment) => assignment.garmentKey === nextGarment.garmentKey,
        ),
      );
      if (!wasAssigned && !nextState.pendingFabricGarment) {
        return {
          ...nextState,
          pendingFabricGarment: nextGarment,
          awaitingFabricForPendingGarment: false,
        };
      }
    }

    return nextState;
  }

  static beginChooseAnotherFabric(
    state: FabricAllocationState,
  ): FabricAllocationState {
    if (!state.pendingFabricGarment) {
      return state;
    }

    return {
      fabricAllocations: state.fabricAllocations,
      activeAllocationId: state.activeAllocationId,
      pendingFabricGarment: state.pendingFabricGarment,
      awaitingFabricForPendingGarment: true,
    };
  }

  static assignPendingGarmentToFabric(
    state: FabricAllocationState,
    fabricCode: string,
  ): FabricAllocationState {
    if (!state.pendingFabricGarment) {
      return {
        fabricAllocations: state.fabricAllocations,
        activeAllocationId: state.activeAllocationId,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      };
    }

    const allocationId = this.generateAllocationId(
      fabricCode,
      state.fabricAllocations,
    );
    const newAllocation: FabricAllocation = {
      allocationId,
      fabricCode,
      garmentAssignments: [state.pendingFabricGarment],
    };

    return {
      fabricAllocations: [...state.fabricAllocations, newAllocation],
      activeAllocationId: allocationId,
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };
  }

  static assignPendingGarmentToFabricAndContinue(
    state: FabricAllocationState,
    fabricCode: string,
    selectedGarments: readonly FabricAllocationSelection[],
  ): FabricAllocationState {
    return this.continueUnassignedPhysicalGarments(
      this.assignPendingGarmentToFabric(state, fabricCode),
      selectedGarments,
    );
  }

  static beginReassignGarmentToAnotherFabric(
    state: FabricAllocationState,
    garmentKey: string,
  ): FabricAllocationState {
    if (state.pendingFabricGarment || state.awaitingFabricForPendingGarment) {
      return state;
    }

    const assignment = state.fabricAllocations
      .flatMap((allocation) => allocation.garmentAssignments)
      .find((candidate) => candidate.garmentKey === garmentKey);
    if (!assignment) return state;

    const withoutPreviousAssignment = this.removeGarmentAssignments(state, [
      garmentKey,
    ]);
    return {
      ...withoutPreviousAssignment,
      pendingFabricGarment: assignment,
      awaitingFabricForPendingGarment: true,
    };
  }

  static cancelPendingGarment(
    state: FabricAllocationState,
  ): FabricAllocationState {
    return {
      fabricAllocations: state.fabricAllocations,
      activeAllocationId: state.activeAllocationId,
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };
  }

  static activateAllocation(
    state: FabricAllocationState,
    allocationId: string,
  ): FabricAllocationState {
    if (
      !state.fabricAllocations.some(
        (allocation) => allocation.allocationId === allocationId,
      )
    ) {
      return state;
    }
    return {
      ...state,
      activeAllocationId: allocationId,
    };
  }

  static removeGarmentAssignments(
    state: FabricAllocationState,
    garmentKeys: readonly string[],
    options: RemoveGarmentAssignmentsOptions = {},
  ): FabricAllocationState {
    const keys = new Set(garmentKeys);
    if (keys.size === 0) return state;

    const primaryAllocationId = state.fabricAllocations[0]?.allocationId;
    const fabricAllocations = state.fabricAllocations
      .map((allocation) => ({
        ...allocation,
        garmentAssignments: allocation.garmentAssignments.filter(
          (assignment) => !keys.has(assignment.garmentKey),
        ),
      }))
      .filter(
        (allocation) =>
          allocation.garmentAssignments.length > 0 ||
          allocation.allocationId === primaryAllocationId ||
          allocation.allocationId === options.preserveEmptyAllocationId,
      );
    const activeAllocationId = fabricAllocations.some(
      (allocation) => allocation.allocationId === state.activeAllocationId,
    )
      ? state.activeAllocationId
      : fabricAllocations[0]?.allocationId || null;

    return {
      fabricAllocations,
      activeAllocationId,
      pendingFabricGarment:
        state.pendingFabricGarment && keys.has(state.pendingFabricGarment.garmentKey)
          ? null
          : state.pendingFabricGarment,
      awaitingFabricForPendingGarment:
        state.pendingFabricGarment && keys.has(state.pendingFabricGarment.garmentKey)
          ? false
          : state.awaitingFabricForPendingGarment,
    };
  }

  static createAllocationForFabric(
    state: FabricAllocationState,
    fabricCode: string,
  ): FabricAllocationState {
    const allocationId = this.generateAllocationId(
      fabricCode,
      state.fabricAllocations,
    );
    const allocation: FabricAllocation = {
      allocationId,
      fabricCode,
      garmentAssignments: [],
    };

    return {
      fabricAllocations: [...state.fabricAllocations, allocation],
      activeAllocationId: allocationId,
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };
  }

  private static resolveSelectedGarment(
    selectedGarment: FabricAllocationSelection | null,
  ): FabricGarmentAssignment[] | null {
    if (!selectedGarment?.code) {
      return null;
    }

    const assignment: FabricGarmentInputAssignment = {
      code: selectedGarment.code,
    };

    if (selectedGarment.lowerGarmentType) {
      assignment.lowerGarmentType = selectedGarment.lowerGarmentType;
    }

    if (selectedGarment.garmentSpec) {
      assignment.garmentSpec = selectedGarment.garmentSpec;
    }
    if (selectedGarment.sourceRole) {
      assignment.sourceRole = selectedGarment.sourceRole;
    }
    if (selectedGarment.mainGarmentKey) {
      assignment.mainGarmentKey = selectedGarment.mainGarmentKey;
    }
    if (selectedGarment.mainGarmentType) {
      assignment.mainGarmentType = selectedGarment.mainGarmentType;
    }
    if (selectedGarment.dependencyStatus) {
      assignment.dependencyStatus = selectedGarment.dependencyStatus;
    }

    const resolution = FabricCapacityEngine.resolveGarmentAssignment(assignment);
    if (resolution.status !== "resolved") {
      return null;
    }

    return resolution.assignments;
  }

  private static attemptAppendResolvedGarments(
    state: FabricAllocationState,
    resolvedAssignments: readonly FabricGarmentAssignment[],
  ): FabricAllocationState {
    if (!state.activeAllocationId || resolvedAssignments.length === 0) {
      return state;
    }

    const activeAllocation = state.fabricAllocations.find(
      (allocation) => allocation.allocationId === state.activeAllocationId,
    );
    if (!activeAllocation) return state;

    const nextAssignments = [
      ...activeAllocation.garmentAssignments,
      ...resolvedAssignments,
    ];
    const resolution = FabricCapacityEngine.resolveFabricAllocation({
      ...activeAllocation,
      garmentAssignments: nextAssignments,
    });

    if (resolution.status === "resolved") {
      return {
        fabricAllocations: state.fabricAllocations.map((allocation) =>
          allocation.allocationId === state.activeAllocationId
            ? { ...allocation, garmentAssignments: nextAssignments }
            : allocation,
        ),
        activeAllocationId: state.activeAllocationId,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      };
    }

    if (resolution.status === "capacity_exceeded") {
      return {
        fabricAllocations: state.fabricAllocations,
        activeAllocationId: state.activeAllocationId,
        pendingFabricGarment: resolution.attemptedGarment,
        awaitingFabricForPendingGarment: false,
      };
    }

    return state;
  }

  private static generateAllocationId(
    fabricCode: string,
    allocations: FabricAllocation[],
  ): string {
    let index = 1;
    let allocationId = `${fabricCode}-${index}`;
    const existingIds = new Set(allocations.map((allocation) => allocation.allocationId));
    while (existingIds.has(allocationId)) {
      index += 1;
      allocationId = `${fabricCode}-${index}`;
    }
    return allocationId;
  }
}
