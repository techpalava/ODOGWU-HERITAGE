import {
  areLengthVariantsOfSameGarment,
  resolveBasePhysicalGarmentType,
} from "./garmentLengthVariant.js";
import { createStyleBaseGarmentSpec, getFabricGarmentSelectionsForComposition } from "../config/StyleFabricCapacityConfig.js";
import { FabricAllocationStateEngine } from "../engine/FabricAllocationStateEngine.js";
import {
  FabricCapacityEngine,
  getCustomerFacingFabricQuantityForAllocations,
  getCustomerFacingFabricQuantityForAssignments,
  getFabricGarmentLabel,
} from "../engine/FabricCapacityEngine.js";
import type {
  Fabric,
  FabricAllocation,
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentInputAssignment,
  GarmentTypeStepSelection,
} from "../types.js";
import { getFabricAvailabilityMessage } from "./fabricCatalogueAvailability.js";
import { resolveFabricAllocationMaterialPricing } from "./fabricAllocationPricing.js";
import { resolveFabricPrice } from "./fabricPricing.js";
import {
  canCreatePhysicalFabricAllocationForStock,
  formatFabricStockOverAllocatedCopy,
  getFabricStockOverAllocations,
  resolveFabricFromCatalogue,
  validateProjectedFabricStock,
} from "./fabricStockAvailability.js";
import { getGarmentTypeStageCompletion } from "./designStudioJourneyMode.js";
import {
  getStep1GarmentDisplayLabel,
  getStep1SelectableGarmentTypes,
  isStep1SelectableGarmentType,
} from "./garmentConstructionPricing.js";
import {
  physicalOccurrencesToFabricRequirements,
  validateRawFabricAssignments,
  type AuthoritativePhysicalOrderDiagnostic,
  type PhysicalGarmentOccurrence,
} from "./designSourceState.js";

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
  | "FABRIC_QUANTITY_STRANDED"
  | "FABRIC_STOCK_OVER_ALLOCATED"
  | "RAW_FABRIC_INTEGRITY_BLOCKED";

export interface FutureFabricHydrationIntegrity {
  diagnostics: readonly AuthoritativePhysicalOrderDiagnostic[];
  hasBlockingDiagnostics: boolean;
}

const cloneFabricAllocation = (
  allocation: FabricAllocation,
): FabricAllocation => ({
  ...allocation,
  garmentAssignments: allocation.garmentAssignments.map((assignment) => ({
    ...assignment,
    ...(assignment.garmentSpec
      ? { garmentSpec: { ...assignment.garmentSpec } }
      : {}),
  })),
});

const cloneFabricAllocationList = (
  allocations: readonly FabricAllocation[],
): FabricAllocation[] => allocations.map(cloneFabricAllocation);

export const validatePersistedFabricAllocationIntegrity = ({
  fabricAllocationState,
  authoritativeOccurrenceKeys,
}: {
  fabricAllocationState: FabricAllocationState;
  authoritativeOccurrenceKeys: ReadonlySet<string>;
}): FutureFabricHydrationIntegrity => {
  const diagnostics = validateRawFabricAssignments({
    authoritativeOccurrenceKeys,
    fabricAllocationState,
  }).diagnostics;
  return {
    diagnostics,
    hasBlockingDiagnostics: diagnostics.length > 0,
  };
};

export const prepareHydratedFabricAllocationState = ({
  rawState,
  garmentTypeSelection,
  authoritativeOccurrenceKeys,
  requiredPhysicalOccurrences,
}: {
  rawState: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  authoritativeOccurrenceKeys: ReadonlySet<string>;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): {
  integrity: FutureFabricHydrationIntegrity;
  reconciledState: FabricAllocationState;
  preservedRawFabricAllocations: FabricAllocation[] | null;
} => {
  const integrity = validatePersistedFabricAllocationIntegrity({
    fabricAllocationState: rawState,
    authoritativeOccurrenceKeys,
  });
  return {
    integrity,
    reconciledState: reconcileFutureFabricAllocationState({
      state: rawState,
      garmentTypeSelection,
      requiredPhysicalOccurrences,
    }),
    preservedRawFabricAllocations: integrity.hasBlockingDiagnostics
      ? cloneFabricAllocationList(rawState.fabricAllocations)
      : null,
  };
};

export interface HydratedFabricIntegrityRepairResolution {
  integrity: FutureFabricHydrationIntegrity;
  preservedRawFabricAllocations: FabricAllocation[] | null;
  repairedGarmentKeys: readonly string[];
}

const getFabricAssignmentRepairSignature = (
  allocation: FabricAllocation,
  assignment: FabricGarmentAssignment,
): string => {
  const garmentSpec = assignment.garmentSpec;
  return [
    allocation.allocationId,
    allocation.fabricCode,
    assignment.garmentKey,
    assignment.code,
    assignment.garmentType,
    String(assignment.fabricUnits),
    assignment.lowerGarmentType ?? "",
    garmentSpec?.key ?? "",
    garmentSpec?.garmentType ?? "",
    garmentSpec ? String(garmentSpec.fabricUnits) : "",
    garmentSpec?.lowerGarmentType ?? "",
    assignment.sourceRole ?? "",
    assignment.mainGarmentKey ?? "",
    assignment.mainGarmentType ?? "",
    assignment.eligibilityRule ?? "",
    assignment.dependencyStatus ?? "",
  ].join("/");
};

export interface HydratedOrphanFabricAssignmentRepairTarget {
  allocationId: string;
  fabricCode: string;
  garmentKey: string;
  garmentType: FabricGarmentAssignment["garmentType"];
  assignmentSignature: string;
}

export type HydratedOrphanFabricAssignmentRepairResult =
  | {
      status: "removed";
      rawFabricAllocations: FabricAllocation[];
      integrity: FutureFabricHydrationIntegrity;
      preservedRawFabricAllocations: FabricAllocation[] | null;
    }
  | {
      status: "blocked";
      reason:
        | "PRESERVED_RAW_STATE_UNAVAILABLE"
        | "STALE_REPAIR_REQUEST"
        | "AMBIGUOUS_REPAIR_TARGET"
        | "ASSIGNMENT_IS_AUTHORIZED";
    };

export const getHydratedOrphanFabricAssignmentRepairTargets = ({
  preservedRawFabricAllocations,
  authoritativeOccurrenceKeys,
}: {
  preservedRawFabricAllocations: readonly FabricAllocation[];
  authoritativeOccurrenceKeys: ReadonlySet<string>;
}): HydratedOrphanFabricAssignmentRepairTarget[] => {
  const rawState: FabricAllocationState = {
    fabricAllocations: cloneFabricAllocationList(preservedRawFabricAllocations),
    activeAllocationId: preservedRawFabricAllocations[0]?.allocationId ?? null,
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  const orphanKeys = new Set(
    validatePersistedFabricAllocationIntegrity({
      fabricAllocationState: rawState,
      authoritativeOccurrenceKeys,
    }).diagnostics
      .filter((diagnostic) => diagnostic.code === "orphan_fabric_assignment")
      .map((diagnostic) => diagnostic.garmentKey)
      .filter((garmentKey): garmentKey is string => Boolean(garmentKey)),
  );

  return preservedRawFabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments
      .filter(
        (assignment) =>
          orphanKeys.has(assignment.garmentKey) &&
          !authoritativeOccurrenceKeys.has(assignment.garmentKey),
      )
      .map((assignment) => ({
        allocationId: allocation.allocationId,
        fabricCode: allocation.fabricCode,
        garmentKey: assignment.garmentKey,
        garmentType: assignment.garmentType,
        assignmentSignature: getFabricAssignmentRepairSignature(
          allocation,
          assignment,
        ),
      })),
  );
};

const indexFabricAssignmentsForRepair = (
  state: FabricAllocationState,
): Map<string, string[]> => {
  const byGarmentKey = new Map<string, string[]>();
  state.fabricAllocations.forEach((allocation) =>
    allocation.garmentAssignments.forEach((assignment) => {
      const signatures = byGarmentKey.get(assignment.garmentKey) ?? [];
      signatures.push(getFabricAssignmentRepairSignature(allocation, assignment));
      byGarmentKey.set(assignment.garmentKey, signatures);
    }),
  );
  byGarmentKey.forEach((signatures) => signatures.sort());
  return byGarmentKey;
};

const getChangedFabricGarmentKeys = (
  previousState: FabricAllocationState,
  nextState: FabricAllocationState,
): string[] => {
  const previousByKey = indexFabricAssignmentsForRepair(previousState);
  const nextByKey = indexFabricAssignmentsForRepair(nextState);
  return [...new Set([...previousByKey.keys(), ...nextByKey.keys()])]
    .filter(
      (garmentKey) =>
        JSON.stringify(previousByKey.get(garmentKey) ?? []) !==
        JSON.stringify(nextByKey.get(garmentKey) ?? []),
    )
    .sort();
};

/**
 * Applies only an explicit Fabric mutation to the preserved hydrated source.
 * Unrelated raw assignments remain untouched so their diagnostics survive.
 */
export const revalidateHydratedFabricIntegrityAfterExplicitRepair = ({
  preservedRawFabricAllocations,
  previousRuntimeState,
  nextRuntimeState,
  authoritativeOccurrenceKeys,
  explicitlyRepairedGarmentKeys = [],
}: {
  preservedRawFabricAllocations: readonly FabricAllocation[];
  previousRuntimeState: FabricAllocationState;
  nextRuntimeState: FabricAllocationState;
  authoritativeOccurrenceKeys: ReadonlySet<string>;
  explicitlyRepairedGarmentKeys?: readonly string[];
}): HydratedFabricIntegrityRepairResolution => {
  const repairedGarmentKeys = [
    ...new Set([
      ...getChangedFabricGarmentKeys(previousRuntimeState, nextRuntimeState),
      ...explicitlyRepairedGarmentKeys.filter(Boolean),
    ]),
  ].sort();
  const repairedKeySet = new Set(repairedGarmentKeys);
  if (repairedKeySet.size === 0) {
    const preserved = cloneFabricAllocationList(
      preservedRawFabricAllocations,
    );
    const integrity = validatePersistedFabricAllocationIntegrity({
      fabricAllocationState: {
        fabricAllocations: preserved,
        activeAllocationId: preserved[0]?.allocationId ?? null,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      },
      authoritativeOccurrenceKeys,
    });
    return {
      integrity,
      preservedRawFabricAllocations: integrity.hasBlockingDiagnostics
        ? preserved
        : null,
      repairedGarmentKeys,
    };
  }

  const repairedRawAllocations = cloneFabricAllocationList(
    preservedRawFabricAllocations,
  )
    .map((allocation) => ({
      ...allocation,
      garmentAssignments: allocation.garmentAssignments.filter(
        (assignment) => !repairedKeySet.has(assignment.garmentKey),
      ),
    }))
    .filter((allocation) => allocation.garmentAssignments.length > 0);

  nextRuntimeState.fabricAllocations.forEach((runtimeAllocation) => {
    const repairedAssignments = runtimeAllocation.garmentAssignments.filter(
      (assignment) => repairedKeySet.has(assignment.garmentKey),
    );
    if (repairedAssignments.length === 0) return;
    const existingAllocation = repairedRawAllocations.find(
      (allocation) => allocation.allocationId === runtimeAllocation.allocationId,
    );
    if (existingAllocation) {
      existingAllocation.fabricCode = runtimeAllocation.fabricCode;
      existingAllocation.garmentAssignments.push(
        ...repairedAssignments.map((assignment) => ({
          ...assignment,
          ...(assignment.garmentSpec
            ? { garmentSpec: { ...assignment.garmentSpec } }
            : {}),
        })),
      );
      return;
    }
    repairedRawAllocations.push({
      allocationId: runtimeAllocation.allocationId,
      fabricCode: runtimeAllocation.fabricCode,
      garmentAssignments: repairedAssignments.map((assignment) => ({
        ...assignment,
        ...(assignment.garmentSpec
          ? { garmentSpec: { ...assignment.garmentSpec } }
          : {}),
      })),
    });
  });

  const repairedRawState: FabricAllocationState = {
    fabricAllocations: repairedRawAllocations,
    activeAllocationId: repairedRawAllocations[0]?.allocationId ?? null,
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  const integrity = validatePersistedFabricAllocationIntegrity({
    fabricAllocationState: repairedRawState,
    authoritativeOccurrenceKeys,
  });
  return {
    integrity,
    preservedRawFabricAllocations: integrity.hasBlockingDiagnostics
      ? cloneFabricAllocationList(repairedRawAllocations)
      : null,
    repairedGarmentKeys,
  };
};

/**
 * Removes one exact preserved orphan assignment, then delegates diagnostic
 * rebuilding to the existing hydrated-integrity repair lifecycle.
 */
export const repairHydratedOrphanFabricAssignment = ({
  preservedRawFabricAllocations,
  runtimeState,
  authoritativeOccurrenceKeys,
  target,
}: {
  preservedRawFabricAllocations: readonly FabricAllocation[] | null;
  runtimeState: FabricAllocationState;
  authoritativeOccurrenceKeys: ReadonlySet<string>;
  target: HydratedOrphanFabricAssignmentRepairTarget;
}): HydratedOrphanFabricAssignmentRepairResult => {
  if (!preservedRawFabricAllocations) {
    return { status: "blocked", reason: "PRESERVED_RAW_STATE_UNAVAILABLE" };
  }
  if (authoritativeOccurrenceKeys.has(target.garmentKey)) {
    return { status: "blocked", reason: "ASSIGNMENT_IS_AUTHORIZED" };
  }

  const allocationIndex = preservedRawFabricAllocations.findIndex(
    (allocation) =>
      allocation.allocationId === target.allocationId &&
      allocation.fabricCode === target.fabricCode,
  );
  if (allocationIndex < 0) {
    return { status: "blocked", reason: "STALE_REPAIR_REQUEST" };
  }

  const allocation = preservedRawFabricAllocations[allocationIndex]!;
  const matchingAssignmentIndexes = allocation.garmentAssignments
    .map((assignment, index) => ({ assignment, index }))
    .filter(
      ({ assignment }) =>
        assignment.garmentKey === target.garmentKey &&
        getFabricAssignmentRepairSignature(allocation, assignment) ===
          target.assignmentSignature,
    )
    .map(({ index }) => index);
  if (matchingAssignmentIndexes.length === 0) {
    return { status: "blocked", reason: "STALE_REPAIR_REQUEST" };
  }
  if (matchingAssignmentIndexes.length > 1) {
    return { status: "blocked", reason: "AMBIGUOUS_REPAIR_TARGET" };
  }

  const repairedRawFabricAllocations = cloneFabricAllocationList(
    preservedRawFabricAllocations,
  );
  const repairedAllocation = repairedRawFabricAllocations[allocationIndex]!;
  repairedAllocation.garmentAssignments.splice(matchingAssignmentIndexes[0]!, 1);
  if (repairedAllocation.garmentAssignments.length === 0) {
    repairedRawFabricAllocations.splice(allocationIndex, 1);
  }

  const revalidation = revalidateHydratedFabricIntegrityAfterExplicitRepair({
    preservedRawFabricAllocations: repairedRawFabricAllocations,
    previousRuntimeState: runtimeState,
    nextRuntimeState: runtimeState,
    authoritativeOccurrenceKeys,
  });
  return {
    status: "removed",
    rawFabricAllocations: repairedRawFabricAllocations,
    integrity: revalidation.integrity,
    preservedRawFabricAllocations:
      revalidation.preservedRawFabricAllocations,
  };
};

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
  selection.garmentTypes.map((garmentType) => {
    // Keyed by the Step 1 card; sized by the length the Main Garment option chose in Step 4.
    const physicalType = resolveBasePhysicalGarmentType(selection, garmentType);
    return {
      ...createStyleBaseGarmentSpec(physicalType),
      key: createStyleBaseGarmentSpec(garmentType).key,
    };
  });

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
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[],
): FabricGarmentAssignment[] => {
  if (requiredPhysicalOccurrences?.length) {
    return physicalOccurrencesToFabricRequirements(requiredPhysicalOccurrences);
  }
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
  return [...byKey.values()];
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

const enrichFabricAssignmentForCapacity = (
  assignment: FabricGarmentAssignment,
): FabricGarmentAssignment =>
  assignment.garmentSpec
    ? assignment
    : {
        ...assignment,
        garmentSpec: {
          key: assignment.garmentKey,
          garmentType: assignment.garmentType,
          fabricUnits: assignment.fabricUnits,
        },
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
  | "ALLOCATION_CHANGED"
  | "ASSIGNMENT_IN_PROGRESS"
  | "INVALID_CAPACITY"
  | "FABRIC_QUANTITY_LIMIT_REACHED"
  | "FABRIC_STOCK_EXHAUSTED";

export type ChangeFutureFabricAllocationProductBlockReason =
  | "ALLOCATION_NOT_FOUND"
  | "ALLOCATION_CHANGED"
  | "FABRIC_NOT_FOUND"
  | "FABRIC_UNAVAILABLE"
  | "FABRIC_STOCK_EXHAUSTED";

export interface ChangeFutureFabricAllocationExpectation {
  expectedCurrentFabricCode: string;
  expectedAssignmentSignature: string;
}

export type ChangeFutureFabricAllocationProductResult =
  | { status: "assigned"; state: FabricAllocationState }
  | {
      status: "blocked";
      reason: ChangeFutureFabricAllocationProductBlockReason;
      state: FabricAllocationState;
    };

export interface FutureFabricAllocationGroupChangePresentation {
  allocationId: string;
  fabricSelectionNumber: number;
  fabricCode: string;
  fabricName: string;
  garmentKeys: readonly string[];
  garmentLabels: readonly string[];
  isSharedGroup: boolean;
}

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

const toFutureFabricAssignmentTargets = (
  assignments: FabricGarmentAssignment[],
): FutureFabricAssignmentTarget[] =>
  assignments.map((assignment) => {
    const enriched = enrichFabricAssignmentForCapacity(assignment);
    return {
      assignment: { ...enriched },
      selection: assignmentToSelection(enriched),
    };
  });

export const getFutureFabricAssignmentTargetsFromAuthority = ({
  garmentTypeSelection,
  fabricAllocationState,
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FutureFabricAssignmentTarget[] =>
  toFutureFabricAssignmentTargets(
    resolveRequiredAssignmentsWithAdditional(
      garmentTypeSelection,
      fabricAllocationState,
      requiredPhysicalOccurrences,
    ),
  );

export const getFutureUnassignedFabricTargets = ({
  garmentTypeSelection,
  fabricAllocationState,
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FutureFabricAssignmentTarget[] => {
  const assignedKeys = new Set(
    fabricAllocationState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
  );
  return getFutureFabricAssignmentTargetsFromAuthority({
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
  }).filter(({ assignment }) => !assignedKeys.has(assignment.garmentKey));
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

/**
 * Fabrics Needed: the minimum number of physical Fabrics for the required
 * garments. With `countPendingGarmentForCapacity`, a pending garment that is
 * not yet a required occurrence is counted with the rest of the order.
 */
export const getRequiredPhysicalFabricAllocationCount = ({
  garmentTypeSelection,
  fabricAllocationState,
  requiredPhysicalOccurrences,
  countPendingGarmentForCapacity = false,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  countPendingGarmentForCapacity?: boolean;
}): number => {
  const requiredAssignments = resolveRequiredAssignmentsWithAdditional(
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
  );
  const pending = fabricAllocationState.pendingFabricGarment;
  const assignmentsForCapacity =
    countPendingGarmentForCapacity &&
    pending &&
    !requiredAssignments.some(
      (assignment) => assignment.garmentKey === pending.garmentKey,
    )
      ? [...requiredAssignments, pending]
      : requiredAssignments;
  return getCustomerFacingFabricQuantityForAssignments(assignmentsForCapacity)
    .fabricQuantity;
};

/**
 * Piece limit: at most one physical Fabric piece per garment that needs
 * fabric (the required garments, plus a pending garment when
 * `countPendingGarmentForCapacity`). Fabrics Needed stays the displayed
 * recommendation; only this limit blocks a NEW piece, so a garment may go on
 * a different print even when the order already has its Fabrics Needed.
 */
export const getMaxPhysicalFabricAllocationCount = ({
  garmentTypeSelection,
  fabricAllocationState,
  requiredPhysicalOccurrences,
  countPendingGarmentForCapacity = false,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  countPendingGarmentForCapacity?: boolean;
}): number =>
  resolveAssignmentsForFit({
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
    countPendingGarmentForCapacity,
  }).length;

/**
 * Fit check. The order may hold at most one physical Fabric per garment, so
 * every garment still waiting for fabric must fit into what is left: whole-
 * fabric garments (Long Dress, Agbada) each need a new Fabric, and half-unit
 * garments first use free halves on saved Fabrics, then pair up on new ones.
 * `shortfall` > 0 means some waiting garment can no longer get fabric without
 * first moving or removing an existing assignment.
 */
export interface FabricQuantityFit {
  requiredFabricQuantity: number;
  committedFabricQuantity: number;
  remainingFabricSlots: number;
  freeHalfUnits: number;
  waitingWholeGarmentKeys: string[];
  waitingHalfGarmentKeys: string[];
  newFabricsNeeded: number;
  shortfall: number;
}

const resolveAssignmentsForFit = ({
  garmentTypeSelection,
  fabricAllocationState,
  requiredPhysicalOccurrences,
  countPendingGarmentForCapacity,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  countPendingGarmentForCapacity: boolean;
}): FabricGarmentAssignment[] => {
  const requiredAssignments = resolveRequiredAssignmentsWithAdditional(
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
  );
  const pending = fabricAllocationState.pendingFabricGarment;
  return countPendingGarmentForCapacity &&
    pending &&
    !requiredAssignments.some(
      (assignment) => assignment.garmentKey === pending.garmentKey,
    )
    ? [...requiredAssignments, pending]
    : requiredAssignments;
};

export const getFabricQuantityFit = ({
  state,
  garmentTypeSelection,
  requiredPhysicalOccurrences,
  countPendingGarmentForCapacity = false,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  countPendingGarmentForCapacity?: boolean;
}): FabricQuantityFit => {
  const maxUnits = FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION;
  const assignments = resolveAssignmentsForFit({
    garmentTypeSelection,
    fabricAllocationState: state,
    requiredPhysicalOccurrences,
    countPendingGarmentForCapacity,
  });
  const requiredFabricQuantity =
    getCustomerFacingFabricQuantityForAssignments(assignments).fabricQuantity;
  const committedAllocations = state.fabricAllocations.filter(
    (allocation) => allocation.garmentAssignments.length > 0,
  );
  const assignedKeys = new Set(
    committedAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
  );
  const freeHalfUnits = committedAllocations.reduce((total, allocation) => {
    const used = allocation.garmentAssignments.reduce(
      (sum, assignment) => sum + assignment.fabricUnits,
      0,
    );
    return total + Math.max(0, maxUnits - used);
  }, 0);
  const waiting = assignments.filter(
    (assignment) => !assignedKeys.has(assignment.garmentKey),
  );
  const waitingWhole = waiting.filter(
    (assignment) => assignment.fabricUnits >= maxUnits,
  );
  const waitingHalf = waiting.filter(
    (assignment) => assignment.fabricUnits < maxUnits,
  );
  const waitingHalfUnits = waitingHalf.reduce(
    (total, assignment) => total + assignment.fabricUnits,
    0,
  );
  const newFabricsNeeded =
    waitingWhole.length +
    Math.ceil(Math.max(0, waitingHalfUnits - freeHalfUnits) / maxUnits);
  // Slots left under the one-piece-per-garment limit (not Fabrics Needed).
  const remainingFabricSlots = Math.max(
    0,
    assignments.length - committedAllocations.length,
  );
  return {
    requiredFabricQuantity,
    committedFabricQuantity: committedAllocations.length,
    remainingFabricSlots,
    freeHalfUnits,
    waitingWholeGarmentKeys: waitingWhole.map((assignment) => assignment.garmentKey),
    waitingHalfGarmentKeys: waitingHalf.map((assignment) => assignment.garmentKey),
    newFabricsNeeded,
    shortfall: Math.max(0, newFabricsNeeded - remainingFabricSlots),
  };
};

/**
 * True when moving from `before` to `after` leaves a waiting garment with
 * less room than it had (for example a half-unit garment takes a new Fabric
 * while another saved Fabric still has a free half, so a Long Dress can no
 * longer get a whole Fabric). Actions that do not make the fit worse are
 * never blocked here, so an already-stuck draft can still make progress.
 */
export const wouldFabricAssignmentStrandWaitingGarments = ({
  before,
  after,
  garmentTypeSelection,
  requiredPhysicalOccurrences,
  countPendingGarmentForCapacity = false,
}: {
  before: FabricAllocationState;
  after: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  countPendingGarmentForCapacity?: boolean;
}): boolean =>
  getFabricQuantityFit({
    state: after,
    garmentTypeSelection,
    requiredPhysicalOccurrences,
    countPendingGarmentForCapacity,
  }).shortfall >
  getFabricQuantityFit({
    state: before,
    garmentTypeSelection,
    requiredPhysicalOccurrences,
    countPendingGarmentForCapacity,
  }).shortfall;

export interface FabricQuantityHalfFreeAllocation {
  allocationId: string;
  fabricCode: string;
  fabricName: string;
  /** 1-based position in Fabric Selection order. */
  selectionNumber: number;
}

export interface FabricQuantityFitBlockExplanation {
  garmentKey: string;
  garmentLabel: string;
  /** Whole-fabric garments that would be left without a Fabric. */
  strandedGarmentKeys: string[];
  strandedGarmentLabels: string[];
  halfFreeAllocation: FabricQuantityHalfFreeAllocation;
}

const fabricQuantityGarmentLabel = (
  assignment: Pick<FabricGarmentAssignment, "garmentType">,
): string => getStep1GarmentDisplayLabel(assignment.garmentType);

/**
 * Explains why a half-unit garment cannot take a NEW Fabric of `fabricCode`
 * and points at a saved Fabric (of another product) with a free half where
 * it fits instead. Returns null when there is no such Fabric or the garment
 * is not a half-unit garment.
 */
export const explainFabricQuantityBlockForGarment = ({
  state,
  garmentTypeSelection,
  garmentKey,
  fabricCode,
  fabrics,
  requiredPhysicalOccurrences,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  garmentKey: string;
  fabricCode: string;
  fabrics?: readonly Fabric[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FabricQuantityFitBlockExplanation | null => {
  const assignments = resolveAssignmentsForFit({
    garmentTypeSelection,
    fabricAllocationState: state,
    requiredPhysicalOccurrences,
    countPendingGarmentForCapacity: true,
  });
  const assignment = assignments.find(
    (candidate) => candidate.garmentKey === garmentKey,
  );
  if (
    !assignment ||
    assignment.fabricUnits >= FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION
  ) {
    return null;
  }
  const allocations = state.fabricAllocations;
  const destinationIndex = allocations.findIndex(
    (allocation) =>
      allocation.garmentAssignments.length > 0 &&
      allocation.fabricCode !== fabricCode &&
      !allocation.garmentAssignments.some(
        (existing) => existing.garmentKey === garmentKey,
      ) &&
      fabricAllocationHasRoomFor(allocation, assignment),
  );
  if (destinationIndex < 0) return null;
  const destination = allocations[destinationIndex]!;
  const fit = getFabricQuantityFit({
    state,
    garmentTypeSelection,
    requiredPhysicalOccurrences,
    countPendingGarmentForCapacity: true,
  });
  const strandedGarmentKeys = fit.waitingWholeGarmentKeys.filter(
    (key) => key !== garmentKey,
  );
  const byKey = new Map(assignments.map((item) => [item.garmentKey, item]));
  return {
    garmentKey,
    garmentLabel: fabricQuantityGarmentLabel(assignment),
    strandedGarmentKeys,
    strandedGarmentLabels: strandedGarmentKeys.map((key) => {
      const stranded = byKey.get(key);
      return stranded ? fabricQuantityGarmentLabel(stranded) : "A garment";
    }),
    halfFreeAllocation: {
      allocationId: destination.allocationId,
      fabricCode: destination.fabricCode,
      fabricName:
        fabrics?.find((fabric) => fabric.code === destination.fabricCode)
          ?.name ?? destination.fabricCode,
      selectionNumber: destinationIndex + 1,
    },
  };
};

const joinGarmentLabels = (labels: readonly string[]): string =>
  labels.length <= 1
    ? labels[0] ?? ""
    : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

export const formatFabricQuantityFitBlockedCopy = ({
  garmentLabel,
  strandedGarmentLabels,
  selectionNumber,
  fabricName,
  requiredFabricQuantity,
}: {
  garmentLabel: string;
  strandedGarmentLabels: readonly string[];
  selectionNumber: number;
  fabricName: string;
  requiredFabricQuantity: number;
}): string => {
  const pointer = `Put ${garmentLabel} on Fabric Selection ${selectionNumber} (${fabricName}), which has 1/2 capacity left.`;
  if (strandedGarmentLabels.length > 0) {
    return `${joinGarmentLabels(strandedGarmentLabels)} ${
      strandedGarmentLabels.length === 1 ? "needs" : "need"
    } a whole fabric. ${pointer}`;
  }
  return `Your order needs ${requiredFabricQuantity} ${fabricWord(
    requiredFabricQuantity,
  )} in total. ${pointer}`;
};

/**
 * Customer copy for a garment blocked by the Fabric quantity limit or the fit
 * check. Points at a saved Fabric with a free half when one exists; otherwise
 * null so callers keep their existing copy.
 */
export const getFabricQuantityFitBlockedCopyForGarment = (input: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  garmentKey: string;
  fabricCode: string;
  fabrics?: readonly Fabric[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): string | null => {
  // Under the one-piece-per-garment limit a waiting garment can always get its
  // own piece, so a FABRIC_QUANTITY_LIMIT_REACHED block is the piece limit
  // itself, not a fit problem; callers fall back to the piece-limit copy.
  void input;
  return null;
};

export const formatFabricUseForAllQuantityNote = (
  neededFabricQuantity: number,
  requiredFabricQuantity: number,
): string =>
  `Using this Fabric for all remaining garments would need ${neededFabricQuantity} ${fabricWord(
    neededFabricQuantity,
  )}; your order needs ${requiredFabricQuantity}.`;

/**
 * Physical Fabrics the order would hold if every listed garment used
 * `fabricCode` (free halves on saved Fabrics of that product are reused).
 */
export const getFabricQuantityIfGarmentsUseFabric = ({
  state,
  garmentTypeSelection,
  fabricCode,
  garmentKeys,
  requiredPhysicalOccurrences,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricCode: string;
  garmentKeys: readonly string[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): number => {
  const maxUnits = FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION;
  const keys = new Set(garmentKeys);
  const assignments = resolveAssignmentsForFit({
    garmentTypeSelection,
    fabricAllocationState: state,
    requiredPhysicalOccurrences,
    countPendingGarmentForCapacity: true,
  }).filter((assignment) => keys.has(assignment.garmentKey));
  const committed = state.fabricAllocations.filter(
    (allocation) => allocation.garmentAssignments.length > 0,
  );
  const freeSameFabricUnits = committed
    .filter((allocation) => allocation.fabricCode === fabricCode)
    .reduce((total, allocation) => {
      const used = allocation.garmentAssignments.reduce(
        (sum, assignment) => sum + assignment.fabricUnits,
        0,
      );
      return total + Math.max(0, maxUnits - used);
    }, 0);
  const wholeCount = assignments.filter(
    (assignment) => assignment.fabricUnits >= maxUnits,
  ).length;
  const halfUnits = assignments
    .filter((assignment) => assignment.fabricUnits < maxUnits)
    .reduce((total, assignment) => total + assignment.fabricUnits, 0);
  return (
    committed.length +
    wholeCount +
    Math.ceil(Math.max(0, halfUnits - freeSameFabricUnits) / maxUnits)
  );
};

/**
 * Authoritative limit: a NEW physical Fabric allocation may be created only
 * while the committed allocation count is below the number of garments that
 * need fabric (one piece per garment). Fabrics Needed is a recommendation and
 * no longer blocks a new piece.
 */
export const canCreatePhysicalFabricAllocation = ({
  state,
  garmentTypeSelection,
  requiredPhysicalOccurrences,
  countPendingGarmentForCapacity = false,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  countPendingGarmentForCapacity?: boolean;
}): boolean =>
  getCommittedPhysicalFabricAllocationCount(state) <
  getMaxPhysicalFabricAllocationCount({
    garmentTypeSelection,
    fabricAllocationState: state,
    requiredPhysicalOccurrences,
    countPendingGarmentForCapacity,
  });

export const isPhysicalFabricAllocationLimitReached = ({
  state,
  garmentTypeSelection,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
}): boolean =>
  !canCreatePhysicalFabricAllocation({ state, garmentTypeSelection });

export const formatFabricQuantityLimitReachedCopy = (
  requiredFabricQuantity: number,
): string =>
  `You have the ${requiredFabricQuantity} ${fabricWord(
    requiredFabricQuantity,
  )} needed for this order. You can use a selected fabric again for the remaining garments, or pick a different print.`;

/** Shown when a new piece would exceed one piece per garment. */
export const formatFabricQuantityLimitChangeCopy = (
  maxFabricPieces: number,
): string =>
  `Each garment can use at most one fabric piece, and your ${maxFabricPieces} ${
    maxFabricPieces === 1 ? "garment already has" : "garments already have"
  } ${maxFabricPieces} ${
    maxFabricPieces === 1 ? "piece" : "pieces"
  }. To use this Fabric, first remove or change another Fabric assignment.`;

export const formatFabricQuantityOverAllocatedCopy = (
  selectedFabricQuantity: number,
  maxFabricPieces: number,
): string =>
  `Your saved Fabric selections use ${selectedFabricQuantity} fabric ${
    selectedFabricQuantity === 1 ? "piece" : "pieces"
  }, but each garment can use at most one piece and this order has ${maxFabricPieces} ${
    maxFabricPieces === 1 ? "garment" : "garments"
  }. Remove or change Fabric assignments until ${maxFabricPieces} ${
    maxFabricPieces === 1 ? "piece remains" : "pieces remain"
  }.`;

/**
 * Over-allocation repair plan. A saved order can hold more physical Fabric
 * allocations than it needs once the order shrinks (for example a garment is
 * removed after Fabrics were chosen): the remaining garments are left spread
 * across several half-used Fabrics. The cheapest repair is to move a garment
 * that sits alone on a Fabric onto another selected Fabric that has room, so
 * that lone Fabric empties and drops out of the count.
 */
export interface FabricQuantityOverAllocationRepair {
  garmentKey: string;
  fromAllocationId: string;
  fromFabricCode: string;
  /** 1-based position of the source allocation in Fabric Selection order. */
  fromSelectionNumber: number;
  toAllocationId: string;
  toFabricCode: string;
  /** 1-based position of the destination allocation in Fabric Selection order. */
  toSelectionNumber: number;
  /** The destination already uses the same Fabric product. */
  sameFabric: boolean;
  /**
   * "over_allocated": more Fabrics saved than the order needs.
   * "stranded": saved Fabrics equal Fabrics Needed, but a waiting garment
   * (e.g. a Long Dress) cannot fit; the move frees a whole Fabric for it.
   */
  kind: "over_allocated" | "stranded";
  /** Waiting garments the move makes room for (only for "stranded"). */
  strandedGarmentKeys: string[];
}

const fabricAllocationHasRoomFor = (
  allocation: FabricAllocation,
  assignment: FabricGarmentAssignment,
): boolean =>
  FabricCapacityEngine.resolveFabricAllocation({
    ...allocation,
    garmentAssignments: [...allocation.garmentAssignments, assignment],
  }).status === "resolved";

export const getFabricQuantityOverAllocationRepair = ({
  state,
  garmentTypeSelection,
  requiredPhysicalOccurrences,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FabricQuantityOverAllocationRepair | null => {
  if (state.pendingFabricGarment || state.awaitingFabricForPendingGarment) {
    return null;
  }
  const overAllocated =
    getCommittedPhysicalFabricAllocationCount(state) >
    getMaxPhysicalFabricAllocationCount({
      garmentTypeSelection,
      fabricAllocationState: state,
      requiredPhysicalOccurrences,
    });
  const fitBefore = overAllocated
    ? null
    : getFabricQuantityFit({
        state,
        garmentTypeSelection,
        requiredPhysicalOccurrences,
      });
  if (!overAllocated && (!fitBefore || fitBefore.shortfall === 0)) {
    return null;
  }
  // A stranded order only counts a move that actually makes room.
  const moveImprovesFit = (garmentKey: string, allocationId: string): boolean => {
    if (!fitBefore) return true;
    const moved = moveFutureGarmentToFabricAllocation({
      state,
      garmentKey,
      allocationId,
    });
    return (
      moved.status === "moved" &&
      getFabricQuantityFit({
        state: moved.state,
        garmentTypeSelection,
        requiredPhysicalOccurrences,
      }).shortfall < fitBefore.shortfall
    );
  };
  const allocations = state.fabricAllocations;
  let best: FabricQuantityOverAllocationRepair | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (let sourceIndex = 0; sourceIndex < allocations.length; sourceIndex += 1) {
    const source = allocations[sourceIndex]!;
    // Only a Fabric holding a single garment empties with one move.
    if (source.garmentAssignments.length !== 1) continue;
    const assignment = source.garmentAssignments[0]!;
    for (
      let destinationIndex = 0;
      destinationIndex < allocations.length;
      destinationIndex += 1
    ) {
      const destination = allocations[destinationIndex]!;
      if (
        destinationIndex === sourceIndex ||
        destination.garmentAssignments.length === 0 ||
        !fabricAllocationHasRoomFor(destination, assignment)
      ) {
        continue;
      }
      const sameFabric = destination.fabricCode === source.fabricCode;
      // Prefer a move that keeps the garment's Fabric product (nothing the
      // customer sees changes), then the latest lone Fabric, then the
      // earliest destination.
      const rank =
        (sameFabric ? 0 : 1) * 1_000_000 +
        (allocations.length - sourceIndex) * 1_000 +
        destinationIndex;
      if (rank >= bestRank) continue;
      if (!moveImprovesFit(assignment.garmentKey, destination.allocationId)) {
        continue;
      }
      bestRank = rank;
      best = {
        garmentKey: assignment.garmentKey,
        fromAllocationId: source.allocationId,
        fromFabricCode: source.fabricCode,
        fromSelectionNumber: sourceIndex + 1,
        toAllocationId: destination.allocationId,
        toFabricCode: destination.fabricCode,
        toSelectionNumber: destinationIndex + 1,
        sameFabric,
        kind: overAllocated ? "over_allocated" : "stranded",
        strandedGarmentKeys: fitBefore ? [...fitBefore.waitingWholeGarmentKeys] : [],
      };
    }
  }
  return best;
};

export type MoveFutureGarmentToFabricAllocationResult =
  | { status: "moved"; state: FabricAllocationState }
  | {
      status: "blocked";
      reason:
        | "GARMENT_NOT_FOUND"
        | "ALLOCATION_NOT_FOUND"
        | "INVALID_CAPACITY"
        | "ASSIGNMENT_IN_PROGRESS";
      state: FabricAllocationState;
    };

/**
 * Atomically moves one committed garment assignment onto another existing
 * allocation (keeping its exact assignment record) and drops the source
 * allocation if it becomes empty. Never creates an allocation.
 */
export const moveFutureGarmentToFabricAllocation = ({
  state,
  garmentKey,
  allocationId,
}: {
  state: FabricAllocationState;
  garmentKey: string;
  allocationId: string;
}): MoveFutureGarmentToFabricAllocationResult => {
  if (state.pendingFabricGarment || state.awaitingFabricForPendingGarment) {
    return { status: "blocked", reason: "ASSIGNMENT_IN_PROGRESS", state };
  }
  const source = state.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === garmentKey,
    ),
  );
  if (!source) {
    return { status: "blocked", reason: "GARMENT_NOT_FOUND", state };
  }
  const destination = state.fabricAllocations.find(
    (allocation) => allocation.allocationId === allocationId,
  );
  if (!destination || destination.allocationId === source.allocationId) {
    return { status: "blocked", reason: "ALLOCATION_NOT_FOUND", state };
  }
  const assignment = source.garmentAssignments.find(
    (candidate) => candidate.garmentKey === garmentKey,
  )!;
  if (!fabricAllocationHasRoomFor(destination, assignment)) {
    return { status: "blocked", reason: "INVALID_CAPACITY", state };
  }
  const moved = removeEmptyFabricAllocations({
    ...state,
    fabricAllocations: state.fabricAllocations.map((allocation) =>
      allocation.allocationId === source.allocationId
        ? {
            ...allocation,
            garmentAssignments: allocation.garmentAssignments.filter(
              (candidate) => candidate.garmentKey !== garmentKey,
            ),
          }
        : allocation.allocationId === destination.allocationId
          ? {
              ...allocation,
              garmentAssignments: [...allocation.garmentAssignments, assignment],
            }
          : allocation,
    ),
    activeAllocationId: destination.allocationId,
  });
  return { status: "moved", state: moved };
};

export const formatFabricQuantityMoveCopy = ({
  garmentLabel,
  toSelectionNumber,
  toFabricName,
  sameFabric,
  requiredFabricQuantity,
  makesRoomForLabels,
}: {
  garmentLabel: string;
  toSelectionNumber: number;
  toFabricName: string;
  sameFabric: boolean;
  requiredFabricQuantity: number;
  /** Stranded repair: the waiting garments the move frees a Fabric for. */
  makesRoomForLabels?: readonly string[];
}): string =>
  `${garmentLabel} is the only garment on its Fabric. Move it onto Fabric Selection ${toSelectionNumber} (${toFabricName}), which has room for it${
    sameFabric ? " and is the same fabric" : ""
  }, ${
    makesRoomForLabels && makesRoomForLabels.length > 0
      ? `so a whole fabric is free for ${joinGarmentLabels(makesRoomForLabels)}.`
      : `so ${requiredFabricQuantity} ${
          requiredFabricQuantity === 1 ? "fabric remains" : "fabrics remain"
        }.`
  }`;

export const formatFabricQuantityStrandedCopy = (
  strandedGarmentLabels: readonly string[],
  requiredFabricQuantity: number,
): string =>
  `${joinGarmentLabels(strandedGarmentLabels) || "A garment"} ${
    strandedGarmentLabels.length > 1 ? "need" : "needs"
  } a whole fabric, but all ${requiredFabricQuantity} ${fabricWord(
    requiredFabricQuantity,
  )} your order needs are already chosen and the space left is split into halves. Move a garment to free a whole fabric.`;

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

/**
 * A completed Fabric stage can leave one standard half-capacity slot unused.
 * This is deliberately allocation-scoped: separate Fabric purchases must
 * never be combined to advertise capacity that no individual Fabric has.
 */
export interface FutureRemainingFabricCapacityOffer {
  allocationId: string;
  fabricCode: string;
  /**
   * The physical allocation ordinal from the complete allocation list. This
   * must survive offer filtering so customers can identify the Fabric they
   * actually selected earlier in the journey.
   */
  selectionOrdinal: number;
  usedUnits: number;
  remainingUnits: number;
  assignedGarmentKeys: readonly string[];
}

/** Stable for reordering, distinct when the qualifying allocation set changes. */
export const getRemainingFabricCapacityOfferSignature = (
  offers: readonly FutureRemainingFabricCapacityOffer[],
): string =>
  offers.length === 0
    ? ""
    : JSON.stringify(
        offers.map((offer) => [
          offer.allocationId,
          offer.fabricCode,
          offer.remainingUnits,
          [...offer.assignedGarmentKeys].sort(),
        ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      );

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

/** Presentation query over existing remaining-capacity summaries. Not new arithmetic. */
export const hasFutureReusableHalfCapacityForFabric = ({
  fabricAllocationState,
  fabricCode,
}: {
  fabricAllocationState: FabricAllocationState;
  fabricCode: string;
}): boolean =>
  getFuturePartialFabricAllocationSummaries({ fabricAllocationState }).some(
    (summary) =>
      summary.fabricCode === fabricCode && summary.remainingUnits === 1,
  );

/**
 * Finds the existing physical Fabric allocations that can take exactly one
 * additional standard garment after the current Fabric stage is complete.
 * The caller supplies the Additional Garment-domain eligibility result so
 * this capacity helper does not recreate that domain.
 */
export const getFutureRemainingFabricCapacityOffers = ({
  fabricAllocationState,
  fabricStageComplete,
  hasEligibleHalfCapacityAdditionalGarment,
}: {
  fabricAllocationState: FabricAllocationState;
  fabricStageComplete: boolean;
  hasEligibleHalfCapacityAdditionalGarment: boolean;
}): FutureRemainingFabricCapacityOffer[] => {
  if (
    !fabricStageComplete ||
    !hasEligibleHalfCapacityAdditionalGarment ||
    fabricAllocationState.pendingFabricGarment ||
    fabricAllocationState.awaitingFabricForPendingGarment
  ) {
    return [];
  }

  return fabricAllocationState.fabricAllocations.flatMap(
    (allocation, allocationIndex) => {
      const summary = resolveFuturePartialFabricAllocationSummary(allocation);
      if (
        !summary ||
        summary.usedUnits !== FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION - 1 ||
        summary.remainingUnits !== 1
      ) {
        return [];
      }
      return [{ ...summary, selectionOrdinal: allocationIndex + 1 }];
    },
  );
};

const getFuturePartialFabricAllocationsWithRemainingCapacity = ({
  fabricAllocationState,
}: {
  fabricAllocationState: FabricAllocationState;
}): FuturePartialFabricAllocationSummary[] =>
  getFuturePartialFabricAllocationSummaries({ fabricAllocationState }).filter(
    (summary) => summary.remainingUnits > 0,
  );

const getFutureFabricAssignmentTargetForGarmentKey = ({
  garmentTypeSelection,
  fabricAllocationState,
  garmentKey,
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  garmentKey: string;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FutureFabricAssignmentTarget | null =>
  getFutureFabricAssignmentTargetForKey({
    garmentTypeSelection,
    fabricAllocationState,
    garmentKey,
    requiredPhysicalOccurrences,
  });

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
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  garmentKey: string;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FuturePartialFabricAllocationSummary[] => {
  if (hasGarmentAssignment(fabricAllocationState, garmentKey)) {
    return [];
  }
  const target = getFutureFabricAssignmentTargetForGarmentKey({
    garmentTypeSelection,
    fabricAllocationState,
    garmentKey,
    requiredPhysicalOccurrences,
  });
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

/**
 * Presentation query: which of the supplied unassigned garmentKeys could
 * reuse leftover capacity on an existing allocation of this Fabric product.
 * Delegates fit checks to the existing allocator authority; not new arithmetic.
 */
export const getFutureReusableHalfCapacityGarmentKeys = ({
  garmentTypeSelection,
  fabricAllocationState,
  fabricCode,
  garmentKeys,
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  fabricCode: string;
  garmentKeys: readonly string[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): string[] =>
  garmentKeys.filter((garmentKey) =>
    getFutureCompatiblePartialFabricAllocations({
      garmentTypeSelection,
      fabricAllocationState,
      garmentKey,
      requiredPhysicalOccurrences,
    }).some((entry) => entry.fabricCode === fabricCode),
  );

export const getFuturePartialFabricAllocationCompatibleTargets = ({
  garmentTypeSelection,
  fabricAllocationState,
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FuturePartialFabricCompatibleTargets[] => {
  const unassignedTargets = getFutureUnassignedFabricTargets({
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
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
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): boolean =>
  getFuturePartialFabricAllocationCompatibleTargets({
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
  }).some((entry) => entry.compatibleGarmentKeys.length > 0);

export const isFutureFinalPartialFabricAllocation = ({
  garmentTypeSelection,
  fabricAllocationState,
  allocationId,
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  allocationId: string;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
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
      requiredPhysicalOccurrences,
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
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[],
): string => {
  const assigned = fabricAllocationState.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .find((assignment) => assignment.garmentKey === garmentKey);
  if (assigned) {
    return getFabricGarmentLabel(assigned.garmentType);
  }
  const target = getFutureFabricAssignmentTargetForGarmentKey({
    garmentTypeSelection,
    fabricAllocationState,
    garmentKey,
    requiredPhysicalOccurrences,
  });
  return target
    ? getFabricGarmentLabel(target.assignment.garmentType)
    : garmentKey;
};

export const getFuturePartialFabricAssignmentTargetPresentations = ({
  garmentTypeSelection,
  fabricAllocationState,
  garmentKey,
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  garmentKey: string;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FuturePartialFabricAssignmentTargetPresentation[] => {
  const target = getFutureFabricAssignmentTargetForGarmentKey({
    garmentTypeSelection,
    fabricAllocationState,
    garmentKey,
    requiredPhysicalOccurrences,
  });
  if (!target) {
    return [];
  }
  return getFutureCompatiblePartialFabricAllocations({
    garmentTypeSelection,
    fabricAllocationState,
    garmentKey,
    requiredPhysicalOccurrences,
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
          requiredPhysicalOccurrences,
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

const getFutureFabricAssignmentTargetForKey = ({
  garmentTypeSelection,
  fabricAllocationState,
  garmentKey,
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  garmentKey: string;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FutureFabricAssignmentTarget | null => {
  const fromSelection = getFutureFabricAssignmentTargets(
    garmentTypeSelection,
  ).find(({ assignment }) => assignment.garmentKey === garmentKey);
  if (fromSelection) return fromSelection;

  if (fabricAllocationState.pendingFabricGarment?.garmentKey === garmentKey) {
    const assignment = enrichFabricAssignmentForCapacity(
      fabricAllocationState.pendingFabricGarment,
    );
    return {
      assignment: { ...assignment },
      selection: assignmentToSelection(assignment),
    };
  }

  const assignment = resolveRequiredAssignmentsWithAdditional(
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
  ).find((candidate) => candidate.garmentKey === garmentKey);
  if (!assignment) return null;
  const enriched = enrichFabricAssignmentForCapacity(assignment);
  return {
    assignment: { ...enriched },
    selection: assignmentToSelection(enriched),
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

/**
 * Where a garment goes when its print already has a piece with room:
 * "auto" joins that piece (Pair), "new_piece" starts a separate piece.
 */
export type FutureFabricPiecePlacement = "auto" | "new_piece";

export interface FutureFabricGarmentAssignmentOptions {
  /** See applyFutureFabricCardSelection: change only this garment. */
  detachFromSharedPiece?: boolean;
}

/** Ids of the existing pieces (allocations with garments) of one print. */
export const getFutureFabricPieceAllocationIds = (
  state: FabricAllocationState,
  fabricCode: string,
): string[] =>
  state.fabricAllocations
    .filter(
      (allocation) =>
        allocation.fabricCode === fabricCode &&
        allocation.garmentAssignments.length > 0,
    )
    .map((allocation) => allocation.allocationId);

const tryAppendToMatchingFabricAllocations = ({
  state,
  target,
  fabricCode,
  avoidAllocationIds,
}: {
  state: FabricAllocationState;
  target: FutureFabricAssignmentTarget;
  fabricCode: string;
  /** Pieces the garment must not join ("Use a new piece"). */
  avoidAllocationIds?: readonly string[];
}): FabricAllocationState | null => {
  const matchingAllocations = state.fabricAllocations.filter(
    (allocation) =>
      allocation.fabricCode === fabricCode &&
      !avoidAllocationIds?.includes(allocation.allocationId),
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
  requiredPhysicalOccurrences,
  avoidAllocationIds,
}: {
  state: FabricAllocationState;
  target: FutureFabricAssignmentTarget;
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabrics?: readonly Fabric[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  avoidAllocationIds?: readonly string[];
}): FutureFabricAssignmentResult => {
  const appended = tryAppendToMatchingFabricAllocations({
    state,
    target,
    fabricCode,
    avoidAllocationIds,
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
      requiredPhysicalOccurrences,
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
  // Fit check: a new Fabric must not leave another waiting garment (e.g. a
  // Long Dress that needs a whole Fabric) without room within Fabrics Needed.
  if (
    wouldFabricAssignmentStrandWaitingGarments({
      before: state,
      after: attempted,
      garmentTypeSelection,
      requiredPhysicalOccurrences,
    })
  ) {
    return {
      status: "blocked",
      reason: "FABRIC_QUANTITY_LIMIT_REACHED",
      state,
    };
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
  requiredPhysicalOccurrences,
  avoidAllocationIds,
}: {
  state: FabricAllocationState;
  target: FutureFabricAssignmentTarget;
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabrics?: readonly Fabric[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  avoidAllocationIds?: readonly string[];
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
      avoidAllocationIds,
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
    const stockBlocked = blockNewPhysicalAllocationForStock({
      fabricCode,
      fabrics,
      state: awaitingState,
    });
    if (stockBlocked) {
      return stockBlocked;
    }
    // A different Fabric needs a new allocation. It is allowed only while the
    // order, counting this pending garment, still needs another Fabric;
    // otherwise the garment must use spare capacity on a selected Fabric.
    if (
      !canCreatePhysicalFabricAllocation({
        state: awaitingState,
        garmentTypeSelection,
        requiredPhysicalOccurrences,
        countPendingGarmentForCapacity: true,
      })
    ) {
      return {
        status: "blocked",
        reason: "FABRIC_QUANTITY_LIMIT_REACHED",
        state,
      };
    }
    const assigned = FabricAllocationStateEngine.assignPendingGarmentToFabric(
      awaitingState,
      fabricCode,
    );
    if (
      wouldFabricAssignmentStrandWaitingGarments({
        before: awaitingState,
        after: assigned,
        garmentTypeSelection,
        requiredPhysicalOccurrences,
        countPendingGarmentForCapacity: true,
      })
    ) {
      return {
        status: "blocked",
        reason: "FABRIC_QUANTITY_LIMIT_REACHED",
        state,
      };
    }
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
    requiredPhysicalOccurrences,
    avoidAllocationIds,
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
  requiredPhysicalOccurrences,
  placement = "auto",
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricCode: string;
  garmentKeys: readonly string[];
  fabrics?: readonly Fabric[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  /** "new_piece": the garments share one new piece, never an existing one. */
  placement?: FutureFabricPiecePlacement;
}): FutureFabricBulkAssignmentResult => {
  // Pieces of this print that existed before the batch; "new_piece" keeps the
  // whole batch off them while still letting the batch fill its own new piece.
  const avoidAllocationIds =
    placement === "new_piece"
      ? getFutureFabricPieceAllocationIds(state, fabricCode)
      : undefined;
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
      requiredPhysicalOccurrences,
      avoidAllocationIds,
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

export interface FutureFabricPiecePlacementChoice {
  fabricCode: string;
  garmentKeys: string[];
  /** The existing piece the garments would join when paired. */
  pairAllocationId: string;
  /** 1-based Fabric Selection number of that piece. */
  pairSelectionNumber: number;
  /** Units left on that piece before pairing (e.g. 1 of 2). */
  pairRemainingUnits: number;
  /** A separate new piece is possible (within Fabrics Needed and stock). */
  newPieceAvailable: boolean;
  newPieceBlockedReason: FutureFabricAssignmentBlockReason | null;
}

/**
 * Assigning a print that already has a piece with room used to pair the
 * garment onto that piece silently. When that would happen, the customer
 * chooses: Pair with that Selection, or Use a new piece (which still has to
 * fit Fabrics Needed and stock). Returns null when no existing piece would be
 * joined, or when the auto assignment itself is blocked (normal errors apply).
 */
export const getFutureFabricPiecePlacementChoice = ({
  state,
  garmentTypeSelection,
  fabricCode,
  garmentKeys,
  fabrics,
  requiredPhysicalOccurrences,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricCode: string;
  garmentKeys: readonly string[];
  fabrics?: readonly Fabric[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FutureFabricPiecePlacementChoice | null => {
  const existingPieceIds = getFutureFabricPieceAllocationIds(state, fabricCode);
  if (existingPieceIds.length === 0 || garmentKeys.length === 0) {
    return null;
  }
  const paired = assignSameFabricProductToGarments({
    state,
    garmentTypeSelection,
    fabricCode,
    garmentKeys,
    fabrics,
    requiredPhysicalOccurrences,
  });
  if (paired.status !== "assigned") {
    return null;
  }
  const garmentKeySet = new Set(garmentKeys);
  const joinedPiece = state.fabricAllocations.find((allocation) => {
    if (!existingPieceIds.includes(allocation.allocationId)) return false;
    const after = paired.state.fabricAllocations.find(
      (candidate) => candidate.allocationId === allocation.allocationId,
    );
    return Boolean(
      after?.garmentAssignments.some(
        (assignment) =>
          garmentKeySet.has(assignment.garmentKey) &&
          !allocation.garmentAssignments.some(
            (before) => before.garmentKey === assignment.garmentKey,
          ),
      ),
    );
  });
  if (!joinedPiece) {
    return null;
  }
  const newPiece = assignSameFabricProductToGarments({
    state,
    garmentTypeSelection,
    fabricCode,
    garmentKeys,
    fabrics,
    requiredPhysicalOccurrences,
    placement: "new_piece",
  });
  const usedUnits = joinedPiece.garmentAssignments.reduce(
    (total, assignment) => total + assignment.fabricUnits,
    0,
  );
  return {
    fabricCode,
    garmentKeys: [...garmentKeys],
    pairAllocationId: joinedPiece.allocationId,
    pairSelectionNumber:
      state.fabricAllocations.findIndex(
        (allocation) => allocation.allocationId === joinedPiece.allocationId,
      ) + 1,
    pairRemainingUnits: Math.max(
      0,
      FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION - usedUnits,
    ),
    newPieceAvailable: newPiece.status === "assigned",
    newPieceBlockedReason:
      newPiece.status === "blocked" ? newPiece.reason : null,
  };
};

export const formatFabricNewPieceUnavailableCopy = ({
  reason,
  maxFabricPieces,
  pairSelectionNumber,
}: {
  reason: FutureFabricAssignmentBlockReason | null;
  /** One piece per garment: the number of garments that need fabric. */
  maxFabricPieces: number;
  pairSelectionNumber: number;
}): string =>
  reason === "FABRIC_STOCK_EXHAUSTED"
    ? `There isn't enough stock for another piece of this fabric. Pair with Selection ${pairSelectionNumber} instead.`
    : `A new piece isn't available: each garment can use at most one fabric piece, and your ${maxFabricPieces} ${
        maxFabricPieces === 1 ? "garment already has" : "garments already have"
      } ${maxFabricPieces} ${
        maxFabricPieces === 1 ? "piece" : "pieces"
      }. Pair with Selection ${pairSelectionNumber}, or change a selection's fabric.`;

const mapChangeFutureFabricAllocationProductResult = (
  result: ChangeFutureFabricAllocationProductResult,
): FutureFabricAssignmentResult => {
  if (result.status === "assigned") {
    return result;
  }
  const reason: FutureFabricAssignmentBlockReason =
    result.reason === "FABRIC_STOCK_EXHAUSTED"
      ? "FABRIC_STOCK_EXHAUSTED"
      : result.reason === "ALLOCATION_NOT_FOUND"
        ? "ALLOCATION_NOT_FOUND"
        : result.reason === "ALLOCATION_CHANGED"
          ? "ALLOCATION_CHANGED"
          : "INVALID_CAPACITY";
  return { status: "blocked", reason, state: result.state };
};

export const getFutureFabricAllocationGroupChangePresentation = ({
  state,
  allocationId,
  garmentTypeSelection,
  fabrics,
  garmentLabelByKey,
}: {
  state: FabricAllocationState;
  allocationId: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabrics?: readonly Fabric[];
  /**
   * Optional customer-facing occurrence labels (e.g. "Standard Shirt 2")
   * keyed by garmentKey, so the group presentation matches the Order Summary.
   * Falls back to Fabric-domain labels when a key is absent.
   */
  garmentLabelByKey?: ReadonlyMap<string, string>;
}): FutureFabricAllocationGroupChangePresentation | null => {
  const allocationIndex = state.fabricAllocations.findIndex(
    (candidate) => candidate.allocationId === allocationId,
  );
  if (allocationIndex < 0) {
    return null;
  }
  const allocation = state.fabricAllocations[allocationIndex]!;
  if (allocation.garmentAssignments.length === 0) {
    return null;
  }
  const fabric = resolveFabricFromCatalogue(allocation.fabricCode, fabrics);
  const garmentKeys = allocation.garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  );
  const garmentLabels = garmentKeys.map((garmentKey) => {
    const occurrenceLabel = garmentLabelByKey?.get(garmentKey);
    if (occurrenceLabel) {
      return occurrenceLabel;
    }
    const assignment = allocation.garmentAssignments.find(
      (candidate) => candidate.garmentKey === garmentKey,
    );
    return assignment
      ? getFabricGarmentLabel(assignment.garmentType)
      : getFutureGarmentAssignmentLabel(
          garmentKey,
          state,
          garmentTypeSelection,
        );
  });
  return {
    allocationId,
    fabricSelectionNumber: allocationIndex + 1,
    fabricCode: allocation.fabricCode,
    fabricName: fabric?.name ?? allocation.fabricCode,
    garmentKeys,
    garmentLabels,
    isSharedGroup: allocation.garmentAssignments.length > 1,
  };
};

export const changeFutureFabricAllocationProduct = ({
  state,
  allocationId,
  nextFabricCode,
  fabrics,
  expectation,
}: {
  state: FabricAllocationState;
  allocationId: string;
  nextFabricCode: string;
  fabrics: readonly Fabric[];
  expectation?: ChangeFutureFabricAllocationExpectation;
}): ChangeFutureFabricAllocationProductResult => {
  const allocation = state.fabricAllocations.find(
    (candidate) => candidate.allocationId === allocationId,
  );
  if (!allocation || allocation.garmentAssignments.length === 0) {
    return { status: "blocked", reason: "ALLOCATION_NOT_FOUND", state };
  }
  if (expectation) {
    if (allocation.fabricCode !== expectation.expectedCurrentFabricCode) {
      return { status: "blocked", reason: "ALLOCATION_CHANGED", state };
    }
    if (
      getFutureFabricAllocationAssignmentSignature(allocation) !==
      expectation.expectedAssignmentSignature
    ) {
      return { status: "blocked", reason: "ALLOCATION_CHANGED", state };
    }
  }
  if (allocation.fabricCode === nextFabricCode) {
    return { status: "assigned", state };
  }
  const nextFabric = resolveFabricFromCatalogue(nextFabricCode, fabrics);
  if (!nextFabric) {
    return { status: "blocked", reason: "FABRIC_NOT_FOUND", state };
  }
  if (getFabricAvailabilityMessage(nextFabric)) {
    return { status: "blocked", reason: "FABRIC_UNAVAILABLE", state };
  }
  if (resolveFabricPrice(nextFabric) === null) {
    return { status: "blocked", reason: "FABRIC_UNAVAILABLE", state };
  }
  const afterState: FabricAllocationState = {
    ...state,
    fabricAllocations: state.fabricAllocations.map((candidate) =>
      candidate.allocationId === allocationId
        ? { ...candidate, fabricCode: nextFabricCode }
        : candidate,
    ),
    activeAllocationId: allocationId,
  };
  const stockValidation = validateProjectedFabricStock({
    fabric: nextFabric,
    beforeState: state,
    afterState,
  });
  if (!stockValidation.valid) {
    return { status: "blocked", reason: "FABRIC_STOCK_EXHAUSTED", state };
  }
  return { status: "assigned", state: afterState };
};

export const assignFutureFabricToGarment = ({
  state,
  garmentTypeSelection,
  garmentKey,
  fabricCode,
  fabrics,
  requiredPhysicalOccurrences,
  placement = "auto",
  avoidAllocationIds,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  garmentKey: string;
  fabricCode: string;
  fabrics?: readonly Fabric[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  /**
   * "new_piece": never join a piece of this print that already exists; start
   * a new piece instead (still limited by Fabrics Needed and stock).
   */
  placement?: FutureFabricPiecePlacement;
  /** Explicit pieces to avoid; defaults to this print's pieces for "new_piece". */
  avoidAllocationIds?: readonly string[];
}): FutureFabricAssignmentResult => {
  const resolvedAvoidAllocationIds =
    avoidAllocationIds ??
    (placement === "new_piece"
      ? getFutureFabricPieceAllocationIds(state, fabricCode)
      : undefined);
  const target = getFutureFabricAssignmentTargetForKey({
    garmentTypeSelection,
    fabricAllocationState: state,
    garmentKey,
    requiredPhysicalOccurrences,
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
      requiredPhysicalOccurrences,
      avoidAllocationIds: resolvedAvoidAllocationIds,
    });
  }
  if (sourceAllocation.fabricCode === fabricCode) {
    return { status: "assigned", state };
  }
  if (!fabrics) {
    return { status: "blocked", reason: "INVALID_CAPACITY", state };
  }
  return mapChangeFutureFabricAllocationProductResult(
    changeFutureFabricAllocationProduct({
      state,
      allocationId: sourceAllocation.allocationId,
      nextFabricCode: fabricCode,
      fabrics,
    }),
  );
};

export const assignFutureGarmentToExistingFabricAllocation = ({
  state,
  garmentTypeSelection,
  garmentKey,
  allocationId,
  requiredPhysicalOccurrences,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  garmentKey: string;
  allocationId: string;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
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
    requiredPhysicalOccurrences,
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
/**
 * The state with `garmentKey` taken off its piece, when that piece is shared
 * with other garments and is not already `fabricCode`. Null otherwise (the
 * garment is unassigned, alone on its piece, or already on that print).
 */
export const detachFutureGarmentFromSharedPiece = ({
  state,
  garmentKey,
  fabricCode,
}: {
  state: FabricAllocationState;
  garmentKey: string;
  fabricCode: string;
}): FabricAllocationState | null => {
  const source = state.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === garmentKey,
    ),
  );
  if (
    !source ||
    source.garmentAssignments.length < 2 ||
    source.fabricCode === fabricCode
  ) {
    return null;
  }
  return removeFutureFabricAssignment({ state, garmentKey });
};

export const applyFutureFabricCardSelection = ({
  state,
  garmentTypeSelection,
  garmentKey,
  fabricCode,
  fabrics,
  requiredPhysicalOccurrences,
  placement = "auto",
  detachFromSharedPiece = false,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  garmentKey: string;
  fabricCode: string;
  fabrics?: readonly Fabric[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  placement?: FutureFabricPiecePlacement;
  /**
   * Change Fabric from a garment card: when the garment shares its piece
   * with other garments, move only this garment onto the new print and
   * leave the others on the old piece. A garment alone on its piece keeps
   * the re-colour behaviour.
   */
  detachFromSharedPiece?: boolean;
}): FabricAllocationState => {
  if (detachFromSharedPiece) {
    const detached = detachFutureGarmentFromSharedPiece({
      state,
      garmentKey,
      fabricCode,
    });
    if (detached) {
      const moved = applyFutureFabricCardSelection({
        state: detached,
        garmentTypeSelection,
        garmentKey,
        fabricCode,
        fabrics,
        requiredPhysicalOccurrences,
        placement,
      });
      return hasGarmentAssignment(moved, garmentKey) ? moved : state;
    }
  }
  if (state.pendingFabricGarment?.garmentKey === garmentKey) {
    const result = assignFutureFabricToGarment({
      state,
      garmentTypeSelection,
      garmentKey,
      fabricCode,
      fabrics,
      requiredPhysicalOccurrences,
      placement,
    });
    return result.status === "assigned" ? result.state : state;
  }

  const targetIsAlreadyAssigned = state.fabricAllocations.some((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === garmentKey,
    ),
  );
  if (!targetIsAlreadyAssigned) {
    if (placement === "new_piece") {
      const result = assignFutureFabricToGarment({
        state,
        garmentTypeSelection,
        garmentKey,
        fabricCode,
        fabrics,
        requiredPhysicalOccurrences,
        placement,
      });
      return result.status === "assigned" ? result.state : state;
    }
    return selectFutureFabric({
      state,
      garmentTypeSelection,
      fabricCode,
      targetGarmentKey: garmentKey,
      fabrics,
      requiredPhysicalOccurrences,
    });
  }

  return assignFutureFabricToGarment({
    state,
    garmentTypeSelection,
    garmentKey,
    fabricCode,
    fabrics,
    requiredPhysicalOccurrences,
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
  requiredPhysicalOccurrences,
}: {
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  currentTargetGarmentKey: string | null;
  fabrics?: readonly Fabric[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
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

  if (currentTargetGarmentKey && !assignedToCurrentTarget && usingFabric.length > 0) {
    const untargetedCancelKeys = getFutureFabricCatalogueCancelTargets({
      fabricCode,
      garmentTypeSelection,
      fabricAllocationState,
      currentTargetGarmentKey: null,
    });
    if (untargetedCancelKeys.length > 1) {
      return {
        status,
        action: "cancel",
        cancelGarmentKey: null,
        cancelGarmentKeys: untargetedCancelKeys,
      };
    }
  }

  if (currentTargetGarmentKey) {
    const assignmentResult = assignFutureFabricToGarment({
      state: fabricAllocationState,
      garmentTypeSelection,
      garmentKey: currentTargetGarmentKey,
      fabricCode,
      fabrics,
      requiredPhysicalOccurrences,
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

export type FutureFabricChangeCatalogueCardMode =
  | "change-assigned"
  | "change-use-again"
  | "change-select"
  | "change-blocked";

export interface FutureFabricChangeCatalogueCardPresentation
  extends FutureFabricCatalogueCardPresentation {
  changeMode: FutureFabricChangeCatalogueCardMode;
  blockedReason:
    | ChangeFutureFabricAllocationProductBlockReason
    | FutureFabricAssignmentBlockReason
    | null;
}

/**
 * Change Fabric catalogue presentation for one Fabric Selection (allocation).
 * Unlike the single-garment assign presentation, a Fabric already used by
 * other selections stays pickable as USE AGAIN: the change keeps a separate
 * physical piece of that print for this selection. It never exposes cancel
 * targets for other garments, so the card can't remove other selections'
 * fabric while changing; only the changing garment's own current fabric keeps
 * its existing cancel.
 * Availability comes from the same changeFutureFabricAllocationProduct path
 * the commit uses.
 */
export const resolveFutureFabricChangeCatalogueCardPresentation = ({
  fabricCode,
  fabricAllocationState,
  allocationId,
  fabrics,
  targetGarmentKey = null,
  garmentOnly = null,
}: {
  fabricCode: string;
  fabricAllocationState: FabricAllocationState;
  allocationId: string;
  fabrics: readonly Fabric[];
  /**
   * Change Fabric from a garment card: only this garment changes, so
   * availability follows the one-garment move (pair or new piece) instead of
   * re-colouring the whole shared piece.
   */
  garmentOnly?: {
    garmentKey: string;
    garmentTypeSelection: GarmentTypeStepSelection;
    requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  } | null;
  /**
   * The garment whose Change Fabric was tapped. Its current fabric keeps the
   * existing single-occurrence cancel (it never targets other garments).
   */
  targetGarmentKey?: string | null;
}): FutureFabricChangeCatalogueCardPresentation => {
  const allocation = fabricAllocationState.fabricAllocations.find(
    (candidate) => candidate.allocationId === allocationId,
  );
  if (allocation && allocation.fabricCode === fabricCode) {
    const ownsTarget = Boolean(
      targetGarmentKey &&
        allocation.garmentAssignments.some(
          (assignment) => assignment.garmentKey === targetGarmentKey,
        ),
    );
    return {
      status: "ASSIGNED",
      ...(ownsTarget && targetGarmentKey
        ? { action: "cancel" as const, ...singleCancelPresentation(targetGarmentKey) }
        : { action: "none" as const, ...emptyCancelPresentation }),
      changeMode: "change-assigned",
      blockedReason: null,
    };
  }
  const usedByOtherSelection = fabricAllocationState.fabricAllocations.some(
    (candidate) =>
      candidate.allocationId !== allocationId &&
      candidate.fabricCode === fabricCode &&
      candidate.garmentAssignments.length > 0,
  );
  const status: FutureFabricCatalogueCardStatus = usedByOtherSelection
    ? "USE AGAIN"
    : "SELECT";
  const detached = garmentOnly
    ? detachFutureGarmentFromSharedPiece({
        state: fabricAllocationState,
        garmentKey: garmentOnly.garmentKey,
        fabricCode,
      })
    : null;
  const preview =
    detached && garmentOnly
      ? assignFutureFabricToGarment({
          state: detached,
          garmentTypeSelection: garmentOnly.garmentTypeSelection,
          garmentKey: garmentOnly.garmentKey,
          fabricCode,
          fabrics,
          requiredPhysicalOccurrences: garmentOnly.requiredPhysicalOccurrences,
        })
      : changeFutureFabricAllocationProduct({
          state: fabricAllocationState,
          allocationId,
          nextFabricCode: fabricCode,
          fabrics,
        });
  if (preview.status === "blocked") {
    return {
      status,
      action: "none",
      ...emptyCancelPresentation,
      changeMode: "change-blocked",
      blockedReason: preview.reason,
    };
  }
  return {
    status,
    action: usedByOtherSelection ? "use_again" : "select",
    ...emptyCancelPresentation,
    changeMode: usedByOtherSelection ? "change-use-again" : "change-select",
    blockedReason: null,
  };
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
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FutureGarmentFabricPlanning => {
  const requiredAssignments = resolveRequiredAssignmentsWithAdditional(
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
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
  requiredPhysicalOccurrences,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FabricAllocationState => {
  const requiredAssignments = requiredPhysicalOccurrences?.length
    ? physicalOccurrencesToFabricRequirements(requiredPhysicalOccurrences)
    : resolveRequiredAssignments(garmentTypeSelection);
  const requiredByKey = new Map(
    requiredAssignments.map((assignment) => [assignment.garmentKey, assignment]),
  );
  const retainedKeys = new Set<string>();
  const fabricAllocations = state.fabricAllocations.flatMap((allocation) => {
    // A garment whose length changed (Step 4 switch, or a Step 1 change resetting it) keeps its
    // fabric while the resized garment still fits on it.
    const unitsAfterLengthChanges = allocation.garmentAssignments.reduce(
      (total, assignment) => {
        const required = requiredByKey.get(assignment.garmentKey);
        return (
          total +
          (required &&
          areLengthVariantsOfSameGarment(required.garmentType, assignment.garmentType)
            ? required.fabricUnits
            : assignment.fabricUnits)
        );
      },
      0,
    );
    const garmentAssignments = allocation.garmentAssignments.flatMap(
      (assignment) => {
        const required = requiredByKey.get(assignment.garmentKey);
        if (!required || retainedKeys.has(assignment.garmentKey)) return [];
        const sameGarment =
          required.garmentType === assignment.garmentType &&
          required.fabricUnits === assignment.fabricUnits;
        const lengthChangedAndFits =
          required.garmentType !== assignment.garmentType &&
          areLengthVariantsOfSameGarment(required.garmentType, assignment.garmentType) &&
          (required.fabricUnits <= assignment.fabricUnits ||
            unitsAfterLengthChanges <= FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION);
        if (!sameGarment && !lengthChangedAndFits) {
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

export const getFutureFabricAllocationAssignmentSignature = (
  allocation: Pick<FabricAllocation, "garmentAssignments">,
): string =>
  [...allocation.garmentAssignments]
    .sort((left, right) => left.garmentKey.localeCompare(right.garmentKey))
    .map(getFutureFabricAssignmentSignature)
    .join("|");

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
  requiredPhysicalOccurrences,
}: {
  state: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FabricAllocationState => {
  const next = reconcileFutureFabricAllocationState({
    state,
    garmentTypeSelection,
    requiredPhysicalOccurrences,
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
  requiredPhysicalOccurrences,
}: {
  state: FabricAllocationState;
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
  targetGarmentKey?: string | null;
  fabrics?: readonly Fabric[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
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
      requiredPhysicalOccurrences,
    });
    if (!pendingTarget) return state;
    const pendingResult = assignTargetToFabric({
      state,
      target: pendingTarget,
      fabricCode,
      garmentTypeSelection,
      fabrics,
      requiredPhysicalOccurrences,
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
        requiredPhysicalOccurrences,
      })
    : null;
  const remaining = getFutureUnassignedFabricTargets({
    garmentTypeSelection,
    fabricAllocationState: state,
    requiredPhysicalOccurrences,
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
    requiredPhysicalOccurrences,
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
  requiredPhysicalOccurrences,
  rawFabricIntegrityDiagnostics = [],
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  fabrics: Fabric[];
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  rawFabricIntegrityDiagnostics?: readonly AuthoritativePhysicalOrderDiagnostic[];
}): FutureFabricStageCompletion => {
  const requiredAssignments = resolveRequiredAssignmentsWithAdditional(
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
  );
  const requiredByKey = new Map(
    requiredAssignments.map((assignment) => [assignment.garmentKey, assignment]),
  );
  const assignedKeys = new Set<string>();
  const allocationIds = new Set<string>();
  const blockers: FutureFabricStageBlocker[] = [];

  rawFabricIntegrityDiagnostics.forEach((diagnostic) => {
    blockers.push({
      code: "RAW_FABRIC_INTEGRITY_BLOCKED",
      garmentKey: diagnostic.garmentKey,
    });
  });

  if (!getGarmentTypeStageCompletion(garmentTypeSelection).isComplete) {
    blockers.push({ code: "GARMENT_TYPE_INCOMPLETE" });
  }

  for (const allocation of fabricAllocationState.fabricAllocations) {
    if (
      !allocation.allocationId?.trim() ||
      allocationIds.has(allocation.allocationId)
    ) {
      blockers.push({
        code: "MALFORMED_ASSIGNMENT",
        allocationId: allocation.allocationId,
      });
    }
    allocationIds.add(allocation.allocationId);
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

  // Saved drafts may hold more Fabric pieces than garments (for example after
  // a garment was removed). Keep the customer's choices, but block Continue
  // until they are back within one piece per garment. Holding more pieces
  // than Fabrics Needed is allowed.
  if (
    getCustomerFacingFabricQuantityForAllocations(
      fabricAllocationState.fabricAllocations,
    ).allocations.length > requiredAssignments.length
  ) {
    blockers.push({ code: "FABRIC_QUANTITY_OVER_ALLOCATED" });
  } else if (
    !fabricAllocationState.pendingFabricGarment &&
    !fabricAllocationState.awaitingFabricForPendingGarment
  ) {
    // Fabrics saved are within Fabrics Needed, but the free space is split
    // into halves so a waiting whole-fabric garment cannot get fabric.
    const fit = getFabricQuantityFit({
      state: fabricAllocationState,
      garmentTypeSelection,
      requiredPhysicalOccurrences,
    });
    if (fit.shortfall > 0) {
      blockers.push({
        code: "FABRIC_QUANTITY_STRANDED",
        garmentKey:
          fit.waitingWholeGarmentKeys[0] ?? fit.waitingHalfGarmentKeys[0],
      });
    }
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
