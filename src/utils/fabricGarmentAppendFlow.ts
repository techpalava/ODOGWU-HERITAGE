import { FabricAllocationStateEngine } from "../engine/FabricAllocationStateEngine";
import type { FabricAllocationSelection } from "../engine/FabricAllocationStateEngine";
import type {
  CustomDetailOption,
  FabricAllocationState,
} from "../types";

export const appendCustomerFabricGarment = (
  state: FabricAllocationState,
  fabricCode: string,
  garment: FabricAllocationSelection,
): FabricAllocationState => {
  const readyState = state.activeAllocationId
    ? state
    : FabricAllocationStateEngine.createAllocationForFabric(state, fabricCode);

  return FabricAllocationStateEngine.attemptAppendGarment(readyState, garment);
};

export type CustomDetailPhysicalGarmentTransitionStatus =
  | "selected"
  | "pending"
  | "removed"
  | "unchanged"
  | "blocked";

export interface CustomDetailPhysicalGarmentTransition {
  state: FabricAllocationState;
  status: CustomDetailPhysicalGarmentTransitionStatus;
}

const getPhysicalGarmentSelection = (
  option: CustomDetailOption | null | undefined,
): FabricAllocationSelection | null => {
  if (!option?.fabricCapacityGarmentSpec) return null;
  return {
    code: `CUSTOM_DETAIL_${option.id.toUpperCase()}`,
    garmentSpec: option.fabricCapacityGarmentSpec,
    lowerGarmentType: option.fabricCapacityGarmentSpec.lowerGarmentType,
  };
};

export const transitionCustomDetailPhysicalGarment = ({
  state,
  fabricCode,
  previousOption,
  nextOption,
  previousGarmentKey,
  nextSelection,
}: {
  state: FabricAllocationState;
  fabricCode: string;
  previousOption?: CustomDetailOption | null;
  nextOption?: CustomDetailOption | null;
  previousGarmentKey?: string;
  nextSelection?: FabricAllocationSelection | null;
}): CustomDetailPhysicalGarmentTransition => {
  if (state.pendingFabricGarment || state.awaitingFabricForPendingGarment) {
    return { state, status: "blocked" };
  }

  const previousSelection = getPhysicalGarmentSelection(previousOption);
  const resolvedNextSelection =
    nextSelection === undefined
      ? getPhysicalGarmentSelection(nextOption)
      : nextSelection;
  if (!previousSelection && !resolvedNextSelection && !previousGarmentKey) {
    return { state, status: "unchanged" };
  }
  if (previousOption?.id === nextOption?.id) {
    return { state, status: "unchanged" };
  }

  const resolvedPreviousGarmentKey =
    previousGarmentKey ?? previousSelection?.garmentSpec?.key;
  const previousAllocation = resolvedPreviousGarmentKey
    ? state.fabricAllocations.find((allocation) =>
        allocation.garmentAssignments.some(
          (assignment) => assignment.garmentKey === resolvedPreviousGarmentKey,
        ),
      )
    : undefined;

  if (!resolvedNextSelection) {
    return {
      state: resolvedPreviousGarmentKey
        ? FabricAllocationStateEngine.removeGarmentAssignments(state, [
            resolvedPreviousGarmentKey,
          ])
        : state,
      status: "removed",
    };
  }

  if (
    resolvedPreviousGarmentKey === resolvedNextSelection.garmentSpec?.key
  ) {
    return { state, status: "selected" };
  }

  let stateForAppend = state;
  if (resolvedPreviousGarmentKey) {
    stateForAppend = FabricAllocationStateEngine.removeGarmentAssignments(
      stateForAppend,
      [resolvedPreviousGarmentKey],
      previousAllocation
        ? { preserveEmptyAllocationId: previousAllocation.allocationId }
        : {},
    );
  }

  if (previousAllocation) {
    stateForAppend = FabricAllocationStateEngine.activateAllocation(
      stateForAppend,
      previousAllocation.allocationId,
    );
  } else if (stateForAppend.fabricAllocations[0]) {
    stateForAppend = FabricAllocationStateEngine.activateAllocation(
      stateForAppend,
      stateForAppend.fabricAllocations[0].allocationId,
    );
  }

  const nextState = appendCustomerFabricGarment(
    stateForAppend,
    previousAllocation?.fabricCode || fabricCode,
    resolvedNextSelection,
  );
  return {
    state: nextState,
    status: nextState.pendingFabricGarment ? "pending" : "selected",
  };
};
