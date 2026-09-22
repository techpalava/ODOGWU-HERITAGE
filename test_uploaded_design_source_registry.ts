import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type {
  CanonicalPhysicalGarmentType,
  GuestDesignDraft,
  StyleCategory,
  UploadedDesignSource,
} from "./src/types";
import {
  createAuthenticatedFutureDraftRepository,
  type AuthenticatedFutureDraftIdentity,
  type AuthenticatedFutureDraftPersistenceAdapter,
} from "./src/services/authenticatedFutureDraftService";
import { normalizeGuestDesignDraft } from "./src/services/guestOrderSessionService";
import {
  createUploadedDesignSource,
  type PhysicalGarmentOccurrence,
} from "./src/utils/designSourceState";
import {
  buildDesignStyleDraftValidationAuthority,
  buildUploadedDesignStyleAuthorityFromSources,
  hydrateDesignStyleDraftPersistence,
  inspectPersistedDesignStyleDraft,
  prepareDesignStyleDraftAutosave,
  validateDesignStyleDraftFieldForStorage,
  DESIGN_STYLE_DRAFT_FIELD,
} from "./src/utils/designStyleDraftPersistence";
import {
  projectDesignStyleStep,
} from "./src/utils/designStyleStepRuntime";
import {
  createDesignStudioDraftRepository,
  type DesignStudioDraftStorageAdapter,
} from "./src/utils/designStudioDraftPersistence";
import {
  assignCatalogDesignStyleToGarmentOccurrence,
  assignUploadedDesignStyleToGarmentOccurrence,
  clearGarmentDesignStyleAssignment,
  createEmptyGarmentScopedDesignStyleAssignmentLedger,
} from "./src/utils/garmentScopedDesignStyleAssignment";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";
import {
  bindUploadedDesignRestoreRequest,
  inspectUploadedDesignSourceRegistry,
  isCurrentUploadedDesignRestoreRequest,
  proveUploadedDesignDraftAccess,
  restoreUploadedDesignSourcesFromDraft,
  UPLOADED_DESIGN_SOURCE_REGISTRY_FIELD,
} from "./src/utils/uploadedDesignSourceRegistry";
import {
  getDesignStyleAuthorityMetadata,
} from "./src/utils/designStyleAuthority";
import {
  createStrictPublishedStyle,
  createDesignStyleOccurrences,
} from "./testing/designStyleStepFixtures";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const tokenFor = (occurrence: PhysicalGarmentOccurrence): string =>
  createPhysicalGarmentOccurrenceIdentityToken({
    garmentKey: occurrence.garmentKey,
    generation: occurrence.occurrenceGeneration!,
  });

const uploadedRefOf = (
  occurrenceKey: string,
  projection: ReturnType<typeof projectDesignStyleStep>,
): string | null => {
  const assignment = projection.occurrences.find(
    (item) => item.target.garmentKey === occurrenceKey,
  )?.assignment;
  return assignment?.sourceKind === "uploaded" ? assignment.uploadedSourceRef : null;
};

const uploadedSource = (
  designReferenceId: string,
  ownerUid = "owner-1",
  displayLabel = `Upload ${designReferenceId}`,
): UploadedDesignSource =>
  createUploadedDesignSource({
    uploadReference: {
      designReferenceId,
      ownerUid,
      storagePath: `customer-design-drafts/${ownerUid}/${designReferenceId}/original.png`,
      mimeType: "image/png",
      createdAt: "2026-09-21T00:00:00.000Z",
      originalFileName: `${designReferenceId}.png`,
    },
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
    demographic: "male",
    displayLabel,
  });

const shirtStyle = createStrictPublishedStyle({
  id: "style-shirt-registry",
  name: "Registry Shirt",
  description: "Catalogue fixture.",
  gender: "male",
  options: ["Standard"],
  image: "https://example.test/registry-shirt.webp",
  outfitType: "Native",
  garmentComposition: "Shirt",
  fabricCategory: "Any",
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt" as CanonicalPhysicalGarmentType),
  ],
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
} as StyleCategory);

const occurrences = createDesignStyleOccurrences(["shirt", "shirt"]);
const [shirtA, shirtB] = occurrences;

const assignUploaded = ({
  ledger,
  occurrence,
  source,
}: {
  ledger: ReturnType<typeof createEmptyGarmentScopedDesignStyleAssignmentLedger>;
  occurrence: PhysicalGarmentOccurrence;
  source: UploadedDesignSource;
}) => {
  const result = assignUploadedDesignStyleToGarmentOccurrence({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences: occurrences,
    target: {
      garmentKey: occurrence.garmentKey,
      occurrenceToken: tokenFor(occurrence),
    },
    source: {
      sourceKey: source.sourceKey,
      uploadedSourceRef: source.uploadReference.designReferenceId,
    },
  });
  assert.equal(result.status, "applied");
  return result.ledger;
};

const assignCatalog = ({
  ledger,
  occurrence,
  style,
}: {
  ledger: ReturnType<typeof createEmptyGarmentScopedDesignStyleAssignmentLedger>;
  occurrence: PhysicalGarmentOccurrence;
  style: StyleCategory;
}) => {
  const metadata = getDesignStyleAuthorityMetadata(style);
  assert.ok(metadata);
  const result = assignCatalogDesignStyleToGarmentOccurrence({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences: occurrences,
    target: {
      garmentKey: occurrence.garmentKey,
      occurrenceToken: tokenFor(occurrence),
    },
    source: {
      sourceKey: metadata.sourceKey,
      catalogStyleId: style.id,
      eligibilityFingerprint: metadata.eligibilityFingerprint,
    },
  });
  assert.equal(result.status, "applied");
  return result.ledger;
};

const authorityFor = (
  sources: readonly UploadedDesignSource[],
  accessProved = true,
  expectedOwnerUid: string | null = "owner-1",
  failedSourceKeys: Readonly<Record<string, true>> = {},
) =>
  buildDesignStyleDraftValidationAuthority({
    catalogueState: "ready",
    styles: [shirtStyle],
    garmentTypeSelection: {
      garmentTypes: ["shirt"],
      demographic: "male",
      audienceSelection: { schemaVersion: 1, demographics: ["male"] },
      constructionByGarment: {},
    },
    activeOccurrences: occurrences,
    uploadedSourcesByKey: buildUploadedDesignStyleAuthorityFromSources({
      sources,
      accessProvedSourceKeys: accessProved
        ? Object.fromEntries(sources.map((source) => [source.sourceKey, true]))
        : {},
      failedSourceKeys,
      expectedOwnerUid,
      ownershipTransferPending: false,
      sourceOperationStable: true,
      activeOccurrences: occurrences,
    }),
  });

const makeDraft = (overrides: Partial<GuestDesignDraft> = {}): GuestDesignDraft => ({
  journeySchemaVersion: 1,
  currentStageId: "design_style",
  currentStep: 3,
  garmentTypeSelection: {
    garmentTypes: ["shirt"],
    demographic: "male",
    constructionByGarment: {},
  },
  selectedFabricCode: null,
  selectedStyleId: null,
  selectedGarment: null,
  designSelections: { accessories: [] },
  measurements: {
    height: 180,
    weight: 80,
    age: 40,
    bodyBuild: "Average",
    fitPreference: "Standard",
    neck: 16,
    shoulder: 18,
    chest: 40,
    waist: 34,
    hip: 40,
    sleeve: 25,
    trouserLength: 42,
    isAiEstimated: false,
    unit: "inch",
  },
  sizingMode: "manual",
  deliveryMethod: null,
  deliveryAddress: {
    addressLine1: "",
    city: "",
    postalCode: "",
    countryCode: "",
  },
  pickupTime: "",
  customerName: "Draft Customer",
  customerEmail: "draft@example.com",
  customerPhone: "+31000000000",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "",
  leftoverFabricChoice: "return",
  hasLining: false,
  pricingBreakdown: {
    customDetailsPrice: 0,
    eindhovenToDestinationShipping: null,
  },
  shippingSnapshot: {},
  fabricAllocations: [],
  updatedAt: "2026-09-21T00:00:00.000Z",
  ...overrides,
});

class MemoryStorage implements DesignStudioDraftStorageAdapter {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class FailingOnceStorage extends MemoryStorage {
  failNext = false;

  override setItem(key: string, value: string): void {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("persist-failed");
    }
    super.setItem(key, value);
  }
}

const createGuestRepository = (storage: DesignStudioDraftStorageAdapter) =>
  createDesignStudioDraftRepository({
    storage,
    legacy: { load: () => null },
    normalizeDraft: normalizeGuestDesignDraft,
    legacySourceVersion: "registry-test",
  });

class MemoryCloudAdapter implements AuthenticatedFutureDraftPersistenceAdapter {
  readonly values = new Map<string, unknown>();

  async load(ownerUid: string): Promise<unknown | null> {
    return this.values.has(ownerUid) ? clone(this.values.get(ownerUid)) : null;
  }

  async commit(input: {
    ownerUid: string;
    expectedRevision: number | null;
    lifecycleStatus: "active" | "cleared";
    draft?: GuestDesignDraft;
  }) {
    const current = this.values.get(input.ownerUid) as
      | { revision?: number; createdAt?: string }
      | undefined;
    const currentRevision = current?.revision ?? null;
    if (currentRevision !== input.expectedRevision) {
      return {
        status: "conflict" as const,
        currentValue: current ? clone(current) : null,
      };
    }
    const revision = (currentRevision || 0) + 1;
    const timestamp = `2026-09-21T10:${String(revision).padStart(2, "0")}:00.000Z`;
    const value = {
      schemaVersion: 1,
      lifecycleStatus: input.lifecycleStatus,
      revision,
      createdAt: current?.createdAt || timestamp,
      updatedAt: timestamp,
      ...(input.lifecycleStatus === "active" ? { draft: clone(input.draft) } : {}),
    };
    this.values.set(input.ownerUid, value);
    return { status: "saved" as const, value: clone(value) };
  }
}

const persistPrepared = ({
  ledger,
  sources,
  draft = makeDraft(),
}: {
  ledger: ReturnType<typeof createEmptyGarmentScopedDesignStyleAssignmentLedger>;
  sources: readonly UploadedDesignSource[];
  draft?: GuestDesignDraft;
}) => {
  const envelope = { schemaVersion: 2 as const, ledger };
  const hydrated = hydrateDesignStyleDraftPersistence({
    rawDraft: { ...draft, [DESIGN_STYLE_DRAFT_FIELD]: envelope },
    activeOccurrences: occurrences,
    authority: authorityFor(sources),
  });
  const prepared = prepareDesignStyleDraftAutosave({
    draft: { ...draft, [DESIGN_STYLE_DRAFT_FIELD]: envelope },
    hydrated,
    activeOccurrences: occurrences,
    authority: authorityFor(sources),
    hydrationGeneration: 1,
    currentHydrationGeneration: 1,
    uploadedDesignSources: sources,
  });
  assert.equal(prepared.status, "ready");
  return prepared.status === "ready" ? prepared.draft : draft;
};

const remountFromPersistedDraft = async ({
  persistedDraft,
  expectedOwnerUid = "owner-1",
  readBlobs,
}: {
  persistedDraft: GuestDesignDraft;
  expectedOwnerUid?: string | null;
  readBlobs: Readonly<Record<string, Blob | Error>>;
}) => {
  const transientMapsDiscarded = {
    futureDesignStyleUploadedSourceByGarmentKey: {},
    previewUrls: {},
  };
  assert.deepEqual(transientMapsDiscarded.futureDesignStyleUploadedSourceByGarmentKey, {});
  const parsedLedger = inspectPersistedDesignStyleDraft(persistedDraft);
  const ledger =
    parsedLedger.status === "valid" ? parsedLedger.envelope.ledger : null;
  const restored = restoreUploadedDesignSourcesFromDraft({
    rawDraft: persistedDraft,
    ledger,
  });
  const proved: Record<string, true> = {};
  const failed: Record<string, true> = {};
  const previews: Record<string, string> = {};
  for (const source of Object.values(restored.sourcesByUploadedSourceRef)) {
    const result = await proveUploadedDesignDraftAccess({
      source,
      expectedOwnerUid,
      readCustomerDesignDraft: async (reference) => {
        const blob = readBlobs[reference.designReferenceId];
        if (blob instanceof Error) throw blob;
        if (!blob) throw new Error("READ_FAILED");
        return blob;
      },
    });
    if (result.status === "proved") {
      proved[source.sourceKey] = true;
      if (ledger) {
        for (const assignment of Object.values(ledger.assignmentsByGarmentKey)) {
          if (
            assignment.sourceKind === "uploaded" &&
            assignment.uploadedSourceRef ===
              source.uploadReference.designReferenceId
          ) {
            previews[assignment.occurrenceToken] =
              `blob:restored:${source.uploadReference.designReferenceId}`;
          }
        }
      }
    } else if (result.reason !== "MISSING_OWNER") {
      failed[source.sourceKey] = true;
    }
  }
  const authority = authorityFor(
    Object.values(restored.sourcesByUploadedSourceRef),
    false,
    expectedOwnerUid,
    failed,
  );
  const hydration = hydrateDesignStyleDraftPersistence({
    rawDraft: persistedDraft,
    activeOccurrences: occurrences,
    authority: {
      ...authority,
      uploadedSourcesByKey: buildUploadedDesignStyleAuthorityFromSources({
        sources: Object.values(restored.sourcesByUploadedSourceRef),
        accessProvedSourceKeys: proved,
        failedSourceKeys: failed,
        expectedOwnerUid,
        ownershipTransferPending: false,
        sourceOperationStable: true,
        activeOccurrences: occurrences,
      }),
    },
  });
  const projection = projectDesignStyleStep({
    activeOccurrences: occurrences,
    hydration,
    authority: {
      ...authority,
      uploadedSourcesByKey: buildUploadedDesignStyleAuthorityFromSources({
        sources: Object.values(restored.sourcesByUploadedSourceRef),
        accessProvedSourceKeys: proved,
        failedSourceKeys: failed,
        expectedOwnerUid,
        ownershipTransferPending: false,
        sourceOperationStable: true,
        activeOccurrences: occurrences,
      }),
    },
    styles: [shirtStyle],
  });
  return { restored, hydration, projection, previews, proved, failed };
};

const sourceA = uploadedSource("upload-a", "owner-1", "Shirt upload A");
const sourceB = uploadedSource("upload-b", "owner-1", "Shirt upload B");
const blobA = new Blob(["a"], { type: "image/png" });
const blobB = new Blob(["b"], { type: "image/png" });

// 1-5. Two same-type sequential uploads persist through the real draft path,
// transient maps are discarded, and both restore after mocked private reads.
{
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assignUploaded({ ledger, occurrence: shirtA, source: sourceA });
  ledger = assignUploaded({ ledger, occurrence: shirtB, source: sourceB });
  const prepared = persistPrepared({ ledger, sources: [sourceA, sourceB] });
  const storage = new MemoryStorage();
  const guest = createGuestRepository(storage);
  assert.equal(guest.saveFutureDraftV1(prepared).status, "saved");
  const loaded = guest.loadFutureDraftV1();
  assert.equal(loaded.status, "loaded");
  const persisted = loaded.status === "loaded" ? loaded.draft : prepared;
  const remounted = await remountFromPersistedDraft({
    persistedDraft: persisted,
    readBlobs: {
      "upload-a": blobA,
      "upload-b": blobB,
    },
  });
  const registry = inspectUploadedDesignSourceRegistry(persisted);
  assert.equal(registry.status, "valid");
  assert.equal(
    registry.status === "valid"
      ? Object.keys(registry.registry.sourcesByUploadedSourceRef).sort().join(",")
      : "",
    "upload-a,upload-b",
  );
  assert.equal(remounted.restored.sourcesByUploadedSourceRef["upload-a"]?.displayLabel, "Shirt upload A");
  assert.equal(remounted.restored.sourcesByUploadedSourceRef["upload-b"]?.displayLabel, "Shirt upload B");
  assert.equal(remounted.previews[tokenFor(shirtA)], "blob:restored:upload-a");
  assert.equal(remounted.previews[tokenFor(shirtB)], "blob:restored:upload-b");
  assert.equal(remounted.projection.isComplete, true);
  assert.equal(
    remounted.projection.occurrences.find((item) => item.target.garmentKey === shirtA.garmentKey)
      ?.assignmentLabel,
    "Uploaded design",
  );
  assert.doesNotMatch(JSON.stringify(persisted[UPLOADED_DESIGN_SOURCE_REGISTRY_FIELD]), /blob:/);

  const adapter = new MemoryCloudAdapter();
  const identity: AuthenticatedFutureDraftIdentity = {
    status: "authenticated",
    ownerUid: "owner-1",
  };
  const cloud = createAuthenticatedFutureDraftRepository({
    adapter,
    getIdentity: () => identity,
  });
  assert.equal((await cloud.save(prepared, null)).status, "saved");
  const loadedCloud = await cloud.load();
  assert.equal(loadedCloud.status, "loaded");
  const cloudDraft =
    loadedCloud.status === "loaded" ? loadedCloud.record.draft : null;
  assert.ok(cloudDraft);
  const remountedCloud = await remountFromPersistedDraft({
    persistedDraft: cloudDraft!,
    readBlobs: { "upload-a": blobA, "upload-b": blobB },
  });
  assert.equal(remountedCloud.projection.isComplete, true);
}

// 6. Replace/remove B, persist, reload; A survives.
{
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assignUploaded({ ledger, occurrence: shirtA, source: sourceA });
  ledger = assignUploaded({ ledger, occurrence: shirtB, source: sourceB });
  const cleared = clearGarmentDesignStyleAssignment({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences: occurrences,
    target: { garmentKey: shirtB.garmentKey, occurrenceToken: tokenFor(shirtB) },
  });
  assert.equal(cleared.status, "applied");
  const prepared = persistPrepared({
    ledger: cleared.ledger,
    sources: [sourceA, sourceB],
  });
  const storage = new MemoryStorage();
  const guest = createGuestRepository(storage);
  assert.equal(guest.saveFutureDraftV1(prepared).status, "saved");
  const loaded = guest.loadFutureDraftV1();
  assert.equal(loaded.status, "loaded");
  const remounted = await remountFromPersistedDraft({
    persistedDraft: loaded.status === "loaded" ? loaded.draft : prepared,
    readBlobs: { "upload-a": blobA, "upload-b": blobB },
  });
  assert.equal(
    Object.keys(remounted.restored.sourcesByUploadedSourceRef).join(","),
    "upload-a",
  );
  assert.equal(
    remounted.projection.occurrences.find((item) => item.target.garmentKey === shirtA.garmentKey)
      ?.assignment?.sourceKind,
    "uploaded",
  );
  assert.equal(
    remounted.projection.occurrences.find((item) => item.target.garmentKey === shirtB.garmentKey)
      ?.assignment,
    null,
  );
}

// 7. Mixed catalogue + upload restore.
{
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assignCatalog({ ledger, occurrence: shirtA, style: shirtStyle });
  ledger = assignUploaded({ ledger, occurrence: shirtB, source: sourceA });
  const prepared = persistPrepared({ ledger, sources: [sourceA] });
  const storage = new MemoryStorage();
  assert.equal(createGuestRepository(storage).saveFutureDraftV1(prepared).status, "saved");
  const loaded = createGuestRepository(storage).loadFutureDraftV1();
  const remounted = await remountFromPersistedDraft({
    persistedDraft: loaded.status === "loaded" ? loaded.draft : prepared,
    readBlobs: { "upload-a": blobA },
  });
  assert.equal(
    remounted.projection.occurrences.find((item) => item.target.garmentKey === shirtA.garmentKey)
      ?.assignment?.sourceKind,
    "catalog",
  );
  assert.equal(uploadedRefOf(shirtB.garmentKey, remounted.projection), "upload-a");
  assert.equal(remounted.projection.isComplete, true);
}

// 8. Shared source survives removing one referencing occurrence.
{
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assignUploaded({ ledger, occurrence: shirtA, source: sourceA });
  ledger = assignUploaded({ ledger, occurrence: shirtB, source: sourceA });
  const cleared = clearGarmentDesignStyleAssignment({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences: occurrences,
    target: { garmentKey: shirtB.garmentKey, occurrenceToken: tokenFor(shirtB) },
  });
  assert.equal(cleared.status, "applied");
  const prepared = persistPrepared({
    ledger: cleared.ledger,
    sources: [sourceA],
  });
  const remounted = await remountFromPersistedDraft({
    persistedDraft: prepared,
    readBlobs: { "upload-a": blobA },
  });
  assert.equal(
    remounted.restored.sourcesByUploadedSourceRef["upload-a"]?.displayLabel,
    "Shirt upload A",
  );
  assert.equal(uploadedRefOf(shirtA.garmentKey, remounted.projection), "upload-a");
}

// 9. Legacy A-C.
{
  const catalogueOnly = makeDraft({
    [DESIGN_STYLE_DRAFT_FIELD]: {
      schemaVersion: 2,
      ledger: assignCatalog({
        ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
        occurrence: shirtA,
        style: shirtStyle,
      }),
    },
  });
  const catalogueLedger = inspectPersistedDesignStyleDraft(catalogueOnly);
  const restoredA = restoreUploadedDesignSourcesFromDraft({
    rawDraft: catalogueOnly,
    ledger: catalogueLedger.status === "valid" ? catalogueLedger.envelope.ledger : null,
  });
  assert.equal(restoredA.registryParse.status, "absent");
  assert.deepEqual(restoredA.sourcesByUploadedSourceRef, {});

  let scalarLedger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  scalarLedger = assignUploaded({ ledger: scalarLedger, occurrence: shirtA, source: sourceA });
  scalarLedger = assignUploaded({ ledger: scalarLedger, occurrence: shirtB, source: sourceB });
  const matchingScalarOnly = makeDraft({
    designSource: sourceA,
    [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 2, ledger: scalarLedger },
  });
  const restoredB = restoreUploadedDesignSourcesFromDraft({
    rawDraft: matchingScalarOnly,
    ledger: scalarLedger,
  });
  assert.equal(restoredB.registryParse.status, "absent");
  assert.equal(
    Object.keys(restoredB.sourcesByUploadedSourceRef).join(","),
    "upload-a",
  );

  const opaqueOnly = makeDraft({
    [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 2, ledger: scalarLedger },
  });
  const remountedC = await remountFromPersistedDraft({
    persistedDraft: opaqueOnly,
    readBlobs: { "upload-a": blobA, "upload-b": blobB },
  });
  assert.deepEqual(remountedC.restored.sourcesByUploadedSourceRef, {});
  assert.equal(remountedC.projection.isComplete, false);
  assert.equal(
    remountedC.projection.occurrences.every(
      (item) => item.assignment?.sourceKind === "uploaded",
    ),
    true,
  );
}

// 10. Malformed, wrong-owner, unavailable blob fail safely.
{
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assignUploaded({ ledger, occurrence: shirtA, source: sourceA });
  const malformedDraft = makeDraft({
    [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 2, ledger },
    [UPLOADED_DESIGN_SOURCE_REGISTRY_FIELD]: {
      schemaVersion: 1,
      sourcesByUploadedSourceRef: {
        "upload-a": sourceA,
      },
      extra: true,
    },
  });
  const malformedHydration = hydrateDesignStyleDraftPersistence({
    rawDraft: malformedDraft,
    activeOccurrences: occurrences,
    authority: authorityFor([sourceA]),
  });
  assert.equal(malformedHydration.destructiveNormalizationProhibited, true);
  assert.equal(malformedHydration.canAutosave, false);
  assert.ok(malformedHydration.ledger);
  assert.equal(
    validateDesignStyleDraftFieldForStorage(malformedDraft).status,
    "invalid",
  );
  const blocked = prepareDesignStyleDraftAutosave({
    draft: malformedDraft,
    hydrated: malformedHydration,
    activeOccurrences: occurrences,
    authority: authorityFor([sourceA]),
    hydrationGeneration: 1,
    currentHydrationGeneration: 1,
    uploadedDesignSources: [sourceA],
  });
  assert.equal(blocked.status, "blocked");

  const ownerMismatch = await remountFromPersistedDraft({
    persistedDraft: persistPrepared({ ledger, sources: [sourceA] }),
    expectedOwnerUid: "other-owner",
    readBlobs: { "upload-a": blobA },
  });
  assert.equal(ownerMismatch.projection.isComplete, false);
  assert.equal(ownerMismatch.proved[sourceA.sourceKey], undefined);

  const readFailed = await remountFromPersistedDraft({
    persistedDraft: persistPrepared({ ledger, sources: [sourceA] }),
    readBlobs: { "upload-a": new Error("READ_FAILED") },
  });
  assert.equal(readFailed.projection.isComplete, false);
  assert.equal(readFailed.failed[sourceA.sourceKey], true);
}

// 11. Delayed restore results cannot cross draft, source ref, or occurrence boundaries.
{
  const request = bindUploadedDesignRestoreRequest({
    draftIdentityKey: "authenticated:owner-1",
    identityGeneration: 4,
    occurrenceToken: tokenFor(shirtA),
    uploadedSourceRef: "upload-a",
  });
  assert.equal(
    isCurrentUploadedDesignRestoreRequest({
      request,
      current: { ...request, draftIdentityKey: "authenticated:owner-2" },
    }),
    false,
  );
  assert.equal(
    isCurrentUploadedDesignRestoreRequest({
      request,
      current: { ...request, uploadedSourceRef: "upload-b" },
    }),
    false,
  );
  assert.equal(
    isCurrentUploadedDesignRestoreRequest({
      request,
      current: { ...request, occurrenceToken: tokenFor(shirtB) },
    }),
    false,
  );
  assert.equal(
    isCurrentUploadedDesignRestoreRequest({
      request,
      current: { ...request, identityGeneration: 5 },
    }),
    false,
  );
  assert.equal(isCurrentUploadedDesignRestoreRequest({ request, current: request }), true);
}

// 12. Failed persistence cannot be reported as restorable success.
{
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assignUploaded({ ledger, occurrence: shirtA, source: sourceA });
  const first = persistPrepared({ ledger, sources: [sourceA] });
  const storage = new FailingOnceStorage();
  const guest = createGuestRepository(storage);
  assert.equal(guest.saveFutureDraftV1(first).status, "saved");
  ledger = assignUploaded({ ledger, occurrence: shirtB, source: sourceB });
  const second = persistPrepared({ ledger, sources: [sourceA, sourceB] });
  storage.failNext = true;
  let saveFailed = false;
  try {
    guest.saveFutureDraftV1(second);
  } catch {
    saveFailed = true;
  }
  assert.equal(saveFailed, true);
  const loaded = guest.loadFutureDraftV1();
  assert.equal(loaded.status, "loaded");
  const remounted = await remountFromPersistedDraft({
    persistedDraft: loaded.status === "loaded" ? loaded.draft : first,
    readBlobs: { "upload-a": blobA, "upload-b": blobB },
  });
  assert.equal(
    Object.keys(remounted.restored.sourcesByUploadedSourceRef).join(","),
    "upload-a",
  );
  assert.notEqual(remounted.projection.isComplete, true);
}

console.log("uploaded design source registry persistence contract passed");
