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
assert.ok(selectedMarkup.includes("checked"));

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

let selectableRenderer: ReturnType<typeof create>;
act(() => {
  selectableRenderer = create(
    createElement(GarmentTypeStep, {
      selectedGarmentTypes: [],
      selectedDemographics: [],
      normalizedCustomDetailCatalog: catalog,
      onGarmentTypesChange: () => undefined,
      onDemographicsChange: () => undefined,
      onConstructionDefaultsChange: () => undefined,
    }),
  );
});
act(() => {
  selectableRenderer.root
    .findByProps({ "data-testid": "step1-garment-card-shirt" })
    .findByProps({ "data-testid": "step1-garment-reference-image" })
    .props.onError();
});
const shirtCheckbox = selectableRenderer.root.findByProps({
  id: "garment-type-step-shirt",
});
assert.equal(shirtCheckbox.props.checked, false);
assert.equal(typeof shirtCheckbox.props.onChange, "function");
assert.ok(
  selectableRenderer.root.findByProps({
    "data-testid": "step1-garment-card-shirt",
  }),
);

console.log("Step 1 garment reference image verification passed.");
