import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { FutureShippingStateV1 } from "./src/types";
import {
  FUTURE_SHIPPING_DESTINATION_ZONE_OPTIONS,
  createEmptyFutureShippingState,
  getStep8OrderSummaryRows,
  isFutureShippingStageUnlocked,
  isFutureShippingStepComplete,
  normalizeFutureShippingState,
  persistFutureShippingState,
  reconcileFutureShippingState,
} from "./src/utils/designStudioFutureShipping";
import { step8RequiresRegion } from "./src/utils/step8AdditionalDelivery";
import {
  STEP8_COUNTRY_OPTIONS,
  STEP8_CUSTOMER_COUNTRY_CATALOG,
  STEP8_CUSTOMER_COUNTRY_GROUPS,
  STEP8_OTHER_DESTINATION_LABEL,
  STEP8_QUOTE_REQUIRED_COUNTRY_CODES,
  isStep8CustomerSelectableCountry,
} from "./src/config/Step8AdditionalDeliveryConfig";

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
  countryCode: string,
  city: string,
  extras: { stateRegion?: string; postalCode?: string } = {},
): FutureShippingStateV1 => ({
  ...withContact(state),
  fulfilmentMethod: "destination_delivery",
  customerInformation: {
    ...withContact(state).customerInformation,
    deliveryAddress: {
      addressLine1: " 1 Heritage Way ",
      addressLine2: " Suite 4 ",
      city,
      stateRegion: extras.stateRegion || "",
      postalCode: extras.postalCode || " 5611 AA ",
      countryCode,
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
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(empty.status, "incomplete");
assert.equal(empty.paymentLocked, true);
assert.equal(empty.quoteRequired, false);

const incompletePickup = reconcileFutureShippingState({
  state: {
    ...createEmptyFutureShippingState(),
    fulfilmentMethod: "eindhoven_pickup",
  },
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(incompletePickup.status, "incomplete");
assert.ok(
  incompletePickup.diagnostics.some((diagnostic) => diagnostic.field === "fullName"),
);

const pickupState: FutureShippingStateV1 = {
  ...withContact(createEmptyFutureShippingState()),
  fulfilmentMethod: "eindhoven_pickup",
};
const pickup = reconcileFutureShippingState({
  state: pickupState,
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(pickup.status, "quote_ready");
assert.equal(pickup.quoteReady, true);
assert.equal(pickup.customerInformationComplete, true);
assert.equal(pickup.formComplete, true);
assert.equal(pickup.formInputsComplete, true);
assert.equal(isFutureShippingStepComplete(pickup), true);
assert.equal(pickup.postEindhovenAdjustmentCents, 0);
assert.equal(pickup.projectedTotalCents, 50000);
assert.equal(pickup.state.quoteReference?.quoteRequired, false);
assert.equal(pickup.diagnostics.some((diagnostic) => diagnostic.field === "addressLine1"), false);

const incompleteDelivery = reconcileFutureShippingState({
  state: {
    ...withContact(createEmptyFutureShippingState()),
    fulfilmentMethod: "destination_delivery",
  },
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(incompleteDelivery.status, "incomplete");
assert.ok(
  incompleteDelivery.diagnostics.some(
    (diagnostic) => diagnostic.field === "addressLine1",
  ),
);
assert.equal(incompleteDelivery.quoteReady, false);

const eindhoven = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "NL", "EINDHOVEN"),
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(eindhoven.status, "quote_ready");
assert.equal(eindhoven.state.destinationZoneId, "EINDHOVEN");
assert.equal(eindhoven.postEindhovenAdjustmentCents, 750);
assert.equal(eindhoven.parcelWeightKg, 1);
assert.equal(eindhoven.weightTier, "0_2");

const netherlands = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "NL", "Amsterdam"),
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(netherlands.state.destinationZoneId, "NETHERLANDS_OTHER");
assert.equal(netherlands.postEindhovenAdjustmentCents, 750);
assert.notEqual(netherlands.state.destinationZoneId, eindhoven.state.destinationZoneId);

const europe = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "FR", "Paris"),
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(europe.status, "quote_ready");
assert.equal(europe.state.destinationZoneId, "EUROPE");
assert.equal(europe.postEindhovenAdjustmentCents, 1900);
assert.equal(europe.projectedTotalCents, 51900);
assert.notEqual(europe.postEindhovenAdjustmentCents, 1509);
assert.notEqual(europe.postEindhovenAdjustmentCents, 13125);

const northAmerica = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "US", "Boston", {
    stateRegion: "MA",
    postalCode: "02108",
  }),
  garmentCount: 6,
  selectedDesignPrice: 500,
});
assert.equal(northAmerica.state.destinationZoneId, "NORTH_AMERICA");
assert.equal(northAmerica.postEindhovenAdjustmentCents, 6080);

const africa = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "NG", "Lagos"),
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(africa.state.destinationZoneId, "AFRICA");
assert.equal(africa.postEindhovenAdjustmentCents, 4875);

const countryChange = reconcileFutureShippingState({
  state: {
    ...eindhoven.state,
    customerInformation: {
      ...eindhoven.state.customerInformation,
      deliveryAddress: {
        ...eindhoven.state.customerInformation.deliveryAddress,
        countryCode: "FR",
        city: "Lyon",
      },
    },
  },
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(countryChange.state.destinationZoneId, "EUROPE");
assert.equal(countryChange.postEindhovenAdjustmentCents, 1900);

const garmentCountChange = reconcileFutureShippingState({
  state: europe.state,
  garmentCount: 5,
  selectedDesignPrice: 500,
});
assert.equal(garmentCountChange.parcelWeightKg, 2.5);
assert.equal(garmentCountChange.weightTier, "2_5");
assert.equal(garmentCountChange.postEindhovenAdjustmentCents, 2660);

const europeThreeKg = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "FR", "Paris"),
  garmentCount: 6,
  selectedDesignPrice: 500,
});
const europeSummaryRows = getStep8OrderSummaryRows(europeThreeKg);
assert.deepEqual(
  europeSummaryRows.map((row) => row.label),
  [
    "Delivery Method",
    "Destination",
    "Estimated Shipment Weight",
    "Additional Delivery",
  ],
);
assert.equal(
  europeSummaryRows.find((row) => row.label === "Delivery Method")?.value,
  "Deliver to an Address",
);
assert.match(
  europeSummaryRows.find((row) => row.label === "Destination")?.value || "",
  /Paris, France/,
);
assert.equal(
  europeSummaryRows.find((row) => row.label === "Estimated Shipment Weight")?.value,
  "3.0 kg",
);
assert.equal(
  europeSummaryRows.find((row) => row.label === "Additional Delivery")?.value,
  "€26.60",
);

const pickupSummaryRows = getStep8OrderSummaryRows(pickup);
assert.deepEqual(
  pickupSummaryRows.map((row) => row.label),
  ["Delivery Method", "Additional Delivery"],
);
assert.equal(pickupSummaryRows[0].value, "Pick Up in Eindhoven");
assert.equal(pickupSummaryRows[1].value, "€0.00");

const quoteRequired = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "AU", "Sydney"),
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(quoteRequired.status, "quote_pending");
assert.equal(quoteRequired.quoteRequired, true);
assert.equal(quoteRequired.quoteReady, false);
assert.equal(quoteRequired.formComplete, false);
assert.equal(quoteRequired.formInputsComplete, true);
assert.equal(isFutureShippingStepComplete(quoteRequired), false);
assert.equal(quoteRequired.postEindhovenAdjustmentCents, null);
assert.equal(quoteRequired.state.destinationSelectionMode, "other_destination");
assert.equal(quoteRequired.state.customerInformation.deliveryAddress.countryCode, "");
assert.match(quoteRequired.state.otherDestinationCountry, /Australia/);
assert.equal(isFutureShippingStepComplete(quoteRequired), false);
const quoteSummaryRows = getStep8OrderSummaryRows(quoteRequired);
assert.equal(
  quoteSummaryRows.find((row) => row.label === "Additional Delivery")?.value,
  "Custom shipping quote required",
);
assert.match(
  quoteSummaryRows.find((row) => row.label === "Destination")?.value || "",
  /Sydney, Australia/,
);

const otherDestination = reconcileFutureShippingState({
  state: {
    ...withDelivery(createEmptyFutureShippingState(), "", "Suva"),
    destinationSelectionMode: "other_destination",
    otherDestinationCountry: " Fiji ",
  },
  garmentCount: 3,
  selectedDesignPrice: 500,
});
assert.equal(otherDestination.status, "quote_pending");
assert.equal(otherDestination.quoteRequired, true);
assert.equal(otherDestination.postEindhovenAdjustmentCents, null);
assert.equal(otherDestination.formComplete, false);
assert.equal(otherDestination.formInputsComplete, true);
assert.equal(isFutureShippingStepComplete(otherDestination), false);
assert.equal(otherDestination.paymentLocked, true);
assert.equal(otherDestination.state.destinationSelectionMode, "other_destination");
assert.equal(otherDestination.state.customerInformation.deliveryAddress.countryCode, "");
assert.equal(otherDestination.state.otherDestinationCountry, "Fiji");
assert.equal(otherDestination.state.destinationZoneId, null);
const otherDestinationSummary = getStep8OrderSummaryRows(otherDestination);
assert.equal(otherDestinationSummary[0].value, "Deliver to an Address");
assert.equal(otherDestinationSummary.find((row) => row.label === "Destination")?.value, "Suva, Fiji");
assert.equal(
  otherDestinationSummary.find((row) => row.label === "Estimated Shipment Weight")?.value,
  "1.5 kg",
);
assert.equal(
  otherDestinationSummary.find((row) => row.label === "Additional Delivery")?.value,
  "Custom shipping quote required",
);
assert.equal(
  JSON.stringify(otherDestination.state).includes("\"OT\""),
  false,
);
assert.equal(JSON.stringify(otherDestination.state).includes("15.09"), false);
assert.equal(JSON.stringify(otherDestination.state).includes("131.25"), false);

const lightEindhoven = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "NL", "Eindhoven"),
  garmentCount: 3,
  selectedDesignPrice: 500,
});
assert.equal(lightEindhoven.state.customerInformation.deliveryAddress.countryCode, "NL");
assert.equal(lightEindhoven.state.destinationSelectionMode, "supported_country");
assert.equal(lightEindhoven.parcelWeightKg, 1.5);
assert.equal(lightEindhoven.postEindhovenAdjustmentCents, 750);

const lightEurope = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "DE", "Berlin"),
  garmentCount: 3,
  selectedDesignPrice: 500,
});
assert.equal(lightEurope.state.customerInformation.deliveryAddress.countryCode, "DE");
assert.equal(lightEurope.postEindhovenAdjustmentCents, 1900);

const lightUs = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "US", "Boston", {
    stateRegion: "MA",
  }),
  garmentCount: 3,
  selectedDesignPrice: 500,
});
assert.equal(lightUs.state.customerInformation.deliveryAddress.countryCode, "US");
assert.equal(lightUs.postEindhovenAdjustmentCents, 3800);

const lightNigeria = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "NG", "Lagos"),
  garmentCount: 3,
  selectedDesignPrice: 500,
});
assert.equal(lightNigeria.state.customerInformation.deliveryAddress.countryCode, "NG");
assert.equal(lightNigeria.postEindhovenAdjustmentCents, 4875);

const heavy = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "DE", "Berlin"),
  garmentCount: 41,
  selectedDesignPrice: 500,
});
assert.equal(heavy.quoteRequired, true);
assert.equal(heavy.postEindhovenAdjustmentCents, null);
assert.equal(heavy.weightTier, "over_20");
assert.equal(heavy.formComplete, false);
assert.equal(heavy.formInputsComplete, true);
assert.equal(isFutureShippingStepComplete(heavy), false);

const supportedHeavy = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "DE", "Berlin"),
  garmentCount: 40,
  selectedDesignPrice: 500,
});
assert.equal(supportedHeavy.parcelWeightKg, 20);
assert.equal(supportedHeavy.weightTier, "10_20");
assert.equal(supportedHeavy.quoteRequired, false);
assert.equal(supportedHeavy.formComplete, true);
assert.equal(isFutureShippingStepComplete(supportedHeavy), true);

const usBlankRegion = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "US", "Boston", {
    postalCode: "02108",
  }),
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(usBlankRegion.status, "incomplete");
assert.equal(usBlankRegion.quoteReady, false);
assert.equal(isFutureShippingStepComplete(usBlankRegion), false);
assert.ok(
  usBlankRegion.diagnostics.some((diagnostic) => diagnostic.field === "stateRegion"),
);

const usWithRegion = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "US", "Boston", {
    stateRegion: "MA",
    postalCode: "02108",
  }),
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(usWithRegion.status, "quote_ready");
assert.equal(
  usWithRegion.diagnostics.some((diagnostic) => diagnostic.field === "stateRegion"),
  false,
);

const caBlankRegion = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "CA", "Toronto", {
    postalCode: "M5V 2T6",
  }),
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.ok(
  caBlankRegion.diagnostics.some((diagnostic) => diagnostic.field === "stateRegion"),
);

const caWithRegion = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "CA", "Toronto", {
    stateRegion: "ON",
    postalCode: "M5V 2T6",
  }),
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(
  caWithRegion.diagnostics.some((diagnostic) => diagnostic.field === "stateRegion"),
  false,
);
assert.equal(caWithRegion.status, "quote_ready");

assert.equal(step8RequiresRegion("US"), true);
assert.equal(step8RequiresRegion("CA"), true);
assert.equal(step8RequiresRegion("NL"), false);
assert.equal(step8RequiresRegion("FR"), false);
assert.equal(
  eindhoven.diagnostics.some((diagnostic) => diagnostic.field === "stateRegion"),
  false,
);
assert.equal(
  europe.diagnostics.some((diagnostic) => diagnostic.field === "stateRegion"),
  false,
);

const persisted = persistFutureShippingState({
  draft: {
    unrelated: { preserved: true },
    currentStageId: "shipping",
  },
  state: europe.state,
});
const roundTrip = JSON.parse(JSON.stringify(persisted));
assert.deepEqual(roundTrip.unrelated, { preserved: true });
assert.equal(
  normalizeFutureShippingState(roundTrip.futureShippingState).state.customerInformation
    .deliveryAddress.countryCode,
  "FR",
);
assert.equal(
  normalizeFutureShippingState(roundTrip.futureShippingState).state.destinationSelectionMode,
  "supported_country",
);
assert.equal(JSON.stringify(roundTrip.futureShippingState).includes("amountCents"), false);
assert.equal(JSON.stringify(roundTrip.futureShippingState).includes("131.25"), false);
assert.equal(JSON.stringify(roundTrip.futureShippingState).includes("15.09"), false);

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const summarySource = readFileSync("src/components/DormantFutureSummaryStep.tsx", "utf8");
const shippingSource = readFileSync("src/components/DormantFutureShippingStep.tsx", "utf8");
const stepperSource = readFileSync("src/components/DesignStudioJourneyStepper.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
assert.match(studioSource, /isFutureShippingStepComplete/);
assert.match(studioSource, /futureStageId === "shipping"/);
assert.match(studioSource, /handleOpenDormantShippingStage/);
assert.match(studioSource, /futureShippingState/);
assert.match(studioSource, /persistFutureShippingState/);
assert.match(studioSource, /prefillFutureShippingContact/);
assert.match(studioSource, /const canRestoreShipping = canRestoreSummary;/);
assert.match(summarySource, /canContinueToShipping/);
assert.match(summarySource, /onContinueToShipping/);
assert.match(summarySource, /Additional Delivery/);
assert.match(stepperSource, /canEnterShipping/);
assert.match(shippingSource, /Delivery &amp; Pickup/);
assert.match(shippingSource, /Pick Up in Eindhoven/);
assert.match(shippingSource, /Deliver to an Address/);
assert.match(shippingSource, /Additional Delivery/);
assert.match(shippingSource, /Free · €0\.00/);
assert.match(shippingSource, /Typical 2–5 kg rate/);
assert.match(shippingSource, /Review Order/);
assert.match(shippingSource, /canContinueToReview/);
assert.match(shippingSource, /disabled/);
assert.match(shippingSource, /aria-live="polite"/);
assert.match(shippingSource, /min-h-11/);
assert.doesNotMatch(shippingSource, /calculateIndividualShipping/);
assert.doesNotMatch(shippingSource, /calculateFinalMileShipping/);
assert.doesNotMatch(shippingSource, /131\.25/);
assert.doesNotMatch(shippingSource, /15\.09/);
assert.match(shippingSource, /Delivery Country/);
assert.match(shippingSource, /STEP8_OTHER_DESTINATION_LABEL/);
assert.match(shippingSource, /optgroup/);
assert.match(shippingSource, /STEP8_CUSTOMER_COUNTRY_GROUPS/);
assert.match(shippingSource, /Shipping to this destination requires a custom quote/);
assert.doesNotMatch(shippingSource, /STEP8_COUNTRY_ZONE_INDEX\.keys/);
assert.doesNotMatch(shippingSource, /Select country/);
assert.match(shippingSource, /stateRegion/);
assert.match(shippingSource, /future-shipping-region-error/);
assert.doesNotMatch(shippingSource, /Destination region/);
assert.equal(appSource.includes("future_nine_stage"), false);
assert.equal(studioSource.includes("legacy_five_stage"), false);

const requiredSelectableCountries = [
  "NL",
  "DE",
  "FR",
  "GB",
  "US",
  "CA",
  "NG",
  "ZA",
  "JP",
  "IN",
  "BR",
];
for (const countryCode of requiredSelectableCountries) {
  assert.equal(isStep8CustomerSelectableCountry(countryCode), true, countryCode);
  assert.ok(
    STEP8_COUNTRY_OPTIONS.some((option) => option.code === countryCode),
    countryCode,
  );
  assert.ok(
    STEP8_CUSTOMER_COUNTRY_CATALOG.some(
      (country) => country.countryCode === countryCode && country.customerSelectable,
    ),
    countryCode,
  );
}
assert.equal(STEP8_CUSTOMER_COUNTRY_GROUPS[0]?.id, "netherlands");
assert.equal(STEP8_CUSTOMER_COUNTRY_GROUPS[0]?.countries[0]?.countryCode, "NL");
assert.equal(STEP8_OTHER_DESTINATION_LABEL, "Other Destination — Request Shipping Quote");
for (const option of STEP8_COUNTRY_OPTIONS) {
  assert.equal(isStep8CustomerSelectableCountry(option.code), true, option.code);
  assert.doesNotMatch(option.code, /^(OT|XX|OTHER)$/);
}
for (const countryCode of STEP8_QUOTE_REQUIRED_COUNTRY_CODES) {
  assert.equal(isStep8CustomerSelectableCountry(countryCode), false, countryCode);
  assert.equal(
    STEP8_COUNTRY_OPTIONS.some((option) => option.code === countryCode),
    false,
    countryCode,
  );
}

console.log("PASS: Step 8 Delivery & Pickup state, completion, and UI contracts");
