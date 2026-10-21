/**
 * Regression: "Fix your fabric quantity" block on the Fabric step.
 *
 * An 8-garment order (4 Fabrics needed) can be left holding 5 Fabrics when the
 * order shrank after Fabrics were chosen (here a Long Dress is removed from a
 * 9-garment order that needed 5). Every garment still has fabric, but two of
 * them sit alone on separate Fabrics, so Continue stays locked.
 *
 * The Guide must (a) offer a one-tap move of a lone garment onto a selected
 * Fabric with room, which unlocks Continue, and (b) without that action, point
 * the Remove beam at a garment whose removal actually lowers the count, never
 * at one sharing a full Fabric.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricAllocationState, GarmentTypeStepSelection } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  assignFutureGarmentToExistingFabricAllocation,
  getFabricQuantityOverAllocationRepair,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  moveFutureGarmentToFabricAllocation,
  reconcileFutureFabricAllocationState,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { buildFabricGuideFlow } from "./src/utils/fabricStepGuideFlow";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;
const { DormantFutureFabricStep } = await import("./src/components/DormantFutureFabricStep");
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

// Xavier's order: Standard Shirt, Trouser, Standard Skirt, Long Skirt,
// Standard Nikka Shorts, Standard Bum Shorts, Standard Dress, Long Shirt.
const EIGHT = [
  "shirt",
  "trouser",
  "skirt",
  "long_skirt",
  "standard_shorts",
  "bum_shorts",
  "dress",
  "kaftan",
];
const eight = selectionFor(EIGHT);
const nine = selectionFor([...EIGHT, "full_length_gown"]);

const fabrics: Fabric[] = ["A", "B", "C", "D", "E"].map((suffix) => ({
  code: `QTY-${suffix}`,
  name: `Fabric ${suffix}`,
  description: "Test fabric",
  color: "Blue",
  colorHex: "#1B4F72",
  category: "Test",
  price: 20,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  image: `https://cdn.example.com/fabrics/qty-${suffix}.jpg`,
}));

const assign = (
  state: FabricAllocationState,
  selection: GarmentTypeStepSelection,
  garmentKey: string,
  fabricCode: string,
) => {
  const result = assignFutureFabricToGarment({
    state,
    garmentTypeSelection: selection,
    garmentKey,
    fabricCode,
    fabrics,
  });
  assert.equal(result.status, "assigned", `assign ${garmentKey} -> ${fabricCode}`);
  return result.state;
};
const assignExisting = (
  state: FabricAllocationState,
  garmentKey: string,
  allocationIndex: number,
) => {
  const result = assignFutureGarmentToExistingFabricAllocation({
    state,
    garmentTypeSelection: eight,
    garmentKey,
    allocationId: state.fabricAllocations[allocationIndex]!.allocationId,
  });
  assert.equal(result.status, "assigned", `assign ${garmentKey} to #${allocationIndex + 1}`);
  return result.state;
};
const layout = (state: FabricAllocationState) =>
  state.fabricAllocations.map((allocation) => [
    allocation.fabricCode,
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ]);

// ---------------------------------------------------------------------------
// 1. Reproduce: 9 garments need 5 Fabrics; five garments get their own Fabric;
//    the Long Dress is removed (order now needs 4); the rest share Fabrics.
// ---------------------------------------------------------------------------
assert.equal(
  getFutureGarmentFabricPlanning({
    garmentTypeSelection: nine,
    fabricAllocationState: FabricAllocationStateEngine.initialize(),
  }).requiredFabricQuantity,
  5,
);
let state = FabricAllocationStateEngine.initialize();
state = assign(state, nine, "base:shirt", "QTY-A");
state = assign(state, nine, "base:trouser", "QTY-B");
state = assign(state, nine, "base:skirt", "QTY-C");
state = assign(state, nine, "base:long_skirt", "QTY-D");
state = assign(state, nine, "base:standard_shorts", "QTY-E");
state = reconcileFutureFabricAllocationState({ state, garmentTypeSelection: eight });
state = assignExisting(state, "base:bum_shorts", 0);
state = assignExisting(state, "base:dress", 1);
state = assignExisting(state, "base:kaftan", 2);
const shrunk = state;
assert.deepEqual(layout(shrunk), [
  ["QTY-A", ["base:shirt", "base:bum_shorts"]],
  ["QTY-B", ["base:trouser", "base:dress"]],
  ["QTY-C", ["base:skirt", "base:kaftan"]],
  ["QTY-D", ["base:long_skirt"]],
  ["QTY-E", ["base:standard_shorts"]],
]);
const planning = getFutureGarmentFabricPlanning({
  garmentTypeSelection: eight,
  fabricAllocationState: shrunk,
});
assert.deepEqual(
  [planning.requiredGarmentCount, planning.requiredFabricQuantity, planning.selectedFabricQuantity],
  [8, 4, 5],
  "the screenshot state: 8 garments, 4 Fabrics needed, 5 saved",
);
const blocked = getFutureFabricStageCompletion({
  garmentTypeSelection: eight,
  fabricAllocationState: shrunk,
  fabrics,
});
assert.equal(blocked.isComplete, false);
assert.equal(blocked.assignedGarmentCount, 8, "every garment has fabric");
assert.deepEqual(blocked.blockers.map((b) => b.code), ["FABRIC_QUANTITY_OVER_ALLOCATED"]);

// ---------------------------------------------------------------------------
// 2. Repair plan + atomic move unlock Continue.
// ---------------------------------------------------------------------------
const repair = getFabricQuantityOverAllocationRepair({
  state: shrunk,
  garmentTypeSelection: eight,
});
assert.ok(repair, "a one-move repair exists");
assert.equal(repair!.garmentKey, "base:standard_shorts", "the latest lone garment moves");
assert.equal(repair!.fromSelectionNumber, 5);
assert.equal(repair!.toSelectionNumber, 4);
assert.equal(repair!.toFabricCode, "QTY-D");
assert.equal(repair!.sameFabric, false);
const moved = moveFutureGarmentToFabricAllocation({
  state: shrunk,
  garmentKey: repair!.garmentKey,
  allocationId: repair!.toAllocationId,
});
assert.equal(moved.status, "moved");
assert.equal(moved.state.fabricAllocations.length, 4);
assert.deepEqual(layout(moved.state)[3], ["QTY-D", ["base:long_skirt", "base:standard_shorts"]]);
const unlocked = getFutureFabricStageCompletion({
  garmentTypeSelection: eight,
  fabricAllocationState: moved.state,
  fabrics,
});
assert.equal(unlocked.isComplete, true, "Continue unlocks after one move");
assert.deepEqual(unlocked.blockers, []);
assert.equal(
  getFabricQuantityOverAllocationRepair({ state: moved.state, garmentTypeSelection: eight }),
  null,
  "no repair offered once within Fabrics needed",
);
// Moves never overfill or create allocations.
const overfill = moveFutureGarmentToFabricAllocation({
  state: shrunk,
  garmentKey: "base:standard_shorts",
  allocationId: shrunk.fabricAllocations[0]!.allocationId,
});
assert.equal(overfill.status, "blocked");
assert.equal(overfill.state, shrunk);

// Same Fabric product on two lone allocations (invisible to the customer):
// prefer the move that keeps the garment's Fabric.
{
  const record = (garmentKey: string) =>
    shrunk.fabricAllocations
      .flatMap((allocation) => allocation.garmentAssignments)
      .find((assignment) => assignment.garmentKey === garmentKey)!;
  const duplicate: FabricAllocationState = {
    fabricAllocations: [
      { allocationId: "x1", fabricCode: "QTY-A", garmentAssignments: [record("base:shirt")] },
      { allocationId: "x2", fabricCode: "QTY-B", garmentAssignments: [record("base:trouser")] },
      { allocationId: "x3", fabricCode: "QTY-A", garmentAssignments: [record("base:skirt")] },
    ],
    activeAllocationId: "x1",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  const three = selectionFor(["shirt", "trouser", "skirt"]);
  const sameRepair = getFabricQuantityOverAllocationRepair({
    state: duplicate,
    garmentTypeSelection: three,
  });
  assert.deepEqual(
    sameRepair && [sameRepair.garmentKey, sameRepair.toAllocationId, sameRepair.sameFabric],
    ["base:skirt", "x1", true],
  );
}

// ---------------------------------------------------------------------------
// 3. Guide fallback (no move action): the Remove beam must land on a lone
//    garment. Before the fix it picked the LAST Fabric, which can be a full
//    pair whose removal does not lower the count.
// ---------------------------------------------------------------------------
{
  let s = FabricAllocationStateEngine.initialize();
  s = assign(s, nine, "base:shirt", "QTY-A");
  s = assign(s, nine, "base:trouser", "QTY-B");
  s = assign(s, nine, "base:skirt", "QTY-C");
  s = assign(s, nine, "base:long_skirt", "QTY-D");
  s = assign(s, nine, "base:standard_shorts", "QTY-E");
  s = reconcileFutureFabricAllocationState({ state: s, garmentTypeSelection: eight });
  s = assignExisting(s, "base:bum_shorts", 2);
  s = assignExisting(s, "base:dress", 3);
  s = assignExisting(s, "base:kaftan", 4);
  assert.deepEqual(layout(s).map(([, keys]) => keys.length), [1, 1, 2, 2, 2]);
  const garments = s.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => ({
      garmentKey: assignment.garmentKey,
      label: assignment.garmentKey,
      assigned: true,
      fabricCode: allocation.fabricCode,
      allocationId: allocation.allocationId,
    })),
  );
  const flow = buildFabricGuideFlow({
    isComplete: false,
    garments,
    blockers: [{ code: "FABRIC_QUANTITY_OVER_ALLOCATED", message: "Too many fabrics." }],
    selectedFabricQuantity: 5,
    allocationOrder: s.fabricAllocations.map((allocation) => allocation.allocationId),
  });
  assert.equal(flow.currentStep?.kind, "fix_quantity");
  assert.deepEqual(
    flow.currentStep?.target,
    { type: "garment_remove", garmentKey: "base:trouser" },
    "beam on the latest garment that is alone on its Fabric, not the full last pair",
  );
  const withRepair = buildFabricGuideFlow({
    isComplete: false,
    garments,
    blockers: [{ code: "FABRIC_QUANTITY_OVER_ALLOCATED", message: "Too many fabrics." }],
    selectedFabricQuantity: 5,
    allocationOrder: s.fabricAllocations.map((allocation) => allocation.allocationId),
    quantityRepair: { garmentKey: "base:trouser", message: "Move it." },
  });
  assert.deepEqual(withRepair.currentStep?.target, { type: "quantity_move", garmentKey: "base:trouser" });
  assert.deepEqual(withRepair.currentStep?.messages, ["Too many fabrics.", "Move it."]);
}

// ---------------------------------------------------------------------------
// 4. Rendered Fabric step: one-tap Move button carries the only beam.
// ---------------------------------------------------------------------------
const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";
const moveCalls: Array<[string, string]> = [];
const renderStep = (s: FabricAllocationState) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: eight,
    fabricAllocationState: s,
    fabrics,
  });
  const plan = getFutureGarmentFabricPlanning({
    garmentTypeSelection: eight,
    fabricAllocationState: s,
  });
  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection: eight,
    fabricAllocationState: s,
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
      return moveFutureGarmentToFabricAllocation({ state: s, garmentKey, allocationId });
    },
    onBack: () => undefined,
    onContinue: () => undefined,
    onUseSameFabric: () => undefined,
    onChooseAnotherFabric: () => undefined,
    onCancelPendingFabric: () => undefined,
  });
};
const createNodeMock = () => ({
  focus: () => undefined,
  scrollIntoView: () => undefined,
  getAttribute: () => null,
  hasAttribute: () => false,
  isConnected: true,
  tabIndex: 0,
  parentElement: null,
  tagName: "DIV",
});
{
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(shrunk), { createNodeMock });
  });
  const guide = renderer.root.find(
    (node) => typeof node.type === "string" && node.props["data-testid"] === "fabric-guide-flow",
  );
  assert.equal(guide.props["data-fabric-guide-current"], "fix_quantity");
  const text = textContent(guide);
  assert.match(text, /use 5 fabrics, but this order requires 4/);
  assert.match(
    text,
    /Standard Nikka Shorts is the only garment on its Fabric\. Move it onto Fabric Selection 4 \(Fabric D\)/,
  );
  const beams = renderer.root.findAll(
    (node) => typeof node.type === "string" && node.props["data-fabric-guide-beam"] === "true",
  );
  assert.equal(beams.length, 1, "exactly one beam");
  assert.equal(beams[0]!.props["data-testid"], "fabric-guide-quantity-move");
  assert.match(textContent(beams[0]!), /Move Standard Nikka Shorts to Fabric Selection 4/);
  await act(async () => beams[0]!.props.onClick());
  assert.deepEqual(moveCalls, [["base:standard_shorts", shrunk.fabricAllocations[3]!.allocationId]]);
  assert.equal(
    renderer.root.findAll((node) => node.props["data-testid"] === "future-fabric-continue-action").length,
    0,
    "Continue stays locked while over-allocated",
  );
  await act(async () => {
    renderer.update(renderStep(moved.state));
  });
  assert.equal(
    renderer.root.findAll(
      (node) => typeof node.type === "string" && node.props["data-testid"] === "fabric-guide-flow",
    ).length,
    0,
    "Guide disappears once the move brings the order to 4 Fabrics",
  );
  assert.ok(
    renderer.root.findAll(
      (node) => node.type === "button" && node.props["data-studio-nav"] === "forward",
    ).length > 0,
    "Continue to Design Style is available",
  );
}

console.log("test_fabric_quantity_over_allocation_repair: PASS");
