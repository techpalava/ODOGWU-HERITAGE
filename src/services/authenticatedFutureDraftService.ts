import type { User } from "firebase/auth";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import type { Customer, GuestDesignDraft } from "../types";
import { AuthorizationEngine } from "../engine/AuthorizationEngine";
import { hasAuthoritativeFutureDraftMarker } from "../utils/designStudioDraftPersistence";
import { normalizeGuestDesignDraft } from "./guestOrderSessionService";
import { auth, db } from "./firebase";

export const AUTHENTICATED_FUTURE_DRAFT_COLLECTION =
  "futureDesignStudioDrafts";
export const AUTHENTICATED_FUTURE_DRAFT_SCHEMA_VERSION = 1 as const;

const MAX_DRAFT_JSON_BYTES = 800_000;
const FORBIDDEN_DRAFT_KEYS = new Set([
  "accessToken",
  "apiKey",
  "authToken",
  "authorization",
  "cardCvc",
  "cardCvv",
  "cardNumber",
  "clientSecret",
  "customToken",
  "futureOrderCandidate",
  "futureOrderCandidateV1",
  "idToken",
  "imageBase64",
  "paymentDetails",
  "paymentMethod",
  "orderCandidate",
  "providerPayload",
  "providerResponse",
  "rawImage",
  "refreshToken",
  "secret",
]);

type DateLike =
  | string
  | Date
  | { toDate(): Date };

export interface AuthenticatedFutureDraftRecordV1 {
  schemaVersion: 1;
  lifecycleStatus: "active" | "cleared";
  revision: number;
  createdAt: string;
  updatedAt: string;
  draft?: GuestDesignDraft;
}

export type FutureDraftApplicationCustomer = Pick<Customer, "name"> &
  Partial<Pick<Customer, "ownerUid" | "email" | "phone">>;

export type AuthenticatedFutureDraftIdentity =
  | { status: "resolving" }
  | { status: "guest" }
  | {
      status: "authenticated";
      ownerUid: string;
    }
  | {
      status: "blocked";
      reason:
        | "application_customer_without_firebase_user"
        | "firebase_user_without_application_customer"
        | "firebase_uid_mismatch"
        | "firebase_email_mismatch";
    };

export type AuthenticatedFutureDraftIntegrationStatus =
  | "resolving"
  | "ready"
  | "cleared"
  | "blocked"
  | "conflict"
  | "invalid";

export type AuthenticatedFutureDraftLoadResult =
  | { status: "absent"; record: null }
  | { status: "loaded"; record: AuthenticatedFutureDraftRecordV1 }
  | { status: "invalid"; record: null; reason: string }
  | { status: "blocked"; record: null; reason: string };

export type AuthenticatedFutureDraftWriteResult =
  | { status: "saved"; record: AuthenticatedFutureDraftRecordV1 }
  | {
      status: "conflict";
      record: null;
      currentRecord: AuthenticatedFutureDraftRecordV1 | null;
    }
  | { status: "invalid"; record: null; reason: string }
  | { status: "blocked"; record: null; reason: string };

export type AuthenticatedFutureDraftSyncResult =
  | {
      status:
        | "cloud_restored"
        | "equivalent"
        | "guest_transferred"
        | "cloud_cleared"
        | "empty";
      record: AuthenticatedFutureDraftRecordV1 | null;
      draft: GuestDesignDraft | null;
    }
  | {
      status: "conflict";
      record: AuthenticatedFutureDraftRecordV1;
      cloudDraft: GuestDesignDraft;
      guestDraft: GuestDesignDraft;
    }
  | {
      status: "invalid" | "blocked";
      record: null;
      draft: null;
      reason: string;
    };

export interface AuthenticatedFutureDraftPersistenceAdapter {
  load(ownerUid: string): Promise<unknown | null>;
  commit(input: {
    ownerUid: string;
    expectedRevision: number | null;
    lifecycleStatus: "active" | "cleared";
    draft?: GuestDesignDraft;
  }): Promise<
    | { status: "saved"; value: unknown }
    | { status: "conflict"; currentValue: unknown | null }
  >;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toIsoString = (value: unknown): string | null => {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (
    isRecord(value) &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate(): Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
};

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const inspectForbiddenDraftContent = (
  value: unknown,
  path = "draft",
): string | null => {
  if (typeof value === "string") {
    if (/^(?:data:image|blob:)/i.test(value)) return `${path}:embedded_image`;
    return null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const forbidden = inspectForbiddenDraftContent(value[index], `${path}[${index}]`);
      if (forbidden) return forbidden;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_DRAFT_KEYS.has(key)) return `${path}.${key}`;
    const forbidden = inspectForbiddenDraftContent(entry, `${path}.${key}`);
    if (forbidden) return forbidden;
  }
  return null;
};

export const normalizeAuthenticatedFutureDraft = (
  value: unknown,
): { draft: GuestDesignDraft | null; reason: string | null } => {
  if (!hasAuthoritativeFutureDraftMarker(value)) {
    return { draft: null, reason: "missing_authoritative_future_marker" };
  }
  const forbidden = inspectForbiddenDraftContent(value);
  if (forbidden) {
    return { draft: null, reason: `forbidden_sensitive_content:${forbidden}` };
  }
  try {
    const json = JSON.stringify(value);
    if (new TextEncoder().encode(json).byteLength > MAX_DRAFT_JSON_BYTES) {
      return { draft: null, reason: "future_draft_too_large" };
    }
    const normalized = normalizeGuestDesignDraft(
      JSON.parse(json) as GuestDesignDraft,
    );
    if (!hasAuthoritativeFutureDraftMarker(normalized)) {
      return { draft: null, reason: "normalizer_removed_future_marker" };
    }
    const normalizedForbidden = inspectForbiddenDraftContent(normalized);
    if (normalizedForbidden) {
      return {
        draft: null,
        reason: `forbidden_sensitive_content:${normalizedForbidden}`,
      };
    }
    return {
      draft: JSON.parse(JSON.stringify(normalized)) as GuestDesignDraft,
      reason: null,
    };
  } catch {
    return { draft: null, reason: "future_draft_normalization_failed" };
  }
};

export const normalizeAuthenticatedFutureDraftRecord = (
  value: unknown,
): { record: AuthenticatedFutureDraftRecordV1 | null; reason: string | null } => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== AUTHENTICATED_FUTURE_DRAFT_SCHEMA_VERSION ||
    (value.lifecycleStatus !== "active" && value.lifecycleStatus !== "cleared") ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1
  ) {
    return { record: null, reason: "invalid_cloud_record_envelope" };
  }
  const createdAt = toIsoString(value.createdAt as DateLike);
  const updatedAt = toIsoString(value.updatedAt as DateLike);
  if (!createdAt || !updatedAt) {
    return { record: null, reason: "invalid_cloud_record_timestamps" };
  }
  if (value.lifecycleStatus === "cleared") {
    if ("draft" in value) {
      return { record: null, reason: "cleared_record_retains_payload" };
    }
    return {
      record: {
        schemaVersion: 1,
        lifecycleStatus: "cleared",
        revision: value.revision as number,
        createdAt,
        updatedAt,
      },
      reason: null,
    };
  }
  const normalized = normalizeAuthenticatedFutureDraft(value.draft);
  if (!normalized.draft) {
    return { record: null, reason: normalized.reason || "invalid_cloud_draft" };
  }
  return {
    record: {
      schemaVersion: 1,
      lifecycleStatus: "active",
      revision: value.revision as number,
      createdAt,
      updatedAt,
      draft: normalized.draft,
    },
    reason: null,
  };
};

export const areFutureDraftsEquivalent = (
  left: GuestDesignDraft,
  right: GuestDesignDraft,
): boolean => {
  const withoutClientTimestamp = (draft: GuestDesignDraft) => {
    const { updatedAt: _updatedAt, ...content } = draft;
    return content;
  };
  return (
    stableSerialize(withoutClientTimestamp(left)) ===
    stableSerialize(withoutClientTimestamp(right))
  );
};

export const resolveAuthenticatedFutureDraftIdentity = ({
  authResolved,
  firebaseUser,
  customer,
}: {
  authResolved: boolean;
  firebaseUser: Pick<User, "uid" | "email" | "isAnonymous"> | null;
  customer: FutureDraftApplicationCustomer | null;
}): AuthenticatedFutureDraftIdentity => {
  if (!authResolved) return { status: "resolving" };
  if (!firebaseUser || firebaseUser.isAnonymous) {
    return customer
      ? {
          status: "blocked",
          reason: "application_customer_without_firebase_user",
        }
      : { status: "guest" };
  }
  if (!customer) {
    return {
      status: "blocked",
      reason: "firebase_user_without_application_customer",
    };
  }
  if (customer.ownerUid !== firebaseUser.uid) {
    return { status: "blocked", reason: "firebase_uid_mismatch" };
  }
  if (
    firebaseUser.email &&
    customer.email &&
    AuthorizationEngine.getCanonicalEmail(firebaseUser.email) !==
      AuthorizationEngine.getCanonicalEmail(customer.email)
  ) {
    return { status: "blocked", reason: "firebase_email_mismatch" };
  }
  return { status: "authenticated", ownerUid: firebaseUser.uid };
};

const normalizeLoadedValue = (
  value: unknown | null,
): AuthenticatedFutureDraftLoadResult => {
  if (value === null) return { status: "absent", record: null };
  const normalized = normalizeAuthenticatedFutureDraftRecord(value);
  return normalized.record
    ? { status: "loaded", record: normalized.record }
    : {
        status: "invalid",
        record: null,
        reason: normalized.reason || "invalid_cloud_record",
      };
};

export const createAuthenticatedFutureDraftRepository = ({
  adapter,
  getIdentity,
}: {
  adapter: AuthenticatedFutureDraftPersistenceAdapter;
  getIdentity: () => AuthenticatedFutureDraftIdentity;
}) => {
  const requireOwner = () => {
    const identity = getIdentity();
    return identity.status === "authenticated"
      ? { ownerUid: identity.ownerUid, reason: null }
      : {
          ownerUid: null,
          reason:
            identity.status === "blocked"
              ? identity.reason
              : `identity_${identity.status}`,
        };
  };

  const load = async (): Promise<AuthenticatedFutureDraftLoadResult> => {
    const owner = requireOwner();
    if (!owner.ownerUid) {
      return { status: "blocked", record: null, reason: owner.reason! };
    }
    return normalizeLoadedValue(await adapter.load(owner.ownerUid));
  };

  const write = async ({
    expectedRevision,
    lifecycleStatus,
    draft,
  }: {
    expectedRevision: number | null;
    lifecycleStatus: "active" | "cleared";
    draft?: GuestDesignDraft;
  }): Promise<AuthenticatedFutureDraftWriteResult> => {
    const owner = requireOwner();
    if (!owner.ownerUid) {
      return { status: "blocked", record: null, reason: owner.reason! };
    }
    let normalizedDraft: GuestDesignDraft | undefined;
    if (lifecycleStatus === "active") {
      const normalized = normalizeAuthenticatedFutureDraft(draft);
      if (!normalized.draft) {
        return {
          status: "invalid",
          record: null,
          reason: normalized.reason || "invalid_future_draft",
        };
      }
      normalizedDraft = normalized.draft;
    }
    const committed = await adapter.commit({
      ownerUid: owner.ownerUid,
      expectedRevision,
      lifecycleStatus,
      ...(normalizedDraft ? { draft: normalizedDraft } : {}),
    });
    if (committed.status === "conflict") {
      const current = normalizeLoadedValue(committed.currentValue);
      return {
        status: "conflict",
        record: null,
        currentRecord: current.status === "loaded" ? current.record : null,
      };
    }
    const normalizedRecord = normalizeAuthenticatedFutureDraftRecord(
      committed.value,
    );
    return normalizedRecord.record
      ? { status: "saved", record: normalizedRecord.record }
      : {
          status: "invalid",
          record: null,
          reason: normalizedRecord.reason || "invalid_saved_record",
        };
  };

  const save = (draft: GuestDesignDraft, expectedRevision: number | null) =>
    write({ expectedRevision, lifecycleStatus: "active", draft });

  const clear = (expectedRevision: number | null) =>
    write({ expectedRevision, lifecycleStatus: "cleared" });

  const synchronize = async (
    guestDraftValue: unknown | null,
  ): Promise<AuthenticatedFutureDraftSyncResult> => {
    const guest =
      guestDraftValue === null
        ? { draft: null, reason: null }
        : normalizeAuthenticatedFutureDraft(guestDraftValue);
    if (guestDraftValue !== null && !guest.draft) {
      return {
        status: "invalid",
        record: null,
        draft: null,
        reason: `invalid_guest_draft:${guest.reason}`,
      };
    }
    const cloud = await load();
    if (cloud.status === "blocked" || cloud.status === "invalid") {
      return {
        status: cloud.status,
        record: null,
        draft: null,
        reason: cloud.reason,
      };
    }
    const resolvePresentCloud = (
      record: AuthenticatedFutureDraftRecordV1,
    ): AuthenticatedFutureDraftSyncResult => {
      if (record.lifecycleStatus === "cleared") {
        return { status: "cloud_cleared", record, draft: null };
      }
      const cloudDraft = record.draft!;
      if (!guest.draft) {
        return { status: "cloud_restored", record, draft: cloudDraft };
      }
      if (areFutureDraftsEquivalent(cloudDraft, guest.draft)) {
        return { status: "equivalent", record, draft: cloudDraft };
      }
      return {
        status: "conflict",
        record,
        cloudDraft,
        guestDraft: guest.draft,
      };
    };
    if (cloud.status === "absent") {
      if (!guest.draft) {
        return { status: "empty", record: null, draft: null };
      }
      const transferred = await save(guest.draft, null);
      if (transferred.status !== "saved") {
        if (transferred.status === "conflict") {
          const racedCloud = await load();
          if (racedCloud.status === "loaded") {
            return resolvePresentCloud(racedCloud.record);
          }
          return {
            status: racedCloud.status === "absent" ? "invalid" : racedCloud.status,
            record: null,
            draft: null,
            reason:
              racedCloud.status === "absent"
                ? "cloud_record_disappeared_after_conflict"
                : racedCloud.reason,
          };
        }
        return {
              status: transferred.status,
              record: null,
              draft: null,
              reason: transferred.reason,
            };
      }
      return {
        status: "guest_transferred",
        record: transferred.record,
        draft: transferred.record.draft || null,
      };
    }
    return resolvePresentCloud(cloud.record);
  };

  return { load, save, clear, synchronize };
};

export type AuthenticatedFutureDraftRepository = ReturnType<
  typeof createAuthenticatedFutureDraftRepository
>;

const createFirestoreAdapter = (
  firestore: Firestore,
  now: () => Date = () => new Date(),
): AuthenticatedFutureDraftPersistenceAdapter => ({
  async load(ownerUid) {
    const snapshot = await getDoc(
      doc(firestore, AUTHENTICATED_FUTURE_DRAFT_COLLECTION, ownerUid),
    );
    return snapshot.exists() ? snapshot.data() : null;
  },
  async commit({
    ownerUid,
    expectedRevision,
    lifecycleStatus,
    draft,
  }) {
    const reference = doc(
      firestore,
      AUTHENTICATED_FUTURE_DRAFT_COLLECTION,
      ownerUid,
    );
    return runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(reference);
      const currentValue = snapshot.exists() ? snapshot.data() : null;
      const current = normalizeLoadedValue(currentValue);
      if (snapshot.exists() && current.status !== "loaded") {
        return { status: "conflict" as const, currentValue };
      }
      const currentRevision =
        current.status === "loaded" ? current.record.revision : null;
      if (currentRevision !== expectedRevision) {
        return { status: "conflict" as const, currentValue };
      }
      const revision = (currentRevision || 0) + 1;
      const clientNow = now().toISOString();
      const value: DocumentData = {
        schemaVersion: AUTHENTICATED_FUTURE_DRAFT_SCHEMA_VERSION,
        lifecycleStatus,
        revision,
        createdAt:
          current.status === "loaded"
            ? (currentValue as DocumentData).createdAt
            : serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(lifecycleStatus === "active" ? { draft } : {}),
      };
      transaction.set(reference, value);
      return {
        status: "saved" as const,
        value: {
          ...value,
          createdAt:
            current.status === "loaded" ? current.record.createdAt : clientNow,
          updatedAt: clientNow,
        },
      };
    });
  },
});

export const createFirebaseAuthenticatedFutureDraftRepository = ({
  customer,
  authResolved,
  firebaseUser = auth.currentUser,
}: {
  customer: FutureDraftApplicationCustomer | null;
  authResolved: boolean;
  firebaseUser?: User | null;
}): AuthenticatedFutureDraftRepository =>
  createAuthenticatedFutureDraftRepository({
    adapter: createFirestoreAdapter(db),
    getIdentity: () =>
      resolveAuthenticatedFutureDraftIdentity({
        authResolved,
        firebaseUser,
        customer,
      }),
  });
