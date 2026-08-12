import type {
  CartItem,
  Fabric,
  FabricAllocation,
  FabricAllocationState,
} from "../types";
import { getFabricSewingCost, resolveFabricPrice } from "./fabricPricing";
import { roundMoney } from "./money";
import { inspectCartItemFabricAllocations } from "./fabricAllocationPersistence";

export type FabricAllocationPricingUnresolvedReason =
  | "NO_FABRIC_ALLOCATIONS"
  | "INVALID_MODERN_ALLOCATIONS"
  | "FABRIC_NOT_FOUND"
  | "FABRIC_PRICE_UNAVAILABLE";

export interface FabricAllocationMaterialLine {
  allocationId: string;
  fabricCode: string;
  materialPrice: number;
  fabric: Fabric;
}

export interface ResolvedFabricAllocationPricing {
  status: "resolved";
  source: "modern" | "legacy";
  allocationLines: FabricAllocationMaterialLine[];
  allocationCount: number;
  baseFabric: Fabric;
  baseMaterialPrice: number;
  additionalMaterialPrice: number;
  totalMaterialPrice: number;
  baseFabricSewingCost: number;
}

export interface UnresolvedFabricAllocationPricing {
  status: "unresolved";
  reason: FabricAllocationPricingUnresolvedReason;
  allocationId?: string;
  fabricCode?: string;
  fabricName?: string;
}

export type FabricAllocationPricingResult =
  | ResolvedFabricAllocationPricing
  | UnresolvedFabricAllocationPricing;

const resolveMaterialLine = (
  allocation: FabricAllocation,
  fabrics: Fabric[],
): FabricAllocationMaterialLine | UnresolvedFabricAllocationPricing => {
  const fabric = fabrics.find(
    (candidate) => candidate.code === allocation.fabricCode,
  );
  if (!fabric) {
    return {
      status: "unresolved",
      reason: "FABRIC_NOT_FOUND",
      allocationId: allocation.allocationId,
      fabricCode: allocation.fabricCode,
    };
  }
  const materialPrice = resolveFabricPrice(fabric);
  if (materialPrice === null) {
    return {
      status: "unresolved",
      reason: "FABRIC_PRICE_UNAVAILABLE",
      allocationId: allocation.allocationId,
      fabricCode: allocation.fabricCode,
      fabricName: fabric.name,
    };
  }

  return {
    allocationId: allocation.allocationId,
    fabricCode: allocation.fabricCode,
    materialPrice,
    fabric,
  };
};

export const resolveFabricAllocationMaterialPricing = (
  fabricAllocations: FabricAllocation[],
  fabrics: Fabric[],
  source: "modern" | "legacy" = "modern",
): FabricAllocationPricingResult => {
  if (fabricAllocations.length === 0) {
    return {
      status: "unresolved",
      reason: "NO_FABRIC_ALLOCATIONS",
    };
  }

  const allocationLines: FabricAllocationMaterialLine[] = [];
  for (const allocation of fabricAllocations) {
    const line = resolveMaterialLine(allocation, fabrics);
    if ("status" in line) {
      return line;
    }
    allocationLines.push(line);
  }

  const baseLine = allocationLines[0];
  const totalMaterialPrice = roundMoney(
    allocationLines.reduce((total, line) => total + line.materialPrice, 0),
  );
  const baseMaterialPrice = roundMoney(baseLine.materialPrice);
  const additionalMaterialPrice = roundMoney(
    totalMaterialPrice - baseMaterialPrice,
  );
  const baseFabricSewingCost = roundMoney(getFabricSewingCost(baseLine.fabric));

  return {
    status: "resolved",
    source,
    allocationLines,
    allocationCount: allocationLines.length,
    baseFabric: baseLine.fabric,
    baseMaterialPrice,
    additionalMaterialPrice,
    totalMaterialPrice,
    baseFabricSewingCost,
  };
};

export const resolveLegacyFabricMaterialPricing = (
  fabric: Fabric | null,
): FabricAllocationPricingResult => {
  if (!fabric) {
    return {
      status: "unresolved",
      reason: "FABRIC_NOT_FOUND",
    };
  }
  const materialPrice = resolveFabricPrice(fabric);
  if (materialPrice === null) {
    return {
      status: "unresolved",
      reason: "FABRIC_PRICE_UNAVAILABLE",
      fabricCode: fabric.code,
      fabricName: fabric.name,
    };
  }

  return {
    status: "resolved",
    source: "legacy",
    allocationLines: [
      {
        allocationId: `legacy-${fabric.code}`,
        fabricCode: fabric.code,
        materialPrice,
        fabric,
      },
    ],
    allocationCount: 1,
    baseFabric: fabric,
    baseMaterialPrice: materialPrice,
    additionalMaterialPrice: 0,
    totalMaterialPrice: materialPrice,
    baseFabricSewingCost: roundMoney(getFabricSewingCost(fabric)),
  };
};

export const resolveCartItemFabricAllocationPricing = (
  item: CartItem,
  fabrics: Fabric[],
): FabricAllocationPricingResult => {
  const inspection = inspectCartItemFabricAllocations(item);
  if (inspection.status === "valid") {
    return resolveFabricAllocationMaterialPricing(
      inspection.fabricAllocations,
      fabrics,
      "modern",
    );
  }
  if (inspection.status === "invalid") {
    return {
      status: "unresolved",
      reason: "INVALID_MODERN_ALLOCATIONS",
    };
  }
  const currentFabric = fabrics.find(
    (candidate) => candidate.code === item.fabric.code,
  );
  return resolveLegacyFabricMaterialPricing(currentFabric || null);
};

export const resolveDesignStudioFabricAllocationPricing = ({
  fabricAllocationState,
  fabrics,
  selectedFabric,
  preserveInvalidHydratedModernData,
}: {
  fabricAllocationState: FabricAllocationState;
  fabrics: Fabric[];
  selectedFabric: Fabric | null;
  preserveInvalidHydratedModernData: boolean;
}): FabricAllocationPricingResult => {
  if (preserveInvalidHydratedModernData) {
    return {
      status: "unresolved",
      reason: "INVALID_MODERN_ALLOCATIONS",
    };
  }
  if (fabricAllocationState.fabricAllocations.length > 0) {
    return resolveFabricAllocationMaterialPricing(
      fabricAllocationState.fabricAllocations,
      fabrics,
      "modern",
    );
  }
  if (selectedFabric) {
    return resolveLegacyFabricMaterialPricing(selectedFabric);
  }
  return {
    status: "unresolved",
    reason: "NO_FABRIC_ALLOCATIONS",
  };
};

export const getFabricAllocationPricingErrorMessage = (
  result: FabricAllocationPricingResult,
): string | null => {
  if (result.status === "resolved") return null;
  if (result.reason === "INVALID_MODERN_ALLOCATIONS") {
    return "Review fabric selections before payment.";
  }
  if (result.reason === "FABRIC_PRICE_UNAVAILABLE") {
    return result.fabricName
      ? `Pricing is not configured for ${result.fabricName} (${result.fabricCode}).`
      : "Pricing is not configured for one of your selected fabrics.";
  }
  if (result.reason === "FABRIC_NOT_FOUND") {
    return "The fabric selected for one part of this outfit is no longer available. Please review your fabric selections.";
  }
  return null;
};
