import {
  parseFutureOrderV2PaymentRecord,
  type FutureOrderV2PaymentRecord,
} from "../utils/futureOrderV2PaymentRecord";
import type { FutureOrderMasterOrderV2 } from "../utils/futureOrderV2Storage";

export type FutureOrderV2PayPalCaptureResult =
  | { readonly status: "recorded"; readonly record: FutureOrderV2PaymentRecord }
  | { readonly status: "failed"; readonly message: string };

export const fetchFutureOrderV2PayPalConfig = async (): Promise<{
  clientId: string;
  currency: string;
  locale: string;
}> => {
  const response = await fetch("/api/future-order-v2/paypal");
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : "PayPal sandbox payments are not configured.",
    );
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !("clientId" in payload) ||
    typeof payload.clientId !== "string" ||
    !payload.clientId
  ) {
    throw new Error("PayPal sandbox payments are not configured.");
  }
  const currency =
    "currency" in payload && typeof payload.currency === "string"
      ? payload.currency
      : "EUR";
  const locale =
    "locale" in payload && typeof payload.locale === "string"
      ? payload.locale
      : "nl_NL";
  return { clientId: payload.clientId, currency, locale };
};

export const createFutureOrderV2PayPalOrder = async ({
  orderId,
  paymentReference,
  masterOrder,
}: {
  orderId: string;
  paymentReference: string;
  masterOrder: FutureOrderMasterOrderV2;
}): Promise<string> => {
  const response = await fetch("/api/future-order-v2/paypal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create-order",
      orderId,
      paymentReference,
      masterOrder,
    }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : "PayPal could not start this payment. Retry this same order.",
    );
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !("paypalOrderId" in payload) ||
    typeof payload.paypalOrderId !== "string"
  ) {
    throw new Error("PayPal could not start this payment. Retry this same order.");
  }
  return payload.paypalOrderId;
};

export const captureFutureOrderV2PayPalOrder = async ({
  orderId,
  paypalOrderId,
}: {
  orderId: string;
  paypalOrderId: string;
}): Promise<FutureOrderV2PayPalCaptureResult> => {
  // Lazy import keeps static UI tests from initializing the Firebase client.
  const { auth } = await import("./firebase");
  const user = auth.currentUser;
  if (!user) {
    return { status: "failed", message: "Sign in to complete this PayPal payment." };
  }
  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch {
    return {
      status: "failed",
      message: "Sign in again to complete this PayPal payment.",
    };
  }

  try {
    const response = await fetch("/api/future-order-v2/paypal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ action: "capture", orderId, paypalOrderId }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "PayPal could not complete this payment. Retry this same order.";
      return { status: "failed", message };
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      !("status" in payload) ||
      (payload.status !== "recorded" && payload.status !== "already_recorded") ||
      !("record" in payload)
    ) {
      return {
        status: "failed",
        message: "PayPal payment could not be saved. Retry this same order.",
      };
    }
    const record = parseFutureOrderV2PaymentRecord(payload.record);
    if (!record) {
      return {
        status: "failed",
        message: "PayPal payment could not be saved. Retry this same order.",
      };
    }
    return { status: "recorded", record };
  } catch {
    return {
      status: "failed",
      message: "PayPal could not complete this payment. Retry this same order.",
    };
  }
};
