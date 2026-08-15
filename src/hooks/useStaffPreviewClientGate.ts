import { useEffect, useMemo, useState } from "react";
import {
  createStaffPreviewClientGateController,
  type StaffPreviewEntitlementSubscriber,
  type StaffPreviewGateFirebaseUser,
} from "../services/staffPreviewClientGateService";
import type {
  StaffPreviewClientGateState,
  StaffPreviewGateApplicationCustomer,
} from "../security/staffPreviewClientGate";

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
  const [state, setState] = useState<StaffPreviewClientGateState>({
    status: "disabled",
    reason: "FEATURE_FLAG_DISABLED",
  });
  const controller = useMemo(
    () =>
      createStaffPreviewClientGateController({
        subscribeEntitlement,
        onStateChange: setState,
      }),
    [subscribeEntitlement],
  );

  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    void controller.evaluate({
      featureFlagValue,
      firebaseUser,
      applicationCustomer,
    });
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

  return state;
};
