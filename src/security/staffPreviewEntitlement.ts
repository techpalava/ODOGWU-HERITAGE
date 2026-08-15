export const STAFF_PREVIEW_ENTITLEMENT_COLLECTION =
  "staffPreviewEntitlements" as const;
export const STAFF_PREVIEW_CAPABILITY =
  "design_studio_nine_stage_preview" as const;
export const STAFF_PREVIEW_ENTITLEMENT_SCHEMA_VERSION = 1 as const;
export const STAFF_PREVIEW_CLAIM_KEY = "staffPreview" as const;
export const STAFF_PREVIEW_CLAIM_SCHEMA_VERSION = 1 as const;

export interface StaffPreviewTimestamp {
  toMillis(): number;
}

interface StaffPreviewEntitlementBaseV1 {
  schemaVersion: 1;
  capability: typeof STAFF_PREVIEW_CAPABILITY;
  revision: number;
  createdAt: StaffPreviewTimestamp;
  updatedAt: StaffPreviewTimestamp;
  grantedAt: StaffPreviewTimestamp;
}

export interface ActiveStaffPreviewEntitlementV1
  extends StaffPreviewEntitlementBaseV1 {
  status: "active";
}

export interface RevokedStaffPreviewEntitlementV1
  extends StaffPreviewEntitlementBaseV1 {
  status: "revoked";
  revokedAt: StaffPreviewTimestamp;
}

export type StaffPreviewEntitlementV1 =
  | ActiveStaffPreviewEntitlementV1
  | RevokedStaffPreviewEntitlementV1;

export interface StaffPreviewClaimV1 {
  schemaVersion: 1;
  entitlementRevision: number;
}

export type StaffPreviewAuthorizationReason =
  | "AUTHORIZED"
  | "SIGNED_OUT"
  | "ANONYMOUS_USER"
  | "APPLICATION_UID_MISMATCH"
  | "ENTITLEMENT_MISSING"
  | "ENTITLEMENT_MALFORMED"
  | "ENTITLEMENT_REVOKED"
  | "CLAIM_MISSING"
  | "CLAIM_MALFORMED"
  | "CLAIM_REVISION_MISMATCH";

export interface StaffPreviewAuthorizationDecision {
  authorized: boolean;
  reason: StaffPreviewAuthorizationReason;
  entitlementRevision: number | null;
}

type NormalizationResult<T> =
  | { valid: true; value: T }
  | { valid: false; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean => {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
};

const isPositiveRevision = (value: unknown): value is number =>
  Number.isInteger(value) && typeof value === "number" && value > 0;

const isTimestamp = (value: unknown): value is StaffPreviewTimestamp => {
  if (!isRecord(value) || typeof value.toMillis !== "function") return false;
  try {
    return Number.isFinite(value.toMillis());
  } catch {
    return false;
  }
};

export const normalizeStaffPreviewEntitlement = (
  value: unknown,
): NormalizationResult<StaffPreviewEntitlementV1> => {
  if (!isRecord(value)) {
    return { valid: false, reason: "entitlement_not_an_object" };
  }
  const status = value.status;
  const expectedKeys =
    status === "revoked"
      ? [
          "schemaVersion",
          "capability",
          "status",
          "revision",
          "createdAt",
          "updatedAt",
          "grantedAt",
          "revokedAt",
        ]
      : [
          "schemaVersion",
          "capability",
          "status",
          "revision",
          "createdAt",
          "updatedAt",
          "grantedAt",
        ];
  if (!hasExactKeys(value, expectedKeys)) {
    return { valid: false, reason: "entitlement_has_unexpected_fields" };
  }
  if (value.schemaVersion !== STAFF_PREVIEW_ENTITLEMENT_SCHEMA_VERSION) {
    return { valid: false, reason: "entitlement_schema_version_invalid" };
  }
  if (value.capability !== STAFF_PREVIEW_CAPABILITY) {
    return { valid: false, reason: "entitlement_capability_invalid" };
  }
  if (status !== "active" && status !== "revoked") {
    return { valid: false, reason: "entitlement_status_invalid" };
  }
  if (!isPositiveRevision(value.revision)) {
    return { valid: false, reason: "entitlement_revision_invalid" };
  }
  if (
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt) ||
    !isTimestamp(value.grantedAt)
  ) {
    return { valid: false, reason: "entitlement_timestamp_invalid" };
  }
  if (
    value.updatedAt.toMillis() < value.createdAt.toMillis() ||
    value.grantedAt.toMillis() < value.createdAt.toMillis()
  ) {
    return { valid: false, reason: "entitlement_timestamp_order_invalid" };
  }
  if (status === "revoked") {
    if (!isTimestamp(value.revokedAt)) {
      return { valid: false, reason: "entitlement_revoked_at_invalid" };
    }
    if (value.revokedAt.toMillis() < value.grantedAt.toMillis()) {
      return { valid: false, reason: "entitlement_revoked_at_order_invalid" };
    }
    return {
      valid: true,
      value: value as unknown as RevokedStaffPreviewEntitlementV1,
    };
  }
  return {
    valid: true,
    value: value as unknown as ActiveStaffPreviewEntitlementV1,
  };
};

export const normalizeStaffPreviewClaim = (
  value: unknown,
): NormalizationResult<StaffPreviewClaimV1> => {
  if (!isRecord(value)) {
    return { valid: false, reason: "claim_not_an_object" };
  }
  if (!hasExactKeys(value, ["schemaVersion", "entitlementRevision"])) {
    return { valid: false, reason: "claim_has_unexpected_fields" };
  }
  if (value.schemaVersion !== STAFF_PREVIEW_CLAIM_SCHEMA_VERSION) {
    return { valid: false, reason: "claim_schema_version_invalid" };
  }
  if (!isPositiveRevision(value.entitlementRevision)) {
    return { valid: false, reason: "claim_revision_invalid" };
  }
  return { valid: true, value: value as unknown as StaffPreviewClaimV1 };
};

export const resolveStaffPreviewAuthorization = ({
  firebaseUid,
  applicationUid,
  isAnonymous,
  entitlement,
  claim,
}: {
  firebaseUid: string | null;
  applicationUid: string | null;
  isAnonymous: boolean;
  entitlement: unknown | null;
  claim: unknown | null;
}): StaffPreviewAuthorizationDecision => {
  if (!firebaseUid) {
    return { authorized: false, reason: "SIGNED_OUT", entitlementRevision: null };
  }
  if (isAnonymous) {
    return {
      authorized: false,
      reason: "ANONYMOUS_USER",
      entitlementRevision: null,
    };
  }
  if (!applicationUid || applicationUid !== firebaseUid) {
    return {
      authorized: false,
      reason: "APPLICATION_UID_MISMATCH",
      entitlementRevision: null,
    };
  }
  if (entitlement === null) {
    return {
      authorized: false,
      reason: "ENTITLEMENT_MISSING",
      entitlementRevision: null,
    };
  }
  const normalizedEntitlement = normalizeStaffPreviewEntitlement(entitlement);
  if (!normalizedEntitlement.valid) {
    return {
      authorized: false,
      reason: "ENTITLEMENT_MALFORMED",
      entitlementRevision: null,
    };
  }
  if (normalizedEntitlement.value.status === "revoked") {
    return {
      authorized: false,
      reason: "ENTITLEMENT_REVOKED",
      entitlementRevision: normalizedEntitlement.value.revision,
    };
  }
  if (claim === null) {
    return {
      authorized: false,
      reason: "CLAIM_MISSING",
      entitlementRevision: normalizedEntitlement.value.revision,
    };
  }
  const normalizedClaim = normalizeStaffPreviewClaim(claim);
  if (!normalizedClaim.valid) {
    return {
      authorized: false,
      reason: "CLAIM_MALFORMED",
      entitlementRevision: normalizedEntitlement.value.revision,
    };
  }
  if (
    normalizedClaim.value.entitlementRevision !==
    normalizedEntitlement.value.revision
  ) {
    return {
      authorized: false,
      reason: "CLAIM_REVISION_MISMATCH",
      entitlementRevision: normalizedEntitlement.value.revision,
    };
  }
  return {
    authorized: true,
    reason: "AUTHORIZED",
    entitlementRevision: normalizedEntitlement.value.revision,
  };
};
