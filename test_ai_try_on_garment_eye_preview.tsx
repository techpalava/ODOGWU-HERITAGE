/**
 * AI Try-on garment-card eye preview: larger garment photo + optional selected
 * fabric swatch without changing garment selection.
 * No network, Firestore, or Storage calls.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { AiTryOnPhotoPanel } from "./src/components/AiTryOnPhotoPanel";
import { createAiTryOnBackgroundJobs } from "./src/services/aiTryOnBackgroundJobs";
import type { AiTryOnWearerTarget } from "./src/utils/aiTryOnWearerTargets";
import type { AiTryOnPhotoPanelProps } from "./src/components/AiTryOnPhotoPanel";
import type { AiTryOnOrderDetails } from "./src/utils/aiTryOnOrderDetails";
import type { AiTryOnFitHint } from "./src/utils/aiTryOnFitHints";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const keyListeners = new Set<(event: { key: string; shiftKey?: boolean; preventDefault: () => void }) => void>();
let activeElement: { focus?: () => void; label?: string } | null = null;
Object.assign(globalThis, {
  document: {
    addEventListener: (
      type: string,
      listener: (event: { key: string; shiftKey?: boolean; preventDefault: () => void }) => void,
    ) => {
      if (type === "keydown") keyListeners.add(listener);
    },
    removeEventListener: (
      type: string,
      listener: (event: { key: string; shiftKey?: boolean; preventDefault: () => void }) => void,
    ) => {
      if (type === "keydown") keyListeners.delete(listener);
    },
    get activeElement() {
      return activeElement;
    },
  },
});

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

const baseTarget: AiTryOnWearerTarget = {
  uploadedDesign: undefined,
  previewKind: undefined,
  wearerId: "w-1",
  label: "Me",
  inputFingerprint: null,
  mode: "garment",
  garmentImageUrl: null,
  fabricSwatchImageUrl: null,
  previewableGarments: [
    {
      garmentKey: "base:shirt",
      label: "Shirt",
      garmentImageUrl: "https://example.com/shirt.jpg",
      fabricSwatchImageUrl: "https://example.com/swatches/burgundy.jpg",
      fabricColorHex: "#5C1A1B",
      garmentType: undefined,
      sourceKind: undefined,
      uploadedDesign: undefined,
      styleShowsWearer: undefined,
      styleGender: null,
      orderDetails: {
        garments: [],
        fabric: {
          colour: "Burgundy",
          colourHex: "#5C1A1B",
          category: "Senator",
        },
      },
      inputFingerprint: null,
    },
    {
      garmentKey: "base:trouser",
      label: "Trouser",
      garmentImageUrl: "https://example.com/trouser.jpg",
      fabricSwatchImageUrl: null,
      fabricColorHex: "#1E3A5F",
      garmentType: undefined,
      sourceKind: undefined,
      uploadedDesign: undefined,
      styleShowsWearer: undefined,
      styleGender: null,
      orderDetails: {
        garments: [],
        fabric: {
          colour: "Navy",
          colourHex: "#1E3A5F",
        },
      },
      inputFingerprint: null,
    },
  ],
  fitHints: [] as readonly AiTryOnFitHint[],
  orderDetails: null as AiTryOnOrderDetails | null,
  legacyWearerSlot: undefined,
  outfitPairs: undefined,
};

const target = (overrides: Partial<AiTryOnWearerTarget> = {}): AiTryOnWearerTarget => ({
  ...baseTarget,
  ...overrides,
});

const panelProps = (overrides: Partial<AiTryOnPhotoPanelProps> = {}): AiTryOnPhotoPanelProps => ({
  targets: [target()],
  triesPerOrder: 5,
  initialTriesRemaining: 5,
  onPreviewCreated: () => undefined,
  onUnavailable: () => undefined,
  credentials: { getIdToken: async () => null, sessionToken: "test" },
  jobStore: createAiTryOnBackgroundJobs({ storage: null }),
  ...overrides,
});

let renderer: ReturnType<typeof create> | null = null;

const renderPanel = async (props: Partial<AiTryOnPhotoPanelProps> = {}) => {
  if (renderer) {
    await act(async () => {
      renderer?.unmount();
    });
  }
  await act(async () => {
    renderer = create(createElement(AiTryOnPhotoPanel, panelProps(props)));
  });
};

const getDialogs = () => renderer!.root.findAllByProps({ "data-catalogue-photo-preview": "true" });

const closeDialog = async () => {
  const closeBtn = renderer!.root.findByProps({ "data-catalogue-photo-preview-close": "true" });
  await act(async () => {
    closeBtn.props.onClick();
  });
};

// ============================================================================
// Test 1: Multi-garment picker renders an <Eye /> button per garment and
// clicking an unselected garment's eye button opens the dialog without
// changing the active garment selection.
// ============================================================================
await renderPanel();

const garmentPicker = renderer!.root.findAllByProps({ "data-ai-try-on-garment-picker": true });
assert.equal(garmentPicker.length, 1, "garment picker exists");

const getGarmentButtons = () =>
  renderer!.root.findAll((node) => {
    const props = node.props as { "data-ai-try-on-garment"?: string };
    return typeof props["data-ai-try-on-garment"] === "string";
  });

const garmentButtons = getGarmentButtons();
assert.equal(garmentButtons.length, 2, "two garment buttons rendered");
assert.equal(garmentButtons[0]!.props["aria-checked"], true, "first garment starts selected");
assert.equal(garmentButtons[1]!.props["aria-checked"], false, "second garment starts unselected");

const eyeButtons = renderer!.root.findAll((node) => {
  const props = node.props as { "aria-label"?: string };
  return typeof props["aria-label"] === "string" && props["aria-label"]?.startsWith("View larger photo");
});
assert.equal(eyeButtons.length, 2, "two eye buttons rendered");

eyeButtons.forEach((btn, i) => {
  const expectedLabels = ["View larger photo of Shirt", "View larger photo of Trouser"];
  assert.equal(btn.props["aria-label"], expectedLabels[i], `eye button ${i} has correct aria-label`);
  assert.equal(btn.props.type, "button", "eye button is a button element");
  assert.ok(String(btn.props.className).includes("rounded-full"), "eye button has rounded style");
});

garmentButtons.forEach((btn) => {
  assert.equal(btn.props.role, "radio", "garment button has radio role");
  assert.equal(btn.props["data-ai-try-on-design-choice"], "garment");
});

// Click the UNSELECTED second garment's eye button (Trouser - colorHex only swatch)
let stoppedPropagation = false;
await act(async () => {
  eyeButtons[1]!.props.onClick({
    stopPropagation() {
      stoppedPropagation = true;
    },
  });
});
assert.equal(stoppedPropagation, true, "eye button click stops propagation");

// Selection must remain on Shirt (first garment)
const garmentButtonsAfter = getGarmentButtons();
assert.equal(garmentButtonsAfter[0]!.props["aria-checked"], true, "first garment remains selected");
assert.equal(garmentButtonsAfter[1]!.props["aria-checked"], false, "unselected garment stays unselected");

// Dialog opens with Trouser photo + colorHex fabric swatch
assert.equal(getDialogs().length, 1, "dialog opens for unselected garment");
{
  const dialog = getDialogs()[0]!;
  const mainImg = dialog.findByProps({ "data-catalogue-photo-preview-image": "true" });
  assert.equal(mainImg.props.src, "https://example.com/trouser.jpg", "dialog displays Trouser photo");
  assert.equal(mainImg.props.alt, "Design reference for Trouser");

  const swatchContainer = dialog.findAllByProps({ "data-catalogue-photo-preview-fabric-swatch": "true" });
  assert.equal(swatchContainer.length, 1, "fabric swatch badge renders for colorHex-only fabric");

  const swatchColor = dialog.findByProps({ "data-catalogue-photo-preview-fabric-swatch-color": "true" });
  assert.equal(swatchColor.props.role, "img");
  assert.equal(swatchColor.props["aria-label"], "Selected fabric colour: Navy");
  assert.equal(swatchColor.props.style.backgroundColor, "#1E3A5F");

  const swatchLabel = dialog.findByProps({ "data-catalogue-photo-preview-fabric-swatch-label": "true" });
  assert.equal(textContent(swatchLabel), "Navy");
}

await closeDialog();
assert.equal(getDialogs().length, 0, "dialog closes cleanly");

// Open first garment's eye button (Shirt - image swatch + colorHex fallback + colour/category label)
await act(async () => {
  eyeButtons[0]!.props.onClick({
    stopPropagation() {},
  });
});
assert.equal(getDialogs().length, 1, "dialog opens for first garment");
{
  const dialog = getDialogs()[0]!;
  const mainImg = dialog.findByProps({ "data-catalogue-photo-preview-image": "true" });
  assert.equal(mainImg.props.src, "https://example.com/shirt.jpg");

  const swatchImg = dialog.findByProps({ "data-catalogue-photo-preview-fabric-swatch-image": "true" });
  assert.equal(swatchImg.props.src, "https://example.com/swatches/burgundy.jpg");
  assert.equal(swatchImg.props.alt, "Selected fabric swatch: Burgundy · Senator");

  const swatchLabel = dialog.findByProps({ "data-catalogue-photo-preview-fabric-swatch-label": "true" });
  assert.equal(textContent(swatchLabel), "Burgundy · Senator");

  // Simulate swatch image load failure -> graceful fallback to colorHex swatch
  await act(async () => {
    swatchImg.props.onError();
  });

  const dialogAfterError = getDialogs()[0]!;
  assert.equal(
    dialogAfterError.findAllByProps({ "data-catalogue-photo-preview-fabric-swatch-image": "true" }).length,
    0,
    "failed swatch image is replaced",
  );
  const fallbackColor = dialogAfterError.findByProps({
    "data-catalogue-photo-preview-fabric-swatch-color": "true",
  });
  assert.equal(fallbackColor.props.style.backgroundColor, "#5C1A1B");
  assert.equal(fallbackColor.props["aria-label"], "Selected fabric colour: Burgundy · Senator");
}
await closeDialog();

console.log("PASS: AI Try-on multi-garment eye preview & fabric swatch tests");

// ============================================================================
// Test 2: Single-garment banner renders its <Eye /> button and opens
// CataloguePhotoPreviewDialog with fabric swatch when present.
// ============================================================================
await renderPanel({
  targets: [
    target({
      previewableGarments: [
        {
          garmentKey: "base:single-shirt",
          label: "Single Shirt",
          garmentImageUrl: "https://example.com/single-shirt.jpg",
          fabricSwatchImageUrl: "https://example.com/swatches/emerald.jpg",
          fabricColorHex: "#0B4F3A",
          garmentType: undefined,
          sourceKind: undefined,
          uploadedDesign: undefined,
          styleShowsWearer: undefined,
          styleGender: null,
          orderDetails: {
            garments: [],
            fabric: {
              colour: "Emerald",
              colourHex: "#0B4F3A",
            },
          },
          inputFingerprint: null,
        },
      ],
    }),
  ],
});

const singleDesignRefs = renderer!.root.findAllByProps({ "data-ai-try-on-design-reference": "base:single-shirt" });
assert.equal(singleDesignRefs.length, 1, "single garment design reference banner exists");

const singleEyeButtons = renderer!.root.findAll((node) => {
  const props = node.props as { "aria-label"?: string };
  return typeof props["aria-label"] === "string" && props["aria-label"]?.startsWith("View larger photo");
});
assert.equal(singleEyeButtons.length, 1, "single eye button rendered");
assert.equal(
  singleEyeButtons[0]!.props["aria-label"],
  "View larger photo of Single Shirt",
  "single eye button has correct aria-label",
);
assert.equal(singleEyeButtons[0]!.props.type, "button", "single eye button is a button element");
assert.ok(String(singleEyeButtons[0]!.props.className).includes("rounded-full"), "single eye button has rounded style");

await act(async () => {
  singleEyeButtons[0]!.props.onClick();
});
assert.equal(getDialogs().length, 1, "single garment eye button opens preview dialog");
{
  const dialog = getDialogs()[0]!;
  const mainImg = dialog.findByProps({ "data-catalogue-photo-preview-image": "true" });
  assert.equal(mainImg.props.src, "https://example.com/single-shirt.jpg");
  const swatchImg = dialog.findByProps({ "data-catalogue-photo-preview-fabric-swatch-image": "true" });
  assert.equal(swatchImg.props.src, "https://example.com/swatches/emerald.jpg");
  assert.equal(swatchImg.props.alt, "Selected fabric swatch: Emerald");
}
await closeDialog();

// ============================================================================
// Test 3: When neither fabricSwatchImageUrl nor fabricColorHex is present,
// CataloguePhotoPreviewDialog omits the fabric swatch block cleanly.
// ============================================================================
await renderPanel({
  targets: [
    target({
      previewableGarments: [
        {
          garmentKey: "base:plain-shirt",
          label: "Plain Shirt",
          garmentImageUrl: "https://example.com/plain-shirt.jpg",
          fabricSwatchImageUrl: null,
          fabricColorHex: null,
          garmentType: undefined,
          sourceKind: undefined,
          uploadedDesign: undefined,
          styleShowsWearer: undefined,
          styleGender: null,
          orderDetails: null,
          inputFingerprint: null,
        },
      ],
    }),
  ],
});

const plainEyeButton = renderer!.root.findByProps({ "aria-label": "View larger photo of Plain Shirt" });
await act(async () => {
  plainEyeButton.props.onClick();
});
assert.equal(getDialogs().length, 1, "plain garment eye button opens preview dialog");
{
  const dialog = getDialogs()[0]!;
  const mainImg = dialog.findByProps({ "data-catalogue-photo-preview-image": "true" });
  assert.equal(mainImg.props.src, "https://example.com/plain-shirt.jpg");
  assert.equal(
    dialog.findAllByProps({ "data-catalogue-photo-preview-fabric-swatch": "true" }).length,
    0,
    "fabric swatch block is omitted when neither imageUrl nor colorHex is provided",
  );
}
await closeDialog();

await act(async () => {
  renderer?.unmount();
});

console.log("PASS: AI Try-on single-garment & no-swatch eye preview tests");
