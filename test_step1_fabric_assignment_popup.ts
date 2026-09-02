import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { FabricCapacityEngine } from "./src/engine/FabricCapacityEngine";
import type { Fabric, FabricGarmentType } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { createCatalogueAdditionalGarmentSelection, projectCatalogueStep1PhysicalOccurrences } from "./src/utils/additionalGarmentDomain";
import { resolveAuthoritativePrimaryFabricCode } from "./src/utils/additionalGarmentFabricPicker";
import {
  applyFutureFabricCardSelection,
  assignSameFabricProductToGarments,
  getFutureGarmentFabricPlanning,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  STEP1_FABRIC_NO_LONGER_AVAILABLE_MESSAGE,
  STEP1_GARMENT_ALREADY_ASSIGNED_MESSAGE,
  STEP1_GARMENT_CAPACITY_MESSAGE,
  STEP1_NO_GARMENTS_TO_ASSIGN_STATUS,
  STEP1_REMAINING_CAPACITY_MESSAGE,
  STEP1_SELECTED_CAPACITY_MESSAGE,
  STEP1_SELECT_MORE_GARMENT_CAPACITY_MESSAGE,
  STEP1_FABRIC_CAPACITY_COMPLETE_MESSAGE,
  STEP1_FINAL_RESIDUAL_CAPACITY_MESSAGE,
  STEP1_ZERO_CAPACITY_GUIDANCE_MESSAGE,
  buildStep1FabricAssignmentCandidates,
  commitStep1FabricAssignment,
  createStep1FabricAssignmentDisplaySnapshot,
  dryRunAssignFabricProductToStep1GarmentKeys,
  evaluateStep1FabricAssignmentSelection,
  getUnassignedStep1FabricAssignmentCandidates,
  resolveStep1AssignmentDialogFabric,
  resolveStep1FabricCatalogueCardPresentation,
  shouldPromptStep1FabricAssignmentSelection,
} from "./src/utils/step1FabricAssignmentPopup";
import { formatFabricStockExhaustedCopy } from "./src/utils/fabricStockAvailability";

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
  price: number,
  extras: Partial<Fabric> = {},
): Fabric => ({
  code,
  name,
  description: name,
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Test Fabric",
  price,
  ...extras,
});
const fabrics = [
  createFabric("FAB-A", "Heritage A", 10),
  createFabric("FAB-B", "Heritage B", 20),
  createFabric("FAB-C", "Heritage C", 15),
];
const assignedKeys = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
) =>
  state.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  );
const allocationUsedUnits = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
) =>
  state.fabricAllocations.map((allocation) =>
    allocation.garmentAssignments.reduce(
      (total, assignment) => total + assignment.fabricUnits,
      0,
    ),
  );
const assertLegalSameProductAllocations = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
  fabricCode: string,
  expectedAllocationCount: number,
) => {
  const matching = state.fabricAllocations.filter(
    (allocation) =>
      allocation.fabricCode === fabricCode &&
      allocation.garmentAssignments.length > 0,
  );
  assert.equal(matching.length, expectedAllocationCount);
  for (const allocation of matching) {
    const usedUnits = allocation.garmentAssignments.reduce(
      (total, assignment) => total + assignment.fabricUnits,
      0,
    );
    assert.ok(usedUnits > 0);
    assert.ok(usedUnits <= FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION);
  }
};
const candidateKeys = (
  garmentTypes: FabricGarmentType[],
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
) =>
  getUnassignedStep1FabricAssignmentCandidates({
    garmentTypeSelection: createSelection(garmentTypes),
    fabricAllocationState: state,
  }).map(({ assignment }) => assignment.garmentKey);
const assignOne = (
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

const threeTypes = ["shirt", "trouser", "dress"] satisfies FabricGarmentType[];
const empty = FabricAllocationStateEngine.initialize();

assert.deepEqual(
  candidateKeys(threeTypes, empty),
  ["base:shirt", "base:trouser", "base:dress"],
  "Popup candidates must be the unassigned Step 1 garmentKeys exactly.",
);

const shirtAssigned = assignOne(threeTypes, "base:shirt", "FAB-B");
assert.deepEqual(
  candidateKeys(threeTypes, shirtAssigned),
  ["base:trouser", "base:dress"],
  "Already-assigned Shirt must be excluded from the popup.",
);
assert.ok(!candidateKeys(threeTypes, shirtAssigned).includes("base:shirt"));

const subset = commitStep1FabricAssignment({
  state: empty,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: ["base:shirt", "base:dress"],
  mode: "selected",
});
assert.equal(subset.status, "assigned");
assert.deepEqual(subset.assignedGarmentKeys, ["base:shirt", "base:dress"]);
assert.deepEqual(assignedKeys(subset.state).sort(), [
  "base:dress",
  "base:shirt",
]);
assert.deepEqual(candidateKeys(threeTypes, subset.state), ["base:trouser"]);

const useForAll = commitStep1FabricAssignment({
  state: empty,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: [],
  mode: "all_remaining",
});
assert.equal(useForAll.status, "assigned");
assert.deepEqual(useForAll.assignedGarmentKeys, [
  "base:shirt",
  "base:trouser",
  "base:dress",
]);
assert.deepEqual(assignedKeys(useForAll.state).sort(), [
  "base:dress",
  "base:shirt",
  "base:trouser",
]);

const leftoverState = assignOne(threeTypes, "base:shirt");
const leftoverCandidates = buildStep1FabricAssignmentCandidates({
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: leftoverState,
  fabricCode: "FAB-A",
});
assert.deepEqual(
  leftoverCandidates.map((candidate) => candidate.garmentKey),
  ["base:trouser", "base:dress"],
);
const leftoverAll = evaluateStep1FabricAssignmentSelection({
  candidates: leftoverCandidates,
  selectedGarmentKeys: leftoverCandidates.map((candidate) => candidate.garmentKey),
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: leftoverState,
  fabricCode: "FAB-A",
});
assert.equal(leftoverAll.canUseForAll, true);
assert.equal(leftoverAll.remainingCapacityMessage, null);
assert.equal(leftoverAll.canAssignSelected, true);
assert.equal(leftoverAll.selectedCapacityMessage, null);
assert.equal(leftoverAll.selectedFailure, null);
assert.equal(leftoverAll.remainingFailure, null);
assert.equal(leftoverAll.candidateMessages["base:trouser"], null);
assert.equal(leftoverAll.candidateMessages["base:dress"], null);
const leftoverUseForAllCommit = commitStep1FabricAssignment({
  state: leftoverState,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: leftoverCandidates.map((candidate) => candidate.garmentKey),
  mode: "all_remaining",
});
assert.equal(leftoverUseForAllCommit.status, "assigned");
assert.deepEqual(assignedKeys(leftoverUseForAllCommit.state).sort(), [
  "base:dress",
  "base:shirt",
  "base:trouser",
]);
assertLegalSameProductAllocations(leftoverUseForAllCommit.state, "FAB-A", 2);
assert.equal(
  getFutureGarmentFabricPlanning({
    garmentTypeSelection: createSelection(threeTypes),
    fabricAllocationState: leftoverUseForAllCommit.state,
  }).selectedFabricQuantity,
  2,
  "Two same-code allocations still count as 2 Fabrics Selected.",
);
assert.ok(
  leftoverUseForAllCommit.state.fabricAllocations.every(
    (allocation) => allocation.fabricCode === "FAB-A",
  ),
);

const combination = evaluateStep1FabricAssignmentSelection({
  candidates: leftoverCandidates,
  selectedGarmentKeys: ["base:trouser", "base:dress"],
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: leftoverState,
  fabricCode: "FAB-A",
});
assert.equal(combination.canAssignSelected, true);
assert.equal(combination.selectedCapacityMessage, null);
assert.equal(combination.selectedFailure, null);
const reduced = evaluateStep1FabricAssignmentSelection({
  candidates: leftoverCandidates,
  selectedGarmentKeys: ["base:trouser"],
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: leftoverState,
  fabricCode: "FAB-A",
});
assert.equal(reduced.canAssignSelected, false);
assert.equal(
  reduced.groupingCapacityStatus,
  STEP1_SELECT_MORE_GARMENT_CAPACITY_MESSAGE,
);
const reducedCommit = commitStep1FabricAssignment({
  state: leftoverState,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: ["base:trouser"],
  mode: "selected",
});
assert.equal(reducedCommit.status, "assigned");
assert.deepEqual(assignedKeys(reducedCommit.state).sort(), [
  "base:shirt",
  "base:trouser",
]);

const useAgainPresentation = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: leftoverState,
  availabilityMessage: null,
});
assert.equal(useAgainPresentation.status, "USE AGAIN");
assert.equal(useAgainPresentation.action, "use_again");
const reuse = commitStep1FabricAssignment({
  state: leftoverState,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: ["base:trouser"],
  mode: "selected",
});
assert.equal(reuse.status, "assigned");
assert.ok(assignedKeys(reuse.state).includes("base:trouser"));
assert.ok(!assignedKeys(reuse.state).includes("base:dress"));

const filled = assignSameFabricProductToGarments({
  state: leftoverState,
  garmentTypeSelection: createSelection(threeTypes),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
assert.equal(filled.status, "assigned");
const exhaustedPresentation = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: filled.state,
  availabilityMessage: null,
});
assert.equal(exhaustedPresentation.status, "USE AGAIN");
assert.equal(exhaustedPresentation.action, "use_again");
const exhaustedCandidates = buildStep1FabricAssignmentCandidates({
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: filled.state,
  fabricCode: "FAB-A",
});
assert.deepEqual(
  exhaustedCandidates.map((candidate) => candidate.garmentKey),
  ["base:dress"],
);
assert.equal(exhaustedCandidates[0]?.individuallyAssignable, true);
const exhaustedCommit = commitStep1FabricAssignment({
  state: filled.state,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: ["base:dress"],
  mode: "selected",
});
assert.equal(exhaustedCommit.status, "assigned");
assert.deepEqual(assignedKeys(exhaustedCommit.state).sort(), [
  "base:dress",
  "base:shirt",
  "base:trouser",
]);
assertLegalSameProductAllocations(exhaustedCommit.state, "FAB-A", 2);

const cancelledSnapshot = assignOne(threeTypes, "base:shirt");
const cancelled = commitStep1FabricAssignment({
  state: cancelledSnapshot,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: ["base:trouser"],
  mode: "selected",
});
assert.equal(cancelled.status, "assigned");
assert.notEqual(
  assignedKeys(cancelledSnapshot).includes("base:trouser"),
  true,
  "Cancel/discard must keep the original snapshot unassigned until confirm.",
);
assert.deepEqual(assignedKeys(cancelledSnapshot), ["base:shirt"]);

for (const extras of [
  { stockStatus: "HIDDEN" as const },
  { stockStatus: "OUT_OF_STOCK" as const },
  { price: undefined, priceMultiplier: 0 },
]) {
  const changedCatalogue = [
    createFabric("FAB-A", "Heritage A", extras.price === undefined ? 10 : extras.price, extras),
    fabrics[1],
  ];
  if (extras.price === undefined) {
    changedCatalogue[0] = {
      ...changedCatalogue[0],
      price: undefined,
      priceMultiplier: 0,
    };
    delete changedCatalogue[0].price;
  }
  const availability = commitStep1FabricAssignment({
    state: empty,
    garmentTypeSelection: createSelection(threeTypes),
    fabrics: changedCatalogue,
    fabricCode: "FAB-A",
    selectedGarmentKeys: ["base:shirt"],
    mode: "selected",
  });
  assert.equal(availability.status, "blocked");
  assert.equal(availability.reason, "FABRIC_UNAVAILABLE");
  assert.equal(availability.state, empty);
  assert.deepEqual(assignedKeys(availability.state), []);
}

const staleShirt = assignOne(threeTypes, "base:shirt", "FAB-B");
const staleCommit = commitStep1FabricAssignment({
  state: staleShirt,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: ["base:shirt", "base:trouser"],
  mode: "selected",
});
assert.equal(staleCommit.status, "blocked");
assert.equal(staleCommit.reason, "GARMENT_ALREADY_ASSIGNED");
assert.equal(staleCommit.error, STEP1_GARMENT_ALREADY_ASSIGNED_MESSAGE);
assert.equal(staleCommit.state, staleShirt);
assert.deepEqual(assignedKeys(staleCommit.state), ["base:shirt"]);
assert.equal(
  staleShirt.fabricAllocations[0]?.fabricCode,
  "FAB-B",
  "A garment assigned while the popup is open must not be overwritten.",
);
assert.ok(!assignedKeys(staleCommit.state).includes("base:trouser"));

const shirtOnly = assignOne(["shirt"], "base:shirt");
const additionalSelection = createCatalogueAdditionalGarmentSelection({
  garmentType: "trouser",
  authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
});
assert.equal(additionalSelection.status, "resolved");
const withAdditional =
  additionalSelection.status === "resolved"
    ? FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
        shirtOnly,
        additionalSelection.selection,
      )
    : shirtOnly;
assert.equal(
  withAdditional.pendingFabricGarment?.garmentKey.startsWith("additional:"),
  true,
);
assert.deepEqual(candidateKeys(["shirt"], withAdditional), []);
assert.ok(
  !candidateKeys(["shirt"], withAdditional).some((key) =>
    key.startsWith("additional:"),
  ),
);
const step4Popup = commitStep1FabricAssignment({
  state: withAdditional,
  garmentTypeSelection: createSelection(["shirt"]),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: [
    withAdditional.pendingFabricGarment?.garmentKey || "additional:trouser:1",
  ],
  mode: "selected",
});
assert.equal(step4Popup.status, "blocked");
assert.ok(!assignedKeys(step4Popup.state).includes("additional:trouser:1"));

const exactKeys = commitStep1FabricAssignment({
  state: empty,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: ["base:shirt", "base:dress"],
  mode: "selected",
});
assert.equal(exactKeys.status, "assigned");
assert.deepEqual(exactKeys.assignedGarmentKeys, ["base:shirt", "base:dress"]);
assert.ok(!exactKeys.assignedGarmentKeys.includes("shirt"));
assert.ok(!exactKeys.assignedGarmentKeys.includes("dress"));

const firstFabric = commitStep1FabricAssignment({
  state: empty,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: ["base:shirt"],
  mode: "selected",
});
assert.equal(firstFabric.status, "assigned");
assert.equal(
  resolveAuthoritativePrimaryFabricCode(firstFabric.state),
  "FAB-A",
);
const secondFabric = commitStep1FabricAssignment({
  state: firstFabric.state,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-B",
  selectedGarmentKeys: ["base:trouser"],
  mode: "selected",
});
assert.equal(secondFabric.status, "assigned");
assert.equal(
  resolveAuthoritativePrimaryFabricCode(secondFabric.state),
  "FAB-A",
  "Assigning a second Fabric to another Step 1 garment must not steal primary Fabric authority.",
);
assert.deepEqual(
  secondFabric.state.fabricAllocations.map((allocation) => ({
    fabricCode: allocation.fabricCode,
    keys: allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  })),
  [
    { fabricCode: "FAB-A", keys: ["base:shirt"] },
    { fabricCode: "FAB-B", keys: ["base:trouser"] },
  ],
);

const unusedPresentation = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: empty,
  availabilityMessage: null,
});
assert.equal(unusedPresentation.status, "SELECT");
assert.equal(unusedPresentation.action, "select");

const unavailablePresentation = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: empty,
  availabilityMessage: "Currently out of stock.",
});
assert.equal(unavailablePresentation.status, "UNAVAILABLE");
assert.equal(unavailablePresentation.action, "none");

const twoTypes = ["shirt", "trouser"] satisfies FabricGarmentType[];
const shirtThenTrouser = assignSameFabricProductToGarments({
  state: assignOne(twoTypes, "base:shirt", "FAB-A"),
  garmentTypeSelection: createSelection(twoTypes),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
assert.equal(shirtThenTrouser.status, "assigned");
const blockedSecondProduct = assignSameFabricProductToGarments({
  state: assignOne(twoTypes, "base:shirt", "FAB-A"),
  garmentTypeSelection: createSelection(twoTypes),
  fabricCode: "FAB-B",
  garmentKeys: ["base:trouser"],
});
assert.equal(blockedSecondProduct.status, "blocked");
assert.equal(
  blockedSecondProduct.status === "blocked" ? blockedSecondProduct.reason : null,
  "FABRIC_QUANTITY_LIMIT_REACHED",
);
const unusedZeroCandidate = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: "FAB-C",
  garmentTypeSelection: createSelection(twoTypes),
  fabricAllocationState: shirtThenTrouser.state,
  availabilityMessage: null,
});
assert.equal(unusedZeroCandidate.status, STEP1_NO_GARMENTS_TO_ASSIGN_STATUS);
assert.equal(STEP1_NO_GARMENTS_TO_ASSIGN_STATUS, "ALL GARMENTS HAVE FABRIC");
assert.notEqual(unusedZeroCandidate.status, "NO GARMENTS TO ASSIGN");
assert.equal(unusedZeroCandidate.action, "none");
assert.notEqual(unusedZeroCandidate.status, "SELECT");
assert.notEqual(unusedZeroCandidate.status, "IN USE");
const usedZeroCandidate = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(twoTypes),
  fabricAllocationState: shirtThenTrouser.state,
  availabilityMessage: null,
});
assert.equal(usedZeroCandidate.status, "IN USE");
assert.equal(usedZeroCandidate.action, "none");
assert.notEqual(usedZeroCandidate.status, "USE AGAIN");

const oneRemaining = assignOne(twoTypes, "base:shirt", "FAB-A");
const unusedOneCandidate = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: "FAB-C",
  garmentTypeSelection: createSelection(twoTypes),
  fabricAllocationState: oneRemaining,
  availabilityMessage: null,
});
assert.equal(unusedOneCandidate.status, "SELECT");
assert.equal(unusedOneCandidate.action, "none");
const usedOneCandidate = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(twoTypes),
  fabricAllocationState: oneRemaining,
  availabilityMessage: null,
});
assert.equal(usedOneCandidate.status, "USE AGAIN");
assert.equal(usedOneCandidate.action, "use_again");
const oneCandidateRows = buildStep1FabricAssignmentCandidates({
  garmentTypeSelection: createSelection(twoTypes),
  fabricAllocationState: oneRemaining,
  fabricCode: "FAB-C",
});
assert.deepEqual(
  oneCandidateRows.map((candidate) => candidate.garmentKey),
  ["base:trouser"],
);

const snapshot = createStep1FabricAssignmentDisplaySnapshot(fabrics[0]);
const missingDialog = resolveStep1AssignmentDialogFabric({
  fabrics: [fabrics[1], fabrics[2]],
  fabricCode: "FAB-A",
  displaySnapshot: snapshot,
});
assert.equal(missingDialog.currentFabric, null);
assert.equal(missingDialog.displayFabric.code, "FAB-A");
assert.equal(missingDialog.displayFabric.name, "Heritage A");
assert.equal(
  missingDialog.unavailableError,
  STEP1_FABRIC_NO_LONGER_AVAILABLE_MESSAGE,
);
const missingCommit = commitStep1FabricAssignment({
  state: empty,
  garmentTypeSelection: createSelection(twoTypes),
  fabrics: [fabrics[1], fabrics[2]],
  fabricCode: "FAB-A",
  selectedGarmentKeys: ["base:shirt"],
  mode: "selected",
});
assert.equal(missingCommit.status, "blocked");
assert.equal(missingCommit.reason, "FABRIC_UNAVAILABLE");
assert.deepEqual(assignedKeys(missingCommit.state), []);

const outOfStockDialog = resolveStep1AssignmentDialogFabric({
  fabrics: [
    createFabric("FAB-A", "Heritage A", 10, { stockStatus: "OUT_OF_STOCK" }),
    fabrics[1],
  ],
  fabricCode: "FAB-A",
  displaySnapshot: snapshot,
});
assert.equal(outOfStockDialog.currentFabric, null);
assert.equal(outOfStockDialog.unavailableError, "Currently out of stock.");
assert.equal(outOfStockDialog.displayFabric.stockStatus, "OUT_OF_STOCK");

const unpricedFabric = {
  ...createFabric("FAB-A", "Heritage A", 10),
  price: undefined,
  priceMultiplier: 0,
};
delete unpricedFabric.price;
const unpricedDialog = resolveStep1AssignmentDialogFabric({
  fabrics: [unpricedFabric, fabrics[1]],
  fabricCode: "FAB-A",
  displaySnapshot: snapshot,
});
assert.equal(unpricedDialog.currentFabric, null);
assert.equal(unpricedDialog.unavailableError, "Price needs catalogue review before selection.");

assert.equal(shouldPromptStep1FabricAssignmentSelection(0), false);
assert.equal(shouldPromptStep1FabricAssignmentSelection(1), false);
assert.equal(shouldPromptStep1FabricAssignmentSelection(2), true);
assert.equal(shouldPromptStep1FabricAssignmentSelection(8), true);

const halfUnitTypes = ["shirt", "trouser", "skirt"] satisfies FabricGarmentType[];
const halfUnitSelection = createSelection(halfUnitTypes);
const emptyHalfPlanning = getFutureGarmentFabricPlanning({
  garmentTypeSelection: halfUnitSelection,
  fabricAllocationState: empty,
});
assert.equal(emptyHalfPlanning.requiredFabricQuantity, 2);
assert.equal(emptyHalfPlanning.selectedFabricQuantity, 0);
assert.equal(emptyHalfPlanning.requiredGarmentCount, 3);

const skirtAssigned = assignOne(halfUnitTypes, "base:skirt", "ODG-010");
const remainingHalfDryRun = dryRunAssignFabricProductToStep1GarmentKeys({
  state: skirtAssigned,
  garmentTypeSelection: halfUnitSelection,
  fabricCode: "ODG-010",
  garmentKeys: ["base:shirt", "base:trouser"],
});
assert.equal(remainingHalfDryRun.status, "assigned");
assertLegalSameProductAllocations(remainingHalfDryRun.state, "ODG-010", 2);
assert.equal(
  remainingHalfDryRun.state.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .reduce((total, assignment) => total + assignment.fabricUnits, 0),
  3,
);
assert.ok(
  allocationUsedUnits(remainingHalfDryRun.state).every(
    (units) => units <= FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION,
  ),
);
assert.equal(
  getFutureGarmentFabricPlanning({
    garmentTypeSelection: halfUnitSelection,
    fabricAllocationState: remainingHalfDryRun.state,
  }).selectedFabricQuantity,
  2,
);

const halfRemainingCandidates = buildStep1FabricAssignmentCandidates({
  garmentTypeSelection: halfUnitSelection,
  fabricAllocationState: skirtAssigned,
  fabricCode: "ODG-010",
});
const halfPopup = evaluateStep1FabricAssignmentSelection({
  candidates: halfRemainingCandidates,
  selectedGarmentKeys: ["base:shirt", "base:trouser"],
  garmentTypeSelection: halfUnitSelection,
  fabricAllocationState: skirtAssigned,
  fabricCode: "ODG-010",
});
assert.equal(halfPopup.canAssignSelected, true);
assert.equal(halfPopup.canUseForAll, true);
assert.equal(halfPopup.selectedCapacityMessage, null);
assert.equal(halfPopup.remainingCapacityMessage, null);
assert.equal(halfPopup.selectedFailure, null);
assert.equal(halfPopup.remainingFailure, null);

const conflictState = assignOne(threeTypes, "base:shirt", "FAB-B");
const conflictCandidates = [
  {
    garmentKey: "base:shirt",
    garmentType: "shirt" as const,
    fabricUnits: 1 as const,
    capacityUsageCopy: "Uses 1/2 fabric capacity unit.",
    individuallyAssignable: false,
    disabledReason: STEP1_GARMENT_CAPACITY_MESSAGE,
  },
  ...buildStep1FabricAssignmentCandidates({
    garmentTypeSelection: createSelection(threeTypes),
    fabricAllocationState: conflictState,
    fabricCode: "FAB-A",
  }),
];
const blockedSelected = evaluateStep1FabricAssignmentSelection({
  candidates: conflictCandidates,
  selectedGarmentKeys: ["base:shirt", "base:trouser"],
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: conflictState,
  fabricCode: "FAB-A",
});
assert.equal(blockedSelected.canAssignSelected, false);
assert.equal(blockedSelected.selectedFailure?.garmentKey, "base:shirt");
assert.equal(
  blockedSelected.selectedFailure?.message,
  STEP1_GARMENT_CAPACITY_MESSAGE,
);
assert.equal(blockedSelected.selectedCapacityMessage, null);
assert.equal(
  blockedSelected.candidateMessages["base:shirt"],
  STEP1_GARMENT_CAPACITY_MESSAGE,
);
assert.equal(blockedSelected.candidateMessages["base:trouser"] ?? null, null);
assert.notEqual(
  blockedSelected.selectedCapacityMessage,
  STEP1_SELECTED_CAPACITY_MESSAGE,
);

const blockedRemaining = evaluateStep1FabricAssignmentSelection({
  candidates: conflictCandidates,
  selectedGarmentKeys: ["base:trouser"],
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: conflictState,
  fabricCode: "FAB-A",
});
assert.equal(blockedRemaining.canUseForAll, false);
assert.equal(blockedRemaining.remainingFailure?.garmentKey, "base:shirt");
assert.equal(blockedRemaining.remainingCapacityMessage, null);
assert.equal(blockedRemaining.canAssignSelected, false);
assert.equal(
  blockedRemaining.groupingCapacityStatus,
  STEP1_SELECT_MORE_GARMENT_CAPACITY_MESSAGE,
);
assert.equal(
  blockedRemaining.candidateMessages["base:shirt"],
  STEP1_GARMENT_CAPACITY_MESSAGE,
);
assert.equal(blockedRemaining.candidateMessages["base:trouser"] ?? null, null);
assert.notEqual(
  blockedRemaining.remainingCapacityMessage,
  STEP1_REMAINING_CAPACITY_MESSAGE,
);

const leftoverOneCandidate = buildStep1FabricAssignmentCandidates({
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: leftoverState,
  fabricCode: "FAB-B",
});
assert.equal(leftoverOneCandidate.length, 2);
const shirtOnlyCandidates = buildStep1FabricAssignmentCandidates({
  garmentTypeSelection: createSelection(["shirt"]),
  fabricAllocationState: empty,
  fabricCode: "FAB-A",
});
assert.deepEqual(
  shirtOnlyCandidates.map((candidate) => candidate.garmentKey),
  ["base:shirt"],
);
assert.equal(
  shouldPromptStep1FabricAssignmentSelection(shirtOnlyCandidates.length),
  false,
);
const shirtAssignedRemaining = buildStep1FabricAssignmentCandidates({
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricAllocationState: assignOne(["shirt", "trouser"], "base:shirt"),
  fabricCode: "FAB-B",
});
assert.deepEqual(
  shirtAssignedRemaining.map((candidate) => candidate.garmentKey),
  ["base:trouser"],
);
assert.equal(
  shouldPromptStep1FabricAssignmentSelection(shirtAssignedRemaining.length),
  false,
);

const zeroSelected = evaluateStep1FabricAssignmentSelection({
  candidates: leftoverCandidates,
  selectedGarmentKeys: [],
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: leftoverState,
  fabricCode: "FAB-A",
});
assert.equal(zeroSelected.selectedCapacityUnits, 0);
assert.equal(
  zeroSelected.groupingCapacityStatus,
  STEP1_ZERO_CAPACITY_GUIDANCE_MESSAGE,
);

const shirtTrouserAssigned = assignSameFabricProductToGarments({
  state: empty,
  garmentTypeSelection: createSelection(threeTypes),
  fabricCode: "FAB-A",
  garmentKeys: ["base:shirt", "base:trouser"],
});
assert.equal(shirtTrouserAssigned.status, "assigned");
const dressOnlyCandidates = buildStep1FabricAssignmentCandidates({
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: shirtTrouserAssigned.state,
  fabricCode: "FAB-B",
});
assert.deepEqual(
  dressOnlyCandidates.map((candidate) => candidate.garmentKey),
  ["base:dress"],
);
const dressResidual = evaluateStep1FabricAssignmentSelection({
  candidates: dressOnlyCandidates,
  selectedGarmentKeys: ["base:dress"],
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: shirtTrouserAssigned.state,
  fabricCode: "FAB-B",
});
assert.equal(dressResidual.selectedCapacityUnits, 1);
assert.equal(dressResidual.maxCapacityUnits, 2);
assert.equal(dressResidual.canAssignSelected, true);
assert.equal(
  dressResidual.groupingCapacityStatus,
  STEP1_FINAL_RESIDUAL_CAPACITY_MESSAGE,
);

const gownTypes = ["shirt", "trouser", "full_length_gown"] satisfies FabricGarmentType[];
const stockOneFabric = [
  createFabric("FAB-STOCK", "Heritage Stock", 10, { stock: 1 }),
];
const gownCandidates = buildStep1FabricAssignmentCandidates({
  garmentTypeSelection: createSelection(gownTypes),
  fabricAllocationState: empty,
  fabricCode: "FAB-STOCK",
  fabrics: stockOneFabric,
});
const gownCandidate = gownCandidates.find(
  (candidate) => candidate.garmentKey === "base:full_length_gown",
);
assert.ok(gownCandidate);
assert.equal(gownCandidate.individuallyAssignable, true);
assert.equal(gownCandidate.disabledReason, null);
const gownAlone = evaluateStep1FabricAssignmentSelection({
  candidates: gownCandidates,
  selectedGarmentKeys: ["base:full_length_gown"],
  garmentTypeSelection: createSelection(gownTypes),
  fabricAllocationState: empty,
  fabricCode: "FAB-STOCK",
  fabrics: stockOneFabric,
});
assert.equal(gownAlone.selectedCapacityUnits, 2);
assert.equal(gownAlone.maxCapacityUnits, 2);
assert.equal(gownAlone.canAssignSelected, true);
assert.equal(
  gownAlone.groupingCapacityStatus,
  STEP1_FABRIC_CAPACITY_COMPLETE_MESSAGE,
);
assert.equal(gownAlone.candidateMessages["base:full_length_gown"] ?? null, null);
assert.equal(gownAlone.selectedFailure, null);

const gownUseAll = evaluateStep1FabricAssignmentSelection({
  candidates: gownCandidates,
  selectedGarmentKeys: gownCandidates.map((candidate) => candidate.garmentKey),
  garmentTypeSelection: createSelection(gownTypes),
  fabricAllocationState: empty,
  fabricCode: "FAB-STOCK",
  fabrics: stockOneFabric,
});
assert.equal(gownUseAll.canUseForAll, false);
assert.equal(gownUseAll.remainingFailure, null);
assert.equal(
  gownUseAll.remainingCapacityMessage,
  formatFabricStockExhaustedCopy(),
);
assert.equal(gownUseAll.candidateMessages["base:full_length_gown"] ?? null, null);
assert.notEqual(
  gownUseAll.candidateMessages["base:full_length_gown"],
  STEP1_GARMENT_CAPACITY_MESSAGE,
);

const stockTwoFabric = [
  createFabric("FAB-STOCK", "Heritage Stock", 10, { stock: 2 }),
];
const gownUseAllCommit = commitStep1FabricAssignment({
  state: empty,
  garmentTypeSelection: createSelection(gownTypes),
  fabrics: stockTwoFabric,
  fabricCode: "FAB-STOCK",
  selectedGarmentKeys: [],
  mode: "all_remaining",
});
assert.equal(gownUseAllCommit.status, "assigned");
assertLegalSameProductAllocations(gownUseAllCommit.state, "FAB-STOCK", 2);
assert.deepEqual(assignedKeys(gownUseAllCommit.state).sort(), [
  "base:full_length_gown",
  "base:shirt",
  "base:trouser",
]);

console.log("test_step1_fabric_assignment_popup.ts: all assertions passed");
