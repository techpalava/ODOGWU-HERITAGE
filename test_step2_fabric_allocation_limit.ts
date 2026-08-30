import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricGarmentAssignment, FabricGarmentType } from "./src/types";
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  applyFutureFabricCardSelection,
  assignFutureFabricToGarment,
  canCreatePhysicalFabricAllocation,
  formatFabricQuantityLimitReachedCopy,
  formatRequiredFabricQuantitySentence,
  getFutureFabricAssignmentTargets,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  removeFutureFabricAssignment,
  resolveFutureFabricCatalogueCardPresentation,
} from "./src/utils/designStudioFutureFabricStage";
import { resolveStep1FabricCatalogueCardPresentation } from "./src/utils/step1FabricAssignmentPopup";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const createSelection = (garmentTypes: FabricGarmentType[]) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: ["unisex"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const createFabric = (code: string, name: string): Fabric => ({
  code,
  name,
  description: name,
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Test Fabric",
  price: 10,
});

const fabrics = [
  createFabric("FAB-A", "Fabric A"),
  createFabric("FAB-B", "Fabric B"),
  createFabric("FAB-C", "Fabric C"),
  createFabric("FAB-D", "Fabric D"),
  createFabric("FAB-E", "Fabric E"),
];

const fourOrdinary = [
  "shirt",
  "trouser",
  "standard_shorts",
  "bum_shorts",
] satisfies FabricGarmentType[];

const assign = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
  garmentTypes: readonly FabricGarmentType[],
  garmentKey: string,
  fabricCode: string,
) =>
  assignFutureFabricToGarment({
    state,
    garmentTypeSelection: createSelection([...garmentTypes]),
    garmentKey,
    fabricCode,
  });

const planningOf = (
  garmentTypes: readonly FabricGarmentType[],
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
) =>
  getFutureGarmentFabricPlanning({
    garmentTypeSelection: createSelection([...garmentTypes]),
    fabricAllocationState: state,
  });

const completionOf = (
  garmentTypes: readonly FabricGarmentType[],
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
) =>
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection([...garmentTypes]),
    fabricAllocationState: state,
    fabrics,
  });

const empty = () => FabricAllocationStateEngine.initialize();

const emptyPlanning = planningOf(fourOrdinary, empty());
assert.deepEqual(emptyPlanning, {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 0,
});
assert.equal(
  formatRequiredFabricQuantitySentence(2, 4),
  "You need 2 fabrics for your 4 garments.",
);

let fourState = empty();
fourState = assign(fourState, fourOrdinary, "base:shirt", "FAB-A").state;
assert.equal(assign(fourState, fourOrdinary, "base:shirt", "FAB-A").status, "assigned");
assert.deepEqual(planningOf(fourOrdinary, fourState), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 1,
});

fourState = assign(fourState, fourOrdinary, "base:trouser", "FAB-B").state;
assert.deepEqual(planningOf(fourOrdinary, fourState), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
assert.equal(
  canCreatePhysicalFabricAllocation({
    state: fourState,
    garmentTypeSelection: createSelection(fourOrdinary),
  }),
  false,
);

const blockedThird = assign(fourState, fourOrdinary, "base:standard_shorts", "FAB-C");
assert.equal(blockedThird.status, "blocked");
assert.equal(
  blockedThird.status === "blocked" ? blockedThird.reason : null,
  "FABRIC_QUANTITY_LIMIT_REACHED",
);
assert.equal(blockedThird.state.fabricAllocations.length, 2);
assert.deepEqual(planningOf(fourOrdinary, blockedThird.state), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});

const unusedAtLimit = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: "FAB-C",
  garmentTypeSelection: createSelection(fourOrdinary),
  fabricAllocationState: fourState,
  availabilityMessage: null,
});
assert.deepEqual(unusedAtLimit, { status: "SELECT", action: "none" });

const useAgainA = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(fourOrdinary),
  fabricAllocationState: fourState,
  availabilityMessage: null,
});
assert.deepEqual(useAgainA, { status: "USE AGAIN", action: "use_again" });

fourState = assign(fourState, fourOrdinary, "base:standard_shorts", "FAB-A").state;
assert.equal(
  fourState.fabricAllocations.some((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:standard_shorts",
    ),
  ),
  true,
);
assert.deepEqual(planningOf(fourOrdinary, fourState), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});

fourState = assign(fourState, fourOrdinary, "base:bum_shorts", "FAB-B").state;
assert.deepEqual(planningOf(fourOrdinary, fourState), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
assert.equal(completionOf(fourOrdinary, fourState).assignedGarmentCount, 4);
assert.equal(completionOf(fourOrdinary, fourState).isComplete, true);
assert.equal(
  fourState.fabricAllocations.some((allocation) => allocation.fabricCode === "FAB-C"),
  false,
  "A third unused Fabric product must never create allocation 3.",
);

let sameProduct = empty();
for (const garmentKey of [
  "base:shirt",
  "base:trouser",
  "base:standard_shorts",
  "base:bum_shorts",
]) {
  const result = assign(sameProduct, fourOrdinary, garmentKey, "FAB-A");
  assert.equal(result.status, "assigned", `${garmentKey} must assign onto Fabric A`);
  sameProduct = result.state;
}
assert.equal(sameProduct.fabricAllocations.length, 2);
assert.ok(
  sameProduct.fabricAllocations.every((allocation) => allocation.fabricCode === "FAB-A"),
);
assert.deepEqual(
  sameProduct.fabricAllocations.map(
    (allocation) => allocation.garmentAssignments.length,
  ),
  [2, 2],
);
assert.deepEqual(planningOf(fourOrdinary, sameProduct), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
assert.equal(
  assign(sameProduct, fourOrdinary, "base:shirt", "FAB-C").status,
  "blocked",
  "A shared allocation cannot split onto a third unused Fabric while already at the limit.",
);

let gownState = assign(empty(), ["full_length_gown"], "base:full_length_gown", "FAB-A")
  .state;
assert.deepEqual(planningOf(["full_length_gown"], gownState), {
  requiredGarmentCount: 1,
  requiredFabricQuantity: 1,
  selectedFabricQuantity: 1,
});
assert.equal(completionOf(["full_length_gown"], gownState).isComplete, true);
const gownSecond = assign(
  gownState,
  ["full_length_gown"],
  "base:full_length_gown",
  "FAB-B",
);
assert.equal(gownSecond.status, "assigned");
assert.equal(
  gownSecond.state.fabricAllocations.length,
  1,
  "Changing the only Long Dress allocation replaces the fabricCode in place.",
);
assert.equal(gownSecond.state.fabricAllocations[0]?.fabricCode, "FAB-B");

const mixedTypes = [
  "full_length_gown",
  "shirt",
  "trouser",
] satisfies FabricGarmentType[];
let mixed = assign(empty(), mixedTypes, "base:full_length_gown", "FAB-A").state;
mixed = assign(mixed, mixedTypes, "base:shirt", "FAB-B").state;
mixed = assign(mixed, mixedTypes, "base:trouser", "FAB-B").state;
assert.deepEqual(planningOf(mixedTypes, mixed), {
  requiredGarmentCount: 3,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
assert.equal(completionOf(mixedTypes, mixed).isComplete, true);
assert.equal(
  assign(mixed, mixedTypes, "base:shirt", "FAB-C").status,
  "blocked",
  "Splitting Shirt off a full mixed allocation at the limit must be blocked.",
);
const mixedDressReplace = assign(
  mixed,
  mixedTypes,
  "base:full_length_gown",
  "FAB-C",
);
assert.equal(mixedDressReplace.status, "assigned");
assert.equal(mixedDressReplace.state.fabricAllocations.length, 2);
assert.equal(
  mixedDressReplace.state.fabricAllocations.find(
    (allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:full_length_gown",
      ),
  )?.fabricCode,
  "FAB-C",
);

let splitAtLimit = empty();
splitAtLimit = assign(splitAtLimit, fourOrdinary, "base:shirt", "FAB-A").state;
splitAtLimit = assign(splitAtLimit, fourOrdinary, "base:standard_shorts", "FAB-A")
  .state;
splitAtLimit = assign(splitAtLimit, fourOrdinary, "base:trouser", "FAB-B").state;
splitAtLimit = assign(splitAtLimit, fourOrdinary, "base:bum_shorts", "FAB-B").state;
assert.equal(splitAtLimit.fabricAllocations.length, 2);
const blockedSplit = assign(splitAtLimit, fourOrdinary, "base:shirt", "FAB-C");
assert.equal(blockedSplit.status, "blocked");
assert.equal(
  blockedSplit.status === "blocked" ? blockedSplit.reason : null,
  "FABRIC_QUANTITY_LIMIT_REACHED",
);
assert.equal(blockedSplit.state.fabricAllocations.length, 2);
assert.equal(
  resolveFutureFabricCatalogueCardPresentation({
    fabricCode: "FAB-C",
    garmentTypeSelection: createSelection(fourOrdinary),
    fabricAllocationState: splitAtLimit,
    currentTargetGarmentKey: "base:shirt",
  }).action,
  "none",
);

let replaceOnly = empty();
replaceOnly = assign(replaceOnly, fourOrdinary, "base:shirt", "FAB-A").state;
replaceOnly = assign(replaceOnly, fourOrdinary, "base:trouser", "FAB-B").state;
const replaced = assign(replaceOnly, fourOrdinary, "base:shirt", "FAB-C");
assert.equal(replaced.status, "assigned");
assert.equal(replaced.state.fabricAllocations.length, 2);
assert.ok(
  replaced.state.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === "FAB-C" &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:shirt",
      ),
  ),
);

let splitAllowed = empty();
splitAllowed = assign(splitAllowed, fourOrdinary, "base:shirt", "FAB-A").state;
splitAllowed = assign(splitAllowed, fourOrdinary, "base:standard_shorts", "FAB-A")
  .state;
assert.equal(splitAllowed.fabricAllocations.length, 1);
const splitCreated = assign(splitAllowed, fourOrdinary, "base:shirt", "FAB-C");
assert.equal(splitCreated.status, "assigned");
assert.equal(splitCreated.state.fabricAllocations.length, 2);

const assignmentTargets = getFutureFabricAssignmentTargets(
  createSelection(fourOrdinary),
);
const legacyAssignments = assignmentTargets.map(
  (target) => target.assignment,
) as FabricGarmentAssignment[];
const legacyState = {
  fabricAllocations: [
    {
      allocationId: "legacy-a",
      fabricCode: "FAB-A",
      garmentAssignments: [legacyAssignments[0]!],
    },
    {
      allocationId: "legacy-b",
      fabricCode: "FAB-B",
      garmentAssignments: [legacyAssignments[1]!],
    },
    {
      allocationId: "legacy-c",
      fabricCode: "FAB-C",
      garmentAssignments: [legacyAssignments[2]!],
    },
    {
      allocationId: "legacy-d",
      fabricCode: "FAB-D",
      garmentAssignments: [legacyAssignments[3]!],
    },
  ],
  activeAllocationId: "legacy-d",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assert.deepEqual(planningOf(fourOrdinary, legacyState), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 4,
});
const legacyCompletion = completionOf(fourOrdinary, legacyState);
assert.equal(legacyCompletion.isComplete, false);
assert.ok(
  legacyCompletion.blockers.some(
    (blocker) => blocker.code === "FABRIC_QUANTITY_OVER_ALLOCATED",
  ),
);

let repaired = removeFutureFabricAssignment({
  state: legacyState,
  garmentKey: "base:bum_shorts",
});
repaired = removeFutureFabricAssignment({
  state: repaired,
  garmentKey: "base:standard_shorts",
});
repaired = assign(repaired, fourOrdinary, "base:standard_shorts", "FAB-A").state;
repaired = assign(repaired, fourOrdinary, "base:bum_shorts", "FAB-B").state;
assert.deepEqual(planningOf(fourOrdinary, repaired), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
assert.equal(completionOf(fourOrdinary, repaired).isComplete, true);

let additionalState = fourState;
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
);
assert.equal(planningOf(fourOrdinary, additionalState).requiredFabricQuantity, 3);
assert.equal(
  canCreatePhysicalFabricAllocation({
    state: additionalState,
    garmentTypeSelection: createSelection(fourOrdinary),
  }),
  true,
  "An additional garment must raise the allocation ceiling.",
);
additionalState = applyFutureFabricCardSelection({
  state: additionalState,
  garmentTypeSelection: createSelection(fourOrdinary),
  garmentKey: "additional:shirt:1",
  fabricCode: "FAB-C",
});
assert.equal(planningOf(fourOrdinary, additionalState).selectedFabricQuantity, 3);
assert.ok(
  additionalState.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === "FAB-C" &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "additional:shirt:1",
      ),
  ),
);

const twoOrdinary = ["shirt", "trouser"] satisfies FabricGarmentType[];
let twoShared = assign(empty(), twoOrdinary, "base:shirt", "FAB-A").state;
twoShared = assign(twoShared, twoOrdinary, "base:trouser", "FAB-A").state;
const blockedTwoSplit = assign(twoShared, twoOrdinary, "base:shirt", "FAB-B");
assert.equal(blockedTwoSplit.status, "blocked");
assert.equal(
  blockedTwoSplit.status === "blocked" ? blockedTwoSplit.reason : null,
  "FABRIC_QUANTITY_LIMIT_REACHED",
);
assert.equal(
  formatFabricQuantityLimitReachedCopy(2),
  "You have selected the 2 fabrics needed for this order. Use one of your selected fabrics for the remaining garments, or change a selected fabric.",
);

console.log("test_step2_fabric_allocation_limit: ok");
