import type {
  Fabric,
  FabricAllocation,
  FabricGarmentAssignment,
  FabricGarmentRole,
} from "../types";
import {
  getCustomerFacingFabricQuantityForAllocations,
  getFabricGarmentLabel,
} from "../engine/FabricCapacityEngine";

export interface CustomerFabricAssignmentRow {
  garmentKey: string;
  garmentLabel: string;
  fabricCode: string | null;
  fabricLabel: string | null;
  isAssigned: boolean;
  sourceRole: FabricGarmentRole;
  roleLabel: string;
}

export interface CustomerFabricQuantityRow {
  fabricCode: string;
  fabricLabel: string;
  fabricQuantity: number;
}

export interface CustomerFabricAssignmentSummary {
  garmentRows: CustomerFabricAssignmentRow[];
  fabricQuantityRows: CustomerFabricQuantityRow[];
  garmentCount: number;
  assignedGarmentCount: number;
  unresolvedGarmentCount: number;
  fabricQuantity: number;
}

const getFabricLabel = (fabric: Fabric | undefined, fabricCode: string): string =>
  fabric ? `${fabric.name} (${fabric.code})` : fabricCode;

/**
 * Builds the customer-facing allocation view from committed assignments only.
 * Quantity semantics remain delegated to the capacity engine.
 */
export const resolveCustomerFabricAssignmentSummary = ({
  fabricAllocations,
  fabrics,
  unassignedGarments = [],
}: {
  fabricAllocations: readonly FabricAllocation[];
  fabrics: readonly Fabric[];
  unassignedGarments?: readonly FabricGarmentAssignment[];
}): CustomerFabricAssignmentSummary => {
  const fabricByCode = new Map(fabrics.map((fabric) => [fabric.code, fabric]));
  const committedGarmentKeys = new Set<string>();
  const additionalTotals = new Map<string, number>();
  const additionalSeen = new Map<string, number>();
  for (const allocation of fabricAllocations) {
    for (const assignment of allocation.garmentAssignments) {
      if (assignment.sourceRole !== "additional") continue;
      additionalTotals.set(
        assignment.garmentType,
        (additionalTotals.get(assignment.garmentType) || 0) + 1,
      );
    }
  }
  const getRolePresentation = (assignment: FabricGarmentAssignment) => {
    if (assignment.sourceRole !== "additional") {
      return { sourceRole: "main" as const, roleLabel: "Main" };
    }
    const sequence = (additionalSeen.get(assignment.garmentType) || 0) + 1;
    additionalSeen.set(assignment.garmentType, sequence);
    const total = additionalTotals.get(assignment.garmentType) || 0;
    return {
      sourceRole: "additional" as const,
      roleLabel: total > 1 ? `Additional ${sequence}` : "Additional",
    };
  };
  const garmentRows = fabricAllocations.flatMap((allocation) => {
    const fabric = fabricByCode.get(allocation.fabricCode);
    const fabricLabel = getFabricLabel(fabric, allocation.fabricCode);

    return allocation.garmentAssignments.map((assignment) => {
      committedGarmentKeys.add(assignment.garmentKey);
      return {
        garmentKey: assignment.garmentKey,
        garmentLabel: getFabricGarmentLabel(assignment.garmentType),
        fabricCode: allocation.fabricCode,
        fabricLabel,
        isAssigned: true,
        ...getRolePresentation(assignment),
      };
    });
  });

  for (const assignment of unassignedGarments) {
    if (committedGarmentKeys.has(assignment.garmentKey)) continue;
    garmentRows.push({
      garmentKey: assignment.garmentKey,
      garmentLabel: getFabricGarmentLabel(assignment.garmentType),
      fabricCode: null,
      fabricLabel: null,
      isAssigned: false,
      ...getRolePresentation(assignment),
    });
  }

  const quantitySummary =
    getCustomerFacingFabricQuantityForAllocations(fabricAllocations);
  const fabricQuantityRows = new Map<string, CustomerFabricQuantityRow>();

  for (const allocation of quantitySummary.allocations) {
    const existing = fabricQuantityRows.get(allocation.fabricCode);
    const fabricLabel = getFabricLabel(
      fabricByCode.get(allocation.fabricCode),
      allocation.fabricCode,
    );
    if (existing) {
      existing.fabricQuantity += allocation.fabricQuantity;
    } else {
      fabricQuantityRows.set(allocation.fabricCode, {
        fabricCode: allocation.fabricCode,
        fabricLabel,
        fabricQuantity: allocation.fabricQuantity,
      });
    }
  }

  return {
    garmentRows,
    fabricQuantityRows: [...fabricQuantityRows.values()],
    garmentCount: garmentRows.length,
    assignedGarmentCount: committedGarmentKeys.size,
    unresolvedGarmentCount: garmentRows.filter((row) => !row.isAssigned).length,
    fabricQuantity: quantitySummary.fabricQuantity,
  };
};
