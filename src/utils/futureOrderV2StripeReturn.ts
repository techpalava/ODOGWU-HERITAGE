import type { FutureOrderV2PaymentRecordResult } from "../services/futureOrderV2PaymentRecordClient";
import type { FutureOrderV2PaymentRecord } from "./futureOrderV2PaymentRecord";

export const FUTURE_ORDER_V2_STRIPE_RETURN_PARAM = "future_order_v2_stripe_return";
export const FUTURE_ORDER_V2_STRIPE_RETURN_ORDER_PARAM = "future_order_v2_order_id";
export const FUTURE_ORDER_V2_STRIPE_RETURN_STORAGE_KEY =
  "future-order-v2-stripe-return" as const;
export const FUTURE_ORDER_V2_OPEN_ORDER_STORAGE_KEY =
  "future-order-v2-open-order-id" as const;

export type FutureOrderV2StripeReturnSurface = "design-studio" | "dashboard";

export type FutureOrderV2StripeReturnContext = {
  readonly orderId: string;
  readonly paymentReference: string;
  readonly surface: FutureOrderV2StripeReturnSurface;
};

export type FutureOrderV2StripeReturnParams = {
  readonly orderId: string;
  readonly paymentIntentId: string;
  readonly clientSecret: string;
  readonly redirectStatus: string;
};

export type FutureOrderV2StripeReturnResumeResult =
  | { readonly status: "ignored" }
  | {
      readonly status: "recorded";
      readonly orderId: string;
      readonly record: FutureOrderV2PaymentRecord;
    }
  | {
      readonly status: "record_failed";
      readonly orderId: string;
      readonly paymentIntentId: string;
      readonly message: string;
    }
  | {
      readonly status: "failed";
      readonly orderId: string | null;
      readonly message: string;
    };

const isBrowserStorage = (
  value: unknown,
): value is Pick<Storage, "getItem" | "setItem" | "removeItem"> =>
  Boolean(value) &&
  typeof value === "object" &&
  typeof (value as Storage).getItem === "function" &&
  typeof (value as Storage).setItem === "function" &&
  typeof (value as Storage).removeItem === "function";

export const buildFutureOrderV2StripeReturnUrl = (orderId: string): string => {
  const url = new URL(window.location.href);
  url.searchParams.set(FUTURE_ORDER_V2_STRIPE_RETURN_PARAM, "1");
  url.searchParams.set(FUTURE_ORDER_V2_STRIPE_RETURN_ORDER_PARAM, orderId);
  return url.toString();
};

export const stashFutureOrderV2StripeReturnContext = (
  context: FutureOrderV2StripeReturnContext,
  storage: Pick<Storage, "setItem"> | null = typeof sessionStorage !== "undefined"
    ? sessionStorage
    : null,
): void => {
  if (!isBrowserStorage(storage)) return;
  storage.setItem(FUTURE_ORDER_V2_STRIPE_RETURN_STORAGE_KEY, JSON.stringify(context));
};

export const readFutureOrderV2StripeReturnContext = (
  storage: Pick<Storage, "getItem"> | null = typeof sessionStorage !== "undefined"
    ? sessionStorage
    : null,
): FutureOrderV2StripeReturnContext | null => {
  if (!isBrowserStorage(storage)) return null;
  try {
    const raw = storage.getItem(FUTURE_ORDER_V2_STRIPE_RETURN_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const orderId =
      "orderId" in parsed && typeof parsed.orderId === "string" ? parsed.orderId : "";
    const paymentReference =
      "paymentReference" in parsed && typeof parsed.paymentReference === "string"
        ? parsed.paymentReference
        : "";
    const surface =
      "surface" in parsed &&
      (parsed.surface === "design-studio" || parsed.surface === "dashboard")
        ? parsed.surface
        : null;
    if (!orderId || paymentReference !== `future-v2-payment-${orderId}` || !surface) {
      return null;
    }
    return { orderId, paymentReference, surface };
  } catch {
    return null;
  }
};

export const clearFutureOrderV2StripeReturnContext = (
  storage: Pick<Storage, "removeItem"> | null = typeof sessionStorage !== "undefined"
    ? sessionStorage
    : null,
): void => {
  if (!isBrowserStorage(storage)) return;
  storage.removeItem(FUTURE_ORDER_V2_STRIPE_RETURN_STORAGE_KEY);
};

export const stashFutureOrderV2OpenOrderId = (
  orderId: string,
  storage: Pick<Storage, "setItem"> | null = typeof sessionStorage !== "undefined"
    ? sessionStorage
    : null,
): void => {
  if (!isBrowserStorage(storage) || !orderId) return;
  storage.setItem(FUTURE_ORDER_V2_OPEN_ORDER_STORAGE_KEY, orderId);
};

export const consumeFutureOrderV2OpenOrderId = (
  storage: Pick<Storage, "getItem" | "removeItem"> | null =
    typeof sessionStorage !== "undefined" ? sessionStorage : null,
): string | null => {
  if (!isBrowserStorage(storage)) return null;
  const orderId = storage.getItem(FUTURE_ORDER_V2_OPEN_ORDER_STORAGE_KEY);
  storage.removeItem(FUTURE_ORDER_V2_OPEN_ORDER_STORAGE_KEY);
  return orderId && orderId.trim() ? orderId.trim() : null;
};

export const parseFutureOrderV2StripeReturnSearch = (
  search: string,
): FutureOrderV2StripeReturnParams | null => {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  if (params.get(FUTURE_ORDER_V2_STRIPE_RETURN_PARAM) !== "1") return null;
  const orderId = (params.get(FUTURE_ORDER_V2_STRIPE_RETURN_ORDER_PARAM) ?? "").trim();
  const paymentIntentId = (params.get("payment_intent") ?? "").trim();
  const clientSecret = (params.get("payment_intent_client_secret") ?? "").trim();
  const redirectStatus = (params.get("redirect_status") ?? "").trim();
  if (!orderId || !paymentIntentId.startsWith("pi_") || !clientSecret) return null;
  return { orderId, paymentIntentId, clientSecret, redirectStatus };
};

export const clearFutureOrderV2StripeReturnSearchParams = (
  href: string = typeof window !== "undefined" ? window.location.href : "",
  replaceState: (url: string) => void = (url) => {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", url);
    }
  },
): void => {
  if (!href) return;
  const url = new URL(href);
  url.searchParams.delete(FUTURE_ORDER_V2_STRIPE_RETURN_PARAM);
  url.searchParams.delete(FUTURE_ORDER_V2_STRIPE_RETURN_ORDER_PARAM);
  url.searchParams.delete("payment_intent");
  url.searchParams.delete("payment_intent_client_secret");
  url.searchParams.delete("redirect_status");
  replaceState(`${url.pathname}${url.search}${url.hash}`);
};

export const resumeFutureOrderV2StripeReturn = async ({
  search,
  retrievePaymentIntent,
  record,
  readContext = readFutureOrderV2StripeReturnContext,
  clearContext = clearFutureOrderV2StripeReturnContext,
  clearSearch = clearFutureOrderV2StripeReturnSearchParams,
}: {
  search: string;
  retrievePaymentIntent: (clientSecret: string) => Promise<{
    id: string;
    status: string;
  } | null>;
  record: (input: {
    orderId: string;
    paymentIntentId: string;
  }) => Promise<FutureOrderV2PaymentRecordResult>;
  readContext?: () => FutureOrderV2StripeReturnContext | null;
  clearContext?: () => void;
  clearSearch?: () => void;
}): Promise<FutureOrderV2StripeReturnResumeResult> => {
  const parsed = parseFutureOrderV2StripeReturnSearch(search);
  if (!parsed) return { status: "ignored" };

  clearSearch();
  const context = readContext();
  clearContext();
  const orderId = context?.orderId || parsed.orderId;
  if (context && context.orderId !== parsed.orderId) {
    return {
      status: "failed",
      orderId: parsed.orderId,
      message: "This payment return does not match the prepared order.",
    };
  }

  if (parsed.redirectStatus && parsed.redirectStatus !== "succeeded") {
    return {
      status: "failed",
      orderId,
      message:
        parsed.redirectStatus === "failed"
          ? "The bank payment was not completed. Retry this same order."
          : "The bank payment was cancelled. You have not been charged.",
    };
  }

  let paymentIntent: { id: string; status: string } | null;
  try {
    paymentIntent = await retrievePaymentIntent(parsed.clientSecret);
  } catch {
    return {
      status: "failed",
      orderId,
      message: "The bank payment could not be verified. Retry this same order.",
    };
  }

  const paymentIntentId = paymentIntent?.id || "";
  if (
    !paymentIntent ||
    paymentIntentId !== parsed.paymentIntentId ||
    paymentIntent.status !== "succeeded"
  ) {
    return {
      status: "failed",
      orderId,
      message:
        paymentIntent?.status === "processing"
          ? "The bank payment is still processing. Retry this same order in a moment."
          : "The bank payment was not completed. Retry this same order.",
    };
  }

  const recorded = await record({ orderId, paymentIntentId });
  if (recorded.status === "recorded") {
    return { status: "recorded", orderId, record: recorded.record };
  }
  return {
    status: "record_failed",
    orderId,
    paymentIntentId,
    message: recorded.message,
  };
};
