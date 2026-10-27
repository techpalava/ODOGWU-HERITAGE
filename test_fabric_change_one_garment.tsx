/**
 * fabric-change-one-garment (Xavier, 27 Oct): Change Fabric on a garment card
 * whose Fabric piece is shared changes ONLY that garment. The garment leaves
 * the shared piece and goes onto the new print; the other garments keep the
 * old print (that piece shows its spare room).
 *
 * - New print already has a piece with room: the existing pair-or-new-piece
 *   popup asks where the garment goes.
 * - A garment alone on its piece keeps the re-colour behaviour.
 * - Change from the Fabric Selection summary chip still changes the whole
 *   selection through the "Change Fabric for this group?" confirm.
 * - No confirm popup for the one-garment change; the hint says only that
 *   garment changes; the Changing highlight marks only that garment card.
 * - One piece per garment and stock still apply; price is unchanged.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, type ReactElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type {
  BusinessSettings,
  Fabric,
  FabricAllocationState,
  GarmentTypeStepSelection,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import {
  applyFutureFabricCardSelection,
  assignFutureFabricToGarment,
  assignFutureGarmentToExistingFabricAllocation,
  assignSameFabricProductToGarments,
  changeFutureFabricAllocationProduct,
  detachFutureGarmentFromSharedPiece,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  getMaxPhysicalFabricAllocationCount,
  type FutureFabricGarmentAssignmentOptions,
  type FutureFabricPiecePlacement,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;
const { DormantFutureFabricStep, formatChangeOneGarmentCopy } = await import(
  "./src/components/DormantFutureFabricStep"
);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
// Standard Shirt + Trouser + Long Shirt: 3 half units -> 2 fabrics needed.
const selection: GarmentTypeStepSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser", "kaftan"],
  selectedDemographics: ["male", "female"],
  normalizedCustomDetailCatalog: catalog,
}).selection;

const fabric = (suffix: string, name: string, price: number, stock = 30): Fabric => ({
  code: `CO-${suffix}`,
  name,
  description: "Test fabric",
  color: "Gold",
  colorHex: "#C5A85C",
  category: "Test",
  price,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  stock,
  image: `https://cdn.example.com/fabrics/co-${suffix}.jpg`,
});
const fabrics: Fabric[] = [
  fabric("I", "Classic Ivory Shield", 20),
  fabric("R", "Royal Forest Mosaic", 35),
  fabric("L", "Heritage Ivory Lattice", 25),
  fabric("S", "Single Stock Print", 30, 1),
];
const layout = (state: FabricAllocationState) =>
  state.fabricAllocations.map((allocation) => [
    allocation.fabricCode,
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ]);
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

// Shirt + Trouser share Classic Ivory Shield (Selection 1); Long Shirt open.
const shared = place(place(FabricAllocationStateEngine.initialize(), "base:shirt", "CO-I"), "base:trouser", "CO-I");
assert.deepEqual(layout(shared), [["CO-I", ["base:shirt", "base:trouser"]]]);
// Same, plus Long Shirt alone on Royal Forest Mosaic (Selection 2, 1/2 left).
const sharedPlusRoyal = place(shared, "base:kaftan", "CO-R");
assert.deepEqual(layout(sharedPlusRoyal), [
  ["CO-I", ["base:shirt", "base:trouser"]],
  ["CO-R", ["base:kaftan"]],
]);

// ---------------------------------------------------------------------------
// 1. Engine: detach + place.
// ---------------------------------------------------------------------------
{
  assert.equal(
    detachFutureGarmentFromSharedPiece({ state: shared, garmentKey: "base:kaftan", fabricCode: "CO-R" }),
    null,
    "unassigned garment: nothing to detach",
  );
  assert.equal(
    detachFutureGarmentFromSharedPiece({ state: shared, garmentKey: "base:shirt", fabricCode: "CO-I" }),
    null,
    "same print: nothing to detach",
  );
  assert.equal(
    detachFutureGarmentFromSharedPiece({ state: sharedPlusRoyal, garmentKey: "base:kaftan", fabricCode: "CO-L" }),
    null,
    "garment alone on its piece: re-colour, not detach",
  );
  const detached = detachFutureGarmentFromSharedPiece({ state: shared, garmentKey: "base:shirt", fabricCode: "CO-R" });
  assert.ok(detached);
  assert.deepEqual(layout(detached!), [["CO-I", ["base:trouser"]]]);

  const apply = (
    state: FabricAllocationState,
    garmentKey: string,
    fabricCode: string,
    placement: FutureFabricPiecePlacement = "auto",
  ) =>
    applyFutureFabricCardSelection({
      state,
      garmentTypeSelection: selection,
      garmentKey,
      fabricCode,
      fabrics,
      placement,
      detachFromSharedPiece: true,
    });

  // New print with no piece yet: a new piece for the Shirt only.
  assert.deepEqual(layout(apply(shared, "base:shirt", "CO-R")), [
    ["CO-I", ["base:trouser"]],
    ["CO-R", ["base:shirt"]],
  ]);
  // New print has a piece with room: pair, or a new piece.
  assert.deepEqual(layout(apply(sharedPlusRoyal, "base:shirt", "CO-R", "auto")), [
    ["CO-I", ["base:trouser"]],
    ["CO-R", ["base:kaftan", "base:shirt"]],
  ]);
  const newPiece = apply(sharedPlusRoyal, "base:shirt", "CO-R", "new_piece");
  assert.deepEqual(layout(newPiece), [
    ["CO-I", ["base:trouser"]],
    ["CO-R", ["base:kaftan"]],
    ["CO-R", ["base:shirt"]],
  ]);
  assert.ok(
    newPiece.fabricAllocations.length <=
      getMaxPhysicalFabricAllocationCount({ garmentTypeSelection: selection, fabricAllocationState: newPiece }),
    "one piece per garment still holds",
  );
  // Alone on its piece: unchanged re-colour behaviour (same piece id).
  const recoloured = apply(sharedPlusRoyal, "base:kaftan", "CO-L");
  assert.deepEqual(layout(recoloured), [
    ["CO-I", ["base:shirt", "base:trouser"]],
    ["CO-L", ["base:kaftan"]],
  ]);
  assert.equal(
    recoloured.fabricAllocations[1]!.allocationId,
    sharedPlusRoyal.fabricAllocations[1]!.allocationId,
  );
  // Stock: Single Stock Print has 1 piece in stock, already used by the
  // Long Shirt. A new piece is refused and nothing changes.
  const singleUsed = place(shared, "base:kaftan", "CO-S");
  assert.equal(apply(singleUsed, "base:shirt", "CO-S", "new_piece"), singleUsed, "stock blocks a new piece");
  assert.deepEqual(layout(apply(singleUsed, "base:shirt", "CO-S", "auto")), [
    ["CO-I", ["base:trouser"]],
    ["CO-S", ["base:kaftan", "base:shirt"]],
  ], "pairing needs no new stock");
  // Without the flag the old whole-piece behaviour is untouched.
  assert.deepEqual(
    layout(
      applyFutureFabricCardSelection({
        state: shared,
        garmentTypeSelection: selection,
        garmentKey: "base:shirt",
        fabricCode: "CO-R",
        fabrics,
      }),
    ),
    [["CO-R", ["base:shirt", "base:trouser"]]],
  );
}

// ---------------------------------------------------------------------------
// 2. Copy helper.
// ---------------------------------------------------------------------------
assert.equal(
  formatChangeOneGarmentCopy({
    garmentKey: "a",
    garmentKeys: ["a", "b"],
    garmentLabels: ["Standard Shirt", "Trouser"],
    fabricName: "Classic Ivory Shield",
  }),
  "Only Standard Shirt will change. Trouser keeps Classic Ivory Shield.",
);
assert.equal(
  formatChangeOneGarmentCopy({
    garmentKey: "b",
    garmentKeys: ["a", "b", "c"],
    garmentLabels: ["Standard Shirt", "Trouser", "Skirt"],
    fabricName: "Classic Ivory Shield",
  }),
  "Only Trouser will change. Standard Shirt and Skirt keep Classic Ivory Shield.",
);

// ---------------------------------------------------------------------------
// 3. UI harness (mirrors DesignStudioView handlers).
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
    contains: () => false,
    focus: () => undefined,
    scrollIntoView: () => undefined,
  };
};

let liveState = shared;
const groupChangeCalls: string[] = [];
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
      });
      return liveState;
    },
    onChangeFabricAllocationProduct: (
      allocationId: string,
      fabricCode: string,
      expectation?: { expectedCurrentFabricCode: string; expectedAssignmentSignature: string },
    ) => {
      groupChangeCalls.push(`${allocationId}->${fabricCode}`);
      const result = changeFutureFabricAllocationProduct({
        state: liveState,
        allocationId,
        nextFabricCode: fabricCode,
        fabrics,
        expectation,
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
const pick = async (code: string) => {
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
const changeFromCard = async (label: string) => {
  await act(async () =>
    renderer.root.findByProps({ "aria-label": `Change fabric for ${label}` }).props.onClick({ currentTarget: {} }),
  );
};
const garmentCard = (garmentKey: string) =>
  renderer.root.findByProps({ "data-garment-key": garmentKey, "data-assignment-status": "assigned" });
const helpLine = () => renderer.root.findByProps({ id: "future-fabric-catalogue-help" });
const groupConfirms = () => renderer.root.findAllByProps({ "data-change-fabric-confirm": "true" });
const placementDialogs = () =>
  renderer.root.findAll((node) => node.props?.["data-fabric-piece-placement-dialog"] === "true");
const placementButton = (flag: string) =>
  renderer.root.find((node) => node.type === "button" && node.props[flag] === "true");

// 3a. Garment card, shared piece, new print with no piece yet.
{
  await mount(shared);
  await changeFromCard("Standard Shirt");
  const help = helpLine();
  assert.equal(
    textContent(help),
    "Only Standard Shirt will change. Trouser keeps Classic Ivory Shield.",
  );
  assert.equal(help.props["data-fabric-change-garment-only"], "true");
  assert.equal(help.props["data-fabric-change-swap-free"], undefined);
  assert.doesNotMatch(textContent(renderer.root), /update both garments|This Fabric is shared by/);
  assert.equal(garmentCard("base:shirt").props["data-fabric-selection-highlight"], "changing");
  assert.equal(garmentCard("base:trouser").props["data-fabric-selection-highlight"], "dimmed");
  assert.equal(
    garmentCard("base:trouser").findAllByProps({ "data-fabric-selection-changing-tag": "true" }).length,
    0,
  );

  await pick("CO-R");
  assert.equal(groupConfirms().length, 0, "no confirm popup for the one-garment change");
  assert.equal(placementDialogs().length, 0, "no Royal piece yet, so no pair popup");
  assert.deepEqual(groupChangeCalls, [], "the shared piece is not re-coloured");
  assert.deepEqual(layout(liveState), [
    ["CO-I", ["base:trouser"]],
    ["CO-R", ["base:shirt"]],
  ]);
  assert.doesNotMatch(textContent(renderer.root), /Choose a new fabric for Selection/, "change mode ends");
  assert.equal(garmentCard("base:trouser").props["data-fabric-selection-highlight"], "idle");
  // The Trouser's piece shows its spare room.
  assert.match(textContent(garmentCard("base:trouser")), /Classic Ivory Shield/);
  assert.match(textContent(garmentCard("base:trouser")), /1\/2/);
  act(() => renderer.unmount());
}

// 3b. New print already has a piece with room: pair-or-new-piece popup.
{
  await mount(sharedPlusRoyal);
  await changeFromCard("Trouser");
  assert.equal(
    textContent(helpLine()),
    "Only Trouser will change. Standard Shirt keeps Classic Ivory Shield.",
  );
  await pick("CO-R");
  assert.equal(groupConfirms().length, 0);
  assert.equal(placementDialogs().length, 1, "pair-or-new-piece popup");
  assert.match(textContent(placementDialogs()[0]!), /Pair with Selection 2/);
  // Cancel: nothing changes, still changing the Trouser.
  await act(async () => placementButton("data-fabric-piece-placement-cancel").props.onClick());
  await rerender();
  assert.deepEqual(layout(liveState), layout(sharedPlusRoyal));
  // Pair.
  await pick("CO-R");
  await act(async () => placementButton("data-fabric-piece-placement-pair").props.onClick());
  await rerender();
  assert.deepEqual(layout(liveState), [
    ["CO-I", ["base:shirt"]],
    ["CO-R", ["base:kaftan", "base:trouser"]],
  ]);
  act(() => renderer.unmount());

  await mount(sharedPlusRoyal);
  await changeFromCard("Trouser");
  await pick("CO-R");
  await act(async () => placementButton("data-fabric-piece-placement-new-piece").props.onClick());
  await rerender();
  assert.deepEqual(layout(liveState), [
    ["CO-I", ["base:shirt"]],
    ["CO-R", ["base:kaftan"]],
    ["CO-R", ["base:trouser"]],
  ]);
  act(() => renderer.unmount());
}

// 3c. Stock: Single Stock Print's only piece holds the Long Shirt, so the
//     popup offers Pair and shows the new piece as blocked.
{
  await mount(place(shared, "base:kaftan", "CO-S"));
  await changeFromCard("Standard Shirt");
  await pick("CO-S");
  assert.equal(placementDialogs().length, 1);
  assert.equal(
    placementButton("data-fabric-piece-placement-new-piece").props.disabled,
    true,
    "no stock for another piece",
  );
  act(() => renderer.unmount());
}

// 3d. Summary chip keeps the whole-selection change with the group confirm.
{
  await mount(shared);
  await act(async () =>
    renderer.root
      .findByProps({ "data-fabric-selection-summary-button": "1" })
      .props.onClick({ currentTarget: {} }),
  );
  assert.match(textContent(helpLine()), /This Fabric is shared by Standard Shirt and Trouser\. Changing it will update both garments\./);
  assert.equal(helpLine().props["data-fabric-change-garment-only"], undefined);
  assert.equal(garmentCard("base:shirt").props["data-fabric-selection-highlight"], "changing");
  assert.equal(garmentCard("base:trouser").props["data-fabric-selection-highlight"], "changing");
  await pick("CO-R");
  assert.equal(groupConfirms().length, 1, "group confirm still shows");
  await act(async () => groupConfirms()[0]!.props.onClick());
  await rerender();
  assert.equal(groupChangeCalls.length, 1);
  assert.deepEqual(layout(liveState), [["CO-R", ["base:shirt", "base:trouser"]]]);
  act(() => renderer.unmount());
}

// 3e. Garment alone on its piece: re-colour as before, no confirm.
{
  await mount(sharedPlusRoyal);
  await changeFromCard("Long Shirt");
  assert.match(textContent(helpLine()), /Select a replacement Fabric for Fabric Selection 2\./);
  await pick("CO-L");
  assert.equal(groupConfirms().length, 0);
  assert.equal(groupChangeCalls.length, 1, "re-colours the piece");
  assert.deepEqual(layout(liveState), [
    ["CO-I", ["base:shirt", "base:trouser"]],
    ["CO-L", ["base:kaftan"]],
  ]);
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 4. Price is unchanged (fabric included in the garment price; same call
//    shape as DesignStudioView).
// ---------------------------------------------------------------------------
{
  const businessSettings = {
    pricingSettings: {
      depositPercentage: 50,
      balancePercentage: 50,
      currency: "EUR",
      vatTaxPercentage: 0,
      discountRulesEnabled: false,
      standardAccessoryCharge: 10,
    },
  } as BusinessSettings;
  const priceFor = (state: FabricAllocationState) => {
    const materialPricing = resolveFabricAllocationMaterialPricing(state.fabricAllocations, fabrics);
    assert.equal(materialPricing.status, "resolved");
    if (materialPricing.status !== "resolved") throw new Error("Expected material pricing");
    const pricing = calculateDesignPricing({
      route: "alone",
      design: {},
      materialPricing,
      catalog,
      businessSettings,
      garmentConstructionSelectionMode: "garment_type_locked",
      garmentTypeSelection: selection,
    });
    assert.ok(pricing);
    return pricing!;
  };
  const split = applyFutureFabricCardSelection({
    state: sharedPlusRoyal,
    garmentTypeSelection: selection,
    garmentKey: "base:shirt",
    fabricCode: "CO-L",
    fabrics,
    detachFromSharedPiece: true,
  });
  assert.equal(split.fabricAllocations.length, 3);
  const before = priceFor(sharedPlusRoyal);
  const after = priceFor(split);
  const differing = Object.keys(after).filter(
    (key) => JSON.stringify((after as unknown as Record<string, unknown>)[key]) !== JSON.stringify((before as unknown as Record<string, unknown>)[key]),
  );
  // Only the internal fabric bookkeeping differs (one more piece, same as any
  // extra piece since #1082); every charge is unchanged.
  assert.deepEqual(differing.sort(), [
    "additionalFabricPrice",
    "fabricAllocationCount",
    "includedFabricPrice",
    "totalFabricMaterialPrice",
  ]);
  assert.equal(after.pricingModel, "all_inclusive_garment_construction");
  assert.equal(after.fabricPrice, 0);
  assert.ok(after.garmentSubtotal > 0);
  assert.equal(after.garmentSubtotal, before.garmentSubtotal, "splitting off a garment adds no charge");
  assert.equal(after.clothingPrice, before.clothingPrice);
}

console.log("test_fabric_change_one_garment: PASS");
