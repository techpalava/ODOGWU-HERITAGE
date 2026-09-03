import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type {
  CanonicalPhysicalGarmentType,
  GarmentTypeStepSelection,
  GuestDesignDraft,
  StyleCategory,
} from "./src/types";
import {
  prepareAuthoritativeDesignStyleRecord,
  projectDesignStyleRecordForAdmin,
  projectPublishedDesignStyleRecord,
  type AuthoritativeDesignStyleRecordV1,
  type DesignStyleLifecycle,
} from "./src/utils/designStyleAuthority";
import {
  createCatalogDesignSource,
  createUploadedDesignSource,
  type PhysicalGarmentOccurrence,
} from "./src/utils/designSourceState";
import {
  buildDesignStyleDraftValidationAuthority,
  buildUploadedDesignStyleAuthority,
  createDesignStyleAdaptabilityConfirmationFingerprint,
  decodeLegacyDesignStyleScalarEvidence,
  hydrateDesignStyleDraftPersistence,
  inspectPersistedDesignStyleDraft,
  parsePersistedDesignStyleDraftEnvelope,
  prepareDesignStyleDraftAutosave,
  serializePersistedDesignStyleDraftEnvelope,
  shouldAcceptDesignStyleDraftSaveCompletion,
  shouldApplyDesignStyleDraftHydration,
  DESIGN_STYLE_DRAFT_FIELD,
  type PersistedDesignStyleDraftV2,
} from "./src/utils/designStyleDraftPersistence";
import {
  assignCatalogDesignStyleToGarmentOccurrence,
  createEmptyGarmentScopedDesignStyleAssignmentLedger,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
  type GarmentScopedDesignStyleValidationAuthority,
} from "./src/utils/garmentScopedDesignStyleAssignment";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";

const occurrence = (
  garmentKey: string,
  garmentType: CanonicalPhysicalGarmentType,
  occurrenceGeneration: number,
  sourceRole: "main" | "additional" = "main",
): PhysicalGarmentOccurrence => ({
  garmentKey,
  garmentType,
  occurrenceGeneration,
  sourceRole,
  fabricUnits: 1,
});

const tokenFor = (value: PhysicalGarmentOccurrence): string =>
  createPhysicalGarmentOccurrenceIdentityToken({
    garmentKey: value.garmentKey,
    generation: value.occurrenceGeneration!,
  });

const selection = (
  garmentTypes: CanonicalPhysicalGarmentType[],
): GarmentTypeStepSelection => ({
  garmentTypes,
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
});

const styleBase = (
  id: string,
  garmentTypes: CanonicalPhysicalGarmentType[],
  overrides: Partial<StyleCategory> = {},
): StyleCategory => ({
  id,
  name: `Style ${id}`,
  description: "Strict published style fixture.",
  gender: "male",
  options: ["Standard"],
  image: `https://example.test/${id}.webp`,
  outfitType: "Native",
  garmentComposition: "Configured garments",
  fabricCategory: "Any",
  fabricCapacityComposition: garmentTypes.map(createStyleBaseGarmentSpec),
  customDetailConfig: {
    representedGenders: ["male"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: ["shirt"],
    requiredSelectionGroups: [],
    enabled: true,
  },
  includedDesignFeatures: {
    hasMonogram: false,
    hasEmbroidery: false,
    hasMonogramTrimming: false,
  },
  monogramCuffEligible: false,
  embroideryProminence: "standard",
  defaultGarmentDetails: {},
  styleApplicability: { mode: "exact_only" },
  ...overrides,
});

const recordFor = ({
  id,
  garmentTypes,
  lifecycle = "published",
  currentRecord = null,
  overrides = {},
}: {
  id: string;
  garmentTypes: CanonicalPhysicalGarmentType[];
  lifecycle?: DesignStyleLifecycle;
  currentRecord?: AuthoritativeDesignStyleRecordV1 | null;
  overrides?: Partial<StyleCategory>;
}): AuthoritativeDesignStyleRecordV1 =>
  prepareAuthoritativeDesignStyleRecord({
    style: styleBase(id, garmentTypes, overrides),
    lifecycle,
    displayOrder: 1,
    referenceComposition: { status: "known", garmentTypes },
    currentRecord,
  });

const publishedStyle = (
  id: string,
  garmentTypes: CanonicalPhysicalGarmentType[],
  overrides: Partial<StyleCategory> = {},
) => {
  const projected = projectPublishedDesignStyleRecord(
    recordFor({ id, garmentTypes, overrides }),
  );
  assert.ok(projected);
  return projected;
};

const authorityFor = ({
  styles,
  occurrences,
  garmentSelection = selection(
    occurrences.map((item) => item.garmentType),
  ),
  catalogueState = "ready",
  uploadedSourcesByKey = {},
}: {
  styles: readonly StyleCategory[];
  occurrences: readonly PhysicalGarmentOccurrence[];
  garmentSelection?: GarmentTypeStepSelection;
  catalogueState?: "loading" | "ready" | "error";
  uploadedSourcesByKey?: GarmentScopedDesignStyleValidationAuthority["uploadedSourcesByKey"];
}) =>
  buildDesignStyleDraftValidationAuthority({
    catalogueState,
    styles,
    garmentTypeSelection: garmentSelection,
    activeOccurrences: occurrences,
    uploadedSourcesByKey,
  });

const catalogScalar = (
  styleId: string,
  confirmed = true,
): Record<string, unknown> => ({
  selectedStyleId: styleId,
  designSource: createCatalogDesignSource(styleId),
  confirmedStyleId: confirmed ? styleId : null,
  confirmedDesignSourceKey: confirmed ? `catalog:${styleId}` : null,
  priceActivatedFabricCode: "FABRIC-MUST-NOT-BECOME-AUTHORITY",
});

const assignCatalog = ({
  ledger,
  occurrence: targetOccurrence,
  activeOccurrences,
  style,
  adaptabilityConfirmationFingerprint,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  occurrence: PhysicalGarmentOccurrence;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  style: ReturnType<typeof publishedStyle>;
  adaptabilityConfirmationFingerprint?: string;
}): GarmentScopedDesignStyleAssignmentLedgerV2 => {
  const metadata = style.designStyleAuthority;
  const result = assignCatalogDesignStyleToGarmentOccurrence({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences,
    target: {
      garmentKey: targetOccurrence.garmentKey,
      occurrenceToken: tokenFor(targetOccurrence),
    },
    source: {
      sourceKey: metadata.sourceKey,
      catalogStyleId: style.id,
      eligibilityFingerprint: metadata.eligibilityFingerprint,
      ...(adaptabilityConfirmationFingerprint
        ? { adaptabilityConfirmationFingerprint }
        : {}),
    },
  });
  assert.notEqual(result.status, "rejected");
  return result.ledger;
};

const shirt = occurrence("base:shirt", "shirt", 1);
const trouser = occurrence("base:trouser", "trouser", 2);
const repeatedShirt = occurrence("additional:shirt:1", "shirt", 3, "additional");
const shirtStyle = publishedStyle("style-shirt", ["shirt"]);
const trouserStyle = publishedStyle("style-trouser", ["trouser"]);
const combinedStyle = publishedStyle("style-combined", ["shirt", "trouser"]);

// Strict V2 parsing preserves revisions, occurrence tokens, repeated types, and fingerprints.
{
  const occurrences = [shirt, trouser, repeatedShirt];
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assignCatalog({ ledger, occurrence: shirt, activeOccurrences: occurrences, style: shirtStyle });
  ledger = assignCatalog({ ledger, occurrence: trouser, activeOccurrences: occurrences, style: trouserStyle });
  ledger = assignCatalog({
    ledger,
    occurrence: repeatedShirt,
    activeOccurrences: occurrences,
    style: shirtStyle,
    adaptabilityConfirmationFingerprint: "adaptability-proof-v1",
  });
  const envelope: PersistedDesignStyleDraftV2 = { schemaVersion: 2, ledger };
  const serialized = serializePersistedDesignStyleDraftEnvelope(envelope);
  assert.deepEqual(serialized, envelope);
  assert.deepEqual(
    parsePersistedDesignStyleDraftEnvelope(JSON.parse(JSON.stringify(envelope))),
    { status: "valid", envelope },
  );
  assert.equal(ledger.revision, 3);
  assert.equal(
    ledger.assignmentsByGarmentKey[repeatedShirt.garmentKey]
      ?.assignmentRevision,
    1,
  );
  assert.equal(
    ledger.assignmentsByGarmentKey[repeatedShirt.garmentKey]
      ?.occurrenceToken,
    tokenFor(repeatedShirt),
  );
}

// Unknown fields, malformed maps, conflicting source fields, and unsafe keys fail closed.
{
  const valid = {
    schemaVersion: 2,
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
  };
  assert.equal(
    parsePersistedDesignStyleDraftEnvelope({ ...valid, trusted: true }).status,
    "malformed",
  );
  assert.equal(
    parsePersistedDesignStyleDraftEnvelope({
      ...valid,
      ledger: { ...valid.ledger, revision: -1 },
    }).status,
    "malformed",
  );
  assert.equal(
    parsePersistedDesignStyleDraftEnvelope({
      schemaVersion: 2,
      ledger: {
        schemaVersion: 2,
        revision: 0,
        assignmentsByGarmentKey: {
          "base:shirt": {
            garmentKey: "base:shirt",
            occurrenceToken: tokenFor(shirt),
            assignmentRevision: 1,
            sourceKind: "catalog",
            sourceKey: `catalog-style:${shirtStyle.id}`,
            catalogStyleId: shirtStyle.id,
            eligibilityFingerprint:
              shirtStyle.designStyleAuthority!.eligibilityFingerprint,
          },
        },
      },
    }).status,
    "malformed",
  );
  const one = assignCatalog({
    ledger: valid.ledger,
    occurrence: shirt,
    activeOccurrences: [shirt],
    style: shirtStyle,
  });
  const assignment = one.assignmentsByGarmentKey[shirt.garmentKey]!;
  assert.equal(
    parsePersistedDesignStyleDraftEnvelope({
      schemaVersion: 2,
      ledger: {
        ...one,
        assignmentsByGarmentKey: {
          [shirt.garmentKey]: { ...assignment, uploadedSourceRef: "conflict" },
        },
      },
    }).status,
    "malformed",
  );
  assert.equal(
    parsePersistedDesignStyleDraftEnvelope({
      schemaVersion: 2,
      ledger: {
        ...one,
        assignmentsByGarmentKey: { " bad ": assignment },
      },
    }).status,
    "malformed",
  );
  assert.equal(
    parsePersistedDesignStyleDraftEnvelope({
      schemaVersion: 2,
      ledger: {
        ...one,
        assignmentsByGarmentKey: {
          [shirt.garmentKey]: {
            ...assignment,
            sourceKey: `catalog-style:not-${shirtStyle.id}`,
          },
        },
      },
    }).status,
    "malformed",
  );
  assert.equal(
    parsePersistedDesignStyleDraftEnvelope({
      ...valid,
      migration: {
        schemaVersion: 1,
        legacySchema: "design_style_scalar_v1",
        sourceKind: "uploaded",
        sourceKey: "uploaded:private/path",
        uploadedSourceRef: "private/path",
        confirmationStatus: "confirmed",
        reason: "uploaded_authority_pending",
      },
    }).status,
    "malformed",
  );
  assert.equal(
    parsePersistedDesignStyleDraftEnvelope({
      ...valid,
      migration: {
        schemaVersion: 1,
        legacySchema: "design_style_scalar_v1",
        sourceKind: "catalog",
        sourceKey: "catalog:style-shirt",
        catalogStyleId: "style-shirt",
        confirmationStatus: "confirmed",
        reason: "uploaded_authority_pending",
      },
    }).status,
    "malformed",
  );
}

// Valid V2 outranks conflicting scalar fields; malformed/newer V2 blocks scalar fallback.
{
  const ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    occurrence: shirt,
    activeOccurrences: [shirt],
    style: shirtStyle,
  });
  const validV2 = hydrateDesignStyleDraftPersistence({
    rawDraft: {
      ...catalogScalar("conflicting-scalar"),
      [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 2, ledger },
    },
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
  });
  assert.equal(validV2.status, "valid-v2");
  const validV2Assignment =
    validV2.ledger?.assignmentsByGarmentKey[shirt.garmentKey];
  assert.equal(validV2Assignment?.sourceKind, "catalog");
  assert.equal(
    validV2Assignment?.sourceKind === "catalog"
      ? validV2Assignment.catalogStyleId
      : null,
    shirtStyle.id,
  );

  const malformed = hydrateDesignStyleDraftPersistence({
    rawDraft: {
      ...catalogScalar(shirtStyle.id),
      [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 2, ledger: {} },
    },
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
  });
  assert.equal(malformed.status, "malformed-v2");
  assert.equal(malformed.ledger, null);
  assert.equal(malformed.canAutosave, false);
  assert.equal(malformed.destructiveNormalizationProhibited, true);

  const unsupported = hydrateDesignStyleDraftPersistence({
    rawDraft: {
      ...catalogScalar(shirtStyle.id),
      [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 3, ledger },
    },
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
  });
  assert.equal(unsupported.status, "unsupported-v2");
  assert.equal(unsupported.ledger, null);
  assert.equal(unsupported.canAutosave, false);
}

// A genuinely empty draft is valid but does not silently persist a dormant envelope.
{
  const empty = hydrateDesignStyleDraftPersistence({
    rawDraft: { priceActivatedFabricCode: "NOT-A-STYLE" },
    activeOccurrences: [],
    authority: authorityFor({ styles: [], occurrences: [] }),
  });
  assert.equal(empty.status, "empty-v2");
  assert.equal(empty.ledger?.revision, 0);
  assert.equal(empty.shouldPersistEnvelope, false);
  assert.equal(
    decodeLegacyDesignStyleScalarEvidence({
      priceActivatedFabricCode: "style-shirt",
    }).status,
    "absent",
  );
}

// Malformed scalar evidence cannot create an assignment or be overwritten.
{
  const malformedScalar = hydrateDesignStyleDraftPersistence({
    rawDraft: {
      selectedStyleId: " style-shirt ",
      designSource: {
        kind: "catalog",
        sourceKey: "catalog:style-shirt",
        styleId: "style-shirt",
      },
    },
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
  });
  assert.equal(malformedScalar.status, "legacy-invalid");
  assert.equal(malformedScalar.envelope, null);
  assert.equal(malformedScalar.canAutosave, false);
  assert.equal(malformedScalar.destructiveNormalizationProhibited, true);
}

// One exact catalogue scalar migrates once through Task 5A with current Task 5B identity.
{
  const result = hydrateDesignStyleDraftPersistence({
    rawDraft: catalogScalar(combinedStyle.id),
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [combinedStyle], occurrences: [shirt] }),
  });
  assert.equal(result.status, "legacy-migrated");
  assert.equal(result.ledger?.revision, 1);
  const assignment = result.ledger?.assignmentsByGarmentKey[shirt.garmentKey];
  assert.equal(assignment?.occurrenceToken, tokenFor(shirt));
  assert.equal(assignment?.sourceKind, "catalog");
  assert.equal(
    assignment?.sourceKind === "catalog" && assignment.catalogStyleId,
    combinedStyle.id,
  );
  assert.equal(
    assignment?.sourceKind === "catalog" && assignment.sourceKey,
    combinedStyle.designStyleAuthority.sourceKey,
  );
  assert.equal(
    assignment?.sourceKind === "catalog" && assignment.eligibilityFingerprint,
    combinedStyle.designStyleAuthority.eligibilityFingerprint,
  );
  assert.equal(result.validation?.status, "complete");
}

// Cosmetic publication changes preserve validity; eligibility changes preserve evidence for review.
{
  const initialRecord = recordFor({ id: "style-revision", garmentTypes: ["shirt"] });
  const initialStyle = projectPublishedDesignStyleRecord(initialRecord)!;
  const migrated = hydrateDesignStyleDraftPersistence({
    rawDraft: catalogScalar(initialStyle.id),
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [initialStyle], occurrences: [shirt] }),
  });
  const renamedRecord = recordFor({
    id: initialStyle.id,
    garmentTypes: ["shirt"],
    currentRecord: initialRecord,
    overrides: { name: "Cosmetic rename only" },
  });
  const renamed = projectPublishedDesignStyleRecord(renamedRecord)!;
  assert.equal(
    renamed.designStyleAuthority.eligibilityFingerprint,
    initialStyle.designStyleAuthority.eligibilityFingerprint,
  );
  assert.equal(
    hydrateDesignStyleDraftPersistence({
      rawDraft: { [DESIGN_STYLE_DRAFT_FIELD]: migrated.envelope },
      activeOccurrences: [shirt],
      authority: authorityFor({ styles: [renamed], occurrences: [shirt] }),
    }).status,
    "valid-v2",
  );

  const initialChangedAuthority = authorityFor({
    styles: [renamed],
    occurrences: [shirt],
  });
  const changedAuthority = {
    ...initialChangedAuthority,
    catalogStylesById: {
      ...initialChangedAuthority.catalogStylesById,
      [renamed.id]: {
        ...initialChangedAuthority.catalogStylesById[renamed.id]!,
        eligibilityFingerprint: "changed-eligibility-fingerprint",
      },
    },
  };
  const changed = hydrateDesignStyleDraftPersistence({
    rawDraft: { [DESIGN_STYLE_DRAFT_FIELD]: migrated.envelope },
    activeOccurrences: [shirt],
    authority: changedAuthority,
  });
  assert.equal(changed.status, "assignments-need-review");
  assert.equal(
    changed.ledger?.assignmentsByGarmentKey[shirt.garmentKey]
      ?.occurrenceToken,
    tokenFor(shirt),
  );
}

// Loading and error preserve retryable scalar evidence; ready retries without reading scalar again.
for (const catalogueState of ["loading", "error"] as const) {
  const pending = hydrateDesignStyleDraftPersistence({
    rawDraft: catalogScalar(shirtStyle.id),
    activeOccurrences: [shirt],
    authority: authorityFor({
      styles: [],
      occurrences: [shirt],
      catalogueState,
    }),
  });
  assert.equal(pending.status, "legacy-migration-pending-catalogue");
  assert.equal(pending.ledger?.revision, 0);
  assert.ok(pending.migrationEvidence);
  const retried = hydrateDesignStyleDraftPersistence({
    rawDraft: {
      selectedStyleId: "conflicting-stale-scalar",
      [DESIGN_STYLE_DRAFT_FIELD]: pending.envelope,
    },
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
  });
  assert.equal(retried.status, "legacy-migrated");
  const retriedAssignment =
    retried.ledger?.assignmentsByGarmentKey[shirt.garmentKey];
  assert.equal(retriedAssignment?.sourceKind, "catalog");
  assert.equal(
    retriedAssignment?.sourceKind === "catalog"
      ? retriedAssignment.catalogStyleId
      : null,
    shirtStyle.id,
  );
}

// Existing V2 evidence survives catalogue loading/error without scalar fallback or clearing.
{
  const migrated = hydrateDesignStyleDraftPersistence({
    rawDraft: catalogScalar(shirtStyle.id),
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
  });
  const originalAssignment =
    migrated.ledger?.assignmentsByGarmentKey[shirt.garmentKey];
  for (const catalogueState of ["loading", "error"] as const) {
    const unavailable = hydrateDesignStyleDraftPersistence({
      rawDraft: {
        ...catalogScalar("conflicting-stale-scalar"),
        [DESIGN_STYLE_DRAFT_FIELD]: migrated.envelope,
      },
      activeOccurrences: [shirt],
      authority: authorityFor({
        styles: [],
        occurrences: [shirt],
        catalogueState,
      }),
    });
    assert.equal(unavailable.status, "validation-pending");
    assert.deepEqual(
      unavailable.ledger?.assignmentsByGarmentKey[shirt.garmentKey],
      originalAssignment,
    );
    assert.equal(unavailable.reconciliation?.status, "unchanged");
    assert.equal(unavailable.authorityPending, true);
  }
}

// Missing, non-published, and incompatible strict authority never migrate.
{
  const missing = hydrateDesignStyleDraftPersistence({
    rawDraft: catalogScalar("missing-style"),
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [], occurrences: [shirt] }),
  });
  assert.equal(missing.status, "legacy-review-required");
  assert.equal(missing.ledger?.revision, 0);

  for (const lifecycle of ["draft", "disabled", "archived"] as const) {
    const record = recordFor({
      id: `style-${lifecycle}`,
      garmentTypes: ["shirt"],
      lifecycle,
    });
    const adminProjection = projectDesignStyleRecordForAdmin(record);
    const result = hydrateDesignStyleDraftPersistence({
      rawDraft: catalogScalar(record.id),
      activeOccurrences: [shirt],
      authority: authorityFor({
        styles: [adminProjection],
        occurrences: [shirt],
      }),
    });
    assert.equal(result.status, "legacy-review-required");
    assert.equal(result.ledger?.revision, 0);
  }

  const incompatible = hydrateDesignStyleDraftPersistence({
    rawDraft: catalogScalar(trouserStyle.id),
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [trouserStyle], occurrences: [shirt] }),
  });
  assert.equal(incompatible.status, "legacy-review-required");
  assert.equal(incompatible.migrationEvidence?.reason, "catalog_style_incompatible");
}

// Adaptable scalar migration requires real legacy confirmation and captures current fingerprint.
{
  const adaptable = publishedStyle("style-adaptable", ["dress"], {
    styleApplicability: {
      mode: "adaptable",
      garmentTypes: ["shirt"],
      demographics: ["male"],
    },
  });
  const unconfirmed = hydrateDesignStyleDraftPersistence({
    rawDraft: catalogScalar(adaptable.id, false),
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [adaptable], occurrences: [shirt] }),
  });
  assert.equal(unconfirmed.status, "legacy-review-required");
  assert.equal(
    unconfirmed.migrationEvidence?.reason,
    "adaptability_confirmation_required",
  );

  const confirmed = hydrateDesignStyleDraftPersistence({
    rawDraft: catalogScalar(adaptable.id, true),
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [adaptable], occurrences: [shirt] }),
  });
  assert.equal(confirmed.status, "legacy-migrated");
  const assignment = confirmed.ledger?.assignmentsByGarmentKey[shirt.garmentKey];
  assert.equal(
    assignment?.sourceKind === "catalog" &&
      assignment.adaptabilityConfirmationFingerprint,
    createDesignStyleAdaptabilityConfirmationFingerprint({
      eligibilityFingerprint: adaptable.designStyleAuthority.eligibilityFingerprint,
      occurrenceToken: tokenFor(shirt),
    }),
  );
  const currentAuthority = authorityFor({
    styles: [adaptable],
    occurrences: [shirt],
  });
  const currentStyleAuthority = currentAuthority.catalogStylesById[adaptable.id]!;
  const changedConfirmationAuthority = {
    ...currentAuthority,
    catalogStylesById: {
      ...currentAuthority.catalogStylesById,
      [adaptable.id]: {
        ...currentStyleAuthority,
        occurrenceEligibilityByToken: {
          ...currentStyleAuthority.occurrenceEligibilityByToken,
          [tokenFor(shirt)]: {
            status: "adaptable" as const,
            requiredConfirmationFingerprint: "changed-confirmation-fingerprint",
          },
        },
      },
    },
  };
  const confirmationMismatch = hydrateDesignStyleDraftPersistence({
    rawDraft: {
      [DESIGN_STYLE_DRAFT_FIELD]: confirmed.envelope,
    },
    activeOccurrences: [shirt],
    authority: changedConfirmationAuthority,
  });
  assert.equal(confirmationMismatch.status, "assignments-need-review");
  const mismatchedAssignment =
    confirmationMismatch.ledger?.assignmentsByGarmentKey[shirt.garmentKey];
  assert.equal(
    mismatchedAssignment?.sourceKind === "catalog"
      ? mismatchedAssignment.adaptabilityConfirmationFingerprint
      : null,
    assignment?.sourceKind === "catalog"
      ? assignment.adaptabilityConfirmationFingerprint
      : null,
  );
}

// Uploaded migration is ownership/confirmation scoped and persists only an opaque reference.
{
  const source = createUploadedDesignSource({
    uploadReference: {
      designReferenceId: "upload-reference-1",
      ownerUid: "owner-1",
      storagePath:
        "customer-design-drafts/owner-1/upload-reference-1/original.png",
      mimeType: "image/png",
      createdAt: "2026-09-01T00:00:00.000Z",
    },
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
    demographic: "male",
  });
  const uploadedScalar = {
    selectedStyleId: null,
    designSource: source,
    confirmedStyleId: null,
    confirmedDesignSourceKey: source.sourceKey,
  };
  const confirmedAuthority = buildUploadedDesignStyleAuthority({
    source,
    confirmedDesignSourceKey: source.sourceKey,
    expectedOwnerUid: "owner-1",
    ownershipTransferPending: false,
    sourceOperationStable: true,
    activeOccurrences: [shirt],
  });
  const migrated = hydrateDesignStyleDraftPersistence({
    rawDraft: uploadedScalar,
    activeOccurrences: [shirt],
    authority: authorityFor({
      styles: [],
      occurrences: [shirt],
      uploadedSourcesByKey: confirmedAuthority,
    }),
  });
  assert.equal(migrated.status, "legacy-migrated");
  const assignment = migrated.ledger?.assignmentsByGarmentKey[shirt.garmentKey];
  assert.equal(assignment?.sourceKind, "uploaded");
  assert.equal(
    assignment?.sourceKind === "uploaded" && assignment.uploadedSourceRef,
    "upload-reference-1",
  );
  assert.doesNotMatch(JSON.stringify(migrated.envelope), /storagePath|owner-1/);

  const pendingAuthority = buildUploadedDesignStyleAuthority({
    source,
    confirmedDesignSourceKey: source.sourceKey,
    expectedOwnerUid: null,
    ownershipTransferPending: false,
    sourceOperationStable: true,
    activeOccurrences: [shirt],
  });
  const pending = hydrateDesignStyleDraftPersistence({
    rawDraft: uploadedScalar,
    activeOccurrences: [shirt],
    authority: authorityFor({
      styles: [],
      occurrences: [shirt],
      uploadedSourcesByKey: pendingAuthority,
    }),
  });
  assert.equal(pending.status, "legacy-migration-pending-upload");
  assert.equal(pending.ledger?.revision, 0);

  const foreignAuthority = buildUploadedDesignStyleAuthority({
    source,
    confirmedDesignSourceKey: source.sourceKey,
    expectedOwnerUid: "different-owner",
    ownershipTransferPending: false,
    sourceOperationStable: true,
    activeOccurrences: [shirt],
  });
  const foreign = hydrateDesignStyleDraftPersistence({
    rawDraft: uploadedScalar,
    activeOccurrences: [shirt],
    authority: authorityFor({
      styles: [],
      occurrences: [shirt],
      uploadedSourcesByKey: foreignAuthority,
    }),
  });
  assert.equal(foreign.status, "legacy-review-required");
  assert.equal(foreign.ledger?.revision, 0);

  const operationPendingAuthority = buildUploadedDesignStyleAuthority({
    source,
    confirmedDesignSourceKey: source.sourceKey,
    expectedOwnerUid: "owner-1",
    ownershipTransferPending: false,
    sourceOperationStable: false,
    activeOccurrences: [shirt],
  });
  assert.equal(operationPendingAuthority[source.sourceKey]?.status, "pending");
  const transferPendingAuthority = buildUploadedDesignStyleAuthority({
    source,
    confirmedDesignSourceKey: source.sourceKey,
    expectedOwnerUid: "owner-1",
    ownershipTransferPending: true,
    sourceOperationStable: true,
    activeOccurrences: [shirt],
  });
  assert.equal(transferPendingAuthority[source.sourceKey]?.status, "pending");

  const ambiguousUpload = hydrateDesignStyleDraftPersistence({
    rawDraft: uploadedScalar,
    activeOccurrences: [shirt, trouser],
    authority: authorityFor({
      styles: [],
      occurrences: [shirt, trouser],
      uploadedSourcesByKey: buildUploadedDesignStyleAuthority({
        source,
        confirmedDesignSourceKey: source.sourceKey,
        expectedOwnerUid: "owner-1",
        ownershipTransferPending: false,
        sourceOperationStable: true,
        activeOccurrences: [shirt, trouser],
      }),
    }),
  });
  assert.equal(ambiguousUpload.status, "legacy-review-required");
  assert.equal(ambiguousUpload.migrationEvidence?.reason, "multiple_occurrences");
  assert.deepEqual(ambiguousUpload.ledger?.assignmentsByGarmentKey, {});
}

// Multi-occurrence, repeated-type, and zero-occurrence scalar decisions never fan out.
for (const occurrences of [
  [shirt, trouser],
  [shirt, repeatedShirt, occurrence("additional:shirt:2", "shirt", 4, "additional")],
  [],
] as const) {
  const result = hydrateDesignStyleDraftPersistence({
    rawDraft: catalogScalar(combinedStyle.id),
    activeOccurrences: occurrences,
    authority: authorityFor({ styles: [combinedStyle], occurrences }),
  });
  assert.equal(result.ledger?.revision, 0);
  assert.deepEqual(result.ledger?.assignmentsByGarmentKey, {});
  assert.ok(result.migrationEvidence);
  assert.equal(result.validation?.isComplete, false);
  assert.equal(
    result.status,
    occurrences.length === 0 ? "occurrences-unresolved" : "legacy-review-required",
  );
}

// Reconciliation preserves survivors, leaves additions unassigned, and rejects ABA tokens.
{
  const ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    occurrence: shirt,
    activeOccurrences: [shirt, trouser],
    style: combinedStyle,
  });
  const added = hydrateDesignStyleDraftPersistence({
    rawDraft: { [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 2, ledger } },
    activeOccurrences: [shirt, trouser],
    authority: authorityFor({ styles: [combinedStyle], occurrences: [shirt, trouser] }),
  });
  assert.equal(added.status, "assignments-invalid");
  assert.equal(added.ledger?.assignmentsByGarmentKey[shirt.garmentKey]?.occurrenceToken, tokenFor(shirt));
  assert.equal(added.ledger?.assignmentsByGarmentKey[trouser.garmentKey], undefined);

  const removed = hydrateDesignStyleDraftPersistence({
    rawDraft: { [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 2, ledger } },
    activeOccurrences: [trouser],
    authority: authorityFor({ styles: [combinedStyle], occurrences: [trouser] }),
  });
  assert.equal(removed.status, "assignments-invalid");
  assert.equal(removed.reconciliation?.status, "reconciled");
  assert.deepEqual(removed.ledger?.assignmentsByGarmentKey, {});

  const completeLedger = assignCatalog({
    ledger,
    occurrence: trouser,
    activeOccurrences: [shirt, trouser],
    style: combinedStyle,
  });
  const survivingTrouser =
    completeLedger.assignmentsByGarmentKey[trouser.garmentKey];
  const exactRemoval = hydrateDesignStyleDraftPersistence({
    rawDraft: {
      [DESIGN_STYLE_DRAFT_FIELD]: {
        schemaVersion: 2,
        ledger: completeLedger,
      },
    },
    activeOccurrences: [trouser],
    authority: authorityFor({ styles: [combinedStyle], occurrences: [trouser] }),
  });
  assert.equal(exactRemoval.status, "valid-v2-reconciled");
  assert.deepEqual(
    exactRemoval.ledger?.assignmentsByGarmentKey[trouser.garmentKey],
    survivingTrouser,
  );
  assert.equal(
    exactRemoval.ledger?.assignmentsByGarmentKey[shirt.garmentKey],
    undefined,
  );

  const readded = occurrence("base:shirt", "shirt", 99);
  const aba = hydrateDesignStyleDraftPersistence({
    rawDraft: { [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 2, ledger } },
    activeOccurrences: [readded],
    authority: authorityFor({ styles: [combinedStyle], occurrences: [readded] }),
  });
  assert.equal(aba.status, "assignments-invalid");
  assert.deepEqual(aba.ledger?.assignmentsByGarmentKey, {});
  assert.equal(aba.validation?.isComplete, false);
}

// Autosave serializes canonical V2, ignores price activation, blocks scalar replacement, and guards races.
{
  const initiallyEmpty = hydrateDesignStyleDraftPersistence({
    rawDraft: {},
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
  });
  const firstSelection = prepareDesignStyleDraftAutosave({
    draft: catalogScalar(shirtStyle.id) as unknown as GuestDesignDraft,
    hydrated: initiallyEmpty,
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
    hydrationGeneration: 7,
    currentHydrationGeneration: 7,
  });
  assert.equal(firstSelection.status, "ready");
  assert.equal(
    firstSelection.status === "ready"
      ? inspectPersistedDesignStyleDraft(firstSelection.draft).status
      : null,
    "valid",
  );
  assert.equal(
    firstSelection.status === "ready"
      ? firstSelection.hydration.status
      : null,
    "legacy-migrated",
  );
  const stillEmpty = prepareDesignStyleDraftAutosave({
    draft: {} as GuestDesignDraft,
    hydrated: initiallyEmpty,
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
    hydrationGeneration: 7,
    currentHydrationGeneration: 7,
  });
  assert.equal(stillEmpty.status, "ready");
  assert.equal(
    stillEmpty.status === "ready"
      ? inspectPersistedDesignStyleDraft(stillEmpty.draft).status
      : null,
    "absent",
  );

  const hydrated = hydrateDesignStyleDraftPersistence({
    rawDraft: catalogScalar(shirtStyle.id),
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
  });
  const draft = {
    ...catalogScalar(shirtStyle.id),
    journeySchemaVersion: 1,
  } as unknown as GuestDesignDraft;
  const ready = prepareDesignStyleDraftAutosave({
    draft: { ...draft, priceActivatedFabricCode: "CHANGED-FABRIC-ONLY" },
    hydrated,
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
    hydrationGeneration: 7,
    currentHydrationGeneration: 7,
  });
  assert.equal(ready.status, "ready");
  assert.equal(
    ready.status === "ready" && inspectPersistedDesignStyleDraft(ready.draft).status,
    "valid",
  );
  const scalarChanged = prepareDesignStyleDraftAutosave({
    draft: { ...draft, ...catalogScalar(trouserStyle.id) },
    hydrated,
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
    hydrationGeneration: 7,
    currentHydrationGeneration: 7,
  });
  assert.deepEqual(scalarChanged, {
    status: "blocked",
    reason: "SCALAR_RUNTIME_CHANGED_AFTER_V2_HYDRATION",
  });
  assert.equal(
    prepareDesignStyleDraftAutosave({
      draft,
      hydrated,
      activeOccurrences: [shirt],
      authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
      hydrationGeneration: 6,
      currentHydrationGeneration: 7,
    }).status,
    "blocked",
  );
  assert.equal(
    shouldAcceptDesignStyleDraftSaveCompletion({
      saveGeneration: 1,
      currentSaveGeneration: 2,
      identityGeneration: 3,
      currentIdentityGeneration: 3,
    }),
    false,
  );
  assert.equal(
    shouldAcceptDesignStyleDraftSaveCompletion({
      saveGeneration: 2,
      currentSaveGeneration: 2,
      identityGeneration: 3,
      currentIdentityGeneration: 3,
    }),
    true,
  );
}

// Parent hydration generation/revision precedence rejects delayed scalar and older V2 payloads.
{
  const current = hydrateDesignStyleDraftPersistence({
    rawDraft: catalogScalar(shirtStyle.id),
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
  });
  const scalarOnlyIncoming = hydrateDesignStyleDraftPersistence({
    rawDraft: {},
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
  });
  assert.equal(
    shouldApplyDesignStyleDraftHydration({
      requestGeneration: 4,
      currentGeneration: 5,
      current,
      incoming: current,
    }),
    false,
  );
  assert.equal(
    shouldApplyDesignStyleDraftHydration({
      requestGeneration: 5,
      currentGeneration: 5,
      current,
      incoming: scalarOnlyIncoming,
    }),
    false,
  );
  const olderEnvelope = {
    ...current.envelope!,
    ledger: { ...current.envelope!.ledger, revision: 0 },
  };
  const older = hydrateDesignStyleDraftPersistence({
    rawDraft: { [DESIGN_STYLE_DRAFT_FIELD]: olderEnvelope },
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
  });
  assert.equal(
    shouldApplyDesignStyleDraftHydration({
      requestGeneration: 5,
      currentGeneration: 5,
      current,
      incoming: older,
    }),
    false,
  );
  const conflictingSameRevision = hydrateDesignStyleDraftPersistence({
    rawDraft: {
      [DESIGN_STYLE_DRAFT_FIELD]: {
        ...current.envelope!,
        ledger: {
          ...current.envelope!.ledger,
          assignmentsByGarmentKey: {},
        },
      },
    },
    activeOccurrences: [shirt],
    authority: authorityFor({ styles: [shirtStyle], occurrences: [shirt] }),
  });
  assert.equal(
    shouldApplyDesignStyleDraftHydration({
      requestGeneration: 5,
      currentGeneration: 5,
      current,
      incoming: conflictingSameRevision,
    }),
    false,
  );
  assert.equal(
    shouldApplyDesignStyleDraftHydration({
      requestGeneration: 5,
      currentGeneration: 5,
      current,
      incoming: current,
    }),
    true,
  );
}

console.log(
  "PASS: strict V2 Design Style draft parsing, migration, reconciliation, and race guards",
);
