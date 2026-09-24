import assert from "node:assert/strict";
import { MAX_CONFIGURED_ACTIVE_WEARERS, resolveActiveWearerCap } from "./src/config/WearerPolicy";
import type { CustomDetailSelectionGroup, FutureMeasurementStateV1, GarmentTypeStepSelection } from "./src/types";
import { createEmptyFutureMeasurementState } from "./src/utils/measurementBlueprint";
import {
  addWearer,
  assignGarmentToWearer,
  classifyPersistedMeasurement,
  createEmptyWearerOrder,
  createWearerProfile,
  deleteWearer,
  isWearerOrderMeasurementComplete,
  liftLegacyMeasurementToWearerOrder,
  normalizeWearerOrderState,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
  removeGarmentFromWearerOrder,
  renameWearer,
  reorderWearers,
} from "./src/utils/wearerOrder";

const construction = (
  garmentType: keyof GarmentTypeStepSelection["constructionByGarment"],
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

const selection = (
  demographic: GarmentTypeStepSelection["demographic"],
): GarmentTypeStepSelection => ({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic,
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
    trouser: construction("trouser", "trouser_std", "trouser_fastening"),
    dress: construction("dress", "dress_std_short", "dress_construction"),
  },
});

const garments = [
  { garmentKey: "base:shirt", garmentType: "shirt" as const },
  { garmentKey: "base:trouser", garmentType: "trouser" as const },
  { garmentKey: "base:dress", garmentType: "dress" as const },
  { garmentKey: "additional:shirt:1", garmentType: "shirt" as const },
];

const keys = garments.map((garment) => garment.garmentKey);

assert.equal(resolveActiveWearerCap(11), MAX_CONFIGURED_ACTIVE_WEARERS);
assert.equal(resolveActiveWearerCap(3), 3);
assert.equal(resolveActiveWearerCap(0), 0);

const maleOrder = reconcileWearerOrder({
  order: createEmptyWearerOrder(),
  garmentKeys: keys,
  compatibilityDemographic: "male",
  garments,
  garmentTypeSelection: selection("male"),
});
assert.equal(maleOrder.wearers.length, 1);
assert.equal(maleOrder.wearers[0].displayName, "You");
assert.equal(maleOrder.wearers[0].fitContext, "male");
assert.equal(maleOrder.assignmentByGarmentKey["base:shirt"], maleOrder.wearers[0].wearerId);
assert.equal(maleOrder.assignmentByGarmentKey["base:dress"], undefined);

const renamed = renameWearer(maleOrder, maleOrder.wearers[0].wearerId, "Amaka");
assert.equal(renamed.status, "updated");
if (renamed.status === "updated") {
  assert.equal(renamed.order.wearers[0].wearerId, maleOrder.wearers[0].wearerId);
  assert.equal(renamed.order.assignmentByGarmentKey["base:shirt"], maleOrder.wearers[0].wearerId);
}

const added = addWearer({
  order: maleOrder,
  physicalGarmentCount: keys.length,
  displayName: "Friend",
  fitContext: "female",
});
assert.equal(added.status, "updated");
if (added.status !== "updated") throw new Error("expected second wearer");
const friend = added.order.wearers.find((wearer) => wearer.displayName === "Friend");
assert.ok(friend);
const blockedDress = assignGarmentToWearer({
  order: added.order,
  garmentKey: "base:dress",
  wearerId: maleOrder.wearers[0].wearerId,
  garment: garments[2],
  garmentTypeSelection: selection("male"),
});
assert.equal(blockedDress.status, "blocked");
const assignedDress = assignGarmentToWearer({
  order: added.order,
  garmentKey: "base:dress",
  wearerId: friend!.wearerId,
  garment: garments[2],
  garmentTypeSelection: selection("unisex"),
});
assert.equal(assignedDress.status, "updated");

const withLength = {
  ...assignedDress.order,
  wearers: assignedDress.order.wearers.map((wearer) => {
    if (wearer.wearerId !== maleOrder.wearers[0].wearerId) return wearer;
    const measurement = structuredClone(wearer.measurement);
    measurement.entered.byGarmentKey["base:shirt"] = {
      shirt_length: { valueCm: 50, provenance: "customer_entered" },
    };
    return { ...wearer, measurement };
  }),
};
const moved = assignGarmentToWearer({
  order: withLength,
  garmentKey: "base:shirt",
  wearerId: friend!.wearerId,
  garment: garments[0],
  garmentTypeSelection: selection("unisex"),
});
assert.equal(moved.status, "updated");
if (moved.status === "updated") {
  const source = moved.order.wearers.find((wearer) => wearer.wearerId === maleOrder.wearers[0].wearerId);
  const target = moved.order.wearers.find((wearer) => wearer.wearerId === friend!.wearerId);
  assert.equal(source?.measurement.entered.byGarmentKey["base:shirt"], undefined);
  assert.equal(target?.measurement.entered.byGarmentKey["base:shirt"], undefined);
  assert.equal(moved.order.assignmentByGarmentKey["base:shirt"], friend!.wearerId);
}

const deleteBlocked = deleteWearer(moved.order, friend!.wearerId);
assert.equal(deleteBlocked.status, "blocked");
if (deleteBlocked.status === "blocked") {
  assert.equal(deleteBlocked.code, "WEARER_OWNS_GARMENTS");
}

const removed = removeGarmentFromWearerOrder(moved.order, "base:dress");
assert.equal(removed.assignmentByGarmentKey["base:dress"], undefined);
assert.equal(removed.assignmentByGarmentKey["base:trouser"], maleOrder.wearers[0].wearerId);

const reordered = reorderWearers(
  added.order,
  [friend!.wearerId, maleOrder.wearers[0].wearerId],
);
assert.equal(reordered.status, "updated");
if (reordered.status === "updated") {
  const friendAfter = reordered.order.wearers.find((wearer) => wearer.wearerId === friend!.wearerId);
  assert.equal(friendAfter?.presentationOrder, 0);
  assert.equal(friendAfter?.wearerId, friend!.wearerId);
}

const legacy = createEmptyFutureMeasurementState("low_risk");
legacy.entered.shared.total_height = { valueCm: 180, provenance: "customer_entered" };
const lifted = liftLegacyMeasurementToWearerOrder({
  measurement: legacy,
  garmentKeys: ["base:shirt"],
  compatibilityDemographic: "male",
});
assert.equal(lifted.wearers.length, 1);
assert.equal(lifted.wearers[0].measurement.entered.shared.total_height.valueCm, 180);
const second = addWearer({
  order: lifted,
  physicalGarmentCount: 2,
  displayName: "Friend",
  fitContext: "female",
});
if (second.status === "updated") {
  const created = second.order.wearers.find((wearer) => wearer.displayName === "Friend");
  assert.equal(created?.measurement.entered.shared.total_height, undefined);
}

const invalid = classifyPersistedMeasurement({
  value: { schemaVersion: 1, route: "nope" },
  garmentKeys: ["base:shirt"],
  compatibilityDemographic: "male",
});
assert.equal(invalid.status, "invalid");
if (invalid.status === "invalid") {
  assert.deepEqual(invalid.preservedRaw, { schemaVersion: 1, route: "nope" });
}
assert.equal(
  classifyPersistedMeasurement({
    value: undefined,
    garmentKeys: [],
    compatibilityDemographic: null,
  }).status,
  "absent",
);

const normalized = normalizeWearerOrderState(lifted);
assert.ok(normalized);
assert.equal(normalizeWearerOrderState({ schemaVersion: 1 }), null);

const tenKeys = Array.from({ length: 10 }, (_, index) => `base:shirt-${index}`);
const capOrder = tenKeys.reduce((order, _garmentKey, index) => {
  if (index === 0) return order;
  const next = addWearer({
    order,
    physicalGarmentCount: tenKeys.length,
    displayName: `Person ${index + 1}`,
    fitContext: index % 2 === 0 ? "female" : "male",
  });
  return next.status === "updated" ? next.order : order;
}, reconcileWearerOrder({
  order: createEmptyWearerOrder(),
  garmentKeys: tenKeys,
  compatibilityDemographic: "male",
  garments: tenKeys.map((garmentKey) => ({ garmentKey, garmentType: "shirt" as const })),
  garmentTypeSelection: selection("male"),
}));
assert.equal(capOrder.wearers.length, 10);
assert.equal(
  addWearer({
    order: capOrder,
    physicalGarmentCount: 11,
    displayName: "Eleventh",
    fitContext: "male",
  }).status,
  "blocked",
);

const runtimes = planWearerOrderMeasurements({
  order: assignedDress.status === "updated" ? assignedDress.order : added.order,
  garmentTypeSelection: selection("unisex"),
  physicalGarments: garments,
});
const youRuntime = runtimes.find((runtime) => runtime.displayName === "You");
const friendRuntime = runtimes.find((runtime) => runtime.displayName === "Friend");
assert.ok(youRuntime && friendRuntime);
assert.deepEqual(friendRuntime!.garmentKeys, ["base:dress"]);
assert.equal(youRuntime!.garmentKeys.includes("base:dress"), false);
assert.equal(typeof friendRuntime!.plan.criticalRiskSupported, "boolean");
assert.equal(typeof youRuntime!.plan.criticalRiskSupported, "boolean");
assert.equal(
  isWearerOrderMeasurementComplete({
    order: assignedDress.status === "updated" ? assignedDress.order : added.order,
    runtimes,
    physicalGarmentKeys: keys,
  }),
  false,
);

const isolated = createEmptyFutureMeasurementState("sample_cloth");
isolated.entered.shared.chest_bust_circumference = {
  valueCm: 50.8,
  provenance: "customer_entered",
};
const you = createWearerProfile({
  wearerId: "wearer-you",
  displayName: "You",
  fitContext: "male",
  presentationOrder: 0,
  measurement: isolated,
});
const other = createWearerProfile({
  wearerId: "wearer-friend",
  displayName: "Friend",
  fitContext: "female",
  presentationOrder: 1,
  measurement: createEmptyFutureMeasurementState("low_risk"),
});
assert.equal(you.measurement.route, "sample_cloth");
assert.equal(other.measurement.route, "low_risk");
assert.notEqual(
  (you.measurement as FutureMeasurementStateV1).entered.shared.chest_bust_circumference?.valueCm,
  other.measurement.entered.shared.chest_bust_circumference?.valueCm,
);

console.log("multiple wearers domain tests passed");
