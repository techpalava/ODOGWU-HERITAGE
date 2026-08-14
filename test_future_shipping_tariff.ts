import assert from "node:assert/strict";
import fs from "node:fs";
import {
  FUTURE_GARMENT_WEIGHT_REFERENCES,
  FUTURE_SHIPPING_TARIFF_RULES,
  type FutureShippingDestinationZone,
} from "./src/config/FutureShippingTariffConfig";
import {
  resolveFutureFinalMileBaseline,
  resolveFutureFinalMileFromGarmentCount,
  resolveFutureGarmentCountWeightReference,
  resolveFuturePendingTariffRule,
} from "./src/utils/futureShippingTariff";
import {
  calculateBatchShipping,
  calculateIndividualShipping,
} from "./src/utils/shippingPricing";
import { calculateSelectedDesignPrice } from "./src/utils/designPricing";

const expectedFinalMileRates: Readonly<
  Record<FutureShippingDestinationZone, number>
> = {
  EINDHOVEN: 975,
  NETHERLANDS_OTHER: 975,
  EUROPE: 2660,
  NORTH_AMERICA: 6080,
  SOUTH_AMERICA: 7800,
  AFRICA: 7800,
  ASIA: 7800,
};

for (const [destinationZoneId, amountCents] of Object.entries(
  expectedFinalMileRates,
) as Array<[FutureShippingDestinationZone, number]>) {
  const result = resolveFutureFinalMileBaseline({
    fulfilmentMethod: "destination_delivery",
    destinationZoneId,
    parcelWeightKg: 4.99,
  });
  assert.equal(result.status, "resolved_baseline");
  assert.equal(result.amountCents, amountCents);
  assert.equal(result.rule?.shippingLeg, "eindhoven_to_final_destination");
  assert.equal(result.rule?.pricingUnit, "per_parcel");
}

assert.deepEqual(
  FUTURE_GARMENT_WEIGHT_REFERENCES.map((reference) => [
    reference.garmentCount,
    reference.weightKg,
  ]),
  [
    [5, 2],
    [12, 5],
    [24, 10],
    [48, 20],
  ],
);
for (const reference of FUTURE_GARMENT_WEIGHT_REFERENCES) {
  assert.deepEqual(
    resolveFutureGarmentCountWeightReference(reference.garmentCount),
    {
      status: "exact",
      garmentCount: reference.garmentCount,
      weightKg: reference.weightKg,
      diagnostic: null,
    },
  );
}

const unresolvedGarmentCount = resolveFutureGarmentCountWeightReference(6);
assert.equal(unresolvedGarmentCount.status, "estimate_pending");
assert.equal(unresolvedGarmentCount.weightKg, null);

for (const weight of [5, 10, 20]) {
  const result = resolveFutureFinalMileBaseline({
    fulfilmentMethod: "destination_delivery",
    destinationZoneId: "EINDHOVEN",
    parcelWeightKg: weight,
  });
  assert.equal(result.status, "quote_required");
  assert.equal(result.amountCents, null);
}

const missingWeight = resolveFutureFinalMileBaseline({
  fulfilmentMethod: "destination_delivery",
  destinationZoneId: "EINDHOVEN",
});
assert.equal(missingWeight.status, "rate_unavailable");
assert.equal(missingWeight.amountCents, null);

const unknownDestination = resolveFutureFinalMileBaseline({
  fulfilmentMethod: "destination_delivery",
  destinationZoneId: "OCEANIA",
  parcelWeightKg: 2,
});
assert.equal(unknownDestination.status, "quote_required");
assert.equal(unknownDestination.amountCents, null);

const pickup = resolveFutureFinalMileBaseline({
  fulfilmentMethod: "eindhoven_pickup",
});
assert.equal(pickup.status, "pickup_fee_pending");
assert.equal(pickup.rule?.shippingLeg, "eindhoven_collection");
assert.equal(pickup.amountCents, null);

const pickupViaGarmentCount = resolveFutureFinalMileFromGarmentCount({
  fulfilmentMethod: "eindhoven_pickup",
  destinationZoneId: "NORTH_AMERICA",
  garmentCount: 5,
});
assert.equal(pickupViaGarmentCount.status, "pickup_fee_pending");
assert.equal(pickupViaGarmentCount.rule?.shippingLeg, "eindhoven_collection");
assert.equal(pickupViaGarmentCount.amountCents, null);

const exactTwoKgDelivery = resolveFutureFinalMileFromGarmentCount({
  fulfilmentMethod: "destination_delivery",
  destinationZoneId: "EUROPE",
  garmentCount: 5,
});
assert.equal(exactTwoKgDelivery.status, "resolved_baseline");
assert.equal(exactTwoKgDelivery.amountCents, 2660);

const exactFiveKgDelivery = resolveFutureFinalMileFromGarmentCount({
  fulfilmentMethod: "destination_delivery",
  destinationZoneId: "EUROPE",
  garmentCount: 12,
});
assert.equal(exactFiveKgDelivery.status, "quote_required");
assert.equal(exactFiveKgDelivery.amountCents, null);

const pendingRuleExpectations = [
  ["future_inbound_individual_lagos_eindhoven", [12500, 13125]],
  ["future_inbound_batch_lagos_eindhoven", undefined],
  ["future_duty_tax_batch_lagos_eindhoven", [300, 350]],
  ["future_duty_tax_individual_lagos_eindhoven", undefined],
] as const;
for (const [ruleId, expectedCandidates] of pendingRuleExpectations) {
  const result = resolveFuturePendingTariffRule(ruleId);
  assert.equal(result.status, "pending_confirmation");
  assert.equal(result.amountCents, null);
  assert.equal(result.rule?.status, "pending_confirmation");
  if (expectedCandidates) {
    assert.deepEqual(result.rule?.candidateAmountsCents, expectedCandidates);
  }
}

const everyUnresolvedResult = [
  unresolvedGarmentCount,
  missingWeight,
  unknownDestination,
  pickup,
  exactFiveKgDelivery,
  ...pendingRuleExpectations.map(([ruleId]) =>
    resolveFuturePendingTariffRule(ruleId),
  ),
];
for (const result of everyUnresolvedResult) {
  if ("amountCents" in result) {
    assert.notEqual(result.amountCents, 0);
  }
}

const finalMileRuleIds = new Set(
  FUTURE_SHIPPING_TARIFF_RULES.filter(
    (rule) => rule.shippingLeg === "eindhoven_to_final_destination",
  ).map((rule) => rule.ruleId),
);
for (const zone of Object.keys(
  expectedFinalMileRates,
) as FutureShippingDestinationZone[]) {
  const result = resolveFutureFinalMileBaseline({
    fulfilmentMethod: "destination_delivery",
    destinationZoneId: zone,
    parcelWeightKg: 2,
  });
  assert.equal(finalMileRuleIds.has(result.rule?.ruleId || ""), true);
  assert.notEqual(result.rule?.shippingLeg, "lagos_to_eindhoven");
}

// The dormant configuration must not alter the currently deployed calculators.
assert.equal(calculateIndividualShipping(1).priceEur, 131.25);
assert.equal(
  calculateBatchShipping({
    batchId: "QA-BATCH",
    batchName: "QA Batch",
    plannedGarmentCapacity: 10,
    garmentPieceCount: 2,
  }).priceEur,
  30.18,
);
const productionSelectedDesignPrice = calculateSelectedDesignPrice({
  preTaxDesignSubtotal: 100,
  taxPercentage: 10,
  lagosToEindhovenShipping: 20,
});
assert.equal(productionSelectedDesignPrice.taxAmount, 10);
assert.equal(productionSelectedDesignPrice.selectedDesignPrice, 130);
assert.equal(productionSelectedDesignPrice.lagosToEindhovenShipping, 20);

const studioSource = fs.readFileSync(
  new URL("./src/components/DesignStudioView.tsx", import.meta.url),
  "utf8",
);
assert.match(studioSource, /journeyMode\s*=\s*["']legacy_five_stage["']/);
assert.doesNotMatch(studioSource, /futureShippingTariff/);

console.log("PASS: dormant future shipping tariff foundation");
