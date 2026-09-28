import Stripe from "stripe";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import { parseFutureOrderMasterOrderV2 } from "../utils/futureOrderV2Storage.js";

const MINIMUM_EUR_CENTS = 50;

export interface FutureOrderV2StripePaymentIntentInput {
  readonly amountCents: number;
  readonly orderId: string;
  readonly paymentReference: string;
}

export interface FutureOrderV2StripePaymentIntent {
  readonly id: string;
  readonly clientSecret: string | null;
}

export interface FutureOrderV2StripePaymentDependencies {
  readSecretKey?: () => string;
  createPaymentIntent?: (
    input: FutureOrderV2StripePaymentIntentInput,
  ) => Promise<FutureOrderV2StripePaymentIntent>;
  readPublishableKey?: () => string;
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

let stripeTestClient: Stripe | null = null;

/** One test PaymentIntent for the reviewed euro total. The payment reference is the idempotency key. */
export const createFutureOrderV2StripeTestPaymentIntent = async (
  input: FutureOrderV2StripePaymentIntentInput,
): Promise<FutureOrderV2StripePaymentIntent> => {
  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key.startsWith("sk_test_")) {
    throw new Error("Stripe test payments are not configured.");
  }
  if (!stripeTestClient) stripeTestClient = new Stripe(key);
  const paymentIntent = await stripeTestClient.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: "eur",
      payment_method_types: ["card"],
      metadata: {
        orderId: input.orderId,
        paymentReference: input.paymentReference,
        stage: "Design Studio V2",
      },
    },
    { idempotencyKey: input.paymentReference },
  );
  return {
    id: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
  };
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

export const handleFutureOrderV2StripePayment = async (
  req: HttpRequest,
  res: HttpResponse,
  dependencies: FutureOrderV2StripePaymentDependencies = {},
) => {
  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST for this payment.");
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
  const createPaymentIntent =
    dependencies.createPaymentIntent ?? createFutureOrderV2StripeTestPaymentIntent;

  const body = isRecord(req.body) ? req.body : null;
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const paymentReference =
    typeof body?.paymentReference === "string" ? body.paymentReference : "";
  if (!orderId || paymentReference !== `future-v2-payment-${orderId}`) {
    return sendError(
      res,
      400,
      "INVALID_PAYMENT_REFERENCE",
      "This payment does not match the prepared order.",
    );
  }

  const parsed = parseFutureOrderMasterOrderV2(body?.masterOrder);
  if (parsed.status !== "valid" || parsed.value.orderId !== orderId) {
    return sendError(
      res,
      400,
      "INVALID_PREPARED_ORDER",
      "The prepared order could not be verified for payment.",
    );
  }
  const pricing = parsed.value.cartItem.candidate.pricing;
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

  try {
    const paymentIntent = await createPaymentIntent({
      amountCents,
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
