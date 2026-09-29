import { PRICING_CURRENCY_SYMBOL } from "./money.js";

export const FUTURE_ORDER_V2_PAYMENT_COLLECTION = "future_order_v2_payments" as const;

/** A Stripe test payment the server has verified for one persisted V2 order. */
export interface FutureOrderV2PaymentRecord {
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

export const parseFutureOrderV2PaymentRecord = (
  value: unknown,
): FutureOrderV2PaymentRecord | null => {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const recordedAt = normalizeRecordedAt(value.recordedAt);
  if (
    typeof value.orderId !== "string" ||
    !value.orderId ||
    typeof value.ownerUid !== "string" ||
    !value.ownerUid ||
    typeof value.paymentIntentId !== "string" ||
    !value.paymentIntentId.startsWith("pi_") ||
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
};

export const formatFutureOrderV2PaidAmount = (amountCents: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${(amountCents / 100).toFixed(2)}`;
