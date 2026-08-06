import type {
  FabricAllocation,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentInputAssignment,
  FabricCapacityResolution,
  FabricUnitCount,
  FabricGarmentType,
} from "../types";

type LowerGarmentType = "trousers" | "skirt";

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
  ): FabricGarmentAssignment {
    return {
      garmentKey: garmentKey ?? `${originalCode}:${garmentType}`,
      code: originalCode,
      garmentType,
      fabricUnits,
      lowerGarmentType,
      garmentSpec,
    };
  }

  private static resolveExplicitSpec(
    spec: FabricCapacityGarmentSpec,
    requestedCode: string,
    requestedLowerGarmentType?: LowerGarmentType,
  ):
    | { status: "resolved"; assignments: FabricGarmentAssignment[] }
    | { status: "unclassified"; reason: string; garmentCode?: string } {
    const lowerGarmentType = requestedLowerGarmentType ?? spec.lowerGarmentType;

    if (spec.garmentType === "kaftan" || spec.garmentType === "full_length_gown") {
      if (spec.fabricUnits !== 2) {
        return {
          status: "unclassified",
          reason: `${spec.garmentType} explicit metadata must resolve to 2 fabric units`,
          garmentCode: requestedCode,
        };
      }
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
        ),
      ],
    };
  }
}
