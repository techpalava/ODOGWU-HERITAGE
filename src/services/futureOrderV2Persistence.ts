import type { User } from "firebase/auth";
import {
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import type { FutureShippingCustomerInformationV1 } from "../types";
import {
  parseFutureOrderMasterOrderV2,
  type FutureOrderMasterOrderV2,
} from "../utils/futureOrderV2Storage";
import { auth, db } from "./firebase";

export const FUTURE_ORDER_V2_RECORD_TYPE = "future_order_v2" as const;
export const FUTURE_ORDER_V2_COLLECTION = "orders" as const;

export interface PersistedFutureOrderCustomerV2
  extends FutureShippingCustomerInformationV1 {
  readonly ownerUid: string;
}

export interface PersistedFutureOrderV2 {
  readonly schemaVersion: 2;
  readonly recordType: typeof FUTURE_ORDER_V2_RECORD_TYPE;
  readonly orderId: string;
  readonly ownerUid: string;
  readonly customer: PersistedFutureOrderCustomerV2;
  readonly masterOrder: FutureOrderMasterOrderV2;
  readonly persistedAt: string;
}

export type PersistedFutureOrderV2ParseResult =
  | { readonly status: "valid"; readonly value: PersistedFutureOrderV2 }
  | { readonly status: "invalid"; readonly code: string; readonly message: string };

export type PersistFutureOrderV2Result =
  | { readonly status: "created"; readonly value: PersistedFutureOrderV2 }
  | { readonly status: "already_persisted"; readonly value: PersistedFutureOrderV2 }
  | {
      readonly status: "conflict";
      readonly code: "ORDER_ID_PAYLOAD_CONFLICT" | "EXISTING_ORDER_V2_INVALID";
    }
  | { readonly status: "invalid"; readonly code: string; readonly message: string };

export interface FutureOrderV2PersistenceTransaction {
  get(orderId: string): Promise<unknown | null>;
  create(orderId: string, value: PersistedFutureOrderV2): void;
}

export interface FutureOrderV2PersistenceAdapter {
  runTransaction<T>(
    operation: (transaction: FutureOrderV2PersistenceTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface FutureOrderV2OwnerIdentity {
  readonly uid: string;
  readonly isAnonymous: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim() === value;

const hasSafeDocumentId = (value: unknown): value is string =>
  hasText(value) && value.length <= 512 && !value.includes("/");

const cloneJsonValue = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
};

const FORBIDDEN_PERSISTED_KEYS = new Set([
  "storagepath",
  "claimtoken",
  "ownertoken",
  "ownershipclaimtoken",
  "cleanuptoken",
  "authcredential",
  "idtoken",
  "accesstoken",
  "refreshtoken",
  "uploadoperationgeneration",
  "uploadoperationticket",
  "persistenceacknowledgement",
  "precanonicalcoordinatorstate",
  "objecturl",
  "file",
  "blob",
  "selectedstyleid",
  "designsource",
  "confirmeddesignsourcekey",
  "priceactivatedfabriccode",
]);

const hasForbiddenPersistedContent = (value: unknown): boolean => {
  // Browser object URLs are transient regardless of the field that holds them.
  if (typeof value === "string") return /^blob:/i.test(value.trim());
  if (Array.isArray(value)) return value.some(hasForbiddenPersistedContent);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      FORBIDDEN_PERSISTED_KEYS.has(key.toLowerCase()) ||
      hasForbiddenPersistedContent(nested),
  );
};

const normalizeTimestamp = (value: unknown): string | null => {
  let date: Date;
  if (typeof value === "string") {
    date = new Date(value);
  } else if (value instanceof Date) {
    date = value;
  } else if (isRecord(value) && typeof value.toDate === "function") {
    try {
      date = (value.toDate as () => Date)();
    } catch {
      return null;
    }
  } else {
    return null;
  }
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const invalid = (code: string, message: string): PersistedFutureOrderV2ParseResult => ({
  status: "invalid",
  code,
  message,
});

const CUSTOMER_KEYS = [
  "ownerUid",
  "fullName",
  "phone",
  "email",
  "deliveryAddress",
  "comment",
] as const;

export const parsePersistedFutureOrderV2 = (
  value: unknown,
  expectedDocumentId?: string,
): PersistedFutureOrderV2ParseResult => {
  if (!isRecord(value) || value.schemaVersion !== 2) {
    return invalid("UNSUPPORTED_PERSISTED_ORDER_V2_SCHEMA", "The order is not an explicit persisted V2 record.");
  }
  if (
    !exactKeys(value, [
      "schemaVersion",
      "recordType",
      "orderId",
      "ownerUid",
      "customer",
      "masterOrder",
      "persistedAt",
    ]) ||
    value.recordType !== FUTURE_ORDER_V2_RECORD_TYPE
  ) {
    return invalid("MALFORMED_PERSISTED_ORDER_V2", "The persisted V2 envelope is malformed.");
  }
  if (!hasSafeDocumentId(value.orderId) || !hasText(value.ownerUid)) {
    return invalid("INVALID_PERSISTED_ORDER_V2_IDENTITY", "The persisted V2 order identity is invalid.");
  }
  if (expectedDocumentId !== undefined && value.orderId !== expectedDocumentId) {
    return invalid("ORDER_DOCUMENT_ID_MISMATCH", "The order document ID does not match its V2 order ID.");
  }
  if (!isRecord(value.customer) || !exactKeys(value.customer, CUSTOMER_KEYS)) {
    return invalid("MALFORMED_PERSISTED_ORDER_V2_CUSTOMER", "The customer ownership projection is malformed.");
  }
  if (!hasText(value.customer.ownerUid) || value.customer.ownerUid !== value.ownerUid) {
    return invalid("ORDER_OWNER_MISMATCH", "The persisted V2 owner identities do not agree.");
  }
  if (hasForbiddenPersistedContent(value.masterOrder)) {
    return invalid("FORBIDDEN_PERSISTED_ORDER_V2_FIELD", "The order contains a private, transient, or scalar Design Style field.");
  }
  const masterOrder = parseFutureOrderMasterOrderV2(value.masterOrder);
  if (masterOrder.status !== "valid") {
    return invalid("MALFORMED_PERSISTED_MASTER_ORDER_V2", masterOrder.blockers[0]?.message || "The MasterOrder V2 snapshot is malformed.");
  }
  if (masterOrder.value.orderId !== value.orderId) {
    return invalid("NESTED_ORDER_ID_MISMATCH", "The persisted and nested V2 order IDs do not agree.");
  }
  if (stableSerialize(masterOrder.value) !== stableSerialize(value.masterOrder)) {
    return invalid("NON_STRICT_MASTER_ORDER_V2", "The MasterOrder V2 snapshot contains unsupported fields.");
  }
  const candidateCustomer = masterOrder.value.cartItem.candidate.shipping.state.customerInformation;
  const projectedCustomer = { ownerUid: value.ownerUid, ...cloneJsonValue(candidateCustomer) };
  if (stableSerialize(projectedCustomer) !== stableSerialize(value.customer)) {
    return invalid("CUSTOMER_PROJECTION_MISMATCH", "The persisted customer does not match the immutable Candidate V2 snapshot.");
  }
  const persistedAt = normalizeTimestamp(value.persistedAt);
  if (!persistedAt) {
    return invalid("INVALID_PERSISTED_ORDER_V2_TIMESTAMP", "The persisted V2 timestamp is invalid.");
  }
  return {
    status: "valid",
    value: {
      schemaVersion: 2,
      recordType: FUTURE_ORDER_V2_RECORD_TYPE,
      orderId: value.orderId,
      ownerUid: value.ownerUid,
      customer: cloneJsonValue(projectedCustomer),
      masterOrder: cloneJsonValue(masterOrder.value),
      persistedAt,
    },
  };
};

export const createPersistedFutureOrderV2 = ({
  masterOrder,
  owner,
  customerOwnerUid,
  persistedAt = new Date().toISOString(),
}: {
  masterOrder: FutureOrderMasterOrderV2;
  owner: FutureOrderV2OwnerIdentity;
  customerOwnerUid: string;
  persistedAt?: string;
}): PersistedFutureOrderV2ParseResult => {
  if (!hasText(owner.uid) || owner.isAnonymous) {
    return invalid("AUTHENTICATED_OWNER_REQUIRED", "A non-anonymous authenticated owner is required.");
  }
  if (!hasText(customerOwnerUid) || customerOwnerUid !== owner.uid) {
    return invalid("CUSTOMER_OWNER_MISMATCH", "The application customer must belong to the authenticated owner.");
  }
  if (hasForbiddenPersistedContent(masterOrder)) {
    return invalid("FORBIDDEN_PERSISTED_ORDER_V2_FIELD", "The order contains a private, transient, or scalar Design Style field.");
  }
  const parsedMasterOrder = parseFutureOrderMasterOrderV2(masterOrder);
  if (parsedMasterOrder.status !== "valid") {
    return invalid("MALFORMED_MASTER_ORDER_V2", parsedMasterOrder.blockers[0]?.message || "The MasterOrder V2 snapshot is malformed.");
  }
  const customer = parsedMasterOrder.value.cartItem.candidate.shipping.state.customerInformation;
  return parsePersistedFutureOrderV2({
    schemaVersion: 2,
    recordType: FUTURE_ORDER_V2_RECORD_TYPE,
    orderId: parsedMasterOrder.value.orderId,
    ownerUid: owner.uid,
    customer: { ownerUid: owner.uid, ...cloneJsonValue(customer) },
    masterOrder: cloneJsonValue(parsedMasterOrder.value),
    persistedAt,
  }, parsedMasterOrder.value.orderId);
};

const immutableBusinessValue = (value: PersistedFutureOrderV2): unknown => ({
  schemaVersion: value.schemaVersion,
  recordType: value.recordType,
  orderId: value.orderId,
  ownerUid: value.ownerUid,
  customer: value.customer,
  masterOrder: value.masterOrder,
});

export const createFutureOrderV2Repository = (
  adapter: FutureOrderV2PersistenceAdapter,
  now: () => Date = () => new Date(),
) => ({
  async persist({
    masterOrder,
    owner,
    customerOwnerUid,
  }: {
    masterOrder: FutureOrderMasterOrderV2;
    owner: FutureOrderV2OwnerIdentity;
    customerOwnerUid: string;
  }): Promise<PersistFutureOrderV2Result> {
    const proposed = createPersistedFutureOrderV2({
      masterOrder,
      owner,
      customerOwnerUid,
      persistedAt: now().toISOString(),
    });
    if (proposed.status !== "valid") return proposed;
    return adapter.runTransaction(async (transaction) => {
      const existingValue = await transaction.get(proposed.value.orderId);
      if (existingValue === null) {
        transaction.create(proposed.value.orderId, proposed.value);
        return { status: "created" as const, value: proposed.value };
      }
      const existing = parsePersistedFutureOrderV2(existingValue, proposed.value.orderId);
      if (existing.status !== "valid") {
        return { status: "conflict" as const, code: "EXISTING_ORDER_V2_INVALID" as const };
      }
      if (
        stableSerialize(immutableBusinessValue(existing.value)) ===
        stableSerialize(immutableBusinessValue(proposed.value))
      ) {
        return { status: "already_persisted" as const, value: existing.value };
      }
      return { status: "conflict" as const, code: "ORDER_ID_PAYLOAD_CONFLICT" as const };
    });
  },
});

export const createFirestoreFutureOrderV2PersistenceAdapter = (
  firestore: Firestore,
): FutureOrderV2PersistenceAdapter => ({
  runTransaction: (operation) =>
    runTransaction(firestore, async (firestoreTransaction) =>
      operation({
        async get(orderId) {
          const snapshot = await firestoreTransaction.get(
            doc(firestore, FUTURE_ORDER_V2_COLLECTION, orderId),
          );
          return snapshot.exists() ? snapshot.data() : null;
        },
        create(orderId, value) {
          const storedValue: DocumentData = {
            ...value,
            persistedAt: serverTimestamp(),
          };
          firestoreTransaction.set(
            doc(firestore, FUTURE_ORDER_V2_COLLECTION, orderId),
            storedValue,
          );
        },
      }),
    ),
});

const futureOrderV2Repository = createFutureOrderV2Repository(
  createFirestoreFutureOrderV2PersistenceAdapter(db),
);

export const persistFutureOrderV2 = ({
  masterOrder,
  customerOwnerUid,
}: {
  masterOrder: FutureOrderMasterOrderV2;
  customerOwnerUid: string;
}): Promise<PersistFutureOrderV2Result> => {
  const firebaseUser: Pick<User, "uid" | "isAnonymous"> | null = auth.currentUser;
  return futureOrderV2Repository.persist({
    masterOrder,
    owner: {
      uid: firebaseUser?.uid || "",
      isAnonymous: firebaseUser?.isAnonymous ?? true,
    },
    customerOwnerUid,
  });
};
