import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { CustomGroup } from "./src/types";
import CustomOrderView from "./src/components/CustomOrderView";
import DesignStudioView from "./src/components/DesignStudioView";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { auth } from "./src/services/firebase";
import type { AuthenticatedFutureDraftRepository } from "./src/services/authenticatedFutureDraftService";
import { GuestOrderSessionService } from "./src/services/guestOrderSessionService";
import { StorageService } from "./src/services/storageService";
import {
  installPrivateBatchSubscriptionAdapterForTests,
  synchronizePrivateBatchIdentityForTests,
  type AppState,
  useAppStore,
} from "./src/store/useAppStore";
import type { Fabric, GuestDesignDraft } from "./src/types";
import {
  PrivateBatchCreationError,
  createPrivateBatch,
} from "./src/services/privateBatchService";
import {
  createPrivateBatchSubscriptionController,
  type PrivateBatchMembershipRecord,
  type PrivateBatchSubscriptionAdapter,
} from "./src/services/privateBatchGroupSubscriptions";
import {
  getCanonicalOrderIdentity,
  getPersistedDraftOrderIdentity,
  isPrivateBatchOrderIdentityAuthorized,
  resolveGroupOrderIdentity,
  resolvePersistedDraftHydrationContext,
} from "./src/utils/orderContextIdentity";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";

const GROUP_ID = "private_batch_123456";

const setStoreState = (state: Partial<AppState>) => {
  useAppStore.setState(state);
};

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class DeterministicAutosaveScheduler {
  private nextHandle = 0;
  private readonly callbacks = new Map<number, () => void>();

  schedule(callback: () => void, _delayMs: number): number {
    const handle = ++this.nextHandle;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: unknown): void {
    if (typeof handle === "number") this.callbacks.delete(handle);
  }

  runAll(): void {
    while (this.callbacks.size > 0) {
      const queued = [...this.callbacks.entries()];
      this.callbacks.clear();
      queued.forEach(([, callback]) => callback());
    }
  }
}

const group = (overrides: Partial<CustomGroup> = {}): CustomGroup => ({
  schemaVersion: 1,
  batchId: GROUP_ID,
  ownerUid: "owner-a",
  organizerId: "owner-a",
  organizer: "Owner A",
  batchName: "Family Celebration",
  occasion: "Celebration",
  description: "Private family order",
  country: "Netherlands",
  city: "Eindhoven",
  preferredDeliveryMonth: "August 2026",
  expectedParticipants: 10,
  maxParticipants: 20,
  visibility: "PRIVATE",
  currentMembers: 1,
  closingDate: "2026-08-15",
  deliveryWindow: "Late August 2026",
  status: "OPEN",
  ...overrides,
});

const creationInput = {
  batchName: "Family Celebration",
  occasion: "Celebration",
  description: "Private family order",
  country: "Netherlands",
  city: "Eindhoven",
  preferredDeliveryMonth: "August 2026",
  expectedParticipants: 10,
  maxParticipants: 20,
  organizerName: "Owner A",
  closingDate: "2026-08-15",
  deliveryWindow: "Late August 2026",
} as const;

const hydrationFabric: Fabric = {
  code: "PRIVATE-HYDRATION-FABRIC",
  name: "Private hydration fabric",
  description: "Fixture fabric",
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Fixture",
  price: 12,
  image: "https://example.test/private-hydration.jpg",
};

const contextlessPrivateDraft = (
  privateBatchRole: "organizer" | "member" = "organizer",
): GuestDesignDraft =>
  ({
    journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
    currentStageId: "garment_type",
    currentStep: 1,
    garmentTypeSelection: {
      garmentTypes: ["shirt"],
      demographic: "male",
      constructionByGarment: {},
    },
    aiTryOnWorkflow: { schemaVersion: 1, status: "skipped", inputFingerprint: null },
    selectedFabricCode: hydrationFabric.code,
    selectedStyleId: null,
    selectedGarment: null,
    designSelections: { accessories: [] },
    measurements: {},
    sizingMode: "manual",
    deliveryMethod: null,
    deliveryAddress: { addressLine1: "", city: "", postalCode: "", countryCode: "" },
    pickupTime: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    batchType: "personalized",
    batchId: GROUP_ID,
    batchName: "Private group display text is not the identity",
    privateBatchRole,
    customGroupCode: "",
    garmentPieceCount: 1,
    specialInstructions: "",
    leftoverFabricChoice: "return",
    hasLining: false,
    pricingBreakdown: { total: 65 },
    shippingSnapshot: {},
    fabricAllocations: [],
    updatedAt: "2026-09-12T00:00:00.000Z",
  }) as GuestDesignDraft;

const writes: Array<{ id: string; record: Record<string, unknown> }> = [];
const created = await createPrivateBatch({
  input: creationInput,
  limits: { minParticipantsRequired: 10, maxParticipantsAllowed: 300 },
  dependencies: {
    getAuthenticatedUid: () => "owner-a",
    createCanonicalGroupId: () => GROUP_ID,
    write: async (id, record) => {
      writes.push({ id, record });
    },
    serverTimestamp: () => "server-time",
  },
});
assert.equal(created.groupId, GROUP_ID);
assert.equal(writes.length, 1);
assert.equal(writes[0]?.id, GROUP_ID);
assert.equal(writes[0]?.record.batchId, GROUP_ID);
assert.equal(writes[0]?.record.batchName, creationInput.batchName);
assert.equal(writes[0]?.record.ownerUid, "owner-a");
assert.equal(writes[0]?.record.organizerId, "owner-a");
assert.equal(writes[0]?.record.visibility, "PRIVATE");
assert.equal(writes[0]?.record.currentMembers, 1);
assert.deepEqual(created.orderContext, {
  orderType: "Group Organizer",
  batchId: GROUP_ID,
  batchName: creationInput.batchName,
  organizer: "Owner A",
  closingDate: "2026-08-15",
  deliveryWindow: "Late August 2026",
  expectedParticipants: 10,
  currentMembers: 1,
  pickupLocation: undefined,
  batchStatus: "OPEN",
  allowOrders: true,
});

await assert.rejects(
  () =>
    createPrivateBatch({
      input: creationInput,
      limits: { minParticipantsRequired: 10, maxParticipantsAllowed: 300 },
      dependencies: {
        getAuthenticatedUid: () => null,
        createCanonicalGroupId: () => GROUP_ID,
        write: async () => undefined,
        serverTimestamp: () => "server-time",
      },
    }),
  PrivateBatchCreationError,
);

assert.deepEqual(
  getCanonicalOrderIdentity({ orderType: "Group Organizer", batchId: GROUP_ID }),
  { orderType: "Group Organizer", batchId: GROUP_ID },
);
assert.equal(
  getCanonicalOrderIdentity({ orderType: "Group Member", batchName: "not-an-id" }),
  null,
);

// The temporary legacy UI boundary is intentionally a disabled control, not
// a client-side attempt to create a secure Private Batch. PUBLIC support is
// left intact for its released compatibility path.
setStoreState({
  businessSettings: DEFAULT_BUSINESS_SETTINGS,
  referenceData: [],
});
let privateLegacyView!: ReturnType<typeof create>;
const legacyCreateCalls: unknown[] = [];
const legacyStudioContexts: unknown[] = [];
await act(async () => {
  privateLegacyView = create(
    createElement(CustomOrderView, {
      customGroups: [],
      batches: [],
      currentUser: { name: "Owner A" },
      onCreateCustomGroup: (createdGroup) => legacyCreateCalls.push(createdGroup),
      onSelectOrderContext: (context) => legacyStudioContexts.push(context),
    }),
  );
});
const privateLegacyButton = privateLegacyView.root.findByProps({
  title: "Private Batch setup is being updated.",
});
assert.equal(privateLegacyButton.props.disabled, true);
assert.equal(privateLegacyButton.props["aria-disabled"], "true");
await act(async () => {
  // Exercise the rendered legacy control. A disabled Private control has no
  // activation handler, and its enclosing form cannot create a group from
  // the untouched fields.
  privateLegacyButton.props.onClick?.();
  privateLegacyView.root.findByType("form").props.onSubmit({
    preventDefault: () => undefined,
  });
  await Promise.resolve();
});
assert.equal(legacyCreateCalls.length, 0, "Legacy Private interaction cannot create a group.");
assert.equal(legacyStudioContexts.length, 0, "Legacy Private interaction cannot hand off Studio context.");
await act(async () => privateLegacyView.unmount());

// Mount the actual Studio with an authenticated organizer and then remove its
// live owner authorization. The rendered context must become a locked private
// sentinel and persistence must stop, rather than falling back to Community.
const studioStorage = new MemoryStorage();
if (typeof globalThis.window === "undefined") {
  Object.assign(globalThis, {
    window: {
      localStorage: studioStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
      cancelAnimationFrame: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      matchMedia: () => ({
        matches: false,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    },
  });
}
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: studioStorage,
});
const mutableAuth = auth as unknown as {
  currentUser: unknown;
  notifyAuthListeners(): void;
};
const priorFirebaseUser = mutableAuth.currentUser;
type FoundationFirebaseUser = {
  uid: string;
  email: string;
  isAnonymous: false;
  getIdTokenResult(): Promise<Readonly<{ claims: Readonly<Record<string, unknown>> }>>;
  getIdToken(forceRefresh?: boolean): Promise<string>;
};
let foundationPublicListener: ((groups: readonly CustomGroup[]) => void) | null = null;
let foundationOwnerListener: ((groups: readonly CustomGroup[]) => void) | null = null;
let foundationMembershipListener:
  | ((memberships: readonly PrivateBatchMembershipRecord[]) => void)
  | null = null;
let foundationMemberGroupListener: ((nextGroup: CustomGroup | null) => void) | null = null;
const uninstallFoundationSubscriptions = installPrivateBatchSubscriptionAdapterForTests({
  subscribePublic: (next) => {
    foundationPublicListener = next;
    return () => undefined;
  },
  subscribeAllForAdmin: () => () => undefined,
  subscribeOwned: (_uid, next) => {
    foundationOwnerListener = next;
    return () => undefined;
  },
  subscribeMemberships: (_uid, next) => {
    foundationMembershipListener = next;
    return () => undefined;
  },
  subscribeGroup: (_groupId, next) => {
    foundationMemberGroupListener = next;
    return () => undefined;
  },
});
const foundationUser = (uid: string): FoundationFirebaseUser => ({
  uid,
  email: `${uid}@example.test`,
  isAnonymous: false,
  getIdTokenResult: async () => ({ claims: { admin: false } }),
  getIdToken: async () => "foundation-token",
});
const beginFoundationDiscovery = async (user: FoundationFirebaseUser | null) => {
  mutableAuth.currentUser = user;
  mutableAuth.notifyAuthListeners();
  synchronizePrivateBatchIdentityForTests();
  await Promise.resolve();
};
const publishFoundationPrivateAuthority = (
  role: "owner" | "member" | "none",
  uid: string,
) => {
  foundationPublicListener?.([]);
  foundationOwnerListener?.(role === "owner" ? [group()] : []);
  foundationMembershipListener?.(
    role === "member"
      ? [{ groupId: GROUP_ID, memberUid: uid, role: "member" }]
      : [],
  );
  if (role === "member") foundationMemberGroupListener?.(group());
};
setStoreState({
  businessSettings: DEFAULT_BUSINESS_SETTINGS,
  isLoadingData: false,
  stylesLoadState: "ready",
  customDetailCatalog: [],
  batches: [],
});
await beginFoundationDiscovery(foundationUser("owner-a"));
publishFoundationPrivateAuthority("owner", "owner-a");
let studio!: ReturnType<typeof create>;
await act(async () => {
  studio = create(
    createElement(DesignStudioView, {
      onAddToCart: () => undefined,
      openCartDrawer: () => undefined,
      currentUser: {
        name: "Owner A",
        email: "owner-a@example.test",
        ownerUid: "owner-a",
      },
      orderContext: {
        orderType: "Group Organizer",
        batchId: GROUP_ID,
        batchName: "Family Celebration",
      },
      styles: [],
      fabrics: [],
    }),
  );
  await Promise.resolve();
  await Promise.resolve();
});
const studioRoot = () => studio.root.findByProps({ id: "design-studio-nine-stage-journey" });
assert.equal(studioRoot().props["data-order-context-batch-id"], GROUP_ID);
assert.equal(studioRoot().props["data-private-batch-authorization"], "authorized");
const initialStudioAuthorizationGeneration =
  studioRoot().props["data-private-batch-authorization-generation"];
await act(async () => {
  // A real token/session reset clears prior listener data and starts a new
  // pending lifecycle. No synthetic ready state is published here.
  await beginFoundationDiscovery(foundationUser("owner-a"));
});
assert.equal(studioRoot().props["data-order-context-type"], "Group Organizer");
assert.equal(studioRoot().props["data-order-context-batch-id"], GROUP_ID);
assert.equal(studioRoot().props["data-private-batch-authorization"], "resolving");
assert.ok(
  studioRoot().props["data-private-batch-authorization-generation"] >
    initialStudioAuthorizationGeneration,
);
assert.equal(
  studioRoot().props["data-future-draft-persistence-status"],
  "resolving",
  "Pending rediscovery must not be treated as terminal revocation before current sources decide it.",
);
await act(async () => studio.unmount());

// A persisted-only private identity must hydrate through the actual Studio
// without an explicit orderContext. Test both canonical roles from a valid
// authenticated owner/member state, then revoke the matching live authority
// before the queued autosave may issue a cloud persistence request.
for (const [privateBatchRole, uid] of [
  ["organizer", "owner-a"] as const,
  ["member", "member-b"] as const,
]) {
  const savedDrafts: GuestDesignDraft[] = [];
  const revokedScenarioDrafts: GuestDesignDraft[] = [];
  let activeSaveTarget = savedDrafts;
  const authenticatedRepository: AuthenticatedFutureDraftRepository = {
    async load() {
      return { status: "absent" as const, record: null };
    },
    async save(draft: GuestDesignDraft) {
      activeSaveTarget.push(draft);
      return {
        status: "saved" as const,
        record: {
          schemaVersion: 1 as const,
          lifecycleStatus: "active" as const,
          revision: activeSaveTarget.length,
          createdAt: "2026-09-12T00:00:00.000Z",
          updatedAt: "2026-09-12T00:00:00.000Z",
          draft,
        },
      };
    },
    async clear() {
      return {
        status: "saved" as const,
        record: {
          schemaVersion: 1 as const,
          lifecycleStatus: "cleared" as const,
          revision: 1,
          createdAt: "2026-09-12T00:00:00.000Z",
          updatedAt: "2026-09-12T00:00:00.000Z",
        },
      };
    },
    async synchronize(localDraft: GuestDesignDraft | null) {
      return {
        status: "empty" as const,
        record: null,
        draft: localDraft,
      };
    },
  };

  GuestOrderSessionService.saveFutureDesignDraft(
    contextlessPrivateDraft(privateBatchRole),
  );
  setStoreState({
    businessSettings: DEFAULT_BUSINESS_SETTINGS,
    isLoadingData: false,
    stylesLoadState: "ready",
    customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG,
    batches: [],
  });
  await beginFoundationDiscovery(foundationUser(uid));
  publishFoundationPrivateAuthority(
    privateBatchRole === "organizer" ? "owner" : "member",
    uid,
  );

  const autosaveScheduler = new DeterministicAutosaveScheduler();
  const mountPersistedOnlyStudio = async () => {
    let mountedStudio!: ReturnType<typeof create>;
    await act(async () => {
      mountedStudio = create(
      createElement(DesignStudioView, {
        onAddToCart: () => undefined,
        openCartDrawer: () => undefined,
        currentUser: {
          name: privateBatchRole === "organizer" ? "Owner A" : "Member B",
          email: `${uid}@example.test`,
          ownerUid: uid,
        },
        styles: [],
        fabrics: [hydrationFabric],
        futureDraftRepository: authenticatedRepository,
        futureDraftAutosaveScheduler: autosaveScheduler,
      }),
    );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    return mountedStudio;
  };
  const applyMeaningfulStudioEdit = async (studio: ReturnType<typeof create>) => {
    await act(async () => {
      studio.root
        .findByProps({ "data-testid": "step1-garment-select-trouser" })
        .props.onClick();
      await Promise.resolve();
    });
  };

  // CONTROL: the actual mounted Studio must persist exactly once for a real
  // Step 1 edit while the persisted-only PRIVATE identity remains authorized.
  const controlStudio = await mountPersistedOnlyStudio();
  const controlRoot = () =>
    controlStudio.root.findByProps({ id: "design-studio-nine-stage-journey" });
  assert.equal(
    controlRoot().props["data-order-context-type"],
    privateBatchRole === "organizer" ? "Group Organizer" : "Group Member",
  );
  assert.equal(controlRoot().props["data-order-context-batch-id"], GROUP_ID);
  assert.equal(
    controlRoot().props["data-private-batch-authorization"],
    "authorized",
  );
  await applyMeaningfulStudioEdit(controlStudio);
  await act(async () => {
    autosaveScheduler.runAll();
    await Promise.resolve();
  });
  assert.equal(
    savedDrafts.length,
    1,
    "An authorized meaningful Studio edit must perform exactly one autosave.",
  );
  await act(async () => controlStudio.unmount());
  StorageService.clearGuestOrderSession();

  // Second mounted scenario: queue that same real edit, revoke before its
  // debounce fires, then prove no cloud persistence request is issued.
  activeSaveTarget = revokedScenarioDrafts;
  GuestOrderSessionService.saveFutureDesignDraft(
    contextlessPrivateDraft(privateBatchRole),
  );
  const persistedOnlyStudio = await mountPersistedOnlyStudio();
  const persistedOnlyRoot = () =>
    persistedOnlyStudio.root.findByProps({ id: "design-studio-nine-stage-journey" });
  assert.equal(
    persistedOnlyRoot().props["data-private-batch-authorization"],
    "authorized",
  );
  await applyMeaningfulStudioEdit(persistedOnlyStudio);

  await act(async () => {
    publishFoundationPrivateAuthority("none", uid);
    autosaveScheduler.runAll();
    await Promise.resolve();
  });
  assert.equal(persistedOnlyRoot().props["data-order-context-batch-id"], GROUP_ID);
  assert.equal(persistedOnlyRoot().props["data-private-batch-authorization"], "invalid");
  assert.equal(
    persistedOnlyRoot().props["data-future-draft-persistence-status"],
    "blocked",
  );
  assert.equal(
    revokedScenarioDrafts.length,
    0,
    "Revoked private authorization must cancel the mounted queued autosave.",
  );
  await act(async () => persistedOnlyStudio.unmount());
  StorageService.clearGuestOrderSession();
}
await beginFoundationDiscovery(null);

// The actual Studio keeps the released PUBLIC personalized roles on their
// existing route; it must not wait for PRIVATE membership discovery merely
// because the canonical role is Organizer/Member.
for (const orderType of ["Group Organizer", "Group Member"] as const) {
  const publicGroupId = `public_${orderType === "Group Organizer" ? "organizer" : "member"}_batch_123456`;
  setStoreState({
    businessSettings: DEFAULT_BUSINESS_SETTINGS,
    isLoadingData: false,
    stylesLoadState: "ready",
    customDetailCatalog: [],
    batches: [],
  });
  await beginFoundationDiscovery(null);
  foundationPublicListener?.([
    group({ batchId: publicGroupId, visibility: "PUBLIC" }),
  ]);
  let publicStudio!: ReturnType<typeof create>;
  await act(async () => {
    publicStudio = create(
      createElement(DesignStudioView, {
        onAddToCart: () => undefined,
        openCartDrawer: () => undefined,
        currentUser: null,
        orderContext: { orderType, batchId: publicGroupId, batchName: "Public group" },
        styles: [],
        fabrics: [],
      }),
    );
    await Promise.resolve();
  });
  const publicStudioRoot = publicStudio.root.findByProps({
    id: "design-studio-nine-stage-journey",
  });
  assert.equal(publicStudioRoot.props["data-order-context-type"], orderType);
  assert.equal(publicStudioRoot.props["data-order-context-batch-id"], publicGroupId);
  assert.equal(publicStudioRoot.props["data-private-batch-authorization"], "not_private");
  await act(async () => publicStudio.unmount());
}
assert.equal(
  getPersistedDraftOrderIdentity({
    batchType: "personalized",
    batchId: GROUP_ID,
  }),
  null,
);
assert.deepEqual(
  getPersistedDraftOrderIdentity({
    batchType: "personalized",
    batchId: GROUP_ID,
    privateBatchRole: "member",
  }),
  { orderType: "Group Member", batchId: GROUP_ID },
);

const ownerHydration = resolvePersistedDraftHydrationContext(
  {
    batchType: "personalized",
    batchId: GROUP_ID,
    batchName: "Copied display name",
    privateBatchRole: "organizer",
  },
  [],
  "Pickup",
  { groups: [group()], viewerUid: "owner-a", accessById: { [GROUP_ID]: "owner" } },
);
assert.equal(ownerHydration.status, "valid");
assert.equal(ownerHydration.status === "valid" && ownerHydration.context.batchId, GROUP_ID);

const copiedOrganizerHydration = resolvePersistedDraftHydrationContext(
  {
    batchType: "personalized",
    batchId: GROUP_ID,
    privateBatchRole: "organizer",
  },
  [],
  "Pickup",
  { groups: [group()], viewerUid: "member-b", accessById: { [GROUP_ID]: "member" } },
);
assert.equal(copiedOrganizerHydration.status, "invalid");

const memberHydration = resolvePersistedDraftHydrationContext(
  {
    batchType: "personalized",
    batchId: GROUP_ID,
    privateBatchRole: "member",
  },
  [],
  "Pickup",
  { groups: [group()], viewerUid: "member-b", accessById: { [GROUP_ID]: "member" } },
);
assert.equal(memberHydration.status, "valid");
assert.equal(
  isPrivateBatchOrderIdentityAuthorized({
    identity: { orderType: "Group Member", batchId: GROUP_ID },
    groups: [group()],
    viewerUid: "member-b",
    accessById: { [GROUP_ID]: "member" },
  }),
  true,
);
assert.equal(
  isPrivateBatchOrderIdentityAuthorized({
    identity: { orderType: "Group Member", batchId: GROUP_ID },
    groups: [],
    viewerUid: "member-b",
    accessById: { [GROUP_ID]: "member" },
  }),
  false,
);

// The legacy personalized role is not a privacy marker. Public records retain
// their established Organizer/Member route, while the same role without a
// private membership remains blocked for a PRIVATE record.
for (const privateBatchRole of ["organizer", "member"] as const) {
  const publicIdentity = {
    orderType:
      privateBatchRole === "organizer" ? "Group Organizer" as const : "Group Member" as const,
    batchId: "public_batch_1234567",
  };
  const publicGroup = group({
    batchId: publicIdentity.batchId,
    visibility: "PUBLIC",
    ownerUid: "public-owner",
  });
  const resolved = resolveGroupOrderIdentity({
    identity: publicIdentity,
    groups: [publicGroup],
    viewerUid: null,
    accessById: {},
  });
  assert.equal(resolved.status, "public");
  const publicHydration = resolvePersistedDraftHydrationContext(
    {
      batchType: "personalized",
      batchId: publicIdentity.batchId,
      privateBatchRole,
    },
    [],
    "Pickup",
    { groups: [publicGroup], viewerUid: null, accessById: {} },
  );
  assert.equal(publicHydration.status, "valid");
}

let publicListener: ((groups: readonly CustomGroup[]) => void) | null = null;
let adminListener: ((groups: readonly CustomGroup[]) => void) | null = null;
let adminErrorListener: ((error: Error) => void) | null = null;
const ownerListeners = new Map<string, (groups: readonly CustomGroup[]) => void>();
const ownerErrorListeners = new Map<string, (error: Error) => void>();
const membershipListeners = new Map<
  string,
  (memberships: readonly PrivateBatchMembershipRecord[]) => void
>();
const membershipErrorListeners = new Map<string, (error: Error) => void>();
const groupListeners = new Map<string, (group: CustomGroup | null) => void>();
const groupErrorListeners = new Map<string, (error: Error) => void>();
const adapter: PrivateBatchSubscriptionAdapter = {
  subscribePublic: (next) => {
    publicListener = next;
    return () => undefined;
  },
  subscribeAllForAdmin: (next, error) => {
    adminListener = next;
    adminErrorListener = error;
    return () => undefined;
  },
  subscribeOwned: (uid, next, error) => {
    ownerListeners.set(uid, next);
    ownerErrorListeners.set(uid, error);
    return () => undefined;
  },
  subscribeMemberships: (uid, next, error) => {
    membershipListeners.set(uid, next);
    membershipErrorListeners.set(uid, error);
    return () => undefined;
  },
  subscribeGroup: (groupId, next, error) => {
    groupListeners.set(groupId, next);
    groupErrorListeners.set(groupId, error);
    return () => undefined;
  },
};
const snapshots: Array<{
  groups: readonly CustomGroup[];
  access: Record<string, unknown>;
  ready: boolean;
  generation: number;
}> = [];
const controller = createPrivateBatchSubscriptionController({
  adapter,
  onSnapshot: ({
    groups,
    accessById,
    privateAccessReady,
    privateAccessGeneration,
  }) =>
    snapshots.push({
      groups,
      access: accessById,
      ready: privateAccessReady,
      generation: privateAccessGeneration,
    }),
});
controller.startPublic();
publicListener?.([
  group({ batchId: "public-batch", visibility: "PUBLIC", ownerUid: "public-owner" }),
]);
controller.setIdentity({ uid: "owner-a", isAdmin: false });
publicListener?.([]);
ownerListeners.get("owner-a")?.([group()]);
membershipListeners.get("owner-a")?.([]);
assert.equal(snapshots.at(-1)?.access[GROUP_ID], "owner");
assert.equal(snapshots.at(-1)?.ready, true);
const ownerAuthorizationGeneration = snapshots.at(-1)?.generation || 0;

controller.setIdentity({ uid: "member-b", isAdmin: false });
publicListener?.([]);
assert.equal(snapshots.at(-1)?.groups.some((item) => item.batchId === GROUP_ID), false);
assert.ok((snapshots.at(-1)?.generation || 0) > ownerAuthorizationGeneration);
// These are deliberately stale callbacks retained by the fake adapter.
ownerListeners.get("owner-a")?.([group()]);
assert.equal(snapshots.at(-1)?.groups.some((item) => item.batchId === GROUP_ID), false);
ownerListeners.get("member-b")?.([]);
membershipListeners.get("member-b")?.([
  { groupId: GROUP_ID, memberUid: "member-b", role: "member" },
]);
groupListeners.get(GROUP_ID)?.(group());
assert.equal(snapshots.at(-1)?.access[GROUP_ID], "member");
assert.equal(snapshots.at(-1)?.ready, true);

controller.setIdentity({ uid: null, isAdmin: false });
assert.equal(snapshots.at(-1)?.groups.some((item) => item.batchId === GROUP_ID), false);
assert.equal(snapshots.at(-1)?.ready, false);

controller.setIdentity({ uid: "admin-user", isAdmin: true });
publicListener?.([]);
adminListener?.([group()]);
assert.equal(snapshots.at(-1)?.access[GROUP_ID], "admin");
assert.equal(snapshots.at(-1)?.ready, true);

// A same-UID token refresh that loses the admin claim clears immediately,
// before owner/member discovery has delivered a new snapshot.
controller.setIdentity({ uid: "admin-user", isAdmin: false });
publicListener?.([]);
assert.equal(snapshots.at(-1)?.access[GROUP_ID], undefined);
assert.equal(snapshots.at(-1)?.ready, false);
ownerListeners.get("admin-user")?.([]);
membershipListeners.get("admin-user")?.([]);
assert.equal(snapshots.at(-1)?.ready, true);

// Every discovery error fails closed; stale callbacks cannot restore access.
controller.setIdentity({ uid: "owner-a", isAdmin: false });
publicListener?.([]);
ownerListeners.get("owner-a")?.([group()]);
membershipListeners.get("owner-a")?.([]);
assert.equal(snapshots.at(-1)?.access[GROUP_ID], "owner");
ownerErrorListeners.get("owner-a")?.(new Error("permission-denied"));
assert.equal(snapshots.at(-1)?.access[GROUP_ID], undefined);
assert.equal(snapshots.at(-1)?.ready, false);
assert.ok((snapshots.at(-1)?.generation || 0) > ownerAuthorizationGeneration);
ownerListeners.get("owner-a")?.([group()]);
assert.equal(snapshots.at(-1)?.access[GROUP_ID], undefined);

controller.setIdentity({ uid: "admin-user", isAdmin: true });
publicListener?.([]);
adminListener?.([group()]);
assert.equal(snapshots.at(-1)?.access[GROUP_ID], "admin");
adminErrorListener?.(new Error("permission-denied"));
assert.equal(snapshots.at(-1)?.access[GROUP_ID], undefined);
assert.equal(snapshots.at(-1)?.ready, false);

controller.setIdentity({ uid: "member-c", isAdmin: false });
publicListener?.([]);
ownerListeners.get("member-c")?.([]);
membershipListeners.get("member-c")?.([
  { groupId: GROUP_ID, memberUid: "member-c", role: "member" },
]);
groupListeners.get(GROUP_ID)?.(group());
assert.equal(snapshots.at(-1)?.access[GROUP_ID], "member");
groupErrorListeners.get(GROUP_ID)?.(new Error("permission-denied"));
assert.equal(snapshots.at(-1)?.access[GROUP_ID], undefined);
assert.equal(snapshots.at(-1)?.ready, false);
assert.equal(membershipErrorListeners.has("member-c"), true);

await beginFoundationDiscovery(null);
uninstallFoundationSubscriptions();
mutableAuth.currentUser = priorFirebaseUser;
mutableAuth.notifyAuthListeners();
console.log("PASS: Private Batch creation, canonical identity, hydration, and auth-transition subscriptions");
