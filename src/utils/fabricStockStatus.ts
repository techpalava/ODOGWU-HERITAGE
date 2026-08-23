import type { Fabric } from "../types.js";

/** Admin + automatic sale inventory share this low-stock threshold. */
export const FABRIC_LOW_STOCK_THRESHOLD = 5;

export const SELLABLE_FABRIC_STOCK_STATUSES = [
  "IN_STOCK",
  "LOW_STOCK",
] as const;

export const KNOWN_FABRIC_STOCK_STATUSES = [
  "IN_STOCK",
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "HIDDEN",
] as const;

export type KnownFabricStockStatus =
  (typeof KNOWN_FABRIC_STOCK_STATUSES)[number];

export const isKnownFabricStockStatus = (
  status: unknown,
): status is KnownFabricStockStatus =>
  typeof status === "string" &&
  (KNOWN_FABRIC_STOCK_STATUSES as readonly string[]).includes(status);

export const isSellableFabricStockStatus = (
  status: unknown,
): status is (typeof SELLABLE_FABRIC_STOCK_STATUSES)[number] =>
  typeof status === "string" &&
  (SELLABLE_FABRIC_STOCK_STATUSES as readonly string[]).includes(status);

/**
 * Derive customer-facing stockStatus from numeric inventory.
 *
 * HIDDEN is preserved: automatic restock / sales must not unhide a fabric.
 * Admin must explicitly clear HIDDEN to make a fabric visible again.
 *
 * Callers must reject unknown/malformed status before sale; this helper never
 * treats unknown status as sellable.
 */
export const deriveFabricStockStatus = (
  stock: number,
  currentStatus?: Fabric["stockStatus"] | null,
): Fabric["stockStatus"] => {
  if (currentStatus === "HIDDEN") {
    return "HIDDEN";
  }
  if (stock <= 0) {
    return "OUT_OF_STOCK";
  }
  if (stock <= FABRIC_LOW_STOCK_THRESHOLD) {
    return "LOW_STOCK";
  }
  return "IN_STOCK";
};

/** Finite non-negative integer inventory count required for automatic sales. */
export const isValidFabricInventoryStock = (stock: unknown): stock is number =>
  typeof stock === "number" &&
  Number.isFinite(stock) &&
  Number.isInteger(stock) &&
  stock >= 0;
