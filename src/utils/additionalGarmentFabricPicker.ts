import type {
  CanonicalPhysicalGarmentType,
  DesignSelections,
  Fabric,
  FabricAllocation,
  FabricAllocationState,
  GarmentConstructionPricingResolution,
  GarmentScopedCustomDetailsStateV1,
} from "../types";
import { FabricCapacityEngine } from "../engine/FabricCapacityEngine";
import type { CustomDetailCatalogInspection } from "./catalogHelpers";
import { copyGarmentScopedCustomDetailsToAdditionalOccurrence } from "./garmentScopedCustomDetailsDomain";
import {
  getFabricAvailabilityMessage,
  isFabricAvailableForCustomerSelection,
} from "./fabricCatalogueAvailability";
export { isFabricAvailableForCustomerSelection } from "./fabricCatalogueAvailability";

export type AdditionalGarmentFabricTransactionPhase =
  | "choice"
  | "catalogue"
  | "assigning"
  | "awaiting_commit"
  | "committed";

export type AdditionalGarmentFabricTransaction = {
  transactionId: number;
  phase: AdditionalGarmentFabricTransactionPhase;
  origin: "new_addition" | "change_existing";
  garmentKey: string;
  garmentType: CanonicalPhysicalGarmentType;
  requestedFabricCode?: string;
  previousFabricCode?: string;
  construction?: GarmentConstructionPricingResolution;
  copyFromParentGarmentKey?: string;
  constructionAppliedForTransactionId?: number;
  /** True when the Step 4 fabric dialog was opened for this transaction. */
  openedModal?: boolean;
};

export type AdditionalGarmentFabricAssignmentResult =
  | {
      status: "assigned";
      state: FabricAllocationState;
      garmentKey: string;
      fabricCode: string;
    }
  | {
      status: "blocked";
      state: FabricAllocationState;
      reason: string;
    };

export type AdditionalGarmentTransactionCommitResult =
  | {
      status: "committed";
      garmentKey: string;
      fabricCode: string;
    }
  | {
      status: "pending";
    }
  | {
      status: "blocked" | "stale";
      reason: string;
    };

export type ResolveCurrentCatalogueFabricResult =
  | { status: "resolved"; fabric: Fabric }
  | {
      status: "blocked";
      reason: string;
      code:
        | "missing"
        | "duplicate_code"
        | "hidden"
        | "out_of_stock"
        | "price_unavailable"
        | "unavailable";
    };

export const DUPLICATE_FABRIC_CATALOGUE_MESSAGE =
  "This fabric needs catalogue review. Choose another fabric.";

export const STALE_ADDITIONAL_GARMENT_FABRIC_MESSAGE =
  "This garment setup is no longer current. The active fabric assignment was left unchanged.";

/**
 * Fabric code that activates Design Style pricing — the allocation that holds
 * base/main garments. Never the most recently active additional-garment allocation.
 */
export const resolveAuthoritativePrimaryFabricCode = (
  state: FabricAllocationState,
): string | null => {
  const withMain = state.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) =>
        assignment.sourceRole === "main" ||
        (typeof assignment.garmentKey === "string" &&
          assignment.garmentKey.startsWith("base:")),
    ),
  );
  if (withMain?.fabricCode) return withMain.fabricCode;

  const withNonAdditional = state.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.sourceRole !== "additional",
    ),
  );
  if (withNonAdditional?.fabricCode) return withNonAdditional.fabricCode;

  return state.fabricAllocations[0]?.fabricCode || null;
};

export const collectFabricAssignmentsForGarmentKey = (
  state: FabricAllocationState,
  garmentKey: string,
): Array<{
  fabricCode: string;
  allocationId: string;
  allocation: FabricAllocation;
  assignment: FabricAllocation["garmentAssignments"][number];
}> => {
  const matches: Array<{
    fabricCode: string;
    allocationId: string;
    allocation: FabricAllocation;
    assignment: FabricAllocation["garmentAssignments"][number];
  }> = [];
  state.fabricAllocations.forEach((allocation) => {
    allocation.garmentAssignments.forEach((assignment) => {
      if (assignment.garmentKey === garmentKey) {
        matches.push({
          fabricCode: allocation.fabricCode,
          allocationId: allocation.allocationId,
          allocation,
          assignment,
        });
      }
    });
  });
  return matches;
};

const allocationResolves = (allocation: FabricAllocation): boolean =>
  FabricCapacityEngine.resolveFabricAllocation(allocation).status === "resolved";

const collectChangedAllocations = ({
  previousState,
  nextState,
}: {
  previousState: FabricAllocationState;
  nextState: FabricAllocationState;
}): FabricAllocation[] => {
  const previousById = new Map(
    previousState.fabricAllocations.map((allocation) => [
      allocation.allocationId,
      allocation,
    ]),
  );
  return nextState.fabricAllocations.filter((allocation) => {
    const previous = previousById.get(allocation.allocationId);
    if (!previous) return true;
    return (
      previous.fabricCode !== allocation.fabricCode ||
      previous.garmentAssignments.length !==
        allocation.garmentAssignments.length ||
      previous.garmentAssignments.some(
        (assignment, index) =>
          assignment.garmentKey !==
            allocation.garmentAssignments[index]?.garmentKey ||
          assignment.fabricUnits !==
            allocation.garmentAssignments[index]?.fabricUnits,
      )
    );
  });
};

export const confirmAdditionalGarmentFabricAssignment = ({
  previousState,
  nextState,
  garmentKey,
  fabricCode,
}: {
  previousState: FabricAllocationState;
  nextState: FabricAllocationState;
  garmentKey: string;
  fabricCode: string;
}): AdditionalGarmentFabricAssignmentResult => {
  const matchingAssignments = collectFabricAssignmentsForGarmentKey(
    nextState,
    garmentKey,
  );
  const allocationIds = new Set(
    matchingAssignments.map((match) => match.allocationId),
  );

  if (
    matchingAssignments.length !== 1 ||
    allocationIds.size !== 1 ||
    matchingAssignments[0].fabricCode !== fabricCode ||
    nextState.pendingFabricGarment?.garmentKey === garmentKey ||
    (nextState.awaitingFabricForPendingGarment &&
      nextState.pendingFabricGarment?.garmentKey === garmentKey)
  ) {
    return {
      status: "blocked",
      state: previousState,
      reason:
        matchingAssignments.length > 1
          ? "This garment has conflicting fabric assignments. Choose another fabric or cancel."
          : "That fabric could not be assigned to this garment. Choose another fabric or cancel.",
    };
  }

  const containingAllocation = matchingAssignments[0].allocation;
  if (!allocationResolves(containingAllocation)) {
    return {
      status: "blocked",
      state: previousState,
      reason:
        "That fabric allocation exceeds capacity for these garments. Choose another fabric or cancel.",
    };
  }

  const affectedAllocations = collectChangedAllocations({
    previousState,
    nextState,
  });
  if (affectedAllocations.some((allocation) => !allocationResolves(allocation))) {
    return {
      status: "blocked",
      state: previousState,
      reason:
        "That fabric change would leave an invalid fabric allocation. Choose another fabric or cancel.",
    };
  }

  return {
    status: "assigned",
    state: nextState,
    garmentKey,
    fabricCode,
  };
};

export const resolveCurrentCatalogueFabricForAssignment = ({
  fabrics,
  fabricCode,
}: {
  fabrics: readonly Fabric[];
  fabricCode: string;
}): ResolveCurrentCatalogueFabricResult => {
  const code = typeof fabricCode === "string" ? fabricCode.trim() : "";
  if (!code) {
    return {
      status: "blocked",
      code: "missing",
      reason: "That fabric is no longer available in the catalogue.",
    };
  }
  const matches = fabrics.filter((fabric) => fabric.code === code);
  if (matches.length === 0) {
    return {
      status: "blocked",
      code: "missing",
      reason: "That fabric is no longer available in the catalogue.",
    };
  }
  if (matches.length > 1) {
    return {
      status: "blocked",
      code: "duplicate_code",
      reason: DUPLICATE_FABRIC_CATALOGUE_MESSAGE,
    };
  }
  const fabric = matches[0];
  if (fabric.stockStatus === "HIDDEN") {
    return {
      status: "blocked",
      code: "hidden",
      reason:
        getFabricAvailabilityMessage(fabric) ||
        "This fabric is no longer available.",
    };
  }
  if (fabric.stockStatus === "OUT_OF_STOCK") {
    return {
      status: "blocked",
      code: "out_of_stock",
      reason:
        getFabricAvailabilityMessage(fabric) || "Currently out of stock.",
    };
  }
  if (!isFabricAvailableForCustomerSelection(fabric)) {
    const message = getFabricAvailabilityMessage(fabric);
    return {
      status: "blocked",
      code: message?.includes("Price") ? "price_unavailable" : "unavailable",
      reason: message || "That fabric is no longer available.",
    };
  }
  return { status: "resolved", fabric };
};

export const canCancelPendingForAdditionalGarmentTransaction = ({
  transaction,
  fabricAllocationState,
  expectedTransactionId,
}: {
  transaction: AdditionalGarmentFabricTransaction;
  fabricAllocationState: FabricAllocationState;
  expectedTransactionId: number;
}): boolean =>
  transaction.origin === "new_addition" &&
  transaction.transactionId === expectedTransactionId &&
  fabricAllocationState.pendingFabricGarment?.garmentKey ===
    transaction.garmentKey &&
  (!fabricAllocationState.awaitingFabricForPendingGarment ||
    fabricAllocationState.pendingFabricGarment?.garmentKey ===
      transaction.garmentKey);

export const isAdditionalGarmentFabricTransactionTargetValid = ({
  transaction,
  fabricAllocationState,
}: {
  transaction: AdditionalGarmentFabricTransaction;
  fabricAllocationState: FabricAllocationState;
}): boolean => {
  const matching = collectFabricAssignmentsForGarmentKey(
    fabricAllocationState,
    transaction.garmentKey,
  );
  if (transaction.origin === "change_existing") {
    return (
      matching.length === 1 &&
      matching[0].assignment.sourceRole === "additional" &&
      fabricAllocationState.pendingFabricGarment?.garmentKey !==
        transaction.garmentKey
    );
  }
  if (
    transaction.phase === "awaiting_commit" ||
    transaction.phase === "assigning"
  ) {
    return (
      matching.length === 1 &&
      matching[0].assignment.sourceRole === "additional" &&
      fabricAllocationState.pendingFabricGarment?.garmentKey !==
        transaction.garmentKey
    );
  }
  return (
    fabricAllocationState.pendingFabricGarment?.garmentKey ===
      transaction.garmentKey ||
    (matching.length === 1 &&
      matching[0].assignment.sourceRole === "additional")
  );
};

export const confirmAdditionalGarmentTransactionCommitted = ({
  transaction,
  fabricAllocationState,
  designSelections,
  reconciliationParentGarmentKeys,
}: {
  transaction: AdditionalGarmentFabricTransaction;
  fabricAllocationState: FabricAllocationState;
  designSelections: DesignSelections;
  reconciliationParentGarmentKeys: readonly string[];
}): AdditionalGarmentTransactionCommitResult => {
  if (
    !isAdditionalGarmentFabricTransactionTargetValid({
      transaction,
      fabricAllocationState,
    })
  ) {
    return {
      status: "stale",
      reason: "This garment is no longer available for fabric assignment.",
    };
  }

  const fabricCode = transaction.requestedFabricCode;
  if (!fabricCode) {
    return { status: "pending" };
  }

  const fabricResult = confirmAdditionalGarmentFabricAssignment({
    previousState: fabricAllocationState,
    nextState: fabricAllocationState,
    garmentKey: transaction.garmentKey,
    fabricCode,
  });
  if (fabricResult.status !== "assigned") {
    return {
      status: "blocked",
      reason: fabricResult.reason,
    };
  }

  if (transaction.origin === "new_addition") {
    const construction =
      designSelections.additionalGarmentConstructions?.byGarmentKey?.[
        transaction.garmentKey
      ];
    if (!construction || construction.status !== "resolved") {
      return { status: "pending" };
    }
    if (
      transaction.constructionAppliedForTransactionId !==
      transaction.transactionId
    ) {
      return { status: "pending" };
    }
    if (!reconciliationParentGarmentKeys.includes(transaction.garmentKey)) {
      return { status: "pending" };
    }
  }

  return {
    status: "committed",
    garmentKey: transaction.garmentKey,
    fabricCode,
  };
};

export const applyAdditionalGarmentConstructionAndCopy = ({
  current,
  transaction,
  catalogInspection,
}: {
  current: DesignSelections;
  transaction: AdditionalGarmentFabricTransaction;
  catalogInspection: CustomDetailCatalogInspection;
}): {
  next: DesignSelections;
  applied: boolean;
  reason?: string;
} => {
  if (transaction.origin !== "new_addition" || !transaction.construction) {
    return { next: current, applied: true };
  }
  if (transaction.construction.status !== "resolved") {
    return {
      next: current,
      applied: false,
      reason: "Construction is not ready for this garment.",
    };
  }

  let nextCustomDetails: GarmentScopedCustomDetailsStateV1 | undefined =
    current.garmentScopedCustomDetails;
  if (transaction.copyFromParentGarmentKey) {
    const copyResult = copyGarmentScopedCustomDetailsToAdditionalOccurrence({
      state: current.garmentScopedCustomDetails || {
        schemaVersion: 1,
        selectionsByGarmentKey: {},
        snapshotsByGarmentKey: {},
      },
      sourceParentGarmentKey: transaction.copyFromParentGarmentKey,
      targetParentGarmentKey: transaction.garmentKey,
      garmentType: transaction.garmentType,
      catalogInspection,
    });
    if (copyResult.status === "incompatible") {
      return {
        next: current,
        applied: false,
        reason:
          "Copied Custom Details are no longer available from the source garment.",
      };
    }
    nextCustomDetails = copyResult.state;
  }

  return {
    applied: true,
    next: {
      ...current,
      additionalGarmentConstructions: {
        schemaVersion: 1,
        byGarmentKey: {
          ...(current.additionalGarmentConstructions?.byGarmentKey || {}),
          [transaction.garmentKey]: transaction.construction,
        },
      },
      ...(nextCustomDetails
        ? { garmentScopedCustomDetails: nextCustomDetails }
        : {}),
    },
  };
};

export const getActiveFabricForAdditionalGarmentPicker = ({
  fabrics,
  fabricAllocationState,
}: {
  fabrics: readonly Fabric[];
  fabricAllocationState: FabricAllocationState;
}): {
  fabric: Fabric | null;
  displayFabric: Fabric | null;
  fabricCode: string | null;
  selectionIndex: number | null;
  resolution: ResolveCurrentCatalogueFabricResult;
} => {
  const activeAllocation =
    fabricAllocationState.fabricAllocations.find(
      (allocation) =>
        allocation.allocationId === fabricAllocationState.activeAllocationId,
    ) || fabricAllocationState.fabricAllocations[0];
  if (!activeAllocation) {
    return {
      fabric: null,
      displayFabric: null,
      fabricCode: null,
      selectionIndex: null,
      resolution: {
        status: "blocked",
        code: "missing",
        reason: "No active fabric is available to reuse.",
      },
    };
  }
  const selectionIndex =
    fabricAllocationState.fabricAllocations.findIndex(
      (allocation) =>
        allocation.allocationId === activeAllocation.allocationId,
    ) + 1;
  const resolution = resolveCurrentCatalogueFabricForAssignment({
    fabrics,
    fabricCode: activeAllocation.fabricCode,
  });
  const codeMatches = fabrics.filter(
    (candidate) => candidate.code === activeAllocation.fabricCode,
  );
  return {
    fabric: resolution.status === "resolved" ? resolution.fabric : null,
    displayFabric:
      resolution.status === "resolved"
        ? resolution.fabric
        : codeMatches[0] || null,
    fabricCode: activeAllocation.fabricCode,
    selectionIndex: selectionIndex > 0 ? selectionIndex : null,
    resolution,
  };
};
