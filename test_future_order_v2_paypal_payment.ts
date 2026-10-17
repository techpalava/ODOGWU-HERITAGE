import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  handleFutureOrderV2PayPalCapture,
  handleFutureOrderV2PayPalConfig,
  handleFutureOrderV2PayPalCreateOrder,
  saveVerifiedFutureOrderV2PayPalPayment,
} from "./src/server/futureOrderV2PayPalPayment";
import type { FutureOrderV2PaymentRecordStore } from "./src/server/futureOrderV2PaymentRecord";
import type { HttpResponse } from "./src/server/httpTypes";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import {
  getFutureOrderV2PaymentProvider,
  getFutureOrderV2ProviderTransactionId,
  parseFutureOrderV2PaymentRecord,
} from "./src/utils/futureOrderV2PaymentRecord";
import { createFutureOrderV2PreparationAttempt } from "./src/utils/futureOrderV2Preparation";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const preparedResult = createFutureOrderV2PreparationAttempt({
  candidate: createFutureOrderV2Fixture("paypal-payment").cartItem.candidate,
  ids: { cartItemId: "future-cart-paypal", orderId: "future-order-paypal" },
});
assert.equal(preparedResult.status, "valid");
if (preparedResult.status !== "valid") throw new Error("Expected prepare.");
const prepared = preparedResult.attempt;
const paymentReference = `future-v2-payment-${prepared.orderId}`;

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
  handleFutureOrderV2PayPalConfig({ method: "GET", headers: {} }, res, {
    readEnv: () => "sandbox",
    readClientId: () => "",
    readClientSecret: () => "",
  });
  assert.equal(state.statusCode, 503);
}

{
  const { res, state } = response();
  handleFutureOrderV2PayPalConfig({ method: "GET", headers: {} }, res, {
    readEnv: () => "live",
    readClientId: () => "client",
    readClientSecret: () => "secret",
  });
  assert.equal(state.statusCode, 503);
}

{
  const { res, state } = response();
  handleFutureOrderV2PayPalConfig({ method: "GET", headers: {} }, res, {
    readEnv: () => "sandbox",
    readClientId: () => "sandbox-client-id",
    readClientSecret: () => "sandbox-secret",
  });
  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.body, {
    clientId: "sandbox-client-id",
    env: "sandbox",
    currency: "EUR",
    locale: "nl_NL",
    testMode: true,
  });
}

{
  const { res, state } = response();
  let created: unknown = null;
  await handleFutureOrderV2PayPalCreateOrder(
    {
      method: "POST",
      headers: {},
      body: {
        orderId: prepared.orderId,
        paymentReference,
        masterOrder: prepared.masterOrder,
      },
    },
    res,
    {
      readEnv: () => "sandbox",
      readClientId: () => "sandbox-client-id",
      readClientSecret: () => "sandbox-secret",
      async createPayPalOrder(input) {
        created = input;
        return { id: "5O190127TN364715T" };
      },
    },
  );
  assert.equal(state.statusCode, 200);
  assert.deepEqual(created, {
    amountCents: 30000,
    orderId: prepared.orderId,
    paymentReference,
  });
  assert.deepEqual(state.body, { paypalOrderId: "5O190127TN364715T" });
}

const OWNER_UID = "paypal-owner";
const persisted = createPersistedFutureOrderV2({
  masterOrder: prepared.masterOrder,
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
  persistedAt: "2026-10-03T12:00:00.000Z",
});
if (persisted.status !== "valid") throw new Error("Expected persisted order.");

const createMemoryStore = () => {
  const payments = new Map<string, unknown>();
  const store: FutureOrderV2PaymentRecordStore = {
    async readOrder(orderId) {
      return orderId === prepared.orderId ? persisted.value : null;
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

{
  const { store, payments } = createMemoryStore();
  const saved = await saveVerifiedFutureOrderV2PayPalPayment({
    store,
    orderId: prepared.orderId,
    paypalOrderId: "5O190127TN364715T",
    capture: {
      id: "5O190127TN364715T",
      status: "COMPLETED",
      amountCents: 30000,
      currency: "eur",
      customId: prepared.orderId,
      invoiceId: paymentReference,
    },
    expectedOwnerUid: OWNER_UID,
    now: () => new Date("2026-10-03T12:05:00.000Z"),
  });
  assert.equal(saved.status, "recorded");
  if (saved.status !== "recorded") throw new Error("expected recorded");
  assert.equal(getFutureOrderV2PaymentProvider(saved.record), "paypal");
  assert.equal(
    getFutureOrderV2ProviderTransactionId(saved.record),
    "5O190127TN364715T",
  );
  assert.equal(payments.size, 1);
}

{
  const { res, state } = response();
  await handleFutureOrderV2PayPalCapture(
    {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: {
        orderId: prepared.orderId,
        paypalOrderId: "5O190127TN364715T",
      },
    },
    res,
    {
      readEnv: () => "sandbox",
      readClientId: () => "sandbox-client-id",
      readClientSecret: () => "sandbox-secret",
      getServices: () => ({
        auth: {
          async verifyIdToken() {
            return { uid: OWNER_UID, firebase: { sign_in_provider: "password" } };
          },
        },
        db: {},
      }),
      createStore: () => createMemoryStore().store,
      async capturePayPalOrder() {
        return {
          id: "5O190127TN364715T",
          status: "COMPLETED",
          amountCents: 30000,
          currency: "eur",
          customId: prepared.orderId,
          invoiceId: paymentReference,
        };
      },
      now: () => new Date("2026-10-03T12:05:00.000Z"),
    },
  );
  assert.equal(state.statusCode, 200);
  const body = state.body as { status: string; record: unknown };
  assert.equal(body.status, "recorded");
  const record = parseFutureOrderV2PaymentRecord(body.record);
  assert.ok(record);
  assert.equal(record?.schemaVersion, 2);
}

assert.deepEqual(
  parseFutureOrderV2PaymentRecord({
    schemaVersion: 1,
    orderId: "o1",
    ownerUid: "u1",
    paymentIntentId: "pi_legacy",
    amountCents: 1000,
    currency: "eur",
    status: "succeeded",
    testMode: true,
    recordedAt: "2026-10-03T12:00:00.000Z",
  }),
  {
    schemaVersion: 1,
    orderId: "o1",
    ownerUid: "u1",
    paymentIntentId: "pi_legacy",
    amountCents: 1000,
    currency: "eur",
    status: "succeeded",
    testMode: true,
    recordedAt: "2026-10-03T12:00:00.000Z",
  },
);

const serverSource = readFileSync("server.ts", "utf8");
assert.match(serverSource, /\/api\/future-order-v2\/paypal/);
assert.equal(
  readFileSync("api/future-order-v2/paypal.ts", "utf8").includes(
    "handleFutureOrderV2PayPalConfig",
  ),
  true,
);
assert.equal(
  readFileSync("api/future-order-v2/paypal.ts", "utf8").includes(
    "handleFutureOrderV2PayPalCreateOrder",
  ),
  true,
);
assert.equal(
  readFileSync("api/future-order-v2/paypal.ts", "utf8").includes(
    "handleFutureOrderV2PayPalCapture",
  ),
  true,
);
assert.equal(
  readFileSync("src/components/FutureOrderV2StripeCard.tsx", "utf8").includes(
    "confirmPayPalPayment",
  ),
  false,
);

console.log("PASS: Future Order V2 native PayPal sandbox create/capture");
