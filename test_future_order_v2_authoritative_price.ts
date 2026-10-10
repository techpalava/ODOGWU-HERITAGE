import assert from "node:assert/strict";
import {
  handleFutureOrderV2StripePayment,
} from "./src/server/futureOrderV2StripePayment";
import type { HttpResponse } from "./src/server/httpTypes";
import {
  FutureOrderV2PriceAuthorityError,
  requireAuthoritativeExactTotalCents,
  type AuthoritativePriceCandidate,
} from "./src/server/futureOrderV2AuthoritativePrice";
import { createFutureOrderV2PersistenceHandler } from "./src/server/futureOrderV2PersistenceHttp";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { createFutureOrderMasterOrderV2, createFutureOrderCartItemV2 } from "./src/utils/futureOrderV2Storage";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import type { FutureOrderCandidateV2 } from "./src/utils/futureOrderCandidate";

const shirtCandidate = (priceCents: number): AuthoritativePriceCandidate => ({
  garments: [
    {
      garmentType: "shirt",
      construction: [
        {
          selectionGroup: "shirt_construction",
          optionId: "shirt_std_short",
          priceCents,
        },
      ],
      constructionTotalCents: priceCents,
    },
  ],
  customDetails: [],
  pricing: {
    status: "exact",
    garmentConstructionSubtotalCents: priceCents,
    customDetailsCents: 0,
    postEindhovenAdjustmentCents: 0,
    exactTotalCents: priceCents,
  },
});

{
  const total = requireAuthoritativeExactTotalCents(shirtCandidate(6500), []);
  assert.equal(total, 6500);
}

{
  assert.throws(
    () => requireAuthoritativeExactTotalCents(shirtCandidate(50), []),
    (error: unknown) =>
      error instanceof FutureOrderV2PriceAuthorityError &&
      error.code === "PRICE_NOT_AUTHORITATIVE",
  );
}

{
  const withMonogram = shirtCandidate(6500);
  const priced = {
    ...withMonogram,
    customDetails: [
      {
        selectionGroup: "name_monogram",
        optionId: "not-a-catalogue-option",
        priceStatus: "exact",
        priceCents: 1200,
      },
    ],
    pricing: {
      ...withMonogram.pricing,
      customDetailsCents: 1200,
      exactTotalCents: 7700,
    },
  };
  assert.throws(
    () => requireAuthoritativeExactTotalCents(priced, []),
    (error: unknown) =>
      error instanceof FutureOrderV2PriceAuthorityError &&
      error.code === "PRICE_NOT_AUTHORITATIVE",
  );
}

const response = () => {
  const state = { statusCode: 200, body: null as unknown };
  const res: HttpResponse = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    setHeader() {
      return res;
    },
    json(body) {
      state.body = body;
      return body;
    },
  };
  return { res, state };
};

{
  const fixture = createFutureOrderV2Fixture("cheap-ledger");
  const persisted = createPersistedFutureOrderV2({
    masterOrder: fixture,
    owner: { uid: "price-owner", isAnonymous: false },
    customerOwnerUid: "price-owner",
    persistedAt: "2026-10-10T00:00:00.000Z",
  });
  if (persisted.status !== "valid") throw new Error("Expected fixture to parse.");
  const { res, state } = response();
  let charged = false;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: { authorization: "Bearer owner-token" },
      body: {
        orderId: "cheap-ledger",
        paymentReference: "future-v2-payment-cheap-ledger",
      },
    },
    res,
    {
      readSecretKey: () => "sk_test_example",
      getServices: () => ({
        auth: {
          async verifyIdToken() {
            return {
              uid: "price-owner",
              firebase: { sign_in_provider: "password" },
            };
          },
        },
        db: {
          collection() {
            return { async get() { return { docs: [] }; } };
          },
        },
      }),
      readPersistedOrder: async () => persisted.value,
      async createPaymentIntent() {
        charged = true;
        return {
          id: "pi_should_not_charge",
          clientSecret: "secret",
          paymentMethodTypes: ["card", "ideal"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 409);
  assert.equal((state.body as { code?: string }).code, "PRICE_NOT_AUTHORITATIVE");
  assert.equal(charged, false);
}

{
  const fixture = createFutureOrderV2Fixture("catalogue-down");
  const persisted = createPersistedFutureOrderV2({
    masterOrder: fixture,
    owner: { uid: "price-owner", isAnonymous: false },
    customerOwnerUid: "price-owner",
    persistedAt: "2026-10-10T00:00:00.000Z",
  });
  if (persisted.status !== "valid") throw new Error("Expected fixture to parse.");
  const { res, state } = response();
  let charged = false;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: { authorization: "Bearer owner-token" },
      body: {
        orderId: "catalogue-down",
        paymentReference: "future-v2-payment-catalogue-down",
      },
    },
    res,
    {
      readSecretKey: () => "sk_test_example",
      getServices: () => ({
        auth: {
          async verifyIdToken() {
            return {
              uid: "price-owner",
              firebase: { sign_in_provider: "password" },
            };
          },
        },
        db: {
          collection() {
            throw new Error("catalogue unavailable");
          },
        },
      }),
      readPersistedOrder: async () => persisted.value,
      async createPaymentIntent() {
        charged = true;
        return {
          id: "pi_should_not_charge",
          clientSecret: "secret",
          paymentMethodTypes: ["card", "ideal"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 503);
  assert.equal((state.body as { code?: string }).code, "PRICE_CATALOGUE_UNAVAILABLE");
  assert.equal(charged, false);
}

{
  const base = createFutureOrderV2Fixture("catalogue-shirt").cartItem.candidate;
  const candidate = {
    ...base,
    garments: [
      {
        ...base.garments[0],
        garmentType: "shirt",
        construction: [
          {
            componentKey: "shirt:shirt_construction:shirt_std_short",
            selectionGroup: "shirt_construction",
            optionId: "shirt_std_short",
            label: "Standard Length Shirt, Short Sleeve",
            priceCents: 6500,
          },
        ],
        constructionTotalCents: 6500,
      },
    ],
    pricing: {
      ...base.pricing,
      garmentConstructionSubtotalCents: 6500,
      customDetailsCents: 0,
      selectedDesignTotalCents: 6500,
      postEindhovenAdjustmentCents: 0,
      exactTotalCents: 6500,
      components: {
        ...base.pricing.components,
        customDetails: { status: "separately_charged" as const, amountCents: 0 },
        postEindhovenDelivery: {
          status: "separately_charged" as const,
          amountCents: 0,
        },
      },
    },
  } as FutureOrderCandidateV2;
  const cart = createFutureOrderCartItemV2({
    candidate,
    metadata: { cartItemId: "cart-catalogue-shirt" },
  });
  if (cart.status !== "valid") throw new Error(cart.status);
  const master = createFutureOrderMasterOrderV2({
    cartItem: cart.value,
    metadata: { orderId: "catalogue-shirt" },
  });
  if (master.status !== "valid") {
    throw new Error(master.blockers?.[0]?.message || master.status);
  }
  const persisted = createPersistedFutureOrderV2({
    masterOrder: master.value,
    owner: { uid: "price-owner", isAnonymous: false },
    customerOwnerUid: "price-owner",
    persistedAt: "2026-10-10T00:00:00.000Z",
  });
  if (persisted.status !== "valid") {
    throw new Error("Catalogue-priced order did not persist in the parser.");
  }
  const { res, state } = response();
  let chargedAmount: number | null = null;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: { authorization: "Bearer owner-token" },
      body: {
        orderId: "catalogue-shirt",
        paymentReference: "future-v2-payment-catalogue-shirt",
        amountCents: 50,
      },
    },
    res,
    {
      readSecretKey: () => "sk_test_example",
      getServices: () => ({
        auth: {
          async verifyIdToken() {
            return {
              uid: "price-owner",
              firebase: { sign_in_provider: "password" },
            };
          },
        },
        db: {
          collection() {
            return { async get() { return { docs: [] }; } };
          },
        },
      }),
      readPersistedOrder: async () => persisted.value,
      async createPaymentIntent(input) {
        chargedAmount = input.amountCents;
        return {
          id: "pi_catalogue_shirt",
          clientSecret: "pi_catalogue_shirt_secret",
          paymentMethodTypes: ["card", "ideal"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 200);
  assert.equal(chargedAmount, 6500);
}

{
  let created = false;
  const handler = createFutureOrderV2PersistenceHandler({
    getServices: () => ({
      auth: {
        async verifyIdToken() {
          return {
            uid: "price-owner",
            firebase: { sign_in_provider: "password" },
          };
        },
      },
      db: {
        collection() {
          return { async get() { return { docs: [] }; } };
        },
      },
    }),
    createAdapter: () => ({
      async runTransaction() {
        created = true;
        throw new Error("persist should not run");
      },
    }),
    log: () => undefined,
  });
  const state = { statusCode: 200, body: null as unknown };
  const res: HttpResponse = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    setHeader() {
      return res;
    },
    json(body) {
      state.body = body;
      return body;
    },
  };
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: {
        masterOrder: createFutureOrderV2Fixture("unpriced-ledger"),
        customerOwnerUid: "price-owner",
      },
    },
    res,
  );
  assert.equal(state.statusCode, 409);
  assert.equal((state.body as { code?: string }).code, "PRICE_NOT_AUTHORITATIVE");
  assert.equal(created, false);
}

console.log("PASS: V2 charge total follows the catalogue, not a client ledger");
