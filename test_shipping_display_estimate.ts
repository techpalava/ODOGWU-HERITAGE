import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DormantFutureShippingStep } from "./src/components/DormantFutureShippingStep";
import { STEP8_OVER_20_KG_QUOTE_MESSAGE } from "./src/config/Step8AdditionalDeliveryConfig";
import type { FutureShippingStateV1 } from "./src/types";
import {
  createEmptyFutureShippingState,
  reconcileFutureShippingState,
} from "./src/utils/designStudioFutureShipping";
import {
  INDIVIDUAL_SHIPPING_BLOCK_PRICE_CENTS,
} from "./src/utils/shippingPricing";
import {
  formatIndividualHomepageBlockRate,
  projectShippingDisplayEstimate,
  type ShippingDisplayEstimate,
} from "./src/utils/shippingDisplayEstimate";

const BLOCK = INDIVIDUAL_SHIPPING_BLOCK_PRICE_CENTS;
const SUBTOTAL = 6500;

const emptyAddress = createEmptyFutureShippingState().customerInformation.deliveryAddress;

const deliveryState = (
  countryCode: string,
  city: string,
): FutureShippingStateV1 => {
  const empty = createEmptyFutureShippingState();
  return {
    ...empty,
    fulfilmentMethod: "destination_delivery",
    destinationSelectionMode: countryCode ? "supported_country" : null,
    customerInformation: {
      ...empty.customerInformation,
      deliveryAddress: { ...emptyAddress, countryCode, city },
    },
  };
};

const estimateFor = ({
  orderType = "Individual",
  batchType = null,
  garmentCount,
  countryCode = "FR",
  city = "Paris",
  fulfilmentMethod = "destination_delivery" as const,
  selectedDesignPrice = 65,
  destinationSelectionMode = countryCode ? "supported_country" as const : null,
}: {
  orderType?: string | null;
  batchType?: string | null;
  garmentCount: number;
  countryCode?: string;
  city?: string;
  fulfilmentMethod?: "destination_delivery" | "eindhoven_pickup" | null;
  selectedDesignPrice?: number | null;
  destinationSelectionMode?: "supported_country" | "other_destination" | null;
}): ShippingDisplayEstimate =>
  projectShippingDisplayEstimate({
    orderType,
    batchType,
    garmentCount,
    selectedDesignPrice,
    fulfilmentMethod,
    countryCode,
    city,
    destinationSelectionMode,
  });

assert.equal(
  formatIndividualHomepageBlockRate(),
  "Lagos → Eindhoven €131.25 per 10 garments (under 5 kg)",
);

const quoteSnapshot = (resolution: ReturnType<typeof reconcileFutureShippingState>) => ({
  status: resolution.status,
  quoteRequired: resolution.quoteRequired,
  quoteReady: resolution.quoteReady,
  formComplete: resolution.formComplete,
  postEindhovenAdjustmentCents: resolution.postEindhovenAdjustmentCents,
  projectedTotalCents: resolution.projectedTotalCents,
});

const completeParis = reconcileFutureShippingState({
  state: {
    ...deliveryState("FR", "Paris"),
    customerInformation: {
      ...deliveryState("FR", "Paris").customerInformation,
      fullName: "Ada Lovelace",
      phone: "+31612345678",
      email: "ada@example.com",
      deliveryAddress: {
        ...emptyAddress,
        addressLine1: "1 Heritage Way",
        city: "Paris",
        postalCode: "75001",
        countryCode: "FR",
      },
    },
  },
  garmentCount: 1,
  selectedDesignPrice: 65,
});
const beforeQuote = quoteSnapshot(completeParis);
estimateFor({ garmentCount: 1 });
assert.deepEqual(quoteSnapshot(completeParis), beforeQuote);
assert.equal(completeParis.postEindhovenAdjustmentCents, 1900);
assert.equal(completeParis.projectedTotalCents, 8400);

const one = estimateFor({ garmentCount: 1 });
assert.equal(one.lagosAmountCents, BLOCK);
assert.equal(one.onwardStatus, "resolved");
assert.equal(one.onwardAmountCents, 1900);
assert.equal(one.allInEstimateCents, SUBTOTAL + BLOCK + 1900);
assert.notEqual(one.allInEstimateCents, SUBTOTAL + BLOCK * 2 + 1900);
assert.notEqual(one.allInEstimateCents, SUBTOTAL + 1900);
assert.equal(one.allInEstimateCents, (completeParis.projectedTotalCents ?? 0) + BLOCK);

for (const [count, onward, lagos] of [
  [1, 1900, BLOCK],
  [4, 1900, BLOCK],
  [5, 2660, BLOCK],
  [10, 2660, BLOCK],
  [11, 3724, BLOCK * 2],
  [40, 5214, BLOCK * 4],
] as const) {
  const row = estimateFor({ garmentCount: count });
  assert.equal(row.onwardAmountCents, onward, `onward for ${count}`);
  assert.equal(row.lagosAmountCents, lagos, `lagos for ${count}`);
  assert.equal(row.allInEstimateCents, SUBTOTAL + lagos + onward, `all-in for ${count}`);
  assert.notEqual(row.lagosAmountCents, 1400);
  assert.notEqual(row.onwardAmountCents, 1509);
}

const heavy = estimateFor({ garmentCount: 41 });
assert.equal(heavy.onwardStatus, "unresolved");
assert.equal(heavy.onwardAmountCents, null);
assert.equal(heavy.lagosAmountCents, BLOCK * 5);
assert.equal(heavy.allInEstimateCents, null);
assert.equal(heavy.onwardValueLabel, STEP8_OVER_20_KG_QUOTE_MESSAGE);

const pickup = estimateFor({
  garmentCount: 1,
  fulfilmentMethod: "eindhoven_pickup",
  countryCode: "",
  city: "",
  destinationSelectionMode: null,
});
assert.equal(pickup.onwardStatus, "resolved");
assert.equal(pickup.onwardAmountCents, 0);
assert.equal(pickup.lagosAmountCents, BLOCK);
assert.equal(pickup.allInEstimateCents, SUBTOTAL + BLOCK);
assert.match(pickup.onwardExplanation, /Pickup adds no delivery fee from Eindhoven/);

const pickupEleven = estimateFor({
  garmentCount: 11,
  fulfilmentMethod: "eindhoven_pickup",
  countryCode: "",
  destinationSelectionMode: null,
});
assert.equal(pickupEleven.lagosAmountCents, BLOCK * 2);
assert.equal(pickupEleven.onwardAmountCents, 0);
assert.equal(pickupEleven.allInEstimateCents, SUBTOTAL + BLOCK * 2);

for (const orderType of ["Community", "Group Organizer", "Group Member"] as const) {
  const batchDelivery = estimateFor({ orderType, garmentCount: 1 });
  assert.equal(batchDelivery.lagosAmountCents, null, orderType);
  assert.equal(batchDelivery.onwardAmountCents, 1900, orderType);
  assert.equal(batchDelivery.allInEstimateCents, SUBTOTAL + 1900, orderType);
  assert.notEqual(batchDelivery.allInEstimateCents, SUBTOTAL + 1900 + 1509);
  assert.notEqual(batchDelivery.allInEstimateCents, SUBTOTAL + 1900 + BLOCK);
  const batchPickup = estimateFor({
    orderType,
    garmentCount: 3,
    fulfilmentMethod: "eindhoven_pickup",
    countryCode: "",
    destinationSelectionMode: null,
  });
  assert.equal(batchPickup.lagosAmountCents, null, `${orderType} pickup`);
  assert.equal(batchPickup.onwardAmountCents, 0, `${orderType} pickup`);
  assert.equal(batchPickup.allInEstimateCents, SUBTOTAL, `${orderType} pickup`);
}

const mixedBatch = estimateFor({
  orderType: "Individual",
  batchType: "community",
  garmentCount: 1,
});
assert.equal(mixedBatch.lagosAmountCents, null);
assert.equal(mixedBatch.allInEstimateCents, SUBTOTAL + 1900);

const unknown = estimateFor({
  garmentCount: 1,
  countryCode: "",
  city: "",
  destinationSelectionMode: null,
});
assert.equal(unknown.onwardStatus, "not_yet_estimated");
assert.equal(unknown.onwardAmountCents, null);
assert.equal(unknown.onwardValueLabel, "Not yet estimated");
assert.equal(unknown.lagosAmountCents, BLOCK);
assert.equal(unknown.allInEstimateCents, null);
assert.doesNotMatch(unknown.onwardValueLabel, /€0\.00/);
assert.match(unknown.onwardExplanation, /not treated as €0/);

const noMethod = estimateFor({ garmentCount: 1, fulfilmentMethod: null });
assert.equal(noMethod.onwardStatus, "not_yet_estimated");
assert.equal(noMethod.allInEstimateCents, null);

const australia = estimateFor({ garmentCount: 2, countryCode: "AU", city: "Sydney" });
assert.equal(australia.onwardStatus, "unresolved");
assert.equal(australia.onwardAmountCents, null);
assert.equal(australia.allInEstimateCents, null);
assert.equal(australia.lagosAmountCents, BLOCK);
assert.equal(australia.onwardValueLabel, "Custom shipping quote required");

const otherDestination = estimateFor({
  garmentCount: 1,
  countryCode: "",
  city: "Suva",
  destinationSelectionMode: "other_destination",
});
assert.equal(otherDestination.onwardStatus, "unresolved");
assert.equal(otherDestination.allInEstimateCents, null);

const missingPrice = estimateFor({ garmentCount: 1, selectedDesignPrice: null });
assert.equal(missingPrice.subtotalCents, null);
assert.equal(missingPrice.onwardAmountCents, 1900);
assert.equal(missingPrice.lagosAmountCents, BLOCK);
assert.equal(missingPrice.allInEstimateCents, null);

const invalidCount = estimateFor({ garmentCount: 0 });
assert.equal(invalidCount.lagosAmountCents, null);
assert.equal(invalidCount.onwardStatus, "unresolved");
assert.equal(invalidCount.allInEstimateCents, null);

const renderEstimate = (
  resolution: ReturnType<typeof reconcileFutureShippingState>,
  orderType: string,
  garmentCount: number,
) =>
  renderToStaticMarkup(
    createElement(DormantFutureShippingStep, {
      state: resolution.state,
      resolution,
      selectedDesignPrice: 65,
      garmentCount,
      orderType,
      onChange: () => undefined,
      onRefreshQuote: () => undefined,
      onBack: () => undefined,
      canContinueToReview: resolution.status === "quote_ready",
      onContinueToReview: () => undefined,
    }),
  );

const incompleteParis = reconcileFutureShippingState({
  state: deliveryState("FR", "Paris"),
  garmentCount: 1,
  selectedDesignPrice: 65,
});
assert.equal(incompleteParis.status, "incomplete");
assert.equal(incompleteParis.postEindhovenAdjustmentCents, null);
assert.equal(incompleteParis.projectedTotalCents, null);
assert.equal(incompleteParis.quoteReady, false);
const incompleteBefore = quoteSnapshot(incompleteParis);
const incompleteMarkup = renderEstimate(incompleteParis, "Individual", 1);
assert.deepEqual(quoteSnapshot(incompleteParis), incompleteBefore);
assert.match(incompleteMarkup, /data-shipping-estimate-cents="21525"/);
assert.match(incompleteMarkup, /data-shipping-estimate-role="all-in"/);
assert.match(incompleteMarkup, /data-shipping-onward-cents="1900"/);
assert.match(incompleteMarkup, /Available after delivery is resolved/);
assert.equal(incompleteMarkup.includes('data-shipping-displayed-total-cents="21525"'), false);
assert.equal(incompleteMarkup.includes("data-shipping-displayed-total-cents="), false);
assert.equal(JSON.stringify(incompleteParis.state).includes("21525"), false);
assert.equal(JSON.stringify(incompleteParis.state).includes("13125"), false);

const unknownMarkup = renderEstimate(
  reconcileFutureShippingState({
    state: deliveryState("", ""),
    garmentCount: 1,
    selectedDesignPrice: 65,
  }),
  "Individual",
  1,
);
assert.match(unknownMarkup, /Not yet estimated/);
assert.match(unknownMarkup, /data-shipping-onward-status="not_yet_estimated"/);
assert.equal(unknownMarkup.includes("data-shipping-onward-cents="), false);
assert.equal(unknownMarkup.includes("data-shipping-estimate-cents"), false);
const unknownOnward = unknownMarkup.split('data-shipping-onward-status="not_yet_estimated"')[1]?.split("</p>")[0] || "";
assert.equal(unknownOnward.includes("€0.00"), false);
assert.match(unknownMarkup, /€131\.25/);

const readyIndividual = renderEstimate(completeParis, "Individual", 1);
assert.match(readyIndividual, /data-shipping-displayed-total-cents="21525"/);
assert.match(readyIndividual, /data-shipping-estimate-role="included-in-payable"/);
assert.equal(readyIndividual.includes("data-shipping-estimate-cents"), false);
assert.match(readyIndividual, /€215\.25/);
assert.equal((readyIndividual.match(/€215\.25/g) || []).length, 1);

const readyPickup = reconcileFutureShippingState({
  state: {
    ...createEmptyFutureShippingState(),
    fulfilmentMethod: "eindhoven_pickup",
    customerInformation: {
      ...createEmptyFutureShippingState().customerInformation,
      fullName: "Ada Lovelace",
      phone: "+31612345678",
      email: "ada@example.com",
    },
  },
  garmentCount: 1,
  selectedDesignPrice: 65,
});
assert.equal(readyPickup.postEindhovenAdjustmentCents, 0);
assert.equal(readyPickup.projectedTotalCents, 6500);
const pickupMarkup = renderEstimate(readyPickup, "Individual", 1);
assert.match(pickupMarkup, /data-shipping-displayed-total-cents="19625"/);
assert.match(pickupMarkup, /data-shipping-onward-cents="0"/);
assert.match(pickupMarkup, /data-shipping-estimate-role="included-in-payable"/);
assert.match(pickupMarkup, /€131\.25/);
assert.equal(pickupMarkup.includes("data-shipping-estimate-cents"), false);

const batchPickupMarkup = renderEstimate(readyPickup, "Community", 1);
assert.match(batchPickupMarkup, /data-shipping-displayed-total-cents="6500"/);
assert.equal(batchPickupMarkup.includes("data-shipping-lagos-inbound"), false);
assert.equal(batchPickupMarkup.includes("€131.25"), false);
assert.equal(batchPickupMarkup.includes("15.09"), false);
assert.equal(batchPickupMarkup.includes("€14.00"), false);

const heavyResolution = reconcileFutureShippingState({
  state: {
    ...deliveryState("NL", "Amsterdam"),
    customerInformation: {
      ...deliveryState("NL", "Amsterdam").customerInformation,
      fullName: "Ada Lovelace",
      phone: "+31612345678",
      email: "ada@example.com",
      deliveryAddress: {
        ...emptyAddress,
        addressLine1: "1 Heritage Way",
        city: "Amsterdam",
        postalCode: "1011",
        countryCode: "NL",
      },
    },
  },
  garmentCount: 41,
  selectedDesignPrice: 65,
});
assert.equal(heavyResolution.quoteRequired, true);
assert.equal(heavyResolution.postEindhovenAdjustmentCents, null);
const heavyMarkup = renderEstimate(heavyResolution, "Individual", 41);
assert.match(heavyMarkup, /Over 20 kg/);
assert.equal(heavyMarkup.includes("data-shipping-estimate-cents"), false);
assert.match(heavyMarkup, /data-amount-cents="65625"/);
assert.match(heavyMarkup, /Available after delivery is resolved/);

console.log("test_shipping_display_estimate.ts: all assertions passed");
