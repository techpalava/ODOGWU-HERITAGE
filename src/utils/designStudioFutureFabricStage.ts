import { createStyleBaseGarmentSpec, getFabricGarmentSelectionsForComposition } from "../config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "../engine/FabricAllocationStateEngine";
import {
  FabricCapacityEngine,
  getCustomerFacingFabricQuantityForAllocations,
  getCustomerFacingFabricQuantityForAssignments,
} from "../engine/FabricCapacityEngine";
import type {
  Fabric,
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentInputAssignment,
  GarmentTypeStepSelection,
} from "../types";
import { resolveFabricAllocationMaterialPricing } from "./fabricAllocationPricing";
import { resolveFabricPrice } from "./fabricPricing";
import { getGarmentTypeStageCompletion } from "./designStudioJourneyMode";
import { getStep1SelectableGarmentTypes } from "./garmentConstructionPricing";

export type FutureFabricStageBlockerCode =
  | "GARMENT_TYPE_INCOMPLETE"
  | "GARMENT_ASSIGNMENT_REQUIRED"
  | "PENDING_GARMENT_ASSIGNMENT"
  | "FABRIC_NOT_FOUND"
  | "FABRIC_UNAVAILABLE"
  | "FABRIC_PRICE_UNAVAILABLE"
  | "INVALID_ALLOCATION_CAPACITY"
  | "MALFORMED_ASSIGNMENT";

export interface FutureFabricStageBlocker {
  code: FutureFabricStageBlockerCode;
  garmentKey?: string;
  allocationId?: string;
  fabricCode?: string;
}

export interface FutureFabricStageCompletion {
  isComplete: boolean;
  blockers: FutureFabricStageBlocker[];
  requiredGarmentCount: number;
  assignedGarmentCount: number;
  fabricQuantity: number;
}

export const getFutureFabricCapacityComposition = (
  selection: GarmentTypeStepSelection,
): FabricCapacityGarmentSpec[] =>
  selection.garmentTypes.map((garmentType) =>
    createStyleBaseGarmentSpec(garmentType),
  );

export const getFutureFabricGarmentSelections = (
  selection: GarmentTypeStepSelection,
): FabricGarmentInputAssignment[] =>
  getFabricGarmentSelectionsForComposition(
    getFutureFabricCapacityComposition(selection),
  );

const resolveRequiredAssignments = (
  selection: GarmentTypeStepSelection,
): FabricGarmentAssignment[] =>
  getFutureFabricGarmentSelections(selection).flatMap((garment) => {
    const resolution = FabricCapacityEngine.resolveGarmentAssignment(garment);
    return resolution.status === "resolved" ? resolution.assignments : [];
  });

const resolveRequiredAssignmentsWithAdditional = (
  selection: GarmentTypeStepSelection,
  state: FabricAllocationState,
): FabricGarmentAssignment[] => {
  const byKey = new Map(
    resolveRequiredAssignments(selection).map((assignment) => [
      assignment.garmentKey,
      assignment,
    ]),
  );
  state.fabricAllocations.forEach((allocation) =>
    allocation.garmentAssignments.forEach((assignment) => {
      if (
        assignment.sourceRole === "additional" &&
        assignment.dependencyStatus !== "orphaned"
      ) {
        byKey.set(assignment.garmentKey, assignment);
      }
    }),
  );
  if (
    state.pendingFabricGarment?.sourceRole === "additional" &&
    state.pendingFabricGarment.dependencyStatus !== "orphaned"
  ) {
    byKey.set(
      state.pendingFabricGarment.garmentKey,
      state.pendingFabricGarment,
    );
  }
  return [...byKey.values()];
};

export interface FutureGarmentFabricPlanning {
  requiredGarmentCount: number;
  requiredFabricQuantity: number;
  selectedFabricQuantity: number;
}

export interface FutureFabricAssignmentTarget {
  assignment: FabricGarmentAssignment;
  selection: FabricGarmentInputAssignment;
}

export interface FutureFabricCapacityOffer {
  allocationId: string;
  fabricCode: string;
  target: FutureFabricAssignmentTarget;
}

export type FutureFabricAssignmentResult =
  | { status: "assigned"; state: FabricAllocationState }
  | {
      status: "blocked";
      reason: "GARMENT_NOT_FOUND" | "ASSIGNMENT_IN_PROGRESS" | "INVALID_CAPACITY";
      state: FabricAllocationState;
    };

const resolveFutureFabricAssignmentTargets = (
  selection: GarmentTypeStepSelection,
): FutureFabricAssignmentTarget[] =>
  getFutureFabricGarmentSelections(selection).flatMap((garmentSelection) => {
    const resolution =
      FabricCapacityEngine.resolveGarmentAssignment(garmentSelection);
    return resolution.status === "resolved"
      ? resolution.assignments.map((assignment) => ({
          assignment,
          selection: garmentSelection,
        }))
      : [];
  });

export const getFutureFabricAssignmentTargets = (
  selection: GarmentTypeStepSelection,
): FutureFabricAssignmentTarget[] =>
  resolveFutureFabricAssignmentTargets(selection).map((target) => ({
    assignment: { ...target.assignment },
    selection: {
      ...target.selection,
      garmentSpec: target.selection.garmentSpec
        ? { ...target.selection.garmentSpec }
        : undefined,
    },
  }));

export const getFutureUnassignedFabricTargets = ({
  garmentTypeSelection,
  fabricAllocationState,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
}): FutureFabricAssignmentTarget[] => {
  const assignedKeys = new Set(
    fabricAllocationState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
  );
  return getFutureFabricAssignmentTargets(garmentTypeSelection).filter(
    ({ assignment }) => !assignedKeys.has(assignment.garmentKey),
  );
};

const hasGarmentAssignment = (
  state: FabricAllocationState,
  garmentKey: string,
): boolean =>
  state.fabricAllocations.some((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === garmentKey,
    ),
  );

const removeEmptyFabricAllocations = (
  state: FabricAllocationState,
): FabricAllocationState => {
  const fabricAllocations = state.fabricAllocations.filter(
    (allocation) => allocation.garmentAssignments.length > 0,
  );
  return {
    ...state,
    fabricAllocations,
    activeAllocationId: fabricAllocations.some(
      (allocation) => allocation.allocationId === state.activeAllocationId,
    )
      ? state.activeAllocationId
      : fabricAllocations[0]?.allocationId || null,
  };
};

const assignTargetToFabric = ({
  state,
  target,
  fabricCode,
}: {
  state: FabricAllocationState;
  target: FutureFabricAssignmentTarget;
  fabricCode: string;
}): FutureFabricAssignmentResult => {
  if (state.pendingFabricGarment || state.awaitingFabricForPendingGarment) {
    return { status: "blocked", reason: "ASSIGNMENT_IN_PROGRESS", state };
  }

  const matchingAllocations = state.fabricAllocations.filter(
    (allocation) => allocation.fabricCode === fabricCode,
  );
  const orderedAllocations = [
    ...matchingAllocations.filter(
      (allocation) => allocation.allocationId === state.activeAllocationId,
    ),
    ...matchingAllocations.filter(
      (allocation) => allocation.allocationId !== state.activeAllocationId,
    ),
  ];

  for (const allocation of orderedAllocations) {
    const attempted = FabricAllocationStateEngine.attemptAppendGarment(
      FabricAllocationStateEngine.activateAllocation(
        state,
        allocation.allocationId,
      ),
      target.selection,
    );
    if (hasGarmentAssignment(attempted, target.assignment.garmentKey)) {
      return { status: "assigned", state: attempted };
    }
  }

  const withAllocation = FabricAllocationStateEngine.createAllocationForFabric(
    state,
    fabricCode,
  );
  const attempted = FabricAllocationStateEngine.attemptAppendGarment(
    withAllocation,
    target.selection,
  );
  if (!hasGarmentAssignment(attempted, target.assignment.garmentKey)) {
    return { status: "blocked", reason: "INVALID_CAPACITY", state };
  }
  return { status: "assigned", state: attempted };
};

export const assignFutureFabricToGarment = ({
  state,
  garmentTypeSelection,
  garmentKey,
  fabricCode,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  garmentKey: string;
  fabricCode: string;
}): FutureFabricAssignmentResult => {
  const target = getFutureFabricAssignmentTargets(garmentTypeSelection).find(
    ({ assignment }) => assignment.garmentKey === garmentKey,
  );
  if (!target) {
    return { status: "blocked", reason: "GARMENT_NOT_FOUND", state };
  }

  const sourceAllocation = state.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === garmentKey,
    ),
  );
  if (!sourceAllocation) {
    return assignTargetToFabric({ state, target, fabricCode });
  }
  if (sourceAllocation.fabricCode === fabricCode) {
    return { status: "assigned", state };
  }

  if (sourceAllocation.garmentAssignments.length === 1) {
    return {
      status: "assigned",
      state: {
        ...state,
        fabricAllocations: state.fabricAllocations.map((allocation) =>
          allocation.allocationId === sourceAllocation.allocationId
            ? { ...allocation, fabricCode }
            : allocation,
        ),
        activeAllocationId: sourceAllocation.allocationId,
      },
    };
  }

  const withoutTarget = FabricAllocationStateEngine.removeGarmentAssignments(
    state,
    [garmentKey],
  );
  const reassigned = assignTargetToFabric({
    state: withoutTarget,
    target,
    fabricCode,
  });
  return reassigned.status === "assigned"
    ? { status: "assigned", state: removeEmptyFabricAllocations(reassigned.state) }
    : { ...reassigned, state };
};

/**
 * Orchestrates the customer-facing Fabric-card action while keeping the
 * allocation engine as the only authority for assignment and capacity.
 */
export const applyFutureFabricCardSelection = ({
  state,
  garmentTypeSelection,
  garmentKey,
  fabricCode,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  garmentKey: string;
  fabricCode: string;
}): FabricAllocationState => {
  if (
    state.awaitingFabricForPendingGarment &&
    state.pendingFabricGarment?.garmentKey === garmentKey
  ) {
    return FabricAllocationStateEngine.assignPendingGarmentToFabric(
      state,
      fabricCode,
    );
  }

  const targetIsAlreadyAssigned = state.fabricAllocations.some((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === garmentKey,
    ),
  );
  if (!targetIsAlreadyAssigned) {
    return selectFutureFabric({
      state,
      garmentTypeSelection,
      fabricCode,
      targetGarmentKey: garmentKey,
    });
  }

  return assignFutureFabricToGarment({
    state,
    garmentTypeSelection,
    garmentKey,
    fabricCode,
  }).state;
};

/**
 * Removes one customer-facing garment assignment through the allocation
 * engine, dropping only allocations that become empty after that removal.
 */
export const removeFutureFabricAssignment = ({
  state,
  garmentKey,
}: {
  state: FabricAllocationState;
  garmentKey: string;
}): FabricAllocationState => {
  const withoutPendingFlow =
    FabricAllocationStateEngine.cancelPendingGarment(state);
  const removed = FabricAllocationStateEngine.removeGarmentAssignments(
    withoutPendingFlow,
    [garmentKey],
  );
  return removeEmptyFabricAllocations(removed);
};

export type FutureFabricCatalogueCardStatus = "SELECT" | "IN USE" | "ASSIGNED";
export type FutureFabricCatalogueCardAction = "select" | "cancel";

export interface FutureFabricCatalogueCardPresentation {
  status: FutureFabricCatalogueCardStatus;
  action: FutureFabricCatalogueCardAction;
  cancelGarmentKey: string | null;
}

const collectOrderedFabricAssignmentKeys = ({
  garmentTypeSelection,
  fabricAllocationState,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
}): string[] => {
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  const pushKey = (garmentKey: string) => {
    if (seen.has(garmentKey)) return;
    seen.add(garmentKey);
    orderedKeys.push(garmentKey);
  };
  getFutureFabricAssignmentTargets(garmentTypeSelection).forEach((target) =>
    pushKey(target.assignment.garmentKey),
  );
  fabricAllocationState.fabricAllocations.forEach((allocation) =>
    allocation.garmentAssignments.forEach((assignment) =>
      pushKey(assignment.garmentKey),
    ),
  );
  if (fabricAllocationState.pendingFabricGarment) {
    pushKey(fabricAllocationState.pendingFabricGarment.garmentKey);
  }
  return orderedKeys;
};

/**
 * Derives the catalogue-card status and click action from allocation identity.
 * Cancellation always targets a garment/allocation occurrence, never every
 * assignment that happens to share a fabric code.
 */
export const resolveFutureFabricCatalogueCardPresentation = ({
  fabricCode,
  garmentTypeSelection,
  fabricAllocationState,
  currentTargetGarmentKey,
}: {
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  currentTargetGarmentKey: string | null;
}): FutureFabricCatalogueCardPresentation => {
  const fabricByGarmentKey = new Map<string, string>();
  fabricAllocationState.fabricAllocations.forEach((allocation) =>
    allocation.garmentAssignments.forEach((assignment) => {
      fabricByGarmentKey.set(assignment.garmentKey, allocation.fabricCode);
    }),
  );
  const usingFabric = collectOrderedFabricAssignmentKeys({
    garmentTypeSelection,
    fabricAllocationState,
  }).filter((garmentKey) => fabricByGarmentKey.get(garmentKey) === fabricCode);
  const assignedToCurrentTarget = Boolean(
    currentTargetGarmentKey && usingFabric.includes(currentTargetGarmentKey),
  );
  const status: FutureFabricCatalogueCardStatus = assignedToCurrentTarget
    ? "ASSIGNED"
    : usingFabric.length > 0
      ? "IN USE"
      : "SELECT";

  if (assignedToCurrentTarget && currentTargetGarmentKey) {
    return {
      status,
      action: "cancel",
      cancelGarmentKey: currentTargetGarmentKey,
    };
  }

  if (currentTargetGarmentKey) {
    return { status, action: "select", cancelGarmentKey: null };
  }

  if (usingFabric.length > 0) {
    return {
      status,
      action: "cancel",
      cancelGarmentKey: usingFabric[0],
    };
  }

  return { status, action: "select", cancelGarmentKey: null };
};

/**
 * Cancels one catalogue assignment through the canonical removal path.
 * Additional garments keep their occurrence as a pending fabric assignment
 * so Custom Details is not deleted merely because fabric was unassigned.
 */
export const cancelFutureFabricCatalogueAssignment = ({
  state,
  garmentKey,
}: {
  state: FabricAllocationState;
  garmentKey: string;
}): FabricAllocationState => {
  const assignment = state.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .find((candidate) => candidate.garmentKey === garmentKey);
  const removed = removeFutureFabricAssignment({ state, garmentKey });
  if (assignment?.sourceRole !== "additional") {
    return removed;
  }
  return {
    ...removed,
    pendingFabricGarment: { ...assignment },
    awaitingFabricForPendingGarment: true,
  };
};

export const getFutureFabricCapacityOffer = ({
  garmentTypeSelection,
  fabricAllocationState,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
}): FutureFabricCapacityOffer | null => {
  if (
    fabricAllocationState.pendingFabricGarment ||
    fabricAllocationState.awaitingFabricForPendingGarment ||
    !fabricAllocationState.activeAllocationId
  ) {
    return null;
  }
  const activeAllocation = fabricAllocationState.fabricAllocations.find(
    (allocation) =>
      allocation.allocationId === fabricAllocationState.activeAllocationId,
  );
  const target = getFutureUnassignedFabricTargets({
    garmentTypeSelection,
    fabricAllocationState,
  })[0];
  if (!activeAllocation || !target) return null;

  const capacity = FabricCapacityEngine.resolveFabricAllocation({
    ...activeAllocation,
    garmentAssignments: [
      ...activeAllocation.garmentAssignments,
      target.assignment,
    ],
  });
  return capacity.status === "resolved"
    ? {
        allocationId: activeAllocation.allocationId,
        fabricCode: activeAllocation.fabricCode,
        target,
      }
    : null;
};

/**
 * Step 1 planning includes its base garments plus physical garments already
 * appended later in the journey. Capacity units remain the authority for the
 * required quantity; committed allocation IDs remain the authority for the
 * selected quantity.
 */
export const getFutureGarmentFabricPlanning = ({
  garmentTypeSelection,
  fabricAllocationState,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
}): FutureGarmentFabricPlanning => {
  const requiredAssignments = resolveRequiredAssignmentsWithAdditional(
    garmentTypeSelection,
    fabricAllocationState,
  );
  const required = getCustomerFacingFabricQuantityForAssignments(
    requiredAssignments,
  );
  const selected = getCustomerFacingFabricQuantityForAllocations(
    fabricAllocationState.fabricAllocations,
  );
  return {
    requiredGarmentCount: required.garmentCount,
    requiredFabricQuantity: required.fabricQuantity,
    selectedFabricQuantity: selected.allocations.length,
  };
};

/**
 * Step 1 fabric-progress numerator: committed allocations that include at
 * least one garment from the current selectable Step 1 cards. Additional-only
 * and hidden legacy garment allocations are excluded; mixed allocations count
 * once by allocation ID.
 */
export const getGarmentTypeStepSelectedFabricQuantity = ({
  garmentTypeSelection,
  fabricAllocationState,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
}): number => {
  const stepOneGarmentKeys = new Set(
    resolveRequiredAssignments({
      ...garmentTypeSelection,
      garmentTypes: getStep1SelectableGarmentTypes(
        garmentTypeSelection.garmentTypes,
      ),
    }).map((assignment) => assignment.garmentKey),
  );
  if (stepOneGarmentKeys.size === 0) {
    return 0;
  }
  const allocationIds = new Set<string>();
  for (const allocation of fabricAllocationState.fabricAllocations) {
    if (
      allocation.garmentAssignments.some((assignment) =>
        stepOneGarmentKeys.has(assignment.garmentKey),
      )
    ) {
      allocationIds.add(allocation.allocationId);
    }
  }
  return allocationIds.size;
};

/**
 * Reconciles committed assignments against Step 1 without choosing a fabric on
 * the customer's behalf. Existing valid assignments stay in their allocation;
 * new garments remain visible as unassigned until the Fabric step handles them.
 */
export const reconcileFutureFabricAllocationState = ({
  state,
  garmentTypeSelection,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
}): FabricAllocationState => {
  const requiredAssignments = resolveRequiredAssignments(garmentTypeSelection);
  const requiredByKey = new Map(
    requiredAssignments.map((assignment) => [assignment.garmentKey, assignment]),
  );
  state.fabricAllocations.forEach((allocation) =>
    allocation.garmentAssignments.forEach((assignment) => {
      if (
        assignment.sourceRole === "additional" &&
        assignment.dependencyStatus !== "orphaned"
      ) {
        requiredByKey.set(assignment.garmentKey, assignment);
      }
    }),
  );
  if (
    state.pendingFabricGarment?.sourceRole === "additional" &&
    state.pendingFabricGarment.dependencyStatus !== "orphaned"
  ) {
    requiredByKey.set(
      state.pendingFabricGarment.garmentKey,
      state.pendingFabricGarment,
    );
  }
  const retainedKeys = new Set<string>();
  const fabricAllocations = state.fabricAllocations.flatMap((allocation) => {
    const garmentAssignments = allocation.garmentAssignments.flatMap(
      (assignment) => {
        const required = requiredByKey.get(assignment.garmentKey);
        if (
          !required ||
          retainedKeys.has(assignment.garmentKey) ||
          required.garmentType !== assignment.garmentType ||
          required.fabricUnits !== assignment.fabricUnits
        ) {
          return [];
        }
        retainedKeys.add(assignment.garmentKey);
        return [{ ...required }];
      },
    );
    return garmentAssignments.length > 0
      ? [{ ...allocation, garmentAssignments }]
      : [];
  });
  const pendingRequired = state.pendingFabricGarment
    ? requiredByKey.get(state.pendingFabricGarment.garmentKey)
    : undefined;
  const pendingFabricGarment =
    pendingRequired && !retainedKeys.has(pendingRequired.garmentKey)
      ? { ...pendingRequired }
      : null;
  const activeAllocationId = fabricAllocations.some(
    (allocation) => allocation.allocationId === state.activeAllocationId,
  )
    ? state.activeAllocationId
    : fabricAllocations[0]?.allocationId || null;

  return {
    fabricAllocations,
    activeAllocationId,
    pendingFabricGarment,
    awaitingFabricForPendingGarment: Boolean(
      pendingFabricGarment && state.awaitingFabricForPendingGarment,
    ),
  };
};
export const selectFutureFabric = ({
  state,
  fabricCode,
  garmentTypeSelection,
  targetGarmentKey,
}: {
  state: FabricAllocationState;
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  targetGarmentKey?: string | null;
}): FabricAllocationState => {
  const selectedGarments = getFutureFabricGarmentSelections(
    garmentTypeSelection,
  );
  if (state.awaitingFabricForPendingGarment) {
    return FabricAllocationStateEngine.assignPendingGarmentToFabricAndContinue(
      state,
      fabricCode,
      selectedGarments,
    );
  }

  if (state.pendingFabricGarment) {
    return state;
  }

  const targets = getFutureFabricAssignmentTargets(garmentTypeSelection);
  const assignedKeys = new Set(
    state.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
  );
  const requestedTarget = targetGarmentKey
    ? targets.find(
        ({ assignment }) => assignment.garmentKey === targetGarmentKey,
      )
    : null;
  const target =
    requestedTarget && !assignedKeys.has(requestedTarget.assignment.garmentKey)
      ? requestedTarget
      : targets.find(({ assignment }) => !assignedKeys.has(assignment.garmentKey));
  if (!target) return state;

  const matchingAllocations = state.fabricAllocations.filter(
    (allocation) => allocation.fabricCode === fabricCode,
  );
  const orderedAllocations = [
    ...matchingAllocations.filter(
      (allocation) => allocation.allocationId === state.activeAllocationId,
    ),
    ...matchingAllocations.filter(
      (allocation) => allocation.allocationId !== state.activeAllocationId,
    ),
  ];
  let nextState: FabricAllocationState | null = null;
  for (const allocation of orderedAllocations) {
    const attempted = FabricAllocationStateEngine.attemptAppendGarment(
      FabricAllocationStateEngine.activateAllocation(
        state,
        allocation.allocationId,
      ),
      target.selection,
    );
    if (hasGarmentAssignment(attempted, target.assignment.garmentKey)) {
      nextState = attempted;
      break;
    }
    if (attempted.pendingFabricGarment && !nextState) {
      nextState = attempted;
    }
  }

  if (!nextState && orderedAllocations.length === 0) {
    const withAllocation =
      state.fabricAllocations.length === 0
        ? FabricAllocationStateEngine.selectPrimaryFabric(
            state,
            fabricCode,
            null,
          )
        : FabricAllocationStateEngine.createAllocationForFabric(
            state,
            fabricCode,
          );
    const attempted = FabricAllocationStateEngine.attemptAppendGarment(
      withAllocation,
      target.selection,
    );
    if (hasGarmentAssignment(attempted, target.assignment.garmentKey)) {
      nextState = attempted;
    } else if (attempted.pendingFabricGarment) {
      nextState = attempted;
    }
  }

  if (!nextState || !hasGarmentAssignment(nextState, target.assignment.garmentKey)) {
    return nextState?.pendingFabricGarment ? nextState : state;
  }

  while (!nextState.pendingFabricGarment) {
    const nextGarment =
      FabricAllocationStateEngine.resolveUnassignedPhysicalGarments(
        nextState,
        selectedGarments,
      ).unassignedGarments[0];
    if (!nextGarment) return nextState;
    const attempted = FabricAllocationStateEngine.attemptAppendGarment(
      nextState,
      nextGarment,
    );
    if (
      !hasGarmentAssignment(attempted, nextGarment.garmentKey) &&
      !attempted.pendingFabricGarment
    ) {
      return nextState;
    }
    nextState = attempted;
  }
  return nextState;
};

export const getFutureFabricStageCompletion = ({
  garmentTypeSelection,
  fabricAllocationState,
  fabrics,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  fabrics: Fabric[];
}): FutureFabricStageCompletion => {
  const requiredAssignments = resolveRequiredAssignmentsWithAdditional(
    garmentTypeSelection,
    fabricAllocationState,
  );
  const requiredByKey = new Map(
    requiredAssignments.map((assignment) => [assignment.garmentKey, assignment]),
  );
  const assignedKeys = new Set<string>();
  const blockers: FutureFabricStageBlocker[] = [];

  if (!getGarmentTypeStageCompletion(garmentTypeSelection).isComplete) {
    blockers.push({ code: "GARMENT_TYPE_INCOMPLETE" });
  }

  for (const allocation of fabricAllocationState.fabricAllocations) {
    const fabric = fabrics.find(
      (candidate) => candidate.code === allocation.fabricCode,
    );
    if (!fabric) {
      blockers.push({
        code: "FABRIC_NOT_FOUND",
        allocationId: allocation.allocationId,
        fabricCode: allocation.fabricCode,
      });
    } else if (
      fabric.stockStatus === "HIDDEN" ||
      fabric.stockStatus === "OUT_OF_STOCK"
    ) {
      blockers.push({
        code: "FABRIC_UNAVAILABLE",
        allocationId: allocation.allocationId,
        fabricCode: allocation.fabricCode,
      });
    } else if (resolveFabricPrice(fabric) === null) {
      blockers.push({
        code: "FABRIC_PRICE_UNAVAILABLE",
        allocationId: allocation.allocationId,
        fabricCode: allocation.fabricCode,
      });
    }

    if (
      FabricCapacityEngine.resolveFabricAllocation(allocation).status !==
      "resolved"
    ) {
      blockers.push({
        code: "INVALID_ALLOCATION_CAPACITY",
        allocationId: allocation.allocationId,
      });
    }

    for (const assignment of allocation.garmentAssignments) {
      const required = requiredByKey.get(assignment.garmentKey);
      if (
        !required ||
        assignedKeys.has(assignment.garmentKey) ||
        required.garmentType !== assignment.garmentType ||
        required.fabricUnits !== assignment.fabricUnits
      ) {
        blockers.push({
          code: "MALFORMED_ASSIGNMENT",
          garmentKey: assignment.garmentKey,
          allocationId: allocation.allocationId,
        });
      } else {
        assignedKeys.add(assignment.garmentKey);
      }
    }
  }

  for (const assignment of requiredAssignments) {
    if (!assignedKeys.has(assignment.garmentKey)) {
      blockers.push({
        code: "GARMENT_ASSIGNMENT_REQUIRED",
        garmentKey: assignment.garmentKey,
      });
    }
  }
  if (
    fabricAllocationState.pendingFabricGarment ||
    fabricAllocationState.awaitingFabricForPendingGarment
  ) {
    blockers.push({ code: "PENDING_GARMENT_ASSIGNMENT" });
  }

  const materialPricing = resolveFabricAllocationMaterialPricing(
    fabricAllocationState.fabricAllocations,
    fabrics,
  );
  if (
    fabricAllocationState.fabricAllocations.length > 0 &&
    materialPricing.status === "unresolved" &&
    !blockers.some((blocker) =>
      [
        "FABRIC_NOT_FOUND",
        "FABRIC_PRICE_UNAVAILABLE",
      ].includes(blocker.code),
    )
  ) {
    blockers.push({ code: "FABRIC_PRICE_UNAVAILABLE" });
  }

  return {
    isComplete: blockers.length === 0,
    blockers,
    requiredGarmentCount: requiredAssignments.length,
    assignedGarmentCount: assignedKeys.size,
    fabricQuantity: fabricAllocationState.fabricAllocations.length,
  };
};
