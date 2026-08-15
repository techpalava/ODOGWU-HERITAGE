import {
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import {
  STAFF_PREVIEW_CAPABILITY,
  STAFF_PREVIEW_CLAIM_KEY,
  STAFF_PREVIEW_CLAIM_SCHEMA_VERSION,
  STAFF_PREVIEW_ENTITLEMENT_COLLECTION,
  STAFF_PREVIEW_ENTITLEMENT_SCHEMA_VERSION,
  normalizeStaffPreviewClaim,
  normalizeStaffPreviewEntitlement,
  resolveStaffPreviewAuthorization,
  type StaffPreviewAuthorizationDecision,
  type StaffPreviewClaimV1,
  type StaffPreviewEntitlementV1,
  type StaffPreviewTimestamp,
} from "../security/staffPreviewEntitlement.js";

export type StaffPreviewEntitlementErrorCode =
  | "INVALID_FIREBASE_UID"
  | "FIREBASE_USER_NOT_FOUND"
  | "FIREBASE_USER_DISABLED"
  | "ENTITLEMENT_NOT_FOUND"
  | "ENTITLEMENT_MALFORMED";

export class StaffPreviewEntitlementError extends Error {
  constructor(
    readonly code: StaffPreviewEntitlementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StaffPreviewEntitlementError";
  }
}

export interface StaffPreviewAuthUser {
  uid: string;
  disabled?: boolean;
  customClaims?: Record<string, unknown>;
}

export interface StaffPreviewAuthAdmin {
  getUser(uid: string): Promise<StaffPreviewAuthUser>;
  setCustomUserClaims(
    uid: string,
    customUserClaims: Record<string, unknown>,
  ): Promise<void>;
  revokeRefreshTokens(uid: string): Promise<void>;
}

export interface StaffPreviewEntitlementStore {
  read(uid: string): Promise<unknown | null>;
  transact(
    uid: string,
    transition: (current: unknown | null) => StaffPreviewEntitlementV1,
  ): Promise<StaffPreviewEntitlementV1>;
}

export type StaffPreviewSynchronizationIssue =
  | "CLAIM_SYNCHRONIZATION_FAILED"
  | "TOKEN_REVOCATION_FAILED"
  | "ENTITLEMENT_CHANGED_DURING_SYNCHRONIZATION";

export interface StaffPreviewMutationOutcome {
  operation: "grant" | "revoke" | "reconcile";
  status: "complete" | "partial_failure";
  entitlement: StaffPreviewEntitlementV1;
  claimSynchronized: boolean;
  refreshTokensRevoked: boolean | null;
  issues: StaffPreviewSynchronizationIssue[];
}

export interface StaffPreviewInspection {
  uid: string;
  entitlement: StaffPreviewEntitlementV1 | null;
  claim: StaffPreviewClaimV1 | null;
  authorization: StaffPreviewAuthorizationDecision;
}

const validateUidFormat = (uid: string): string => {
  const normalized = uid.trim();
  if (!normalized || normalized.length > 128 || normalized.includes("/")) {
    throw new StaffPreviewEntitlementError(
      "INVALID_FIREBASE_UID",
      "A valid Firebase UID is required.",
    );
  }
  return normalized;
};

const requireFirebaseUser = async (
  auth: StaffPreviewAuthAdmin,
  uid: string,
  { allowDisabled = false }: { allowDisabled?: boolean } = {},
): Promise<StaffPreviewAuthUser> => {
  const validUid = validateUidFormat(uid);
  let user: StaffPreviewAuthUser;
  try {
    user = await auth.getUser(validUid);
  } catch {
    throw new StaffPreviewEntitlementError(
      "FIREBASE_USER_NOT_FOUND",
      "The Firebase user could not be found.",
    );
  }
  if (user.uid !== validUid) {
    throw new StaffPreviewEntitlementError(
      "FIREBASE_USER_NOT_FOUND",
      "Firebase returned a different user identity.",
    );
  }
  if (user.disabled && !allowDisabled) {
    throw new StaffPreviewEntitlementError(
      "FIREBASE_USER_DISABLED",
      "A disabled Firebase user cannot receive preview access.",
    );
  }
  return user;
};

const requireEntitlement = (value: unknown | null): StaffPreviewEntitlementV1 => {
  if (value === null) {
    throw new StaffPreviewEntitlementError(
      "ENTITLEMENT_NOT_FOUND",
      "No staff preview entitlement exists for this UID.",
    );
  }
  const normalized = normalizeStaffPreviewEntitlement(value);
  if (normalized.valid === false) {
    throw new StaffPreviewEntitlementError(
      "ENTITLEMENT_MALFORMED",
      `The staff preview entitlement is malformed: ${normalized.reason}`,
    );
  }
  return normalized.value;
};

const createClaim = (revision: number): StaffPreviewClaimV1 => ({
  schemaVersion: STAFF_PREVIEW_CLAIM_SCHEMA_VERSION,
  entitlementRevision: revision,
});

const claimsWithoutPreview = (
  claims: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const preserved = { ...(claims || {}) };
  delete preserved[STAFF_PREVIEW_CLAIM_KEY];
  return preserved;
};

const synchronizeActiveClaim = async (
  auth: StaffPreviewAuthAdmin,
  uid: string,
  revision: number,
): Promise<void> => {
  const user = await requireFirebaseUser(auth, uid);
  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims || {}),
    [STAFF_PREVIEW_CLAIM_KEY]: createClaim(revision),
  });
};

const clearPreviewClaim = async (
  auth: StaffPreviewAuthAdmin,
  uid: string,
): Promise<void> => {
  const user = await requireFirebaseUser(auth, uid, { allowDisabled: true });
  await auth.setCustomUserClaims(
    uid,
    claimsWithoutPreview(user.customClaims),
  );
};

const isCurrentRecord = (
  value: unknown | null,
  expected: StaffPreviewEntitlementV1,
): boolean => {
  if (value === null) return false;
  const normalized = normalizeStaffPreviewEntitlement(value);
  return (
    normalized.valid &&
    normalized.value.status === expected.status &&
    normalized.value.revision === expected.revision
  );
};

const outcome = ({
  operation,
  entitlement,
  claimSynchronized,
  refreshTokensRevoked,
  issues,
}: Omit<StaffPreviewMutationOutcome, "status">): StaffPreviewMutationOutcome => ({
  operation,
  status: issues.length === 0 ? "complete" : "partial_failure",
  entitlement,
  claimSynchronized,
  refreshTokensRevoked,
  issues,
});

export const createFirestoreStaffPreviewEntitlementStore = (
  db: Firestore,
): StaffPreviewEntitlementStore => ({
  async read(uid) {
    const snapshot = await db
      .collection(STAFF_PREVIEW_ENTITLEMENT_COLLECTION)
      .doc(uid)
      .get();
    return snapshot.exists ? snapshot.data() || null : null;
  },
  async transact(uid, transition) {
    const reference = db
      .collection(STAFF_PREVIEW_ENTITLEMENT_COLLECTION)
      .doc(uid);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const next = transition(snapshot.exists ? snapshot.data() || null : null);
      transaction.set(reference, next);
      return next;
    });
  },
});

export const createStaffPreviewEntitlementService = ({
  auth,
  store,
  now = () => Timestamp.now(),
}: {
  auth: StaffPreviewAuthAdmin;
  store: StaffPreviewEntitlementStore;
  now?: () => StaffPreviewTimestamp;
}) => {
  const grant = async (inputUid: string): Promise<StaffPreviewMutationOutcome> => {
    const uid = validateUidFormat(inputUid);
    await requireFirebaseUser(auth, uid);
    const entitlement = await store.transact(uid, (currentValue) => {
      const timestamp = now();
      const current =
        currentValue === null ? null : requireEntitlement(currentValue);
      return {
        schemaVersion: STAFF_PREVIEW_ENTITLEMENT_SCHEMA_VERSION,
        capability: STAFF_PREVIEW_CAPABILITY,
        status: "active",
        revision: (current?.revision || 0) + 1,
        createdAt: current?.createdAt || timestamp,
        updatedAt: timestamp,
        grantedAt: timestamp,
      };
    });

    const issues: StaffPreviewSynchronizationIssue[] = [];
    let claimSynchronized = false;
    try {
      await synchronizeActiveClaim(auth, uid, entitlement.revision);
      claimSynchronized = true;
    } catch {
      issues.push("CLAIM_SYNCHRONIZATION_FAILED");
    }
    if (!isCurrentRecord(await store.read(uid), entitlement)) {
      claimSynchronized = false;
      issues.push("ENTITLEMENT_CHANGED_DURING_SYNCHRONIZATION");
    }
    return outcome({
      operation: "grant",
      entitlement,
      claimSynchronized,
      refreshTokensRevoked: null,
      issues,
    });
  };

  const revoke = async (inputUid: string): Promise<StaffPreviewMutationOutcome> => {
    const uid = validateUidFormat(inputUid);
    await requireFirebaseUser(auth, uid, { allowDisabled: true });
    const entitlement = await store.transact(uid, (currentValue) => {
      const current = requireEntitlement(currentValue);
      const timestamp = now();
      return {
        schemaVersion: STAFF_PREVIEW_ENTITLEMENT_SCHEMA_VERSION,
        capability: STAFF_PREVIEW_CAPABILITY,
        status: "revoked",
        revision: current.revision + 1,
        createdAt: current.createdAt,
        updatedAt: timestamp,
        grantedAt: current.grantedAt,
        revokedAt: timestamp,
      };
    });

    const issues: StaffPreviewSynchronizationIssue[] = [];
    let claimSynchronized = false;
    let refreshTokensRevoked = false;
    try {
      await clearPreviewClaim(auth, uid);
      claimSynchronized = true;
    } catch {
      issues.push("CLAIM_SYNCHRONIZATION_FAILED");
    }
    try {
      await auth.revokeRefreshTokens(uid);
      refreshTokensRevoked = true;
    } catch {
      issues.push("TOKEN_REVOCATION_FAILED");
    }
    if (!isCurrentRecord(await store.read(uid), entitlement)) {
      claimSynchronized = false;
      issues.push("ENTITLEMENT_CHANGED_DURING_SYNCHRONIZATION");
    }
    return outcome({
      operation: "revoke",
      entitlement,
      claimSynchronized,
      refreshTokensRevoked,
      issues,
    });
  };

  const inspect = async (inputUid: string): Promise<StaffPreviewInspection> => {
    const uid = validateUidFormat(inputUid);
    const user = await requireFirebaseUser(auth, uid, { allowDisabled: true });
    const rawEntitlement = await store.read(uid);
    const normalizedEntitlement =
      rawEntitlement === null
        ? null
        : normalizeStaffPreviewEntitlement(rawEntitlement);
    const entitlement =
      normalizedEntitlement && normalizedEntitlement.valid
        ? normalizedEntitlement.value
        : null;
    const rawClaim = user.customClaims?.[STAFF_PREVIEW_CLAIM_KEY] ?? null;
    const normalizedClaim =
      rawClaim === null ? null : normalizeStaffPreviewClaim(rawClaim);
    const authorization = resolveStaffPreviewAuthorization({
      firebaseUid: uid,
      applicationUid: uid,
      isAnonymous: false,
      entitlement: rawEntitlement,
      claim: rawClaim,
    });
    return {
      uid,
      entitlement,
      claim:
        normalizedClaim && normalizedClaim.valid ? normalizedClaim.value : null,
      authorization,
    };
  };

  const reconcile = async (
    inputUid: string,
  ): Promise<StaffPreviewMutationOutcome> => {
    const uid = validateUidFormat(inputUid);
    const user = await requireFirebaseUser(auth, uid, { allowDisabled: true });
    const entitlement = requireEntitlement(await store.read(uid));
    const issues: StaffPreviewSynchronizationIssue[] = [];
    let claimSynchronized = false;
    let refreshTokensRevoked: boolean | null = null;

    try {
      if (entitlement.status === "active") {
        if (user.disabled) {
          throw new StaffPreviewEntitlementError(
            "FIREBASE_USER_DISABLED",
            "A disabled Firebase user cannot receive an active preview claim.",
          );
        }
        await synchronizeActiveClaim(auth, uid, entitlement.revision);
      } else {
        await clearPreviewClaim(auth, uid);
      }
      claimSynchronized = true;
    } catch {
      issues.push("CLAIM_SYNCHRONIZATION_FAILED");
    }
    if (entitlement.status === "revoked") {
      refreshTokensRevoked = false;
      try {
        await auth.revokeRefreshTokens(uid);
        refreshTokensRevoked = true;
      } catch {
        issues.push("TOKEN_REVOCATION_FAILED");
      }
    }
    if (!isCurrentRecord(await store.read(uid), entitlement)) {
      claimSynchronized = false;
      issues.push("ENTITLEMENT_CHANGED_DURING_SYNCHRONIZATION");
    }
    return outcome({
      operation: "reconcile",
      entitlement,
      claimSynchronized,
      refreshTokensRevoked,
      issues,
    });
  };

  return { grant, revoke, inspect, reconcile };
};

export const createFirebaseStaffPreviewEntitlementService = ({
  auth,
  db,
}: {
  auth: Auth;
  db: Firestore;
}) =>
  createStaffPreviewEntitlementService({
    auth,
    store: createFirestoreStaffPreviewEntitlementStore(db),
  });
