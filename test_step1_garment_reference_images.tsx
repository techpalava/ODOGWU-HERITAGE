import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import {
  GarmentTypeStep,
  STEP1_GARMENT_REFERENCE_FRAME_CLASS,
  STEP1_GARMENT_SELECT_ATTENTION_CLASS,
  STEP1_GARMENT_SELECT_BUTTON_BASE_CLASS,
  Step1GarmentReferencePhoto,
  getGarmentTypeStepLabel,
} from "./src/components/GarmentTypeStep";
import { CUSTOMER_SELECTABLE_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import {
  STEP1_GARMENT_REFERENCE_IMAGES,
  getStep1GarmentReferenceAlt,
  getStep1GarmentReferenceImage,
  isStep1GarmentReferenceType,
  listMissingStep1GarmentReferenceImageKeys,
} from "./src/utils/step1GarmentReferenceImages";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import type { FabricGarmentType } from "./src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const repoRoot = dirname(fileURLToPath(import.meta.url));

assert.deepEqual(listMissingStep1GarmentReferenceImageKeys(), []);
assert.deepEqual(
  Object.keys(STEP1_GARMENT_REFERENCE_IMAGES).sort(),
  [...CUSTOMER_SELECTABLE_GARMENT_TYPES].sort(),
  "Every customer-selectable Step 1 garment must have reference-image config",
);
assert.equal(
  "agbada" in STEP1_GARMENT_REFERENCE_IMAGES,
  false,
  "Agbada must not receive a customer Step 1 reference-image mapping",
);

for (const garmentType of CUSTOMER_SELECTABLE_GARMENT_TYPES) {
  assert.ok(
    isStep1GarmentReferenceType(garmentType),
    `${garmentType} must have Step 1 reference-image config`,
  );
  const config = getStep1GarmentReferenceImage(garmentType);
  assert.ok(config.src.startsWith("/images/garments/"));
  assert.ok(config.filename.endsWith(".webp"));
  assert.equal(config.src, `/images/garments/${config.filename}`);
  const diskPath = join(repoRoot, "public", "images", "garments", config.filename);
  assert.ok(
    existsSync(diskPath),
    `Expected local reference asset at ${diskPath}`,
  );
  const label = getGarmentTypeStepLabel(garmentType);
  assert.equal(
    getStep1GarmentReferenceAlt(label),
    `Ankara ${label} reference`,
  );
}

const renderStepMarkup = (
  selectedGarmentTypes: readonly FabricGarmentType[] = [],
) =>
  renderToStaticMarkup(
    createElement(GarmentTypeStep, {
      selectedGarmentTypes,
      selectedDemographics: [],
      normalizedCustomDetailCatalog: catalog,
      onGarmentTypesChange: () => undefined,
      onDemographicsChange: () => undefined,
      onConstructionDefaultsChange: () => undefined,
    }),
  );

const emptyMarkup = renderStepMarkup();
assert.ok(
  emptyMarkup.includes(`src="${STEP1_GARMENT_REFERENCE_IMAGES.shirt.src}"`),
);
assert.ok(emptyMarkup.includes('alt="Ankara Standard Shirt reference"'));
assert.ok(emptyMarkup.includes("Standard Shirt"));
assert.ok(emptyMarkup.includes("Uses 1/2 fabric capacity unit."));
assert.ok(emptyMarkup.includes(">SELECT<"));
assert.equal(emptyMarkup.includes("✓ SELECTED"), false);
assert.equal(
  (emptyMarkup.match(/type="checkbox"/g) || []).length,
  3,
  "Only demographic checkboxes may remain; garment cards must not use checkboxes",
);
assert.equal(
  (emptyMarkup.match(/data-testid="step1-garment-select-/g) || []).length,
  CUSTOMER_SELECTABLE_GARMENT_TYPES.length,
);
assert.ok(emptyMarkup.includes('aria-pressed="false"'));
assert.ok(emptyMarkup.includes('aria-label="Select Standard Shirt"'));
assert.ok(emptyMarkup.includes(STEP1_GARMENT_SELECT_ATTENTION_CLASS));
assert.ok(emptyMarkup.includes("motion-safe:animate-step1-select-attention"));
assert.ok(emptyMarkup.includes("motion-reduce:animate-none"));
assert.ok(emptyMarkup.includes("min-h-11"));
assert.ok(emptyMarkup.includes(STEP1_GARMENT_SELECT_BUTTON_BASE_CLASS.split(" ")[0]));
assert.equal(
  (emptyMarkup.match(/Reference images show garment types only\./g) || []).length,
  1,
);
assert.ok(emptyMarkup.includes('loading="eager"'));
assert.ok(emptyMarkup.includes('loading="lazy"'));
assert.ok(
  emptyMarkup.includes('class="relative aspect-[2/1] w-full'),
  "Step 1 reference frames must use the half-height 2/1 aspect crop",
);
assert.equal(emptyMarkup.includes("aspect-square"), false);

for (const garmentType of CUSTOMER_SELECTABLE_GARMENT_TYPES) {
  assert.ok(isStep1GarmentReferenceType(garmentType));
  const config = STEP1_GARMENT_REFERENCE_IMAGES[garmentType];
  const label = getGarmentTypeStepLabel(garmentType);
  assert.ok(
    emptyMarkup.includes(`src="${config.src}"`),
    `${garmentType} must render its reference image source`,
  );
  assert.ok(
    emptyMarkup.includes(`alt="${getStep1GarmentReferenceAlt(label)}"`),
    `${garmentType} must render meaningful reference alt text`,
  );
}

const selectedMarkup = renderStepMarkup(["shirt"]);
assert.ok(
  selectedMarkup.includes(`src="${STEP1_GARMENT_REFERENCE_IMAGES.shirt.src}"`),
  "Selected cards must keep the same reference image visible",
);
assert.ok(selectedMarkup.includes("✓ SELECTED"));
assert.ok(selectedMarkup.includes("border-heritage-green"));
assert.ok(selectedMarkup.includes('id="garment-type-step-shirt"'));
assert.ok(selectedMarkup.includes('aria-pressed="true"'));
assert.ok(selectedMarkup.includes('aria-label="Deselect Standard Shirt"'));
assert.equal(selectedMarkup.includes('checked'), false);
const shirtSelectStart = selectedMarkup.indexOf('data-testid="step1-garment-select-shirt"');
assert.ok(shirtSelectStart >= 0);
const shirtSelectSlice = selectedMarkup.slice(shirtSelectStart, shirtSelectStart + 900);
assert.equal(
  shirtSelectSlice.includes(STEP1_GARMENT_SELECT_ATTENTION_CLASS),
  false,
  "Selected SELECT button must not use the unselected attention animation",
);

let fallbackRenderer: ReturnType<typeof create>;
act(() => {
  fallbackRenderer = create(
    createElement(Step1GarmentReferencePhoto, {
      src: "/images/garments/ankara-standard-shirt.webp",
      alt: "Ankara Standard Shirt reference",
    }),
  );
});
assert.equal(
  fallbackRenderer.root.findAllByProps({
    "data-testid": "step1-garment-reference-fallback",
  }).length,
  0,
);
act(() => {
  fallbackRenderer.root
    .findByProps({ "data-testid": "step1-garment-reference-image" })
    .props.onError();
});
const fallback = fallbackRenderer.root.findByProps({
  "data-testid": "step1-garment-reference-fallback",
});
assert.ok(fallback);
assert.ok(
  JSON.stringify(fallbackRenderer.toJSON()).includes(
    "Reference image unavailable",
  ),
);
assert.equal(
  fallbackRenderer.root.findAllByProps({
    "data-testid": "step1-garment-reference-image",
  }).length,
  0,
  "Broken-image element must be removed after load failure",
);
const fallbackFrame = fallbackRenderer.root.findByProps({
  "data-testid": "step1-garment-reference-frame",
});
assert.ok(fallbackFrame.props.className.includes("aspect-[2/1]"));
assert.equal(STEP1_GARMENT_REFERENCE_FRAME_CLASS.includes("aspect-[2/1]"), true);
assert.equal(STEP1_GARMENT_REFERENCE_FRAME_CLASS.includes("aspect-square"), false);

let selectedGarmentTypes: FabricGarmentType[] = [];
let garmentChangeCount = 0;
let constructionChangeCount = 0;
let selectableRenderer: ReturnType<typeof create>;
const renderSelectable = (selected: readonly FabricGarmentType[]) =>
  createElement(GarmentTypeStep, {
    selectedGarmentTypes: selected,
    selectedDemographics: [],
    normalizedCustomDetailCatalog: catalog,
    onGarmentTypesChange: (next) => {
      garmentChangeCount += 1;
      selectedGarmentTypes = next;
    },
    onDemographicsChange: () => undefined,
    onConstructionDefaultsChange: () => {
      constructionChangeCount += 1;
    },
  });
act(() => {
  selectableRenderer = create(renderSelectable([]));
});
act(() => {
  selectableRenderer.root
    .findByProps({ "data-testid": "step1-garment-card-shirt" })
    .findByProps({ "data-testid": "step1-garment-reference-image" })
    .props.onError();
});
assert.equal(
  selectableRenderer.root.findAllByProps({
    type: "checkbox",
    id: "garment-type-step-shirt",
  }).length,
  0,
);
const shirtSelect = selectableRenderer.root.findByProps({
  "data-testid": "step1-garment-select-shirt",
});
assert.equal(shirtSelect.props.type, "button");
assert.equal(shirtSelect.props["aria-pressed"], false);
assert.equal(shirtSelect.props["aria-label"], "Select Standard Shirt");
assert.ok(
  shirtSelect.props.className.includes(STEP1_GARMENT_SELECT_ATTENTION_CLASS),
);
assert.ok(shirtSelect.props.className.includes("min-h-11"));
act(() => {
  shirtSelect.props.onClick();
});
assert.equal(garmentChangeCount, 1, "one SELECT click must produce one garment-state transition");
assert.equal(constructionChangeCount, 1);
assert.deepEqual(selectedGarmentTypes, ["shirt"]);
act(() => {
  selectableRenderer.update(renderSelectable(selectedGarmentTypes));
});
const selectedShirtSelect = selectableRenderer.root.findByProps({
  "data-testid": "step1-garment-select-shirt",
});
assert.equal(selectedShirtSelect.props["aria-pressed"], true);
assert.equal(selectedShirtSelect.props["aria-label"], "Deselect Standard Shirt");
assert.equal(
  selectedShirtSelect.props.className.includes(STEP1_GARMENT_SELECT_ATTENTION_CLASS),
  false,
);
act(() => {
  selectedShirtSelect.props.onClick();
});
assert.equal(garmentChangeCount, 2, "one SELECTED click must produce one garment-state transition");
assert.deepEqual(selectedGarmentTypes, []);
act(() => {
  selectableRenderer.update(renderSelectable([]));
});
act(() => {
  selectableRenderer.root
    .findByProps({ "data-testid": "step1-garment-select-shirt" })
    .props.onClick();
});
act(() => {
  selectableRenderer.update(renderSelectable(selectedGarmentTypes));
});
act(() => {
  selectableRenderer.root
    .findByProps({ "data-testid": "step1-garment-select-trouser" })
    .props.onClick();
});
act(() => {
  selectableRenderer.update(renderSelectable(selectedGarmentTypes));
});
act(() => {
  selectableRenderer.root
    .findByProps({ "data-testid": "step1-garment-select-dress" })
    .props.onClick();
});
assert.deepEqual(selectedGarmentTypes, ["shirt", "trouser", "dress"]);
act(() => {
  selectableRenderer.update(renderSelectable(selectedGarmentTypes));
});
act(() => {
  selectableRenderer.root
    .findByProps({ "data-testid": "step1-garment-select-trouser" })
    .props.onClick();
});
assert.deepEqual(selectedGarmentTypes, ["shirt", "dress"]);
assert.equal(garmentChangeCount, 6);
assert.ok(
  selectableRenderer.root.findByProps({
    "data-testid": "step1-garment-card-shirt",
  }),
);
assert.equal(
  selectableRenderer.root.findAllByProps({
    "data-testid": "step1-garment-select-shirt",
  }).length,
  1,
);

console.log("Step 1 garment reference image verification passed.");
