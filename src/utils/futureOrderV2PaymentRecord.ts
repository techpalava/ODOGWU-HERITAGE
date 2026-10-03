import { PRICING_CURRENCY_SYMBOL } from "./money.js";

export const FUTURE_ORDER_V2_PAYMENT_COLLECTION = "future_order_v2_payments" as const;

export type FutureOrderV2PaymentProvider = "stripe" | "paypal";

/** Legacy Stripe-only payment record. */
export interface FutureOrderV2PaymentRecordV1 {
  readonly schemaVersion: 1;
  readonly orderId: string;
  readonly ownerUid: string;
  readonly paymentIntentId: string;
  readonly amountCents: number;
  readonly currency: "eur";
  readonly status: "succeeded";
  readonly testMode: true;
  readonly recordedAt: string;
}

/** Stripe or native PayPal payment the server has verified for one V2 order. */
export interface FutureOrderV2PaymentRecordV2 {
  readonly schemaVersion: 2;
  readonly provider: FutureOrderV2PaymentProvider;
  readonly providerTransactionId: string;
  readonly orderId: string;
  readonly ownerUid: string;
  readonly amountCents: number;
  readonly currency: "eur";
  readonly status: "succeeded";
  readonly testMode: true;
  readonly recordedAt: string;
}

export type FutureOrderV2PaymentRecord =
  | FutureOrderV2PaymentRecordV1
  | FutureOrderV2PaymentRecordV2;

export type RecordFutureOrderV2PaymentResponse =
  | { readonly status: "recorded" | "already_recorded"; readonly record: FutureOrderV2PaymentRecord }
  | { readonly error: string; readonly code: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeRecordedAt = (value: unknown): string | null => {
  let date: Date | null = null;
  if (typeof value === "string") {
    date = new Date(value);
  } else if (value instanceof Date) {
    date = value;
  } else if (isRecord(value) && typeof value.toDate === "function") {
    date = (value.toDate as () => Date)();
  }
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

const PAYPAL_ORDER_ID = /^[A-Z0-9]{10,50}$/i;

export const getFutureOrderV2PaymentProvider = (
  record: FutureOrderV2PaymentRecord,
): FutureOrderV2PaymentProvider =>
  record.schemaVersion === 1 ? "stripe" : record.provider;

export const getFutureOrderV2ProviderTransactionId = (
  record: FutureOrderV2PaymentRecord,
): string =>
  record.schemaVersion === 1
    ? record.paymentIntentId
    : record.providerTransactionId;

/** @deprecated Prefer getFutureOrderV2ProviderTransactionId. */
export const getFutureOrderV2PaymentIntentId = getFutureOrderV2ProviderTransactionId;

export const parseFutureOrderV2PaymentRecord = (
  value: unknown,
): FutureOrderV2PaymentRecord | null => {
  if (!isRecord(value)) return null;
  const recordedAt = normalizeRecordedAt(value.recordedAt);
  if (
    typeof value.orderId !== "string" ||
    !value.orderId ||
    typeof value.ownerUid !== "string" ||
    !value.ownerUid ||
    typeof value.amountCents !== "number" ||
    !Number.isSafeInteger(value.amountCents) ||
    value.amountCents <= 0 ||
    value.currency !== "eur" ||
    value.status !== "succeeded" ||
    value.testMode !== true ||
    !recordedAt
  ) {
    return null;
  }

  if (value.schemaVersion === 1) {
    if (
      typeof value.paymentIntentId !== "string" ||
      !value.paymentIntentId.startsWith("pi_")
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      orderId: value.orderId,
      ownerUid: value.ownerUid,
      paymentIntentId: value.paymentIntentId,
      amountCents: value.amountCents,
      currency: "eur",
      status: "succeeded",
      testMode: true,
      recordedAt,
    };
  }

  if (value.schemaVersion !== 2) return null;
  if (value.provider !== "stripe" && value.provider !== "paypal") return null;
  if (
    typeof value.providerTransactionId !== "string" ||
    !value.providerTransactionId
  ) {
    return null;
  }
  if (
    value.provider === "stripe" &&
    !value.providerTransactionId.startsWith("pi_")
  ) {
    return null;
  }
  if (
    value.provider === "paypal" &&
    !PAYPAL_ORDER_ID.test(value.providerTransactionId)
  ) {
    return null;
  }
  return {
    schemaVersion: 2,
    provider: value.provider,
    providerTransactionId: value.providerTransactionId,
    orderId: value.orderId,
    ownerUid: value.ownerUid,
    amountCents: value.amountCents,
    currency: "eur",
    status: "succeeded",
    testMode: true,
    recordedAt,
  };
};

export const formatFutureOrderV2PaidAmount = (amountCents: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${(amountCents / 100).toFixed(2)}`;

export const formatCustomerOrderDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
