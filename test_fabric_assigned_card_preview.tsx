/**
 * Assigned garment cards show a compact preview of the selected Fabric.
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
import { isUsableFabricColorHex } from "./src/components/DormantFutureFabricStep";

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

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const shirtSelection = selection(["shirt"]);
const shirtTrouserSelection = selection(["shirt", "trouser"]);

const fabricWithImage: Fabric = {
  code: "PREVIEW-A",
  name: "Imperial Sapphire Link",
  description: "Blue test fabric",
  color: "Sapphire",
  colorHex: "#1B4F72",
  category: "Test",
  price: 20,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  image: "https://cdn.example.com/fabrics/imperial-sapphire-link.jpg",
};

const fabricWithColorOnly: Fabric = {
  code: "PREVIEW-COLOR",
  name: "Heritage Ivory Lattice",
  description: "Color-only fabric",
  color: "Ivory",
  colorHex: "#F5F0E6",
  category: "Test",
  price: 18,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
};

const fabricImageAndColor: Fabric = {
  code: "PREVIEW-IMG-COLOR",
  name: "Lagoon Weave",
  description: "Image plus colour",
  color: "Lagoon",
  colorHex: "#0D5C75",
  category: "Test",
  price: 21,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  image: "https://cdn.example.com/fabrics/lagoon-weave-broken.jpg",
};

const fabricImageNoColor: Fabric = {
  code: "PREVIEW-IMG-ONLY",
  name: "Silent Stripe",
  description: "Image without usable colour",
  color: "Unknown",
  colorHex: "not-a-colour",
  category: "Test",
  price: 19,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  image: "https://cdn.example.com/fabrics/silent-stripe-broken.jpg",
};

const fabricMalformedColor: Fabric = {
  code: "PREVIEW-BAD-HEX",
  name: "Broken Swatch",
  description: "Malformed colour only",
  color: "Unknown",
  colorHex: "#12",
  category: "Test",
  price: 15,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
};

const fabricUnavailablePreview: Fabric = {
  code: "PREVIEW-EMPTY",
  name: "Unmarked Weave",
  description: "No image or color",
  color: "Unknown",
  colorHex: "",
  category: "Test",
  price: 16,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
};

const fabricAlternate: Fabric = {
  code: "PREVIEW-B",
  name: "Golden Ankara Crest",
  description: "Alternate fabric",
  color: "Gold",
  colorHex: "#B28A3B",
  category: "Test",
  price: 22,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  image: "https://cdn.example.com/fabrics/golden-ankara-crest.jpg",
};

const allFabrics = [
  fabricWithImage,
  fabricWithColorOnly,
  fabricImageAndColor,
  fabricImageNoColor,
  fabricMalformedColor,
  fabricUnavailablePreview,
  fabricAlternate,
];

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const findButton = (root: ReactTestInstance, label: string) =>
  root
    .findAllByType("button")
    .find((button) => textContent(button).includes(label));

const renderStep = (
  state: FabricAllocationState,
  garmentTypeSelection: GarmentTypeStepSelection,
  catalogueFabrics: Fabric[] = allFabrics,
  handlers: {
    onRemove?: (garmentKey: string) => void;
    onAssign?: (fabric: Fabric, garmentKey: string) => void;
  } = {},
) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection,
    fabricAllocationState: state,
    fabrics: catalogueFabrics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection,
    fabricAllocationState: state,
  });
  return createElement(DormantFutureFabricStep, {
    fabrics: catalogueFabrics,
    garmentTypeSelection,
    fabricAllocationState: state,
    completion,
    requiredFabricQuantity: planning.requiredFabricQuantity,
    selectedFabricQuantity: planning.selectedFabricQuantity,
    constructionPrice: 0,
    onAssignFabricToGarment: handlers.onAssign || (() => undefined),
    onRemoveFabricFromGarment: handlers.onRemove || (() => undefined),
    onUseSameFabricForGarment: () => undefined,
    onAssignSameFabricProduct: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
    onUseSameFabric: () => undefined,
    onChooseAnotherFabric: () => undefined,
    onCancelPendingFabric: () => undefined,
  });
};

const assign = (
  state: FabricAllocationState,
  garmentTypeSelection: GarmentTypeStepSelection,
  garmentKey: string,
  fabricCode: string,
) =>
  assignFutureFabricToGarment({
    state,
    garmentTypeSelection,
    garmentKey,
    fabricCode,
  }).state;

// ---------------------------------------------------------------------------
// A — assigned Fabric image
// ---------------------------------------------------------------------------
{
  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, shirtSelection, "base:shirt", fabricWithImage.code);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, shirtSelection));
  });
  const preview = renderer.root.findByProps({
    "data-assigned-fabric-preview": "true",
    "data-garment-key": "base:shirt",
    "data-fabric-code": fabricWithImage.code,
  });
  const img = preview.findByType("img");
  assert.equal(img.props.src, fabricWithImage.image);
  assert.match(img.props.alt, /Imperial Sapphire Link/);
  assert.match(img.props.alt, /Standard Shirt|Shirt/);
  assert.equal(img.props.loading, "lazy");
  assert.equal(img.props.decoding, "async");
  assert.match(
    String(preview.props.className),
    /sm:w-\[128px\]/,
    "Desktop preview uses a fixed right-column width",
  );
  const assignedCard = renderer.root.findByProps({
    "data-garment-key": "base:shirt",
    "data-assignment-status": "assigned",
  });
  const layoutHost = assignedCard.findAll(
    (node): node is ReactTestInstance =>
      typeof node !== "string" &&
      typeof node.props.className === "string" &&
      node.props.className.includes("sm:flex-row"),
  )[0];
  assert.ok(
    layoutHost,
    "Assigned card content uses a responsive left/right layout",
  );
}

// ---------------------------------------------------------------------------
// B — two garments share one Fabric product
// ---------------------------------------------------------------------------
{
  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, shirtTrouserSelection, "base:shirt", fabricWithImage.code);
  state = assign(
    state,
    shirtTrouserSelection,
    "base:trouser",
    fabricWithImage.code,
  );
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, shirtTrouserSelection));
  });
  const previews = renderer.root.findAllByProps({
    "data-assigned-fabric-preview": "true",
  });
  assert.equal(previews.length, 2);
  const shirtPreview = renderer.root.findByProps({
    "data-assigned-fabric-preview": "true",
    "data-garment-key": "base:shirt",
  });
  const trouserPreview = renderer.root.findByProps({
    "data-assigned-fabric-preview": "true",
    "data-garment-key": "base:trouser",
  });
  assert.equal(shirtPreview.findByType("img").props.src, fabricWithImage.image);
  assert.equal(
    trouserPreview.findByType("img").props.src,
    fabricWithImage.image,
  );
}

// ---------------------------------------------------------------------------
// C — color-swatch fallback
// ---------------------------------------------------------------------------
{
  let state = FabricAllocationStateEngine.initialize();
  state = assign(
    state,
    shirtSelection,
    "base:shirt",
    fabricWithColorOnly.code,
  );
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, shirtSelection));
  });
  const preview = renderer.root.findByProps({
    "data-assigned-fabric-preview": "true",
    "data-fabric-code": fabricWithColorOnly.code,
  });
  assert.equal(preview.props.role, "img");
  assert.match(String(preview.props["aria-label"]), /Heritage Ivory Lattice/);
  assert.match(String(preview.props["aria-label"]), /colour preview/i);
  assert.equal(preview.props.style.backgroundColor, fabricWithColorOnly.colorHex);
  assert.equal(preview.findAllByType("img").length, 0);
}

// ---------------------------------------------------------------------------
// D — no image and no usable color
// ---------------------------------------------------------------------------
{
  let state = FabricAllocationStateEngine.initialize();
  state = assign(
    state,
    shirtSelection,
    "base:shirt",
    fabricUnavailablePreview.code,
  );
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, shirtSelection));
  });
  const preview = renderer.root.findByProps({
    "data-assigned-fabric-preview": "true",
    "data-fabric-code": fabricUnavailablePreview.code,
  });
  assert.match(textContent(preview), /Fabric preview unavailable/);
  assert.equal(preview.findAllByType("img").length, 0);
}

// ---------------------------------------------------------------------------
// E — unassigned garment has no preview
// ---------------------------------------------------------------------------
{
  const state = FabricAllocationStateEngine.initialize();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, shirtSelection));
  });
  const card = renderer.root.findByProps({
    "data-garment-key": "base:shirt",
    "data-assignment-status": "unassigned",
  });
  assert.equal(
    card.findAllByProps({ "data-assigned-fabric-preview": "true" }).length,
    0,
  );
  assert.ok(findButton(card, "Add Fabric"));
  assert.match(textContent(card), /Needs fabric/i);
}

// ---------------------------------------------------------------------------
// F — change Fabric updates preview
// ---------------------------------------------------------------------------
{
  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, shirtSelection, "base:shirt", fabricWithImage.code);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, shirtSelection));
  });
  assert.equal(
    renderer.root.findByProps({ "data-assigned-fabric-preview": "true" })
      .findByType("img").props.src,
    fabricWithImage.image,
  );

  state = assign(state, shirtSelection, "base:shirt", fabricAlternate.code);
  await act(async () => {
    renderer.update(renderStep(state, shirtSelection));
  });
  const preview = renderer.root.findByProps({
    "data-assigned-fabric-preview": "true",
    "data-fabric-code": fabricAlternate.code,
  });
  assert.equal(preview.findByType("img").props.src, fabricAlternate.image);
  assert.equal(
    renderer.root.findAllByProps({
      "data-fabric-code": fabricWithImage.code,
      "data-assigned-fabric-preview": "true",
    }).length,
    0,
  );
}

// ---------------------------------------------------------------------------
// G — remove Fabric removes preview
// ---------------------------------------------------------------------------
{
  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, shirtSelection, "base:shirt", fabricWithImage.code);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, shirtSelection));
  });
  assert.equal(
    renderer.root.findAllByProps({ "data-assigned-fabric-preview": "true" })
      .length,
    1,
  );

  state = removeFutureFabricAssignment({
    state,
    garmentKey: "base:shirt",
  });
  await act(async () => {
    renderer.update(renderStep(state, shirtSelection));
  });
  const card = renderer.root.findByProps({
    "data-garment-key": "base:shirt",
    "data-assignment-status": "unassigned",
  });
  assert.equal(
    card.findAllByProps({ "data-assigned-fabric-preview": "true" }).length,
    0,
  );
  assert.match(textContent(card), /Needs fabric/i);
  assert.ok(findButton(card, "Add Fabric"));
}

// ---------------------------------------------------------------------------
// H — missing catalogue Fabric
// ---------------------------------------------------------------------------
{
  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, shirtSelection, "base:shirt", fabricWithImage.code);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      renderStep(state, shirtSelection, [fabricAlternate]),
    );
  });
  const card = renderer.root.findByProps({
    "data-garment-key": "base:shirt",
    "data-assignment-status": "assigned",
  });
  assert.match(
    textContent(card),
    /no longer in the catalogue/i,
  );
  assert.ok(findButton(card, "Change Fabric"));
  const preview = card.findByProps({
    "data-assigned-fabric-preview": "true",
    "data-fabric-code": fabricWithImage.code,
  });
  assert.match(textContent(preview), /Fabric preview unavailable/);
  assert.equal(preview.findAllByType("img").length, 0);
}

// ---------------------------------------------------------------------------
// I — controls remain enabled and preview does not intercept actions
// ---------------------------------------------------------------------------
{
  let removedKey: string | null = null;
  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, shirtSelection, "base:shirt", fabricWithImage.code);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      renderStep(state, shirtSelection, allFabrics, {
        onRemove: (garmentKey) => {
          removedKey = garmentKey;
        },
      }),
    );
  });
  const card = renderer.root.findByProps({ "data-garment-key": "base:shirt" });
  const remove = findButton(card, "Remove Fabric");
  const change = findButton(card, "Change Fabric");
  assert.ok(remove);
  assert.ok(change);
  assert.equal(Boolean(remove!.props.disabled), false);
  assert.equal(Boolean(change!.props.disabled), false);
  await act(async () => {
    remove!.props.onClick();
  });
  assert.equal(removedKey, "base:shirt");
  const preview = card.findByProps({ "data-assigned-fabric-preview": "true" });
  assert.equal(preview.props.onClick, undefined);
  assert.equal(preview.props.tabIndex, undefined);
}

// ---------------------------------------------------------------------------
// J — image load failure with valid colorHex
// ---------------------------------------------------------------------------
{
  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, shirtSelection, "base:shirt", fabricImageAndColor.code);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, shirtSelection));
  });
  const preview = renderer.root.findByProps({
    "data-assigned-fabric-preview": "true",
    "data-fabric-code": fabricImageAndColor.code,
  });
  const img = preview.findByType("img");
  await act(async () => {
    img.props.onError(new Error("load failed"));
  });
  const after = renderer.root.findByProps({
    "data-assigned-fabric-preview": "true",
    "data-fabric-code": fabricImageAndColor.code,
  });
  assert.equal(after.findAllByType("img").length, 0);
  assert.equal(after.props.role, "img");
  assert.match(String(after.props["aria-label"]), /Lagoon Weave/);
  assert.match(String(after.props["aria-label"]), /colour preview/i);
  assert.equal(after.props.style.backgroundColor, fabricImageAndColor.colorHex);
  assert.equal(
    renderer.root.findByProps({
      "data-garment-key": "base:shirt",
    }).props["data-assignment-status"],
    "assigned",
  );
  assert.ok(
    findButton(
      renderer.root.findByProps({ "data-garment-key": "base:shirt" }),
      "Change Fabric",
    ),
  );
}

// ---------------------------------------------------------------------------
// K — image load failure without valid colorHex
// ---------------------------------------------------------------------------
{
  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, shirtSelection, "base:shirt", fabricImageNoColor.code);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, shirtSelection));
  });
  const img = renderer.root
    .findByProps({
      "data-assigned-fabric-preview": "true",
      "data-fabric-code": fabricImageNoColor.code,
    })
    .findByType("img");
  await act(async () => {
    img.props.onError(new Error("load failed"));
  });
  const after = renderer.root.findByProps({
    "data-assigned-fabric-preview": "true",
    "data-fabric-code": fabricImageNoColor.code,
  });
  assert.equal(after.findAllByType("img").length, 0);
  assert.match(textContent(after), /Fabric preview unavailable/);
  assert.match(String(after.props["aria-label"]), /Fabric preview unavailable/);
}

// ---------------------------------------------------------------------------
// L — malformed colorHex
// ---------------------------------------------------------------------------
{
  assert.equal(isUsableFabricColorHex("not-a-colour"), false);
  assert.equal(isUsableFabricColorHex("#12"), false);
  assert.equal(isUsableFabricColorHex("   "), false);
  assert.equal(isUsableFabricColorHex("#fff"), true);
  assert.equal(isUsableFabricColorHex("#0D5C75"), true);
  assert.equal(isUsableFabricColorHex("#0D5C75AA"), true);

  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, shirtSelection, "base:shirt", fabricMalformedColor.code);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, shirtSelection));
  });
  const preview = renderer.root.findByProps({
    "data-assigned-fabric-preview": "true",
    "data-fabric-code": fabricMalformedColor.code,
  });
  assert.equal(preview.findAllByType("img").length, 0);
  assert.equal(preview.props.style, undefined);
  assert.match(textContent(preview), /Fabric preview unavailable/);
}

// ---------------------------------------------------------------------------
// M — image failure resets after Fabric change
// ---------------------------------------------------------------------------
{
  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, shirtSelection, "base:shirt", fabricImageAndColor.code);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, shirtSelection));
  });
  const failedImg = renderer.root
    .findByProps({
      "data-assigned-fabric-preview": "true",
      "data-fabric-code": fabricImageAndColor.code,
    })
    .findByType("img");
  await act(async () => {
    failedImg.props.onError(new Error("load failed"));
  });
  assert.equal(
    renderer.root
      .findByProps({
        "data-assigned-fabric-preview": "true",
        "data-fabric-code": fabricImageAndColor.code,
      })
      .findAllByType("img").length,
    0,
  );

  state = assign(state, shirtSelection, "base:shirt", fabricAlternate.code);
  await act(async () => {
    renderer.update(renderStep(state, shirtSelection));
  });
  const nextPreview = renderer.root.findByProps({
    "data-assigned-fabric-preview": "true",
    "data-fabric-code": fabricAlternate.code,
  });
  const nextImg = nextPreview.findByType("img");
  assert.equal(nextImg.props.src, fabricAlternate.image);
  assert.match(nextImg.props.alt, /Golden Ankara Crest/);
}

// ---------------------------------------------------------------------------
// N — type-safe image assertion (no any / no unsafe children[0].props)
// ---------------------------------------------------------------------------
{
  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, shirtSelection, "base:shirt", fabricWithImage.code);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, shirtSelection));
  });
  const previewImage: ReactTestInstance = renderer.root
    .findByProps({
      "data-assigned-fabric-preview": "true",
      "data-garment-key": "base:shirt",
    })
    .findByType("img");
  assert.equal(previewImage.props.src, fabricWithImage.image);
  assert.equal(previewImage.props.loading, "lazy");
  assert.equal(previewImage.props.decoding, "async");
  assert.match(String(previewImage.props.alt), /Imperial Sapphire Link/);
}

console.log("PASS: assigned Fabric card preview regressions");
