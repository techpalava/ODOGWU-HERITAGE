import { createStyleBaseGarmentSpec, getFabricGarmentSelectionsForComposition } from "../config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "../engine/FabricAllocationStateEngine";
import { FabricCapacityEngine } from "../engine/FabricCapacityEngine";
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
}: {
  state: FabricAllocationState;
  fabricCode: string;
  garmentTypeSelection: GarmentTypeStepSelection;
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

  let nextState = FabricAllocationStateEngine.selectPrimaryFabric(
    state,
    fabricCode,
    null,
  );
  if (!nextState.activeAllocationId) return nextState;

  while (!nextState.pendingFabricGarment) {
    const nextGarment =
      FabricAllocationStateEngine.resolveUnassignedPhysicalGarments(
        nextState,
        selectedGarments,
      ).unassignedGarments[0];
    if (!nextGarment) return nextState;
    nextState = FabricAllocationStateEngine.attemptAppendGarment(nextState, {
      code: nextGarment.code,
      garmentSpec: nextGarment.garmentSpec,
    });
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
  const requiredAssignments = resolveRequiredAssignments(garmentTypeSelection);
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
