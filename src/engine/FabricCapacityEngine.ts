import type {
  FabricAllocation,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentInputAssignment,
  FabricCapacityResolution,
  FabricUnitCount,
  FabricGarmentType,
  FabricGarmentRole,
  AdditionalGarmentDependencyStatus,
  AdditionalGarmentEligibilityRule,
} from "../types";
import { FABRIC_GARMENT_CAPACITY_UNITS } from "../config/StyleFabricCapacityConfig";

type LowerGarmentType = "trousers" | "skirt";

export type AppendableFabricGarmentType = Exclude<
  FabricGarmentType,
  "agbada" | "other"
>;

export interface FabricAppendGarmentChoice {
  id: AppendableFabricGarmentType;
  label: string;
  selection: FabricGarmentInputAssignment;
}

export const FABRIC_GARMENT_LABELS: Record<FabricGarmentType, string> = {
  shirt: "Shirt",
  trouser: "Trouser",
  skirt: "Skirt",
  standard_shorts: "Nikka / Standard Shorts",
  bum_shorts: "Bum Shorts",
  dress: "Dress",
  kaftan: "Kaftan",
  full_length_gown: "Full-length Gown",
  agbada: "Agbada",
  other: "Other Garment",
};

const createAppendGarmentChoice = (
  garmentType: AppendableFabricGarmentType,
): FabricAppendGarmentChoice => ({
  id: garmentType,
  label: FABRIC_GARMENT_LABELS[garmentType],
  selection: {
    code: `APPEND_${garmentType.toUpperCase()}`,
    garmentSpec: {
      key: `append:${garmentType}`,
      garmentType,
      fabricUnits: FABRIC_GARMENT_CAPACITY_UNITS[garmentType],
    },
  },
});

export const FABRIC_APPEND_GARMENT_CHOICES: readonly FabricAppendGarmentChoice[] = [
  createAppendGarmentChoice("shirt"),
  createAppendGarmentChoice("trouser"),
  createAppendGarmentChoice("skirt"),
  createAppendGarmentChoice("standard_shorts"),
  createAppendGarmentChoice("bum_shorts"),
  createAppendGarmentChoice("dress"),
  createAppendGarmentChoice("kaftan"),
  createAppendGarmentChoice("full_length_gown"),
];

export const getFabricGarmentLabel = (
  garmentType: FabricGarmentType,
): string => FABRIC_GARMENT_LABELS[garmentType];

/**
 * Customer-facing fabric quantities describe complete fabric allocations, while
 * fabricUnits remain the internal capacity points used to fill those allocations.
 */
export interface CustomerFacingFabricQuantitySummary {
  garmentCount: number;
  capacityUnits: number;
  fabricQuantity: number;
}

export interface AllocatedFabricQuantitySummary
  extends CustomerFacingFabricQuantitySummary {
  allocations: Array<
    CustomerFacingFabricQuantitySummary & {
      allocationId: string;
      fabricCode: string;
    }
  >;
}

export const getCustomerFacingFabricQuantityForAssignments = (
  assignments: readonly FabricGarmentAssignment[],
): CustomerFacingFabricQuantitySummary => {
  const capacityUnits = assignments.reduce(
    (total, assignment) => total + assignment.fabricUnits,
    0,
  );

  return {
    garmentCount: assignments.length,
    capacityUnits,
    fabricQuantity:
      capacityUnits === 0
        ? 0
        : Math.ceil(capacityUnits / FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION),
  };
};

export const getCustomerFacingFabricQuantityForAllocations = (
  fabricAllocations: readonly FabricAllocation[],
): AllocatedFabricQuantitySummary => {
  const allocations = fabricAllocations
    .filter((allocation) => allocation.garmentAssignments.length > 0)
    .map((allocation) => ({
      ...getCustomerFacingFabricQuantityForAssignments(
        allocation.garmentAssignments,
      ),
      allocationId: allocation.allocationId,
      fabricCode: allocation.fabricCode,
    }));

  return {
    garmentCount: allocations.reduce(
      (total, allocation) => total + allocation.garmentCount,
      0,
    ),
    capacityUnits: allocations.reduce(
      (total, allocation) => total + allocation.capacityUnits,
      0,
    ),
    fabricQuantity: allocations.reduce(
      (total, allocation) => total + allocation.fabricQuantity,
      0,
    ),
    allocations,
  };
};

const LOWER_GARMENT_REQUIRED_CODES = new Set(["L6", "L7"]);
const DRESS_WITH_LOWER_REQUIRED_CODES = new Set(["L8.1", "L8.2", "L9.1", "L9.2"]);

export class FabricCapacityEngine {
  static readonly MAX_UNITS_PER_ALLOCATION = 2;

  static resolveFabricAllocation(
    allocation: FabricAllocation,
  ): FabricCapacityResolution {
    let totalUnits = 0;

    for (const assignment of allocation.garmentAssignments) {
      const usedUnitsBeforeAttempt = totalUnits;
      const attemptedUnits = assignment.fabricUnits;
      if (usedUnitsBeforeAttempt + attemptedUnits > this.MAX_UNITS_PER_ALLOCATION) {
        return {
          status: "capacity_exceeded",
          allocationId: allocation.allocationId,
          usedUnitsBeforeAttempt,
          attemptedUnits,
          maxUnits: this.MAX_UNITS_PER_ALLOCATION,
          attemptedGarment: assignment,
        };
      }

      totalUnits += attemptedUnits;
    }

    return {
      status: "resolved",
      garments: [...allocation.garmentAssignments],
      totalUnits,
    };
  }

  static resolveGarmentAssignment(
    assignment: FabricGarmentInputAssignment,
  ):
    | { status: "resolved"; assignments: FabricGarmentAssignment[] }
    | { status: "unclassified"; reason: string; garmentCode?: string } {
    if (assignment.garmentSpec) {
      return this.resolveExplicitSpec(
        assignment.garmentSpec,
        assignment.code,
        assignment.lowerGarmentType,
        assignment,
      );
    }

    const code = assignment.code;
    const lowerGarmentType = assignment.lowerGarmentType;

    switch (code) {
      case "G1":
      case "G2":
        return {
          status: "resolved",
          assignments: [
            this.createPhysicalAssignment(code, "shirt", 1, lowerGarmentType),
          ],
        };
      case "G3":
        return {
          status: "resolved",
          assignments: [
            this.createPhysicalAssignment(code, "standard_shorts", 1, lowerGarmentType),
          ],
        };
      case "G4":
        return {
          status: "resolved",
          assignments: [
            this.createPhysicalAssignment(code, "trouser", 1, lowerGarmentType),
          ],
        };
      case "G5.1":
      case "G6.1":
        return {
          status: "resolved",
          assignments: [
            this.createPhysicalAssignment(code, "shirt", 1, lowerGarmentType),
            this.createPhysicalAssignment(code, "standard_shorts", 1, lowerGarmentType),
          ],
        };
      case "G5.2":
      case "G6.2":
        return {
          status: "resolved",
          assignments: [
            this.createPhysicalAssignment(code, "shirt", 1, lowerGarmentType),
            this.createPhysicalAssignment(code, "trouser", 1, lowerGarmentType),
          ],
        };
      case "L1":
      case "L2":
      case "L3":
      case "L4":
        return {
          status: "resolved",
          assignments: [
            this.createPhysicalAssignment(code, "dress", 1, lowerGarmentType),
          ],
        };
      case "L6":
      case "L7": {
        if (lowerGarmentType === "trousers") {
          return {
            status: "resolved",
            assignments: [
              this.createPhysicalAssignment(code, "trouser", 1, lowerGarmentType),
            ],
          };
        }
        if (lowerGarmentType === "skirt") {
          return {
            status: "resolved",
            assignments: [
              this.createPhysicalAssignment(code, "skirt", 1, lowerGarmentType),
            ],
          };
        }
        return {
          status: "unclassified",
          reason: `${code} requires lowerGarmentType trousers or skirt`,
          garmentCode: code,
        };
      }
      case "L8.1":
      case "L8.2":
      case "L9.1":
      case "L9.2": {
        if (lowerGarmentType === "trousers") {
          return {
            status: "resolved",
            assignments: [
              this.createPhysicalAssignment(code, "dress", 1, lowerGarmentType),
              this.createPhysicalAssignment(code, "trouser", 1, lowerGarmentType),
            ],
          };
        }
        if (lowerGarmentType === "skirt") {
          return {
            status: "resolved",
            assignments: [
              this.createPhysicalAssignment(code, "dress", 1, lowerGarmentType),
              this.createPhysicalAssignment(code, "skirt", 1, lowerGarmentType),
            ],
          };
        }
        return {
          status: "unclassified",
          reason: `${code} requires lowerGarmentType trousers or skirt`,
          garmentCode: code,
        };
      }
      default:
        return {
          status: "unclassified",
          reason: `unknown garment code ${code}`,
          garmentCode: code,
        };
    }
  }

  private static createPhysicalAssignment(
    originalCode: string,
    garmentType: FabricGarmentType,
    fabricUnits: FabricUnitCount,
    lowerGarmentType?: LowerGarmentType,
    garmentSpec?: FabricCapacityGarmentSpec,
    garmentKey?: string,
    sourceRole?: FabricGarmentRole,
    mainGarmentKey?: string,
    mainGarmentType?: FabricGarmentType,
    eligibilityRule?: AdditionalGarmentEligibilityRule,
    dependencyStatus?: AdditionalGarmentDependencyStatus,
  ): FabricGarmentAssignment {
    return {
      garmentKey: garmentKey ?? `${originalCode}:${garmentType}`,
      code: originalCode,
      garmentType,
      fabricUnits,
      lowerGarmentType,
      garmentSpec,
      ...(sourceRole ? { sourceRole } : {}),
      ...(mainGarmentKey ? { mainGarmentKey } : {}),
      ...(mainGarmentType ? { mainGarmentType } : {}),
      ...(eligibilityRule ? { eligibilityRule } : {}),
      ...(dependencyStatus ? { dependencyStatus } : {}),
    };
  }

  private static resolveExplicitSpec(
    spec: FabricCapacityGarmentSpec,
    requestedCode: string,
    requestedLowerGarmentType?: LowerGarmentType,
    metadata?: Pick<
      FabricGarmentInputAssignment,
      | "sourceRole"
      | "mainGarmentKey"
      | "mainGarmentType"
      | "eligibilityRule"
      | "dependencyStatus"
    >,
  ):
    | { status: "resolved"; assignments: FabricGarmentAssignment[] }
    | { status: "unclassified"; reason: string; garmentCode?: string } {
    const lowerGarmentType = requestedLowerGarmentType ?? spec.lowerGarmentType;

    const expectedFabricUnits = FABRIC_GARMENT_CAPACITY_UNITS[spec.garmentType];
    if (spec.fabricUnits !== expectedFabricUnits) {
      return {
        status: "unclassified",
        reason: `${spec.garmentType} explicit metadata must resolve to ${expectedFabricUnits} fabric ${expectedFabricUnits === 1 ? "unit" : "units"}`,
        garmentCode: requestedCode,
      };
    }

    if (spec.fabricUnits !== 1 && spec.fabricUnits !== 2) {
      return {
        status: "unclassified",
        reason: `explicit garment metadata for ${requestedCode} must specify 1 or 2 units`,
        garmentCode: requestedCode,
      };
    }

    if (LOWER_GARMENT_REQUIRED_CODES.has(spec.key) || DRESS_WITH_LOWER_REQUIRED_CODES.has(spec.key)) {
      if (lowerGarmentType !== "trousers" && lowerGarmentType !== "skirt") {
        return {
          status: "unclassified",
          reason: `${spec.key} requires lowerGarmentType trousers or skirt`,
          garmentCode: requestedCode,
        };
      }
    }

    return {
      status: "resolved",
      assignments: [
        this.createPhysicalAssignment(
          requestedCode,
          spec.garmentType,
          spec.fabricUnits,
          lowerGarmentType,
          spec,
          spec.key,
          metadata?.sourceRole,
          metadata?.mainGarmentKey,
          metadata?.mainGarmentType,
          metadata?.eligibilityRule,
          metadata?.dependencyStatus,
        ),
      ],
    };
  }
}
