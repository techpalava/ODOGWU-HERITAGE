import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  FutureShippingDestinationZone,
  FutureShippingStateV1,
} from "./src/types";
import {
  FUTURE_SHIPPING_DESTINATION_ZONE_OPTIONS,
  createEmptyFutureShippingState,
  isFutureShippingStageUnlocked,
  normalizeFutureShippingState,
  persistFutureShippingState,
  reconcileFutureShippingState,
  refreshFutureShippingQuote,
} from "./src/utils/designStudioFutureShipping";

const withContact = (
  state: FutureShippingStateV1,
): FutureShippingStateV1 => ({
  ...state,
  customerInformation: {
    ...state.customerInformation,
    fullName: " Ada Lovelace ",
    phone: " +31 6 1234 5678 ",
    email: " ada@example.com ",
  },
});

const withDelivery = (
  state: FutureShippingStateV1,
  destinationZoneId: FutureShippingDestinationZone = "EUROPE",
): FutureShippingStateV1 => ({
  ...withContact(state),
  fulfilmentMethod: "destination_delivery",
  destinationZoneId,
  destinationZoneSource: "customer_provisional",
  customerInformation: {
    ...withContact(state).customerInformation,
    deliveryAddress: {
      addressLine1: " 1 Heritage Way ",
      addressLine2: " Suite 4 ",
      city: " Eindhoven ",
      postalCode: " 5611 AA ",
      countryCode: " nl ",
    },
  },
});

assert.equal(isFutureShippingStageUnlocked("ready"), true);
for (const status of [
  "incomplete",
  "invalid",
  "pricing_pending",
  "measurement_calculation_pending",
  "profile_mapping_pending",
] as const) {
  assert.equal(isFutureShippingStageUnlocked(status), false);
}

assert.deepEqual(
  FUTURE_SHIPPING_DESTINATION_ZONE_OPTIONS.map((zone) => zone.id),
  [
    "EINDHOVEN",
    "NETHERLANDS_OTHER",
    "EUROPE",
    "NORTH_AMERICA",
    "SOUTH_AMERICA",
    "AFRICA",
    "ASIA",
  ],
);

const empty = reconcileFutureShippingState({
  state: createEmptyFutureShippingState(),
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(empty.status, "incomplete");
assert.equal(empty.paymentLocked, true);

const incompletePickup = reconcileFutureShippingState({
  state: {
    ...createEmptyFutureShippingState(),
    fulfilmentMethod: "eindhoven_pickup",
  },
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(incompletePickup.status, "incomplete");

const pickupState: FutureShippingStateV1 = {
  ...withContact(createEmptyFutureShippingState()),
  fulfilmentMethod: "eindhoven_pickup",
};
const pickup = reconcileFutureShippingState({
  state: pickupState,
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(pickup.status, "pickup_arrangement_pending");
assert.equal(pickup.customerInformationComplete, true);
assert.equal(pickup.formComplete, true);
assert.equal(pickup.postEindhovenAdjustmentCents, null);
assert.equal(pickup.projectedTotalCents, null);
assert.notEqual(pickup.postEindhovenAdjustmentCents, 0);

const incompleteDelivery = reconcileFutureShippingState({
  state: {
    ...withContact(createEmptyFutureShippingState()),
    fulfilmentMethod: "destination_delivery",
  },
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(incompleteDelivery.status, "incomplete");
assert.ok(
  incompleteDelivery.diagnostics.some(
    (diagnostic) => diagnostic.field === "addressLine1",
  ),
);
assert.ok(
  incompleteDelivery.diagnostics.some(
    (diagnostic) => diagnostic.field === "destinationZoneId",
  ),
);

const expectedRates: Record<FutureShippingDestinationZone, number> = {
  EINDHOVEN: 975,
  NETHERLANDS_OTHER: 975,
  EUROPE: 2660,
  NORTH_AMERICA: 6080,
  SOUTH_AMERICA: 7800,
  AFRICA: 7800,
  ASIA: 7800,
};
for (const [destinationZoneId, expectedCents] of Object.entries(
  expectedRates,
) as Array<[FutureShippingDestinationZone, number]>) {
  const result = reconcileFutureShippingState({
    state: withDelivery(createEmptyFutureShippingState(), destinationZoneId),
    garmentCount: 5,
    selectedDesignPrice: 500,
  });
  assert.equal(result.status, "quote_ready");
  assert.equal(result.postEindhovenAdjustmentCents, expectedCents);
  assert.equal(result.projectedTotalCents, 50000 + expectedCents);
  assert.equal(result.state.quoteReference?.garmentCount, 5);
  assert.equal(result.state.quoteReference?.weightKg, 2);
  assert.equal("amountCents" in (result.state.quoteReference || {}), false);
}

const ready = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState()),
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(ready.status, "quote_ready");
assert.equal(ready.postEindhovenAdjustmentCents, 2660);
assert.equal(ready.projectedTotalCents, 52660);

const contactChange = reconcileFutureShippingState({
  state: {
    ...ready.state,
    customerInformation: {
      ...ready.state.customerInformation,
      fullName: "Grace Hopper",
      comment: "Please call before delivery.\r\nThank you.",
    },
  },
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(contactChange.status, "quote_ready");
assert.equal(contactChange.postEindhovenAdjustmentCents, 2660);
assert.equal(
  contactChange.state.customerInformation.comment,
  "Please call before delivery.\nThank you.",
);

const addressChange = reconcileFutureShippingState({
  state: {
    ...ready.state,
    customerInformation: {
      ...ready.state.customerInformation,
      deliveryAddress: {
        ...ready.state.customerInformation.deliveryAddress,
        city: "Rotterdam",
      },
    },
  },
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(addressChange.status, "quote_stale");
assert.equal(addressChange.postEindhovenAdjustmentCents, null);
const refreshedAddress = refreshFutureShippingQuote({
  state: addressChange.state,
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(refreshedAddress.status, "quote_ready");

const garmentCountChange = reconcileFutureShippingState({
  state: ready.state,
  garmentCount: 12,
  selectedDesignPrice: 500,
});
assert.equal(garmentCountChange.status, "quote_stale");
assert.equal(garmentCountChange.postEindhovenAdjustmentCents, null);

const unsupportedCount = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState()),
  garmentCount: 6,
  selectedDesignPrice: 500,
});
assert.equal(unsupportedCount.status, "quote_pending");
assert.equal(unsupportedCount.postEindhovenAdjustmentCents, null);
assert.notEqual(unsupportedCount.postEindhovenAdjustmentCents, 0);

const staleRule = reconcileFutureShippingState({
  state: {
    ...ready.state,
    quoteReference: {
      ...ready.state.quoteReference!,
      ruleId: "removed-future-rule",
      ruleFingerprint: "old-rule-fingerprint",
    },
  },
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(staleRule.status, "quote_stale");

const pickupWithDormantDelivery = reconcileFutureShippingState({
  state: {
    ...ready.state,
    fulfilmentMethod: "eindhoven_pickup",
  },
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(pickupWithDormantDelivery.status, "pickup_arrangement_pending");
assert.equal(pickupWithDormantDelivery.postEindhovenAdjustmentCents, null);
assert.equal(pickupWithDormantDelivery.state.quoteReference, null);
assert.equal(
  pickupWithDormantDelivery.state.customerInformation.deliveryAddress.city,
  "Eindhoven",
);
const returnedToDelivery = reconcileFutureShippingState({
  state: {
    ...pickupWithDormantDelivery.state,
    fulfilmentMethod: "destination_delivery",
  },
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(returnedToDelivery.status, "quote_ready");
assert.equal(returnedToDelivery.state.customerInformation.deliveryAddress.city, "Eindhoven");

const malformed = reconcileFutureShippingState({
  state: {
    schemaVersion: 1,
    fulfilmentMethod: "destination_delivery",
    customerInformation: { fullName: 123 },
    destinationZoneId: "OCEANIA",
  },
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(malformed.status, "invalid");
assert.equal(malformed.postEindhovenAdjustmentCents, null);

const persisted = persistFutureShippingState({
  draft: {
    unrelated: { preserved: true },
    currentStageId: "shipping",
  },
  state: ready.state,
});
const roundTrip = JSON.parse(JSON.stringify(persisted));
assert.deepEqual(roundTrip.unrelated, { preserved: true });
assert.equal(roundTrip.currentStageId, "shipping");
assert.equal(
  normalizeFutureShippingState(roundTrip.futureShippingState).state.quoteReference
    ?.ruleId,
  ready.state.quoteReference?.ruleId,
);
assert.equal(JSON.stringify(roundTrip.futureShippingState).includes("amountCents"), false);

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const summarySource = readFileSync("src/components/DormantFutureSummaryStep.tsx", "utf8");
const shippingSource = readFileSync("src/components/DormantFutureShippingStep.tsx", "utf8");
const stepperSource = readFileSync("src/components/DesignStudioJourneyStepper.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
assert.match(studioSource, /futureStageId === "shipping"/);
assert.match(studioSource, /handleOpenDormantShippingStage/);
assert.match(studioSource, /futureShippingState/);
assert.match(studioSource, /persistFutureShippingState/);
assert.match(studioSource, /const canRestoreShipping = canRestoreSummary;/);
assert.match(
  studioSource,
  /guestDraftHydrated \|\|[\s\S]*?isLoadingData[\s\S]*?styles\.length === 0[\s\S]*?fabrics\.length === 0[\s\S]*?normalizedGarmentTypeCatalog\.length === 0/,
);
assert.match(summarySource, /canContinueToShipping/);
assert.match(summarySource, /onContinueToShipping/);
assert.match(stepperSource, /canEnterShipping/);
assert.match(stepperSource, /onSelectShipping/);
assert.match(
  shippingSource,
  /Lagos-to-Eindhoven shipping: Included in Garment Construction\./,
);
assert.match(shippingSource, /Collect in Eindhoven/);
assert.match(shippingSource, /Deliver to another location/);
assert.match(shippingSource, /Pending confirmation/);
assert.match(shippingSource, /Review Order/);
assert.match(shippingSource, /canContinueToReview/);
assert.match(shippingSource, /onContinueToReview/);
assert.match(shippingSource, /disabled/);
assert.match(shippingSource, /aria-live="polite"/);
assert.match(shippingSource, /min-h-11/);
assert.doesNotMatch(shippingSource, /calculateIndividualShipping/);
assert.doesNotMatch(shippingSource, /calculateFinalMileShipping/);
assert.doesNotMatch(shippingSource, /€0\.00/);
assert.equal(appSource.includes("future_nine_stage"), false);
assert.equal(studioSource.includes("legacy_five_stage"), false);

console.log("PASS: dormant future Shipping state and Step 8 integration");
