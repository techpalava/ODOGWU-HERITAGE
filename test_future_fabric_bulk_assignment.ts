import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { FabricCapacityEngine } from "./src/engine/FabricCapacityEngine";
import type { Fabric, FabricGarmentType } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import {
  applyFutureFabricCardSelection,
  assignFutureFabricToGarment,
  assignSameFabricProductToGarments,
  getFutureFabricAssignmentTargets,
  getFutureFabricBulkChoiceCandidates,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  getFutureUnassignedFabricTargets,
  removeFutureFabricAssignment,
  cancelFutureFabricCatalogueAssignment,
} from "./src/utils/designStudioFutureFabricStage";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { cloneFabricAllocations } from "./src/utils/fabricAllocationPersistence";
import { STEP_1_SELECTABLE_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const createSelection = (garmentTypes: FabricGarmentType[]) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: ["unisex"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
const createFabric = (code: string, name: string, price: number): Fabric => ({
  code,
  name,
  description: name,
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Test Fabric",
  price,
});
const fabrics = [
  createFabric("FAB-A", "Heritage A", 10),
  createFabric("FAB-B", "Heritage B", 20),
];
const assignFirst = (
  garmentTypes: FabricGarmentType[],
  garmentKey: string,
  fabricCode = "FAB-A",
) =>
  applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: createSelection(garmentTypes),
    garmentKey,
    fabricCode,
  });
const assignedKeys = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
) =>
  state.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  );
const remainingKeys = (
  garmentTypes: FabricGarmentType[],
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
) =>
  getFutureFabricBulkChoiceCandidates({
    garmentTypeSelection: createSelection(garmentTypes),
    fabricAllocationState: state,
  }).map(({ assignment }) => assignment.garmentKey);
const commitSameFabric = (
  args: Parameters<typeof assignSameFabricProductToGarments>[0],
) => {
  const result = assignSameFabricProductToGarments(args);
  assert.equal(
    result.status,
    "assigned",
    result.status === "blocked" ? result.reason : "",
  );
  return result.state;
};

const single = assignFirst(["shirt"], "base:shirt");
assert.deepEqual(assignedKeys(single), ["base:shirt"]);
assert.equal(
  remainingKeys(["shirt"], single).length,
  0,
  "A single selected garment must not expose remaining bulk-choice candidates.",
);

const twoTypes = ["shirt", "trouser"] satisfies FabricGarmentType[];
let two = assignFirst(twoTypes, "base:shirt");
assert.deepEqual(assignedKeys(two), ["base:shirt"]);
assert.deepEqual(remainingKeys(twoTypes, two), ["base:trouser"]);
two = commitSameFabric({
  state: two,
  garmentTypeSelection: createSelection(twoTypes),
  fabricCode: "FAB-A",
  garmentKeys: remainingKeys(twoTypes, two),
});
assert.equal(two.fabricAllocations.length, 1);
assert.deepEqual(assignedKeys(two), ["base:shirt", "base:trouser"]);
assert.equal(two.pendingFabricGarment, null);
assert.equal(
  FabricCapacityEngine.resolveFabricAllocation(two.fabricAllocations[0]).status,
  "resolved",
);

const threeTypes = ["shirt", "trouser", "skirt"] satisfies FabricGarmentType[];
let three = assignFirst(threeTypes, "base:shirt");
three = commitSameFabric({
  state: three,
  garmentTypeSelection: createSelection(threeTypes),
  fabricCode: "FAB-A",
  garmentKeys: remainingKeys(threeTypes, three),
});
assert.equal(three.fabricAllocations.length, 2);
assert.deepEqual(
  three.fabricAllocations.map((allocation) => allocation.fabricCode),
  ["FAB-A", "FAB-A"],
);
assert.equal(assignedKeys(three).length, 3);
assert.equal(three.pendingFabricGarment, null);
three.fabricAllocations.forEach((allocation) => {
  assert.equal(
    FabricCapacityEngine.resolveFabricAllocation(allocation).status,
    "resolved",
  );
});

const eightTypes = [...STEP_1_SELECTABLE_GARMENT_TYPES] as FabricGarmentType[];
assert.equal(eightTypes.length, 8);
let eight = assignFirst(eightTypes, "base:shirt");
eight = commitSameFabric({
  state: eight,
  garmentTypeSelection: createSelection(eightTypes),
  fabricCode: "FAB-A",
  garmentKeys: remainingKeys(eightTypes, eight),
});
assert.equal(
  eight.fabricAllocations.length,
  5,
  "All eight Step 1 garments using one fabric product must create five physical allocations.",
);
assert.equal(new Set(eight.fabricAllocations.map((allocation) => allocation.fabricCode)).size, 1);
assert.equal(assignedKeys(eight).length, 8);
assert.equal(eight.pendingFabricGarment, null);
assert.deepEqual(
  getFutureGarmentFabricPlanning({
    garmentTypeSelection: createSelection(eightTypes),
    fabricAllocationState: eight,
  }),
  {
    requiredGarmentCount: 8,
    requiredFabricQuantity: 5,
    selectedFabricQuantity: 5,
  },
);
eight.fabricAllocations.forEach((allocation) => {
  assert.equal(
    FabricCapacityEngine.resolveFabricAllocation(allocation).status,
    "resolved",
  );
});

let subset = assignFirst(threeTypes, "base:shirt");
assert.deepEqual(remainingKeys(threeTypes, subset), ["base:trouser", "base:skirt"]);
subset = commitSameFabric({
  state: subset,
  garmentTypeSelection: createSelection(threeTypes),
  fabricCode: "FAB-A",
  garmentKeys: ["base:skirt"],
});
assert.deepEqual(assignedKeys(subset).sort(), ["base:shirt", "base:skirt"]);
assert.deepEqual(
  getFutureUnassignedFabricTargets({
    garmentTypeSelection: createSelection(threeTypes),
    fabricAllocationState: subset,
  }).map(({ assignment }) => assignment.garmentKey),
  ["base:trouser"],
  "Unchecked garments must remain unassigned after Apply Fabric to Selected.",
);

const individually = assignFirst(threeTypes, "base:shirt");
assert.equal(individually.pendingFabricGarment, null);
assert.deepEqual(remainingKeys(threeTypes, individually), ["base:trouser", "base:skirt"]);

let fullAllocation = assignFirst(threeTypes, "base:shirt");
fullAllocation = assignFutureFabricToGarment({
  state: fullAllocation,
  garmentTypeSelection: createSelection(threeTypes),
  garmentKey: "base:trouser",
  fabricCode: "FAB-A",
}).state;
assert.equal(fullAllocation.fabricAllocations[0].garmentAssignments.length, 2);
assert.equal(fullAllocation.pendingFabricGarment, null);
const skirtAfterFull = assignFutureFabricToGarment({
  state: fullAllocation,
  garmentTypeSelection: createSelection(threeTypes),
  garmentKey: "base:skirt",
  fabricCode: "FAB-B",
}).state;
assert.equal(skirtAfterFull.pendingFabricGarment, null);
assert.equal(skirtAfterFull.fabricAllocations.length, 2);
assert.equal(skirtAfterFull.fabricAllocations[1].fabricCode, "FAB-B");

const gownTypes = ["full_length_gown", "shirt"] satisfies FabricGarmentType[];
let gown = assignFirst(gownTypes, "base:full_length_gown");
gown = commitSameFabric({
  state: gown,
  garmentTypeSelection: createSelection(gownTypes),
  fabricCode: "FAB-A",
  garmentKeys: remainingKeys(gownTypes, gown),
});
assert.equal(gown.fabricAllocations.length, 2);
assert.deepEqual(
  gown.fabricAllocations.map((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentType),
  ),
  [["full_length_gown"], ["shirt"]],
  "A gown must keep its own full allocation when the same fabric product is reused.",
);
gown.fabricAllocations.forEach((allocation) => {
  assert.equal(
    FabricCapacityEngine.resolveFabricAllocation(allocation).status,
    "resolved",
  );
});

let changed = commitSameFabric({
  state: assignFirst(twoTypes, "base:shirt"),
  garmentTypeSelection: createSelection(twoTypes),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
changed = applyFutureFabricCardSelection({
  state: changed,
  garmentTypeSelection: createSelection(twoTypes),
  garmentKey: "base:shirt",
  fabricCode: "FAB-B",
  fabrics,
});
assert.deepEqual(
  changed.fabricAllocations.map((allocation) => ({
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [{ fabricCode: "FAB-B", garmentKeys: ["base:shirt", "base:trouser"] }],
  "Changing Fabric for a shared Shirt + Trouser allocation replaces the whole physical group.",
);
changed = removeFutureFabricAssignment({
  state: changed,
  garmentKey: "base:trouser",
});
assert.deepEqual(assignedKeys(changed), ["base:shirt"]);

let additionalState = commitSameFabric({
  state: assignFirst(twoTypes, "base:shirt"),
  garmentTypeSelection: createSelection(twoTypes),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
const additionalSelection = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  existingAssignments: additionalState.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
});
assert.equal(additionalSelection.status, "resolved");
if (additionalSelection.status !== "resolved") {
  throw new Error("Expected additional shirt");
}
additionalState = FabricAllocationStateEngine.attemptAppendGarment(
  additionalState,
  additionalSelection.selection,
);
assert.equal(
  additionalState.pendingFabricGarment?.garmentKey,
  "additional:shirt:1",
  "Additional garments must still overflow into the existing pending allocation policy.",
);
additionalState = FabricAllocationStateEngine.assignPendingGarmentToFabric(
  additionalState,
  "FAB-B",
);
assert.ok(
  additionalState.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === "FAB-B" &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "additional:shirt:1",
      ),
  ),
);

const restored = cloneFabricAllocations(JSON.parse(JSON.stringify(eight.fabricAllocations)));
assert.equal(restored?.length, 5);
assert.deepEqual(
  restored?.map((allocation) => allocation.fabricCode),
  eight.fabricAllocations.map((allocation) => allocation.fabricCode),
);

const eightPricing = resolveFabricAllocationMaterialPricing(
  eight.fabricAllocations,
  fabrics,
);
assert.equal(eightPricing.status, "resolved");
assert.equal(
  eightPricing.status === "resolved" ? eightPricing.totalMaterialPrice : null,
  50,
  "Fabric pricing must charge each physical allocation even when they share one fabric code.",
);

assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(eightTypes),
    fabricAllocationState: eight,
    fabrics,
  }).isComplete,
  true,
);

assert.equal(
  getFutureFabricAssignmentTargets(createSelection(twoTypes)).length,
  2,
);

let skirtPending = assignFirst(threeTypes, "base:shirt");
skirtPending = commitSameFabric({
  state: skirtPending,
  garmentTypeSelection: createSelection(threeTypes),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
const pendingShirtSelection = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  existingAssignments: skirtPending.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
});
assert.equal(pendingShirtSelection.status, "resolved");
if (pendingShirtSelection.status !== "resolved") {
  throw new Error("Expected pending additional shirt");
}
skirtPending = FabricAllocationStateEngine.attemptAppendGarment(
  skirtPending,
  pendingShirtSelection.selection,
);
assert.equal(skirtPending.pendingFabricGarment?.garmentKey, "additional:shirt:1");
assert.deepEqual(
  remainingKeys(threeTypes, skirtPending),
  ["base:skirt"],
  "Step 1 skirt + pending additional shirt must expose only the unassigned Step 1 skirt as a bulk candidate.",
);

let pendingPreserve = commitSameFabric({
  state: assignFirst(twoTypes, "base:shirt"),
  garmentTypeSelection: createSelection(twoTypes),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
const preserveAdditional = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  existingAssignments: pendingPreserve.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
});
assert.equal(preserveAdditional.status, "resolved");
if (preserveAdditional.status !== "resolved") {
  throw new Error("Expected additional shirt for preservation");
}
pendingPreserve = FabricAllocationStateEngine.attemptAppendGarment(
  pendingPreserve,
  preserveAdditional.selection,
);
assert.equal(
  pendingPreserve.pendingFabricGarment?.garmentKey,
  "additional:shirt:1",
);
const pendingConstruction = pendingPreserve.pendingFabricGarment;
const pendingAwaiting = pendingPreserve.awaitingFabricForPendingGarment;
assert.ok(pendingConstruction?.garmentSpec);
pendingPreserve = removeFutureFabricAssignment({
  state: pendingPreserve,
  garmentKey: "base:trouser",
});
assert.equal(
  pendingPreserve.pendingFabricGarment?.garmentKey,
  "additional:shirt:1",
  "Removing an unrelated assigned garment must preserve the pending additional shirt.",
);
assert.equal(
  pendingPreserve.awaitingFabricForPendingGarment,
  pendingAwaiting,
);
assert.deepEqual(
  pendingPreserve.pendingFabricGarment?.garmentSpec,
  pendingConstruction?.garmentSpec,
  "Pending additional construction metadata must remain intact.",
);
assert.equal(
  pendingPreserve.pendingFabricGarment?.sourceRole,
  "additional",
);
assert.ok(
  !assignedKeys(pendingPreserve).includes("base:trouser"),
  "Only the requested committed assignment may be removed.",
);

const additionalOccurrenceAssignments = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
) => [
  ...state.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
  ...(state.pendingFabricGarment ? [state.pendingFabricGarment] : []),
];
const appendAdditionalShirt = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
  fabricCode?: string,
) => {
  const selection = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    existingAssignments: additionalOccurrenceAssignments(state),
  });
  assert.equal(selection.status, "resolved");
  if (selection.status !== "resolved") {
    throw new Error("Expected additional shirt");
  }
  let next = FabricAllocationStateEngine.attemptAppendGarment(
    state,
    selection.selection,
  );
  if (fabricCode && next.pendingFabricGarment) {
    next = FabricAllocationStateEngine.assignPendingGarmentToFabric(
      next,
      fabricCode,
    );
  }
  return next;
};
let pendingConflict = commitSameFabric({
  state: assignFirst(twoTypes, "base:shirt"),
  garmentTypeSelection: createSelection(twoTypes),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
pendingConflict = appendAdditionalShirt(pendingConflict, "FAB-B");
pendingConflict = appendAdditionalShirt(pendingConflict, "FAB-B");
pendingConflict = appendAdditionalShirt(pendingConflict);
pendingConflict = FabricAllocationStateEngine.beginChooseAnotherFabric(
  pendingConflict,
);
assert.equal(
  pendingConflict.pendingFabricGarment?.garmentKey,
  "additional:shirt:3",
);
assert.ok(assignedKeys(pendingConflict).includes("additional:shirt:1"));
assert.equal(pendingConflict.awaitingFabricForPendingGarment, true);
const pendingConflictSnapshot = structuredClone(pendingConflict);
const pendingAdditionalConstructionRef = {
  garmentKey: pendingConflict.pendingFabricGarment?.garmentKey ?? "",
};
const blockedAdditionalCancel = cancelFutureFabricCatalogueAssignment({
  state: pendingConflict,
  garmentKey: "additional:shirt:1",
});
assert.equal(blockedAdditionalCancel.status, "blocked");
assert.equal(
  blockedAdditionalCancel.reason,
  "OTHER_ADDITIONAL_GARMENT_PENDING",
);
assert.equal(
  blockedAdditionalCancel.state,
  pendingConflict,
  "A blocked additional cancellation must return the original allocation state unchanged.",
);
assert.deepEqual(
  blockedAdditionalCancel.state,
  pendingConflictSnapshot,
  "A blocked additional cancellation must not mutate allocation state while deciding legality.",
);
assert.ok(
  assignedKeys(blockedAdditionalCancel.state).includes("additional:shirt:1"),
  "Committed Additional Shirt 1 must remain assigned when cancellation is blocked.",
);
assert.equal(
  blockedAdditionalCancel.state.pendingFabricGarment?.garmentKey,
  "additional:shirt:3",
  "Pending Additional Shirt 3 must remain the pending garment.",
);
assert.equal(
  blockedAdditionalCancel.state.awaitingFabricForPendingGarment,
  pendingConflictSnapshot.awaitingFabricForPendingGarment,
);
assert.equal(
  pendingAdditionalConstructionRef.garmentKey,
  "additional:shirt:3",
  "pendingAdditionalConstructionRef must stay on Shirt 3 when Shirt 1 cancellation is blocked.",
);

const originalForBlocked = assignFirst(threeTypes, "base:shirt");
const blockedBulk = assignSameFabricProductToGarments({
  state: originalForBlocked,
  garmentTypeSelection: createSelection(threeTypes),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser", "missing:invalid", "base:skirt"],
});
assert.equal(blockedBulk.status, "blocked");
assert.equal(blockedBulk.failedGarmentKey, "missing:invalid");
assert.equal(
  blockedBulk.state,
  originalForBlocked,
  "A blocked bulk request must return the original state unchanged.",
);
assert.deepEqual(
  assignedKeys(blockedBulk.state),
  ["base:shirt"],
  "A stale bulk target must commit zero bulk garments.",
);

const announced = assignSameFabricProductToGarments({
  state: originalForBlocked,
  garmentTypeSelection: createSelection(threeTypes),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser", "base:skirt"],
});
assert.equal(announced.status, "assigned");
assert.deepEqual(announced.assignedGarmentKeys, ["base:trouser", "base:skirt"]);

const pendingAssignSelf = FabricAllocationStateEngine.attemptAppendGarment(
  commitSameFabric({
    state: assignFirst(twoTypes, "base:shirt"),
    garmentTypeSelection: createSelection(twoTypes),
    fabricCode: "FAB-A",
    garmentKeys: ["base:trouser"],
  }),
  pendingShirtSelection.selection,
);
assert.equal(pendingAssignSelf.pendingFabricGarment?.garmentKey, "additional:shirt:1");
const pendingSelfAssigned = applyFutureFabricCardSelection({
  state: pendingAssignSelf,
  garmentTypeSelection: createSelection(twoTypes),
  garmentKey: "additional:shirt:1",
  fabricCode: "FAB-B",
});
assert.equal(pendingSelfAssigned.pendingFabricGarment, null);
assert.ok(
  pendingSelfAssigned.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === "FAB-B" &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "additional:shirt:1",
      ),
  ),
  "Clicking the actual pending garment must still assign through the pending path.",
);
const unrelatedAfterPending = applyFutureFabricCardSelection({
  state: pendingAssignSelf,
  garmentTypeSelection: createSelection(twoTypes),
  garmentKey: "base:shirt",
  fabricCode: "FAB-B",
});
assert.equal(
  unrelatedAfterPending.pendingFabricGarment?.garmentKey,
  "additional:shirt:1",
  "Assigning an unrelated garment must not consume the pending additional garment.",
);

console.log("PASS: future fabric bulk assignment");
