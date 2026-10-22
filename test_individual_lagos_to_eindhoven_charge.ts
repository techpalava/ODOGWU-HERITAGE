import assert from "node:assert/strict";
import { quoteFutureOrderPayableTotal, recomputeFutureOrderPayableTotal } from "./src/utils/futureOrderPayableTotal";
import { readFutureOrderV2ChargeableCents } from "./src/utils/futureOrderV2PersonalizedPrice";
import { getFutureOrderV2CartLineTotalCents } from "./src/utils/futureOrderV2CartBag";
import {
  createCatalogueAuthoritativeFutureOrderV2Fixture,
  createFutureOrderV2Fixture,
} from "./testing/futureOrderV2Fixture";
import type { FutureOrderCandidateV2 } from "./src/utils/futureOrderCandidate";

type WritableCandidate = {
  -readonly [K in keyof FutureOrderCandidateV2]: FutureOrderCandidateV2[K];
};

const cloneCandidate = (candidate: FutureOrderCandidateV2): WritableCandidate =>
  structuredClone(candidate) as WritableCandidate;
import {
  createEmptyFutureShippingState,
  normalizeFutureShippingState,
  persistFutureShippingState,
  reconcileFutureShippingState,
} from "./src/utils/designStudioFutureShipping";
import { individualLagosToEindhovenChargeCents } from "./src/utils/individualInboundShippingDisplay";

const individualOrder = createCatalogueAuthoritativeFutureOrderV2Fixture(
  "individual-charge",
);
const individualCandidate = individualOrder.cartItem.candidate;
const individualQuote = quoteFutureOrderPayableTotal(individualCandidate);
assert.ok(individualQuote);
assert.equal(individualCandidate.shipping.state.fulfilmentMethod, "eindhoven_pickup");
assert.equal(individualQuote.lagosToEindhovenShippingCents, null);
assert.equal(
  individualQuote.exactTotalCents,
  individualQuote.selectedDesignTotalCents +
    individualQuote.postEindhovenAdjustmentCents,
);
assert.equal(
  individualCandidate.pricing.components.lagosToEindhovenShipping.status,
  "included_in_garment_construction",
);
assert.equal(
  individualCandidate.pricing.components.lagosToEindhovenShipping.amountCents,
  null,
);
const individualPayable = recomputeFutureOrderPayableTotal(individualCandidate);
assert.equal(individualPayable.status, "exact");
if (individualPayable.status === "exact") {
  assert.equal(individualPayable.exactTotalCents, individualQuote.exactTotalCents);
  assert.equal(
    individualCandidate.pricing.exactTotalCents,
    individualPayable.exactTotalCents,
  );
}
assert.equal(
  getFutureOrderV2CartLineTotalCents(individualOrder.cartItem),
  individualCandidate.pricing.exactTotalCents,
);

const oneGarment = cloneCandidate(individualCandidate);
oneGarment.garments = [oneGarment.garments[0]!];
const pickupQuote = quoteFutureOrderPayableTotal(oneGarment);
assert.ok(pickupQuote);
assert.equal(pickupQuote.garmentConstructionSubtotalCents, 6500);
assert.equal(pickupQuote.postEindhovenAdjustmentCents, 0);
assert.equal(pickupQuote.lagosToEindhovenShippingCents, null);
assert.equal(pickupQuote.exactTotalCents, 6500);

const deliveryCandidate = cloneCandidate(oneGarment);
deliveryCandidate.shipping = {
  ...deliveryCandidate.shipping,
  state: {
    ...deliveryCandidate.shipping.state,
    fulfilmentMethod: "destination_delivery",
    customerInformation: {
      ...deliveryCandidate.shipping.state.customerInformation,
      deliveryAddress: {
        ...deliveryCandidate.shipping.state.customerInformation.deliveryAddress,
        city: "Paris",
        countryCode: "FR",
      },
    },
  },
};
const deliveryQuote = quoteFutureOrderPayableTotal(deliveryCandidate);
assert.ok(deliveryQuote);
assert.equal(deliveryQuote.garmentConstructionSubtotalCents, 6500);
assert.equal(deliveryQuote.lagosToEindhovenShippingCents, 13125);
assert.equal(
  deliveryQuote.postEindhovenAdjustmentCents,
  1900,
  "Paris final-mile is €19",
);
assert.equal(deliveryQuote.exactTotalCents, 21525);

const communityOrder = createCatalogueAuthoritativeFutureOrderV2Fixture(
  "community-unchanged",
  undefined,
  { orderType: "Community", batchId: "batch-avatars" },
);
const communityCandidate = communityOrder.cartItem.candidate;
const communityQuote = quoteFutureOrderPayableTotal(communityCandidate);
assert.ok(communityQuote);
assert.equal(communityQuote.lagosToEindhovenShippingCents, null);
assert.equal(
  communityQuote.exactTotalCents,
  communityQuote.selectedDesignTotalCents +
    communityQuote.postEindhovenAdjustmentCents,
);
assert.equal(
  communityCandidate.pricing.components.lagosToEindhovenShipping.status,
  "included_in_garment_construction",
);
assert.equal(
  communityCandidate.pricing.components.lagosToEindhovenShipping.amountCents,
  null,
);
assert.equal(communityCandidate.pricing.exactTotalCents, communityQuote.exactTotalCents);
assert.equal(
  communityCandidate.pricing.exactTotalCents,
  individualCandidate.pricing.exactTotalCents,
  "pickup Individual and Community both omit the Lagos band",
);
const communityPayable = recomputeFutureOrderPayableTotal(communityCandidate);
assert.equal(communityPayable.status, "exact");

const simpleIndividual = createFutureOrderV2Fixture("simple-individual");
assert.equal(simpleIndividual.cartItem.candidate.garments.length, 3);
assert.equal(simpleIndividual.cartItem.candidate.pricing.exactTotalCents, 30000);
assert.equal(
  simpleIndividual.cartItem.candidate.pricing.components.lagosToEindhovenShipping
    .amountCents,
  null,
);
const simpleCommunity = createFutureOrderV2Fixture("simple-community", undefined, {
  orderType: "Community",
  batchId: "batch-avatars",
});
assert.equal(simpleCommunity.cartItem.candidate.pricing.exactTotalCents, 30000);
assert.equal(
  simpleCommunity.cartItem.candidate.pricing.components.lagosToEindhovenShipping
    .status,
  "included_in_garment_construction",
);

const pendingPersonalized = (
  candidate: FutureOrderCandidateV2,
): FutureOrderCandidateV2 => {
  const pending = cloneCandidate(candidate);
  pending.pricing = {
    ...pending.pricing,
    status: "pending",
    customDetailsCents: null,
    selectedDesignTotalCents: null,
    exactTotalCents: null,
    components: {
      ...pending.pricing.components,
      customDetails: { status: "pricing_pending", amountCents: null },
    },
  };
  pending.customDetails = [
    {
      occurrenceKey:
        "base:shirt:personalized_additional:personalized_additional_evaluation",
      garmentKey: "base:shirt",
      garmentLabel: "Shirt",
      selectionGroup: "personalized_additional",
      selectionGroupTitle: "Personalized",
      optionId: "personalized_additional_evaluation",
      optionLabel: "Personalized Additional Requirement",
      priceStatus: "evaluation_required",
      priceCents: null,
      personalizedText: "Add a small family emblem on the chest.",
      snapshot: {
        label: "Personalized Additional Requirement",
        description: "Additional cost will depend on evaluation of personalized needs.",
        garmentGroup: "personalized",
        informational: false,
        requiresEvaluation: true,
      },
    },
  ];
  return pending;
};

const alignToQuote = (candidate: WritableCandidate) => {
  const quote = quoteFutureOrderPayableTotal(candidate);
  assert.ok(quote);
  if (!quote) throw new Error("Expected a catalogue quote.");
  candidate.pricing = {
    ...candidate.pricing,
    garmentConstructionSubtotalCents: quote.garmentConstructionSubtotalCents,
    customDetailsCents: quote.customDetailsCents,
    selectedDesignTotalCents: quote.selectedDesignTotalCents,
    postEindhovenAdjustmentCents: quote.postEindhovenAdjustmentCents,
    exactTotalCents: quote.exactTotalCents,
    components: {
      ...candidate.pricing.components,
      customDetails: {
        status: "separately_charged",
        amountCents: quote.customDetailsCents,
      },
      postEindhovenDelivery: {
        status: "separately_charged",
        amountCents: quote.postEindhovenAdjustmentCents,
      },
      lagosToEindhovenShipping:
        quote.lagosToEindhovenShippingCents === null
          ? { status: "included_in_garment_construction", amountCents: null }
          : {
              status: "separately_charged",
              amountCents: quote.lagosToEindhovenShippingCents,
            },
    },
  };
  candidate.shipping = {
    ...candidate.shipping,
    additionalDeliveryFeeCents: quote.postEindhovenAdjustmentCents,
  };
  return quote;
};

const pickupAligned = cloneCandidate(oneGarment);
alignToQuote(pickupAligned);
const pickupPending = pendingPersonalized(pickupAligned);
const pickupPendingResult = recomputeFutureOrderPayableTotal(pickupPending);
assert.equal(pickupPendingResult.status, "not_exact");
assert.equal(readFutureOrderV2ChargeableCents(pickupPending, null), 6500);

const parisAligned = cloneCandidate(deliveryCandidate);
alignToQuote(parisAligned);
const parisPending = pendingPersonalized(parisAligned);
assert.equal(recomputeFutureOrderPayableTotal(parisPending).status, "not_exact");
assert.equal(readFutureOrderV2ChargeableCents(parisPending, null), 21525);

const omittedDeliveryLagos = cloneCandidate(parisPending);
omittedDeliveryLagos.pricing = {
  ...omittedDeliveryLagos.pricing,
  components: {
    ...omittedDeliveryLagos.pricing.components,
    lagosToEindhovenShipping: {
      status: "included_in_garment_construction",
      amountCents: null,
    },
  },
};
assert.equal(recomputeFutureOrderPayableTotal(omittedDeliveryLagos).status, "rejected");

const stalePickupCharge = cloneCandidate(oneGarment);
alignToQuote(stalePickupCharge);
assert.equal(stalePickupCharge.pricing.exactTotalCents, 6500);
assert.equal(recomputeFutureOrderPayableTotal(stalePickupCharge).status, "exact");
assert.equal(readFutureOrderV2ChargeableCents(stalePickupCharge, null), 6500);
stalePickupCharge.pricing = {
  ...stalePickupCharge.pricing,
  exactTotalCents: 7900,
  components: {
    ...stalePickupCharge.pricing.components,
    lagosToEindhovenShipping: {
      status: "separately_charged",
      amountCents: 1400,
    },
  },
};
assert.equal(
  recomputeFutureOrderPayableTotal(stalePickupCharge).status,
  "rejected",
  "a restored pickup ledger must not keep a previous Lagos shipping charge",
);

const communityPending = pendingPersonalized(structuredClone(communityCandidate));
assert.equal(recomputeFutureOrderPayableTotal(communityPending).status, "not_exact");
assert.equal(
  readFutureOrderV2ChargeableCents(communityPending, null),
  communityCandidate.pricing.exactTotalCents,
);

const deliveredDraft = reconcileFutureShippingState({
  state: {
    ...createEmptyFutureShippingState(),
    fulfilmentMethod: "destination_delivery",
    destinationSelectionMode: "supported_country",
    customerInformation: {
      fullName: "Ada Heritage",
      phone: "+31612345678",
      email: "ada@example.com",
      deliveryAddress: {
        addressLine1: "1 Rue de Rivoli",
        addressLine2: "",
        city: "Paris",
        stateRegion: "Ile-de-France",
        postalCode: "75001",
        countryCode: "FR",
      },
      comment: "",
    },
  },
  garmentCount: 1,
  selectedDesignPrice: 77,
});
assert.equal(deliveredDraft.postEindhovenAdjustmentCents, 1900);
assert.equal(
  individualLagosToEindhovenChargeCents({
    orderType: "Individual",
    physicalGarmentCount: 1,
    fulfilmentMethod: deliveredDraft.state.fulfilmentMethod,
  }),
  13125,
);
const persistedDraft = persistFutureShippingState({
  draft: { id: "draft-pickup-switch" },
  state: deliveredDraft.state,
});
const restoredShipping = normalizeFutureShippingState(
  persistedDraft.futureShippingState,
).state;
assert.equal(restoredShipping.fulfilmentMethod, "destination_delivery");
assert.ok(restoredShipping.quoteReference);
const switchedToPickup = reconcileFutureShippingState({
  state: {
    ...restoredShipping,
    fulfilmentMethod: "eindhoven_pickup",
    destinationSelectionMode: null,
    quoteReference: null,
  },
  garmentCount: 1,
  selectedDesignPrice: 77,
});
assert.equal(switchedToPickup.status, "quote_ready");
assert.equal(switchedToPickup.postEindhovenAdjustmentCents, 0);
assert.equal(switchedToPickup.projectedTotalCents, 7700);
assert.equal(
  individualLagosToEindhovenChargeCents({
    orderType: "Individual",
    physicalGarmentCount: 1,
    fulfilmentMethod: switchedToPickup.state.fulfilmentMethod,
  }),
  null,
  "switching a restored delivery draft to pickup drops the Lagos band",
);
assert.equal(
  individualLagosToEindhovenChargeCents({
    orderType: "Individual",
    physicalGarmentCount: 1,
    fulfilmentMethod: "destination_delivery",
  }),
  13125,
  "delivery uses the €131.25 Lagos block",
);
