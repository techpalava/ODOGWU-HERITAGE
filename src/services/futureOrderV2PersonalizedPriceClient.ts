import type { User } from "firebase/auth";
import { auth } from "./firebase";
import {
  parseFutureOrderV2PersonalizedPrice,
  type FutureOrderV2PersonalizedPriceRecord,
} from "../utils/futureOrderV2PersonalizedPrice";

export const FUTURE_ORDER_V2_PERSONALIZED_PRICE_DECISION_ENDPOINT =
  "/api/future-order-v2/personalized-price-decision" as const;

const DECISION_FAILED_MESSAGE =
  "That decision could not be saved. You were not charged.";

export type PersonalizedPriceDecisionClientResult =
  | { readonly status: "updated"; readonly record: FutureOrderV2PersonalizedPriceRecord }
  | { readonly status: "failed"; readonly message: string };

interface DecisionIdentity {
  readonly isAnonymous: boolean;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

export const createFutureOrderV2PersonalizedPriceClient = ({
  getCurrentUser,
  fetch,
}: {
  getCurrentUser(): DecisionIdentity | null;
  fetch(input: string, init: RequestInit): Promise<Pick<Response, "ok" | "json">>;
}) => ({
  async decide({
    orderId,
    occurrenceKey,
    decision,
  }: {
    orderId: string;
    occurrenceKey: string;
    decision: "accepted" | "declined";
  }): Promise<PersonalizedPriceDecisionClientResult> {
    const identity = getCurrentUser();
    if (!identity || identity.isAnonymous) {
      return { status: "failed", message: "Sign in again to accept or decline this addition." };
    }
    try {
      const token = await identity.getIdToken(true);
      const response = await fetch(FUTURE_ORDER_V2_PERSONALIZED_PRICE_DECISION_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId, occurrenceKey, decision }),
      });
      const payload: unknown = await response.json();
      const record =
        response.ok &&
        payload &&
        typeof payload === "object" &&
        "charged" in payload &&
        payload.charged === false &&
        "record" in payload
          ? parseFutureOrderV2PersonalizedPrice(payload.record)
          : null;
      if (record && record.orderId === orderId) return { status: "updated", record };
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : DECISION_FAILED_MESSAGE;
      return { status: "failed", message };
    } catch {
      return { status: "failed", message: DECISION_FAILED_MESSAGE };
    }
  },
});

const futureOrderV2PersonalizedPriceClient = createFutureOrderV2PersonalizedPriceClient({
  getCurrentUser: () => auth.currentUser as Pick<User, "isAnonymous" | "getIdToken"> | null,
  fetch: (input, init) => fetch(input, init),
});

export const decideFutureOrderV2PersonalizedPrice =
  futureOrderV2PersonalizedPriceClient.decide;
