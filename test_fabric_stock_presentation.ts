import assert from "node:assert/strict";
import { getFabricStockPresentation } from "./src/utils/fabricStockPresentation";

const inStockWithCount = getFabricStockPresentation({
  stockStatus: "IN_STOCK",
  stock: 12,
});
assert.deepEqual(inStockWithCount, {
  visible: true,
  status: "IN_STOCK",
  label: "In Stock: 12",
  tone: "in_stock",
  availableStock: 12,
  reservedStock: 0,
  stockOnHand: 12,
});

const inStockWithoutCount = getFabricStockPresentation({
  stockStatus: "IN_STOCK",
});
assert.deepEqual(inStockWithoutCount, {
  visible: true,
  status: "IN_STOCK",
  label: "In Stock",
  tone: "in_stock",
  availableStock: null,
  reservedStock: 0,
  stockOnHand: null,
});

const lowStockWithCount = getFabricStockPresentation({
  stockStatus: "LOW_STOCK",
  stock: 3,
});
assert.deepEqual(lowStockWithCount, {
  visible: true,
  status: "LOW_STOCK",
  label: "Low Stock: 3",
  tone: "low_stock",
  availableStock: 3,
  reservedStock: 0,
  stockOnHand: 3,
});

const lowStockWithoutCount = getFabricStockPresentation({
  stockStatus: "LOW_STOCK",
});
assert.deepEqual(lowStockWithoutCount, {
  visible: true,
  status: "LOW_STOCK",
  label: "Low Stock",
  tone: "low_stock",
  availableStock: null,
  reservedStock: 0,
  stockOnHand: null,
});

const outOfStock = getFabricStockPresentation({
  stockStatus: "OUT_OF_STOCK",
  stock: 0,
});
assert.deepEqual(outOfStock, {
  visible: true,
  status: "OUT_OF_STOCK",
  label: "Out of Stock",
  tone: "out_of_stock",
  availableStock: 0,
  reservedStock: 0,
  stockOnHand: 0,
});

// Available stock is authoritative for non-HIDDEN fabrics.
const contradictoryOutOfStockStatus = getFabricStockPresentation({
  stockStatus: "OUT_OF_STOCK",
  stock: 10,
});
assert.equal(contradictoryOutOfStockStatus.visible, true);
if (contradictoryOutOfStockStatus.visible) {
  assert.equal(contradictoryOutOfStockStatus.status, "IN_STOCK");
  assert.equal(contradictoryOutOfStockStatus.label, "In Stock: 10");
}

const stockZeroShowsOutOfStock = getFabricStockPresentation({
  stockStatus: "IN_STOCK",
  stock: 0,
});
assert.equal(stockZeroShowsOutOfStock.visible, true);
if (stockZeroShowsOutOfStock.visible) {
  assert.equal(stockZeroShowsOutOfStock.status, "OUT_OF_STOCK");
  assert.equal(stockZeroShowsOutOfStock.label, "Out of Stock");
}

const reservedReducesAvailable = getFabricStockPresentation({
  stockStatus: "IN_STOCK",
  stock: 10,
  reservedStock: 9,
});
assert.equal(reservedReducesAvailable.visible, true);
if (reservedReducesAvailable.visible) {
  assert.equal(reservedReducesAvailable.status, "LOW_STOCK");
  assert.equal(reservedReducesAvailable.label, "Low Stock: 1");
  assert.equal(reservedReducesAvailable.availableStock, 1);
}

const fullyReservedShowsOutOfStock = getFabricStockPresentation({
  stockStatus: "IN_STOCK",
  stock: 2,
  reservedStock: 2,
});
assert.equal(fullyReservedShowsOutOfStock.visible, true);
if (fullyReservedShowsOutOfStock.visible) {
  assert.equal(fullyReservedShowsOutOfStock.status, "OUT_OF_STOCK");
  assert.equal(fullyReservedShowsOutOfStock.label, "Out of Stock");
  assert.equal(fullyReservedShowsOutOfStock.availableStock, 0);
}

const inStockWithNegative = getFabricStockPresentation({
  stockStatus: "IN_STOCK",
  stock: -1,
});
assert.equal(inStockWithNegative.visible, true);
if (inStockWithNegative.visible) {
  assert.equal(
    inStockWithNegative.label,
    "In Stock",
    "Invalid negative stock must not expose a quantity.",
  );
  assert.doesNotMatch(inStockWithNegative.label, /-1/);
}

const hidden = getFabricStockPresentation({
  stockStatus: "HIDDEN",
  stock: 8,
});
assert.deepEqual(hidden, { visible: false, status: "HIDDEN" });

const missingStockNull = getFabricStockPresentation({
  stockStatus: "IN_STOCK",
  stock: null as unknown as number,
});
assert.equal(missingStockNull.visible, true);
if (missingStockNull.visible) {
  assert.equal(
    missingStockNull.label,
    "In Stock",
    "Null or missing stock must not be treated as zero.",
  );
}

console.log("PASS: fabric stock presentation");
