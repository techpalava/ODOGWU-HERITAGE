import assert from "node:assert/strict";
import { createPrivateBatchAccessSession } from "./src/services/privateBatchAccessSession";
import {
  createPrivateBatchSubscriptionController,
  type PrivateBatchMembershipRecord,
  type PrivateBatchSubscriptionAdapter,
} from "./src/services/privateBatchGroupSubscriptions";
import {
  createFutureOrderV2PersistenceClient,
  type PrivateBatchPersistenceCapabilityFactory,
} from "./src/services/futureOrderV2Persistence";
import type { CustomGroup } from "./src/types";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { resolvePersonalizedGroupAuthority } from "./src/utils/orderContextIdentity";

const UID = "source-member";
const GROUP_ID = "source_merge_private_123456";

const group = (visibility: "PUBLIC" | "PRIVATE"): CustomGroup => ({
  batchId: GROUP_ID,
  ownerUid: visibility === "PRIVATE" ? "another-owner" : UID,
  organizerId: "another-owner",
  organizer: "Source Owner",
  batchName: "Source merge",
  occasion: "Test",
  description: "Test",
  country: "NL",
  city: "Eindhoven",
  preferredDeliveryMonth: "August",
  expectedParticipants: 1,
  maxParticipants: 3,
  visibility,
  currentMembers: 1,
  closingDate: "2099-01-01",
  deliveryWindow: "Later",
  status: "OPEN",
});

const createHarness = () => {
  const publicCallbacks: Array<(groups: readonly CustomGroup[]) => void> = [];
  const ownerCallbacks: Array<(groups: readonly CustomGroup[]) => void> = [];
  const membershipCallbacks: Array<
    (memberships: readonly PrivateBatchMembershipRecord[]) => void
  > = [];
  const groupCallbacks: Array<(group: CustomGroup | null) => void> = [];
  const adapter: PrivateBatchSubscriptionAdapter = {
    subscribePublic: (next) => {
      publicCallbacks.push(next);
      return () => undefined;
    },
    subscribeAllForAdmin: () => () => undefined,
    subscribeOwned: (_uid, next) => {
      ownerCallbacks.push(next);
      return () => undefined;
    },
    subscribeMemberships: (_uid, next) => {
      membershipCallbacks.push(next);
      return () => undefined;
    },
    subscribeGroup: (_groupId, next) => {
      groupCallbacks.push(next);
      return () => undefined;
    },
  };
  let latest: readonly CustomGroup[] = [];
  let accessById: Record<string, unknown> = {};
  let privateAccessReady = false;
  let discoveryLifecycleId: number | null = null;
  const controller = createPrivateBatchSubscriptionController({
    adapter,
    accessSession: createPrivateBatchAccessSession(),
    onSnapshot: (snapshot) => {
      latest = snapshot.groups;
      accessById = snapshot.accessById;
      privateAccessReady = snapshot.privateAccessReady;
      discoveryLifecycleId = snapshot.discoveryLifecycleId;
    },
  });
  controller.startPublic();
  return {
    controller,
    publicCallbacks,
    ownerCallbacks,
    membershipCallbacks,
    groupCallbacks,
    current: () => latest.find((candidate) => candidate.batchId === GROUP_ID),
    access: () => accessById[GROUP_ID],
    authority: () =>
      resolvePersonalizedGroupAuthority({
        identity: { orderType: "Group Member", batchId: GROUP_ID },
        groups: latest,
        privateAccessReady,
        discoveryLifecycleId,
      }),
  };
};

const establishMemberPrivate = (harness: ReturnType<typeof createHarness>) => {
  harness.ownerCallbacks.at(-1)?.([]);
  harness.membershipCallbacks.at(-1)?.([
    { groupId: GROUP_ID, memberUid: UID, role: "member" },
  ]);
  harness.groupCallbacks.at(-1)?.(group("PRIVATE"));
};

const memberOrder = createFutureOrderV2Fixture("source-merge-member-order", undefined, {
  orderType: "Group Member",
  batchId: GROUP_ID,
});
const persistedMemberOrder = createPersistedFutureOrderV2({
  masterOrder: memberOrder,
  owner: { uid: UID, isAnonymous: false },
  customerOwnerUid: UID,
  persistedAt: "2026-09-12T00:00:00.000Z",
});
assert.equal(persistedMemberOrder.status, "valid");
if (persistedMemberOrder.status !== "valid") {
  throw new Error("Expected the source-merge member order fixture to be valid.");
}

// A current public snapshot followed by member-private discovery must resolve
// PRIVATE. Replaying that public callback cannot change the classification.
{
  const harness = createHarness();
  const staleGuestPublic = harness.publicCallbacks.at(-1);
  harness.controller.setIdentity({ uid: UID, isAdmin: false });
  const currentPublic = harness.publicCallbacks.at(-1);
  currentPublic?.([group("PUBLIC")]);
  establishMemberPrivate(harness);
  assert.equal(harness.current()?.visibility, "PRIVATE");
  assert.equal(harness.access(), "member");
  currentPublic?.([group("PUBLIC")]);
  assert.equal(harness.current()?.visibility, "PRIVATE");
  staleGuestPublic?.([group("PUBLIC")]);
  assert.equal(harness.current()?.visibility, "PRIVATE");

  const resolveCurrentAuthority = harness.authority;
  let httpCalls = 0;
  const client = createFutureOrderV2PersistenceClient({
    getCurrentUser: () => ({
      uid: UID,
      isAnonymous: false,
      getIdToken: async () => "source-merge-token",
    }),
    fetch: async () => {
      httpCalls += 1;
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ status: "created", value: persistedMemberOrder.value }),
      };
    },
  });
  await assert.rejects(
    client.persist({
      masterOrder: memberOrder,
      customerOwnerUid: UID,
      resolvePersonalizedGroupAuthority: () => resolveCurrentAuthority(),
    }),
    /fresh personalized group discovery is required/,
  );
  assert.equal(httpCalls, 0, "A stale public source cannot create an unguarded request.");

  let capabilityCalls = 0;
  const capabilityFactory: PrivateBatchPersistenceCapabilityFactory = {
    captureDiscoveryAnchor: () => ({
      authSessionId: 1,
      discoveryLifecycleId: 1,
      uid: UID,
    }),
    ensurePostRefreshCapability: async ({ identity }) => {
      capabilityCalls += 1;
      return {
        generation: 1,
        discoveryLifecycleId: 1,
        uid: UID,
        orderType: identity.orderType,
        batchId: identity.batchId,
        isCurrent: () =>
          resolveCurrentAuthority().status === "FINAL_PRIVATE" &&
          harness.access() === "member",
      };
    },
  };
  const persisted = await client.persist({
    masterOrder: memberOrder,
    customerOwnerUid: UID,
    privateBatchCapabilityFactory: capabilityFactory,
    resolvePersonalizedGroupAuthority: () => resolveCurrentAuthority(),
  });
  assert.equal(persisted.status, "created");
  assert.equal(capabilityCalls, 1, "PRIVATE source state requires a capability.");
  assert.equal(httpCalls, 1, "Only the capability-guarded request reaches transport.");

  // Once the authoritative member source has removed the record and the
  // current public source confirms it, the effective record converges PUBLIC.
  harness.membershipCallbacks.at(-1)?.([]);
  currentPublic?.([group("PUBLIC")]);
  assert.equal(harness.current()?.visibility, "PUBLIC");
  assert.equal(harness.access(), undefined);
}

// Reverse callback order is equally conservative: PRIVATE remains dominant
// when the public source arrives after member-private discovery.
{
  const harness = createHarness();
  harness.controller.setIdentity({ uid: UID, isAdmin: false });
  establishMemberPrivate(harness);
  harness.publicCallbacks.at(-1)?.([group("PUBLIC")]);
  assert.equal(harness.current()?.visibility, "PRIVATE");
  assert.equal(harness.access(), "member");
}

// A public callback retained from lifecycle A cannot mutate lifecycle B.
{
  const harness = createHarness();
  harness.controller.setIdentity({ uid: UID, isAdmin: false });
  const lifecycleAPublic = harness.publicCallbacks.at(-1);
  harness.controller.setIdentity({ uid: UID, isAdmin: false });
  establishMemberPrivate(harness);
  lifecycleAPublic?.([group("PUBLIC")]);
  assert.equal(harness.current()?.visibility, "PRIVATE");
  assert.equal(harness.access(), "member");
}

console.log("PASS: source-aware PRIVATE Batch group merge and stale-public fencing");
