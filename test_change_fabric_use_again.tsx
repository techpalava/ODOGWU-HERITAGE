/**
 * Regression: while changing a Fabric Selection ("Changing Fabric for Fabric
 * Selection N"), every fabric used by another selection showed IN USE with an
 * X (which removed it from those other garments) and could not be picked.
 * Change Fabric targets the whole selection, so a print already used by
 * another selection must be pickable as USE AGAIN and become a separate piece.
 *
 * The whole-selection change is opened from the Fabric Selection summary
 * chip. Change Fabric on a garment card whose piece is shared changes only
 * that garment (last block).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, type ReactElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricAllocationState, GarmentTypeStepSelection } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  applyFutureFabricCardSelection,
  assignFutureFabricToGarment,
  assignSameFabricProductToGarments,
  changeFutureFabricAllocationProduct,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  resolveFutureFabricCatalogueCardPresentation,
  resolveFutureFabricChangeCatalogueCardPresentation,
} from "./src/utils/designStudioFutureFabricStage";
import { formatFabricStockExhaustedCopy } from "./src/utils/fabricStockAvailability";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;
const { DormantFutureFabricStep } = await import(
  "./src/components/DormantFutureFabricStep"
);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const selection: GarmentTypeStepSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: [
    "shirt",
    "trouser",
    "skirt",
    "long_skirt",
    "standard_shorts",
    "bum_shorts",
  ],
  selectedDemographics: ["male", "female"],
  normalizedCustomDetailCatalog: catalog,
}).selection;

const fabric = (suffix: string, name: string, stock: number): Fabric => ({
  code: `CF-${suffix}`,
  name,
  description: "Test fabric",
  color: "Gold",
  colorHex: "#C5A85C",
  category: "Test",
  price: 20,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  stock,
  image: `https://cdn.example.com/fabrics/cf-${suffix}.jpg`,
});
const fabrics: Fabric[] = [
  fabric("A", "Classic Ivory Shield", 30),
  fabric("B", "Royal Forest Mosaic", 30),
  fabric("E", "Ivory Imperial Leaf", 1),
  fabric("N", "Heritage Ivory Lattice", 30),
];

const assign = (state: FabricAllocationState, garmentKey: string, fabricCode: string) => {
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

// Selection 1: Shirt + Trouser on A. Selection 2: Skirt + Long Skirt on B.
// Selection 3: Shorts + Bum Shorts on E (only 1 piece in stock).
let base = FabricAllocationStateEngine.initialize();
base = assign(base, "base:shirt", "CF-A");
base = assign(base, "base:trouser", "CF-A");
base = assign(base, "base:skirt", "CF-B");
base = assign(base, "base:long_skirt", "CF-B");
base = assign(base, "base:standard_shorts", "CF-E");
base = assign(base, "base:bum_shorts", "CF-E");
assert.deepEqual(
  base.fabricAllocations.map((allocation) => [
    allocation.fabricCode,
    allocation.garmentAssignments.length,
  ]),
  [
    ["CF-A", 2],
    ["CF-B", 2],
    ["CF-E", 2],
  ],
);
const selection1 = base.fabricAllocations[0]!.allocationId;

// ---------------------------------------------------------------------------
// 1. Pure Change presentation.
// ---------------------------------------------------------------------------
const changeCard = (fabricCode: string) =>
  resolveFutureFabricChangeCatalogueCardPresentation({
    fabricCode,
    fabricAllocationState: base,
    allocationId: selection1,
    fabrics,
  });
assert.deepEqual(
  [changeCard("CF-A").status, changeCard("CF-A").action, changeCard("CF-A").changeMode],
  ["ASSIGNED", "none", "change-assigned"],
  "the selection's current fabric shows ASSIGNED with no change action",
);
assert.deepEqual(
  [changeCard("CF-B").status, changeCard("CF-B").action, changeCard("CF-B").changeMode],
  ["USE AGAIN", "use_again", "change-use-again"],
  "a fabric used by another selection is pickable as USE AGAIN",
);
assert.deepEqual(
  [changeCard("CF-N").status, changeCard("CF-N").action, changeCard("CF-N").changeMode],
  ["SELECT", "select", "change-select"],
);
assert.deepEqual(
  [
    changeCard("CF-E").status,
    changeCard("CF-E").action,
    changeCard("CF-E").changeMode,
    changeCard("CF-E").blockedReason,
  ],
  ["USE AGAIN", "none", "change-blocked", "FABRIC_STOCK_EXHAUSTED"],
  "a stock-exhausted print is not pickable",
);
for (const code of ["CF-A", "CF-B", "CF-E", "CF-N"]) {
  assert.deepEqual(changeCard(code).cancelGarmentKeys, [], `${code}: no cancel targets in Change mode`);
  assert.equal(changeCard(code).cancelGarmentKey, null);
}
// With the tapped garment known, only its own current fabric keeps the
// existing single-occurrence cancel; other selections' fabrics never do.
const targetedChangeCard = (fabricCode: string) =>
  resolveFutureFabricChangeCatalogueCardPresentation({
    fabricCode,
    fabricAllocationState: base,
    allocationId: selection1,
    fabrics,
    targetGarmentKey: "base:shirt",
  });
assert.deepEqual(
  [targetedChangeCard("CF-A").status, targetedChangeCard("CF-A").action, [...(targetedChangeCard("CF-A").cancelGarmentKeys ?? [])]],
  ["ASSIGNED", "cancel", ["base:shirt"]],
);
for (const code of ["CF-B", "CF-E", "CF-N"]) {
  assert.deepEqual(targetedChangeCard(code).cancelGarmentKeys, [], `${code}: no cancel targets`);
  assert.notEqual(targetedChangeCard(code).action, "cancel");
}

// Engine: picking B creates a second, separate piece of the same print.
const changed = changeFutureFabricAllocationProduct({
  state: base,
  allocationId: selection1,
  nextFabricCode: "CF-B",
  fabrics,
});
assert.equal(changed.status, "assigned");
assert.equal(
  changed.state.fabricAllocations.filter((allocation) => allocation.fabricCode === "CF-B").length,
  2,
  "two allocations share fabricCode CF-B",
);

// Plain (non-change) single-garment presentation is unchanged.
const plain = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "CF-B",
  garmentTypeSelection: selection,
  fabricAllocationState: base,
  currentTargetGarmentKey: "base:shirt",
  fabrics,
});
assert.equal(plain.status, "IN USE");
assert.equal(plain.action, "cancel");
assert.deepEqual([...(plain.cancelGarmentKeys ?? [])], ["base:skirt", "base:long_skirt"]);
const plainOwn = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "CF-A",
  garmentTypeSelection: selection,
  fabricAllocationState: base,
  currentTargetGarmentKey: "base:shirt",
  fabrics,
});
assert.deepEqual([plainOwn.status, plainOwn.action, plainOwn.cancelGarmentKey], ["ASSIGNED", "cancel", "base:shirt"]);

// ---------------------------------------------------------------------------
// 2. UI: Change Fabric on Selection 1.
// ---------------------------------------------------------------------------
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

let liveState = base;
const removed: string[] = [];
const renderStep = () => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: selection,
    fabricAllocationState: liveState,
    fabrics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: selection,
    fabricAllocationState: liveState,
  });
  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection: selection,
    fabricAllocationState: liveState,
    completion,
    requiredFabricQuantity: planning.requiredFabricQuantity,
    selectedFabricQuantity: planning.selectedFabricQuantity,
    constructionPrice: 0,
    // Mirrors DesignStudioView.handleAssignFutureFabricToGarment.
    onAssignFabricToGarment: (
      picked: Fabric,
      garmentKey: string,
      placement?: "auto" | "new_piece",
      options?: { detachFromSharedPiece?: boolean },
    ) => {
      liveState = applyFutureFabricCardSelection({
        state: liveState,
        garmentTypeSelection: selection,
        garmentKey,
        fabricCode: picked.code,
        fabrics,
        placement,
        detachFromSharedPiece: options?.detachFromSharedPiece === true,
      });
      return liveState;
    },
    onChangeFabricAllocationProduct: ((
      allocationId: string,
      fabricCode: string,
      expectation?: { expectedCurrentFabricCode: string; expectedAssignmentSignature: string },
    ) => {
      const result = changeFutureFabricAllocationProduct({
        state: liveState,
        allocationId,
        nextFabricCode: fabricCode,
        fabrics,
        expectation,
      });
      if (result.status === "assigned") liveState = result.state;
      return result;
    }) as never,
    onRemoveFabricFromGarment: ((garmentKey: string) => {
      removed.push(garmentKey);
      return undefined;
    }) as never,
    onUseSameFabricForGarment: () => undefined,
    onAssignSameFabricProduct: (fabricCode: string, garmentKeys: string[]) => {
      const result = assignSameFabricProductToGarments({
        state: liveState,
        garmentTypeSelection: selection,
        fabricCode,
        garmentKeys,
        fabrics,
      });
      if (result.status === "assigned") liveState = result.state;
      return result;
    },
    onAssignGarmentToExistingAllocation: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
    onUseSameFabric: () => undefined,
    onChooseAnotherFabric: () => undefined,
    onCancelPendingFabric: () => undefined,
  });
};

const catalogueCard = (root: ReactTestInstance, code: string) =>
  root.findByProps({ "data-fabric-catalogue-card": "true", "data-fabric-card-code": code });
const actionButton = (card: ReactTestInstance) =>
  card.find(
    (node) =>
      node.type === "button" &&
      node.props["data-fabric-card"] === "true" &&
      node.props["data-fabric-remove"] !== "true",
  );
const removeControls = (card: ReactTestInstance) =>
  card.findAll((node) => node.type === "button" && node.props["data-fabric-remove"] === "true");

let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(renderStep(), { createNodeMock });
});

// Baseline (not changing): the untargeted catalogue still offers the X for B.
assert.ok(
  removeControls(catalogueCard(renderer.root, "CF-B")).length > 0,
  "plain catalogue keeps the remove control for an in-use fabric",
);
assert.equal(catalogueCard(renderer.root, "CF-B").props["data-fabric-change-card"], undefined);

await act(async () => {
  renderer.root
    .findByProps({ "data-fabric-selection-summary-button": "1" })
    .props.onClick({ currentTarget: {} });
});
assert.match(textContent(renderer.root), /Choose a new fabric for Selection 1/);

const cardA = catalogueCard(renderer.root, "CF-A");
const cardB = catalogueCard(renderer.root, "CF-B");
const cardE = catalogueCard(renderer.root, "CF-E");
const cardN = catalogueCard(renderer.root, "CF-N");
assert.equal(cardA.props["data-fabric-change-card"], "change-assigned");
assert.equal(cardB.props["data-fabric-change-card"], "change-use-again");
assert.equal(cardE.props["data-fabric-change-card"], "change-blocked");
assert.equal(cardN.props["data-fabric-change-card"], "change-select");
assert.equal(cardB.props["data-fabric-change-selection"], "1");

assert.equal(
  textContent(cardA.findByProps({ "data-fabric-in-use": "true" })),
  "ASSIGNED",
  "the selection's current fabric reads ASSIGNED, not IN USE",
);
assert.equal(
  cardA.findAll(
    (node) =>
      node.type === "button" &&
      node.props["data-fabric-card"] === "true" &&
      node.props["data-fabric-remove"] !== "true",
  ).length,
  0,
  "current fabric has no change action",
);
const ownRemove = removeControls(cardA);
assert.equal(ownRemove.length, 1);
assert.equal(ownRemove[0]!.props["data-fabric-cancel-garment-key"], "base:shirt", "own X only targets the changing garment");

const useAgainB = actionButton(cardB);
assert.equal(textContent(useAgainB), "USE AGAIN");
assert.equal(useAgainB.props.disabled, false);
assert.equal(useAgainB.props["data-fabric-action"], "use_again");
assert.equal(useAgainB.props["aria-label"], "USE AGAIN Royal Forest Mosaic for Fabric Selection 1");
assert.doesNotMatch(textContent(renderer.root), /IN USE/, "no IN USE cards while changing");

assert.equal(actionButton(cardE).props.disabled, true, "stock-blocked fabric is disabled");
assert.match(textContent(cardE), new RegExp(formatFabricStockExhaustedCopy().replace(/\./g, "\\.")));

assert.equal(actionButton(cardN).props.disabled, false);
assert.match(textContent(actionButton(cardN)), /SELECT/);

for (const card of [cardB, cardE, cardN]) {
  assert.equal(removeControls(card).length, 0, "no remove X for other selections' fabric in Change mode");
}

// Pick B: shared-group confirm dialog, then commit.
await act(async () => useAgainB.props.onClick({ currentTarget: {} }));
await act(async () => {
  renderer.root.findByProps({ "data-change-fabric-confirm": "true" }).props.onClick();
});
assert.deepEqual(removed, [], "changing never removes other selections' fabric");
assert.deepEqual(
  liveState.fabricAllocations.map((allocation) => [
    allocation.fabricCode,
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ]),
  [
    ["CF-B", ["base:shirt", "base:trouser"]],
    ["CF-B", ["base:skirt", "base:long_skirt"]],
    ["CF-E", ["base:standard_shorts", "base:bum_shorts"]],
  ],
  "Selection 1 is now a separate piece of the same print",
);
await act(async () => {
  renderer.update(renderStep());
});
assert.doesNotMatch(textContent(renderer.root), /Choose a new fabric for Selection/);
act(() => renderer.unmount());

// Garment card: Change Fabric for the Standard Shirt (shared with the
// Trouser) moves only the Shirt. CF-B's piece is full, so no pair popup:
// the Shirt gets a new CF-B piece and the Trouser keeps CF-A.
liveState = base;
await act(async () => {
  renderer = create(renderStep(), { createNodeMock });
});
await act(async () => {
  renderer.root
    .findByProps({ "aria-label": "Change fabric for Standard Shirt" })
    .props.onClick({ currentTarget: {} });
});
assert.match(
  textContent(renderer.root),
  /Only Standard Shirt will change\. Trouser keeps Classic Ivory Shield\./,
);
await act(async () =>
  actionButton(catalogueCard(renderer.root, "CF-B")).props.onClick({ currentTarget: {} }),
);
assert.equal(
  renderer.root.findAllByProps({ "data-change-fabric-confirm": "true" }).length,
  0,
  "no group confirm for a one-garment change",
);
assert.equal(
  renderer.root.findAllByProps({ "data-fabric-piece-placement-dialog": "true" }).length,
  0,
  "CF-B's piece is full, so no pair popup",
);
assert.deepEqual(removed, []);
assert.deepEqual(
  liveState.fabricAllocations.map((allocation) => [
    allocation.fabricCode,
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ]),
  [
    ["CF-A", ["base:trouser"]],
    ["CF-B", ["base:skirt", "base:long_skirt"]],
    ["CF-E", ["base:standard_shorts", "base:bum_shorts"]],
    ["CF-B", ["base:shirt"]],
  ],
  "only the Shirt moved; the Trouser keeps CF-A",
);
act(() => renderer.unmount());

console.log("test_change_fabric_use_again: PASS");
