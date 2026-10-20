import Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import { attachCustomDetailCatalogDocumentId } from "../utils/catalogHelpers.js";
import { pendingPersonalizedKnownBaseIsAuthoritative } from "../utils/futureOrderPayableTotal.js";
import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  FUTURE_ORDER_V2_COLLECTION,
  parsePersistedFutureOrderV2,
} from "../utils/futureOrderV2PersistenceContract.js";
import {
  resolveFutureOrderV2StripeShipping,
  type FutureOrderV2StripeShipping,
} from "../utils/futureOrderV2StripeShipping.js";
import { resolveCommunityOrderClosure, readCommunityBatchRecord } from "./communityBatchOrderGate.js";
import { getCanonicalOrderIdentity } from "../utils/orderContextIdentity.js";
import {
  FUTURE_ORDER_V2_PERSONALIZED_PRICE_COLLECTION,
  isPersonalizedAdditionPaymentReference,
  listPersonalizedEvaluationSeeds,
  parseFutureOrderV2PersonalizedPrice,
  readPersonalizedStripeChargeCents,
} from "../utils/futureOrderV2PersonalizedPrice.js";
import {
  futureOrderV2StripePaymentMethodTypes,
  FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES,
} from "../utils/futureOrderV2StripeMethods.js";
import {
  buildFutureOrderV2PixReturnUrls,
  FUTURE_ORDER_V2_PIX_CHECKOUT_ACTION,
  FUTURE_ORDER_V2_PIX_COUNTRY,
  isFutureOrderV2PixAmount,
  sanitizeFutureOrderV2PixReturnPath,
} from "../utils/futureOrderV2Pix.js";
import {
  createFutureOrderV2PixCheckoutSession,
  type FutureOrderV2PixCheckoutInput,
  type FutureOrderV2PixCheckoutResult,
} from "./futureOrderV2PixCheckout.js";

export { FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES };

const MINIMUM_EUR_CENTS = 50;
const SAFE_ORDER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const IDEAL_IDEMPOTENCY_SUFFIX = ":ideal";
const KLARNA_IDEMPOTENCY_SUFFIX = ":klarna";

export interface FutureOrderV2StripePaymentIntentInput {
  readonly amountCents: number;
  readonly orderId: string;
  readonly paymentReference: string;
  /** Step 9 address for Klarna. Null when that address is not a Stripe country. The amount stays the persisted total. */
  readonly shipping: FutureOrderV2StripeShipping | null;
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
  /** Sidecar written when a tailor prices a personalized addition. */
  readPersonalizedPrice?: (orderId: string) => Promise<unknown | null>;
  /** Saved `custom_detail_catalog` rows. Empty uses the seed catalogue. */
  readCatalog?: () => Promise<unknown>;
  /** Live community batch document. Defaults to the `batches` collection. */
  readCommunityBatch?: (batchId: string) => Promise<unknown | null>;
  /** Hosted Pix Checkout Session. Defaults to the Stripe test client. */
  createPixCheckoutSession?: (
    input: FutureOrderV2PixCheckoutInput,
  ) => Promise<FutureOrderV2PixCheckoutResult>;
  now?: () => Date;
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

const firstHeader = (req: HttpRequest, name: string): string => {
  const value = req.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.split(",")[0].trim() : "";
};

/**
 * Return URLs point back at the host that served this request, so a client
 * cannot send Checkout to another site. Localhost may use http.
 */
export const readFutureOrderV2RequestOrigin = (req: HttpRequest): string | null => {
  const host = firstHeader(req, "x-forwarded-host") || firstHeader(req, "host");
  if (!/^[A-Za-z0-9.-]{1,253}(:\d{1,5})?$/.test(host)) return null;
  const forwardedProto = firstHeader(req, "x-forwarded-proto");
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = local && forwardedProto !== "https" ? "http" : "https";
  return `${proto}://${host}`;
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

const readCustomDetailCatalog = async (db: unknown): Promise<unknown[]> => {
  if (!db || typeof (db as { collection?: unknown }).collection !== "function") {
    return [];
  }
  const snapshot = await (db as Firestore).collection("custom_detail_catalog").get();
  return snapshot.docs.map((entry) =>
    attachCustomDetailCatalogDocumentId(entry.id, entry.data()),
  );
};

const readPersonalizedPriceFromAdmin = async (
  db: unknown,
  orderId: string,
): Promise<unknown | null> => {
  const snapshot = await (db as Firestore)
    .collection(FUTURE_ORDER_V2_PERSONALIZED_PRICE_COLLECTION)
    .doc(orderId)
    .get();
  return snapshot.exists ? snapshot.data() ?? null : null;
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

/**
 * Older PaymentIntents stay on their idempotency key until they include every
 * method this currency can charge. EUR reissues a card-only intent as :ideal
 * and leaves a card+iDEAL intent alone. Klarna is not an EUR method on this
 * account, so a missing Klarna type is not an upgrade. When the requested
 * list includes Klarna (USD), a missing Klarna type is still reissued as :klarna.
 */
export const nextFutureOrderV2StripeIdempotencyUpgrade = (
  types: readonly string[] | null | undefined,
  requestedTypes: readonly string[] = FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES,
): typeof IDEAL_IDEMPOTENCY_SUFFIX | typeof KLARNA_IDEMPOTENCY_SUFFIX | null => {
  const list = types ?? [];
  if (requestedTypes.includes("ideal") && !list.includes("ideal")) {
    return IDEAL_IDEMPOTENCY_SUFFIX;
  }
  if (requestedTypes.includes("klarna") && !list.includes("klarna")) {
    return KLARNA_IDEMPOTENCY_SUFFIX;
  }
  return null;
};

const stripeShipping = (
  shipping: FutureOrderV2StripeShipping,
): Stripe.PaymentIntentCreateParams.Shipping => ({
  name: shipping.name,
  ...(shipping.phone ? { phone: shipping.phone } : {}),
  address: {
    line1: shipping.address.line1,
    ...(shipping.address.line2 ? { line2: shipping.address.line2 } : {}),
    city: shipping.address.city,
    ...(shipping.address.state ? { state: shipping.address.state } : {}),
    postal_code: shipping.address.postalCode,
    country: shipping.address.country,
  },
});

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
  const currency = "eur";
  const paymentMethodTypes = [...futureOrderV2StripePaymentMethodTypes(currency)];
  const createParams: Stripe.PaymentIntentCreateParams = {
    amount: input.amountCents,
    currency,
    payment_method_types: paymentMethodTypes,
    metadata: {
      orderId: input.orderId,
      paymentReference: input.paymentReference,
      stage: "Design Studio V2",
    },
    ...(input.shipping ? { shipping: stripeShipping(input.shipping) } : {}),
  };

  const createOnce = (idempotencyKey: string) =>
    stripe.paymentIntents.create(createParams, { idempotencyKey });

  const createUpgraded = (
    suffix: typeof IDEAL_IDEMPOTENCY_SUFFIX | typeof KLARNA_IDEMPOTENCY_SUFFIX,
  ) => createOnce(`${input.paymentReference}${suffix}`);

  const withCurrentMethods = async (
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<Stripe.PaymentIntent> => {
    const suffix = nextFutureOrderV2StripeIdempotencyUpgrade(
      paymentIntent.payment_method_types,
      paymentMethodTypes,
    );
    if (!suffix) return paymentIntent;
    try {
      const upgraded = await createUpgraded(suffix);
      const next = nextFutureOrderV2StripeIdempotencyUpgrade(
        upgraded.payment_method_types,
        paymentMethodTypes,
      );
      if (!next) return upgraded;
      return createUpgraded(next);
    } catch (error) {
      if (!isIdempotencyConflict(error) || suffix === KLARNA_IDEMPOTENCY_SUFFIX) {
        throw error;
      }
      // The :ideal key is already in use. The next suffix is a new idempotency
      // key only. payment_method_types stay on the currency list, so EUR does
      // not gain Klarna.
      return createUpgraded(KLARNA_IDEMPOTENCY_SUFFIX);
    }
  };

  try {
    const paymentIntent = await createOnce(input.paymentReference);
    return mapPaymentIntent(await withCurrentMethods(paymentIntent));
  } catch (error) {
    if (!isIdempotencyConflict(error)) throw error;
    try {
      const ideal = await createUpgraded(IDEAL_IDEMPOTENCY_SUFFIX);
      return mapPaymentIntent(await withCurrentMethods(ideal));
    } catch (idealError) {
      if (!isIdempotencyConflict(idealError)) throw idealError;
      return mapPaymentIntent(await createUpgraded(KLARNA_IDEMPOTENCY_SUFFIX));
    }
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
  return setNoStore(res).status(200).json({
    publishableKey,
    testMode: true,
    paymentMethodTypes: [...FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES],
  });
};

const handleFutureOrderV2CartAdmission = async (
  res: HttpResponse,
  body: Record<string, unknown>,
  dependencies: FutureOrderV2StripePaymentDependencies,
) => {
  const identity = getCanonicalOrderIdentity(body.orderIdentity);
  if (!identity) {
    return sendError(
      res,
      400,
      "INVALID_ORDER_IDENTITY",
      "This order cannot be added to the cart.",
    );
  }
  const readBatch =
    dependencies.readCommunityBatch ??
    ((batchId: string) => {
      const getServices =
        dependencies.getServices ||
        (getAdminServices as unknown as () => StripePaymentAdminServices);
      return readCommunityBatchRecord(getServices().db, batchId);
    });
  const closure = await resolveCommunityOrderClosure({
    identity,
    readBatch,
    now: dependencies.now?.() ?? new Date(),
  });
  if (closure.status === "unavailable") {
    return sendError(
      res,
      503,
      "COMMUNITY_BATCH_UNAVAILABLE",
      "The community batch could not be confirmed.",
    );
  }
  if (closure.status === "closed") {
    return sendError(res, 409, closure.code, closure.message);
  }
  return setNoStore(res).status(200).json({ accepted: true });
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

  const body = isRecord(req.body) ? req.body : null;
  if (body?.action === "add-to-cart") {
    return handleFutureOrderV2CartAdmission(res, body, dependencies);
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

  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const paymentReference =
    typeof body?.paymentReference === "string" ? body.paymentReference : "";
  if (
    !SAFE_ORDER_ID.test(orderId) ||
    (paymentReference !== `future-v2-payment-${orderId}` &&
      !isPersonalizedAdditionPaymentReference(orderId, paymentReference))
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

  const candidate = order.value.masterOrder.cartItem.candidate;
  let personalizedPrice = null;
  if (
    listPersonalizedEvaluationSeeds(candidate).length > 0 ||
    isPersonalizedAdditionPaymentReference(orderId, paymentReference)
  ) {
    const readPersonalizedPrice =
      dependencies.readPersonalizedPrice ??
      ((id: string) => readPersonalizedPriceFromAdmin(services.db, id));
    try {
      personalizedPrice = parseFutureOrderV2PersonalizedPrice(
        await readPersonalizedPrice(orderId),
      );
    } catch {
      return sendError(
        res,
        503,
        "ORDER_LOOKUP_UNAVAILABLE",
        "The prepared order could not be loaded right now. Retry this same order.",
      );
    }
  }
  // Base payments charge the known base total. An addition reference charges
  // only the unpaid accepted difference. Pending and price-ready amounts are excluded.
  const amountCents = readPersonalizedStripeChargeCents({
    orderId,
    order: candidate,
    record: personalizedPrice,
    paymentReference,
  });
  if (amountCents === null || amountCents < MINIMUM_EUR_CENTS) {
    return sendError(
      res,
      400,
      "INVALID_EXACT_TOTAL",
      "The reviewed total is not ready to charge.",
    );
  }
  if (
    paymentReference === `future-v2-payment-${orderId}` &&
    candidate.customDetails.some(
      (detail) => detail.priceStatus === "evaluation_required",
    )
  ) {
    let catalog: unknown = [];
    try {
      catalog = dependencies.readCatalog
        ? await dependencies.readCatalog()
        : await readCustomDetailCatalog(services.db);
    } catch {
      return sendError(
        res,
        503,
        "ORDER_LOOKUP_UNAVAILABLE",
        "The prepared order could not be loaded right now. Retry this same order.",
      );
    }
    if (!pendingPersonalizedKnownBaseIsAuthoritative(candidate, catalog)) {
      return sendError(
        res,
        400,
        "INVALID_EXACT_TOTAL",
        "The reviewed total is not ready to charge.",
      );
    }
  }

  const communityClosure = await resolveCommunityOrderClosure({
    identity: candidate.orderIdentity,
    readBatch:
      dependencies.readCommunityBatch ??
      ((batchId: string) => readCommunityBatchRecord(services.db, batchId)),
    now: dependencies.now?.() ?? new Date(),
  });
  if (communityClosure.status === "unavailable") {
    return sendError(
      res,
      503,
      "COMMUNITY_BATCH_UNAVAILABLE",
      "The community batch could not be confirmed.",
    );
  }
  if (communityClosure.status === "closed") {
    return sendError(
      res,
      409,
      communityClosure.code,
      communityClosure.message,
    );
  }

  const stripeShipping = resolveFutureOrderV2StripeShipping(
    order.value.masterOrder.cartItem.candidate.shipping.state,
  );

  if (body?.action === FUTURE_ORDER_V2_PIX_CHECKOUT_ACTION) {
    return handleFutureOrderV2PixCheckout({
      req,
      res,
      body,
      dependencies,
      orderId,
      paymentReference,
      amountCents,
      shippingCountry: stripeShipping?.address.country ?? null,
      customerEmail: stripeShipping?.email ?? null,
    });
  }

  try {
    const paymentIntent = await createPaymentIntent({
      amountCents,
      orderId,
      paymentReference,
      shipping: stripeShipping,
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

/**
 * Pix runs on Stripe-hosted Checkout with Adaptive Pricing. Auth, owner, the
 * persisted EUR amount and the community batch gate were already checked by
 * the caller; this adds the Brazil delivery rule and the Pix amount range.
 */
const handleFutureOrderV2PixCheckout = async ({
  req,
  res,
  body,
  dependencies,
  orderId,
  paymentReference,
  amountCents,
  shippingCountry,
  customerEmail,
}: {
  req: HttpRequest;
  res: HttpResponse;
  body: Record<string, unknown>;
  dependencies: FutureOrderV2StripePaymentDependencies;
  orderId: string;
  paymentReference: string;
  amountCents: number;
  shippingCountry: string | null;
  customerEmail: string | null;
}) => {
  if (shippingCountry !== FUTURE_ORDER_V2_PIX_COUNTRY) {
    return sendError(
      res,
      400,
      "PIX_NOT_AVAILABLE",
      "Pix is available only for orders delivered to Brazil.",
    );
  }
  if (!isFutureOrderV2PixAmount(amountCents)) {
    return sendError(
      res,
      400,
      "PIX_AMOUNT_NOT_SUPPORTED",
      "This total is outside the Pix payment limit. Pay by card instead.",
    );
  }
  const origin = readFutureOrderV2RequestOrigin(req);
  if (!origin) {
    return sendError(
      res,
      400,
      "PIX_RETURN_UNAVAILABLE",
      "Pix could not start from this page. Retry this same order.",
    );
  }
  const { successUrl, cancelUrl } = buildFutureOrderV2PixReturnUrls({
    origin,
    returnPath: sanitizeFutureOrderV2PixReturnPath(body.returnPath),
    orderId,
  });
  const createPixCheckoutSession =
    dependencies.createPixCheckoutSession ?? createFutureOrderV2PixCheckoutSession;
  let result: FutureOrderV2PixCheckoutResult;
  try {
    result = await createPixCheckoutSession({
      amountCents,
      orderId,
      paymentReference,
      customerEmail,
      successUrl,
      cancelUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    console.warn("Future order V2 Pix checkout could not be created:", message);
    return sendError(
      res,
      502,
      "STRIPE_PIX_CHECKOUT_FAILED",
      "Stripe could not start this Pix payment. Retry this same order.",
    );
  }
  if (result.status === "pending") {
    return setNoStore(res).status(409).json({
      error:
        "A Pix payment for this order is already waiting for your bank. Pay that Pix code or wait for it to expire.",
      code: "PIX_PAYMENT_PENDING",
      checkoutSessionId: result.checkoutSessionId,
    });
  }
  if (result.status === "paid") {
    return setNoStore(res).status(200).json({
      status: "paid",
      checkoutSessionId: result.checkoutSessionId,
      paymentIntentId: result.paymentIntentId,
    });
  }
  if (!result.checkoutUrl.startsWith("https://")) {
    return sendError(
      res,
      502,
      "STRIPE_PIX_CHECKOUT_INCOMPLETE",
      "Stripe did not return a Pix checkout page.",
    );
  }
  return setNoStore(res).status(200).json({
    status: "open",
    checkoutSessionId: result.checkoutSessionId,
    checkoutUrl: result.checkoutUrl,
  });
};
