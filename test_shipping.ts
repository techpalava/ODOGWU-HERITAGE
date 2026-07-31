import assert from "node:assert/strict";
import type {
  CartItem,
  DeliveryAddress,
  DeliverySelection,
  FinalMileDestinationZone,
  FinalMileWeightBand,
  MasterOrder,
} from "./src/types";
import {
  allocateCentsByWeight,
  BATCH_FLAT_RATE_EUR_PER_GARMENT,
  BATCH_MINIMUM_GARMENTS,
  CART_SHIPPING_SNAPSHOT_VERSION,
  calculateBatchShipping,
  calculateCartPaymentAllocations,
  calculateCartPricing,
  calculateFinalMileShipping,
  calculateIndividualShipping,
  confirmCartShippingReprice,
  getGarmentPieceCount,
  migrateLegacyCartShippingItems,
  resolveFinalMileWeight,
} from "./src/utils/shippingPricing";

const closeTo = (
  actual: number | null,
  expected: number,
  message: string,
) => {
  assert.notEqual(actual, null, `${message}: expected a priced quote`);
  assert.ok(
    Math.abs((actual as number) - expected) < 0.001,
    `${message}: expected ${expected}, received ${actual}`,
  );
};

const pickupSelection: DeliverySelection = {
  method: "PICKUP",
  pickupLocation: "Veldhoven Campus Lockers",
  pickupWindow: "Monday Afternoon",
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
    deliverySelection?: DeliverySelection | null;
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
    garmentPieceCount: pieces,
    deliverySelection:
      options.deliverySelection === undefined
        ? pickupSelection
        : options.deliverySelection || undefined,
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
  const inboundShipping =
    base.garment.individualShipping?.priceEur ??
    base.garment.batchShipping?.priceEur ??
    0;
  base.shippingSnapshot = {
    pricingVersion: CART_SHIPPING_SNAPSHOT_VERSION,
    repricedAt: "2026-07-30T00:00:00.000Z",
    sourceFingerprint: "CURRENT-TEST-FIXTURE",
    status: "CURRENT",
    garmentPieceCount: pieces,
    lagosToEindhovenShipping: inboundShipping,
    eindhovenToDestinationShipping: 0,
    totalShipping: inboundShipping,
    previousShippingTotal: inboundShipping,
  };
  return base;
};

assert.equal(getGarmentPieceCount("3-Piece Set"), 3);
assert.equal(getGarmentPieceCount("Family Look"), 4);

const makeAddress = (
  countryCode: string,
  city: string,
): DeliveryAddress => ({
  addressLine1: "1 Test Street",
  city,
  postalCode: "1234 AB",
  countryCode,
});

const actualWeightBoundaries: Array<
  [number, FinalMileWeightBand]
> = [
  [2, "0 - 2 kg"],
  [2.001, ">2 - 5 kg"],
  [5, ">2 - 5 kg"],
  [5.001, ">5 - 10 kg"],
  [10, ">5 - 10 kg"],
  [10.001, ">10 - 20 kg"],
  [20, ">10 - 20 kg"],
  [20.001, ">20 kg"],
];
actualWeightBoundaries.forEach(([weight, expectedBand]) => {
  const resolution = resolveFinalMileWeight(1, weight);
  assert.equal(resolution.weightBand, expectedBand);
  assert.equal(resolution.weightSource, "ACTUAL_WEIGHT");
});

const garmentCountBoundaries: Array<
  [number, FinalMileWeightBand]
> = [
  [1, "0 - 2 kg"],
  [5, "0 - 2 kg"],
  [6, ">2 - 5 kg"],
  [12, ">2 - 5 kg"],
  [13, ">5 - 10 kg"],
  [24, ">5 - 10 kg"],
  [25, ">10 - 20 kg"],
  [48, ">10 - 20 kg"],
  [49, ">20 kg"],
];
garmentCountBoundaries.forEach(([pieces, expectedBand]) => {
  const resolution = resolveFinalMileWeight(pieces);
  assert.equal(resolution.weightBand, expectedBand);
  assert.equal(resolution.weightSource, "GARMENT_COUNT_ESTIMATE");
});

assert.deepEqual(
  allocateCentsByWeight(2, [3, 3, 3, 1]),
  [1, 1, 0, 0],
  "largest-remainder allocation must never create a negative final share",
);
assert.deepEqual(
  allocateCentsByWeight(10, [1, 2, 3]),
  [2, 3, 5],
  "weighted cent allocation must reconcile exactly",
);

const zoneRates: Array<
  [string, string, FinalMileDestinationZone, number]
> = [
  ["NL", "Eindhoven", "EINDHOVEN", 7.5],
  ["NL", "Amsterdam", "NETHERLANDS_OTHER", 7.5],
  ["FR", "Paris", "EUROPE", 19],
  ["US", "Boston", "NORTH_AMERICA", 38],
  ["BR", "Sao Paulo", "SOUTH_AMERICA", 48.75],
  ["NG", "Lagos", "AFRICA", 48.75],
  ["JP", "Tokyo", "ASIA", 48.75],
];
zoneRates.forEach(([countryCode, city, expectedZone, expectedPrice]) => {
  const quote = calculateFinalMileShipping({
    deliverySelection: {
      method: "DELIVERY",
      address: makeAddress(countryCode, city),
    },
    garmentPieceCount: 1,
    shipmentGroupId: `ZONE-${countryCode}`,
    arrivalGroupKey: "individual",
  });
  assert.equal(quote.status, "READY");
  assert.equal(quote.zone, expectedZone);
  closeTo(quote.priceEur, expectedPrice, `${expectedZone} base rate`);
});

const finalMileRateMatrix: Array<
  [string, string, readonly number[]]
> = [
  ["NL", "Eindhoven", [7.5, 9.75, 12.68, 20.28]],
  ["NL", "Amsterdam", [7.5, 9.75, 12.68, 20.28]],
  ["FR", "Paris", [19, 26.6, 37.24, 52.14]],
  ["US", "Boston", [38, 60.8, 97.28, 184.83]],
  ["BR", "Sao Paulo", [48.75, 78, 124.8, 237.12]],
  ["NG", "Lagos", [48.75, 78, 124.8, 237.12]],
  ["JP", "Tokyo", [48.75, 78, 124.8, 237.12]],
];
const representativeWeights = [1, 3, 7, 15] as const;
finalMileRateMatrix.forEach(([countryCode, city, expectedRates]) => {
  representativeWeights.forEach((weight, index) => {
    const quote = calculateFinalMileShipping({
      deliverySelection: {
        method: "DELIVERY",
        address: makeAddress(countryCode, city),
        actualParcelWeightKg: weight,
      },
      garmentPieceCount: 1,
      shipmentGroupId: `RATE-${countryCode}-${weight}`,
      arrivalGroupKey: "individual",
    });
    closeTo(
      quote.priceEur,
      expectedRates[index],
      `${countryCode} ${weight} kg rate`,
    );
  });
});

const pickupQuote = calculateFinalMileShipping({
  deliverySelection: pickupSelection,
  garmentPieceCount: 60,
  shipmentGroupId: "PICKUP",
  arrivalGroupKey: "batch:avatars",
});
assert.equal(pickupQuote.status, "READY");
assert.equal(pickupQuote.weightBand, null);
closeTo(pickupQuote.priceEur, 0, "pickup remains free");

const missingDestinationQuote = calculateFinalMileShipping({
  garmentPieceCount: 1,
  shipmentGroupId: "MISSING",
  arrivalGroupKey: "individual",
});
assert.equal(missingDestinationQuote.status, "DESTINATION_REQUIRED");
assert.equal(missingDestinationQuote.priceEur, null);

const unsupportedDestinationQuote = calculateFinalMileShipping({
  deliverySelection: {
    method: "DELIVERY",
    address: makeAddress("AU", "Sydney"),
  },
  garmentPieceCount: 1,
  shipmentGroupId: "OCEANIA",
  arrivalGroupKey: "individual",
});
assert.equal(
  unsupportedDestinationQuote.status,
  "MANUAL_QUOTE_REQUIRED",
);
assert.equal(unsupportedDestinationQuote.priceEur, null);

const overweightQuote = calculateFinalMileShipping({
  deliverySelection: {
    method: "DELIVERY",
    address: makeAddress("NL", "Eindhoven"),
    actualParcelWeightKg: 20.001,
  },
  garmentPieceCount: 1,
  shipmentGroupId: "OVERWEIGHT",
  arrivalGroupKey: "individual",
});
assert.equal(overweightQuote.status, "MANUAL_QUOTE_REQUIRED");
assert.equal(overweightQuote.weightBand, ">20 kg");
assert.equal(overweightQuote.priceEur, null);

const plannedBatchSizes = [1, 4, 10, 11, 20, 40, 60, 61, 120] as const;

plannedBatchSizes.forEach((capacity) => {
  const quote = calculateBatchShipping({
    batchId: "BOUNDARY",
    batchName: "Boundary Batch",
    plannedGarmentCapacity: capacity,
    garmentPieceCount: 1,
  });
  closeTo(
    quote.priceEur,
    BATCH_FLAT_RATE_EUR_PER_GARMENT,
    `flat rate for planned capacity ${capacity}`,
  );
  assert.equal(quote.capacityBand, "10+ garments");
  assert.equal(quote.rateModel, "FLAT_PER_GARMENT");
  assert.equal(quote.minimumBatchGarments, BATCH_MINIMUM_GARMENTS);
  assert.equal(quote.allowsSplitShipments, true);
});

closeTo(
  calculateBatchShipping({
    batchId: "BATCH-40",
    batchName: "Forty",
    plannedGarmentCapacity: 40,
    garmentPieceCount: 2,
  }).priceEur,
  30.18,
  "two-piece flat batch quote",
);
closeTo(
  calculateBatchShipping({
    batchId: "BATCH-10",
    batchName: "Ten",
    plannedGarmentCapacity: 10,
    garmentPieceCount: 3,
  }).priceEur,
  45.27,
  "three-piece flat batch quote",
);
closeTo(
  calculateBatchShipping({
    batchId: "BATCH-60",
    batchName: "Sixty",
    plannedGarmentCapacity: 60,
    garmentPieceCount: 4,
  }).priceEur,
  60.36,
  "four-piece flat batch quote",
);
closeTo(
  calculateBatchShipping({
    batchId: "BATCH-LARGE",
    batchName: "Large",
    plannedGarmentCapacity: 125,
    garmentPieceCount: 125,
  }).priceEur,
  1886.25,
  "large batches have no flat-rate pricing ceiling",
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
closeTo(sameBatchCart.batchShippingQuotes[0].priceEur, 45.27, "grouped batch quote");
closeTo(sameBatchCart.garmentSubtotal, 250, "shipping removed from garment subtotal");
closeTo(sameBatchCart.depositDueNow, 170.27, "full shipping collected due now");
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
  131.25 + 30.18 + 45.27,
  "mixed route shipping",
);
closeTo(
  mixedCart.depositDueNow,
  150 + 131.25 + 30.18 + 45.27,
  "mixed route due now",
);
closeTo(mixedCart.remainingDue, 150, "mixed route remaining");

const europeDelivery: DeliverySelection = {
  method: "DELIVERY",
  address: makeAddress("FR", "Paris"),
};
const sameBatchDeliveryItems = [
  makeItem("delivery-community-1", "community", 100, {
    pieces: 2,
    batchId: "AVATARS",
    batchName: "Avatars",
    deliverySelection: europeDelivery,
  }),
  makeItem("delivery-community-2", "community", 150, {
    pieces: 1,
    batchId: "AVATARS",
    batchName: "Avatars",
    deliverySelection: europeDelivery,
  }),
];
const sameBatchDeliveryCart = calculateCartPricing(
  sameBatchDeliveryItems,
  0.5,
);
assert.equal(sameBatchDeliveryCart.finalMileShippingQuotes.length, 1);
closeTo(
  sameBatchDeliveryCart.eindhovenToDestinationShipping,
  19,
  "same batch and destination use one final-mile parcel",
);
closeTo(
  sameBatchDeliveryCart.totalShipping,
  45.27 + 19,
  "inbound and final-mile shipping are added once",
);
closeTo(
  sameBatchDeliveryCart.total,
  250 + 45.27 + 19,
  "grand total includes both shipping legs once",
);
closeTo(
  sameBatchDeliveryCart.depositDueNow,
  125 + 45.27 + 19,
  "all carrier shipping is collected with the garment deposit",
);
assert.equal(sameBatchDeliveryCart.canCheckout, true);

const northAmericaDelivery: DeliverySelection = {
  method: "DELIVERY",
  address: makeAddress("US", "Boston"),
};
const mixedArrivalDeliveryCart = calculateCartPricing(
  [
    makeItem("delivery-individual", "alone", 100, {
      pieces: 2,
      deliverySelection: northAmericaDelivery,
    }),
    makeItem("delivery-community", "community", 100, {
      pieces: 2,
      batchId: "AVATARS",
      batchName: "Avatars",
      deliverySelection: northAmericaDelivery,
    }),
    makeItem("delivery-personalized", "personalized", 100, {
      pieces: 3,
      batchId: "FAMILY",
      batchName: "Family",
      deliverySelection: northAmericaDelivery,
    }),
  ],
  0.5,
);
assert.equal(
  mixedArrivalDeliveryCart.finalMileShippingQuotes.length,
  3,
  "different arrival groups must remain separate outgoing parcels",
);
closeTo(
  mixedArrivalDeliveryCart.eindhovenToDestinationShipping,
  38 * 3,
  "each arrival group receives one North America final-mile quote",
);
closeTo(
  mixedArrivalDeliveryCart.totalShipping,
  131.25 + 30.18 + 45.27 + 38 * 3,
  "mixed route shipping remains additive",
);

const differentDestinationCart = calculateCartPricing(
  [
    makeItem("address-nl", "community", 100, {
      batchId: "AVATARS",
      deliverySelection: {
        method: "DELIVERY",
        address: makeAddress("NL", "Eindhoven"),
      },
    }),
    makeItem("address-us", "community", 100, {
      batchId: "AVATARS",
      deliverySelection: northAmericaDelivery,
    }),
  ],
  0.5,
);
assert.equal(differentDestinationCart.finalMileShippingQuotes.length, 2);
closeTo(
  differentDestinationCart.eindhovenToDestinationShipping,
  7.5 + 38,
  "different destinations receive separate final-mile quotes",
);

const equivalentPostalFormattingCart = calculateCartPricing(
  [
    makeItem("postal-space", "community", 100, {
      batchId: "AVATARS",
      deliverySelection: {
        method: "DELIVERY",
        address: {
          ...makeAddress("NL", "Eindhoven"),
          postalCode: "1234 AB",
        },
      },
    }),
    makeItem("postal-compact", "community", 100, {
      batchId: "AVATARS",
      deliverySelection: {
        method: "DELIVERY",
        address: {
          ...makeAddress("NL", "Eindhoven"),
          postalCode: "1234AB",
        },
      },
    }),
  ],
  0.5,
);
assert.equal(
  equivalentPostalFormattingCart.finalMileShippingQuotes.length,
  1,
  "equivalent postal-code formatting must not split one destination",
);

const actualWeightCart = calculateCartPricing(
  [
    makeItem("actual-1", "community", 100, {
      batchId: "AVATARS",
      pieces: 2,
      deliverySelection: {
        ...europeDelivery,
        actualParcelWeightKg: 1.5,
      },
    }),
    makeItem("actual-2", "community", 100, {
      batchId: "AVATARS",
      pieces: 1,
      deliverySelection: {
        ...europeDelivery,
        actualParcelWeightKg: 1,
      },
    }),
  ],
  0.5,
);
assert.equal(
  actualWeightCart.finalMileShippingQuotes[0].weightSource,
  "ACTUAL_WEIGHT",
);
assert.equal(
  actualWeightCart.finalMileShippingQuotes[0].weightBand,
  ">2 - 5 kg",
);
closeTo(
  actualWeightCart.eindhovenToDestinationShipping,
  26.6,
  "trusted item weights are combined for the outgoing parcel",
);

const groupedActualWeightBoundaries: Array<
  [number, number, FinalMileWeightBand]
> = [
  [1, 1, "0 - 2 kg"],
  [2, 3, ">2 - 5 kg"],
  [4, 6, ">5 - 10 kg"],
  [8, 12, ">10 - 20 kg"],
];
groupedActualWeightBoundaries.forEach(
  ([firstWeight, secondWeight, expectedBand]) => {
    const cart = calculateCartPricing(
      [
        makeItem(`group-weight-${firstWeight}-a`, "community", 100, {
          batchId: "AVATARS",
          deliverySelection: {
            ...europeDelivery,
            actualParcelWeightKg: firstWeight,
          },
        }),
        makeItem(`group-weight-${secondWeight}-b`, "community", 100, {
          batchId: "AVATARS",
          deliverySelection: {
            ...europeDelivery,
            actualParcelWeightKg: secondWeight,
          },
        }),
      ],
      0.5,
    );
    assert.equal(cart.shippingStatus, "READY");
    assert.equal(
      cart.finalMileShippingQuotes[0].weightBand,
      expectedBand,
      `grouped actual weight ${firstWeight + secondWeight} kg uses the exact boundary band`,
    );
  },
);

const partialActualWeightCart = calculateCartPricing(
  [
    makeItem("partial-actual", "community", 100, {
      batchId: "AVATARS",
      pieces: 1,
      deliverySelection: {
        ...europeDelivery,
        actualParcelWeightKg: 19,
      },
    }),
    makeItem("partial-estimated", "community", 100, {
      batchId: "AVATARS",
      pieces: 1,
      deliverySelection: europeDelivery,
    }),
  ],
  0.5,
);
assert.equal(
  partialActualWeightCart.shippingStatus,
  "MANUAL_QUOTE_REQUIRED",
  "partial actual weights must not fall back to a lower garment-count band",
);
assert.equal(partialActualWeightCart.canCheckout, false);
assert.equal(partialActualWeightCart.totalShipping, null);

const missingDestinationCart = calculateCartPricing(
  [
    makeItem("missing-destination", "alone", 100, {
      deliverySelection: null,
    }),
  ],
  0.5,
);
assert.equal(
  missingDestinationCart.shippingStatus,
  "DESTINATION_REQUIRED",
);
assert.equal(missingDestinationCart.canCheckout, false);
assert.equal(missingDestinationCart.totalShipping, null);
assert.equal(missingDestinationCart.total, null);
assert.equal(missingDestinationCart.depositDueNow, null);

const manualQuoteCart = calculateCartPricing(
  [
    makeItem("manual-destination", "alone", 100, {
      deliverySelection: {
        method: "DELIVERY",
        address: makeAddress("AU", "Sydney"),
      },
    }),
  ],
  0.5,
);
assert.equal(
  manualQuoteCart.shippingStatus,
  "MANUAL_QUOTE_REQUIRED",
);
assert.equal(manualQuoteCart.canCheckout, false);
assert.equal(manualQuoteCart.depositDueNow, null);

const restoredItems = JSON.parse(
  JSON.stringify(sameBatchDeliveryItems),
) as CartItem[];
const restoredPricing = calculateCartPricing(restoredItems, 0.5);
closeTo(
  restoredPricing.total,
  sameBatchDeliveryCart.total,
  "serialized cart restores the same shipping quote",
);
assert.deepEqual(
  restoredItems[0].deliverySelection,
  sameBatchDeliveryItems[0].deliverySelection,
);

const centEdgeItems = [
  makeItem("cent-edge-1", "alone", 0.01, { pieces: 1 }),
  makeItem("cent-edge-2", "alone", 0.01, { pieces: 1 }),
];
const centEdgePricing = calculateCartPricing(centEdgeItems, 0.5);
const centEdgeAllocations = calculateCartPaymentAllocations(
  centEdgeItems,
  centEdgePricing,
  0.5,
);
closeTo(
  centEdgeAllocations.reduce(
    (total, allocation) => total + allocation.dueNow,
    0,
  ),
  centEdgePricing.depositDueNow,
  "per-order deposits reconcile to checkout due now",
);
closeTo(
  centEdgeAllocations.reduce(
    (total, allocation) =>
      total + allocation.remainingGarmentBalance,
    0,
  ),
  centEdgePricing.remainingDue,
  "per-order remaining balances reconcile to checkout",
);
assert.deepEqual(
  centEdgeAllocations.map((allocation) => allocation.garmentDeposit),
  [0.01, 0],
  "one deposit cent is allocated once across two one-cent garments",
);

const groupedFinalMileAllocations = calculateCartPaymentAllocations(
  sameBatchDeliveryItems,
  sameBatchDeliveryCart,
  0.5,
);
closeTo(
  groupedFinalMileAllocations.reduce(
    (total, allocation) =>
      total + allocation.eindhovenToDestinationShipping,
    0,
  ),
  sameBatchDeliveryCart.eindhovenToDestinationShipping,
  "grouped final-mile allocations reconcile to the charged quote",
);
assert.ok(
  groupedFinalMileAllocations.every(
    (allocation) =>
      allocation.eindhovenToDestinationShipping >= 0,
  ),
  "grouped final-mile allocations must remain non-negative",
);

const staleBatchItems = [
  makeItem("stale-batch-1", "community", 100, {
    pieces: 1,
    batchId: "AVATARS",
  }),
  makeItem("stale-batch-2", "community", 100, {
    pieces: 1,
    batchId: "AVATARS",
  }),
];
staleBatchItems.forEach((item) => {
  if (!item.garment.batchShipping) {
    throw new Error("Expected a batch shipping snapshot.");
  }
  item.garment.batchShipping.priceEur = 1;
  item.garment.totalPrice = 101;
});
const staleBatchPricing = calculateCartPricing(staleBatchItems, 0.5);
const staleBatchAllocations = calculateCartPaymentAllocations(
  staleBatchItems,
  staleBatchPricing,
  0.5,
);
closeTo(
  staleBatchAllocations.reduce(
    (total, allocation) =>
      total + allocation.lagosToEindhovenShipping,
    0,
  ),
  staleBatchPricing.lagosToEindhovenShipping,
  "saved orders use the current checkout quote instead of stale item snapshots",
);

const migrationTimestamp = "2026-07-30T12:00:00.000Z";
const legacyCurrentRateItem = makeItem(
  "legacy-current-rate",
  "alone",
  100,
);
delete legacyCurrentRateItem.shippingSnapshot;
delete legacyCurrentRateItem.garmentPieceCount;
const successfulMigration = migrateLegacyCartShippingItems(
  [legacyCurrentRateItem],
  migrationTimestamp,
);
assert.equal(successfulMigration.changed, true);
assert.equal(
  successfulMigration.items[0].shippingSnapshot?.pricingVersion,
  CART_SHIPPING_SNAPSHOT_VERSION,
);
assert.equal(
  successfulMigration.items[0].shippingSnapshot?.repricedAt,
  migrationTimestamp,
);
assert.equal(
  successfulMigration.items[0].shippingSnapshot?.status,
  "CURRENT",
);
assert.equal(successfulMigration.items[0].garmentPieceCount, 1);

const missingDestinationLegacyItem = makeItem(
  "legacy-missing-destination",
  "alone",
  100,
  { deliverySelection: null },
);
delete missingDestinationLegacyItem.shippingSnapshot;
const missingDestinationMigration = migrateLegacyCartShippingItems(
  [missingDestinationLegacyItem],
  migrationTimestamp,
);
assert.equal(missingDestinationMigration.items.length, 1);
assert.equal(
  missingDestinationMigration.items[0].shippingSnapshot?.status,
  "REVIEW_REQUIRED",
);
assert.match(
  missingDestinationMigration.items[0].shippingSnapshot?.reviewReason || "",
  /Review shipping details/i,
);
const missingDestinationMigratedPricing = calculateCartPricing(
  missingDestinationMigration.items,
  0.5,
);
assert.equal(missingDestinationMigratedPricing.canCheckout, false);
assert.equal(
  missingDestinationMigratedPricing.requiresShippingReview,
  true,
);

const changedRateLegacyItem = makeItem(
  "legacy-changed-rate",
  "alone",
  100,
);
delete changedRateLegacyItem.shippingSnapshot;
if (!changedRateLegacyItem.garment.individualShipping) {
  throw new Error("Expected an individual shipping snapshot.");
}
changedRateLegacyItem.garment.individualShipping.priceEur = 35;
changedRateLegacyItem.garment.totalPrice = 135;
const changedRateMigration = migrateLegacyCartShippingItems(
  [changedRateLegacyItem],
  migrationTimestamp,
);
const changedRateSnapshot =
  changedRateMigration.items[0].shippingSnapshot;
assert.equal(changedRateSnapshot?.status, "CONFIRMATION_REQUIRED");
closeTo(
  changedRateSnapshot?.previousShippingTotal ?? null,
  35,
  "legacy shipping total is retained for customer comparison",
);
closeTo(
  changedRateSnapshot?.updatedShippingTotal ?? null,
  131.25,
  "legacy shipping is repriced with the current configuration",
);
assert.equal(
  calculateCartPricing(changedRateMigration.items, 0.5).canCheckout,
  false,
);

const confirmedChangedRateItems = confirmCartShippingReprice(
  changedRateMigration.items,
  "2026-07-30T12:05:00.000Z",
);
assert.equal(
  confirmedChangedRateItems[0].shippingSnapshot?.status,
  "CURRENT",
);
const confirmedChangedRatePricing = calculateCartPricing(
  confirmedChangedRateItems,
  0.5,
);
assert.equal(confirmedChangedRatePricing.canCheckout, true);
closeTo(
  confirmedChangedRatePricing.garmentSubtotal,
  100,
  "migration preserves the garment subtotal",
);
closeTo(
  confirmedChangedRatePricing.totalShipping,
  131.25,
  "confirmed migration uses the accurate shipping total",
);
closeTo(
  confirmedChangedRatePricing.total,
  231.25,
  "confirmed migration produces the accurate cart total",
);

const restoredMigratedItems = JSON.parse(
  JSON.stringify(successfulMigration.items),
) as CartItem[];
const reloadMigration = migrateLegacyCartShippingItems(
  restoredMigratedItems,
  "2026-07-30T13:00:00.000Z",
);
assert.equal(reloadMigration.changed, false);
assert.deepEqual(reloadMigration.items, restoredMigratedItems);
assert.equal(
  reloadMigration.items[0].shippingSnapshot?.repricedAt,
  migrationTimestamp,
);

const sharedPaidGarment = {
  ...changedRateLegacyItem.garment,
  individualShipping: {
    ...changedRateLegacyItem.garment.individualShipping,
  },
};
const paidOrder = {
  garment: sharedPaidGarment,
  payment: { isPaid: true },
} as MasterOrder;
const paidOrderBeforeMigration = JSON.parse(
  JSON.stringify(paidOrder),
) as MasterOrder;
const unpaidCartItemSharingLegacyData = {
  ...changedRateLegacyItem,
  garment: sharedPaidGarment,
};
migrateLegacyCartShippingItems(
  [unpaidCartItemSharingLegacyData],
  migrationTimestamp,
);
assert.deepEqual(
  paidOrder,
  paidOrderBeforeMigration,
  "cart migration must not mutate paid order data",
);

console.log("Shipping pricing verification passed.");
