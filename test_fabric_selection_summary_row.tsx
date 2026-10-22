/**
 * Fabric Selection summary row + Change-mode polish (PR #1041):
 * - one button per Fabric Selection with badge, swatch, fabric name,
 *   garment names and capacity; hidden when no selection exists;
 * - tapping a button opens Change Fabric for that selection, highlights its
 *   garment cards and scrolls them into view; another button switches target;
 * - heading "Choose a new fabric for Selection N"; USE AGAIN "Selection N"
 *   badge; stock-blocked message on the disabled button; "Cancel change".
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
  assignFutureFabricToGarment,
  assignSameFabricProductToGarments,
  changeFutureFabricAllocationProduct,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
} from "./src/utils/designStudioFutureFabricStage";
import { getFabricSelectionBadgeClass } from "./src/utils/fabricSelectionHighlight";
import {
  buildFabricSelectionSummaryItems,
  formatFabricSelectionNumbersBadge,
  formatFabricSelectionSummaryCapacityLabel,
  getFabricSelectionNumbersUsingFabric,
} from "./src/utils/fabricSelectionSummaryRow";
import { formatFabricStockExhaustedCopy } from "./src/utils/fabricStockAvailability";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;
const { DormantFutureFabricStep } = await import("./src/components/DormantFutureFabricStep");
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const selection: GarmentTypeStepSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser", "skirt", "long_skirt", "standard_shorts", "bum_shorts"],
  selectedDemographics: ["male", "female"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const fabric = (suffix: string, name: string, stock: number): Fabric => ({
  code: `SR-${suffix}`,
  name,
  description: "Test fabric",
  color: "Gold",
  colorHex: "#C5A85C",
  category: "Test",
  price: 20,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  stock,
  image: `https://cdn.example.com/fabrics/sr-${suffix}.jpg`,
});
const fabrics: Fabric[] = [
  fabric("A", "Classic Ivory Shield", 30),
  fabric("B", "Royal Forest Mosaic", 30),
  fabric("E", "Ivory Imperial Leaf", 1),
  fabric("N", "Heritage Ivory Lattice", 30),
];
const assign = (state: FabricAllocationState, garmentKey: string, fabricCode: string) => {
  const result = assignFutureFabricToGarment({ state, garmentTypeSelection: selection, garmentKey, fabricCode, fabrics });
  assert.equal(result.status, "assigned", `${garmentKey} -> ${fabricCode}`);
  return result.state;
};
// Selection 1: Shirt + Trouser (A). Selection 2: Skirt + Long Skirt (B).
// Selection 3: Standard Shorts alone (E, 1/2 left, only 1 piece in stock).
let base = FabricAllocationStateEngine.initialize();
base = assign(base, "base:shirt", "SR-A");
base = assign(base, "base:trouser", "SR-A");
base = assign(base, "base:skirt", "SR-B");
base = assign(base, "base:long_skirt", "SR-B");
base = assign(base, "base:standard_shorts", "SR-E");

// ---------------------------------------------------------------------------
// 1. Pure helpers.
// ---------------------------------------------------------------------------
assert.equal(formatFabricSelectionSummaryCapacityLabel(2, 0), "2/2");
assert.equal(formatFabricSelectionSummaryCapacityLabel(1, 1), "1/2 left");
assert.equal(formatFabricSelectionNumbersBadge([2]), "Selection 2");
assert.equal(formatFabricSelectionNumbersBadge([2, 3]), "Selections 2 & 3");
assert.equal(formatFabricSelectionNumbersBadge([]), "");
const items = buildFabricSelectionSummaryItems({ fabricAllocationState: base, garmentTypeSelection: selection, fabrics });
assert.deepEqual(
  items.map((item) => [item.selectionNumber, item.fabricName, item.capacityLabel, item.capacityTone, [...item.garmentKeys]]),
  [
    [1, "Classic Ivory Shield", "2/2", "full", ["base:shirt", "base:trouser"]],
    [2, "Royal Forest Mosaic", "2/2", "full", ["base:skirt", "base:long_skirt"]],
    [3, "Ivory Imperial Leaf", "1/2 left", "reusable_capacity", ["base:standard_shorts"]],
  ],
);
assert.deepEqual(
  buildFabricSelectionSummaryItems({ fabricAllocationState: FabricAllocationStateEngine.initialize(), garmentTypeSelection: selection, fabrics }),
  [],
);
assert.deepEqual(
  getFabricSelectionNumbersUsingFabric({ fabricAllocationState: base, fabricCode: "SR-B", excludeAllocationId: base.fabricAllocations[0]!.allocationId }),
  [2],
);

// ---------------------------------------------------------------------------
// 2. UI.
// ---------------------------------------------------------------------------
const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";
const scrolledKeys: string[] = [];
const createNodeMock = (element: ReactElement) => {
  const props = (element.props ?? {}) as Record<string, unknown>;
  const garmentKey =
    typeof props["data-garment-key"] === "string" && typeof props["data-assignment-status"] === "string"
      ? (props["data-garment-key"] as string)
      : null;
  return {
    tagName: typeof element.type === "string" ? element.type.toUpperCase() : "DIV",
    isConnected: true,
    tabIndex: typeof props.tabIndex === "number" ? props.tabIndex : 0,
    parentElement: null,
    style: {} as { scrollMarginTop?: string },
    getAttribute: (name: string) => (props[name] == null ? null : String(props[name])),
    hasAttribute: (name: string) => props[name] !== undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    querySelectorAll: () => [],
    querySelector: () => null,
    focus: () => undefined,
    scrollIntoView: () => {
      if (garmentKey) scrolledKeys.push(garmentKey);
    },
  };
};

let liveState = base;
const renderStep = () => {
  const completion = getFutureFabricStageCompletion({ garmentTypeSelection: selection, fabricAllocationState: liveState, fabrics });
  const planning = getFutureGarmentFabricPlanning({ garmentTypeSelection: selection, fabricAllocationState: liveState });
  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection: selection,
    fabricAllocationState: liveState,
    completion,
    requiredFabricQuantity: planning.requiredFabricQuantity,
    selectedFabricQuantity: planning.selectedFabricQuantity,
    constructionPrice: 0,
    onAssignFabricToGarment: (picked: Fabric, garmentKey: string) => {
      const result = assignFutureFabricToGarment({ state: liveState, garmentTypeSelection: selection, garmentKey, fabricCode: picked.code, fabrics });
      if (result.status === "assigned") liveState = result.state;
      return result.status === "assigned" ? result.state : undefined;
    },
    onChangeFabricAllocationProduct: ((allocationId: string, fabricCode: string, expectation?: { expectedCurrentFabricCode: string; expectedAssignmentSignature: string }) => {
      const result = changeFutureFabricAllocationProduct({ state: liveState, allocationId, nextFabricCode: fabricCode, fabrics, expectation });
      if (result.status === "assigned") liveState = result.state;
      return result;
    }) as never,
    onRemoveFabricFromGarment: () => undefined,
    onUseSameFabricForGarment: () => undefined,
    onAssignSameFabricProduct: (fabricCode: string, garmentKeys: string[]) => {
      const result = assignSameFabricProductToGarments({ state: liveState, garmentTypeSelection: selection, fabricCode, garmentKeys, fabrics });
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

const summaryButton = (root: ReactTestInstance, n: number) =>
  root.findByProps({ "data-fabric-selection-summary-button": String(n) });
const garmentCard = (root: ReactTestInstance, garmentKey: string) =>
  root.find((node) => node.props?.["data-garment-key"] === garmentKey && typeof node.props?.["data-assignment-status"] === "string");
const catalogueCard = (root: ReactTestInstance, code: string) =>
  root.findByProps({ "data-fabric-catalogue-card": "true", "data-fabric-card-code": code });
const actionButton = (card: ReactTestInstance) =>
  card.find((node) => node.type === "button" && node.props["data-fabric-card"] === "true" && node.props["data-fabric-remove"] !== "true");
// openCatalogue only schedules its scroll when a window exists.
const withWindow = async (run: () => Promise<void>) => {
  const g = globalThis as unknown as { window?: unknown };
  const had = "window" in g;
  const previous = g.window;
  g.window = {
    requestAnimationFrame: (cb: (time: number) => void) => {
      cb(0);
      return 0;
    },
    matchMedia: () => ({ matches: true }),
    setTimeout,
    clearTimeout,
  };
  try {
    await run();
  } finally {
    if (had) g.window = previous;
    else delete g.window;
  }
};

// Hidden with no Fabric Selections.
{
  const saved = liveState;
  liveState = FabricAllocationStateEngine.initialize();
  let empty!: ReturnType<typeof create>;
  await act(async () => {
    empty = create(renderStep(), { createNodeMock });
  });
  assert.equal(empty.root.findAllByProps({ "data-fabric-selection-summary-row": "true" }).length, 0, "row hidden when no selection exists");
  act(() => empty.unmount());
  liveState = saved;
}

let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(renderStep(), { createNodeMock });
});
const row = renderer.root.findByProps({ "data-fabric-selection-summary-row": "true" });
assert.equal(row.type, "nav");
const buttons = row.findAll((node) => node.type === "button");
assert.equal(buttons.length, 3, "one button per Fabric Selection");
const expected = [
  { n: 1, name: "Classic Ivory Shield", garments: /Standard Shirt.*Trouser/, capacity: "2/2", tone: "full" },
  { n: 2, name: "Royal Forest Mosaic", garments: /Skirt.*Long Skirt/i, capacity: "2/2", tone: "full" },
  { n: 3, name: "Ivory Imperial Leaf", garments: /Shorts/i, capacity: "1/2 left", tone: "reusable_capacity" },
];
for (const entry of expected) {
  const button = summaryButton(renderer.root, entry.n);
  assert.equal(button.type, "button");
  assert.equal(button.props.type, "button");
  assert.equal(button.props["aria-pressed"], false);
  assert.match(String(button.props["aria-label"]), new RegExp(`^Fabric Selection ${entry.n}: ${entry.name} for `));
  const badge = button.findByProps({ "data-fabric-selection-summary-badge": "true" });
  assert.equal(textContent(badge), String(entry.n));
  assert.ok(String(badge.props.className).includes(getFabricSelectionBadgeClass(entry.n)), "badge uses #1021 style");
  assert.equal(button.findAll((node) => node.props?.["data-fabric-selection-summary-swatch"] === "image").length, 1, "swatch thumbnail");
  assert.equal(textContent(button.findByProps({ "data-fabric-selection-summary-name": "true" })), entry.name);
  assert.match(textContent(button.findByProps({ "data-fabric-selection-summary-garments": "true" })), entry.garments);
  const capacity = button.findByProps({ "data-fabric-selection-summary-capacity": entry.tone });
  assert.equal(textContent(capacity), entry.capacity);
  if (entry.tone === "reusable_capacity") assert.match(String(capacity.props.className), /bg-red-600/);
}
assert.equal(garmentCard(renderer.root, "base:skirt").props["data-fabric-selection-highlight"], "idle");

// Tap Selection 2: Change Fabric for that selection, highlight + scroll.
scrolledKeys.length = 0;
await withWindow(async () => {
  await act(async () => summaryButton(renderer.root, 2).props.onClick({ currentTarget: {} }));
});
assert.match(textContent(renderer.root), /Choose a new fabric for Selection 2/);
assert.doesNotMatch(textContent(renderer.root), /Changing Fabric for Fabric Selection/);
assert.equal(renderer.root.findByProps({ "data-testid": "fabric-selection-change-heading" }).findAllByProps({ "data-fabric-selection-heading-thumb": "true" }).length, 1, "heading swatch");
assert.equal(garmentCard(renderer.root, "base:skirt").props["data-fabric-selection-highlight"], "changing");
assert.equal(garmentCard(renderer.root, "base:long_skirt").props["data-fabric-selection-highlight"], "changing");
assert.equal(garmentCard(renderer.root, "base:shirt").props["data-fabric-selection-highlight"], "dimmed");
assert.deepEqual(scrolledKeys, ["base:skirt"], "scrolls the selection's first garment card into view");
assert.equal(summaryButton(renderer.root, 2).props["aria-pressed"], true);
assert.equal(summaryButton(renderer.root, 2).findAllByProps({ "data-fabric-selection-summary-changing-tag": "true" }).length, 1);
assert.equal(summaryButton(renderer.root, 1).props["aria-pressed"], false);

// Switch target to Selection 1 via its button.
await withWindow(async () => {
  await act(async () => summaryButton(renderer.root, 1).props.onClick({ currentTarget: {} }));
});
assert.match(textContent(renderer.root), /Choose a new fabric for Selection 1/);
assert.equal(garmentCard(renderer.root, "base:shirt").props["data-fabric-selection-highlight"], "changing");
assert.equal(garmentCard(renderer.root, "base:skirt").props["data-fabric-selection-highlight"], "dimmed");
assert.equal(summaryButton(renderer.root, 1).props["aria-pressed"], true);
assert.equal(summaryButton(renderer.root, 2).props["aria-pressed"], false);
assert.equal(summaryButton(renderer.root, 2).findAllByProps({ "data-fabric-selection-summary-changing-tag": "true" }).length, 0);

// USE AGAIN badge names the selection(s) already using the print.
const cardB = catalogueCard(renderer.root, "SR-B");
assert.equal(textContent(actionButton(cardB)), "USE AGAIN");
assert.equal(textContent(cardB.findByProps({ "data-fabric-used-by-selections": "true" })), "Already used in Selection 2");
assert.equal(catalogueCard(renderer.root, "SR-N").findAllByProps({ "data-fabric-used-by-selections": "true" }).length, 0);
assert.equal(catalogueCard(renderer.root, "SR-A").findAllByProps({ "data-fabric-used-by-selections": "true" }).length, 0);

// Stock-blocked: the message sits on the disabled button itself.
const cardE = catalogueCard(renderer.root, "SR-E");
const blocked = actionButton(cardE);
assert.equal(blocked.props.disabled, true);
assert.equal(blocked.props["data-fabric-disabled-message"], "true");
assert.equal(textContent(blocked), formatFabricStockExhaustedCopy());
assert.doesNotMatch(textContent(blocked), /USE AGAIN/);

// Cancel change.
const cancel = renderer.root.findByProps({ "data-testid": "fabric-change-cancel" });
assert.match(textContent(cancel), /Cancel change/);
await act(async () => cancel.props.onClick());
assert.doesNotMatch(textContent(renderer.root), /Choose a new fabric for Selection/);
assert.equal(garmentCard(renderer.root, "base:shirt").props["data-fabric-selection-highlight"], "idle");
assert.equal(summaryButton(renderer.root, 1).props["aria-pressed"], false);
assert.equal(renderer.root.findAllByProps({ "data-testid": "fabric-change-cancel" }).length, 0);
// Plain catalogue (not changing) never shows the selection badge or blocked-button copy.
assert.equal(renderer.root.findAllByProps({ "data-fabric-used-by-selections": "true" }).length, 0);
assert.equal(renderer.root.findAllByProps({ "data-fabric-disabled-message": "true" }).length, 0);

// Pick USE AGAIN from a summary-row change: both selections end on the print.
await withWindow(async () => {
  await act(async () => summaryButton(renderer.root, 1).props.onClick({ currentTarget: {} }));
});
await act(async () => actionButton(catalogueCard(renderer.root, "SR-B")).props.onClick({ currentTarget: {} }));
await act(async () => renderer.root.findByProps({ "data-change-fabric-confirm": "true" }).props.onClick());
assert.deepEqual(liveState.fabricAllocations.map((allocation) => allocation.fabricCode), ["SR-B", "SR-B", "SR-E"]);
await act(async () => renderer.update(renderStep()));
assert.match(textContent(summaryButton(renderer.root, 1)), /Royal Forest Mosaic/);
assert.match(textContent(summaryButton(renderer.root, 2)), /Royal Forest Mosaic/);
act(() => renderer.unmount());

console.log("test_fabric_selection_summary_row: PASS");
