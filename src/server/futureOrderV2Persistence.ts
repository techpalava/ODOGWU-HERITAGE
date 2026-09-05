import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  FUTURE_ORDER_V2_COLLECTION,
  createPersistedFutureOrderV2,
  hasSameFutureOrderV2ImmutableBusinessValue,
  parsePersistedFutureOrderV2,
  type FutureOrderV2PersistenceAdapter,
  type FutureOrderV2PersistenceRequest,
  type PersistFutureOrderV2Result,
  type PersistedFutureOrderV2,
} from "../utils/futureOrderV2PersistenceContract.js";

export type FutureOrderV2ServerErrorCode =
  | "AUTH_REQUIRED"
  | "ANONYMOUS_NOT_ALLOWED"
  | "OWNER_MISMATCH"
  | "ORDER_ID_UNAVAILABLE";

export class FutureOrderV2ServerError extends Error {
  readonly code: FutureOrderV2ServerErrorCode;

  constructor(code: FutureOrderV2ServerErrorCode, message: string) {
    super(message);
    this.name = "FutureOrderV2ServerError";
    this.code = code;
  }
}

export interface VerifiedFutureOrderV2Identity {
  readonly uid: string;
  readonly isAnonymous: boolean;
}

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim() === value;

const getExistingOwnerUid = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ownerUid = (value as Record<string, unknown>).ownerUid;
  return hasText(ownerUid) ? ownerUid : null;
};

export const createAdminFutureOrderV2PersistenceAdapter = (
  db: Firestore,
): FutureOrderV2PersistenceAdapter => ({
  runTransaction: (operation) =>
    db.runTransaction(async (adminTransaction) =>
      operation({
        async get(orderId) {
          const snapshot = await adminTransaction.get(
            db.collection(FUTURE_ORDER_V2_COLLECTION).doc(orderId),
          );
          return snapshot.exists ? snapshot.data() : null;
        },
        create(orderId, value) {
          adminTransaction.create(
            db.collection(FUTURE_ORDER_V2_COLLECTION).doc(orderId),
            {
              ...value,
              persistedAt: Timestamp.fromDate(new Date(value.persistedAt)),
            },
          );
        },
      }),
    ),
});

export const persistFutureOrderV2ForVerifiedIdentity = async ({
  identity,
  request,
  adapter,
  now = () => new Date(),
}: {
  identity: VerifiedFutureOrderV2Identity;
  request: FutureOrderV2PersistenceRequest;
  adapter: FutureOrderV2PersistenceAdapter;
  now?: () => Date;
}): Promise<PersistFutureOrderV2Result> => {
  if (!hasText(identity.uid)) {
    throw new FutureOrderV2ServerError(
      "AUTH_REQUIRED",
      "Firebase authentication is required.",
    );
  }
  if (identity.isAnonymous) {
    throw new FutureOrderV2ServerError(
      "ANONYMOUS_NOT_ALLOWED",
      "Anonymous accounts cannot persist historical orders.",
    );
  }
  if (request.customerOwnerUid !== identity.uid) {
    throw new FutureOrderV2ServerError(
      "OWNER_MISMATCH",
      "The authenticated owner does not match this order request.",
    );
  }

  const proposed = createPersistedFutureOrderV2({
    masterOrder: request.masterOrder,
    owner: { uid: identity.uid, isAnonymous: false },
    customerOwnerUid: identity.uid,
    persistedAt: now().toISOString(),
  });
  if (proposed.status !== "valid") return proposed;

  return adapter.runTransaction(async (transaction) => {
    const existingValue = await transaction.get(proposed.value.orderId);
    if (existingValue === null) {
      transaction.create(proposed.value.orderId, proposed.value);
      return { status: "created" as const, value: proposed.value };
    }

    const existingOwnerUid = getExistingOwnerUid(existingValue);
    if (!existingOwnerUid || existingOwnerUid !== identity.uid) {
      throw new FutureOrderV2ServerError(
        "ORDER_ID_UNAVAILABLE",
        "The requested order ID is unavailable.",
      );
    }

    const existing = parsePersistedFutureOrderV2(
      existingValue,
      proposed.value.orderId,
    );
    if (existing.status !== "valid") {
      return {
        status: "conflict" as const,
        code: "EXISTING_ORDER_V2_INVALID" as const,
      };
    }
    if (
      hasSameFutureOrderV2ImmutableBusinessValue(
        existing.value,
        proposed.value,
      )
    ) {
      return {
        status: "already_persisted" as const,
        value: existing.value,
      };
    }
    return {
      status: "conflict" as const,
      code: "ORDER_ID_PAYLOAD_CONFLICT" as const,
    };
  });
};

export const isPersistedFutureOrderV2 = (
  value: unknown,
): value is PersistedFutureOrderV2 =>
  parsePersistedFutureOrderV2(value).status === "valid";
