import assert from "node:assert/strict";
import {
  createFutureOrderV2PersistenceClient,
  FutureOrderV2PersistenceClientError,
  type PrivateBatchPersistenceCapabilityFactory,
} from "./src/services/futureOrderV2Persistence";
import { createPrivateBatchAccessSession } from "./src/services/privateBatchAccessSession";
import {
  createPrivateBatchAuthCoordinator,
  type PrivateBatchTokenUser,
} from "./src/services/privateBatchAuthCoordinator";
import {
  createPrivateBatchSubscriptionController,
  type PrivateBatchMembershipRecord,
  type PrivateBatchSubscriptionAdapter,
} from "./src/services/privateBatchGroupSubscriptions";
import type { CustomGroup } from "./src/types";
import {
  resolvePersonalizedGroupAuthority,
  type PersonalizedGroupAuthority,
} from "./src/utils/orderContextIdentity";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";

const OWNER_UID = "discovery-persistence-owner";
const BATCH_ID = "discovery_persistence_private_123456";

const group = (): CustomGroup => ({
  batchId: BATCH_ID,
  ownerUid: OWNER_UID,
  organizerId: OWNER_UID,
  organizer: "Discovery Owner",
  batchName: "Discovery persistence test",
  occasion: "Test",
  description: "Test",
  country: "NL",
  city: "Eindhoven",
  preferredDeliveryMonth: "August",
  expectedParticipants: 1,
  maxParticipants: 2,
  visibility: "PRIVATE",
  currentMembers: 1,
  closingDate: "2099-01-01",
  deliveryWindow: "Later",
  status: "OPEN",
});

const publicGroup = (): CustomGroup => ({ ...group(), visibility: "PUBLIC" });

const order = createFutureOrderV2Fixture("discovery-persistence-order", undefined, {
  orderType: "Group Organizer",
  batchId: BATCH_ID,
});
const persisted = createPersistedFutureOrderV2({
  masterOrder: order,
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
  persistedAt: "2026-09-12T00:00:00.000Z",
});
assert.equal(persisted.status, "valid");
if (persisted.status !== "valid") throw new Error("Expected a valid persistence fixture.");

const createHarness = () => {
  let publicListener: ((groups: readonly CustomGroup[]) => void) | null = null;
  let ownerListener: ((groups: readonly CustomGroup[]) => void) | null = null;
  let membershipListener:
    | ((memberships: readonly PrivateBatchMembershipRecord[]) => void)
    | null = null;
  const adapter: PrivateBatchSubscriptionAdapter = {
    subscribePublic: (next) => {
      publicListener = next;
      return () => undefined;
    },
    subscribeAllForAdmin: () => () => undefined,
    subscribeOwned: (_uid, next) => {
      ownerListener = next;
      return () => undefined;
    },
    subscribeMemberships: (_uid, next) => {
      membershipListener = next;
      return () => undefined;
    },
    subscribeGroup: () => () => undefined,
  };
  const accessSession = createPrivateBatchAccessSession();
  let currentGroups: readonly CustomGroup[] = [];
  let currentReady = false;
  let currentDiscoveryLifecycleId: number | null = null;
  let controller = createPrivateBatchSubscriptionController({
    adapter,
    accessSession,
    onSnapshot: (snapshot) => {
      currentGroups = snapshot.groups;
      currentReady = snapshot.privateAccessReady;
      currentDiscoveryLifecycleId = snapshot.discoveryLifecycleId;
    },
  });
  let currentUser: (PrivateBatchTokenUser & {
    getIdToken(forceRefresh?: boolean): Promise<string>;
  }) | null = null;
  const coordinator = createPrivateBatchAuthCoordinator({
    getTarget: () => controller,
    getCurrentUser: () => currentUser,
    accessSession,
  });
  let onForcedRefresh = () => undefined;
  const owner: PrivateBatchTokenUser & {
    getIdToken(forceRefresh?: boolean): Promise<string>;
  } = {
    uid: OWNER_UID,
    isAnonymous: false,
    getIdTokenResult: async () => ({ claims: { admin: false } }),
    getIdToken: async () => {
      onForcedRefresh();
      return "refreshed-token";
    },
  };
  currentUser = owner;
  coordinator.synchronize(owner);

  const completeDiscovery = (authorized: boolean) => {
    publicListener?.([]);
    ownerListener?.(authorized ? [group()] : []);
    membershipListener?.([]);
  };
  const completePublicDiscovery = () => {
    publicListener?.([publicGroup()]);
    ownerListener?.([]);
    membershipListener?.([]);
  };
  const factory: PrivateBatchPersistenceCapabilityFactory = {
    captureDiscoveryAnchor: accessSession.getDiscoveryAnchor,
    ensurePostRefreshCapability: async ({ uid, identity, anchor }) => {
      const lifecycle = coordinator.ensureFreshPrivateDiscoveryForCurrentSession({
        uid,
        anchor,
      });
      if (!lifecycle) return undefined;
      const result = await accessSession.awaitPrivateBatchAccess({
        uid,
        orderType: identity.orderType,
        batchId: identity.batchId,
        discoveryLifecycleId: lifecycle.discoveryLifecycleId,
      });
      if (result.status !== "AUTHORIZED") return undefined;
      return {
        generation: result.accessGeneration,
        discoveryLifecycleId: result.discoveryLifecycleId,
        uid: result.uid,
        orderType: result.orderType,
        batchId: result.batchId,
        isCurrent: () =>
          accessSession.getCurrentLifecycle()?.discoveryLifecycleId ===
            result.discoveryLifecycleId &&
          accessSession.getGeneration() === result.accessGeneration,
      };
    },
  };
  return {
    accessSession,
    coordinator,
    owner,
    completeDiscovery,
    completePublicDiscovery,
    factory,
    setOnForcedRefresh: (next: () => void) => {
      onForcedRefresh = next;
    },
    resolveAuthority: () =>
      resolvePersonalizedGroupAuthority({
        identity: { orderType: "Group Organizer", batchId: BATCH_ID },
        groups: currentGroups,
        privateAccessReady: currentReady,
        discoveryLifecycleId: currentDiscoveryLifecycleId,
      }),
    dispose: () => controller.dispose(),
  };
};

const persistWith = ({
  harness,
  getAuthority,
  onFetch,
}: {
  harness: ReturnType<typeof createHarness>;
  getAuthority: () => PersonalizedGroupAuthority;
  onFetch: () => void;
}) =>
  createFutureOrderV2PersistenceClient({
    getCurrentUser: () => harness.owner,
    fetch: async () => {
      onFetch();
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ status: "created", value: persisted.value }),
      };
    },
  }).persist({
    masterOrder: order,
    customerOwnerUid: OWNER_UID,
    privateBatchCapabilityFactory: harness.factory,
    resolvePersonalizedGroupAuthority: () => getAuthority(),
  });

// Firebase can legally return an unchanged token without emitting an auth
// event. The explicit coordinator method must start a new controller
// lifecycle, wait for it, and only then permit the protected HTTP request.
{
  const harness = createHarness();
  await Promise.resolve();
  harness.completeDiscovery(true);
  const initial = harness.accessSession.getCurrentLifecycle();
  assert.ok(initial);
  let requests = 0;
  const pending = persistWith({
    harness,
    getAuthority: harness.resolveAuthority,
    onFetch: () => {
      requests += 1;
    },
  });
  await Promise.resolve();
  const renewed = harness.accessSession.getCurrentLifecycle();
  assert.ok(renewed);
  assert.notEqual(renewed.discoveryLifecycleId, initial.discoveryLifecycleId);
  assert.equal(
    harness.resolveAuthority().status,
    "PENDING_REDISCOVERY",
    "A temporarily missing private record during renewal is not terminal authority.",
  );
  assert.equal(requests, 0, "No-event refresh must await its renewed discovery.");
  harness.completeDiscovery(true);
  assert.equal((await pending).status, "created");
  assert.equal(requests, 1);
  harness.dispose();
}

// A genuine token event starts the fresh lifecycle first. Persistence may use
// exactly that newer lifecycle, but never the anchor captured before refresh.
{
  const harness = createHarness();
  await Promise.resolve();
  harness.completeDiscovery(true);
  const initial = harness.accessSession.getCurrentLifecycle();
  assert.ok(initial);
  harness.setOnForcedRefresh(() => harness.coordinator.synchronize(harness.owner));
  let requests = 0;
  const pending = persistWith({
    harness,
    getAuthority: harness.resolveAuthority,
    onFetch: () => {
      requests += 1;
    },
  });
  await Promise.resolve();
  const renewed = harness.accessSession.getCurrentLifecycle();
  assert.ok(renewed);
  assert.notEqual(renewed.discoveryLifecycleId, initial.discoveryLifecycleId);
  assert.equal(
    harness.resolveAuthority().status,
    "PENDING_REDISCOVERY",
    "Token-event state is pending rediscovery, not terminal absence.",
  );
  assert.equal(requests, 0);
  harness.completeDiscovery(true);
  assert.equal((await pending).status, "created");
  assert.equal(requests, 1);
  harness.dispose();
}

// A lifecycle that reaches current-source completion without the group is a
// terminal missing result, not pending rediscovery, and cannot issue HTTP.
{
  const harness = createHarness();
  await Promise.resolve();
  harness.completeDiscovery(true);
  harness.setOnForcedRefresh(() => harness.coordinator.synchronize(harness.owner));
  let requests = 0;
  const pending = persistWith({
    harness,
    getAuthority: harness.resolveAuthority,
    onFetch: () => {
      requests += 1;
    },
  });
  await Promise.resolve();
  assert.equal(harness.resolveAuthority().status, "PENDING_REDISCOVERY");
  harness.completeDiscovery(false);
  await assert.rejects(
    pending,
    (error: unknown) =>
      error instanceof FutureOrderV2PersistenceClientError &&
      error.code === "PRIVATE_BATCH_UNAUTHORIZED",
  );
  assert.equal(harness.resolveAuthority().status, "FINAL_MISSING");
  assert.equal(requests, 0);
  harness.dispose();
}

// A stable PUBLIC personalized group also survives a token event. It waits
// for current public-source confirmation but never needs a private capability.
{
  const harness = createHarness();
  await Promise.resolve();
  harness.completePublicDiscovery();
  harness.setOnForcedRefresh(() => harness.coordinator.synchronize(harness.owner));
  let requests = 0;
  const pending = persistWith({
    harness,
    getAuthority: harness.resolveAuthority,
    onFetch: () => {
      requests += 1;
    },
  });
  await Promise.resolve();
  assert.equal(harness.resolveAuthority().status, "PENDING_REDISCOVERY");
  harness.completePublicDiscovery();
  assert.equal((await pending).status, "created");
  assert.equal(requests, 1);
  harness.dispose();
}

console.log("PASS: Private Batch discovery persistence waits for real refreshed lifecycle and live visibility");
