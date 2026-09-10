import type { User } from "firebase/auth";
import type { FutureOrderMasterOrderV2 } from "../utils/futureOrderV2Storage.js";
import {
  parsePersistFutureOrderV2Result,
  type PersistFutureOrderV2Result,
} from "../utils/futureOrderV2PersistenceContract.js";
import { auth } from "./firebase";

export * from "../utils/futureOrderV2PersistenceContract.js";

export const FUTURE_ORDER_V2_PERSISTENCE_ENDPOINT =
  "/api/orders/persist-future-order-v2" as const;

export type FutureOrderV2PersistenceClientErrorCode =
  | "AUTH_REQUIRED"
  | "PERSISTENCE_UNAVAILABLE"
  | "INVALID_RESPONSE";

export class FutureOrderV2PersistenceClientError extends Error {
  readonly code: FutureOrderV2PersistenceClientErrorCode;

  constructor(code: FutureOrderV2PersistenceClientErrorCode, message: string) {
    super(message);
    this.name = "FutureOrderV2PersistenceClientError";
    this.code = code;
  }
}

export interface FutureOrderV2ClientIdentity {
  readonly uid: string;
  readonly isAnonymous: boolean;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

interface FutureOrderV2HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: Pick<Headers, "get">;
  json(): Promise<unknown>;
}

export interface FutureOrderV2PersistenceClientDependencies {
  getCurrentUser(): FutureOrderV2ClientIdentity | null;
  fetch(input: string, init: RequestInit): Promise<FutureOrderV2HttpResponse>;
}

const invalidResponse = (): FutureOrderV2PersistenceClientError =>
  new FutureOrderV2PersistenceClientError(
    "INVALID_RESPONSE",
    "The secure future order service returned an invalid response.",
  );

const readJsonResponse = async (
  response: FutureOrderV2HttpResponse,
): Promise<unknown> => {
  if (
    !response.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  ) {
    throw invalidResponse();
  }
  try {
    return await response.json();
  } catch {
    throw invalidResponse();
  }
};

const parseServerError = (
  value: unknown,
): { readonly code: string; readonly error: string } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    typeof record.code !== "string" ||
    record.code.trim() !== record.code ||
    record.code.length === 0 ||
    typeof record.error !== "string" ||
    record.error.trim() !== record.error ||
    record.error.length === 0
  ) {
    return null;
  }
  return { code: record.code, error: record.error };
};

export const createFutureOrderV2PersistenceClient = (
  dependencies: FutureOrderV2PersistenceClientDependencies,
) => ({
  async persist({
    masterOrder,
    customerOwnerUid,
  }: {
    masterOrder: FutureOrderMasterOrderV2;
    customerOwnerUid: string;
  }): Promise<PersistFutureOrderV2Result> {
    const identity = dependencies.getCurrentUser();
    if (!identity || identity.isAnonymous) {
      throw new FutureOrderV2PersistenceClientError(
        "AUTH_REQUIRED",
        "A non-anonymous Firebase login is required to persist this order.",
      );
    }

    let response: FutureOrderV2HttpResponse;
    try {
      const idToken = await identity.getIdToken(true);
      response = await dependencies.fetch(
        FUTURE_ORDER_V2_PERSISTENCE_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ masterOrder, customerOwnerUid }),
        },
      );
    } catch (error) {
      if (error instanceof FutureOrderV2PersistenceClientError) throw error;
      throw new FutureOrderV2PersistenceClientError(
        "PERSISTENCE_UNAVAILABLE",
        "The secure future order service is temporarily unavailable.",
      );
    }

    const payload = await readJsonResponse(response);
    const parsed = parsePersistFutureOrderV2Result(
      payload,
      masterOrder.orderId,
    );
    if (!parsed) {
      const serverError = parseServerError(payload);
      if (!serverError || response.ok) throw invalidResponse();
      if (response.status === 401 || response.status === 403) {
        throw new FutureOrderV2PersistenceClientError(
          "AUTH_REQUIRED",
          "A non-anonymous Firebase login is required to persist this order.",
        );
      }
      throw new FutureOrderV2PersistenceClientError(
        "PERSISTENCE_UNAVAILABLE",
        "The secure future order service is temporarily unavailable.",
      );
    }

    const expectedStatus =
      parsed.status === "created"
        ? 201
        : parsed.status === "already_persisted"
          ? 200
          : parsed.status === "conflict"
            ? 409
            : 400;
    if (
      response.status !== expectedStatus ||
      response.ok !== (expectedStatus < 400)
    ) {
      throw invalidResponse();
    }
    return parsed;
  },
});

const futureOrderV2PersistenceClient = createFutureOrderV2PersistenceClient({
  getCurrentUser: () =>
    auth.currentUser as Pick<
      User,
      "uid" | "isAnonymous" | "getIdToken"
    > | null,
  fetch: (input, init) => fetch(input, init),
});

export const persistFutureOrderV2 = futureOrderV2PersistenceClient.persist;
