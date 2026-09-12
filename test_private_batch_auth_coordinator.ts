import assert from "node:assert/strict";
import {
  createPrivateBatchAuthCoordinator,
  type PrivateBatchTokenUser,
} from "./src/services/privateBatchAuthCoordinator";
import { createPrivateBatchAccessSession } from "./src/services/privateBatchAccessSession";

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

const calls: Array<{ uid: string | null; isAdmin: boolean }> = [];
let current: Pick<PrivateBatchTokenUser, "uid" | "isAnonymous"> | null = null;
const accessSession = createPrivateBatchAccessSession();
const coordinator = createPrivateBatchAuthCoordinator({
  getTarget: () => ({
    setIdentity: ({ uid, isAdmin }) => calls.push({ uid, isAdmin }),
  }),
  getCurrentUser: () => current,
  accessSession,
});
const tokenA = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const userA: PrivateBatchTokenUser = {
  uid: "user-a",
  isAnonymous: false,
  getIdTokenResult: () => tokenA.promise,
};
current = userA;
coordinator.synchronize(userA);
assert.deepEqual(calls, [
  { uid: null, isAdmin: false },
  { uid: "user-a", isAdmin: false },
]);
tokenA.resolve({ claims: { admin: true } });
await Promise.resolve();
assert.deepEqual(calls.at(-1), { uid: "user-a", isAdmin: true });

// A -> B clears synchronously. The late A claim completion is discarded.
const lateA = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const delayedA: PrivateBatchTokenUser = { ...userA, getIdTokenResult: () => lateA.promise };
current = delayedA;
coordinator.synchronize(delayedA);
const tokenB = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const userB: PrivateBatchTokenUser = {
  uid: "user-b",
  isAnonymous: false,
  getIdTokenResult: () => tokenB.promise,
};
current = userB;
coordinator.synchronize(userB);
assert.deepEqual(calls.slice(-2), [
  { uid: null, isAdmin: false },
  { uid: "user-b", isAdmin: false },
]);
lateA.resolve({ claims: { admin: true } });
await Promise.resolve();
assert.notDeepEqual(calls.at(-1), { uid: "user-a", isAdmin: true });
tokenB.resolve({ claims: { admin: false } });
await Promise.resolve();
assert.deepEqual(calls.at(-1), { uid: "user-b", isAdmin: false });

// Same UID claim loss is also a clear-first authorization transition.
const refreshedB = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const formerlyAdminB: PrivateBatchTokenUser = {
  ...userB,
  getIdTokenResult: () => refreshedB.promise,
};
current = formerlyAdminB;
coordinator.synchronize(formerlyAdminB);
assert.deepEqual(calls.slice(-2), [
  { uid: null, isAdmin: false },
  { uid: "user-b", isAdmin: false },
]);
refreshedB.resolve({ claims: { admin: false } });
await Promise.resolve();
assert.deepEqual(calls.at(-1), { uid: "user-b", isAdmin: false });

// Logout and claim failures both clear; no old authorization survives.
current = null;
coordinator.synchronize(null);
assert.deepEqual(calls.at(-1), { uid: null, isAdmin: false });
const failedToken = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const failingUser: PrivateBatchTokenUser = {
  uid: "user-c",
  isAnonymous: false,
  getIdTokenResult: () => failedToken.promise,
};
current = failingUser;
coordinator.synchronize(failingUser);
failedToken.reject(new Error("permission-denied"));
await new Promise<void>((resolve) => setTimeout(resolve, 0));
assert.deepEqual(calls.at(-1), { uid: null, isAdmin: false });

// A deferred claim callback from an obsolete lifecycle is inert before it can
// rebind the controller. An explicit fresh lifecycle for the same UID remains
// current, and a stale admin=true result cannot overwrite it.
const lifecycleCalls: Array<{
  uid: string | null;
  isAdmin: boolean;
  discoveryLifecycleId?: number;
}> = [];
const lifecycleSession = createPrivateBatchAccessSession();
let lifecycleCurrent: Pick<PrivateBatchTokenUser, "uid" | "isAnonymous"> | null = null;
const lifecycleCoordinator = createPrivateBatchAuthCoordinator({
  getTarget: () => ({
    setIdentity: (identity) => lifecycleCalls.push(identity),
  }),
  getCurrentUser: () => lifecycleCurrent,
  accessSession: lifecycleSession,
});
const delayedAdmin = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const lifecycleUser: PrivateBatchTokenUser = {
  uid: "same-uid",
  isAnonymous: false,
  getIdTokenResult: () => delayedAdmin.promise,
};
lifecycleCurrent = lifecycleUser;
lifecycleCoordinator.synchronize(lifecycleUser);
const beforeExplicitRefresh = lifecycleCoordinator.getDiscoveryAnchor();
const explicitLifecycle = lifecycleCoordinator.ensureFreshPrivateDiscoveryForCurrentSession({
  uid: "same-uid",
  anchor: beforeExplicitRefresh,
});
assert.ok(explicitLifecycle);
const callsBeforeStaleClaim = lifecycleCalls.length;
delayedAdmin.resolve({ claims: { admin: true } });
await Promise.resolve();
assert.equal(lifecycleCalls.length, callsBeforeStaleClaim);
assert.equal(
  lifecycleSession.getCurrentLifecycle()?.discoveryLifecycleId,
  explicitLifecycle.discoveryLifecycleId,
);

const currentFalseClaim = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const newerSameUidUser: PrivateBatchTokenUser = {
  uid: "same-uid",
  isAnonymous: false,
  getIdTokenResult: () => currentFalseClaim.promise,
};
lifecycleCurrent = newerSameUidUser;
lifecycleCoordinator.synchronize(newerSameUidUser);
currentFalseClaim.resolve({ claims: { admin: false } });
await Promise.resolve();
assert.deepEqual(lifecycleCalls.at(-1)?.isAdmin, false);

const staleAdminCalls: Array<{ uid: string | null; isAdmin: boolean }> = [];
const staleAdminSession = createPrivateBatchAccessSession();
let staleAdminCurrent: Pick<PrivateBatchTokenUser, "uid" | "isAnonymous"> | null = null;
const staleAdminCoordinator = createPrivateBatchAuthCoordinator({
  getTarget: () => ({ setIdentity: (identity) => staleAdminCalls.push(identity) }),
  getCurrentUser: () => staleAdminCurrent,
  accessSession: staleAdminSession,
});
const oldAdminClaim = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const newMemberClaim = deferred<Readonly<{ claims: Readonly<Record<string, unknown>> }>>();
const oldSameUid: PrivateBatchTokenUser = {
  uid: "admin-race",
  isAnonymous: false,
  getIdTokenResult: () => oldAdminClaim.promise,
};
const newSameUid: PrivateBatchTokenUser = {
  uid: "admin-race",
  isAnonymous: false,
  getIdTokenResult: () => newMemberClaim.promise,
};
staleAdminCurrent = oldSameUid;
staleAdminCoordinator.synchronize(oldSameUid);
staleAdminCurrent = newSameUid;
staleAdminCoordinator.synchronize(newSameUid);
newMemberClaim.resolve({ claims: { admin: false } });
await Promise.resolve();
oldAdminClaim.resolve({ claims: { admin: true } });
await Promise.resolve();
assert.equal(staleAdminCalls.at(-1)?.isAdmin, false);

console.log("PASS: Private Batch token coordinator clears synchronously and rejects stale claims");
