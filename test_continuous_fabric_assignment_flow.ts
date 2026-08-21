import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createStyleBaseGarmentSpec,
  getFabricGarmentSelectionsForComposition,
} from "./src/config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { FabricGarmentType } from "./src/types";
import { cloneFabricAllocations } from "./src/utils/fabricAllocationPersistence";

const fabricA = "FABRIC-A";
const fabricB = "FABRIC-B";
const fabricC = "FABRIC-C";

const selectionsFor = (...garmentTypes: FabricGarmentType[]) =>
  getFabricGarmentSelectionsForComposition(
    garmentTypes.map(createStyleBaseGarmentSpec),
  );

const startAssignment = (...garmentTypes: FabricGarmentType[]) =>
  FabricAllocationStateEngine.syncPrimaryGarmentComposition(
    FabricAllocationStateEngine.initialize(),
    fabricA,
    selectionsFor(...garmentTypes),
  );

const assignmentKeys = (state: ReturnType<typeof startAssignment>) =>
  state.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  );

const singleGarment = startAssignment("shirt");
assert.equal(singleGarment.pendingFabricGarment, null);
assert.equal(
  FabricAllocationStateEngine.resolveUnassignedPhysicalGarments(
    singleGarment,
    selectionsFor("shirt"),
  ).unassignedGarments.length,
  0,
  "A single garment remains a normal one-fabric flow.",
);

const twoSameFabric = startAssignment("shirt", "trouser");
assert.equal(twoSameFabric.fabricAllocations.length, 1);
assert.equal(twoSameFabric.fabricAllocations[0].garmentAssignments.length, 2);
assert.equal(twoSameFabric.pendingFabricGarment, null);

const threeSelections = selectionsFor("shirt", "trouser", "skirt");
const threeInitial = startAssignment("shirt", "trouser", "skirt");
assert.equal(threeInitial.pendingFabricGarment?.garmentType, "skirt");
assert.equal(
  FabricAllocationStateEngine.resolveUnassignedPhysicalGarments(
    threeInitial,
    threeSelections,
  ).unassignedGarments.length,
  1,
  "The third garment is derived as unassigned from allocations, not local UI state.",
);
const threeSameFabric =
  FabricAllocationStateEngine.useSameFabricForPendingGarmentAndContinue(
    threeInitial,
    threeSelections,
  );
assert.equal(threeSameFabric.fabricAllocations.length, 2);
assert.equal(threeSameFabric.pendingFabricGarment, null);
assert.deepEqual(
  threeSameFabric.fabricAllocations.map((allocation) => allocation.fabricCode),
  [fabricA, fabricA],
);
assert.equal(
  FabricAllocationStateEngine.resolveUnassignedPhysicalGarments(
    threeSameFabric,
    threeSelections,
  ).unassignedGarments.length,
  0,
);

const fourSelections = selectionsFor("shirt", "trouser", "skirt", "bum_shorts");
const fourSameFabric =
  FabricAllocationStateEngine.useSameFabricForPendingGarmentAndContinue(
    startAssignment("shirt", "trouser", "skirt", "bum_shorts"),
    fourSelections,
  );
assert.equal(fourSameFabric.pendingFabricGarment, null);
assert.equal(fourSameFabric.fabricAllocations.length, 2);
assert.deepEqual(
  fourSameFabric.fabricAllocations.map((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentType),
  ),
  [["shirt", "trouser"], ["skirt", "bum_shorts"]],
  "One Same Fabric action continuously packs compatible remaining garments.",
);

const fiveSelections = selectionsFor(
  "shirt",
  "trouser",
  "skirt",
  "bum_shorts",
  "dress",
);
const fiveAfterFirstSameFabric =
  FabricAllocationStateEngine.useSameFabricForPendingGarmentAndContinue(
    startAssignment("shirt", "trouser", "skirt", "bum_shorts", "dress"),
    fiveSelections,
  );
assert.equal(fiveAfterFirstSameFabric.pendingFabricGarment?.garmentType, "dress");
const fiveSameFabric =
  FabricAllocationStateEngine.useSameFabricForPendingGarmentAndContinue(
    fiveAfterFirstSameFabric,
    fiveSelections,
  );
assert.equal(fiveSameFabric.pendingFabricGarment, null);
assert.equal(fiveSameFabric.fabricAllocations.length, 3);

const kaftanTrouserSameFabric = startAssignment("kaftan", "trouser");
assert.equal(kaftanTrouserSameFabric.pendingFabricGarment, null);
assert.equal(kaftanTrouserSameFabric.fabricAllocations.length, 1);
assert.deepEqual(
  kaftanTrouserSameFabric.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentType,
  ),
  ["kaftan", "trouser"],
);

const threeDifferentFabricInitial = startAssignment("shirt", "trouser", "skirt");
const threeDifferentFabric =
  FabricAllocationStateEngine.assignPendingGarmentToFabricAndContinue(
    FabricAllocationStateEngine.beginChooseAnotherFabric(threeDifferentFabricInitial),
    fabricB,
    threeSelections,
  );
assert.equal(threeDifferentFabric.pendingFabricGarment, null);
assert.deepEqual(
  threeDifferentFabric.fabricAllocations.map((allocation) => allocation.fabricCode),
  [fabricA, fabricB],
);

const twoFabricAllocation = startAssignment("shirt", "trouser");
const trouserKey = twoFabricAllocation.fabricAllocations[0].garmentAssignments[1].garmentKey;
const trouserReassignment =
  FabricAllocationStateEngine.beginReassignGarmentToAnotherFabric(
    twoFabricAllocation,
    trouserKey,
  );
assert.equal(trouserReassignment.awaitingFabricForPendingGarment, true);
const twoDifferentFabric = FabricAllocationStateEngine.assignPendingGarmentToFabricAndContinue(
  trouserReassignment,
  fabricB,
  selectionsFor("shirt", "trouser"),
);
assert.equal(twoDifferentFabric.pendingFabricGarment, null);
assert.deepEqual(
  twoDifferentFabric.fabricAllocations.map((allocation) => allocation.fabricCode),
  [fabricA, fabricB],
);
assert.equal(new Set(assignmentKeys(twoDifferentFabric)).size, 2);

const threeFabricTrouserKey =
  threeSameFabric.fabricAllocations[0].garmentAssignments[1].garmentKey;
const threeFabricWithTrouserReassignment =
  FabricAllocationStateEngine.assignPendingGarmentToFabricAndContinue(
    FabricAllocationStateEngine.beginReassignGarmentToAnotherFabric(
      threeSameFabric,
      threeFabricTrouserKey,
    ),
    fabricB,
    threeSelections,
  );
const skirtKey = threeFabricWithTrouserReassignment.fabricAllocations
  .flatMap((allocation) => allocation.garmentAssignments)
  .find((assignment) => assignment.garmentType === "skirt")!.garmentKey;
const skirtReassignment = FabricAllocationStateEngine.beginReassignGarmentToAnotherFabric(
  threeFabricWithTrouserReassignment,
  skirtKey,
);
const threeFabric = FabricAllocationStateEngine.assignPendingGarmentToFabricAndContinue(
  skirtReassignment,
  fabricC,
  threeSelections,
);
assert.deepEqual(
  threeFabric.fabricAllocations.map((allocation) => allocation.fabricCode),
  [fabricA, fabricB, fabricC],
);
assert.equal(new Set(assignmentKeys(threeFabric)).size, 3);

const primaryReplacement = FabricAllocationStateEngine.syncPrimaryGarmentComposition(
  threeDifferentFabric,
  fabricC,
  threeSelections,
);
assert.deepEqual(
  primaryReplacement.fabricAllocations.map((allocation) => allocation.fabricCode),
  [fabricC, fabricB],
  "Replacing the primary fabric keeps neighboring garment allocations intact.",
);

const cancelledInitial = startAssignment("shirt", "trouser", "skirt");
const cancelled = FabricAllocationStateEngine.cancelPendingGarment(cancelledInitial);
assert.equal(cancelled.fabricAllocations.length, 1);
assert.equal(
  FabricAllocationStateEngine.resolveUnassignedPhysicalGarments(
    cancelled,
    threeSelections,
  ).unassignedGarments[0]?.garmentType,
  "skirt",
  "Cancel preserves committed assignments and leaves the unresolved garment derivable.",
);

assert.deepEqual(
  cloneFabricAllocations(
    JSON.parse(JSON.stringify(fiveSameFabric.fabricAllocations)),
  ),
  cloneFabricAllocations(fiveSameFabric.fabricAllocations),
  "Committed continuous assignments survive the existing allocation persistence shape.",
);

const designStudioSource = readFileSync(
  new URL("./src/components/DesignStudioView.tsx", import.meta.url),
  "utf8",
);
assert.match(
  designStudioSource,
  /resolveUnassignedPhysicalGarments[\s\S]*?fabric-assignment-progress/,
  "The customer-facing Fabric step must consume the centralized unresolved state.",
);
assert.match(
  designStudioSource,
  /useSameFabricForPendingGarmentAndContinue/,
  "Same Fabric must continue through remaining garments without another manual trigger.",
);
assert.match(
  designStudioSource,
  /assignPendingGarmentToFabricAndContinue/,
  "Choosing another fabric must queue the next unresolved garment automatically.",
);
assert.match(
  designStudioSource,
  /Complete the remaining garment-to-fabric assignments before continuing\./,
  "Proceed Fabric must be blocked while assignments are unresolved.",
);

console.log("PASS: continuous multi-garment fabric assignment flow");
