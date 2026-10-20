import type { FutureOrderMasterOrderV2 } from "./futureOrderV2Storage";
import { parseFutureOrderMasterOrderV2 } from "./futureOrderV2Storage";
import type { FutureOrderV2PreparationAttempt } from "./futureOrderV2Preparation";
import type { Batch } from "../types";
import { getRetainedCommunityBatchEligibilityBlocker } from "./futureOrderCandidate";
import {
  isPersonalizedAdditionPaymentReference,
  readPersonalizedStripeChargeCents,
  type FutureOrderV2PersonalizedPriceRecord,
} from "./futureOrderV2PersonalizedPrice";
import {
  FUTURE_ORDER_V2_PIX_CHECKOUT_ACTION,
  FUTURE_ORDER_V2_PIX_PENDING_MESSAGE,
  isFutureOrderV2CheckoutSessionId,
  sanitizeFutureOrderV2PixReturnPath,
  stashFutureOrderV2PixPending,
  type FutureOrderV2PixVerification,
} from "./futureOrderV2Pix";

export type FutureOrderV2PaymentMethod = "card" | "ideal" | "klarna" | "pix";

export interface FutureOrderV2PaymentAttempt {
  readonly orderId: string;
  readonly cartItemId: string;
  /** A deterministic provider idempotency key for this immutable V2 order. */
  readonly paymentReference: string;
  readonly masterOrder: FutureOrderMasterOrderV2;
}

export type FutureOrderV2PaymentPreparationResult =
  | { readonly status: "valid"; readonly attempt: FutureOrderV2PaymentAttempt }
  | { readonly status: "invalid"; readonly message: string };

export type FutureOrderV2PaymentAuthorizationResult =
  | { readonly status: "authorized"; readonly providerTransactionReference: string }
  | { readonly status: "redirecting" }
  | { readonly status: "failed"; readonly message: string };

export type FutureOrderV2PaymentEligibilityResult =
  | { readonly status: "valid" }
  | { readonly status: "invalid"; readonly message: string };

export interface FutureOrderV2PaymentIdentity {
  readonly isAnonymous: boolean;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

type FutureOrderV2PaymentIdentityResolver = () => FutureOrderV2PaymentIdentity | null;

let paymentIdentityResolver: FutureOrderV2PaymentIdentityResolver | null = null;

/** Test hook — production resolves `auth.currentUser` via a lazy Firebase import. */
export const registerFutureOrderV2PaymentIdentityResolver = (
  resolver: FutureOrderV2PaymentIdentityResolver | null,
): void => {
  paymentIdentityResolver = resolver;
};

/**
 * Payment-intent failures are sometimes a plain-text crash page.
 * Parsing that page as JSON throws "Unexpected token 'A'". Return null instead.
 */
export const readFutureOrderV2JsonBody = async (
  response: Pick<Response, "text">,
): Promise<unknown> => {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return null;
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const resolvePaymentIdentity = async (): Promise<FutureOrderV2PaymentIdentity | null> => {
  if (paymentIdentityResolver) return paymentIdentityResolver();
  try {
    // Lazy import keeps static UI tests from initializing the Firebase client.
    const { auth } = await import("../services/firebase");
    return auth.currentUser as FutureOrderV2PaymentIdentity | null;
  } catch {
    return null;
  }
};

/**
 * This is deliberately evaluated at payment time. A prepared Community order
 * remains bound to its retained batch ID, never the current homepage batch.
 */
export const validatePreparedFutureOrderV2PaymentEligibility = ({
  prepared,
  liveBatches,
}: {
  prepared: FutureOrderV2PreparationAttempt;
  liveBatches: readonly Batch[];
}): FutureOrderV2PaymentEligibilityResult => {
  const identity = prepared.cartItem.candidate.orderIdentity;
  if (!identity) return { status: "valid" };
  const blocker = getRetainedCommunityBatchEligibilityBlocker(
    identity,
    liveBatches,
  );
  return blocker
    ? { status: "invalid", message: blocker.message }
    : { status: "valid" };
};

export type FutureOrderV2PaymentOutcome =
  | {
      readonly status: "authorized";
      readonly attempt: FutureOrderV2PaymentAttempt;
      readonly providerTransactionReference: string;
    }
  | {
      readonly status: "redirecting";
      readonly attempt: FutureOrderV2PaymentAttempt;
    }
  | {
      readonly status: "failed";
      readonly attempt: FutureOrderV2PaymentAttempt;
      readonly message: string;
    }
  | { readonly status: "invalid"; readonly message: string };

const samePreparedIdentity = (
  left: FutureOrderV2PaymentAttempt,
  right: FutureOrderV2PaymentAttempt,
): boolean =>
  left.orderId === right.orderId &&
  left.cartItemId === right.cartItemId &&
  left.paymentReference === right.paymentReference &&
  left.masterOrder === right.masterOrder;

export const createFutureOrderV2PaymentAttempt = ({
  prepared,
  existingAttempt = null,
}: {
  prepared: FutureOrderV2PreparationAttempt;
  existingAttempt?: FutureOrderV2PaymentAttempt | null;
}): FutureOrderV2PaymentPreparationResult => {
  const parsed = parseFutureOrderMasterOrderV2(prepared.masterOrder);
  if (
    parsed.status !== "valid" ||
    parsed.value.orderId !== prepared.orderId ||
    parsed.value.cartItem.cartItemId !== prepared.cartItemId
  ) {
    return {
      status: "invalid",
      message: "The prepared V2 order identity could not be verified for payment.",
    };
  }

  const attempt: FutureOrderV2PaymentAttempt = {
    orderId: prepared.orderId,
    cartItemId: prepared.cartItemId,
    paymentReference: `future-v2-payment-${prepared.orderId}`,
    // Preserve the immutable snapshot object that persistence already accepted.
    masterOrder: prepared.masterOrder,
  };
  if (existingAttempt && !samePreparedIdentity(existingAttempt, attempt)) {
    return {
      status: "invalid",
      message: "The existing payment attempt belongs to a different prepared order.",
    };
  }
  return { status: "valid", attempt: existingAttempt || attempt };
};

export const executeFutureOrderV2Payment = async ({
  prepared,
  existingAttempt = null,
  validateBeforeAuthorization = () => ({ status: "valid" as const }),
  authorize,
}: {
  prepared: FutureOrderV2PreparationAttempt;
  existingAttempt?: FutureOrderV2PaymentAttempt | null;
  validateBeforeAuthorization?: () => FutureOrderV2PaymentEligibilityResult;
  authorize(input: FutureOrderV2PaymentAttempt): Promise<FutureOrderV2PaymentAuthorizationResult>;
}): Promise<FutureOrderV2PaymentOutcome> => {
  const payment = createFutureOrderV2PaymentAttempt({
    prepared,
    existingAttempt,
  });
  if (payment.status !== "valid") return payment;
  const eligibility = validateBeforeAuthorization();
  if (eligibility.status !== "valid") return eligibility;

  try {
    const result = await authorize(payment.attempt);
    if (result.status === "authorized") {
      return {
        status: "authorized",
        attempt: payment.attempt,
        providerTransactionReference: result.providerTransactionReference,
      };
    }
    if (result.status === "redirecting") {
      return { status: "redirecting", attempt: payment.attempt };
    }
    return { status: "failed", attempt: payment.attempt, message: result.message };
  } catch {
    return {
      status: "failed",
      attempt: payment.attempt,
      message: "Payment authorization could not be confirmed. Retry this same order safely.",
    };
  }
};

export type FutureOrderV2PaymentConfirmation =
  | { readonly status: "confirmed"; readonly paymentIntentId: string }
  | { readonly status: "redirecting" }
  | { readonly status: "failed"; readonly message: string };

export interface FutureOrderV2PaymentConfirmContext {
  readonly paymentIntentId: string;
  readonly orderId: string;
  readonly paymentMethodTypes: readonly string[];
}

/** Confirms the PaymentIntent client secret with the selected Stripe method. */
export type FutureOrderV2PaymentConfirmer = (
  clientSecret: string,
  context: FutureOrderV2PaymentConfirmContext,
) => Promise<FutureOrderV2PaymentConfirmation>;

/** @deprecated Use FutureOrderV2PaymentConfirmer. Kept for existing call sites/tests. */
export type FutureOrderV2CardConfirmation = FutureOrderV2PaymentConfirmation;
/** @deprecated Use FutureOrderV2PaymentConfirmer. */
export type FutureOrderV2CardConfirmer = FutureOrderV2PaymentConfirmer;

let paymentConfirmer: FutureOrderV2PaymentConfirmer | null = null;

export const registerFutureOrderV2PaymentConfirmer = (
  confirmer: FutureOrderV2PaymentConfirmer | null,
): void => {
  paymentConfirmer = confirmer;
};

/** @deprecated Prefer registerFutureOrderV2PaymentConfirmer. */
export const registerFutureOrderV2CardConfirmer = (
  confirmer: FutureOrderV2PaymentConfirmer | null,
): void => {
  registerFutureOrderV2PaymentConfirmer(confirmer);
};

/** The Stage 10 method the customer picked. Pix skips the PaymentIntent and uses hosted Checkout. */
let paymentMethodReader: (() => FutureOrderV2PaymentMethod) | null = null;

export const registerFutureOrderV2PaymentMethodReader = (
  reader: (() => FutureOrderV2PaymentMethod) | null,
): void => {
  paymentMethodReader = reader;
};

type FutureOrderV2PixVerifier = (input: {
  orderId: string;
  checkoutSessionId: string;
}) => Promise<FutureOrderV2PixVerification>;

let pixVerifier: FutureOrderV2PixVerifier | null = null;
let pixNavigator: ((url: string) => void) | null = null;

/** Test hooks. Production verifies through record-payment and navigates with location.assign. */
export const registerFutureOrderV2PixHooks = (hooks: {
  verify?: FutureOrderV2PixVerifier | null;
  navigate?: ((url: string) => void) | null;
}): void => {
  if ("verify" in hooks) pixVerifier = hooks.verify ?? null;
  if ("navigate" in hooks) pixNavigator = hooks.navigate ?? null;
};

const verifyPixCheckout: FutureOrderV2PixVerifier = async (input) => {
  if (pixVerifier) return pixVerifier(input);
  const { verifyFutureOrderV2PixCheckout } = await import(
    "../services/futureOrderV2PaymentRecordClient"
  );
  return verifyFutureOrderV2PixCheckout(input);
};

const navigateToPixCheckout = (url: string): void => {
  if (pixNavigator) {
    pixNavigator(url);
    return;
  }
  if (typeof window !== "undefined") window.location.assign(url);
};

const payloadText = (payload: unknown, key: string): string =>
  payload &&
  typeof payload === "object" &&
  key in payload &&
  typeof (payload as Record<string, unknown>)[key] === "string"
    ? ((payload as Record<string, unknown>)[key] as string)
    : "";

/**
 * Asks the server for the hosted Pix Checkout Session. The server prices it
 * from the persisted EUR order and Adaptive Pricing shows BRL. A session that
 * is already paid is verified and recorded; one waiting on the bank is shown
 * as pending instead of opening a second Pix code.
 */
const startFutureOrderV2PixCheckout = async (
  attempt: FutureOrderV2PaymentAttempt,
  idToken: string,
): Promise<FutureOrderV2PaymentAuthorizationResult> => {
  const failed = "Stripe could not start this Pix payment. Retry this same order.";
  let response: Response;
  let payload: unknown;
  try {
    response = await fetch("/api/future-order-v2/payment-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        action: FUTURE_ORDER_V2_PIX_CHECKOUT_ACTION,
        orderId: attempt.orderId,
        paymentReference: attempt.paymentReference,
        returnPath: sanitizeFutureOrderV2PixReturnPath(
          typeof window !== "undefined" ? window.location.pathname : "/",
        ),
      }),
    });
    payload = await readFutureOrderV2JsonBody(response);
  } catch {
    return { status: "failed", message: failed };
  }
  const checkoutSessionId = payloadText(payload, "checkoutSessionId");
  if (payloadText(payload, "code") === "PIX_PAYMENT_PENDING") {
    if (isFutureOrderV2CheckoutSessionId(checkoutSessionId)) {
      stashFutureOrderV2PixPending({ orderId: attempt.orderId, checkoutSessionId });
    }
    return { status: "failed", message: FUTURE_ORDER_V2_PIX_PENDING_MESSAGE };
  }
  if (!response.ok || payload == null) {
    return { status: "failed", message: payloadText(payload, "error") || failed };
  }
  const status = payloadText(payload, "status");
  if (status === "open") {
    const checkoutUrl = payloadText(payload, "checkoutUrl");
    if (!checkoutUrl.startsWith("https://checkout.stripe.com/")) {
      return { status: "failed", message: "Stripe did not return a Pix checkout page." };
    }
    navigateToPixCheckout(checkoutUrl);
    return { status: "redirecting" };
  }
  if (status === "paid" && isFutureOrderV2CheckoutSessionId(checkoutSessionId)) {
    const verified = await verifyPixCheckout({ orderId: attempt.orderId, checkoutSessionId });
    if (verified.status === "recorded") {
      return { status: "authorized", providerTransactionReference: verified.paymentIntentId };
    }
    if (verified.status === "pending") {
      stashFutureOrderV2PixPending({ orderId: attempt.orderId, checkoutSessionId });
      return { status: "failed", message: FUTURE_ORDER_V2_PIX_PENDING_MESSAGE };
    }
    return { status: "failed", message: verified.message };
  }
  return { status: "failed", message: failed };
};

const MINIMUM_CHARGE_CENTS = 50;

export const readFutureOrderV2ReviewedTotalCents = (
  attempt: FutureOrderV2PaymentAttempt,
): number | null => {
  const pricing = attempt.masterOrder.cartItem.candidate.pricing;
  const amountCents = pricing.exactTotalCents;
  if (
    pricing.status !== "exact" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < MINIMUM_CHARGE_CENTS
  ) {
    return null;
  }
  return amountCents;
};

/**
 * Creates one Stripe test PaymentIntent for the reviewed euro total, then
 * confirms the selected method in the browser. The payment reference is the
 * idempotency key, so a retry of the same prepared order cannot create a
 * second charge. The server charges the persisted order total after auth.
 */
export const authorizeFutureOrderV2Payment = async (
  attempt: FutureOrderV2PaymentAttempt,
  personalizedPrice: FutureOrderV2PersonalizedPriceRecord | null = null,
): Promise<FutureOrderV2PaymentAuthorizationResult> => {
  const amountCents = readPersonalizedStripeChargeCents({
    orderId: attempt.orderId,
    order: attempt.masterOrder.cartItem.candidate,
    record: personalizedPrice,
    paymentReference: attempt.paymentReference,
  });
  const referenceAllowed =
    attempt.paymentReference === `future-v2-payment-${attempt.orderId}` ||
    isPersonalizedAdditionPaymentReference(attempt.orderId, attempt.paymentReference);
  if (amountCents === null || !referenceAllowed) {
    return {
      status: "failed",
      message: "The reviewed total is not ready to charge.",
    };
  }
  const confirmer = paymentConfirmer;
  if (!confirmer) {
    return {
      status: "failed",
      message: "Choose a payment method before authorizing this payment.",
    };
  }

  const identity = await resolvePaymentIdentity();
  if (!identity || identity.isAnonymous) {
    return {
      status: "failed",
      message: "Sign in to pay for this order.",
    };
  }
  let idToken: string;
  try {
    idToken = await identity.getIdToken(true);
  } catch {
    return {
      status: "failed",
      message: "Sign in again to pay for this order.",
    };
  }

  if (paymentMethodReader?.() === "pix") {
    return startFutureOrderV2PixCheckout(attempt, idToken);
  }

  let payload: unknown;
  try {
    const response = await fetch("/api/future-order-v2/payment-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        orderId: attempt.orderId,
        paymentReference: attempt.paymentReference,
        // Kept for client-side reviewed-total checks only. The server ignores
        // masterOrder pricing and charges the persisted order total.
        masterOrder: attempt.masterOrder,
      }),
    });
    payload = await readFutureOrderV2JsonBody(response);
    if (!response.ok || payload == null) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "Stripe could not start this payment. Retry this same order.";
      return { status: "failed", message };
    }
  } catch {
    return {
      status: "failed",
      message: "Stripe could not start this payment. Retry this same order.",
    };
  }

  const clientSecret =
    payload &&
    typeof payload === "object" &&
    "clientSecret" in payload &&
    typeof payload.clientSecret === "string"
      ? payload.clientSecret
      : "";
  const paymentIntentId =
    payload &&
    typeof payload === "object" &&
    "paymentIntentId" in payload &&
    typeof payload.paymentIntentId === "string"
      ? payload.paymentIntentId
      : "";
  const paymentMethodTypes =
    payload &&
    typeof payload === "object" &&
    "paymentMethodTypes" in payload &&
    Array.isArray(payload.paymentMethodTypes)
      ? payload.paymentMethodTypes.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
  if (!clientSecret || !paymentIntentId.startsWith("pi_")) {
    return {
      status: "failed",
      message: "Stripe did not return a payment that can be confirmed.",
    };
  }

  try {
    const confirmed = await confirmer(clientSecret, {
      paymentIntentId,
      orderId: attempt.orderId,
      paymentMethodTypes,
    });
    if (confirmed.status === "redirecting") {
      return { status: "redirecting" };
    }
    if (confirmed.status !== "confirmed") {
      return { status: "failed", message: confirmed.message };
    }
    if (confirmed.paymentIntentId !== paymentIntentId) {
      return {
        status: "failed",
        message: "The confirmed payment does not match this order.",
      };
    }
    return {
      status: "authorized",
      providerTransactionReference: confirmed.paymentIntentId,
    };
  } catch {
    return {
      status: "failed",
      message: "The payment could not be confirmed. Retry this same order safely.",
    };
  }
};
