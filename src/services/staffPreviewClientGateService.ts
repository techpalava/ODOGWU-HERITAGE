import { doc, onSnapshot, type Firestore } from "firebase/firestore";
import {
  STAFF_PREVIEW_CLAIM_KEY,
  STAFF_PREVIEW_ENTITLEMENT_COLLECTION,
  normalizeStaffPreviewClaim,
} from "../security/staffPreviewEntitlement";
import {
  parseStaffPreviewFeatureFlag,
  resolveStaffPreviewClientAuthorization,
  resolveStaffPreviewGateIdentity,
  type StaffPreviewClientGateState,
  type StaffPreviewGateApplicationCustomer,
  type StaffPreviewGateFirebaseIdentity,
} from "../security/staffPreviewClientGate";
import { getCanonicalEmail } from "../security/authIdentity";

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

export interface StaffPreviewAuthorizationContext {
  featureFlagEnabled: boolean;
  firebaseIdentity: {
    uid: string | null;
    isAnonymous: boolean | null;
    canonicalEmail: string | null;
  };
  applicationCustomerIdentity: {
    uid: string | null;
    canonicalEmail: string | null;
  };
  controllerIdentity: symbol;
}

const canonicalEmailOrNull = (email?: string | null): string | null =>
  getCanonicalEmail(email || undefined) || null;

export const createStaffPreviewAuthorizationContext = (
  {
    featureFlagValue,
    firebaseUser,
    applicationCustomer,
  }: StaffPreviewGateEvaluationInput,
  controllerIdentity: symbol,
): StaffPreviewAuthorizationContext => ({
  featureFlagEnabled: parseStaffPreviewFeatureFlag(featureFlagValue),
  firebaseIdentity: {
    uid: firebaseUser?.uid || null,
    isAnonymous: firebaseUser?.isAnonymous ?? null,
    canonicalEmail: canonicalEmailOrNull(firebaseUser?.email),
  },
  applicationCustomerIdentity: {
    uid: applicationCustomer?.ownerUid || null,
    canonicalEmail: canonicalEmailOrNull(
      applicationCustomer?.canonicalEmail || applicationCustomer?.email,
    ),
  },
  controllerIdentity,
});

export const isSameStaffPreviewAuthorizationContext = (
  left: StaffPreviewAuthorizationContext,
  right: StaffPreviewAuthorizationContext,
): boolean =>
  left.featureFlagEnabled === right.featureFlagEnabled &&
  left.firebaseIdentity.uid === right.firebaseIdentity.uid &&
  left.firebaseIdentity.isAnonymous === right.firebaseIdentity.isAnonymous &&
  left.firebaseIdentity.canonicalEmail ===
    right.firebaseIdentity.canonicalEmail &&
  left.applicationCustomerIdentity.uid ===
    right.applicationCustomerIdentity.uid &&
  left.applicationCustomerIdentity.canonicalEmail ===
    right.applicationCustomerIdentity.canonicalEmail &&
  left.controllerIdentity === right.controllerIdentity;

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
  onStateChange: (
    state: StaffPreviewClientGateState,
    context: StaffPreviewAuthorizationContext,
  ) => void;
}) => {
  const controllerIdentity = Symbol("staff-preview-client-gate-controller");
  let generation = 0;
  let disposed = false;
  let unsubscribe: (() => void) | null = null;
  let context: StaffPreviewAuthorizationContext | null = null;
  let state: StaffPreviewClientGateState = {
    status: "disabled",
    reason: "FEATURE_FLAG_DISABLED",
  };

  const publish = (
    next: StaffPreviewClientGateState,
    nextContext: StaffPreviewAuthorizationContext,
  ) => {
    if (disposed) return;
    state = next;
    context = nextContext;
    onStateChange(next, nextContext);
  };
  const invalidate = () => {
    generation += 1;
    unsubscribe?.();
    unsubscribe = null;
    return generation;
  };
  const isCurrent = (
    requestGeneration: number,
    requestContext: StaffPreviewAuthorizationContext,
  ) =>
    !disposed &&
    requestGeneration === generation &&
    context !== null &&
    isSameStaffPreviewAuthorizationContext(context, requestContext);

  const evaluate = async ({
    featureFlagValue,
    firebaseUser,
    applicationCustomer,
  }: StaffPreviewGateEvaluationInput): Promise<void> => {
    const requestContext = createStaffPreviewAuthorizationContext(
      { featureFlagValue, firebaseUser, applicationCustomer },
      controllerIdentity,
    );
    const requestGeneration = invalidate();
    const identity = resolveStaffPreviewGateIdentity({
      featureFlagValue,
      firebaseUser,
      applicationCustomer,
    });
    publish(identity, requestContext);
    if (identity.status !== "checking" || !firebaseUser) return;

    const uid = firebaseUser.uid;
    publish(
      {
        status: "checking",
        reason: "TOKEN_REFRESH_IN_PROGRESS",
        uid,
      },
      requestContext,
    );
    let claim: unknown | null;
    try {
      const token = await firebaseUser.getIdTokenResult(true);
      if (!isCurrent(requestGeneration, requestContext)) return;
      claim = token.claims[STAFF_PREVIEW_CLAIM_KEY] ?? null;
    } catch {
      if (isCurrent(requestGeneration, requestContext)) {
        publish(
          { status: "error", reason: "TOKEN_REFRESH_FAILED", uid },
          requestContext,
        );
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
        requestContext,
      );
      return;
    }

    publish(
      { status: "checking", reason: "ENTITLEMENT_LOADING", uid },
      requestContext,
    );
    try {
      const listenerUnsubscribe = subscribeEntitlement(
        uid,
        (entitlement) => {
          if (!isCurrent(requestGeneration, requestContext)) return;
          publish(
            resolveStaffPreviewClientAuthorization({
              featureFlagValue,
              firebaseUser,
              applicationCustomer,
              claim,
              entitlement,
            }),
            requestContext,
          );
        },
        () => {
          if (isCurrent(requestGeneration, requestContext)) {
            invalidate();
            publish(
              {
                status: "error",
                reason: "ENTITLEMENT_LISTENER_FAILED",
                uid,
              },
              requestContext,
            );
          }
        },
      );
      if (isCurrent(requestGeneration, requestContext)) {
        unsubscribe = listenerUnsubscribe;
      } else {
        listenerUnsubscribe();
      }
    } catch {
      if (isCurrent(requestGeneration, requestContext)) {
        invalidate();
        publish(
          {
            status: "error",
            reason: "ENTITLEMENT_LISTENER_FAILED",
            uid,
          },
          requestContext,
        );
      }
    }
  };

  const dispose = () => {
    if (disposed) return;
    invalidate();
    disposed = true;
  };

  const cancel = () => {
    if (disposed) return;
    invalidate();
  };

  return {
    evaluate,
    cancel,
    dispose,
    getState: () => state,
    getGeneration: () => generation,
    getControllerIdentity: () => controllerIdentity,
  };
};
