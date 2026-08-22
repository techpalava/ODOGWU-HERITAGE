import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricGarmentType } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  applyFutureFabricCardSelection,
  assignSameFabricProductToGarments,
  cancelFutureFabricCatalogueAssignment,
  getFutureFabricAssignmentTargets,
  getFutureFabricCapacityOffer,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  reconcileFutureFabricAllocationState,
  removeFutureFabricAssignment,
  resolveFutureFabricCatalogueCardPresentation,
} from "./src/utils/designStudioFutureFabricStage";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import { cloneFabricAllocations } from "./src/utils/fabricAllocationPersistence";

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
  price: number | undefined,
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
  price,
});
const fabrics = [
  createFabric("FAB-A", "Fabric A", 10),
  createFabric("FAB-B", "Fabric B", 20),
  createFabric("FAB-C", "Fabric C", 30),
];
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
const commitCatalogueCancel = (
  args: Parameters<typeof cancelFutureFabricCatalogueAssignment>[0],
) => {
  const result = cancelFutureFabricCatalogueAssignment(args);
  assert.equal(
    result.status,
    "cancelled",
    result.status === "blocked" ? result.reason : "",
  );
  return result.state;
};

let customerCardState = FabricAllocationStateEngine.initialize();
customerCardState = applyFutureFabricCardSelection({
  state: customerCardState,
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
});
assert.deepEqual(
  customerCardState.fabricAllocations[0]?.garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
  "The UI-facing card orchestration must assign only the clicked garment on the first selection.",
);
customerCardState = commitSameFabric({
  state: customerCardState,
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
assert.deepEqual(
  customerCardState.fabricAllocations[0]?.garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt", "base:trouser"],
  "Bulk same-product assignment must route remaining garments through the shared allocation engine.",
);
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    fabricAllocationState: customerCardState,
    fabrics,
  }).isComplete,
  true,
);
customerCardState = applyFutureFabricCardSelection({
  state: customerCardState,
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  garmentKey: "base:shirt",
  fabricCode: "FAB-B",
});
assert.deepEqual(
  customerCardState.fabricAllocations.map((allocation) => ({
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [
    { fabricCode: "FAB-A", garmentKeys: ["base:trouser"] },
    { fabricCode: "FAB-B", garmentKeys: ["base:shirt"] },
  ],
  "Targeted replacement through the same UI seam must preserve the unrelated garment assignment.",
);
const assign = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
  garmentTypes: FabricGarmentType[],
  garmentKey: string,
  fabricCode: string,
) => {
  const result = assignFutureFabricToGarment({
    state,
    garmentTypeSelection: createSelection(garmentTypes),
    garmentKey,
    fabricCode,
  });
  assert.equal(result.status, "assigned");
  return result.state;
};

const threeRegular = ["shirt", "trouser", "skirt"] satisfies FabricGarmentType[];
let shared = assign(
  FabricAllocationStateEngine.initialize(),
  threeRegular,
  "base:shirt",
  "FAB-A",
);
assert.equal(shared.fabricAllocations.length, 1);
assert.equal(
  getFutureFabricCapacityOffer({
    garmentTypeSelection: createSelection(threeRegular),
    fabricAllocationState: shared,
  })?.target.assignment.garmentKey,
  "base:trouser",
);
shared = assign(shared, threeRegular, "base:trouser", "FAB-A");
assert.equal(shared.fabricAllocations.length, 1);
assert.deepEqual(
  shared.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt", "base:trouser"],
);
assert.equal(
  getFutureFabricCapacityOffer({
    garmentTypeSelection: createSelection(threeRegular),
    fabricAllocationState: shared,
  }),
  null,
  "A full active allocation must not offer another garment.",
);

let separate = assign(shared, threeRegular, "base:skirt", "FAB-B");
assert.equal(separate.fabricAllocations.length, 2);
assert.equal(separate.fabricAllocations[1].fabricCode, "FAB-B");
assert.deepEqual(getFutureGarmentFabricPlanning({
  garmentTypeSelection: createSelection(threeRegular),
  fabricAllocationState: separate,
}), {
  requiredGarmentCount: 3,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});

const repeatedProduct = assign(shared, threeRegular, "base:skirt", "FAB-A");
assert.equal(repeatedProduct.fabricAllocations.length, 2);
assert.equal(repeatedProduct.fabricAllocations[0].fabricCode, "FAB-A");
assert.equal(repeatedProduct.fabricAllocations[1].fabricCode, "FAB-A");
assert.notEqual(
  repeatedProduct.fabricAllocations[0].allocationId,
  repeatedProduct.fabricAllocations[1].allocationId,
);
assert.equal(
  resolveFabricAllocationMaterialPricing(repeatedProduct.fabricAllocations, fabrics)
    .status,
  "resolved",
);
const repeatedPricing = resolveFabricAllocationMaterialPricing(
  repeatedProduct.fabricAllocations,
  fabrics,
);
assert.equal(
  repeatedPricing.status === "resolved" ? repeatedPricing.totalMaterialPrice : null,
  20,
  "Two full allocations using one fabric product must produce two material charges.",
);

const exceptionTypes = ["kaftan", "shirt"] satisfies FabricGarmentType[];
let exceptionState = assign(
  FabricAllocationStateEngine.initialize(),
  exceptionTypes,
  "base:kaftan",
  "FAB-A",
);
assert.equal(
  getFutureFabricCapacityOffer({
    garmentTypeSelection: createSelection(exceptionTypes),
    fabricAllocationState: exceptionState,
  })?.target.assignment.garmentKey,
  "base:shirt",
);
exceptionState = assign(exceptionState, exceptionTypes, "base:shirt", "FAB-A");
assert.equal(exceptionState.fabricAllocations.length, 1);
assert.deepEqual(
  exceptionState.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:kaftan", "base:shirt"],
);

separate = assign(separate, threeRegular, "base:trouser", "FAB-B");
assert.deepEqual(
  separate.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
);
assert.deepEqual(
  separate.fabricAllocations[1].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:skirt", "base:trouser"],
);

const singleSelection = ["shirt"] satisfies FabricGarmentType[];
let single = assign(
  FabricAllocationStateEngine.initialize(),
  singleSelection,
  "base:shirt",
  "FAB-A",
);
const originalAllocationId = single.fabricAllocations[0].allocationId;
single = assign(single, singleSelection, "base:shirt", "FAB-C");
assert.equal(single.fabricAllocations.length, 1);
assert.equal(single.fabricAllocations[0].allocationId, originalAllocationId);
assert.equal(single.fabricAllocations[0].fabricCode, "FAB-C");

let sharedRemovalState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
});
sharedRemovalState = commitSameFabric({
  state: sharedRemovalState,
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
const sharedRemovalAllocationId = sharedRemovalState.fabricAllocations[0].allocationId;
sharedRemovalState = removeFutureFabricAssignment({
  state: sharedRemovalState,
  garmentKey: "base:shirt",
});
assert.equal(sharedRemovalState.fabricAllocations.length, 1);
assert.equal(sharedRemovalState.fabricAllocations[0].allocationId, sharedRemovalAllocationId);
assert.deepEqual(
  sharedRemovalState.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:trouser"],
  "Removing one shared assignment must preserve the unrelated garment in its allocation.",
);
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    fabricAllocationState: sharedRemovalState,
    fabrics,
  }).isComplete,
  false,
);
sharedRemovalState = removeFutureFabricAssignment({
  state: sharedRemovalState,
  garmentKey: "base:trouser",
});
assert.equal(sharedRemovalState.fabricAllocations.length, 0);
assert.equal(sharedRemovalState.activeAllocationId, null);
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    fabricAllocationState: sharedRemovalState,
    fabrics,
  }).isComplete,
  false,
  "Removing the last assignment must make the fabric stage incomplete without leaving an empty allocation.",
);

const overflowRemovalSelection = createSelection([
  "shirt",
  "trouser",
  "skirt",
]);
let overflowRemovalState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: overflowRemovalSelection,
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
});
overflowRemovalState = assignFutureFabricToGarment({
  state: overflowRemovalState,
  garmentTypeSelection: overflowRemovalSelection,
  garmentKey: "base:trouser",
  fabricCode: "FAB-A",
}).state;
const overflowSkirtTarget = getFutureFabricAssignmentTargets(
  overflowRemovalSelection,
).find(({ assignment }) => assignment.garmentKey === "base:skirt");
assert.ok(overflowSkirtTarget);
overflowRemovalState = FabricAllocationStateEngine.attemptAppendGarment(
  overflowRemovalState,
  overflowSkirtTarget.selection,
);
assert.equal(overflowRemovalState.pendingFabricGarment?.garmentKey, "base:skirt");
const overflowAllocationId = overflowRemovalState.fabricAllocations[0].allocationId;
const sharedAfterOverflowRemoval = removeFutureFabricAssignment({
  state: overflowRemovalState,
  garmentKey: "base:shirt",
});
assert.equal(
  sharedAfterOverflowRemoval.pendingFabricGarment?.garmentKey,
  "base:skirt",
  "Removing an unrelated committed garment must preserve a different pending overflow garment.",
);
assert.equal(
  sharedAfterOverflowRemoval.awaitingFabricForPendingGarment,
  overflowRemovalState.awaitingFabricForPendingGarment,
);
assert.equal(sharedAfterOverflowRemoval.fabricAllocations[0].allocationId, overflowAllocationId);
assert.deepEqual(
  sharedAfterOverflowRemoval.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:trouser"],
  "Removal must not delete an unrelated committed assignment.",
);

const oneCommittedWithDifferentPending =
  FabricAllocationStateEngine.removeGarmentAssignments(
    overflowRemovalState,
    ["base:shirt"],
  );
assert.equal(
  oneCommittedWithDifferentPending.pendingFabricGarment?.garmentKey,
  "base:skirt",
  "The regression fixture must reproduce a different stale pending overflow garment.",
);
const finalAfterOverflowRemoval = removeFutureFabricAssignment({
  state: oneCommittedWithDifferentPending,
  garmentKey: "base:trouser",
});
assert.equal(finalAfterOverflowRemoval.fabricAllocations.length, 0);
assert.equal(finalAfterOverflowRemoval.activeAllocationId, null);
assert.equal(
  finalAfterOverflowRemoval.pendingFabricGarment?.garmentKey,
  "base:skirt",
  "Removing the last unrelated committed garment must still preserve the pending overflow garment.",
);
assert.equal(
  finalAfterOverflowRemoval.awaitingFabricForPendingGarment,
  oneCommittedWithDifferentPending.awaitingFabricForPendingGarment,
);

const separateBeforeRemoval = assign(
  assign(
    FabricAllocationStateEngine.initialize(),
    ["shirt", "trouser"],
    "base:shirt",
    "FAB-A",
  ),
  ["shirt", "trouser"],
  "base:trouser",
  "FAB-B",
);
const separateAfterRemoval = removeFutureFabricAssignment({
  state: separateBeforeRemoval,
  garmentKey: "base:shirt",
});
assert.deepEqual(
  separateAfterRemoval.fabricAllocations.map((allocation) => ({
    allocationId: allocation.allocationId,
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [{
    allocationId: separateBeforeRemoval.fabricAllocations[1].allocationId,
    fabricCode: "FAB-B",
    garmentKeys: ["base:trouser"],
  }],
  "Removing one separate allocation must preserve the unrelated allocation and its identity.",
);

const inUsePresentation = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(["shirt"]),
  fabricAllocationState: applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: createSelection(["shirt"]),
    garmentKey: "base:shirt",
    fabricCode: "FAB-A",
  }),
  currentTargetGarmentKey: null,
});
assert.equal(inUsePresentation.status, "IN USE");
assert.equal(inUsePresentation.action, "cancel");
assert.equal(inUsePresentation.cancelGarmentKey, "base:shirt");

const pendingSharePresentation = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(["shirt", "trouser", "kaftan"]),
  fabricAllocationState: applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: createSelection(["shirt", "trouser", "kaftan"]),
    garmentKey: "base:shirt",
    fabricCode: "FAB-A",
  }),
  currentTargetGarmentKey: "base:kaftan",
});
assert.equal(pendingSharePresentation.status, "IN USE");
assert.equal(
  pendingSharePresentation.action,
  "select",
  "IN USE must still assign to a pending garment instead of cancelling the existing occurrence.",
);
assert.equal(pendingSharePresentation.cancelGarmentKey, null);

const focusedAssignedPresentation = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricAllocationState: applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    garmentKey: "base:shirt",
    fabricCode: "FAB-A",
  }),
  currentTargetGarmentKey: "base:shirt",
});
assert.equal(focusedAssignedPresentation.status, "ASSIGNED");
assert.equal(focusedAssignedPresentation.action, "cancel");
assert.equal(focusedAssignedPresentation.cancelGarmentKey, "base:shirt");

const sharedCodeState = commitSameFabric({
  state: applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    garmentKey: "base:shirt",
    fabricCode: "FAB-A",
  }),
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
const sharedCodeCard = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricAllocationState: sharedCodeState,
  currentTargetGarmentKey: null,
});
assert.equal(sharedCodeCard.cancelGarmentKey, "base:shirt");
const sharedCodeAfterCancel = commitCatalogueCancel({
  state: sharedCodeState,
  garmentKey: sharedCodeCard.cancelGarmentKey!,
});
assert.deepEqual(
  sharedCodeAfterCancel.fabricAllocations[0]?.garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:trouser"],
  "Catalogue cancellation must follow garment identity, not delete every user of the fabric code.",
);

let additionalState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
});
additionalState = commitSameFabric({
  state: additionalState,
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
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
if (additionalState.pendingFabricGarment) {
  additionalState = FabricAllocationStateEngine.assignPendingGarmentToFabric(
    additionalState,
    "FAB-B",
  );
}
additionalState = commitCatalogueCancel({
  state: additionalState,
  garmentKey: "additional:shirt:1",
});
assert.equal(additionalState.pendingFabricGarment?.garmentKey, "additional:shirt:1");
assert.equal(additionalState.awaitingFabricForPendingGarment, true);
assert.ok(
  additionalState.fabricAllocations.some((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:shirt",
    ),
  ),
);
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    fabricAllocationState: additionalState,
    fabrics,
  }).isComplete,
  false,
);
additionalState = applyFutureFabricCardSelection({
  state: additionalState,
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  garmentKey: "additional:shirt:1",
  fabricCode: "FAB-C",
});
assert.ok(
  additionalState.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === "FAB-C" &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "additional:shirt:1",
      ),
  ),
  "A cancelled additional garment must be reassignable through the existing pending assignment path.",
);

const persistCancelState = commitCatalogueCancel({
  state: applyFutureFabricCardSelection({
    state: commitSameFabric({
      state: applyFutureFabricCardSelection({
        state: FabricAllocationStateEngine.initialize(),
        garmentTypeSelection: createSelection(["shirt", "trouser"]),
        garmentKey: "base:shirt",
        fabricCode: "FAB-A",
      }),
      garmentTypeSelection: createSelection(["shirt", "trouser"]),
      fabricCode: "FAB-A",
      garmentKeys: ["base:trouser"],
    }),
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    garmentKey: "base:trouser",
    fabricCode: "FAB-B",
  }),
  garmentKey: "base:shirt",
});
const restoredAllocations = cloneFabricAllocations(
  JSON.parse(JSON.stringify(persistCancelState.fabricAllocations)),
);
assert.deepEqual(
  restoredAllocations?.map((allocation) => ({
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [{ fabricCode: "FAB-B", garmentKeys: ["base:trouser"] }],
  "Draft serialize/restore must keep the cancelled assignment cancelled.",
);

const removed = reconcileFutureFabricAllocationState({
  state: separate,
  garmentTypeSelection: createSelection(["shirt", "skirt"]),
});
assert.deepEqual(
  removed.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ),
  ["base:shirt", "base:skirt"],
);

const reloaded = JSON.parse(JSON.stringify(repeatedProduct));
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(threeRegular),
    fabricAllocationState: reloaded,
    fabrics,
  }).isComplete,
  true,
);
assert.equal(reloaded.fabricAllocations.length, 2);
assert.notEqual(
  reloaded.fabricAllocations[0].allocationId,
  reloaded.fabricAllocations[1].allocationId,
);

for (const invalidFabrics of [
  [createFabric("FAB-A", "Fabric A", 10, "OUT_OF_STOCK")],
  [createFabric("FAB-A", "Fabric A", undefined)],
  [],
]) {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(threeRegular),
    fabricAllocationState: repeatedProduct,
    fabrics: invalidFabrics,
  });
  assert.equal(completion.isComplete, false);
  assert.equal(
    completion.blockers.some((blocker) =>
      ["FABRIC_UNAVAILABLE", "FABRIC_PRICE_UNAVAILABLE", "FABRIC_NOT_FOUND"].includes(
        blocker.code,
      ),
    ),
    true,
  );
}

const oldPrice = resolveFabricAllocationMaterialPricing(
  shared.fabricAllocations,
  fabrics,
);
const updatedPrice = resolveFabricAllocationMaterialPricing(
  shared.fabricAllocations,
  [createFabric("FAB-A", "Fabric A", 25)],
);
assert.equal(oldPrice.status === "resolved" ? oldPrice.totalMaterialPrice : null, 10);
assert.equal(
  updatedPrice.status === "resolved" ? updatedPrice.totalMaterialPrice : null,
  25,
);

const stepSource = readFileSync(
  "src/components/DormantFutureFabricStep.tsx",
  "utf8",
);
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.doesNotMatch(
  stepSource,
  />\s*Select Fabric\s*</,
  "Step 2 must not retain a bottom Select Fabric confirmation control.",
);
assert.match(stepSource, /data-fabric-progress="true"/);
assert.match(stepSource, /data-fabric-selection-progress="true"/);
assert.match(stepSource, /data-garment-assignment-progress="true"/);
assert.match(stepSource, /Fabric selections:/);
assert.match(stepSource, /Garments assigned:/);
assert.doesNotMatch(
  stepSource,
  /Fabrics selected:/,
  "Step 2 must not use the ambiguous single-line Fabric progress label.",
);
assert.match(stepSource, /Use this fabric for your other garments\?/);
assert.match(stepSource, /YES — Use for All/);
assert.match(stepSource, /NO — Choose Garments/);
assert.match(stepSource, /Choose Fabrics Individually/);
assert.match(stepSource, /onAssignSameFabricProduct/);
assert.match(stepSource, /aria-modal="true"/);
assert.match(stepSource, /restoreCatalogueFocus/);
assert.match(stepSource, /focusElementSafely/);
assert.match(stepSource, /isConnected/);
assert.match(stepSource, /focus\(\{ preventScroll: true \}\)/);
assert.match(stepSource, /document\.activeElement === first/);
assert.match(stepSource, /overflow-x-hidden/);
assert.match(stepSource, /onAssignFabricToGarment\(fabric, garmentKey\)/);
assert.match(stepSource, /handleFabricSelection\(fabric\)/);
assert.match(stepSource, /removeAssignedFabric\(/);
assert.match(stepSource, /resolveFutureFabricCatalogueCardPresentation/);
assert.match(stepSource, /Cancel \$\{fabric\.name\} fabric assignment/);
assert.match(stepSource, /aria-live="polite"/);
assert.match(studioSource, /assignFutureFabricToGarment\(/);
assert.match(
  studioSource,
  /cancelFutureFabricCatalogueAssignment\(/,
  "DesignStudioView must cancel catalogue assignments through the canonical removal wrapper.",
);
assert.match(
  studioSource,
  /applyFutureFabricCardSelection\(/,
  "DesignStudioView must route the customer-facing card action through the shared orchestration seam.",
);
assert.doesNotMatch(
  studioSource,
  /selectFutureFabric\(/,
  "The parent UI must not bypass the orchestration seam with a second direct selection path.",
);
assert.match(studioSource, /assignSameFabricProductToGarments\(/);
assert.match(
  studioSource,
  /onBack=\{\(\) => setFutureStageId\("garment_type"\)\}/,
  "Step 2 Back must still return to Garment Type.",
);
assert.match(
  studioSource,
  /pendingAdditionalConstructionRef\.current\?\.garmentKey === garmentKey/,
  "DesignStudioView must only clear pending additional construction when the removed garment is that pending garment.",
);
const removeHandler = studioSource.slice(
  studioSource.indexOf("const handleRemoveFutureFabricAssignment"),
  studioSource.indexOf("const handleRemoveFutureAdditionalGarment"),
);
assert.doesNotMatch(
  removeHandler,
  /pendingAdditionalConstructionRef\.current = null;\s*setFabricAllocationState/,
  "Unrelated fabric removal must not wipe pending additional construction metadata.",
);
assert.match(
  removeHandler,
  /result.status !== "cancelled"/,
  "DesignStudioView must leave allocation and construction metadata unchanged when cancellation is blocked.",
);
assert.match(
  stepSource,
  /Finish assigning fabric to the pending additional garment before removing fabric from another additional garment\./,
);
const stageSource = readFileSync(
  "src/utils/designStudioFutureFabricStage.ts",
  "utf8",
);
assert.match(stageSource, /OTHER_ADDITIONAL_GARMENT_PENDING/);
assert.match(
  stageSource,
  /status: "blocked"/,
);
assert.doesNotMatch(
  stageSource.slice(
    stageSource.indexOf("export const removeFutureFabricAssignment"),
    stageSource.indexOf("export type FutureFabricCatalogueCardStatus"),
  ),
  /cancelPendingGarment\(state\);\s*const removed/,
  "removeFutureFabricAssignment must not cancel pending additional state unconditionally.",
);
assert.match(stepSource, /wasEligibleFirstStep1Assignment/);
assert.match(stepSource, /getFocusable\(\)\[0\]\?\.focus\(\)/);
assert.match(stepSource, /clearOnMiss: true/);
assert.match(stepSource, /result\.assignedGarmentKeys/);

console.log("PASS: targeted future Fabric assignment flow");
