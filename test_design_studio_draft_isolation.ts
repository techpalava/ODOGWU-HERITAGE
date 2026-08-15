import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DesignStudioStageId, GuestDesignDraft } from "./src/types";
import {
  createDesignStudioDraftRepository,
  FUTURE_DESIGN_STUDIO_DRAFT_CLOUD_SYNC_NAMESPACE,
  FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE,
  FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
  LEGACY_DESIGN_STUDIO_DRAFT_NAMESPACE,
} from "./src/utils/designStudioDraftPersistence";

class MemoryStorage {
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

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const makeDraft = (
  stage: DesignStudioStageId,
  overrides: Partial<GuestDesignDraft> = {},
): GuestDesignDraft => ({
  journeySchemaVersion: 1,
  currentStageId: stage,
  currentStep: 3,
  garmentTypeSelection: {
    garmentTypes: ["shirt"],
    demographic: "male",
    constructionByGarment: {
      shirt: {
        status: "resolved",
        garmentType: "shirt",
        components: [
          {
            componentKey: "shirt_construction",
            optionId: "shirt_standard_short",
            selectionGroup: "shirt_construction",
            priceCents: 6500,
            price: 65,
          },
        ],
        totalPriceCents: 6500,
        totalPrice: 65,
      },
    },
  },
  aiTryOnWorkflow: {
    schemaVersion: 1,
    status: "skipped",
    inputFingerprint: null,
  },
  futureMeasurementState: {
    schemaVersion: 1,
    route: "low_risk",
    unit: "inch",
    entered: { shared: {}, byGarmentKey: {} },
    derived: { shared: {}, byGarmentKey: {} },
    blueprintVersion: "measurement-blueprint-v1",
    formulaVersion: null,
    inputFingerprint: "measurement-input-v1",
    calculationStatus: "complete",
    diagnostics: [],
    invalidInputKeys: [],
  },
  futureShippingState: {
    schemaVersion: 1,
    fulfilmentMethod: "destination_delivery",
    customerInformation: {
      fullName: "Future Customer",
      phone: "+31000000000",
      email: "future@example.com",
      deliveryAddress: {
        addressLine1: "Private street",
        addressLine2: "",
        city: "Eindhoven",
        postalCode: "0000AA",
        countryCode: "NL",
      },
      comment: "Private delivery requirement",
    },
    destinationZoneId: "NETHERLANDS_OTHER",
    destinationZoneSource: "customer_provisional",
    quoteReference: null,
  },
  selectedFabricCode: "FABRIC-A",
  selectedStyleId: "STYLE-A",
  designSource: {
    kind: "catalog",
    sourceKey: "catalog:STYLE-A",
    styleId: "STYLE-A",
  },
  selectedGarment: null,
  designSelections: {
    garmentScopedCustomDetails: {
      schemaVersion: 1,
      selectionsByGarmentKey: {
        "base:shirt": { neck_design: "round_neck" },
      },
      snapshotsByGarmentKey: {},
    },
    garmentScopedCustomDetailInputs: {
      schemaVersion: 1,
      textByGarmentKey: {
        "base:shirt": {
          personalized_additional: {
            personalized_additional_evaluation: "F.O.",
          },
        },
      },
    },
    accessories: ["traditional_hat"],
  },
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
  deliveryMethod: "DELIVERY",
  deliveryAddress: {
    addressLine1: "Legacy-compatible address",
    city: "Eindhoven",
    postalCode: "0000AA",
    countryCode: "NL",
  },
  pickupTime: "",
  customerName: "Future Customer",
  customerEmail: "future@example.com",
  customerPhone: "+31000000000",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "Personalized requirement",
  leftoverFabricChoice: "return",
  hasLining: false,
  pricingBreakdown: {
    fabricPrice: 4,
    fabricSewingCost: 4.06,
    constructionSewingCost: 65,
    customDetailsPrice: 12,
    selectedDesignPrice: 216.31,
    lagosToEindhovenShipping: 131.25,
    eindhovenToDestinationShipping: null,
    total: 216.31,
  },
  shippingSnapshot: {},
  fabricAllocations: [
    {
      allocationId: "allocation-1",
      fabricCode: "FABRIC-A",
      garmentAssignments: [
        {
          garmentKey: "base:shirt",
          code: "SHIRT",
          garmentType: "shirt",
          fabricUnits: 1,
        },
      ],
    },
  ],
  updatedAt: "2026-08-15T10:00:00.000Z",
  ...overrides,
});

const createFixture = ({
  legacyDraft = null as GuestDesignDraft | null,
  now = "2026-08-15T10:15:00.000Z",
} = {}) => {
  const storage = new MemoryStorage();
  let legacy = legacyDraft ? clone(legacyDraft) : null;
  const repository = createDesignStudioDraftRepository({
    storage,
    legacy: {
      load: () => (legacy ? clone(legacy) : null),
    },
    normalizeDraft: clone,
    legacySourceVersion: "2026-07-30-guest-order-v1",
    now: () => now,
  });
  return {
    storage,
    repository,
    getLegacy: () => (legacy ? clone(legacy) : null),
    setLegacy: (draft: GuestDesignDraft | null) => {
      legacy = draft ? clone(draft) : null;
    },
  };
};

const legacyOnly = makeDraft("garment_type", {
  customerName: "Legacy Customer",
});
delete legacyOnly.journeySchemaVersion;
delete legacyOnly.currentStageId;
const future = makeDraft("shipping");

const isolation = createFixture();
const cloudSyncMarker = isolation.repository.recordCloudSynchronization({
  ownerUid: "uid-future-customer",
  cloudRevision: 3,
});
assert.equal(cloudSyncMarker?.cloudRevision, 3);
assert.deepEqual(isolation.repository.readCloudSyncResult(), cloudSyncMarker);
assert.doesNotMatch(
  isolation.storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_CLOUD_SYNC_NAMESPACE) ||
    "",
  /Future Customer|Private street|Personalized requirement/,
);
assert.equal(isolation.repository.saveFutureDraftV1(future).status, "saved");
assert.equal(
  isolation.repository.clearFutureDraftAfterCloudSynchronization(),
  true,
);
assert.equal(isolation.repository.loadFutureDraftV1().status, "empty");
assert.deepEqual(isolation.repository.readCloudSyncResult(), cloudSyncMarker);
isolation.setLegacy(legacyOnly);
assert.deepEqual(isolation.getLegacy(), legacyOnly);
assert.equal(
  isolation.storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE),
  null,
);
const legacyBeforeFutureSave = clone(isolation.getLegacy());
assert.equal(isolation.repository.saveFutureDraftV1(future).status, "saved");
assert.deepEqual(isolation.getLegacy(), legacyBeforeFutureSave);
assert.notEqual(
  isolation.storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE),
  null,
);

const futureBeforeLegacySave = isolation.repository.loadFutureDraftV1();
assert.equal(futureBeforeLegacySave.status, "loaded");
isolation.setLegacy({
  ...legacyOnly,
  customerName: "Changed Legacy Customer",
});
assert.deepEqual(
  isolation.repository.loadFutureDraftV1(),
  futureBeforeLegacySave,
);

isolation.repository.clearFutureDraftV1();
assert.equal(isolation.repository.loadFutureDraftV1().status, "empty");
assert.equal(isolation.getLegacy()?.customerName, "Changed Legacy Customer");
assert.equal(isolation.repository.readMigrationResult()?.resultCode, "cleared");

assert.equal(isolation.repository.saveFutureDraftV1(future).status, "saved");
isolation.setLegacy(null);
assert.equal(isolation.getLegacy(), null);
assert.equal(isolation.repository.loadFutureDraftV1().status, "loaded");

const existingDestination = createFixture({
  legacyDraft: makeDraft("payment", { selectedStyleId: "MIGRATION-SOURCE" }),
});
const existingFuture = makeDraft("summary", {
  selectedStyleId: "EXISTING-DESTINATION",
});
existingDestination.repository.saveFutureDraftV1(existingFuture);
const destinationResult =
  existingDestination.repository.migrateHistoricalFutureDraft();
assert.equal(destinationResult.resultCode, "existing_future");
assert.equal(destinationResult.draft?.selectedStyleId, "EXISTING-DESTINATION");

const historicalSource = makeDraft("measurement", {
  customerName: "Sensitive Name",
  customerEmail: "sensitive@example.com",
  customerPhone: "+31000000001",
  specialInstructions: "Sensitive personalization",
});
const migration = createFixture({ legacyDraft: historicalSource });
const sourceBeforeMigration = clone(migration.getLegacy());
const firstMigration = migration.repository.migrateHistoricalFutureDraft();
assert.equal(firstMigration.resultCode, "migrated");
assert.equal(firstMigration.wroteDestination, true);
assert.deepEqual(migration.getLegacy(), sourceBeforeMigration);
const destinationAfterFirstMigration = migration.storage.getItem(
  FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
);
const secondMigration = migration.repository.migrateHistoricalFutureDraft();
assert.equal(secondMigration.resultCode, "migrated");
assert.equal(secondMigration.wroteDestination, false);
assert.equal(
  migration.storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE),
  destinationAfterFirstMigration,
);
assert.deepEqual(migration.getLegacy(), sourceBeforeMigration);

const journalRaw = migration.storage.getItem(
  FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE,
);
assert.ok(journalRaw);
[
  "Sensitive Name",
  "sensitive@example.com",
  "+31000000001",
  "Sensitive personalization",
  "Private street",
].forEach((privateValue) =>
  assert.equal(journalRaw.includes(privateValue), false),
);
assert.deepEqual(Object.keys(JSON.parse(journalRaw)).sort(), [
  "completedAt",
  "destinationNamespace",
  "destinationVersion",
  "resultCode",
  "schemaVersion",
  "sourceNamespace",
  "sourceVersion",
]);

const ambiguous = createFixture({ legacyDraft: legacyOnly });
const ambiguousResult = ambiguous.repository.migrateHistoricalFutureDraft();
assert.equal(ambiguousResult.resultCode, "not_migrated_ambiguous_source");
assert.equal(
  ambiguous.storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE),
  null,
);
assert.deepEqual(ambiguous.getLegacy(), legacyOnly);

const malformedDestination = createFixture({ legacyDraft: historicalSource });
malformedDestination.storage.setItem(
  FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
  "{not-json",
);
assert.equal(
  malformedDestination.repository.loadFutureDraftV1().status,
  "invalid",
);
assert.equal(
  malformedDestination.repository.migrateHistoricalFutureDraft().resultCode,
  "not_migrated_invalid_destination",
);
assert.equal(
  malformedDestination.storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE),
  "{not-json",
);

const malformedMarkedSource = createFixture({
  legacyDraft: {
    journeySchemaVersion: 1,
    currentStageId: "fabric",
  } as GuestDesignDraft,
});
const strictNormalizer = createDesignStudioDraftRepository({
  storage: malformedMarkedSource.storage,
  legacy: {
    load: malformedMarkedSource.getLegacy,
  },
  normalizeDraft: (draft) => {
    if (!draft.designSelections) throw new Error("Malformed draft");
    return draft;
  },
  legacySourceVersion: "2026-07-30-guest-order-v1",
});
assert.equal(
  strictNormalizer.migrateHistoricalFutureDraft().resultCode,
  "not_migrated_malformed_source",
);

const allStages: DesignStudioStageId[] = [
  "garment_type",
  "fabric",
  "design_style",
  "custom_details",
  "try_on",
  "measurement",
  "summary",
  "shipping",
  "payment",
];
allStages.forEach((stage) => {
  const roundTrip = createFixture();
  const stageDraft = makeDraft(stage);
  assert.equal(
    roundTrip.repository.saveFutureDraftV1(stageDraft).status,
    "saved",
  );
  const reloaded = roundTrip.repository.loadFutureDraftV1();
  assert.equal(reloaded.status, "loaded");
  assert.deepEqual(reloaded.draft, stageDraft);
});

assert.equal(
  LEGACY_DESIGN_STUDIO_DRAFT_NAMESPACE,
  "odogwu_guest_order_session_v1.designDraft",
);
const appSource = readFileSync("src/App.tsx", "utf8");
assert.doesNotMatch(appSource, /journeyMode=/);
const studioSource = readFileSync(
  "src/components/DesignStudioView.tsx",
  "utf8",
);
assert.match(studioSource, /getFutureDesignDraft\(\)/);
assert.match(studioSource, /saveFutureDesignDraft\(guestDraft\)/);
assert.doesNotMatch(studioSource, /saveLegacyDesignDraft/);

const browserStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: browserStorage,
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: browserStorage },
});
const { StorageService } = await import("./src/services/storageService");
const { GuestOrderSessionService } =
  await import("./src/services/guestOrderSessionService");
StorageService.clearGuestOrderSession();
StorageService.saveGuestOrderSession({
  ...GuestOrderSessionService.getActiveSession(),
  designDraft: legacyOnly,
});
const persistedLegacyBeforeFuture = clone(
  StorageService.getGuestOrderSession()?.designDraft,
);
GuestOrderSessionService.saveFutureDesignDraft(future);
assert.deepEqual(
  StorageService.getGuestOrderSession()?.designDraft,
  persistedLegacyBeforeFuture,
);
assert.equal(
  GuestOrderSessionService.getFutureDesignDraft()?.currentStageId,
  "shipping",
);
GuestOrderSessionService.clearFutureDesignDraft();
assert.deepEqual(
  StorageService.getGuestOrderSession()?.designDraft,
  persistedLegacyBeforeFuture,
);
GuestOrderSessionService.saveFutureDesignDraft(future);
assert.deepEqual(
  StorageService.getGuestOrderSession()?.designDraft,
  persistedLegacyBeforeFuture,
  "The active service must not mutate the read-only legacy migration source.",
);
assert.equal(
  GuestOrderSessionService.getFutureDesignDraft()?.currentStageId,
  "shipping",
);

console.log("Design Studio draft isolation verification passed.");
