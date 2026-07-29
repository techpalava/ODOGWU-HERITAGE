import assert from "node:assert/strict";
import type { CartItem } from "./src/types";
import {
  calculateCartPricing,
  calculateIndividualShipping,
  getGarmentPieceCount,
} from "./src/utils/individualShipping";

const expectedRates = [
  { pieces: 1, band: "0 - 2 kg", price: 131.25 },
  { pieces: 5, band: ">2 - 5 kg", price: 131.25 },
  { pieces: 12, band: ">2 - 5 kg", price: 131.25 },
  { pieces: 13, band: ">5 - 10 kg", price: 236.25 },
  { pieces: 24, band: ">5 - 10 kg", price: 236.25 },
  { pieces: 25, band: ">10 - 20 kg", price: 425.25 },
  { pieces: 48, band: ">10 - 20 kg", price: 425.25 },
  { pieces: 49, band: ">20 kg", price: 765.45 },
] as const;

for (const expected of expectedRates) {
  const quote = calculateIndividualShipping(expected.pieces);
  assert.equal(quote.weightBand, expected.band);
  assert.equal(quote.priceEur, expected.price);
  assert.equal(quote.priceNgn, Math.round(expected.price * 1600));
}

assert.equal(getGarmentPieceCount("Shirt Only"), 1);
assert.equal(getGarmentPieceCount("2-Piece Set"), 2);
assert.equal(getGarmentPieceCount("3-Piece Set"), 3);
assert.equal(getGarmentPieceCount("Couple Look"), 2);
assert.equal(getGarmentPieceCount("Family Look"), 4);

const makeCartItem = (
  id: string,
  batchType: CartItem["batchType"],
  garmentSubtotal: number,
  garmentPieceCount: number,
): CartItem => {
  const quote =
    batchType === "alone"
      ? calculateIndividualShipping(garmentPieceCount)
      : undefined;

  return {
    id,
    batchType,
    garment: {
      type: "Test Garment",
      totalPrice: garmentSubtotal + (quote?.priceEur ?? 0),
      individualShipping: quote,
    },
  } as CartItem;
};

const cartPricing = calculateCartPricing(
  [
    makeCartItem("one", "alone", 100, 2),
    makeCartItem("two", "alone", 200, 3),
    makeCartItem("group", "community", 150, 1),
  ],
  0.5,
);

assert.equal(cartPricing.garmentSubtotal, 450);
assert.equal(cartPricing.shippingQuote?.garmentPieceCount, 5);
assert.equal(cartPricing.shippingTotal, 131.25);
assert.equal(cartPricing.total, 581.25);
assert.equal(cartPricing.depositDueNow, 356.25);
assert.equal(cartPricing.remainingDue, 225);

const groupOnlyPricing = calculateCartPricing(
  [makeCartItem("group-only", "community", 150, 2)],
  0.5,
);
assert.equal(groupOnlyPricing.shippingQuote, null);
assert.equal(groupOnlyPricing.shippingTotal, 0);
assert.equal(groupOnlyPricing.total, 150);

console.log("PASS: Lagos-to-Eindhoven shipping band boundaries");
console.log("PASS: individual cart items share one consolidated shipping quote");
console.log("PASS: community and personalized routes have no shipping charge");
console.log("PASS: shipping is paid in full with the garment deposit");
