import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  handleFutureOrderV2StripeConfig,
  handleFutureOrderV2StripePayment,
} from "./src/server/futureOrderV2StripePayment";
import type { HttpResponse } from "./src/server/httpTypes";
import {
  authorizeFutureOrderV2Payment,
  readFutureOrderV2ReviewedTotalCents,
  registerFutureOrderV2PaymentConfirmer,
  registerFutureOrderV2PaymentIdentityResolver,
} from "./src/utils/futureOrderV2Payment";
import { createFutureOrderV2PreparationAttempt } from "./src/utils/futureOrderV2Preparation";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const OWNER_UID = "stripe-payment-owner";
const OTHER_UID = "stripe-payment-other";

const preparedResult = createFutureOrderV2PreparationAttempt({
  candidate: createFutureOrderV2Fixture("stripe-payment").cartItem.candidate,
  ids: { cartItemId: "future-cart-stripe", orderId: "future-order-stripe" },
});
assert.equal(preparedResult.status, "valid");
if (preparedResult.status !== "valid") {
  throw new Error("Expected the signed-in order fixture to prepare.");
}
const prepared = preparedResult.attempt;
const paymentReference = `future-v2-payment-${prepared.orderId}`;
assert.equal(readFutureOrderV2ReviewedTotalCents({
  orderId: prepared.orderId,
  cartItemId: prepared.cartItemId,
  paymentReference,
  masterOrder: prepared.masterOrder,
}), 30000);

const persisted = createPersistedFutureOrderV2({
  masterOrder: prepared.masterOrder,
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
  persistedAt: "2026-10-05T18:00:00.000Z",
});
if (persisted.status !== "valid") {
  throw new Error("Expected a valid persisted V2 order for Stripe payment.");
}

const ownerToken = {
  uid: OWNER_UID,
  firebase: { sign_in_provider: "password" },
};

const authDependencies = ({
  token = ownerToken,
  order = persisted.value as unknown,
}: {
  token?: { uid: string; firebase: { sign_in_provider: string } };
  order?: unknown;
} = {}) => ({
  readSecretKey: () => "sk_test_example",
  getServices: () => ({
    auth: {
      async verifyIdToken(bearer: string) {
        if (bearer !== "owner-token" && bearer !== "other-token" && bearer !== "anon-token") {
          throw new Error("invalid token");
        }
        if (bearer === "anon-token") {
          return { uid: "anon", firebase: { sign_in_provider: "anonymous" } };
        }
        if (bearer === "other-token") {
          return { uid: OTHER_UID, firebase: { sign_in_provider: "password" } };
        }
        return token;
      },
    },
    db: {},
  }),
  readPersistedOrder: async (orderId: string) =>
    orderId === prepared.orderId ? order : null,
  async resolveAuthoritativeTotalCents(candidate) {
    const total = candidate.pricing.exactTotalCents;
    if (typeof total !== "number") throw new Error("missing total");
    return total;
  },
});

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

const ownerAuthHeaders = { authorization: "Bearer owner-token" };

{
  const { res, state } = response();
  await handleFutureOrderV2StripePayment(
    { method: "POST", headers: {}, body: {} },
    res,
    { readSecretKey: () => "sk_test_example" },
  );
  assert.equal(state.statusCode, 401);
  assert.deepEqual(state.body, {
    error: "Firebase authentication is required.",
    code: "AUTH_REQUIRED",
  });
}

{
  const { res, state } = response();
  let charged = false;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: ownerAuthHeaders,
      body: {
        orderId: prepared.orderId,
        paymentReference,
        masterOrder: prepared.masterOrder,
      },
    },
    res,
    {
      ...authDependencies(),
      readSecretKey: () => "",
      async createPaymentIntent() {
        charged = true;
        return {
          id: "pi_blocked",
          clientSecret: "secret",
          paymentMethodTypes: ["card", "ideal"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 503);
  assert.equal(charged, false);
}

{
  const { res, state } = response();
  let charged = false;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: ownerAuthHeaders,
      body: {
        orderId: prepared.orderId,
        paymentReference,
        masterOrder: prepared.masterOrder,
      },
    },
    res,
    {
      ...authDependencies(),
      readSecretKey: () => "sk_live_example",
      async createPaymentIntent() {
        charged = true;
        return {
          id: "pi_live_blocked",
          clientSecret: "secret",
          paymentMethodTypes: ["card", "ideal"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 503);
  assert.equal(charged, false);
}

{
  const { res, state } = response();
  let charged = false;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: { authorization: "Bearer anon-token" },
      body: {
        orderId: prepared.orderId,
        paymentReference,
        masterOrder: prepared.masterOrder,
      },
    },
    res,
    {
      ...authDependencies(),
      async createPaymentIntent() {
        charged = true;
        return {
          id: "pi_anon_blocked",
          clientSecret: "secret",
          paymentMethodTypes: ["card", "ideal"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 403);
  assert.equal(
    (state.body as { code?: string }).code,
    "ANONYMOUS_NOT_ALLOWED",
  );
  assert.equal(charged, false);
}

{
  const { res, state } = response();
  let charged = false;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: { authorization: "Bearer other-token" },
      body: {
        orderId: prepared.orderId,
        paymentReference,
        masterOrder: prepared.masterOrder,
      },
    },
    res,
    {
      ...authDependencies(),
      async createPaymentIntent() {
        charged = true;
        return {
          id: "pi_owner_blocked",
          clientSecret: "secret",
          paymentMethodTypes: ["card", "ideal"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 403);
  assert.equal((state.body as { code?: string }).code, "OWNER_MISMATCH");
  assert.equal(charged, false);
}

{
  const cheapMasterOrder = JSON.parse(JSON.stringify(prepared.masterOrder)) as {
    cartItem: {
      candidate: { pricing: { status: string; exactTotalCents: number } };
    };
  };
  cheapMasterOrder.cartItem.candidate.pricing.exactTotalCents = 50;
  const { res, state } = response();
  let created: unknown = null;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: ownerAuthHeaders,
      body: {
        orderId: prepared.orderId,
        paymentReference,
        masterOrder: cheapMasterOrder,
        amountCents: 1,
      },
    },
    res,
    {
      ...authDependencies(),
      async createPaymentIntent(input) {
        created = input;
        return {
          id: "pi_test_reviewed",
          clientSecret: "pi_test_reviewed_secret_abc",
          paymentMethodTypes: ["card", "ideal"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 200);
  assert.deepEqual(created, {
    amountCents: 30000,
    orderId: prepared.orderId,
    paymentReference,
  });
  assert.deepEqual(state.body, {
    paymentIntentId: "pi_test_reviewed",
    clientSecret: "pi_test_reviewed_secret_abc",
    paymentMethodTypes: ["card", "ideal"],
  });
}

{
  const pendingPersisted = JSON.parse(JSON.stringify(persisted.value)) as {
    masterOrder: {
      cartItem: { candidate: { pricing: { status: string } } };
    };
  };
  pendingPersisted.masterOrder.cartItem.candidate.pricing.status = "pending";
  const { res, state } = response();
  let charged = false;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: ownerAuthHeaders,
      body: {
        orderId: prepared.orderId,
        paymentReference,
        masterOrder: prepared.masterOrder,
      },
    },
    res,
    {
      ...authDependencies({ order: pendingPersisted }),
      async createPaymentIntent() {
        charged = true;
        return {
          id: "pi_test_blocked",
          clientSecret: "secret",
          paymentMethodTypes: ["card", "ideal"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 400);
  assert.equal(charged, false);
}

{
  const { res, state } = response();
  let charged = false;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: ownerAuthHeaders,
      body: {
        orderId: prepared.orderId,
        paymentReference,
        masterOrder: prepared.masterOrder,
      },
    },
    res,
    {
      ...authDependencies({ order: null }),
      async createPaymentIntent() {
        charged = true;
        return {
          id: "pi_missing",
          clientSecret: "secret",
          paymentMethodTypes: ["card", "ideal"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 404);
  assert.equal((state.body as { code?: string }).code, "ORDER_NOT_FOUND");
  assert.equal(charged, false);
}

{
  const { res, state } = response();
  handleFutureOrderV2StripeConfig({ method: "GET", headers: {} }, res, {
    readPublishableKey: () => "pk_test_example",
  });
  assert.deepEqual(state.body, {
    publishableKey: "pk_test_example",
    testMode: true,
  });
}

{
  const { res, state } = response();
  handleFutureOrderV2StripeConfig({ method: "GET", headers: {} }, res, {
    readPublishableKey: () => "pk_live_example",
  });
  assert.equal(state.statusCode, 503);
}

const serverSource = readFileSync("server.ts", "utf8");
const paymentRouteStart = serverSource.indexOf('"/api/future-order-v2/payment-intent"');
const paymentRouteEnd = serverSource.indexOf('"/api/create-payment-intent"');
const paymentRoute = serverSource.slice(paymentRouteStart, paymentRouteEnd);
assert.ok(paymentRouteStart >= 0 && paymentRouteEnd > paymentRouteStart);
assert.equal(paymentRoute.includes("amount / 2"), false);
const stripeSource = readFileSync("src/server/futureOrderV2StripePayment.ts", "utf8");
assert.match(stripeSource, /currency: "eur"/);
assert.match(stripeSource, /createOnce\(input\.paymentReference\)/);
assert.match(stripeSource, /payment_method_types: \[\.\.\.FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES\]/);
assert.match(
  stripeSource,
  /FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES = \["card", "ideal"\]/,
);
assert.equal(stripeSource.includes('"paypal"'), false);
assert.match(stripeSource, /IDEAL_IDEMPOTENCY_SUFFIX/);
assert.match(stripeSource, /idempotencyKey/);
assert.match(stripeSource, /AUTH_REQUIRED/);
assert.match(stripeSource, /parsePersistedFutureOrderV2/);
assert.match(stripeSource, /OWNER_MISMATCH/);
assert.match(stripeSource, /PRICE_NOT_AUTHORITATIVE/);
assert.equal(stripeSource.includes("parseFutureOrderMasterOrderV2"), false);
const paymentIntentApi = readFileSync("api/future-order-v2/payment-intent.ts", "utf8");
assert.equal(paymentIntentApi.includes("handleFutureOrderV2StripePayment"), true);
assert.equal(paymentIntentApi.includes("handleFutureOrderV2StripeConfig"), true);
const stripeCardSource = readFileSync("src/components/FutureOrderV2StripeCard.tsx", "utf8");
assert.match(stripeCardSource, /confirmIdealPayment/);
assert.match(stripeCardSource, /data-future-order-v2-method-ideal/);
assert.equal(stripeCardSource.includes("confirmPayPalPayment"), false);
assert.equal(stripeCardSource.includes("data-future-order-v2-method-paypal"), false);

const originalFetch = globalThis.fetch;
let postedAmount = false;
let postedAuthorization: string | null = null;
globalThis.fetch = async (_url, init) => {
  const headers = init?.headers as Record<string, string> | undefined;
  postedAuthorization =
    headers?.Authorization ?? headers?.authorization ?? null;
  const body = JSON.parse(String(init?.body)) as { amountCents?: unknown };
  postedAmount = "amountCents" in body;
  return new Response(
    JSON.stringify({
      paymentIntentId: "pi_test_reviewed",
      clientSecret: "pi_test_reviewed_secret_abc",
      paymentMethodTypes: ["card", "ideal"],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
registerFutureOrderV2PaymentIdentityResolver(() => ({
  isAnonymous: false,
  async getIdToken() {
    return "owner-token";
  },
}));
registerFutureOrderV2PaymentConfirmer(async (clientSecret, context) => {
  assert.equal(clientSecret, "pi_test_reviewed_secret_abc");
  assert.deepEqual(context.paymentMethodTypes, ["card", "ideal"]);
  return { status: "confirmed", paymentIntentId: "pi_test_reviewed" };
});
try {
  const authorized = await authorizeFutureOrderV2Payment({
    orderId: prepared.orderId,
    cartItemId: prepared.cartItemId,
    paymentReference,
    masterOrder: prepared.masterOrder,
  });
  assert.equal(authorized.status, "authorized");
  if (authorized.status !== "authorized") throw new Error("Expected authorization.");
  assert.equal(authorized.providerTransactionReference, "pi_test_reviewed");
  assert.equal(postedAmount, false);
  assert.equal(postedAuthorization, "Bearer owner-token");
} finally {
  registerFutureOrderV2PaymentConfirmer(null);
  registerFutureOrderV2PaymentIdentityResolver(null);
  globalThis.fetch = originalFetch;
}

globalThis.fetch = async () =>
  new Response(
    JSON.stringify({
      paymentIntentId: "pi_test_ideal",
      clientSecret: "pi_test_ideal_secret",
      paymentMethodTypes: ["card", "ideal"],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
registerFutureOrderV2PaymentIdentityResolver(() => ({
  isAnonymous: false,
  async getIdToken() {
    return "owner-token";
  },
}));
registerFutureOrderV2PaymentConfirmer(async () => ({ status: "redirecting" }));
try {
  const redirecting = await authorizeFutureOrderV2Payment({
    orderId: prepared.orderId,
    cartItemId: prepared.cartItemId,
    paymentReference,
    masterOrder: prepared.masterOrder,
  });
  assert.equal(redirecting.status, "redirecting");
} finally {
  registerFutureOrderV2PaymentConfirmer(null);
  registerFutureOrderV2PaymentIdentityResolver(null);
  globalThis.fetch = originalFetch;
}

registerFutureOrderV2PaymentIdentityResolver(() => ({
  isAnonymous: false,
  async getIdToken() {
    return "owner-token";
  },
}));
try {
  const missingMethod = await authorizeFutureOrderV2Payment({
    orderId: prepared.orderId,
    cartItemId: prepared.cartItemId,
    paymentReference,
    masterOrder: prepared.masterOrder,
  });
  assert.equal(missingMethod.status, "failed");
  if (missingMethod.status === "failed") {
    assert.match(missingMethod.message, /payment method/i);
  }
} finally {
  registerFutureOrderV2PaymentIdentityResolver(null);
}

registerFutureOrderV2PaymentIdentityResolver(() => null);
registerFutureOrderV2PaymentConfirmer(async () => ({
  status: "confirmed",
  paymentIntentId: "pi_should_not_run",
}));
try {
  const unsigned = await authorizeFutureOrderV2Payment({
    orderId: prepared.orderId,
    cartItemId: prepared.cartItemId,
    paymentReference,
    masterOrder: prepared.masterOrder,
  });
  assert.equal(unsigned.status, "failed");
  if (unsigned.status === "failed") {
    assert.match(unsigned.message, /Sign in/i);
  }
} finally {
  registerFutureOrderV2PaymentConfirmer(null);
  registerFutureOrderV2PaymentIdentityResolver(null);
}

console.log(
  "PASS: Design Studio V2 charges the persisted euro total through authenticated Stripe",
);
