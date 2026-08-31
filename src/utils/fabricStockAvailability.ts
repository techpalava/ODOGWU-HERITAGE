import type { Fabric, FabricAllocationState } from "../types";
import {
  getFabricStockPresentation,
  type FabricStockPresentation,
} from "./fabricStockPresentation";

export const isAuthoritativeNumericFabricStock = (
  stock: unknown,
): stock is number =>
  typeof stock === "number" &&
  Number.isFinite(stock) &&
  Number.isInteger(stock) &&
  stock >= 0;

/**
 * Non-empty physical Fabric allocations for one catalogue product code.
 * Each allocation ID counts separately even when fabricCode repeats.
 */
export const getFabricPhysicalAllocationCount = (
  state: FabricAllocationState,
  fabricCode: string,
): number =>
  state.fabricAllocations.filter(
    (allocation) =>
      allocation.fabricCode === fabricCode &&
      allocation.garmentAssignments.length > 0,
  ).length;

export const getFabricRemainingPhysicalStock = (
  fabric: Pick<Fabric, "code" | "stock">,
  state: FabricAllocationState,
): number | null => {
  if (!isAuthoritativeNumericFabricStock(fabric.stock)) {
    return null;
  }
  const used = getFabricPhysicalAllocationCount(state, fabric.code);
  return Math.max(0, fabric.stock - used);
};

export const canCreatePhysicalFabricAllocationForStock = ({
  fabric,
  state,
}: {
  fabric: Pick<Fabric, "code" | "stock" | "stockStatus">;
  state: FabricAllocationState;
}): boolean => {
  if (fabric.stockStatus === "HIDDEN" || fabric.stockStatus === "OUT_OF_STOCK") {
    return false;
  }
  if (!isAuthoritativeNumericFabricStock(fabric.stock)) {
    return true;
  }
  if (fabric.stock === 0) {
    return false;
  }
  return getFabricPhysicalAllocationCount(state, fabric.code) < fabric.stock;
};

export const validateProjectedFabricStock = ({
  fabric,
  afterState,
}: {
  fabric: Pick<Fabric, "code" | "stock" | "stockStatus">;
  beforeState: FabricAllocationState;
  afterState: FabricAllocationState;
}):
  | { valid: true }
  | { valid: false; reason: "FABRIC_STOCK_EXHAUSTED" } => {
  if (!isAuthoritativeNumericFabricStock(fabric.stock)) {
    return { valid: true };
  }
  const afterCount = getFabricPhysicalAllocationCount(afterState, fabric.code);
  if (afterCount <= fabric.stock) {
    return { valid: true };
  }
  return { valid: false, reason: "FABRIC_STOCK_EXHAUSTED" };
};

export const formatFabricStockExhaustedCopy = (): string =>
  "No additional stock is available for this Fabric.";

export const formatFabricStockFullyUsedCopy = (): string =>
  "This Fabric is already fully used and no additional stock is available.";

export const formatFabricStockOverAllocatedCopy = (
  fabricName: string,
  used: number,
  stock: number,
): string => {
  const selectionLabel =
    used === 1 ? "Fabric Selection" : "Fabric Selections";
  const stockVerb = stock === 1 ? "is" : "are";
  return `${fabricName} has ${used} ${selectionLabel}, but only ${stock} ${stockVerb} in stock. Remove or change a Fabric Selection.`;
};

export interface FabricStockOverAllocationSummary {
  fabricCode: string;
  fabricName: string;
  used: number;
  stock: number;
}

export const getFabricStockOverAllocations = (
  fabrics: readonly Fabric[],
  state: FabricAllocationState,
): FabricStockOverAllocationSummary[] =>
  fabrics.flatMap((fabric) => {
    if (!isAuthoritativeNumericFabricStock(fabric.stock)) {
      return [];
    }
    const used = getFabricPhysicalAllocationCount(state, fabric.code);
    return used > fabric.stock
      ? [{ fabricCode: fabric.code, fabricName: fabric.name, used, stock: fabric.stock }]
      : [];
  });

export const resolveFabricFromCatalogue = (
  fabricCode: string,
  fabrics?: readonly Fabric[],
): Fabric | undefined => fabrics?.find((candidate) => candidate.code === fabricCode);

export const getOrderAwareFabricStockPresentation = (
  fabric: Pick<Fabric, "code" | "stock" | "stockStatus">,
  state: FabricAllocationState,
): FabricStockPresentation => {
  if (fabric.stockStatus === "HIDDEN") {
    return { visible: false, status: "HIDDEN" };
  }
  if (fabric.stockStatus === "OUT_OF_STOCK") {
    return {
      visible: true,
      status: "OUT_OF_STOCK",
      label: "Out of Stock",
      tone: "out_of_stock",
    };
  }
  if (!isAuthoritativeNumericFabricStock(fabric.stock)) {
    return getFabricStockPresentation(fabric);
  }
  if (fabric.stock === 0) {
    return {
      visible: true,
      status: "OUT_OF_STOCK",
      label: "Out of Stock",
      tone: "out_of_stock",
    };
  }
  const remaining = getFabricRemainingPhysicalStock(fabric, state)!;
  if (remaining === 0) {
    return {
      visible: true,
      status: "OUT_OF_STOCK",
      label: "Out of Stock",
      tone: "out_of_stock",
    };
  }
  if (remaining <= 2 || fabric.stockStatus === "LOW_STOCK") {
    return {
      visible: true,
      status: "LOW_STOCK",
      label: `Low Stock: ${remaining}`,
      tone: "low_stock",
    };
  }
  return {
    visible: true,
    status: "IN_STOCK",
    label: `In Stock: ${remaining}`,
    tone: "in_stock",
  };
};

export const getFabricNewAllocationStockConstraintMessage = (
  fabric: Fabric,
  state: FabricAllocationState,
  allowExistingPartialReuse = false,
): string | null => {
  if (fabric.stockStatus === "HIDDEN" || fabric.stockStatus === "OUT_OF_STOCK") {
    return null;
  }
  if (!isAuthoritativeNumericFabricStock(fabric.stock)) {
    return null;
  }
  if (fabric.stock === 0) {
    return "Currently out of stock.";
  }
  if (canCreatePhysicalFabricAllocationForStock({ fabric, state })) {
    return null;
  }
  if (allowExistingPartialReuse) {
    return null;
  }
  return formatFabricStockExhaustedCopy();
};
