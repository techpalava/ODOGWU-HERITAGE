import type { User } from "firebase/auth";
import { auth } from "./firebase";
import {
  parseFutureOrderV2PaymentRecord,
  type FutureOrderV2PaymentRecord,
} from "../utils/futureOrderV2PaymentRecord";

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
        record.paymentIntentId === paymentIntentId
      ) {
        return { status: "recorded", record };
      }
      return { status: "failed", message: SAVE_FAILED_MESSAGE };
    } catch {
      return { status: "failed", message: SAVE_FAILED_MESSAGE };
    }
  },
});

const futureOrderV2PaymentRecordClient = createFutureOrderV2PaymentRecordClient({
  getCurrentUser: () => auth.currentUser as Pick<User, "isAnonymous" | "getIdToken"> | null,
  fetch: (input, init) => fetch(input, init),
});

export const recordFutureOrderV2Payment = futureOrderV2PaymentRecordClient.record;
