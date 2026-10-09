/**
 * Shared fixture for the B1 cross-card tick tests: two people (Fred, Nol), both
 * Male fit, with distinct shared-body and garment values. Fred owns the shirt;
 * Nol optionally owns the trouser.
 */
import type {
  CustomDetailSelectionGroup,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  WearerOrderStateV2,
} from "./src/types";
import { setFutureMeasurementInput } from "./src/utils/measurementBlueprint";
import {
  addWearer,
  assignGarmentToWearer,
  createEmptyWearerOrder,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
  renameWearer,
  setWearerFitContext,
  setWearerMeasurementRoute,
  updateWearerMeasurement,
} from "./src/utils/wearerOrder";

const construction = (
  garmentType: "shirt" | "trouser",
  optionId: string,
  selectionGroup: CustomDetailSelectionGroup,
) => ({
  status: "resolved" as const,
  garmentType,
  components: [{
    componentKey: `${garmentType}:${selectionGroup}:${optionId}`,
    optionId,
    selectionGroup,
    priceCents: 1,
    price: 0.01,
  }],
  totalPriceCents: 1,
  totalPrice: 0.01,
});

export const crossCardSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: null,
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
    trouser: construction("trouser", "trouser_std", "trouser_fastening"),
  },
} as GarmentTypeStepSelection;

export const crossCardGarments = [
  { garmentKey: "base:shirt", garmentType: "shirt" as const },
  { garmentKey: "base:trouser", garmentType: "trouser" as const },
];

export const crossCardGarmentLabels: Record<string, string> = {
  "base:shirt": "Shirt",
  "base:trouser": "Trouser",
};

export const reconcileCrossCard = (order: WearerOrderStateV2): WearerOrderStateV2 =>
  reconcileWearerOrder({
    order,
    garmentKeys: crossCardGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: null,
    garments: crossCardGarments,
    garmentTypeSelection: crossCardSelection,
  });

const updatedOrder = (result: { status: string; order: WearerOrderStateV2 }) => {
  if (result.status !== "updated") throw new Error(`fixture mutation ${result.status}`);
  return result.order;
};

/** The low-risk entered bag (shared body + per-garment) as a comparable string. */
export const enteredFingerprint = (measurement: FutureMeasurementStateV1 | undefined): string => {
  const bag = measurement?.enteredByRoute?.low_risk || measurement?.entered;
  return JSON.stringify({
    shared: bag?.shared || {},
    byGarmentKey: bag?.byGarmentKey || {},
  });
};

export const buildCrossCardFixture = ({ nolOwnsTrouser }: { nolOwnsTrouser: boolean }) => {
  let order = reconcileCrossCard(createEmptyWearerOrder());
  const fredId = order.wearers[0].wearerId;
  order = reconcileCrossCard(updatedOrder(setWearerFitContext(order, fredId, "male")));
  order = updatedOrder(renameWearer(order, fredId, "Fred"));
  order = updatedOrder(addWearer({
    order,
    physicalGarmentCount: crossCardGarments.length,
    displayName: "Nol",
    fitContext: "male",
  }));
  const nolId = order.wearers.find((wearer) => wearer.wearerId !== fredId)!.wearerId;
  const assign = (garmentKey: string, wearerId: string) => {
    order = updatedOrder(assignGarmentToWearer({
      order,
      garmentKey,
      wearerId,
      garment: crossCardGarments.find((garment) => garment.garmentKey === garmentKey)!,
      garmentTypeSelection: crossCardSelection,
    }));
  };
  assign("base:shirt", fredId);
  if (nolOwnsTrouser) assign("base:trouser", nolId);
  order = setWearerMeasurementRoute(order, fredId, "low_risk");
  order = setWearerMeasurementRoute(order, nolId, "low_risk");
  const runtimes = planWearerOrderMeasurements({
    order,
    garmentTypeSelection: crossCardSelection,
    physicalGarments: crossCardGarments,
  });
  const fredPlan = runtimes.find((runtime) => runtime.wearerId === fredId)!.plan;
  const shared = fredPlan.requirements.find(
    (requirement) => requirement.scope === "shared" && requirement.directInput,
  )!;
  const fredGarment = fredPlan.requirements.find(
    (requirement) => requirement.scope === "garment" && requirement.directInput,
  )!;
  let fred = order.wearers.find((wearer) => wearer.wearerId === fredId)!.measurement;
  fred = setFutureMeasurementInput({ state: fred, requirement: shared, displayValue: 101 });
  fred = setFutureMeasurementInput({ state: fred, requirement: fredGarment, displayValue: 71 });
  let nol = order.wearers.find((wearer) => wearer.wearerId === nolId)!.measurement;
  nol = setFutureMeasurementInput({ state: nol, requirement: shared, displayValue: 88 });
  if (nolOwnsTrouser) {
    const nolPlan = runtimes.find((runtime) => runtime.wearerId === nolId)!.plan;
    const nolGarment = nolPlan.requirements.find(
      (requirement) =>
        requirement.scope === "garment" &&
        requirement.directInput &&
        requirement.garmentKey === "base:trouser",
    )!;
    nol = setFutureMeasurementInput({ state: nol, requirement: nolGarment, displayValue: 55 });
  }
  order = updateWearerMeasurement(updateWearerMeasurement(order, fredId, fred), nolId, nol);
  return { order, fredId, nolId, fred, nol };
};
