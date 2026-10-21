import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  handleFutureOrderV2StripePayment,
  readFutureOrderV2RequestOrigin,
} from "./src/server/futureOrderV2StripePayment";
import {
  buildFutureOrderV2PixCheckoutParams,
  decideFutureOrderV2PixSession,
  futureOrderV2PixIdempotencyKey,
  type FutureOrderV2PixCheckoutInput,
  type StripeCheckoutSessionSummary,
} from "./src/server/futureOrderV2PixCheckout";
import {
  createFutureOrderV2PaymentRecordHandler,
  type FutureOrderV2PaymentRecordStore,
  type StripePaymentIntentSummary,
} from "./src/server/futureOrderV2PaymentRecord";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";
import {
  buildFutureOrderV2PixReturnUrls,
  FUTURE_ORDER_V2_PIX_MAXIMUM_EUR_CENTS,
  FUTURE_ORDER_V2_PIX_PENDING_MESSAGE,
  isFutureOrderV2PixAvailable,
  parseFutureOrderV2PixReturnSearch,
  readFutureOrderV2PixPending,
  resumeFutureOrderV2PixReturn,
  sanitizeFutureOrderV2PixReturnPath,
  stashFutureOrderV2PixPending,
  type FutureOrderV2PixPending,
} from "./src/utils/futureOrderV2Pix";
import {
  authorizeFutureOrderV2Payment,
  registerFutureOrderV2PaymentConfirmer,
  registerFutureOrderV2PaymentIdentityResolver,
  registerFutureOrderV2PaymentMethodReader,
  registerFutureOrderV2PixHooks,
  type FutureOrderV2PaymentAttempt,
} from "./src/utils/futureOrderV2Payment";
import {
  futureOrderV2RedirectingMessage,
  futureOrderV2RedirectingPayLabel,
} from "./src/utils/designStudioFuturePaymentReview";
import { createFutureOrderV2PixVerifier } from "./src/services/futureOrderV2PaymentRecordClient";
import {
  FutureOrderV2StripeCard,
  isFutureOrderV2StripePayReady,
} from "./src/components/FutureOrderV2StripeCard";
import { FutureOrderV2MethodIcon } from "./src/components/futureOrderV2PaymentMethodIcons";
import { createEmptyFutureShippingState } from "./src/utils/designStudioFutureShipping";
import { createFutureOrderV2PreparationAttempt } from "./src/utils/futureOrderV2Preparation";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import type { FutureShippingStateV1 } from "./src/types";

const brazilDelivery = (): FutureShippingStateV1 => {
  const state = createEmptyFutureShippingState();
  state.fulfilmentMethod = "destination_delivery";
  state.customerInformation.fullName = "Joana Silva";
  state.customerInformation.email = "joana@example.test";
  state.customerInformation.phone = "+55 11 90000 0000";
  state.customerInformation.deliveryAddress = {
    addressLine1: "Avenida Paulista 1000",
    city: "São Paulo",
    stateRegion: "SP",
    postalCode: "01310-100",
    countryCode: "BR",
  };
  return state;
};

// --- Show-Pix rule -------------------------------------------------------
{
  assert.equal(isFutureOrderV2PixAvailable({ shippingState: brazilDelivery(), amountCents: 30000 }), true);
  const pickup = createEmptyFutureShippingState();
  pickup.fulfilmentMethod = "eindhoven_pickup";
  pickup.customerInformation.fullName = "Joana Silva";
  pickup.customerInformation.email = "joana@example.test";
  assert.equal(isFutureOrderV2PixAvailable({ shippingState: pickup, amountCents: 30000 }), false);
  const dutch = brazilDelivery();
  dutch.customerInformation.deliveryAddress!.countryCode = "NL";
  assert.equal(isFutureOrderV2PixAvailable({ shippingState: dutch, amountCents: 30000 }), false);
  assert.equal(isFutureOrderV2PixAvailable({ shippingState: null, amountCents: 30000 }), false);
  assert.equal(isFutureOrderV2PixAvailable({ shippingState: brazilDelivery(), amountCents: 49 }), false);
  assert.equal(
    isFutureOrderV2PixAvailable({
      shippingState: brazilDelivery(),
      amountCents: FUTURE_ORDER_V2_PIX_MAXIMUM_EUR_CENTS + 1,
    }),
    false,
  );
  assert.equal(isFutureOrderV2PixAvailable({ shippingState: brazilDelivery(), amountCents: null }), false);
}

// --- Return URLs and parsing ---------------------------------------------
{
  assert.equal(sanitizeFutureOrderV2PixReturnPath("/dashboard"), "/dashboard");
  assert.equal(sanitizeFutureOrderV2PixReturnPath("//evil.example"), "/");
  assert.equal(sanitizeFutureOrderV2PixReturnPath("https://evil.example/"), "/");
  assert.equal(sanitizeFutureOrderV2PixReturnPath("/a?b=1"), "/");
  assert.equal(sanitizeFutureOrderV2PixReturnPath(undefined), "/");
  const urls = buildFutureOrderV2PixReturnUrls({
    origin: "https://odogwu-heritage.vercel.app",
    returnPath: "/",
    orderId: "order-1",
  });
  assert.equal(
    urls.successUrl,
    "https://odogwu-heritage.vercel.app/?future_order_v2_pix_return=1&future_order_v2_order_id=order-1&session_id={CHECKOUT_SESSION_ID}",
  );
  assert.equal(
    urls.cancelUrl,
    "https://odogwu-heritage.vercel.app/?future_order_v2_pix_return=cancel&future_order_v2_order_id=order-1",
  );
  assert.deepEqual(
    parseFutureOrderV2PixReturnSearch("?future_order_v2_pix_return=1&future_order_v2_order_id=order-1&session_id=cs_test_abc"),
    { status: "returned", orderId: "order-1", checkoutSessionId: "cs_test_abc" },
  );
  assert.deepEqual(
    parseFutureOrderV2PixReturnSearch("?future_order_v2_pix_return=cancel&future_order_v2_order_id=order-1"),
    { status: "cancelled", orderId: "order-1" },
  );
  assert.equal(
    parseFutureOrderV2PixReturnSearch("?future_order_v2_pix_return=1&future_order_v2_order_id=order-1&session_id={CHECKOUT_SESSION_ID}"),
    null,
  );
  assert.equal(parseFutureOrderV2PixReturnSearch("?future_order_v2_stripe_return=1"), null);

  assert.equal(
    readFutureOrderV2RequestOrigin({ headers: { host: "odogwu-heritage.vercel.app" } }),
    "https://odogwu-heritage.vercel.app",
  );
  assert.equal(readFutureOrderV2RequestOrigin({ headers: { host: "localhost:3000" } }), "http://localhost:3000");
  assert.equal(
    readFutureOrderV2RequestOrigin({
      headers: { "x-forwarded-host": "preview.vercel.app", host: "internal" },
    }),
    "https://preview.vercel.app",
  );
  assert.equal(readFutureOrderV2RequestOrigin({ headers: { host: "evil.example/path" } }), null);
  assert.equal(readFutureOrderV2RequestOrigin({ headers: {} }), null);
}

// --- Checkout Session parameters and idempotency -------------------------
const pixInput: FutureOrderV2PixCheckoutInput = {
  amountCents: 30000,
  orderId: "order-1",
  paymentReference: "future-v2-payment-order-1",
  customerEmail: "joana@example.test",
  successUrl: "https://x.example/?future_order_v2_pix_return=1&session_id={CHECKOUT_SESSION_ID}",
  cancelUrl: "https://x.example/?future_order_v2_pix_return=cancel",
};
{
  const params = buildFutureOrderV2PixCheckoutParams(pixInput);
  assert.equal(params.mode, "payment");
  assert.deepEqual(params.adaptive_pricing, { enabled: true });
  assert.equal(params.line_items?.[0]?.price_data?.currency, "eur");
  assert.equal(params.line_items?.[0]?.price_data?.unit_amount, 30000);
  assert.equal(params.line_items?.[0]?.quantity, 1);
  assert.equal("payment_method_types" in params, false, "dynamic payment methods unlock Pix");
  assert.deepEqual(params.payment_method_options?.pix, {
    expires_after_seconds: 3600,
    amount_includes_iof: "never",
  });
  assert.equal(params.client_reference_id, "order-1");
  assert.equal(params.payment_intent_data?.metadata?.orderId, "order-1");
  assert.equal(params.payment_intent_data?.metadata?.paymentReference, "future-v2-payment-order-1");
  assert.equal(params.payment_intent_data?.capture_method, undefined, "Pix has no manual capture");
  assert.equal(params.customer_email, "joana@example.test");

  const key = futureOrderV2PixIdempotencyKey(pixInput);
  assert.match(key, /^future-v2-payment-order-1:pix:[0-9a-f]{16}$/);
  assert.equal(futureOrderV2PixIdempotencyKey(pixInput), key, "same order, same key");
  assert.notEqual(futureOrderV2PixIdempotencyKey({ ...pixInput, amountCents: 30100 }), key);
  assert.match(futureOrderV2PixIdempotencyKey(pixInput, "cs_test_old"), /^future-v2-payment-order-1:pix:[0-9a-f]{16}:r[0-9a-f]{16}$/);
}

// --- Session decisions -----------------------------------------------------
{
  const base = { status: "open", paymentStatus: "unpaid", paymentIntentId: null, paymentIntentStatus: null, url: "https://checkout.stripe.com/c/pay/cs_test_1" };
  assert.deepEqual(decideFutureOrderV2PixSession(base), { kind: "open", url: base.url });
  assert.deepEqual(
    decideFutureOrderV2PixSession({ ...base, status: "complete", paymentIntentId: "pi_1", paymentIntentStatus: "requires_action", url: null }),
    { kind: "pending" },
  );
  assert.deepEqual(
    decideFutureOrderV2PixSession({ ...base, status: "complete", paymentStatus: "paid", paymentIntentId: "pi_1", paymentIntentStatus: "succeeded", url: null }),
    { kind: "paid", paymentIntentId: "pi_1" },
  );
  assert.deepEqual(
    decideFutureOrderV2PixSession({ ...base, status: "complete", paymentIntentId: "pi_1", paymentIntentStatus: "requires_payment_method", url: null }),
    { kind: "replace" },
    "an expired Pix code may get a fresh session",
  );
  assert.deepEqual(decideFutureOrderV2PixSession({ ...base, status: "expired", url: null }), { kind: "replace" });
}

// --- payment-intent handler: Pix action ----------------------------------
const OWNER_UID = "pix-owner";
const makePersisted = (shippingState: FutureShippingStateV1 | null) => {
  const candidate = structuredClone(createFutureOrderV2Fixture("pix-order").cartItem.candidate);
  if (shippingState) (candidate.shipping as { state: FutureShippingStateV1 }).state = shippingState;
  const prepared = createFutureOrderV2PreparationAttempt({
    candidate,
    ids: { cartItemId: "future-cart-pix", orderId: "future-order-pix" },
  });
  if (prepared.status !== "valid") throw new Error("Expected the Pix fixture to prepare.");
  const persisted = createPersistedFutureOrderV2({
    masterOrder: prepared.attempt.masterOrder,
    owner: { uid: OWNER_UID, isAnonymous: false },
    customerOwnerUid: OWNER_UID,
    persistedAt: "2026-10-20T12:00:00.000Z",
  });
  if (persisted.status !== "valid") throw new Error("Expected a persisted Pix order.");
  return { prepared: prepared.attempt, persisted: persisted.value };
};
const brazilOrder = makePersisted(brazilDelivery());
const pickupOrder = makePersisted(null);
const pixOrderId = brazilOrder.prepared.orderId;
const pixReference = `future-v2-payment-${pixOrderId}`;
assert.equal(brazilOrder.prepared.masterOrder.cartItem.candidate.pricing.exactTotalCents, 30000);

const response = () => {
  const state = { statusCode: 200, body: null as unknown, headers: {} as Record<string, string> };
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

const paymentDeps = (order: unknown) => ({
  readSecretKey: () => "sk_test_example",
  getServices: () => ({
    auth: {
      async verifyIdToken(bearer: string) {
        if (bearer === "anon-token") return { uid: "anon", firebase: { sign_in_provider: "anonymous" } };
        if (bearer !== "owner-token") throw new Error("invalid token");
        return { uid: OWNER_UID, firebase: { sign_in_provider: "password" } };
      },
    },
    db: {},
  }),
  readPersistedOrder: async (id: string) => (id === pixOrderId ? order : null),
  async createPaymentIntent(): Promise<never> {
    throw new Error("The Pix action must not create a PaymentIntent.");
  },
});

const pixRequest = (extra: Record<string, unknown> = {}, headers: HttpRequest["headers"] = {}) => ({
  method: "POST",
  headers: { authorization: "Bearer owner-token", host: "odogwu-heritage.vercel.app", ...headers },
  body: {
    action: "pix-checkout-session",
    orderId: pixOrderId,
    paymentReference: pixReference,
    returnPath: "/",
    // Client pricing is ignored; the server charges the persisted total.
    masterOrder: { cartItem: { candidate: { pricing: { exactTotalCents: 1 } } } },
    ...extra,
  },
});

{
  const { res, state } = response();
  const calls: FutureOrderV2PixCheckoutInput[] = [];
  await handleFutureOrderV2StripePayment(pixRequest(), res, {
    ...paymentDeps(brazilOrder.persisted),
    async createPixCheckoutSession(input) {
      calls.push(input);
      return { status: "open", checkoutSessionId: "cs_test_open", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_open" };
    },
  });
  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.body, {
    status: "open",
    checkoutSessionId: "cs_test_open",
    checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_open",
  });
  assert.equal(state.headers["Cache-Control"], "no-store");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].amountCents, 30000, "server-side persisted EUR total");
  assert.equal(calls[0].orderId, pixOrderId);
  assert.equal(calls[0].paymentReference, pixReference);
  assert.equal(calls[0].customerEmail, "joana@example.test");
  assert.equal(
    calls[0].successUrl,
    `https://odogwu-heritage.vercel.app/?future_order_v2_pix_return=1&future_order_v2_order_id=${pixOrderId}&session_id={CHECKOUT_SESSION_ID}`,
  );
}

// Pickup (NL) orders cannot start Pix, even if the client asks.
{
  const { res, state } = response();
  let called = false;
  await handleFutureOrderV2StripePayment(pixRequest(), res, {
    ...paymentDeps(pickupOrder.persisted),
    async createPixCheckoutSession() {
      called = true;
      throw new Error("unreachable");
    },
  });
  assert.equal(state.statusCode, 400);
  assert.equal((state.body as { code: string }).code, "PIX_NOT_AVAILABLE");
  assert.equal(called, false);
}

// Anonymous and live-key requests never reach Stripe.
{
  const anon = response();
  let called = false;
  const deps = {
    ...paymentDeps(brazilOrder.persisted),
    async createPixCheckoutSession() {
      called = true;
      throw new Error("unreachable");
    },
  };
  await handleFutureOrderV2StripePayment(pixRequest({}, { authorization: "Bearer anon-token" }), anon.res, deps);
  assert.equal(anon.state.statusCode, 403);
  const live = response();
  await handleFutureOrderV2StripePayment(pixRequest(), live.res, { ...deps, readSecretKey: () => "sk_live_x" });
  assert.equal(live.state.statusCode, 503);
  assert.equal(called, false);
}

// A Pix still waiting on the bank is reported, not replaced.
{
  const { res, state } = response();
  await handleFutureOrderV2StripePayment(pixRequest(), res, {
    ...paymentDeps(brazilOrder.persisted),
    async createPixCheckoutSession() {
      return { status: "pending", checkoutSessionId: "cs_test_pending" };
    },
  });
  assert.equal(state.statusCode, 409);
  assert.equal((state.body as { code: string }).code, "PIX_PAYMENT_PENDING");
  assert.equal((state.body as { checkoutSessionId: string }).checkoutSessionId, "cs_test_pending");
}

// Stripe failures are reported without leaking the message.
{
  const { res, state } = response();
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    await handleFutureOrderV2StripePayment(pixRequest(), res, {
      ...paymentDeps(brazilOrder.persisted),
      async createPixCheckoutSession() {
        throw new Error("secret detail");
      },
    });
  } finally {
    console.warn = warn;
  }
  assert.equal(state.statusCode, 502);
  assert.equal((state.body as { code: string }).code, "STRIPE_PIX_CHECKOUT_FAILED");
  assert.equal(JSON.stringify(state.body).includes("secret detail"), false);
}

// --- record-payment: verify a returned Checkout Session -------------------
const succeededIntent = (overrides: Partial<StripePaymentIntentSummary> = {}): StripePaymentIntentSummary => ({
  id: "pi_test_pix",
  status: "succeeded",
  amount: 30000,
  currency: "eur",
  metadata: { orderId: pixOrderId, paymentReference: pixReference, stage: "Design Studio V2" },
  ...overrides,
});
const completeSession = (overrides: Partial<StripeCheckoutSessionSummary> = {}): StripeCheckoutSessionSummary => ({
  id: "cs_test_pix",
  status: "complete",
  paymentStatus: "paid",
  paymentIntentId: "pi_test_pix",
  paymentIntentStatus: "succeeded",
  clientReferenceId: pixOrderId,
  metadata: { orderId: pixOrderId, paymentReference: pixReference },
  ...overrides,
});
const memoryStore = () => {
  const payments = new Map<string, unknown>();
  const store: FutureOrderV2PaymentRecordStore = {
    async readOrder(id) {
      return id === pixOrderId ? brazilOrder.persisted : null;
    },
    async runTransaction(operation) {
      return operation({
        async getPayment(id) {
          return payments.get(id) ?? null;
        },
        createPayment(id, record) {
          payments.set(id, record);
        },
      });
    },
  };
  return { store, payments };
};
const recordHandler = ({
  store = memoryStore().store,
  session = completeSession(),
  intent = succeededIntent(),
  uid = OWNER_UID,
  onSession = () => undefined,
}: {
  store?: FutureOrderV2PaymentRecordStore;
  session?: StripeCheckoutSessionSummary;
  intent?: StripePaymentIntentSummary;
  uid?: string;
  onSession?: () => void;
} = {}) =>
  createFutureOrderV2PaymentRecordHandler({
    getServices: () => ({
      auth: {
        async verifyIdToken(token) {
          if (token !== "valid-token") throw new Error("bad token");
          return { uid, firebase: { sign_in_provider: "password" } };
        },
      },
      db: {},
    }),
    createStore: () => store,
    readSecretKey: () => "sk_test_example",
    async retrieveCheckoutSession() {
      onSession();
      return session;
    },
    async retrievePaymentIntent(id) {
      assert.equal(id, session.paymentIntentId, "only the session's own PaymentIntent is read");
      return intent;
    },
    now: () => new Date("2026-10-20T12:30:00.000Z"),
    log: () => undefined,
  });
const recordRequest = (body: unknown = { orderId: pixOrderId, checkoutSessionId: "cs_test_pix" }): HttpRequest => ({
  method: "POST",
  headers: { authorization: "Bearer valid-token" },
  body,
});

{
  const { store, payments } = memoryStore();
  const { res, state } = response();
  await recordHandler({ store })(recordRequest(), res);
  assert.equal(state.statusCode, 201);
  assert.equal((state.body as { status: string }).status, "recorded");
  const saved = payments.get(pixOrderId) as { paymentIntentId: string; amountCents: number; currency: string };
  assert.equal(saved.paymentIntentId, "pi_test_pix");
  assert.equal(saved.amountCents, 30000);
  assert.equal(saved.currency, "eur");
  // Repeating the return is safe.
  const again = response();
  await recordHandler({ store })(recordRequest(), again.res);
  assert.equal(again.state.statusCode, 200);
  assert.equal((again.state.body as { status: string }).status, "already_recorded");
}

// Pix shown but not yet paid → 202 pending, nothing saved.
{
  const { store, payments } = memoryStore();
  const { res, state } = response();
  await recordHandler({
    store,
    session: completeSession({ paymentStatus: "unpaid", paymentIntentStatus: "requires_action" }),
    intent: succeededIntent({ status: "requires_action" }),
  })(recordRequest(), res);
  assert.equal(state.statusCode, 202);
  assert.equal((state.body as { status: string }).status, "pending");
  assert.equal(payments.size, 0);
}

// A session for another order, or with no PaymentIntent yet, is not recorded.
{
  const mismatch = response();
  await recordHandler({ session: completeSession({ metadata: { orderId: "other" } }) })(recordRequest(), mismatch.res);
  assert.equal(mismatch.state.statusCode, 409);
  assert.equal((mismatch.state.body as { code: string }).code, "PAYMENT_MISMATCH");
  const open = response();
  await recordHandler({ session: completeSession({ status: "open", paymentStatus: "unpaid", paymentIntentId: null }) })(recordRequest(), open.res);
  assert.equal(open.state.statusCode, 409);
  assert.equal((open.state.body as { code: string }).code, "PAYMENT_NOT_SUCCEEDED");
}

// A wrong amount (e.g. a tampered session) is a mismatch.
{
  const { res, state } = response();
  await recordHandler({ intent: succeededIntent({ amount: 100 }) })(recordRequest(), res);
  assert.equal(state.statusCode, 409);
  assert.equal((state.body as { code: string }).code, "PAYMENT_MISMATCH");
}

// Another account cannot probe the session.
{
  let looked = false;
  const { res, state } = response();
  await recordHandler({ uid: "someone-else", onSession: () => { looked = true; } })(recordRequest(), res);
  assert.equal(state.statusCode, 403);
  assert.equal(looked, false);
}

// Malformed session ids fall back to the PaymentIntent validation.
{
  const { res, state } = response();
  await recordHandler()(recordRequest({ orderId: pixOrderId, checkoutSessionId: "not-a-session" }), res);
  assert.equal(state.statusCode, 400);
}

// --- Client verifier ------------------------------------------------------
{
  const identity = { isAnonymous: false, async getIdToken() { return "tok"; } };
  const reply = (status: number, body: unknown) => async () => ({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  });
  const pending = await createFutureOrderV2PixVerifier({ getCurrentUser: () => identity, fetch: reply(202, { status: "pending" }) })({ orderId: pixOrderId, checkoutSessionId: "cs_test_pix" });
  assert.deepEqual(pending, { status: "pending" });
  const record = {
    schemaVersion: 1,
    orderId: pixOrderId,
    ownerUid: OWNER_UID,
    paymentIntentId: "pi_test_pix",
    amountCents: 30000,
    currency: "eur",
    status: "succeeded",
    testMode: true,
    recordedAt: "2026-10-20T12:30:00.000Z",
  };
  const recorded = await createFutureOrderV2PixVerifier({ getCurrentUser: () => identity, fetch: reply(201, { status: "recorded", record }) })({ orderId: pixOrderId, checkoutSessionId: "cs_test_pix" });
  assert.deepEqual(recorded, { status: "recorded", paymentIntentId: "pi_test_pix" });
  const anonymous = await createFutureOrderV2PixVerifier({ getCurrentUser: () => ({ ...identity, isAnonymous: true }), fetch: reply(201, {}) })({ orderId: pixOrderId, checkoutSessionId: "cs_test_pix" });
  assert.equal(anonymous.status, "failed");
}

// --- Browser return -------------------------------------------------------
{
  const search = `?future_order_v2_pix_return=1&future_order_v2_order_id=${pixOrderId}&session_id=cs_test_pix`;
  let cleared = 0;
  let stashed: FutureOrderV2PixPending | null = null;
  const pending = await resumeFutureOrderV2PixReturn({
    search,
    verify: async () => ({ status: "pending" }),
    clearSearch: () => { cleared += 1; },
    stashPending: (value) => { stashed = value; },
    clearPending: () => undefined,
  });
  assert.equal(pending.status, "pending");
  assert.equal(cleared, 1);
  assert.deepEqual(stashed, { status: "returned", orderId: pixOrderId, checkoutSessionId: "cs_test_pix" });

  let pendingCleared = false;
  const recorded = await resumeFutureOrderV2PixReturn({
    search,
    verify: async () => ({ status: "recorded", paymentIntentId: "pi_test_pix" }),
    clearSearch: () => undefined,
    stashPending: () => undefined,
    clearPending: () => { pendingCleared = true; },
  });
  assert.deepEqual(recorded, { status: "recorded", orderId: pixOrderId, paymentIntentId: "pi_test_pix" });
  assert.equal(pendingCleared, true);

  let verified = false;
  const cancelled = await resumeFutureOrderV2PixReturn({
    search: `?future_order_v2_pix_return=cancel&future_order_v2_order_id=${pixOrderId}`,
    verify: async () => { verified = true; return { status: "pending" }; },
    clearSearch: () => undefined,
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(verified, false);

  const ignored = await resumeFutureOrderV2PixReturn({ search: "?x=1", verify: async () => ({ status: "pending" }) });
  assert.deepEqual(ignored, { status: "ignored" });

  const thrown = await resumeFutureOrderV2PixReturn({
    search,
    verify: async () => { throw new Error("network"); },
    clearSearch: () => undefined,
  });
  assert.equal(thrown.status, "failed");
}

// Pending storage is scoped to its order.
{
  const memory = new Map<string, string>();
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  };
  stashFutureOrderV2PixPending({ orderId: "order-a", checkoutSessionId: "cs_test_a" }, storage);
  assert.deepEqual(readFutureOrderV2PixPending("order-a", storage), { orderId: "order-a", checkoutSessionId: "cs_test_a" });
  assert.equal(readFutureOrderV2PixPending("order-b", storage), null);
}

// --- authorizeFutureOrderV2Payment with Pix selected -----------------------
{
  const attempt: FutureOrderV2PaymentAttempt = {
    orderId: pixOrderId,
    cartItemId: brazilOrder.prepared.cartItemId,
    paymentReference: pixReference,
    masterOrder: brazilOrder.prepared.masterOrder,
  };
  const previousFetch = globalThis.fetch;
  const requests: Array<Record<string, unknown>> = [];
  let navigated: string | null = null;
  let confirmed = false;
  registerFutureOrderV2PaymentIdentityResolver(() => ({ isAnonymous: false, async getIdToken() { return "owner-token"; } }));
  registerFutureOrderV2PaymentConfirmer(async () => {
    confirmed = true;
    return { status: "failed", message: "card path must not run" };
  });
  registerFutureOrderV2PaymentMethodReader(() => "pix");
  registerFutureOrderV2PixHooks({ navigate: (url) => { navigated = url; } });
  try {
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({ status: "open", checkoutSessionId: "cs_test_open", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_open" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    const open = await authorizeFutureOrderV2Payment(attempt);
    assert.deepEqual(open, { status: "redirecting" });
    assert.equal(navigated, "https://checkout.stripe.com/c/pay/cs_test_open");
    assert.equal(requests[0].action, "pix-checkout-session");
    assert.equal(requests[0].orderId, pixOrderId);
    assert.equal("masterOrder" in requests[0], false);
    assert.equal(confirmed, false);

    // Only Stripe's own hosted page is followed.
    navigated = null;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: "open", checkoutSessionId: "cs_test_x", checkoutUrl: "https://evil.example/" }), { status: 200 })) as typeof fetch;
    const evil = await authorizeFutureOrderV2Payment(attempt);
    assert.equal(evil.status, "failed");
    assert.equal(navigated, null);

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ code: "PIX_PAYMENT_PENDING", error: "waiting", checkoutSessionId: "cs_test_pending" }),
        { status: 409 },
      )) as typeof fetch;
    const pending = await authorizeFutureOrderV2Payment(attempt);
    assert.deepEqual(pending, { status: "failed", message: FUTURE_ORDER_V2_PIX_PENDING_MESSAGE });

    registerFutureOrderV2PixHooks({ verify: async () => ({ status: "recorded", paymentIntentId: "pi_test_pix" }) });
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: "paid", checkoutSessionId: "cs_test_paid", paymentIntentId: "pi_test_pix" }), { status: 200 })) as typeof fetch;
    const paid = await authorizeFutureOrderV2Payment(attempt);
    assert.deepEqual(paid, { status: "authorized", providerTransactionReference: "pi_test_pix" });
  } finally {
    globalThis.fetch = previousFetch;
    registerFutureOrderV2PaymentMethodReader(null);
    registerFutureOrderV2PixHooks({ verify: null, navigate: null });
    registerFutureOrderV2PaymentConfirmer(null);
    registerFutureOrderV2PaymentIdentityResolver(null);
  }
}

// --- Stage 10 UI ----------------------------------------------------------
{
  assert.equal(isFutureOrderV2StripePayReady({ method: "pix", cardReady: false, stripeClientReady: true }), true);
  assert.equal(isFutureOrderV2StripePayReady({ method: "pix", cardReady: true, stripeClientReady: false }), false);
  assert.equal(futureOrderV2RedirectingMessage("pix").includes("Pix"), true);
  assert.equal(futureOrderV2RedirectingPayLabel("pix"), "Continuing to Pix...");
  assert.equal(futureOrderV2RedirectingPayLabel("ideal"), "Continuing to your bank...");

  const icon = renderToStaticMarkup(createElement(FutureOrderV2MethodIcon, { method: "pix" }));
  assert.match(icon, /data-future-order-v2-method-icon="pix"/);

  const card = (shippingState: FutureShippingStateV1 | null) =>
    renderToStaticMarkup(
      createElement(FutureOrderV2StripeCard, {
        disabled: false,
        orderId: pixOrderId,
        returnSurface: "dashboard",
        amountCents: 30000,
        shippingState,
        onReadyChange: () => undefined,
      }),
    );
  const brazil = card(brazilDelivery());
  assert.match(brazil, /data-future-order-v2-method-pix/);
  assert.match(brazil, /data-future-order-v2-method-icon="pix"/);
  assert.match(brazil, /data-future-order-v2-pix-iof/);
  assert.match(brazil, /grid-cols-3/, "card + iDEAL + Pix");
  const nl = card(null);
  assert.equal(nl.includes("data-future-order-v2-method-pix"), false);
  assert.match(nl, /grid-cols-2/, "card + iDEAL unchanged");
}

console.log("future order v2 Pix checkout tests passed");
