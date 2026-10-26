import { FabricCapacityEngine } from "../engine/FabricCapacityEngine.js";
import { FABRIC_GARMENT_CAPACITY_UNITS } from "../config/StyleFabricCapacityConfig.js";
import type {
  CanonicalPhysicalGarmentType,
  CustomDetailSelectionGroup,
  Fabric,
  FabricAllocationState,
  FabricGarmentAssignment,
  FabricUnitCount,
} from "../types.js";
import { getStep1GarmentDisplayLabel } from "./garmentConstructionPricing.js";
import {
  getFabricPhysicalAllocationCount,
  isAuthoritativeNumericFabricStock,
} from "./fabricStockAvailability.js";
import {
  getGarmentLengthFamily,
  getGarmentLengthFamilyForSelectionGroup,
  getGarmentTypeForLength,
  getOptionGarmentLength,
  type GarmentLength,
  type GarmentLengthSwitchLock,
} from "./garmentLengthVariant.js";

export type GarmentLengthSwitchPlan =
  /** The option keeps the garment's length (or the group has no lengths): select it as usual. */
  | { readonly status: "same_length" }
  | {
      readonly status: "locked";
      readonly reason: string;
    }
  | {
      readonly status: "blocked";
      readonly reason: "fabric_capacity" | "fabric_out_of_stock";
      readonly message: string;
    }
  | {
      readonly status: "switch";
      readonly fromGarmentType: CanonicalPhysicalGarmentType;
      readonly toGarmentType: CanonicalPhysicalGarmentType;
      readonly toLength: GarmentLength;
      /** The fabric state with this garment's assignment resized to the new garment type. */
      readonly fabricAllocationState: FabricAllocationState;
    };

const lengthLabel = (length: GarmentLength): string =>
  length === "long" ? "Long Length" : "Standard Length";

const renameAssignmentCode = (
  code: string,
  fromGarmentType: CanonicalPhysicalGarmentType,
  toGarmentType: CanonicalPhysicalGarmentType,
): string => {
  const match = code.match(
    new RegExp(
      `^(BASE|STYLE_BASE|ADDITIONAL)_${fromGarmentType.toUpperCase()}(_[1-9][0-9]*)?$`,
    ),
  );
  return match
    ? `${match[1]}_${toGarmentType.toUpperCase()}${match[2] ?? ""}`
    : code;
};

const resizeAssignment = (
  assignment: FabricGarmentAssignment,
  fromGarmentType: CanonicalPhysicalGarmentType,
  toGarmentType: CanonicalPhysicalGarmentType,
): FabricGarmentAssignment => {
  const fabricUnits = FABRIC_GARMENT_CAPACITY_UNITS[toGarmentType] as FabricUnitCount;
  // Everything else (role, link to a main garment, eligibility) stays as it is.
  return {
    ...assignment,
    code: renameAssignmentCode(assignment.code, fromGarmentType, toGarmentType),
    garmentType: toGarmentType,
    fabricUnits,
    ...(assignment.garmentSpec
      ? {
          garmentSpec: {
            ...assignment.garmentSpec,
            garmentType: toGarmentType,
            fabricUnits,
          },
        }
      : {}),
  };
};

/**
 * Decides what picking `optionId` for a garment's Main Garment group does to the order.
 *
 * Picking an option of the other length switches the garment to the other garment type of its
 * family (Standard Shirt <-> Long Shirt, Standard Dress <-> Long Dress, Standard Skirt <-> Long
 * Skirt), unless the same-family rule locks that length, or the garment's fabric cannot hold the
 * bigger garment. Going to a smaller garment is never blocked.
 */
export const planGarmentLengthSwitch = ({
  parentGarmentKey,
  currentGarmentType,
  selectionGroup,
  optionId,
  lock,
  fabricAllocationState,
  fabrics,
}: {
  parentGarmentKey: string;
  /** The garment type the order holds now. */
  currentGarmentType: CanonicalPhysicalGarmentType;
  selectionGroup: CustomDetailSelectionGroup;
  optionId: string;
  lock: GarmentLengthSwitchLock | null | undefined;
  fabricAllocationState: FabricAllocationState;
  fabrics: readonly Pick<Fabric, "code" | "stock" | "stockStatus">[];
}): GarmentLengthSwitchPlan => {
  const family = getGarmentLengthFamily(currentGarmentType);
  if (!family || getGarmentLengthFamilyForSelectionGroup(selectionGroup)?.id !== family.id) {
    return { status: "same_length" };
  }
  const toLength = getOptionGarmentLength(selectionGroup, optionId);
  if (!toLength) return { status: "same_length" };
  const toGarmentType = getGarmentTypeForLength(currentGarmentType, toLength);
  if (toGarmentType === currentGarmentType) return { status: "same_length" };
  if (lock?.lockedLength === toLength) {
    return { status: "locked", reason: lock.reason };
  }

  const fromUnits = FABRIC_GARMENT_CAPACITY_UNITS[currentGarmentType];
  const toUnits = FABRIC_GARMENT_CAPACITY_UNITS[toGarmentType];
  const allocation = fabricAllocationState.fabricAllocations.find((candidate) =>
    candidate.garmentAssignments.some(
      (assignment) => assignment.garmentKey === parentGarmentKey,
    ),
  );

  if (allocation && toUnits > fromUnits) {
    const toLabel = getStep1GarmentDisplayLabel(toGarmentType);
    const ask = `Choose another Fabric for this garment, then pick ${lengthLabel(toLength)} again.`;
    const fabric = fabrics.find((candidate) => candidate.code === allocation.fabricCode);
    const outOfStock = Boolean(
      fabric &&
      (fabric.stockStatus === "OUT_OF_STOCK" ||
        fabric.stockStatus === "HIDDEN" ||
        (isAuthoritativeNumericFabricStock(fabric.stock) &&
          fabric.stock < getFabricPhysicalAllocationCount(fabricAllocationState, fabric.code))),
    );
    if (outOfStock) {
      return {
        status: "blocked",
        reason: "fabric_out_of_stock",
        message: `The Fabric on this garment is out of stock, so it can't be made as a ${toLabel}. ${ask}`,
      };
    }
    const usedByOthers = allocation.garmentAssignments.reduce(
      (total, assignment) =>
        assignment.garmentKey === parentGarmentKey
          ? total
          : total + assignment.fabricUnits,
      0,
    );
    if (usedByOthers + toUnits > FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION) {
      return {
        status: "blocked",
        reason: "fabric_capacity",
        message: `A ${toLabel} needs more of this Fabric than is left, because another garment shares it. ${ask}`,
      };
    }
  }

  const resize = (assignment: FabricGarmentAssignment) =>
    assignment.garmentKey === parentGarmentKey
      ? resizeAssignment(assignment, currentGarmentType, toGarmentType)
      : assignment;
  return {
    status: "switch",
    fromGarmentType: currentGarmentType,
    toGarmentType,
    toLength,
    fabricAllocationState: {
      ...fabricAllocationState,
      fabricAllocations: fabricAllocationState.fabricAllocations.map((candidate) => ({
        ...candidate,
        garmentAssignments: candidate.garmentAssignments.map(resize),
      })),
      pendingFabricGarment: fabricAllocationState.pendingFabricGarment
        ? resize(fabricAllocationState.pendingFabricGarment)
        : null,
    },
  };
};
