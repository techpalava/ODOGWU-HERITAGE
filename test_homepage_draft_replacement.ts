import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Batch, GuestDesignDraft, OrderContext } from "./src/types";
import {
  createAuthenticatedFutureDraftRepository,
  type AuthenticatedFutureDraftPersistenceAdapter,
} from "./src/services/authenticatedFutureDraftService";
import {
  classifyHomepageDraftEntry,
  createHomepageDraftReplacementService,
  executeHomepageDraftReplacementDiscard,
  type HomepageGuestDraftAuthority,
} from "./src/services/homepageDraftReplacement";
import {
  createDesignStudioDraftRepository,
  GUEST_ORDER_SESSION_STORAGE_NAMESPACE,
  FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE,
  FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
} from "./src/utils/designStudioDraftPersistence";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";
import { createDormantDesignStudioJourneyState } from "./src/utils/designStudioJourneyMode";
import { resolvePersistedDraftHydrationContext } from "./src/utils/orderContextIdentity";
import { GuestOrderSessionService } from "./src/services/guestOrderSessionService";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const pioneers: OrderContext = {
  orderType: "Community",
  batchId: "batch-8",
  batchName: "Pioneers",
};

const avatarsDraft = (): GuestDesignDraft => ({
  journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
  currentStageId: "summary",
  currentStep: 7,
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
  aiTryOnWorkflow: { schemaVersion: 1, status: "skipped", inputFingerprint: null },
  selectedFabricCode: "AVATARS-FABRIC",
  selectedStyleId: "AVATARS-STYLE",
  selectedGarment: null,
  designSelections: {
    accessories: ["AVATARS-ACCESSORY"],
    garmentScopedCustomDetails: {
      schemaVersion: 1,
      selectionsByGarmentKey: {
        "base:shirt:1": { shirt_construction: "avatars-custom-details" },
      },
      snapshotsByGarmentKey: {},
    },
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
  deliveryMethod: null,
  deliveryAddress: { addressLine1: "", city: "", postalCode: "", countryCode: "" },
  pickupTime: "",
  customerName: "Draft Customer",
  customerEmail: "draft@example.com",
  customerPhone: "+31000000000",
  batchType: "community",
  batchId: "batch-7",
  batchName: "Avatars",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "AVATARS-CUSTOM-INSTRUCTIONS",
  leftoverFabricChoice: "return",
  hasLining: false,
  pricingBreakdown: {
    fabricPrice: 4,
    fabricSewingCost: 4.06,
    constructionSewingCost: 65,
    customDetailsPrice: 0,
    lagosToEindhovenShipping: 131.25,
    eindhovenToDestinationShipping: null,
    total: 200.31,
  },
  shippingSnapshot: {},
  fabricAllocations: [
    {
      allocationId: "avatars-allocation",
      fabricCode: "AVATARS-FABRIC",
      garmentAssignments: [
        {
          garmentKey: "base:shirt:1",
          code: "SHIRT",
          garmentType: "shirt",
          fabricUnits: 1,
        },
      ],
    },
  ],
  updatedAt: "2026-09-10T10:00:00.000Z",
});

class MemoryStorage {
  readonly values = new Map<string, string>();
  writes = 0;
  failReads = false;
  failWritesFor: string | null = null;
  failRemovalsFor: string | null = null;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error("storage unavailable");
    return this.values.get(key) || null;
  }

  setItem(key: string, value: string): void {
    if (this.failWritesFor === key) throw new Error("storage write unavailable");
    this.writes += 1;
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failRemovalsFor === key) throw new Error("storage removal unavailable");
    this.writes += 1;
    this.values.delete(key);
  }
}

const createGuestAuthority = (draft: GuestDesignDraft) => {
  const storage = new MemoryStorage();
  const repository = createDesignStudioDraftRepository({
    storage,
    legacy: { load: () => null },
    normalizeDraft: (value) => value,
    legacySourceVersion: "test",
  });
  assert.equal(repository.saveFutureDraftV1(draft).status, "saved");
  storage.writes = 0;
  const authority: HomepageGuestDraftAuthority = {
    inspect: repository.inspectFutureDraftForHomepage,
    clear: () => repository.clearFutureDraftV1(),
    inspectionSession: {
      authEpoch: 1,
      storageKind: "guest",
      ownerKey: "guest",
      isCurrent: () => true,
    },
  };
  const read = () => {
    const result = repository.loadFutureDraftV1();
    return result.status === "loaded" ? result.draft : null;
  };
  return { storage, repository, authority, read };
};

class AccountMemoryAdapter implements AuthenticatedFutureDraftPersistenceAdapter {
  readonly values = new Map<string, unknown>();
  readonly clearOwners: string[] = [];
  loadGate: Promise<void> | null = null;
  loadCalls = 0;
  onLoad: ((loadCall: number) => Promise<void> | null) | null = null;
  clearGate: Promise<void> | null = null;
  onClearAttempt: (() => void) | null = null;

  async load(ownerUid: string): Promise<unknown | null> {
    this.loadCalls += 1;
    await this.onLoad?.(this.loadCalls);
    if (this.loadGate) await this.loadGate;
    return this.values.has(ownerUid) ? clone(this.values.get(ownerUid)) : null;
  }

  async commit(input: {
    ownerUid: string;
    expectedRevision: number | null;
    lifecycleStatus: "active" | "cleared";
    draft?: GuestDesignDraft;
  }) {
    if (input.lifecycleStatus === "cleared" && this.clearGate) {
      this.onClearAttempt?.();
      await this.clearGate;
    }
    const current = this.values.get(input.ownerUid) as
      | { revision?: number; createdAt?: string }
      | undefined;
    const revision = current?.revision ?? null;
    if (revision !== input.expectedRevision) {
      return { status: "conflict" as const, currentValue: clone(current || null) };
    }
    if (input.lifecycleStatus === "cleared") this.clearOwners.push(input.ownerUid);
    const next = {
      schemaVersion: 1,
      lifecycleStatus: input.lifecycleStatus,
      revision: (revision || 0) + 1,
      createdAt: current?.createdAt || "2026-09-10T10:00:00.000Z",
      updatedAt: "2026-09-10T10:01:00.000Z",
      ...(input.lifecycleStatus === "active" ? { draft: clone(input.draft) } : {}),
    };
    this.values.set(input.ownerUid, next);
    return { status: "saved" as const, value: clone(next) };
  }
}

// Pure preflight distinguishes empty, valid, invalid, and unavailable state.
const emptyGuest = createGuestAuthority(avatarsDraft());
emptyGuest.storage.values.delete(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
const emptyService = createHomepageDraftReplacementService({ guest: emptyGuest.authority });
assert.deepEqual(await emptyService.inspect(), { status: "empty" });
assert.deepEqual(
  classifyHomepageDraftEntry({ existing: null, clickedOrderContext: pioneers }),
  { kind: "start_fresh" },
);
const pristineJourney = createDormantDesignStudioJourneyState({
  persistedDraft: null,
  normalizedCustomDetailCatalog: [],
});
assert.equal(pristineJourney.currentStageId, "garment_type");
assert.deepEqual(pristineJourney.garmentTypeSelection.garmentTypes, []);

const invalidGuest = createGuestAuthority(avatarsDraft());
invalidGuest.storage.values.set(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE, "{invalid");
const invalidBytes = invalidGuest.storage.values.get(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
const invalidInspection = await createHomepageDraftReplacementService({
  guest: invalidGuest.authority,
}).inspect();
assert.equal(invalidInspection.status, "invalid");
assert.equal(
  invalidGuest.storage.values.get(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE),
  invalidBytes,
  "Invalid bytes must remain untouched by homepage preflight.",
);
assert.equal(invalidGuest.storage.writes, 0, "Invalid preflight must not autosave.");

const unavailableGuest = createGuestAuthority(avatarsDraft());
unavailableGuest.storage.failReads = true;
assert.equal(
  (await createHomepageDraftReplacementService({
    guest: unavailableGuest.authority,
  }).inspect()).status,
  "unavailable",
);

// Guest mismatch opens a decision without mutation, then clears the one fixed
// draft only after the exact inspected fingerprint still matches.
const guest = createGuestAuthority(avatarsDraft());
const guestService = createHomepageDraftReplacementService({ guest: guest.authority });
const guestInspection = await guestService.inspect();
assert.equal(guestInspection.status, "valid");
if (guestInspection.status !== "valid") throw new Error("guest draft did not inspect");
assert.equal(guest.storage.writes, 0, "Opening the mismatch dialog must not write.");
assert.deepEqual(
  classifyHomepageDraftEntry({
    existing: guestInspection.existing,
    clickedOrderContext: pioneers,
  }),
  { kind: "replacement_required" },
);
assert.equal(
  guest.read()?.selectedFabricCode,
  "AVATARS-FABRIC",
  "A mismatch decision must not discard guest work before the customer chooses.",
);
assert.equal((await guestService.revalidate(guestInspection.existing)).status, "valid");
assert.equal((await guestService.discard(guestInspection.existing)).status, "discarded");
assert.equal(guest.read(), null, "Guest clear must remove the fixed draft.");
assert.equal(guest.storage.values.has(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE), false);
const freshGuestJourney = createDormantDesignStudioJourneyState({
  persistedDraft: null,
  normalizedCustomDetailCatalog: [],
});
assert.equal(freshGuestJourney.currentStageId, "garment_type");
assert.deepEqual(freshGuestJourney.garmentTypeSelection.garmentTypes, []);

// Same Community identity resumes the existing mutable draft without a clear.
const sameGuest = createGuestAuthority(avatarsDraft());
const sameService = createHomepageDraftReplacementService({ guest: sameGuest.authority });
const sameInspection = await sameService.inspect();
if (sameInspection.status !== "valid") throw new Error("same draft did not inspect");
assert.deepEqual(
  classifyHomepageDraftEntry({
    existing: sameInspection.existing,
    clickedOrderContext: {
      orderType: "Community",
      batchId: "batch-7",
      batchName: "Renamed display metadata",
    },
  }),
  { kind: "resume_existing" },
);
assert.equal((await sameService.revalidate(sameInspection.existing)).status, "valid");
assert.equal(sameGuest.read()?.currentStageId, "summary");
assert.equal(sameGuest.read()?.selectedStyleId, "AVATARS-STYLE");
assert.equal(sameGuest.storage.writes, 0);

// A legacy mismatch uses the production pure inspection path. Cancel leaves
// both destination and migration journal absent; a deliberate resume can migrate.
const legacyStorage = new MemoryStorage();
const legacyRepository = createDesignStudioDraftRepository({
  storage: legacyStorage,
  legacy: { load: () => avatarsDraft() },
  normalizeDraft: (value) => value,
  legacySourceVersion: "legacy-test",
});
const legacyService = createHomepageDraftReplacementService({
  guest: {
    inspect: legacyRepository.inspectFutureDraftForHomepage,
    clear: () => legacyRepository.clearFutureDraftV1(),
    inspectionSession: {
      authEpoch: 1,
      storageKind: "guest",
      ownerKey: "guest",
      isCurrent: () => true,
    },
  },
});
const legacyInspection = await legacyService.inspect();
assert.equal(legacyInspection.status, "valid");
assert.equal(legacyStorage.writes, 0, "Legacy preflight must not migrate.");
assert.equal(legacyStorage.values.has(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE), false);
assert.equal(legacyStorage.values.has(FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE), false);
if (legacyInspection.status !== "valid") throw new Error("legacy draft did not inspect");
assert.deepEqual(
  classifyHomepageDraftEntry({ existing: legacyInspection.existing, clickedOrderContext: pioneers }),
  { kind: "replacement_required" },
);
assert.equal(legacyStorage.writes, 0, "Cancel leaves legacy storage unchanged.");
assert.equal(legacyRepository.loadFutureDraftWithMigration().status, "loaded");
assert.ok(legacyStorage.writes >= 2, "Explicit legacy resume may migrate.");

// Exercise the production App preflight authority itself, not a test-only
// loader. A legacy mismatch stays read-only until the customer acts.
const productionLegacyStorage = new MemoryStorage();
productionLegacyStorage.values.set(
  GUEST_ORDER_SESSION_STORAGE_NAMESPACE,
  JSON.stringify({ designDraft: avatarsDraft() }),
);
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: productionLegacyStorage },
});
try {
  const productionPreflight = createHomepageDraftReplacementService({
    guest: {
      inspect: GuestOrderSessionService.inspectFutureDesignDraft,
      clear: GuestOrderSessionService.clearFutureDesignDraft,
      inspectionSession: {
        authEpoch: 1,
        storageKind: "guest",
        ownerKey: "guest",
        isCurrent: () => true,
      },
    },
  });
  const productionLegacyInspection = await productionPreflight.inspect();
  assert.equal(productionLegacyInspection.status, "valid");
  assert.equal(productionLegacyStorage.writes, 0);
  if (productionLegacyInspection.status !== "valid") {
    throw new Error("production legacy preflight did not inspect");
  }
  assert.deepEqual(
    classifyHomepageDraftEntry({
      existing: productionLegacyInspection.existing,
      clickedOrderContext: pioneers,
    }),
    { kind: "replacement_required" },
  );
  assert.equal(productionLegacyStorage.writes, 0, "Cancel leaves production legacy bytes unchanged.");
} finally {
  if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
  else Reflect.deleteProperty(globalThis, "window");
}

// Invalid canonical Community drafts never get a context-less fallback to the
// current registration batch. Valid drafts restore by their own saved ID.
const batches: readonly Batch[] = [
  {
    id: "batch-7",
    batchNumber: 7,
    name: "Avatars",
    startDate: "2020-01-01T00:00:00.000Z",
    endDate: "2099-01-01T00:00:00.000Z",
    duration: "Open",
    targetGarments: 40,
    currentGarments: 0,
    currentOrders: 0,
    currentCustomers: 0,
    status: "OPEN",
    allowOrders: true,
    visibility: "PUBLIC",
  },
  {
    id: "batch-8",
    batchNumber: 8,
    name: "Pioneers",
    startDate: "2020-01-01T00:00:00.000Z",
    endDate: "2099-01-01T00:00:00.000Z",
    duration: "Open",
    targetGarments: 40,
    currentGarments: 0,
    currentOrders: 0,
    currentCustomers: 0,
    status: "OPEN",
    allowOrders: true,
    visibility: "PUBLIC",
  },
];
const restoredContext = resolvePersistedDraftHydrationContext(
  avatarsDraft(),
  batches,
  "Campus",
);
assert.equal(restoredContext.status, "valid");
if (restoredContext.status === "valid") {
  assert.equal(restoredContext.context.orderType, "Community");
  assert.equal(restoredContext.context.batchId, "batch-7");
  assert.equal(restoredContext.context.batchName, "Avatars");
}
const missingBatchIdDraft = { ...avatarsDraft(), batchId: undefined };
assert.deepEqual(
  resolvePersistedDraftHydrationContext(missingBatchIdDraft, batches, "Campus"),
  { status: "invalid", reason: "persisted_order_identity_invalid" },
);
assert.equal(
  (await createHomepageDraftReplacementService({
    guest: createGuestAuthority(missingBatchIdDraft).authority,
  }).inspect()).status,
  "invalid",
);

// Authenticated decisions are bound to owner UID, auth epoch, revision, and
// canonical identity. A stale A dialog cannot mutate B's same-revision draft.
const authenticatedGuest = createGuestAuthority(avatarsDraft());
const adapter = new AccountMemoryAdapter();
for (const ownerUid of ["owner-a", "owner-b"]) {
  adapter.values.set(ownerUid, {
    schemaVersion: 1,
    lifecycleStatus: "active",
    revision: 4,
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
    draft: avatarsDraft(),
  });
}
const session = { ownerUid: "owner-a", epoch: 1 };
const authenticatedRepository = createAuthenticatedFutureDraftRepository({
  adapter,
  getIdentity: () => ({
    status: "authenticated" as const,
    ownerUid: session.ownerUid,
  }),
});
const createAuthenticatedService = () => {
  const ownerUid = session.ownerUid;
  const authEpoch = session.epoch;
  return createHomepageDraftReplacementService({
    guest: authenticatedGuest.authority,
    authenticated: {
      repository: authenticatedRepository,
      ownerUid,
      authEpoch,
      inspectionSession: {
        authEpoch,
        storageKind: "authenticated",
        ownerKey: ownerUid,
        isCurrent: () =>
          session.ownerUid === ownerUid && session.epoch === authEpoch,
      },
      isCurrent: () =>
        session.ownerUid === ownerUid && session.epoch === authEpoch,
    },
  });
};
const serviceA = createAuthenticatedService();
const inspectedA = await serviceA.inspect();
assert.equal(inspectedA.status, "valid");
if (inspectedA.status !== "valid") throw new Error("A draft did not inspect");
assert.equal(inspectedA.existing.source, "authenticated");
assert.equal(inspectedA.existing.authenticatedOwnerUid, "owner-a");
assert.equal(inspectedA.existing.authenticatedRevision, 4);

// Logging out invalidates the authenticated inspection session before it can
// clear either the prior account record or the guest copy.
session.ownerUid = "";
session.epoch += 1;
assert.equal((await serviceA.discard(inspectedA.existing)).status, "blocked");
assert.equal(adapter.clearOwners.length, 0, "Logout must not authorize the old decision.");

session.ownerUid = "owner-b";
session.epoch += 1;
const oldDiscard = await serviceA.discard(inspectedA.existing);
assert.equal(oldDiscard.status, "blocked");
assert.equal(adapter.clearOwners.length, 0, "Old A confirmation must not clear B.");
const bAfterOldAction = await authenticatedRepository.load();
assert.equal(bAfterOldAction.status, "loaded");
assert.equal(
  bAfterOldAction.status === "loaded" && bAfterOldAction.record.lifecycleStatus,
  "active",
);
assert.equal((await createAuthenticatedService().revalidate(inspectedA.existing)).status, "unavailable");

session.ownerUid = "owner-a";
session.epoch += 1;
const serviceSameUidNewEpoch = createAuthenticatedService();
const inspectedNewEpoch = await serviceSameUidNewEpoch.inspect();
if (inspectedNewEpoch.status !== "valid") throw new Error("A draft did not re-inspect");
session.epoch += 1;
assert.equal(
  (await serviceSameUidNewEpoch.discard(inspectedNewEpoch.existing)).status,
  "blocked",
  "A renewed session invalidates a pending destructive decision even for the same UID.",
);
assert.equal(adapter.clearOwners.length, 0);

// A fresh authenticated confirmation does clear A by revision and tombstones
// it, while also removing the stale local copy before a new order can start.
const serviceAFresh = createAuthenticatedService();
const inspectedAFresh = await serviceAFresh.inspect();
if (inspectedAFresh.status !== "valid") throw new Error("A draft did not inspect fresh");
assert.equal((await serviceAFresh.discard(inspectedAFresh.existing)).status, "discarded");
assert.deepEqual(adapter.clearOwners, ["owner-a"]);
const aAfterClear = await authenticatedRepository.load();
assert.equal(aAfterClear.status, "loaded");
assert.equal(
  aAfterClear.status === "loaded" && aAfterClear.record.lifecycleStatus,
  "cleared",
);
assert.equal(authenticatedGuest.read(), null);

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const createRacingAuthenticatedService = ({
  adapter: racingAdapter,
  session: racingSession,
  guestAuthority,
}: {
  adapter: AccountMemoryAdapter;
  session: { ownerUid: string; epoch: number };
  guestAuthority: HomepageGuestDraftAuthority;
}) => {
  const ownerUid = racingSession.ownerUid;
  const authEpoch = racingSession.epoch;
  const repository = createAuthenticatedFutureDraftRepository({
    adapter: racingAdapter,
    getIdentity: () => ({
      status: "authenticated" as const,
      ownerUid: racingSession.ownerUid,
    }),
  });
  return createHomepageDraftReplacementService({
    guest: {
      ...guestAuthority,
      inspectionSession: {
        authEpoch,
        storageKind: "guest",
        ownerKey: "guest",
        isCurrent: () => racingSession.epoch === authEpoch,
      },
    },
    authenticated: {
      repository,
      ownerUid,
      authEpoch,
      inspectionSession: {
        authEpoch,
        storageKind: "authenticated",
        ownerKey: ownerUid,
        isCurrent: () =>
          racingSession.ownerUid === ownerUid && racingSession.epoch === authEpoch,
      },
      isCurrent: () =>
        racingSession.ownerUid === ownerUid && racingSession.epoch === authEpoch,
    },
  });
};

const setActiveCloudDraft = (racingAdapter: AccountMemoryAdapter, ownerUid: string) => {
  racingAdapter.values.set(ownerUid, {
    schemaVersion: 1,
    lifecycleStatus: "active",
    revision: 4,
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
    draft: avatarsDraft(),
  });
};

const currentTarget = () => ({ orderContext: pioneers });

// A guest inspection handle is bound to its auth epoch. Logging in before
// confirmation invalidates it instead of letting the old guest handle clear.
const guestToAuth = createGuestAuthority(avatarsDraft());
const guestSession = { epoch: 1 };
const guestToAuthService = createHomepageDraftReplacementService({
  guest: {
    ...guestToAuth.authority,
    inspectionSession: {
      authEpoch: guestSession.epoch,
      storageKind: "guest",
      ownerKey: "guest",
      isCurrent: () => guestSession.epoch === 1,
    },
  },
});
const guestToAuthInspection = await guestToAuthService.inspect();
if (guestToAuthInspection.status !== "valid") throw new Error("guest draft did not inspect");
guestSession.epoch += 1;
assert.equal((await guestToAuthService.discard(guestToAuthInspection.existing)).status, "blocked");
assert.ok(guestToAuth.read(), "Login must not authorize an old guest decision.");

// This is the App's production discard coordinator. Cancelling while its first
// validation is deferred invalidates the operation token; no clear or fresh
// Studio bootstrap can follow the visually successful cancellation.
const cancelRaceAdapter = new AccountMemoryAdapter();
setActiveCloudDraft(cancelRaceAdapter, "owner-a");
const cancelRaceSession = { ownerUid: "owner-a", epoch: 1 };
const cancelRaceGuest = createGuestAuthority(avatarsDraft());
const cancelRaceService = createRacingAuthenticatedService({
  adapter: cancelRaceAdapter,
  session: cancelRaceSession,
  guestAuthority: cancelRaceGuest.authority,
});
const cancelRaceInspection = await cancelRaceService.inspect();
if (cancelRaceInspection.status !== "valid") throw new Error("cancel race draft did not inspect");
const cancelValidation = deferred<void>();
cancelRaceAdapter.loadGate = cancelValidation.promise;
let cancelOperationCurrent = true;
const cancelRace = executeHomepageDraftReplacementDiscard({
  existing: cancelRaceInspection.existing,
  authority: cancelRaceService,
  isOperationCurrent: () => cancelOperationCurrent,
  getCurrentTarget: currentTarget,
});
cancelOperationCurrent = false; // App Cancel/Escape/backdrop invalidates this generation.
cancelValidation.resolve();
assert.equal((await cancelRace).status, "stale");
assert.deepEqual(cancelRaceAdapter.clearOwners, []);
assert.ok(cancelRaceGuest.read(), "Cancelled App operation must retain the guest copy.");

// Current target state is read after validation, not retained from the render
// which first opened the dialog. Closing the target before clear prevents it.
const batchRaceAdapter = new AccountMemoryAdapter();
setActiveCloudDraft(batchRaceAdapter, "owner-a");
const batchRaceSession = { ownerUid: "owner-a", epoch: 1 };
const batchRaceGuest = createGuestAuthority(avatarsDraft());
const batchRaceService = createRacingAuthenticatedService({
  adapter: batchRaceAdapter,
  session: batchRaceSession,
  guestAuthority: batchRaceGuest.authority,
});
const batchRaceInspection = await batchRaceService.inspect();
if (batchRaceInspection.status !== "valid") throw new Error("batch race draft did not inspect");
const batchValidation = deferred<void>();
batchRaceAdapter.loadGate = batchValidation.promise;
let targetIsOpen = true;
const batchRace = executeHomepageDraftReplacementDiscard({
  existing: batchRaceInspection.existing,
  authority: batchRaceService,
  isOperationCurrent: () => true,
  getCurrentTarget: () => (targetIsOpen ? currentTarget() : null),
});
targetIsOpen = false;
batchValidation.resolve();
assert.equal((await batchRace).status, "target_unavailable");
assert.deepEqual(batchRaceAdapter.clearOwners, []);

// The service performs a second, internal revalidation immediately before a
// clear. Its guard must be consulted after that await, not only by the outer
// coordinator before it called discard.
const innerOperationAdapter = new AccountMemoryAdapter();
setActiveCloudDraft(innerOperationAdapter, "owner-a");
const innerOperationSession = { ownerUid: "owner-a", epoch: 1 };
const innerOperationGuest = createGuestAuthority(avatarsDraft());
const innerOperationService = createRacingAuthenticatedService({
  adapter: innerOperationAdapter,
  session: innerOperationSession,
  guestAuthority: innerOperationGuest.authority,
});
const innerOperationInspection = await innerOperationService.inspect();
if (innerOperationInspection.status !== "valid") {
  throw new Error("inner operation draft did not inspect");
}
const innerOperationEntered = deferred<void>();
const innerOperationGate = deferred<void>();
innerOperationAdapter.onLoad = (loadCall) => {
  // First load inspected the draft; the outer coordinator performs the second
  // read. The third is discard's own revalidation.
  if (loadCall === 3) {
    innerOperationEntered.resolve();
    return innerOperationGate.promise;
  }
  return null;
};
let innerOperationCurrent = true;
const innerOperationRace = executeHomepageDraftReplacementDiscard({
  existing: innerOperationInspection.existing,
  authority: innerOperationService,
  isOperationCurrent: () => innerOperationCurrent,
  getCurrentTarget: currentTarget,
});
await innerOperationEntered.promise;
innerOperationCurrent = false;
innerOperationGate.resolve();
assert.equal((await innerOperationRace).status, "stale");
assert.deepEqual(
  innerOperationAdapter.clearOwners,
  [],
  "An operation made stale during discard's internal await must not clear.",
);
assert.ok(innerOperationGuest.read(), "The old guest copy remains recoverable.");

const innerTargetAdapter = new AccountMemoryAdapter();
setActiveCloudDraft(innerTargetAdapter, "owner-a");
const innerTargetSession = { ownerUid: "owner-a", epoch: 1 };
const innerTargetGuest = createGuestAuthority(avatarsDraft());
const innerTargetService = createRacingAuthenticatedService({
  adapter: innerTargetAdapter,
  session: innerTargetSession,
  guestAuthority: innerTargetGuest.authority,
});
const innerTargetInspection = await innerTargetService.inspect();
if (innerTargetInspection.status !== "valid") {
  throw new Error("inner target draft did not inspect");
}
const innerTargetEntered = deferred<void>();
const innerTargetGate = deferred<void>();
innerTargetAdapter.onLoad = (loadCall) => {
  if (loadCall === 3) {
    innerTargetEntered.resolve();
    return innerTargetGate.promise;
  }
  return null;
};
let innerTargetOpen = true;
const innerTargetRace = executeHomepageDraftReplacementDiscard({
  existing: innerTargetInspection.existing,
  authority: innerTargetService,
  isOperationCurrent: () => true,
  getCurrentTarget: () => (innerTargetOpen ? currentTarget() : null),
});
await innerTargetEntered.promise;
innerTargetOpen = false;
innerTargetGate.resolve();
assert.equal((await innerTargetRace).status, "target_unavailable");
assert.deepEqual(
  innerTargetAdapter.clearOwners,
  [],
  "A target closed during discard's internal await must not clear.",
);
assert.ok(innerTargetGuest.read(), "The guest copy remains recoverable.");

// A session transition while the authenticated revision-checked clear awaits
// may tombstone the original account draft, but it cannot clear the guest copy
// or bootstrap a fresh Community order under the new identity.
const clearRaceAdapter = new AccountMemoryAdapter();
setActiveCloudDraft(clearRaceAdapter, "owner-a");
const clearRaceSession = { ownerUid: "owner-a", epoch: 1 };
const clearRaceGuest = createGuestAuthority(avatarsDraft());
let clearRaceGuestClearCalls = 0;
const clearGate = deferred<void>();
const clearEntered = deferred<void>();
clearRaceAdapter.clearGate = clearGate.promise;
clearRaceAdapter.onClearAttempt = () => clearEntered.resolve();
const clearRaceService = createRacingAuthenticatedService({
  adapter: clearRaceAdapter,
  session: clearRaceSession,
  guestAuthority: {
    ...clearRaceGuest.authority,
    clear: () => {
      clearRaceGuestClearCalls += 1;
      clearRaceGuest.authority.clear();
    },
  },
});
const clearRaceInspection = await clearRaceService.inspect();
if (clearRaceInspection.status !== "valid") throw new Error("clear race draft did not inspect");
const clearRace = executeHomepageDraftReplacementDiscard({
  existing: clearRaceInspection.existing,
  authority: clearRaceService,
  isOperationCurrent: () => true,
  getCurrentTarget: currentTarget,
});
await clearEntered.promise;
clearRaceSession.epoch += 1;
clearGate.resolve();
assert.equal((await clearRace).status, "clear_failed");
assert.equal(clearRaceGuestClearCalls, 0);
assert.ok(clearRaceGuest.read(), "Session change during clear must not erase guest state.");

// If the target changes after the clear commits, the coordinator stops before
// Studio bootstrap and refuses to substitute another batch.
const postClearAdapter = new AccountMemoryAdapter();
setActiveCloudDraft(postClearAdapter, "owner-a");
const postClearSession = { ownerUid: "owner-a", epoch: 1 };
const postClearGuest = createGuestAuthority(avatarsDraft());
const postClearGate = deferred<void>();
const postClearEntered = deferred<void>();
postClearAdapter.clearGate = postClearGate.promise;
postClearAdapter.onClearAttempt = () => postClearEntered.resolve();
const postClearService = createRacingAuthenticatedService({
  adapter: postClearAdapter,
  session: postClearSession,
  guestAuthority: postClearGuest.authority,
});
const postClearInspection = await postClearService.inspect();
if (postClearInspection.status !== "valid") throw new Error("post-clear draft did not inspect");
let postClearTargetOpen = true;
const postClearRace = executeHomepageDraftReplacementDiscard({
  existing: postClearInspection.existing,
  authority: postClearService,
  isOperationCurrent: () => true,
  getCurrentTarget: () => (postClearTargetOpen ? currentTarget() : null),
});
await postClearEntered.promise;
postClearTargetOpen = false;
postClearGate.resolve();
assert.equal((await postClearRace).status, "target_unavailable_after_clear");

// Guest clear is a fail-safe two-step transition. A failed marker write leaves
// the original payload readable; a failed payload removal after marker success
// has committed explicit cleared semantics and cannot revive the old bytes.
const markerFailure = createGuestAuthority(avatarsDraft());
markerFailure.storage.failWritesFor = FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE;
assert.throws(() => markerFailure.repository.clearFutureDraftV1());
assert.equal(markerFailure.repository.loadFutureDraftV1().status, "loaded");
assert.equal(markerFailure.repository.inspectFutureDraftForHomepage().status, "valid");

const removalFailure = createGuestAuthority(avatarsDraft());
const removalPayload = removalFailure.storage.values.get(
  FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
);
removalFailure.storage.failRemovalsFor = FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE;
assert.throws(() => removalFailure.repository.clearFutureDraftV1());
assert.equal(removalFailure.repository.loadFutureDraftV1().status, "empty");
assert.equal(removalFailure.repository.inspectFutureDraftForHomepage().status, "empty");
assert.equal(
  removalFailure.storage.values.get(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE),
  removalPayload,
  "A committed tombstone governs an orphaned payload after removal failure.",
);

const unavailableClear = createGuestAuthority(avatarsDraft());
const unavailablePayload = unavailableClear.storage.values.get(
  FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
);
unavailableClear.storage.failReads = true;
assert.throws(() => unavailableClear.repository.clearFutureDraftV1());
assert.equal(
  unavailableClear.storage.values.get(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE),
  unavailablePayload,
  "Storage unavailability must not silently remove the sole guest draft.",
);

const appSource = readFileSync("src/App.tsx", "utf8");
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.match(appSource, /inspect: GuestOrderSessionService\.inspectFutureDesignDraft/);
assert.match(appSource, /onAuthStateChanged\(auth/);
assert.match(appSource, /executeHomepageDraftReplacementDiscard\(/);
assert.match(appSource, /homepageDraftDecisionGenerationRef/);
assert.match(appSource, /homepageCurrentBatchesRef\.current/);
assert.match(studioSource, /resolvePersistedDraftHydrationContext\(/);
assert.match(studioSource, /futureDraftPersistenceStatus !== "ready"/);

console.log("PASS: homepage draft replacement persistence safety");
