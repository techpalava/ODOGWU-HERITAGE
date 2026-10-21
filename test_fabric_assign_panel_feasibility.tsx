/**
 * Regression: "Your order already uses the 5 fabrics required" in the Assign
 * Fabric panel, and the dead end behind it.
 *
 * 9 garments (8 half-unit garments + a Long Dress) need 5 Fabrics. With
 * Fabric A = Shirt + Trouser, B = Skirt + Long Skirt and C = Nikka Shorts
 * alone (1/2 free), opening a new Fabric used to show a red quantity error at
 * once, and ticking Bum Shorts, Dress AND Long Shirt was allowed. Assigning
 * them used two pieces of the new Fabric, so all 5 Fabrics were chosen with
 * the free space split into halves: the Long Dress could never get fabric.
 *
 * Now: (1) the fit check stops any box/assignment that would strand a waiting
 * garment and points at the Fabric with 1/2 capacity free, (2) opening the
 * panel shows only a neutral Use for All note, and (3) a stuck saved draft
 * gets the one-tap Move rescue with the Guide beam on it.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricAllocation, FabricAllocationState, GarmentTypeStepSelection } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  assignFutureFabricToGarment,
  assignFutureGarmentToExistingFabricAllocation,
  getFabricQuantityFit,
  getFabricQuantityOverAllocationRepair,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  moveFutureGarmentToFabricAllocation,
} from "./src/utils/designStudioFutureFabricStage";
import {
  buildStep1FabricAssignmentCandidates,
  commitStep1FabricAssignment,
  evaluateStep1FabricAssignmentSelection,
} from "./src/utils/step1FabricAssignmentPopup";
import { buildFabricGuideFlow } from "./src/utils/fabricStepGuideFlow";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;
const { DormantFutureFabricStep } = await import("./src/components/DormantFutureFabricStep");
const { Step1FabricAssignmentDialog } = await import("./src/components/Step1FabricAssignmentDialog");
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const selectionFor = (types: string[]): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: types as Parameters<
      typeof reconcileGarmentTypeStepSelection
    >[0]["selectedGarmentTypes"],
    selectedDemographics: ["male", "female"] as Parameters<
      typeof reconcileGarmentTypeStepSelection
    >[0]["selectedDemographics"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const nine = selectionFor([
  "shirt",
  "trouser",
  "skirt",
  "long_skirt",
  "standard_shorts",
  "bum_shorts",
  "dress",
  "kaftan",
  "full_length_gown",
]);
const fabric = (suffix: string, name: string, stock = 30): Fabric => ({
  code: `FIT-${suffix}`,
  name,
  description: "Test fabric",
  color: "Blue",
  colorHex: "#1B4F72",
  category: "Test",
  price: 20,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  stock,
  image: `https://cdn.example.com/fabrics/fit-${suffix}.jpg`,
});
const fabrics: Fabric[] = [
  fabric("A", "Fabric A"),
  fabric("B", "Fabric B"),
  fabric("C", "Royal Forest Mosaic"),
  fabric("N", "Maroon Pattern", 3),
  fabric("E", "Fabric E"),
];

const assign = (state: FabricAllocationState, garmentKey: string, fabricCode: string) => {
  const result = assignFutureFabricToGarment({
    state,
    garmentTypeSelection: nine,
    garmentKey,
    fabricCode,
    fabrics,
  });
  assert.equal(result.status, "assigned", `assign ${garmentKey} -> ${fabricCode}`);
  return result.state;
};
const layout = (state: FabricAllocationState) =>
  state.fabricAllocations.map((allocation) => [
    allocation.fabricCode,
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ]);

// Fabric A = Shirt + Trouser, B = Skirt + Long Skirt, C = Nikka Shorts alone.
let base = FabricAllocationStateEngine.initialize();
base = assign(base, "base:shirt", "FIT-A");
base = assign(base, "base:trouser", "FIT-A");
base = assign(base, "base:skirt", "FIT-B");
base = assign(base, "base:long_skirt", "FIT-B");
base = assign(base, "base:standard_shorts", "FIT-C");
assert.deepEqual(layout(base), [
  ["FIT-A", ["base:shirt", "base:trouser"]],
  ["FIT-B", ["base:skirt", "base:long_skirt"]],
  ["FIT-C", ["base:standard_shorts"]],
]);
assert.deepEqual(
  (({ requiredFabricQuantity, selectedFabricQuantity }) => [requiredFabricQuantity, selectedFabricQuantity])(
    getFutureGarmentFabricPlanning({ garmentTypeSelection: nine, fabricAllocationState: base }),
  ),
  [5, 3],
);
assert.equal(getFabricQuantityFit({ state: base, garmentTypeSelection: nine }).shortfall, 0);

const candidates = buildStep1FabricAssignmentCandidates({
  garmentTypeSelection: nine,
  fabricAllocationState: base,
  fabricCode: "FIT-N",
  fabrics,
});
assert.deepEqual(
  candidates.map((candidate) => candidate.garmentKey),
  ["base:bum_shorts", "base:dress", "base:kaftan", "base:full_length_gown"],
);
const evaluate = (selectedGarmentKeys: string[]) =>
  evaluateStep1FabricAssignmentSelection({
    candidates,
    selectedGarmentKeys,
    garmentTypeSelection: nine,
    fabricAllocationState: base,
    fabricCode: "FIT-N",
    fabrics,
  });

// ---------------------------------------------------------------------------
// 1. Opening state: no red error, only a neutral Use for All note.
// ---------------------------------------------------------------------------
const USE_FOR_ALL_NOTE =
  "Using this Fabric for all remaining garments would need 6 fabrics; your order needs 5.";
const opened = evaluate([]);
assert.equal(opened.remainingCapacityMessage, null, "no red Use for All error on open");
assert.equal(opened.selectedCapacityMessage, null);
assert.equal(opened.fabricLevelError, null);
assert.equal(opened.remainingCapacityNote, USE_FOR_ALL_NOTE);
assert.equal(opened.canUseForAll, false);
assert.deepEqual(Object.values(opened.candidateMessages), [null, null, null, null]);
assert.ok(Object.values(opened.candidateEnabled).every(Boolean), "every box starts enabled");

// ---------------------------------------------------------------------------
// 2. Fit check: after Bum Shorts + Dress, the 3rd half-unit box is disabled
//    with a pointer to the Fabric that has 1/2 free; Long Dress stays enabled.
// ---------------------------------------------------------------------------
const POINTER =
  "Long Dress needs a whole fabric. Put Long Shirt on Fabric Selection 3 (Royal Forest Mosaic), which has 1/2 capacity left.";
const two = evaluate(["base:bum_shorts", "base:dress"]);
assert.equal(two.canAssignSelected, true);
assert.equal(two.candidateEnabled["base:kaftan"], false, "Long Shirt is greyed out");
assert.equal(two.candidateMessages["base:kaftan"], POINTER);
assert.equal(two.candidateEnabled["base:full_length_gown"], true, "Long Dress stays assignable");
assert.equal(two.candidateMessages["base:full_length_gown"], null);
assert.equal(two.remainingCapacityMessage, null);
// Any order of ticking: whichever half-unit garment comes third is blocked.
const kaftanFirst = evaluate(["base:kaftan", "base:bum_shorts"]);
assert.equal(kaftanFirst.candidateEnabled["base:dress"], false);
assert.match(kaftanFirst.candidateMessages["base:dress"] ?? "", /^Long Dress needs a whole fabric\. Put Standard Dress on Fabric Selection 3 \(Royal Forest Mosaic\)/);
// The old dead-end selection can no longer be assigned.
const deadEndSelection = evaluate(["base:bum_shorts", "base:dress", "base:kaftan"]);
assert.equal(deadEndSelection.canAssignSelected, false, "ASSIGN cannot strand the Long Dress");
const deadEndCommit = commitStep1FabricAssignment({
  state: base,
  garmentTypeSelection: nine,
  fabrics,
  fabricCode: "FIT-N",
  selectedGarmentKeys: ["base:bum_shorts", "base:dress", "base:kaftan"],
  mode: "selected",
});
assert.equal(deadEndCommit.status, "blocked");
assert.equal(deadEndCommit.state, base, "nothing changes");

// Single-garment path: Long Shirt alone on a 2nd new Fabric is blocked too.
const afterTwo = commitStep1FabricAssignment({
  state: base,
  garmentTypeSelection: nine,
  fabrics,
  fabricCode: "FIT-N",
  selectedGarmentKeys: ["base:bum_shorts", "base:dress"],
  mode: "selected",
});
assert.equal(afterTwo.status, "assigned");
const twoState = afterTwo.state;
const loneKaftan = assignFutureFabricToGarment({
  state: twoState,
  garmentTypeSelection: nine,
  garmentKey: "base:kaftan",
  fabricCode: "FIT-E",
  fabrics,
});
assert.equal(loneKaftan.status, "blocked");
assert.equal(loneKaftan.status === "blocked" ? loneKaftan.reason : null, "FABRIC_QUANTITY_LIMIT_REACHED");

// ---------------------------------------------------------------------------
// 3. The guided path completes: Long Shirt onto Fabric Selection 3, then Long
//    Dress on a new Fabric; Continue unlocks with exactly 5 Fabrics.
// ---------------------------------------------------------------------------
const guided = assignFutureGarmentToExistingFabricAllocation({
  state: twoState,
  garmentTypeSelection: nine,
  garmentKey: "base:kaftan",
  allocationId: twoState.fabricAllocations[2]!.allocationId,
});
assert.equal(guided.status, "assigned");
let guidedState = guided.state;
guidedState = assign(guidedState, "base:full_length_gown", "FIT-E");
const guidedCompletion = getFutureFabricStageCompletion({
  garmentTypeSelection: nine,
  fabricAllocationState: guidedState,
  fabrics,
});
assert.equal(guidedCompletion.isComplete, true);
assert.equal(
  getFutureGarmentFabricPlanning({ garmentTypeSelection: nine, fabricAllocationState: guidedState })
    .selectedFabricQuantity,
  5,
);
// Long Dress also stays assignable straight after Bum Shorts + Dress.
assert.equal(
  assignFutureFabricToGarment({
    state: twoState,
    garmentTypeSelection: nine,
    garmentKey: "base:full_length_gown",
    fabricCode: "FIT-E",
    fabrics,
  }).status,
  "assigned",
);

// ---------------------------------------------------------------------------
// 4. Rescue: a draft saved in the dead end (5 Fabrics, Long Dress waiting).
// ---------------------------------------------------------------------------
const record = (garmentKey: string) =>
  assign(FabricAllocationStateEngine.initialize(), garmentKey, "FIT-A").fabricAllocations[0]!
    .garmentAssignments[0]!;
const allocation = (allocationId: string, fabricCode: string, keys: string[]): FabricAllocation => ({
  allocationId,
  fabricCode,
  garmentAssignments: keys.map(record),
});
const stuck: FabricAllocationState = {
  fabricAllocations: [
    allocation("s1", "FIT-A", ["base:shirt", "base:trouser"]),
    allocation("s2", "FIT-B", ["base:skirt", "base:long_skirt"]),
    allocation("s3", "FIT-C", ["base:standard_shorts"]),
    allocation("s4", "FIT-N", ["base:bum_shorts", "base:dress"]),
    allocation("s5", "FIT-N", ["base:kaftan"]),
  ],
  activeAllocationId: "s5",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
const stuckFit = getFabricQuantityFit({ state: stuck, garmentTypeSelection: nine });
assert.deepEqual(
  [stuckFit.requiredFabricQuantity, stuckFit.committedFabricQuantity, stuckFit.shortfall],
  [5, 5, 1],
);
for (const code of fabrics.map((item) => item.code)) {
  assert.equal(
    assignFutureFabricToGarment({
      state: stuck,
      garmentTypeSelection: nine,
      garmentKey: "base:full_length_gown",
      fabricCode: code,
      fabrics,
    }).status,
    "blocked",
    `the dead end: Long Dress cannot use ${code}`,
  );
}
const stuckCompletion = getFutureFabricStageCompletion({
  garmentTypeSelection: nine,
  fabricAllocationState: stuck,
  fabrics,
});
assert.deepEqual(stuckCompletion.blockers, [
  { code: "GARMENT_ASSIGNMENT_REQUIRED", garmentKey: "base:full_length_gown" },
  { code: "FABRIC_QUANTITY_STRANDED", garmentKey: "base:full_length_gown" },
]);
const rescue = getFabricQuantityOverAllocationRepair({ state: stuck, garmentTypeSelection: nine });
assert.ok(rescue, "a one-move rescue exists");
assert.deepEqual(
  [rescue!.kind, rescue!.garmentKey, rescue!.fromSelectionNumber, rescue!.toSelectionNumber, rescue!.toFabricCode, rescue!.strandedGarmentKeys],
  ["stranded", "base:kaftan", 5, 3, "FIT-C", ["base:full_length_gown"]],
);
const rescued = moveFutureGarmentToFabricAllocation({
  state: stuck,
  garmentKey: rescue!.garmentKey,
  allocationId: rescue!.toAllocationId,
});
assert.equal(rescued.status, "moved");
assert.equal(getFabricQuantityFit({ state: rescued.state, garmentTypeSelection: nine }).shortfall, 0);
assert.equal(
  getFabricQuantityOverAllocationRepair({ state: rescued.state, garmentTypeSelection: nine }),
  null,
);
const rescuedComplete = assign(rescued.state, "base:full_length_gown", "FIT-E");
assert.equal(
  getFutureFabricStageCompletion({ garmentTypeSelection: nine, fabricAllocationState: rescuedComplete, fabrics })
    .isComplete,
  true,
  "Continue unlocks after the rescue move + Long Dress",
);
// A within-limit order that is not stuck gets no rescue.
assert.equal(getFabricQuantityOverAllocationRepair({ state: base, garmentTypeSelection: nine }), null);

// Guide flow: stranded-only quantity step names the garment and beams the move.
{
  const flow = buildFabricGuideFlow({
    isComplete: false,
    garments: [
      { garmentKey: "base:kaftan", label: "Long Shirt", assigned: true, fabricCode: "FIT-N", allocationId: "s5" },
      { garmentKey: "base:full_length_gown", label: "Long Dress", assigned: false, action: "add_fabric" },
    ],
    blockers: [
      { code: "GARMENT_ASSIGNMENT_REQUIRED", message: "Choose a fabric.", garmentKey: "base:full_length_gown" },
      { code: "FABRIC_QUANTITY_STRANDED", message: "No whole fabric.", garmentKey: "base:full_length_gown" },
    ],
    selectedFabricQuantity: 5,
    quantityRepair: { garmentKey: "base:kaftan", message: "Move it." },
  });
  assert.equal(flow.currentStep?.kind, "fix_quantity");
  assert.equal(flow.currentStep?.label, "Make room for Long Dress");
  assert.deepEqual(flow.currentStep?.target, { type: "quantity_move", garmentKey: "base:kaftan" });
}

// ---------------------------------------------------------------------------
// 5. Rendered: panel opening has no red text; stuck draft shows the rescue.
// ---------------------------------------------------------------------------
const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";
const createNodeMock = () => ({
  focus: () => undefined,
  scrollIntoView: () => undefined,
  getAttribute: () => null,
  hasAttribute: () => false,
  isConnected: true,
  tabIndex: 0,
  parentElement: null,
  tagName: "DIV",
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  querySelectorAll: () => [],
  contains: () => false,
});
const renderDialog = (selectedGarmentKeys: string[]) => {
  const evaluation = evaluate(selectedGarmentKeys);
  return createElement(Step1FabricAssignmentDialog, {
    displayFabric: fabrics[3]!,
    currentFabric: fabrics[3]!,
    candidates,
    selectedGarmentKeys,
    ...evaluation,
    errorMessage: null,
    onToggleGarmentKey: () => undefined,
    onAssignSelected: () => undefined,
    onUseForAll: () => undefined,
    onCancel: () => undefined,
  });
};
const redNodes = (root: ReactTestInstance) =>
  root.findAll(
    (node) =>
      typeof node.type === "string" &&
      /text-red-700/.test(String(node.props.className ?? "")) &&
      textContent(node).trim().length > 0,
  );
{
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderDialog([]), { createNodeMock });
  });
  assert.deepEqual(redNodes(renderer.root).map((node) => textContent(node)), [], "no red text on open");
  assert.doesNotMatch(textContent(renderer.root), /already uses the 5 fabrics/);
  const note = renderer.root.find(
    (node) => typeof node.type === "string" && node.props["data-testid"] === "step1-fabric-assignment-remaining-capacity-note",
  );
  assert.equal(textContent(note), USE_FOR_ALL_NOTE);
  assert.doesNotMatch(String(note.props.className), /red/);
  const useForAll = renderer.root.find(
    (node) => node.type === "button" && node.props["data-testid"] === "step1-fabric-assignment-use-for-all",
  );
  assert.equal(useForAll.props.disabled, true);
  assert.equal(useForAll.props.title, USE_FOR_ALL_NOTE);

  await act(async () => {
    renderer.update(renderDialog(["base:bum_shorts", "base:dress"]));
  });
  const kaftanBox = renderer.root.find(
    (node) => node.type === "input" && node.props["data-step1-fabric-assignment-checkbox"] === "base:kaftan",
  );
  assert.equal(kaftanBox.props.disabled, true);
  const kaftanWarning = renderer.root.find(
    (node) => typeof node.type === "string" && node.props["data-step1-fabric-assignment-row-warning"] === "base:kaftan",
  );
  assert.equal(textContent(kaftanWarning), POINTER);
  const dressBox = renderer.root.find(
    (node) => node.type === "input" && node.props["data-step1-fabric-assignment-checkbox"] === "base:full_length_gown",
  );
  assert.equal(dressBox.props.disabled, false, "Long Dress box stays enabled");
}

{
  const completion = stuckCompletion;
  const plan = getFutureGarmentFabricPlanning({ garmentTypeSelection: nine, fabricAllocationState: stuck });
  const moveCalls: Array<[string, string]> = [];
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      createElement(DormantFutureFabricStep, {
        fabrics,
        garmentTypeSelection: nine,
        fabricAllocationState: stuck,
        completion,
        requiredFabricQuantity: plan.requiredFabricQuantity,
        selectedFabricQuantity: plan.selectedFabricQuantity,
        constructionPrice: 0,
        onAssignFabricToGarment: () => undefined,
        onChangeFabricAllocationProduct: () => undefined,
        onRemoveFabricFromGarment: () => undefined,
        onUseSameFabricForGarment: () => undefined,
        onAssignSameFabricProduct: () => undefined,
        onAssignGarmentToExistingAllocation: () => undefined,
        onMoveGarmentToFabricAllocation: (garmentKey: string, allocationId: string) => {
          moveCalls.push([garmentKey, allocationId]);
          return moveFutureGarmentToFabricAllocation({ state: stuck, garmentKey, allocationId });
        },
        onBack: () => undefined,
        onContinue: () => undefined,
        onUseSameFabric: () => undefined,
        onChooseAnotherFabric: () => undefined,
        onCancelPendingFabric: () => undefined,
      }),
      { createNodeMock },
    );
  });
  const guide = renderer.root.find(
    (node) => typeof node.type === "string" && node.props["data-testid"] === "fabric-guide-flow",
  );
  assert.equal(guide.props["data-fabric-guide-current"], "fix_quantity");
  assert.equal(guide.props["data-fabric-quantity-stranded"], "true");
  const text = textContent(guide);
  assert.match(text, /Make room for Long Dress/);
  assert.match(
    text,
    /Long Dress needs a whole fabric, but all 5 fabrics your order needs are already chosen and the space left is split into halves\. Move a garment to free a whole fabric\./,
  );
  assert.match(
    text,
    /Long Shirt is the only garment on its Fabric\. Move it onto Fabric Selection 3 \(Royal Forest Mosaic\), which has room for it, so a whole fabric is free for Long Dress\./,
  );
  const beams = renderer.root.findAll(
    (node) => typeof node.type === "string" && node.props["data-fabric-guide-beam"] === "true",
  );
  assert.equal(beams.length, 1, "exactly one beam");
  assert.equal(beams[0]!.props["data-testid"], "fabric-guide-quantity-move");
  assert.equal(textContent(beams[0]!), "Move Long Shirt to Fabric Selection 3");
  await act(async () => beams[0]!.props.onClick());
  assert.deepEqual(moveCalls, [["base:kaftan", "s3"]]);
}

// The Fabric step wires the neutral note into the panel.
{
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("src/components/DormantFutureFabricStep.tsx", "utf8");
  assert.match(source, /remainingCapacityNote=\{step1AssignmentEvaluation\.remainingCapacityNote\}/);
}

console.log("test_fabric_assign_panel_feasibility: PASS");
