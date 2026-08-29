import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricGarmentType } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import { resolveAuthoritativePrimaryFabricCode } from "./src/utils/additionalGarmentFabricPicker";
import {
  applyFutureFabricCardSelection,
  assignSameFabricProductToGarments,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  STEP1_FABRIC_NO_LONGER_AVAILABLE_MESSAGE,
  STEP1_GARMENT_ALREADY_ASSIGNED_MESSAGE,
  STEP1_NO_GARMENTS_TO_ASSIGN_STATUS,
  STEP1_REMAINING_CAPACITY_MESSAGE,
  STEP1_SELECTED_CAPACITY_MESSAGE,
  buildStep1FabricAssignmentCandidates,
  commitStep1FabricAssignment,
  createStep1FabricAssignmentDisplaySnapshot,
  evaluateStep1FabricAssignmentSelection,
  getUnassignedStep1FabricAssignmentCandidates,
  resolveStep1AssignmentDialogFabric,
  resolveStep1FabricCatalogueCardPresentation,
  shouldPromptStep1FabricAssignmentSelection,
} from "./src/utils/step1FabricAssignmentPopup";

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
assert.equal(leftoverAll.canUseForAll, false);
assert.equal(leftoverAll.remainingCapacityMessage, STEP1_REMAINING_CAPACITY_MESSAGE);
assert.equal(leftoverAll.canAssignSelected, false);
assert.equal(leftoverAll.selectedCapacityMessage, STEP1_SELECTED_CAPACITY_MESSAGE);
const leftoverUseForAllCommit = commitStep1FabricAssignment({
  state: leftoverState,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: leftoverCandidates.map((candidate) => candidate.garmentKey),
  mode: "all_remaining",
});
assert.equal(leftoverUseForAllCommit.status, "blocked");
assert.equal(leftoverUseForAllCommit.state, leftoverState);
assert.deepEqual(assignedKeys(leftoverUseForAllCommit.state), ["base:shirt"]);

const combination = evaluateStep1FabricAssignmentSelection({
  candidates: leftoverCandidates,
  selectedGarmentKeys: ["base:trouser", "base:dress"],
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: leftoverState,
  fabricCode: "FAB-A",
});
assert.equal(combination.canAssignSelected, false);
assert.equal(combination.selectedCapacityMessage, STEP1_SELECTED_CAPACITY_MESSAGE);
const reduced = evaluateStep1FabricAssignmentSelection({
  candidates: leftoverCandidates,
  selectedGarmentKeys: ["base:trouser"],
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: leftoverState,
  fabricCode: "FAB-A",
});
assert.equal(reduced.canAssignSelected, true);
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
assert.equal(exhaustedPresentation.status, "IN USE");
assert.equal(exhaustedPresentation.action, "none");
const exhaustedCandidates = buildStep1FabricAssignmentCandidates({
  garmentTypeSelection: createSelection(threeTypes),
  fabricAllocationState: filled.state,
  fabricCode: "FAB-A",
});
assert.deepEqual(
  exhaustedCandidates.map((candidate) => candidate.garmentKey),
  ["base:dress"],
);
assert.equal(exhaustedCandidates[0]?.individuallyAssignable, false);
const exhaustedCommit = commitStep1FabricAssignment({
  state: filled.state,
  garmentTypeSelection: createSelection(threeTypes),
  fabrics,
  fabricCode: "FAB-A",
  selectedGarmentKeys: ["base:dress"],
  mode: "selected",
});
assert.equal(exhaustedCommit.status, "blocked");
assert.equal(exhaustedCommit.state, filled.state);

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
  existingAssignments: shirtOnly.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
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
  fabricCode: "FAB-B",
  garmentKeys: ["base:trouser"],
});
assert.equal(shirtThenTrouser.status, "assigned");
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
assert.equal(unusedOneCandidate.action, "select");
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

console.log("test_step1_fabric_assignment_popup.ts: all assertions passed");
