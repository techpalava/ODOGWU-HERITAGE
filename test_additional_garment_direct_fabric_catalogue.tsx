import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { FutureAdditionalGarmentFabricDialog } from "./src/components/FutureAdditionalGarmentFabricDialog";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric } from "./src/types";
import {
  createCatalogueAdditionalGarmentSelection,
  projectCatalogueStep1PhysicalOccurrences,
} from "./src/utils/additionalGarmentDomain";
import {
  assignFutureGarmentToExistingFabricAllocation,
  applyFutureFabricCardSelection,
  getFutureCompatiblePartialFabricAllocations,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const fabric = (code: string, name: string): Fabric => ({
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

const fabricA = fabric("CAT-A", "Catalogue A");
const fabricB = fabric("CAT-B", "Catalogue B");
const fabricC = fabric("CAT-C", "Catalogue C");
const fabrics = [fabricA, fabricB, fabricC];
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser"],
  selectedDemographics: ["unisex"],
  normalizedCustomDetailCatalog: [],
}).selection;

let state = FabricAllocationStateEngine.initialize();
state = FabricAllocationStateEngine.createAllocationForFabric(state, fabricA.code);
state = FabricAllocationStateEngine.attemptAppendGarment(state, {
  code: "BASE_SHIRT",
  garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
  sourceRole: "main",
});
const allocationA = state.fabricAllocations[0]!.allocationId;
state = FabricAllocationStateEngine.createAllocationForFabric(state, fabricB.code);
state = FabricAllocationStateEngine.attemptAppendGarment(state, {
  code: "BASE_TROUSER",
  garmentSpec: { key: "base:trouser", garmentType: "trouser", fabricUnits: 1 },
  sourceRole: "main",
});
const allocationB = state.fabricAllocations[1]!.allocationId;

const addition = createCatalogueAdditionalGarmentSelection({
  garmentType: "trouser",
  authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences([
    "shirt",
    "trouser",
  ]),
  authorizedOccurrenceKeys: [],
});
assert.equal(addition.status, "resolved");
const garmentKey = addition.selection.garmentSpec!.key;
const pendingState = FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
  state,
  addition.selection,
);

const compatible = getFutureCompatiblePartialFabricAllocations({
  garmentTypeSelection,
  fabricAllocationState: pendingState,
  garmentKey,
});
assert.deepEqual(
  compatible.map((entry) => entry.allocationId).sort(),
  [allocationA, allocationB].sort(),
  "each current-order allocation with enough capacity is independently reusable",
);

const selectedExistingAllocationIds: string[] = [];
const selectedNewFabricCodes: string[] = [];
let cancelCount = 0;
let renderer!: ReturnType<typeof create>;
act(() => {
  renderer = create(
    createElement(FutureAdditionalGarmentFabricDialog, {
      transaction: {
        transactionId: 1,
        phase: "catalogue",
        origin: "new_addition",
        garmentKey,
        garmentType: "trouser",
        openedModal: true,
      },
      fabrics,
      garmentTypeSelection,
      fabricAllocationState: pendingState,
      errorMessage: null,
      onSelectFabric: (fabricCode) => selectedNewFabricCodes.push(fabricCode),
      onSelectExistingAllocation: (allocationId) =>
        selectedExistingAllocationIds.push(allocationId),
      onCancel: () => {
        cancelCount += 1;
      },
    }),
  );
});

const dialog = renderer.root.findByType(FutureAdditionalGarmentFabricDialog);
assert.equal(
  dialog.findByProps({ "data-additional-garment-fabric-dialog": "true" }).props[
    "data-dialog-phase"
  ],
  "catalogue",
  "a new additional garment opens the catalogue immediately",
);
const catalogueCopy = textContent(dialog);
assert.doesNotMatch(catalogueCopy, /Use Same Fabric Again|Choose Another Fabric/);
assert.match(catalogueCopy, /Choose fabric for Trouser/);
assert.equal(
  dialog.findAllByProps({ "data-fabric-in-current-order": "true" }).length,
  2,
  "all reusable current-order fabrics are marked in the one catalogue",
);
assert.equal(
  dialog.findAllByProps({ "data-fabric-card-code": fabricA.code }).length,
  1,
  "a current-order fabric has one catalogue card, not an existing/catalogue duplicate",
);
assert.equal(
  dialog.findAllByProps({ "data-fabric-card-code": fabricB.code }).length,
  1,
);
assert.equal(
  dialog.findAllByProps({ "aria-pressed": true }).length,
  0,
  "eligible current-order fabrics are not preselected",
);

act(() => {
  dialog
    .findByProps({ "data-fabric-existing-allocation": allocationA })
    .props.onClick();
});
assert.deepEqual(selectedExistingAllocationIds, [allocationA]);

act(() => {
  dialog
    .findByProps({
      "data-fabric-card": "true",
      "data-fabric-code": fabricC.code,
      "data-fabric-action": "select",
    })
    .props.onClick();
});
assert.deepEqual(selectedNewFabricCodes, [fabricC.code]);

const reused = assignFutureGarmentToExistingFabricAllocation({
  state: pendingState,
  garmentTypeSelection,
  garmentKey,
  allocationId: allocationA,
});
assert.equal(reused.status, "assigned");
assert.equal(reused.state.fabricAllocations.length, 2);
assert.ok(
  reused.state.fabricAllocations
    .find((entry) => entry.allocationId === allocationA)!
    .garmentAssignments.some((assignment) => assignment.garmentKey === garmentKey),
  "choosing an existing card reuses its exact physical allocation",
);

const bumShortsAddition = createCatalogueAdditionalGarmentSelection({
  garmentType: "bum_shorts",
  authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences([
    "shirt",
    "trouser",
  ]),
  authorizedOccurrenceKeys: [],
});
assert.equal(bumShortsAddition.status, "resolved");
const pendingBumShortsState =
  FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    state,
    bumShortsAddition.selection,
  );
const bumShortsKey = bumShortsAddition.selection.garmentSpec!.key;
assert.equal(
  pendingBumShortsState.pendingFabricGarment?.garmentSpec?.fabricUnits,
  1,
  "the parked Bum Shorts selection retains its authoritative one-unit capacity",
);
assert.ok(
  getFutureCompatiblePartialFabricAllocations({
    garmentTypeSelection,
    fabricAllocationState: pendingBumShortsState,
    garmentKey: bumShortsKey,
  }).some((entry) => entry.allocationId === allocationA),
);
const reusedBumShorts = assignFutureGarmentToExistingFabricAllocation({
  state: pendingBumShortsState,
  garmentTypeSelection,
  garmentKey: bumShortsKey,
  allocationId: allocationA,
});
assert.equal(
  reusedBumShorts.status,
  "assigned",
  "a catalogue-marked one-unit Bum Shorts allocation must assign successfully",
);

const newAllocation = applyFutureFabricCardSelection({
  state: pendingState,
  garmentTypeSelection,
  garmentKey,
  fabricCode: fabricC.code,
  fabrics,
});
assert.equal(newAllocation.fabricAllocations.length, 3);
assert.equal(
  newAllocation.fabricAllocations.find((entry) =>
    entry.garmentAssignments.some((assignment) => assignment.garmentKey === garmentKey),
  )?.fabricCode,
  fabricC.code,
  "choosing a different catalogue fabric follows the authoritative new-allocation path",
);

act(() => {
  dialog.findByProps({ "data-fabric-dialog-action": "cancel" }).props.onClick();
});
assert.equal(cancelCount, 1, "catalogue cancel remains available before assignment");
act(() => renderer.unmount());

let sameCodeState = FabricAllocationStateEngine.initialize();
sameCodeState = FabricAllocationStateEngine.createAllocationForFabric(
  sameCodeState,
  fabricA.code,
);
sameCodeState = FabricAllocationStateEngine.attemptAppendGarment(sameCodeState, {
  code: "BASE_SHIRT",
  garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
  sourceRole: "main",
});
const firstSameCodeAllocationId = sameCodeState.fabricAllocations[0]!.allocationId;
sameCodeState = FabricAllocationStateEngine.createAllocationForFabric(
  sameCodeState,
  fabricA.code,
);
sameCodeState = FabricAllocationStateEngine.attemptAppendGarment(sameCodeState, {
  code: "BASE_TROUSER",
  garmentSpec: {
    key: "base:trouser",
    garmentType: "trouser",
    fabricUnits: 1,
  },
  sourceRole: "main",
});
const secondSameCodeAllocationId = sameCodeState.fabricAllocations[1]!.allocationId;
const sameCodePendingState =
  FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    sameCodeState,
    addition.selection,
  );
act(() => {
  renderer = create(
    createElement(FutureAdditionalGarmentFabricDialog, {
      transaction: {
        transactionId: 3,
        phase: "catalogue",
        origin: "new_addition",
        garmentKey,
        garmentType: "trouser",
        openedModal: true,
      },
      fabrics: [fabricA, fabricB, fabricC],
      garmentTypeSelection,
      fabricAllocationState: sameCodePendingState,
      errorMessage: null,
      onSelectFabric: () => undefined,
      onSelectExistingAllocation: () => undefined,
      onCancel: () => undefined,
    }),
  );
});
const sameCodeDialog = renderer.root.findByType(
  FutureAdditionalGarmentFabricDialog,
);
assert.equal(
  sameCodeDialog.findAllByProps({ "data-fabric-card-code": fabricA.code }).length,
  1,
  "two physical allocations of one code still render as one fabric card",
);
assert.equal(
  sameCodeDialog.findAllByProps({
    "data-fabric-existing-allocation": firstSameCodeAllocationId,
  }).length,
  1,
);
assert.equal(
  sameCodeDialog.findAllByProps({
    "data-fabric-existing-allocation": secondSameCodeAllocationId,
  }).length,
  1,
  "each selectable button preserves its own physical allocation identity",
);
assert.match(textContent(sameCodeDialog), /Select Fabric Selection 1/);
assert.match(textContent(sameCodeDialog), /Select Fabric Selection 2/);
act(() => renderer.unmount());

const outOfStockA: Fabric = { ...fabricA, stockStatus: "OUT_OF_STOCK" };
act(() => {
  renderer = create(
    createElement(FutureAdditionalGarmentFabricDialog, {
      transaction: {
        transactionId: 2,
        phase: "catalogue",
        origin: "new_addition",
        garmentKey,
        garmentType: "trouser",
        openedModal: true,
      },
      fabrics: [outOfStockA, fabricB, fabricC],
      garmentTypeSelection,
      fabricAllocationState: pendingState,
      errorMessage: null,
      onSelectFabric: () => undefined,
      onSelectExistingAllocation: () => undefined,
      onCancel: () => undefined,
    }),
  );
});
const outOfStockDialog = renderer.root.findByType(FutureAdditionalGarmentFabricDialog);
assert.equal(
  outOfStockDialog.findAllByProps({
    "data-fabric-existing-allocation": allocationA,
  }).length,
  0,
  "an out-of-stock existing fabric remains unavailable instead of reusable",
);
act(() => renderer.unmount());

const gownSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "full_length_gown"],
  selectedDemographics: ["unisex"],
  normalizedCustomDetailCatalog: [],
}).selection;
let gownState = FabricAllocationStateEngine.initialize();
gownState = FabricAllocationStateEngine.createAllocationForFabric(gownState, fabricA.code);
gownState = FabricAllocationStateEngine.attemptAppendGarment(gownState, {
  code: "BASE_SHIRT",
  garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
  sourceRole: "main",
});
const halfCapacityAllocationId = gownState.fabricAllocations[0]!.allocationId;
gownState = FabricAllocationStateEngine.createAllocationForFabric(gownState, fabricB.code);
gownState = FabricAllocationStateEngine.attemptAppendGarment(gownState, {
  code: "BASE_GOWN",
  garmentSpec: {
    key: "base:full_length_gown",
    garmentType: "full_length_gown",
    fabricUnits: 2,
  },
  sourceRole: "main",
});
const gownAddition = createCatalogueAdditionalGarmentSelection({
  garmentType: "full_length_gown",
  authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences([
    "shirt",
    "full_length_gown",
  ]),
  authorizedOccurrenceKeys: [],
});
assert.equal(gownAddition.status, "resolved");
const pendingGownState = FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
  gownState,
  gownAddition.selection,
);
assert.equal(
  getFutureCompatiblePartialFabricAllocations({
    garmentTypeSelection: gownSelection,
    fabricAllocationState: pendingGownState,
    garmentKey: gownAddition.selection.garmentSpec!.key,
  }).some((entry) => entry.allocationId === halfCapacityAllocationId),
  false,
  "a half-capacity allocation is not reusable for a full-unit Long Dress",
);

console.log("PASS: additional garment direct Fabric catalogue");
