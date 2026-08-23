import type { Fabric } from "../types";
import {
  computeAvailableStock,
  getFabricReservedStock,
  resolveFabricAvailability,
} from "./fabricInventoryAvailability";

export type FabricStockBadgeTone = "in_stock" | "low_stock" | "out_of_stock";

export type FabricStockPresentation =
  | { visible: false; status: "HIDDEN" }
  | {
      visible: true;
      status: Exclude<Fabric["stockStatus"], "HIDDEN">;
      label: string;
      tone: FabricStockBadgeTone;
      availableStock: number | null;
      reservedStock: number | null;
      stockOnHand: number | null;
    };

const isPositiveFiniteStock = (stock: unknown): stock is number =>
  typeof stock === "number" && Number.isFinite(stock) && stock > 0;

/**
 * Customer-facing stock badge. Quantity and status use availableStock
 * (stock - reservedStock), not raw on-hand stock. Malformed reservedStock
 * fails closed as Out of Stock.
 */
export const getFabricStockPresentation = (
  fabric: Pick<Fabric, "stockStatus" | "stock" | "reservedStock">,
): FabricStockPresentation => {
  const availability = resolveFabricAvailability(fabric);
  const available = availability.availableStock;
  const reservedStock = availability.reservedStock;
  const stockOnHand = availability.stock;

  if (fabric.stockStatus === "HIDDEN" || availability.stockStatus === "HIDDEN") {
    return { visible: false, status: "HIDDEN" };
  }

  if (availability.inventoryCorrupt) {
    return {
      visible: true,
      status: "OUT_OF_STOCK",
      label: "Out of Stock",
      tone: "out_of_stock",
      availableStock: null,
      reservedStock,
      stockOnHand,
    };
  }

  const effectiveStatus =
    available === null
      ? fabric.stockStatus === "OUT_OF_STOCK" ||
        fabric.stockStatus === "LOW_STOCK" ||
        fabric.stockStatus === "IN_STOCK"
        ? fabric.stockStatus
        : "OUT_OF_STOCK"
      : available <= 0
        ? "OUT_OF_STOCK"
        : available <= 5
          ? "LOW_STOCK"
          : "IN_STOCK";

  if (effectiveStatus === "OUT_OF_STOCK") {
    return {
      visible: true,
      status: "OUT_OF_STOCK",
      label: "Out of Stock",
      tone: "out_of_stock",
      availableStock: available,
      reservedStock,
      stockOnHand,
    };
  }
  if (effectiveStatus === "LOW_STOCK") {
    return {
      visible: true,
      status: "LOW_STOCK",
      label: isPositiveFiniteStock(available)
        ? `Low Stock: ${available}`
        : "Low Stock",
      tone: "low_stock",
      availableStock: available,
      reservedStock,
      stockOnHand,
    };
  }
  return {
    visible: true,
    status: "IN_STOCK",
    label: isPositiveFiniteStock(available)
      ? `In Stock: ${available}`
      : "In Stock",
    tone: "in_stock",
    availableStock: available,
    reservedStock,
    stockOnHand,
  };
};

/** Admin catalogue summary: on-hand / reserved / available. */
export const getAdminFabricStockSummary = (
  fabric: Pick<Fabric, "stock" | "reservedStock">,
): {
  stockOnHand: number | null;
  reserved: number | null;
  available: number | null;
} => {
  const stockOnHand =
    typeof fabric.stock === "number" && Number.isFinite(fabric.stock)
      ? fabric.stock
      : null;
  try {
    const reserved = getFabricReservedStock(fabric);
    return {
      stockOnHand,
      reserved,
      available:
        stockOnHand === null
          ? null
          : computeAvailableStock(stockOnHand, reserved),
    };
  } catch {
    return { stockOnHand, reserved: null, available: null };
  }
};
