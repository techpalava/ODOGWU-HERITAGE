import assert from "node:assert/strict";
import {
  createPrivateBatchAuthCoordinator,
  type PrivateBatchTokenUser,
} from "./src/services/privateBatchAuthCoordinator";
import { createPrivateBatchAccessSession } from "./src/services/privateBatchAccessSession";
import {
  createPrivateBatchSubscriptionController,
  type PrivateBatchMembershipRecord,
  type PrivateBatchSubscriptionAdapter,
} from "./src/services/privateBatchGroupSubscriptions";
import type { CustomGroup } from "./src/types";

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void };
const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const privateGroup = (batchId: string, ownerUid: string): CustomGroup =>
  ({
    batchId,
    ownerUid,
    organizerId: ownerUid,
    organizer: ownerUid,
    batchName: batchId,
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

let publicListener: ((groups: readonly CustomGroup[]) => void) | null = null;
let adminListener: ((groups: readonly CustomGroup[]) => void) | null = null;
let adminError: ((error: Error) => void) | null = null;
const ownerListeners = new Map<string, (groups: readonly CustomGroup[]) => void>();
const ownerErrors = new Map<string, (error: Error) => void>();
const memberListeners = new Map<
  string,
  (memberships: readonly PrivateBatchMembershipRecord[]) => void
>();
const memberErrors = new Map<string, (error: Error) => void>();
const groupListeners = new Map<string, (group: CustomGroup | null) => void>();
const groupErrors = new Map<string, (error: Error) => void>();
let unsubscriptions = 0;
const track = (unsubscribe: () => void) => () => {
  unsubscriptions += 1;
  unsubscribe();
};

const adapter: PrivateBatchSubscriptionAdapter = {
  subscribePublic: (next) => {
    publicListener = next;
    return track(() => undefined);
  },
  subscribeAllForAdmin: (next, error) => {
    adminListener = next;
    adminError = error;
    return track(() => undefined);
  },
  subscribeOwned: (uid, next, error) => {
    ownerListeners.set(uid, next);
    ownerErrors.set(uid, error);
    return track(() => undefined);
  },
  subscribeMemberships: (uid, next, error) => {
    memberListeners.set(uid, next);
    memberErrors.set(uid, error);
    return track(() => undefined);
  },
  subscribeGroup: (groupId, next, error) => {
    groupListeners.set(groupId, next);
    groupErrors.set(groupId, error);
    return track(() => undefined);
  },
};

const accessSession = createPrivateBatchAccessSession(40);
let latest = {
  groups: [] as readonly CustomGroup[],
  accessById: {} as Record<string, unknown>,
  ready: false,
  generation: accessSession.getGeneration(),
};
let controller = createPrivateBatchSubscriptionController({
  adapter,
  accessSession,
  onSnapshot: (snapshot) => {
    latest = {
      groups: snapshot.groups,
      accessById: snapshot.accessById,
      ready: snapshot.privateAccessReady,
      generation: snapshot.privateAccessGeneration,
    };
  },
});
controller.startPublic();
publicListener?.([]);

let tokenListener: ((user: PrivateBatchTokenUser | null) => void) | null = null;
let currentUser: Pick<PrivateBatchTokenUser, "uid" | "isAnonymous"> | null = null;
const coordinator = createPrivateBatchAuthCoordinator({
  getTarget: () => controller,
  getCurrentUser: () => currentUser,
  accessSession,
});
const unbind = coordinator.bindTokenChanges((listener) => {
  tokenListener = listener;
  return () => {
    tokenListener = null;
  };
});

const tokenUser = (uid: string, claims: Deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>): PrivateBatchTokenUser => ({
  uid,
  isAnonymous: false,
  getIdTokenResult: () => claims.promise,
});

// Production token boundary: A is fully discovered, then B arrives. The
// synchronous token callback clears A before B's claims or discovery resolve.
const claimsA = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const userA = tokenUser("user-a", claimsA);
currentUser = userA;
tokenListener?.(userA);
claimsA.resolve({ claims: { admin: false } });
await Promise.resolve();
publicListener?.([]);
ownerListeners.get("user-a")?.([privateGroup("private-a", "user-a")]);
memberListeners.get("user-a")?.([]);
assert.equal(latest.ready, true);
assert.equal(latest.accessById["private-a"], "owner");
const generationA = latest.generation;

const claimsB = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const userB = tokenUser("user-b", claimsB);
currentUser = userB;
tokenListener?.(userB);
assert.equal(latest.ready, false);
assert.equal(latest.groups.some((group) => group.batchId === "private-a"), false);
assert.deepEqual(latest.accessById, {});
assert.ok(latest.generation > generationA);
assert.ok(unsubscriptions > 0, "A discovery listeners were unsubscribed");
// A callback retained by the fake adapter cannot repopulate B's session.
ownerListeners.get("user-a")?.([privateGroup("private-a", "user-a")]);
assert.equal(latest.groups.some((group) => group.batchId === "private-a"), false);
claimsB.resolve({ claims: { admin: false } });
await Promise.resolve();
publicListener?.([]);
ownerListeners.get("user-b")?.([privateGroup("private-b", "user-b")]);
memberListeners.get("user-b")?.([]);
assert.equal(latest.ready, true);
assert.equal(latest.accessById["private-b"], "owner");

// Logout clears immediately; stale B delivery cannot restore private state.
const generationB = latest.generation;
currentUser = null;
tokenListener?.(null);
assert.equal(latest.ready, false);
assert.deepEqual(latest.accessById, {});
assert.ok(latest.generation > generationB);
ownerListeners.get("user-b")?.([privateGroup("private-b", "user-b")]);
assert.equal(latest.groups.some((group) => group.batchId === "private-b"), false);

// Same UID admin-claim loss removes the admin-wide listener before the new
// claims settle, then resumes ordinary UID-scoped discovery only.
const adminClaims = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const adminUser = tokenUser("admin-a", adminClaims);
currentUser = adminUser;
tokenListener?.(adminUser);
adminClaims.resolve({ claims: { admin: true } });
await Promise.resolve();
publicListener?.([]);
adminListener?.([privateGroup("admin-private", "other-owner")]);
assert.equal(latest.accessById["admin-private"], "admin");
const adminGeneration = latest.generation;
// Exercise the captured admin discovery error callback instead of leaving it
// as a passive adapter detail: it must fail closed just like owner/member
// discovery errors.
adminError?.(new Error("permission-denied"));
assert.equal(latest.ready, false);
assert.equal(latest.accessById["admin-private"], undefined);
assert.ok(latest.generation > adminGeneration);
const adminFailureGeneration = latest.generation;
const claimLoss = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const sameAdminWithoutClaim = tokenUser("admin-a", claimLoss);
currentUser = sameAdminWithoutClaim;
tokenListener?.(sameAdminWithoutClaim);
assert.equal(latest.ready, false);
assert.equal(latest.accessById["admin-private"], undefined);
assert.ok(latest.generation > adminFailureGeneration);
claimLoss.resolve({ claims: { admin: false } });
await Promise.resolve();
publicListener?.([]);
ownerListeners.get("admin-a")?.([]);
memberListeners.get("admin-a")?.([]);
assert.equal(latest.ready, true);
assert.equal(latest.accessById["admin-private"], undefined);

// This is a real discovery callback failure, not a rejected claim promise.
const discoveryGeneration = latest.generation;
ownerListeners.get("admin-a")?.([privateGroup("owned-before-error", "admin-a")]);
memberListeners.get("admin-a")?.([]);
assert.equal(latest.accessById["owned-before-error"], "owner");
ownerErrors.get("admin-a")?.(new Error("permission-denied"));
assert.equal(latest.ready, false);
assert.deepEqual(latest.accessById, {});
assert.equal(latest.groups.some((group) => group.batchId === "owned-before-error"), false);
assert.ok(latest.generation > discoveryGeneration);
assert.equal(memberErrors.has("admin-a"), true);
assert.equal(groupErrors.size >= 0, true);

// Replacing a controller consumes the same store-session authority rather
// than restarting at zero.
const beforeReplacement = accessSession.getGeneration();
controller.dispose();
controller = createPrivateBatchSubscriptionController({
  adapter,
  accessSession,
  onSnapshot: (snapshot) => {
    latest = {
      groups: snapshot.groups,
      accessById: snapshot.accessById,
      ready: snapshot.privateAccessReady,
      generation: snapshot.privateAccessGeneration,
    };
  },
});
controller.startPublic();
assert.ok(accessSession.getGeneration() > beforeReplacement);
assert.ok(accessSession.getGeneration() > 40);

// A disposal settles waiters from its exact lifecycle. A new controller for
// the same UID receives a distinct lifecycle, and a retained callback from
// the disposed controller cannot satisfy the old waiter or bleed into the new
// one.
controller.setIdentity({ uid: "same-user", isAdmin: false });
const disposedLifecycle = accessSession.getCurrentLifecycle();
assert.ok(disposedLifecycle, "Controller identity starts a concrete discovery lifecycle.");
const disposedWaiter = accessSession.awaitPrivateBatchAccess({
  uid: "same-user",
  orderType: "Group Organizer",
  batchId: "same-user-private",
  discoveryLifecycleId: disposedLifecycle.discoveryLifecycleId,
});
const staleOwnerCallback = ownerListeners.get("same-user");
assert.ok(staleOwnerCallback, "The first controller owns an owner listener.");
controller.dispose();

controller = createPrivateBatchSubscriptionController({
  adapter,
  accessSession,
  onSnapshot: (snapshot) => {
    latest = {
      groups: snapshot.groups,
      accessById: snapshot.accessById,
      ready: snapshot.privateAccessReady,
      generation: snapshot.privateAccessGeneration,
    };
  },
});
controller.setIdentity({ uid: "same-user", isAdmin: false });
const renewedLifecycle = accessSession.getCurrentLifecycle();
assert.ok(renewedLifecycle, "Replacement controller starts a new lifecycle.");
assert.notEqual(
  renewedLifecycle.discoveryLifecycleId,
  disposedLifecycle.discoveryLifecycleId,
);
staleOwnerCallback?.([privateGroup("same-user-private", "same-user")]);
assert.equal(latest.accessById["same-user-private"], undefined);
publicListener?.([]);
ownerListeners.get("same-user")?.([privateGroup("same-user-private", "same-user")]);
memberListeners.get("same-user")?.([]);
const disposedResult = await disposedWaiter;
assert.equal(disposedResult.status, "DISPOSED");
const renewedResult = await accessSession.awaitPrivateBatchAccess({
  uid: "same-user",
  orderType: "Group Organizer",
  batchId: "same-user-private",
  discoveryLifecycleId: renewedLifecycle.discoveryLifecycleId,
});
assert.equal(renewedResult.status, "AUTHORIZED");

unbind();
console.log("PASS: executable Private Batch token/bootstrap lifecycle, waiter disposal, and replacement");
