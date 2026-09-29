import assert from "node:assert/strict";
import {
  createFutureOrderV2PaymentRecordHandler,
  type FutureOrderV2PaymentRecordStore,
  type StripePaymentIntentSummary,
} from "./src/server/futureOrderV2PaymentRecord";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import {
  formatFutureOrderV2PaidAmount,
  parseFutureOrderV2PaymentRecord,
} from "./src/utils/futureOrderV2PaymentRecord";
import { createFutureOrderV2PaymentRecordClient } from "./src/services/futureOrderV2PaymentRecordClient";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const ORDER_ID = "future-order-record";
const OWNER_UID = "record-owner";
const PAYMENT_INTENT_ID = "pi_test_record_123";

const persisted = createPersistedFutureOrderV2({
  masterOrder: createFutureOrderV2Fixture(ORDER_ID),
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
  persistedAt: "2026-09-05T12:00:00.000Z",
});
if (persisted.status !== "valid") throw new Error("Expected a valid persisted V2 order.");
const exactTotalCents = persisted.value.masterOrder.cartItem.candidate.pricing.exactTotalCents;
assert.equal(exactTotalCents, 30000);

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
    stage: "test",
  },
  ...overrides,
});

const createMemoryStore = (order: unknown = persisted.value) => {
  const payments = new Map<string, unknown>();
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
          payments.set(orderId, record);
        },
      });
    },
  };
  return { store, payments };
};

const response = () => {
  const state = {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
  };
  const res: HttpResponse = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    setHeader(name, value) {
      state.headers[name] = String(value);
      return res;
    },
    json(body) {
      state.body = body;
      return body;
    },
  };
  return { res, state };
};

const request = (
  overrides: Partial<HttpRequest> = {},
  body: unknown = { orderId: ORDER_ID, paymentIntentId: PAYMENT_INTENT_ID },
): HttpRequest => ({
  method: "POST",
  headers: { authorization: "Bearer valid-token" },
  body,
  ...overrides,
});

const createHandler = ({
  store = createMemoryStore().store,
  signInProvider = "password" as unknown,
  uid = OWNER_UID,
  intent = succeededIntent(),
  secret = "sk_test_example",
  onRetrieve = () => undefined,
}: {
  store?: FutureOrderV2PaymentRecordStore;
  signInProvider?: unknown;
  uid?: string;
  intent?: StripePaymentIntentSummary;
  secret?: string;
  onRetrieve?: () => void;
} = {}) =>
  createFutureOrderV2PaymentRecordHandler({
    getServices: () => ({
      auth: {
        async verifyIdToken(token) {
          if (token !== "valid-token") throw new Error("bad token");
          return { uid, firebase: { sign_in_provider: signInProvider } };
        },
      },
      db: {},
    }),
    createStore: () => store,
    readSecretKey: () => secret,
    async retrievePaymentIntent() {
      onRetrieve();
      return intent;
    },
    now: () => new Date("2026-09-29T10:00:00.000Z"),
    log: () => undefined,
  });

const errorCode = (body: unknown) => (body as { code?: string }).code;

// Only POST is accepted.
{
  const { res, state } = response();
  await createHandler()(request({ method: "GET" }), res);
  assert.equal(state.statusCode, 405);
}

// A missing or invalid token is rejected before Stripe is contacted.
{
  let retrieved = false;
  const handler = createHandler({ onRetrieve: () => { retrieved = true; } });
  const missing = response();
  await handler(request({ headers: {} }), missing.res);
  assert.equal(missing.state.statusCode, 401);
  assert.equal(errorCode(missing.state.body), "AUTH_REQUIRED");
  assert.equal(missing.state.headers["Cache-Control"], "no-store");
  const invalid = response();
  await handler(request({ headers: { authorization: "Bearer wrong" } }), invalid.res);
  assert.equal(invalid.state.statusCode, 401);
  assert.equal(retrieved, false);
}

// Live keys are refused.
{
  const { res, state } = response();
  await createHandler({ secret: "sk_live_example" })(request(), res);
  assert.equal(state.statusCode, 503);
  assert.equal(errorCode(state.body), "STRIPE_TEST_KEY_REQUIRED");
}

// Malformed identifiers are refused.
{
  const { res, state } = response();
  await createHandler()(
    request({}, { orderId: ORDER_ID, paymentIntentId: "not-a-payment-intent" }),
    res,
  );
  assert.equal(state.statusCode, 400);
}

// Anonymous accounts and other owners are refused.
{
  const anonymous = response();
  await createHandler({ signInProvider: "anonymous" })(request(), anonymous.res);
  assert.equal(anonymous.state.statusCode, 403);
  assert.equal(errorCode(anonymous.state.body), "ANONYMOUS_NOT_ALLOWED");
  const otherOwner = response();
  await createHandler({ uid: "someone-else" })(request(), otherOwner.res);
  assert.equal(otherOwner.state.statusCode, 403);
  assert.equal(errorCode(otherOwner.state.body), "OWNER_MISMATCH");
}

// An unknown order is refused.
{
  const { res, state } = response();
  await createHandler({ store: createMemoryStore(null).store })(request(), res);
  assert.equal(state.statusCode, 404);
}

// A PaymentIntent that has not succeeded is never recorded.
{
  const memory = createMemoryStore();
  const { res, state } = response();
  await createHandler({
    store: memory.store,
    intent: succeededIntent({ status: "requires_payment_method" }),
  })(request(), res);
  assert.equal(state.statusCode, 409);
  assert.equal(errorCode(state.body), "PAYMENT_NOT_SUCCEEDED");
  assert.equal(memory.payments.size, 0);
}

// Amount, currency, and metadata must all match the persisted order.
for (const intent of [
  succeededIntent({ amount: 100 }),
  succeededIntent({ currency: "usd" }),
  succeededIntent({ metadata: { orderId: "other-order", paymentReference: `future-v2-payment-${ORDER_ID}` } }),
  succeededIntent({ metadata: { orderId: ORDER_ID, paymentReference: "future-v2-payment-other" } }),
]) {
  const memory = createMemoryStore();
  const { res, state } = response();
  await createHandler({ store: memory.store, intent })(request(), res);
  assert.equal(state.statusCode, 409);
  assert.equal(errorCode(state.body), "PAYMENT_MISMATCH");
  assert.equal(memory.payments.size, 0);
}

// The first valid call records the payment; repeating it is safe.
{
  const memory = createMemoryStore();
  const handler = createHandler({ store: memory.store });
  const first = response();
  await handler(request(), first.res);
  assert.equal(first.state.statusCode, 201);
  const firstBody = first.state.body as { status: string; record: unknown };
  assert.equal(firstBody.status, "recorded");
  const record = parseFutureOrderV2PaymentRecord(firstBody.record);
  assert.ok(record);
  assert.deepEqual(record, {
    schemaVersion: 1,
    orderId: ORDER_ID,
    ownerUid: OWNER_UID,
    paymentIntentId: PAYMENT_INTENT_ID,
    amountCents: 30000,
    currency: "eur",
    status: "succeeded",
    testMode: true,
    recordedAt: "2026-09-29T10:00:00.000Z",
  });
  assert.equal(memory.payments.size, 1);

  const repeat = response();
  await handler(request(), repeat.res);
  assert.equal(repeat.state.statusCode, 200);
  assert.equal((repeat.state.body as { status: string }).status, "already_recorded");
  assert.equal(memory.payments.size, 1);

  // A different PaymentIntent cannot replace the recorded payment.
  const conflicting = response();
  await createHandler({
    store: memory.store,
    intent: succeededIntent({ id: "pi_test_other_456" }),
  })(request({}, { orderId: ORDER_ID, paymentIntentId: "pi_test_other_456" }), conflicting.res);
  assert.equal(conflicting.state.statusCode, 409);
  assert.equal(errorCode(conflicting.state.body), "PAYMENT_ALREADY_RECORDED");
  assert.equal(
    (memory.payments.get(ORDER_ID) as { paymentIntentId: string }).paymentIntentId,
    PAYMENT_INTENT_ID,
  );
}

// A storage failure is reported as retryable.
{
  const { res, state } = response();
  await createHandler({
    store: {
      async readOrder() {
        throw new Error("firestore down");
      },
      async runTransaction() {
        throw new Error("firestore down");
      },
    },
  })(request(), res);
  assert.equal(state.statusCode, 503);
  assert.equal(errorCode(state.body), "PAYMENT_RECORD_UNAVAILABLE");
}

// Firestore Timestamps read back from the admin table normalize to ISO strings.
{
  const parsed = parseFutureOrderV2PaymentRecord({
    schemaVersion: 1,
    orderId: ORDER_ID,
    ownerUid: OWNER_UID,
    paymentIntentId: PAYMENT_INTENT_ID,
    amountCents: 30000,
    currency: "eur",
    status: "succeeded",
    testMode: true,
    recordedAt: { toDate: () => new Date("2026-09-29T10:00:00.000Z") },
  });
  assert.equal(parsed?.recordedAt, "2026-09-29T10:00:00.000Z");
  assert.equal(parseFutureOrderV2PaymentRecord({ orderId: ORDER_ID }), null);
  assert.equal(formatFutureOrderV2PaidAmount(30000), "€300.00");
}

// The browser client sends the ID token and only accepts a matching record.
{
  const calls: { input: string; init: RequestInit }[] = [];
  const recordBody = {
    status: "recorded",
    record: {
      schemaVersion: 1,
      orderId: ORDER_ID,
      ownerUid: OWNER_UID,
      paymentIntentId: PAYMENT_INTENT_ID,
      amountCents: 30000,
      currency: "eur",
      status: "succeeded",
      testMode: true,
      recordedAt: "2026-09-29T10:00:00.000Z",
    },
  };
  const client = createFutureOrderV2PaymentRecordClient({
    getCurrentUser: () => ({ isAnonymous: false, getIdToken: async () => "id-token" }),
    fetch: async (input, init) => {
      calls.push({ input, init });
      return { ok: true, json: async () => recordBody };
    },
  });
  const result = await client.record({ orderId: ORDER_ID, paymentIntentId: PAYMENT_INTENT_ID });
  assert.equal(result.status, "recorded");
  assert.equal(calls[0].input, "/api/future-order-v2/record-payment");
  assert.equal(
    (calls[0].init.headers as Record<string, string>).Authorization,
    "Bearer id-token",
  );

  const mismatched = await client.record({ orderId: ORDER_ID, paymentIntentId: "pi_test_other_456" });
  assert.equal(mismatched.status, "failed");

  const anonymousClient = createFutureOrderV2PaymentRecordClient({
    getCurrentUser: () => ({ isAnonymous: true, getIdToken: async () => "id-token" }),
    fetch: async () => {
      throw new Error("must not be called");
    },
  });
  assert.equal(
    (await anonymousClient.record({ orderId: ORDER_ID, paymentIntentId: PAYMENT_INTENT_ID })).status,
    "failed",
  );

  const failingClient = createFutureOrderV2PaymentRecordClient({
    getCurrentUser: () => ({ isAnonymous: false, getIdToken: async () => "id-token" }),
    fetch: async () => ({ ok: false, json: async () => ({ error: "x", code: "PAYMENT_MISMATCH" }) }),
  });
  const failed = await failingClient.record({ orderId: ORDER_ID, paymentIntentId: PAYMENT_INTENT_ID });
  assert.equal(failed.status, "failed");
  assert.match(failed.status === "failed" ? failed.message : "", /not be charged again/);
}

console.log("PASS: V2 order Stripe payment record");
