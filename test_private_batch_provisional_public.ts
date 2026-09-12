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
  type GroupRoleOrderIdentity,
  type PersonalizedGroupAuthority,
} from "./src/utils/orderContextIdentity";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";

const GROUP_ID = "provisional_public_batch_123456";
const OWNER_UID = "owner-a";
const MEMBER_UID = "member-b";

const group = (visibility: "PUBLIC" | "PRIVATE"): CustomGroup => ({
  batchId: GROUP_ID,
  ownerUid: OWNER_UID,
  organizerId: OWNER_UID,
  organizer: "Owner A",
  batchName: "Provisional public test",
  occasion: "Test",
  description: "Test",
  country: "NL",
  city: "Eindhoven",
  preferredDeliveryMonth: "August",
  expectedParticipants: 1,
  maxParticipants: 2,
  visibility,
  currentMembers: 1,
  closingDate: "2099-01-01",
  deliveryWindow: "Later",
  status: "OPEN",
});

type TestUser = PrivateBatchTokenUser & {
  getIdToken(forceRefresh?: boolean): Promise<string>;
};

const createHarness = (uid: string, identity: GroupRoleOrderIdentity) => {
  let publicListener: ((groups: readonly CustomGroup[]) => void) | null = null;
  let ownerListener: ((groups: readonly CustomGroup[]) => void) | null = null;
  let membershipListener:
    | ((records: readonly PrivateBatchMembershipRecord[]) => void)
    | null = null;
  let groupListener: ((group: CustomGroup | null) => void) | null = null;
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
    subscribeGroup: (_groupId, next) => {
      groupListener = next;
      return () => undefined;
    },
  };
  const accessSession = createPrivateBatchAccessSession();
  let groups: readonly CustomGroup[] = [];
  let ready = false;
  let discoveryLifecycleId: number | null = null;
  const controller = createPrivateBatchSubscriptionController({
    adapter,
    accessSession,
    onSnapshot: (snapshot) => {
      groups = snapshot.groups;
      ready = snapshot.privateAccessReady;
      discoveryLifecycleId = snapshot.discoveryLifecycleId;
    },
  });
  let currentUser: TestUser | null = null;
  const coordinator = createPrivateBatchAuthCoordinator({
    getTarget: () => controller,
    getCurrentUser: () => currentUser,
    accessSession,
  });
  let refreshes = 0;
  const user: TestUser = {
    uid,
    isAnonymous: false,
    getIdTokenResult: async () => ({ claims: { admin: false } }),
    getIdToken: async (forceRefresh?: boolean) => {
      assert.equal(forceRefresh, true);
      refreshes += 1;
      coordinator.synchronize(user);
      return "refreshed-token";
    },
  };
  currentUser = user;
  controller.startPublic();
  coordinator.synchronize(user);
  const factory: PrivateBatchPersistenceCapabilityFactory = {
    captureDiscoveryAnchor: accessSession.getDiscoveryAnchor,
    ensurePostRefreshCapability: async ({ uid: requestUid, identity: requestIdentity, anchor }) => {
      const lifecycle = coordinator.ensureFreshPrivateDiscoveryForCurrentSession({
        uid: requestUid,
        anchor,
      });
      if (!lifecycle) return undefined;
      const result = await accessSession.awaitPrivateBatchAccess({
        uid: requestUid,
        orderType: requestIdentity.orderType,
        batchId: requestIdentity.batchId,
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
  const authority = (): PersonalizedGroupAuthority =>
    resolvePersonalizedGroupAuthority({
      identity,
      groups,
      privateAccessReady: ready,
      discoveryLifecycleId,
    });
  return {
    user,
    factory,
    authority,
    initialPublic: () => {
      publicListener?.([group("PUBLIC")]);
      ownerListener?.([]);
      membershipListener?.([]);
    },
    provisionalPublic: () => publicListener?.([group("PUBLIC")]),
    completeOrganizerPrivate: () => {
      ownerListener?.([group("PRIVATE")]);
      membershipListener?.([]);
    },
    completeMemberPrivate: () => {
      ownerListener?.([]);
      membershipListener?.([
        { groupId: GROUP_ID, memberUid: MEMBER_UID, role: "member" },
      ]);
      groupListener?.(group("PRIVATE"));
    },
    completePublic: () => {
      publicListener?.([group("PUBLIC")]);
      ownerListener?.([]);
      membershipListener?.([]);
    },
    getRefreshes: () => refreshes,
    dispose: () => controller.dispose(),
  };
};

const persist = ({
  identity,
  harness,
  factory = harness.factory,
  onFetch,
}: {
  identity: GroupRoleOrderIdentity;
  harness: ReturnType<typeof createHarness>;
  factory?: PrivateBatchPersistenceCapabilityFactory;
  onFetch: () => void;
}) => {
  const masterOrder = createFutureOrderV2Fixture(
    `provisional-${identity.orderType}`,
    undefined,
    identity,
  );
  const stored = createPersistedFutureOrderV2({
    masterOrder,
    owner: { uid: harness.user.uid, isAnonymous: false },
    customerOwnerUid: harness.user.uid,
    persistedAt: "2026-09-12T00:00:00.000Z",
  });
  assert.equal(stored.status, "valid");
  if (stored.status !== "valid") throw new Error("Expected a valid fixture.");
  return createFutureOrderV2PersistenceClient({
    getCurrentUser: () => harness.user,
    fetch: async () => {
      onFetch();
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ status: "created", value: stored.value }),
      };
    },
  }).persist({
    masterOrder,
    customerOwnerUid: harness.user.uid,
    privateBatchCapabilityFactory: factory,
    resolvePersonalizedGroupAuthority: () => harness.authority(),
  });
};

for (const scenario of [
  {
    label: "Organizer",
    uid: OWNER_UID,
    identity: { orderType: "Group Organizer", batchId: GROUP_ID } as const,
    completePrivate: (harness: ReturnType<typeof createHarness>) =>
      harness.completeOrganizerPrivate(),
  },
  {
    label: "Member",
    uid: MEMBER_UID,
    identity: { orderType: "Group Member", batchId: GROUP_ID } as const,
    completePrivate: (harness: ReturnType<typeof createHarness>) =>
      harness.completeMemberPrivate(),
  },
] as const) {
  // Initial/current PUBLIC is never final while the renewed owner/member
  // sources are incomplete. The public callback alone cannot issue HTTP.
  {
    const harness = createHarness(scenario.uid, scenario.identity);
    await Promise.resolve();
    harness.initialPublic();
    assert.equal(harness.authority().status, "FINAL_PUBLIC");
    let requests = 0;
    const pending = persist({
      identity: scenario.identity,
      harness,
      onFetch: () => {
        requests += 1;
      },
    });
    await Promise.resolve();
    harness.provisionalPublic();
    assert.equal(harness.getRefreshes(), 1);
    assert.equal(
      harness.authority().status,
      "PENDING_REDISCOVERY",
      `${scenario.label} PUBLIC callback is provisional until private discovery completes.`,
    );
    assert.equal(requests, 0, `${scenario.label} cannot persist from provisional PUBLIC.`);
    scenario.completePrivate(harness);
    assert.equal(harness.authority().status, "FINAL_PRIVATE");
    assert.equal((await pending).status, "created");
    assert.equal(requests, 1, `${scenario.label} persists only after its private capability.`);
    harness.dispose();
  }

  // PUBLIC stays supported, but only after the same post-refresh private
  // lifecycle is complete. This is the positive control for both roles.
  {
    const harness = createHarness(scenario.uid, scenario.identity);
    await Promise.resolve();
    harness.initialPublic();
    let requests = 0;
    const pending = persist({
      identity: scenario.identity,
      harness,
      onFetch: () => {
        requests += 1;
      },
    });
    await Promise.resolve();
    harness.provisionalPublic();
    assert.equal(harness.authority().status, "PENDING_REDISCOVERY");
    assert.equal(requests, 0);
    harness.completePublic();
    assert.equal(harness.authority().status, "FINAL_PUBLIC");
    assert.equal((await pending).status, "created");
    assert.equal(requests, 1, `${scenario.label} PUBLIC persists after full discovery.`);
    harness.dispose();
  }
}

// A terminal PRIVATE classification without a matching capability remains a
// hard denial. The organizer cannot use the Member identity as a shortcut.
{
  const identity = { orderType: "Group Member", batchId: GROUP_ID } as const;
  const harness = createHarness(OWNER_UID, identity);
  await Promise.resolve();
  harness.initialPublic();
  let requests = 0;
  const pending = persist({
    identity,
    harness,
    onFetch: () => {
      requests += 1;
    },
  });
  await Promise.resolve();
  harness.provisionalPublic();
  harness.completeOrganizerPrivate();
  assert.equal(harness.authority().status, "FINAL_PRIVATE");
  await assert.rejects(
    pending,
    (error: unknown) =>
      error instanceof FutureOrderV2PersistenceClientError &&
      error.code === "PRIVATE_BATCH_UNAUTHORIZED",
  );
  assert.equal(requests, 0, "Terminal PRIVATE without a role-matching capability cannot persist.");
  harness.dispose();
}

console.log("PASS: provisional PUBLIC never bypasses renewed personalized discovery");
