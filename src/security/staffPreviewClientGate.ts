import { getCanonicalEmail } from "./authIdentity";
import {
  normalizeStaffPreviewClaim,
  resolveStaffPreviewAuthorization,
  type StaffPreviewAuthorizationReason,
} from "./staffPreviewEntitlement";

export const STAFF_PREVIEW_FEATURE_FLAG =
  "VITE_ENABLE_DESIGN_STUDIO_STAFF_PREVIEW" as const;
export const STAFF_PREVIEW_FEATURE_ENABLED_VALUE = "true" as const;

export type StaffPreviewClientGateReason =
  | "FEATURE_FLAG_DISABLED"
  | "SIGNED_OUT"
  | "ANONYMOUS_USER"
  | "APPLICATION_CUSTOMER_MISSING"
  | "APPLICATION_UID_MISSING"
  | "APPLICATION_UID_MISMATCH"
  | "CANONICAL_EMAIL_MISSING"
  | "CANONICAL_EMAIL_MISMATCH"
  | "IDENTITY_VERIFIED"
  | "TOKEN_REFRESH_IN_PROGRESS"
  | "ENTITLEMENT_LOADING"
  | "TOKEN_REFRESH_FAILED"
  | "ENTITLEMENT_LISTENER_FAILED"
  | "CLAIM_MISSING"
  | "CLAIM_MALFORMED"
  | "ENTITLEMENT_MISSING"
  | "ENTITLEMENT_MALFORMED"
  | "ENTITLEMENT_REVOKED"
  | "CLAIM_REVISION_MISMATCH"
  | "AUTHORIZED";

export type StaffPreviewClientGateState =
  | { status: "disabled"; reason: "FEATURE_FLAG_DISABLED" }
  | { status: "signed_out"; reason: "SIGNED_OUT" }
  | {
      status: "identity_invalid";
      reason:
        | "ANONYMOUS_USER"
        | "APPLICATION_CUSTOMER_MISSING"
        | "APPLICATION_UID_MISSING"
        | "APPLICATION_UID_MISMATCH"
        | "CANONICAL_EMAIL_MISSING"
        | "CANONICAL_EMAIL_MISMATCH";
    }
  | {
      status: "checking";
      reason:
        | "IDENTITY_VERIFIED"
        | "TOKEN_REFRESH_IN_PROGRESS"
        | "ENTITLEMENT_LOADING";
      uid: string;
    }
  | {
      status: "authorized";
      reason: "AUTHORIZED";
      uid: string;
      entitlementRevision: number;
    }
  | {
      status: "denied";
      reason:
        | "CLAIM_MISSING"
        | "CLAIM_MALFORMED"
        | "ENTITLEMENT_MISSING"
        | "ENTITLEMENT_MALFORMED"
        | "ENTITLEMENT_REVOKED"
        | "CLAIM_REVISION_MISMATCH";
      uid: string;
      entitlementRevision: number | null;
    }
  | {
      status: "error";
      reason: "TOKEN_REFRESH_FAILED" | "ENTITLEMENT_LISTENER_FAILED";
      uid: string;
    };

export interface StaffPreviewGateFirebaseIdentity {
  uid: string;
  email: string | null;
  isAnonymous: boolean;
}

export interface StaffPreviewGateApplicationCustomer {
  ownerUid?: string | null;
  email?: string | null;
  canonicalEmail?: string | null;
}

export const parseStaffPreviewFeatureFlag = (value: unknown): boolean =>
  value === STAFF_PREVIEW_FEATURE_ENABLED_VALUE;

export const readStaffPreviewFeatureFlag = (
  environment: Readonly<Record<string, unknown>>,
): boolean => parseStaffPreviewFeatureFlag(environment[STAFF_PREVIEW_FEATURE_FLAG]);

export const resolveStaffPreviewGateIdentity = ({
  featureFlagValue,
  firebaseUser,
  applicationCustomer,
}: {
  featureFlagValue: unknown;
  firebaseUser: StaffPreviewGateFirebaseIdentity | null;
  applicationCustomer: StaffPreviewGateApplicationCustomer | null;
}): StaffPreviewClientGateState => {
  if (!parseStaffPreviewFeatureFlag(featureFlagValue)) {
    return { status: "disabled", reason: "FEATURE_FLAG_DISABLED" };
  }
  if (!firebaseUser) return { status: "signed_out", reason: "SIGNED_OUT" };
  if (firebaseUser.isAnonymous) {
    return { status: "identity_invalid", reason: "ANONYMOUS_USER" };
  }
  if (!applicationCustomer) {
    return {
      status: "identity_invalid",
      reason: "APPLICATION_CUSTOMER_MISSING",
    };
  }
  if (!applicationCustomer.ownerUid) {
    return { status: "identity_invalid", reason: "APPLICATION_UID_MISSING" };
  }
  if (applicationCustomer.ownerUid !== firebaseUser.uid) {
    return { status: "identity_invalid", reason: "APPLICATION_UID_MISMATCH" };
  }
  const firebaseEmail = getCanonicalEmail(firebaseUser.email || undefined);
  const applicationEmail = getCanonicalEmail(
    applicationCustomer.canonicalEmail ||
      applicationCustomer.email ||
      undefined,
  );
  if (!firebaseEmail || !applicationEmail) {
    return { status: "identity_invalid", reason: "CANONICAL_EMAIL_MISSING" };
  }
  if (firebaseEmail !== applicationEmail) {
    return { status: "identity_invalid", reason: "CANONICAL_EMAIL_MISMATCH" };
  }
  return {
    status: "checking",
    reason: "IDENTITY_VERIFIED",
    uid: firebaseUser.uid,
  };
};

const deniedReason = (
  reason: StaffPreviewAuthorizationReason,
): Extract<StaffPreviewClientGateState, { status: "denied" }>[
  "reason"
] => {
  switch (reason) {
    case "ENTITLEMENT_MISSING":
    case "ENTITLEMENT_MALFORMED":
    case "ENTITLEMENT_REVOKED":
    case "CLAIM_MISSING":
    case "CLAIM_MALFORMED":
    case "CLAIM_REVISION_MISMATCH":
      return reason;
    default:
      return "ENTITLEMENT_MALFORMED";
  }
};

export const resolveStaffPreviewClientAuthorization = ({
  featureFlagValue,
  firebaseUser,
  applicationCustomer,
  claim,
  entitlement,
}: {
  featureFlagValue: unknown;
  firebaseUser: StaffPreviewGateFirebaseIdentity | null;
  applicationCustomer: StaffPreviewGateApplicationCustomer | null;
  claim: unknown | null;
  entitlement: unknown | null;
}): StaffPreviewClientGateState => {
  const identity = resolveStaffPreviewGateIdentity({
    featureFlagValue,
    firebaseUser,
    applicationCustomer,
  });
  if (identity.status !== "checking" || !firebaseUser || !applicationCustomer) {
    return identity;
  }
  if (claim === null) {
    return {
      status: "denied",
      reason: "CLAIM_MISSING",
      uid: firebaseUser.uid,
      entitlementRevision: null,
    };
  }
  if (!normalizeStaffPreviewClaim(claim).valid) {
    return {
      status: "denied",
      reason: "CLAIM_MALFORMED",
      uid: firebaseUser.uid,
      entitlementRevision: null,
    };
  }
  const decision = resolveStaffPreviewAuthorization({
    firebaseUid: firebaseUser.uid,
    applicationUid: applicationCustomer.ownerUid || null,
    isAnonymous: firebaseUser.isAnonymous,
    entitlement,
    claim,
  });
  if (decision.authorized && decision.entitlementRevision !== null) {
    return {
      status: "authorized",
      reason: "AUTHORIZED",
      uid: firebaseUser.uid,
      entitlementRevision: decision.entitlementRevision,
    };
  }
  return {
    status: "denied",
    reason: deniedReason(decision.reason),
    uid: firebaseUser.uid,
    entitlementRevision: decision.entitlementRevision,
  };
};

export const isStaffPreviewFutureDraftLoadAllowed = (
  state: StaffPreviewClientGateState,
): boolean => state.status === "authorized";

export const resolveStaffPreviewJourneyMode = (
  state: StaffPreviewClientGateState,
): "legacy_five_stage" | "future_nine_stage" =>
  state.status === "authorized" ? "future_nine_stage" : "legacy_five_stage";
