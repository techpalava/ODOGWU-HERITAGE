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
      async readPayPalOrder() {
        return {
          id: "5O190127TN364715T",
          status: "APPROVED",
          amountCents: 30000,
          currency: "eur",
          customId: prepared.orderId,
          invoiceId: paymentReference,
        };
      },
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


// ---- create-order: signed-in owner only, amount from the stored order ----
const sandboxEnv = {
  readEnv: () => "sandbox",
  readClientId: () => "sandbox-client-id",
  readClientSecret: () => "sandbox-secret",
};
const servicesFor = (uid: string, provider = "password") => () => ({
  auth: {
    async verifyIdToken(token: string) {
      if (token !== "valid-token") throw new Error("bad token");
      return { uid, firebase: { sign_in_provider: provider } };
    },
  },
  db: {},
});
// A tampered browser order claiming €1.00 must not change what is charged.
const tamperedMasterOrder = JSON.parse(JSON.stringify(prepared.masterOrder));
tamperedMasterOrder.cartItem.candidate.pricing.exactTotalCents = 100;

const runCreate = async (
  headers: Record<string, string>,
  overrides: Record<string, unknown> = {},
  body: Record<string, unknown> = {
    orderId: prepared.orderId,
    paymentReference,
    masterOrder: tamperedMasterOrder,
    amountCents: 100,
  },
) => {
  const { res, state } = response();
  const created: unknown[] = [];
  await handleFutureOrderV2PayPalCreateOrder(
    { method: "POST", headers, body },
    res,
    {
      ...sandboxEnv,
      getServices: servicesFor(OWNER_UID),
      createStore: () => createMemoryStore().store,
      readCommunityBatch: async () => null,
      async createPayPalOrder(input) {
        created.push(input);
        return { id: "5O190127TN364715T" };
      },
      ...overrides,
    },
  );
  return { state, created };
};

{
  // Signed-in owner: amount is the stored server-verified total, not the tampered body.
  const { state, created } = await runCreate({ authorization: "Bearer valid-token" });
  assert.equal(state.statusCode, 200);
  assert.deepEqual(created, [
    { amountCents: 30000, orderId: prepared.orderId, paymentReference },
  ]);
  assert.deepEqual(state.body, { paypalOrderId: "5O190127TN364715T" });
}
{
  // Absent token -> 401, nothing created.
  const { state, created } = await runCreate({});
  assert.equal(state.statusCode, 401);
  assert.equal((state.body as { code: string }).code, "AUTH_REQUIRED");
  assert.equal(created.length, 0);
}
{
  // Tampered token -> 401.
  const { state, created } = await runCreate({ authorization: "Bearer forged-token" });
  assert.equal(state.statusCode, 401);
  assert.equal(created.length, 0);
}
{
  // Anonymous session -> 403.
  const { state, created } = await runCreate(
    { authorization: "Bearer valid-token" },
    { getServices: servicesFor("anon-uid", "anonymous") },
  );
  assert.equal(state.statusCode, 403);
  assert.equal((state.body as { code: string }).code, "ANONYMOUS_NOT_ALLOWED");
  assert.equal(created.length, 0);
}
{
  // Wrong owner -> 403.
  const { state, created } = await runCreate(
    { authorization: "Bearer valid-token" },
    { getServices: servicesFor("someone-else") },
  );
  assert.equal(state.statusCode, 403);
  assert.equal((state.body as { code: string }).code, "OWNER_MISMATCH");
  assert.equal(created.length, 0);
}
{
  // Unknown order -> 404.
  const { state, created } = await runCreate(
    { authorization: "Bearer valid-token" },
    {},
    { orderId: "future-order-missing", paymentReference: "future-v2-payment-future-order-missing" },
  );
  assert.equal(state.statusCode, 404);
  assert.equal(created.length, 0);
}
{
  // Already paid -> 409.
  const memory = createMemoryStore();
  memory.payments.set(prepared.orderId, { status: "succeeded" });
  const { state, created } = await runCreate(
    { authorization: "Bearer valid-token" },
    { createStore: () => memory.store },
  );
  assert.equal(state.statusCode, 409);
  assert.equal((state.body as { code: string }).code, "PAYMENT_ALREADY_RECORDED");
  assert.equal(created.length, 0);
}
{
  // Stored order without an exact total is refused (the persisted-order parser
  // rejects it as 404, or the payable check returns 409); nothing is created.
  const notExact = JSON.parse(JSON.stringify(persisted.value));
  notExact.masterOrder.cartItem.candidate.pricing.status = "evaluation_required";
  const { state, created } = await runCreate(
    { authorization: "Bearer valid-token" },
    {
      createStore: () => ({
        ...createMemoryStore().store,
        async readOrder() {
          return notExact;
        },
      }),
    },
  );
  assert.ok(state.statusCode === 409 || state.statusCode === 404);
  assert.equal(created.length, 0);
}
{
  // Live env is still refused before anything else.
  const { state, created } = await runCreate(
    { authorization: "Bearer valid-token" },
    { readEnv: () => "live" },
  );
  assert.equal(state.statusCode, 503);
  assert.equal((state.body as { code: string }).code, "PAYPAL_SANDBOX_REQUIRED");
  assert.equal(created.length, 0);
}

// ---- capture: PayPal order amount is checked before capture ----
{
  const { res, state } = response();
  let captured = false;
  await handleFutureOrderV2PayPalCapture(
    {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: { orderId: prepared.orderId, paypalOrderId: "5O190127TN364715T" },
    },
    res,
    {
      ...sandboxEnv,
      getServices: servicesFor(OWNER_UID),
      createStore: () => createMemoryStore().store,
      async readPayPalOrder() {
        return {
          id: "5O190127TN364715T",
          status: "APPROVED",
          amountCents: 100,
          currency: "eur",
          customId: prepared.orderId,
          invoiceId: paymentReference,
        };
      },
      async capturePayPalOrder() {
        captured = true;
        throw new Error("must not capture");
      },
    },
  );
  assert.equal(state.statusCode, 409);
  assert.equal((state.body as { code: string }).code, "PAYMENT_MISMATCH");
  assert.equal(captured, false);
}
{
  // Wrong owner on capture -> 403 before PayPal is touched.
  const { res, state } = response();
  let touched = false;
  await handleFutureOrderV2PayPalCapture(
    {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: { orderId: prepared.orderId, paypalOrderId: "5O190127TN364715T" },
    },
    res,
    {
      ...sandboxEnv,
      getServices: servicesFor("someone-else"),
      createStore: () => createMemoryStore().store,
      async readPayPalOrder() {
        touched = true;
        throw new Error("no");
      },
      async capturePayPalOrder() {
        touched = true;
        throw new Error("no");
      },
    },
  );
  assert.equal(state.statusCode, 403);
  assert.equal(touched, false);
}
{
  // Absent token on capture -> 401.
  const { res, state } = response();
  await handleFutureOrderV2PayPalCapture(
    {
      method: "POST",
      headers: {},
      body: { orderId: prepared.orderId, paypalOrderId: "5O190127TN364715T" },
    },
    res,
    sandboxEnv,
  );
  assert.equal(state.statusCode, 401);
}

// Client sends only ids plus a Firebase token; never a price or masterOrder.
const clientSource = readFileSync("src/services/futureOrderV2PayPalClient.ts", "utf8");
assert.equal(clientSource.includes("masterOrder"), false);
assert.match(clientSource, /Authorization: `Bearer \$\{idToken\}`/);

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
