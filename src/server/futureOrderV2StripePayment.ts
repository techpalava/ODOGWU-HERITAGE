import Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  FUTURE_ORDER_V2_COLLECTION,
  parsePersistedFutureOrderV2,
} from "../utils/futureOrderV2PersistenceContract.js";
import {
  FutureOrderV2PriceAuthorityError,
  resolveAuthoritativeExactTotalCents,
  type AuthoritativePriceCandidate,
} from "./futureOrderV2AuthoritativePrice.js";

const MINIMUM_EUR_CENTS = 50;
const SAFE_ORDER_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES = ["card", "ideal"] as const;
const IDEAL_IDEMPOTENCY_SUFFIX = ":ideal";

export interface FutureOrderV2StripePaymentIntentInput {
  readonly amountCents: number;
  readonly orderId: string;
  readonly paymentReference: string;
}

export interface FutureOrderV2StripePaymentIntent {
  readonly id: string;
  readonly clientSecret: string | null;
  readonly paymentMethodTypes: readonly string[];
}

interface VerifiedStripePaymentToken {
  readonly uid: string;
  readonly firebase?: { readonly sign_in_provider?: unknown };
}

type StripePaymentAdminServices = {
  auth: { verifyIdToken(token: string): Promise<VerifiedStripePaymentToken> };
  db: unknown;
};

export interface FutureOrderV2StripePaymentDependencies {
  readSecretKey?: () => string;
  createPaymentIntent?: (
    input: FutureOrderV2StripePaymentIntentInput,
  ) => Promise<FutureOrderV2StripePaymentIntent>;
  readPublishableKey?: () => string;
  getServices?: () => StripePaymentAdminServices;
  readPersistedOrder?: (orderId: string) => Promise<unknown | null>;
  /**
   * Tests that are not about catalogue prices pass a resolver.
   * Production recomputes the total from `custom_detail_catalog` and
   * refuses to charge a persisted ledger that does not match.
   */
  resolveAuthoritativeTotalCents?: (
    candidate: AuthoritativePriceCandidate,
  ) => Promise<number>;
}

const setNoStore = (res: HttpResponse): HttpResponse => {
  res.setHeader("Cache-Control", "no-store");
  return res;
};

const sendError = (
  res: HttpResponse,
  status: number,
  code: string,
  message: string,
) => setNoStore(res).status(status).json({ error: message, code });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getBearerToken = (req: HttpRequest): string | null => {
  const header = req.headers.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  return match?.[1] || null;
};

const readTestSecretKey = (
  dependencies: FutureOrderV2StripePaymentDependencies,
): string =>
  (dependencies.readSecretKey?.() ?? process.env.STRIPE_SECRET_KEY ?? "").trim();

export const readStripeTestPublishableKey = (
  dependencies: FutureOrderV2StripePaymentDependencies = {},
): string | null => {
  const key = (
    dependencies.readPublishableKey?.() ??
    process.env.STRIPE_PUBLISHABLE_KEY ??
    process.env.VITE_STRIPE_PUBLISHABLE_KEY ??
    ""
  ).trim();
  return key.startsWith("pk_test_") ? key : null;
};

const readPersistedOrderFromAdmin = async (
  db: unknown,
  orderId: string,
): Promise<unknown | null> => {
  const snapshot = await (db as Firestore)
    .collection(FUTURE_ORDER_V2_COLLECTION)
    .doc(orderId)
    .get();
  return snapshot.exists ? snapshot.data() : null;
};

let stripeTestClient: Stripe | null = null;

const getStripeTestClient = (): Stripe => {
  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key.startsWith("sk_test_")) {
    throw new Error("Stripe test payments are not configured.");
  }
  if (!stripeTestClient) stripeTestClient = new Stripe(key);
  return stripeTestClient;
};

const paymentIntentSupportsIdeal = (
  types: readonly string[] | null | undefined,
): boolean => (types ?? []).includes("ideal");

const isIdempotencyConflict = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const typed = error as { type?: unknown; code?: unknown; message?: unknown };
  return (
    typed.type === "idempotency_error" ||
    typed.code === "idempotency_key_in_use" ||
    (typeof typed.message === "string" &&
      /idempotenc/i.test(typed.message))
  );
};

const mapPaymentIntent = (
  paymentIntent: Stripe.PaymentIntent,
): FutureOrderV2StripePaymentIntent => ({
  id: paymentIntent.id,
  clientSecret: paymentIntent.client_secret,
  paymentMethodTypes:
    paymentIntent.payment_method_types ?? [...FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES],
});

/** One test PaymentIntent for the reviewed euro total. The payment reference is the idempotency key. */
export const createFutureOrderV2StripeTestPaymentIntent = async (
  input: FutureOrderV2StripePaymentIntentInput,
): Promise<FutureOrderV2StripePaymentIntent> => {
  const stripe = getStripeTestClient();
  const createParams: Stripe.PaymentIntentCreateParams = {
    amount: input.amountCents,
    currency: "eur",
    payment_method_types: [...FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES],
    metadata: {
      orderId: input.orderId,
      paymentReference: input.paymentReference,
      stage: "Design Studio V2",
    },
  };

  const createOnce = (idempotencyKey: string) =>
    stripe.paymentIntents.create(createParams, { idempotencyKey });

  try {
    const paymentIntent = await createOnce(input.paymentReference);
    if (paymentIntentSupportsIdeal(paymentIntent.payment_method_types)) {
      return mapPaymentIntent(paymentIntent);
    }
    // Older card-only PI reused via idempotency — mint a card+iDEAL intent.
    const upgraded = await createOnce(
      `${input.paymentReference}${IDEAL_IDEMPOTENCY_SUFFIX}`,
    );
    return mapPaymentIntent(upgraded);
  } catch (error) {
    if (!isIdempotencyConflict(error)) throw error;
    const upgraded = await createOnce(
      `${input.paymentReference}${IDEAL_IDEMPOTENCY_SUFFIX}`,
    );
    return mapPaymentIntent(upgraded);
  }
};

export const handleFutureOrderV2StripeConfig = (
  _req: HttpRequest,
  res: HttpResponse,
  dependencies: FutureOrderV2StripePaymentDependencies = {},
) => {
  const publishableKey = readStripeTestPublishableKey(dependencies);
  if (!publishableKey) {
    return sendError(
      res,
      503,
      "STRIPE_PUBLISHABLE_KEY_REQUIRED",
      "The Stripe test publishable key is not configured.",
    );
  }
  return setNoStore(res).status(200).json({ publishableKey, testMode: true });
};

/**
 * Creates a Stripe test PaymentIntent for a persisted Future Order V2.
 * Amount comes only from the server-loaded order owned by the caller — never
 * from client `masterOrder` pricing.
 */
export const handleFutureOrderV2StripePayment = async (
  req: HttpRequest,
  res: HttpResponse,
  dependencies: FutureOrderV2StripePaymentDependencies = {},
) => {
  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST for this payment.");
  }

  const bearerToken = getBearerToken(req);
  if (!bearerToken) {
    return sendError(
      res,
      401,
      "AUTH_REQUIRED",
      "Firebase authentication is required.",
    );
  }

  const secret = readTestSecretKey(dependencies);
  if (!secret.startsWith("sk_test_")) {
    return sendError(
      res,
      503,
      "STRIPE_TEST_KEY_REQUIRED",
      "Stripe test payments are not configured.",
    );
  }

  const getServices =
    dependencies.getServices ||
    (getAdminServices as unknown as () => StripePaymentAdminServices);

  let services: StripePaymentAdminServices;
  let token: VerifiedStripePaymentToken;
  try {
    services = getServices();
    token = await services.auth.verifyIdToken(bearerToken);
  } catch {
    return sendError(
      res,
      401,
      "AUTH_REQUIRED",
      "Firebase authentication could not be verified.",
    );
  }

  const signInProvider = token.firebase?.sign_in_provider;
  if (typeof signInProvider !== "string" || !signInProvider) {
    return sendError(
      res,
      401,
      "AUTH_REQUIRED",
      "Firebase authentication could not be verified.",
    );
  }
  if (signInProvider === "anonymous") {
    return sendError(
      res,
      403,
      "ANONYMOUS_NOT_ALLOWED",
      "Sign in with your account to pay for this order.",
    );
  }
  if (typeof token.uid !== "string" || !token.uid.trim()) {
    return sendError(
      res,
      401,
      "AUTH_REQUIRED",
      "Firebase authentication could not be verified.",
    );
  }

  const createPaymentIntent =
    dependencies.createPaymentIntent ?? createFutureOrderV2StripeTestPaymentIntent;

  const body = isRecord(req.body) ? req.body : null;
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const paymentReference =
    typeof body?.paymentReference === "string" ? body.paymentReference : "";
  if (
    !SAFE_ORDER_ID.test(orderId) ||
    paymentReference !== `future-v2-payment-${orderId}`
  ) {
    return sendError(
      res,
      400,
      "INVALID_PAYMENT_REFERENCE",
      "This payment does not match the prepared order.",
    );
  }

  const readPersistedOrder =
    dependencies.readPersistedOrder ??
    ((id: string) => readPersistedOrderFromAdmin(services.db, id));

  let persistedRaw: unknown | null;
  try {
    persistedRaw = await readPersistedOrder(orderId);
  } catch {
    return sendError(
      res,
      503,
      "ORDER_LOOKUP_UNAVAILABLE",
      "The prepared order could not be loaded right now. Retry this same order.",
    );
  }

  const order = parsePersistedFutureOrderV2(persistedRaw, orderId);
  if (order.status !== "valid") {
    return sendError(
      res,
      404,
      "ORDER_NOT_FOUND",
      "This prepared order could not be found.",
    );
  }
  if (order.value.ownerUid !== token.uid) {
    return sendError(
      res,
      403,
      "OWNER_MISMATCH",
      "This order belongs to another account.",
    );
  }

  const pricing = order.value.masterOrder.cartItem.candidate.pricing;
  const amountCents = pricing.exactTotalCents;
  if (
    pricing.status !== "exact" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < MINIMUM_EUR_CENTS
  ) {
    return sendError(
      res,
      400,
      "INVALID_EXACT_TOTAL",
      "The reviewed total is not ready to charge.",
    );
  }

  const resolveAuthoritativeTotal =
    dependencies.resolveAuthoritativeTotalCents ??
    ((candidate: AuthoritativePriceCandidate) =>
      resolveAuthoritativeExactTotalCents(
        candidate,
        services.db as Parameters<typeof resolveAuthoritativeExactTotalCents>[1],
      ));
  let authoritativeTotalCents: number;
  try {
    authoritativeTotalCents = await resolveAuthoritativeTotal(
      order.value.masterOrder.cartItem.candidate,
    );
  } catch (error) {
    if (
      error instanceof FutureOrderV2PriceAuthorityError &&
      error.code === "PRICE_NOT_AUTHORITATIVE"
    ) {
      return sendError(
        res,
        409,
        "PRICE_NOT_AUTHORITATIVE",
        "The order total does not match the catalogue price.",
      );
    }
    return sendError(
      res,
      503,
      "PRICE_CATALOGUE_UNAVAILABLE",
      "The catalogue price could not be confirmed. Retry this order.",
    );
  }
  if (authoritativeTotalCents !== amountCents) {
    return sendError(
      res,
      409,
      "PRICE_NOT_AUTHORITATIVE",
      "The order total does not match the catalogue price.",
    );
  }

  try {
    const paymentIntent = await createPaymentIntent({
      amountCents: authoritativeTotalCents,
      orderId,
      paymentReference,
    });
    if (!paymentIntent.id.startsWith("pi_") || !paymentIntent.clientSecret) {
      return sendError(
        res,
        502,
        "STRIPE_PAYMENT_INTENT_INCOMPLETE",
        "Stripe did not return a payment that can be confirmed.",
      );
    }
    return setNoStore(res).status(200).json({
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.clientSecret,
      paymentMethodTypes:
        paymentIntent.paymentMethodTypes ?? [...FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    console.warn("Future order V2 Stripe payment could not be created:", message);
    return sendError(
      res,
      502,
      "STRIPE_PAYMENT_INTENT_FAILED",
      "Stripe could not start this payment. Retry this same order.",
    );
  }
};
