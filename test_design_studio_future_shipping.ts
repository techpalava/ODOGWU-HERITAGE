import { COMMUNITY_BATCH_CLOSED_REVIEW_MESSAGE } from "./src/utils/communityBatchOrderClosure";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { DormantFutureShippingStep } from "./src/components/DormantFutureShippingStep";
import type { FutureShippingStateV1 } from "./src/types";
import {
  DEFAULT_FUTURE_PICKUP_LOCATION,
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
      // Step 9 requires a region for every destination delivery.
      stateRegion: extras.stateRegion ?? " Test Region ",
      postalCode: extras.postalCode || " 5611 AA ",
      countryCode,
    },
  },
});

assert.equal(isFutureShippingStageUnlocked("ready"), true);
assert.equal(
  isFutureShippingStageUnlocked("pricing_pending"),
  true,
  "personalized evaluation pending must still unlock Delivery from Summary",
);
for (const status of [
  "incomplete",
  "invalid",
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
assert.equal(pickup.state.pickupLocation, DEFAULT_FUTURE_PICKUP_LOCATION);

const pickupFromAdmin = reconcileFutureShippingState({
  state: pickupState,
  garmentCount: 2,
  selectedDesignPrice: 500,
  defaultPickupLocation: "  Atelier Front Desk  ",
});
assert.equal(pickupFromAdmin.state.pickupLocation, "Atelier Front Desk");

const pickupFromLegacyAdmin = reconcileFutureShippingState({
  state: pickupState,
  garmentCount: 2,
  selectedDesignPrice: 500,
  defaultPickupLocation: "  Veldhoven Campus Lockers  ",
});
assert.equal(pickupFromLegacyAdmin.state.pickupLocation, DEFAULT_FUTURE_PICKUP_LOCATION);

const pickupFromLegacySnapshot = reconcileFutureShippingState({
  state: { ...pickupState, pickupLocation: "veldhoven campus lockers" },
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(pickupFromLegacySnapshot.state.pickupLocation, DEFAULT_FUTURE_PICKUP_LOCATION);

const pickupPreservesSnapshot = reconcileFutureShippingState({
  state: { ...pickupState, pickupLocation: "Snapshotted Venue" },
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(pickupPreservesSnapshot.state.pickupLocation, "Snapshotted Venue");

const deliveryClearsPickup = reconcileFutureShippingState({
  state: withDelivery(
    { ...withContact(createEmptyFutureShippingState()), pickupLocation: "Should Clear" },
    "NL",
    "Eindhoven",
  ),
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(deliveryClearsPickup.state.pickupLocation, "");
assert.equal(deliveryClearsPickup.status, "quote_ready");

const commentTrailingSpace = reconcileFutureShippingState({
  state: {
    ...pickupState,
    customerInformation: {
      ...pickupState.customerInformation,
      comment: "Leave at desk ",
    },
  },
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(commentTrailingSpace.status, "quote_ready");
assert.equal(
  commentTrailingSpace.state.customerInformation.comment,
  "Leave at desk ",
  "live reconcile must keep trailing spaces so spacebar works while typing",
);

const commentMultiWord = reconcileFutureShippingState({
  state: {
    ...pickupState,
    customerInformation: {
      ...pickupState.customerInformation,
      comment: "Call before pickup",
    },
  },
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(
  commentMultiWord.state.customerInformation.comment,
  "Call before pickup",
);

const whitespaceOnlyName = reconcileFutureShippingState({
  state: {
    ...createEmptyFutureShippingState(),
    fulfilmentMethod: "eindhoven_pickup",
    customerInformation: {
      ...createEmptyFutureShippingState().customerInformation,
      fullName: "   ",
      phone: "+31612345678",
      email: "ada@example.com",
    },
  },
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(whitespaceOnlyName.status, "incomplete");
assert.ok(
  whitespaceOnlyName.diagnostics.some((diagnostic) => diagnostic.field === "fullName"),
);

const reconcilePickupContact = (
  contact: Partial<FutureShippingStateV1["customerInformation"]>,
) =>
  reconcileFutureShippingState({
    state: {
      ...withContact(createEmptyFutureShippingState()),
      fulfilmentMethod: "eindhoven_pickup",
      customerInformation: {
        ...withContact(createEmptyFutureShippingState()).customerInformation,
        ...contact,
      },
    },
    garmentCount: 2,
    selectedDesignPrice: 500,
  });

const invalidEmail = reconcilePickupContact({ email: "not-an-email" });
assert.equal(invalidEmail.status, "invalid");
assert.ok(
  invalidEmail.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "INVALID_EMAIL" &&
      diagnostic.field === "email" &&
      diagnostic.message === "Enter a valid email address.",
  ),
);
assert.equal(isFutureShippingStepComplete(invalidEmail), false);

for (const phone of ["abc", "123", "()", "---"]) {
  const invalidPhone = reconcilePickupContact({ phone });
  assert.equal(invalidPhone.status, "invalid", phone);
  assert.ok(
    invalidPhone.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "INVALID_PHONE" &&
        diagnostic.field === "phone" &&
        diagnostic.message ===
          "Enter a valid WhatsApp number with country code (e.g. +31 6 12345678).",
    ),
    phone,
  );
  assert.equal(isFutureShippingStepComplete(invalidPhone), false, phone);
}

const blankPhone = reconcilePickupContact({ phone: "   " });
assert.equal(blankPhone.status, "incomplete");
assert.ok(
  blankPhone.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "REQUIRED_FIELD" && diagnostic.field === "phone",
  ),
);
assert.equal(
  blankPhone.diagnostics.some((diagnostic) => diagnostic.code === "INVALID_PHONE"),
  false,
);

const compactInternationalPhone = reconcilePickupContact({ phone: "+31612345678" });
assert.equal(compactInternationalPhone.status, "quote_ready");
assert.equal(isFutureShippingStepComplete(compactInternationalPhone), true);
assert.equal(
  pickup.state.customerInformation.phone,
  " +31 6 1234 5678 ",
  "existing withContact keeps the spaced international phone",
);
assert.equal(pickup.status, "quote_ready");
assert.equal(isFutureShippingStepComplete(pickup), true);

const persistedTrimmedComment = persistFutureShippingState({
  draft: { id: "draft-1" },
  state: {
    ...pickupState,
    customerInformation: {
      ...pickupState.customerInformation,
      fullName: " Ada Lovelace ",
      comment: "Leave at desk ",
    },
  },
});
assert.equal(
  persistedTrimmedComment.futureShippingState.customerInformation.fullName,
  "Ada Lovelace",
);
assert.equal(
  persistedTrimmedComment.futureShippingState.customerInformation.comment,
  "Leave at desk",
);

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
    "Shipping",
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
  europeSummaryRows.find((row) => row.label === "Shipping")?.value,
  "€26.60",
);

const pickupSummaryRows = getStep8OrderSummaryRows(pickup);
assert.deepEqual(
  pickupSummaryRows.map((row) => row.label),
  ["Delivery Method", "Pickup location"],
);
assert.equal(pickupSummaryRows[0].value, "Pick Up in Eindhoven");
assert.equal(pickupSummaryRows[1].value, DEFAULT_FUTURE_PICKUP_LOCATION);
assert.equal(
  pickupSummaryRows.some((row) => row.label === "Shipping"),
  false,
  "collection must not render a misleading €0 shipping row",
);

const pickupAdminSummaryRows = getStep8OrderSummaryRows(pickupFromAdmin);
assert.equal(
  pickupAdminSummaryRows.find((row) => row.label === "Pickup location")?.value,
  "Atelier Front Desk",
);

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
  quoteSummaryRows.find((row) => row.label === "Shipping")?.value,
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
  otherDestinationSummary.find((row) => row.label === "Shipping")?.value,
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
    stateRegion: "",
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
    stateRegion: "",
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

// Region is required for every destination delivery, not only US/CA.
const blankRegionCases = [
  { name: "NL Eindhoven", countryCode: "NL", city: "Eindhoven" },
  { name: "NL Amsterdam", countryCode: "NL", city: "Amsterdam" },
  { name: "FR Paris", countryCode: "FR", city: "Paris" },
];
for (const blankCase of blankRegionCases) {
  const blankRegion = reconcileFutureShippingState({
    state: withDelivery(
      createEmptyFutureShippingState(),
      blankCase.countryCode,
      blankCase.city,
      { stateRegion: "  " },
    ),
    garmentCount: 2,
    selectedDesignPrice: 500,
  });
  assert.equal(blankRegion.status, "incomplete", blankCase.name);
  assert.equal(blankRegion.formInputsComplete, false, blankCase.name);
  assert.equal(isFutureShippingStepComplete(blankRegion), false, blankCase.name);
  assert.equal(
    blankRegion.diagnostics.find((diagnostic) => diagnostic.field === "stateRegion")
      ?.message,
    "Enter the state, province, or region.",
    blankCase.name,
  );
}
const nlWithRegion = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "NL", "Eindhoven", {
    stateRegion: "Noord-Brabant",
  }),
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(nlWithRegion.status, "quote_ready");
assert.equal(isFutureShippingStepComplete(nlWithRegion), true);
assert.equal(nlWithRegion.state.destinationZoneId, "EINDHOVEN");

const otherDestinationBlankRegion = reconcileFutureShippingState({
  state: {
    ...withDelivery(createEmptyFutureShippingState(), "", "Suva", { stateRegion: "" }),
    destinationSelectionMode: "other_destination",
    otherDestinationCountry: " Fiji ",
  },
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(otherDestinationBlankRegion.formInputsComplete, false);
assert.ok(
  otherDestinationBlankRegion.diagnostics.some(
    (diagnostic) => diagnostic.field === "stateRegion",
  ),
  "other_destination must also require a region",
);

const blankCityRegion = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "NL", "", { stateRegion: "" }),
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.ok(blankCityRegion.diagnostics.some((diagnostic) => diagnostic.field === "city"));
assert.ok(
  blankCityRegion.diagnostics.some((diagnostic) => diagnostic.field === "stateRegion"),
);
assert.equal(isFutureShippingStepComplete(blankCityRegion), false);

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
const remountedShipping = reconcileFutureShippingState({
  state: normalizeFutureShippingState(roundTrip.futureShippingState).state,
  garmentCount: 2,
  selectedDesignPrice: 500,
});
assert.equal(remountedShipping.state.fulfilmentMethod, "destination_delivery");
assert.equal(
  remountedShipping.postEindhovenAdjustmentCents,
  europe.postEindhovenAdjustmentCents,
);
assert.equal(remountedShipping.projectedTotalCents, europe.projectedTotalCents);
assert.equal(
  getStep8OrderSummaryRows(remountedShipping).find((row) => row.label === "Shipping")
    ?.value,
  getStep8OrderSummaryRows(europe).find((row) => row.label === "Shipping")?.value,
  "remount preserves the selected shipping amount without serializing a derived rate",
);

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const summarySource = readFileSync("src/components/DormantFutureSummaryStep.tsx", "utf8");
const shippingSource = readFileSync("src/components/DormantFutureShippingStep.tsx", "utf8");
const stepperSource = readFileSync("src/components/DesignStudioJourneyStepper.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
assert.match(studioSource, /isFutureShippingStepComplete/);
assert.match(
  studioSource,
  /canContinueToReview=\{isFutureShippingStepComplete\(\s*futureShippingResolution,\s*\)\}/,
  "Review Order follows delivery completion and does not lock for personalised price evaluation",
);
assert.match(
  studioSource,
  /priceEvaluationPending=\{futureSummary\.status === "pricing_pending"\}/,
);
assert.match(
  studioSource,
  /onEditPersonalizedAdditions=\{\(\) =>\s*navigateToFutureStage\("personalized_additions"\)\s*\}/,
);
assert.match(studioSource, /futureStageId === "shipping"/);
assert.match(studioSource, /handleOpenDormantShippingStage/);
assert.match(studioSource, /futureShippingState/);
assert.match(studioSource, /persistFutureShippingState/);
assert.match(studioSource, /prefillFutureShippingContact/);
assert.match(studioSource, /const canRestoreShipping = canRestoreSummary;/);
assert.match(summarySource, /canContinueToShipping/);
assert.match(summarySource, /onContinueToShipping/);
assert.match(
  summarySource,
  /summary\.status === "pricing_pending"/,
  "Summary continue note must special-case pricing_pending once Delivery is unlocked",
);
assert.match(
  summarySource,
  /Exact totals update after personalised evaluation/,
);
assert.match(summarySource, /Cost Breakdown/);
assert.match(stepperSource, /canEnterShipping/);
assert.match(shippingSource, /placeholder="\+31 6 12345678"/);
assert.match(shippingSource, /Include country code for WhatsApp\./);
assert.match(shippingSource, /future-shipping-phone-hint/);
assert.match(shippingSource, /shownError\("phone"\)/);
assert.match(shippingSource, /shownError\("email"\)/);
assert.match(shippingSource, /revealField\("phone"\)/);
assert.match(shippingSource, /revealField\("email"\)/);
assert.match(shippingSource, /reviewAttempted/);
assert.match(shippingSource, /focusShippingField\(firstInvalid\)/);
assert.match(shippingSource, /Delivery &amp; Pickup/);
assert.match(shippingSource, /Pick Up in Eindhoven/);
assert.match(shippingSource, /Deliver to an Address/);
assert.match(shippingSource, /Cost Breakdown/);
assert.match(shippingSource, /Free · €0\.00/);
assert.match(shippingSource, /Typical 2–5 kg rate/);
assert.match(shippingSource, /Review Order/);
assert.match(shippingSource, /canContinueToReview/);
assert.match(shippingSource, /priceEvaluationPending/);
assert.match(shippingSource, /onEditPersonalizedAdditions/);
assert.match(
  shippingSource,
  /data-future-shipping-price-evaluation-pending="true"/,
);
assert.match(
  shippingSource,
  /id="future-payment-lock-reason"[\s\S]*priceEvaluationPending && canContinueToReview\s*\?\s*"Your order review is ready\. The total today is the base garment\. Personalized additions are reviewed after you order\."/,
  "a pending personalised price evaluation must not be described as locking Review Order",
);
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
assert.doesNotMatch(shippingSource, /\(if applicable\)/);
assert.doesNotMatch(shippingSource, /step8RequiresRegion/);
assert.match(shippingSource, /const regionRequired = isDelivery;/);
assert.match(shippingSource, /The city must be in the selected country\./);
assert.match(shippingSource, /exactly selects the local Eindhoven shipping rate/);
assert.match(shippingSource, /data-delivery-address-check="true"/);
assert.match(shippingSource, /Check this matches the courier address before continuing\./);
assert.match(
  shippingSource,
  /displayedTotalCents === null\s*\?\s*"min-w-0 font-serif text-sm font-semibold sm:text-base"/,
  "pending total copy must be smaller than the euro Total",
);
assert.match(
  studioSource,
  /<DormantFutureShippingStep[\s\S]*?orderType=\{futureOrderIdentity\?\.orderType \?\? ctx\.orderType\}/,
  "Delivery & Pickup receives the same order type as the other total surfaces",
);
assert.match(shippingSource, /"shrink-0 font-serif text-2xl font-bold sm:text-3xl"/);
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

const renderShippingStep = (
  resolution: ReturnType<typeof reconcileFutureShippingState>,
  canContinueToReview: boolean,
  priceEvaluationPending = false,
) =>
  renderToStaticMarkup(
    createElement(DormantFutureShippingStep, {
      state: resolution.state,
      resolution,
      selectedDesignPrice: 500,
      garmentCount: 2,
      onChange: () => undefined,
      onRefreshQuote: () => undefined,
      onBack: () => undefined,
      canContinueToReview,
      priceEvaluationPending,
      onContinueToReview: () => undefined,
    }),
  );

const reviewOrderButtons = (markup: string) =>
  [...markup.matchAll(/<button\b[^>]*aria-label="Review Order"[^>]*>/g)].map(
    (match) => match[0],
  );

const pickupMarkup = renderShippingStep(pickup, true);
assert.match(
  pickupMarkup,
  /data-testid="future-shipping-pickup-location"[\s\S]*?<h4 class="font-serif text-lg font-bold text-heritage-green">\s*Pickup location\s*<\/h4>/,
);
assert.match(pickupMarkup, /placeholder="\+31 6 12345678"/);
assert.match(pickupMarkup, /id="future-shipping-phone-hint"/);
assert.match(pickupMarkup, /Include country code for WhatsApp\./);
assert.match(pickupMarkup, /aria-describedby="future-shipping-phone-hint"/);
assert.equal(pickupMarkup.includes("Enter a valid WhatsApp number"), false);
assert.equal(pickupMarkup.includes("Enter a valid email address."), false);
const enabledReviewButtons = reviewOrderButtons(pickupMarkup);
assert.ok(enabledReviewButtons.length >= 1);
assert.ok(
  enabledReviewButtons.every((button) => !button.includes('disabled=""')),
);

const evaluationPendingMarkup = renderShippingStep(pickup, true, true);
assert.match(evaluationPendingMarkup, /Evaluation pending/);
assert.match(
  evaluationPendingMarkup,
  /Review Order is available\./,
);
assert.equal(
  evaluationPendingMarkup.includes(
    "Review Order is locked until personalised price evaluation is resolved",
  ),
  false,
);
assert.match(
  evaluationPendingMarkup,
  /The total today is the base garment\. Personalized additions are reviewed after you order\./,
);
const evaluationPendingReviewButtons = reviewOrderButtons(evaluationPendingMarkup);
assert.ok(evaluationPendingReviewButtons.length >= 1);
assert.ok(
  evaluationPendingReviewButtons.every((button) => !button.includes('disabled=""')),
  "a described personalised requirement must not disable Review Order when delivery is complete",
);

const invalidPhoneMarkup = renderShippingStep(
  reconcilePickupContact({ phone: "abc" }),
  false,
);
assert.equal(invalidPhoneMarkup.includes("future-shipping-phone-error"), false);
assert.equal(invalidPhoneMarkup.includes('aria-invalid="true"'), false);
assert.equal(
  invalidPhoneMarkup.includes("Enter a valid WhatsApp number"),
  false,
);
assert.match(invalidPhoneMarkup, /id="future-shipping-phone-hint"/);
const blockedPhoneReviewButtons = reviewOrderButtons(invalidPhoneMarkup);
assert.ok(blockedPhoneReviewButtons.length >= 1);
assert.ok(
  blockedPhoneReviewButtons.every((button) => button.includes('aria-disabled="true"')),
);
assert.ok(
  blockedPhoneReviewButtons.every(
    (button) => !/(^|\s)disabled(=|\s|>)/.test(button),
  ),
  "a locked Review Order stays clickable so the attempt can reveal errors",
);

const invalidEmailMarkup = renderShippingStep(invalidEmail, false);
assert.equal(invalidEmailMarkup.includes("future-shipping-email-error"), false);
assert.equal(invalidEmailMarkup.includes("Enter a valid email address."), false);
const blockedEmailReviewButtons = reviewOrderButtons(invalidEmailMarkup);
assert.ok(blockedEmailReviewButtons.length >= 1);
assert.ok(
  blockedEmailReviewButtons.every((button) => button.includes('aria-disabled="true"')),
);

const deliveryMarkup = renderShippingStep(deliveryClearsPickup, true);
assert.match(deliveryMarkup, /placeholder="\+31 6 12345678"/);
assert.equal(deliveryMarkup.includes("Include country code for WhatsApp."), false);
assert.equal(deliveryMarkup.includes('id="future-shipping-phone-hint"'), false);
assert.match(
  pickupMarkup,
  /Garment construction already includes fabric, tax, Standard Shipping to Eindhoven, and sewing\./,
);
assert.equal(pickupMarkup.includes("data-shipping-lagos-inbound"), false);
assert.match(pickupMarkup, /€500\.00/);

const renderPricedShippingStep = (
  resolution: ReturnType<typeof reconcileFutureShippingState>,
  orderType: string,
) =>
  renderToStaticMarkup(
    createElement(DormantFutureShippingStep, {
      state: resolution.state,
      resolution,
      selectedDesignPrice: 65,
      garmentCount: 1,
      orderType,
      onChange: () => undefined,
      onRefreshQuote: () => undefined,
      onBack: () => undefined,
      canContinueToReview: true,
      onContinueToReview: () => undefined,
    }),
  );

const individualPickupQuote = reconcileFutureShippingState({
  state: pickupState,
  garmentCount: 1,
  selectedDesignPrice: 65,
});
assert.equal(individualPickupQuote.postEindhovenAdjustmentCents, 0);
assert.equal(individualPickupQuote.projectedTotalCents, 6500);
const individualPickupMarkup = renderPricedShippingStep(
  individualPickupQuote,
  "Individual",
);
assert.match(individualPickupMarkup, /data-shipping-lagos-inbound="true"/);
assert.match(individualPickupMarkup, /data-amount-cents="1400"/);
assert.match(individualPickupMarkup, /Lagos → Eindhoven shipping/);
assert.match(individualPickupMarkup, /€14\.00/);
assert.match(individualPickupMarkup, /€65\.00/);
assert.match(individualPickupMarkup, /data-shipping-displayed-total-cents="7900"/);
assert.match(individualPickupMarkup, /€79\.00/);
assert.match(individualPickupMarkup, /Includes fabric, tax, and sewing\./);
assert.match(
  individualPickupMarkup,
  /Lagos → Eindhoven shipping is added to the total\./,
);
assert.equal(individualPickupMarkup.includes(">Included<"), false);
assert.equal(
  individualPickupMarkup.includes("already included"),
  false,
);
assert.equal(
  individualPickupMarkup.includes("already includes"),
  false,
);
assert.equal(
  individualPickupMarkup.includes(
    "Garment construction already includes fabric, tax, Standard Shipping to Eindhoven, and sewing.",
  ),
  false,
);

const parisDelivery = reconcileFutureShippingState({
  state: withDelivery(createEmptyFutureShippingState(), "FR", "Paris"),
  garmentCount: 1,
  selectedDesignPrice: 65,
});
assert.equal(parisDelivery.postEindhovenAdjustmentCents, 1900);
assert.equal(parisDelivery.projectedTotalCents, 8400);
const parisMarkup = renderPricedShippingStep(parisDelivery, "Individual");
assert.match(parisMarkup, /data-amount-cents="1400"/);
assert.match(parisMarkup, /€14\.00/);
assert.match(parisMarkup, /€19\.00/);
assert.match(parisMarkup, /data-shipping-displayed-total-cents="9800"/);
assert.match(parisMarkup, /€98\.00/);
assert.equal(parisMarkup.includes(">Included<"), false);
assert.equal(parisMarkup.includes("already included"), false);

const communityPickupMarkup = renderPricedShippingStep(
  individualPickupQuote,
  "Community",
);
assert.equal(communityPickupMarkup.includes("data-shipping-lagos-inbound"), false);
assert.equal(communityPickupMarkup.includes("€14.00"), false);
assert.match(communityPickupMarkup, /data-shipping-displayed-total-cents="6500"/);
assert.match(communityPickupMarkup, /€65\.00/);
assert.match(
  communityPickupMarkup,
  /Garment construction already includes fabric, tax, Standard Shipping to Eindhoven, and sewing\./,
);
assert.match(
  communityPickupMarkup,
  /Standard Shipping to Eindhoven is already included\./,
);

const focusedShippingFields: string[] = [];
const previousDocument = globalThis.document;
globalThis.document = {
  getElementById(id: string) {
    return {
      focus() {
        focusedShippingFields.push(id);
      },
      scrollIntoView() {
        return undefined;
      },
    } as unknown as HTMLElement;
  },
} as unknown as Document;

const mountShipping = (
  resolution: ReturnType<typeof reconcileFutureShippingState>,
  canContinueToReview: boolean,
) => {
  let continued = false;
  let renderer: ReactTestRenderer | null = null;
  act(() => {
    renderer = create(
      createElement(DormantFutureShippingStep, {
        state: resolution.state,
        resolution,
        selectedDesignPrice: 65,
        garmentCount: 1,
        orderType: "Individual",
        onChange: () => undefined,
        onRefreshQuote: () => undefined,
        onBack: () => undefined,
        canContinueToReview,
        onContinueToReview: () => {
          continued = true;
        },
      }),
    );
  });
  if (!renderer) throw new Error("Expected the shipping step to render.");
  const view = renderer;
  const text = () => JSON.stringify(view.toJSON());
  const reviewButtons = () =>
    view.root.findAll((node) => node.props?.["aria-label"] === "Review Order");
  return {
    text,
    reviewButtons,
    continued: () => continued,
    blur(id: string) {
      const field = view.root.findAll((node) => node.props?.id === id)[0];
      if (!field) throw new Error(`Missing shipping field ${id}`);
      act(() => {
        field.props.onBlur();
      });
    },
  };
};

const freshShipping = mountShipping(empty, false);
assert.equal(freshShipping.text().includes("Choose pickup or delivery."), false);
assert.equal(freshShipping.text().includes("Enter the recipient's full name."), false);
focusedShippingFields.length = 0;
act(() => {
  freshShipping.reviewButtons()[0]?.props.onClick();
});
assert.match(freshShipping.text(), /Choose pickup or delivery\./);
assert.equal(focusedShippingFields[0], "future-shipping-fulfilment");
assert.equal(freshShipping.continued(), false);

const untouchedPickup = mountShipping(incompletePickup, false);
assert.equal(untouchedPickup.text().includes("Enter the recipient's full name."), false);
assert.equal(untouchedPickup.text().includes("Enter a phone contact."), false);
assert.equal(untouchedPickup.text().includes("Enter an email address."), false);
focusedShippingFields.length = 0;
act(() => {
  untouchedPickup.reviewButtons()[0]?.props.onClick();
});
assert.match(untouchedPickup.text(), /Enter the recipient's full name\./);
assert.match(untouchedPickup.text(), /Enter a phone contact\./);
assert.match(untouchedPickup.text(), /Enter an email address\./);
assert.equal(focusedShippingFields[0], "future-shipping-full-name");
assert.equal(untouchedPickup.continued(), false);

const blurredPhone = mountShipping(reconcilePickupContact({ phone: "abc" }), false);
assert.equal(blurredPhone.text().includes("Enter a valid WhatsApp number"), false);
blurredPhone.blur("future-shipping-phone");
assert.match(
  blurredPhone.text(),
  /Enter a valid WhatsApp number with country code \(e\.g\. \+31 6 12345678\)\./,
);
assert.equal(blurredPhone.continued(), false);

const blurredEmail = mountShipping(invalidEmail, false);
assert.equal(blurredEmail.text().includes("Enter a valid email address."), false);
blurredEmail.blur("future-shipping-email");
assert.match(blurredEmail.text(), /Enter a valid email address\./);

const emptyDelivery = reconcileFutureShippingState({
  state: {
    ...createEmptyFutureShippingState(),
    fulfilmentMethod: "destination_delivery",
  },
  garmentCount: 1,
  selectedDesignPrice: 65,
});
const untouchedDelivery = mountShipping(emptyDelivery, false);
assert.equal(untouchedDelivery.text().includes("Enter the delivery address."), false);
assert.equal(untouchedDelivery.text().includes("Select a destination country."), false);
act(() => {
  untouchedDelivery.reviewButtons()[0]?.props.onClick();
});
assert.match(untouchedDelivery.text(), /Enter the delivery address\./);
assert.match(untouchedDelivery.text(), /Select a destination country\./);

const readyPickup = mountShipping(pickup, true);
act(() => {
  readyPickup.reviewButtons()[0]?.props.onClick();
});
assert.equal(readyPickup.continued(), true);
assert.equal(readyPickup.text().includes("Enter the recipient's full name."), false);

// Closed community batch: Review Order explains itself instead of failing silently.
{
  let continued = false;
  let renderer: ReactTestRenderer | null = null;
  const focused: string[] = [];
  act(() => {
    renderer = create(
      createElement(DormantFutureShippingStep, {
        state: pickup.state,
        resolution: pickup,
        selectedDesignPrice: 65,
        garmentCount: 1,
        orderType: "Community",
        onChange: () => undefined,
        onRefreshQuote: () => undefined,
        onBack: () => undefined,
        canContinueToReview: true,
        onContinueToReview: () => {
          continued = true;
        },
        reviewBlockedMessage: COMMUNITY_BATCH_CLOSED_REVIEW_MESSAGE,
      }),
      {
        createNodeMock: (element) => ({
          focus: () => {
            const props = element.props as Record<string, unknown>;
            focused.push(String(props.id ?? props["data-future-shipping-review-blocked"]));
          },
          scrollIntoView: () => undefined,
        }),
      },
    );
  });
  const view = renderer as unknown as ReactTestRenderer;
  const buttons = () =>
    view.root.findAll(
      (node) => node.type === "button" && node.props?.["aria-label"] === "Review Order",
    );
  assert.equal(buttons().length, 2);
  for (const button of buttons()) {
    assert.equal(button.props["aria-disabled"], "true", "closed batch shows Review Order locked but clickable");
  }
  // The footer note states the reason before any click.
  const idleNote = view.root.find(
    (node) => node.props?.["data-future-shipping-review-blocked"] === "idle",
  );
  assert.equal(idleNote.props.role, "status");
  assert.match(JSON.stringify(view.toJSON()), /This batch is closed\. It no longer accepts new orders/);

  act(() => {
    buttons()[1].props.onClick();
  });
  assert.equal(continued, false, "the closed-batch block still stops review");
  const footerAlert = view.root.find(
    (node) => node.props?.["data-future-shipping-review-blocked"] === "footer",
  );
  assert.equal(footerAlert.props.role, "alert");
  assert.equal(footerAlert.props.tabIndex, -1);
  assert.deepEqual(focused, ["future-payment-lock-reason"], "footer notice receives focus");

  act(() => {
    buttons()[0].props.onClick();
  });
  assert.equal(continued, false);
  const headerAlert = view.root.find(
    (node) => node.props?.["data-future-shipping-review-blocked"] === "header",
  );
  assert.equal(headerAlert.props.role, "alert");
  assert.match(
    headerAlert.findAll((node) => node.type === "span").map((node) => node.children.join("")).join(" "),
    /This batch is closed/,
  );
  assert.equal(focused[focused.length - 1], "future-shipping-review-blocked-header");
  act(() => view.unmount());
}

globalThis.document = previousDocument;

console.log("PASS: Step 8 Delivery & Pickup state, completion, and UI contracts");
