import type { Fabric } from "../types";

export type FabricStockBadgeTone = "in_stock" | "low_stock" | "out_of_stock";

export type FabricStockPresentation =
  | { visible: false; status: "HIDDEN" }
  | {
      visible: true;
      status: Exclude<Fabric["stockStatus"], "HIDDEN">;
      label: string;
      tone: FabricStockBadgeTone;
    };

const isPositiveFiniteStock = (stock: unknown): stock is number =>
  typeof stock === "number" && Number.isFinite(stock) && stock > 0;

/**
 * Customer-facing stock badge copy for Step 2 catalogue cards.
 * Numeric stock is admin-maintained/display-only; stockStatus remains the
 * availability authority. Counts are shown only when consistent with status.
 */
export const getFabricStockPresentation = (
  fabric: Pick<Fabric, "stockStatus" | "stock">,
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
  if (fabric.stockStatus === "LOW_STOCK") {
    return {
      visible: true,
      status: "LOW_STOCK",
      label: isPositiveFiniteStock(fabric.stock)
        ? `Low Stock: ${fabric.stock}`
        : "Low Stock",
      tone: "low_stock",
    };
  }
  return {
    visible: true,
    status: "IN_STOCK",
    label: isPositiveFiniteStock(fabric.stock)
      ? `In Stock: ${fabric.stock}`
      : "In Stock",
    tone: "in_stock",
  };
};
