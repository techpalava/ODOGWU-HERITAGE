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
  registerFutureOrderV2CardConfirmer,
} from "./src/utils/futureOrderV2Payment";
import { createFutureOrderV2PreparationAttempt } from "./src/utils/futureOrderV2Preparation";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

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
  const { res, state } = response();
  await handleFutureOrderV2StripePayment(
    { method: "POST", headers: {}, body: {} },
    res,
    { readSecretKey: () => "" },
  );
  assert.equal(state.statusCode, 503);
}

{
  const { res, state } = response();
  let charged = false;
  await handleFutureOrderV2StripePayment(
    { method: "POST", headers: {}, body: {} },
    res,
    {
      readSecretKey: () => "sk_live_example",
      async createPaymentIntent() {
        charged = true;
        return { id: "pi_live_blocked", clientSecret: "secret" };
      },
    },
  );
  assert.equal(state.statusCode, 503);
  assert.equal(charged, false);
}

{
  const { res, state } = response();
  let created: unknown = null;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: {},
      body: {
        orderId: prepared.orderId,
        paymentReference,
        masterOrder: prepared.masterOrder,
        amountCents: 1,
      },
    },
    res,
    {
      readSecretKey: () => "sk_test_example",
      async createPaymentIntent(input) {
        created = input;
        return {
          id: "pi_test_reviewed",
          clientSecret: "pi_test_reviewed_secret_abc",
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
  });
}

{
  const masterOrder = JSON.parse(JSON.stringify(prepared.masterOrder)) as {
    cartItem: { candidate: { pricing: { status: string } } };
  };
  masterOrder.cartItem.candidate.pricing.status = "pending";
  const { res, state } = response();
  let charged = false;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: {},
      body: {
        orderId: prepared.orderId,
        paymentReference,
        masterOrder,
      },
    },
    res,
    {
      readSecretKey: () => "sk_test_example",
      async createPaymentIntent() {
        charged = true;
        return { id: "pi_test_blocked", clientSecret: "secret" };
      },
    },
  );
  assert.equal(state.statusCode, 400);
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
assert.match(stripeSource, /idempotencyKey: input\.paymentReference/);
assert.equal(readFileSync("api/future-order-v2/payment-intent.ts", "utf8").includes("handleFutureOrderV2StripePayment"), true);
assert.equal(readFileSync("api/future-order-v2/stripe-config.ts", "utf8").includes("handleFutureOrderV2StripeConfig"), true);

const originalFetch = globalThis.fetch;
let postedAmount = false;
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body)) as { amountCents?: unknown };
  postedAmount = "amountCents" in body;
  return new Response(
    JSON.stringify({
      paymentIntentId: "pi_test_reviewed",
      clientSecret: "pi_test_reviewed_secret_abc",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
registerFutureOrderV2CardConfirmer(async (clientSecret) => {
  assert.equal(clientSecret, "pi_test_reviewed_secret_abc");
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
} finally {
  registerFutureOrderV2CardConfirmer(null);
  globalThis.fetch = originalFetch;
}

const missingCard = await authorizeFutureOrderV2Payment({
  orderId: prepared.orderId,
  cartItemId: prepared.cartItemId,
  paymentReference,
  masterOrder: prepared.masterOrder,
});
assert.equal(missingCard.status, "failed");

console.log("PASS: Design Studio V2 charges the reviewed euro total through Stripe");
