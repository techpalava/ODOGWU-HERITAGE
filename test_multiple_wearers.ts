import assert from "node:assert/strict";
import { MAX_CONFIGURED_ACTIVE_WEARERS, resolveActiveWearerCap } from "./src/config/WearerPolicy";
import type { CustomDetailSelectionGroup, FutureMeasurementStateV1, GarmentTypeStepSelection } from "./src/types";
import {
  createEmptyFutureMeasurementState,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  setFutureMeasurementRoute,
} from "./src/utils/measurementBlueprint";
import { projectDesignStudioLiveOrderSummary } from "./src/utils/designStudioLiveOrderSummary";
import {
  addWearer,
  applyWearerMeasurementUpdate,
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
  summarizeWearerOrderMeasurementCompletion,
  updateWearerMeasurement,
  setWearerFitContext,
} from "./src/utils/wearerOrder";

/** Customer picks the sole fit on Measurement; Studio then reconciles (no demographic inference). */
const reconcileWithChosenSoleFit = (
  input: Parameters<typeof reconcileWearerOrder>[0],
  fitContext: "male" | "female",
) => {
  const first = reconcileWearerOrder(input);
  const sole = first.wearers[0];
  if (first.wearers.length !== 1 || !sole || sole.fitContext !== null) return first;
  const chosen = setWearerFitContext(first, sole.wearerId, fitContext);
  if (chosen.status !== "updated") throw new Error("expected sole fit choice");
  return reconcileWearerOrder({ ...input, order: chosen.order });
};
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";

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

const freshSolo = reconcileWearerOrder({
  order: createEmptyWearerOrder(),
  garmentKeys: keys,
  compatibilityDemographic: "male",
  garments,
  garmentTypeSelection: selection("male"),
});
assert.equal(freshSolo.wearers.length, 1);
assert.equal(freshSolo.wearers[0].fitContext, null, "fresh solo starts with no fit selected");
assert.deepEqual(freshSolo.assignmentByGarmentKey, {});

const maleOrder = reconcileWithChosenSoleFit({
  order: createEmptyWearerOrder(),
  garmentKeys: keys,
  compatibilityDemographic: "male",
  garments,
  garmentTypeSelection: selection("male"),
}, "male");
assert.equal(maleOrder.wearers.length, 1);
assert.equal(maleOrder.wearers[0].displayName, "");
assert.equal(maleOrder.wearers[0].fitContext, "male");
assert.equal(maleOrder.assignmentByGarmentKey["base:shirt"], maleOrder.wearers[0].wearerId);
assert.equal(maleOrder.assignmentByGarmentKey["base:dress"], undefined);

{
  const nullFitSolo = reconcileWearerOrder({
    order: {
      schemaVersion: 2,
      wearers: [
        createWearerProfile({
          wearerId: "wearer-sole-null-fit",
          displayName: "",
          fitContext: null,
          presentationOrder: 0,
        }),
      ],
      assignmentByGarmentKey: {},
    },
    garmentKeys: ["base:shirt"],
    compatibilityDemographic: "female",
    garments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
    garmentTypeSelection: selection("female"),
  });
  assert.equal(
    nullFitSolo.wearers[0]?.fitContext,
    null,
    "Step 1 demographic must not pre-select the sole fit",
  );
  assert.equal(
    nullFitSolo.assignmentByGarmentKey["base:shirt"],
    undefined,
    "sole garments wait for the customer's fit choice",
  );
  const chosenFemale = setWearerFitContext(nullFitSolo, "wearer-sole-null-fit", "female");
  if (chosenFemale.status !== "updated") throw new Error("expected fit choice");
  const afterChoice = reconcileWearerOrder({
    order: chosenFemale.order,
    garmentKeys: ["base:shirt"],
    compatibilityDemographic: "female",
    garments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
    garmentTypeSelection: selection("female"),
  });
  assert.equal(afterChoice.wearers[0]?.fitContext, "female");
  assert.equal(
    afterChoice.assignmentByGarmentKey["base:shirt"],
    "wearer-sole-null-fit",
    "customer fit choice unlocks sole auto-assign",
  );

  const stillNull = reconcileWearerOrder({
    order: {
      schemaVersion: 2,
      wearers: [
        createWearerProfile({
          wearerId: "wearer-sole-null-fit",
          displayName: "",
          fitContext: null,
          presentationOrder: 0,
        }),
      ],
      assignmentByGarmentKey: {},
    },
    garmentKeys: ["base:shirt"],
    compatibilityDemographic: null,
    garments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
    garmentTypeSelection: selection("male"),
  });
  assert.equal(stillNull.wearers[0]?.fitContext, null);
  assert.equal(stillNull.assignmentByGarmentKey["base:shirt"], undefined);
}

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
}, reconcileWithChosenSoleFit({
  order: createEmptyWearerOrder(),
  garmentKeys: tenKeys,
  compatibilityDemographic: "male",
  garments: tenKeys.map((garmentKey) => ({ garmentKey, garmentType: "shirt" as const })),
  garmentTypeSelection: selection("male"),
}, "male"));
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
const youRuntime = runtimes.find((runtime) => runtime.displayName === "");
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

const displayedYou = reconcileWithChosenSoleFit({
  order: createEmptyWearerOrder(),
  garmentKeys: ["base:shirt"],
  compatibilityDemographic: "male",
  garments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
  garmentTypeSelection: selection("male"),
}, "male");
const stableId = displayedYou.wearers[0]?.wearerId || "";
assert.equal(displayedYou.wearers[0]?.displayName, "");
assert.ok(stableId);
const withRoute = (
  base: typeof displayedYou,
  route: "low_risk" | "medium_risk" | "high_risk" | "sample_cloth",
  stored = createEmptyWearerOrder(),
) => {
  const current = base.wearers.find((wearer) => wearer.wearerId === stableId);
  if (!current) throw new Error("stable wearer missing");
  return applyWearerMeasurementUpdate(
    stored,
    base,
    stableId,
    setFutureMeasurementRoute(current.measurement, route),
  );
};
let stable = withRoute(displayedYou, "low_risk");
assert.equal(stable.wearers[0]?.wearerId, stableId);
assert.equal(stable.assignmentByGarmentKey["base:shirt"], stableId);
stable = withRoute(stable, "medium_risk", stable);
stable = withRoute(stable, "high_risk", stable);
stable = withRoute(stable, "sample_cloth", stable);
assert.equal(stable.wearers[0]?.wearerId, stableId);
assert.equal(stable.wearers[0]?.measurement.route, "sample_cloth");
const renamedChief = renameWearer(stable, stableId, "Chief");
assert.equal(renamedChief.status, "updated");
if (renamedChief.status !== "updated") throw new Error("rename");
assert.equal(renamedChief.order.wearers[0]?.wearerId, stableId);
const addedFriend = addWearer({
  order: renamedChief.order,
  physicalGarmentCount: 2,
  displayName: "Ada",
  fitContext: "female",
});
assert.equal(addedFriend.status, "updated");
if (addedFriend.status !== "updated") throw new Error("add");
const adaId = addedFriend.order.wearers.find((wearer) => wearer.displayName === "Ada")?.wearerId;
if (!adaId) throw new Error("ada");
const reorderedStable = reorderWearers(addedFriend.order, [adaId, stableId]);
assert.equal(reorderedStable.status, "updated");
if (reorderedStable.status !== "updated") throw new Error("reorder");
assert.equal(
  reorderedStable.order.wearers.find((wearer) => wearer.wearerId === stableId)?.wearerId,
  stableId,
);
const reconciledStable = reconcileWearerOrder({
  order: reorderedStable.order,
  garmentKeys: ["base:shirt"],
  compatibilityDemographic: "male",
  garments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
  garmentTypeSelection: selection("male"),
});
assert.equal(
  reconciledStable.wearers.find((wearer) => wearer.displayName === "Chief")?.wearerId,
  stableId,
);
assert.equal(reconciledStable.assignmentByGarmentKey["base:shirt"], stableId);
const restored = classifyPersistedMeasurement({
  value: reconciledStable,
  garmentKeys: ["base:shirt"],
  compatibilityDemographic: "male",
});
assert.equal(restored.status, "valid");
if (restored.status !== "valid") throw new Error("restore");
assert.equal(
  restored.order.wearers.find((wearer) => wearer.displayName === "Chief")?.wearerId,
  stableId,
);
assert.equal(restored.order.assignmentByGarmentKey["base:shirt"], stableId);
const committedFromEmpty = applyWearerMeasurementUpdate(
  createEmptyWearerOrder(),
  displayedYou,
  stableId,
  setFutureMeasurementRoute(displayedYou.wearers[0]!.measurement, "low_risk"),
);
assert.equal(committedFromEmpty.wearers[0]?.wearerId, stableId);
assert.equal(committedFromEmpty.assignmentByGarmentKey["base:shirt"], stableId);

const shirtPhysical = [
  { garmentKey: "base:shirt", garmentType: "shirt" as const },
  { garmentKey: "additional:shirt:1", garmentType: "shirt" as const },
];
const shirtKeys = shirtPhysical.map((garment) => garment.garmentKey);
const shirtSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};
const additionalShirtConstructions = {
  schemaVersion: 1 as const,
  byGarmentKey: {
    "additional:shirt:1": construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};
const fillRuntime = (
  runtime: ReturnType<typeof planWearerOrderMeasurements>[number],
) => {
  let next = runtime.measurement;
  for (const requirement of runtime.plan.requirements.filter((item) => item.directInput)) {
    next = setFutureMeasurementInput({
      state: next,
      requirement,
      displayValue: 40,
    });
  }
  return reconcileFutureMeasurementState({ state: next, plan: runtime.plan });
};
const chiefAdaBase = reconcileWearerOrder({
  order: {
    schemaVersion: 2,
    wearers: [
      createWearerProfile({
        wearerId: "wearer-chief",
        displayName: "Chief",
        fitContext: "male",
        presentationOrder: 0,
        measurement: createEmptyFutureMeasurementState("low_risk"),
      }),
      createWearerProfile({
        wearerId: "wearer-ada",
        displayName: "Ada",
        fitContext: "male",
        presentationOrder: 1,
        measurement: createEmptyFutureMeasurementState("low_risk"),
      }),
    ],
    assignmentByGarmentKey: {
      "base:shirt": "wearer-chief",
      "additional:shirt:1": "wearer-ada",
    },
  },
  garmentKeys: shirtKeys,
  compatibilityDemographic: "male",
  garments: shirtPhysical,
  garmentTypeSelection: shirtSelection,
});
const completionFor = (
  source: typeof chiefAdaBase,
  activeWearerId: string,
  activeMeasurement: FutureMeasurementStateV1,
) => {
  const overlaid = updateWearerMeasurement(source, activeWearerId, activeMeasurement);
  const runtimes = planWearerOrderMeasurements({
    order: overlaid,
    garmentTypeSelection: shirtSelection,
    physicalGarments: shirtPhysical,
    additionalGarmentConstructions: additionalShirtConstructions,
  });
  return {
    overlaid,
    runtimes,
    completion: summarizeWearerOrderMeasurementCompletion({
      order: overlaid,
      runtimes,
      physicalGarmentKeys: shirtKeys,
    }),
  };
};
const seeded = planWearerOrderMeasurements({
  order: chiefAdaBase,
  garmentTypeSelection: shirtSelection,
  physicalGarments: shirtPhysical,
  additionalGarmentConstructions: additionalShirtConstructions,
});
const chiefSeed = seeded.find((runtime) => runtime.wearerId === "wearer-chief");
const adaSeed = seeded.find((runtime) => runtime.wearerId === "wearer-ada");
if (!chiefSeed || !adaSeed) throw new Error("chief and ada runtimes");
const chiefComplete = fillRuntime(chiefSeed);
const adaIncomplete = adaSeed.measurement;
const partialOrder = updateWearerMeasurement(chiefAdaBase, "wearer-chief", chiefComplete);
const partial = completionFor(partialOrder, "wearer-chief", chiefComplete);
assert.equal(partial.completion.complete, false);
assert.equal(
  partial.runtimes.find((runtime) => runtime.wearerId === "wearer-ada")?.measurement.calculationStatus,
  "incomplete",
);
const selectChief = completionFor(partialOrder, "wearer-chief", chiefComplete);
const selectAda = completionFor(partialOrder, "wearer-ada", adaIncomplete);
assert.equal(selectChief.completion.complete, false);
assert.equal(selectAda.completion.complete, false);
assert.equal(selectChief.completion.complete, selectAda.completion.complete);
const adaFilled = fillRuntime(
  selectAda.runtimes.find((runtime) => runtime.wearerId === "wearer-ada")!,
);
const bothCompleteOrder = updateWearerMeasurement(partialOrder, "wearer-ada", adaFilled);
const bothComplete = completionFor(bothCompleteOrder, "wearer-ada", adaFilled);
assert.equal(bothComplete.completion.complete, true);
const switchChief = completionFor(bothCompleteOrder, "wearer-chief", chiefComplete);
const switchAda = completionFor(bothCompleteOrder, "wearer-ada", adaFilled);
const switchChiefAgain = completionFor(bothCompleteOrder, "wearer-chief", chiefComplete);
assert.equal(switchChief.completion.complete, true);
assert.equal(switchAda.completion.complete, true);
assert.equal(switchChiefAgain.completion.complete, true);
const adaAgain = {
  ...adaFilled,
  entered: { shared: {}, byGarmentKey: {} },
  enteredByRoute: {
    ...adaFilled.enteredByRoute,
    low_risk: { shared: {}, byGarmentKey: {} },
  },
};
const incompleteAgainFromChief = completionFor(bothCompleteOrder, "wearer-chief", chiefComplete);
const droppedAda = updateWearerMeasurement(bothCompleteOrder, "wearer-ada", adaAgain);
assert.equal(completionFor(droppedAda, "wearer-chief", chiefComplete).completion.complete, false);
assert.equal(completionFor(droppedAda, "wearer-ada", adaAgain).completion.complete, false);
assert.equal(incompleteAgainFromChief.completion.complete, true);
const unassigned = {
  ...bothCompleteOrder,
  assignmentByGarmentKey: { "base:shirt": "wearer-chief" },
};
assert.equal(completionFor(unassigned, "wearer-chief", chiefComplete).completion.complete, false);
assert.equal(completionFor(unassigned, "wearer-ada", adaFilled).completion.complete, false);

{
  // In-card uncheck: the garment is left unassigned, is not auto-stolen while
  // 2+ people exist, and keeps Continue blocked.
  const unchecked = removeGarmentFromWearerOrder(bothCompleteOrder, "additional:shirt:1");
  assert.equal(unchecked.assignmentByGarmentKey["additional:shirt:1"], undefined);
  const reconcileShirts = (order: typeof unchecked) =>
    reconcileWearerOrder({
      order,
      garmentKeys: shirtKeys,
      compatibilityDemographic: "male",
      garments: shirtPhysical,
      garmentTypeSelection: shirtSelection,
      additionalGarmentConstructions: additionalShirtConstructions,
    });
  const twoPeople = reconcileShirts(unchecked);
  assert.equal(
    twoPeople.assignmentByGarmentKey["additional:shirt:1"],
    undefined,
    "2+ people: an unassigned garment is not auto-assigned",
  );
  assert.equal(completionFor(twoPeople, "wearer-chief", chiefComplete).completion.complete, false);
  // Removing the now-empty second person hands the garment back to the sole wearer.
  const adaRemoved = deleteWearer(twoPeople, "wearer-ada");
  assert.equal(adaRemoved.status, "updated");
  if (adaRemoved.status === "updated") {
    const handedBack = reconcileShirts(adaRemoved.order);
    assert.equal(handedBack.wearers.length, 1);
    assert.equal(handedBack.assignmentByGarmentKey["base:shirt"], "wearer-chief");
    assert.equal(
      handedBack.assignmentByGarmentKey["additional:shirt:1"],
      "wearer-chief",
      "back to one wearer: sole reconcile assigns every eligible garment to You",
    );
  }
}

const measurementLine = (complete: boolean) => {
  const summary = {
    garmentSummary: [],
    fabricSummary: [],
    designStyleSummary: null,
    designStyleOccurrences: [],
    customDetailsSummary: [],
    aiTryOnSummary: { status: "skipped", label: "Skipped" },
    measurementSummary: {
      route: null,
      routeLabel: "2 people",
      unit: "cm" as const,
      shared: [],
      byGarment: [],
      wearerGroups: [],
    },
    pricingSummary: {
      status: "pending" as const,
      garmentConstructionSubtotal: null,
      customDetailsExactSubtotal: null,
      selectedDesignPrice: null,
    },
    status: "incomplete" as const,
    blockers: [],
  };
  const view = projectDesignStudioLiveOrderSummary({
    summary: summary as never,
    shippingResolution: null,
    candidatePricing: null,
    fabricAllocationState: { schemaVersion: 1, fabricAllocations: [], pendingFabricGarment: null } as never,
    measurementState: chiefComplete,
    measurementPlan: chiefSeed.plan,
    orderMeasurementCompletion: selectChief.completion.complete === complete
      ? selectChief.completion
      : { complete, remainingRequiredCount: selectChief.completion.remainingRequiredCount },
    designSource: null,
  });
  return view.sections.find((section) => section.id === "measurements")?.lines[0]?.label || "";
};
assert.equal(measurementLine(false).includes("Complete"), false);
assert.match(measurementLine(false), /required measurements remaining|Incomplete/);
assert.match(measurementLine(true), /2 people — Complete/);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let continueRenderer!: ReturnType<typeof create>;
act(() => {
  continueRenderer = create(createElement(DormantFutureMeasurementStep, {
    plan: chiefSeed.plan,
    state: chiefComplete,
    orderMeasurementsComplete: selectChief.completion.complete,
    onChange: () => undefined,
    onRouteChange: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  }));
});
const continueButton = continueRenderer.root.findAllByType("button").find(
  (node) => node.props["aria-label"] === "Continue to Summary",
);
assert.ok(continueButton, "expected Continue to Summary control");
assert.equal(continueButton.props.disabled, !selectChief.completion.complete);
assert.equal(selectChief.completion.complete, false);

{
  const chosenSoleFits: Array<"male" | "female"> = [];
  let soleFitRenderer!: ReturnType<typeof create>;
  act(() => {
    soleFitRenderer = create(createElement(DormantFutureMeasurementStep, {
      plan: chiefSeed.plan,
      state: chiefComplete,
      showSoleFitControl: true,
      soleFitContext: null,
      onSetSoleFitContext: (fitContext: "male" | "female") => {
        chosenSoleFits.push(fitContext);
      },
      onChange: () => undefined,
      onRouteChange: () => undefined,
      onBack: () => undefined,
      onContinue: () => undefined,
    }));
  });
  const soleFitOptions = soleFitRenderer.root.findAll(
    (node) => typeof node.props?.["data-measurement-sole-fit-option"] === "string",
  );
  assert.deepEqual(
    soleFitOptions.map((node) => node.props["data-measurement-sole-fit-option"]),
    ["male", "female"],
  );
  assert.equal(
    soleFitOptions.every((node) => node.props["data-measurement-sole-fit-selected"] === "false"),
    true,
    "Dimension card shows Male/Female with neither selected until the customer picks",
  );
  act(() => {
    soleFitOptions[1].props.onClick();
  });
  assert.deepEqual(chosenSoleFits, ["female"]);
}

console.log("multiple wearers domain tests passed");
