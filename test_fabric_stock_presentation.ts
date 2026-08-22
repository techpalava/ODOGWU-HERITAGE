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
});

const inStockWithoutCount = getFabricStockPresentation({
  stockStatus: "IN_STOCK",
});
assert.deepEqual(inStockWithoutCount, {
  visible: true,
  status: "IN_STOCK",
  label: "In Stock",
  tone: "in_stock",
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
});

const lowStockWithoutCount = getFabricStockPresentation({
  stockStatus: "LOW_STOCK",
});
assert.deepEqual(lowStockWithoutCount, {
  visible: true,
  status: "LOW_STOCK",
  label: "Low Stock",
  tone: "low_stock",
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
});

const outOfStockWithContradictoryCount = getFabricStockPresentation({
  stockStatus: "OUT_OF_STOCK",
  stock: 10,
});
assert.equal(outOfStockWithContradictoryCount.visible, true);
if (outOfStockWithContradictoryCount.visible) {
  assert.equal(outOfStockWithContradictoryCount.label, "Out of Stock");
}

const inStockWithZero = getFabricStockPresentation({
  stockStatus: "IN_STOCK",
  stock: 0,
});
assert.equal(inStockWithZero.visible, true);
if (inStockWithZero.visible) {
  assert.equal(
    inStockWithZero.label,
    "In Stock",
    "Contradictory IN_STOCK + stock 0 must not expose ': 0' on the badge.",
  );
}

const lowStockWithZero = getFabricStockPresentation({
  stockStatus: "LOW_STOCK",
  stock: 0,
});
assert.equal(lowStockWithZero.visible, true);
if (lowStockWithZero.visible) {
  assert.equal(
    lowStockWithZero.label,
    "Low Stock",
    "Contradictory LOW_STOCK + stock 0 must not expose ': 0' on the badge.",
  );
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
    "Contradictory IN_STOCK + negative stock must not expose the quantity.",
  );
  assert.doesNotMatch(
    inStockWithNegative.label,
    /-1/,
    "IN_STOCK badge must not include '-1' for negative stock.",
  );
}

const lowStockWithNegative = getFabricStockPresentation({
  stockStatus: "LOW_STOCK",
  stock: -1,
});
assert.equal(lowStockWithNegative.visible, true);
if (lowStockWithNegative.visible) {
  assert.equal(
    lowStockWithNegative.label,
    "Low Stock",
    "Contradictory LOW_STOCK + negative stock must not expose the quantity.",
  );
  assert.doesNotMatch(
    lowStockWithNegative.label,
    /-1/,
    "LOW_STOCK badge must not include '-1' for negative stock.",
  );
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
