import assert from "node:assert/strict";
import type { GuestDesignDraft } from "./src/types";
import {
  createAuthenticatedFutureDraftRepository,
  type AuthenticatedFutureDraftIdentity,
  type AuthenticatedFutureDraftPersistenceAdapter,
} from "./src/services/authenticatedFutureDraftService";
import { normalizeGuestDesignDraft } from "./src/services/guestOrderSessionService";
import {
  createDesignStudioDraftRepository,
  FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
  type DesignStudioDraftStorageAdapter,
} from "./src/utils/designStudioDraftPersistence";
import {
  DESIGN_STYLE_DRAFT_FIELD,
  type PersistedDesignStyleDraftV2,
} from "./src/utils/designStyleDraftPersistence";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const envelopeFor = (
  styleId: string,
  fingerprint: string,
): PersistedDesignStyleDraftV2 => ({
  schemaVersion: 2,
  ledger: {
    schemaVersion: 2,
    revision: 2,
    assignmentsByGarmentKey: {
      "base:shirt": {
        garmentKey: "base:shirt",
        occurrenceToken: "physical-occurrence-v1:base%3Ashirt:1",
        assignmentRevision: 2,
        sourceKind: "catalog",
        sourceKey: `catalog-style:${styleId}`,
        catalogStyleId: styleId,
        eligibilityFingerprint: fingerprint,
      },
    },
  },
});

const reviewEnvelope: PersistedDesignStyleDraftV2 = {
  schemaVersion: 2,
  ledger: {
    schemaVersion: 2,
    revision: 0,
    assignmentsByGarmentKey: {},
  },
  migration: {
    schemaVersion: 1,
    legacySchema: "design_style_scalar_v1",
    sourceKind: "catalog",
    sourceKey: "catalog:STYLE-LEGACY",
    catalogStyleId: "STYLE-LEGACY",
    confirmationStatus: "confirmed",
    reason: "multiple_occurrences",
  },
};

const makeDraft = (
  envelope: unknown,
  overrides: Partial<GuestDesignDraft> = {},
): GuestDesignDraft => ({
  journeySchemaVersion: 1,
  currentStageId: "design_style",
  currentStep: 3,
  garmentTypeSelection: {
    garmentTypes: ["shirt"],
    demographic: "male",
    constructionByGarment: {
      shirt: {
        status: "resolved",
        garmentType: "shirt",
        components: [],
        totalPriceCents: 6500,
        totalPrice: 65,
      },
    },
  },
  selectedFabricCode: "FABRIC-A",
  selectedStyleId: "STYLE-LEGACY",
  designSource: {
    kind: "catalog",
    sourceKey: "catalog:STYLE-LEGACY",
    styleId: "STYLE-LEGACY",
  },
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
    fabricPrice: 0,
    fabricSewingCost: 0,
    constructionSewingCost: 65,
    customDetailsPrice: 0,
    lagosToEindhovenShipping: 0,
    eindhovenToDestinationShipping: null,
    total: 65,
  },
  shippingSnapshot: {},
  fabricAllocations: [],
  updatedAt: "2026-09-03T10:00:00.000Z",
  [DESIGN_STYLE_DRAFT_FIELD]: envelope,
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

const createGuestRepository = (storage: MemoryStorage) =>
  createDesignStudioDraftRepository({
    storage,
    legacy: { load: () => null },
    normalizeDraft: normalizeGuestDesignDraft,
    legacySourceVersion: "integration-test",
  });

class MemoryCloudAdapter implements AuthenticatedFutureDraftPersistenceAdapter {
  readonly values = new Map<string, unknown>();
  readonly writes: string[] = [];

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
    const timestamp = `2026-09-03T10:${String(revision).padStart(2, "0")}:00.000Z`;
    const value = {
      schemaVersion: 1,
      lifecycleStatus: input.lifecycleStatus,
      revision,
      createdAt: current?.createdAt || timestamp,
      updatedAt: timestamp,
      ...(input.lifecycleStatus === "active" ? { draft: clone(input.draft) } : {}),
    };
    this.values.set(input.ownerUid, value);
    this.writes.push(input.ownerUid);
    return { status: "saved" as const, value: clone(value) };
  }
}

const firstEnvelope = envelopeFor("STYLE-A", "eligibility-a");
const secondEnvelope = envelopeFor("STYLE-B", "eligibility-b");

// Guest persistence round-trips canonical V2 data without consulting conflicting scalar fields.
{
  const storage = new MemoryStorage();
  const repository = createGuestRepository(storage);
  const draft = makeDraft(firstEnvelope);
  const saved = repository.saveFutureDraftV1(draft);
  assert.equal(saved.status, "saved");
  const loaded = repository.loadFutureDraftV1();
  assert.equal(loaded.status, "loaded");
  assert.deepEqual(
    loaded.status === "loaded"
      ? loaded.draft[DESIGN_STYLE_DRAFT_FIELD]
      : null,
    firstEnvelope,
  );
  assert.equal(
    loaded.status === "loaded" ? loaded.draft.selectedStyleId : null,
    "STYLE-LEGACY",
    "Task 5C persistence must not activate or rewrite the released scalar UI.",
  );
}

// Separate guest storage identities neither share nor merge V2 ledgers.
{
  const leftStorage = new MemoryStorage();
  const rightStorage = new MemoryStorage();
  const left = createGuestRepository(leftStorage);
  const right = createGuestRepository(rightStorage);
  assert.equal(left.saveFutureDraftV1(makeDraft(firstEnvelope)).status, "saved");
  assert.equal(right.loadFutureDraftV1().status, "empty");
  assert.equal(right.saveFutureDraftV1(makeDraft(secondEnvelope)).status, "saved");
  assert.deepEqual(
    (left.loadFutureDraftV1().draft as GuestDesignDraft)[DESIGN_STYLE_DRAFT_FIELD],
    firstEnvelope,
  );
  assert.deepEqual(
    (right.loadFutureDraftV1().draft as GuestDesignDraft)[DESIGN_STYLE_DRAFT_FIELD],
    secondEnvelope,
  );
}

// Malformed/newer V2 cannot be written, while an existing raw payload remains untouched on read.
for (const invalidEnvelope of [
  { schemaVersion: 2, ledger: { schemaVersion: 2, revision: 0 } },
  { schemaVersion: 99, ledger: firstEnvelope.ledger },
]) {
  const storage = new MemoryStorage();
  const repository = createGuestRepository(storage);
  assert.equal(repository.saveFutureDraftV1(makeDraft(invalidEnvelope)).status, "rejected");
  assert.equal(storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE), null);

  const rawDraft = makeDraft(invalidEnvelope);
  storage.setItem(
    FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
    JSON.stringify({
      storageVersion: 1,
      journeyMode: "future_nine_stage",
      draft: rawDraft,
    }),
  );
  const rawBefore = storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
  const loaded = repository.loadFutureDraftV1();
  assert.equal(loaded.status, "loaded");
  assert.deepEqual(
    loaded.status === "loaded"
      ? loaded.draft[DESIGN_STYLE_DRAFT_FIELD]
      : null,
    invalidEnvelope,
  );
  assert.equal(storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE), rawBefore);
}

// Authenticated persistence is lossless and isolated exclusively by verified owner UID.
{
  const adapter = new MemoryCloudAdapter();
  let identity: AuthenticatedFutureDraftIdentity = {
    status: "authenticated",
    ownerUid: "uid-a",
  };
  const repository = createAuthenticatedFutureDraftRepository({
    adapter,
    getIdentity: () => identity,
  });
  assert.equal((await repository.save(makeDraft(firstEnvelope), null)).status, "saved");
  identity = { status: "authenticated", ownerUid: "uid-b" };
  assert.equal((await repository.load()).status, "absent");
  assert.equal((await repository.save(makeDraft(secondEnvelope), null)).status, "saved");
  identity = { status: "authenticated", ownerUid: "uid-a" };
  const loadedA = await repository.load();
  assert.equal(loadedA.status, "loaded");
  assert.deepEqual(
    loadedA.status === "loaded"
      ? loadedA.record.draft?.[DESIGN_STYLE_DRAFT_FIELD]
      : null,
    firstEnvelope,
  );
  assert.deepEqual(adapter.writes, ["uid-a", "uid-b"]);
}

// Guest-to-account transfer preserves V2 authority and unresolved migration evidence exactly.
for (const envelope of [firstEnvelope, reviewEnvelope]) {
  const adapter = new MemoryCloudAdapter();
  const repository = createAuthenticatedFutureDraftRepository({
    adapter,
    getIdentity: () => ({ status: "authenticated", ownerUid: "uid-transfer" }),
  });
  const transferred = await repository.synchronize(makeDraft(envelope));
  assert.equal(transferred.status, "guest_transferred");
  assert.deepEqual(transferred.draft?.[DESIGN_STYLE_DRAFT_FIELD], envelope);
  assert.equal(adapter.writes.length, 1);
}

// A present cloud draft wins by conflict; synchronization never merges two V2 ledgers.
{
  const adapter = new MemoryCloudAdapter();
  const repository = createAuthenticatedFutureDraftRepository({
    adapter,
    getIdentity: () => ({ status: "authenticated", ownerUid: "uid-conflict" }),
  });
  assert.equal((await repository.save(makeDraft(firstEnvelope), null)).status, "saved");
  const conflict = await repository.synchronize(makeDraft(secondEnvelope));
  assert.equal(conflict.status, "conflict");
  assert.deepEqual(
    conflict.status === "conflict"
      ? conflict.cloudDraft[DESIGN_STYLE_DRAFT_FIELD]
      : null,
    firstEnvelope,
  );
  assert.deepEqual(
    conflict.status === "conflict"
      ? conflict.guestDraft[DESIGN_STYLE_DRAFT_FIELD]
      : null,
    secondEnvelope,
  );
  assert.equal(adapter.writes.length, 1);
}

// Cloud writes reject malformed/unsupported V2 before the adapter can persist anything.
for (const invalidEnvelope of [
  { schemaVersion: 2, ledger: null },
  { schemaVersion: 3, ledger: firstEnvelope.ledger },
]) {
  const adapter = new MemoryCloudAdapter();
  const repository = createAuthenticatedFutureDraftRepository({
    adapter,
    getIdentity: () => ({ status: "authenticated", ownerUid: "uid-invalid" }),
  });
  assert.equal((await repository.save(makeDraft(invalidEnvelope), null)).status, "invalid");
  assert.equal(adapter.writes.length, 0);
  assert.equal(adapter.values.size, 0);
}

// Invalid cloud evidence fails closed in memory and is never rewritten during load.
{
  const adapter = new MemoryCloudAdapter();
  const invalidRecord = {
    schemaVersion: 1,
    lifecycleStatus: "active",
    revision: 4,
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T10:04:00.000Z",
    draft: makeDraft({ schemaVersion: 99, ledger: firstEnvelope.ledger }),
  };
  adapter.values.set("uid-invalid-load", clone(invalidRecord));
  const repository = createAuthenticatedFutureDraftRepository({
    adapter,
    getIdentity: () => ({
      status: "authenticated",
      ownerUid: "uid-invalid-load",
    }),
  });
  const loaded = await repository.load();
  assert.equal(loaded.status, "invalid");
  assert.equal(adapter.writes.length, 0);
  assert.deepEqual(adapter.values.get("uid-invalid-load"), invalidRecord);
}

console.log(
  "PASS: V2 Design Style guest, cloud, isolation, transfer, and conflict persistence",
);
