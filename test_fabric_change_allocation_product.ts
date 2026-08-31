import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricGarmentType } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  changeFutureFabricAllocationProduct,
  getFutureFabricAllocationAssignmentSignature,
} from "./src/utils/designStudioFutureFabricStage";
import {
  canCreatePhysicalFabricAllocationForStock,
  getFabricPhysicalAllocationCount,
  getFabricRemainingPhysicalStock,
} from "./src/utils/fabricStockAvailability";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const createSelection = (garmentTypes: FabricGarmentType[]) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: ["unisex"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const createFabric = (
  code: string,
  name: string,
  stock?: number,
  stockStatus: Fabric["stockStatus"] = "IN_STOCK",
): Fabric => ({
  code,
  name,
  description: name,
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus,
  category: "Test Fabric",
  price: 10,
  stock,
});

const fabricA = createFabric("FAB-A", "Fabric A", 3);
const fabricB = createFabric("FAB-B", "Fabric B", 2);
const fabricC = createFabric("FAB-C", "Fabric C", 1);
const fabricD = createFabric("FAB-D", "Fabric D", 2);
const fabrics = [fabricA, fabricB, fabricC, fabricD];

const assign = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
  selection: ReturnType<typeof createSelection>,
  garmentKey: string,
  fabricCode: string,
) =>
  assignFutureFabricToGarment({
    state,
    garmentTypeSelection: selection,
    garmentKey,
    fabricCode,
    fabrics,
  });

const selectionThree = createSelection(["shirt", "trouser", "full_length_gown"]);

let state = FabricAllocationStateEngine.initialize();
state = assign(state, selectionThree, "base:full_length_gown", "FAB-A").state;
state = assign(state, selectionThree, "base:shirt", "FAB-B").state;
state = assign(state, selectionThree, "base:trouser", "FAB-B").state;

const allocationB = state.fabricAllocations.find((allocation) =>
  allocation.garmentAssignments.some(
    (assignment) => assignment.garmentKey === "base:shirt",
  ),
)!;
const allocationA = state.fabricAllocations.find((allocation) =>
  allocation.garmentAssignments.some(
    (assignment) => assignment.garmentKey === "base:full_length_gown",
  ),
)!;

const shirtFirstAssignments = allocationB.garmentAssignments.filter(
  (assignment) =>
    assignment.garmentKey === "base:shirt" ||
    assignment.garmentKey === "base:trouser",
);
const trouserFirstAssignments = [
  shirtFirstAssignments.find(
    (assignment) => assignment.garmentKey === "base:trouser",
  )!,
  shirtFirstAssignments.find(
    (assignment) => assignment.garmentKey === "base:shirt",
  )!,
];
const signatureShirtFirst = getFutureFabricAllocationAssignmentSignature({
  garmentAssignments: shirtFirstAssignments,
});
const signatureTrouserFirst = getFutureFabricAllocationAssignmentSignature({
  garmentAssignments: trouserFirstAssignments,
});
assert.equal(
  signatureShirtFirst,
  signatureTrouserFirst,
  "Assignment signatures must ignore incidental garment assignment array ordering.",
);

const changed = changeFutureFabricAllocationProduct({
  state,
  allocationId: allocationB.allocationId,
  nextFabricCode: "FAB-D",
  fabrics,
});
assert.equal(changed.status, "assigned");
assert.equal(
  changed.status === "assigned"
    ? changed.state.fabricAllocations.find(
        (allocation) => allocation.allocationId === allocationB.allocationId,
      )?.fabricCode
    : null,
  "FAB-D",
);
assert.equal(
  changed.status === "assigned"
    ? changed.state.fabricAllocations.find(
        (allocation) => allocation.allocationId === allocationA.allocationId,
      )?.fabricCode
    : null,
  "FAB-A",
);
assert.deepEqual(
  changed.status === "assigned"
    ? changed.state.fabricAllocations
        .find((allocation) => allocation.allocationId === allocationB.allocationId)
        ?.garmentAssignments.map((assignment) => assignment.garmentKey)
        .sort()
    : null,
  ["base:shirt", "base:trouser"],
);
assert.equal(
  changed.status === "assigned" ? changed.state.fabricAllocations.length : null,
  2,
);

const fromTrouser = changeFutureFabricAllocationProduct({
  state,
  allocationId: allocationB.allocationId,
  nextFabricCode: "FAB-D",
  fabrics,
});
assert.equal(fromTrouser.status, "assigned");

let stockState = FabricAllocationStateEngine.initialize();
stockState = assign(stockState, selectionThree, "base:shirt", "FAB-B").state;
stockState = assign(stockState, selectionThree, "base:trouser", "FAB-B").state;
stockState = assign(stockState, selectionThree, "base:full_length_gown", "FAB-C").state;
const sharedB = stockState.fabricAllocations.find(
  (allocation) => allocation.fabricCode === "FAB-B",
)!;
const blocked = changeFutureFabricAllocationProduct({
  state: stockState,
  allocationId: sharedB.allocationId,
  nextFabricCode: "FAB-C",
  fabrics,
});
assert.equal(blocked.status, "blocked");
assert.equal(
  blocked.status === "blocked" ? blocked.reason : null,
  "FABRIC_STOCK_EXHAUSTED",
);
assert.equal(
  stockState.fabricAllocations.find(
    (allocation) => allocation.allocationId === sharedB.allocationId,
  )?.fabricCode,
  "FAB-B",
);

let successStockState = FabricAllocationStateEngine.initialize();
successStockState = assign(
  successStockState,
  selectionThree,
  "base:full_length_gown",
  "FAB-C",
).state;
successStockState = assign(
  successStockState,
  selectionThree,
  "base:shirt",
  "FAB-B",
).state;
successStockState = assign(
  successStockState,
  selectionThree,
  "base:trouser",
  "FAB-B",
).state;
const sharedBSuccess = successStockState.fabricAllocations.find(
  (allocation) => allocation.fabricCode === "FAB-B",
)!;
const stockSuccess = changeFutureFabricAllocationProduct({
  state: successStockState,
  allocationId: sharedBSuccess.allocationId,
  nextFabricCode: "FAB-D",
  fabrics,
});
assert.equal(stockSuccess.status, "assigned");
assert.equal(
  getFabricPhysicalAllocationCount(
    stockSuccess.status === "assigned" ? stockSuccess.state : successStockState,
    "FAB-D",
  ),
  1,
);
assert.equal(
  getFabricPhysicalAllocationCount(
    stockSuccess.status === "assigned" ? stockSuccess.state : successStockState,
    "FAB-C",
  ),
  1,
);

let releaseState = FabricAllocationStateEngine.initialize();
const shirtTrouserSelection = createSelection(["shirt", "trouser"]);
releaseState = assign(releaseState, shirtTrouserSelection, "base:shirt", "FAB-B").state;
releaseState = assign(releaseState, shirtTrouserSelection, "base:trouser", "FAB-B").state;
const onlyB = releaseState.fabricAllocations[0]!;
assert.equal(getFabricPhysicalAllocationCount(releaseState, "FAB-B"), 1);
const released = changeFutureFabricAllocationProduct({
  state: releaseState,
  allocationId: onlyB.allocationId,
  nextFabricCode: "FAB-D",
  fabrics,
});
assert.equal(released.status, "assigned");
assert.equal(
  getFabricPhysicalAllocationCount(
    released.status === "assigned" ? released.state : releaseState,
    "FAB-B",
  ),
  0,
);
assert.equal(
  canCreatePhysicalFabricAllocationForStock({
    fabric: fabricB,
    state: released.status === "assigned" ? released.state : releaseState,
  }),
  true,
);

const noop = changeFutureFabricAllocationProduct({
  state: releaseState,
  allocationId: onlyB.allocationId,
  nextFabricCode: "FAB-B",
  fabrics,
});
assert.equal(noop.status, "assigned");
assert.equal(noop.state, releaseState);

let partialState = FabricAllocationStateEngine.initialize();
partialState = assign(
  partialState,
  createSelection(["trouser"]),
  "base:trouser",
  "FAB-B",
).state;
const partialAllocation = partialState.fabricAllocations[0]!;
const partialChanged = changeFutureFabricAllocationProduct({
  state: partialState,
  allocationId: partialAllocation.allocationId,
  nextFabricCode: "FAB-D",
  fabrics,
});
assert.equal(partialChanged.status, "assigned");
assert.equal(
  partialChanged.status === "assigned"
    ? partialChanged.state.fabricAllocations[0]?.garmentAssignments.length
    : null,
  1,
);
assert.equal(
  partialChanged.status === "assigned"
    ? partialChanged.state.fabricAllocations[0]?.allocationId
    : null,
  partialAllocation.allocationId,
);

let multiSameCodeState = FabricAllocationStateEngine.initialize();
const multiSelection = createSelection([
  "shirt",
  "trouser",
  "standard_shorts",
  "bum_shorts",
]);
multiSameCodeState = assign(
  multiSameCodeState,
  multiSelection,
  "base:shirt",
  "FAB-A",
).state;
multiSameCodeState = assign(
  multiSameCodeState,
  multiSelection,
  "base:trouser",
  "FAB-A",
).state;
multiSameCodeState = assign(
  multiSameCodeState,
  multiSelection,
  "base:standard_shorts",
  "FAB-A",
).state;
multiSameCodeState = assign(
  multiSameCodeState,
  multiSelection,
  "base:bum_shorts",
  "FAB-A",
).state;
const allocationA1 = multiSameCodeState.fabricAllocations.find((allocation) =>
  allocation.garmentAssignments.some(
    (assignment) => assignment.garmentKey === "base:shirt",
  ),
)!;
const allocationA2 = multiSameCodeState.fabricAllocations.find((allocation) =>
  allocation.garmentAssignments.some(
    (assignment) => assignment.garmentKey === "base:standard_shorts",
  ),
)!;
const isolatedChange = changeFutureFabricAllocationProduct({
  state: multiSameCodeState,
  allocationId: allocationA2.allocationId,
  nextFabricCode: "FAB-D",
  fabrics,
});
assert.equal(isolatedChange.status, "assigned");
assert.equal(
  isolatedChange.status === "assigned"
    ? isolatedChange.state.fabricAllocations.find(
        (allocation) => allocation.allocationId === allocationA1.allocationId,
      )?.fabricCode
    : null,
  "FAB-A",
);
assert.equal(
  isolatedChange.status === "assigned"
    ? isolatedChange.state.fabricAllocations.find(
        (allocation) => allocation.allocationId === allocationA2.allocationId,
      )?.fabricCode
    : null,
  "FAB-D",
);

const stale = changeFutureFabricAllocationProduct({
  state: multiSameCodeState,
  allocationId: "missing-allocation",
  nextFabricCode: "FAB-D",
  fabrics,
});
assert.equal(stale.status, "blocked");
assert.equal(
  stale.status === "blocked" ? stale.reason : null,
  "ALLOCATION_NOT_FOUND",
);

const staleFabricExpectation = {
  expectedCurrentFabricCode: allocationB.fabricCode,
  expectedAssignmentSignature:
    getFutureFabricAllocationAssignmentSignature(allocationB),
};
const changedFabricInPlace = changeFutureFabricAllocationProduct({
  state: {
    ...state,
    fabricAllocations: state.fabricAllocations.map((candidate) =>
      candidate.allocationId === allocationB.allocationId
        ? { ...candidate, fabricCode: "FAB-D" }
        : candidate,
    ),
  },
  allocationId: allocationB.allocationId,
  nextFabricCode: "FAB-D",
  fabrics,
  expectation: staleFabricExpectation,
});
assert.equal(changedFabricInPlace.status, "blocked");
assert.equal(
  changedFabricInPlace.status === "blocked" ? changedFabricInPlace.reason : null,
  "ALLOCATION_CHANGED",
);
assert.equal(
  changedFabricInPlace.state.fabricAllocations.find(
    (allocation) => allocation.allocationId === allocationB.allocationId,
  )?.fabricCode,
  "FAB-D",
);

const changedMembershipInPlace = changeFutureFabricAllocationProduct({
  state: {
    ...state,
    fabricAllocations: state.fabricAllocations.map((candidate) =>
      candidate.allocationId === allocationB.allocationId
        ? {
            ...candidate,
            garmentAssignments: candidate.garmentAssignments.filter(
              (assignment) => assignment.garmentKey !== "base:shirt",
            ),
          }
        : candidate,
    ),
  },
  allocationId: allocationB.allocationId,
  nextFabricCode: "FAB-D",
  fabrics,
  expectation: staleFabricExpectation,
});
assert.equal(changedMembershipInPlace.status, "blocked");
assert.equal(
  changedMembershipInPlace.status === "blocked"
    ? changedMembershipInPlace.reason
    : null,
  "ALLOCATION_CHANGED",
);

const staleSameFabricNoOp = changeFutureFabricAllocationProduct({
  state: {
    ...state,
    fabricAllocations: state.fabricAllocations.map((candidate) =>
      candidate.allocationId === allocationB.allocationId
        ? { ...candidate, fabricCode: "FAB-D" }
        : candidate,
    ),
  },
  allocationId: allocationB.allocationId,
  nextFabricCode: "FAB-D",
  fabrics,
  expectation: staleFabricExpectation,
});
assert.equal(staleSameFabricNoOp.status, "blocked");
assert.equal(
  staleSameFabricNoOp.status === "blocked" ? staleSameFabricNoOp.reason : null,
  "ALLOCATION_CHANGED",
);

const missingCatalogueFabric = changeFutureFabricAllocationProduct({
  state,
  allocationId: allocationB.allocationId,
  nextFabricCode: "UNKNOWN-FABRIC",
  fabrics,
});
assert.equal(missingCatalogueFabric.status, "blocked");
assert.equal(
  missingCatalogueFabric.status === "blocked" ? missingCatalogueFabric.reason : null,
  "FABRIC_NOT_FOUND",
);

assert.equal(
  getFabricRemainingPhysicalStock(
    fabricB,
    released.status === "assigned" ? released.state : releaseState,
  ),
  2,
);

console.log("PASS: shared-group change fabric allocation product");
