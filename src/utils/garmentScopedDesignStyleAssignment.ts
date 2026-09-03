import type { PhysicalGarmentOccurrence } from "./designSourceState";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./physicalGarmentOccurrenceIdentity";

export const GARMENT_SCOPED_DESIGN_STYLE_ASSIGNMENT_SCHEMA_VERSION = 2 as const;

export interface GarmentDesignStyleAssignmentIdentityV2 {
  readonly garmentKey: string;
  readonly occurrenceToken: string;
  readonly assignmentRevision: number;
}

export interface CatalogGarmentDesignStyleAssignmentV2
  extends GarmentDesignStyleAssignmentIdentityV2 {
  readonly sourceKind: "catalog";
  readonly sourceKey: string;
  readonly catalogStyleId: string;
  readonly eligibilityFingerprint: string;
  readonly adaptabilityConfirmationFingerprint?: string;
}

export interface UploadedGarmentDesignStyleAssignmentV2
  extends GarmentDesignStyleAssignmentIdentityV2 {
  readonly sourceKind: "uploaded";
  readonly sourceKey: string;
  /** Opaque identity only. Upload ownership and storage remain separate authorities. */
  readonly uploadedSourceRef: string;
}

export type GarmentDesignStyleAssignmentV2 =
  | CatalogGarmentDesignStyleAssignmentV2
  | UploadedGarmentDesignStyleAssignmentV2;

/**
 * V2 is the complete assignment authority and intentionally has no fallback to
 * the legacy scalar selectedStyleId or DesignSource fields.
 */
export interface GarmentScopedDesignStyleAssignmentLedgerV2 {
  readonly schemaVersion: 2;
  readonly revision: number;
  readonly assignmentsByGarmentKey: Readonly<
    Record<string, GarmentDesignStyleAssignmentV2>
  >;
}

export interface GarmentDesignStyleAssignmentTarget {
  readonly garmentKey: string;
  readonly occurrenceToken: string;
}

export interface CatalogDesignStyleAssignmentInput {
  readonly sourceKey: string;
  readonly catalogStyleId: string;
  readonly eligibilityFingerprint: string;
  readonly adaptabilityConfirmationFingerprint?: string;
}

export interface UploadedDesignStyleAssignmentInput {
  readonly sourceKey: string;
  readonly uploadedSourceRef: string;
}

export type GarmentDesignStyleAssignmentMutationRejection =
  | "INVALID_LEDGER"
  | "STALE_LEDGER_REVISION"
  | "INVALID_OCCURRENCE_AUTHORITY"
  | "OCCURRENCE_NOT_FOUND"
  | "OCCURRENCE_AMBIGUOUS"
  | "OCCURRENCE_IDENTITY_UNAVAILABLE"
  | "OCCURRENCE_TOKEN_MISMATCH"
  | "STALE_ASSIGNMENT_PRESENT"
  | "INVALID_EXISTING_ASSIGNMENT"
  | "INVALID_SOURCE_IDENTITY";

export type GarmentDesignStyleAssignmentMutationResult =
  | {
      readonly status: "applied";
      readonly action: "assigned" | "replaced" | "cleared" | "removed";
      readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
      readonly previousAssignment: GarmentDesignStyleAssignmentV2 | null;
      readonly assignment: GarmentDesignStyleAssignmentV2 | null;
    }
  | {
      readonly status: "unchanged";
      readonly reason: "ASSIGNMENT_ALREADY_CURRENT" | "ASSIGNMENT_NOT_FOUND";
      readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
    }
  | {
      readonly status: "rejected";
      readonly reason: GarmentDesignStyleAssignmentMutationRejection;
      readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
    };

export type CatalogOccurrenceEligibilityAuthority =
  | { readonly status: "eligible" }
  | {
      readonly status: "adaptable";
      readonly requiredConfirmationFingerprint: string;
    }
  | { readonly status: "incompatible" };

export interface CatalogDesignStyleAuthorityFacts {
  readonly styleId: string;
  readonly sourceKey: string;
  readonly availability: "available" | "unavailable" | "malformed";
  readonly eligibilityFingerprint: string;
  readonly occurrenceEligibilityByToken: Readonly<
    Record<string, CatalogOccurrenceEligibilityAuthority>
  >;
  /** Cosmetic revision is deliberately excluded from validity decisions. */
  readonly displayRevision?: string;
}

export interface UploadedDesignStyleAuthorityFacts {
  readonly sourceKey: string;
  readonly uploadedSourceRef: string;
  readonly status: "confirmed" | "pending" | "unavailable" | "malformed";
  readonly eligibleOccurrenceTokens: readonly string[];
}

export interface GarmentScopedDesignStyleValidationAuthority {
  readonly catalogueState: "loading" | "ready" | "error";
  readonly catalogStylesById: Readonly<
    Record<string, CatalogDesignStyleAuthorityFacts>
  >;
  readonly uploadedSourcesByKey: Readonly<
    Record<string, UploadedDesignStyleAuthorityFacts>
  >;
  readonly unresolvedLegacyScalar?: boolean;
}

export type GarmentDesignStyleOccurrenceValidationStatus =
  | "valid"
  | "unassigned"
  | "stale"
  | "needs_review"
  | "unavailable"
  | "awaiting_validation"
  | "incompatible"
  | "invalid";

export type GarmentScopedDesignStyleValidationDiagnosticCode =
  | "NO_ACTIVE_OCCURRENCES"
  | "INVALID_OCCURRENCE_AUTHORITY"
  | "INVALID_LEDGER"
  | "LEGACY_SCALAR_REVIEW_REQUIRED"
  | "MISSING_ASSIGNMENT"
  | "ORPHAN_ASSIGNMENT"
  | "ASSIGNMENT_GARMENT_KEY_MISMATCH"
  | "STALE_OCCURRENCE_TOKEN"
  | "INVALID_SOURCE_SHAPE"
  | "CATALOGUE_LOADING"
  | "CATALOGUE_ERROR"
  | "CATALOG_STYLE_UNAVAILABLE"
  | "CATALOG_STYLE_MALFORMED"
  | "CATALOG_SOURCE_IDENTITY_MISMATCH"
  | "ELIGIBILITY_FINGERPRINT_CHANGED"
  | "GARMENT_INCOMPATIBLE"
  | "ADAPTABILITY_CONFIRMATION_REQUIRED"
  | "UPLOAD_SOURCE_AWAITING_CONFIRMATION"
  | "UPLOAD_SOURCE_UNAVAILABLE"
  | "UPLOAD_SOURCE_MALFORMED"
  | "UPLOAD_SOURCE_IDENTITY_MISMATCH"
  | "UPLOAD_OCCURRENCE_INCOMPATIBLE";

export interface GarmentScopedDesignStyleValidationDiagnostic {
  readonly code: GarmentScopedDesignStyleValidationDiagnosticCode;
  readonly garmentKey?: string;
  readonly occurrenceToken?: string;
  readonly sourceKey?: string;
}

export interface GarmentDesignStyleOccurrenceValidation {
  readonly garmentKey: string;
  readonly occurrenceToken: string;
  readonly status: GarmentDesignStyleOccurrenceValidationStatus;
  readonly assignment: GarmentDesignStyleAssignmentV2 | null;
  readonly diagnostics: readonly GarmentScopedDesignStyleValidationDiagnostic[];
}

export interface GarmentScopedDesignStyleValidationResult {
  readonly status:
    | "complete"
    | "incomplete"
    | "awaiting_validation"
    | "needs_review";
  readonly isComplete: boolean;
  readonly occurrencesByGarmentKey: Readonly<
    Record<string, GarmentDesignStyleOccurrenceValidation>
  >;
  readonly validOccurrenceTokens: readonly string[];
  readonly missingOccurrenceTokens: readonly string[];
  readonly orphanedAssignmentGarmentKeys: readonly string[];
  readonly diagnostics: readonly GarmentScopedDesignStyleValidationDiagnostic[];
}

export type GarmentScopedDesignStyleReconciliationResult =
  | {
      readonly status: "unchanged" | "reconciled";
      readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
      readonly removed: readonly {
        readonly garmentKey: string;
        readonly reason: "ORPHANED" | "STALE_OCCURRENCE_TOKEN";
        readonly assignment: GarmentDesignStyleAssignmentV2;
      }[];
    }
  | {
      readonly status: "blocked";
      readonly reason: "INVALID_LEDGER" | "INVALID_OCCURRENCE_AUTHORITY";
      readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
    };

type OccurrenceAuthorityDiagnostic = {
  readonly garmentKey: string;
};

type ResolvedOccurrenceAuthority = {
  readonly byGarmentKey: ReadonlyMap<
    string,
    { readonly occurrence: PhysicalGarmentOccurrence; readonly token: string }
  >;
  readonly diagnostics: readonly OccurrenceAuthorityDiagnostic[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const isSafeIdentifier = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 1024 &&
  value.trim() === value &&
  value !== "__proto__" &&
  value !== "constructor" &&
  value !== "prototype" &&
  !/[\u0000-\u001f\u007f]/.test(value);

const isNonNegativeRevision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const isPositiveRevision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const isLedgerShapeValid = (
  ledger: unknown,
): ledger is GarmentScopedDesignStyleAssignmentLedgerV2 =>
  isRecord(ledger) &&
  ledger.schemaVersion ===
    GARMENT_SCOPED_DESIGN_STYLE_ASSIGNMENT_SCHEMA_VERSION &&
  isNonNegativeRevision(ledger.revision) &&
  isRecord(ledger.assignmentsByGarmentKey);

const nextRevision = (revision: number): number | null => {
  const next = revision + 1;
  return Number.isSafeInteger(next) ? next : null;
};

const resolveOccurrenceAuthority = (
  activeOccurrences: readonly PhysicalGarmentOccurrence[],
): ResolvedOccurrenceAuthority => {
  const byGarmentKey = new Map<
    string,
    { occurrence: PhysicalGarmentOccurrence; token: string }
  >();
  const tokens = new Set<string>();
  const diagnostics: OccurrenceAuthorityDiagnostic[] = [];

  activeOccurrences.forEach((occurrence) => {
    if (
      !isSafeIdentifier(occurrence.garmentKey) ||
      !isPositiveRevision(occurrence.occurrenceGeneration)
    ) {
      diagnostics.push({ garmentKey: occurrence.garmentKey });
      return;
    }
    const token = createPhysicalGarmentOccurrenceIdentityToken({
      garmentKey: occurrence.garmentKey,
      generation: occurrence.occurrenceGeneration,
    });
    if (byGarmentKey.has(occurrence.garmentKey) || tokens.has(token)) {
      diagnostics.push({ garmentKey: occurrence.garmentKey });
      return;
    }
    byGarmentKey.set(occurrence.garmentKey, { occurrence, token });
    tokens.add(token);
  });

  return { byGarmentKey, diagnostics };
};

const rejectMutation = (
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2,
  reason: GarmentDesignStyleAssignmentMutationRejection,
): GarmentDesignStyleAssignmentMutationResult => ({
  status: "rejected",
  reason,
  ledger,
});

const resolveMutationTarget = ({
  ledger,
  expectedLedgerRevision,
  activeOccurrences,
  target,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  expectedLedgerRevision: number;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  target: GarmentDesignStyleAssignmentTarget;
}):
  | {
      readonly status: "resolved";
      readonly currentToken: string;
      readonly existing: GarmentDesignStyleAssignmentV2 | null;
    }
  | {
      readonly status: "rejected";
      readonly reason: GarmentDesignStyleAssignmentMutationRejection;
    } => {
  if (!isLedgerShapeValid(ledger) || nextRevision(ledger.revision) === null) {
    return { status: "rejected", reason: "INVALID_LEDGER" };
  }
  if (expectedLedgerRevision !== ledger.revision) {
    return { status: "rejected", reason: "STALE_LEDGER_REVISION" };
  }

  const authority = resolveOccurrenceAuthority(activeOccurrences);
  if (authority.diagnostics.length > 0) {
    return { status: "rejected", reason: "INVALID_OCCURRENCE_AUTHORITY" };
  }
  const matchingOccurrences = activeOccurrences.filter(
    (occurrence) => occurrence.garmentKey === target.garmentKey,
  );
  if (matchingOccurrences.length > 1) {
    return { status: "rejected", reason: "OCCURRENCE_AMBIGUOUS" };
  }
  const current = authority.byGarmentKey.get(target.garmentKey);
  if (!current) {
    return { status: "rejected", reason: "OCCURRENCE_NOT_FOUND" };
  }
  if (!isSafeIdentifier(target.occurrenceToken)) {
    return { status: "rejected", reason: "OCCURRENCE_IDENTITY_UNAVAILABLE" };
  }
  if (current.token !== target.occurrenceToken) {
    return { status: "rejected", reason: "OCCURRENCE_TOKEN_MISMATCH" };
  }

  const rawExisting = hasOwn(
    ledger.assignmentsByGarmentKey,
    target.garmentKey,
  )
    ? ledger.assignmentsByGarmentKey[target.garmentKey]
    : undefined;
  if (rawExisting !== undefined) {
    const existing = validateAssignmentShape(rawExisting, target.garmentKey);
    if (!existing) {
      return { status: "rejected", reason: "INVALID_EXISTING_ASSIGNMENT" };
    }
    if (existing.occurrenceToken !== current.token) {
      return { status: "rejected", reason: "STALE_ASSIGNMENT_PRESENT" };
    }
    return {
      status: "resolved",
      currentToken: current.token,
      existing,
    };
  }
  return {
    status: "resolved",
    currentToken: current.token,
    existing: null,
  };
};

const sourceIdentityIsValid = (
  sourceKind: "catalog" | "uploaded",
  source: CatalogDesignStyleAssignmentInput | UploadedDesignStyleAssignmentInput,
): boolean => {
  if (!isSafeIdentifier(source.sourceKey)) return false;
  if (sourceKind === "catalog") {
    return (
      "catalogStyleId" in source &&
      isSafeIdentifier(source.catalogStyleId) &&
      isSafeIdentifier(source.eligibilityFingerprint) &&
      (source.adaptabilityConfirmationFingerprint === undefined ||
        isSafeIdentifier(source.adaptabilityConfirmationFingerprint)) &&
      !("uploadedSourceRef" in source)
    );
  }
  return (
    "uploadedSourceRef" in source &&
    isSafeIdentifier(source.uploadedSourceRef) &&
    !("catalogStyleId" in source) &&
    !("eligibilityFingerprint" in source) &&
    !("adaptabilityConfirmationFingerprint" in source)
  );
};

const assignmentSourceEquals = (
  assignment: GarmentDesignStyleAssignmentV2,
  sourceKind: "catalog" | "uploaded",
  source: CatalogDesignStyleAssignmentInput | UploadedDesignStyleAssignmentInput,
): boolean => {
  if (assignment.sourceKind !== sourceKind) return false;
  if (sourceKind === "catalog" && "catalogStyleId" in source) {
    return (
      assignment.sourceKind === "catalog" &&
      assignment.sourceKey === source.sourceKey &&
      assignment.catalogStyleId === source.catalogStyleId &&
      assignment.eligibilityFingerprint === source.eligibilityFingerprint &&
      assignment.adaptabilityConfirmationFingerprint ===
        source.adaptabilityConfirmationFingerprint
    );
  }
  return (
    assignment.sourceKind === "uploaded" &&
    "uploadedSourceRef" in source &&
    assignment.sourceKey === source.sourceKey &&
    assignment.uploadedSourceRef === source.uploadedSourceRef
  );
};

const assignDesignStyleSource = ({
  ledger,
  expectedLedgerRevision,
  activeOccurrences,
  target,
  sourceKind,
  source,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  expectedLedgerRevision: number;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  target: GarmentDesignStyleAssignmentTarget;
  sourceKind: "catalog" | "uploaded";
  source: CatalogDesignStyleAssignmentInput | UploadedDesignStyleAssignmentInput;
}): GarmentDesignStyleAssignmentMutationResult => {
  const resolved = resolveMutationTarget({
    ledger,
    expectedLedgerRevision,
    activeOccurrences,
    target,
  });
  if (resolved.status === "rejected") {
    return rejectMutation(ledger, resolved.reason);
  }
  if (!sourceIdentityIsValid(sourceKind, source)) {
    return rejectMutation(ledger, "INVALID_SOURCE_IDENTITY");
  }
  if (
    resolved.existing &&
    assignmentSourceEquals(resolved.existing, sourceKind, source)
  ) {
    return {
      status: "unchanged",
      reason: "ASSIGNMENT_ALREADY_CURRENT",
      ledger,
    };
  }

  const assignmentRevision = resolved.existing
    ? nextRevision(resolved.existing.assignmentRevision)
    : 1;
  const ledgerRevision = nextRevision(ledger.revision);
  if (assignmentRevision === null || ledgerRevision === null) {
    return rejectMutation(ledger, "INVALID_LEDGER");
  }
  const identity: GarmentDesignStyleAssignmentIdentityV2 = {
    garmentKey: target.garmentKey,
    occurrenceToken: resolved.currentToken,
    assignmentRevision,
  };
  const assignment: GarmentDesignStyleAssignmentV2 =
    sourceKind === "catalog" && "catalogStyleId" in source
      ? {
          ...identity,
          sourceKind: "catalog",
          sourceKey: source.sourceKey,
          catalogStyleId: source.catalogStyleId,
          eligibilityFingerprint: source.eligibilityFingerprint,
          ...(source.adaptabilityConfirmationFingerprint
            ? {
                adaptabilityConfirmationFingerprint:
                  source.adaptabilityConfirmationFingerprint,
              }
            : {}),
        }
      : {
          ...identity,
          sourceKind: "uploaded",
          sourceKey: source.sourceKey,
          uploadedSourceRef: (source as UploadedDesignStyleAssignmentInput)
            .uploadedSourceRef,
        };
  const nextLedger: GarmentScopedDesignStyleAssignmentLedgerV2 = {
    schemaVersion: GARMENT_SCOPED_DESIGN_STYLE_ASSIGNMENT_SCHEMA_VERSION,
    revision: ledgerRevision,
    assignmentsByGarmentKey: {
      ...ledger.assignmentsByGarmentKey,
      [target.garmentKey]: assignment,
    },
  };
  return {
    status: "applied",
    action: resolved.existing ? "replaced" : "assigned",
    ledger: nextLedger,
    previousAssignment: resolved.existing,
    assignment,
  };
};

export const createEmptyGarmentScopedDesignStyleAssignmentLedger =
  (): GarmentScopedDesignStyleAssignmentLedgerV2 => ({
    schemaVersion: GARMENT_SCOPED_DESIGN_STYLE_ASSIGNMENT_SCHEMA_VERSION,
    revision: 0,
    assignmentsByGarmentKey: {},
  });

export const getGarmentScopedDesignStyleAssignment = (
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2,
  garmentKey: string,
): GarmentDesignStyleAssignmentV2 | null =>
  hasOwn(ledger.assignmentsByGarmentKey, garmentKey)
    ? ledger.assignmentsByGarmentKey[garmentKey] || null
    : null;

export const assignCatalogDesignStyleToGarmentOccurrence = (input: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  expectedLedgerRevision: number;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  target: GarmentDesignStyleAssignmentTarget;
  source: CatalogDesignStyleAssignmentInput;
}): GarmentDesignStyleAssignmentMutationResult =>
  assignDesignStyleSource({ ...input, sourceKind: "catalog" });

export const assignUploadedDesignStyleToGarmentOccurrence = (input: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  expectedLedgerRevision: number;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  target: GarmentDesignStyleAssignmentTarget;
  source: UploadedDesignStyleAssignmentInput;
}): GarmentDesignStyleAssignmentMutationResult =>
  assignDesignStyleSource({ ...input, sourceKind: "uploaded" });

export const clearGarmentDesignStyleAssignment = ({
  ledger,
  expectedLedgerRevision,
  activeOccurrences,
  target,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  expectedLedgerRevision: number;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  target: GarmentDesignStyleAssignmentTarget;
}): GarmentDesignStyleAssignmentMutationResult => {
  const resolved = resolveMutationTarget({
    ledger,
    expectedLedgerRevision,
    activeOccurrences,
    target,
  });
  if (resolved.status === "rejected") {
    return rejectMutation(ledger, resolved.reason);
  }
  if (!resolved.existing) {
    return { status: "unchanged", reason: "ASSIGNMENT_NOT_FOUND", ledger };
  }
  const revision = nextRevision(ledger.revision);
  if (revision === null) return rejectMutation(ledger, "INVALID_LEDGER");
  const { [target.garmentKey]: _removed, ...assignmentsByGarmentKey } =
    ledger.assignmentsByGarmentKey;
  return {
    status: "applied",
    action: "cleared",
    ledger: {
      schemaVersion: GARMENT_SCOPED_DESIGN_STYLE_ASSIGNMENT_SCHEMA_VERSION,
      revision,
      assignmentsByGarmentKey,
    },
    previousAssignment: resolved.existing,
    assignment: null,
  };
};

export const removeExactGarmentDesignStyleAssignment = ({
  ledger,
  expectedLedgerRevision,
  target,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  expectedLedgerRevision: number;
  target: GarmentDesignStyleAssignmentTarget;
}): GarmentDesignStyleAssignmentMutationResult => {
  if (!isLedgerShapeValid(ledger) || nextRevision(ledger.revision) === null) {
    return rejectMutation(ledger, "INVALID_LEDGER");
  }
  if (expectedLedgerRevision !== ledger.revision) {
    return rejectMutation(ledger, "STALE_LEDGER_REVISION");
  }
  const rawExisting = hasOwn(
    ledger.assignmentsByGarmentKey,
    target.garmentKey,
  )
    ? ledger.assignmentsByGarmentKey[target.garmentKey]
    : undefined;
  if (!rawExisting) {
    return { status: "unchanged", reason: "ASSIGNMENT_NOT_FOUND", ledger };
  }
  const existing = validateAssignmentShape(rawExisting, target.garmentKey);
  if (!existing) {
    return rejectMutation(ledger, "INVALID_EXISTING_ASSIGNMENT");
  }
  if (existing.occurrenceToken !== target.occurrenceToken) {
    return rejectMutation(ledger, "OCCURRENCE_TOKEN_MISMATCH");
  }
  const revision = nextRevision(ledger.revision);
  if (revision === null) return rejectMutation(ledger, "INVALID_LEDGER");
  const { [target.garmentKey]: _removed, ...assignmentsByGarmentKey } =
    ledger.assignmentsByGarmentKey;
  return {
    status: "applied",
    action: "removed",
    ledger: {
      schemaVersion: GARMENT_SCOPED_DESIGN_STYLE_ASSIGNMENT_SCHEMA_VERSION,
      revision,
      assignmentsByGarmentKey,
    },
    previousAssignment: existing,
    assignment: null,
  };
};

export const reconcileGarmentScopedDesignStyleAssignmentLedger = ({
  ledger,
  activeOccurrences,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
}): GarmentScopedDesignStyleReconciliationResult => {
  if (!isLedgerShapeValid(ledger) || nextRevision(ledger.revision) === null) {
    return { status: "blocked", reason: "INVALID_LEDGER", ledger };
  }
  const authority = resolveOccurrenceAuthority(activeOccurrences);
  if (authority.diagnostics.length > 0) {
    return {
      status: "blocked",
      reason: "INVALID_OCCURRENCE_AUTHORITY",
      ledger,
    };
  }

  const assignmentsByGarmentKey: Record<
    string,
    GarmentDesignStyleAssignmentV2
  > = {};
  const removed: {
    garmentKey: string;
    reason: "ORPHANED" | "STALE_OCCURRENCE_TOKEN";
    assignment: GarmentDesignStyleAssignmentV2;
  }[] = [];
  Object.entries(ledger.assignmentsByGarmentKey).forEach(
    ([garmentKey, assignment]) => {
      const current = authority.byGarmentKey.get(garmentKey);
      if (!current) {
        removed.push({ garmentKey, reason: "ORPHANED", assignment });
        return;
      }
      if (assignment.occurrenceToken !== current.token) {
        removed.push({
          garmentKey,
          reason: "STALE_OCCURRENCE_TOKEN",
          assignment,
        });
        return;
      }
      assignmentsByGarmentKey[garmentKey] = assignment;
    },
  );
  if (removed.length === 0) {
    return { status: "unchanged", ledger, removed };
  }
  return {
    status: "reconciled",
    ledger: {
      schemaVersion: GARMENT_SCOPED_DESIGN_STYLE_ASSIGNMENT_SCHEMA_VERSION,
      revision: ledger.revision + 1,
      assignmentsByGarmentKey,
    },
    removed,
  };
};

const validateAssignmentShape = (
  raw: unknown,
  mapGarmentKey: string,
): GarmentDesignStyleAssignmentV2 | null => {
  if (
    !isRecord(raw) ||
    raw.garmentKey !== mapGarmentKey ||
    !isSafeIdentifier(raw.garmentKey) ||
    !isSafeIdentifier(raw.occurrenceToken) ||
    !isPositiveRevision(raw.assignmentRevision) ||
    !isSafeIdentifier(raw.sourceKey)
  ) {
    return null;
  }
  if (raw.sourceKind === "catalog") {
    if (
      !isSafeIdentifier(raw.catalogStyleId) ||
      !isSafeIdentifier(raw.eligibilityFingerprint) ||
      (raw.adaptabilityConfirmationFingerprint !== undefined &&
        !isSafeIdentifier(raw.adaptabilityConfirmationFingerprint)) ||
      hasOwn(raw, "uploadedSourceRef")
    ) {
      return null;
    }
    return raw as unknown as CatalogGarmentDesignStyleAssignmentV2;
  }
  if (raw.sourceKind === "uploaded") {
    if (
      !isSafeIdentifier(raw.uploadedSourceRef) ||
      hasOwn(raw, "catalogStyleId") ||
      hasOwn(raw, "eligibilityFingerprint") ||
      hasOwn(raw, "adaptabilityConfirmationFingerprint")
    ) {
      return null;
    }
    return raw as unknown as UploadedGarmentDesignStyleAssignmentV2;
  }
  return null;
};

const NEEDS_REVIEW_CODES = new Set<GarmentScopedDesignStyleValidationDiagnosticCode>([
  "INVALID_OCCURRENCE_AUTHORITY",
  "INVALID_LEDGER",
  "LEGACY_SCALAR_REVIEW_REQUIRED",
  "ORPHAN_ASSIGNMENT",
  "ASSIGNMENT_GARMENT_KEY_MISMATCH",
  "STALE_OCCURRENCE_TOKEN",
  "INVALID_SOURCE_SHAPE",
  "CATALOG_STYLE_UNAVAILABLE",
  "CATALOG_STYLE_MALFORMED",
  "CATALOG_SOURCE_IDENTITY_MISMATCH",
  "ELIGIBILITY_FINGERPRINT_CHANGED",
  "GARMENT_INCOMPATIBLE",
  "ADAPTABILITY_CONFIRMATION_REQUIRED",
  "UPLOAD_SOURCE_UNAVAILABLE",
  "UPLOAD_SOURCE_MALFORMED",
  "UPLOAD_SOURCE_IDENTITY_MISMATCH",
  "UPLOAD_OCCURRENCE_INCOMPATIBLE",
]);

const AWAITING_CODES = new Set<GarmentScopedDesignStyleValidationDiagnosticCode>([
  "CATALOGUE_LOADING",
  "CATALOGUE_ERROR",
  "UPLOAD_SOURCE_AWAITING_CONFIRMATION",
]);

export const validateGarmentScopedDesignStyleAssignmentLedger = ({
  ledger,
  activeOccurrences,
  authority,
}: {
  ledger: unknown;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  authority: GarmentScopedDesignStyleValidationAuthority;
}): GarmentScopedDesignStyleValidationResult => {
  const diagnostics: GarmentScopedDesignStyleValidationDiagnostic[] = [];
  const occurrencesByGarmentKey: Record<
    string,
    GarmentDesignStyleOccurrenceValidation
  > = {};
  const validOccurrenceTokens: string[] = [];
  const missingOccurrenceTokens: string[] = [];
  const orphanedAssignmentGarmentKeys: string[] = [];
  const occurrenceAuthority = resolveOccurrenceAuthority(activeOccurrences);

  occurrenceAuthority.diagnostics.forEach(({ garmentKey }) => {
    diagnostics.push({ code: "INVALID_OCCURRENCE_AUTHORITY", garmentKey });
  });
  if (activeOccurrences.length === 0) {
    diagnostics.push({ code: "NO_ACTIVE_OCCURRENCES" });
  }
  if (authority.unresolvedLegacyScalar) {
    diagnostics.push({ code: "LEGACY_SCALAR_REVIEW_REQUIRED" });
  }
  if (!isLedgerShapeValid(ledger)) {
    diagnostics.push({ code: "INVALID_LEDGER" });
  }

  const rawAssignments = isLedgerShapeValid(ledger)
    ? ledger.assignmentsByGarmentKey
    : {};
  Object.keys(rawAssignments).forEach((garmentKey) => {
    if (!occurrenceAuthority.byGarmentKey.has(garmentKey)) {
      orphanedAssignmentGarmentKeys.push(garmentKey);
      diagnostics.push({ code: "ORPHAN_ASSIGNMENT", garmentKey });
    }
  });

  occurrenceAuthority.byGarmentKey.forEach(({ token }, garmentKey) => {
    const occurrenceDiagnostics: GarmentScopedDesignStyleValidationDiagnostic[] = [];
    const pushOccurrenceDiagnostic = (
      diagnostic: GarmentScopedDesignStyleValidationDiagnostic,
    ) => {
      occurrenceDiagnostics.push(diagnostic);
      diagnostics.push(diagnostic);
    };
    const rawAssignment = hasOwn(rawAssignments, garmentKey)
      ? rawAssignments[garmentKey]
      : undefined;
    if (rawAssignment === undefined) {
      const diagnostic = {
        code: "MISSING_ASSIGNMENT" as const,
        garmentKey,
        occurrenceToken: token,
      };
      pushOccurrenceDiagnostic(diagnostic);
      missingOccurrenceTokens.push(token);
      occurrencesByGarmentKey[garmentKey] = {
        garmentKey,
        occurrenceToken: token,
        status: "unassigned",
        assignment: null,
        diagnostics: occurrenceDiagnostics,
      };
      return;
    }
    if (
      !isRecord(rawAssignment) ||
      rawAssignment.garmentKey !== garmentKey
    ) {
      pushOccurrenceDiagnostic({
        code: "ASSIGNMENT_GARMENT_KEY_MISMATCH",
        garmentKey,
        occurrenceToken: token,
      });
      occurrencesByGarmentKey[garmentKey] = {
        garmentKey,
        occurrenceToken: token,
        status: "invalid",
        assignment: null,
        diagnostics: occurrenceDiagnostics,
      };
      return;
    }
    const assignment = validateAssignmentShape(rawAssignment, garmentKey);
    if (!assignment) {
      pushOccurrenceDiagnostic({
        code: "INVALID_SOURCE_SHAPE",
        garmentKey,
        occurrenceToken: token,
      });
      occurrencesByGarmentKey[garmentKey] = {
        garmentKey,
        occurrenceToken: token,
        status: "invalid",
        assignment: null,
        diagnostics: occurrenceDiagnostics,
      };
      return;
    }
    if (assignment.occurrenceToken !== token) {
      pushOccurrenceDiagnostic({
        code: "STALE_OCCURRENCE_TOKEN",
        garmentKey,
        occurrenceToken: token,
        sourceKey: assignment.sourceKey,
      });
      occurrencesByGarmentKey[garmentKey] = {
        garmentKey,
        occurrenceToken: token,
        status: "stale",
        assignment,
        diagnostics: occurrenceDiagnostics,
      };
      return;
    }

    let status: GarmentDesignStyleOccurrenceValidationStatus = "valid";
    if (assignment.sourceKind === "catalog") {
      if (authority.catalogueState !== "ready") {
        pushOccurrenceDiagnostic({
          code:
            authority.catalogueState === "loading"
              ? "CATALOGUE_LOADING"
              : "CATALOGUE_ERROR",
          garmentKey,
          occurrenceToken: token,
          sourceKey: assignment.sourceKey,
        });
        status = "awaiting_validation";
      } else {
        const style = authority.catalogStylesById[assignment.catalogStyleId];
        if (!style || style.availability === "unavailable") {
          pushOccurrenceDiagnostic({
            code: "CATALOG_STYLE_UNAVAILABLE",
            garmentKey,
            occurrenceToken: token,
            sourceKey: assignment.sourceKey,
          });
          status = "unavailable";
        } else if (
          style.availability === "malformed" ||
          style.styleId !== assignment.catalogStyleId
        ) {
          pushOccurrenceDiagnostic({
            code: "CATALOG_STYLE_MALFORMED",
            garmentKey,
            occurrenceToken: token,
            sourceKey: assignment.sourceKey,
          });
          status = "invalid";
        } else if (style.sourceKey !== assignment.sourceKey) {
          pushOccurrenceDiagnostic({
            code: "CATALOG_SOURCE_IDENTITY_MISMATCH",
            garmentKey,
            occurrenceToken: token,
            sourceKey: assignment.sourceKey,
          });
          status = "needs_review";
        } else if (
          style.eligibilityFingerprint !== assignment.eligibilityFingerprint
        ) {
          pushOccurrenceDiagnostic({
            code: "ELIGIBILITY_FINGERPRINT_CHANGED",
            garmentKey,
            occurrenceToken: token,
            sourceKey: assignment.sourceKey,
          });
          status = "needs_review";
        } else {
          const eligibility = style.occurrenceEligibilityByToken[token];
          if (!eligibility || eligibility.status === "incompatible") {
            pushOccurrenceDiagnostic({
              code: "GARMENT_INCOMPATIBLE",
              garmentKey,
              occurrenceToken: token,
              sourceKey: assignment.sourceKey,
            });
            status = "incompatible";
          } else if (
            eligibility.status === "adaptable" &&
            assignment.adaptabilityConfirmationFingerprint !==
              eligibility.requiredConfirmationFingerprint
          ) {
            pushOccurrenceDiagnostic({
              code: "ADAPTABILITY_CONFIRMATION_REQUIRED",
              garmentKey,
              occurrenceToken: token,
              sourceKey: assignment.sourceKey,
            });
            status = "needs_review";
          }
        }
      }
    } else {
      const upload = authority.uploadedSourcesByKey[assignment.sourceKey];
      if (!upload || upload.status === "unavailable") {
        pushOccurrenceDiagnostic({
          code: "UPLOAD_SOURCE_UNAVAILABLE",
          garmentKey,
          occurrenceToken: token,
          sourceKey: assignment.sourceKey,
        });
        status = "unavailable";
      } else if (upload.status === "malformed") {
        pushOccurrenceDiagnostic({
          code: "UPLOAD_SOURCE_MALFORMED",
          garmentKey,
          occurrenceToken: token,
          sourceKey: assignment.sourceKey,
        });
        status = "invalid";
      } else if (upload.uploadedSourceRef !== assignment.uploadedSourceRef) {
        pushOccurrenceDiagnostic({
          code: "UPLOAD_SOURCE_IDENTITY_MISMATCH",
          garmentKey,
          occurrenceToken: token,
          sourceKey: assignment.sourceKey,
        });
        status = "needs_review";
      } else if (upload.status === "pending") {
        pushOccurrenceDiagnostic({
          code: "UPLOAD_SOURCE_AWAITING_CONFIRMATION",
          garmentKey,
          occurrenceToken: token,
          sourceKey: assignment.sourceKey,
        });
        status = "awaiting_validation";
      } else if (!upload.eligibleOccurrenceTokens.includes(token)) {
        pushOccurrenceDiagnostic({
          code: "UPLOAD_OCCURRENCE_INCOMPATIBLE",
          garmentKey,
          occurrenceToken: token,
          sourceKey: assignment.sourceKey,
        });
        status = "incompatible";
      }
    }

    if (status === "valid") validOccurrenceTokens.push(token);
    occurrencesByGarmentKey[garmentKey] = {
      garmentKey,
      occurrenceToken: token,
      status,
      assignment,
      diagnostics: occurrenceDiagnostics,
    };
  });

  const isComplete =
    occurrenceAuthority.byGarmentKey.size > 0 &&
    diagnostics.length === 0 &&
    validOccurrenceTokens.length === occurrenceAuthority.byGarmentKey.size &&
    Object.keys(rawAssignments).length === occurrenceAuthority.byGarmentKey.size;
  const status: GarmentScopedDesignStyleValidationResult["status"] = isComplete
    ? "complete"
    : diagnostics.some((diagnostic) => NEEDS_REVIEW_CODES.has(diagnostic.code))
      ? "needs_review"
      : diagnostics.some((diagnostic) => AWAITING_CODES.has(diagnostic.code))
        ? "awaiting_validation"
        : "incomplete";

  return {
    status,
    isComplete,
    occurrencesByGarmentKey,
    validOccurrenceTokens,
    missingOccurrenceTokens,
    orphanedAssignmentGarmentKeys,
    diagnostics,
  };
};
