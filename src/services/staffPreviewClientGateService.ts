import { doc, onSnapshot, type Firestore } from "firebase/firestore";
import {
  STAFF_PREVIEW_CLAIM_KEY,
  STAFF_PREVIEW_ENTITLEMENT_COLLECTION,
  normalizeStaffPreviewClaim,
} from "../security/staffPreviewEntitlement";
import {
  resolveStaffPreviewClientAuthorization,
  resolveStaffPreviewGateIdentity,
  type StaffPreviewClientGateState,
  type StaffPreviewGateApplicationCustomer,
  type StaffPreviewGateFirebaseIdentity,
} from "../security/staffPreviewClientGate";

export interface StaffPreviewGateFirebaseUser
  extends StaffPreviewGateFirebaseIdentity {
  getIdTokenResult(forceRefresh?: boolean): Promise<{
    claims: Readonly<Record<string, unknown>>;
  }>;
}

export type StaffPreviewEntitlementSubscriber = (
  uid: string,
  onValue: (value: unknown | null) => void,
  onError: () => void,
) => () => void;

export interface StaffPreviewGateEvaluationInput {
  featureFlagValue: unknown;
  firebaseUser: StaffPreviewGateFirebaseUser | null;
  applicationCustomer: StaffPreviewGateApplicationCustomer | null;
}

export const createFirebaseStaffPreviewEntitlementSubscriber = (
  db: Firestore,
): StaffPreviewEntitlementSubscriber =>
  (uid, onValue, onError) =>
    onSnapshot(
      doc(db, STAFF_PREVIEW_ENTITLEMENT_COLLECTION, uid),
      (snapshot) => onValue(snapshot.exists() ? snapshot.data() : null),
      () => onError(),
    );

export const createStaffPreviewClientGateController = ({
  subscribeEntitlement,
  onStateChange,
}: {
  subscribeEntitlement: StaffPreviewEntitlementSubscriber;
  onStateChange: (state: StaffPreviewClientGateState) => void;
}) => {
  let generation = 0;
  let disposed = false;
  let unsubscribe: (() => void) | null = null;
  let state: StaffPreviewClientGateState = {
    status: "disabled",
    reason: "FEATURE_FLAG_DISABLED",
  };

  const publish = (next: StaffPreviewClientGateState) => {
    if (disposed) return;
    state = next;
    onStateChange(next);
  };
  const invalidate = () => {
    generation += 1;
    unsubscribe?.();
    unsubscribe = null;
    return generation;
  };
  const isCurrent = (requestGeneration: number, uid: string) =>
    !disposed &&
    requestGeneration === generation &&
    "uid" in state &&
    state.uid === uid;

  const evaluate = async ({
    featureFlagValue,
    firebaseUser,
    applicationCustomer,
  }: StaffPreviewGateEvaluationInput): Promise<void> => {
    const requestGeneration = invalidate();
    const identity = resolveStaffPreviewGateIdentity({
      featureFlagValue,
      firebaseUser,
      applicationCustomer,
    });
    publish(identity);
    if (identity.status !== "checking" || !firebaseUser) return;

    const uid = firebaseUser.uid;
    publish({
      status: "checking",
      reason: "TOKEN_REFRESH_IN_PROGRESS",
      uid,
    });
    let claim: unknown | null;
    try {
      const token = await firebaseUser.getIdTokenResult(true);
      if (!isCurrent(requestGeneration, uid)) return;
      claim = token.claims[STAFF_PREVIEW_CLAIM_KEY] ?? null;
    } catch {
      if (isCurrent(requestGeneration, uid)) {
        publish({ status: "error", reason: "TOKEN_REFRESH_FAILED", uid });
      }
      return;
    }

    if (claim === null || !normalizeStaffPreviewClaim(claim).valid) {
      publish(
        resolveStaffPreviewClientAuthorization({
          featureFlagValue,
          firebaseUser,
          applicationCustomer,
          claim,
          entitlement: null,
        }),
      );
      return;
    }

    publish({ status: "checking", reason: "ENTITLEMENT_LOADING", uid });
    try {
      const listenerUnsubscribe = subscribeEntitlement(
        uid,
        (entitlement) => {
          if (!isCurrent(requestGeneration, uid)) return;
          publish(
            resolveStaffPreviewClientAuthorization({
              featureFlagValue,
              firebaseUser,
              applicationCustomer,
              claim,
              entitlement,
            }),
          );
        },
        () => {
          if (isCurrent(requestGeneration, uid)) {
            invalidate();
            publish({
              status: "error",
              reason: "ENTITLEMENT_LISTENER_FAILED",
              uid,
            });
          }
        },
      );
      if (isCurrent(requestGeneration, uid)) {
        unsubscribe = listenerUnsubscribe;
      } else {
        listenerUnsubscribe();
      }
    } catch {
      if (isCurrent(requestGeneration, uid)) {
        invalidate();
        publish({
          status: "error",
          reason: "ENTITLEMENT_LISTENER_FAILED",
          uid,
        });
      }
    }
  };

  const dispose = () => {
    if (disposed) return;
    invalidate();
    disposed = true;
  };

  return {
    evaluate,
    dispose,
    getState: () => state,
    getGeneration: () => generation,
  };
};
