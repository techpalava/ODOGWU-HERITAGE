import type { User } from "firebase/auth";
import { auth } from "./firebase.js";
import {
  getFutureOrderV2ProviderTransactionId,
  parseFutureOrderV2PaymentRecord,
  type FutureOrderV2PaymentRecord,
} from "../utils/futureOrderV2PaymentRecord.js";
import type { FutureOrderV2PixVerification } from "../utils/futureOrderV2Pix.js";

export const FUTURE_ORDER_V2_RECORD_PAYMENT_ENDPOINT =
  "/api/future-order-v2/record-payment" as const;

export interface FutureOrderV2PaymentRecordClientIdentity {
  readonly isAnonymous: boolean;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

interface RecordResponse {
  readonly ok: boolean;
  json(): Promise<unknown>;
}

export type FutureOrderV2PaymentRecordResult =
  | { readonly status: "recorded"; readonly record: FutureOrderV2PaymentRecord }
  | { readonly status: "failed"; readonly message: string };

const SAVE_FAILED_MESSAGE =
  "Payment received, but saving it to your order failed. Retry saving; you will not be charged again.";

export const createFutureOrderV2PaymentRecordClient = ({
  getCurrentUser,
  fetch,
}: {
  getCurrentUser(): FutureOrderV2PaymentRecordClientIdentity | null;
  fetch(input: string, init: RequestInit): Promise<RecordResponse>;
}) => ({
  async record({
    orderId,
    paymentIntentId,
  }: {
    orderId: string;
    paymentIntentId: string;
  }): Promise<FutureOrderV2PaymentRecordResult> {
    const identity = getCurrentUser();
    if (!identity || identity.isAnonymous) {
      return {
        status: "failed",
        message: "Sign in again to save this payment to your order.",
      };
    }
    try {
      const token = await identity.getIdToken(true);
      const response = await fetch(FUTURE_ORDER_V2_RECORD_PAYMENT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId, paymentIntentId }),
      });
      const payload: unknown = await response.json();
      const record =
        response.ok && payload && typeof payload === "object" && "record" in payload
          ? parseFutureOrderV2PaymentRecord(payload.record)
          : null;
      if (
        record &&
        record.orderId === orderId &&
        getFutureOrderV2ProviderTransactionId(record) === paymentIntentId
      ) {
        return { status: "recorded", record };
      }
      return { status: "failed", message: SAVE_FAILED_MESSAGE };
    } catch {
      return { status: "failed", message: SAVE_FAILED_MESSAGE };
    }
  },
});

const PIX_VERIFY_FAILED_MESSAGE =
  "The Pix payment could not be verified yet. Check this order again in a moment.";

/**
 * Asks record-payment to read a hosted Pix Checkout Session from Stripe. The
 * server records the order only when its PaymentIntent has succeeded.
 */
export const createFutureOrderV2PixVerifier = ({
  getCurrentUser,
  waitForAuth = async () => undefined,
  fetch,
}: {
  getCurrentUser(): FutureOrderV2PaymentRecordClientIdentity | null;
  waitForAuth?: () => Promise<void>;
  fetch(input: string, init: RequestInit): Promise<RecordResponse & { status?: number }>;
}) =>
  async ({
    orderId,
    checkoutSessionId,
  }: {
    orderId: string;
    checkoutSessionId: string;
  }): Promise<FutureOrderV2PixVerification> => {
    try {
      await waitForAuth();
    } catch {
      // Fall through; a missing user is reported below.
    }
    const identity = getCurrentUser();
    if (!identity || identity.isAnonymous) {
      return { status: "failed", message: "Sign in again to check this Pix payment." };
    }
    try {
      const token = await identity.getIdToken(true);
      const response = await fetch(FUTURE_ORDER_V2_RECORD_PAYMENT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId, checkoutSessionId }),
      });
      const payload: unknown = await response.json();
      if (
        response.ok &&
        payload &&
        typeof payload === "object" &&
        "status" in payload &&
        payload.status === "pending"
      ) {
        return { status: "pending" };
      }
      const record =
        response.ok && payload && typeof payload === "object" && "record" in payload
          ? parseFutureOrderV2PaymentRecord(payload.record)
          : null;
      if (record && record.orderId === orderId) {
        return {
          status: "recorded",
          paymentIntentId: getFutureOrderV2ProviderTransactionId(record),
        };
      }
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : PIX_VERIFY_FAILED_MESSAGE;
      return { status: "failed", message };
    } catch {
      return { status: "failed", message: PIX_VERIFY_FAILED_MESSAGE };
    }
  };

export const verifyFutureOrderV2PixCheckout = createFutureOrderV2PixVerifier({
  getCurrentUser: () => auth.currentUser as Pick<User, "isAnonymous" | "getIdToken"> | null,
  waitForAuth: () => auth.authStateReady(),
  fetch: (input, init) => fetch(input, init),
});

const futureOrderV2PaymentRecordClient = createFutureOrderV2PaymentRecordClient({
  getCurrentUser: () => auth.currentUser as Pick<User, "isAnonymous" | "getIdToken"> | null,
  fetch: (input, init) => fetch(input, init),
});

export const recordFutureOrderV2Payment = futureOrderV2PaymentRecordClient.record;
