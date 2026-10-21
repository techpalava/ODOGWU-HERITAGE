import { createHash } from "node:crypto";
import Stripe from "stripe";
import {
  FUTURE_ORDER_V2_PIX_AMOUNT_INCLUDES_IOF,
  FUTURE_ORDER_V2_PIX_EXPIRES_AFTER_SECONDS,
} from "../utils/futureOrderV2Pix.js";

/**
 * Stripe-hosted Checkout for Pix. The session is priced in EUR from the
 * server-loaded order; Adaptive Pricing shows BRL to a customer in Brazil and
 * unlocks Pix there. payment_method_types is left unset on purpose: Adaptive
 * Pricing only unlocks local-currency methods such as Pix through dynamic
 * payment methods, and an explicit EUR list with "pix" is not a valid pair.
 * The Dashboard's payment method settings decide what the hosted page shows.
 */

export const PIX_IDEMPOTENCY_SUFFIX = ":pix";
const MAX_SESSION_ATTEMPTS = 5;

export interface FutureOrderV2PixCheckoutInput {
  readonly amountCents: number;
  readonly orderId: string;
  readonly paymentReference: string;
  readonly customerEmail: string | null;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

export type FutureOrderV2PixCheckoutResult =
  | { readonly status: "open"; readonly checkoutSessionId: string; readonly checkoutUrl: string }
  | { readonly status: "pending"; readonly checkoutSessionId: string }
  | {
      readonly status: "paid";
      readonly checkoutSessionId: string;
      readonly paymentIntentId: string;
    };

/** Only the fields the payment record path needs from a Checkout Session. */
export interface StripeCheckoutSessionSummary {
  readonly id: string;
  readonly status: string | null;
  readonly paymentStatus: string;
  readonly paymentIntentId: string | null;
  readonly paymentIntentStatus: string | null;
  readonly clientReferenceId: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

let stripeTestClient: Stripe | null = null;

const getStripeTestClient = (): Stripe => {
  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key.startsWith("sk_test_")) {
    throw new Error("Stripe test payments are not configured.");
  }
  if (!stripeTestClient) stripeTestClient = new Stripe(key);
  return stripeTestClient;
};

const shortHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 16);

export const buildFutureOrderV2PixCheckoutParams = (
  input: FutureOrderV2PixCheckoutInput,
): Stripe.Checkout.SessionCreateParams => {
  const metadata = {
    orderId: input.orderId,
    paymentReference: input.paymentReference,
    stage: "Design Studio V2",
    channel: "pix-checkout",
  };
  return {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: input.amountCents,
          product_data: { name: `Odogwu Heritage order ${input.orderId}` },
        },
      },
    ],
    adaptive_pricing: { enabled: true },
    payment_method_options: {
      pix: {
        expires_after_seconds: FUTURE_ORDER_V2_PIX_EXPIRES_AFTER_SECONDS,
        amount_includes_iof: FUTURE_ORDER_V2_PIX_AMOUNT_INCLUDES_IOF,
      },
    },
    client_reference_id: input.orderId,
    metadata,
    payment_intent_data: { metadata },
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
};

/**
 * The idempotency key starts with `${paymentReference}:pix` like the `:ideal`
 * and `:klarna` PaymentIntent keys. A short hash of the session parameters is
 * appended so a changed amount or return URL cannot hit Stripe's
 * "same key, different parameters" error.
 */
export const futureOrderV2PixIdempotencyKey = (
  input: FutureOrderV2PixCheckoutInput,
  previousSessionId: string | null = null,
): string => {
  const base = `${input.paymentReference}${PIX_IDEMPOTENCY_SUFFIX}:${shortHash(
    JSON.stringify(buildFutureOrderV2PixCheckoutParams(input)),
  )}`;
  return previousSessionId ? `${base}:r${shortHash(previousSessionId)}` : base;
};

const PENDING_PAYMENT_INTENT_STATUSES = new Set(["requires_action", "processing"]);

export type PixSessionDecision =
  | { readonly kind: "open"; readonly url: string }
  | { readonly kind: "pending" }
  | { readonly kind: "paid"; readonly paymentIntentId: string }
  | { readonly kind: "replace" };

/**
 * open → send the customer to it. complete+paid → record it. complete+unpaid
 * with a live Pix code → pending, never a second session. Expired sessions and
 * Pix codes that expired or failed → a new session may be created.
 */
export const decideFutureOrderV2PixSession = (
  session: Pick<StripeCheckoutSessionSummary, "status" | "paymentStatus" | "paymentIntentId" | "paymentIntentStatus"> & {
    readonly url: string | null;
  },
): PixSessionDecision => {
  if (session.status === "open") {
    return session.url ? { kind: "open", url: session.url } : { kind: "replace" };
  }
  if (session.status === "complete") {
    if (
      session.paymentIntentId &&
      (session.paymentStatus === "paid" || session.paymentIntentStatus === "succeeded")
    ) {
      return { kind: "paid", paymentIntentId: session.paymentIntentId };
    }
    if (session.paymentIntentStatus && PENDING_PAYMENT_INTENT_STATUSES.has(session.paymentIntentStatus)) {
      return { kind: "pending" };
    }
    return { kind: "replace" };
  }
  return { kind: "replace" };
};

const paymentIntentOf = (
  session: Stripe.Checkout.Session,
): { id: string | null; status: string | null } => {
  const value = session.payment_intent;
  if (!value) return { id: null, status: null };
  if (typeof value === "string") return { id: value, status: null };
  return { id: value.id, status: value.status };
};

const summarizeSession = (session: Stripe.Checkout.Session): StripeCheckoutSessionSummary => {
  const paymentIntent = paymentIntentOf(session);
  return {
    id: session.id,
    status: session.status,
    paymentStatus: session.payment_status,
    paymentIntentId: paymentIntent.id,
    paymentIntentStatus: paymentIntent.status,
    clientReferenceId: session.client_reference_id,
    metadata: session.metadata ?? {},
  };
};

export const retrieveFutureOrderV2PixCheckoutSession = async (
  checkoutSessionId: string,
): Promise<StripeCheckoutSessionSummary> =>
  summarizeSession(
    await getStripeTestClient().checkout.sessions.retrieve(checkoutSessionId, {
      expand: ["payment_intent"],
    }),
  );

/** Creates (or idempotently reuses) the hosted Pix Checkout Session for this order. */
export const createFutureOrderV2PixCheckoutSession = async (
  input: FutureOrderV2PixCheckoutInput,
): Promise<FutureOrderV2PixCheckoutResult> => {
  const stripe = getStripeTestClient();
  const params = buildFutureOrderV2PixCheckoutParams(input);
  let previousSessionId: string | null = null;
  for (let attempt = 0; attempt < MAX_SESSION_ATTEMPTS; attempt += 1) {
    const created = await stripe.checkout.sessions.create(params, {
      idempotencyKey: futureOrderV2PixIdempotencyKey(input, previousSessionId),
    });
    // An idempotent replay returns the original session as it was created.
    // Read it again so status and the PaymentIntent are current.
    const session = await stripe.checkout.sessions.retrieve(created.id, {
      expand: ["payment_intent"],
    });
    const summary = summarizeSession(session);
    const decision = decideFutureOrderV2PixSession({ ...summary, url: session.url });
    if (decision.kind === "open") {
      return { status: "open", checkoutSessionId: session.id, checkoutUrl: decision.url };
    }
    if (decision.kind === "pending") {
      return { status: "pending", checkoutSessionId: session.id };
    }
    if (decision.kind === "paid") {
      return {
        status: "paid",
        checkoutSessionId: session.id,
        paymentIntentId: decision.paymentIntentId,
      };
    }
    previousSessionId = session.id;
  }
  throw new Error("Stripe Checkout did not return a usable Pix session.");
};
