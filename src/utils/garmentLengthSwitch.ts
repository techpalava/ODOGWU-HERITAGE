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
import type { GarmentTypeStepSelection } from "../types.js";
import type { PhysicalGarmentOccurrence } from "./designSourceState.js";
import {
  applyFutureFabricCardSelection,
  assignFutureGarmentToExistingFabricAllocation,
} from "./designStudioFutureFabricStage.js";
import {
  confirmAdditionalGarmentFabricAssignment,
  resolveCurrentCatalogueFabricForAssignment,
} from "./additionalGarmentFabricPicker.js";
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
} from "./garmentLengthVariant.js";

export type GarmentLengthSwitchPlan =
  /** The option keeps the garment's length (or the group has no lengths): select it as usual. */
  | { readonly status: "same_length" }
  | {
      /**
       * The garment's fabric cannot hold the bigger garment (it is shared and too full, or it is
       * out of stock): the customer picks a fabric for it (a new piece of the same fabric or
       * another one) before the switch applies.
       */
      readonly status: "needs_fabric";
      readonly fromGarmentType: CanonicalPhysicalGarmentType;
      readonly toGarmentType: CanonicalPhysicalGarmentType;
      readonly toLength: GarmentLength;
      /** The fabric the garment is on now; the fabric picker pre-selects it when it fits. */
      readonly fromFabricCode: string;
      /** The resized assignment, to place on the fabric the customer picks. */
      readonly assignment: FabricGarmentAssignment;
      /** The fabric state without this garment, which the fabric picker places it into. */
      readonly fabricAllocationStateWithoutGarment: FabricAllocationState;
    }
  | {
      readonly status: "switch";
      readonly fromGarmentType: CanonicalPhysicalGarmentType;
      readonly toGarmentType: CanonicalPhysicalGarmentType;
      readonly toLength: GarmentLength;
      /** The fabric state with this garment's assignment resized to the new garment type. */
      readonly fabricAllocationState: FabricAllocationState;
    };

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
 * Skirt). Every garment may switch, also when the order then holds two garments of one type.
 * When the garment's fabric cannot hold the bigger garment (shared and too full, or out of stock)
 * the customer picks a fabric for it first. Going to a smaller garment always fits.
 */
export const planGarmentLengthSwitch = ({
  parentGarmentKey,
  currentGarmentType,
  selectionGroup,
  optionId,
  fabricAllocationState,
  fabrics,
}: {
  parentGarmentKey: string;
  /** The garment type the order holds now. */
  currentGarmentType: CanonicalPhysicalGarmentType;
  selectionGroup: CustomDetailSelectionGroup;
  optionId: string;
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

  const fromUnits = FABRIC_GARMENT_CAPACITY_UNITS[currentGarmentType];
  const toUnits = FABRIC_GARMENT_CAPACITY_UNITS[toGarmentType];
  const allocation = fabricAllocationState.fabricAllocations.find((candidate) =>
    candidate.garmentAssignments.some(
      (assignment) => assignment.garmentKey === parentGarmentKey,
    ),
  );

  if (allocation && toUnits > fromUnits) {
    const usedByOthers = allocation.garmentAssignments.reduce(
      (total, assignment) =>
        assignment.garmentKey === parentGarmentKey
          ? total
          : total + assignment.fabricUnits,
      0,
    );
    const sharedFabricFull =
      usedByOthers + toUnits > FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION;
    // Alone on its fabric the bigger garment uses the rest of the same piece, unless that fabric
    // is out of stock.
    const fabric = fabrics.find((candidate) => candidate.code === allocation.fabricCode);
    const outOfStock = Boolean(
      fabric &&
      (fabric.stockStatus === "OUT_OF_STOCK" ||
        fabric.stockStatus === "HIDDEN" ||
        (isAuthoritativeNumericFabricStock(fabric.stock) &&
          fabric.stock < getFabricPhysicalAllocationCount(fabricAllocationState, fabric.code))),
    );
    if (sharedFabricFull || outOfStock) {
      const current = allocation.garmentAssignments.find(
        (assignment) => assignment.garmentKey === parentGarmentKey,
      )!;
      const fabricAllocations = fabricAllocationState.fabricAllocations
        .map((candidate) =>
          candidate.allocationId === allocation.allocationId
            ? {
                ...candidate,
                garmentAssignments: candidate.garmentAssignments.filter(
                  (assignment) => assignment.garmentKey !== parentGarmentKey,
                ),
              }
            : candidate,
        )
        // A piece the garment was alone on is no longer in the order.
        .filter((candidate) => candidate.garmentAssignments.length > 0);
      return {
        status: "needs_fabric",
        fromGarmentType: currentGarmentType,
        toGarmentType,
        toLength,
        fromFabricCode: allocation.fabricCode,
        assignment: resizeAssignment(current, currentGarmentType, toGarmentType),
        fabricAllocationStateWithoutGarment: {
          ...fabricAllocationState,
          fabricAllocations,
          activeAllocationId: fabricAllocations.some(
            (candidate) => candidate.allocationId === fabricAllocationState.activeAllocationId,
          )
            ? fabricAllocationState.activeAllocationId
            : fabricAllocations[0]?.allocationId ?? null,
        },
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

/** The order's garments as they will be once `garmentKey` is `toGarmentType`. */
export const previewLengthSwitchedOccurrences = (
  occurrences: readonly PhysicalGarmentOccurrence[],
  garmentKey: string,
  toGarmentType: CanonicalPhysicalGarmentType,
): PhysicalGarmentOccurrence[] =>
  occurrences.map((occurrence) =>
    occurrence.garmentKey === garmentKey
      ? {
          ...occurrence,
          garmentType: toGarmentType,
          fabricUnits: FABRIC_GARMENT_CAPACITY_UNITS[toGarmentType],
        }
      : occurrence,
  );

export type LengthSwitchFabricChoice =
  | { readonly kind: "fabric"; readonly fabricCode: string }
  | { readonly kind: "allocation"; readonly allocationId: string };

export type LengthSwitchFabricPlacement =
  | { readonly status: "assigned"; readonly fabricAllocationState: FabricAllocationState }
  | { readonly status: "blocked"; readonly reason: string };

const allocationIdByGarmentKey = (state: FabricAllocationState): Map<string, string> =>
  new Map(
    state.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map(
        (assignment) => [assignment.garmentKey, allocation.allocationId] as const,
      ),
    ),
  );

/**
 * Places a garment that needs more fabric for its new length on the fabric the customer picked in
 * the Step 4 fabric picker: a piece of that fabric with room for it, else a new piece (the usual
 * Fabric rules: stock, sold out, how many pieces the order may hold), or a piece already in the
 * order that has room. The garment keeps its assignment (key, role, link to a main garment); only
 * its piece and size change. Every other garment stays where it is.
 */
export const placeLengthSwitchedGarmentOnFabric = ({
  plan,
  parentGarmentKey,
  garmentTypeSelection,
  requiredPhysicalOccurrences,
  fabrics,
  choice,
}: {
  plan: Extract<GarmentLengthSwitchPlan, { status: "needs_fabric" }>;
  parentGarmentKey: string;
  /** The Step 1 selection as it will be after the switch. */
  garmentTypeSelection: GarmentTypeStepSelection;
  /** The order's garments as they will be after the switch. */
  requiredPhysicalOccurrences: readonly PhysicalGarmentOccurrence[];
  fabrics: readonly Fabric[];
  choice: LengthSwitchFabricChoice;
}): LengthSwitchFabricPlacement => {
  const previousState = plan.fabricAllocationStateWithoutGarment;
  let placedState: FabricAllocationState;
  let fabricCode: string;
  if (choice.kind === "fabric") {
    const resolved = resolveCurrentCatalogueFabricForAssignment({
      fabrics,
      fabricCode: choice.fabricCode,
    });
    if (resolved.status !== "resolved") {
      return { status: "blocked", reason: resolved.reason };
    }
    fabricCode = resolved.fabric.code;
    placedState = applyFutureFabricCardSelection({
      state: previousState,
      garmentTypeSelection,
      garmentKey: parentGarmentKey,
      fabricCode,
      fabrics,
      requiredPhysicalOccurrences,
    });
  } else {
    const target = previousState.fabricAllocations.find(
      (allocation) => allocation.allocationId === choice.allocationId,
    );
    const result = assignFutureGarmentToExistingFabricAllocation({
      state: previousState,
      garmentTypeSelection,
      garmentKey: parentGarmentKey,
      allocationId: choice.allocationId,
      requiredPhysicalOccurrences,
    });
    if (!target || result.status !== "assigned") {
      return {
        status: "blocked",
        reason: "That fabric could not be assigned to this garment. Choose another fabric or cancel.",
      };
    }
    fabricCode = target.fabricCode;
    placedState = result.state;
  }

  // Keep the garment's own assignment record on the piece it was placed on.
  const nextState: FabricAllocationState = {
    ...placedState,
    fabricAllocations: placedState.fabricAllocations.map((allocation) => ({
      ...allocation,
      garmentAssignments: allocation.garmentAssignments.map((assignment) =>
        assignment.garmentKey === parentGarmentKey ? plan.assignment : assignment,
      ),
    })),
  };
  const before = allocationIdByGarmentKey(previousState);
  const after = allocationIdByGarmentKey(nextState);
  const othersMoved = [...before].some(([garmentKey, allocationId]) => {
    const nextAllocationId = after.get(garmentKey);
    const previousFabric = previousState.fabricAllocations.find(
      (allocation) => allocation.allocationId === allocationId,
    )?.fabricCode;
    const nextFabric = nextState.fabricAllocations.find(
      (allocation) => allocation.allocationId === nextAllocationId,
    )?.fabricCode;
    return nextAllocationId !== allocationId || nextFabric !== previousFabric;
  });
  if (othersMoved || !after.has(parentGarmentKey)) {
    return {
      status: "blocked",
      reason: "That fabric could not be assigned to this garment. Choose another fabric or cancel.",
    };
  }
  const confirmed = confirmAdditionalGarmentFabricAssignment({
    previousState,
    nextState,
    garmentKey: parentGarmentKey,
    fabricCode,
  });
  if (confirmed.status !== "assigned") {
    return { status: "blocked", reason: confirmed.reason };
  }
  return { status: "assigned", fabricAllocationState: confirmed.state };
};
