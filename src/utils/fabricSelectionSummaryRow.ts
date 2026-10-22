/**
 * Fabric Selection summary row (Fabric step, under the catalogue header).
 *
 * Presentation only: one entry per Fabric Selection (allocation), in the same
 * 1-based order as the #1021 number badges. Capacity comes from the existing
 * partial-allocation summaries; this file adds no capacity arithmetic.
 */
import type { Fabric, FabricAllocationState, GarmentTypeStepSelection } from "../types";
import {
  getFutureFabricAllocationGroupChangePresentation,
  getFuturePartialFabricAllocationSummaries,
} from "./designStudioFutureFabricStage";

export interface FabricSelectionSummaryItem {
  allocationId: string;
  selectionNumber: number;
  fabricCode: string;
  fabricName: string;
  fabric: Fabric | null;
  garmentKeys: readonly string[];
  garmentLabels: readonly string[];
  usedUnits: number;
  remainingUnits: number;
  /** "2/2" when full, "1/2 left" when half capacity remains. */
  capacityLabel: string;
  capacityTone: "full" | "reusable_capacity";
}

export const formatFabricSelectionSummaryCapacityLabel = (
  usedUnits: number,
  remainingUnits: number,
): string =>
  remainingUnits > 0
    ? `${remainingUnits}/${usedUnits + remainingUnits} left`
    : `${usedUnits}/${usedUnits + remainingUnits}`;

export const buildFabricSelectionSummaryItems = ({
  fabricAllocationState,
  garmentTypeSelection,
  fabrics,
  garmentLabelByKey,
}: {
  fabricAllocationState: FabricAllocationState;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabrics: readonly Fabric[];
  garmentLabelByKey?: ReadonlyMap<string, string>;
}): FabricSelectionSummaryItem[] => {
  const capacityById = new Map(
    getFuturePartialFabricAllocationSummaries({ fabricAllocationState }).map(
      (summary) => [summary.allocationId, summary],
    ),
  );
  return fabricAllocationState.fabricAllocations.flatMap((allocation) => {
    if (allocation.garmentAssignments.length === 0) return [];
    const presentation = getFutureFabricAllocationGroupChangePresentation({
      state: fabricAllocationState,
      allocationId: allocation.allocationId,
      garmentTypeSelection,
      fabrics,
      garmentLabelByKey,
    });
    if (!presentation) return [];
    const capacity = capacityById.get(allocation.allocationId);
    const usedUnits = capacity?.usedUnits ?? 0;
    const remainingUnits = capacity?.remainingUnits ?? 0;
    return [
      {
        allocationId: allocation.allocationId,
        selectionNumber: presentation.fabricSelectionNumber,
        fabricCode: presentation.fabricCode,
        fabricName: presentation.fabricName,
        fabric:
          fabrics.find((candidate) => candidate.code === allocation.fabricCode) ??
          null,
        garmentKeys: presentation.garmentKeys,
        garmentLabels: presentation.garmentLabels,
        usedUnits,
        remainingUnits,
        capacityLabel: capacity
          ? formatFabricSelectionSummaryCapacityLabel(usedUnits, remainingUnits)
          : "",
        capacityTone: remainingUnits > 0 ? "reusable_capacity" : "full",
      },
    ];
  });
};

/**
 * Fabric Selection numbers (1-based) that already use a print, excluding the
 * selection being changed. Drives the USE AGAIN "Selection N" badge.
 */
export const getFabricSelectionNumbersUsingFabric = ({
  fabricAllocationState,
  fabricCode,
  excludeAllocationId = null,
}: {
  fabricAllocationState: FabricAllocationState;
  fabricCode: string;
  excludeAllocationId?: string | null;
}): number[] =>
  fabricAllocationState.fabricAllocations.flatMap((allocation, index) =>
    allocation.fabricCode === fabricCode &&
    allocation.allocationId !== excludeAllocationId &&
    allocation.garmentAssignments.length > 0
      ? [index + 1]
      : [],
  );

export const formatFabricSelectionNumbersBadge = (
  selectionNumbers: readonly number[],
): string => {
  if (selectionNumbers.length === 0) return "";
  if (selectionNumbers.length === 1) return `Selection ${selectionNumbers[0]}`;
  const head = selectionNumbers.slice(0, -1).join(", ");
  return `Selections ${head} & ${selectionNumbers[selectionNumbers.length - 1]}`;
};
