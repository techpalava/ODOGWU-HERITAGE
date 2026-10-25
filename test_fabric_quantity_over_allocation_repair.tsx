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
// Five lone garments on a 9-garment order. The limit is one piece per
// garment (not Fabrics Needed), so a customer can create this; it is also
// built as saved data for the layouts below.
const savedFiveLoneDraft = (): FabricAllocationState => {
  const entries: Array<[string, string]> = [
    ["base:shirt", "QTY-A"],
    ["base:trouser", "QTY-B"],
    ["base:skirt", "QTY-C"],
    ["base:long_skirt", "QTY-D"],
    ["base:standard_shorts", "QTY-E"],
  ];
  const fabricAllocations = entries.map(([garmentKey, fabricCode], index) => ({
    ...assign(FabricAllocationStateEngine.initialize(), nine, garmentKey, fabricCode)
      .fabricAllocations[0]!,
    allocationId: `saved-${index + 1}`,
  }));
  return {
    fabricAllocations,
    activeAllocationId: fabricAllocations[0]!.allocationId,
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
};
{
  let fourLone = FabricAllocationStateEngine.initialize();
  for (const [garmentKey, fabricCode] of [
    ["base:shirt", "QTY-A"],
    ["base:trouser", "QTY-B"],
    ["base:skirt", "QTY-C"],
    ["base:long_skirt", "QTY-D"],
  ] as const) {
    fourLone = assign(fourLone, nine, garmentKey, fabricCode);
  }
  const fifth = assignFutureFabricToGarment({
    state: fourLone,
    garmentTypeSelection: nine,
    garmentKey: "base:standard_shorts",
    fabricCode: "QTY-E",
    fabrics,
  });
  assert.equal(
    fifth.status,
    "assigned",
    "a fifth piece is allowed: 5 pieces for 9 garments is within one piece per garment",
  );
}
let state = savedFiveLoneDraft();
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
const shrunkCompletion = getFutureFabricStageCompletion({
  garmentTypeSelection: eight,
  fabricAllocationState: shrunk,
  fabrics,
});
// 5 pieces for 8 garments: more than the 4 Fabrics Needed, but within one
// piece per garment, so Continue is not blocked.
assert.equal(shrunkCompletion.isComplete, true);
assert.equal(shrunkCompletion.assignedGarmentCount, 8, "every garment has fabric");
assert.deepEqual(shrunkCompletion.blockers, []);

// ---------------------------------------------------------------------------
// 2. Repair plan + atomic move unlock Continue.
// ---------------------------------------------------------------------------
assert.equal(
  getFabricQuantityOverAllocationRepair({ state: shrunk, garmentTypeSelection: eight }),
  null,
  "no repair is pushed while within one piece per garment",
);
// The customer may still choose to pair the lone garments.
const moved = moveFutureGarmentToFabricAllocation({
  state: shrunk,
  garmentKey: "base:standard_shorts",
  allocationId: shrunk.fabricAllocations[3]!.allocationId,
});
assert.equal(moved.status, "moved");
assert.equal(moved.state.fabricAllocations.length, 4);
assert.deepEqual(layout(moved.state)[3], ["QTY-D", ["base:long_skirt", "base:standard_shorts"]]);
const unlocked = getFutureFabricStageCompletion({
  garmentTypeSelection: eight,
  fabricAllocationState: moved.state,
  fabrics,
});
assert.equal(unlocked.isComplete, true, "Continue stays unlocked after pairing");
assert.deepEqual(unlocked.blockers, []);
assert.equal(
  getFabricQuantityOverAllocationRepair({ state: moved.state, garmentTypeSelection: eight }),
  null,
  "no repair offered",
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
  // Three pieces for three garments is within the limit: no repair.
  assert.equal(
    getFabricQuantityOverAllocationRepair({ state: duplicate, garmentTypeSelection: three }),
    null,
  );
}

// ---------------------------------------------------------------------------
// 3. Guide fallback (no move action): the Remove beam must land on a lone
//    garment. Before the fix it picked the LAST Fabric, which can be a full
//    pair whose removal does not lower the count.
// ---------------------------------------------------------------------------
{
  let s = savedFiveLoneDraft();
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
  // 5 pieces for 8 garments (4 Fabrics Needed) renders as complete: no Guide,
  // no Move repair, Continue available.
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(shrunk), { createNodeMock });
  });
  assert.equal(
    renderer.root.findAll(
      (node) => typeof node.type === "string" && node.props["data-testid"] === "fabric-guide-flow",
    ).length,
    0,
  );
  assert.equal(
    renderer.root.findAll(
      (node) => typeof node.type === "string" && node.props["data-testid"] === "fabric-guide-quantity-move",
    ).length,
    0,
  );
  assert.equal(
    renderer.root.findAll(
      (node) =>
        typeof node.type === "string" && node.props["data-fabric-quantity-over-allocated"] === "true",
    ).length,
    0,
  );
  assert.ok(
    renderer.root.findAll(
      (node) => node.type === "button" && node.props["data-studio-nav"] === "forward",
    ).length > 0,
    "Continue to Design Style is available",
  );
  assert.deepEqual(moveCalls, []);
}

console.log("test_fabric_quantity_over_allocation_repair: PASS");
