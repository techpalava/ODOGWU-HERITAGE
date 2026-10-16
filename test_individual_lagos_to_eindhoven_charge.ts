import assert from "node:assert/strict";
import { quoteFutureOrderPayableTotal, recomputeFutureOrderPayableTotal } from "./src/utils/futureOrderPayableTotal";
import { readFutureOrderV2ChargeableCents } from "./src/utils/futureOrderV2PersonalizedPrice";
import { getFutureOrderV2CartLineTotalCents } from "./src/utils/futureOrderV2CartBag";
import {
  createCatalogueAuthoritativeFutureOrderV2Fixture,
  createFutureOrderV2Fixture,
} from "./testing/futureOrderV2Fixture";
import type { FutureOrderCandidateV2 } from "./src/utils/futureOrderCandidate";

const individualOrder = createCatalogueAuthoritativeFutureOrderV2Fixture(
  "individual-charge",
);
const individualCandidate = individualOrder.cartItem.candidate;
const individualQuote = quoteFutureOrderPayableTotal(individualCandidate);
assert.ok(individualQuote);
assert.equal(individualQuote.lagosToEindhovenShippingCents, 1400);
assert.equal(
  individualQuote.exactTotalCents,
  individualQuote.selectedDesignTotalCents +
    individualQuote.postEindhovenAdjustmentCents +
    1400,
);
assert.equal(
  individualCandidate.pricing.components.lagosToEindhovenShipping.status,
  "separately_charged",
);
assert.equal(
  individualCandidate.pricing.components.lagosToEindhovenShipping.amountCents,
  1400,
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

const oneGarment = structuredClone(individualCandidate) as FutureOrderCandidateV2;
oneGarment.garments = [oneGarment.garments[0]!];
const pickupQuote = quoteFutureOrderPayableTotal(oneGarment);
assert.ok(pickupQuote);
assert.equal(pickupQuote.garmentConstructionSubtotalCents, 6500);
assert.equal(pickupQuote.postEindhovenAdjustmentCents, 0);
assert.equal(pickupQuote.lagosToEindhovenShippingCents, 1400);
assert.equal(pickupQuote.exactTotalCents, 7900);

const deliveryCandidate = structuredClone(oneGarment) as FutureOrderCandidateV2;
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
        country: "France",
        countryCode: "FR",
      },
    },
  },
};
const deliveryQuote = quoteFutureOrderPayableTotal(deliveryCandidate);
assert.ok(deliveryQuote);
assert.equal(deliveryQuote.garmentConstructionSubtotalCents, 6500);
assert.equal(deliveryQuote.lagosToEindhovenShippingCents, 1400);
assert.equal(
  deliveryQuote.postEindhovenAdjustmentCents,
  1900,
  "Paris final-mile is €19",
);
assert.equal(deliveryQuote.exactTotalCents, 9800);

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
assert.notEqual(
  communityCandidate.pricing.exactTotalCents,
  individualCandidate.pricing.exactTotalCents,
);
const communityPayable = recomputeFutureOrderPayableTotal(communityCandidate);
assert.equal(communityPayable.status, "exact");

const simpleIndividual = createFutureOrderV2Fixture("simple-individual");
assert.equal(simpleIndividual.cartItem.candidate.garments.length, 3);
assert.equal(simpleIndividual.cartItem.candidate.pricing.exactTotalCents, 31400);
assert.equal(
  simpleIndividual.cartItem.candidate.pricing.components.lagosToEindhovenShipping
    .amountCents,
  1400,
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
  const pending = structuredClone(candidate) as FutureOrderCandidateV2;
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

const alignToQuote = (candidate: FutureOrderCandidateV2) => {
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

const pickupAligned = structuredClone(oneGarment) as FutureOrderCandidateV2;
alignToQuote(pickupAligned);
const pickupPending = pendingPersonalized(pickupAligned);
const pickupPendingResult = recomputeFutureOrderPayableTotal(pickupPending);
assert.equal(pickupPendingResult.status, "not_exact");
assert.equal(readFutureOrderV2ChargeableCents(pickupPending, null), 7900);

const parisAligned = structuredClone(deliveryCandidate) as FutureOrderCandidateV2;
alignToQuote(parisAligned);
const parisPending = pendingPersonalized(parisAligned);
assert.equal(recomputeFutureOrderPayableTotal(parisPending).status, "not_exact");
assert.equal(readFutureOrderV2ChargeableCents(parisPending, null), 9800);

const omittedLagos = structuredClone(pickupPending) as FutureOrderCandidateV2;
omittedLagos.pricing = {
  ...omittedLagos.pricing,
  components: {
    ...omittedLagos.pricing.components,
    lagosToEindhovenShipping: {
      status: "included_in_garment_construction",
      amountCents: null,
    },
  },
};
assert.equal(recomputeFutureOrderPayableTotal(omittedLagos).status, "rejected");
assert.equal(readFutureOrderV2ChargeableCents(omittedLagos, null), 6500);

const communityPending = pendingPersonalized(structuredClone(communityCandidate));
assert.equal(recomputeFutureOrderPayableTotal(communityPending).status, "not_exact");
assert.equal(
  readFutureOrderV2ChargeableCents(communityPending, null),
  communityCandidate.pricing.exactTotalCents,
);
