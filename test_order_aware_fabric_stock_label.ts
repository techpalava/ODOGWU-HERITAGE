import assert from "node:assert/strict";
import type { Fabric, FabricAllocationState } from "./src/types";
import { getOrderAwareFabricStockPresentation } from "./src/utils/fabricStockAvailability";

// Step 2 Fabric cards: an out-of-stock Fabric must show "Out of Stock", never
// "In Stock: N". In-stock Fabrics keep their count.

type StockFabric = Pick<Fabric, "code" | "stock" | "stockStatus">;

const fabric = (
  stock: number | undefined,
  stockStatus: Fabric["stockStatus"],
  code = "FAB-TEST",
): StockFabric => ({ code, stock, stockStatus });

const stateWithAllocations = (
  fabricCode: string,
  count: number,
): FabricAllocationState =>
  ({
    fabricAllocations: Array.from({ length: count }, (_, index) => ({
      id: `alloc-${index}`,
      fabricCode,
      garmentAssignments: [{ garmentKey: `garment-${index}` }],
    })),
    activeAllocationId: null,
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  }) as unknown as FabricAllocationState;

const emptyState = stateWithAllocations("FAB-TEST", 0);

const labelOf = (
  presentation: ReturnType<typeof getOrderAwareFabricStockPresentation>,
) => (presentation.visible ? presentation.label : null);

// Out of stock: admin marked OUT_OF_STOCK but the stock number is still 10.
const contradictory = getOrderAwareFabricStockPresentation(
  fabric(10, "OUT_OF_STOCK"),
  emptyState,
);
assert.equal(contradictory.visible, true);
assert.equal(contradictory.status, "OUT_OF_STOCK");
assert.equal(labelOf(contradictory), "Out of Stock");
assert.equal(contradictory.visible && contradictory.tone, "out_of_stock");
assert.doesNotMatch(labelOf(contradictory) ?? "", /In Stock/);

// Out of stock: OUT_OF_STOCK with stock 0 or no count.
assert.equal(
  labelOf(getOrderAwareFabricStockPresentation(fabric(0, "OUT_OF_STOCK"), emptyState)),
  "Out of Stock",
);
assert.equal(
  labelOf(
    getOrderAwareFabricStockPresentation(fabric(undefined, "OUT_OF_STOCK"), emptyState),
  ),
  "Out of Stock",
);

// Out of stock for this order: IN_STOCK, but every unit is already used.
assert.equal(
  labelOf(
    getOrderAwareFabricStockPresentation(
      fabric(1, "IN_STOCK"),
      stateWithAllocations("FAB-TEST", 1),
    ),
  ),
  "Out of Stock",
);

// Out of stock, but a leftover half on an existing allocation still fits.
assert.equal(
  labelOf(
    getOrderAwareFabricStockPresentation(fabric(10, "OUT_OF_STOCK"), emptyState, {
      hasCompatibleReusableHalfCapacity: true,
    }),
  ),
  "1/2 Capacity Left",
);
{
  const reusable = getOrderAwareFabricStockPresentation(
    fabric(10, "OUT_OF_STOCK"),
    emptyState,
    { hasCompatibleReusableHalfCapacity: true },
  );
  // Rendered red on catalogue cards and in the assign panel.
  assert.equal(reusable.visible && reusable.tone, "reusable_capacity");
}

// In stock: unchanged behaviour.
const inStock = getOrderAwareFabricStockPresentation(fabric(10, "IN_STOCK"), emptyState);
assert.equal(inStock.status, "IN_STOCK");
assert.equal(labelOf(inStock), "In Stock: 10");
assert.equal(inStock.visible && inStock.tone, "in_stock");
assert.equal(
  labelOf(
    getOrderAwareFabricStockPresentation(
      fabric(5, "IN_STOCK"),
      stateWithAllocations("FAB-TEST", 2),
    ),
  ),
  "In Stock: 3",
);
assert.equal(
  labelOf(
    getOrderAwareFabricStockPresentation(fabric(10, "IN_STOCK"), emptyState, {
      hasCompatibleReusableHalfCapacity: true,
    }),
  ),
  "In Stock: 10",
);
assert.equal(
  labelOf(getOrderAwareFabricStockPresentation(fabric(2, "IN_STOCK"), emptyState)),
  "Low Stock: 2",
);
assert.equal(
  labelOf(getOrderAwareFabricStockPresentation(fabric(undefined, "IN_STOCK"), emptyState)),
  "In Stock",
);
assert.equal(
  getOrderAwareFabricStockPresentation(fabric(10, "HIDDEN"), emptyState).visible,
  false,
);

console.log("PASS: order-aware fabric stock label");
