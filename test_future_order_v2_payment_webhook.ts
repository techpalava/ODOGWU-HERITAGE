import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import Stripe from "stripe";
import { config as recordPaymentConfig } from "./api/future-order-v2/record-payment";
import {
  createFutureOrderV2PaymentRecordHandler,
  httpRequestFromRawBody,
  readRawHttpBody,
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
const FORGED_EVENT_ID = "evt_forged_body";
const WEBHOOK_SECRET = "whsec_test_placeholder";
const VALID_SIGNATURE = "t=1700000000,v1=testvalid";
const FORGED_SIGNATURE = "t=1,v1=forged-not-a-real-signature";
// Spacing must survive verification. Re-serializing this JSON changes the bytes.
const RAW_BODY = '{ "id" : "evt_forged_body" }';

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
  body: unknown = { id: FORGED_EVENT_ID, object: "event", type: "payment_intent.succeeded" },
  headers: HttpRequest["headers"] = { "stripe-signature": VALID_SIGNATURE },
  rawBody: string | Uint8Array | undefined = RAW_BODY,
): HttpRequest => ({ method: "POST", headers, body, rawBody });

const createHandler = ({
  store = createMemoryStore().store,
  event = succeededEvent() as StripeEventSummary | Error,
  intent = succeededIntent() as StripePaymentIntentSummary | Error,
  secret = "sk_test_example",
  webhookSecret = WEBHOOK_SECRET,
  verifiedUid = OWNER_UID,
  acceptSignature = true,
}: {
  store?: FutureOrderV2PaymentRecordStore;
  event?: StripeEventSummary | Error;
  intent?: StripePaymentIntentSummary | Error;
  secret?: string;
  webhookSecret?: string;
  verifiedUid?: string;
  acceptSignature?: boolean;
} = {}) => {
  const calls = { constructEvent: 0, retrievePaymentIntent: 0, verifyIdToken: 0 };
  const seenRawBodies: Array<string | Uint8Array> = [];
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
    readWebhookSecret: () => webhookSecret,
    constructEvent(rawBody, signature, webhookSecretArg) {
      calls.constructEvent += 1;
      seenRawBodies.push(rawBody);
      assert.equal(webhookSecretArg, WEBHOOK_SECRET);
      assert.notEqual(webhookSecretArg, secret);
      if (!acceptSignature || signature !== VALID_SIGNATURE || event instanceof Error) {
        throw new Error("invalid signature");
      }
      return event;
    },
    async retrievePaymentIntent() {
      calls.retrievePaymentIntent += 1;
      if (intent instanceof Error) throw intent;
      return intent;
    },
    now: () => new Date("2026-09-30T12:00:00.000Z"),
    log: () => undefined,
  });
  return { handler, calls, seenRawBodies };
};

const bodyOf = (state: { body: unknown }) => state.body as Record<string, unknown>;

assert.notEqual(JSON.stringify(JSON.parse(RAW_BODY)), RAW_BODY);

// The Vercel route keeps the raw stream, and Express mounts it before JSON parsing.
{
  assert.equal(recordPaymentConfig.api.bodyParser, false);
  const apiSource = readFileSync("api/future-order-v2/record-payment.ts", "utf8");
  assert.match(apiSource, /readRawHttpBody/);
  assert.match(apiSource, /httpRequestFromRawBody/);
  const serverSource = readFileSync("server.ts", "utf8");
  const recordAt = serverSource.search(
    /app\.post\(\s*["']\/api\/future-order-v2\/record-payment["']/,
  );
  const jsonAt = serverSource.search(/app\.use\(\s*express\.json\(/);
  assert.ok(recordAt !== -1 && jsonAt !== -1 && recordAt < jsonAt);
  assert.match(serverSource, /express\.raw\(/);
  assert.match(serverSource, /httpRequestFromRawBody/);
}

// Chunked streams are concatenated without parsing, and webhook requests do not expose body.id.
{
  const raw = Buffer.from(RAW_BODY);
  const stream = Readable.from([raw.subarray(0, 8), raw.subarray(8)]);
  const read = await readRawHttpBody(stream);
  assert.equal(read.toString("utf8"), RAW_BODY);
  const webhook = httpRequestFromRawBody({
    method: "POST",
    headers: { "stripe-signature": FORGED_SIGNATURE },
    rawBody: read,
  });
  assert.equal(webhook.body, undefined);
  assert.equal(webhook.rawBody, read);

  const browserRaw = '{ "orderId" : "future-order-webhook", "paymentIntentId" : "pi_test_webhook_123" }';
  const browser = httpRequestFromRawBody({
    method: "POST",
    headers: { authorization: "Bearer valid-token" },
    rawBody: browserRaw,
  });
  assert.equal(browser.rawBody, browserRaw);
  assert.deepEqual(browser.body, {
    orderId: ORDER_ID,
    paymentIntentId: PAYMENT_INTENT_ID,
  });
  assert.notEqual(JSON.stringify(browser.body), browserRaw);
}

// A verified test event saves the payment. The forged id inside the raw body is not used.
{
  const memory = createMemoryStore();
  const { handler, calls, seenRawBodies } = createHandler({ store: memory.store });
  const first = response();
  await handler(webhookRequest(), first.res);
  assert.equal(first.state.statusCode, 200);
  assert.equal(bodyOf(first.state).status, "recorded");
  assert.equal(calls.verifyIdToken, 0, "a webhook never needs a Firebase token");
  assert.equal(calls.constructEvent, 1);
  assert.equal(seenRawBodies[0], RAW_BODY);
  assert.equal(calls.retrievePaymentIntent, 1);
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
  const constructCallsBeforeBrowser = calls.constructEvent;
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
  assert.equal(calls.constructEvent, constructCallsBeforeBrowser);
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

// An invalid signature is rejected and the forged body id is never fetched or saved.
{
  const memory = createMemoryStore();
  const { handler, calls } = createHandler({ store: memory.store, acceptSignature: false });
  const forged = response();
  await handler(
    webhookRequest(
      { id: FORGED_EVENT_ID, object: "event" },
      { "stripe-signature": FORGED_SIGNATURE },
      RAW_BODY,
    ),
    forged.res,
  );
  assert.equal(forged.state.statusCode, 400);
  assert.equal(bodyOf(forged.state).code, "INVALID_STRIPE_SIGNATURE");
  assert.equal(calls.constructEvent, 1);
  assert.equal(calls.retrievePaymentIntent, 0);
  assert.equal(memory.writes(), 0);
}

// A missing raw body cannot fall back to body.id.
{
  const memory = createMemoryStore();
  const { handler, calls } = createHandler({ store: memory.store });
  const missingRaw = response();
  await handler(
    {
      method: "POST",
      headers: { "stripe-signature": VALID_SIGNATURE },
      body: { id: EVENT_ID, object: "event" },
    },
    missingRaw.res,
  );
  assert.equal(missingRaw.state.statusCode, 400);
  assert.equal(bodyOf(missingRaw.state).code, "INVALID_STRIPE_SIGNATURE");
  assert.equal(calls.constructEvent, 0);
  assert.equal(calls.retrievePaymentIntent, 0);
  assert.equal(memory.writes(), 0);
}

// An unset webhook secret fails closed. The old body.id retrieve must not run.
{
  const memory = createMemoryStore();
  const { handler, calls } = createHandler({ store: memory.store, webhookSecret: "  " });
  const unconfigured = response();
  await handler(
    webhookRequest({ id: FORGED_EVENT_ID }, { "stripe-signature": FORGED_SIGNATURE }),
    unconfigured.res,
  );
  assert.equal(unconfigured.state.statusCode, 400);
  assert.equal(bodyOf(unconfigured.state).code, "STRIPE_WEBHOOK_SECRET_REQUIRED");
  assert.equal(calls.constructEvent, 0);
  assert.equal(calls.retrievePaymentIntent, 0);
  assert.equal(memory.writes(), 0);
}

// Temporary Stripe or storage failures return 500 so Stripe retries.
{
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
  assert.equal(calls.constructEvent, 0);
  assert.equal(calls.retrievePaymentIntent, 0);
}

// A Bearer token always takes the browser path, even with a stripe-signature header.
{
  const memory = createMemoryStore();
  const { handler, calls } = createHandler({ store: memory.store, verifiedUid: "someone-else" });
  const { res, state } = response();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer valid-token", "stripe-signature": VALID_SIGNATURE },
      body: { orderId: ORDER_ID, paymentIntentId: PAYMENT_INTENT_ID },
      rawBody: RAW_BODY,
    },
    res,
  );
  assert.equal(calls.constructEvent, 0);
  assert.equal(calls.retrievePaymentIntent, 0);
  assert.equal(calls.verifyIdToken, 1);
  assert.equal(state.statusCode, 403, "the signed-in owner check still applies");
  assert.equal(memory.writes(), 0);
}

// Without a Bearer token or a stripe-signature header, nothing is processed.
{
  const memory = createMemoryStore();
  const { handler, calls } = createHandler({ store: memory.store });
  const { res, state } = response();
  await handler(webhookRequest({ id: FORGED_EVENT_ID }, {}, undefined), res);
  assert.equal(state.statusCode, 401);
  assert.equal(bodyOf(state).code, "AUTH_REQUIRED");
  assert.equal(calls.constructEvent, 0);
  assert.equal(calls.retrievePaymentIntent, 0);
  assert.equal(memory.writes(), 0);
}

// Oversized streams are refused before a payment can be recorded.
{
  const chunk = Buffer.alloc(600_000, 1);
  await assert.rejects(readRawHttpBody(Readable.from([chunk, chunk])));
}

// The default verifier is Stripe's constructEvent. A signed payload records;
// a forged body or a fake signature does not retrieve or save.
{
  const previousKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_example";
  try {
    const payload = JSON.stringify({
      id: EVENT_ID,
      object: "event",
      type: "payment_intent.succeeded",
      livemode: false,
      data: { object: { id: PAYMENT_INTENT_ID, object: "payment_intent" } },
    });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    const memory = createMemoryStore();
    let paymentIntentReads = 0;
    const handler = createFutureOrderV2PaymentRecordHandler({
      getServices: () => ({
        auth: { async verifyIdToken() { throw new Error("unused"); } },
        db: {},
      }),
      createStore: () => memory.store,
      readSecretKey: () => "sk_test_example",
      readWebhookSecret: () => WEBHOOK_SECRET,
      async retrievePaymentIntent() {
        paymentIntentReads += 1;
        return succeededIntent();
      },
      now: () => new Date("2026-09-30T12:00:00.000Z"),
      log: () => undefined,
    });

    const recorded = response();
    await handler(
      {
        method: "POST",
        headers: { "stripe-signature": header },
        body: { id: FORGED_EVENT_ID },
        rawBody: payload,
      },
      recorded.res,
    );
    assert.equal(recorded.state.statusCode, 200);
    assert.equal(bodyOf(recorded.state).status, "recorded");
    assert.equal(paymentIntentReads, 1);
    assert.equal(memory.writes(), 1);

    const forged = response();
    await handler(
      {
        method: "POST",
        headers: { "stripe-signature": FORGED_SIGNATURE },
        body: { id: FORGED_EVENT_ID },
        rawBody: payload,
      },
      forged.res,
    );
    assert.equal(forged.state.statusCode, 400);
    assert.equal(bodyOf(forged.state).code, "INVALID_STRIPE_SIGNATURE");
    assert.equal(paymentIntentReads, 1);
    assert.equal(memory.writes(), 1);

    const tampered = response();
    await handler(
      {
        method: "POST",
        headers: { "stripe-signature": header },
        body: { id: FORGED_EVENT_ID },
        rawBody: payload.replace(EVENT_ID, FORGED_EVENT_ID),
      },
      tampered.res,
    );
    assert.equal(tampered.state.statusCode, 400);
    assert.equal(bodyOf(tampered.state).code, "INVALID_STRIPE_SIGNATURE");
    assert.equal(paymentIntentReads, 1);
    assert.equal(memory.writes(), 1);
  } finally {
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
  }
}

console.log("PASS: V2 order Stripe payment webhook");
