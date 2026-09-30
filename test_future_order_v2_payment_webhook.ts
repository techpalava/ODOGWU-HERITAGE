import assert from "node:assert/strict";
import {
  createFutureOrderV2PaymentRecordHandler,
  type FutureOrderV2PaymentRecordStore,
  type StripeEventSummary,
  type StripePaymentIntentSummary,
} from "./src/server/futureOrderV2PaymentRecord";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { parseFutureOrderV2PaymentRecord } from "./src/utils/futureOrderV2PaymentRecord";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const ORDER_ID = "future-order-webhook";
const OWNER_UID = "webhook-owner";
const PAYMENT_INTENT_ID = "pi_test_webhook_123";
const EVENT_ID = "evt_test_webhook_123";

const persisted = createPersistedFutureOrderV2({
  masterOrder: createFutureOrderV2Fixture(ORDER_ID),
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
  persistedAt: "2026-09-05T12:00:00.000Z",
});
if (persisted.status !== "valid") throw new Error("Expected a valid persisted V2 order.");

const succeededIntent = (
  overrides: Partial<StripePaymentIntentSummary> = {},
): StripePaymentIntentSummary => ({
  id: PAYMENT_INTENT_ID,
  status: "succeeded",
  amount: 30000,
  currency: "eur",
  metadata: {
    orderId: ORDER_ID,
    paymentReference: `future-v2-payment-${ORDER_ID}`,
    stage: "Design Studio V2",
  },
  ...overrides,
});

const succeededEvent = (overrides: Partial<StripeEventSummary> = {}): StripeEventSummary => ({
  id: EVENT_ID,
  type: "payment_intent.succeeded",
  livemode: false,
  paymentIntentId: PAYMENT_INTENT_ID,
  ...overrides,
});

const createMemoryStore = (order: unknown = persisted.value) => {
  const payments = new Map<string, unknown>();
  let writes = 0;
  const store: FutureOrderV2PaymentRecordStore = {
    async readOrder(orderId) {
      return orderId === ORDER_ID ? order : null;
    },
    async runTransaction(operation) {
      return operation({
        async getPayment(orderId) {
          return payments.get(orderId) ?? null;
        },
        createPayment(orderId, record) {
          writes += 1;
          payments.set(orderId, record);
        },
      });
    },
  };
  return { store, payments, writes: () => writes };
};

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

const webhookRequest = (
  body: unknown = { id: EVENT_ID, object: "event", type: "payment_intent.succeeded" },
  headers: HttpRequest["headers"] = { "stripe-signature": "t=1,v1=ignored" },
): HttpRequest => ({ method: "POST", headers, body });

const createHandler = ({
  store = createMemoryStore().store,
  event = succeededEvent() as StripeEventSummary | null | Error,
  intent = succeededIntent() as StripePaymentIntentSummary | Error,
  secret = "sk_test_example",
  verifiedUid = OWNER_UID,
}: {
  store?: FutureOrderV2PaymentRecordStore;
  event?: StripeEventSummary | null | Error;
  intent?: StripePaymentIntentSummary | Error;
  secret?: string;
  verifiedUid?: string;
} = {}) => {
  const calls = { retrieveEvent: 0, verifyIdToken: 0 };
  const handler = createFutureOrderV2PaymentRecordHandler({
    getServices: () => ({
      auth: {
        async verifyIdToken(token) {
          calls.verifyIdToken += 1;
          if (token !== "valid-token") throw new Error("bad token");
          return { uid: verifiedUid, firebase: { sign_in_provider: "password" } };
        },
      },
      db: {},
    }),
    createStore: () => store,
    readSecretKey: () => secret,
    async retrieveEvent(eventId) {
      calls.retrieveEvent += 1;
      assert.equal(eventId, EVENT_ID, "only the event ID from the body is used");
      if (event instanceof Error) throw event;
      return event;
    },
    async retrievePaymentIntent() {
      if (intent instanceof Error) throw intent;
      return intent;
    },
    now: () => new Date("2026-09-30T12:00:00.000Z"),
    log: () => undefined,
  });
  return { handler, calls };
};

const bodyOf = (state: { body: unknown }) => state.body as Record<string, unknown>;

// A succeeded event saves the payment under the order owner's account.
{
  const memory = createMemoryStore();
  const { handler, calls } = createHandler({ store: memory.store });
  const first = response();
  await handler(webhookRequest(), first.res);
  assert.equal(first.state.statusCode, 200);
  assert.equal(bodyOf(first.state).status, "recorded");
  assert.equal(calls.verifyIdToken, 0, "a webhook never needs a Firebase token");
  assert.deepEqual(parseFutureOrderV2PaymentRecord(memory.payments.get(ORDER_ID)), {
    schemaVersion: 1,
    orderId: ORDER_ID,
    ownerUid: OWNER_UID,
    paymentIntentId: PAYMENT_INTENT_ID,
    amountCents: 30000,
    currency: "eur",
    status: "succeeded",
    testMode: true,
    recordedAt: "2026-09-30T12:00:00.000Z",
  });

  // Stripe may deliver the same event again.
  const replay = response();
  await handler(webhookRequest(), replay.res);
  assert.equal(replay.state.statusCode, 200);
  assert.equal(bodyOf(replay.state).status, "already_recorded");
  assert.equal(memory.writes(), 1, "a replayed event never writes twice");

  // The browser's own save after the webhook still succeeds.
  const browser = response();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: { orderId: ORDER_ID, paymentIntentId: PAYMENT_INTENT_ID },
    },
    browser.res,
  );
  assert.equal(browser.state.statusCode, 200);
  assert.equal(bodyOf(browser.state).status, "already_recorded");
  assert.equal(memory.writes(), 1);
}

// Events that are not V2 test payments are acknowledged without writing.
for (const [label, options] of [
  ["other event types", { event: succeededEvent({ type: "payment_intent.payment_failed" }) }],
  ["live mode events", { event: succeededEvent({ livemode: true }) }],
  ["events without a PaymentIntent", { event: succeededEvent({ paymentIntentId: null }) }],
  ["PaymentIntents without V2 metadata", { intent: succeededIntent({ metadata: {} }) }],
  [
    "a mismatched payment reference",
    { intent: succeededIntent({ metadata: { orderId: ORDER_ID, paymentReference: "other" } }) },
  ],
  ["a mismatched amount", { intent: succeededIntent({ amount: 100 }) }],
  ["a PaymentIntent that has not succeeded", { intent: succeededIntent({ status: "processing" }) }],
] as const) {
  const memory = createMemoryStore();
  const { handler } = createHandler({ store: memory.store, ...options });
  const { res, state } = response();
  await handler(webhookRequest(), res);
  assert.equal(state.statusCode, 200, `${label} are acknowledged`);
  assert.equal(bodyOf(state).status, "ignored", `${label} are ignored`);
  assert.equal(memory.writes(), 0, `${label} never write`);
}

// Unknown orders are acknowledged without writing.
{
  const memory = createMemoryStore(null);
  const { handler } = createHandler({ store: memory.store });
  const { res, state } = response();
  await handler(webhookRequest(), res);
  assert.equal(state.statusCode, 200);
  assert.equal(bodyOf(state).reason, "order_not_found");
  assert.equal(memory.writes(), 0);
}

// Malformed bodies and events Stripe does not know are rejected.
{
  const { handler, calls } = createHandler();
  const malformed = response();
  await handler(webhookRequest({ id: "not-an-event" }), malformed.res);
  assert.equal(malformed.state.statusCode, 400);
  assert.equal(calls.retrieveEvent, 0);

  const unknown = response();
  await createHandler({ event: null }).handler(webhookRequest(), unknown.res);
  assert.equal(unknown.state.statusCode, 400);
  assert.equal(bodyOf(unknown.state).code, "UNKNOWN_STRIPE_EVENT");
}

// Temporary Stripe or storage failures return 500 so Stripe retries.
{
  const eventOutage = response();
  await createHandler({ event: new Error("stripe down") }).handler(webhookRequest(), eventOutage.res);
  assert.equal(eventOutage.state.statusCode, 500);

  const intentOutage = response();
  await createHandler({ intent: new Error("stripe down") }).handler(webhookRequest(), intentOutage.res);
  assert.equal(intentOutage.state.statusCode, 500);

  const storageOutage = response();
  await createHandler({
    store: {
      async readOrder() {
        throw new Error("firestore down");
      },
      async runTransaction() {
        throw new Error("firestore down");
      },
    },
  }).handler(webhookRequest(), storageOutage.res);
  assert.equal(storageOutage.state.statusCode, 500);
  assert.equal(bodyOf(storageOutage.state).code, "PAYMENT_RECORD_UNAVAILABLE");
}

// Live keys are refused before Stripe is contacted.
{
  const { handler, calls } = createHandler({ secret: "sk_live_example" });
  const { res, state } = response();
  await handler(webhookRequest(), res);
  assert.equal(state.statusCode, 503);
  assert.equal(calls.retrieveEvent, 0);
}

// A Bearer token always takes the browser path, even with a stripe-signature header.
{
  const memory = createMemoryStore();
  const { handler, calls } = createHandler({ store: memory.store, verifiedUid: "someone-else" });
  const { res, state } = response();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer valid-token", "stripe-signature": "t=1,v1=ignored" },
      body: { orderId: ORDER_ID, paymentIntentId: PAYMENT_INTENT_ID },
    },
    res,
  );
  assert.equal(calls.retrieveEvent, 0);
  assert.equal(calls.verifyIdToken, 1);
  assert.equal(state.statusCode, 403, "the signed-in owner check still applies");
  assert.equal(memory.writes(), 0);
}

// Without a Bearer token or a stripe-signature header, authentication is required.
{
  const { res, state } = response();
  await createHandler().handler(webhookRequest(undefined, {}), res);
  assert.equal(state.statusCode, 401);
}

console.log("PASS: V2 order Stripe payment webhook");
