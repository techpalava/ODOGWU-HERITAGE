/**
 * Fabric catalogue eye: larger photo without changing the selection.
 * Hover/focus visibility is the CSS contract (a hover media query, not width).
 * No network, Firestore, or Storage calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { FutureFabricCatalogueCard } from "./src/components/FutureFabricCatalogueCard";
import { setDefaultImageRetryDelaysForTests } from "./src/hooks/useImageLoadRetry";
import {
  buildFabricPhotoPreviewSources,
  FABRIC_PHOTO_PREVIEW_ORIGINAL_WIDTH,
  setImageOptimizationEnabledForTests,
} from "./src/utils/optimizedImageUrl";
import type { Fabric } from "./src/types";

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

const pressKey = (key: string, shiftKey = false) => {
  let prevented = false;
  for (const listener of [...keyListeners]) {
    listener({
      key,
      shiftKey,
      preventDefault: () => {
        prevented = true;
      },
    });
  }
  return prevented;
};

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

const STORAGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0614710868.firebasestorage.app/o/fabrics%2F61f52fe0-de0d-4130-a0d8-4ca59af734f4.jpeg?alt=media&token=4ad78a1d-16cd-418a-985a-e7cdddfd4446";

const fabric = (overrides: Partial<Fabric> = {}): Fabric => ({
  code: "ODG-012",
  name: "Prestige Burgundy Grid",
  description: "Test",
  color: "Burgundy",
  colorHex: "#5C1A1B",
  category: "Test",
  price: 42,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  image: STORAGE_URL,
  ...overrides,
});

const focused: string[] = [];
const closeButtons: Array<{ label?: string; focus: () => void; hasAttribute: () => boolean; getAttribute: () => null }> = [];
const createNodeMock = (element: ReactElement) => {
  const props = element.props as { "aria-label"?: string; role?: string };
  const label = props["aria-label"];
  const node = {
    label,
    focus() {
      if (typeof label === "string") focused.push(label);
      if (typeof label === "string" && label.startsWith("Close larger photo")) activeElement = node;
    },
    hasAttribute: () => false,
    getAttribute: () => null,
    querySelectorAll: () =>
      props.role === "dialog"
        ? closeButtons.filter((button) => button.label?.startsWith("Close larger photo"))
        : [],
    contains: () => false,
  };
  if (element.type === "button" && typeof label === "string" && label.startsWith("Close larger photo")) {
    closeButtons.push(node);
  }
  return node;
};

const presentation = { status: "SELECT" as const, action: "select" as const, cancelGarmentKey: null };

let selected = 0;
let renderer!: ReturnType<typeof create>;
const renderCard = async (item: Fabric, showPhotoPreview = true) => {
  selected = 0;
  focused.length = 0;
  closeButtons.length = 0;
  activeElement = null;
  await act(async () => {
    renderer = create(
      createElement(FutureFabricCatalogueCard, {
        fabric: item,
        presentation,
        showPhotoPreview,
        onAction: () => {
          selected += 1;
        },
      }),
      { createNodeMock },
    );
  });
};

const eye = () => renderer.root.findByProps({ "data-fabric-photo-preview": "true" });
const dialogs = () => renderer.root.findAllByProps({ "data-catalogue-photo-preview": "true" });
const openEye = async () => {
  let stopped = false;
  await act(async () => {
    eye().props.onClick({
      stopPropagation() {
        stopped = true;
      },
    });
  });
  return stopped;
};

// --- Hover and keyboard focus are a hover media query, not a width breakpoint.
{
  const css = readFileSync("src/index.css", "utf8");
  const start = css.indexOf(".catalogue-photo-eye");
  assert.ok(start >= 0, "eye class is defined");
  const block = css.slice(start);
  assert.match(block, /opacity:\s*1/);
  assert.match(block, /@media \(hover:\s*hover\)/);
  assert.match(block, /opacity:\s*0/);
  assert.match(block, /\.group:hover \.catalogue-photo-eye/);
  assert.match(block, /\.catalogue-photo-eye:focus/);
  assert.match(block, /\.catalogue-photo-eye:focus-visible/);
  assert.match(block, /pointer-events:\s*none/);
  assert.match(block, /pointer-events:\s*auto/);
  assert.doesNotMatch(block, /min-width|max-width/, "visibility does not depend on viewport width");
}

// --- Eye is present for a photo, hidden for colour-only and when the photo fails.
await renderCard(fabric());
{
  const button = eye();
  assert.equal(button.type, "button");
  assert.equal(button.props.type, "button");
  assert.equal(button.props["aria-label"], "View larger photo of Prestige Burgundy Grid");
  assert.equal(textContent(button), "Quick look");
  assert.doesNotMatch(String(button.props["aria-label"]), /Quick look/);
  assert.match(String(button.props.className), /\bcatalogue-photo-eye\b/);
  assert.match(String(button.props.className), /\bbottom-2\b/);
  assert.match(String(button.props.className), /\bleft-2\b/);
  assert.match(String(button.props.className), /\bmin-h-11\b/, "the tap target stays at least 44px");
  assert.doesNotMatch(String(button.props.className), /\btop-2\b/);
  const pill = button.find((node) => node.type === "span");
  assert.match(String(pill.props.className), /text-\[11px\]/);
  assert.match(String(pill.props.className), /bg-white\/70/);
  assert.match(String(pill.props.className), /backdrop-blur-sm/);
  assert.match(String(pill.props.className), /group-hover\/eye:bg-white/);
  assert.match(String(pill.props.className), /group-focus-visible\/eye:bg-white/);
  assert.doesNotMatch(String(pill.props.className), /\bmin-h-11\b/);
  const card = renderer.root.findByProps({ "data-fabric-catalogue-card": "true" });
  assert.match(String(card.props.className), /\bgroup\b/, "hovering the card reveals the eye");
  assert.equal(dialogs().length, 0);
}

await renderCard(fabric(), false);
assert.equal(
  renderer.root.findAllByProps({ "data-fabric-photo-preview": "true" }).length,
  0,
  "other catalogue cards leave the eye off",
);

await renderCard(fabric({ image: "", name: "Plain Gold" }));
assert.equal(renderer.root.findAllByProps({ "data-fabric-card-swatch": "true" }).length, 1);
assert.equal(
  renderer.root.findAllByProps({ "data-fabric-photo-preview": "true" }).length,
  0,
  "a colour block has no photo to enlarge",
);

setDefaultImageRetryDelaysForTests([]);
await renderCard(fabric({ name: "Broken Weave" }));
await act(async () => {
  renderer.root.findByProps({ "data-fabric-card-image": "true" }).props.onError();
});
assert.equal(renderer.root.findAllByProps({ "data-fabric-card-image": "true" }).length, 0);
assert.equal(
  renderer.root.findAllByProps({ "data-fabric-photo-preview": "true" }).length,
  0,
  "a failed photo hides the eye",
);
setDefaultImageRetryDelaysForTests(null);

// --- Opening the eye does not select. Escape, backdrop, and X close it.
await renderCard(fabric());
assert.equal(await openEye(), true, "the eye click does not bubble into the card");
assert.equal(selected, 0, "opening the photo does not select the fabric");
assert.equal(dialogs().length, 1);
assert.equal(keyListeners.size, 1, "Escape listener only while open");

{
  const dialog = dialogs()[0]!;
  assert.equal(dialog.props.role, "dialog");
  assert.equal(dialog.props["aria-modal"], "true");
  const titleId = String(dialog.props["aria-labelledby"]);
  assert.ok(titleId.length > 0);
  const title = dialog.findByProps({ id: titleId });
  assert.equal(textContent(title), "Prestige Burgundy Grid");
  const image = dialog.findByProps({ "data-catalogue-photo-preview-image": "true" });
  assert.equal(image.props.alt, "Prestige Burgundy Grid fabric swatch");
  assert.equal(image.props.src, STORAGE_URL, "local and fallback source is the stored full-size photo");
  assert.match(String(image.props.className), /max-w-\[90vw\]/);
  assert.match(String(image.props.className), /object-contain/);
  const buttons = dialog.findAll((node) => node.type === "button");
  assert.equal(buttons.length, 1, "one photo at a time, no browsing controls");
  assert.equal(buttons[0]!.props["aria-label"], "Close larger photo of Prestige Burgundy Grid");
  const childTypes = dialog.children.map((child) => (typeof child === "string" ? child : child.type));
  const imageIndex = childTypes.indexOf("img");
  const titleIndex = childTypes.indexOf("p");
  assert.ok(imageIndex >= 0 && titleIndex > imageIndex, "the fabric name sits under the photo");
}

assert.equal(pressKey("Tab"), true, "Tab stays inside the dialog");
assert.equal(dialogs().length, 1);
assert.equal(selected, 0);

const closeAndExpectFocus = async (how: "x" | "backdrop" | "escape") => {
  const before = focused.length;
  await act(async () => {
    if (how === "x") {
      renderer.root.findByProps({ "data-catalogue-photo-preview-close": "true" }).props.onClick();
    } else if (how === "backdrop") {
      renderer.root.findByProps({ "data-catalogue-photo-preview-backdrop": "true" }).props.onClick();
    } else {
      assert.equal(pressKey("Escape"), true);
    }
  });
  assert.equal(dialogs().length, 0, `${how} closes the photo`);
  assert.equal(keyListeners.size, 0, `${how} removes the key listener`);
  assert.equal(selected, 0, `${how} does not change the selection`);
  assert.ok(
    focused.slice(before).includes("View larger photo of Prestige Burgundy Grid"),
    `${how} returns focus to the eye button`,
  );
};

await closeAndExpectFocus("x");
assert.equal(await openEye(), true);
await closeAndExpectFocus("backdrop");
assert.equal(await openEye(), true);
await closeAndExpectFocus("escape");

await act(async () => {
  renderer.root.findByProps({ "data-fabric-action": "select" }).props.onClick();
});
assert.equal(selected, 1, "the rest of the card still selects");
assert.equal(dialogs().length, 0);

// --- Enlarged view asks for the 512 px image and the full original.
setImageOptimizationEnabledForTests(true);
{
  const sources = buildFabricPhotoPreviewSources(STORAGE_URL);
  assert.ok(sources);
  assert.match(sources!.src, /\/_vercel\/image\?/);
  assert.match(sources!.src, /w=512/);
  assert.match(sources!.srcSet, new RegExp(`${FABRIC_PHOTO_PREVIEW_ORIGINAL_WIDTH}w`));
  assert.ok(sources!.srcSet.includes(STORAGE_URL));
  assert.equal(sources!.sizes, "90vw");
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { images: { sizes: number[] } };
  assert.ok(vercel.images.sizes.includes(512));
}
await renderCard(fabric());
assert.equal(await openEye(), true);
{
  const image = dialogs()[0]!.findByProps({ "data-catalogue-photo-preview-image": "true" });
  assert.match(String(image.props.src), /w=512/);
  assert.match(String(image.props.srcSet), /1600w/);
  assert.equal(image.props.sizes, "90vw");
  await act(async () => {
    image.props.onError();
  });
  const after = dialogs()[0]!.findByProps({ "data-catalogue-photo-preview-image": "true" });
  assert.equal(after.props.src, STORAGE_URL, "a failed resized photo falls back to the original");
  assert.equal(selected, 0);
}
setImageOptimizationEnabledForTests(null);

// The Fabric step turns the eye on. The additional-garment picker does not.
const stepSource = readFileSync("src/components/DormantFutureFabricStep.tsx", "utf8");
assert.match(stepSource, /showPhotoPreview/);
const additionalPicker = readFileSync("src/components/FutureAdditionalGarmentFabricDialog.tsx", "utf8");
assert.doesNotMatch(additionalPicker, /showPhotoPreview|CataloguePhotoPreviewDialog/);
const tryOn = readFileSync("src/components/AiTryOnPhotoPanel.tsx", "utf8");
assert.doesNotMatch(tryOn, /CataloguePhotoPreviewDialog/, "garment cards are not wired yet");

console.log("PASS: fabric card photo preview");
