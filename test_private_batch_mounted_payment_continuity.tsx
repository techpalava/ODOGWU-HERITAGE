import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import DesignStudioView from "./src/components/DesignStudioView";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { auth } from "./src/services/firebase";
import type {
  PersistFutureOrderV2ClientResult,
  PrivateBatchPersistenceCapability,
} from "./src/services/futureOrderV2Persistence";
import { createFutureOrderV2PersistenceClient } from "./src/services/futureOrderV2Persistence";
import {
  type PrivateBatchMembershipRecord,
  type PrivateBatchSubscriptionAdapter,
} from "./src/services/privateBatchGroupSubscriptions";
import {
  installPrivateBatchSubscriptionAdapterForTests,
  synchronizePrivateBatchIdentityForTests,
  useAppStore,
} from "./src/store/useAppStore";
import type { CustomGroup } from "./src/types";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import { createFutureOrderV2PaymentReviewHandoff } from "./src/utils/designStudioFuturePaymentReview";
import {
  createPersistedFutureOrderV2,
  type PersistFutureOrderV2Result,
} from "./src/utils/futureOrderV2PersistenceContract";
import type { FutureOrderCandidateV2BuildResult } from "./src/utils/futureOrderCandidate";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const GROUP_ID = "mounted_payment_private_batch_123456";
const group: CustomGroup = {
  batchId: GROUP_ID,
  ownerUid: "owner-a",
  organizerId: "owner-a",
  organizer: "Owner A",
  batchName: "Private payment test",
  occasion: "Test",
  description: "Test",
  country: "Netherlands",
  city: "Eindhoven",
  preferredDeliveryMonth: "August",
  expectedParticipants: 1,
  maxParticipants: 2,
  visibility: "PRIVATE",
  currentMembers: 1,
  closingDate: "2099-01-01",
  deliveryWindow: "Later",
  status: "OPEN",
};
const masterOrder = createFutureOrderV2Fixture("mounted-payment-fixture", undefined, {
  orderType: "Group Organizer",
  batchId: GROUP_ID,
});
const candidate = masterOrder.cartItem.candidate;
const handoff = createFutureOrderV2PaymentReviewHandoff(candidate);
const persistedEnvelope = createPersistedFutureOrderV2({
  masterOrder,
  owner: { uid: "owner-a", isAnonymous: false },
  customerOwnerUid: "owner-a",
  persistedAt: "2026-09-12T00:00:00.000Z",
});
assert.equal(persistedEnvelope.status, "valid");
if (persistedEnvelope.status !== "valid") {
  throw new Error("Expected a valid mounted-payment persistence fixture.");
}
const createdPersistenceResult = {
  status: "created",
  value: persistedEnvelope.value,
} satisfies Extract<PersistFutureOrderV2Result, { status: "created" }>;

const establishPrivateCapability = (): PrivateBatchPersistenceCapability => {
  const state = useAppStore.getState();
  const generation = state.customGroupPrivateAccessGeneration;
  const discoveryLifecycleId =
    state.customGroupPrivateDiscoveryLifecycleId ?? generation;
  return {
    generation,
    discoveryLifecycleId,
    uid: "owner-a",
    orderType: "Group Organizer",
    batchId: GROUP_ID,
    isCurrent: () => {
      const current = useAppStore.getState();
      return (
        current.customGroupPrivateAccessGeneration === generation &&
        current.customGroupPrivateAccessReady &&
        current.customGroupAccessById[GROUP_ID] === "owner"
      );
    },
  };
};
const createdPrivatePersistenceResult = (): PersistFutureOrderV2ClientResult => ({
  ...createdPersistenceResult,
  privateBatchCapability: establishPrivateCapability(),
  personalizedGroupAuthority: {
    status: "FINAL_PRIVATE",
    visibility: "PRIVATE",
    discoveryLifecycleId:
      useAppStore.getState().customGroupPrivateDiscoveryLifecycleId ??
      useAppStore.getState().customGroupPrivateAccessGeneration,
  },
});

// Production-equivalent controlled Firestore listeners for the mounted
// refresh regression. The component uses the real persistence client below;
// only the final HTTP response is a test adapter.
const createMountedDiscoveryHarness = (uid = "owner-a") => {
  let publicListener: ((groups: readonly CustomGroup[]) => void) | null = null;
  let ownerListener: ((groups: readonly CustomGroup[]) => void) | null = null;
  let membershipListener:
    | ((memberships: readonly PrivateBatchMembershipRecord[]) => void)
    | null = null;
  let memberGroupListener: ((nextGroup: CustomGroup | null) => void) | null = null;
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
      memberGroupListener = next;
      return () => undefined;
    },
  };
  let refreshCalls = 0;
  const owner: {
    uid: string;
    email: string;
    isAnonymous: boolean;
    getIdTokenResult(): Promise<Readonly<{ claims: Readonly<Record<string, unknown>> }>>;
    getIdToken(forceRefresh?: boolean): Promise<string>;
  } = {
    uid,
    email: `${uid}@example.test`,
    isAnonymous: false,
    getIdTokenResult: async () => ({ claims: { admin: false } }),
    getIdToken: async (forceRefresh?: boolean) => {
      assert.equal(forceRefresh, true);
      refreshCalls += 1;
      return "mounted-unchanged-token";
    },
  };
  mutableAuth.currentUser = owner;
  mutableAuth.notifyAuthListeners();
  const uninstall = installPrivateBatchSubscriptionAdapterForTests(adapter);
  synchronizePrivateBatchIdentityForTests();
  const completeOrganizerPrivate = () => {
    publicListener?.([]);
    ownerListener?.([group]);
    membershipListener?.([]);
  };
  const completeMemberPrivate = () => {
    publicListener?.([]);
    ownerListener?.([]);
    membershipListener?.([
      { groupId: GROUP_ID, memberUid: uid, role: "member" },
    ]);
    memberGroupListener?.(group);
  };
  const provisionalPublic = () => {
    publicListener?.([{ ...group, visibility: "PUBLIC" }]);
  };
  const completePublicDiscovery = () => {
    provisionalPublic();
    ownerListener?.([]);
    membershipListener?.([]);
  };
  return {
    owner,
    completeDiscovery: completeOrganizerPrivate,
    completeOrganizerPrivate,
    completeMemberPrivate,
    provisionalPublic,
    completePublicDiscovery,
    getRefreshCalls: () => refreshCalls,
    dispose: uninstall,
  };
};

const mutableAuth = auth as unknown as {
  currentUser: unknown;
  notifyAuthListeners(): void;
};
const priorFirebaseUser = mutableAuth.currentUser;
mutableAuth.currentUser = {
  uid: "owner-a",
  email: "owner-a@example.test",
  isAnonymous: false,
};
mutableAuth.notifyAuthListeners();

let actions:
  | {
      seedPaymentReview: (value: typeof handoff) => void;
      prepare: () => Promise<void>;
      executePayment: () => Promise<void>;
    }
  | undefined;
let prepareMode: "deferred" | "immediate" = "deferred";
const deferredPrepare = deferred<PersistFutureOrderV2ClientResult>();
const deferredPayment = deferred<{
  status: "authorized";
  providerTransactionReference: string;
}>();
let providerCalls = 0;

useAppStore.setState({
  businessSettings: DEFAULT_BUSINESS_SETTINGS,
  isLoadingData: false,
  stylesLoadState: "ready",
  customDetailCatalog: [],
  customGroups: [group],
  customGroupAccessById: { [GROUP_ID]: "owner" },
  customGroupPrivateAccessReady: true,
  customGroupPrivateAccessGeneration: 100,
  customGroupPrivateDiscoveryLifecycleId: 100,
  batches: [],
});

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
        batchName: "Private payment test",
      },
      styles: [],
      fabrics: [],
      futureOrderV2TestHooks: {
        buildCurrentCandidate: () =>
          ({ status: "valid", candidate, blockers: [] }) satisfies FutureOrderCandidateV2BuildResult,
        persist: async () =>
          prepareMode === "deferred"
            ? deferredPrepare.promise
            : createdPrivatePersistenceResult(),
        authorizePayment: async () => {
          providerCalls += 1;
          return deferredPayment.promise;
        },
        onActions: (nextActions) => {
          actions = nextActions;
        },
      },
    }),
  );
  await Promise.resolve();
  await Promise.resolve();
});
const root = () => studio.root.findByProps({ id: "design-studio-nine-stage-journey" });
assert.equal(root().props["data-private-batch-authorization"], "authorized");
assert.ok(actions, "Mounted Studio must expose the actual preparation/payment handlers.");

// Preparation begins while authorized, then its persistence completion becomes
// stale. The mounted handler must not publish a prepared order.
await act(async () => {
  actions!.seedPaymentReview(handoff);
  await Promise.resolve();
});
let stalePreparation!: Promise<void>;
await act(async () => {
  stalePreparation = actions!.prepare();
  await Promise.resolve();
});
await act(async () => {
  useAppStore.setState({
    customGroups: [group],
    customGroupAccessById: {},
    customGroupPrivateAccessReady: true,
    customGroupPrivateAccessGeneration: 101,
    customGroupPrivateDiscoveryLifecycleId: 101,
  });
  deferredPrepare.resolve(createdPrivatePersistenceResult());
  await stalePreparation;
  await Promise.resolve();
});
assert.equal(root().props["data-private-batch-authorization"], "invalid");
assert.throws(
  () => studio.root.findByProps({ "data-future-order-v2-prepared": "prepared" }),
  /No instances found/,
  "A stale preparation result must never publish a prepared Private Batch order.",
);

// Reauthorize and prepare successfully, then revoke before attempting payment.
// The real handler must reject the stale prepared state without contacting a
// payment provider.
await act(async () => {
  useAppStore.setState({
    customGroups: [group],
    customGroupAccessById: { [GROUP_ID]: "owner" },
    customGroupPrivateAccessReady: true,
    customGroupPrivateAccessGeneration: 102,
    customGroupPrivateDiscoveryLifecycleId: 102,
  });
  await Promise.resolve();
});
assert.equal(root().props["data-private-batch-authorization"], "authorized");
await act(async () => {
  prepareMode = "immediate";
  actions!.seedPaymentReview(handoff);
  await Promise.resolve();
});
await act(async () => {
  await actions!.prepare();
  await Promise.resolve();
});
assert.equal(
  studio.root.findByProps({ "data-future-order-v2-prepared": "prepared" }).props[
    "data-future-order-v2-prepared"
  ],
  "prepared",
);
await act(async () => {
  useAppStore.setState({
    customGroups: [group],
    customGroupAccessById: {},
    customGroupPrivateAccessReady: true,
    customGroupPrivateAccessGeneration: 103,
    customGroupPrivateDiscoveryLifecycleId: 103,
  });
  await actions!.executePayment();
  await Promise.resolve();
});
assert.equal(providerCalls, 0, "Revoked prepared payment must not call its provider.");
assert.equal(root().props["data-private-batch-authorization"], "invalid");
assert.throws(
  () =>
    studio.root.find((node) =>
      node.children.some((child) => child === "Payment authorized"),
    ),
  /No instances found/,
  "A revoked prepared payment must not publish authorization.",
);

// Reauthorize, begin the real mounted payment handler, then revoke before
// its asynchronous provider result resolves. No authorized payment result may
// be published after the lost capability.
await act(async () => {
  useAppStore.setState({
    customGroups: [group],
    customGroupAccessById: { [GROUP_ID]: "owner" },
    customGroupPrivateAccessReady: true,
    customGroupPrivateAccessGeneration: 104,
    customGroupPrivateDiscoveryLifecycleId: 104,
  });
  await Promise.resolve();
});
assert.equal(root().props["data-private-batch-authorization"], "authorized");
await act(async () => {
  actions!.seedPaymentReview(handoff);
  await Promise.resolve();
});
await act(async () => {
  await actions!.prepare();
  await Promise.resolve();
});
assert.equal(
  studio.root.findByProps({ "data-future-order-v2-prepared": "prepared" }).props[
    "data-future-order-v2-prepared"
  ],
  "prepared",
);
assert.equal(providerCalls, 0);
let stalePayment!: Promise<void>;
await act(async () => {
  stalePayment = actions!.executePayment();
  await Promise.resolve();
});
await act(async () => {
  useAppStore.setState({
    customGroups: [group],
    customGroupAccessById: {},
    customGroupPrivateAccessReady: true,
    customGroupPrivateAccessGeneration: 105,
    customGroupPrivateDiscoveryLifecycleId: 105,
  });
  deferredPayment.resolve({
    status: "authorized",
    providerTransactionReference: "provider-would-have-authorized",
  });
  await stalePayment;
  await Promise.resolve();
});
assert.equal(root().props["data-private-batch-authorization"], "invalid");
assert.equal(providerCalls, 1, "Only the authorized pending-payment control calls provider.");
assert.throws(
  () =>
    studio.root.find((node) =>
      node.children.some((child) => child === "Payment authorized"),
    ),
  /No instances found/,
  "A stale provider completion must never publish payment authorization.",
);

await act(async () => studio.unmount());

// Mounted legitimate PRIVATE preparation uses the production store's
// controller/session/coordinator and the factory injected by Design itself.
// This deliberately returns an unchanged token with no auth event; fresh
// owner/member callbacks still establish the only capability that may publish.
const mountedDiscovery = createMountedDiscoveryHarness();
await act(async () => {
  mountedDiscovery.completeDiscovery();
  await Promise.resolve();
});
const initialMountedDiscoveryLifecycleId =
  useAppStore.getState().customGroupPrivateDiscoveryLifecycleId;
assert.ok(initialMountedDiscoveryLifecycleId !== null);
let mountedDiscoveryFetches = 0;
let discoveryActions:
  | {
      seedPaymentReview: (value: typeof handoff) => void;
      prepare: () => Promise<void>;
      executePayment: () => Promise<void>;
    }
  | undefined;
let discoveryStudio!: ReturnType<typeof create>;
await act(async () => {
  discoveryStudio = create(
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
        batchName: "Private payment test",
      },
      styles: [],
      fabrics: [],
      futureOrderV2TestHooks: {
        buildCurrentCandidate: () =>
          ({ status: "valid", candidate, blockers: [] }) satisfies FutureOrderCandidateV2BuildResult,
        persist: (input) => {
          const response = createPersistedFutureOrderV2({
            masterOrder: input.masterOrder,
            owner: { uid: "owner-a", isAnonymous: false },
            customerOwnerUid: "owner-a",
            persistedAt: "2026-09-12T00:00:00.000Z",
          });
          assert.equal(response.status, "valid");
          if (response.status !== "valid") {
            throw new Error("Expected a valid mounted real-discovery response.");
          }
          return createFutureOrderV2PersistenceClient({
            getCurrentUser: () => mountedDiscovery.owner,
            fetch: async () => {
              mountedDiscoveryFetches += 1;
              return {
                ok: true,
                status: 201,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ status: "created", value: response.value }),
              };
            },
          }).persist(input);
        },
        onActions: (nextActions) => {
          discoveryActions = nextActions;
        },
      },
    }),
  );
  await Promise.resolve();
  await Promise.resolve();
});
assert.ok(discoveryActions, "Mounted real-discovery Studio exposes preparation.");
await act(async () => {
  discoveryActions!.seedPaymentReview(handoff);
  await Promise.resolve();
});
let mountedDiscoveryPreparation!: Promise<void>;
await act(async () => {
  mountedDiscoveryPreparation = discoveryActions!.prepare();
  await Promise.resolve();
});
assert.equal(mountedDiscoveryFetches, 0, "Real mounted refresh waits for discovery.");
await act(async () => {
  mountedDiscovery.completeDiscovery();
  await mountedDiscoveryPreparation;
  await Promise.resolve();
});
const afterFreshLifecycleId =
  useAppStore.getState().customGroupPrivateDiscoveryLifecycleId;
assert.equal(mountedDiscovery.getRefreshCalls(), 1, "Mounted client called getIdToken(true).");
assert.notEqual(
  afterFreshLifecycleId,
  initialMountedDiscoveryLifecycleId,
  "The mounted no-event refresh created a distinct lifecycle.",
);
assert.equal(mountedDiscoveryFetches, 1);
assert.equal(
  discoveryStudio.root.findByProps({ "data-future-order-v2-prepared": "prepared" }).props[
    "data-future-order-v2-prepared"
  ],
  "prepared",
);
await act(async () => discoveryStudio.unmount());
mountedDiscovery.dispose();

// This mounted public-to-private race uses the same production store factory.
// The renewed PUBLIC callback is provisional until owner/member callbacks
// settle, so Studio cannot publish a prepared order during that window.
const publicDiscovery = createMountedDiscoveryHarness();
await act(async () => {
  publicDiscovery.completePublicDiscovery();
  await Promise.resolve();
});
let mountedFetchCalls = 0;
let publicActions:
  | {
      seedPaymentReview: (value: typeof handoff) => void;
      prepare: () => Promise<void>;
      executePayment: () => Promise<void>;
    }
  | undefined;
let publicStudio!: ReturnType<typeof create>;
await act(async () => {
  publicStudio = create(
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
        batchName: "Private payment test",
      },
      styles: [],
      fabrics: [],
      futureOrderV2TestHooks: {
        buildCurrentCandidate: () =>
          ({ status: "valid", candidate, blockers: [] }) satisfies FutureOrderCandidateV2BuildResult,
        persist: (input) =>
          createFutureOrderV2PersistenceClient({
            getCurrentUser: () => publicDiscovery.owner,
            fetch: async () => {
              mountedFetchCalls += 1;
              const response = createPersistedFutureOrderV2({
                masterOrder: input.masterOrder,
                owner: { uid: "owner-a", isAnonymous: false },
                customerOwnerUid: "owner-a",
                persistedAt: "2026-09-12T00:00:00.000Z",
              });
              assert.equal(response.status, "valid");
              if (response.status !== "valid") {
                throw new Error("Expected a valid mounted public-race response.");
              }
              return {
                ok: true,
                status: 201,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ status: "created", value: response.value }),
              };
            },
          }).persist(input),
        onActions: (nextActions) => {
          publicActions = nextActions;
        },
      },
    }),
  );
  await Promise.resolve();
  await Promise.resolve();
});
assert.ok(publicActions, "Mounted public personalized flow exposes the preparation handler.");
await act(async () => {
  publicActions!.seedPaymentReview(handoff);
  await Promise.resolve();
});
let visibilityTransitionPreparation!: Promise<void>;
await act(async () => {
  visibilityTransitionPreparation = publicActions!.prepare();
  await Promise.resolve();
});
assert.equal(mountedFetchCalls, 0);
await act(async () => {
  publicDiscovery.provisionalPublic();
  await Promise.resolve();
});
assert.equal(
  useAppStore.getState().customGroupPrivateAccessReady,
  false,
  "A renewed public callback must remain provisional while private discovery is pending.",
);
assert.equal(mountedFetchCalls, 0, "Provisional PUBLIC cannot call persistence HTTP.");
assert.throws(
  () => publicStudio.root.findByProps({ "data-future-order-v2-prepared": "prepared" }),
  /No instances found/,
  "Provisional PUBLIC must not publish a prepared order.",
);
await act(async () => {
  publicDiscovery.completeDiscovery();
  await visibilityTransitionPreparation;
  await Promise.resolve();
});
assert.equal(mountedFetchCalls, 1, "FINAL_PRIVATE may persist only after its capability resolves.");
assert.equal(
  publicStudio.root.findByProps({ "data-future-order-v2-prepared": "prepared" }).props[
    "data-future-order-v2-prepared"
  ],
  "prepared",
);
await act(async () => publicStudio.unmount());
publicDiscovery.dispose();

// Repeat Astra's exact provisional-PUBLIC race for Group Member through the
// production capability factory. While owner/member discovery is incomplete,
// neither preparation nor provider authorization may publish.
const memberIdentity = { orderType: "Group Member", batchId: GROUP_ID } as const;
const memberMasterOrder = createFutureOrderV2Fixture(
  "mounted-member-provisional-public",
  undefined,
  memberIdentity,
);
const memberCandidate = memberMasterOrder.cartItem.candidate;
const memberHandoff = createFutureOrderV2PaymentReviewHandoff(memberCandidate);
const memberDiscovery = createMountedDiscoveryHarness("member-b");
await act(async () => {
  memberDiscovery.completePublicDiscovery();
  await Promise.resolve();
});
let memberFetches = 0;
let memberProviderCalls = 0;
let memberActions:
  | {
      seedPaymentReview: (value: typeof memberHandoff) => void;
      prepare: () => Promise<void>;
      executePayment: () => Promise<void>;
    }
  | undefined;
let memberStudio!: ReturnType<typeof create>;
await act(async () => {
  memberStudio = create(
    createElement(DesignStudioView, {
      onAddToCart: () => undefined,
      openCartDrawer: () => undefined,
      currentUser: {
        name: "Member B",
        email: "member-b@example.test",
        ownerUid: "member-b",
      },
      orderContext: {
        orderType: "Group Member",
        batchId: GROUP_ID,
        batchName: "Private payment test",
      },
      styles: [],
      fabrics: [],
      futureOrderV2TestHooks: {
        buildCurrentCandidate: () =>
          ({ status: "valid", candidate: memberCandidate, blockers: [] }) satisfies FutureOrderCandidateV2BuildResult,
        persist: (input) =>
          createFutureOrderV2PersistenceClient({
            getCurrentUser: () => memberDiscovery.owner,
            fetch: async () => {
              memberFetches += 1;
              const response = createPersistedFutureOrderV2({
                masterOrder: input.masterOrder,
                owner: { uid: "member-b", isAnonymous: false },
                customerOwnerUid: "member-b",
                persistedAt: "2026-09-12T00:00:00.000Z",
              });
              assert.equal(response.status, "valid");
              if (response.status !== "valid") {
                throw new Error("Expected a valid mounted member response.");
              }
              return {
                ok: true,
                status: 201,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ status: "created", value: response.value }),
              };
            },
          }).persist(input),
        authorizePayment: async () => {
          memberProviderCalls += 1;
          return {
            status: "authorized" as const,
            providerTransactionReference: "member-provider",
          };
        },
        onActions: (nextActions) => {
          memberActions = nextActions;
        },
      },
    }),
  );
  await Promise.resolve();
  await Promise.resolve();
});
assert.ok(memberActions, "Mounted Group Member flow exposes production handlers.");
await act(async () => {
  memberActions!.seedPaymentReview(memberHandoff);
  await Promise.resolve();
});
let memberPreparation!: Promise<void>;
await act(async () => {
  memberPreparation = memberActions!.prepare();
  await Promise.resolve();
});
await act(async () => {
  memberDiscovery.provisionalPublic();
  await Promise.resolve();
  await memberActions!.executePayment();
});
assert.equal(useAppStore.getState().customGroupPrivateAccessReady, false);
assert.equal(memberFetches, 0, "Mounted Member provisional PUBLIC cannot call HTTP.");
assert.equal(memberProviderCalls, 0, "Mounted Member provisional PUBLIC cannot call provider.");
assert.throws(
  () => memberStudio.root.findByProps({ "data-future-order-v2-prepared": "prepared" }),
  /No instances found/,
  "Mounted Member provisional PUBLIC cannot publish preparation.",
);
await act(async () => {
  memberDiscovery.completeMemberPrivate();
  await memberPreparation;
  await Promise.resolve();
});
assert.equal(memberFetches, 1, "Mounted Member FINAL_PRIVATE requires and receives current membership capability.");
await act(async () => memberStudio.unmount());
memberDiscovery.dispose();

// The unchanged-PUBLIC mounted control uses the same source lifecycle. It is
// blocked while pending and sends exactly one request only after all relevant
// private sources have completed as PUBLIC/absent.
const unchangedPublicDiscovery = createMountedDiscoveryHarness();
await act(async () => {
  unchangedPublicDiscovery.completePublicDiscovery();
  await Promise.resolve();
});
let unchangedPublicFetches = 0;
let unchangedPublicActions:
  | {
      seedPaymentReview: (value: typeof handoff) => void;
      prepare: () => Promise<void>;
      executePayment: () => Promise<void>;
    }
  | undefined;
let unchangedPublicStudio!: ReturnType<typeof create>;
await act(async () => {
  unchangedPublicStudio = create(
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
        batchName: "Public payment test",
      },
      styles: [],
      fabrics: [],
      futureOrderV2TestHooks: {
        buildCurrentCandidate: () =>
          ({ status: "valid", candidate, blockers: [] }) satisfies FutureOrderCandidateV2BuildResult,
        persist: (input) =>
          createFutureOrderV2PersistenceClient({
            getCurrentUser: () => unchangedPublicDiscovery.owner,
            fetch: async () => {
              unchangedPublicFetches += 1;
              const response = createPersistedFutureOrderV2({
                masterOrder: input.masterOrder,
                owner: { uid: "owner-a", isAnonymous: false },
                customerOwnerUid: "owner-a",
                persistedAt: "2026-09-12T00:00:00.000Z",
              });
              assert.equal(response.status, "valid");
              if (response.status !== "valid") {
                throw new Error("Expected a valid mounted public control response.");
              }
              return {
                ok: true,
                status: 201,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ status: "created", value: response.value }),
              };
            },
          }).persist(input),
        onActions: (nextActions) => {
          unchangedPublicActions = nextActions;
        },
      },
    }),
  );
  await Promise.resolve();
  await Promise.resolve();
});
assert.ok(unchangedPublicActions, "Mounted unchanged PUBLIC flow exposes production handlers.");
await act(async () => {
  unchangedPublicActions!.seedPaymentReview(handoff);
  await Promise.resolve();
});
let unchangedPublicPreparation!: Promise<void>;
await act(async () => {
  unchangedPublicPreparation = unchangedPublicActions!.prepare();
  await Promise.resolve();
});
await act(async () => {
  unchangedPublicDiscovery.provisionalPublic();
  await Promise.resolve();
});
assert.equal(unchangedPublicFetches, 0, "Mounted unchanged PUBLIC is blocked while private discovery is pending.");
await act(async () => {
  unchangedPublicDiscovery.completePublicDiscovery();
  await unchangedPublicPreparation;
  await Promise.resolve();
});
assert.equal(unchangedPublicFetches, 1, "Mounted unchanged PUBLIC sends one request after terminal discovery.");
await act(async () => unchangedPublicStudio.unmount());
unchangedPublicDiscovery.dispose();

mutableAuth.currentUser = priorFirebaseUser;
mutableAuth.notifyAuthListeners();
console.log("PASS: mounted Private Batch preparation and payment discard stale authorization completions");
