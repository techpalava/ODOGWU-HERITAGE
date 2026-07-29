import assert from "node:assert/strict";
import type { CartItem } from "./src/types";
import {
  calculateBatchShipping,
  calculateCartPricing,
  calculateIndividualShipping,
  getGarmentPieceCount,
} from "./src/utils/shippingPricing";

const closeTo = (actual: number, expected: number, message: string) => {
  assert.ok(
    Math.abs(actual - expected) < 0.001,
    `${message}: expected ${expected}, received ${actual}`,
  );
};

const makeItem = (
  id: string,
  batchType: NonNullable<CartItem["batchType"]>,
  garmentTotal: number,
  options: {
    pieces?: number;
    batchId?: string;
    batchName?: string;
    plannedCapacity?: number;
  } = {},
): CartItem => {
  const pieces = options.pieces ?? 1;
  const base = {
    id,
    customer: { name: "Test Customer", email: "test@example.com" },
    style: { id: "style", name: "Test Style", gender: "unisex" },
    fabric: { id: "fabric", name: "Test Fabric", code: "TEST" },
    design: { customDetails: {} },
    measurements: {},
    specialInstructions: "",
    notesAboutLeftoverFabric: "",
    batchType,
    batchId: options.batchId,
    batchName: options.batchName,
    garment: {
      type: `${pieces}-Piece Set`,
      totalPrice: garmentTotal,
    },
  } as CartItem;

  if (batchType === "alone") {
    base.garment.individualShipping = calculateIndividualShipping(pieces);
  } else {
    base.garment.batchShipping = calculateBatchShipping({
      batchId: options.batchId ?? "BATCH-1",
      batchName: options.batchName ?? "Batch One",
      plannedGarmentCapacity: options.plannedCapacity ?? 40,
      garmentPieceCount: pieces,
    });
  }

  base.garment.totalPrice +=
    base.garment.individualShipping?.priceEur ??
    base.garment.batchShipping?.priceEur ??
    0;
  return base;
};

assert.equal(getGarmentPieceCount("3-Piece Set"), 3);
assert.equal(getGarmentPieceCount("Family Look"), 4);

const batchBoundaries = [
  [4, 32.81, "1 - 4 garments"],
  [5, 13.13, "5 - 10 garments"],
  [10, 13.13, "5 - 10 garments"],
  [11, 11.81, "11 - 20 garments"],
  [20, 11.81, "11 - 20 garments"],
  [21, 10.63, "21 - 40 garments"],
  [40, 10.63, "21 - 40 garments"],
  [41, 12.76, "41+ garments"],
  [60, 12.76, "41+ garments"],
  [61, 12.76, "41+ garments"],
] as const;

batchBoundaries.forEach(([capacity, expectedPrice, expectedBand]) => {
  const quote = calculateBatchShipping({
    batchId: "BOUNDARY",
    batchName: "Boundary Batch",
    plannedGarmentCapacity: capacity,
    garmentPieceCount: 1,
  });
  closeTo(quote.priceEur, expectedPrice, `capacity ${capacity}`);
  assert.equal(quote.capacityBand, expectedBand);
});

closeTo(
  calculateBatchShipping({
    batchId: "BATCH-40",
    batchName: "Forty",
    plannedGarmentCapacity: 40,
    garmentPieceCount: 2,
  }).priceEur,
  21.26,
  "two-piece target 40",
);
closeTo(
  calculateBatchShipping({
    batchId: "BATCH-10",
    batchName: "Ten",
    plannedGarmentCapacity: 10,
    garmentPieceCount: 3,
  }).priceEur,
  39.38,
  "three-piece target 10",
);
closeTo(
  calculateBatchShipping({
    batchId: "BATCH-60",
    batchName: "Sixty",
    plannedGarmentCapacity: 60,
    garmentPieceCount: 4,
  }).priceEur,
  51.03,
  "four-piece target 60",
);

const sameBatchCart = calculateCartPricing(
  [
    makeItem("community-1", "community", 100, {
      pieces: 2,
      batchId: "AVATARS",
      batchName: "Avatars",
      plannedCapacity: 40,
    }),
    makeItem("community-2", "community", 150, {
      pieces: 1,
      batchId: "AVATARS",
      batchName: "Avatars",
      plannedCapacity: 40,
    }),
  ],
  0.5,
);
assert.equal(sameBatchCart.batchShippingQuotes.length, 1);
assert.equal(sameBatchCart.batchShippingQuotes[0].garmentPieceCount, 3);
closeTo(sameBatchCart.batchShippingQuotes[0].priceEur, 31.89, "grouped batch quote");
closeTo(sameBatchCart.garmentSubtotal, 250, "shipping removed from garment subtotal");
closeTo(sameBatchCart.depositDueNow, 156.89, "full shipping collected due now");
closeTo(sameBatchCart.remainingDue, 125, "remaining excludes shipping");

const mixedCart = calculateCartPricing(
  [
    makeItem("individual", "alone", 100, { pieces: 2 }),
    makeItem("community", "community", 100, {
      pieces: 2,
      batchId: "AVATARS",
      batchName: "Avatars",
      plannedCapacity: 40,
    }),
    makeItem("personalized", "personalized", 100, {
      pieces: 3,
      batchId: "FAMILY",
      batchName: "Family",
      plannedCapacity: 10,
    }),
  ],
  0.5,
);
assert.equal(mixedCart.batchShippingQuotes.length, 2);
closeTo(mixedCart.garmentSubtotal, 300, "mixed garment subtotal");
closeTo(
  mixedCart.shippingTotal,
  131.25 + 21.26 + 39.38,
  "mixed route shipping",
);
closeTo(
  mixedCart.depositDueNow,
  150 + 131.25 + 21.26 + 39.38,
  "mixed route due now",
);
closeTo(mixedCart.remainingDue, 150, "mixed route remaining");

console.log("Shipping pricing verification passed.");
