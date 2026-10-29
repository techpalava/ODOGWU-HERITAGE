/**
 * fabric-print-freedom (Xavier, 25 Oct): a garment may go on a DIFFERENT print
 * even when the order already has its Fabrics Needed. Example: Standard Shirt
 * + Long Shirt need 1 fabric; with the Shirt on Classic Ivory Shield (1/2
 * left), Royal Forest Mosaic stays SELECTable and the Long Shirt can take a
 * second piece.
 *
 * New limit: at most one physical Fabric piece per garment that needs fabric
 * (getMaxPhysicalFabricAllocationCount). Fabrics Needed stays the displayed
 * recommendation. Extra pieces add no charge (fabric is included in the
 * garment price).
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
  canCreatePhysicalFabricAllocation,
  formatFabricNewPieceUnavailableCopy,
  formatFabricQuantityLimitReachedCopy,
  getFutureFabricPiecePlacementChoice,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  getMaxPhysicalFabricAllocationCount,
  getRequiredPhysicalFabricAllocationCount,
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
    selectedGarmentTypes: types as Parameters<
      typeof reconcileGarmentTypeStepSelection
    >[0]["selectedGarmentTypes"],
    selectedDemographics: ["male", "female"] as Parameters<
      typeof reconcileGarmentTypeStepSelection
    >[0]["selectedDemographics"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

// Standard Shirt + Long Shirt = 2 half units -> 1 fabric needed.
const shirtLongShirt = selectionFor(["shirt", "kaftan"]);

const fabric = (suffix: string, name: string, price: number): Fabric => ({
  code: `PF-${suffix}`,
  name,
  description: "Test fabric",
  color: "Gold",
  colorHex: "#C5A85C",
  category: "Test",
  price,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  stock: 30,
  image: `https://cdn.example.com/fabrics/pf-${suffix}.jpg`,
});
const fabrics: Fabric[] = [
  fabric("I", "Classic Ivory Shield", 20),
  fabric("R", "Royal Forest Mosaic", 35),
  fabric("L", "Heritage Ivory Lattice", 25),
];
const layout = (state: FabricAllocationState) =>
  state.fabricAllocations.map((allocation) => [
    allocation.fabricCode,
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ]);
const pieceCount = (state: FabricAllocationState) =>
  state.fabricAllocations.filter((allocation) => allocation.garmentAssignments.length > 0)
    .length;

const shirtOnIvoryResult = assignFutureFabricToGarment({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: shirtLongShirt,
  garmentKey: "base:shirt",
  fabricCode: "PF-I",
  fabrics,
});
assert.equal(shirtOnIvoryResult.status, "assigned");
const shirtOnIvory = shirtOnIvoryResult.state;
assert.deepEqual(
  (({ requiredGarmentCount, requiredFabricQuantity, selectedFabricQuantity }) => [
    requiredGarmentCount,
    requiredFabricQuantity,
    selectedFabricQuantity,
  ])(getFutureGarmentFabricPlanning({ garmentTypeSelection: shirtLongShirt, fabricAllocationState: shirtOnIvory })),
  [2, 1, 1],
  "Standard Shirt + Long Shirt: 2 garments, 1 fabric needed, 1 chosen",
);

// ---------------------------------------------------------------------------
// 1. The limit definition: one piece per garment; Fabrics Needed unchanged.
// ---------------------------------------------------------------------------
assert.equal(
  getRequiredPhysicalFabricAllocationCount({
    garmentTypeSelection: shirtLongShirt,
    fabricAllocationState: shirtOnIvory,
  }),
  1,
);
assert.equal(
  getMaxPhysicalFabricAllocationCount({
    garmentTypeSelection: shirtLongShirt,
    fabricAllocationState: shirtOnIvory,
  }),
  2,
);
assert.equal(
  canCreatePhysicalFabricAllocation({ state: shirtOnIvory, garmentTypeSelection: shirtLongShirt }),
  true,
  "at the needed count a new piece is still allowed",
);

// ---------------------------------------------------------------------------
// 2. UI: at the needed count other prints stay SELECTable; picking Royal
//    Forest Mosaic for the Long Shirt creates a second piece; Continue unlocks.
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

let liveState = shirtOnIvory;
let liveSelection = shirtLongShirt;
let continued = 0;
const renderStep = () => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: liveSelection,
    fabricAllocationState: liveState,
    fabrics,
  });
  const live = getFutureGarmentFabricPlanning({
    garmentTypeSelection: liveSelection,
    fabricAllocationState: liveState,
  });
  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection: liveSelection,
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
        garmentTypeSelection: liveSelection,
        garmentKey,
        fabricCode: picked.code,
        fabrics,
        placement,
      });
      return liveState;
    },
    onChangeFabricAllocationProduct: () => undefined,
    onRemoveFabricFromGarment: () => undefined,
    onUseSameFabricForGarment: () => undefined,
    onAssignSameFabricProduct: (
      fabricCode: string,
      garmentKeys: string[],
      placement?: FutureFabricPiecePlacement,
    ) => {
      const result = assignSameFabricProductToGarments({
        state: liveState,
        garmentTypeSelection: liveSelection,
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
        garmentTypeSelection: liveSelection,
        garmentKey,
        allocationId,
      });
      if (result.status === "assigned") liveState = result.state;
      return result;
    },
    onBack: () => undefined,
    onContinue: () => {
      continued += 1;
    },
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
const helpLine = (root: ReactTestInstance) =>
  root.findByProps({ id: "future-fabric-catalogue-help" });
const forwardButtons = (root: ReactTestInstance) =>
  root.findAll((node) => node.type === "button" && node.props["data-studio-nav"] === "forward");

let renderer!: ReturnType<typeof create>;
const mount = async (state: FabricAllocationState, selection = shirtLongShirt) => {
  liveState = state;
  liveSelection = selection;
  await act(async () => {
    renderer = create(renderStep(), { createNodeMock });
  });
};
const rerender = async () => {
  await act(async () => renderer.update(renderStep()));
};
const confirmGroupingFor = async (garmentKey: string) => {
  // Step 1 catalogue SELECT opens the grouping panel; tick and confirm.
  await act(async () => {
    renderer.root
      .findByProps({ "data-step1-fabric-assignment-checkbox": garmentKey })
      .props.onChange({ currentTarget: { checked: true } });
  });
  await act(async () =>
    renderer.root.findByProps({ "data-testid": "step1-fabric-assignment-confirm" }).props.onClick(),
  );
  await rerender();
};

await mount(shirtOnIvory);
{
  const help = helpLine(renderer.root);
  assert.equal(help.props["data-fabric-quantity-limit-message"], "true");
  assert.equal(
    textContent(help),
    "You have the 1 fabric needed for this order. You can use a selected fabric again for the remaining garments, or pick a different print.",
  );
  assert.equal(formatFabricQuantityLimitReachedCopy(1), textContent(help));
  assert.doesNotMatch(textContent(renderer.root), /Use one of your selected fabrics/);
  const royal = catalogueCard(renderer.root, "PF-R");
  assert.equal(actionButton(royal).props.disabled, false, "Royal Forest Mosaic SELECT is enabled");
  assert.equal(actionButton(royal).props["data-fabric-action"], "select");
  const lattice = catalogueCard(renderer.root, "PF-L");
  assert.equal(actionButton(lattice).props.disabled, false, "every other print stays enabled");
  assert.equal(forwardButtons(renderer.root).length, 0, "Continue is locked until the Long Shirt has fabric");

  await act(async () => actionButton(royal).props.onClick({ currentTarget: {} }));
  await confirmGroupingFor("base:kaftan");
  assert.deepEqual(layout(liveState), [
    ["PF-I", ["base:shirt"]],
    ["PF-R", ["base:kaftan"]],
  ]);
  assert.equal(pieceCount(liveState), 2, "the Long Shirt got a second piece");
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: shirtLongShirt,
    fabricAllocationState: liveState,
    fabrics,
  });
  assert.equal(completion.isComplete, true);
  assert.deepEqual(completion.blockers, []);
  // Continue still unlocks (2 pieces > 1 needed is not over-allocated).
  assert.equal(
    renderer.root.findAll(
      (node) => typeof node.type === "string" && node.props["data-fabric-quantity-over-allocated"] === "true",
    ).length,
    0,
  );
  const forward = forwardButtons(renderer.root);
  assert.ok(forward.length > 0, "Continue is available");
  assert.notEqual(forward[0]!.props.disabled, true);
  await act(async () => forward[0]!.props.onClick?.({ currentTarget: {} }));
  assert.equal(continued, 1);
  // Counter: complete state replaces "Fabrics chosen: X of Y needed".
  const progress = renderer.root.findByProps({ "data-fabric-progress": "true" });
  assert.equal(progress.props["data-fabric-progress-state"], "complete");
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 3. Engine: a new piece is still possible at the needed count (same print);
//    the UI now pairs automatically.
// ---------------------------------------------------------------------------
{
  const choice = getFutureFabricPiecePlacementChoice({
    state: shirtOnIvory,
    garmentTypeSelection: shirtLongShirt,
    fabricCode: "PF-I",
    garmentKeys: ["base:kaftan"],
    fabrics,
  });
  assert.ok(choice);
  assert.equal(choice!.pairSelectionNumber, 1);
  assert.equal(choice!.newPieceAvailable, true);
  assert.equal(choice!.newPieceBlockedReason, null);

  await mount(shirtOnIvory);
  await act(async () =>
    actionButton(catalogueCard(renderer.root, "PF-I")).props.onClick({ currentTarget: {} }),
  );
  await rerender();
  // fabric-auto-pair: no Pair or use a new piece? popup; the Long Shirt
  // pairs onto the Shirt's piece automatically.
  assert.equal(placementDialogs(renderer.root).length, 0, "no pair-or-new-piece popup");
  assert.deepEqual(layout(liveState), [["PF-I", ["base:shirt", "base:kaftan"]]]);
  assert.equal(
    getFutureFabricStageCompletion({ garmentTypeSelection: shirtLongShirt, fabricAllocationState: liveState, fabrics })
      .isComplete,
    true,
  );
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 4. The one-piece-per-garment limit blocks a piece beyond the garment count.
//    Every piece holds a garment, so normal flows cannot pass the limit; a
//    saved state with a leftover piece (garment no longer in the order) can.
// ---------------------------------------------------------------------------
{
  const three = selectionFor(["shirt", "trouser", "skirt"]);
  const record = (garmentKey: string, garmentType: "shirt" | "trouser" | "skirt" | "kaftan") => ({
    code: garmentKey.toUpperCase(),
    garmentKey,
    garmentType,
    fabricUnits: 1 as const,
    sourceRole: "main" as const,
  });
  const atLimit: FabricAllocationState = {
    fabricAllocations: [
      { allocationId: "p1", fabricCode: "PF-I", garmentAssignments: [record("base:shirt", "shirt")] },
      { allocationId: "p2", fabricCode: "PF-R", garmentAssignments: [record("base:trouser", "trouser")] },
      { allocationId: "p3", fabricCode: "PF-L", garmentAssignments: [record("base:kaftan", "kaftan")] },
    ],
    activeAllocationId: "p3",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  assert.equal(getMaxPhysicalFabricAllocationCount({ garmentTypeSelection: three, fabricAllocationState: atLimit }), 3);
  assert.equal(canCreatePhysicalFabricAllocation({ state: atLimit, garmentTypeSelection: three }), false);
  const beyond = assignFutureFabricToGarment({
    state: atLimit,
    garmentTypeSelection: three,
    garmentKey: "base:skirt",
    fabricCode: "PF-R",
    fabrics,
    placement: "new_piece",
  });
  assert.equal(beyond.status, "blocked");
  assert.equal(beyond.status === "blocked" ? beyond.reason : null, "FABRIC_QUANTITY_LIMIT_REACHED");
  assert.equal(beyond.state, atLimit, "nothing changes");
  const blockedChoice = getFutureFabricPiecePlacementChoice({
    state: atLimit,
    garmentTypeSelection: three,
    fabricCode: "PF-I",
    garmentKeys: ["base:skirt"],
    fabrics,
  });
  assert.ok(blockedChoice);
  assert.equal(blockedChoice!.newPieceAvailable, false);
  assert.equal(blockedChoice!.newPieceBlockedReason, "FABRIC_QUANTITY_LIMIT_REACHED");
  assert.equal(
    formatFabricNewPieceUnavailableCopy({
      reason: blockedChoice!.newPieceBlockedReason,
      maxFabricPieces: 3,
      pairSelectionNumber: blockedChoice!.pairSelectionNumber,
    }),
    "A new piece isn't available: each garment can use at most one fabric piece, and your 3 garments already have 3 pieces. Pair with Selection 1, or change a selection's fabric.",
  );
  // Pairing is still allowed at the limit.
  const paired = assignFutureFabricToGarment({
    state: atLimit,
    garmentTypeSelection: three,
    garmentKey: "base:skirt",
    fabricCode: "PF-I",
    fabrics,
  });
  assert.equal(paired.status, "assigned");
  assert.equal(pieceCount(paired.state), 3);
  // More pieces than garments blocks Continue (over-allocated).
  const fourPieces: FabricAllocationState = {
    ...atLimit,
    fabricAllocations: [
      ...atLimit.fabricAllocations,
      { allocationId: "p4", fabricCode: "PF-I", garmentAssignments: [record("base:skirt", "skirt")] },
    ],
  };
  const over = getFutureFabricStageCompletion({ garmentTypeSelection: three, fabricAllocationState: fourPieces, fabrics });
  assert.equal(over.isComplete, false);
  assert.ok(over.blockers.some((blocker) => blocker.code === "FABRIC_QUANTITY_OVER_ALLOCATED"));
}

// ---------------------------------------------------------------------------
// 5. Price is unchanged with an extra piece (fabric is included in the
//    garment price; same call shape as DesignStudioView).
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
      garmentTypeSelection: shirtLongShirt,
    });
    assert.ok(pricing);
    return pricing!;
  };
  const pairedState = assignFutureFabricToGarment({
    state: shirtOnIvory,
    garmentTypeSelection: shirtLongShirt,
    garmentKey: "base:kaftan",
    fabricCode: "PF-I",
    fabrics,
  }).state;
  const splitState = assignFutureFabricToGarment({
    state: shirtOnIvory,
    garmentTypeSelection: shirtLongShirt,
    garmentKey: "base:kaftan",
    fabricCode: "PF-R",
    fabrics,
  }).state;
  assert.equal(pieceCount(pairedState), 1);
  assert.equal(pieceCount(splitState), 2);
  const pairedPrice = priceFor(pairedState);
  const splitPrice = priceFor(splitState);
  assert.equal(splitPrice.pricingModel, "all_inclusive_garment_construction");
  assert.equal(splitPrice.fabricPrice, 0);
  assert.equal(pairedPrice.fabricPrice, 0);
  assert.ok(splitPrice.garmentSubtotal > 0);
  assert.equal(splitPrice.garmentSubtotal, pairedPrice.garmentSubtotal, "an extra piece adds no charge");
  assert.equal(splitPrice.clothingPrice, pairedPrice.clothingPrice);
}

// ---------------------------------------------------------------------------
// 6. "Add to this fabric?" popup (Mockup A, was "Complete Fabric Assignment"):
//    reached from the Long Shirt's Assign to Fabric button at the needed count.
// ---------------------------------------------------------------------------
{
  const partialDialogs = (root: ReactTestInstance) =>
    root.findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props["data-testid"] === "partial-fabric-capacity-assignment-dialog",
    );
  const openPopup = async () => {
    await mount(shirtOnIvory);
    const assignButton = renderer.root.findByProps({ "data-testid": "assign-to-fabric-base:kaftan" });
    await act(async () => assignButton.props.onClick());
    await rerender();
    const [popup] = partialDialogs(renderer.root);
    assert.ok(popup, "Add to this fabric? opens from Assign to Fabric");
    return popup!;
  };

  // New copy, no Cancel button, X kept.
  let popup = await openPopup();
  const popupText = textContent(popup);
  assert.equal(textContent(popup.findByType("h2")), "Add to this fabric?");
  assert.match(popupText, /Long Shirt fits on your Classic Ivory Shield piece\./);
  assert.match(popupText, /On it: Standard Shirt(?!s)/);
  assert.match(popupText, /Adding: Long Shirt/);
  assert.equal(
    textContent(popup.findByProps({ "data-partial-capacity-progress": "true" })),
    "Capacity: 1/2 → 2/2",
  );
  assert.doesNotMatch(popupText, /Complete Fabric Assignment|Currently assigned:|Add Long Shirt to an existing/);
  assert.equal(popup.findAllByProps({ "data-testid": "partial-fabric-capacity-cancel" }).length, 0);
  assert.equal(
    popup.findAll((node) => node.type === "button" && textContent(node).trim() === "Cancel").length,
    0,
    "no Cancel button",
  );
  const useDifferent = popup.find(
    (node) => node.type === "button" && node.props["data-fabric-complete-assignment-use-different"] === "true",
  );
  assert.equal(textContent(useDifferent), "Use different fabric");
  assert.match(String(useDifferent.props.className), /border/);
  const addButton = popup.findByProps({ "data-testid": "partial-fabric-capacity-confirm" });
  assert.equal(textContent(addButton), "Add to this fabric");
  assert.match(String(addButton.props.className), /bg-heritage-green/);
  assert.ok(popup.findByProps({ "aria-label": "Close fabric assignment" }));

  // Add to this fabric assigns (same as the old ASSIGN).
  await act(async () => addButton.props.onClick());
  await rerender();
  assert.deepEqual(layout(liveState), [["PF-I", ["base:shirt", "base:kaftan"]]]);
  assert.equal(partialDialogs(renderer.root).length, 0);
  act(() => renderer.unmount());

  // X closes without assigning.
  popup = await openPopup();
  await act(async () => popup.findByProps({ "aria-label": "Close fabric assignment" }).props.onClick());
  await rerender();
  assert.equal(partialDialogs(renderer.root).length, 0);
  assert.deepEqual(layout(liveState), layout(shirtOnIvory), "X assigns nothing");
  act(() => renderer.unmount());

  // Use different fabric: assigns nothing, opens the catalogue targeted at the
  // Long Shirt (same as its Add Fabric button), other prints SELECTable.
  popup = await openPopup();
  await act(async () =>
    popup
      .find((node) => node.type === "button" && node.props["data-fabric-complete-assignment-use-different"] === "true")
      .props.onClick(),
  );
  await rerender();
  assert.equal(partialDialogs(renderer.root).length, 0, "popup closes");
  assert.deepEqual(layout(liveState), layout(shirtOnIvory), "Use different fabric assigns nothing");
  assert.equal(
    renderer.root.findAll((node) => node.type === "button" && textContent(node).trim() === "Cancel").length,
    1,
    "the targeted catalogue shows its Cancel (target set to the Long Shirt)",
  );
  const royal = catalogueCard(renderer.root, "PF-R");
  assert.equal(actionButton(royal).props.disabled, false, "other prints stay SELECTable");
  await act(async () => actionButton(royal).props.onClick({ currentTarget: {} }));
  await rerender();
  // Step 1 garment: SELECT opens the grouping panel listing the Long Shirt.
  const rows = renderer.root.findAll(
    (node) => node.type === "input" && node.props["data-step1-fabric-assignment-checkbox"] !== undefined,
  );
  assert.deepEqual(rows.map((row) => row.props["data-step1-fabric-assignment-checkbox"]), ["base:kaftan"]);
  await confirmGroupingFor("base:kaftan");
  assert.deepEqual(layout(liveState), [
    ["PF-I", ["base:shirt"]],
    ["PF-R", ["base:kaftan"]],
  ]);
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 7. Multi-selection "Add to a fabric?" popup: Shirt on Ivory, Trouser on
//    Royal Forest Mosaic, Long Shirt fits on either piece.
// ---------------------------------------------------------------------------
{
  const shirtTrouserLong = selectionFor(["shirt", "trouser", "kaftan"]);
  let twoHalves = assignFutureFabricToGarment({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: shirtTrouserLong,
    garmentKey: "base:shirt",
    fabricCode: "PF-I",
    fabrics,
  }).state;
  twoHalves = assignFutureFabricToGarment({
    state: twoHalves,
    garmentTypeSelection: shirtTrouserLong,
    garmentKey: "base:trouser",
    fabricCode: "PF-R",
    fabrics,
  }).state;
  assert.deepEqual(layout(twoHalves), [
    ["PF-I", ["base:shirt"]],
    ["PF-R", ["base:trouser"]],
  ]);
  const ivoryId = twoHalves.fabricAllocations[0]!.allocationId;
  const royalId = twoHalves.fabricAllocations[1]!.allocationId;
  const partialDialogs = (root: ReactTestInstance) =>
    root.findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props["data-testid"] === "partial-fabric-capacity-assignment-dialog",
    );
  const openMulti = async () => {
    await mount(twoHalves, shirtTrouserLong);
    await act(async () =>
      renderer.root.findByProps({ "data-testid": "assign-to-fabric-base:kaftan" }).props.onClick(),
    );
    await rerender();
    const [popup] = partialDialogs(renderer.root);
    assert.ok(popup, "the multi-selection popup opens");
    return popup!;
  };

  // Copy, cards kept, no Cancel.
  let popup = await openMulti();
  const popupText = textContent(popup);
  assert.equal(textContent(popup.findByType("h2")), "Add to a fabric?");
  assert.match(popupText, /Long Shirt fits on any of these pieces\./);
  assert.doesNotMatch(popupText, /Assign Long Shirt to a Selected Fabric|Choose which selected Fabric/);
  assert.equal(popup.findAllByProps({ "data-partial-allocation-id": ivoryId }).length, 1);
  assert.equal(popup.findAllByProps({ "data-partial-allocation-id": royalId }).length, 1);
  assert.match(popupText, /Currently: Standard Shirt/);
  assert.match(popupText, /Currently: Trouser/);
  assert.deepEqual(
    popup.findAllByProps({ "data-partial-capacity-progress": "true" }).map(textContent),
    ["Capacity: 1/2 → 2/2", "Capacity: 1/2 → 2/2"],
  );
  assert.equal(popup.findAllByProps({ "data-testid": "partial-fabric-capacity-cancel" }).length, 0);
  assert.equal(
    popup.findAll((node) => node.type === "button" && textContent(node).trim() === "Cancel").length,
    0,
    "no Cancel button",
  );
  const useDifferent = popup.find(
    (node) =>
      node.type === "button" &&
      node.props["data-fabric-complete-assignment-use-different"] === "true" &&
      node.props["data-fabric-multi-assignment-use-different"] === "true",
  );
  assert.equal(textContent(useDifferent), "Use different fabric");
  assert.match(String(useDifferent.props.className), /border/);
  assert.ok(popup.findByProps({ "aria-label": "Close fabric assignment" }));

  // Select still assigns to that selection.
  await act(async () =>
    popup.findByProps({ "data-testid": `partial-fabric-capacity-select-${royalId}` }).props.onClick(),
  );
  await rerender();
  assert.deepEqual(layout(liveState), [
    ["PF-I", ["base:shirt"]],
    ["PF-R", ["base:trouser", "base:kaftan"]],
  ]);
  assert.equal(partialDialogs(renderer.root).length, 0);
  act(() => renderer.unmount());

  // X assigns nothing.
  popup = await openMulti();
  await act(async () => popup.findByProps({ "aria-label": "Close fabric assignment" }).props.onClick());
  await rerender();
  assert.equal(partialDialogs(renderer.root).length, 0);
  assert.deepEqual(layout(liveState), layout(twoHalves), "X assigns nothing");
  act(() => renderer.unmount());

  // Use different fabric: assigns nothing, catalogue targeted at the Long Shirt.
  popup = await openMulti();
  await act(async () =>
    popup
      .find((node) => node.type === "button" && node.props["data-fabric-multi-assignment-use-different"] === "true")
      .props.onClick(),
  );
  await rerender();
  assert.equal(partialDialogs(renderer.root).length, 0, "popup closes");
  assert.deepEqual(layout(liveState), layout(twoHalves), "Use different fabric assigns nothing");
  assert.equal(
    renderer.root.findAll((node) => node.type === "button" && textContent(node).trim() === "Cancel").length,
    1,
    "the targeted catalogue shows its Cancel (target set to the Long Shirt)",
  );
  const lattice = catalogueCard(renderer.root, "PF-L");
  assert.equal(actionButton(lattice).props.disabled, false, "other prints stay SELECTable");
  await act(async () => actionButton(lattice).props.onClick({ currentTarget: {} }));
  await rerender();
  const rows = renderer.root.findAll(
    (node) => node.type === "input" && node.props["data-step1-fabric-assignment-checkbox"] !== undefined,
  );
  assert.deepEqual(rows.map((row) => row.props["data-step1-fabric-assignment-checkbox"]), ["base:kaftan"]);
  await confirmGroupingFor("base:kaftan");
  assert.deepEqual(layout(liveState), [
    ["PF-I", ["base:shirt"]],
    ["PF-R", ["base:trouser"]],
    ["PF-L", ["base:kaftan"]],
  ]);
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 8. Counter wording: "Fabrics chosen: X of Y needed" while X <= Y;
//    "Fabrics chosen: X (Y needed)" once chosen pieces exceed the need.
// ---------------------------------------------------------------------------
{
  const fourGarments = selectionFor(["shirt", "trouser", "kaftan", "standard_shorts"]);
  const counter = () =>
    renderer.root.find(
      (node) => typeof node.type === "string" && node.props["data-fabric-selection-progress"] === "true",
    );
  const place = (state: FabricAllocationState, garmentKey: string, fabricCode: string) => {
    const result = assignFutureFabricToGarment({
      state,
      garmentTypeSelection: fourGarments,
      garmentKey,
      fabricCode,
      fabrics,
    });
    assert.equal(result.status, "assigned", `${garmentKey} -> ${fabricCode}`);
    return result.state;
  };
  const planned = (state: FabricAllocationState) =>
    (({ requiredFabricQuantity, selectedFabricQuantity }) => [
      requiredFabricQuantity,
      selectedFabricQuantity,
    ])(getFutureGarmentFabricPlanning({ garmentTypeSelection: fourGarments, fabricAllocationState: state }));

  // Under: 1 of 2.
  const one = place(FabricAllocationStateEngine.initialize(), "base:shirt", "PF-I");
  assert.deepEqual(planned(one), [2, 1]);
  await mount(one, fourGarments);
  assert.equal(textContent(counter()), "Fabrics chosen: 1 of 2 needed");
  assert.equal(counter().props["data-fabric-chosen-over-needed"], undefined);
  act(() => renderer.unmount());

  // Equal: 2 of 2 (one garment still unassigned).
  const two = place(one, "base:trouser", "PF-R");
  assert.deepEqual(planned(two), [2, 2]);
  await mount(two, fourGarments);
  assert.equal(textContent(counter()), "Fabrics chosen: 2 of 2 needed");
  assert.equal(counter().props["data-fabric-chosen-over-needed"], undefined);
  act(() => renderer.unmount());

  // Over: 3 pieces, 2 needed, Shorts still unassigned.
  const three = place(two, "base:kaftan", "PF-L");
  assert.deepEqual(planned(three), [2, 3]);
  await mount(three, fourGarments);
  assert.equal(textContent(counter()), "Fabrics chosen: 3 (2 needed)");
  assert.equal(counter().props["data-fabric-chosen-over-needed"], "true");
  assert.doesNotMatch(textContent(renderer.root), /3 of 2 needed/);
  act(() => renderer.unmount());
}

console.log("test_fabric_print_freedom: PASS");
