import assert from "node:assert/strict";
import {
  STEP8_ADDITIONAL_DELIVERY_RATES_CENTS,
  STEP8_COUNTRY_OPTIONS,
  STEP8_DELIVERY_RATE_VERSION,
  STEP8_DESTINATION_ZONES,
  STEP8_HEADLINE_RATES_CENTS,
  STEP8_KG_PER_PHYSICAL_GARMENT,
  STEP8_PICKUP_FEE_CENTS,
  STEP8_QUOTE_REQUIRED_COUNTRY_CODES,
  isStep8CustomerSelectableCountry,
} from "./src/config/Step8AdditionalDeliveryConfig";
import {
  formatStep8CustomerDestination,
  resolveStep8AdditionalDelivery,
  resolveStep8DestinationZone,
  resolveStep8ShipmentWeightKg,
  resolveStep8WeightTier,
  step8RequiresRegion,
} from "./src/utils/step8AdditionalDelivery";
import {
  createEmptyFutureShippingState,
  reconcileFutureShippingState,
} from "./src/utils/designStudioFutureShipping";
import { calculateSelectedDesignPrice } from "./src/utils/designPricing";
import {
  BATCH_FLAT_RATE_EUR_PER_GARMENT,
  calculateBatchShipping,
  calculateIndividualShipping,
} from "./src/utils/shippingPricing";

const STANDARD_SHIPPING_INDIVIDUAL_EUR = 131.25;
const STANDARD_SHIPPING_BATCH_EUR = 15.09;

const weightRows: ReadonlyArray<{
  garments: number;
  kg: number;
  tier: ReturnType<typeof resolveStep8WeightTier> | "quote";
}> = [
  { garments: 1, kg: 0.5, tier: "0_2" },
  { garments: 4, kg: 2.0, tier: "0_2" },
  { garments: 5, kg: 2.5, tier: "2_5" },
  { garments: 10, kg: 5.0, tier: "2_5" },
  { garments: 11, kg: 5.5, tier: "5_10" },
  { garments: 20, kg: 10, tier: "5_10" },
  { garments: 21, kg: 10.5, tier: "10_20" },
  { garments: 40, kg: 20, tier: "10_20" },
  { garments: 41, kg: 20.5, tier: "quote" },
];

for (const row of weightRows) {
  const weight = resolveStep8ShipmentWeightKg(row.garments);
  assert.equal(weight, row.kg);
  assert.equal(weight, row.garments * STEP8_KG_PER_PHYSICAL_GARMENT);
  if (row.tier === "quote") {
    assert.equal(resolveStep8WeightTier(weight!), "over_20");
    const quote = resolveStep8AdditionalDelivery({
      deliveryMethod: "destination_delivery",
      countryCode: "DE",
      city: "Berlin",
      physicalGarmentCount: row.garments,
    });
    assert.equal(quote.quoteRequired, true);
    assert.equal(quote.additionalDeliveryFeeCents, null);
    assert.equal(quote.status, "quote_required");
  } else {
    assert.equal(resolveStep8WeightTier(weight!), row.tier);
  }
}

const extraShirtCount = 2; // Shirt + additional Shirt
assert.equal(resolveStep8ShipmentWeightKg(extraShirtCount), 1);
assert.equal(resolveStep8WeightTier(1), "0_2");

const rateCases: ReadonlyArray<{
  zone: "EINDHOVEN" | "EUROPE" | "NORTH_AMERICA" | "AFRICA" | "SOUTH_AMERICA" | "ASIA";
  countryCode: string;
  city: string;
  kg: number;
  garments: number;
  cents: number;
}> = [
  { zone: "EINDHOVEN", countryCode: "NL", city: "Eindhoven", kg: 1, garments: 2, cents: 750 },
  { zone: "EINDHOVEN", countryCode: "NL", city: "Eindhoven", kg: 3, garments: 6, cents: 975 },
  { zone: "EINDHOVEN", countryCode: "NL", city: "Eindhoven", kg: 7, garments: 14, cents: 1268 },
  { zone: "EINDHOVEN", countryCode: "NL", city: "Eindhoven", kg: 15, garments: 30, cents: 2028 },
  { zone: "EUROPE", countryCode: "DE", city: "Berlin", kg: 1, garments: 2, cents: 1900 },
  { zone: "EUROPE", countryCode: "DE", city: "Berlin", kg: 3, garments: 6, cents: 2660 },
  { zone: "EUROPE", countryCode: "DE", city: "Berlin", kg: 7, garments: 14, cents: 3724 },
  { zone: "EUROPE", countryCode: "DE", city: "Berlin", kg: 15, garments: 30, cents: 5214 },
  { zone: "NORTH_AMERICA", countryCode: "US", city: "New York", kg: 1, garments: 2, cents: 3800 },
  { zone: "NORTH_AMERICA", countryCode: "US", city: "New York", kg: 3, garments: 6, cents: 6080 },
  { zone: "NORTH_AMERICA", countryCode: "US", city: "New York", kg: 7, garments: 14, cents: 9728 },
  { zone: "NORTH_AMERICA", countryCode: "US", city: "New York", kg: 15, garments: 30, cents: 18483 },
  { zone: "AFRICA", countryCode: "NG", city: "Lagos", kg: 1, garments: 2, cents: 4875 },
  { zone: "AFRICA", countryCode: "NG", city: "Lagos", kg: 3, garments: 6, cents: 7800 },
  { zone: "AFRICA", countryCode: "NG", city: "Lagos", kg: 7, garments: 14, cents: 12480 },
  { zone: "AFRICA", countryCode: "NG", city: "Lagos", kg: 15, garments: 30, cents: 23712 },
  { zone: "SOUTH_AMERICA", countryCode: "BR", city: "Sao Paulo", kg: 1, garments: 2, cents: 4875 },
  { zone: "SOUTH_AMERICA", countryCode: "BR", city: "Sao Paulo", kg: 3, garments: 6, cents: 7800 },
  { zone: "ASIA", countryCode: "JP", city: "Tokyo", kg: 1, garments: 2, cents: 4875 },
  { zone: "ASIA", countryCode: "JP", city: "Tokyo", kg: 3, garments: 6, cents: 7800 },
];

for (const row of rateCases) {
  const resolved = resolveStep8AdditionalDelivery({
    deliveryMethod: "destination_delivery",
    countryCode: row.countryCode,
    city: row.city,
    physicalGarmentCount: row.garments,
  });
  assert.equal(resolved.destinationZone, row.zone, `${row.zone} ${row.kg}kg zone`);
  assert.equal(resolved.shipmentWeightKg, row.kg);
  assert.equal(resolved.additionalDeliveryFeeCents, row.cents, `${row.zone} ${row.kg}kg fee`);
  assert.equal(resolved.quoteRequired, false);
  assert.notEqual(resolved.additionalDeliveryFeeCents, 1509);
  assert.notEqual(resolved.additionalDeliveryFeeCents, 13125);
}

const over20 = resolveStep8AdditionalDelivery({
  deliveryMethod: "destination_delivery",
  countryCode: "FR",
  city: "Paris",
  physicalGarmentCount: 41,
});
assert.equal(over20.quoteRequired, true);
assert.equal(over20.additionalDeliveryFeeCents, null);
assert.equal(over20.weightTier, "over_20");

const eindhoven = resolveStep8DestinationZone({
  countryCode: "NL",
  city: "  EINDHOVEN ",
});
const amsterdam = resolveStep8DestinationZone({
  countryCode: "NL",
  city: "Amsterdam",
});
assert.equal(eindhoven.zone, "EINDHOVEN");
assert.equal(amsterdam.zone, "NETHERLANDS_OTHER");
assert.notEqual(eindhoven.zone, amsterdam.zone);
const eindhovenFee = resolveStep8AdditionalDelivery({
  deliveryMethod: "destination_delivery",
  countryCode: "NL",
  city: "eindhoven",
  physicalGarmentCount: 2,
});
const netherlandsFee = resolveStep8AdditionalDelivery({
  deliveryMethod: "destination_delivery",
  countryCode: "NL",
  city: "Amsterdam",
  physicalGarmentCount: 2,
});
assert.equal(eindhovenFee.additionalDeliveryFeeCents, netherlandsFee.additionalDeliveryFeeCents);
assert.equal(eindhovenFee.destinationZone, "EINDHOVEN");
assert.equal(netherlandsFee.destinationZone, "NETHERLANDS_OTHER");

const isoCases: ReadonlyArray<[string, string | null]> = [
  ["NL", "NETHERLANDS_OTHER"],
  ["DE", "EUROPE"],
  ["FR", "EUROPE"],
  ["GB", "EUROPE"],
  ["UK", "EUROPE"],
  ["US", "NORTH_AMERICA"],
  ["CA", "NORTH_AMERICA"],
  ["NG", "AFRICA"],
  ["ZA", "AFRICA"],
  ["JP", "ASIA"],
  ["IN", "ASIA"],
  ["BR", "SOUTH_AMERICA"],
];
for (const [countryCode, zone] of isoCases) {
  const resolved = resolveStep8DestinationZone({ countryCode, city: "Other" });
  assert.equal(resolved.zone, zone, countryCode);
  assert.equal(resolved.quoteRequired, false);
}

const unknown = resolveStep8DestinationZone({ countryCode: "XX", city: "Nowhere" });
assert.equal(unknown.zone, null);
assert.equal(unknown.quoteRequired, true);
const australia = resolveStep8AdditionalDelivery({
  deliveryMethod: "destination_delivery",
  countryCode: "AU",
  city: "Sydney",
  physicalGarmentCount: 2,
});
assert.equal(australia.quoteRequired, true);
assert.equal(australia.additionalDeliveryFeeCents, null);

const otherDestinationRate = resolveStep8AdditionalDelivery({
  deliveryMethod: "destination_delivery",
  countryCode: null,
  city: "Suva",
  physicalGarmentCount: 3,
  destinationSelectionMode: "other_destination",
});
assert.equal(otherDestinationRate.quoteRequired, true);
assert.equal(otherDestinationRate.additionalDeliveryFeeCents, null);
assert.equal(otherDestinationRate.destinationZone, null);
assert.equal(otherDestinationRate.headlineRateCents, null);

for (const option of STEP8_COUNTRY_OPTIONS) {
  const mapped = resolveStep8DestinationZone({
    countryCode: option.code,
    city: option.code === "NL" ? "Amsterdam" : "City",
  });
  assert.equal(isStep8CustomerSelectableCountry(option.code), true, option.code);
  assert.ok(mapped.zone, option.code);
  assert.equal(mapped.quoteRequired, false, option.code);
}
for (const countryCode of STEP8_QUOTE_REQUIRED_COUNTRY_CODES) {
  assert.equal(isStep8CustomerSelectableCountry(countryCode), false, countryCode);
  assert.equal(
    STEP8_COUNTRY_OPTIONS.some((option) => option.code === countryCode),
    false,
    countryCode,
  );
}

const pickup = resolveStep8AdditionalDelivery({
  deliveryMethod: "eindhoven_pickup",
  physicalGarmentCount: 8,
});
assert.equal(pickup.additionalDeliveryFeeCents, STEP8_PICKUP_FEE_CENTS);
assert.equal(pickup.quoteRequired, false);
assert.equal(pickup.destinationZone, "EINDHOVEN");

assert.equal(STEP8_HEADLINE_RATES_CENTS.EINDHOVEN, 975);
assert.equal(STEP8_HEADLINE_RATES_CENTS.EUROPE, 2660);
assert.equal(STEP8_HEADLINE_RATES_CENTS.NORTH_AMERICA, 6080);
assert.equal(STEP8_HEADLINE_RATES_CENTS.AFRICA, 7800);
assert.equal(
  STEP8_ADDITIONAL_DELIVERY_RATES_CENTS.EINDHOVEN["0_2"],
  750,
);

const selectedDesignPrice = calculateSelectedDesignPrice({
  pricingModel: "all_inclusive_garment_construction",
  garmentConstructionSubtotal: 100,
  customDetailsSubtotal: 20,
  eindhovenToDestinationShipping: null,
});
assert.equal(selectedDesignPrice.selectedDesignPrice, 120);
const courier = reconcileFutureShippingState({
  state: {
    ...createEmptyFutureShippingState(),
    fulfilmentMethod: "destination_delivery",
    customerInformation: {
      fullName: "Ada Lovelace",
      phone: "+31 6 1234 5678",
      email: "ada@example.com",
      deliveryAddress: {
        addressLine1: "1 Heritage Way",
        city: "Paris",
        postalCode: "75001",
        countryCode: "FR",
      },
      comment: "",
    },
  },
  garmentCount: 2,
  selectedDesignPrice: selectedDesignPrice.selectedDesignPrice,
});
assert.equal(courier.status, "quote_ready");
assert.equal(courier.postEindhovenAdjustmentCents, 1900);
assert.equal(courier.projectedTotalCents, 12000 + 1900);
assert.notEqual(courier.postEindhovenAdjustmentCents, Math.round(STANDARD_SHIPPING_BATCH_EUR * 100));
assert.notEqual(courier.postEindhovenAdjustmentCents, Math.round(STANDARD_SHIPPING_INDIVIDUAL_EUR * 100));
assert.equal(
  courier.projectedTotalCents,
  Math.round(selectedDesignPrice.selectedDesignPrice! * 100) +
    courier.postEindhovenAdjustmentCents!,
);

assert.equal(calculateIndividualShipping(1).priceEur, STANDARD_SHIPPING_INDIVIDUAL_EUR);
assert.equal(BATCH_FLAT_RATE_EUR_PER_GARMENT, STANDARD_SHIPPING_BATCH_EUR);
assert.equal(
  calculateBatchShipping({
    batchId: "QA-BATCH",
    batchName: "QA Batch",
    plannedGarmentCapacity: 10,
    garmentPieceCount: 1,
  }).priceEur,
  STANDARD_SHIPPING_BATCH_EUR,
);

assert.equal(STEP8_DELIVERY_RATE_VERSION, "step8-delivery-v1");
assert.equal(STEP8_DESTINATION_ZONES.includes("EINDHOVEN"), true);
assert.equal(STEP8_DESTINATION_ZONES.includes("NETHERLANDS_OTHER"), true);

const changedCountry = reconcileFutureShippingState({
  state: {
    ...courier.state,
    customerInformation: {
      ...courier.state.customerInformation,
      deliveryAddress: {
        ...courier.state.customerInformation.deliveryAddress,
        countryCode: "US",
        city: "Boston",
        postalCode: "02108",
        stateRegion: "MA",
      },
    },
  },
  garmentCount: 2,
  selectedDesignPrice: 120,
});
assert.equal(changedCountry.state.destinationZoneId, "NORTH_AMERICA");
assert.equal(changedCountry.postEindhovenAdjustmentCents, 3800);

const changedCount = reconcileFutureShippingState({
  state: courier.state,
  garmentCount: 5,
  selectedDesignPrice: 120,
});
assert.equal(changedCount.parcelWeightKg, 2.5);
assert.equal(changedCount.weightTier, "2_5");
assert.equal(changedCount.postEindhovenAdjustmentCents, 2660);

assert.equal(step8RequiresRegion("US"), true);
assert.equal(step8RequiresRegion("us"), true);
assert.equal(step8RequiresRegion("CA"), true);
assert.equal(step8RequiresRegion("NL"), false);
assert.equal(step8RequiresRegion("FR"), false);
assert.equal(
  formatStep8CustomerDestination({ city: "Paris", countryCode: "FR" }),
  "Paris, France",
);

console.log("PASS: Step 8 additional delivery weight, ISO zones, and rate matrix");
