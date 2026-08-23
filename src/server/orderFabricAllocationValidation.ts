import { FabricCapacityEngine } from "../engine/FabricCapacityEngine.js";
import {
  FABRIC_GARMENT_CAPACITY_UNITS,
  getStyleBaseFabricCapacityComposition,
} from "../config/StyleFabricCapacityConfig.js";
import type {
  FabricAllocation,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentType,
  MasterOrder,
  StyleCategory,
} from "../types.js";

export class OrderFabricAllocationValidationError extends Error {
  readonly code = "INVALID_ORDER_ALLOCATION" as const;

  constructor(message: string) {
    super(message);
    this.name = "OrderFabricAllocationValidationError";
  }
}

const GARMENT_TYPES = new Set<string>(
  Object.keys(FABRIC_GARMENT_CAPACITY_UNITS),
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const countByType = (
  items: ReadonlyArray<{ garmentType: FabricGarmentType }>,
): Map<FabricGarmentType, number> => {
  const counts = new Map<FabricGarmentType, number>();
  for (const item of items) {
    counts.set(item.garmentType, (counts.get(item.garmentType) ?? 0) + 1);
  }
  return counts;
};

const mapsEqual = (
  left: Map<FabricGarmentType, number>,
  right: Map<FabricGarmentType, number>,
): boolean => {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
};

const normalizeAssignment = (
  value: unknown,
): FabricGarmentAssignment | null => {
  if (!isRecord(value)) return null;
  const garmentKey =
    typeof value.garmentKey === "string" ? value.garmentKey.trim() : "";
  const code = typeof value.code === "string" ? value.code.trim() : "";
  const garmentType =
    typeof value.garmentType === "string" && GARMENT_TYPES.has(value.garmentType)
      ? (value.garmentType as FabricGarmentType)
      : null;
  const fabricUnits = value.fabricUnits;
  if (
    !garmentKey ||
    !code ||
    !garmentType ||
    (fabricUnits !== 1 && fabricUnits !== 2)
  ) {
    return null;
  }

  const assignment: FabricGarmentAssignment = {
    garmentKey,
    code,
    garmentType,
    fabricUnits,
  };

  if (typeof value.sourceRole === "string") {
    if (value.sourceRole !== "main" && value.sourceRole !== "additional") {
      return null;
    }
    assignment.sourceRole = value.sourceRole;
  }
  if (typeof value.mainGarmentKey === "string" && value.mainGarmentKey) {
    assignment.mainGarmentKey = value.mainGarmentKey;
  }
  if (
    typeof value.mainGarmentType === "string" &&
    GARMENT_TYPES.has(value.mainGarmentType)
  ) {
    assignment.mainGarmentType = value.mainGarmentType as FabricGarmentType;
  }
  if (typeof value.dependencyStatus === "string") {
    if (
      value.dependencyStatus !== "valid" &&
      value.dependencyStatus !== "orphaned"
    ) {
      return null;
    }
    assignment.dependencyStatus = value.dependencyStatus;
  }
  if (typeof value.eligibilityRule === "string") {
    assignment.eligibilityRule =
      value.eligibilityRule as FabricGarmentAssignment["eligibilityRule"];
  }

  if (
    assignment.sourceRole === "additional" &&
    !assignment.mainGarmentType &&
    assignment.eligibilityRule !== "demographic_policy" &&
    assignment.eligibilityRule !== "catalog_all"
  ) {
    return null;
  }

  return assignment;
};

const inspectAllocations = (order: MasterOrder): FabricAllocation[] => {
  if (!Array.isArray(order.fabricAllocations)) {
    throw new OrderFabricAllocationValidationError(
      "Fabric allocations are required for deposit confirmation.",
    );
  }
  if (order.fabricAllocations.length === 0) {
    throw new OrderFabricAllocationValidationError(
      "Empty Fabric allocations cannot be confirmed.",
    );
  }

  const normalized: FabricAllocation[] = [];
  for (const raw of order.fabricAllocations) {
    if (!isRecord(raw)) {
      throw new OrderFabricAllocationValidationError(
        "Fabric allocations are malformed and cannot be confirmed.",
      );
    }
    const allocationId =
      typeof raw.allocationId === "string" ? raw.allocationId.trim() : "";
    const fabricCode =
      typeof raw.fabricCode === "string" ? raw.fabricCode.trim() : "";
    if (!allocationId || !fabricCode || !Array.isArray(raw.garmentAssignments)) {
      throw new OrderFabricAllocationValidationError(
        "Fabric allocations are malformed and cannot be confirmed.",
      );
    }
    const garmentAssignments: FabricGarmentAssignment[] = [];
    for (const rawAssignment of raw.garmentAssignments) {
      const normalizedAssignment = normalizeAssignment(rawAssignment);
      if (!normalizedAssignment) {
        throw new OrderFabricAllocationValidationError(
          "Fabric allocations are malformed and cannot be confirmed.",
        );
      }
      garmentAssignments.push(normalizedAssignment);
    }
    normalized.push({ allocationId, fabricCode, garmentAssignments });
  }
  return normalized;
};

/**
 * Resolve required main composition from TRUSTED style / uploaded composition.
 * Catalogue styles must come from server-loaded style records — never from a
 * fabricated client composition copy.
 */
export const resolveTrustedRequiredMainComposition = (
  order: MasterOrder,
  trustedStyle?: StyleCategory | null,
): FabricCapacityGarmentSpec[] => {
  const designSource = order.orderDesignSource;
  if (
    designSource &&
    designSource.kind === "uploaded" &&
    Array.isArray(designSource.fabricCapacityComposition) &&
    designSource.fabricCapacityComposition.length > 0
  ) {
    for (const spec of designSource.fabricCapacityComposition) {
      if (!GARMENT_TYPES.has(spec.garmentType)) {
        throw new OrderFabricAllocationValidationError(
          `Uploaded composition includes unsupported garment type ${spec.garmentType}.`,
        );
      }
      if (spec.fabricUnits !== FABRIC_GARMENT_CAPACITY_UNITS[spec.garmentType]) {
        throw new OrderFabricAllocationValidationError(
          `Uploaded composition has invalid capacity units for ${spec.garmentType}.`,
        );
      }
    }
    return designSource.fabricCapacityComposition.map((spec) => ({ ...spec }));
  }

  if (trustedStyle) {
    return getStyleBaseFabricCapacityComposition(trustedStyle).map((spec) => ({
      ...spec,
    }));
  }

  if (order.style) {
    // Catalogue path must supply trustedStyle from Firestore. Reject relying on
    // a client-embedded style composition alone.
    throw new OrderFabricAllocationValidationError(
      "Catalogue style composition must be loaded from the trusted style catalogue.",
    );
  }

  throw new OrderFabricAllocationValidationError(
    "Order does not include a canonical Fabric capacity composition.",
  );
};

export const validateMasterOrderFabricAllocationsForDeposit = (
  order: MasterOrder,
  trustedStyle?: StyleCategory | null,
): FabricAllocation[] => {
  const fabricAllocations = inspectAllocations(order);
  const allocationIds = new Set<string>();
  const garmentKeys = new Set<string>();
  const allAssignments: FabricGarmentAssignment[] = [];

  for (const allocation of fabricAllocations) {
    if (allocationIds.has(allocation.allocationId)) {
      throw new OrderFabricAllocationValidationError(
        `Duplicate Fabric allocationId: ${allocation.allocationId}.`,
      );
    }
    allocationIds.add(allocation.allocationId);

    if (allocation.garmentAssignments.length === 0) {
      throw new OrderFabricAllocationValidationError(
        "Fabric allocations without garment assignments are not allowed.",
      );
    }

    const capacity = FabricCapacityEngine.resolveFabricAllocation(allocation);
    if (capacity.status !== "resolved") {
      throw new OrderFabricAllocationValidationError(
        `Fabric allocation ${allocation.allocationId} violates capacity rules.`,
      );
    }

    for (const assignment of allocation.garmentAssignments) {
      if (garmentKeys.has(assignment.garmentKey)) {
        throw new OrderFabricAllocationValidationError(
          `Duplicate garment key across Fabric allocations: ${assignment.garmentKey}.`,
        );
      }
      garmentKeys.add(assignment.garmentKey);

      if (
        assignment.fabricUnits !==
        FABRIC_GARMENT_CAPACITY_UNITS[assignment.garmentType]
      ) {
        throw new OrderFabricAllocationValidationError(
          `Garment ${assignment.garmentKey} has invalid fabric capacity units.`,
        );
      }
      allAssignments.push(assignment);
    }
  }

  const requiredMainComposition = resolveTrustedRequiredMainComposition(
    order,
    trustedStyle,
  );
  const mainAssignments = allAssignments.filter(
    (assignment) => assignment.sourceRole !== "additional",
  );
  const additionalAssignments = allAssignments.filter(
    (assignment) => assignment.sourceRole === "additional",
  );

  if (
    !mapsEqual(
      countByType(requiredMainComposition),
      countByType(mainAssignments),
    )
  ) {
    throw new OrderFabricAllocationValidationError(
      "Fabric allocations do not cover the required physical garments for this order.",
    );
  }

  const mainKeys = new Set(
    mainAssignments.map((assignment) => assignment.garmentKey),
  );
  const mainTypes = new Set(
    requiredMainComposition.map((spec) => spec.garmentType),
  );

  for (const assignment of additionalAssignments) {
    if (assignment.dependencyStatus === "orphaned") {
      throw new OrderFabricAllocationValidationError(
        `Additional garment ${assignment.garmentKey} is orphaned.`,
      );
    }
    if (
      !assignment.mainGarmentKey ||
      !mainKeys.has(assignment.mainGarmentKey)
    ) {
      throw new OrderFabricAllocationValidationError(
        `Additional garment ${assignment.garmentKey} is not attached to a valid main garment.`,
      );
    }
    if (
      assignment.eligibilityRule === "catalog_all" ||
      assignment.eligibilityRule === "demographic_policy"
    ) {
      throw new OrderFabricAllocationValidationError(
        `Additional garment ${assignment.garmentKey} uses untrusted eligibility metadata.`,
      );
    }
    if (
      !mainTypes.has(assignment.garmentType) &&
      assignment.mainGarmentType !== assignment.garmentType
    ) {
      throw new OrderFabricAllocationValidationError(
        `Additional garment ${assignment.garmentKey} is not allowed for this order.`,
      );
    }
  }

  if (
    mainAssignments.length + additionalAssignments.length !==
    allAssignments.length
  ) {
    throw new OrderFabricAllocationValidationError(
      "Unexpected Fabric garment assignment roles were submitted.",
    );
  }

  return fabricAllocations;
};
