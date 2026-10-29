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
 * Since fabric-print-freedom the limit is one piece per garment, not Fabrics
 * Needed, so that dead end cannot happen: the Long Dress can always take its
 * own piece. Opening the panel shows no red text and no quantity note, every
 * box stays enabled, and the old "stuck" draft just needs the Long Dress
 * assigned (no Move rescue).
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
// 1. Opening state: no red error and no quantity note; Use for All allowed.
// ---------------------------------------------------------------------------
const opened = evaluate([]);
assert.equal(opened.remainingCapacityMessage, null, "no red Use for All error on open");
assert.equal(opened.selectedCapacityMessage, null);
assert.equal(opened.fabricLevelError, null);
assert.equal(opened.remainingCapacityNote, null, "no Fabrics Needed note: extra pieces are allowed");
assert.equal(opened.canUseForAll, true);
assert.deepEqual(Object.values(opened.candidateMessages), [null, null, null, null]);
assert.ok(Object.values(opened.candidateEnabled).every(Boolean), "every box starts enabled");

// ---------------------------------------------------------------------------
// 2. After Bum Shorts + Dress, Long Shirt stays enabled (no fit pointer) and
//    the old dead-end selection can be assigned.
// ---------------------------------------------------------------------------
const two = evaluate(["base:bum_shorts", "base:dress"]);
assert.equal(two.canAssignSelected, true);
assert.equal(two.candidateEnabled["base:kaftan"], true, "Long Shirt stays enabled");
assert.equal(two.candidateMessages["base:kaftan"], null);
assert.equal(two.candidateEnabled["base:full_length_gown"], true, "Long Dress stays assignable");
assert.equal(two.candidateMessages["base:full_length_gown"], null);
assert.equal(two.remainingCapacityMessage, null);
const threeTicked = evaluate(["base:bum_shorts", "base:dress", "base:kaftan"]);
assert.equal(threeTicked.canAssignSelected, true, "ASSIGN is allowed: Long Dress can still get its own piece");
const threeCommit = commitStep1FabricAssignment({
  state: base,
  garmentTypeSelection: nine,
  fabrics,
  fabricCode: "FIT-N",
  selectedGarmentKeys: ["base:bum_shorts", "base:dress", "base:kaftan"],
  mode: "selected",
});
assert.equal(threeCommit.status, "assigned");
assert.equal(
  assignFutureFabricToGarment({
    state: threeCommit.state,
    garmentTypeSelection: nine,
    garmentKey: "base:full_length_gown",
    fabricCode: "FIT-E",
    fabrics,
  }).status,
  "assigned",
  "Long Dress gets a 6th piece (6 pieces for 9 garments)",
);

// Single-garment path: Long Shirt alone on a new print is allowed too.
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
assert.equal(loneKaftan.status, "assigned");

// ---------------------------------------------------------------------------
// 3. The paired path still completes with exactly 5 Fabrics.
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
assert.equal(
  getFutureFabricStageCompletion({ garmentTypeSelection: nine, fabricAllocationState: guidedState, fabrics })
    .isComplete,
  true,
);
assert.equal(
  getFutureGarmentFabricPlanning({ garmentTypeSelection: nine, fabricAllocationState: guidedState })
    .selectedFabricQuantity,
  5,
);

// ---------------------------------------------------------------------------
// 4. The old "stuck" draft (5 Fabrics, Long Dress waiting) is no longer stuck.
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
  [5, 5, 0],
);
for (const code of ["FIT-A", "FIT-B", "FIT-C", "FIT-E"]) {
  assert.equal(
    assignFutureFabricToGarment({
      state: stuck,
      garmentTypeSelection: nine,
      garmentKey: "base:full_length_gown",
      fabricCode: code,
      fabrics,
    }).status,
    "assigned",
    `Long Dress can use ${code}`,
  );
}
const stuckCompletion = getFutureFabricStageCompletion({
  garmentTypeSelection: nine,
  fabricAllocationState: stuck,
  fabrics,
});
assert.deepEqual(stuckCompletion.blockers, [
  { code: "GARMENT_ASSIGNMENT_REQUIRED", garmentKey: "base:full_length_gown" },
]);
assert.equal(getFabricQuantityOverAllocationRepair({ state: stuck, garmentTypeSelection: nine }), null);
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
// 5. Rendered: panel opening has no red text; old stuck draft has no rescue.
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
  assert.equal(
    renderer.root.findAll(
      (node) => typeof node.type === "string" && node.props["data-testid"] === "step1-fabric-assignment-remaining-capacity-note",
    ).length,
    0,
  );
  const useForAll = renderer.root.find(
    (node) => node.type === "button" && node.props["data-testid"] === "step1-fabric-assignment-use-for-all",
  );
  assert.equal(useForAll.props.disabled, false);

  await act(async () => {
    renderer.update(renderDialog(["base:bum_shorts", "base:dress"]));
  });
  const kaftanBox = renderer.root.find(
    (node) => node.type === "input" && node.props["data-step1-fabric-assignment-checkbox"] === "base:kaftan",
  );
  assert.equal(kaftanBox.props.disabled, false, "Long Shirt box stays enabled");
  const dressBox = renderer.root.find(
    (node) => node.type === "input" && node.props["data-step1-fabric-assignment-checkbox"] === "base:full_length_gown",
  );
  assert.equal(dressBox.props.disabled, false, "Long Dress box stays enabled");
}

{
  const plan = getFutureGarmentFabricPlanning({ garmentTypeSelection: nine, fabricAllocationState: stuck });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      createElement(DormantFutureFabricStep, {
        fabrics,
        garmentTypeSelection: nine,
        fabricAllocationState: stuck,
        completion: stuckCompletion,
        requiredFabricQuantity: plan.requiredFabricQuantity,
        selectedFabricQuantity: plan.selectedFabricQuantity,
        constructionPrice: 0,
        onAssignFabricToGarment: () => undefined,
        onChangeFabricAllocationProduct: () => undefined,
        onRemoveFabricFromGarment: () => undefined,
        onUseSameFabricForGarment: () => undefined,
        onAssignSameFabricProduct: () => undefined,
        onAssignGarmentToExistingAllocation: () => undefined,
        onMoveGarmentToFabricAllocation: () => undefined,
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
  assert.equal(guide.props["data-fabric-guide-current"], "assign_garment:base:full_length_gown");
  assert.notEqual(guide.props["data-fabric-quantity-stranded"], "true");
  assert.equal(
    renderer.root.findAll(
      (node) => typeof node.type === "string" && node.props["data-testid"] === "fabric-guide-quantity-move",
    ).length,
    0,
    "no Move rescue",
  );
}

// The Fabric step wires the neutral note into the panel.
{
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("src/components/DormantFutureFabricStep.tsx", "utf8");
  assert.match(source, /remainingCapacityNote=\{step1AssignmentEvaluation\.remainingCapacityNote\}/);
}

console.log("test_fabric_assign_panel_feasibility: PASS");
