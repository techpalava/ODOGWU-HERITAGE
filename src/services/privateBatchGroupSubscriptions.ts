import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import type { CustomGroup } from "../types";
import type { PrivateBatchAccessById, PrivateBatchAccessRole } from "../utils/orderContextIdentity";
import {
  createPrivateBatchAccessSession,
  type PrivateBatchAccessSession,
} from "./privateBatchAccessSession";

export interface PrivateBatchMembershipRecord {
  readonly groupId: string;
  readonly memberUid: string;
  readonly role: "member";
}

export interface PrivateBatchSubscriptionSnapshot {
  readonly groups: readonly CustomGroup[];
  readonly accessById: PrivateBatchAccessById;
  readonly privateAccessReady: boolean;
  readonly privateAccessGeneration: number;
  readonly discoveryLifecycleId: number | null;
}

export interface PrivateBatchSubscriptionAdapter {
  subscribePublic(next: (groups: readonly CustomGroup[]) => void, error: (error: Error) => void): () => void;
  subscribeAllForAdmin(next: (groups: readonly CustomGroup[]) => void, error: (error: Error) => void): () => void;
  subscribeOwned(uid: string, next: (groups: readonly CustomGroup[]) => void, error: (error: Error) => void): () => void;
  subscribeMemberships(uid: string, next: (memberships: readonly PrivateBatchMembershipRecord[]) => void, error: (error: Error) => void): () => void;
  subscribeGroup(groupId: string, next: (group: CustomGroup | null) => void, error: (error: Error) => void): () => void;
}

const sortGroups = (groups: Iterable<CustomGroup>): CustomGroup[] =>
  [...groups].sort((left, right) => left.batchId.localeCompare(right.batchId));

const isPrivateGroup = (group: CustomGroup | null): group is CustomGroup =>
  Boolean(group && group.visibility === "PRIVATE");

/**
 * Owns authorization-aligned listeners. Every listener callback is fenced by
 * both a controller generation and an immutable discoveryLifecycleId; a later
 * same-UID controller can never settle an earlier lifecycle's waiter.
 */
export const createPrivateBatchSubscriptionController = ({
  adapter,
  onSnapshot: publish,
  onError = () => undefined,
  accessSession = createPrivateBatchAccessSession(),
}: {
  adapter: PrivateBatchSubscriptionAdapter;
  onSnapshot: (snapshot: PrivateBatchSubscriptionSnapshot) => void;
  onError?: (error: Error) => void;
  accessSession?: PrivateBatchAccessSession;
}) => {
  let controllerGeneration = 0;
  let publicGroups: readonly CustomGroup[] = [];
  let ownedGroups: readonly CustomGroup[] = [];
  let adminGroups: readonly CustomGroup[] | null = null;
  const memberGroups = new Map<string, CustomGroup>();
  const memberGroupUnsubscribers = new Map<string, () => void>();
  let privateUnsubscribers: (() => void)[] = [];
  let publicUnsubscribe: (() => void) | null = null;
  let publicSnapshotReceived = false;
  let hasAuthenticatedIdentity = false;
  let activeUid: string | null = null;
  let activeLifecycleId: number | null = null;
  let ownerSnapshotReceived = false;
  let membershipSnapshotReceived = false;
  let adminSnapshotReceived = false;
  const pendingMemberGroupIds = new Set<string>();

  const unsubscribePrivateDiscovery = () => {
    privateUnsubscribers.forEach((unsubscribe) => unsubscribe());
    privateUnsubscribers = [];
    memberGroupUnsubscribers.forEach((unsubscribe) => unsubscribe());
    memberGroupUnsubscribers.clear();
  };

  const clearPrivateDiscoveryState = () => {
    memberGroups.clear();
    pendingMemberGroupIds.clear();
    ownedGroups = [];
    adminGroups = null;
    ownerSnapshotReceived = false;
    membershipSnapshotReceived = false;
    adminSnapshotReceived = false;
  };

  const privateAccessReady = () =>
    hasAuthenticatedIdentity &&
    publicSnapshotReceived &&
    (adminGroups
      ? adminSnapshotReceived
      : ownerSnapshotReceived &&
        membershipSnapshotReceived &&
        pendingMemberGroupIds.size === 0);

  const emit = () => {
    // Sources remain independent until this point. In particular, a delayed
    // PUBLIC callback may never overwrite a current owner/member/admin
    // PRIVATE record for the same canonical ID.
    const publicById = new Map(publicGroups.map((group) => [group.batchId, group]));
    const ownerById = new Map(ownedGroups.map((group) => [group.batchId, group]));
    const memberById = new Map(memberGroups);
    const adminById = new Map((adminGroups ?? []).map((group) => [group.batchId, group]));
    const allIds = new Set([
      ...publicById.keys(),
      ...ownerById.keys(),
      ...memberById.keys(),
      ...adminById.keys(),
    ]);
    const groupsById = new Map<string, CustomGroup>();
    const accessById: Record<string, PrivateBatchAccessRole | undefined> = {};
    for (const batchId of allIds) {
      const privateSource = [
        [adminById.get(batchId), "admin"],
        [ownerById.get(batchId), "owner"],
        [memberById.get(batchId), "member"],
      ] as const;
      const privateRecord = privateSource.find(
        ([group]) => group?.visibility === "PRIVATE",
      );
      // PRIVATE dominates PUBLIC on a conflict. A later removal from all
      // private sources naturally converges back to the current public source.
      if (privateRecord?.[0]) {
        groupsById.set(batchId, privateRecord[0]);
        accessById[batchId] = privateRecord[1];
        continue;
      }
      const currentPublic = publicById.get(batchId);
      const nonPrivateAuthorized = adminById.get(batchId) ?? ownerById.get(batchId) ?? memberById.get(batchId);
      if (currentPublic?.visibility === "PUBLIC") {
        groupsById.set(batchId, currentPublic);
      } else if (nonPrivateAuthorized) {
        groupsById.set(batchId, nonPrivateAuthorized);
      }
    }
    const snapshot: PrivateBatchSubscriptionSnapshot = {
      groups: sortGroups(groupsById.values()),
      accessById,
      privateAccessReady: privateAccessReady(),
      privateAccessGeneration: accessSession.getGeneration(),
      discoveryLifecycleId: activeLifecycleId,
    };
    if (activeUid && activeLifecycleId !== null) {
      accessSession.publishDiscovery({
        discoveryLifecycleId: activeLifecycleId,
        uid: activeUid,
        groups: snapshot.groups,
        accessById,
        ready: snapshot.privateAccessReady,
      });
    }
    publish(snapshot);
  };

  const clearAuthenticatedSubscriptions = ({ dispose = false } = {}) => {
    const lifecycleId = activeLifecycleId;
    controllerGeneration += 1;
    unsubscribePrivateDiscovery();
    clearPrivateDiscoveryState();
    hasAuthenticatedIdentity = false;
    activeUid = null;
    activeLifecycleId = null;
    if (dispose && lifecycleId !== null) accessSession.disposeDiscovery(lifecycleId);
    emit();
  };

  const failClosedDiscovery = (expectedGeneration: number, error: Error) => {
    if (expectedGeneration !== controllerGeneration) return;
    const lifecycleId = activeLifecycleId;
    controllerGeneration += 1;
    unsubscribePrivateDiscovery();
    clearPrivateDiscoveryState();
    hasAuthenticatedIdentity = true;
    activeLifecycleId = null;
    if (lifecycleId !== null) accessSession.failDiscovery(lifecycleId);
    emit();
    onError(error);
  };

  const startPublic = () => {
    if (publicUnsubscribe) return;
    const expectedGeneration = controllerGeneration;
    const expectedLifecycleId = activeLifecycleId;
    publicUnsubscribe = adapter.subscribePublic(
      (groups) => {
        if (
          expectedGeneration !== controllerGeneration ||
          expectedLifecycleId !== activeLifecycleId
        ) {
          return;
        }
        publicGroups = groups.filter((group) => group.visibility === "PUBLIC");
        publicSnapshotReceived = true;
        emit();
      },
      (error) => onError(error),
    );
  };

  const restartPublic = () => {
    publicUnsubscribe?.();
    publicUnsubscribe = null;
    publicGroups = [];
    publicSnapshotReceived = false;
    startPublic();
  };

  const setIdentity = ({
    uid,
    isAdmin,
    discoveryLifecycleId,
  }: {
    uid: string | null;
    isAdmin: boolean;
    discoveryLifecycleId?: number;
  }) => {
    clearAuthenticatedSubscriptions();
    if (!uid) {
      restartPublic();
      return;
    }
    const lifecycle = discoveryLifecycleId === undefined
      ? accessSession.beginAuthSession(uid)
      : accessSession.getCurrentLifecycle();
    if (
      !lifecycle ||
      lifecycle.uid !== uid ||
      (discoveryLifecycleId !== undefined &&
        lifecycle.discoveryLifecycleId !== discoveryLifecycleId)
    ) {
      return;
    }
    hasAuthenticatedIdentity = true;
    activeUid = uid;
    activeLifecycleId = lifecycle.discoveryLifecycleId;
    restartPublic();
    const expectedGeneration = controllerGeneration;
    const expectedLifecycleId = lifecycle.discoveryLifecycleId;
    const isCurrentCallback = () =>
      expectedGeneration === controllerGeneration &&
      activeLifecycleId === expectedLifecycleId &&
      accessSession.getLifecycleStatus(expectedLifecycleId) !== "DISPOSED" &&
      accessSession.getLifecycleStatus(expectedLifecycleId) !== "SUPERSEDED";
    const guardedError = (error: Error) =>
      failClosedDiscovery(expectedGeneration, error);
    emit();

    if (isAdmin) {
      privateUnsubscribers.push(
        adapter.subscribeAllForAdmin(
          (groups) => {
            if (!isCurrentCallback()) return;
            adminGroups = groups;
            adminSnapshotReceived = true;
            accessSession.invalidate();
            emit();
          },
          guardedError,
        ),
      );
      return;
    }

    privateUnsubscribers.push(
      adapter.subscribeOwned(
        uid,
        (groups) => {
          if (!isCurrentCallback()) return;
          ownedGroups = groups.filter((group) => group.ownerUid === uid);
          ownerSnapshotReceived = true;
          accessSession.invalidate();
          emit();
        },
        guardedError,
      ),
      adapter.subscribeMemberships(
        uid,
        (memberships) => {
          if (!isCurrentCallback()) return;
          membershipSnapshotReceived = true;
          const desiredGroupIds = new Set(
            memberships
              .filter(
                (membership) =>
                  membership.memberUid === uid &&
                  membership.role === "member" &&
                  membership.groupId.trim().length > 0,
              )
              .map((membership) => membership.groupId),
          );
          memberGroupUnsubscribers.forEach((unsubscribe, groupId) => {
            if (desiredGroupIds.has(groupId)) return;
            unsubscribe();
            memberGroupUnsubscribers.delete(groupId);
            memberGroups.delete(groupId);
            pendingMemberGroupIds.delete(groupId);
          });
          desiredGroupIds.forEach((groupId) => {
            if (memberGroupUnsubscribers.has(groupId)) return;
            pendingMemberGroupIds.add(groupId);
            const unsubscribe = adapter.subscribeGroup(
              groupId,
              (group) => {
                if (!isCurrentCallback()) return;
                if (isPrivateGroup(group) && group.batchId === groupId) {
                  memberGroups.set(groupId, group);
                } else {
                  memberGroups.delete(groupId);
                }
                pendingMemberGroupIds.delete(groupId);
                accessSession.invalidate();
                emit();
              },
              guardedError,
            );
            memberGroupUnsubscribers.set(groupId, unsubscribe);
          });
          accessSession.invalidate();
          emit();
        },
        guardedError,
      ),
    );
  };

  const dispose = () => {
    // Even an already-failed lifecycle may have produced a capability before
    // it failed; disposal is always a continuation invalidation boundary.
    accessSession.invalidate();
    clearAuthenticatedSubscriptions({ dispose: true });
    publicUnsubscribe?.();
    publicUnsubscribe = null;
    publicGroups = [];
    publicSnapshotReceived = false;
    emit();
  };

  return {
    startPublic,
    setIdentity,
    dispose,
  };
};

const toGroup = (id: string, data: Record<string, unknown>): CustomGroup =>
  ({ id, ...data } as unknown as CustomGroup);

export const createFirestorePrivateBatchSubscriptionAdapter = (
  db: Firestore,
): PrivateBatchSubscriptionAdapter => ({
  subscribePublic: (next, error) =>
    onSnapshot(
      query(collection(db, "customGroups"), where("visibility", "==", "PUBLIC")),
      (snapshot) => next(snapshot.docs.map((item) => toGroup(item.id, item.data()))),
      error,
    ),
  subscribeAllForAdmin: (next, error) =>
    onSnapshot(
      collection(db, "customGroups"),
      (snapshot) => next(snapshot.docs.map((item) => toGroup(item.id, item.data()))),
      error,
    ),
  subscribeOwned: (uid, next, error) =>
    onSnapshot(
      query(collection(db, "customGroups"), where("ownerUid", "==", uid)),
      (snapshot) => next(snapshot.docs.map((item) => toGroup(item.id, item.data()))),
      error,
    ),
  subscribeMemberships: (uid, next, error) =>
    onSnapshot(
      query(
        collectionGroup(db, "privateBatchMembers"),
        where("memberUid", "==", uid),
        where("role", "==", "member"),
      ),
      (snapshot) =>
        next(
          snapshot.docs
            .map((item) => ({
              groupId: item.ref.parent.parent?.id || "",
              memberUid: item.data().memberUid,
              role: item.data().role,
            }))
            .filter(
              (record): record is PrivateBatchMembershipRecord =>
                record.role === "member" &&
                typeof record.memberUid === "string" &&
                typeof record.groupId === "string",
            ),
        ),
      error,
    ),
  subscribeGroup: (groupId, next, error) =>
    onSnapshot(
      doc(db, "customGroups", groupId),
      (snapshot) => next(snapshot.exists() ? toGroup(snapshot.id, snapshot.data()) : null),
      error,
    ),
});
