import assert from "node:assert/strict";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { FabricCapacityEngine } from "./src/engine/FabricCapacityEngine";
import type { FabricAllocationState, FabricGarmentAssignment } from "./src/types";

const summarize = (assignment: FabricGarmentAssignment) => {
  const summary: Record<string, unknown> = {
    garmentKey: assignment.garmentKey,
    code: assignment.code,
    garmentType: assignment.garmentType,
    fabricUnits: assignment.fabricUnits,
  };
  if (assignment.lowerGarmentType) {
    summary.lowerGarmentType = assignment.lowerGarmentType;
  }
  return summary;
};

const resolveActiveAllocation = (state: FabricAllocationState) => {
  const allocation = state.fabricAllocations.find(
    (allocation) => allocation.allocationId === state.activeAllocationId,
  );
  assert(allocation, "Expected active allocation to exist");
  return FabricCapacityEngine.resolveFabricAllocation(allocation);
};

const assertAllocationAssignment = (
  state: FabricAllocationState,
  expectedGarmentCount: number,
  expectedAssignments: Array<{
    garmentKey: string;
    code: string;
    garmentType: string;
    fabricUnits: number;
    lowerGarmentType?: "trousers" | "skirt";
  }>,
) => {
  const allocation = state.fabricAllocations.find(
    (allocation) => allocation.allocationId === state.activeAllocationId,
  );
  assert(allocation, "Missing active allocation");
  assert.equal(allocation.garmentAssignments.length, expectedGarmentCount);
  assert.deepEqual(
    allocation.garmentAssignments.map(summarize),
    expectedAssignments,
  );
};

const assertPendingGarment = (
  state: FabricAllocationState,
  expectedGarmentKey: string,
) => {
  assert(state.pendingFabricGarment, "Expected a pending garment");
  assert.equal(state.pendingFabricGarment.garmentKey, expectedGarmentKey);
};

const emptyState = FabricAllocationStateEngine.initialize();

const stateG1 = FabricAllocationStateEngine.syncForSelectedFabric(emptyState, "FABRIC_TEST", {
  code: "G1",
});
assert.equal(stateG1.fabricAllocations.length, 1);
assert.equal(stateG1.activeAllocationId, stateG1.fabricAllocations[0].allocationId);
assertAllocationAssignment(stateG1, 1, [
  { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
]);
assert.equal(stateG1.pendingFabricGarment, null);

const resolvedG1 = resolveActiveAllocation(stateG1);
assert.equal(resolvedG1.status, "resolved");
assert.equal(resolvedG1.totalUnits, 1);
assert.deepEqual(summarize(resolvedG1.garments[0]), {
  garmentKey: "G1:shirt",
  code: "G1",
  garmentType: "shirt",
  fabricUnits: 1,
});

const stateG5 = FabricAllocationStateEngine.syncForSelectedFabric(emptyState, "FABRIC_TEST", {
  code: "G5.2",
});
assert.equal(stateG5.fabricAllocations.length, 1);
assertAllocationAssignment(stateG5, 2, [
  { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
]);
const resolvedG5 = resolveActiveAllocation(stateG5);
assert.equal(resolvedG5.status, "resolved");
assert.equal(resolvedG5.totalUnits, 2);
assert.deepEqual(resolvedG5.garments.map(summarize), [
  { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
]);

const stateG1Again = FabricAllocationStateEngine.syncForSelectedFabric(stateG1, "FABRIC_TEST", {
  code: "G1",
});
assert.equal(stateG1Again.fabricAllocations.length, 1);
assert.equal(stateG1Again.activeAllocationId, stateG1.activeAllocationId);
assertAllocationAssignment(stateG1Again, 1, [
  { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
]);

const stateG5FromG1 = FabricAllocationStateEngine.syncForSelectedFabric(stateG1, "FABRIC_TEST", {
  code: "G5.2",
});
assert.equal(stateG5FromG1.fabricAllocations.length, 1);
assert.equal(stateG5FromG1.activeAllocationId, stateG1.activeAllocationId);
assertAllocationAssignment(stateG5FromG1, 2, [
  { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
]);
assert.equal(stateG5FromG1.pendingFabricGarment, null);

const stateOverflow = FabricAllocationStateEngine.attemptAppendGarment(stateG5, {
  code: "L7",
  lowerGarmentType: "skirt",
});
assert.equal(stateOverflow.fabricAllocations.length, 1);
assertAllocationAssignment(stateOverflow, 2, [
  { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
]);
assertPendingGarment(stateOverflow, "L7:skirt");

const stateKaftan = FabricAllocationStateEngine.syncForSelectedFabric(emptyState, "FABRIC_KAFTAN", {
  code: "KAFTAN",
  garmentSpec: {
    key: "KAFTAN:kaftan",
    garmentType: "kaftan",
    fabricUnits: 2,
  },
});
assert.equal(stateKaftan.fabricAllocations.length, 1);
assertAllocationAssignment(stateKaftan, 1, [
  { garmentKey: "KAFTAN:kaftan", code: "KAFTAN", garmentType: "kaftan", fabricUnits: 2 },
]);
const resolvedKaftan = resolveActiveAllocation(stateKaftan);
assert.equal(resolvedKaftan.status, "resolved");
assert.equal(resolvedKaftan.totalUnits, 2);
assert.deepEqual(resolvedKaftan.garments.map(summarize), [
  { garmentKey: "KAFTAN:kaftan", code: "KAFTAN", garmentType: "kaftan", fabricUnits: 2 },
]);

const stateKaftanOverflow = FabricAllocationStateEngine.attemptAppendGarment(stateKaftan, {
  code: "G4",
});
assert.equal(stateKaftanOverflow.fabricAllocations.length, 1);
assertAllocationAssignment(stateKaftanOverflow, 1, [
  { garmentKey: "KAFTAN:kaftan", code: "KAFTAN", garmentType: "kaftan", fabricUnits: 2 },
]);
assertPendingGarment(stateKaftanOverflow, "G4:trouser");

const stateSharedOne = FabricAllocationStateEngine.syncForSelectedFabric(emptyState, "FAB_SHARED", {
  code: "G1",
});
const stateSharedTwo = FabricAllocationStateEngine.createAllocationForFabric(
  stateSharedOne,
  "FAB_SHARED",
);
assert.equal(stateSharedTwo.fabricAllocations.length, 2);
assert.notEqual(
  stateSharedTwo.fabricAllocations[0].allocationId,
  stateSharedTwo.fabricAllocations[1].allocationId,
);
assert.equal(stateSharedTwo.fabricAllocations[0].fabricCode, "FAB_SHARED");
assert.equal(stateSharedTwo.fabricAllocations[1].fabricCode, "FAB_SHARED");
assert.equal(stateSharedTwo.activeAllocationId, stateSharedTwo.fabricAllocations[1].allocationId);

const stateUnknown = FabricAllocationStateEngine.syncForSelectedFabric(stateG1, "FABRIC_TEST", {
  code: "UNKNOWN",
});
assert.equal(stateUnknown.fabricAllocations.length, 1);
assert.equal(stateUnknown.activeAllocationId, stateG1.activeAllocationId);
assertAllocationAssignment(stateUnknown, 1, [
  { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
]);
assert.equal(stateUnknown.pendingFabricGarment, null);

console.log("All fabric allocation state tests passed.");
