import {
  CustomDetailGarmentContext,
  DesignSelections,
  Fabric,
  FabricAllocation,
  FabricGarmentAssignment,
  StyleCategory,
} from "../types";
import { getSupportedCustomDetailGroupResolution } from "../utils/catalogHelpers";

export type FabricCapacityClass =
  | "standard"
  | "full_fabric"
  | "unclassified";

export interface GarmentFabricRule {
  fabricUnits: 1 | 2;
  capacityClass: FabricCapacityClass;
}

export const MAXIMUM_ALLOCATION_CAPACITY_UNITS = 2;

/**
 * FabricCapacityEngine authoritatively resolves fabric units, manages fabric allocations,
 * and enforces maximum capacity rules per fabric allocation.
 *
 * Business Rules:
 * - 1 Fabric Allocation = Maximum 2 Fabric Units.
 * - Standard Garments (Shirt, Trouser, Skirt, Nikka, Standard Shorts, Bum Shorts, Standard Dress) = 1 Unit.
 * - Long-sleeve Shirts remain 1 Unit.
 * - Long Trousers remain 1 Unit.
 * - Ankle-length Skirts remain 1 Unit.
 * - Full-Fabric Garments (Kaftan, Full-length Gown) = 2 Units.
 */
export class FabricCapacityEngine {
  /**
   * Resolves authoritative fabric capacity rule for a garment group or style context.
   */
  static getGarmentFabricRule(
    garmentGroup: string,
    style?: StyleCategory | null,
    garmentCode?: string
  ): GarmentFabricRule {
    const groupLower = (garmentGroup || "").toLowerCase();
    const styleIdLower = (style?.id || "").toLowerCase();
    const styleNameLower = (style?.name || "").toLowerCase();
    const codeLower = (garmentCode || "").toLowerCase();

    // 1. Explicit Full-Fabric Garments (2 Units): Kaftan & Full-length Gown
    if (
      groupLower === "kaftan" ||
      codeLower.includes("kaftan") ||
      styleIdLower.includes("kaftan") ||
      styleNameLower.includes("kaftan")
    ) {
      return { fabricUnits: 2, capacityClass: "full_fabric" };
    }

    if (
      codeLower.includes("gown_full") ||
      codeLower.includes("maxi_gown") ||
      styleIdLower === "maxi-gown" ||
      styleIdLower === "full-length-gown" ||
      (style?.tags && style.tags.includes("full_length_gown"))
    ) {
      return { fabricUnits: 2, capacityClass: "full_fabric" };
    }

    // 2. Explicit Standard Garments (1 Unit): Shirt, Trouser, Skirt, Shorts, Nikka, Standard Dress
    if (
      groupLower === "shirt" ||
      groupLower === "trousers" ||
      groupLower === "trouser" ||
      groupLower === "skirt" ||
      groupLower === "skirts" ||
      groupLower === "standard_shorts" ||
      groupLower === "bum_shorts" ||
      groupLower === "nikka" ||
      groupLower === "nikka_shorts" ||
      groupLower === "dress" ||
      groupLower === "standard_dress"
    ) {
      return { fabricUnits: 1, capacityClass: "standard" };
    }

    // 3. Zero-unit details (neck, personalized, etc.)
    if (groupLower === "neck" || groupLower === "personalized") {
      return { fabricUnits: 1, capacityClass: "unclassified" }; // Default fallback 1 if unknown, but neck handled in caller
    }

    // Fallback for unclassified garments
    return { fabricUnits: 1, capacityClass: "unclassified" };
  }

  /**
   * Calculates total fabric units required for the given design selections and quantity.
   */
  static calculateFabricUnits(
    style: StyleCategory | null,
    garment: CustomDetailGarmentContext | null,
    designSelections: DesignSelections,
    quantity: number = 1
  ): number {
    if (!style) return 0;
    const resolution = getSupportedCustomDetailGroupResolution(style, garment);
    const groups = resolution.groups;

    let baseUnits = 0;

    for (const group of groups) {
      if (group === "neck" || group === "personalized") {
        continue; // Zero fabric units for non-garment detail groups
      }
      const rule = this.getGarmentFabricRule(group, style, garment?.code);
      baseUnits += rule.fabricUnits;
    }

    const custom = designSelections.customDetails || {};
    const getOptions = (val: unknown): string[] => (Array.isArray(val) ? val : typeof val === "string" ? [val] : []);
    const shirtAdditional = getOptions(custom.shirt_additional || (designSelections as any).shirt_additional);
    const trouserAdditional = getOptions(custom.trouser_additional || (designSelections as any).trouser_additional);
    const skirtAdditional = getOptions(custom.skirt_additional || (designSelections as any).skirt_additional);
    const shortsAdditional = getOptions(custom.standard_shorts_additional || (designSelections as any).standard_shorts_additional);

    // Helper for additional clothes option checks
    const checkExtraGarments = (optionIds: string[]) => {
      let extra = 0;
      for (const id of optionIds) {
        if (id.includes("add_trouser") || id.includes("add_shirt") || id.includes("extra_garment")) {
          extra += 1;
        }
      }
      return extra;
    };

    baseUnits += checkExtraGarments([...shirtAdditional, ...trouserAdditional, ...skirtAdditional, ...shortsAdditional]);

    const safeQuantity = Math.max(1, Math.floor(quantity));
    return baseUnits * safeQuantity;
  }

  /**
   * Calculates how many fabric allocations are required for the given total fabric units.
   */
  static calculateRequiredAllocations(fabricUnits: number): number {
    if (fabricUnits <= 0) return 1;
    return Math.max(1, Math.ceil(fabricUnits / MAXIMUM_ALLOCATION_CAPACITY_UNITS));
  }

  /**
   * Factory function to create a new Fabric Allocation entity.
   */
  static createFabricAllocation(
    id: string,
    fabric: Fabric,
    garmentAssignments: FabricGarmentAssignment[] = []
  ): FabricAllocation {
    const allocation: FabricAllocation = {
      id,
      fabric,
      garmentAssignments: [...garmentAssignments],
    };
    allocation.unitsConsumed = this.getAllocationUsedUnits(allocation);
    return allocation;
  }

  /**
   * Calculates the used units in a single allocation.
   */
  static getAllocationUsedUnits(allocation: FabricAllocation): number {
    if (!allocation.garmentAssignments || allocation.garmentAssignments.length === 0) {
      return 0;
    }
    return allocation.garmentAssignments.reduce((total, assignment) => {
      const q = assignment.quantity || 1;
      return total + assignment.fabricUnits * q;
    }, 0);
  }

  /**
   * Calculates remaining capacity units in an allocation.
   */
  static getAllocationRemainingUnits(allocation: FabricAllocation): number {
    return Math.max(0, MAXIMUM_ALLOCATION_CAPACITY_UNITS - this.getAllocationUsedUnits(allocation));
  }

  /**
   * Checks if an allocation can accommodate the additional units needed.
   */
  static canAssignToAllocation(
    allocation: FabricAllocation,
    unitsNeeded: number
  ): boolean {
    return this.getAllocationRemainingUnits(allocation) >= unitsNeeded;
  }

  /**
   * Assigns a garment assignment to an allocation.
   */
  static assignGarmentToAllocation(
    allocation: FabricAllocation,
    assignment: FabricGarmentAssignment
  ): FabricAllocation {
    const updated = {
      ...allocation,
      garmentAssignments: [...allocation.garmentAssignments, assignment],
    };
    updated.unitsConsumed = this.getAllocationUsedUnits(updated);
    return updated;
  }

  /**
   * Automatically distributes garment assignments across fabric allocations.
   */
  static autoDistributeAssignments(
    fabrics: Fabric[],
    assignments: FabricGarmentAssignment[]
  ): FabricAllocation[] {
    if (fabrics.length === 0) return [];

    const allocations: FabricAllocation[] = fabrics.map((fabric, index) => ({
      id: `alloc-${index + 1}`,
      fabric,
      garmentAssignments: [],
      unitsConsumed: 0,
    }));

    let currentAllocIndex = 0;

    for (const assignment of assignments) {
      const needed = (assignment.fabricUnits || 1) * (assignment.quantity || 1);
      
      // Find an allocation with space
      while (
        currentAllocIndex < allocations.length &&
        !this.canAssignToAllocation(allocations[currentAllocIndex], needed)
      ) {
        currentAllocIndex++;
      }

      if (currentAllocIndex < allocations.length) {
        allocations[currentAllocIndex].garmentAssignments.push(assignment);
        allocations[currentAllocIndex].unitsConsumed = this.getAllocationUsedUnits(allocations[currentAllocIndex]);
      } else {
        // If more allocations needed than fabrics provided, append to last allocation
        const last = allocations[allocations.length - 1];
        last.garmentAssignments.push(assignment);
        last.unitsConsumed = this.getAllocationUsedUnits(last);
      }
    }

    return allocations;
  }

  /**
   * Normalizes fabric allocations for backward compatibility.
   * Transforms legacy `fabric: Fabric` + `additionalFabrics?: Fabric[]` into `FabricAllocation[]`.
   */
  static normalizeFabricAllocations(item: {
    fabric?: Fabric;
    additionalFabrics?: Fabric[];
    fabricAllocations?: FabricAllocation[] | null;
    style?: StyleCategory | null;
    garment?: CustomDetailGarmentContext | null;
    design?: DesignSelections;
    quantity?: number;
  }): FabricAllocation[] {
    // If structured allocations exist and are non-empty, use them
    if (item.fabricAllocations && item.fabricAllocations.length > 0) {
      return item.fabricAllocations.map((alloc, idx) => ({
        ...alloc,
        id: alloc.id || `alloc-${idx + 1}`,
        unitsConsumed: this.getAllocationUsedUnits(alloc),
      }));
    }

    // Build fallback allocations list from primary fabric + additionalFabrics
    const fabrics: Fabric[] = [];
    if (item.fabric) fabrics.push(item.fabric);
    if (item.additionalFabrics && item.additionalFabrics.length > 0) {
      fabrics.push(...item.additionalFabrics);
    }

    if (fabrics.length === 0) return [];

    // Derive garment assignments if style context is available
    const assignments: FabricGarmentAssignment[] = [];
    if (item.style && item.design) {
      const resolution = getSupportedCustomDetailGroupResolution(item.style, item.garment || null);
      for (const group of resolution.groups) {
        if (group === "neck" || group === "personalized") continue;
        const rule = this.getGarmentFabricRule(group, item.style, item.garment?.code);
        assignments.push({
          id: `asgn-${group}`,
          garmentGroup: group,
          garmentCode: item.garment?.code,
          fabricUnits: rule.fabricUnits,
        });
      }
    }

    return this.autoDistributeAssignments(fabrics, assignments);
  }
}
