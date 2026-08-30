import { createStyleBaseGarmentSpec, getFabricGarmentSelectionsForComposition } from "../config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "../engine/FabricAllocationStateEngine";
import {
  FabricCapacityEngine,
  getCustomerFacingFabricQuantityForAllocations,
  getCustomerFacingFabricQuantityForAssignments,
  getFabricGarmentLabel,
} from "../engine/FabricCapacityEngine";
import type {
  Fabric,
  FabricAllocation,
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentInputAssignment,
  GarmentTypeStepSelection,
} from "../types";
import { resolveFabricAllocationMaterialPricing } from "./fabricAllocationPricing";
import { resolveFabricPrice } from "./fabricPricing";
import {
  canCreatePhysicalFabricAllocationForStock,
  formatFabricStockOverAllocatedCopy,
  getFabricStockOverAllocations,
  resolveFabricFromCatalogue,
  validateProjectedFabricStock,
} from "./fabricStockAvailability";
import { getGarmentTypeStageCompletion } from "./designStudioJourneyMode";
import {
  getStep1SelectableGarmentTypes,
  isStep1SelectableGarmentType,
} from "./garmentConstructionPricing";

export type FutureFabricStageBlockerCode =
  | "GARMENT_TYPE_INCOMPLETE"
  | "GARMENT_ASSIGNMENT_REQUIRED"
  | "PENDING_GARMENT_ASSIGNMENT"
  | "FABRIC_NOT_FOUND"
  | "FABRIC_UNAVAILABLE"
  | "FABRIC_PRICE_UNAVAILABLE"
  | "INVALID_ALLOCATION_CAPACITY"
  | "MALFORMED_ASSIGNMENT"
  | "FABRIC_QUANTITY_OVER_ALLOCATED"
  | "FABRIC_STOCK_OVER_ALLOCATED";

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

export type FutureFabricAssignmentBlockReason =
  | "GARMENT_NOT_FOUND"
  | "GARMENT_ALREADY_ASSIGNED"
  | "ALLOCATION_NOT_FOUND"
  | "ASSIGNMENT_IN_PROGRESS"
  | "INVALID_CAPACITY"
  | "FABRIC_QUANTITY_LIMIT_REACHED"
  | "FABRIC_STOCK_EXHAUSTED";

export type FutureFabricAssignmentResult =
  | { status: "assigned"; state: FabricAllocationState }
  | {
      status: "blocked";
      reason: FutureFabricAssignmentBlockReason;
      state: FabricAllocationState;
    };

export type FutureFabricCatalogueCancellationResult =
  | { status: "cancelled"; state: FabricAllocationState }
  | {
      status: "blocked";
      state: FabricAllocationState;
      reason: "OTHER_ADDITIONAL_GARMENT_PENDING";
    };

export type FutureFabricBulkAssignmentResult =
  | {
      status: "assigned";
      state: FabricAllocationState;
      assignedGarmentKeys: string[];
    }
  | {
      status: "blocked";
      state: FabricAllocationState;
      reason: FutureFabricAssignmentBlockReason;
      failedGarmentKey?: string;
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

const getAssignedFabricCode = (
  state: FabricAllocationState,
  garmentKey: string,
): string | null => {
  const allocation = state.fabricAllocations.find((candidate) =>
    candidate.garmentAssignments.some(
      (assignment) => assignment.garmentKey === garmentKey,
    ),
  );
  return allocation?.fabricCode ?? null;
};

const fabricWord = (quantity: number): string =>
  quantity === 1 ? "fabric" : "fabrics";

/**
 * Committed physical Fabric allocations, counted by allocation ID.
 * Empty allocations are ignored; duplicate fabricCode values still count
 * separately.
 */
export const getCommittedPhysicalFabricAllocationCount = (
  state: FabricAllocationState,
): number =>
  getCustomerFacingFabricQuantityForAllocations(state.fabricAllocations)
    .allocations.length;

export const getRequiredPhysicalFabricAllocationCount = ({
  garmentTypeSelection,
  fabricAllocationState,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
}): number =>
  getCustomerFacingFabricQuantityForAssignments(
    resolveRequiredAssignmentsWithAdditional(
      garmentTypeSelection,
      fabricAllocationState,
    ),
  ).fabricQuantity;

/**
 * Authoritative ceiling: a NEW physical Fabric allocation may be created
 * only while the committed allocation count is still below the required
 * quantity from Fabric Capacity units.
 */
export const canCreatePhysicalFabricAllocation = ({
  state,
  garmentTypeSelection,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
}): boolean =>
  getCommittedPhysicalFabricAllocationCount(state) <
  getRequiredPhysicalFabricAllocationCount({
    garmentTypeSelection,
    fabricAllocationState: state,
  });

export const isPhysicalFabricAllocationLimitReached = ({
  state,
  garmentTypeSelection,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
}): boolean =>
  !canCreatePhysicalFabricAllocation({ state, garmentTypeSelection });

export const isPhysicalFabricQuantityOverAllocated = ({
  selectedFabricQuantity,
  requiredFabricQuantity,
}: {
  selectedFabricQuantity: number;
  requiredFabricQuantity: number;
}): boolean => selectedFabricQuantity > requiredFabricQuantity;

export const formatFabricQuantityLimitReachedCopy = (
  requiredFabricQuantity: number,
): string =>
  `You have selected the ${requiredFabricQuantity} ${fabricWord(
    requiredFabricQuantity,
  )} needed for this order. Use one of your selected fabrics for the remaining garments, or change a selected fabric.`;

export const formatFabricQuantityLimitChangeCopy = (
  requiredFabricQuantity: number,
): string =>
  `Your order already uses the ${requiredFabricQuantity} ${fabricWord(
    requiredFabricQuantity,
  )} required. To use this Fabric, first remove or change another Fabric assignment.`;

export const formatFabricQuantityOverAllocatedCopy = (
  selectedFabricQuantity: number,
  requiredFabricQuantity: number,
): string =>
  `Your saved Fabric selections use ${selectedFabricQuantity} ${fabricWord(
    selectedFabricQuantity,
  )}, but this order requires ${requiredFabricQuantity}. Remove or change Fabric assignments until ${requiredFabricQuantity} ${
    requiredFabricQuantity === 1 ? "fabric remains" : "fabrics remain"
  }.`;

export interface FuturePartialFabricAllocationSummary {
  allocationId: string;
  fabricCode: string;
  usedUnits: number;
  remainingUnits: number;
  assignedGarmentKeys: readonly string[];
}

export interface FuturePartialFabricCompatibleTargets {
  allocationId: string;
  fabricCode: string;
  usedUnits: number;
  remainingUnits: number;
  compatibleGarmentKeys: readonly string[];
}

const resolveFuturePartialFabricAllocationSummary = (
  allocation: FabricAllocation,
): FuturePartialFabricAllocationSummary | null => {
  if (allocation.garmentAssignments.length === 0) {
    return null;
  }
  const resolution = FabricCapacityEngine.resolveFabricAllocation(allocation);
  if (resolution.status !== "resolved") {
    return null;
  }
  const usedUnits = resolution.totalUnits;
  return {
    allocationId: allocation.allocationId,
    fabricCode: allocation.fabricCode,
    usedUnits,
    remainingUnits: Math.max(
      0,
      FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION - usedUnits,
    ),
    assignedGarmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  };
};

export const getFuturePartialFabricAllocationSummaries = ({
  fabricAllocationState,
}: {
  fabricAllocationState: FabricAllocationState;
}): FuturePartialFabricAllocationSummary[] =>
  fabricAllocationState.fabricAllocations.flatMap((allocation) => {
    const summary = resolveFuturePartialFabricAllocationSummary(allocation);
    return summary ? [summary] : [];
  });

const getFuturePartialFabricAllocationsWithRemainingCapacity = ({
  fabricAllocationState,
}: {
  fabricAllocationState: FabricAllocationState;
}): FuturePartialFabricAllocationSummary[] =>
  getFuturePartialFabricAllocationSummaries({ fabricAllocationState }).filter(
    (summary) => summary.remainingUnits > 0,
  );

const getFutureFabricAssignmentTargetForGarmentKey = (
  garmentTypeSelection: GarmentTypeStepSelection,
  garmentKey: string,
): FutureFabricAssignmentTarget | null =>
  getFutureFabricAssignmentTargets(garmentTypeSelection).find(
    ({ assignment }) => assignment.garmentKey === garmentKey,
  ) ?? null;

const canFutureGarmentFitFabricAllocation = ({
  allocation,
  target,
}: {
  allocation: FabricAllocation;
  target: FutureFabricAssignmentTarget;
}): boolean => {
  const resolution = FabricCapacityEngine.resolveFabricAllocation({
    ...allocation,
    garmentAssignments: [...allocation.garmentAssignments, target.assignment],
  });
  return resolution.status === "resolved";
};

export const getFutureCompatiblePartialFabricAllocations = ({
  garmentTypeSelection,
  fabricAllocationState,
  garmentKey,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  garmentKey: string;
}): FuturePartialFabricAllocationSummary[] => {
  if (hasGarmentAssignment(fabricAllocationState, garmentKey)) {
    return [];
  }
  const target = getFutureFabricAssignmentTargetForGarmentKey(
    garmentTypeSelection,
    garmentKey,
  );
  if (!target) {
    return [];
  }
  return getFuturePartialFabricAllocationsWithRemainingCapacity({
    fabricAllocationState,
  }).filter((summary) => {
    const allocation = fabricAllocationState.fabricAllocations.find(
      (candidate) => candidate.allocationId === summary.allocationId,
    );
    if (!allocation) {
      return false;
    }
    return canFutureGarmentFitFabricAllocation({ allocation, target });
  });
};

export const getFuturePartialFabricAllocationCompatibleTargets = ({
  garmentTypeSelection,
  fabricAllocationState,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
}): FuturePartialFabricCompatibleTargets[] => {
  const unassignedTargets = getFutureUnassignedFabricTargets({
    garmentTypeSelection,
    fabricAllocationState,
  });
  return getFuturePartialFabricAllocationsWithRemainingCapacity({
    fabricAllocationState,
  }).map((summary) => {
    const allocation = fabricAllocationState.fabricAllocations.find(
      (candidate) => candidate.allocationId === summary.allocationId,
    );
    if (!allocation) {
      return {
        allocationId: summary.allocationId,
        fabricCode: summary.fabricCode,
        usedUnits: summary.usedUnits,
        remainingUnits: summary.remainingUnits,
        compatibleGarmentKeys: [],
      };
    }
    const compatibleGarmentKeys = unassignedTargets
      .filter((target) =>
        canFutureGarmentFitFabricAllocation({ allocation, target }),
      )
      .map(({ assignment }) => assignment.garmentKey);
    return {
      allocationId: summary.allocationId,
      fabricCode: summary.fabricCode,
      usedUnits: summary.usedUnits,
      remainingUnits: summary.remainingUnits,
      compatibleGarmentKeys,
    };
  });
};

export const hasAvoidablePartialFabricAllocation = ({
  garmentTypeSelection,
  fabricAllocationState,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
}): boolean =>
  getFuturePartialFabricAllocationCompatibleTargets({
    garmentTypeSelection,
    fabricAllocationState,
  }).some((entry) => entry.compatibleGarmentKeys.length > 0);

export const isFutureFinalPartialFabricAllocation = ({
  garmentTypeSelection,
  fabricAllocationState,
  allocationId,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  allocationId: string;
}): boolean => {
  const entry = getFuturePartialFabricAllocationSummaries({
    fabricAllocationState,
  }).find((candidate) => candidate.allocationId === allocationId);
  if (!entry || entry.remainingUnits <= 0) {
    return false;
  }
  return (
    getFutureUnassignedFabricTargets({
      garmentTypeSelection,
      fabricAllocationState,
    }).length === 0
  );
};

export interface FuturePartialFabricAssignmentTargetPresentation {
  allocationId: string;
  fabricCode: string;
  fabricSelectionNumber: number;
  usedUnits: number;
  remainingUnits: number;
  projectedUsedUnits: number;
  assignedGarmentKeys: readonly string[];
  assignedGarmentLabels: readonly string[];
  addGarmentKey: string;
  addGarmentLabel: string;
}

const getFutureGarmentAssignmentLabel = (
  garmentKey: string,
  fabricAllocationState: FabricAllocationState,
  garmentTypeSelection: GarmentTypeStepSelection,
): string => {
  const assigned = fabricAllocationState.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .find((assignment) => assignment.garmentKey === garmentKey);
  if (assigned) {
    return getFabricGarmentLabel(assigned.garmentType);
  }
  const target = getFutureFabricAssignmentTargets(garmentTypeSelection).find(
    ({ assignment }) => assignment.garmentKey === garmentKey,
  );
  return target
    ? getFabricGarmentLabel(target.assignment.garmentType)
    : garmentKey;
};

export const getFuturePartialFabricAssignmentTargetPresentations = ({
  garmentTypeSelection,
  fabricAllocationState,
  garmentKey,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  garmentKey: string;
}): FuturePartialFabricAssignmentTargetPresentation[] => {
  const target = getFutureFabricAssignmentTargetForGarmentKey(
    garmentTypeSelection,
    garmentKey,
  );
  if (!target) {
    return [];
  }
  return getFutureCompatiblePartialFabricAllocations({
    garmentTypeSelection,
    fabricAllocationState,
    garmentKey,
  }).map((summary) => {
    const fabricSelectionNumber =
      fabricAllocationState.fabricAllocations.findIndex(
        (allocation) => allocation.allocationId === summary.allocationId,
      ) + 1;
    return {
      allocationId: summary.allocationId,
      fabricCode: summary.fabricCode,
      fabricSelectionNumber,
      usedUnits: summary.usedUnits,
      remainingUnits: summary.remainingUnits,
      projectedUsedUnits: summary.usedUnits + target.assignment.fabricUnits,
      assignedGarmentKeys: summary.assignedGarmentKeys,
      assignedGarmentLabels: summary.assignedGarmentKeys.map((assignedKey) =>
        getFutureGarmentAssignmentLabel(
          assignedKey,
          fabricAllocationState,
          garmentTypeSelection,
        ),
      ),
      addGarmentKey: garmentKey,
      addGarmentLabel: getFabricGarmentLabel(
        target.assignment.garmentType,
      ),
    };
  });
};

export const isFutureFabricStep1BulkAssignment = (
  assignment: FabricGarmentAssignment,
  garmentTypeSelection: GarmentTypeStepSelection,
): boolean => {
  if (
    assignment.sourceRole === "additional" ||
    assignment.dependencyStatus === "orphaned"
  ) {
    return false;
  }
  if (!isStep1SelectableGarmentType(assignment.garmentType)) {
    return false;
  }
  return getStep1SelectableGarmentTypes(
    garmentTypeSelection.garmentTypes,
  ).includes(assignment.garmentType);
};

export const getFutureFabricStep1AssignmentTargets = (
  garmentTypeSelection: GarmentTypeStepSelection,
): FutureFabricAssignmentTarget[] =>
  getFutureFabricAssignmentTargets(garmentTypeSelection).filter(({ assignment }) =>
    isFutureFabricStep1BulkAssignment(assignment, garmentTypeSelection),
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

const assignmentToSelection = (
  assignment: FabricGarmentAssignment,
): FabricGarmentInputAssignment => ({
  code: assignment.code,
  lowerGarmentType: assignment.lowerGarmentType,
  garmentSpec: assignment.garmentSpec,
  sourceRole: assignment.sourceRole,
  mainGarmentKey: assignment.mainGarmentKey,
  mainGarmentType: assignment.mainGarmentType,
  eligibilityRule: assignment.eligibilityRule,
  dependencyStatus: assignment.dependencyStatus,
});

const getFutureFabricAssignmentTargetForKey = ({
  garmentTypeSelection,
  fabricAllocationState,
  garmentKey,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  garmentKey: string;
}): FutureFabricAssignmentTarget | null => {
  const fromSelection = getFutureFabricAssignmentTargets(
    garmentTypeSelection,
  ).find(({ assignment }) => assignment.garmentKey === garmentKey);
  if (fromSelection) return fromSelection;

  const assignment = resolveRequiredAssignmentsWithAdditional(
    garmentTypeSelection,
    fabricAllocationState,
  ).find((candidate) => candidate.garmentKey === garmentKey);
  if (!assignment) return null;
  return {
    assignment: { ...assignment },
    selection: assignmentToSelection(assignment),
  };
};

const restoreParkedPendingGarment = (
  state: FabricAllocationState,
  parked: FabricGarmentAssignment | null,
  awaiting: boolean,
): FabricAllocationState => {
  if (!parked) return state;
  if (hasGarmentAssignment(state, parked.garmentKey)) {
    return {
      ...state,
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };
  }
  return {
    ...state,
    pendingFabricGarment: parked,
    awaitingFabricForPendingGarment: awaiting,
  };
};

const tryAppendToMatchingFabricAllocations = ({
  state,
  target,
  fabricCode,
}: {
  state: FabricAllocationState;
  target: FutureFabricAssignmentTarget;
  fabricCode: string;
}): FabricAllocationState | null => {
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
      return attempted;
    }
  }
  return null;
};

const blockNewPhysicalAllocationForStock = ({
  fabricCode,
  fabrics,
  state,
}: {
  fabricCode: string;
  fabrics?: readonly Fabric[];
  state: FabricAllocationState;
}): FutureFabricAssignmentResult | null => {
  const fabric = resolveFabricFromCatalogue(fabricCode, fabrics);
  if (!fabric) {
    return null;
  }
  if (!canCreatePhysicalFabricAllocationForStock({ fabric, state })) {
    return { status: "blocked", reason: "FABRIC_STOCK_EXHAUSTED", state };
  }
  return null;
};

const finalizeAssignedFabricStock = ({
  fabricCode,
  fabrics,
  beforeState,
  afterState,
  fallbackState,
}: {
  fabricCode: string;
  fabrics?: readonly Fabric[];
  beforeState: FabricAllocationState;
  afterState: FabricAllocationState;
  fallbackState: FabricAllocationState;
}): FutureFabricAssignmentResult => {
  const fabric = resolveFabricFromCatalogue(fabricCode, fabrics);
  if (!fabric) {
    return { status: "assigned", state: afterState };
  }
  const validation = validateProjectedFabricStock({
    fabric,
    beforeState,
    afterState,
  });
  if (!validation.valid) {
    return {
      status: "blocked",
      reason: "FABRIC_STOCK_EXHAUSTED",
      state: fallbackState,
    };
  }
  return { status: "assigned", state: afterState };
};

const assignTargetToFabricCore = ({
  state,
  target,
  fabricCode,
  garmentTypeSelection,
  fabrics,
}: {
  state: FabricAllocationState;
  target: FutureFabricAssignmentTarget;
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabrics?: readonly Fabric[];
}): FutureFabricAssignmentResult => {
  const appended = tryAppendToMatchingFabricAllocations({
    state,
    target,
    fabricCode,
  });
  if (appended) {
    return finalizeAssignedFabricStock({
      fabricCode,
      fabrics,
      beforeState: state,
      afterState: appended,
      fallbackState: state,
    });
  }

  if (
    !canCreatePhysicalFabricAllocation({
      state,
      garmentTypeSelection,
    })
  ) {
    return {
      status: "blocked",
      reason: "FABRIC_QUANTITY_LIMIT_REACHED",
      state,
    };
  }

  const stockBlocked = blockNewPhysicalAllocationForStock({
    fabricCode,
    fabrics,
    state,
  });
  if (stockBlocked) {
    return stockBlocked;
  }

  const withAllocation =
    state.fabricAllocations.length === 0
      ? FabricAllocationStateEngine.selectPrimaryFabric(state, fabricCode, null)
      : FabricAllocationStateEngine.createAllocationForFabric(state, fabricCode);
  const attempted = FabricAllocationStateEngine.attemptAppendGarment(
    withAllocation,
    target.selection,
  );
  if (!hasGarmentAssignment(attempted, target.assignment.garmentKey)) {
    return { status: "blocked", reason: "INVALID_CAPACITY", state };
  }
  return finalizeAssignedFabricStock({
    fabricCode,
    fabrics,
    beforeState: state,
    afterState: attempted,
    fallbackState: state,
  });
};

const assignTargetToFabric = ({
  state,
  target,
  fabricCode,
  garmentTypeSelection,
  fabrics,
}: {
  state: FabricAllocationState;
  target: FutureFabricAssignmentTarget;
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabrics?: readonly Fabric[];
}): FutureFabricAssignmentResult => {
  if (state.pendingFabricGarment?.garmentKey === target.assignment.garmentKey) {
    const awaitingState = {
      ...state,
      awaitingFabricForPendingGarment: true,
    };
    const appended = tryAppendToMatchingFabricAllocations({
      state: awaitingState,
      target,
      fabricCode,
    });
    if (appended) {
      return finalizeAssignedFabricStock({
        fabricCode,
        fabrics,
        beforeState: state,
        afterState: appended,
        fallbackState: state,
      });
    }
    if (
      !canCreatePhysicalFabricAllocation({
        state: awaitingState,
        garmentTypeSelection,
      })
    ) {
      return {
        status: "blocked",
        reason: "FABRIC_QUANTITY_LIMIT_REACHED",
        state,
      };
    }
    const stockBlocked = blockNewPhysicalAllocationForStock({
      fabricCode,
      fabrics,
      state: awaitingState,
    });
    if (stockBlocked) {
      return stockBlocked;
    }
    const assigned = FabricAllocationStateEngine.assignPendingGarmentToFabric(
      awaitingState,
      fabricCode,
    );
    return finalizeAssignedFabricStock({
      fabricCode,
      fabrics,
      beforeState: state,
      afterState: assigned,
      fallbackState: state,
    });
  }

  const parkedPending = state.pendingFabricGarment;
  const parkedAwaiting = state.awaitingFabricForPendingGarment;
  const readyState =
    parkedPending || parkedAwaiting
      ? {
          ...state,
          pendingFabricGarment: null,
          awaitingFabricForPendingGarment: false,
        }
      : state;
  const result = assignTargetToFabricCore({
    state: readyState,
    target,
    fabricCode,
    garmentTypeSelection,
    fabrics,
  });
  if (result.status !== "assigned") {
    return { ...result, state };
  }
  return {
    status: "assigned",
    state: restoreParkedPendingGarment(
      result.state,
      parkedPending,
      parkedAwaiting,
    ),
  };
};

export const getFutureFabricBulkChoiceCandidates = ({
  garmentTypeSelection,
  fabricAllocationState,
  excludeGarmentKey,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  excludeGarmentKey?: string | null;
}): FutureFabricAssignmentTarget[] => {
  const assignedKeys = new Set(
    fabricAllocationState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
  );
  const pendingKey = fabricAllocationState.pendingFabricGarment?.garmentKey;
  return getFutureFabricStep1AssignmentTargets(garmentTypeSelection).filter(
    ({ assignment }) =>
      assignment.garmentKey !== excludeGarmentKey &&
      assignment.garmentKey !== pendingKey &&
      !assignedKeys.has(assignment.garmentKey),
  );
};

export const assignSameFabricProductToGarments = ({
  state,
  garmentTypeSelection,
  fabricCode,
  garmentKeys,
  fabrics,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricCode: string;
  garmentKeys: readonly string[];
  fabrics?: readonly Fabric[];
}): FutureFabricBulkAssignmentResult => {
  let workingState = state;
  const assignedGarmentKeys: string[] = [];
  for (const garmentKey of garmentKeys) {
    const existingCode = getAssignedFabricCode(workingState, garmentKey);
    if (existingCode === fabricCode) {
      assignedGarmentKeys.push(garmentKey);
      continue;
    }
    if (existingCode) {
      return {
        status: "blocked",
        state,
        reason: "INVALID_CAPACITY",
        failedGarmentKey: garmentKey,
      };
    }
    const result = assignFutureFabricToGarment({
      state: workingState,
      garmentTypeSelection,
      garmentKey,
      fabricCode,
      fabrics,
    });
    if (
      result.status !== "assigned" ||
      getAssignedFabricCode(result.state, garmentKey) !== fabricCode
    ) {
      return {
        status: "blocked",
        state,
        reason: result.status === "blocked" ? result.reason : "INVALID_CAPACITY",
        failedGarmentKey: garmentKey,
      };
    }
    workingState = result.state;
    assignedGarmentKeys.push(garmentKey);
  }
  if (
    workingState.pendingFabricGarment &&
    hasGarmentAssignment(workingState, workingState.pendingFabricGarment.garmentKey)
  ) {
    workingState = {
      ...workingState,
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };
  }
  return {
    status: "assigned",
    state: workingState,
    assignedGarmentKeys,
  };
};

export const assignFutureFabricToGarment = ({
  state,
  garmentTypeSelection,
  garmentKey,
  fabricCode,
  fabrics,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  garmentKey: string;
  fabricCode: string;
  fabrics?: readonly Fabric[];
}): FutureFabricAssignmentResult => {
  const target = getFutureFabricAssignmentTargetForKey({
    garmentTypeSelection,
    fabricAllocationState: state,
    garmentKey,
  });
  if (!target) {
    return { status: "blocked", reason: "GARMENT_NOT_FOUND", state };
  }

  const sourceAllocation = state.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === garmentKey,
    ),
  );
  if (!sourceAllocation) {
    return assignTargetToFabric({
      state,
      target,
      fabricCode,
      garmentTypeSelection,
      fabrics,
    });
  }
  if (sourceAllocation.fabricCode === fabricCode) {
    return { status: "assigned", state };
  }

  if (sourceAllocation.garmentAssignments.length === 1) {
    const nextState = {
      ...state,
      fabricAllocations: state.fabricAllocations.map((allocation) =>
        allocation.allocationId === sourceAllocation.allocationId
          ? { ...allocation, fabricCode }
          : allocation,
      ),
      activeAllocationId: sourceAllocation.allocationId,
    };
    return finalizeAssignedFabricStock({
      fabricCode,
      fabrics,
      beforeState: state,
      afterState: nextState,
      fallbackState: state,
    });
  }

  const withoutTarget = FabricAllocationStateEngine.removeGarmentAssignments(
    state,
    [garmentKey],
  );
  const reassigned = assignTargetToFabric({
    state: withoutTarget,
    target,
    fabricCode,
    garmentTypeSelection,
    fabrics,
  });
  return reassigned.status === "assigned"
    ? { status: "assigned", state: removeEmptyFabricAllocations(reassigned.state) }
    : { ...reassigned, state };
};

export const assignFutureGarmentToExistingFabricAllocation = ({
  state,
  garmentTypeSelection,
  garmentKey,
  allocationId,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  garmentKey: string;
  allocationId: string;
}): FutureFabricAssignmentResult => {
  const allocation = state.fabricAllocations.find(
    (candidate) => candidate.allocationId === allocationId,
  );
  if (!allocation) {
    return { status: "blocked", reason: "ALLOCATION_NOT_FOUND", state };
  }
  const target = getFutureFabricAssignmentTargetForKey({
    garmentTypeSelection,
    fabricAllocationState: state,
    garmentKey,
  });
  if (!target) {
    return { status: "blocked", reason: "GARMENT_NOT_FOUND", state };
  }
  if (hasGarmentAssignment(state, garmentKey)) {
    return { status: "blocked", reason: "GARMENT_ALREADY_ASSIGNED", state };
  }
  if (!canFutureGarmentFitFabricAllocation({ allocation, target })) {
    return { status: "blocked", reason: "INVALID_CAPACITY", state };
  }

  const parkedPending = state.pendingFabricGarment;
  const parkedAwaiting = state.awaitingFabricForPendingGarment;
  const readyState =
    parkedPending || parkedAwaiting
      ? {
          ...state,
          pendingFabricGarment: null,
          awaitingFabricForPendingGarment: false,
        }
      : state;
  const activated = FabricAllocationStateEngine.activateAllocation(
    readyState,
    allocationId,
  );
  const attempted = FabricAllocationStateEngine.attemptAppendGarment(
    activated,
    target.selection,
  );
  if (!hasGarmentAssignment(attempted, garmentKey)) {
    return { status: "blocked", reason: "INVALID_CAPACITY", state };
  }
  return {
    status: "assigned",
    state: restoreParkedPendingGarment(
      attempted,
      parkedPending,
      parkedAwaiting,
    ),
  };
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
  fabrics,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  garmentKey: string;
  fabricCode: string;
  fabrics?: readonly Fabric[];
}): FabricAllocationState => {
  if (state.pendingFabricGarment?.garmentKey === garmentKey) {
    const result = assignFutureFabricToGarment({
      state,
      garmentTypeSelection,
      garmentKey,
      fabricCode,
      fabrics,
    });
    return result.status === "assigned" ? result.state : state;
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
      fabrics,
    });
  }

  return assignFutureFabricToGarment({
    state,
    garmentTypeSelection,
    garmentKey,
    fabricCode,
    fabrics,
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
  const pending = state.pendingFabricGarment;
  const awaiting = state.awaitingFabricForPendingGarment;
  const isPendingTarget = pending?.garmentKey === garmentKey;
  const sourceState = isPendingTarget
    ? FabricAllocationStateEngine.cancelPendingGarment(state)
    : state;
  const removed = FabricAllocationStateEngine.removeGarmentAssignments(
    sourceState,
    [garmentKey],
  );
  const cleaned = removeEmptyFabricAllocations(removed);
  if (isPendingTarget || !pending) {
    return cleaned;
  }
  return restoreParkedPendingGarment(cleaned, pending, awaiting);
};

export type FutureFabricCatalogueCardStatus =
  | "SELECT"
  | "IN USE"
  | "ASSIGNED"
  | "USE AGAIN"
  | "ALL GARMENTS HAVE FABRIC";
export type FutureFabricCatalogueCardAction =
  | "select"
  | "cancel"
  | "use_again"
  | "none";

export interface FutureFabricCatalogueCardPresentation {
  status: FutureFabricCatalogueCardStatus;
  action: FutureFabricCatalogueCardAction;
  cancelGarmentKey: string | null;
  cancelGarmentKeys?: readonly string[];
}

export const REMOVE_FABRIC_ASSIGNMENT_TITLE = "Remove Fabric Assignment";
export const REMOVE_FABRIC_ASSIGNMENT_DESCRIPTION =
  "Choose which garment should stop using this Fabric.";

const emptyCancelPresentation = {
  cancelGarmentKey: null as string | null,
  cancelGarmentKeys: [] as readonly string[],
};

const singleCancelPresentation = (garmentKey: string) => ({
  cancelGarmentKey: garmentKey,
  cancelGarmentKeys: [garmentKey] as readonly string[],
});

const multiCancelPresentation = (garmentKeys: readonly string[]) => ({
  cancelGarmentKey: null as string | null,
  cancelGarmentKeys: garmentKeys,
});

/**
 * Attach exact cancel garmentKeys to a catalogue-card presentation without
 * changing the primary action. USE AGAIN can therefore keep reuse while the
 * card still owns the canonical X removal targets.
 */
export const withFutureFabricCatalogueCancelTargets = (
  presentation: Pick<FutureFabricCatalogueCardPresentation, "status" | "action">,
  cancelGarmentKeys: readonly string[],
): FutureFabricCatalogueCardPresentation => {
  if (cancelGarmentKeys.length === 1) {
    return {
      ...presentation,
      ...singleCancelPresentation(cancelGarmentKeys[0]!),
    };
  }
  if (cancelGarmentKeys.length > 1) {
    return {
      ...presentation,
      ...multiCancelPresentation(cancelGarmentKeys),
    };
  }
  return { ...presentation, ...emptyCancelPresentation };
};

export type UntargetedStep1CatalogueStatus =
  | "SELECT"
  | "USE AGAIN"
  | "IN USE"
  | "ALL GARMENTS HAVE FABRIC"
  | "UNAVAILABLE";

export type UntargetedStep1CatalogueAction = "select" | "use_again" | "none";

/**
 * Step 1/2 untargeted catalogue overlay: keep USE AGAIN as the primary
 * action while restoring canonical cancel targets for the X control.
 * Non-reusable IN USE falls back to the existing IN USE + X presentation.
 */
export const adaptUntargetedStep1CatalogueCardPresentation = ({
  step1Status,
  step1Action,
  cancelGarmentKeys,
}: {
  step1Status: UntargetedStep1CatalogueStatus;
  step1Action: UntargetedStep1CatalogueAction;
  cancelGarmentKeys: readonly string[];
}): FutureFabricCatalogueCardPresentation => {
  if (step1Action === "use_again") {
    return withFutureFabricCatalogueCancelTargets(
      { status: "USE AGAIN", action: "use_again" },
      cancelGarmentKeys,
    );
  }
  if (step1Status === "IN USE") {
    if (cancelGarmentKeys.length > 0) {
      return withFutureFabricCatalogueCancelTargets(
        { status: "IN USE", action: "cancel" },
        cancelGarmentKeys,
      );
    }
    return withFutureFabricCatalogueCancelTargets(
      { status: "IN USE", action: "none" },
      [],
    );
  }
  if (step1Status === "UNAVAILABLE") {
    return withFutureFabricCatalogueCancelTargets(
      { status: "SELECT", action: "none" },
      [],
    );
  }
  if (step1Status === "ALL GARMENTS HAVE FABRIC") {
    return withFutureFabricCatalogueCancelTargets(
      { status: "ALL GARMENTS HAVE FABRIC", action: "none" },
      [],
    );
  }
  return withFutureFabricCatalogueCancelTargets(
    {
      status: "SELECT",
      action: step1Action === "select" ? "select" : "none",
    },
    [],
  );
};

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

const collectUsingFabricGarmentKeys = ({
  fabricCode,
  garmentTypeSelection,
  fabricAllocationState,
}: {
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
}): string[] => {
  const fabricByGarmentKey = new Map<string, string>();
  fabricAllocationState.fabricAllocations.forEach((allocation) =>
    allocation.garmentAssignments.forEach((assignment) => {
      fabricByGarmentKey.set(assignment.garmentKey, allocation.fabricCode);
    }),
  );
  return collectOrderedFabricAssignmentKeys({
    garmentTypeSelection,
    fabricAllocationState,
  }).filter((garmentKey) => fabricByGarmentKey.get(garmentKey) === fabricCode);
};

/**
 * Exact garmentKeys this catalogue card may cancel. A focused catalogue
 * (Change Fabric / additional picker) owns only that target. An untargeted
 * Step 1/2 card owns committed Step 1 assignments using the Fabric; it owns
 * additional assignments only when no Step 1 assignment uses that Fabric,
 * matching the existing untargeted card cancellation path.
 */
export const getFutureFabricCatalogueCancelTargets = ({
  fabricCode,
  garmentTypeSelection,
  fabricAllocationState,
  currentTargetGarmentKey,
}: {
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  currentTargetGarmentKey: string | null;
}): readonly string[] => {
  const usingFabric = collectUsingFabricGarmentKeys({
    fabricCode,
    garmentTypeSelection,
    fabricAllocationState,
  });
  if (currentTargetGarmentKey) {
    return usingFabric.includes(currentTargetGarmentKey)
      ? [currentTargetGarmentKey]
      : [];
  }
  const step1KeySet = new Set(
    getFutureFabricAssignmentTargets(garmentTypeSelection).map(
      (target) => target.assignment.garmentKey,
    ),
  );
  const step1UsingFabric = usingFabric.filter((garmentKey) =>
    step1KeySet.has(garmentKey),
  );
  return step1UsingFabric.length > 0 ? step1UsingFabric : usingFabric;
};

/**
 * Derives the catalogue-card status and click action from allocation identity.
 * Cancellation always targets a garment/allocation occurrence, never every
 * assignment that happens to share a fabric code. Multiple untargeted
 * assignments never collapse to usingFabric[0].
 */
export const resolveFutureFabricCatalogueCardPresentation = ({
  fabricCode,
  garmentTypeSelection,
  fabricAllocationState,
  currentTargetGarmentKey,
  fabrics,
}: {
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  currentTargetGarmentKey: string | null;
  fabrics?: readonly Fabric[];
}): FutureFabricCatalogueCardPresentation => {
  const usingFabric = collectUsingFabricGarmentKeys({
    fabricCode,
    garmentTypeSelection,
    fabricAllocationState,
  });
  const cancelGarmentKeys = getFutureFabricCatalogueCancelTargets({
    fabricCode,
    garmentTypeSelection,
    fabricAllocationState,
    currentTargetGarmentKey,
  });
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
      ...singleCancelPresentation(currentTargetGarmentKey),
    };
  }

  if (currentTargetGarmentKey) {
    const assignmentResult = assignFutureFabricToGarment({
      state: fabricAllocationState,
      garmentTypeSelection,
      garmentKey: currentTargetGarmentKey,
      fabricCode,
      fabrics,
    });
    if (
      assignmentResult.status === "blocked" &&
      (assignmentResult.reason === "FABRIC_QUANTITY_LIMIT_REACHED" ||
        assignmentResult.reason === "FABRIC_STOCK_EXHAUSTED")
    ) {
      return { status, action: "none", ...emptyCancelPresentation };
    }
    return { status, action: "select", ...emptyCancelPresentation };
  }

  if (cancelGarmentKeys.length === 1) {
    return {
      status,
      action: "cancel",
      ...singleCancelPresentation(cancelGarmentKeys[0]!),
    };
  }

  if (cancelGarmentKeys.length > 1) {
    return {
      status,
      action: "cancel",
      ...multiCancelPresentation(cancelGarmentKeys),
    };
  }

  if (usingFabric.length > 0) {
    return { status, action: "none", ...emptyCancelPresentation };
  }

  return { status, action: "select", ...emptyCancelPresentation };
};

/**
 * Cancels one catalogue assignment through the canonical removal path.
 * Additional garments keep their occurrence as a pending fabric assignment
 * so Custom Details is not deleted merely because fabric was unassigned.
 *
 * One pending garment is allowed. Cancelling a committed additional garment
 * while a different additional garment is already pending is blocked so the
 * existing pending occurrence and its construction metadata stay intact.
 */
export const cancelFutureFabricCatalogueAssignment = ({
  state,
  garmentKey,
}: {
  state: FabricAllocationState;
  garmentKey: string;
}): FutureFabricCatalogueCancellationResult => {
  const assignment = state.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .find((candidate) => candidate.garmentKey === garmentKey);
  const existingPending = state.pendingFabricGarment;
  if (
    assignment?.sourceRole === "additional" &&
    existingPending?.sourceRole === "additional" &&
    existingPending.garmentKey !== garmentKey
  ) {
    return {
      status: "blocked",
      state,
      reason: "OTHER_ADDITIONAL_GARMENT_PENDING",
    };
  }
  const removed = removeFutureFabricAssignment({ state, garmentKey });
  if (assignment?.sourceRole !== "additional") {
    return { status: "cancelled", state: removed };
  }
  return {
    status: "cancelled",
    state: {
      ...removed,
      pendingFabricGarment: { ...assignment },
      awaitingFabricForPendingGarment: true,
    },
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

export const formatRequiredFabricQuantitySentence = (
  fabricQuantity: number,
  garmentCount: number,
): string => {
  const fabricLabel = fabricQuantity === 1 ? "fabric" : "fabrics";
  const garmentLabel = garmentCount === 1 ? "garment" : "garments";
  return `You need ${fabricQuantity} ${fabricLabel} for your ${garmentCount} ${garmentLabel}.`;
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

const getFutureFabricAssignmentSignature = (
  assignment: FabricGarmentAssignment,
): string => {
  const garmentSpec = assignment.garmentSpec;
  return [
    assignment.garmentKey,
    assignment.code,
    assignment.garmentType,
    String(assignment.fabricUnits),
    garmentSpec?.key ?? "",
    garmentSpec?.garmentType ?? "",
    garmentSpec ? String(garmentSpec.fabricUnits) : "",
    garmentSpec?.lowerGarmentType ?? "",
    assignment.lowerGarmentType ?? "",
    assignment.sourceRole ?? "",
    assignment.mainGarmentKey ?? "",
    assignment.mainGarmentType ?? "",
    assignment.eligibilityRule ?? "",
    assignment.dependencyStatus ?? "",
  ].join("/");
};

/**
 * Domain signature for Fabric allocation state equality checks.
 * Used to avoid setState loops when reconcile produces an equivalent snapshot.
 * Includes all semantically relevant allocation/assignment identity fields.
 */
export const getFutureFabricAllocationStateSignature = (
  state: FabricAllocationState,
): string => {
  const allocations = [...state.fabricAllocations]
    .sort((left, right) => left.allocationId.localeCompare(right.allocationId))
    .map((allocation) => {
      const assignments = [...allocation.garmentAssignments]
        .sort((left, right) => left.garmentKey.localeCompare(right.garmentKey))
        .map(getFutureFabricAssignmentSignature)
        .join(",");
      return `${allocation.allocationId}:${allocation.fabricCode}:{${assignments}}`;
    })
    .join("|");
  const pending = state.pendingFabricGarment
    ? getFutureFabricAssignmentSignature(state.pendingFabricGarment)
    : "";
  return `${allocations}#active=${state.activeAllocationId || ""}#pending=${pending}#awaiting=${state.awaitingFabricForPendingGarment ? 1 : 0}`;
};

export const reconcileFutureFabricAllocationStateIfChanged = ({
  state,
  garmentTypeSelection,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
}): FabricAllocationState => {
  const next = reconcileFutureFabricAllocationState({
    state,
    garmentTypeSelection,
  });
  return getFutureFabricAllocationStateSignature(state) ===
    getFutureFabricAllocationStateSignature(next)
    ? state
    : next;
};

export const selectFutureFabric = ({
  state,
  fabricCode,
  garmentTypeSelection,
  targetGarmentKey,
  fabrics,
}: {
  state: FabricAllocationState;
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  targetGarmentKey?: string | null;
  fabrics?: readonly Fabric[];
}): FabricAllocationState => {
  if (
    state.awaitingFabricForPendingGarment &&
    state.pendingFabricGarment &&
    (!targetGarmentKey ||
      targetGarmentKey === state.pendingFabricGarment.garmentKey)
  ) {
    const pendingTarget = getFutureFabricAssignmentTargetForKey({
      garmentTypeSelection,
      fabricAllocationState: state,
      garmentKey: state.pendingFabricGarment.garmentKey,
    });
    if (!pendingTarget) return state;
    const pendingResult = assignTargetToFabric({
      state,
      target: pendingTarget,
      fabricCode,
      garmentTypeSelection,
      fabrics,
    });
    return pendingResult.status === "assigned" ? pendingResult.state : state;
  }

  const assignedKeys = new Set(
    state.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
  );
  const requestedTarget = targetGarmentKey
    ? getFutureFabricAssignmentTargetForKey({
        garmentTypeSelection,
        fabricAllocationState: state,
        garmentKey: targetGarmentKey,
      })
    : null;
  const remaining = getFutureUnassignedFabricTargets({
    garmentTypeSelection,
    fabricAllocationState: state,
  });
  const target =
    requestedTarget && !assignedKeys.has(requestedTarget.assignment.garmentKey)
      ? requestedTarget
      : remaining[0] || null;
  if (!target) return state;

  const result = assignTargetToFabric({
    state,
    target,
    fabricCode,
    garmentTypeSelection,
    fabrics,
  });
  return result.status === "assigned" ? result.state : state;
};

export const formatFutureFabricStockOverAllocatedBlockerMessage = (
  fabrics: readonly Fabric[],
  fabricAllocationState: FabricAllocationState,
  fabricCode?: string,
): string => {
  const overAllocations = getFabricStockOverAllocations(
    fabrics,
    fabricAllocationState,
  );
  const target =
    (fabricCode
      ? overAllocations.find((entry) => entry.fabricCode === fabricCode)
      : null) || overAllocations[0];
  if (target) {
    return formatFabricStockOverAllocatedCopy(
      target.fabricName,
      target.used,
      target.stock,
    );
  }
  return "One or more Fabric selections exceed available stock. Remove or change a Fabric Selection.";
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

  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection,
    fabricAllocationState,
  });
  if (planning.selectedFabricQuantity > planning.requiredFabricQuantity) {
    blockers.push({ code: "FABRIC_QUANTITY_OVER_ALLOCATED" });
  }

  for (const overAllocation of getFabricStockOverAllocations(
    fabrics,
    fabricAllocationState,
  )) {
    blockers.push({
      code: "FABRIC_STOCK_OVER_ALLOCATED",
      fabricCode: overAllocation.fabricCode,
    });
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
