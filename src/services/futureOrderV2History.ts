import type { User } from "firebase/auth";
import { auth } from "./firebase";

export const FUTURE_ORDER_V2_HISTORY_ENDPOINT =
  "/api/orders/lookup-future-order-v2-history" as const;

export type FutureOrderV2HistorySafetyStatus =
  | "safe-to-delete"
  | "retain"
  | "unknown";

export interface FutureOrderV2HistoryClientIdentity {
  readonly isAnonymous: boolean;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

interface HistoryResponse {
  readonly ok: boolean;
  readonly headers: Pick<Headers, "get">;
  json(): Promise<unknown>;
}

export const createFutureOrderV2HistoryClient = ({
  getCurrentUser,
  fetch,
}: {
  getCurrentUser(): FutureOrderV2HistoryClientIdentity | null;
  fetch(input: string, init: RequestInit): Promise<HistoryResponse>;
}) => ({
  async getSafetyStatus(uploadedSourceRef: string): Promise<FutureOrderV2HistorySafetyStatus> {
    const identity = getCurrentUser();
    if (!identity || identity.isAnonymous) return "unknown";
    try {
      const token = await identity.getIdToken(true);
      const response = await fetch(FUTURE_ORDER_V2_HISTORY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uploadedSourceRef }),
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
        return "unknown";
      }
      const payload = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 1) {
        return "unknown";
      }
      const status = (payload as { status?: unknown }).status;
      return status === "not_referenced"
        ? "safe-to-delete"
        : status === "referenced"
          ? "retain"
          : status === "unknown"
            ? "unknown"
            : "unknown";
    } catch {
      return "unknown";
    }
  },
});

const futureOrderV2HistoryClient = createFutureOrderV2HistoryClient({
  getCurrentUser: () => auth.currentUser as Pick<User, "isAnonymous" | "getIdToken"> | null,
  fetch: (input, init) => fetch(input, init),
});

export const getFutureOrderV2HistorySafetyStatus =
  futureOrderV2HistoryClient.getSafetyStatus;
