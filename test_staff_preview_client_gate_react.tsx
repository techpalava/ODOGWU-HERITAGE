import assert from "node:assert/strict";
import { StrictMode } from "react";
import {
  act,
  create,
  type ReactTestRenderer,
} from "react-test-renderer";
import { useStaffPreviewClientGate } from "./src/hooks/useStaffPreviewClientGate";
import {
  type StaffPreviewGateApplicationCustomer,
} from "./src/security/staffPreviewClientGate";
import type {
  StaffPreviewEntitlementSubscriber,
  StaffPreviewGateFirebaseUser,
} from "./src/services/staffPreviewClientGateService";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const UID_A = "preview-react-user-a";
const UID_B = "preview-react-user-b";
const EMAIL_A = "f.o.startups@gmail.com";
const EMAIL_A_ALIAS = "fo.startups+react@googlemail.com";
const EMAIL_B = "staff-b@example.com";

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

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createUser = ({
  uid = UID_A,
  email = EMAIL_A,
  isAnonymous = false,
}: {
  uid?: string;
  email?: string | null;
  isAnonymous?: boolean;
} = {}) => {
  let refreshCount = 0;
  const user: StaffPreviewGateFirebaseUser = {
    uid,
    email,
    isAnonymous,
    async getIdTokenResult(forceRefresh) {
      assert.equal(forceRefresh, true);
      refreshCount += 1;
      return { claims: { staffPreview: claim() } };
    },
  };
  return { user, getRefreshCount: () => refreshCount };
};

const customer = (
  ownerUid = UID_A,
  email = EMAIL_A_ALIAS,
): StaffPreviewGateApplicationCustomer => ({ ownerUid, email });

interface ListenerRecord {
  uid: string;
  active: boolean;
  onValue: (value: unknown | null) => void;
  onError: () => void;
}

const createSubscriberHarness = () => {
  const listeners: ListenerRecord[] = [];
  let subscriptionCount = 0;
  let cleanupCount = 0;
  const subscribe: StaffPreviewEntitlementSubscriber = (
    uid,
    onValue,
    onError,
  ) => {
    subscriptionCount += 1;
    const listener = { uid, active: true, onValue, onError };
    listeners.push(listener);
    return () => {
      if (!listener.active) return;
      listener.active = false;
      cleanupCount += 1;
    };
  };
  return {
    subscribe,
    listeners,
    emit(uid: string, value: unknown | null) {
      listeners
        .filter((listener) => listener.active && listener.uid === uid)
        .forEach((listener) => listener.onValue(value));
    },
    getSubscriptionCount: () => subscriptionCount,
    getCleanupCount: () => cleanupCount,
  };
};

interface ProbeProps {
  featureFlagValue: unknown;
  firebaseUser: StaffPreviewGateFirebaseUser | null;
  applicationCustomer: StaffPreviewGateApplicationCustomer | null;
  subscribeEntitlement: StaffPreviewEntitlementSubscriber;
}

const GateProbe = (props: ProbeProps) => {
  const state = useStaffPreviewClientGate(props);
  return (
    <output
      data-status={state.status}
      data-reason={state.reason}
    />
  );
};

interface SyncReactTestRenderer extends ReactTestRenderer {
  unstable_flushSync(callback: () => void): void;
}

const element = (props: ProbeProps, strict = false) =>
  strict ? (
    <StrictMode>
      <GateProbe {...props} />
    </StrictMode>
  ) : (
    <GateProbe {...props} />
  );

const renderProbe = async (props: ProbeProps, strict = false) => {
  let renderer!: SyncReactTestRenderer;
  await act(async () => {
    renderer = create(element(props, strict)) as SyncReactTestRenderer;
  });
  return renderer;
};

const renderedState = (renderer: ReactTestRenderer) => {
  const output = renderer.root.findByType("output");
  return {
    status: output.props["data-status"] as string,
    reason: output.props["data-reason"] as string,
  };
};

const updateBeforePassiveEffects = (
  renderer: SyncReactTestRenderer,
  props: ProbeProps,
  strict = false,
) => {
  let immediate!: ReturnType<typeof renderedState>;
  act(() => {
    renderer.unstable_flushSync(() => renderer.update(element(props, strict)));
    immediate = renderedState(renderer);
  });
  return immediate;
};

const authorize = async (
  props: ProbeProps,
  subscriber: ReturnType<typeof createSubscriberHarness>,
  strict = false,
) => {
  const renderer = await renderProbe(props, strict);
  await act(async () => subscriber.emit(props.firebaseUser!.uid, activeEntitlement()));
  assert.equal(renderedState(renderer).status, "authorized");
  return renderer;
};

const baseUser = createUser();
const baseSubscriber = createSubscriberHarness();
const baseProps: ProbeProps = {
  featureFlagValue: "true",
  firebaseUser: baseUser.user,
  applicationCustomer: customer(),
  subscribeEntitlement: baseSubscriber.subscribe,
};

{
  const renderer = await authorize(baseProps, baseSubscriber);
  const unchanged = updateBeforePassiveEffects(renderer, { ...baseProps });
  assert.equal(unchanged.status, "authorized");
  assert.equal(baseUser.getRefreshCount(), 1);
  await act(async () => renderer.unmount());
}

const assertImmediateInvalidation = async ({
  nextProps,
  expectedStatus,
  expectedReason,
}: {
  nextProps: (current: ProbeProps) => ProbeProps;
  expectedStatus: string;
  expectedReason?: string;
}) => {
  const user = createUser();
  const subscriber = createSubscriberHarness();
  const initialProps: ProbeProps = {
    ...baseProps,
    firebaseUser: user.user,
    subscribeEntitlement: subscriber.subscribe,
  };
  const renderer = await authorize(initialProps, subscriber);
  const immediate = updateBeforePassiveEffects(renderer, nextProps(initialProps));
  assert.equal(immediate.status, expectedStatus);
  if (expectedReason) assert.equal(immediate.reason, expectedReason);
  await act(async () => renderer.unmount());
};

await assertImmediateInvalidation({
  nextProps: (current) => ({ ...current, firebaseUser: null }),
  expectedStatus: "signed_out",
});
await assertImmediateInvalidation({
  nextProps: (current) => ({
    ...current,
    firebaseUser: createUser({ uid: UID_B, email: EMAIL_B }).user,
    applicationCustomer: customer(UID_B, EMAIL_B),
  }),
  expectedStatus: "checking",
});
await assertImmediateInvalidation({
  nextProps: (current) => ({
    ...current,
    applicationCustomer: customer(UID_B, EMAIL_A),
  }),
  expectedStatus: "identity_invalid",
  expectedReason: "APPLICATION_UID_MISMATCH",
});
await assertImmediateInvalidation({
  nextProps: (current) => ({
    ...current,
    applicationCustomer: customer(UID_A, EMAIL_B),
  }),
  expectedStatus: "identity_invalid",
  expectedReason: "CANONICAL_EMAIL_MISMATCH",
});
await assertImmediateInvalidation({
  nextProps: (current) => ({
    ...current,
    firebaseUser: createUser({ isAnonymous: true }).user,
  }),
  expectedStatus: "identity_invalid",
  expectedReason: "ANONYMOUS_USER",
});
await assertImmediateInvalidation({
  nextProps: (current) => ({ ...current, featureFlagValue: "false" }),
  expectedStatus: "disabled",
});

{
  const user = createUser();
  const originalSubscriber = createSubscriberHarness();
  const replacementSubscriber = createSubscriberHarness();
  const props = {
    ...baseProps,
    firebaseUser: user.user,
    subscribeEntitlement: originalSubscriber.subscribe,
  };
  const renderer = await authorize(props, originalSubscriber);
  const replacementProps = {
    ...props,
    subscribeEntitlement: replacementSubscriber.subscribe,
  };
  const immediate = updateBeforePassiveEffects(renderer, replacementProps);
  assert.equal(immediate.status, "checking");
  assert.equal(replacementSubscriber.getSubscriptionCount(), 0);
  await act(async () => undefined);
  assert.equal(replacementSubscriber.getSubscriptionCount(), 1);
  await act(async () => replacementSubscriber.emit(UID_A, activeEntitlement()));
  assert.equal(renderedState(renderer).status, "authorized");
  await act(async () => renderer.unmount());
}

{
  const userA = createUser();
  const userSameUidNewEmail = createUser({ email: EMAIL_B });
  const subscriber = createSubscriberHarness();
  const props = {
    ...baseProps,
    firebaseUser: userA.user,
    subscribeEntitlement: subscriber.subscribe,
  };
  const renderer = await authorize(props, subscriber);
  const nextProps = {
    ...props,
    firebaseUser: userSameUidNewEmail.user,
    applicationCustomer: customer(UID_A, EMAIL_B),
  };
  const immediate = updateBeforePassiveEffects(renderer, nextProps);
  assert.equal(immediate.status, "checking");
  await act(async () => undefined);
  await act(async () => subscriber.emit(UID_A, activeEntitlement()));
  assert.equal(renderedState(renderer).status, "authorized");
  await act(async () => renderer.unmount());
}

{
  const deferred = createDeferred<{
    claims: Readonly<Record<string, unknown>>;
  }>();
  const userA = createUser().user;
  userA.getIdTokenResult = () => deferred.promise;
  const userB = createUser({ uid: UID_B, email: EMAIL_B });
  const subscriber = createSubscriberHarness();
  const propsA = {
    ...baseProps,
    firebaseUser: userA,
    subscribeEntitlement: subscriber.subscribe,
  };
  const renderer = await renderProbe(propsA);
  const propsB = {
    ...propsA,
    firebaseUser: userB.user,
    applicationCustomer: customer(UID_B, EMAIL_B),
  };
  const immediate = updateBeforePassiveEffects(renderer, propsB);
  assert.equal(immediate.status, "checking");
  await act(async () => undefined);
  deferred.resolve({ claims: { staffPreview: claim() } });
  await act(async () => undefined);
  assert.equal(
    subscriber.listeners.some((listener) => listener.uid === UID_A),
    false,
  );
  await act(async () => subscriber.emit(UID_B, activeEntitlement()));
  assert.equal(renderedState(renderer).status, "authorized");
  await act(async () => renderer.unmount());
}

{
  const subscriber = createSubscriberHarness();
  const userA = createUser();
  const userB = createUser({ uid: UID_B, email: EMAIL_B });
  const propsA = {
    ...baseProps,
    firebaseUser: userA.user,
    subscribeEntitlement: subscriber.subscribe,
  };
  const renderer = await authorize(propsA, subscriber);
  const oldListener = subscriber.listeners.at(-1)!;
  const propsB = {
    ...propsA,
    firebaseUser: userB.user,
    applicationCustomer: customer(UID_B, EMAIL_B),
  };
  updateBeforePassiveEffects(renderer, propsB);
  await act(async () => undefined);
  assert.equal(oldListener.active, false);
  oldListener.onValue(activeEntitlement());
  assert.notEqual(renderedState(renderer).status, "authorized");
  await act(async () => subscriber.emit(UID_B, activeEntitlement()));
  assert.equal(renderedState(renderer).status, "authorized");
  await act(async () => renderer.unmount());
}

{
  const deferred = createDeferred<{
    claims: Readonly<Record<string, unknown>>;
  }>();
  const user = createUser().user;
  user.getIdTokenResult = () => deferred.promise;
  const subscriber = createSubscriberHarness();
  const renderer = await renderProbe({
    ...baseProps,
    firebaseUser: user,
    subscribeEntitlement: subscriber.subscribe,
  });
  await act(async () => renderer.unmount());
  deferred.resolve({ claims: { staffPreview: claim() } });
  await act(async () => undefined);
  assert.equal(subscriber.getSubscriptionCount(), 0);
}

{
  const user = createUser();
  const subscriber = createSubscriberHarness();
  const props = {
    ...baseProps,
    firebaseUser: user.user,
    subscribeEntitlement: subscriber.subscribe,
  };
  const renderer = await renderProbe(props, true);
  assert.ok(user.getRefreshCount() >= 1 && user.getRefreshCount() <= 2);
  assert.equal(
    subscriber.listeners.filter((listener) => listener.active).length,
    1,
  );
  await act(async () => subscriber.emit(UID_A, activeEntitlement()));
  assert.equal(renderedState(renderer).status, "authorized");
  const refreshCount = user.getRefreshCount();
  const unchanged = updateBeforePassiveEffects(renderer, { ...props }, true);
  assert.equal(unchanged.status, "authorized");
  await act(async () => undefined);
  assert.equal(user.getRefreshCount(), refreshCount);
  await act(async () => renderer.unmount());
  assert.ok(subscriber.getCleanupCount() >= 1);
}

console.log(
  "PASS: React staff preview gate synchronously invalidates stale authorization",
);
