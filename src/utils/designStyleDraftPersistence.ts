import type {
  DesignSource,
  GarmentTypeStepSelection,
  GuestDesignDraft,
  StyleCategory,
} from "../types";
import {
  getDesignStyleAuthorityMetadata,
  isAuthoritativeDesignStyleProjection,
} from "./designStyleAuthority";
import { resolveFutureDesignStyleCompatibility } from "./designStudioFutureDesignStyle";
import {
  createPhysicalGarmentOccurrenceIdentityToken,
} from "./physicalGarmentOccurrenceIdentity";
import {
  isValidUploadedDesignDraftSource,
  type PhysicalGarmentOccurrence,
} from "./designSourceState";
import {
  createEmptyGarmentScopedDesignStyleAssignmentLedger,
  reconcileGarmentScopedDesignStyleAssignmentLedger,
  validateGarmentScopedDesignStyleAssignmentLedger,
  GARMENT_SCOPED_DESIGN_STYLE_ASSIGNMENT_SCHEMA_VERSION,
  type CatalogDesignStyleAuthorityFacts,
  type GarmentDesignStyleAssignmentV2,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
  type GarmentScopedDesignStyleReconciliationResult,
  type GarmentScopedDesignStyleValidationAuthority,
  type GarmentScopedDesignStyleValidationResult,
  type UploadedDesignStyleAuthorityFacts,
} from "./garmentScopedDesignStyleAssignment";

export const DESIGN_STYLE_DRAFT_FIELD = "designStyleAssignmentDraft" as const;
export const DESIGN_STYLE_DRAFT_SCHEMA_VERSION = 2 as const;
export const DESIGN_STYLE_MIGRATION_EVIDENCE_SCHEMA_VERSION = 1 as const;

const LEGACY_SCALAR_SCHEMA = "design_style_scalar_v1" as const;
const MAX_ASSIGNMENT_COUNT = 512;

export type DesignStyleMigrationReason =
  | "zero_occurrences"
  | "multiple_occurrences"
  | "explicit_reselection_required"
  | "occurrence_identity_unresolved"
  | "catalogue_loading"
  | "catalogue_error"
  | "catalog_style_unavailable"
  | "catalog_style_incompatible"
  | "adaptability_confirmation_required"
  | "uploaded_authority_pending"
  | "uploaded_authority_unavailable";

interface LegacyDesignStyleMigrationEvidenceBaseV1 {
  readonly schemaVersion: 1;
  readonly legacySchema: typeof LEGACY_SCALAR_SCHEMA;
  readonly sourceKey: string;
  readonly confirmationStatus: "confirmed" | "unconfirmed";
}

export interface LegacyCatalogDesignStyleMigrationEvidenceV1
  extends LegacyDesignStyleMigrationEvidenceBaseV1 {
  readonly sourceKind: "catalog";
  readonly catalogStyleId: string;
  readonly reason: DesignStyleMigrationReason;
}

export interface LegacyUploadedDesignStyleMigrationEvidenceV1
  extends LegacyDesignStyleMigrationEvidenceBaseV1 {
  readonly sourceKind: "uploaded";
  /** Opaque design-reference identity; never a private storage path. */
  readonly uploadedSourceRef: string;
  readonly reason: DesignStyleMigrationReason;
}

export type PersistedDesignStyleMigrationEvidenceV1 =
  | LegacyCatalogDesignStyleMigrationEvidenceV1
  | LegacyUploadedDesignStyleMigrationEvidenceV1;

export interface PersistedDesignStyleDraftV2 {
  readonly schemaVersion: 2;
  readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  readonly migration?: PersistedDesignStyleMigrationEvidenceV1;
}

export type PersistedDesignStyleDraftParseResult =
  | { readonly status: "absent" }
  | {
      readonly status: "valid";
      readonly envelope: PersistedDesignStyleDraftV2;
    }
  | { readonly status: "malformed"; readonly reason: string }
  | {
      readonly status: "unsupported";
      readonly schemaVersion: unknown;
    };

type LegacyCatalogScalarEvidence = Omit<
  LegacyCatalogDesignStyleMigrationEvidenceV1,
  "reason"
>;
type LegacyUploadedScalarEvidence = Omit<
  LegacyUploadedDesignStyleMigrationEvidenceV1,
  "reason"
>;
type LegacyScalarEvidence =
  | LegacyCatalogScalarEvidence
  | LegacyUploadedScalarEvidence;

export type LegacyDesignStyleScalarDecodeResult =
  | { readonly status: "absent"; readonly fingerprint: "none" }
  | {
      readonly status: "valid";
      readonly evidence: LegacyScalarEvidence;
      readonly fingerprint: string;
    }
  | {
      readonly status: "invalid";
      readonly reason: string;
      readonly fingerprint: string;
    };

export type DesignStyleDraftHydrationStatus =
  | "valid-v2"
  | "valid-v2-reconciled"
  | "empty-v2"
  | "legacy-migrated"
  | "legacy-review-required"
  | "legacy-migration-pending-catalogue"
  | "legacy-migration-pending-upload"
  | "legacy-invalid"
  | "malformed-v2"
  | "unsupported-v2"
  | "occurrences-unresolved"
  | "validation-pending"
  | "assignments-invalid"
  | "assignments-need-review";

export interface DesignStyleDraftDiagnostic {
  readonly code: string;
}

export interface DesignStyleDraftHydrationResult {
  readonly status: DesignStyleDraftHydrationStatus;
  readonly envelope: PersistedDesignStyleDraftV2 | null;
  readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2 | null;
  readonly migrationEvidence: PersistedDesignStyleMigrationEvidenceV1 | null;
  readonly reconciliation: GarmentScopedDesignStyleReconciliationResult | null;
  readonly validation: GarmentScopedDesignStyleValidationResult | null;
  readonly diagnostics: readonly DesignStyleDraftDiagnostic[];
  readonly canAutosave: boolean;
  readonly destructiveNormalizationProhibited: boolean;
  readonly authorityPending: boolean;
  readonly reviewRequired: boolean;
  /** True only for an existing V2 field or a preserved/migrated legacy decision. */
  readonly shouldPersistEnvelope: boolean;
  readonly legacyScalarFingerprint: string;
}

export type DesignStyleDraftAutosaveResult =
  | {
      readonly status: "ready";
      readonly draft: GuestDesignDraft;
      readonly hydration: DesignStyleDraftHydrationResult;
    }
  | {
      readonly status: "blocked";
      readonly reason:
        | "STALE_HYDRATION_GENERATION"
        | "DESTRUCTIVE_AUTOSAVE_PROHIBITED"
        | "SCALAR_RUNTIME_CHANGED_AFTER_V2_HYDRATION"
        | "V2_REVALIDATION_FAILED";
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key));
};

const isSafeIdentifier = (value: unknown, maxLength = 1024): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maxLength &&
  value.trim() === value &&
  value !== "__proto__" &&
  value !== "constructor" &&
  value !== "prototype" &&
  !/[\u0000-\u001f\u007f]/.test(value);

const isOpaqueSourceReference = (value: unknown): value is string =>
  isSafeIdentifier(value, 256) && !/[\\/]/.test(value);

const isNonNegativeRevision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const isPositiveRevision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const cloneAssignment = (
  assignment: GarmentDesignStyleAssignmentV2,
): GarmentDesignStyleAssignmentV2 =>
  assignment.sourceKind === "catalog"
    ? {
        garmentKey: assignment.garmentKey,
        occurrenceToken: assignment.occurrenceToken,
        assignmentRevision: assignment.assignmentRevision,
        sourceKind: "catalog",
        sourceKey: assignment.sourceKey,
        catalogStyleId: assignment.catalogStyleId,
        eligibilityFingerprint: assignment.eligibilityFingerprint,
        ...(assignment.adaptabilityConfirmationFingerprint
          ? {
              adaptabilityConfirmationFingerprint:
                assignment.adaptabilityConfirmationFingerprint,
            }
          : {}),
      }
    : {
        garmentKey: assignment.garmentKey,
        occurrenceToken: assignment.occurrenceToken,
        assignmentRevision: assignment.assignmentRevision,
        sourceKind: "uploaded",
        sourceKey: assignment.sourceKey,
        uploadedSourceRef: assignment.uploadedSourceRef,
      };

const parseAssignment = (
  value: unknown,
  mapGarmentKey: string,
): GarmentDesignStyleAssignmentV2 | null => {
  if (
    !isRecord(value) ||
    !isSafeIdentifier(mapGarmentKey, 256) ||
    value.garmentKey !== mapGarmentKey ||
    !isSafeIdentifier(value.garmentKey, 256) ||
    !isSafeIdentifier(value.occurrenceToken) ||
    !isPositiveRevision(value.assignmentRevision) ||
    !isSafeIdentifier(value.sourceKey)
  ) {
    return null;
  }
  if (value.sourceKind === "catalog") {
    if (
      !hasExactKeys(
        value,
        [
          "garmentKey",
          "occurrenceToken",
          "assignmentRevision",
          "sourceKind",
          "sourceKey",
          "catalogStyleId",
          "eligibilityFingerprint",
        ],
        ["adaptabilityConfirmationFingerprint"],
      ) ||
      !isOpaqueSourceReference(value.catalogStyleId) ||
      !isSafeIdentifier(value.eligibilityFingerprint) ||
      value.sourceKey !== `catalog-style:${value.catalogStyleId}` ||
      (value.adaptabilityConfirmationFingerprint !== undefined &&
        !isSafeIdentifier(value.adaptabilityConfirmationFingerprint))
    ) {
      return null;
    }
    return cloneAssignment(
      value as unknown as GarmentDesignStyleAssignmentV2,
    );
  }
  if (value.sourceKind === "uploaded") {
    if (
      !hasExactKeys(value, [
        "garmentKey",
        "occurrenceToken",
        "assignmentRevision",
        "sourceKind",
        "sourceKey",
        "uploadedSourceRef",
      ]) ||
      !isOpaqueSourceReference(value.uploadedSourceRef) ||
      value.sourceKey !== `uploaded:${value.uploadedSourceRef}`
    ) {
      return null;
    }
    return cloneAssignment(
      value as unknown as GarmentDesignStyleAssignmentV2,
    );
  }
  return null;
};

const parseLedger = (
  value: unknown,
): GarmentScopedDesignStyleAssignmentLedgerV2 | null => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schemaVersion", "revision", "assignmentsByGarmentKey"]) ||
    value.schemaVersion !==
      GARMENT_SCOPED_DESIGN_STYLE_ASSIGNMENT_SCHEMA_VERSION ||
    !isNonNegativeRevision(value.revision) ||
    !isRecord(value.assignmentsByGarmentKey)
  ) {
    return null;
  }
  const entries = Object.entries(value.assignmentsByGarmentKey);
  if (entries.length > MAX_ASSIGNMENT_COUNT) return null;
  const assignmentsByGarmentKey: Record<string, GarmentDesignStyleAssignmentV2> = {};
  for (const [garmentKey, rawAssignment] of entries) {
    const assignment = parseAssignment(rawAssignment, garmentKey);
    if (!assignment || assignment.assignmentRevision > value.revision) return null;
    assignmentsByGarmentKey[garmentKey] = assignment;
  }
  return {
    schemaVersion: GARMENT_SCOPED_DESIGN_STYLE_ASSIGNMENT_SCHEMA_VERSION,
    revision: value.revision,
    assignmentsByGarmentKey,
  };
};

const MIGRATION_REASONS = new Set<DesignStyleMigrationReason>([
  "zero_occurrences",
  "multiple_occurrences",
  "explicit_reselection_required",
  "occurrence_identity_unresolved",
  "catalogue_loading",
  "catalogue_error",
  "catalog_style_unavailable",
  "catalog_style_incompatible",
  "adaptability_confirmation_required",
  "uploaded_authority_pending",
  "uploaded_authority_unavailable",
]);

const CATALOG_MIGRATION_REASONS = new Set<DesignStyleMigrationReason>([
  "zero_occurrences",
  "multiple_occurrences",
  "explicit_reselection_required",
  "occurrence_identity_unresolved",
  "catalogue_loading",
  "catalogue_error",
  "catalog_style_unavailable",
  "catalog_style_incompatible",
  "adaptability_confirmation_required",
]);

const UPLOADED_MIGRATION_REASONS = new Set<DesignStyleMigrationReason>([
  "zero_occurrences",
  "multiple_occurrences",
  "explicit_reselection_required",
  "occurrence_identity_unresolved",
  "uploaded_authority_pending",
  "uploaded_authority_unavailable",
]);

const parseMigrationEvidence = (
  value: unknown,
): PersistedDesignStyleMigrationEvidenceV1 | null => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== DESIGN_STYLE_MIGRATION_EVIDENCE_SCHEMA_VERSION ||
    value.legacySchema !== LEGACY_SCALAR_SCHEMA ||
    !isSafeIdentifier(value.sourceKey) ||
    (value.confirmationStatus !== "confirmed" &&
      value.confirmationStatus !== "unconfirmed") ||
    !MIGRATION_REASONS.has(value.reason as DesignStyleMigrationReason)
  ) {
    return null;
  }
  if (value.sourceKind === "catalog") {
    if (
      !hasExactKeys(value, [
        "schemaVersion",
        "legacySchema",
        "sourceKind",
        "sourceKey",
        "catalogStyleId",
        "confirmationStatus",
        "reason",
      ]) ||
      !isOpaqueSourceReference(value.catalogStyleId) ||
      value.sourceKey !== `catalog:${value.catalogStyleId}` ||
      !CATALOG_MIGRATION_REASONS.has(value.reason as DesignStyleMigrationReason)
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      legacySchema: LEGACY_SCALAR_SCHEMA,
      sourceKind: "catalog",
      sourceKey: value.sourceKey,
      catalogStyleId: value.catalogStyleId,
      confirmationStatus: value.confirmationStatus,
      reason: value.reason as DesignStyleMigrationReason,
    };
  }
  if (value.sourceKind === "uploaded") {
    if (
      !hasExactKeys(value, [
        "schemaVersion",
        "legacySchema",
        "sourceKind",
        "sourceKey",
        "uploadedSourceRef",
        "confirmationStatus",
        "reason",
      ]) ||
      !isOpaqueSourceReference(value.uploadedSourceRef) ||
      value.sourceKey !== `uploaded:${value.uploadedSourceRef}` ||
      !UPLOADED_MIGRATION_REASONS.has(value.reason as DesignStyleMigrationReason)
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      legacySchema: LEGACY_SCALAR_SCHEMA,
      sourceKind: "uploaded",
      sourceKey: value.sourceKey,
      uploadedSourceRef: value.uploadedSourceRef,
      confirmationStatus: value.confirmationStatus,
      reason: value.reason as DesignStyleMigrationReason,
    };
  }
  return null;
};

export const parsePersistedDesignStyleDraftEnvelope = (
  value: unknown,
): PersistedDesignStyleDraftParseResult => {
  if (!isRecord(value)) {
    return { status: "malformed", reason: "INVALID_V2_ENVELOPE" };
  }
  if (!hasOwn(value, "schemaVersion")) {
    return { status: "malformed", reason: "MISSING_V2_SCHEMA_VERSION" };
  }
  if (value.schemaVersion !== DESIGN_STYLE_DRAFT_SCHEMA_VERSION) {
    return { status: "unsupported", schemaVersion: value.schemaVersion };
  }
  if (!hasExactKeys(value, ["schemaVersion", "ledger"], ["migration"])) {
    return { status: "malformed", reason: "UNSUPPORTED_V2_ENVELOPE_FIELDS" };
  }
  const ledger = parseLedger(value.ledger);
  if (!ledger) return { status: "malformed", reason: "INVALID_V2_LEDGER" };
  const migration =
    value.migration === undefined
      ? null
      : parseMigrationEvidence(value.migration);
  if (value.migration !== undefined && !migration) {
    return { status: "malformed", reason: "INVALID_V2_MIGRATION_EVIDENCE" };
  }
  return {
    status: "valid",
    envelope: {
      schemaVersion: DESIGN_STYLE_DRAFT_SCHEMA_VERSION,
      ledger,
      ...(migration ? { migration } : {}),
    },
  };
};

export const inspectPersistedDesignStyleDraft = (
  rawDraft: unknown,
): PersistedDesignStyleDraftParseResult => {
  if (!isRecord(rawDraft) || !hasOwn(rawDraft, DESIGN_STYLE_DRAFT_FIELD)) {
    return { status: "absent" };
  }
  return parsePersistedDesignStyleDraftEnvelope(
    rawDraft[DESIGN_STYLE_DRAFT_FIELD],
  );
};

export const serializePersistedDesignStyleDraftEnvelope = (
  envelope: PersistedDesignStyleDraftV2,
): PersistedDesignStyleDraftV2 | null => {
  const parsed = parsePersistedDesignStyleDraftEnvelope(envelope);
  return parsed.status === "valid" ? parsed.envelope : null;
};

export const normalizeDesignStyleDraftFieldForGuestDraft = (
  draft: GuestDesignDraft,
): GuestDesignDraft => {
  const parsed = inspectPersistedDesignStyleDraft(draft);
  if (parsed.status !== "valid") return draft;
  return {
    ...draft,
    [DESIGN_STYLE_DRAFT_FIELD]: parsed.envelope,
  };
};

export const validateDesignStyleDraftFieldForStorage = (
  draft: unknown,
): { readonly status: "valid" } | { readonly status: "invalid"; readonly reason: string } => {
  const parsed = inspectPersistedDesignStyleDraft(draft);
  if (parsed.status === "absent" || parsed.status === "valid") {
    return { status: "valid" };
  }
  return {
    status: "invalid",
    reason:
      parsed.status === "unsupported"
        ? "unsupported_design_style_draft_version"
        : `malformed_design_style_draft:${parsed.reason}`,
  };
};

const isNullableSafeIdentifier = (value: unknown): boolean =>
  value === undefined || value === null || isSafeIdentifier(value);

const isNullableOpaqueSourceReference = (value: unknown): boolean =>
  value === undefined || value === null || isOpaqueSourceReference(value);

const hasExactCatalogSourceShape = (value: unknown): boolean =>
  isRecord(value) &&
  hasExactKeys(value, ["kind", "sourceKey", "styleId"]) &&
  value.kind === "catalog" &&
  isOpaqueSourceReference(value.styleId) &&
  value.sourceKey === `catalog:${value.styleId}`;

const hasExactUploadedSourceShape = (
  value: unknown,
): value is Extract<DesignSource, { kind: "uploaded" }> => {
  if (!isRecord(value) || !isValidUploadedDesignDraftSource(value)) return false;
  if (
    !hasExactKeys(value, [
      "kind",
      "sourceKey",
      "uploadReference",
      "fabricCapacityComposition",
      "demographic",
      "displayLabel",
    ]) ||
    !isRecord(value.uploadReference) ||
    !hasExactKeys(
      value.uploadReference,
      ["designReferenceId", "ownerUid", "storagePath", "mimeType", "createdAt"],
      ["originalFileName"],
    ) ||
    !Array.isArray(value.fabricCapacityComposition)
  ) {
    return false;
  }
  return value.fabricCapacityComposition.every(
    (spec) =>
      isRecord(spec) &&
      hasExactKeys(spec, ["key", "garmentType", "fabricUnits"], ["lowerGarmentType"]),
  );
};

const invalidScalar = (reason: string): LegacyDesignStyleScalarDecodeResult => ({
  status: "invalid",
  reason,
  fingerprint: `invalid:${reason}`,
});

export const decodeLegacyDesignStyleScalarEvidence = (
  rawDraft: unknown,
): LegacyDesignStyleScalarDecodeResult => {
  if (!isRecord(rawDraft)) return invalidScalar("INVALID_DRAFT_SHAPE");
  const selectedStyleId = rawDraft.selectedStyleId;
  const confirmedStyleId = rawDraft.confirmedStyleId;
  const confirmedDesignSourceKey = rawDraft.confirmedDesignSourceKey;
  const designSource = rawDraft.designSource;
  if (
    !isNullableOpaqueSourceReference(selectedStyleId) ||
    !isNullableOpaqueSourceReference(confirmedStyleId) ||
    !isNullableSafeIdentifier(confirmedDesignSourceKey)
  ) {
    return invalidScalar("INVALID_LEGACY_SCALAR_FIELD");
  }

  if (designSource === undefined || designSource === null) {
    if (selectedStyleId === undefined || selectedStyleId === null) {
      return confirmedStyleId || confirmedDesignSourceKey
        ? invalidScalar("ORPHANED_LEGACY_CONFIRMATION")
        : { status: "absent", fingerprint: "none" };
    }
    if (!isOpaqueSourceReference(selectedStyleId)) {
      return invalidScalar("INVALID_CATALOG_STYLE_ID");
    }
    const sourceKey = `catalog:${selectedStyleId}`;
    if (
      (confirmedStyleId !== undefined &&
        confirmedStyleId !== null &&
        confirmedStyleId !== selectedStyleId) ||
      (confirmedDesignSourceKey !== undefined &&
        confirmedDesignSourceKey !== null &&
        confirmedDesignSourceKey !== sourceKey)
    ) {
      return invalidScalar("CONFLICTING_CATALOG_SCALAR");
    }
    const evidence: LegacyCatalogScalarEvidence = {
      schemaVersion: 1,
      legacySchema: LEGACY_SCALAR_SCHEMA,
      sourceKind: "catalog",
      sourceKey,
      catalogStyleId: selectedStyleId,
      confirmationStatus:
        confirmedStyleId === selectedStyleId &&
        confirmedDesignSourceKey === sourceKey
          ? "confirmed"
          : "unconfirmed",
    };
    return {
      status: "valid",
      evidence,
      fingerprint: stableSerialize({
        sourceKind: evidence.sourceKind,
        sourceKey: evidence.sourceKey,
        catalogStyleId: evidence.catalogStyleId,
      }),
    };
  }

  if (hasExactCatalogSourceShape(designSource)) {
    const source = designSource as unknown as Extract<DesignSource, { kind: "catalog" }>;
    if (
      (selectedStyleId !== undefined &&
        selectedStyleId !== null &&
        selectedStyleId !== source.styleId) ||
      (confirmedStyleId !== undefined &&
        confirmedStyleId !== null &&
        confirmedStyleId !== source.styleId) ||
      (confirmedDesignSourceKey !== undefined &&
        confirmedDesignSourceKey !== null &&
        confirmedDesignSourceKey !== source.sourceKey)
    ) {
      return invalidScalar("CONFLICTING_CATALOG_SCALAR");
    }
    const evidence: LegacyCatalogScalarEvidence = {
      schemaVersion: 1,
      legacySchema: LEGACY_SCALAR_SCHEMA,
      sourceKind: "catalog",
      sourceKey: source.sourceKey,
      catalogStyleId: source.styleId,
      confirmationStatus:
        confirmedStyleId === source.styleId &&
        confirmedDesignSourceKey === source.sourceKey
          ? "confirmed"
          : "unconfirmed",
    };
    return {
      status: "valid",
      evidence,
      fingerprint: stableSerialize({
        sourceKind: evidence.sourceKind,
        sourceKey: evidence.sourceKey,
        catalogStyleId: evidence.catalogStyleId,
      }),
    };
  }

  if (hasExactUploadedSourceShape(designSource)) {
    const source = designSource as unknown as Extract<DesignSource, { kind: "uploaded" }>;
    if (
      (selectedStyleId !== undefined && selectedStyleId !== null) ||
      (confirmedStyleId !== undefined && confirmedStyleId !== null) ||
      (confirmedDesignSourceKey !== undefined &&
        confirmedDesignSourceKey !== null &&
        confirmedDesignSourceKey !== source.sourceKey)
    ) {
      return invalidScalar("CONFLICTING_UPLOADED_SCALAR");
    }
    const evidence: LegacyUploadedScalarEvidence = {
      schemaVersion: 1,
      legacySchema: LEGACY_SCALAR_SCHEMA,
      sourceKind: "uploaded",
      sourceKey: source.sourceKey,
      uploadedSourceRef: source.uploadReference.designReferenceId,
      confirmationStatus:
        confirmedDesignSourceKey === source.sourceKey
          ? "confirmed"
          : "unconfirmed",
    };
    return {
      status: "valid",
      evidence,
      fingerprint: stableSerialize({
        sourceKind: evidence.sourceKind,
        sourceKey: evidence.sourceKey,
        uploadedSourceRef: evidence.uploadedSourceRef,
        composition: source.fabricCapacityComposition,
        demographic: source.demographic,
      }),
    };
  }

  return invalidScalar("MALFORMED_LEGACY_DESIGN_SOURCE");
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const createDesignStyleAdaptabilityConfirmationFingerprint = ({
  eligibilityFingerprint,
  occurrenceToken,
}: {
  eligibilityFingerprint: string;
  occurrenceToken: string;
}): string =>
  `design-style-adaptability-v1:${hashString(eligibilityFingerprint)}:${hashString(
    occurrenceToken,
  )}`;

const occurrenceTokenFor = (
  occurrence: PhysicalGarmentOccurrence,
): string | null =>
  isSafeIdentifier(occurrence.garmentKey, 256) &&
  isPositiveRevision(occurrence.occurrenceGeneration)
    ? createPhysicalGarmentOccurrenceIdentityToken({
        garmentKey: occurrence.garmentKey,
        generation: occurrence.occurrenceGeneration,
      })
    : null;

export const buildDesignStyleDraftValidationAuthority = ({
  catalogueState,
  styles,
  garmentTypeSelection,
  activeOccurrences,
  uploadedSourcesByKey = {},
  unresolvedLegacyScalar = false,
}: {
  catalogueState: "loading" | "ready" | "error";
  styles: readonly StyleCategory[];
  garmentTypeSelection: GarmentTypeStepSelection;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  uploadedSourcesByKey?: Readonly<Record<string, UploadedDesignStyleAuthorityFacts>>;
  unresolvedLegacyScalar?: boolean;
}): GarmentScopedDesignStyleValidationAuthority => {
  const catalogStylesById: Record<string, CatalogDesignStyleAuthorityFacts> = {};
  styles.forEach((style) => {
    const metadata = getDesignStyleAuthorityMetadata(style);
    if (
      !isAuthoritativeDesignStyleProjection(style) ||
      !metadata ||
      metadata.lifecycle !== "published" ||
      metadata.sourceKey !== `catalog-style:${style.id}` ||
      !isSafeIdentifier(metadata.eligibilityFingerprint)
    ) {
      return;
    }
    const occurrenceEligibilityByToken: Record<
      string,
      CatalogDesignStyleAuthorityFacts["occurrenceEligibilityByToken"][string]
    > = {};
    activeOccurrences.forEach((occurrence) => {
      const occurrenceToken = occurrenceTokenFor(occurrence);
      if (!occurrenceToken) return;
      const compatibility = resolveFutureDesignStyleCompatibility({
        garmentTypeSelection: {
          ...garmentTypeSelection,
          garmentTypes: [occurrence.garmentType],
        },
        style,
      });
      if (compatibility.status === "exact_match") {
        occurrenceEligibilityByToken[occurrenceToken] = { status: "eligible" };
        return;
      }
      if (compatibility.status === "adaptable") {
        occurrenceEligibilityByToken[occurrenceToken] = {
          status: "adaptable",
          requiredConfirmationFingerprint:
            createDesignStyleAdaptabilityConfirmationFingerprint({
              eligibilityFingerprint: metadata.eligibilityFingerprint,
              occurrenceToken,
            }),
        };
        return;
      }
      occurrenceEligibilityByToken[occurrenceToken] = {
        status: "incompatible",
      };
    });
    catalogStylesById[style.id] = {
      styleId: style.id,
      sourceKey: metadata.sourceKey,
      availability: "available",
      eligibilityFingerprint: metadata.eligibilityFingerprint,
      occurrenceEligibilityByToken,
      displayRevision: String(metadata.publicRevision),
    };
  });
  return {
    catalogueState,
    catalogStylesById,
    uploadedSourcesByKey,
    ...(unresolvedLegacyScalar ? { unresolvedLegacyScalar: true } : {}),
  };
};

export const buildUploadedDesignStyleAuthority = ({
  source,
  confirmedDesignSourceKey,
  expectedOwnerUid,
  ownershipTransferPending,
  sourceOperationStable,
  activeOccurrences,
}: {
  source: unknown;
  confirmedDesignSourceKey: unknown;
  expectedOwnerUid: string | null;
  ownershipTransferPending: boolean;
  sourceOperationStable: boolean;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
}): Readonly<Record<string, UploadedDesignStyleAuthorityFacts>> => {
  if (!hasExactUploadedSourceShape(source)) return {};
  const uploadedSourceRef = source.uploadReference.designReferenceId;
  const status: UploadedDesignStyleAuthorityFacts["status"] =
    !expectedOwnerUid || ownershipTransferPending || !sourceOperationStable
      ? "pending"
      : source.uploadReference.ownerUid !== expectedOwnerUid
        ? "unavailable"
        : confirmedDesignSourceKey !== source.sourceKey
          ? "pending"
          : "confirmed";
  const supportedGarments = new Set(
    source.fabricCapacityComposition.map((spec) => spec.garmentType),
  );
  const eligibleOccurrenceTokens = activeOccurrences.flatMap((occurrence) => {
    const token = occurrenceTokenFor(occurrence);
    return token && supportedGarments.has(occurrence.garmentType) ? [token] : [];
  });
  return {
    [source.sourceKey]: {
      sourceKey: source.sourceKey,
      uploadedSourceRef,
      status,
      eligibleOccurrenceTokens,
    },
  };
};

const evidenceWithReason = (
  evidence: LegacyScalarEvidence,
  reason: DesignStyleMigrationReason,
): PersistedDesignStyleMigrationEvidenceV1 => ({ ...evidence, reason });

const envelopeFor = (
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2,
  migration: PersistedDesignStyleMigrationEvidenceV1 | null = null,
): PersistedDesignStyleDraftV2 => ({
  schemaVersion: DESIGN_STYLE_DRAFT_SCHEMA_VERSION,
  ledger,
  ...(migration ? { migration } : {}),
});

const diagnostic = (code: string): DesignStyleDraftDiagnostic => ({ code });

const baseResult = ({
  status,
  envelope,
  reconciliation = null,
  validation = null,
  diagnostics = [],
  canAutosave = true,
  destructiveNormalizationProhibited = false,
  authorityPending = false,
  reviewRequired = false,
  shouldPersistEnvelope = true,
  legacyScalarFingerprint,
}: {
  status: DesignStyleDraftHydrationStatus;
  envelope: PersistedDesignStyleDraftV2 | null;
  reconciliation?: GarmentScopedDesignStyleReconciliationResult | null;
  validation?: GarmentScopedDesignStyleValidationResult | null;
  diagnostics?: readonly DesignStyleDraftDiagnostic[];
  canAutosave?: boolean;
  destructiveNormalizationProhibited?: boolean;
  authorityPending?: boolean;
  reviewRequired?: boolean;
  shouldPersistEnvelope?: boolean;
  legacyScalarFingerprint: string;
}): DesignStyleDraftHydrationResult => ({
  status,
  envelope,
  ledger: envelope?.ledger || null,
  migrationEvidence: envelope?.migration || null,
  reconciliation,
  validation,
  diagnostics,
  canAutosave,
  destructiveNormalizationProhibited,
  authorityPending,
  reviewRequired,
  shouldPersistEnvelope,
  legacyScalarFingerprint,
});

const validateLedger = ({
  ledger,
  activeOccurrences,
  authority,
  unresolvedLegacyScalar,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  authority: GarmentScopedDesignStyleValidationAuthority;
  unresolvedLegacyScalar: boolean;
}): GarmentScopedDesignStyleValidationResult =>
  validateGarmentScopedDesignStyleAssignmentLedger({
    ledger,
    activeOccurrences,
    authority: {
      ...authority,
      ...(unresolvedLegacyScalar ? { unresolvedLegacyScalar: true } : {}),
    },
  });

const statusForValidation = (
  validation: GarmentScopedDesignStyleValidationResult,
  reconciled: boolean,
): DesignStyleDraftHydrationStatus => {
  if (validation.status === "complete") {
    return reconciled ? "valid-v2-reconciled" : "valid-v2";
  }
  if (validation.status === "awaiting_validation") return "validation-pending";
  if (validation.status === "needs_review") return "assignments-need-review";
  return "assignments-invalid";
};

const migrationStatusForReason = (
  reason: DesignStyleMigrationReason,
): DesignStyleDraftHydrationStatus => {
  if (reason === "catalogue_loading" || reason === "catalogue_error") {
    return "legacy-migration-pending-catalogue";
  }
  if (reason === "uploaded_authority_pending") {
    return "legacy-migration-pending-upload";
  }
  if (reason === "zero_occurrences" || reason === "occurrence_identity_unresolved") {
    return "occurrences-unresolved";
  }
  return "legacy-review-required";
};

const migrateLegacyEvidence = ({
  evidence,
  activeOccurrences,
  authority,
  legacyScalarFingerprint,
}: {
  evidence: LegacyScalarEvidence;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  authority: GarmentScopedDesignStyleValidationAuthority;
  legacyScalarFingerprint: string;
}): DesignStyleDraftHydrationResult => {
  const emptyLedger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  const preserve = (
    reason: DesignStyleMigrationReason,
  ): DesignStyleDraftHydrationResult => {
    const migration = evidenceWithReason(evidence, reason);
    const envelope = envelopeFor(emptyLedger, migration);
    const validation = validateLedger({
      ledger: emptyLedger,
      activeOccurrences,
      authority,
      unresolvedLegacyScalar: true,
    });
    const status = migrationStatusForReason(reason);
    return baseResult({
      status,
      envelope,
      validation,
      diagnostics: [diagnostic(reason.toUpperCase())],
      authorityPending:
        status === "legacy-migration-pending-catalogue" ||
        status === "legacy-migration-pending-upload",
      reviewRequired: !status.includes("pending") || status === "occurrences-unresolved",
      legacyScalarFingerprint,
    });
  };

  // A legacy scalar identifies a reference, not the exact garment occurrence
  // the customer chose. Keep the evidence for review, but never manufacture a
  // V2 assignment from it. Explicit V2 ledgers remain the only restorable
  // occurrence mapping authority.
  return preserve("explicit_reselection_required");
};

const retryableMigrationReason = (reason: DesignStyleMigrationReason): boolean =>
  reason === "catalogue_loading" ||
  reason === "catalogue_error" ||
  reason === "uploaded_authority_pending";

const hydrateValidEnvelope = ({
  envelope,
  activeOccurrences,
  authority,
  legacyScalarFingerprint,
}: {
  envelope: PersistedDesignStyleDraftV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  authority: GarmentScopedDesignStyleValidationAuthority;
  legacyScalarFingerprint: string;
}): DesignStyleDraftHydrationResult => {
  if (
    envelope.migration &&
    envelope.ledger.revision === 0 &&
    Object.keys(envelope.ledger.assignmentsByGarmentKey).length === 0 &&
    retryableMigrationReason(envelope.migration.reason)
  ) {
    const { reason: _reason, ...evidence } = envelope.migration;
    return migrateLegacyEvidence({
      evidence,
      activeOccurrences,
      authority,
      legacyScalarFingerprint,
    });
  }

  const reconciliation = reconcileGarmentScopedDesignStyleAssignmentLedger({
    ledger: envelope.ledger,
    activeOccurrences,
  });
  if (reconciliation.status === "blocked") {
    return baseResult({
      status: "occurrences-unresolved",
      envelope,
      reconciliation,
      diagnostics: [diagnostic(reconciliation.reason)],
      canAutosave: false,
      destructiveNormalizationProhibited: true,
      reviewRequired: true,
      legacyScalarFingerprint,
    });
  }
  const reconciledEnvelope = envelopeFor(
    reconciliation.ledger,
    envelope.migration || null,
  );
  const validation = validateLedger({
    ledger: reconciliation.ledger,
    activeOccurrences,
    authority,
    unresolvedLegacyScalar: Boolean(envelope.migration),
  });
  const status = envelope.migration
    ? migrationStatusForReason(envelope.migration.reason)
    : Object.keys(reconciliation.ledger.assignmentsByGarmentKey).length === 0 &&
        activeOccurrences.length === 0
      ? "empty-v2"
      : statusForValidation(validation, reconciliation.status === "reconciled");
  return baseResult({
    status,
    envelope: reconciledEnvelope,
    reconciliation,
    validation,
    diagnostics: validation.diagnostics.map((item) => diagnostic(item.code)),
    authorityPending:
      validation.status === "awaiting_validation" ||
      status === "legacy-migration-pending-catalogue" ||
      status === "legacy-migration-pending-upload",
    reviewRequired:
      validation.status === "needs_review" || Boolean(envelope.migration),
    legacyScalarFingerprint,
  });
};

/**
 * Re-run the shared Task 5C hydration/reconciliation pipeline after a Task 5A
 * runtime mutation without decoding legacy scalar fields again.
 */
export const hydrateDesignStyleDraftEnvelope = ({
  envelope,
  activeOccurrences,
  authority,
  legacyScalarFingerprint,
}: {
  envelope: PersistedDesignStyleDraftV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  authority: GarmentScopedDesignStyleValidationAuthority;
  legacyScalarFingerprint: string;
}): DesignStyleDraftHydrationResult =>
  hydrateValidEnvelope({
    envelope,
    activeOccurrences,
    authority,
    legacyScalarFingerprint,
  });

export const hydrateDesignStyleDraftPersistence = ({
  rawDraft,
  activeOccurrences,
  authority,
}: {
  rawDraft: unknown;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  authority: GarmentScopedDesignStyleValidationAuthority;
}): DesignStyleDraftHydrationResult => {
  const scalar = decodeLegacyDesignStyleScalarEvidence(rawDraft);
  const parsed = inspectPersistedDesignStyleDraft(rawDraft);
  if (parsed.status === "malformed") {
    return baseResult({
      status: "malformed-v2",
      envelope: null,
      diagnostics: [diagnostic(parsed.reason)],
      canAutosave: false,
      destructiveNormalizationProhibited: true,
      reviewRequired: true,
      legacyScalarFingerprint: scalar.fingerprint,
    });
  }
  if (parsed.status === "unsupported") {
    return baseResult({
      status: "unsupported-v2",
      envelope: null,
      diagnostics: [diagnostic("UNSUPPORTED_V2_SCHEMA_VERSION")],
      canAutosave: false,
      destructiveNormalizationProhibited: true,
      reviewRequired: true,
      legacyScalarFingerprint: scalar.fingerprint,
    });
  }
  if (parsed.status === "valid") {
    return hydrateValidEnvelope({
      envelope: parsed.envelope,
      activeOccurrences,
      authority,
      legacyScalarFingerprint: scalar.fingerprint,
    });
  }
  if (scalar.status === "invalid") {
    return baseResult({
      status: "legacy-invalid",
      envelope: null,
      diagnostics: [diagnostic(scalar.reason)],
      canAutosave: false,
      destructiveNormalizationProhibited: true,
      reviewRequired: true,
      legacyScalarFingerprint: scalar.fingerprint,
    });
  }
  if (scalar.status === "absent") {
    const ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
    return baseResult({
      status: "empty-v2",
      envelope: envelopeFor(ledger),
      validation: validateLedger({
        ledger,
        activeOccurrences,
        authority,
        unresolvedLegacyScalar: false,
      }),
      shouldPersistEnvelope: false,
      legacyScalarFingerprint: scalar.fingerprint,
    });
  }
  return migrateLegacyEvidence({
    evidence: scalar.evidence,
    activeOccurrences,
    authority,
    legacyScalarFingerprint: scalar.fingerprint,
  });
};

export const shouldApplyDesignStyleDraftHydration = ({
  requestGeneration,
  currentGeneration,
  current,
  incoming,
}: {
  requestGeneration: number;
  currentGeneration: number;
  current: DesignStyleDraftHydrationResult | null;
  incoming: DesignStyleDraftHydrationResult;
}): boolean => {
  if (requestGeneration !== currentGeneration) return false;
  if (!current?.shouldPersistEnvelope) return true;
  if (!incoming.shouldPersistEnvelope || !incoming.envelope) return false;
  const currentRevision = current.envelope?.ledger.revision ?? -1;
  const incomingRevision = incoming.envelope.ledger.revision;
  if (incomingRevision > currentRevision) return true;
  if (incomingRevision < currentRevision || !current.envelope) return false;
  return stableSerialize(incoming.envelope) === stableSerialize(current.envelope);
};

export const shouldAcceptDesignStyleDraftSaveCompletion = ({
  saveGeneration,
  currentSaveGeneration,
  identityGeneration,
  currentIdentityGeneration,
}: {
  saveGeneration: number;
  currentSaveGeneration: number;
  identityGeneration: number;
  currentIdentityGeneration: number;
}): boolean =>
  saveGeneration === currentSaveGeneration &&
  identityGeneration === currentIdentityGeneration;

export interface DesignStylePersistenceAcknowledgement {
  readonly persistenceKind: "guest" | "authenticated";
  readonly draftIdentity: string;
  readonly saveGeneration: number;
  readonly identityGeneration: number;
  readonly designStyleLedgerRevision: number;
  readonly designStyleEnvelopeFingerprint: string;
  readonly persistedUploadedSourceRefs: readonly string[];
}

export type UploadedSourcePersistenceProofResult =
  | { readonly status: "proven-absent" }
  | { readonly status: "source-still-present" }
  | { readonly status: "stale-acknowledgement" }
  | { readonly status: "wrong-draft" }
  | { readonly status: "revision-mismatch" }
  | { readonly status: "fingerprint-mismatch" }
  | { readonly status: "generation-mismatch" }
  | { readonly status: "unsupported-or-missing-proof" };

export const getPersistedDesignStyleEnvelopeFingerprint = (
  envelope: PersistedDesignStyleDraftV2,
): string | null => {
  const serialized = serializePersistedDesignStyleDraftEnvelope(envelope);
  return serialized ? stableSerialize(serialized) : null;
};

export const createDesignStylePersistenceAcknowledgement = ({
  persistenceKind,
  draftIdentity,
  saveGeneration,
  currentSaveGeneration,
  identityGeneration,
  currentIdentityGeneration,
  persistedDraft,
}: {
  persistenceKind: "guest" | "authenticated";
  draftIdentity: string;
  saveGeneration: number;
  currentSaveGeneration: number;
  identityGeneration: number;
  currentIdentityGeneration: number;
  persistedDraft: GuestDesignDraft;
}): DesignStylePersistenceAcknowledgement | null => {
  if (
    !isSafeIdentifier(draftIdentity) ||
    !shouldAcceptDesignStyleDraftSaveCompletion({
      saveGeneration,
      currentSaveGeneration,
      identityGeneration,
      currentIdentityGeneration,
    })
  ) {
    return null;
  }
  const parsed = inspectPersistedDesignStyleDraft(persistedDraft);
  if (parsed.status !== "valid") return null;
  const fingerprint = getPersistedDesignStyleEnvelopeFingerprint(parsed.envelope);
  if (!fingerprint) return null;
  const persistedUploadedSourceRefs = Object.values(
    parsed.envelope.ledger.assignmentsByGarmentKey,
  )
    .flatMap((assignment) =>
      assignment.sourceKind === "uploaded" ? [assignment.uploadedSourceRef] : [],
    )
    .filter((sourceRef, index, sourceRefs) => sourceRefs.indexOf(sourceRef) === index)
    .sort((left, right) => left.localeCompare(right));
  return {
    persistenceKind,
    draftIdentity,
    saveGeneration,
    identityGeneration,
    designStyleLedgerRevision: parsed.envelope.ledger.revision,
    designStyleEnvelopeFingerprint: fingerprint,
    persistedUploadedSourceRefs,
  };
};

export const proveUploadedSourceAbsentFromPersistedDesignStyle = ({
  acknowledgement,
  expectedDraftIdentity,
  expectedLedgerRevision,
  expectedFingerprint,
  expectedSaveGeneration,
  expectedIdentityGeneration,
  currentSaveGeneration,
  currentIdentityGeneration,
  uploadedSourceRef,
}: {
  acknowledgement: DesignStylePersistenceAcknowledgement | null;
  expectedDraftIdentity: string;
  expectedLedgerRevision: number;
  expectedFingerprint: string;
  expectedSaveGeneration: number;
  expectedIdentityGeneration: number;
  currentSaveGeneration: number;
  currentIdentityGeneration: number;
  uploadedSourceRef: string;
}): UploadedSourcePersistenceProofResult => {
  if (!acknowledgement || !isOpaqueSourceReference(uploadedSourceRef)) {
    return { status: "unsupported-or-missing-proof" };
  }
  if (
    acknowledgement.saveGeneration !== currentSaveGeneration ||
    acknowledgement.identityGeneration !== currentIdentityGeneration
  ) {
    return { status: "stale-acknowledgement" };
  }
  if (acknowledgement.draftIdentity !== expectedDraftIdentity) {
    return { status: "wrong-draft" };
  }
  if (acknowledgement.designStyleLedgerRevision !== expectedLedgerRevision) {
    return { status: "revision-mismatch" };
  }
  if (acknowledgement.designStyleEnvelopeFingerprint !== expectedFingerprint) {
    return { status: "fingerprint-mismatch" };
  }
  if (
    acknowledgement.saveGeneration !== expectedSaveGeneration ||
    acknowledgement.identityGeneration !== expectedIdentityGeneration
  ) {
    return { status: "generation-mismatch" };
  }
  return acknowledgement.persistedUploadedSourceRefs.includes(uploadedSourceRef)
    ? { status: "source-still-present" }
    : { status: "proven-absent" };
};

export const prepareDesignStyleDraftAutosave = ({
  draft,
  hydrated,
  activeOccurrences,
  authority,
  hydrationGeneration,
  currentHydrationGeneration,
}: {
  draft: GuestDesignDraft;
  hydrated: DesignStyleDraftHydrationResult;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  authority: GarmentScopedDesignStyleValidationAuthority;
  hydrationGeneration: number;
  currentHydrationGeneration: number;
}): DesignStyleDraftAutosaveResult => {
  if (hydrationGeneration !== currentHydrationGeneration) {
    return { status: "blocked", reason: "STALE_HYDRATION_GENERATION" };
  }
  if (!hydrated.canAutosave || hydrated.destructiveNormalizationProhibited) {
    return { status: "blocked", reason: "DESTRUCTIVE_AUTOSAVE_PROHIBITED" };
  }
  if (!hydrated.shouldPersistEnvelope || !hydrated.envelope) {
    const refreshed = hydrateDesignStyleDraftPersistence({
      rawDraft: draft,
      activeOccurrences,
      authority,
    });
    if (
      !refreshed.canAutosave ||
      refreshed.destructiveNormalizationProhibited
    ) {
      return { status: "blocked", reason: "V2_REVALIDATION_FAILED" };
    }
    if (refreshed.shouldPersistEnvelope && refreshed.envelope) {
      const serialized = serializePersistedDesignStyleDraftEnvelope(
        refreshed.envelope,
      );
      if (!serialized) {
        return { status: "blocked", reason: "V2_REVALIDATION_FAILED" };
      }
      return {
        status: "ready",
        draft: {
          ...draft,
          [DESIGN_STYLE_DRAFT_FIELD]: serialized,
        },
        hydration: refreshed,
      };
    }
    const { [DESIGN_STYLE_DRAFT_FIELD]: _ignored, ...withoutDormantV2 } = draft;
    return {
      status: "ready",
      draft: withoutDormantV2 as GuestDesignDraft,
      hydration: refreshed,
    };
  }
  const currentScalar = decodeLegacyDesignStyleScalarEvidence(draft);
  if (currentScalar.fingerprint !== hydrated.legacyScalarFingerprint) {
    return {
      status: "blocked",
      reason: "SCALAR_RUNTIME_CHANGED_AFTER_V2_HYDRATION",
    };
  }
  const refreshed = hydrateDesignStyleDraftPersistence({
    rawDraft: {
      ...draft,
      [DESIGN_STYLE_DRAFT_FIELD]: hydrated.envelope,
    },
    activeOccurrences,
    authority,
  });
  if (
    !refreshed.canAutosave ||
    refreshed.destructiveNormalizationProhibited ||
    !refreshed.envelope
  ) {
    return { status: "blocked", reason: "V2_REVALIDATION_FAILED" };
  }
  const serialized = serializePersistedDesignStyleDraftEnvelope(
    refreshed.envelope,
  );
  if (!serialized) {
    return { status: "blocked", reason: "V2_REVALIDATION_FAILED" };
  }
  return {
    status: "ready",
    draft: {
      ...draft,
      [DESIGN_STYLE_DRAFT_FIELD]: serialized,
    },
    hydration: refreshed,
  };
};
