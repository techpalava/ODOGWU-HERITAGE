import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STAFF_PREVIEW_FEATURE_FLAG,
  isStaffPreviewFutureDraftLoadAllowed,
  parseStaffPreviewFeatureFlag,
  readStaffPreviewFeatureFlag,
  resolveStaffPreviewClientAuthorization,
  resolveStaffPreviewGateIdentity,
  resolveStaffPreviewJourneyMode,
  type StaffPreviewClientGateState,
} from "./src/security/staffPreviewClientGate";
import {
  createStaffPreviewClientGateController,
  type StaffPreviewGateFirebaseUser,
} from "./src/services/staffPreviewClientGateService";

const UID_A = "preview-user-a";
const UID_B = "preview-user-b";
const EMAIL_A = "f.o.startups@gmail.com";
const EMAIL_A_ALIAS = "fo.startups+preview@googlemail.com";
const EMAIL_B = "another@example.com";

const claim = (revision = 1) => ({
  schemaVersion: 1,
  entitlementRevision: revision,
});

const activeEntitlement = (revision = 1) => ({
  schemaVersion: 1,
  capability: "design_studio_nine_stage_preview",
  status: "active",
  revision,
  createdAt: { toMillis: () => 1 },
  updatedAt: { toMillis: () => 2 },
  grantedAt: { toMillis: () => 2 },
});

const revokedEntitlement = (revision = 2) => ({
  ...activeEntitlement(revision),
  status: "revoked",
  revokedAt: { toMillis: () => 3 },
});

const customer = (uid = UID_A, email = EMAIL_A_ALIAS) => ({
  ownerUid: uid,
  email,
});

const createUser = ({
  uid = UID_A,
  email = EMAIL_A,
  isAnonymous = false,
  tokenClaim = claim(),
  refreshError = false,
}: {
  uid?: string;
  email?: string | null;
  isAnonymous?: boolean;
  tokenClaim?: unknown | null;
  refreshError?: boolean;
} = {}) => {
  let refreshCount = 0;
  const user: StaffPreviewGateFirebaseUser = {
    uid,
    email,
    isAnonymous,
    async getIdTokenResult(forceRefresh) {
      refreshCount += 1;
      assert.equal(forceRefresh, true);
      if (refreshError) throw new Error("refresh failed");
      return {
        claims:
          tokenClaim === null ? {} : { staffPreview: tokenClaim },
      };
    },
  };
  return { user, getRefreshCount: () => refreshCount };
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createSubscriberHarness = () => {
  const listeners: Array<{
    uid: string;
    active: boolean;
    onValue: (value: unknown | null) => void;
    onError: () => void;
  }> = [];
  let subscriptionCount = 0;
  let cleanupCount = 0;
  return {
    listeners,
    subscribe(uid: string, onValue: (value: unknown | null) => void, onError: () => void) {
      subscriptionCount += 1;
      const listener = { uid, active: true, onValue, onError };
      listeners.push(listener);
      return () => {
        if (!listener.active) return;
        listener.active = false;
        cleanupCount += 1;
      };
    },
    emit(uid: string, value: unknown | null) {
      listeners
        .filter((listener) => listener.uid === uid && listener.active)
        .forEach((listener) => listener.onValue(value));
    },
    fail(uid: string) {
      listeners
        .filter((listener) => listener.uid === uid && listener.active)
        .forEach((listener) => listener.onError());
    },
    getSubscriptionCount: () => subscriptionCount,
    getCleanupCount: () => cleanupCount,
  };
};

assert.equal(parseStaffPreviewFeatureFlag(undefined), false);
assert.equal(parseStaffPreviewFeatureFlag(null), false);
assert.equal(parseStaffPreviewFeatureFlag(""), false);
assert.equal(parseStaffPreviewFeatureFlag("false"), false);
assert.equal(parseStaffPreviewFeatureFlag("TRUE"), false);
assert.equal(parseStaffPreviewFeatureFlag(" true "), false);
assert.equal(parseStaffPreviewFeatureFlag(true), false);
assert.equal(parseStaffPreviewFeatureFlag("true"), true);
assert.equal(readStaffPreviewFeatureFlag({}), false);
assert.equal(
  readStaffPreviewFeatureFlag({ [STAFF_PREVIEW_FEATURE_FLAG]: "true" }),
  true,
);

assert.deepEqual(
  resolveStaffPreviewGateIdentity({
    featureFlagValue: "true",
    firebaseUser: null,
    applicationCustomer: null,
  }),
  { status: "signed_out", reason: "SIGNED_OUT" },
);
assert.equal(
  resolveStaffPreviewGateIdentity({
    featureFlagValue: "true",
    firebaseUser: createUser({ isAnonymous: true }).user,
    applicationCustomer: customer(),
  }).reason,
  "ANONYMOUS_USER",
);
assert.equal(
  resolveStaffPreviewGateIdentity({
    featureFlagValue: "true",
    firebaseUser: createUser().user,
    applicationCustomer: null,
  }).reason,
  "APPLICATION_CUSTOMER_MISSING",
);
assert.equal(
  resolveStaffPreviewGateIdentity({
    featureFlagValue: "true",
    firebaseUser: createUser().user,
    applicationCustomer: { email: EMAIL_A },
  }).reason,
  "APPLICATION_UID_MISSING",
);
assert.equal(
  resolveStaffPreviewGateIdentity({
    featureFlagValue: "true",
    firebaseUser: createUser().user,
    applicationCustomer: customer(UID_B),
  }).reason,
  "APPLICATION_UID_MISMATCH",
);
assert.equal(
  resolveStaffPreviewGateIdentity({
    featureFlagValue: "true",
    firebaseUser: createUser({ email: null }).user,
    applicationCustomer: customer(),
  }).reason,
  "CANONICAL_EMAIL_MISSING",
);
assert.equal(
  resolveStaffPreviewGateIdentity({
    featureFlagValue: "true",
    firebaseUser: createUser().user,
    applicationCustomer: customer(UID_A, EMAIL_B),
  }).reason,
  "CANONICAL_EMAIL_MISMATCH",
);
assert.equal(
  resolveStaffPreviewGateIdentity({
    featureFlagValue: "true",
    firebaseUser: createUser().user,
    applicationCustomer: customer(),
  }).reason,
  "IDENTITY_VERIFIED",
  "The existing Gmail canonicalization contract must reconcile equivalent identities.",
);

const authorizationFixture = (overrides: {
  claim?: unknown | null;
  entitlement?: unknown | null;
} = {}) =>
  resolveStaffPreviewClientAuthorization({
    featureFlagValue: "true",
    firebaseUser: createUser().user,
    applicationCustomer: customer(),
    claim: overrides.claim === undefined ? claim() : overrides.claim,
    entitlement:
      overrides.entitlement === undefined
        ? activeEntitlement()
        : overrides.entitlement,
  });

assert.equal(authorizationFixture({ claim: null }).reason, "CLAIM_MISSING");
assert.equal(authorizationFixture({ claim: {} }).reason, "CLAIM_MALFORMED");
assert.equal(
  authorizationFixture({ claim: { schemaVersion: 2, entitlementRevision: 1 } })
    .reason,
  "CLAIM_MALFORMED",
);
assert.equal(
  authorizationFixture({ entitlement: null }).reason,
  "ENTITLEMENT_MISSING",
);
assert.equal(
  authorizationFixture({ entitlement: {} }).reason,
  "ENTITLEMENT_MALFORMED",
);
assert.equal(
  authorizationFixture({
    entitlement: { ...activeEntitlement(), capability: "wrong_capability" },
  }).reason,
  "ENTITLEMENT_MALFORMED",
);
assert.equal(
  authorizationFixture({ entitlement: revokedEntitlement() }).reason,
  "ENTITLEMENT_REVOKED",
);
assert.equal(
  authorizationFixture({ claim: claim(2) }).reason,
  "CLAIM_REVISION_MISMATCH",
);
assert.deepEqual(authorizationFixture(), {
  status: "authorized",
  reason: "AUTHORIZED",
  uid: UID_A,
  entitlementRevision: 1,
});

{
  const subscriber = createSubscriberHarness();
  const states: StaffPreviewClientGateState[] = [];
  const controller = createStaffPreviewClientGateController({
    subscribeEntitlement: subscriber.subscribe,
    onStateChange: (state) => states.push(state),
  });
  const disabledUser = createUser();
  await controller.evaluate({
    featureFlagValue: "false",
    firebaseUser: disabledUser.user,
    applicationCustomer: customer(),
  });
  assert.equal(controller.getState().status, "disabled");
  assert.equal(disabledUser.getRefreshCount(), 0);
  assert.equal(subscriber.getSubscriptionCount(), 0);

  const failingUser = createUser({ refreshError: true });
  await controller.evaluate({
    featureFlagValue: "true",
    firebaseUser: failingUser.user,
    applicationCustomer: customer(),
  });
  assert.equal(controller.getState().reason, "TOKEN_REFRESH_FAILED");
  assert.equal(failingUser.getRefreshCount(), 1);
  assert.equal(subscriber.getSubscriptionCount(), 0);

  const missingClaimUser = createUser({ tokenClaim: null });
  await controller.evaluate({
    featureFlagValue: "true",
    firebaseUser: missingClaimUser.user,
    applicationCustomer: customer(),
  });
  assert.equal(controller.getState().reason, "CLAIM_MISSING");
  assert.equal(subscriber.getSubscriptionCount(), 0);

  const validUser = createUser();
  await controller.evaluate({
    featureFlagValue: "true",
    firebaseUser: validUser.user,
    applicationCustomer: customer(),
  });
  assert.equal(validUser.getRefreshCount(), 1);
  assert.equal(controller.getState().reason, "ENTITLEMENT_LOADING");
  assert.equal(subscriber.listeners.at(-1)?.uid, UID_A);
  subscriber.emit(UID_A, activeEntitlement());
  assert.equal(controller.getState().status, "authorized");
  assert.equal(isStaffPreviewFutureDraftLoadAllowed(controller.getState()), true);
  subscriber.emit(UID_A, revokedEntitlement());
  assert.equal(controller.getState().reason, "ENTITLEMENT_REVOKED");
  assert.equal(isStaffPreviewFutureDraftLoadAllowed(controller.getState()), false);
  subscriber.fail(UID_A);
  assert.equal(controller.getState().reason, "ENTITLEMENT_LISTENER_FAILED");
  subscriber.listeners.at(-1)?.onValue(activeEntitlement());
  assert.equal(controller.getState().reason, "ENTITLEMENT_LISTENER_FAILED");
  assert.ok(states.some((state) => state.reason === "TOKEN_REFRESH_IN_PROGRESS"));
  controller.dispose();
  assert.equal(subscriber.getCleanupCount(), 1);
}

{
  const subscriber = createSubscriberHarness();
  const deferred = createDeferred<{ claims: Readonly<Record<string, unknown>> }>();
  const user = createUser().user;
  user.getIdTokenResult = () => deferred.promise;
  const controller = createStaffPreviewClientGateController({
    subscribeEntitlement: subscriber.subscribe,
    onStateChange: () => undefined,
  });
  const pending = controller.evaluate({
    featureFlagValue: "true",
    firebaseUser: user,
    applicationCustomer: customer(),
  });
  await controller.evaluate({
    featureFlagValue: "true",
    firebaseUser: null,
    applicationCustomer: null,
  });
  deferred.resolve({ claims: { staffPreview: claim() } });
  await pending;
  assert.equal(controller.getState().status, "signed_out");
  assert.equal(subscriber.getSubscriptionCount(), 0);
}

{
  const subscriber = createSubscriberHarness();
  const controller = createStaffPreviewClientGateController({
    subscribeEntitlement: subscriber.subscribe,
    onStateChange: () => undefined,
  });
  await controller.evaluate({
    featureFlagValue: "true",
    firebaseUser: createUser().user,
    applicationCustomer: customer(),
  });
  const oldListener = subscriber.listeners.at(-1)!;
  await controller.evaluate({
    featureFlagValue: "true",
    firebaseUser: createUser({ uid: UID_B, email: EMAIL_B }).user,
    applicationCustomer: customer(UID_B, EMAIL_B),
  });
  assert.equal(oldListener.active, false);
  assert.equal(subscriber.getCleanupCount(), 1);
  oldListener.onValue(activeEntitlement());
  const loadingState = controller.getState();
  assert.ok("uid" in loadingState);
  assert.equal("uid" in loadingState && loadingState.uid, UID_B);
  assert.equal(loadingState.reason, "ENTITLEMENT_LOADING");
  subscriber.emit(UID_B, activeEntitlement());
  const authorizedState = controller.getState();
  assert.equal(authorizedState.status, "authorized");
  assert.equal("uid" in authorizedState && authorizedState.uid, UID_B);
}

const nonAuthorizedStates: StaffPreviewClientGateState[] = [
  { status: "disabled", reason: "FEATURE_FLAG_DISABLED" },
  { status: "signed_out", reason: "SIGNED_OUT" },
  { status: "identity_invalid", reason: "ANONYMOUS_USER" },
  { status: "checking", reason: "ENTITLEMENT_LOADING", uid: UID_A },
  {
    status: "denied",
    reason: "ENTITLEMENT_REVOKED",
    uid: UID_A,
    entitlementRevision: 2,
  },
  { status: "error", reason: "ENTITLEMENT_LISTENER_FAILED", uid: UID_A },
];
nonAuthorizedStates.forEach((state) => {
  assert.equal(resolveStaffPreviewJourneyMode(state), "legacy_five_stage");
  assert.equal(isStaffPreviewFutureDraftLoadAllowed(state), false);
});
assert.equal(
  resolveStaffPreviewJourneyMode(authorizationFixture()),
  "future_nine_stage",
);

const gateSource = readFileSync(
  "src/security/staffPreviewClientGate.ts",
  "utf8",
);
const serviceSource = readFileSync(
  "src/services/staffPreviewClientGateService.ts",
  "utf8",
);
const hookSource = readFileSync(
  "src/hooks/useStaffPreviewClientGate.ts",
  "utf8",
);
const appSource = readFileSync("src/App.tsx", "utf8");
assert.doesNotMatch(
  gateSource + serviceSource + hookSource,
  /isAllowedAdminEmail|ALLOWED_ADMIN_EMAILS|localStorage|sessionStorage|URLSearchParams|document\.cookie/,
);
assert.match(serviceSource, /getIdTokenResult\(true\)/);
assert.match(serviceSource, /doc\(db, STAFF_PREVIEW_ENTITLEMENT_COLLECTION, uid\)/);
assert.match(hookSource, /controller\.dispose\(\)/);
assert.doesNotMatch(appSource, /future_nine_stage/);
assert.doesNotMatch(appSource, /useStaffPreviewClientGate/);

console.log("PASS: dormant staff preview client authorization gate");
