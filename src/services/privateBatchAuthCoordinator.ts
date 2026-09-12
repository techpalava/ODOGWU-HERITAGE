import type {
  PrivateBatchAccessSession,
  PrivateBatchDiscoveryAnchor,
  PrivateBatchDiscoveryLifecycle,
} from "./privateBatchAccessSession";

export interface PrivateBatchTokenUser {
  readonly uid: string;
  readonly isAnonymous: boolean;
  getIdTokenResult(): Promise<Readonly<{ claims: Readonly<Record<string, unknown>> }>>;
}

export interface PrivateBatchIdentityTarget {
  setIdentity(identity: {
    uid: string | null;
    isAdmin: boolean;
    discoveryLifecycleId?: number;
  }): void;
}

export type PrivateBatchTokenSubscription = (
  listener: (user: PrivateBatchTokenUser | null) => void,
) => () => void;

interface ActivePrivateBatchIdentity {
  readonly uid: string;
  readonly isAdmin: boolean;
  readonly lifecycle: PrivateBatchDiscoveryLifecycle;
}

/**
 * Token events synchronously revoke prior capability. The explicit ensure
 * method covers Firebase's valid no-event forced-refresh path by starting a
 * real controller lifecycle only when the token event did not already do so.
 */
export const createPrivateBatchAuthCoordinator = ({
  getTarget,
  getCurrentUser,
  onClaimError = () => undefined,
  accessSession,
}: {
  getTarget: () => PrivateBatchIdentityTarget | null;
  getCurrentUser: () => Pick<PrivateBatchTokenUser, "uid" | "isAnonymous"> | null;
  onClaimError?: (error: unknown) => void;
  accessSession: PrivateBatchAccessSession;
}) => {
  let tokenEventSequence = 0;
  let activeIdentity: ActivePrivateBatchIdentity | null = null;

  const publishIdentity = (identity: ActivePrivateBatchIdentity) => {
    const unchanged =
      activeIdentity?.uid === identity.uid &&
      activeIdentity.isAdmin === identity.isAdmin &&
      activeIdentity.lifecycle.authSessionId === identity.lifecycle.authSessionId &&
      activeIdentity.lifecycle.discoveryLifecycleId ===
        identity.lifecycle.discoveryLifecycleId;
    activeIdentity = identity;
    // The common claim result (admin=false) confirms the already-installed
    // ordinary listener set. Rebinding it would clear a valid in-flight
    // lifecycle for no authority change.
    if (unchanged) return;
    getTarget()?.setIdentity({
      uid: identity.uid,
      isAdmin: identity.isAdmin,
      discoveryLifecycleId: identity.lifecycle.discoveryLifecycleId,
    });
  };

  const synchronize = (firebaseUser: PrivateBatchTokenUser | null) => {
    const sequence = ++tokenEventSequence;
    const uid = firebaseUser && !firebaseUser.isAnonymous ? firebaseUser.uid : null;
    const lifecycle = accessSession.beginAuthSession(uid);
    // Clear the prior controller subscriptions after the old lifecycle was
    // settled by the store-lifetime session. This remains synchronous.
    getTarget()?.setIdentity({ uid: null, isAdmin: false });
    activeIdentity = null;
    if (!firebaseUser || firebaseUser.isAnonymous || !lifecycle) return;

    publishIdentity({ uid: firebaseUser.uid, isAdmin: false, lifecycle });
    void firebaseUser
      .getIdTokenResult()
      .then(({ claims }) => {
        const currentUser = getCurrentUser();
        const currentLifecycle = accessSession.getCurrentLifecycle();
        if (
          sequence !== tokenEventSequence ||
          currentUser?.uid !== firebaseUser.uid ||
          currentUser.isAnonymous ||
          currentLifecycle?.authSessionId !== lifecycle.authSessionId ||
          currentLifecycle.discoveryLifecycleId !== lifecycle.discoveryLifecycleId
        ) {
          return;
        }
        publishIdentity({
          uid: firebaseUser.uid,
          isAdmin: claims.admin === true,
          lifecycle,
        });
      })
      .catch((error: unknown) => {
        const currentLifecycle = accessSession.getCurrentLifecycle();
        if (
          sequence !== tokenEventSequence ||
          currentLifecycle?.authSessionId !== lifecycle.authSessionId ||
          currentLifecycle.discoveryLifecycleId !== lifecycle.discoveryLifecycleId
        ) {
          return;
        }
        accessSession.failDiscovery(lifecycle.discoveryLifecycleId);
        activeIdentity = null;
        getTarget()?.setIdentity({ uid: null, isAdmin: false });
        onClaimError(error);
      });
  };

  const ensureFreshPrivateDiscoveryForCurrentSession = ({
    uid,
    anchor,
  }: {
    uid: string;
    anchor: PrivateBatchDiscoveryAnchor;
  }): PrivateBatchDiscoveryLifecycle | null => {
    const currentUser = getCurrentUser();
    const current = accessSession.getCurrentLifecycle();
    if (
      !currentUser ||
      currentUser.isAnonymous ||
      currentUser.uid !== uid ||
      !activeIdentity ||
      activeIdentity.uid !== uid
    ) {
      return null;
    }
    // A token event (or another same-session operation) may already have
    // begun a newer lifecycle. Reuse only that exact lifecycle; never a
    // generation guess and never a lifecycle for a different session/UID.
    if (
      current &&
      current.uid === uid &&
      // beginAuthSession increments authSessionId. A different lifecycle in
      // the same session can be an ordinary listener/data rollover, not the
      // token event this operation just refreshed; start an explicit cycle in
      // that case rather than accepting an unrelated result.
       current.authSessionId !== anchor.authSessionId &&
      current.discoveryLifecycleId !== anchor.discoveryLifecycleId
    ) {
      return current;
    }

    const target = getTarget();
    if (!target) return null;
    const lifecycle = accessSession.startDiscoveryForCurrentSession(uid);
    if (!lifecycle) return null;
    publishIdentity({
      uid,
      isAdmin: activeIdentity.isAdmin,
      lifecycle,
    });
    return lifecycle;
  };

  return {
    synchronize,
    ensureFreshPrivateDiscoveryForCurrentSession,
    getDiscoveryAnchor: (): PrivateBatchDiscoveryAnchor =>
      accessSession.getDiscoveryAnchor(),
    bindTokenChanges: (subscribe: PrivateBatchTokenSubscription) =>
      subscribe(synchronize),
  };
};
