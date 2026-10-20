import type { FutureShippingStateV1 } from "../types.js";
import { resolveFutureOrderV2StripeShipping } from "./futureOrderV2StripeShipping.js";

/**
 * Pix through Stripe-hosted Checkout with Adaptive Pricing.
 *
 * The order is still priced and verified in EUR. Adaptive Pricing converts the
 * hosted page to BRL for a customer in Brazil, which is what unlocks Pix. The
 * PaymentIntent behind the session stays in EUR at the order amount, so the
 * existing payment record checks (currency, amount, metadata, owner) apply.
 *
 * Pix is offered only when the order ships to Brazil. Pix can only be paid by
 * customers in Brazil, so a Brazilian delivery address is the clearest signal
 * we already store. Pickup orders resolve to the Eindhoven atelier (NL).
 */
export const FUTURE_ORDER_V2_PIX_COUNTRY = "BR";

/** Stripe's Pix floor is 0.50 BRL; the EUR floor of 50 cents is far above it. */
export const FUTURE_ORDER_V2_PIX_MINIMUM_EUR_CENTS = 50;

/**
 * Cross-border Pix is capped at the BRL equivalent of 3,000 USD per payment
 * (and per customer per day). 2,500 EUR stays under that at normal rates.
 */
export const FUTURE_ORDER_V2_PIX_MAXIMUM_EUR_CENTS = 250_000;

/** How long the Pix QR code stays payable after the customer submits Checkout. */
export const FUTURE_ORDER_V2_PIX_EXPIRES_AFTER_SECONDS = 3_600;

/** Stripe default: the customer pays Brazil's 3.5% IOF on top of the amount. */
export const FUTURE_ORDER_V2_PIX_AMOUNT_INCLUDES_IOF = "never" as const;

export const FUTURE_ORDER_V2_PIX_CHECKOUT_ACTION = "pix-checkout-session" as const;

export const FUTURE_ORDER_V2_PIX_RETURN_PARAM = "future_order_v2_pix_return";
export const FUTURE_ORDER_V2_PIX_RETURN_ORDER_PARAM = "future_order_v2_order_id";
export const FUTURE_ORDER_V2_PIX_RETURN_SESSION_PARAM = "session_id";
export const FUTURE_ORDER_V2_PIX_PENDING_STORAGE_KEY = "future-order-v2-pix-pending" as const;
/** Fired on window when a pending Pix is stashed, so the open Pay panel can show it. */
export const FUTURE_ORDER_V2_PIX_PENDING_EVENT = "future-order-v2-pix-pending" as const;

export const FUTURE_ORDER_V2_PIX_IOF_DISCLOSURE =
  "This is an international purchase and excludes a 3.5% IOF fee. By proceeding, you acknowledge and accept Ebanx's terms and conditions.";
export const FUTURE_ORDER_V2_PIX_EBANX_TERMS_URL =
  "https://www.ebanx.com/pt-br/legal/consumidores/brasil/termos-para-processar-pagamentos/";
export const FUTURE_ORDER_V2_PIX_PENDING_MESSAGE =
  "Your Pix payment is waiting for your bank. Scan or paste the Pix code in your bank app. This order updates as soon as Stripe confirms it.";

const CHECKOUT_SESSION_ID = /^cs_[A-Za-z0-9_]{1,255}$/;
const SAFE_ORDER_ID = /^[A-Za-z0-9_-]{1,128}$/;

export const isFutureOrderV2CheckoutSessionId = (value: unknown): value is string =>
  typeof value === "string" && CHECKOUT_SESSION_ID.test(value);

export const futureOrderV2PixShippingCountry = (
  shippingState: FutureShippingStateV1 | null | undefined,
): string | null => resolveFutureOrderV2StripeShipping(shippingState)?.address.country ?? null;

export const isFutureOrderV2PixAmount = (amountCents: number | null | undefined): boolean =>
  typeof amountCents === "number" &&
  Number.isSafeInteger(amountCents) &&
  amountCents >= FUTURE_ORDER_V2_PIX_MINIMUM_EUR_CENTS &&
  amountCents <= FUTURE_ORDER_V2_PIX_MAXIMUM_EUR_CENTS;

/** Shared show-Pix rule. The server applies it again before creating a session. */
export const isFutureOrderV2PixAvailable = ({
  shippingState,
  amountCents,
}: {
  shippingState: FutureShippingStateV1 | null | undefined;
  amountCents: number | null | undefined;
}): boolean =>
  futureOrderV2PixShippingCountry(shippingState) === FUTURE_ORDER_V2_PIX_COUNTRY &&
  isFutureOrderV2PixAmount(amountCents);

/** Relative app path only. Anything else falls back to "/". */
export const sanitizeFutureOrderV2PixReturnPath = (value: unknown): string => {
  if (typeof value !== "string") return "/";
  if (!/^\/[A-Za-z0-9/_-]{0,200}$/.test(value) || value.startsWith("//")) return "/";
  return value;
};

/**
 * Stripe replaces {CHECKOUT_SESSION_ID}; it must stay unencoded.
 * The origin is built by the server from the request host.
 */
export const buildFutureOrderV2PixReturnUrls = ({
  origin,
  returnPath,
  orderId,
}: {
  origin: string;
  returnPath: string;
  orderId: string;
}): { successUrl: string; cancelUrl: string } => {
  const base = `${origin}${sanitizeFutureOrderV2PixReturnPath(returnPath)}`;
  const order = encodeURIComponent(orderId);
  return {
    successUrl: `${base}?${FUTURE_ORDER_V2_PIX_RETURN_PARAM}=1&${FUTURE_ORDER_V2_PIX_RETURN_ORDER_PARAM}=${order}&${FUTURE_ORDER_V2_PIX_RETURN_SESSION_PARAM}={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}?${FUTURE_ORDER_V2_PIX_RETURN_PARAM}=cancel&${FUTURE_ORDER_V2_PIX_RETURN_ORDER_PARAM}=${order}`,
  };
};

export type FutureOrderV2PixReturnParams =
  | { readonly status: "returned"; readonly orderId: string; readonly checkoutSessionId: string }
  | { readonly status: "cancelled"; readonly orderId: string };

export const parseFutureOrderV2PixReturnSearch = (
  search: string,
): FutureOrderV2PixReturnParams | null => {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const flag = params.get(FUTURE_ORDER_V2_PIX_RETURN_PARAM);
  const orderId = (params.get(FUTURE_ORDER_V2_PIX_RETURN_ORDER_PARAM) ?? "").trim();
  if (!SAFE_ORDER_ID.test(orderId)) return null;
  if (flag === "cancel") return { status: "cancelled", orderId };
  if (flag !== "1") return null;
  const checkoutSessionId = (params.get(FUTURE_ORDER_V2_PIX_RETURN_SESSION_PARAM) ?? "").trim();
  if (!isFutureOrderV2CheckoutSessionId(checkoutSessionId)) return null;
  return { status: "returned", orderId, checkoutSessionId };
};

export const clearFutureOrderV2PixReturnSearchParams = (
  href: string = typeof window !== "undefined" ? window.location.href : "",
  replaceState: (url: string) => void = (url) => {
    if (typeof window !== "undefined") window.history.replaceState({}, "", url);
  },
): void => {
  if (!href) return;
  const url = new URL(href);
  url.searchParams.delete(FUTURE_ORDER_V2_PIX_RETURN_PARAM);
  url.searchParams.delete(FUTURE_ORDER_V2_PIX_RETURN_ORDER_PARAM);
  url.searchParams.delete(FUTURE_ORDER_V2_PIX_RETURN_SESSION_PARAM);
  replaceState(`${url.pathname}${url.search}${url.hash}`);
};

type PixStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const defaultStorage = (): PixStorage | null =>
  typeof sessionStorage !== "undefined" ? sessionStorage : null;

export type FutureOrderV2PixPending = {
  readonly orderId: string;
  readonly checkoutSessionId: string;
};

export const stashFutureOrderV2PixPending = (
  pending: FutureOrderV2PixPending,
  storage: PixStorage | null = defaultStorage(),
): void => {
  storage?.setItem(FUTURE_ORDER_V2_PIX_PENDING_STORAGE_KEY, JSON.stringify(pending));
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(FUTURE_ORDER_V2_PIX_PENDING_EVENT));
  }
};

export const readFutureOrderV2PixPending = (
  orderId: string,
  storage: PixStorage | null = defaultStorage(),
): FutureOrderV2PixPending | null => {
  try {
    const raw = storage?.getItem(FUTURE_ORDER_V2_PIX_PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (
      record.orderId !== orderId ||
      !isFutureOrderV2CheckoutSessionId(record.checkoutSessionId)
    ) {
      return null;
    }
    return { orderId, checkoutSessionId: record.checkoutSessionId };
  } catch {
    return null;
  }
};

export const clearFutureOrderV2PixPending = (
  storage: PixStorage | null = defaultStorage(),
): void => {
  storage?.removeItem(FUTURE_ORDER_V2_PIX_PENDING_STORAGE_KEY);
};

export type FutureOrderV2PixVerification =
  | { readonly status: "recorded"; readonly paymentIntentId: string }
  | { readonly status: "pending" }
  | { readonly status: "failed"; readonly message: string };

export type FutureOrderV2PixReturnResult =
  | { readonly status: "ignored" }
  | { readonly status: "cancelled"; readonly orderId: string; readonly message: string }
  | { readonly status: "recorded"; readonly orderId: string; readonly paymentIntentId: string }
  | {
      readonly status: "pending";
      readonly orderId: string;
      readonly checkoutSessionId: string;
      readonly message: string;
    }
  | { readonly status: "failed"; readonly orderId: string; readonly message: string };

/**
 * Handles the browser coming back from hosted Checkout. The URL only names the
 * session; the server retrieves it from Stripe and decides whether it is paid.
 */
export const resumeFutureOrderV2PixReturn = async ({
  search,
  verify,
  clearSearch = clearFutureOrderV2PixReturnSearchParams,
  stashPending = stashFutureOrderV2PixPending,
  clearPending = clearFutureOrderV2PixPending,
}: {
  search: string;
  verify: (input: {
    orderId: string;
    checkoutSessionId: string;
  }) => Promise<FutureOrderV2PixVerification>;
  clearSearch?: () => void;
  stashPending?: (pending: FutureOrderV2PixPending) => void;
  clearPending?: () => void;
}): Promise<FutureOrderV2PixReturnResult> => {
  const parsed = parseFutureOrderV2PixReturnSearch(search);
  if (!parsed) return { status: "ignored" };
  clearSearch();
  if (parsed.status === "cancelled") {
    return {
      status: "cancelled",
      orderId: parsed.orderId,
      message: "The Pix payment was cancelled. You have not been charged.",
    };
  }
  let verification: FutureOrderV2PixVerification;
  try {
    verification = await verify(parsed);
  } catch {
    verification = {
      status: "failed",
      message: "The Pix payment could not be verified yet. Check this order again in a moment.",
    };
  }
  if (verification.status === "recorded") {
    clearPending();
    return {
      status: "recorded",
      orderId: parsed.orderId,
      paymentIntentId: verification.paymentIntentId,
    };
  }
  if (verification.status === "pending") {
    stashPending(parsed);
    return {
      status: "pending",
      orderId: parsed.orderId,
      checkoutSessionId: parsed.checkoutSessionId,
      message: FUTURE_ORDER_V2_PIX_PENDING_MESSAGE,
    };
  }
  return { status: "failed", orderId: parsed.orderId, message: verification.message };
};
