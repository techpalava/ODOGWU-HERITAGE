import { useEffect, useMemo, useState } from "react";
import {
  createStaffPreviewAuthorizationContext,
  createStaffPreviewClientGateController,
  isSameStaffPreviewAuthorizationContext,
  type StaffPreviewAuthorizationContext,
  type StaffPreviewEntitlementSubscriber,
  type StaffPreviewGateFirebaseUser,
} from "../services/staffPreviewClientGateService";
import type {
  StaffPreviewClientGateState,
  StaffPreviewGateApplicationCustomer,
} from "../security/staffPreviewClientGate";
import { resolveStaffPreviewGateIdentity } from "../security/staffPreviewClientGate";

interface PublishedStaffPreviewState {
  state: StaffPreviewClientGateState;
  context: StaffPreviewAuthorizationContext | null;
}

export const useStaffPreviewClientGate = ({
  featureFlagValue,
  firebaseUser,
  applicationCustomer,
  subscribeEntitlement,
}: {
  featureFlagValue: unknown;
  firebaseUser: StaffPreviewGateFirebaseUser | null;
  applicationCustomer: StaffPreviewGateApplicationCustomer | null;
  subscribeEntitlement: StaffPreviewEntitlementSubscriber;
}): StaffPreviewClientGateState => {
  const [published, setPublished] = useState<PublishedStaffPreviewState>({
    state: { status: "disabled", reason: "FEATURE_FLAG_DISABLED" },
    context: null,
  });
  const controller = useMemo(
    () =>
      createStaffPreviewClientGateController({
        subscribeEntitlement,
        onStateChange: (state, context) => setPublished({ state, context }),
      }),
    [subscribeEntitlement],
  );

  useEffect(() => {
    void controller.evaluate({
      featureFlagValue,
      firebaseUser,
      applicationCustomer,
    });
    return () => controller.cancel();
  }, [
    applicationCustomer?.canonicalEmail,
    applicationCustomer?.email,
    applicationCustomer?.ownerUid,
    controller,
    featureFlagValue,
    firebaseUser?.email,
    firebaseUser?.isAnonymous,
    firebaseUser?.uid,
  ]);

  const currentContext = createStaffPreviewAuthorizationContext(
    { featureFlagValue, firebaseUser, applicationCustomer },
    controller.getControllerIdentity(),
  );
  if (
    published.context === null ||
    !isSameStaffPreviewAuthorizationContext(published.context, currentContext)
  ) {
    return resolveStaffPreviewGateIdentity({
      featureFlagValue,
      firebaseUser,
      applicationCustomer,
    });
  }

  return published.state;
};
