import { FabricCapacityEngine } from "./FabricCapacityEngine";
import type {
  FabricAllocation,
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentInputAssignment,
} from "../types";

export interface FabricAllocationSelection {
  code?: string;
  lowerGarmentType?: "trousers" | "skirt";
  garmentSpec?: FabricCapacityGarmentSpec;
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

  static syncForSelectedFabric(
    state: FabricAllocationState,
    selectedFabricCode: string | null,
    selectedGarment: FabricAllocationSelection | null,
  ): FabricAllocationState {
    if (state.awaitingFabricForPendingGarment) {
      if (!selectedFabricCode || !state.pendingFabricGarment) {
        return state;
      }

      return this.assignPendingGarmentToFabric(state, selectedFabricCode);
    }

    if (!selectedFabricCode) {
      return {
        fabricAllocations: state.fabricAllocations,
        activeAllocationId: null,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      };
    }

    let fabricAllocations = state.fabricAllocations;
    const activeAllocation = this.findOrCreateAllocation(
      state,
      selectedFabricCode,
    );
    const nextActiveAllocationId = activeAllocation.allocationId;

    if (!fabricAllocations.some((allocation) => allocation.allocationId === activeAllocation.allocationId)) {
      fabricAllocations = [...fabricAllocations, activeAllocation];
    }

    const nextAssignments = this.resolveSelectedGarment(selectedGarment);

    if (!selectedGarment) {
      return {
        fabricAllocations: fabricAllocations.map((allocation) =>
          allocation.allocationId === nextActiveAllocationId
            ? { ...allocation, garmentAssignments: [] }
            : allocation,
        ),
        activeAllocationId: nextActiveAllocationId,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      };
    }

    if (!nextAssignments) {
      return {
        fabricAllocations,
        activeAllocationId: nextActiveAllocationId,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      };
    }

    const prospectiveAllocation: FabricAllocation = {
      ...activeAllocation,
      garmentAssignments: nextAssignments,
    };

    const resolution = FabricCapacityEngine.resolveFabricAllocation(
      prospectiveAllocation,
    );

    if (resolution.status === "resolved") {
      return {
        fabricAllocations: fabricAllocations.map((allocation) =>
          allocation.allocationId === nextActiveAllocationId
            ? { ...allocation, garmentAssignments: nextAssignments }
            : allocation,
        ),
        activeAllocationId: nextActiveAllocationId,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      };
    }

    if (resolution.status === "capacity_exceeded") {
      return {
        fabricAllocations,
        activeAllocationId: nextActiveAllocationId,
        pendingFabricGarment: resolution.attemptedGarment,
        awaitingFabricForPendingGarment: false,
      };
    }

    return {
      fabricAllocations,
      activeAllocationId: nextActiveAllocationId,
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };
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

  private static findOrCreateAllocation(
    state: FabricAllocationState,
    fabricCode: string,
  ): FabricAllocation {
    const activeAllocation = state.fabricAllocations.find(
      (allocation) =>
        allocation.allocationId === state.activeAllocationId &&
        allocation.fabricCode === fabricCode,
    );
    if (activeAllocation) {
      return activeAllocation;
    }

    const matchingAllocation = state.fabricAllocations.find(
      (allocation) => allocation.fabricCode === fabricCode,
    );
    if (matchingAllocation) {
      return matchingAllocation;
    }

    return {
      allocationId: this.generateAllocationId(fabricCode, state.fabricAllocations),
      fabricCode,
      garmentAssignments: [],
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

    const resolution = FabricCapacityEngine.resolveGarmentAssignment(assignment);
    if (resolution.status !== "resolved") {
      return null;
    }

    return resolution.assignments;
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
