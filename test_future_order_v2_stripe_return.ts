import assert from "node:assert/strict";
import {
  FUTURE_ORDER_V2_STRIPE_RETURN_ORDER_PARAM,
  FUTURE_ORDER_V2_STRIPE_RETURN_PARAM,
  clearFutureOrderV2StripeReturnSearchParams,
  parseFutureOrderV2StripeReturnSearch,
  resumeFutureOrderV2StripeReturn,
  stashFutureOrderV2StripeReturnContext,
  readFutureOrderV2StripeReturnContext,
  clearFutureOrderV2StripeReturnContext,
} from "./src/utils/futureOrderV2StripeReturn";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
};

stashFutureOrderV2StripeReturnContext(
  {
    orderId: "future-order-ideal",
    paymentReference: "future-v2-payment-future-order-ideal",
    surface: "dashboard",
  },
  storage,
);
assert.deepEqual(readFutureOrderV2StripeReturnContext(storage), {
  orderId: "future-order-ideal",
  paymentReference: "future-v2-payment-future-order-ideal",
  surface: "dashboard",
});
clearFutureOrderV2StripeReturnContext(storage);
assert.equal(readFutureOrderV2StripeReturnContext(storage), null);

const search = new URLSearchParams({
  [FUTURE_ORDER_V2_STRIPE_RETURN_PARAM]: "1",
  [FUTURE_ORDER_V2_STRIPE_RETURN_ORDER_PARAM]: "future-order-ideal",
  payment_intent: "pi_ideal_return",
  payment_intent_client_secret: "pi_ideal_return_secret",
  redirect_status: "succeeded",
}).toString();
assert.deepEqual(parseFutureOrderV2StripeReturnSearch(`?${search}`), {
  orderId: "future-order-ideal",
  paymentIntentId: "pi_ideal_return",
  clientSecret: "pi_ideal_return_secret",
  redirectStatus: "succeeded",
});
assert.equal(parseFutureOrderV2StripeReturnSearch(""), null);

let replaced = "";
clearFutureOrderV2StripeReturnSearchParams(
  `https://example.test/app?${search}&keep=1`,
  (url) => {
    replaced = url;
  },
);
assert.equal(replaced.includes(FUTURE_ORDER_V2_STRIPE_RETURN_PARAM), false);
assert.equal(replaced.includes("payment_intent="), false);
assert.equal(replaced.includes("keep=1"), true);

stashFutureOrderV2StripeReturnContext(
  {
    orderId: "future-order-ideal",
    paymentReference: "future-v2-payment-future-order-ideal",
    surface: "design-studio",
  },
  storage,
);
const recorded = await resumeFutureOrderV2StripeReturn({
  search: `?${search}`,
  retrievePaymentIntent: async (clientSecret) => {
    assert.equal(clientSecret, "pi_ideal_return_secret");
    return { id: "pi_ideal_return", status: "succeeded" };
  },
  record: async ({ orderId, paymentIntentId }) => ({
    status: "recorded",
    record: {
      schemaVersion: 2,
      orderId,
      ownerUid: "owner",
      provider: "stripe",
      providerTransactionId: paymentIntentId,
      amountCents: 30000,
      currency: "eur",
      status: "succeeded",
      testMode: true,
      recordedAt: "2026-10-03T12:00:00.000Z",
    },
  }),
  readContext: () => readFutureOrderV2StripeReturnContext(storage),
  clearContext: () => clearFutureOrderV2StripeReturnContext(storage),
  clearSearch: () => {},
});
assert.equal(recorded.status, "recorded");
if (recorded.status === "recorded") {
  assert.equal(recorded.orderId, "future-order-ideal");
  assert.equal(recorded.record.providerTransactionId, "pi_ideal_return");
}
assert.equal(readFutureOrderV2StripeReturnContext(storage), null);

const failedReturn = await resumeFutureOrderV2StripeReturn({
  search: `?${new URLSearchParams({
    [FUTURE_ORDER_V2_STRIPE_RETURN_PARAM]: "1",
    [FUTURE_ORDER_V2_STRIPE_RETURN_ORDER_PARAM]: "future-order-ideal",
    payment_intent: "pi_ideal_cancel",
    payment_intent_client_secret: "pi_ideal_cancel_secret",
    redirect_status: "failed",
  }).toString()}`,
  retrievePaymentIntent: async () => {
    throw new Error("should not retrieve after failed redirect");
  },
  record: async () => {
    throw new Error("should not record after failed redirect");
  },
  clearSearch: () => {},
});
assert.equal(failedReturn.status, "failed");

console.log("PASS: Future Order V2 Stripe iDEAL return resume");
