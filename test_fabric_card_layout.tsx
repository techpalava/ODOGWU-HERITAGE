/**
 * Fabric step garment cards: photo-left layout and the green half/full piece
 * marker. Pure UI: the marker reads the garment's existing fabricUnits, badges
 * stay one number per fabric piece, and the cards stay wired to the Garment
 * Type selection, × removal, Continue gating and a restored draft.
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
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  removeFutureFabricAssignment,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { GARMENT_CARD_FABRIC_PHOTO_CLASSNAME } from "./src/components/AssignedFabricPreview";
import {
  FABRIC_PIECE_USAGE_ACCESSIBLE_LABEL,
  FABRIC_PIECE_USAGE_LABEL,
  getFabricPieceUsage,
} from "./src/components/FabricPieceUsageMarker";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;
const { DormantFutureFabricStep } = await import("./src/components/DormantFutureFabricStep");
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// --- Marker rules come straight from fabricUnits ---
assert.equal(getFabricPieceUsage(1), "half");
assert.equal(getFabricPieceUsage(2), "full");
assert.equal(FABRIC_PIECE_USAGE_LABEL.half, "Half piece");
assert.equal(FABRIC_PIECE_USAGE_LABEL.full, "Full piece");

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const selectionFor = (types: string[]): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: types as never,
    selectedDemographics: ["male", "female"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
const fabrics: Fabric[] = ["A", "B"].map((suffix) => ({
  code: `CL-${suffix}`,
  name: `Card Layout ${suffix}`,
  description: "Test fabric",
  color: "Gold",
  colorHex: "#C5A85C",
  category: "Test",
  price: 20,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  stock: 30,
  image: `https://cdn.example.com/fabrics/cl-${suffix}.jpg`,
}));

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

const removed: string[] = [];
const renderStep = (selection: GarmentTypeStepSelection, state: FabricAllocationState) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: selection,
    fabricAllocationState: state,
    fabrics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: selection,
    fabricAllocationState: state,
  });
  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection: selection,
    fabricAllocationState: state,
    completion,
    requiredFabricQuantity: planning.requiredFabricQuantity,
    selectedFabricQuantity: planning.selectedFabricQuantity,
    constructionPrice: 0,
    onAssignFabricToGarment: () => undefined,
    onChangeFabricAllocationProduct: () => undefined,
    onRemoveFabricFromGarment: (garmentKey: string) => {
      removed.push(garmentKey);
      return undefined;
    },
    onUseSameFabricForGarment: () => undefined,
    onAssignSameFabricProduct: () => undefined,
    onAssignGarmentToExistingAllocation: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
    onUseSameFabric: () => undefined,
    onChooseAnotherFabric: () => undefined,
    onCancelPendingFabric: () => undefined,
  } as never);
};
const place = (
  selection: GarmentTypeStepSelection,
  state: FabricAllocationState,
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
  assert.equal(result.status, "assigned", `${garmentKey} assigned`);
  return result.state;
};

/** What a shopper sees per card, in a comparable shape. */
const readCards = (root: ReactTestInstance) =>
  root
    .findAll((node) => typeof node.type === "string" && node.props["data-assignment-status"] != null)
    .map((card) => {
      const badges = card.findAllByProps({ "data-fabric-selection-badge": "true" });
      const markers = card.findAll(
        (node) => typeof node.type === "string" && node.props["data-fabric-piece-usage"] != null,
      );
      const capacity = card.findAllByProps({ "data-fabric-allocation-capacity": "true" });
      return {
        key: String(card.props["data-garment-key"]),
        status: String(card.props["data-assignment-status"]),
        badge: badges.length ? textContent(badges[0]) : null,
        marker: markers.length ? String(markers[0].props["data-fabric-piece-usage"]) : null,
        markerText: markers.length ? textContent(markers[0]) : null,
        capacity: capacity.length ? textContent(capacity[0]) : null,
      };
    });

const selection = selectionFor(["shirt", "trouser", "full_length_gown"]);
let state = FabricAllocationStateEngine.initialize();
state = place(selection, state, "base:shirt", "CL-A");
state = place(selection, state, "base:trouser", "CL-A");
state = place(selection, state, "base:full_length_gown", "CL-A");
const stateSnapshot = JSON.stringify(state);

let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(renderStep(selection, state));
});

// --- Layout + marker on assigned cards ---
let cards = readCards(renderer.root);
assert.deepEqual(
  cards.map(({ key, status, badge, marker, capacity }) => ({ key, status, badge, marker, capacity })),
  [
    { key: "base:shirt", status: "assigned", badge: "1", marker: "half", capacity: "Capacity: 2/2" },
    { key: "base:trouser", status: "assigned", badge: "1", marker: "half", capacity: "Capacity: 2/2" },
    { key: "base:full_length_gown", status: "assigned", badge: "2", marker: "full", capacity: "Capacity: 2/2" },
  ],
  "badges stay one number per piece; the long-length garment shows Full piece",
);
assert.equal(
  cards[0].markerText,
  `${FABRIC_PIECE_USAGE_LABEL.half}${FABRIC_PIECE_USAGE_ACCESSIBLE_LABEL.half}`,
  "visible 'Half piece' plus a screen-reader label",
);
assert.equal(
  cards[2].markerText,
  `${FABRIC_PIECE_USAGE_LABEL.full}${FABRIC_PIECE_USAGE_ACCESSIBLE_LABEL.full}`,
);
assert.equal(JSON.stringify(state), stateSnapshot, "rendering never mutates fabric state");

const shirtCard = renderer.root.findByProps({
  "data-garment-key": "base:shirt",
  "data-assignment-status": "assigned",
});
const titleRow = shirtCard.findByProps({ "data-garment-card-title-row": "true" });
const titleHosts = titleRow.children.filter(
  (child): child is ReactTestInstance => typeof child !== "string",
);
assert.equal(titleHosts[0].props["data-fabric-selection-badge"], "true", "badge leads the top row");
assert.equal(textContent(titleHosts[1]), "Standard Shirt");
assert.equal(titleHosts[2].props["aria-label"], "Remove fabric from Standard Shirt", "× ends the top row");
assert.match(String(titleHosts[2].props.className), /\bml-auto\b/, "× is pushed to the right");
const fabricLine = shirtCard.findByProps({ "data-garment-card-fabric-line": "true" });
assert.equal(textContent(fabricLine), "Card Layout A CL-A", "fabric name and muted code on one line");
const selectionLine = shirtCard.findByProps({ "data-garment-card-selection-line": "true" });
assert.equal(textContent(selectionLine), "Fabric Selection 1·Capacity: 2/2");
assert.match(String(selectionLine.props.className), /text-heritage-gold/);
const statusRow = shirtCard.findByProps({ "data-garment-card-status-row": "true" });
assert.equal(statusRow.findAll((n) => n.props["data-fabric-piece-usage"] === "half").length > 0, true);
assert.equal(textContent(statusRow.findByProps({ "data-garment-fabric-badge": "true" })), "Assigned");
const photo = shirtCard.findByProps({ "data-assigned-fabric-preview": "true" });
assert.equal(photo.props.className, GARMENT_CARD_FABRIC_PHOTO_CLASSNAME);
assert.match(GARMENT_CARD_FABRIC_PHOTO_CLASSNAME, /h-\[88px\] w-\[88px\] shrink-0/, "photo shrinks on phones");
assert.match(GARMENT_CARD_FABRIC_PHOTO_CLASSNAME, /sm:h-\[104px\] sm:w-\[104px\]/, "104px square from sm up");
const change = shirtCard.findByProps({ "aria-label": "Change fabric for Standard Shirt" });
assert.match(String(change.props.className), /\bw-full\b/, "Change Fabric is full width");

// --- (c) Continue gating unchanged: complete state shows Continue ---
const completeContinue = renderer.root.findAll(
  (n) => typeof n.type === "string" && n.props["aria-label"] === "Continue to Design Style",
).length;
assert.ok(completeContinue > 0, "Continue is offered once every garment has fabric");

// --- (b) × still calls the existing removal handler with the garment key ---
await act(async () => {
  renderer.root.findByProps({ "aria-label": "Remove fabric from Standard Shirt" }).props.onClick();
});
assert.deepEqual(removed, ["base:shirt"]);
const afterRemove = removeFutureFabricAssignment({ state, garmentKey: "base:shirt" });
await act(async () => {
  renderer.update(renderStep(selection, afterRemove));
});
cards = readCards(renderer.root);
const shirtAfter = cards.find((card) => card.key === "base:shirt")!;
assert.deepEqual(
  { status: shirtAfter.status, badge: shirtAfter.badge, marker: shirtAfter.marker },
  { status: "unassigned", badge: null, marker: null },
  "removed garment returns to an unassigned card with no badge or marker",
);
assert.equal(cards.find((card) => card.key === "base:trouser")!.capacity, "Capacity: 1/2 · 1/2 available");
const unassigned = renderer.root.findByProps({
  "data-garment-key": "base:shirt",
  "data-assignment-status": "unassigned",
});
assert.equal(textContent(unassigned.findByProps({ "data-garment-fabric-badge": "true" })), "Needs fabric");
assert.match(textContent(unassigned), /Fabric not assigned/);
assert.equal(
  unassigned.findByProps({ "data-unassigned-fabric-placeholder": "true" }).props.className.includes(
    GARMENT_CARD_FABRIC_PHOTO_CLASSNAME,
  ),
  true,
);
const incompleteContinue = renderer.root.findAll(
  (n) => typeof n.type === "string" && n.props["aria-label"] === "Continue to Design Style",
).length;
assert.equal(incompleteContinue, 0, "Continue stays hidden while a garment needs fabric");

// --- (a) Garment Type changes flow through to the cards ---
const withSkirt = selectionFor(["shirt", "trouser", "full_length_gown", "skirt"]);
await act(async () => {
  renderer.update(renderStep(withSkirt, state));
});
cards = readCards(renderer.root);
assert.deepEqual(
  cards.map((card) => [card.key, card.status, card.marker]),
  [
    ["base:shirt", "assigned", "half"],
    ["base:trouser", "assigned", "half"],
    ["base:skirt", "unassigned", null],
    ["base:full_length_gown", "assigned", "full"],
  ],
  "an added garment appears as a new unassigned card",
);

// --- (e) Restore: allocations round-tripped like a saved draft rebuild the same cards ---
const restored: FabricAllocationState = {
  fabricAllocations: JSON.parse(JSON.stringify(state.fabricAllocations)),
  activeAllocationId: state.fabricAllocations[0]?.allocationId || null,
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
await act(async () => {
  renderer.update(renderStep(selection, state));
});
const live = readCards(renderer.root);
await act(async () => {
  renderer.update(renderStep(selection, restored));
});
assert.deepEqual(readCards(renderer.root), live, "a restored draft shows the same cards");

await act(async () => {
  renderer.unmount();
});
console.log("PASS: Fabric garment cards use the photo-left layout and the half/full piece marker");
