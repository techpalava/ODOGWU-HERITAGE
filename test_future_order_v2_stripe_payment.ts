import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import {
  handleFutureOrderV2StripeConfig,
  handleFutureOrderV2StripePayment,
  nextFutureOrderV2StripeIdempotencyUpgrade,
} from "./src/server/futureOrderV2StripePayment";
import type { HttpResponse } from "./src/server/httpTypes";
import {
  authorizeFutureOrderV2Payment,
  readFutureOrderV2JsonBody,
  readFutureOrderV2ReviewedTotalCents,
  registerFutureOrderV2PaymentConfirmer,
  registerFutureOrderV2PaymentIdentityResolver,
} from "./src/utils/futureOrderV2Payment";
import { DormantFuturePaymentReviewStep } from "./src/components/DormantFuturePaymentReviewStep";
import {
  FutureOrderV2StripeCard,
  futureOrderV2ExpressCheckoutShell,
  isFutureOrderV2ExpressCheckoutAmount,
  isFutureOrderV2ExpressWalletAvailable,
  isFutureOrderV2StripePayReady,
  shouldShowFutureOrderV2CardLoading,
  futureOrderV2VisibleStripeMethods,
  FUTURE_ORDER_V2_CARD_LOADING_MESSAGE,
} from "./src/components/FutureOrderV2StripeCard";
import { FutureOrderV2AllowedCardIcons } from "./src/components/futureOrderV2PaymentMethodIcons";
import {
  createFutureOrderV2PaymentReviewHandoff,
  FUTURE_ORDER_V2_SIGN_IN_TO_PAY_MESSAGE,
} from "./src/utils/designStudioFuturePaymentReview";
import { createFutureOrderV2PreparationAttempt } from "./src/utils/futureOrderV2Preparation";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { persistFutureOrderV2ForVerifiedIdentity } from "./src/server/futureOrderV2Persistence";
import { recomputeFutureOrderPayableTotal } from "./src/utils/futureOrderPayableTotal";
import { readFutureOrderV2ChargeableCents } from "./src/utils/futureOrderV2PersonalizedPrice";
import type { FutureOrderV2PersistenceAdapter } from "./src/utils/futureOrderV2PersistenceContract";
import {
  createEmptyFutureShippingState,
  FUTURE_PICKUP_ATELIER_ADDRESS,
} from "./src/utils/designStudioFutureShipping";
import {
  futureOrderV2StripePaymentMethodTypes,
  FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES,
} from "./src/utils/futureOrderV2StripeMethods";
import {
  resolveFutureOrderV2StripeShipping,
  toFutureOrderV2KlarnaBillingDetails,
} from "./src/utils/futureOrderV2StripeShipping";
import {
  createCatalogueAuthoritativeFutureOrderV2Fixture,
  createFutureOrderV2Fixture,
} from "./testing/futureOrderV2Fixture";

const PICKUP_STRIPE_SHIPPING = {
  name: "Ada Lovelace",
  email: "ada@example.test",
  phone: "+31 6 12345678",
  address: {
    line1: "Frans Snijderslaan 4-b",
    city: "Eindhoven",
    postalCode: "5642 AN",
    country: "NL",
  },
};

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
          paymentMethodTypes: ["card", "ideal", "klarna"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 200);
  assert.deepEqual(created, {
    amountCents: 30000,
    orderId: prepared.orderId,
    paymentReference,
    shipping: PICKUP_STRIPE_SHIPPING,
  });
  assert.deepEqual(state.body, {
    paymentIntentId: "pi_test_reviewed",
    clientSecret: "pi_test_reviewed_secret_abc",
    paymentMethodTypes: ["card", "ideal", "klarna"],
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
    paymentMethodTypes: ["card", "ideal"],
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
assert.match(stripeSource, /const currency = "eur"/);
assert.match(stripeSource, /createOnce\(input\.paymentReference\)/);
assert.match(stripeSource, /futureOrderV2StripePaymentMethodTypes\(currency\)/);
assert.match(stripeSource, /payment_method_types: paymentMethodTypes/);
assert.equal(/payment_method_types:\s*\[[^\]]*klarna/.test(stripeSource), false);
assert.deepEqual([...FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES], ["card", "ideal"]);
assert.deepEqual([...futureOrderV2StripePaymentMethodTypes("eur")], ["card", "ideal"]);
assert.equal(futureOrderV2StripePaymentMethodTypes("eur").includes("klarna"), false);
assert.deepEqual([...futureOrderV2StripePaymentMethodTypes("usd")], ["card", "klarna"]);
assert.equal(futureOrderV2StripePaymentMethodTypes("usd").includes("ideal"), false);
assert.deepEqual([...futureOrderV2StripePaymentMethodTypes("gbp")], ["card"]);
assert.deepEqual([...futureOrderV2VisibleStripeMethods()], ["card", "ideal"]);
assert.deepEqual(
  [...futureOrderV2VisibleStripeMethods(["card", "ideal", "klarna"])],
  ["card", "ideal", "klarna"],
);
assert.equal(stripeSource.includes('"paypal"'), false);
assert.match(stripeSource, /KLARNA_IDEMPOTENCY_SUFFIX/);
assert.match(stripeSource, /resolveFutureOrderV2StripeShipping/);
assert.match(stripeSource, /postal_code: shipping\.address\.postalCode/);
assert.equal(stripeSource.includes("apple_pay"), false);
assert.equal(stripeSource.includes("google_pay"), false);
assert.deepEqual(stripeSource.match(/":[a-z_]+"/g), ['":ideal"', '":klarna"']);
assert.match(stripeSource, /IDEAL_IDEMPOTENCY_SUFFIX/);
assert.match(stripeSource, /idempotencyKey/);
assert.match(stripeSource, /AUTH_REQUIRED/);
assert.match(stripeSource, /parsePersistedFutureOrderV2/);
assert.match(stripeSource, /OWNER_MISMATCH/);
assert.equal(stripeSource.includes("parseFutureOrderMasterOrderV2"), false);
const paymentIntentApi = readFileSync("api/future-order-v2/payment-intent.ts", "utf8");
assert.equal(paymentIntentApi.includes("handleFutureOrderV2StripePayment"), true);
assert.equal(paymentIntentApi.includes("handleFutureOrderV2StripeConfig"), true);
const stripeCardSource = readFileSync("src/components/FutureOrderV2StripeCard.tsx", "utf8");
assert.match(stripeCardSource, /confirmIdealPayment/);
assert.match(stripeCardSource, /confirmKlarnaPayment/);
assert.match(stripeCardSource, /confirmCardPayment/);
assert.match(stripeCardSource, /data-future-order-v2-method-ideal/);
assert.match(stripeCardSource, /data-future-order-v2-method-card/);
assert.match(stripeCardSource, /data-future-order-v2-method-klarna/);
assert.match(stripeCardSource, /data-future-order-v2-klarna-help/);
assert.match(stripeCardSource, /inline-flex w-full min-w-0 items-center justify-center gap-1\.5/);
assert.match(stripeCardSource, /FutureOrderV2MethodIcon method="card"/);
assert.match(stripeCardSource, /FutureOrderV2MethodIcon method="ideal"/);
assert.match(stripeCardSource, /FutureOrderV2MethodIcon method="klarna"/);
assert.match(
  stripeCardSource,
  /\{testMode && \(\s*<div className="mt-2 space-y-1\.5">\s*<FutureOrderV2AllowedCardIcons \/>\s*<p className="text-xs leading-relaxed text-white\/75">\s*Test card 4242 4242 4242 4242\. Use any future expiry and any CVC\./,
);
assert.equal(
  (stripeCardSource.match(/FutureOrderV2AllowedCardIcons/g) || []).length,
  2,
);
const paymentMethodIconSource = readFileSync(
  "src/components/futureOrderV2PaymentMethodIcons.tsx",
  "utf8",
);
assert.match(paymentMethodIconSource, /data-future-order-v2-method-icon=\{method\}/);
assert.match(paymentMethodIconSource, /aria-hidden="true"/);
assert.match(paymentMethodIconSource, /data-future-order-v2-allowed-card-icons/);
assert.match(paymentMethodIconSource, /data-future-order-v2-allowed-card-icon=\{brand\}/);
assert.match(paymentMethodIconSource, /brand="visa"/);
assert.match(paymentMethodIconSource, /brand="mastercard"/);
assert.match(paymentMethodIconSource, /brand="amex"/);
assert.equal(/<img\b|https?:\/\//.test(paymentMethodIconSource), false);
assert.equal(/apple|google|wallet|paypal/i.test(paymentMethodIconSource), false);
const allowedCardMarkup = renderToStaticMarkup(
  createElement(FutureOrderV2AllowedCardIcons),
);
assert.match(allowedCardMarkup, /data-future-order-v2-allowed-card-icons="true"/);
assert.match(allowedCardMarkup, /aria-hidden="true"/);
assert.match(allowedCardMarkup, /data-future-order-v2-allowed-card-icon="visa"/);
assert.match(allowedCardMarkup, /data-future-order-v2-allowed-card-icon="mastercard"/);
assert.match(allowedCardMarkup, /data-future-order-v2-allowed-card-icon="amex"/);
assert.equal(
  allowedCardMarkup.indexOf('data-future-order-v2-allowed-card-icon="visa"') <
    allowedCardMarkup.indexOf('data-future-order-v2-allowed-card-icon="mastercard"'),
  true,
);
assert.equal(
  allowedCardMarkup.indexOf('data-future-order-v2-allowed-card-icon="mastercard"') <
    allowedCardMarkup.indexOf('data-future-order-v2-allowed-card-icon="amex"'),
  true,
);
assert.match(stripeCardSource, /expressCheckout/);
assert.match(stripeCardSource, /confirmPayment/);
assert.match(stripeCardSource, /data-future-order-v2-express-checkout/);
assert.match(stripeCardSource, /stashFutureOrderV2StripeReturnContext/);
assert.match(stripeCardSource, /klarna:\s*"never"/);
assert.equal(/klarna:\s*"auto"/.test(stripeCardSource), false);
assert.match(stripeCardSource, /applePay:\s*"auto"/);
assert.match(stripeCardSource, /googlePay:\s*"auto"/);
assert.match(stripeCardSource, /allowedPaymentMethodTypes:\s*\["card"\]/);
assert.equal(/allowedPaymentMethodTypes:\s*\[[^\]]*ideal/.test(stripeCardSource), false);
assert.equal(stripeCardSource.includes("idealReady"), false);
assert.equal(stripeCardSource.includes('"invisible"'), false);
assert.match(stripeCardSource, /pointer-events-none/);
assert.match(stripeCardSource, /relative z-10/);
assert.match(
  stripeCardSource,
  /reportReady\(next, cardReady, stripeClientReady\)/,
);
assert.equal(stripeCardSource.includes("confirmPayPalPayment"), false);
assert.equal(stripeCardSource.includes("data-future-order-v2-method-paypal"), false);
assert.equal(stripeCardSource.includes(":wallet"), false);
assert.equal(stripeCardSource.includes(":apple"), false);
assert.match(stripeCardSource, /readFutureOrderV2JsonBody/);
assert.equal(stripeCardSource.includes("response.json()"), false);
const shippingUtilSource = readFileSync(
  "src/utils/futureOrderV2StripeShipping.ts",
  "utf8",
);
assert.equal(shippingUtilSource.includes("designStudioFutureShipping"), false);
assert.equal(shippingUtilSource.includes(FUTURE_PICKUP_ATELIER_ADDRESS), true);
const paymentClientSource = readFileSync("src/utils/futureOrderV2Payment.ts", "utf8");
assert.match(paymentClientSource, /readFutureOrderV2JsonBody/);
assert.equal(paymentClientSource.includes("response.json()"), false);
const reviewStepSource = readFileSync(
  "src/components/DormantFuturePaymentReviewStep.tsx",
  "utf8",
);
assert.match(reviewStepSource, /onExpressCheckoutConfirm=\{onPay\}/);
assert.match(reviewStepSource, /amountCents=\{payableNowCents\}/);
assert.match(
  reviewStepSource,
  /disabled=\{communityBatchClosed \|\| !canSettleReviewedOrder \|\| payIsBusy \|\| !stripePaymentReady\}/,
);
assert.equal(reviewStepSource.includes("cardReady"), false);

assert.equal(isFutureOrderV2ExpressWalletAvailable(undefined), false);
assert.equal(isFutureOrderV2ExpressWalletAvailable(null), false);
assert.equal(isFutureOrderV2ExpressWalletAvailable({}), false);
assert.equal(isFutureOrderV2ExpressWalletAvailable({ applePay: false, googlePay: false }), false);
assert.equal(isFutureOrderV2ExpressWalletAvailable({ applePay: true }), true);
assert.equal(isFutureOrderV2ExpressWalletAvailable({ googlePay: true }), true);
assert.equal(isFutureOrderV2ExpressCheckoutAmount(null), false);
assert.equal(isFutureOrderV2ExpressCheckoutAmount(49), false);
assert.equal(isFutureOrderV2ExpressCheckoutAmount(50), true);
assert.equal(isFutureOrderV2ExpressCheckoutAmount(10.5), false);

assert.equal(
  isFutureOrderV2StripePayReady({
    method: "ideal",
    cardReady: false,
    stripeClientReady: true,
  }),
  true,
  "selecting iDEAL reports ready once Stripe.js is loaded, without Card Element interaction",
);
assert.equal(
  isFutureOrderV2StripePayReady({
    method: "klarna",
    cardReady: false,
    stripeClientReady: true,
  }),
  true,
  "selecting Klarna reports ready once Stripe.js is loaded, without Card Element interaction",
);
assert.equal(
  isFutureOrderV2StripePayReady({
    method: "card",
    cardReady: false,
    stripeClientReady: true,
  }),
  false,
  "Card Pay still waits for the Card Element",
);
assert.equal(
  isFutureOrderV2StripePayReady({
    method: "ideal",
    cardReady: true,
    stripeClientReady: false,
  }),
  false,
);
assert.equal(
  isFutureOrderV2StripePayReady({
    method: "klarna",
    cardReady: true,
    stripeClientReady: false,
  }),
  false,
);
const hiddenExpress = futureOrderV2ExpressCheckoutShell(false);
assert.equal(hiddenExpress.hidden, true);
assert.equal(hiddenExpress["aria-hidden"], true);
assert.equal(hiddenExpress.className, "pointer-events-none");
assert.equal(hiddenExpress["data-future-order-v2-express-checkout"], "hidden");
assert.equal(String(hiddenExpress.className).includes("invisible"), false);
const shownExpress = futureOrderV2ExpressCheckoutShell(true);
assert.equal(shownExpress.hidden, false);
assert.equal(shownExpress.className, undefined);
assert.equal(shownExpress["data-future-order-v2-express-checkout"], "available");

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
      paymentMethodTypes: ["card", "ideal", "klarna"],
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
  assert.deepEqual(context.paymentMethodTypes, ["card", "ideal", "klarna"]);
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

{
  const crashPage = await readFutureOrderV2JsonBody(
    new Response("A server error has occurred", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    }),
  );
  assert.equal(crashPage, null);
  const jsonError = await readFutureOrderV2JsonBody(
    new Response(JSON.stringify({ error: "Stripe test payments are not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }),
  );
  assert.deepEqual(jsonError, { error: "Stripe test payments are not configured." });
}

globalThis.fetch = async () =>
  new Response("A server error has occurred", {
    status: 500,
    headers: { "Content-Type": "text/plain" },
  });
registerFutureOrderV2PaymentIdentityResolver(() => ({
  isAnonymous: false,
  async getIdToken() {
    return "owner-token";
  },
}));
registerFutureOrderV2PaymentConfirmer(async () => {
  throw new Error("The confirmer must not run when the payment intent is not JSON.");
});
try {
  const crashed = await authorizeFutureOrderV2Payment({
    orderId: prepared.orderId,
    cartItemId: prepared.cartItemId,
    paymentReference,
    masterOrder: prepared.masterOrder,
  });
  assert.equal(crashed.status, "failed");
  if (crashed.status !== "failed") throw new Error("Expected a readable payment failure.");
  assert.equal(crashed.message.includes("Unexpected token"), false);
  assert.equal(crashed.message.includes("not valid JSON"), false);
  assert.match(crashed.message, /Retry this same order/);
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

{
  const cheap = JSON.parse(
    JSON.stringify(createFutureOrderV2Fixture("stripe-cheap-ledger")),
  );
  const cheapCandidate = cheap.cartItem.candidate;
  cheapCandidate.garments.forEach(
    (
      garment: { construction: unknown; constructionTotalCents: number },
      index: number,
    ) => {
      garment.construction = [
        {
          componentKey: "shirt:shirt_construction:shirt_std_short",
          selectionGroup: "shirt_construction",
          optionId: "shirt_std_short",
          label: "Standard Length Shirt, Short Sleeve",
          priceCents: index === 0 ? 50 : 0,
        },
      ];
      garment.constructionTotalCents = index === 0 ? 50 : 0;
    },
  );
  cheapCandidate.pricing.garmentConstructionSubtotalCents = 50;
  cheapCandidate.pricing.customDetailsCents = 0;
  cheapCandidate.pricing.selectedDesignTotalCents = 50;
  cheapCandidate.pricing.postEindhovenAdjustmentCents = 0;
  cheapCandidate.pricing.exactTotalCents = 50;
  cheapCandidate.pricing.components.customDetails.amountCents = 0;
  cheapCandidate.pricing.components.postEindhovenDelivery.amountCents = 0;
  cheapCandidate.shipping.additionalDeliveryFeeCents = 0;

  const stored = new Map<string, unknown>();
  const memoryAdapter: FutureOrderV2PersistenceAdapter = {
    async runTransaction(operation) {
      return operation({
        get: async (orderId) => stored.get(orderId) ?? null,
        create: (orderId, value) => {
          stored.set(orderId, value);
        },
      });
    },
  };
  const cheapPersisted = await persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    request: { masterOrder: cheap, customerOwnerUid: OWNER_UID },
    adapter: memoryAdapter,
    now: () => new Date("2026-10-05T18:00:00.000Z"),
  });
  assert.equal(cheapPersisted.status, "invalid");
  if (cheapPersisted.status === "invalid") {
    assert.equal(cheapPersisted.code, "NON_AUTHORITATIVE_TOTAL");
  }
  assert.equal(stored.size, 0);

  const authoritativeOrder = createCatalogueAuthoritativeFutureOrderV2Fixture(
    "stripe-authoritative",
  );
  const authoritativePersisted = await persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    request: { masterOrder: authoritativeOrder, customerOwnerUid: OWNER_UID },
    adapter: memoryAdapter,
    now: () => new Date("2026-10-05T18:00:00.000Z"),
  });
  assert.equal(authoritativePersisted.status, "created");
  if (authoritativePersisted.status !== "created") {
    throw new Error("Expected the catalogue total to persist.");
  }
  const payable = recomputeFutureOrderPayableTotal(
    authoritativePersisted.value.masterOrder.cartItem.candidate,
  );
  assert.equal(payable.status, "exact");
  if (payable.status !== "exact") throw new Error("Expected a catalogue quote.");
  assert.equal(
    authoritativePersisted.value.masterOrder.cartItem.candidate.pricing.exactTotalCents,
    payable.exactTotalCents,
  );
  assert.notEqual(payable.exactTotalCents, 50);
  assert.notEqual(payable.exactTotalCents, 1);

  const authoritativeReference = `future-v2-payment-${authoritativePersisted.value.orderId}`;
  const { res, state } = response();
  let created: unknown = null;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: ownerAuthHeaders,
      body: {
        orderId: authoritativePersisted.value.orderId,
        paymentReference: authoritativeReference,
        masterOrder: cheap,
        amountCents: 1,
        exactTotalCents: 50,
      },
    },
    res,
    {
      ...authDependencies({ order: authoritativePersisted.value }),
      readPersistedOrder: async (orderId: string) =>
        orderId === authoritativePersisted.value.orderId
          ? authoritativePersisted.value
          : null,
      async createPaymentIntent(input) {
        created = input;
        return {
          id: "pi_test_authoritative",
          clientSecret: "pi_test_authoritative_secret",
          paymentMethodTypes: ["card", "ideal"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 200);
  assert.deepEqual(created, {
    amountCents: payable.exactTotalCents,
    orderId: authoritativePersisted.value.orderId,
    paymentReference: authoritativeReference,
    shipping: PICKUP_STRIPE_SHIPPING,
  });
}

assert.equal(nextFutureOrderV2StripeIdempotencyUpgrade(["card"]), ":ideal");
assert.equal(nextFutureOrderV2StripeIdempotencyUpgrade(null), ":ideal");
assert.equal(nextFutureOrderV2StripeIdempotencyUpgrade(["card", "ideal"]), null);
assert.equal(
  nextFutureOrderV2StripeIdempotencyUpgrade(["card", "ideal", "klarna"]),
  null,
);
const legacyKlarnaMethods = ["card", "ideal", "klarna"] as const;
assert.equal(
  nextFutureOrderV2StripeIdempotencyUpgrade(["card"], legacyKlarnaMethods),
  ":ideal",
);
assert.equal(
  nextFutureOrderV2StripeIdempotencyUpgrade(["card", "ideal"], legacyKlarnaMethods),
  ":klarna",
);
assert.equal(
  nextFutureOrderV2StripeIdempotencyUpgrade(
    ["card", "ideal", "klarna"],
    legacyKlarnaMethods,
  ),
  null,
);
const usdMethods = futureOrderV2StripePaymentMethodTypes("usd");
assert.equal(nextFutureOrderV2StripeIdempotencyUpgrade(["card"], usdMethods), ":klarna");
assert.equal(
  nextFutureOrderV2StripeIdempotencyUpgrade(["card", "ideal"], usdMethods),
  ":klarna",
);
assert.equal(
  nextFutureOrderV2StripeIdempotencyUpgrade(["card", "klarna"], usdMethods),
  null,
);

const pickupResolved = resolveFutureOrderV2StripeShipping(
  prepared.masterOrder.cartItem.candidate.shipping.state,
);
assert.deepEqual(pickupResolved, PICKUP_STRIPE_SHIPPING);
assert.equal(pickupResolved?.address.line1.includes("Historical"), false);
assert.deepEqual(toFutureOrderV2KlarnaBillingDetails(PICKUP_STRIPE_SHIPPING), {
  email: "ada@example.test",
  name: "Ada Lovelace",
  phone: "+31 6 12345678",
  address: {
    line1: "Frans Snijderslaan 4-b",
    city: "Eindhoven",
    postal_code: "5642 AN",
    country: "NL",
  },
});

{
  const delivery = createEmptyFutureShippingState();
  delivery.fulfilmentMethod = "destination_delivery";
  delivery.customerInformation.fullName = "Ada Lovelace";
  delivery.customerInformation.email = "ada@example.test";
  delivery.customerInformation.phone = "+31 6 00000000";
  delivery.customerInformation.deliveryAddress = {
    addressLine1: "Damrak 1",
    addressLine2: "Floor 2",
    city: "Amsterdam",
    stateRegion: "Noord-Holland",
    postalCode: "1012 LG",
    countryCode: "uk",
  };
  assert.deepEqual(resolveFutureOrderV2StripeShipping(delivery), {
    name: "Ada Lovelace",
    email: "ada@example.test",
    phone: "+31 6 00000000",
    address: {
      line1: "Damrak 1",
      line2: "Floor 2",
      city: "Amsterdam",
      state: "Noord-Holland",
      postalCode: "1012 LG",
      country: "GB",
    },
  });
}

{
  const unnamed = createEmptyFutureShippingState();
  unnamed.fulfilmentMethod = "eindhoven_pickup";
  unnamed.customerInformation.email = "ada@example.test";
  assert.equal(resolveFutureOrderV2StripeShipping(unnamed), null);
  const other = createEmptyFutureShippingState();
  other.fulfilmentMethod = "destination_delivery";
  other.customerInformation.fullName = "Ada Lovelace";
  other.customerInformation.email = "ada@example.test";
  other.customerInformation.deliveryAddress = {
    addressLine1: "Somewhere 1",
    city: "Lagos",
    postalCode: "100001",
    countryCode: "XX",
  };
  assert.equal(resolveFutureOrderV2StripeShipping(other), null);
}

{
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previousFetch = globalThis.fetch;
  let payStarts = 0;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: "Stripe test payments are not configured." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  const handoff = createFutureOrderV2PaymentReviewHandoff(prepared.candidate, {
    status: "prepared",
    cartItemId: prepared.cartItemId,
    orderId: prepared.orderId,
  });
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      renderer = create(
        createElement(DormantFuturePaymentReviewStep, {
          result: handoff,
          onBack: () => undefined,
          onEditStage: () => undefined,
          onPay: () => {
            payStarts += 1;
          },
        }),
      );
      await Promise.resolve();
    });
    assert.ok(renderer);
    const payButton = () =>
      renderer!.root.findByProps({ "data-future-order-v2-pay": true });
    assert.equal(payButton().props.disabled, true);

    const express = renderer.root.findByProps({
      "data-future-order-v2-express-checkout": "hidden",
    });
    assert.equal(express.props.hidden, true);
    assert.match(String(express.props.className), /pointer-events-none/);
    assert.equal(/\binvisible\b/.test(String(express.props.className || "")), false);
    assert.equal(express.props["aria-hidden"], true);

    const methods = renderer.root.findByProps({
      "data-future-order-v2-payment-methods": true,
    });
    assert.match(String(methods.props.className), /\brelative\b/);
    assert.match(String(methods.props.className), /\bz-10\b/);
    for (const methodName of ["card", "ideal"] as const) {
      const radio = renderer.root.findByProps({
        [`data-future-order-v2-method-${methodName}`]: true,
      });
      assert.equal(radio.props.role, "radio");
      assert.match(String(radio.props.className), /inline-flex/);
      assert.match(String(radio.props.className), /items-center/);
      assert.match(String(radio.props.className), /justify-center/);
      assert.match(String(radio.props.className), /gap-1\.5/);
      const methodIcon = radio.findByProps({
        "data-future-order-v2-method-icon": methodName,
      });
      assert.equal(methodIcon.props["aria-hidden"], "true");
    }
    assert.equal(
      renderer.root.findAllByProps({
        "data-future-order-v2-allowed-card-icons": true,
      }).length,
      0,
    );

    await act(async () => {
      renderer!.root
        .findByProps({ "data-future-order-v2-method-ideal": true })
        .props.onClick();
    });
    assert.equal(payStarts, 0, "Selecting iDEAL must not start payment");
    assert.equal(
      renderer.root.findByProps({ "data-future-order-v2-method-ideal": true }).props[
        "aria-checked"
      ],
      true,
    );
    assert.equal(payButton().props.disabled, true);

    const stripeCard = renderer.root.findByType(FutureOrderV2StripeCard);
    await act(async () => {
      stripeCard.props.onReadyChange(
        isFutureOrderV2StripePayReady({
          method: "ideal",
          cardReady: false,
          stripeClientReady: true,
        }),
      );
    });
    assert.equal(
      payButton().props.disabled,
      false,
      "Pay is not gated solely by missing cardReady for iDEAL",
    );
    await act(async () => {
      payButton().props.onClick();
    });
    assert.equal(payStarts, 1);

    assert.equal(
      renderer.root.findAllByProps({ "data-future-order-v2-method-klarna": true }).length,
      0,
      "EUR checkout hides Klarna when the PaymentIntent does not offer it",
    );
    assert.match(String(methods.props.className), /grid-cols-2/);
  } finally {
    if (renderer) {
      await act(async () => {
        renderer!.unmount();
      });
    }
    globalThis.fetch = previousFetch;
  }
}

{
  const pendingSource = createCatalogueAuthoritativeFutureOrderV2Fixture(
    "stripe-pending-personalized",
  );
  const pendingOrder = structuredClone(pendingSource);
  const pendingCandidate = pendingOrder.cartItem.candidate;
  pendingCandidate.pricing = {
    ...pendingCandidate.pricing,
    status: "pending",
    customDetailsCents: null,
    selectedDesignTotalCents: null,
    exactTotalCents: null,
    components: {
      ...pendingCandidate.pricing.components,
      customDetails: { status: "pricing_pending", amountCents: null },
    },
  };
  pendingCandidate.customDetails = [
    {
      occurrenceKey:
        "base:shirt:personalized_additional:personalized_additional_evaluation",
      garmentKey: "base:shirt",
      garmentLabel: "Shirt",
      selectionGroup: "personalized_additional",
      selectionGroupTitle: "Personalized",
      optionId: "personalized_additional_evaluation",
      optionLabel: "Personalized Additional Requirement",
      priceStatus: "evaluation_required",
      priceCents: null,
      personalizedText: "Add a small family emblem on the chest.",
      snapshot: {
        label: "Personalized Additional Requirement",
        description: "Additional cost will depend on evaluation of personalized needs.",
        garmentGroup: "personalized",
        informational: false,
        requiresEvaluation: true,
      },
    },
  ];
  const knownBaseCents = readFutureOrderV2ChargeableCents(pendingCandidate, null);
  assert.equal(
    knownBaseCents,
    (pendingCandidate.pricing.garmentConstructionSubtotalCents ?? 0) +
      (pendingCandidate.pricing.postEindhovenAdjustmentCents ?? 0) +
      (pendingCandidate.pricing.components.lagosToEindhovenShipping.amountCents ?? 0),
  );
  assert.equal(
    knownBaseCents,
    pendingCandidate.pricing.garmentConstructionSubtotalCents,
    "pickup charges the garment total with no shipping",
  );
  const pendingStored = createPersistedFutureOrderV2({
    masterOrder: pendingOrder,
    owner: { uid: OWNER_UID, isAnonymous: false },
    customerOwnerUid: OWNER_UID,
    persistedAt: "2026-10-16T18:00:00.000Z",
  });
  assert.equal(pendingStored.status, "valid");
  if (pendingStored.status !== "valid") throw new Error("Expected a pending order.");
  const pendingReference = `future-v2-payment-${pendingStored.value.orderId}`;
  const { res, state } = response();
  let chargedAmount: number | null = null;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: ownerAuthHeaders,
      body: {
        orderId: pendingStored.value.orderId,
        paymentReference: pendingReference,
        masterOrder: pendingOrder,
      },
    },
    res,
    {
      ...authDependencies({ order: pendingStored.value }),
      readPersistedOrder: async (orderId: string) =>
        orderId === pendingStored.value.orderId ? pendingStored.value : null,
      readPersonalizedPrice: async () => null,
      readCatalog: async () => [],
      async createPaymentIntent(input) {
        chargedAmount = input.amountCents;
        return {
          id: "pi_test_pending_base",
          clientSecret: "pi_test_pending_base_secret",
          paymentMethodTypes: ["card", "ideal", "klarna"],
        };
      },
    },
  );
  assert.equal(state.statusCode, 200);
  assert.equal(chargedAmount, knownBaseCents);

  const tampered = structuredClone(pendingStored.value);
  tampered.masterOrder.cartItem.candidate.pricing.components.lagosToEindhovenShipping = {
    status: "separately_charged",
    amountCents: 1400,
  };
  const tamperedResponse = response();
  let tamperedCharged = false;
  await handleFutureOrderV2StripePayment(
    {
      method: "POST",
      headers: ownerAuthHeaders,
      body: {
        orderId: pendingStored.value.orderId,
        paymentReference: pendingReference,
        masterOrder: pendingOrder,
      },
    },
    tamperedResponse.res,
    {
      ...authDependencies({ order: tampered }),
      readPersistedOrder: async () => tampered,
      readPersonalizedPrice: async () => null,
      readCatalog: async () => [],
      async createPaymentIntent() {
        tamperedCharged = true;
        return {
          id: "pi_test_tampered",
          clientSecret: "secret",
          paymentMethodTypes: ["card", "ideal"],
        };
      },
    },
  );
  assert.equal(tamperedResponse.state.statusCode, 400);
  assert.equal(tamperedCharged, false);
  assert.equal(
    recomputeFutureOrderPayableTotal(tampered.masterOrder.cartItem.candidate).status,
    "rejected",
  );
}

// Card loading note explains a disabled Pay until the Card Element is ready.
assert.equal(
  shouldShowFutureOrderV2CardLoading({ method: "card", cardReady: false, loadFailed: false }),
  true,
);
assert.equal(
  shouldShowFutureOrderV2CardLoading({ method: "card", cardReady: true, loadFailed: false }),
  false,
);
assert.equal(
  shouldShowFutureOrderV2CardLoading({ method: "card", cardReady: false, loadFailed: true }),
  false,
);
assert.equal(
  shouldShowFutureOrderV2CardLoading({ method: "ideal", cardReady: false, loadFailed: false }),
  false,
);
{
  const eurMethods = renderToStaticMarkup(
    createElement(FutureOrderV2StripeCard, {
      amountCents: 7900,
      orderId: "future-order-eur-methods",
      disabled: false,
      onReadyChange: () => undefined,
    } as any),
  );
  assert.ok(eurMethods.includes("data-future-order-v2-method-card"));
  assert.ok(eurMethods.includes("data-future-order-v2-method-ideal"));
  assert.equal(eurMethods.includes("data-future-order-v2-method-klarna"), false);
  assert.equal(eurMethods.includes("data-future-order-v2-klarna-help"), false);
  assert.match(eurMethods, /grid-cols-2/);
  const withKlarna = renderToStaticMarkup(
    createElement(FutureOrderV2StripeCard, {
      amountCents: 7900,
      orderId: "future-order-klarna-methods",
      disabled: false,
      offeredPaymentMethodTypes: ["card", "ideal", "klarna"],
      onReadyChange: () => undefined,
    } as any),
  );
  assert.ok(withKlarna.includes("data-future-order-v2-method-klarna"));
  assert.ok(withKlarna.includes("data-future-order-v2-klarna-help"));
  assert.match(withKlarna, /grid-cols-3/);
}
{
  const loadingMarkup = renderToStaticMarkup(
    createElement(FutureOrderV2StripeCard, {
      amountCents: 7900,
      orderId: "future-order-loading",
      disabled: false,
      onReadyChange: () => undefined,
    } as any),
  );
  assert.match(loadingMarkup, /data-future-order-v2-card-loading/);
  assert.match(loadingMarkup, /role="status"/);
  assert.ok(loadingMarkup.includes(FUTURE_ORDER_V2_CARD_LOADING_MESSAGE));
}
{
  // A failed Stripe load replaces the loading note with the error.
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Stripe test payments are not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      renderer = create(
        createElement(FutureOrderV2StripeCard, {
          amountCents: 7900,
          orderId: "future-order-loading",
          disabled: false,
          onReadyChange: () => undefined,
        } as any),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(
      renderer!.root.findAllByProps({ "data-future-order-v2-card-loading": true }).length,
      0,
    );
  } finally {
    act(() => renderer?.unmount());
    globalThis.fetch = previousFetch;
  }
}

// Guest PAY: the sign-in message carries a real Sign in button.
{
  const signInHandoff = createFutureOrderV2PaymentReviewHandoff(prepared.candidate, {
    status: "authentication_required",
    message: FUTURE_ORDER_V2_SIGN_IN_TO_PAY_MESSAGE,
  });
  let signInClicks = 0;
  const withButton = renderToStaticMarkup(
    createElement(DormantFuturePaymentReviewStep, {
      result: signInHandoff,
      onBack: () => undefined,
      onEditStage: () => undefined,
      onPay: () => undefined,
      onSignInToPay: () => {
        signInClicks += 1;
      },
    }),
  );
  assert.ok(withButton.includes(FUTURE_ORDER_V2_SIGN_IN_TO_PAY_MESSAGE));
  assert.match(withButton, /data-future-payment-sign-in="true"[^>]*>[\s\S]*?Sign in<\/button>/);
  const withoutHandler = renderToStaticMarkup(
    createElement(DormantFuturePaymentReviewStep, {
      result: signInHandoff,
      onBack: () => undefined,
      onEditStage: () => undefined,
      onPay: () => undefined,
    }),
  );
  assert.equal(withoutHandler.includes("data-future-payment-sign-in"), false);
  const preparedHandoff = createFutureOrderV2PaymentReviewHandoff(prepared.candidate, {
    status: "prepared",
    cartItemId: prepared.cartItemId,
    orderId: prepared.orderId,
  });
  const signedIn = renderToStaticMarkup(
    createElement(DormantFuturePaymentReviewStep, {
      result: preparedHandoff,
      onBack: () => undefined,
      onEditStage: () => undefined,
      onPay: () => undefined,
      onSignInToPay: () => undefined,
    }),
  );
  assert.equal(signedIn.includes("data-future-payment-sign-in"), false);
  let renderer: ReturnType<typeof create> | undefined;
  act(() => {
    renderer = create(
      createElement(DormantFuturePaymentReviewStep, {
        result: signInHandoff,
        onBack: () => undefined,
        onEditStage: () => undefined,
        onPay: () => undefined,
        onSignInToPay: () => {
          signInClicks += 1;
        },
      }),
    );
  });
  act(() => {
    renderer!.root.findByProps({ "data-future-payment-sign-in": "true" }).props.onClick();
  });
  assert.equal(signInClicks, 1);
  act(() => renderer?.unmount());
}

console.log(
  "PASS: Design Studio V2 charges the persisted euro total through authenticated Stripe",
);
