/**
 * Fabric Selection card pairing (number badge + colour) and the Change Fabric
 * highlight (gold outline, Changing tag, dimmed neighbours, heading jump).
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
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  FABRIC_SELECTION_BADGE_TONES,
  FABRIC_SELECTION_CHANGING_CARD_CLASS,
  FABRIC_SELECTION_DIMMED_CARD_CLASS,
  getFabricSelectionBadgeClass,
  getFabricSelectionBadgeTone,
  getFabricSelectionCardClass,
  getFirstChangingGarmentKey,
  resolveFabricSelectionCardHighlight,
} from "./src/utils/fabricSelectionHighlight";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;

const { DormantFutureFabricStep } = await import(
  "./src/components/DormantFutureFabricStep"
);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// ---------------------------------------------------------------------------
// 1. Pure mapping: colours pair by selection number; changing state is derived.
// ---------------------------------------------------------------------------
assert.equal(FABRIC_SELECTION_BADGE_TONES.length, 8);
assert.equal(getFabricSelectionBadgeTone(1).id, "gold");
assert.equal(getFabricSelectionBadgeTone(2).id, "green");
assert.equal(
  getFabricSelectionBadgeTone(1).className,
  getFabricSelectionBadgeTone(1).className,
  "the same selection number always maps to the same colour",
);
assert.notEqual(
  getFabricSelectionBadgeTone(1).id,
  getFabricSelectionBadgeTone(2).id,
  "different selection numbers get different colours",
);
assert.equal(
  getFabricSelectionBadgeTone(9).id,
  getFabricSelectionBadgeTone(1).id,
  "colours wrap after the palette",
);
assert.match(getFabricSelectionBadgeClass(1), /rounded-full/);
assert.match(getFabricSelectionBadgeClass(1), /bg-heritage-gold/);

assert.equal(
  resolveFabricSelectionCardHighlight({
    changingSelectionNumber: null,
    cardSelectionNumber: 1,
  }),
  "idle",
);
assert.equal(
  resolveFabricSelectionCardHighlight({
    changingSelectionNumber: 1,
    cardSelectionNumber: 1,
  }),
  "changing",
);
assert.equal(
  resolveFabricSelectionCardHighlight({
    changingSelectionNumber: 1,
    cardSelectionNumber: 2,
  }),
  "dimmed",
);
assert.equal(
  resolveFabricSelectionCardHighlight({
    changingSelectionNumber: 2,
    cardSelectionNumber: null,
  }),
  "dimmed",
  "unassigned cards dim while another selection is being changed",
);
assert.equal(
  resolveFabricSelectionCardHighlight({
    changingSelectionNumber: 0,
    cardSelectionNumber: 1,
  }),
  "idle",
);
assert.equal(
  getFabricSelectionCardClass("changing"),
  FABRIC_SELECTION_CHANGING_CARD_CLASS,
);
assert.equal(
  getFabricSelectionCardClass("dimmed"),
  FABRIC_SELECTION_DIMMED_CARD_CLASS,
);
assert.match(FABRIC_SELECTION_CHANGING_CARD_CLASS, /ring-heritage-gold/);
assert.match(FABRIC_SELECTION_DIMMED_CARD_CLASS, /opacity-60/);
assert.equal(
  getFirstChangingGarmentKey(
    ["base:shirt", "base:trouser", "base:skirt"],
    ["base:trouser", "base:shirt"],
  ),
  "base:shirt",
  "scroll target is the first highlighted card in roster order",
);
assert.equal(getFirstChangingGarmentKey(["base:skirt"], ["base:shirt"]), "base:shirt");
assert.equal(getFirstChangingGarmentKey(["base:shirt"], []), null);

// ---------------------------------------------------------------------------
// 2. Step 2 UI: badges, Change Fabric highlight, heading jump + thumbnail.
// ---------------------------------------------------------------------------
const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const threeGarments: GarmentTypeStepSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser", "skirt"],
  selectedDemographics: ["male", "female"],
  normalizedCustomDetailCatalog: catalog,
}).selection;

const fabrics: Fabric[] = [
  {
    code: "HL-A",
    name: "Highlight Ankara A",
    description: "Shared fabric",
    color: "Gold",
    colorHex: "#C5A85C",
    category: "Test",
    price: 20,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
    image: "https://cdn.example.com/fabrics/highlight-a.jpg",
  },
  {
    code: "HL-B",
    name: "Highlight Ankara B",
    description: "Second fabric",
    color: "Green",
    colorHex: "#0A291B",
    category: "Test",
    price: 22,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
    image: "https://cdn.example.com/fabrics/highlight-b.jpg",
  },
];

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

const assign = (
  state: FabricAllocationState,
  garmentKey: string,
  fabricCode: string,
) => {
  const result = assignFutureFabricToGarment({
    state,
    garmentTypeSelection: threeGarments,
    garmentKey,
    fabricCode,
    fabrics,
  });
  assert.equal(result.status, "assigned", `assign ${garmentKey} -> ${fabricCode}`);
  return result.state;
};

const renderStep = (state: FabricAllocationState) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: threeGarments,
    fabricAllocationState: state,
    fabrics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: threeGarments,
    fabricAllocationState: state,
  });
  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection: threeGarments,
    fabricAllocationState: state,
    completion,
    requiredFabricQuantity: planning.requiredFabricQuantity,
    selectedFabricQuantity: planning.selectedFabricQuantity,
    constructionPrice: 0,
    onAssignFabricToGarment: () => undefined,
    onChangeFabricAllocationProduct: () => undefined,
    onRemoveFabricFromGarment: () => undefined,
    onUseSameFabricForGarment: () => undefined,
    onAssignSameFabricProduct: () => undefined,
    onAssignGarmentToExistingAllocation: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
    onUseSameFabric: () => undefined,
    onChooseAnotherFabric: () => undefined,
    onCancelPendingFabric: () => undefined,
  });
};

const scrolledKeys: string[] = [];
const createNodeMock = (element: ReactElement) => {
  const props = (element.props ?? {}) as Record<string, unknown>;
  const garmentKey =
    typeof props["data-garment-key"] === "string" &&
    typeof props["data-assignment-status"] === "string"
      ? props["data-garment-key"]
      : null;
  return {
    tagName: typeof element.type === "string" ? element.type.toUpperCase() : "DIV",
    isConnected: true,
    tabIndex: typeof props.tabIndex === "number" ? props.tabIndex : 0,
    parentElement: null,
    getAttribute: (name: string) =>
      props[name] == null ? null : String(props[name]),
    hasAttribute: (name: string) => props[name] !== undefined,
    focus: () => undefined,
    scrollIntoView: () => {
      if (garmentKey) scrolledKeys.push(garmentKey);
    },
  };
};

let state = assign(FabricAllocationStateEngine.initialize(), "base:shirt", "HL-A");
state = assign(state, "base:trouser", "HL-A");
state = assign(state, "base:skirt", "HL-B");

let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(renderStep(state), { createNodeMock });
});

const shirtCard = renderer.root.findByProps({
  "data-garment-key": "base:shirt",
  "data-assignment-status": "assigned",
});
const trouserCard = renderer.root.findByProps({
  "data-garment-key": "base:trouser",
  "data-assignment-status": "assigned",
});
const skirtCard = renderer.root.findByProps({
  "data-garment-key": "base:skirt",
  "data-assignment-status": "assigned",
});

assert.equal(shirtCard.props["data-fabric-selection-number"], "1");
assert.equal(trouserCard.props["data-fabric-selection-number"], "1");
assert.equal(skirtCard.props["data-fabric-selection-number"], "2");
assert.equal(shirtCard.props["data-fabric-selection-highlight"], "idle");
assert.equal(trouserCard.props["data-fabric-selection-highlight"], "idle");
assert.equal(skirtCard.props["data-fabric-selection-highlight"], "idle");

const shirtBadge = shirtCard.findByProps({ "data-fabric-selection-badge": "true" });
const trouserBadge = trouserCard.findByProps({ "data-fabric-selection-badge": "true" });
const skirtBadge = skirtCard.findByProps({ "data-fabric-selection-badge": "true" });
assert.equal(shirtBadge.props["aria-label"], "Fabric Selection 1");
assert.equal(trouserBadge.props["aria-label"], "Fabric Selection 1");
assert.equal(skirtBadge.props["aria-label"], "Fabric Selection 2");
assert.equal(textContent(shirtBadge), "1");
assert.equal(textContent(skirtBadge), "2");
assert.equal(shirtBadge.props.className, trouserBadge.props.className);
assert.notEqual(shirtBadge.props.className, skirtBadge.props.className);
assert.match(textContent(shirtCard), /Fabric Selection 1/);
assert.match(textContent(skirtCard), /Fabric Selection 2/);
assert.equal(
  shirtCard.findAllByProps({ "data-fabric-selection-changing-tag": "true" }).length,
  0,
);
assert.doesNotMatch(String(shirtCard.props.className), /ring-heritage-gold/);
assert.doesNotMatch(String(skirtCard.props.className), /opacity-60/);

await act(async () => {
  renderer.root
    .findByProps({ "aria-label": "Change fabric for Standard Shirt" })
    .props.onClick({ currentTarget: {} });
});

const changingShirt = renderer.root.findByProps({
  "data-garment-key": "base:shirt",
  "data-assignment-status": "assigned",
});
const changingTrouser = renderer.root.findByProps({
  "data-garment-key": "base:trouser",
  "data-assignment-status": "assigned",
});
const dimmedSkirt = renderer.root.findByProps({
  "data-garment-key": "base:skirt",
  "data-assignment-status": "assigned",
});
assert.equal(changingShirt.props["data-fabric-selection-highlight"], "changing");
assert.equal(changingTrouser.props["data-fabric-selection-highlight"], "changing");
assert.equal(dimmedSkirt.props["data-fabric-selection-highlight"], "dimmed");
assert.equal(changingShirt.props["data-fabric-selection-highlight-anchor"], "true");
assert.equal(changingTrouser.props["data-fabric-selection-highlight-anchor"], undefined);
assert.match(String(changingShirt.props.className), /ring-heritage-gold/);
assert.match(String(changingTrouser.props.className), /ring-heritage-gold/);
assert.match(String(dimmedSkirt.props.className), /opacity-60/);
assert.doesNotMatch(String(changingShirt.props.className), /opacity-60/);
assert.equal(
  textContent(changingShirt.findByProps({ "data-fabric-selection-changing-tag": "true" })),
  "Changing",
);
assert.equal(
  textContent(changingTrouser.findByProps({ "data-fabric-selection-changing-tag": "true" })),
  "Changing",
);
assert.equal(
  dimmedSkirt.findAllByProps({ "data-fabric-selection-changing-tag": "true" }).length,
  0,
);
assert.match(
  textContent(renderer.root),
  /Changing Fabric for Fabric Selection 1/,
);
assert.match(
  textContent(renderer.root),
  /This Fabric is shared by/,
);

const headingButton = renderer.root.findByProps({
  "data-testid": "fabric-selection-change-heading",
});
assert.equal(headingButton.type, "button");
assert.match(
  String(headingButton.props["aria-label"]),
  /Jump to highlighted garment cards/,
);
assert.equal(
  headingButton.findByProps({ "data-fabric-selection-heading-thumb": "true" }).type,
  "span",
);
const headingPreview = headingButton.findByProps({
  "data-assigned-fabric-preview": "true",
});
assert.equal(headingPreview.props["data-fabric-code"], "HL-A");

scrolledKeys.length = 0;
await act(async () => headingButton.props.onClick());
assert.deepEqual(scrolledKeys, ["base:shirt"]);

const cancel = renderer.root.findAllByType("button").find((button) =>
  textContent(button).includes("Cancel"),
);
assert.ok(cancel);
await act(async () => cancel!.props.onClick());

const idleShirt = renderer.root.findByProps({
  "data-garment-key": "base:shirt",
  "data-assignment-status": "assigned",
});
const idleSkirt = renderer.root.findByProps({
  "data-garment-key": "base:skirt",
  "data-assignment-status": "assigned",
});
assert.equal(idleShirt.props["data-fabric-selection-highlight"], "idle");
assert.equal(idleSkirt.props["data-fabric-selection-highlight"], "idle");
assert.equal(
  idleShirt.findAllByProps({ "data-fabric-selection-changing-tag": "true" }).length,
  0,
);
assert.equal(
  renderer.root.findAllByProps({ "data-testid": "fabric-selection-change-heading" })
    .length,
  0,
);
assert.doesNotMatch(String(idleShirt.props.className), /ring-heritage-gold/);
assert.doesNotMatch(String(idleSkirt.props.className), /opacity-60/);
assert.equal(idleShirt.findByProps({ "data-fabric-selection-badge": "true" }).props["aria-label"], "Fabric Selection 1");

act(() => renderer.unmount());
console.log("test_fabric_selection_highlight: PASS");
