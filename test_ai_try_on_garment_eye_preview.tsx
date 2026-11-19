/**
 * AI Try-on garment-card eye preview & fabric swatch visibility:
 * - Inline Step 7 fabric rounded-square swatch + label on multi- and single-garment selectors
 * - Larger garment photo + enlarged selected fabric swatch with click-to-toggle full-size view
 *   without changing garment selection.
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
// Test 1: Multi-garment picker renders inline rounded-square swatches + labels,
// renders an <Eye /> button per garment, and clicking an unselected garment's
// eye button opens the dialog without changing the active garment selection.
// Also tests toggling between garment style photo and full-size fabric swatch.
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

// Inline fabric swatch + label checks for multi-garment compact pills
{
  const shirtMark = garmentButtons[0]!.findByProps({ "data-ai-try-on-fabric-mark": "compact" });
  const shirtImg = shirtMark.findByProps({ "data-ai-try-on-fabric-swatch": "image" });
  assert.equal(shirtImg.props.src, "https://example.com/swatches/burgundy.jpg");
  assert.match(String(shirtImg.props.className), /scale-125/);
  assert.match(String(shirtImg.props.className), /object-cover/);
  const shirtSwatchFrameClass = String(shirtImg.parent?.props.className);
  assert.match(shirtSwatchFrameClass, /\bsize-8\b/);
  assert.match(shirtSwatchFrameClass, /\brounded-lg\b/);
  assert.doesNotMatch(shirtSwatchFrameClass, /\brounded-full\b/);
  const shirtLabel = shirtMark.findByProps({ "data-ai-try-on-fabric-label": "true" });
  assert.equal(textContent(shirtLabel), "Burgundy · Senator");

  const trouserMark = garmentButtons[1]!.findByProps({ "data-ai-try-on-fabric-mark": "compact" });
  const trouserColor = trouserMark.findByProps({ "data-ai-try-on-garment-swatch": "color" });
  assert.equal(trouserColor.props.style.backgroundColor, "#1E3A5F");
  assert.match(String(trouserColor.props.className), /\bsize-8\b/);
  assert.match(String(trouserColor.props.className), /\brounded-lg\b/);
  assert.doesNotMatch(String(trouserColor.props.className), /\brounded-full\b/);
  const trouserLabel = trouserMark.findByProps({ "data-ai-try-on-fabric-label": "true" });
  assert.equal(textContent(trouserLabel), "Navy");
}

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

// Dialog opens with Trouser photo + enlarged colorHex fabric swatch (non-toggleable)
assert.equal(getDialogs().length, 1, "dialog opens for unselected garment");
{
  const dialog = getDialogs()[0]!;
  const mainImg = dialog.findByProps({ "data-catalogue-photo-preview-image": "true" });
  assert.equal(mainImg.props.src, "https://example.com/trouser.jpg", "dialog displays Trouser photo");
  assert.equal(mainImg.props.alt, "Design reference for Trouser");

  const swatchContainer = dialog.findAllByProps({ "data-catalogue-photo-preview-fabric-swatch": "true" });
  assert.equal(swatchContainer.length, 1, "fabric swatch badge renders for colorHex-only fabric");
  assert.equal(
    dialog.findAllByProps({ "data-catalogue-photo-preview-fabric-toggle": "true" }).length,
    0,
    "color-only swatch does not render an image toggle button",
  );

  const swatchColor = dialog.findByProps({ "data-catalogue-photo-preview-fabric-swatch-color": "true" });
  assert.equal(swatchColor.props.role, "img");
  assert.equal(swatchColor.props["aria-label"], "Selected fabric colour: Navy");
  assert.equal(swatchColor.props.style.backgroundColor, "#1E3A5F");
  assert.match(String(swatchColor.props.className), /\bsize-16\b/);
  assert.match(String(swatchColor.props.className), /\brounded-xl\b/);

  const swatchLabel = dialog.findByProps({ "data-catalogue-photo-preview-fabric-swatch-label": "true" });
  assert.equal(textContent(swatchLabel), "Navy");
}

await closeDialog();
assert.equal(getDialogs().length, 0, "dialog closes cleanly");

// Open first garment's eye button (Shirt - image swatch + toggle to full-size fabric + onError fallback)
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
  assert.equal(mainImg.props["data-catalogue-photo-preview-active-view"], "garment");

  const toggleBtn = dialog.findByProps({ "data-catalogue-photo-preview-fabric-toggle": "true" });
  assert.equal(toggleBtn.props["aria-pressed"], false);
  assert.equal(toggleBtn.props["data-catalogue-photo-preview-fabric-active"], "false");
  assert.equal(
    dialog.findAllByProps({ "data-catalogue-photo-preview-fabric-active-badge": "true" }).length,
    0,
    "Viewing badge hidden while viewing garment style photo",
  );

  const swatchImg = dialog.findByProps({ "data-catalogue-photo-preview-fabric-swatch-image": "true" });
  assert.equal(swatchImg.props.src, "https://example.com/swatches/burgundy.jpg");
  assert.equal(swatchImg.props.alt, "Selected fabric swatch: Burgundy · Senator");
  assert.match(String(swatchImg.props.className), /scale-125/);
  assert.match(String(swatchImg.parent?.props.className), /\bsize-16\b/);
  assert.match(String(swatchImg.parent?.props.className), /\brounded-xl\b/);

  const swatchLabel = dialog.findByProps({ "data-catalogue-photo-preview-fabric-swatch-label": "true" });
  assert.equal(textContent(swatchLabel), "Burgundy · Senator");

  // Click fabric swatch button -> switches main photo to full-size fabric swatch
  await act(async () => {
    toggleBtn.props.onClick();
  });

  const fabricViewDialog = getDialogs()[0]!;
  const toggledMainImg = fabricViewDialog.findByProps({ "data-catalogue-photo-preview-image": "true" });
  assert.equal(toggledMainImg.props.src, "https://example.com/swatches/burgundy.jpg");
  assert.equal(toggledMainImg.props["data-catalogue-photo-preview-active-view"], "fabric");

  const activeToggle = fabricViewDialog.findByProps({ "data-catalogue-photo-preview-fabric-toggle": "true" });
  assert.equal(activeToggle.props["aria-pressed"], true);
  assert.equal(activeToggle.props["data-catalogue-photo-preview-fabric-active"], "true");
  const viewingBadge = fabricViewDialog.findByProps({ "data-catalogue-photo-preview-fabric-active-badge": "true" });
  assert.equal(textContent(viewingBadge), "Viewing");

  // Click again -> switches back to garment style photo
  await act(async () => {
    activeToggle.props.onClick();
  });

  const backToGarmentDialog = getDialogs()[0]!;
  const restoredMainImg = backToGarmentDialog.findByProps({ "data-catalogue-photo-preview-image": "true" });
  assert.equal(restoredMainImg.props.src, "https://example.com/shirt.jpg");
  assert.equal(restoredMainImg.props["data-catalogue-photo-preview-active-view"], "garment");
  assert.equal(
    backToGarmentDialog.findByProps({ "data-catalogue-photo-preview-fabric-toggle": "true" }).props["aria-pressed"],
    false,
  );

  // Toggle back to fabric view, then simulate swatch image load failure ->
  // gracefully reverts main photo to garment style photo and shows colorHex fallback
  await act(async () => {
    backToGarmentDialog.findByProps({ "data-catalogue-photo-preview-fabric-toggle": "true" }).props.onClick();
  });
  await act(async () => {
    getDialogs()[0]!
      .findByProps({ "data-catalogue-photo-preview-fabric-swatch-image": "true" })
      .props.onError();
  });

  const dialogAfterError = getDialogs()[0]!;
  const revertedMainImg = dialogAfterError.findByProps({ "data-catalogue-photo-preview-image": "true" });
  assert.equal(revertedMainImg.props.src, "https://example.com/shirt.jpg");
  assert.equal(
    dialogAfterError.findAllByProps({ "data-catalogue-photo-preview-fabric-swatch-image": "true" }).length,
    0,
    "failed swatch image is replaced",
  );
  assert.equal(
    dialogAfterError.findAllByProps({ "data-catalogue-photo-preview-fabric-toggle": "true" }).length,
    0,
    "toggle button is replaced with static color swatch after image failure",
  );
  const fallbackColor = dialogAfterError.findByProps({
    "data-catalogue-photo-preview-fabric-swatch-color": "true",
  });
  assert.equal(fallbackColor.props.style.backgroundColor, "#5C1A1B");
  assert.equal(fallbackColor.props["aria-label"], "Selected fabric colour: Burgundy · Senator");
  assert.match(String(fallbackColor.props.className), /\bsize-16\b/);
}
await closeDialog();

console.log("PASS: AI Try-on multi-garment eye preview & fabric swatch tests");

// ============================================================================
// Test 2: Single-garment banner renders larger rounded-square swatch + inline
// fabric label (`Blue · Lace`), renders its <Eye /> button, and opens
// CataloguePhotoPreviewDialog with enlarged toggleable fabric swatch.
// ============================================================================
await renderPanel({
  targets: [
    target({
      previewableGarments: [
        {
          garmentKey: "base:single-shirt",
          label: "Single Shirt",
          garmentImageUrl: "https://example.com/single-shirt.jpg",
          fabricSwatchImageUrl: "https://example.com/swatches/blue-lace.jpg",
          fabricColorHex: "#1E40AF",
          garmentType: undefined,
          sourceKind: undefined,
          uploadedDesign: undefined,
          styleShowsWearer: undefined,
          styleGender: null,
          orderDetails: {
            garments: [],
            fabric: {
              colour: "Blue",
              colourHex: "#1E40AF",
              category: "Lace",
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

{
  const summaryMark = singleDesignRefs[0]!.findByProps({ "data-ai-try-on-fabric-mark": "summary" });
  const summarySwatchImg = summaryMark.findByProps({ "data-ai-try-on-fabric-swatch": "image" });
  assert.equal(summarySwatchImg.props.src, "https://example.com/swatches/blue-lace.jpg");
  assert.match(String(summarySwatchImg.props.className), /scale-125/);
  assert.match(String(summarySwatchImg.props.className), /object-cover/);
  const summarySwatchFrameClass = String(summarySwatchImg.parent?.props.className);
  assert.match(summarySwatchFrameClass, /\bsize-10\b/);
  assert.match(summarySwatchFrameClass, /\brounded-lg\b/);
  assert.doesNotMatch(summarySwatchFrameClass, /\brounded-full\b/);
  const summaryLabel = summaryMark.findByProps({ "data-ai-try-on-fabric-label": "true" });
  assert.equal(textContent(summaryLabel), "Blue · Lace");
}

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
  assert.equal(swatchImg.props.src, "https://example.com/swatches/blue-lace.jpg");
  assert.equal(swatchImg.props.alt, "Selected fabric swatch: Blue · Lace");

  // Click swatch toggle to view full-size Blue · Lace swatch
  await act(async () => {
    dialog.findByProps({ "data-catalogue-photo-preview-fabric-toggle": "true" }).props.onClick();
  });
  const enlargedSwatchView = getDialogs()[0]!.findByProps({ "data-catalogue-photo-preview-image": "true" });
  assert.equal(enlargedSwatchView.props.src, "https://example.com/swatches/blue-lace.jpg");
  assert.equal(enlargedSwatchView.props["data-catalogue-photo-preview-active-view"], "fabric");
}
await closeDialog();

// Fallback inline label when fabricSwatchImageUrl is set without orderDetails.fabric
await renderPanel({
  targets: [
    target({
      previewableGarments: [
        {
          garmentKey: "base:image-only-fabric",
          label: "Image Only Shirt",
          garmentImageUrl: "https://example.com/image-only-shirt.jpg",
          fabricSwatchImageUrl: "https://example.com/swatches/pattern.jpg",
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
{
  const fallbackLabel = renderer!.root.findByProps({ "data-ai-try-on-fabric-label": "true" });
  assert.equal(textContent(fallbackLabel), "Selected fabric");
}

// ============================================================================
// Test 3: When neither fabricSwatchImageUrl nor fabricColorHex is present,
// both inline FabricMark and CataloguePhotoPreviewDialog omit the fabric swatch block.
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

assert.equal(
  renderer!.root.findAllByProps({ "data-ai-try-on-fabric-mark": "summary" }).length,
  0,
  "inline fabric mark is omitted when neither swatch image nor color hex is present",
);

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
