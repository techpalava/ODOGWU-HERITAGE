import assert from "node:assert/strict";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import {
  FABRIC_APPEND_GARMENT_CHOICES,
  FabricCapacityEngine,
  type AppendableFabricGarmentType,
} from "./src/engine/FabricCapacityEngine";
import type {
  FabricAllocationState,
  FabricGarmentAssignment,
} from "./src/types";

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

const assertNoPendingGarment = (state: FabricAllocationState) => {
  assert.equal(state.pendingFabricGarment, null);
  assert.equal(state.awaitingFabricForPendingGarment, false);
};

const findAllocation = (state: FabricAllocationState, allocationId: string) => {
  const allocation = state.fabricAllocations.find(
    (candidate) => candidate.allocationId === allocationId,
  );
  assert(allocation, `Missing allocation ${allocationId}`);
  return allocation;
};

const getAppendChoice = (garmentType: AppendableFabricGarmentType) => {
  const choice = FABRIC_APPEND_GARMENT_CHOICES.find(
    (candidate) => candidate.id === garmentType,
  );
  assert(choice, `Missing append choice for ${garmentType}`);
  return choice;
};

const emptyState = FabricAllocationStateEngine.initialize();

const stateG1 = FabricAllocationStateEngine.syncPrimaryGarmentSelection(
  emptyState,
  "FABRIC_TEST",
  {
    code: "G1",
  },
);
assert.equal(stateG1.fabricAllocations.length, 1);
assert.equal(stateG1.activeAllocationId, stateG1.fabricAllocations[0].allocationId);
assertAllocationAssignment(stateG1, 1, [
  { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
]);
assertNoPendingGarment(stateG1);

const resolvedG1 = resolveActiveAllocation(stateG1);
assert.equal(resolvedG1.status, "resolved");
assert.equal(resolvedG1.totalUnits, 1);
assert.deepEqual(resolvedG1.garments.map(summarize), [
  { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
]);

const stateG1Repeated = FabricAllocationStateEngine.syncPrimaryGarmentSelection(
  stateG1,
  "FABRIC_TEST",
  {
    code: "G1",
  },
);
assert.equal(stateG1Repeated.fabricAllocations.length, 1);
assert.equal(stateG1Repeated.activeAllocationId, stateG1.activeAllocationId);
assertAllocationAssignment(stateG1Repeated, 1, [
  { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
]);
assertNoPendingGarment(stateG1Repeated);

const stateG5FromG1 = FabricAllocationStateEngine.syncPrimaryGarmentSelection(
  stateG1,
  "FABRIC_TEST",
  {
    code: "G5.2",
  },
);
assert.equal(stateG5FromG1.fabricAllocations.length, 1);
assert.equal(stateG5FromG1.activeAllocationId, stateG1.activeAllocationId);
assertAllocationAssignment(stateG5FromG1, 2, [
  { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
]);
assertNoPendingGarment(stateG5FromG1);

const stateUnknownFromG5 = FabricAllocationStateEngine.syncPrimaryGarmentSelection(
  stateG5FromG1,
  "FABRIC_TEST",
  {
    code: "UNKNOWN",
  },
);
assert.equal(stateUnknownFromG5.fabricAllocations.length, 1);
assert.equal(stateUnknownFromG5.activeAllocationId, stateG5FromG1.activeAllocationId);
assertAllocationAssignment(stateUnknownFromG5, 2, [
  { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
]);
assertNoPendingGarment(stateUnknownFromG5);

const stateG5 = FabricAllocationStateEngine.syncPrimaryGarmentSelection(emptyState, "FABRIC_A", {
  code: "G5.2",
});
assert.equal(stateG5.fabricAllocations.length, 1);
assertAllocationAssignment(stateG5, 2, [
  { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
]);
assertNoPendingGarment(stateG5);

const resolvedG5 = resolveActiveAllocation(stateG5);
assert.equal(resolvedG5.status, "resolved");
assert.equal(resolvedG5.totalUnits, 2);
assert.deepEqual(resolvedG5.garments.map(summarize), [
  { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
]);

const explicitAppendStart = FabricAllocationStateEngine.createAllocationForFabric(
  emptyState,
  "FABRIC_APPEND",
);
const explicitAppendShirt = FabricAllocationStateEngine.attemptAppendGarment(
  explicitAppendStart,
  getAppendChoice("shirt").selection,
);
const explicitAppendShirtTrouser =
  FabricAllocationStateEngine.attemptAppendGarment(
    explicitAppendShirt,
    getAppendChoice("trouser").selection,
  );
assertAllocationAssignment(explicitAppendShirtTrouser, 2, [
  {
    garmentKey: "append:shirt",
    code: "APPEND_SHIRT",
    garmentType: "shirt",
    fabricUnits: 1,
  },
  {
    garmentKey: "append:trouser",
    code: "APPEND_TROUSER",
    garmentType: "trouser",
    fabricUnits: 1,
  },
]);
assertNoPendingGarment(explicitAppendShirtTrouser);

const explicitAppendOverflow = FabricAllocationStateEngine.attemptAppendGarment(
  explicitAppendShirtTrouser,
  getAppendChoice("skirt").selection,
);
assertAllocationAssignment(explicitAppendOverflow, 2, [
  {
    garmentKey: "append:shirt",
    code: "APPEND_SHIRT",
    garmentType: "shirt",
    fabricUnits: 1,
  },
  {
    garmentKey: "append:trouser",
    code: "APPEND_TROUSER",
    garmentType: "trouser",
    fabricUnits: 1,
  },
]);
assertPendingGarment(explicitAppendOverflow, "append:skirt");

const explicitAppendSameFabric =
  FabricAllocationStateEngine.useSameFabricForPendingGarment(
    explicitAppendOverflow,
  );
assert.equal(explicitAppendSameFabric.fabricAllocations.length, 2);
assert.equal(
  explicitAppendSameFabric.fabricAllocations[0].fabricCode,
  "FABRIC_APPEND",
);
assert.equal(
  explicitAppendSameFabric.fabricAllocations[1].fabricCode,
  "FABRIC_APPEND",
);
assert.notEqual(
  explicitAppendSameFabric.fabricAllocations[0].allocationId,
  explicitAppendSameFabric.fabricAllocations[1].allocationId,
);
assert.deepEqual(
  explicitAppendSameFabric.fabricAllocations[1].garmentAssignments.map(summarize),
  [
    {
      garmentKey: "append:skirt",
      code: "APPEND_SKIRT",
      garmentType: "skirt",
      fabricUnits: 1,
    },
  ],
);

const explicitAppendChooseAnotherStarted =
  FabricAllocationStateEngine.beginChooseAnotherFabric(
    explicitAppendOverflow,
  );
assertPendingGarment(explicitAppendChooseAnotherStarted, "append:skirt");
assert.equal(
  explicitAppendChooseAnotherStarted.awaitingFabricForPendingGarment,
  true,
);
const explicitAppendChooseAnotherResolved =
  FabricAllocationStateEngine.assignPendingGarmentToFabric(
    explicitAppendChooseAnotherStarted,
    "FABRIC_APPEND_B",
  );
assert.equal(explicitAppendChooseAnotherResolved.fabricAllocations.length, 2);
assert.equal(
  explicitAppendChooseAnotherResolved.fabricAllocations[0].fabricCode,
  "FABRIC_APPEND",
);
assert.equal(
  explicitAppendChooseAnotherResolved.fabricAllocations[1].fabricCode,
  "FABRIC_APPEND_B",
);
assert.deepEqual(
  explicitAppendChooseAnotherResolved.fabricAllocations[1].garmentAssignments.map(
    summarize,
  ),
  [
    {
      garmentKey: "append:skirt",
      code: "APPEND_SKIRT",
      garmentType: "skirt",
      fabricUnits: 1,
    },
  ],
);
assertNoPendingGarment(explicitAppendChooseAnotherResolved);

const explicitAppendCancelled =
  FabricAllocationStateEngine.cancelPendingGarment(explicitAppendOverflow);
assert.deepEqual(
  explicitAppendCancelled.fabricAllocations,
  explicitAppendOverflow.fabricAllocations,
);
assertNoPendingGarment(explicitAppendCancelled);

const stateL7WithoutLowerType = FabricAllocationStateEngine.syncPrimaryGarmentSelection(
  stateG5,
  "FABRIC_A",
  {
    code: "L7",
  },
);
assert.equal(stateL7WithoutLowerType.fabricAllocations.length, 1);
assertAllocationAssignment(stateL7WithoutLowerType, 2, [
  { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
]);
assertNoPendingGarment(stateL7WithoutLowerType);

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
assert.equal(stateOverflow.awaitingFabricForPendingGarment, false);

const stateSameFabric = FabricAllocationStateEngine.useSameFabricForPendingGarment(
  stateOverflow,
);
assert.equal(stateSameFabric.fabricAllocations.length, 2);
const originalAllocationId = stateOverflow.fabricAllocations[0].allocationId;
const originalFromSameFabric = findAllocation(stateSameFabric, originalAllocationId);
assert.deepEqual(
  originalFromSameFabric.garmentAssignments.map(summarize),
  [
    { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
    { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
  ],
);
const sameFabricOverflowAllocation = stateSameFabric.fabricAllocations.find(
  (allocation) => allocation.allocationId === stateSameFabric.activeAllocationId,
);
assert(sameFabricOverflowAllocation, "Expected active same-fabric allocation");
assert.equal(sameFabricOverflowAllocation.fabricCode, "FABRIC_A");
assert.notEqual(sameFabricOverflowAllocation.allocationId, originalAllocationId);
assert.deepEqual(
  sameFabricOverflowAllocation.garmentAssignments.map(summarize),
  [
    { garmentKey: "L7:skirt", code: "L7", garmentType: "skirt", fabricUnits: 1, lowerGarmentType: "skirt" },
  ],
);
assertNoPendingGarment(stateSameFabric);

const secondOverflowFromG52 = FabricAllocationStateEngine.attemptAppendGarment(stateG5, {
  code: "L7",
  lowerGarmentType: "skirt",
});
const chooseAnotherStarted = FabricAllocationStateEngine.beginChooseAnotherFabric(
  secondOverflowFromG52,
);
assert.equal(chooseAnotherStarted.awaitingFabricForPendingGarment, true);
assertPendingGarment(chooseAnotherStarted, "L7:skirt");

const chooseAnotherSameCodeResolved = FabricAllocationStateEngine.assignPendingGarmentToFabric(
  chooseAnotherStarted,
  "FABRIC_A",
);
assert.equal(chooseAnotherSameCodeResolved.fabricAllocations.length, 2);
const sameCodeNewAllocation = chooseAnotherSameCodeResolved.fabricAllocations.find(
  (allocation) => allocation.allocationId === chooseAnotherSameCodeResolved.activeAllocationId,
);
assert(sameCodeNewAllocation, "Expected active allocation after same-code pending assignment");
assert.notEqual(sameCodeNewAllocation.allocationId, originalAllocationId);
assert.equal(sameCodeNewAllocation.fabricCode, "FABRIC_A");
assert.deepEqual(
  sameCodeNewAllocation.garmentAssignments.map(summarize),
  [
    { garmentKey: "L7:skirt", code: "L7", garmentType: "skirt", fabricUnits: 1, lowerGarmentType: "skirt" },
  ],
);
assertNoPendingGarment(chooseAnotherSameCodeResolved);

const chooseAnotherResolved = FabricAllocationStateEngine.assignPendingGarmentToFabric(
  chooseAnotherStarted,
  "FABRIC_B",
);
assert.equal(chooseAnotherResolved.fabricAllocations.length, 2);
const originalFromAnotherFlow = findAllocation(
  chooseAnotherResolved,
  originalAllocationId,
);
assert.deepEqual(
  originalFromAnotherFlow.garmentAssignments.map(summarize),
  [
    { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
    { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
  ],
);
const anotherFabricAllocation = chooseAnotherResolved.fabricAllocations.find(
  (allocation) => allocation.fabricCode === "FABRIC_B",
);
assert(anotherFabricAllocation, "Expected a new FABRIC_B allocation");
assert.deepEqual(
  anotherFabricAllocation.garmentAssignments.map(summarize),
  [
    { garmentKey: "L7:skirt", code: "L7", garmentType: "skirt", fabricUnits: 1, lowerGarmentType: "skirt" },
  ],
);
assert.equal(
  chooseAnotherResolved.activeAllocationId,
  anotherFabricAllocation.allocationId,
);
assertNoPendingGarment(chooseAnotherResolved);

const cancelledOverflow = FabricAllocationStateEngine.cancelPendingGarment(
  stateOverflow,
);
assert.equal(cancelledOverflow.fabricAllocations.length, 1);
assert.equal(cancelledOverflow.activeAllocationId, stateOverflow.activeAllocationId);
assert.deepEqual(
  cancelledOverflow.fabricAllocations[0].garmentAssignments.map(summarize),
  [
    { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
    { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
  ],
);
assertNoPendingGarment(cancelledOverflow);

const stateKaftan = FabricAllocationStateEngine.syncPrimaryGarmentSelection(emptyState, "FABRIC_KAFTAN", {
  code: "KAFTAN",
  garmentSpec: {
    key: "KAFTAN:kaftan",
    garmentType: "kaftan",
    fabricUnits: 1,
  },
});
assert.equal(stateKaftan.fabricAllocations.length, 1);
assertAllocationAssignment(stateKaftan, 1, [
  { garmentKey: "KAFTAN:kaftan", code: "KAFTAN", garmentType: "kaftan", fabricUnits: 1 },
]);
const resolvedKaftan = resolveActiveAllocation(stateKaftan);
assert.equal(resolvedKaftan.status, "resolved");
assert.equal(resolvedKaftan.totalUnits, 1);
assert.deepEqual(resolvedKaftan.garments.map(summarize), [
  { garmentKey: "KAFTAN:kaftan", code: "KAFTAN", garmentType: "kaftan", fabricUnits: 1 },
]);

const stateKaftanWithShirt = FabricAllocationStateEngine.attemptAppendGarment(stateKaftan, {
  code: "G1",
});
assert.equal(stateKaftanWithShirt.fabricAllocations.length, 1);
assertAllocationAssignment(stateKaftanWithShirt, 2, [
  { garmentKey: "KAFTAN:kaftan", code: "KAFTAN", garmentType: "kaftan", fabricUnits: 1 },
  { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
]);
assertNoPendingGarment(stateKaftanWithShirt);
const resolvedKaftanWithShirt = resolveActiveAllocation(stateKaftanWithShirt);
assert.equal(resolvedKaftanWithShirt.status, "resolved");
assert.equal(resolvedKaftanWithShirt.totalUnits, 2);

const stateKaftanOverflow = FabricAllocationStateEngine.attemptAppendGarment(stateKaftanWithShirt, {
  code: "G4",
});
assert.equal(stateKaftanOverflow.fabricAllocations.length, 1);
assertAllocationAssignment(stateKaftanOverflow, 2, [
  { garmentKey: "KAFTAN:kaftan", code: "KAFTAN", garmentType: "kaftan", fabricUnits: 1 },
  { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
]);
assertPendingGarment(stateKaftanOverflow, "G4:trouser");

const stateKaftanSameFabric = FabricAllocationStateEngine.useSameFabricForPendingGarment(
  stateKaftanOverflow,
);
assert.equal(stateKaftanSameFabric.fabricAllocations.length, 2);
const kaftanOverflowAllocation = stateKaftanSameFabric.fabricAllocations.find(
  (allocation) => allocation.allocationId === stateKaftanSameFabric.activeAllocationId,
);
assert(kaftanOverflowAllocation, "Expected active kaftan overflow allocation");
assert.equal(kaftanOverflowAllocation.fabricCode, "FABRIC_KAFTAN");
assert.deepEqual(
  kaftanOverflowAllocation.garmentAssignments.map(summarize),
  [{ garmentKey: "G4:trouser", code: "G4", garmentType: "trouser", fabricUnits: 1 }],
);
assertNoPendingGarment(stateKaftanSameFabric);

const stateSharedOne = FabricAllocationStateEngine.syncPrimaryGarmentSelection(emptyState, "FAB_SHARED", {
  code: "G5.2",
});
const stateSharedOverflow = FabricAllocationStateEngine.attemptAppendGarment(stateSharedOne, {
  code: "L7",
  lowerGarmentType: "skirt",
});
const stateSharedTwo = FabricAllocationStateEngine.useSameFabricForPendingGarment(
  stateSharedOverflow,
);
assert.equal(stateSharedTwo.fabricAllocations.length, 2);
assert.notEqual(
  stateSharedTwo.fabricAllocations[0].allocationId,
  stateSharedTwo.fabricAllocations[1].allocationId,
);
assert.equal(stateSharedTwo.fabricAllocations[0].fabricCode, "FAB_SHARED");
assert.equal(stateSharedTwo.fabricAllocations[1].fabricCode, "FAB_SHARED");
assert.equal(stateSharedTwo.activeAllocationId, stateSharedTwo.fabricAllocations[1].allocationId);

const stateUnknown = FabricAllocationStateEngine.syncPrimaryGarmentSelection(stateG5, "FABRIC_A", {
  code: "UNKNOWN",
});
assert.equal(stateUnknown.fabricAllocations.length, 1);
assert.equal(stateUnknown.activeAllocationId, stateG5.activeAllocationId);
assertAllocationAssignment(stateUnknown, 2, [
  { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
]);
assertNoPendingGarment(stateUnknown);

console.log("All fabric allocation state tests passed.");
