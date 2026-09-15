import assert from "node:assert/strict";
import {
  createFutureOrderCartItemV2,
  createFutureOrderMasterOrderV2,
  type FutureOrderMasterOrderV2,
} from "./src/utils/futureOrderV2Storage";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { prepareAuthoritativeDesignStyleRecord } from "./src/utils/designStyleAuthority";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import {
  createFutureOrderV2PaymentQuoteForVerifiedIdentity,
  type FutureOrderV2PaymentQuoteAdapter,
  type FutureOrderV2PaymentQuoteTransaction,
} from "./src/server/futureOrderV2PaymentQuote";
import {
  createServerVerifiedFutureOrderV2PricingAuthority,
  createFutureOrderV2PricingInputHash,
  FutureOrderV2PricingAuthorityError,
} from "./src/server/futureOrderV2PricingAuthority";
import { parseFutureOrderV2PricingAuthorityInput } from "./src/utils/futureOrderV2PricingAuthority";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const OWNER_UID = "quote-owner";
const NOW = new Date("2026-09-15T12:00:00.000Z");

const styleRecord = (embroideryPrice = 15, accessoryPrice = 17) =>
  prepareAuthoritativeDesignStyleRecord({
    style: {
      id: "quote-style",
      name: "Quote Style",
      description: "Trusted order-level pricing style",
      gender: "male",
      options: [],
      fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
      constructionDetails: [
        { type: "embroideryDesign", code: "Embroidery", price: embroideryPrice },
        { type: "accessories", code: "Traditional Hat", price: accessoryPrice },
      ],
    },
    lifecycle: "published",
    displayOrder: 1,
    referenceComposition: { status: "known", garmentTypes: ["shirt"] },
    currentRecord: null,
  });

const masterOrder = ({
  orderId,
  includeOrderLevelPricing = true,
  includeEvaluation = false,
  shipping = "eindhoven_pickup",
  orderIdentity,
}: {
  orderId: string;
  includeOrderLevelPricing?: boolean;
  includeEvaluation?: boolean;
  shipping?: "eindhoven_pickup" | "other_destination" | "supported_destination";
  orderIdentity?: { orderType: "Group Organizer"; batchId: string };
}): FutureOrderMasterOrderV2 => {
  const fixture = createFutureOrderV2Fixture(orderId, undefined, orderIdentity);
  const candidate: any = structuredClone(fixture.cartItem.candidate);
  candidate.garments = candidate.garments.map((garment: any) => ({
    ...garment,
    construction: [
      {
        componentKey: `${garment.garmentKey}:shirt_construction:shirt-base`,
        selectionGroup: "shirt_construction",
        optionId: "shirt-base",
        label: "Shirt construction",
        // Deliberately manipulated client cents. The quote must ignore this.
        priceCents: 1,
      },
    ],
    constructionTotalCents: 1,
  }));
  candidate.fabricAllocations = [
    {
      allocationId: "allocation-main",
      fabricId: "fabric-main",
      fabricCode: "FAB-MAIN",
      fabricName: "Trusted Fabric",
      availability: "available",
      capacityUnits: 3,
      materialPriceCents: 1,
      pricingTreatment: "included_in_garment_construction",
      garmentAssignments: candidate.garments.map((garment: any) => ({
        garmentKey: garment.garmentKey,
        code: "FAB-MAIN",
        garmentType: "shirt",
        fabricUnits: 1,
      })),
    },
  ];
  candidate.customDetails = includeOrderLevelPricing
    ? [
        {
          occurrenceKey: "order-detail:1:Name Monogram",
          garmentKey: "order",
          garmentLabel: "Order",
          selectionGroup: "order_optional_detail",
          selectionGroupTitle: "Monogram, Embroidery and Accessories",
          optionId: "Name Monogram",
          optionLabel: "Name Monogram",
          priceStatus: "exact",
          priceCents: 1,
          personalizedText: null,
          snapshot: null,
        },
        {
          occurrenceKey: "order-detail:2:Embroidery",
          garmentKey: "order",
          garmentLabel: "Order",
          selectionGroup: "order_optional_detail",
          selectionGroupTitle: "Monogram, Embroidery and Accessories",
          optionId: "Embroidery",
          optionLabel: "Embroidery",
          priceStatus: "exact",
          priceCents: 1,
          personalizedText: null,
          snapshot: null,
        },
        {
          occurrenceKey: "order-detail:3:Traditional Hat",
          garmentKey: "order",
          garmentLabel: "Order",
          selectionGroup: "order_optional_detail",
          selectionGroupTitle: "Monogram, Embroidery and Accessories",
          optionId: "Traditional Hat",
          optionLabel: "Traditional Hat",
          priceStatus: "exact",
          priceCents: 1,
          personalizedText: null,
          snapshot: null,
        },
      ]
    : includeEvaluation
      ? [
          {
            occurrenceKey: "base:shirt:shirt_additional:personalized",
            garmentKey: "base:shirt",
            garmentLabel: "Shirt",
            selectionGroup: "shirt_additional",
            selectionGroupTitle: "Additional",
            optionId: "personalized",
            optionLabel: "Personalized",
            priceStatus: "exact",
            priceCents: 1,
            personalizedText: "Need an evaluation",
            snapshot: null,
          },
        ]
      : [];
  if (shipping === "other_destination") {
    candidate.shipping.state.fulfilmentMethod = "destination_delivery";
    candidate.shipping.state.destinationSelectionMode = "other_destination";
    candidate.shipping.state.customerInformation.deliveryAddress.countryCode = "AU";
    candidate.shipping.status = "quote_pending";
    candidate.shipping.quoteReady = false;
    candidate.shipping.quoteRequired = true;
    candidate.shipping.formComplete = false;
    candidate.shipping.additionalDeliveryFeeCents = null;
    candidate.shipping.state.quoteReference = null;
  }
  if (shipping === "supported_destination") {
    candidate.shipping.state.fulfilmentMethod = "destination_delivery";
    candidate.shipping.state.destinationSelectionMode = "supported_country";
    candidate.shipping.state.customerInformation.deliveryAddress.countryCode = "NL";
    candidate.shipping.state.customerInformation.deliveryAddress.city = "Amsterdam";
    candidate.shipping.status = "quote_ready";
    candidate.shipping.quoteReady = true;
    candidate.shipping.quoteRequired = false;
    candidate.shipping.formComplete = true;
    candidate.shipping.additionalDeliveryFeeCents = 1;
    candidate.shipping.state.quoteReference = null;
  }
  const clientCustomCents = candidate.customDetails.length;
  const clientConstructionCents = candidate.garments.length;
  candidate.pricing = shipping === "other_destination" ? {
    ...candidate.pricing,
    status: "pending",
    garmentConstructionSubtotalCents: clientConstructionCents,
    customDetailsCents: clientCustomCents,
    selectedDesignTotalCents: clientConstructionCents + clientCustomCents,
    postEindhovenAdjustmentCents: null,
    exactTotalCents: null,
    components: {
      ...candidate.pricing.components,
      customDetails: { status: "separately_charged", amountCents: clientCustomCents },
      postEindhovenDelivery: { status: "pricing_pending", amountCents: null },
    },
  } : {
    ...candidate.pricing,
    garmentConstructionSubtotalCents: clientConstructionCents,
    customDetailsCents: clientCustomCents,
    selectedDesignTotalCents: clientConstructionCents + clientCustomCents,
    postEindhovenAdjustmentCents: 0,
    exactTotalCents: clientConstructionCents + clientCustomCents,
    components: {
      ...candidate.pricing.components,
      customDetails: { status: "separately_charged", amountCents: clientCustomCents },
      postEindhovenDelivery: { status: "separately_charged", amountCents: 0 },
    },
  };
  const cart = createFutureOrderCartItemV2({
    candidate,
    metadata: { cartItemId: `cart-${orderId}` },
  });
  assert.equal(cart.status, "valid");
  if (cart.status !== "valid") throw new Error("Expected valid cart");
  const order = createFutureOrderMasterOrderV2({
    cartItem: cart.value,
    metadata: { orderId },
  });
  assert.equal(order.status, "valid");
  if (order.status !== "valid") throw new Error("Expected valid order");
  return order.value;
};

class MemoryQuoteAdapter implements FutureOrderV2PaymentQuoteAdapter {
  readonly orders = new Map<string, unknown>();
  readonly authorities = new Map<string, unknown>();
  readonly styles = new Map<string, unknown>();
  readonly catalog = new Map<string, unknown>();
  readonly fabrics = new Map<string, unknown>();
  readonly quotes = new Map<string, Map<string, any>>();
  private groupAuthorizer: FutureOrderV2PaymentQuoteTransaction["assertGroupOrderIdentity"];

  constructor(authorizer?: FutureOrderV2PaymentQuoteTransaction["assertGroupOrderIdentity"]) {
    this.groupAuthorizer = authorizer;
  }

  async runTransaction<T>(operation: (transaction: FutureOrderV2PaymentQuoteTransaction) => Promise<T>): Promise<T> {
    const transaction: FutureOrderV2PaymentQuoteTransaction = {
      getOrder: async (orderId) => this.orders.get(orderId) ?? null,
      getPricingAuthority: async (orderId) => this.authorities.get(orderId) ?? null,
      createPricingAuthority: (orderId, authority) => {
        if (this.authorities.has(orderId)) throw new Error("authority collision");
        this.authorities.set(orderId, structuredClone(authority));
      },
      getStyle: async (styleId) => this.styles.get(styleId) ?? null,
      getCustomDetailOption: async (optionId) => this.catalog.get(optionId) ?? null,
      getFabric: async (fabricId) => this.fabrics.get(fabricId) ?? null,
      listActiveQuotes: async (orderId) =>
        [...(this.quotes.get(orderId)?.values() || [])].filter(
          (quote) => quote.lifecycleStatus === "active",
        ),
      createQuote: (orderId, quoteId, quote) => {
        const quotes = this.quotes.get(orderId) || new Map();
        if (quotes.has(quoteId)) throw new Error("quote collision");
        quotes.set(quoteId, structuredClone(quote));
        this.quotes.set(orderId, quotes);
      },
      updateQuoteLifecycle: (orderId, quoteId, lifecycleStatus) => {
        const quote = this.quotes.get(orderId)?.get(quoteId);
        if (!quote) throw new Error("quote missing");
        quote.lifecycleStatus = lifecycleStatus;
      },
      ...(this.groupAuthorizer ? { assertGroupOrderIdentity: this.groupAuthorizer } : {}),
    };
    return operation(transaction);
  }
}

const persistOrder = (adapter: MemoryQuoteAdapter, order: FutureOrderMasterOrderV2) => {
  const envelope = createPersistedFutureOrderV2({
    masterOrder: order,
    owner: { uid: OWNER_UID, isAnonymous: false },
    customerOwnerUid: OWNER_UID,
    persistedAt: NOW.toISOString(),
  });
  assert.equal(envelope.status, "valid");
  if (envelope.status !== "valid") throw new Error("Expected persisted envelope");
  adapter.orders.set(order.orderId, envelope.value);
};

const seedSources = (adapter: MemoryQuoteAdapter) => {
  adapter.styles.set("quote-style", styleRecord());
  adapter.catalog.set("shirt-base", {
    id: "shirt-base",
    active: true,
    selectionGroup: "shirt_construction",
    requiresEvaluation: false,
    priceCents: 10000,
  });
  adapter.catalog.set("personalized", {
    id: "personalized",
    active: true,
    selectionGroup: "shirt_additional",
    requiresEvaluation: true,
    priceCents: 5000,
  });
  adapter.fabrics.set("fabric-main", {
    code: "FAB-MAIN",
    stockStatus: "IN_STOCK",
    price: 999,
  });
};

const createAuthority = async (adapter: MemoryQuoteAdapter, order: FutureOrderMasterOrderV2) =>
  createServerVerifiedFutureOrderV2PricingAuthority({
    masterOrder: order,
    ownerUid: OWNER_UID,
    input: {
      schemaVersion: 1,
      orderLevelPricing: {
        topLevelStyleId: "quote-style",
        decorativeFeatureIds: ["Name Monogram", "Embroidery"],
        accessoryIds: ["Traditional Hat"],
      },
    },
    source: { getStyle: (styleId) => Promise.resolve(adapter.styles.get(styleId) ?? null) },
    now: () => NOW,
  });

const adapter = new MemoryQuoteAdapter();
seedSources(adapter);
const pricedOrder = masterOrder({ orderId: "payment-quote-order" });
persistOrder(adapter, pricedOrder);
adapter.authorities.set(pricedOrder.orderId, await createAuthority(adapter, pricedOrder));

const quote = await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
  identity: { uid: OWNER_UID, isAnonymous: false },
  orderId: pricedOrder.orderId,
  adapter,
  now: () => NOW,
  createQuoteId: () => "quote-1",
});
assert.equal(quote.status, "ready", JSON.stringify(quote));
if (quote.status !== "ready") throw new Error("Expected a trusted quote");
assert.equal(quote.currency, "eur");
assert.equal(quote.quote.shippingCents, 0, "Eindhoven pickup is zero post-Eindhoven");
assert.equal(quote.quote.orderSubtotalCents, 34400);
assert.equal(quote.payableCents, 34400, "server source prices ignore client cents");
assert.equal(quote.quote.sourceSnapshot.fabricIds[0], "fabric-main");
assert.equal(quote.quote.sourceSnapshot.constructionOptionIds[0], "shirt-base");

const parsedInvalidDecorativeInput = parseFutureOrderV2PricingAuthorityInput(
  {
    schemaVersion: 1,
    orderLevelPricing: {
      topLevelStyleId: "quote-style",
      decorativeFeatureIds: ["not-a-feature"],
      accessoryIds: [],
    },
  },
  pricedOrder.cartItem.candidate,
);
assert.equal(parsedInvalidDecorativeInput.status, "invalid");
assert.equal(
  parsedInvalidDecorativeInput.status === "invalid" && parsedInvalidDecorativeInput.code,
  "INVALID_ORDER_LEVEL_PRICING_IDENTIFIER",
);
await assert.rejects(
  () =>
    createServerVerifiedFutureOrderV2PricingAuthority({
      masterOrder: pricedOrder,
      ownerUid: OWNER_UID,
      input: {
        schemaVersion: 1,
        orderLevelPricing: {
          topLevelStyleId: "not-a-published-style",
          decorativeFeatureIds: ["Name Monogram", "Embroidery"],
          accessoryIds: ["Traditional Hat"],
        },
      },
      source: { getStyle: () => Promise.resolve(null) },
    }),
  (error: unknown) =>
    error instanceof FutureOrderV2PricingAuthorityError &&
    error.code === "PRICING_AUTHORITY_STYLE_INVALID",
);

const exactAuthority = structuredClone(adapter.authorities.get(pricedOrder.orderId) as Record<string, unknown>);
adapter.authorities.set(pricedOrder.orderId, {
  ...exactAuthority,
  pricingInputHash: "0".repeat(64),
});
assert.deepEqual(
  await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    orderId: pricedOrder.orderId,
    adapter,
  }),
  { status: "not_ready", orderId: pricedOrder.orderId, reason: "PRICING_AUTHORITY_MISMATCH" },
);
adapter.authorities.set(pricedOrder.orderId, {
  ...exactAuthority,
  orderId: "different-order",
});
assert.deepEqual(
  await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    orderId: pricedOrder.orderId,
    adapter,
  }),
  { status: "not_ready", orderId: pricedOrder.orderId, reason: "PRICING_AUTHORITY_MISMATCH" },
);
adapter.authorities.set(pricedOrder.orderId, {
  ...exactAuthority,
  orderLevelPricing: null,
  pricingInputHash: createFutureOrderV2PricingInputHash({
    masterOrder: pricedOrder,
    ownerUid: OWNER_UID,
    input: { schemaVersion: 1, orderLevelPricing: null },
  }),
});
assert.deepEqual(
  await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    orderId: pricedOrder.orderId,
    adapter,
  }),
  { status: "not_ready", orderId: pricedOrder.orderId, reason: "PRICING_AUTHORITY_MISMATCH" },
);
adapter.authorities.set(pricedOrder.orderId, exactAuthority);

const replay = await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
  identity: { uid: OWNER_UID, isAnonymous: false },
  orderId: pricedOrder.orderId,
  adapter,
  now: () => new Date(NOW.getTime() + 60_000),
  createQuoteId: () => "quote-should-not-create",
});
assert.equal(replay.status, "ready");
assert.equal(replay.status === "ready" && replay.reused, true);
assert.equal(replay.status === "ready" && replay.payableCents, 34400);

adapter.styles.set("quote-style", styleRecord(20, 25));
const expiredReprice = await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
  identity: { uid: OWNER_UID, isAnonymous: false },
  orderId: pricedOrder.orderId,
  adapter,
  now: () => new Date(NOW.getTime() + 31 * 60 * 1000),
  createQuoteId: () => "quote-2",
});
assert.equal(expiredReprice.status, "ready");
assert.equal(expiredReprice.status === "ready" && expiredReprice.reused, false);
assert.equal(expiredReprice.status === "ready" && expiredReprice.payableCents, 35700);

const historicalSafe = masterOrder({ orderId: "historical-safe", includeOrderLevelPricing: false });
persistOrder(adapter, historicalSafe);
const historicalReady = await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
  identity: { uid: OWNER_UID, isAnonymous: false },
  orderId: historicalSafe.orderId,
  adapter,
  now: () => NOW,
  createQuoteId: () => "historical-safe-quote",
});
assert.equal(historicalReady.status, "ready");
assert.equal(adapter.authorities.has(historicalSafe.orderId), true);

const historicalMissing = masterOrder({ orderId: "historical-missing" });
persistOrder(adapter, historicalMissing);
assert.deepEqual(
  await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    orderId: historicalMissing.orderId,
    adapter,
  }),
  { status: "not_ready", orderId: historicalMissing.orderId, reason: "PRICING_AUTHORITY_MISSING" },
);

const evaluationOrder = masterOrder({
  orderId: "evaluation-required",
  includeOrderLevelPricing: false,
  includeEvaluation: true,
});
persistOrder(adapter, evaluationOrder);
assert.deepEqual(
  await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    orderId: evaluationOrder.orderId,
    adapter,
  }),
  { status: "not_ready", orderId: evaluationOrder.orderId, reason: "EVALUATION_REQUIRED" },
);

const shippingOrder = masterOrder({
  orderId: "shipping-quote-required",
  includeOrderLevelPricing: false,
  shipping: "other_destination",
});
persistOrder(adapter, shippingOrder);
assert.deepEqual(
  await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    orderId: shippingOrder.orderId,
    adapter,
  }),
  { status: "not_ready", orderId: shippingOrder.orderId, reason: "SHIPPING_QUOTE_REQUIRED" },
);

const supportedShippingOrder = masterOrder({
  orderId: "shipping-server-tariff",
  includeOrderLevelPricing: false,
  shipping: "supported_destination",
});
persistOrder(adapter, supportedShippingOrder);
const supportedShippingQuote = await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
  identity: { uid: OWNER_UID, isAnonymous: false },
  orderId: supportedShippingOrder.orderId,
  adapter,
  now: () => NOW,
  createQuoteId: () => "supported-shipping-quote",
});
assert.equal(supportedShippingQuote.status, "ready");
assert.equal(
  supportedShippingQuote.status === "ready" && supportedShippingQuote.quote.shippingCents > 0,
  true,
);

const privateAdapter = new MemoryQuoteAdapter(async () => {
  throw new Error("membership revoked");
});
seedSources(privateAdapter);
const privateOrder = masterOrder({
  orderId: "private-payment-quote",
  includeOrderLevelPricing: false,
  orderIdentity: { orderType: "Group Organizer", batchId: "private-batch-quote" },
});
persistOrder(privateAdapter, privateOrder);
privateAdapter.authorities.set(
  privateOrder.orderId,
  await createServerVerifiedFutureOrderV2PricingAuthority({
    masterOrder: privateOrder,
    ownerUid: OWNER_UID,
    input: { schemaVersion: 1, orderLevelPricing: null },
    now: () => NOW,
  }),
);
assert.deepEqual(
  await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    orderId: privateOrder.orderId,
    adapter: privateAdapter,
  }),
  { status: "not_ready", orderId: privateOrder.orderId, reason: "PRIVATE_BATCH_UNAUTHORIZED" },
);

assert.deepEqual(
  await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
    identity: { uid: "different-owner", isAnonymous: false },
    orderId: pricedOrder.orderId,
    adapter,
  }),
  { status: "not_ready", orderId: pricedOrder.orderId, reason: "OWNER_MISMATCH" },
);
assert.deepEqual(
  await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: true },
    orderId: pricedOrder.orderId,
    adapter,
  }),
  { status: "not_ready", orderId: pricedOrder.orderId, reason: "ANONYMOUS_NOT_ALLOWED" },
);

console.log("PASS: server-owned Future Order V2 payment quote authority");
