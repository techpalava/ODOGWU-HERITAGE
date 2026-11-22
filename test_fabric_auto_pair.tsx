/**
 * fabric-auto-pair (Xavier, 29 Oct): the "Pair or use a new piece?" popup is
 * gone. When a piece of the same print has half capacity (1/2) left, the
 * garment pairs onto it automatically and a short toast says so, e.g.
 * "Paired Long Dress with Selection 3 — no extra fabric used".
 *
 * - Assign Fabric to Garments panel: one garment pairs; with several
 *   garments and one half-left piece, only the FIRST garment pairs and the
 *   rest go on new pieces of the same print (one piece per garment).
 * - Change Fabric on a garment card (shared piece and lone garment) pairs.
 * - USE AGAIN pairs.
 * - The toast names only the garments that joined an existing piece and the
 *   Selection number after any renumbering.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricAllocationState, GarmentTypeStepSelection } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  applyFutureFabricCardSelection,
  assignFutureFabricToGarment,
  assignFutureGarmentToExistingFabricAllocation,
  assignSameFabricProductToGarments,
  changeFutureFabricAllocationProduct,
  formatFabricAutoPairToastCopy,
  getFutureFabricAutoPairings,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  type FutureFabricGarmentAssignmentOptions,
  type FutureFabricPiecePlacement,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

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
    selectedGarmentTypes: types as never,
    selectedDemographics: ["male", "female"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const fabric = (suffix: string, name: string, stock = 30): Fabric => ({
  code: `AP-${suffix}`,
  name,
  description: "Test fabric",
  color: "Gold",
  colorHex: "#C5A85C",
  category: "Test",
  price: 20,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  stock,
  image: `https://cdn.example.com/fabrics/ap-${suffix}.jpg`,
});
const fabrics: Fabric[] = [
  fabric("A", "Classic Ivory Shield"),
  fabric("B", "Royal Forest Mosaic"),
  fabric("I", "Ivory Imperial Leaf"),
  fabric("N", "Heritage Ivory Lattice"),
];
const layout = (state: FabricAllocationState) =>
  state.fabricAllocations.map((allocation) => [
    allocation.fabricCode,
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ]);

// ---------------------------------------------------------------------------
// Harness (same shape as DesignStudioView wiring).
// ---------------------------------------------------------------------------
let selection = selectionFor(["shirt", "trouser"]);
const place = (state: FabricAllocationState, garmentKey: string, fabricCode: string) => {
  const result = assignFutureFabricToGarment({
    state,
    garmentTypeSelection: selection,
    garmentKey,
    fabricCode,
    fabrics,
  });
  assert.equal(result.status, "assigned", `${garmentKey} -> ${fabricCode}`);
  return result.state;
};
const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";
const createNodeMock = (element: ReactElement) => {
  const props = (element.props ?? {}) as Record<string, unknown>;
  return {
    tagName: typeof element.type === "string" ? element.type.toUpperCase() : "DIV",
    isConnected: true,
    tabIndex: typeof props.tabIndex === "number" ? props.tabIndex : 0,
    parentElement: null,
    style: {},
    getAttribute: (name: string) => (props[name] == null ? null : String(props[name])),
    hasAttribute: (name: string) => props[name] !== undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    querySelectorAll: () => [],
    querySelector: () => null,
    focus: () => undefined,
    scrollIntoView: () => undefined,
  };
};

let liveState = FabricAllocationStateEngine.initialize();
const notices: string[] = [];
const groupChangeCalls: string[] = [];
const renderStep = () => {
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: selection,
    fabricAllocationState: liveState,
  });
  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection: selection,
    fabricAllocationState: liveState,
    completion: getFutureFabricStageCompletion({
      garmentTypeSelection: selection,
      fabricAllocationState: liveState,
      fabrics,
    }),
    requiredFabricQuantity: planning.requiredFabricQuantity,
    selectedFabricQuantity: planning.selectedFabricQuantity,
    constructionPrice: 0,
    onAssignFabricToGarment: (
      picked: Fabric,
      garmentKey: string,
      placement?: FutureFabricPiecePlacement,
      options?: FutureFabricGarmentAssignmentOptions,
    ) => {
      liveState = applyFutureFabricCardSelection({
        state: liveState,
        garmentTypeSelection: selection,
        garmentKey,
        fabricCode: picked.code,
        fabrics,
        placement,
        detachFromSharedPiece: options?.detachFromSharedPiece === true,
        pairLoneGarment: options?.pairLoneGarment === true,
      });
      return liveState;
    },
    onChangeFabricAllocationProduct: (allocationId: string, fabricCode: string) => {
      groupChangeCalls.push(`${allocationId}->${fabricCode}`);
      const result = changeFutureFabricAllocationProduct({
        state: liveState,
        allocationId,
        nextFabricCode: fabricCode,
        fabrics,
      });
      if (result.status === "assigned") liveState = result.state;
      return result;
    },
    onRemoveFabricFromGarment: () => undefined,
    onUseSameFabricForGarment: () => undefined,
    onAssignSameFabricProduct: (
      fabricCode: string,
      garmentKeys: string[],
      placement?: FutureFabricPiecePlacement,
    ) => {
      const result = assignSameFabricProductToGarments({
        state: liveState,
        garmentTypeSelection: selection,
        fabricCode,
        garmentKeys,
        fabrics,
        placement,
      });
      if (result.status === "assigned") liveState = result.state;
      return result;
    },
    onAssignGarmentToExistingAllocation: (garmentKey: string, allocationId: string) => {
      const result = assignFutureGarmentToExistingFabricAllocation({
        state: liveState,
        garmentTypeSelection: selection,
        garmentKey,
        allocationId,
      });
      if (result.status === "assigned") liveState = result.state;
      return result;
    },
    onAutoPairNotice: (message: string) => {
      notices.push(message);
    },
    onBack: () => undefined,
    onContinue: () => undefined,
    onUseSameFabric: () => undefined,
    onChooseAnotherFabric: () => undefined,
    onCancelPendingFabric: () => undefined,
  } as never);
};

let renderer!: ReturnType<typeof create>;
const mount = async (state: FabricAllocationState) => {
  liveState = state;
  notices.length = 0;
  groupChangeCalls.length = 0;
  await act(async () => {
    renderer = create(renderStep(), { createNodeMock });
  });
};
const rerender = async () => {
  await act(async () => renderer.update(renderStep()));
};
const catalogueCard = (code: string) =>
  renderer.root.findByProps({ "data-fabric-catalogue-card": "true", "data-fabric-card-code": code });
const pickCard = async (code: string) => {
  const button = catalogueCard(code).find(
    (node) =>
      node.type === "button" &&
      node.props["data-fabric-card"] === "true" &&
      node.props["data-fabric-remove"] !== "true",
  );
  assert.equal(button.props.disabled, false, `${code} is pickable`);
  await act(async () => button.props.onClick({ currentTarget: {} }));
  await rerender();
};
const placementDialogs = () =>
  renderer.root.findAll((node) => node.props?.["data-fabric-piece-placement-dialog"] === "true");
const changeFromCard = async (label: string) => {
  await act(async () =>
    renderer.root.findByProps({ "aria-label": `Change fabric for ${label}` }).props.onClick({ currentTarget: {} }),
  );
};
const TOAST = /^Paired .+ with Selection \d+ — no extra fabric used$/;

// ---------------------------------------------------------------------------
// 0. The popup is gone and the toast copy.
// ---------------------------------------------------------------------------
assert.equal(existsSync("src/components/FabricPiecePlacementDialog.tsx"), false);
assert.doesNotMatch(
  readFileSync("src/components/DormantFutureFabricStep.tsx", "utf8"),
  /FabricPiecePlacementDialog|Use a new piece/,
);
const list = (labels: string[]) =>
  labels.length < 2 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
assert.equal(
  formatFabricAutoPairToastCopy([{ garmentLabels: ["Long Dress"], selectionNumber: 3 }], list),
  "Paired Long Dress with Selection 3 — no extra fabric used",
);
assert.equal(formatFabricAutoPairToastCopy([], list), null);

// ---------------------------------------------------------------------------
// 1. Single garment auto-pairs (Assign panel, single-candidate tap).
// ---------------------------------------------------------------------------
{
  selection = selectionFor(["shirt", "trouser"]);
  const shirtOnA = place(FabricAllocationStateEngine.initialize(), "base:shirt", "AP-A");
  await mount(shirtOnA);
  await pickCard("AP-A");
  assert.equal(placementDialogs().length, 0, "no pair-or-new-piece popup");
  assert.deepEqual(layout(liveState), [["AP-A", ["base:shirt", "base:trouser"]]]);
  assert.deepEqual(notices, ["Paired Trouser with Selection 1 — no extra fabric used"]);
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 2. Three garments, one half-left piece (the screenshot): only the first
//    pairs onto Selection 3; the other two get new pieces of the same print.
// ---------------------------------------------------------------------------
{
  selection = selectionFor([
    "shirt",
    "trouser",
    "skirt",
    "kaftan",
    "long_skirt",
    "standard_shorts",
    "bum_shorts",
    "full_length_gown",
  ]);
  let start = FabricAllocationStateEngine.initialize();
  start = place(start, "base:shirt", "AP-A");
  start = place(start, "base:trouser", "AP-A");
  start = place(start, "base:skirt", "AP-B");
  start = place(start, "base:kaftan", "AP-B");
  start = place(start, "base:long_skirt", "AP-I");
  assert.deepEqual(layout(start), [
    ["AP-A", ["base:shirt", "base:trouser"]],
    ["AP-B", ["base:skirt", "base:kaftan"]],
    ["AP-I", ["base:long_skirt"]],
  ]);
  const three = ["base:standard_shorts", "base:bum_shorts", "base:full_length_gown"];

  // Engine: root cause of "Put Standard Nikka Shorts, Standard Bum Shorts, and
  // Long Dress on that piece": the auto placement only ever puts the first on
  // Selection 3; the pairing report names only that garment.
  const auto = assignSameFabricProductToGarments({
    state: start,
    garmentTypeSelection: selection,
    fabricCode: "AP-I",
    garmentKeys: three,
    fabrics,
  });
  assert.equal(auto.status, "assigned");
  assert.deepEqual(layout(auto.state).slice(2), [
    ["AP-I", ["base:long_skirt", "base:standard_shorts"]],
    ["AP-I", ["base:bum_shorts"]],
    ["AP-I", ["base:full_length_gown"]],
  ]);
  const pairings = getFutureFabricAutoPairings({
    before: start,
    after: auto.state,
    fabricCode: "AP-I",
    garmentKeys: three,
  });
  assert.deepEqual(
    pairings.map((pairing) => [pairing.selectionNumber, pairing.garmentKeys]),
    [[3, ["base:standard_shorts"]]],
  );

  // UI: Assign Fabric to Garments panel (USE AGAIN card with 3 candidates).
  await mount(start);
  await pickCard("AP-I");
  const dialog = renderer.root.findByProps({ "data-testid": "step1-fabric-assignment-dialog" });
  for (const garmentKey of three) {
    await act(async () =>
      dialog
        .findByProps({ "data-step1-fabric-assignment-checkbox": garmentKey })
        .props.onChange({ currentTarget: { checked: true } }),
    );
  }
  await rerender();
  await act(async () =>
    renderer.root.findByProps({ "data-testid": "step1-fabric-assignment-confirm" }).props.onClick(),
  );
  await rerender();
  assert.equal(placementDialogs().length, 0, "no popup offering all three for one slot");
  assert.deepEqual(layout(liveState), layout(auto.state));
  assert.equal(notices.length, 1);
  assert.match(notices[0]!, TOAST);
  assert.match(notices[0]!, /with Selection 3 — /);
  assert.match(notices[0]!, /Nikka/i, notices[0]);
  assert.doesNotMatch(notices[0]!, /Bum|Dress|Gown/i, "only the paired garment is named");
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 3. Garment-card Change Fabric auto-pairs.
// ---------------------------------------------------------------------------
selection = selectionFor(["shirt", "trouser", "kaftan"]);
{
  // 3a. Shared piece: the Trouser leaves Selection 1 and pairs with the Long
  //     Shirt's Royal piece (Selection 2).
  const shared = place(place(FabricAllocationStateEngine.initialize(), "base:shirt", "AP-A"), "base:trouser", "AP-A");
  const sharedPlusRoyal = place(shared, "base:kaftan", "AP-B");
  await mount(sharedPlusRoyal);
  await changeFromCard("Trouser");
  await pickCard("AP-B");
  assert.equal(placementDialogs().length, 0);
  assert.equal(renderer.root.findAllByProps({ "data-change-fabric-confirm": "true" }).length, 0);
  assert.deepEqual(layout(liveState), [
    ["AP-A", ["base:shirt"]],
    ["AP-B", ["base:kaftan", "base:trouser"]],
  ]);
  assert.deepEqual(notices, ["Paired Trouser with Selection 2 — no extra fabric used"]);
  act(() => renderer.unmount());
}
{
  // 3b. Lone garment: the Shirt (alone on Selection 1) pairs with the
  //     Trouser's Royal piece; its old piece is freed, so Royal is now
  //     Selection 1 and the toast says so.
  const lone = place(place(FabricAllocationStateEngine.initialize(), "base:shirt", "AP-A"), "base:trouser", "AP-B");
  await mount(lone);
  await changeFromCard("Standard Shirt");
  await pickCard("AP-B");
  assert.equal(placementDialogs().length, 0);
  assert.equal(groupChangeCalls.length, 0, "pairs instead of re-colouring");
  assert.deepEqual(layout(liveState), [["AP-B", ["base:trouser", "base:shirt"]]]);
  assert.deepEqual(notices, ["Paired Standard Shirt with Selection 1 — no extra fabric used"]);
  act(() => renderer.unmount());
}
{
  // 3c. No piece with room: no pairing, no toast.
  const full = place(
    place(place(FabricAllocationStateEngine.initialize(), "base:shirt", "AP-A"), "base:trouser", "AP-B"),
    "base:kaftan",
    "AP-B",
  );
  await mount(full);
  await changeFromCard("Standard Shirt");
  await pickCard("AP-N");
  assert.deepEqual(notices, []);
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 4. USE AGAIN auto-pairs (one remaining garment: direct assign).
// ---------------------------------------------------------------------------
{
  selection = selectionFor(["shirt", "trouser"]);
  const shirtOnA = place(FabricAllocationStateEngine.initialize(), "base:shirt", "AP-A");
  await mount(shirtOnA);
  const card = renderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((candidate) => candidate.props["data-fabric-code"] === "AP-A")!;
  assert.equal(card.props["data-fabric-status"], "USE AGAIN");
  assert.equal(card.props["data-fabric-action"], "use_again");
  await act(async () => card.props.onClick({ currentTarget: {} }));
  await rerender();
  assert.equal(placementDialogs().length, 0);
  assert.deepEqual(layout(liveState), [["AP-A", ["base:shirt", "base:trouser"]]]);
  assert.equal(notices.length, 1);
  assert.equal(notices[0], "Paired Trouser with Selection 1 — no extra fabric used");
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 5. The toast reaches the app notification (4s auto-dismiss) in
//    DesignStudioView.
// ---------------------------------------------------------------------------
assert.match(
  readFileSync("src/components/DesignStudioView.tsx", "utf8"),
  /onAutoPairNotice=\{\(message\) =>\s*setNotification\(\{ message, type: "success" \}\)\s*\}/,
);

console.log("test_fabric_auto_pair: PASS");
