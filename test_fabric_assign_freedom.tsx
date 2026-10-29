/**
 * Freer Fabric step:
 * 1. Change Fabric at the Fabrics Needed ceiling may SELECT any available
 *    print (a swap never adds a piece), and the catalogue no longer shows the
 *    "Use one of your selected fabrics" ceiling copy while changing.
 * 2. The UNUSED FABRIC CAPACITY AVAILABLE popup makes Continue the primary
 *    action; Add Garment is secondary.
 * 3. Assigning a print that already has a piece with room pairs onto that
 *    piece automatically (fabric-auto-pair: no Pair / Use a new piece popup)
 *    and a short toast names the Selection.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
  formatFabricQuantityLimitReachedCopy,
  getFutureFabricPiecePlacementChoice,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  resolveFutureFabricChangeCatalogueCardPresentation,
  type FutureFabricPiecePlacement,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;
const { DormantFutureFabricStep, FABRIC_CHANGE_SWAP_FREE_COPY } = await import(
  "./src/components/DormantFutureFabricStep"
);
const {
  FutureRemainingFabricCapacityOfferCard,
  REMAINING_FABRIC_CAPACITY_OFFER_CONTINUE,
  REMAINING_FABRIC_CAPACITY_OFFER_TITLE,
} = await import("./src/components/FutureRemainingFabricCapacityOffer");
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
// Shirt + Trouser + Skirt = 3 units -> Fabrics Needed 2.
const selection: GarmentTypeStepSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser", "skirt"],
  selectedDemographics: ["male", "female"],
  normalizedCustomDetailCatalog: catalog,
}).selection;

const fabric = (suffix: string, name: string, stock: number): Fabric => ({
  code: `AF-${suffix}`,
  name,
  description: "Test fabric",
  color: "Gold",
  colorHex: "#C5A85C",
  category: "Test",
  price: 20,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  stock,
  image: `https://cdn.example.com/fabrics/af-${suffix}.jpg`,
});
const fabrics: Fabric[] = [
  fabric("A", "Classic Ivory Shield", 30),
  fabric("B", "Royal Forest Mosaic", 30),
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
const layout = (state: FabricAllocationState) =>
  state.fabricAllocations.map((allocation) => [
    allocation.fabricCode,
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ]);
const pieceCount = (state: FabricAllocationState) =>
  state.fabricAllocations.filter((allocation) => allocation.garmentAssignments.length > 0)
    .length;

const planning = getFutureGarmentFabricPlanning({
  garmentTypeSelection: selection,
  fabricAllocationState: FabricAllocationStateEngine.initialize(),
});
assert.equal(planning.requiredFabricQuantity, 2, "3 standard garments need 2 fabrics");

// At the ceiling: Selection 1 = Shirt on A, Selection 2 = Trouser on B.
let atCeiling = FabricAllocationStateEngine.initialize();
atCeiling = assign(atCeiling, "base:shirt", "AF-A");
atCeiling = assign(atCeiling, "base:trouser", "AF-B");
assert.deepEqual(layout(atCeiling), [["AF-A", ["base:shirt"]], ["AF-B", ["base:trouser"]]]);
const selection1 = atCeiling.fabricAllocations[0]!.allocationId;

// ---------------------------------------------------------------------------
// 1. Engine: Change at the ceiling may SELECT a new unused print.
// ---------------------------------------------------------------------------
const newPrintCard = resolveFutureFabricChangeCatalogueCardPresentation({
  fabricCode: "AF-N",
  fabricAllocationState: atCeiling,
  allocationId: selection1,
  fabrics,
});
assert.deepEqual(
  [newPrintCard.status, newPrintCard.action, newPrintCard.changeMode],
  ["SELECT", "select", "change-select"],
  "an unused print is SELECTable while changing at the ceiling",
);
const swapped = changeFutureFabricAllocationProduct({
  state: atCeiling,
  allocationId: selection1,
  nextFabricCode: "AF-N",
  fabrics,
});
assert.equal(swapped.status, "assigned");
assert.deepEqual(layout(swapped.state), [["AF-N", ["base:shirt"]], ["AF-B", ["base:trouser"]]]);
assert.equal(pieceCount(swapped.state), pieceCount(atCeiling), "a swap never adds a piece");

// fabric-print-freedom: at Fabrics Needed the unassigned Skirt may still take
// its own piece of a new print (limit is one piece per garment).
const extra = assignFutureFabricToGarment({
  state: atCeiling,
  garmentTypeSelection: selection,
  garmentKey: "base:skirt",
  fabricCode: "AF-N",
  fabrics,
});
assert.equal(extra.status, "assigned");
assert.equal(pieceCount(extra.state), 3);

// ---------------------------------------------------------------------------
// 3a. Engine: Pair vs Use a new piece.
// ---------------------------------------------------------------------------
const oneShirtOnA = assign(FabricAllocationStateEngine.initialize(), "base:shirt", "AF-A");
const choice = getFutureFabricPiecePlacementChoice({
  state: oneShirtOnA,
  garmentTypeSelection: selection,
  fabricCode: "AF-A",
  garmentKeys: ["base:trouser"],
  fabrics,
});
assert.ok(choice, "joining an existing piece of the same print asks first");
assert.equal(choice!.pairSelectionNumber, 1);
assert.equal(choice!.pairRemainingUnits, 1);
assert.equal(choice!.newPieceAvailable, true, "below the ceiling a new piece is allowed");
assert.equal(
  getFutureFabricPiecePlacementChoice({
    state: oneShirtOnA,
    garmentTypeSelection: selection,
    fabricCode: "AF-B",
    garmentKeys: ["base:trouser"],
    fabrics,
  }),
  null,
  "a different print never asks",
);
const paired = assignFutureFabricToGarment({
  state: oneShirtOnA,
  garmentTypeSelection: selection,
  garmentKey: "base:trouser",
  fabricCode: "AF-A",
  fabrics,
});
assert.deepEqual(layout(paired.state), [["AF-A", ["base:shirt", "base:trouser"]]]);
const newPiece = assignFutureFabricToGarment({
  state: oneShirtOnA,
  garmentTypeSelection: selection,
  garmentKey: "base:trouser",
  fabricCode: "AF-A",
  fabrics,
  placement: "new_piece",
});
assert.equal(newPiece.status, "assigned");
assert.deepEqual(layout(newPiece.state), [["AF-A", ["base:shirt"]], ["AF-A", ["base:trouser"]]]);
// Bulk new piece: two garments share ONE new piece, never the old one.
const bulkNew = assignSameFabricProductToGarments({
  state: oneShirtOnA,
  garmentTypeSelection: selection,
  fabricCode: "AF-A",
  garmentKeys: ["base:trouser", "base:skirt"],
  fabrics,
  placement: "new_piece",
});
assert.equal(bulkNew.status, "assigned");
assert.deepEqual(layout(bulkNew.state), [
  ["AF-A", ["base:shirt"]],
  ["AF-A", ["base:trouser", "base:skirt"]],
]);
// At Fabrics Needed, a new piece of A for the Skirt is still available.
const ceilingChoice = getFutureFabricPiecePlacementChoice({
  state: atCeiling,
  garmentTypeSelection: selection,
  fabricCode: "AF-A",
  garmentKeys: ["base:skirt"],
  fabrics,
});
assert.ok(ceilingChoice);
assert.equal(ceilingChoice!.newPieceAvailable, true);
assert.equal(ceilingChoice!.newPieceBlockedReason, null);

// ---------------------------------------------------------------------------
// UI harness (same shape as DesignStudioView wiring).
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

let liveState = atCeiling;
const removed: string[] = [];
const notices: string[] = [];
const renderStep = () => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: selection,
    fabricAllocationState: liveState,
    fabrics,
  });
  const live = getFutureGarmentFabricPlanning({
    garmentTypeSelection: selection,
    fabricAllocationState: liveState,
  });
  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection: selection,
    fabricAllocationState: liveState,
    completion,
    requiredFabricQuantity: live.requiredFabricQuantity,
    selectedFabricQuantity: live.selectedFabricQuantity,
    constructionPrice: 0,
    onAssignFabricToGarment: (
      picked: Fabric,
      garmentKey: string,
      placement?: FutureFabricPiecePlacement,
    ) => {
      liveState = applyFutureFabricCardSelection({
        state: liveState,
        garmentTypeSelection: selection,
        garmentKey,
        fabricCode: picked.code,
        fabrics,
        placement,
      });
      return liveState;
    },
    onChangeFabricAllocationProduct: ((allocationId: string, fabricCode: string) => {
      const result = changeFutureFabricAllocationProduct({
        state: liveState,
        allocationId,
        nextFabricCode: fabricCode,
        fabrics,
      });
      if (result.status === "assigned") liveState = result.state;
      return result;
    }) as never,
    onRemoveFabricFromGarment: ((garmentKey: string) => {
      removed.push(garmentKey);
      return undefined;
    }) as never,
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
    onAssignGarmentToExistingAllocation: () => undefined,
    onAutoPairNotice: (message: string) => {
      notices.push(message);
    },
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
const placementDialogs = (root: ReactTestInstance) =>
  root.findAll((node) => node.props?.["data-fabric-piece-placement-dialog"] === "true");
const helpCopy = (root: ReactTestInstance) =>
  textContent(root.findByProps({ id: "future-fabric-catalogue-help" }));

let renderer!: ReturnType<typeof create>;
const mount = async (state: FabricAllocationState) => {
  liveState = state;
  await act(async () => {
    renderer = create(renderStep(), { createNodeMock });
  });
};

// ---------------------------------------------------------------------------
// 1b. UI: Change Fabric at the ceiling.
// ---------------------------------------------------------------------------
await mount(atCeiling);
assert.equal(
  helpCopy(renderer.root),
  formatFabricQuantityLimitReachedCopy(2),
  "the plain catalogue shows the neutral needed-count note for the unassigned Skirt",
);
await act(async () => {
  renderer.root
    .findByProps({ "aria-label": "Change fabric for Standard Shirt" })
    .props.onClick({ currentTarget: {} });
});
const changingHelp = helpCopy(renderer.root);
assert.doesNotMatch(changingHelp, /Use one of your selected fabrics/, "no ceiling copy while changing");
assert.ok(changingHelp.includes(FABRIC_CHANGE_SWAP_FREE_COPY), changingHelp);
assert.equal(
  renderer.root.findByProps({ id: "future-fabric-catalogue-help" }).props["data-fabric-change-swap-free"],
  "true",
);
const cardN = catalogueCard(renderer.root, "AF-N");
assert.equal(cardN.props["data-fabric-change-card"], "change-select");
assert.equal(actionButton(cardN).props.disabled, false, "new print is pickable at the ceiling");
await act(async () => actionButton(cardN).props.onClick({ currentTarget: {} }));
assert.deepEqual(layout(liveState), [["AF-N", ["base:shirt"]], ["AF-B", ["base:trouser"]]]);
assert.equal(pieceCount(liveState), 2, "piece count unchanged after the swap");
assert.deepEqual(removed, []);
act(() => renderer.unmount());

// ---------------------------------------------------------------------------
// 3b. UI: picking A for the Trouser in the grouping popup pairs automatically.
// ---------------------------------------------------------------------------
const pickAForTrouser = async () => {
  await mount(oneShirtOnA);
  await act(async () =>
    actionButton(catalogueCard(renderer.root, "AF-A")).props.onClick({ currentTarget: {} }),
  );
  await act(async () => {
    renderer.root
      .findByProps({ "data-step1-fabric-assignment-checkbox": "base:trouser" })
      .props.onChange({ currentTarget: { checked: true } });
  });
  await act(async () =>
    renderer.root.findByProps({ "data-testid": "step1-fabric-assignment-confirm" }).props.onClick(),
  );
};
notices.length = 0;
await pickAForTrouser();
assert.equal(placementDialogs(renderer.root).length, 0, "no pair-or-new-piece popup");
assert.deepEqual(layout(liveState), [["AF-A", ["base:shirt", "base:trouser"]]], "auto-pairs onto Selection 1");
assert.deepEqual(notices, ["Paired Trouser with Selection 1 — no extra fabric used"]);
act(() => renderer.unmount());

// ---------------------------------------------------------------------------
// 3c. UI: one garment left at Fabrics Needed (single-tap path) pairs too.
// ---------------------------------------------------------------------------
notices.length = 0;
await mount(atCeiling);
await act(async () =>
  actionButton(catalogueCard(renderer.root, "AF-A")).props.onClick({ currentTarget: {} }),
);
assert.equal(placementDialogs(renderer.root).length, 0);
assert.deepEqual(layout(liveState), [["AF-A", ["base:shirt", "base:skirt"]], ["AF-B", ["base:trouser"]]]);
assert.equal(notices.length, 1);
assert.match(notices[0]!, /^Paired .+ with Selection 1 — no extra fabric used$/);
act(() => renderer.unmount());

// ---------------------------------------------------------------------------
// 2. Unused-capacity popup: Continue is primary, Add Garment secondary.
// ---------------------------------------------------------------------------
let continued = 0;
let offerRenderer!: ReturnType<typeof create>;
await act(async () => {
  offerRenderer = create(
    createElement(FutureRemainingFabricCapacityOfferCard, {
      offers: [
        {
          allocationId: "alloc-a",
          fabricCode: "AF-A",
          selectionOrdinal: 1,
          usedUnits: 1,
          remainingUnits: 1,
          assignedGarmentKeys: ["base:shirt"],
        },
      ],
      fabrics,
      eligibleGarmentTypes: ["shirt"],
      onAddAdditionalGarment: () => undefined,
      onContinue: () => {
        continued += 1;
      },
      onDismiss: () => undefined,
    }),
    { createNodeMock },
  );
});
assert.match(textContent(offerRenderer.root), new RegExp(REMAINING_FABRIC_CAPACITY_OFFER_TITLE));
const continueButton = offerRenderer.root.findByProps({
  "data-testid": "remaining-fabric-capacity-offer-decline",
});
assert.equal(textContent(continueButton), REMAINING_FABRIC_CAPACITY_OFFER_CONTINUE);
assert.equal(continueButton.props["data-remaining-fabric-capacity-continue-primary"], "true");
assert.equal(continueButton.props["data-continue-unlock-glow"], "on", "white Continue glow kept");
const addButton = offerRenderer.root.findByProps({
  "data-testid": "remaining-fabric-capacity-offer-add-alloc-a",
});
assert.equal(addButton.props["data-remaining-fabric-capacity-add-secondary"], "true");
assert.doesNotMatch(String(addButton.props.className), /(^|\s)bg-heritage-green(\s|$)/, "Add Garment is not a filled button");
const allButtons = offerRenderer.root.findAll((node) => node.type === "button");
assert.ok(
  allButtons.indexOf(continueButton) < allButtons.indexOf(addButton),
  "Continue comes before Add Garment",
);
continueButton.props.onClick();
assert.equal(continued, 1);
act(() => offerRenderer.unmount());

// Source guard: Change mode never shows the ceiling copy.
const stepSource = readFileSync("src/components/DormantFutureFabricStep.tsx", "utf8");
assert.match(stepSource, /const showAllocationLimitCopy =\s*!isChangeFabricTarget &&/);

console.log("test_fabric_assign_freedom: PASS");
