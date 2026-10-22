import assert from "node:assert/strict";
import {
  FUTURE_ORDER_PRICE_OUTDATED_CODE,
  quoteFutureOrderPayableTotal,
  recomputeFutureOrderPayableTotal,
  refuseOutdatedStoredIndividualPayableTotal,
  repriceUnpaidIndividualDeliveryCandidate,
} from "./src/utils/futureOrderPayableTotal";
import {
  formatIndividualShippingNote,
  individualLagosToEindhovenChargeCents,
  resolveIndividualInboundShippingDisplay,
} from "./src/utils/individualInboundShippingDisplay";
import {
  calculateIndividualShipping,
  INDIVIDUAL_SHIPPING_BLOCK_PRICE_CENTS,
} from "./src/utils/shippingPricing";
import { sanitizeFutureOrderV2CartItems } from "./src/utils/futureOrderV2CartBag";
import {
  persistFutureShippingState,
  reconcileFutureShippingState,
} from "./src/utils/designStudioFutureShipping";
import { persistFutureOrderV2ForVerifiedIdentity } from "./src/server/futureOrderV2Persistence";
import {
  createPersistedFutureOrderV2,
  type FutureOrderV2PersistenceAdapter,
  type FutureOrderV2PersistenceTransaction,
  type PersistedFutureOrderV2,
} from "./src/utils/futureOrderV2PersistenceContract";
import { createFutureOrderV2PreparationAttempt } from "./src/utils/futureOrderV2Preparation";
import { getFuturePaymentReviewPricingRows } from "./src/utils/designStudioFuturePaymentReview";
import { createCatalogueAuthoritativeFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import type { FutureOrderCandidateV2 } from "./src/utils/futureOrderCandidate";

type WritableCandidate = {
  -readonly [K in keyof FutureOrderCandidateV2]: FutureOrderCandidateV2[K];
};

const cloneCandidate = (candidate: FutureOrderCandidateV2): WritableCandidate =>
  structuredClone(candidate) as WritableCandidate;

const OWNER_UID = "individual-block-owner";
const NOW = new Date("2026-10-22T12:00:00.000Z");
const BASELINE_NOTE = "Shipping covers up to 10 garments (under 5 kg).";
const FOURTEEN_NOTE =
  "Shipping covers up to 10 garments (under 5 kg). Your order has 14 garments, so it uses the 10 kg range: 2 × €131.25.";

class MemoryAdapter implements FutureOrderV2PersistenceAdapter {
  readonly values = new Map<string, unknown>();

  async runTransaction<T>(
    operation: (transaction: FutureOrderV2PersistenceTransaction) => Promise<T>,
  ): Promise<T> {
    const pending = new Map<string, PersistedFutureOrderV2>();
    const transaction: FutureOrderV2PersistenceTransaction = {
      get: async (orderId) => this.values.get(orderId) ?? null,
      create: (orderId, value) => {
        if (this.values.has(orderId) || pending.has(orderId)) {
          throw new Error("create-only collision");
        }
        pending.set(orderId, structuredClone(value));
      },
    };
    const result = await operation(transaction);
    pending.forEach((value, orderId) => this.values.set(orderId, value));
    return result;
  }
}

const alignToQuote = (candidate: WritableCandidate) => {
  const quote = quoteFutureOrderPayableTotal(candidate);
  assert.ok(quote);
  candidate.pricing = {
    ...candidate.pricing,
    status: "exact",
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

const withParisDelivery = (candidate: WritableCandidate): WritableCandidate => {
  candidate.shipping = {
    ...candidate.shipping,
    state: {
      ...candidate.shipping.state,
      fulfilmentMethod: "destination_delivery",
      customerInformation: {
        ...candidate.shipping.state.customerInformation,
        deliveryAddress: {
          ...candidate.shipping.state.customerInformation.deliveryAddress,
          city: "Paris",
          countryCode: "FR",
        },
      },
    },
  };
  return candidate;
};

const withPickup = (candidate: WritableCandidate): WritableCandidate => {
  candidate.shipping = {
    ...candidate.shipping,
    state: {
      ...candidate.shipping.state,
      fulfilmentMethod: "eindhoven_pickup",
    },
  };
  return candidate;
};

const replicateGarments = (
  candidate: WritableCandidate,
  count: number,
): WritableCandidate => {
  const template = candidate.garments[0];
  assert.ok(template);
  candidate.garments = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(template),
    garmentKey: `${template.garmentKey}:${index}`,
  }));
  return candidate;
};

const individual = createCatalogueAuthoritativeFutureOrderV2Fixture(
  "individual-block",
).cartItem.candidate;
const oneGarment = replicateGarments(cloneCandidate(individual), 1);
withPickup(oneGarment);

{
  const expected = [
    [0, null],
    [1, 13125],
    [10, 13125],
    [11, 26250],
    [20, 26250],
    [21, 39375],
  ] as const;
  for (const [count, cents] of expected) {
    assert.equal(
      individualLagosToEindhovenChargeCents({
        orderType: "Individual",
        physicalGarmentCount: count,
        fulfilmentMethod: "destination_delivery",
      }),
      cents,
    );
    if (count >= 1) {
      const quote = calculateIndividualShipping(count);
      assert.equal(Math.round(quote.priceEur * 100), cents);
      assert.equal(quote.blockCount, Math.ceil(count / 10));
    }
  }
  assert.equal(INDIVIDUAL_SHIPPING_BLOCK_PRICE_CENTS, 13125);
}

{
  const pickupQuote = quoteFutureOrderPayableTotal(oneGarment);
  assert.ok(pickupQuote);
  assert.equal(pickupQuote.garmentConstructionSubtotalCents, 6500);
  assert.equal(pickupQuote.lagosToEindhovenShippingCents, null);
  assert.equal(pickupQuote.exactTotalCents, 6500);
  assert.equal(
    resolveIndividualInboundShippingDisplay({
      orderType: "Individual",
      physicalGarmentCount: 1,
      fulfilmentMethod: "eindhoven_pickup",
    }),
    null,
  );

  const paris = withParisDelivery(cloneCandidate(oneGarment));
  const parisQuote = quoteFutureOrderPayableTotal(paris);
  assert.ok(parisQuote);
  assert.equal(parisQuote.garmentConstructionSubtotalCents, 6500);
  assert.equal(parisQuote.lagosToEindhovenShippingCents, 13125);
  assert.equal(parisQuote.postEindhovenAdjustmentCents, 1900);
  assert.equal(parisQuote.exactTotalCents, 21525);
}

{
  const elevenPickup = withPickup(replicateGarments(cloneCandidate(individual), 11));
  const pickupQuote = quoteFutureOrderPayableTotal(elevenPickup);
  assert.ok(pickupQuote);
  assert.equal(pickupQuote.lagosToEindhovenShippingCents, null);
  assert.equal(
    pickupQuote.exactTotalCents,
    pickupQuote.garmentConstructionSubtotalCents,
  );

  const twentyOnePickup = withPickup(replicateGarments(cloneCandidate(individual), 21));
  const twentyOnePickupQuote = quoteFutureOrderPayableTotal(twentyOnePickup);
  assert.ok(twentyOnePickupQuote);
  assert.equal(twentyOnePickupQuote.lagosToEindhovenShippingCents, null);

  const elevenParis = withParisDelivery(replicateGarments(cloneCandidate(individual), 11));
  const elevenQuote = quoteFutureOrderPayableTotal(elevenParis);
  assert.ok(elevenQuote);
  assert.equal(elevenQuote.lagosToEindhovenShippingCents, 26250);
  assert.equal(elevenQuote.postEindhovenAdjustmentCents, 3724);
  assert.equal(
    elevenQuote.exactTotalCents,
    elevenQuote.garmentConstructionSubtotalCents + 26250 + 3724,
  );
}

{
  const community = createCatalogueAuthoritativeFutureOrderV2Fixture(
    "community-block",
    undefined,
    { orderType: "Community", batchId: "batch-avatars" },
  ).cartItem.candidate;
  const communityPickup = quoteFutureOrderPayableTotal(community);
  assert.ok(communityPickup);
  assert.equal(communityPickup.lagosToEindhovenShippingCents, null);
  const oneCommunity = replicateGarments(cloneCandidate(community), 1);
  const oneCommunityQuote = quoteFutureOrderPayableTotal(oneCommunity);
  assert.ok(oneCommunityQuote);
  assert.equal(oneCommunityQuote.lagosToEindhovenShippingCents, null);
  assert.equal(oneCommunityQuote.exactTotalCents, 6500);
  const communityParis = withParisDelivery(cloneCandidate(oneCommunity));
  const communityParisQuote = quoteFutureOrderPayableTotal(communityParis);
  assert.ok(communityParisQuote);
  assert.equal(communityParisQuote.lagosToEindhovenShippingCents, null);
  assert.equal(
    communityParisQuote.exactTotalCents,
    communityParisQuote.garmentConstructionSubtotalCents +
      communityParisQuote.postEindhovenAdjustmentCents,
  );
}

{
  const oneParisDisplay = resolveIndividualInboundShippingDisplay({
    orderType: "Individual",
    physicalGarmentCount: 1,
    fulfilmentMethod: "destination_delivery",
  });
  assert.ok(oneParisDisplay);
  assert.equal(formatIndividualShippingNote(oneParisDisplay), BASELINE_NOTE);
  const fourteenDisplay = resolveIndividualInboundShippingDisplay({
    orderType: "Individual",
    physicalGarmentCount: 14,
    fulfilmentMethod: "destination_delivery",
  });
  assert.ok(fourteenDisplay);
  assert.equal(formatIndividualShippingNote(fourteenDisplay), FOURTEEN_NOTE);
  const pickupRows = getFuturePaymentReviewPricingRows(
    { ...oneGarment.pricing, exactTotalCents: 6500, postEindhovenAdjustmentCents: 0 },
    {
      orderType: "Individual",
      physicalGarmentCount: 1,
      fulfilmentMethod: "eindhoven_pickup",
    },
  );
  assert.equal(
    pickupRows.some((row) => row.id === "lagos_eindhoven_included" || row.note),
    false,
  );
  const communityRows = getFuturePaymentReviewPricingRows(oneGarment.pricing, {
    orderType: "Community",
    physicalGarmentCount: 1,
    fulfilmentMethod: "destination_delivery",
  });
  assert.equal(
    communityRows.some((row) => row.id === "lagos_eindhoven_included" || Boolean(row.note)),
    false,
  );
}

{
  const paris = withParisDelivery(cloneCandidate(oneGarment));
  const quote = alignToQuote(paris);
  assert.equal(quote.exactTotalCents, 21525);
  const loweredTotal = cloneCandidate(paris);
  loweredTotal.pricing = {
    ...loweredTotal.pricing,
    exactTotalCents: 9800,
  };
  assert.equal(recomputeFutureOrderPayableTotal(loweredTotal).status, "rejected");
  assert.equal(
    refuseOutdatedStoredIndividualPayableTotal(loweredTotal).status,
    "ok",
    "a matching Lagos amount is not PRICE_OUTDATED; persist still refuses the total",
  );
  const loweredLagos = cloneCandidate(paris);
  loweredLagos.pricing = {
    ...loweredLagos.pricing,
    components: {
      ...loweredLagos.pricing.components,
      lagosToEindhovenShipping: {
        status: "separately_charged",
        amountCents: 1400,
      },
    },
  };
  assert.equal(recomputeFutureOrderPayableTotal(loweredLagos).status, "rejected");
  const outdatedLagos = refuseOutdatedStoredIndividualPayableTotal(loweredLagos);
  assert.equal(outdatedLagos.status, "price_outdated");
  if (outdatedLagos.status === "price_outdated") {
    assert.equal(outdatedLagos.code, FUTURE_ORDER_PRICE_OUTDATED_CODE);
  }

  const persistCurrent = await persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    request: {
      masterOrder: createCatalogueAuthoritativeFutureOrderV2Fixture("block-current"),
      customerOwnerUid: OWNER_UID,
    },
    adapter: new MemoryAdapter(),
    now: () => NOW,
  });
  assert.equal(persistCurrent.status, "created");

  const staleMaster = structuredClone(
    createCatalogueAuthoritativeFutureOrderV2Fixture("block-stale-total"),
  );
  const staleCandidate = staleMaster.cartItem.candidate as WritableCandidate;
  withParisDelivery(staleCandidate);
  alignToQuote(staleCandidate);
  staleCandidate.pricing = {
    ...staleCandidate.pricing,
    exactTotalCents: 1400,
    components: {
      ...staleCandidate.pricing.components,
      lagosToEindhovenShipping: {
        status: "separately_charged",
        amountCents: 1400,
      },
    },
  };
  const persistStale = await persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    request: { masterOrder: staleMaster, customerOwnerUid: OWNER_UID },
    adapter: new MemoryAdapter(),
    now: () => NOW,
  });
  assert.equal(persistStale.status, "invalid");
  if (persistStale.status === "invalid") {
    assert.equal(persistStale.code, "NON_AUTHORITATIVE_TOTAL");
  }
}

{
  const paris = withParisDelivery(cloneCandidate(oneGarment));
  alignToQuote(paris);
  const prepared = createFutureOrderV2PreparationAttempt({
    candidate: paris,
    ids: { cartItemId: "future-cart-stale-14", orderId: "future-order-stale-14" },
  });
  assert.equal(prepared.status, "valid");
  if (prepared.status !== "valid") throw new Error("expected prepared Paris cart item");
  const staleCandidate = cloneCandidate(prepared.attempt.cartItem.candidate);
  staleCandidate.pricing = {
    ...staleCandidate.pricing,
    exactTotalCents: 9800,
    components: {
      ...staleCandidate.pricing.components,
      lagosToEindhovenShipping: {
        status: "separately_charged",
        amountCents: 1400,
      },
    },
  };
  const sanitized = sanitizeFutureOrderV2CartItems([
    { ...prepared.attempt.cartItem, candidate: staleCandidate },
  ]);
  assert.equal(sanitized.length, 1);
  assert.equal(
    sanitized[0]?.candidate.pricing.components.lagosToEindhovenShipping.amountCents,
    13125,
  );
  assert.equal(sanitized[0]?.candidate.pricing.exactTotalCents, 21525);

  const paidBefore = structuredClone(staleCandidate);
  const paidAfter = repriceUnpaidIndividualDeliveryCandidate(paidBefore, {
    hasPaymentRecord: true,
  });
  assert.equal(paidAfter, paidBefore);
  assert.deepEqual(paidAfter, paidBefore);
  assert.equal(paidAfter.pricing.exactTotalCents, 9800);
  assert.equal(
    paidAfter.pricing.components.lagosToEindhovenShipping.amountCents,
    1400,
  );
}

{
  const delivered = reconcileFutureShippingState({
    state: withParisDelivery(cloneCandidate(oneGarment)).shipping.state,
    garmentCount: 1,
    selectedDesignPrice: 65,
  });
  const persistedDraft = persistFutureShippingState({
    draft: { id: "draft-old-14" },
    state: delivered.state,
  });
  const encoded = JSON.stringify(persistedDraft.futureShippingState);
  assert.equal(encoded.includes("1400"), false);
  assert.equal(
    individualLagosToEindhovenChargeCents({
      orderType: "Individual",
      physicalGarmentCount: 1,
      fulfilmentMethod: delivered.state.fulfilmentMethod,
    }),
    13125,
    "an old delivery draft is re-priced to the €131.25 block on load",
  );
}

{
  const paris = withParisDelivery(cloneCandidate(oneGarment));
  alignToQuote(paris);
  paris.pricing = {
    ...paris.pricing,
    exactTotalCents: 9800,
    components: {
      ...paris.pricing.components,
      lagosToEindhovenShipping: {
        status: "separately_charged",
        amountCents: 1400,
      },
    },
  };
  const prepared = createFutureOrderV2PreparationAttempt({
    candidate: paris,
    ids: {
      cartItemId: "future-cart-stale-ledger",
      orderId: "future-order-stale-ledger",
    },
  });
  assert.equal(prepared.status, "valid");
  if (prepared.status !== "valid") throw new Error("expected stale Paris prepare");
  const stored = createPersistedFutureOrderV2({
    masterOrder: prepared.attempt.masterOrder,
    owner: { uid: OWNER_UID, isAnonymous: false },
    customerOwnerUid: OWNER_UID,
    persistedAt: NOW.toISOString(),
  });
  assert.equal(stored.status, "valid");
  if (stored.status !== "valid") throw new Error("expected stored stale ledger");
  const outdated = refuseOutdatedStoredIndividualPayableTotal(
    stored.value.masterOrder.cartItem.candidate,
  );
  assert.equal(outdated.status, "price_outdated");
  if (outdated.status === "price_outdated") {
    assert.equal(outdated.code, FUTURE_ORDER_PRICE_OUTDATED_CODE);
  }
}

console.log("test_individual_shipping_block.ts: all assertions passed");
