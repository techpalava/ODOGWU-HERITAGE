import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  STEP1_DUAL_IMAGE_GARMENT_TYPES,
  STEP1_GARMENT_REFERENCE_IMAGES,
  STEP1_GARMENT_SECONDARY_REFERENCE_IMAGES,
  getStep1GarmentReferenceAlt,
  getStep1GarmentReferenceImage,
  getStep1GarmentSecondaryReferenceImage,
  isStep1DualImageGarmentType,
  isStep1GarmentReferenceType,
  listMissingStep1GarmentReferenceImageKeys,
} from "./src/utils/step1GarmentReferenceImages";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import type { FabricGarmentType } from "./src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const repoRoot = dirname(fileURLToPath(import.meta.url));
const approvedImageFiles = {
  shirt: "ankara-standard-shirt.webp",
  kaftan: "ankara-kaftan.webp",
  dress: "ankara-standard-dress.webp",
  full_length_gown: "ankara-long-dress-gown.webp",
  standard_shorts: "ankara-standard-shorts.webp",
  bum_shorts: "ankara-bum-shorts.webp",
  trouser: "ankara-trouser.webp",
  skirt: "ankara-standard-skirt.webp",
  long_skirt: "ankara-long-skirt.webp",
};
const approvedImageDimensions = {
  shirt: [720, 1080],
  kaftan: [720, 1080],
  dress: [720, 1080],
  full_length_gown: [720, 1080],
  standard_shorts: [720, 1080],
  bum_shorts: [720, 1080],
  trouser: [720, 1080],
  skirt: [720, 1080],
  long_skirt: [1086, 1448],
};
const approvedSecondaryImageFiles = {
  shirt: "ankara-standard-shirt-long-sleeve.webp",
  kaftan: "ankara-kaftan-short-sleeve.webp",
  dress: "ankara-standard-dress-long-sleeve.webp",
  full_length_gown: "ankara-long-dress-gown-short-sleeve.webp",
} as const;
const approvedSecondaryImageDimensions = {
  shirt: [1024, 1536],
  kaftan: [1024, 1536],
  dress: [1024, 1536],
  full_length_gown: [1024, 1536],
} as const;

const webpDimensions = (data: Buffer): number[] => {
  assert.equal(data.toString("ascii", 0, 4), "RIFF");
  assert.equal(data.toString("ascii", 8, 12), "WEBP");
  for (let offset = 12; offset + 8 < data.length;) {
    const chunk = data.toString("ascii", offset, offset + 4);
    const start = offset + 8;
    if (chunk === "VP8X") return [1 + data.readUIntLE(start + 4, 3), 1 + data.readUIntLE(start + 7, 3)];
    if (chunk === "VP8 ") return [data.readUInt16LE(start + 6) & 0x3fff, data.readUInt16LE(start + 8) & 0x3fff];
    if (chunk === "VP8L") {
      const bits = data.readUInt32LE(start + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    const size = data.readUInt32LE(offset + 4);
    offset = start + size + (size % 2);
  }
  throw new Error("WebP image dimensions missing");
};

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
assert.deepEqual(getStep1GarmentReferenceImage("skirt"), {
  filename: "ankara-standard-skirt.webp",
  src: "/images/garments/ankara-standard-skirt.webp",
});
assert.deepEqual(STEP1_DUAL_IMAGE_GARMENT_TYPES, [
  "shirt",
  "kaftan",
  "dress",
  "full_length_gown",
]);
assert.deepEqual(
  Object.fromEntries(
    STEP1_DUAL_IMAGE_GARMENT_TYPES.map((garmentType) => [
      garmentType,
      STEP1_GARMENT_SECONDARY_REFERENCE_IMAGES[garmentType]?.filename,
    ]),
  ),
  approvedSecondaryImageFiles,
  "Every dual-image card must use its approved secondary asset.",
);

for (const garmentType of CUSTOMER_SELECTABLE_GARMENT_TYPES) {
  assert.ok(
    isStep1GarmentReferenceType(garmentType),
    `${garmentType} must have Step 1 reference-image config`,
  );
  const config = getStep1GarmentReferenceImage(garmentType);
  assert.equal(config.filename, approvedImageFiles[garmentType]);
  assert.ok(config.src.startsWith("/images/garments/"));
  assert.ok(config.filename.endsWith(".webp"));
  assert.equal(config.src, `/images/garments/${config.filename}`);
  const diskPath = join(repoRoot, "public", "images", "garments", config.filename);
  assert.ok(
    existsSync(diskPath),
    `Expected local reference asset at ${diskPath}`,
  );
  assert.deepEqual(
    webpDimensions(readFileSync(diskPath)),
    approvedImageDimensions[garmentType],
    config.filename,
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
assert.equal(emptyMarkup.includes("Base Garment"), false);
assert.equal(emptyMarkup.includes("Style Preview"), false);
assert.equal(emptyMarkup.includes("Mid-Long Sleeve"), false);
assert.equal(emptyMarkup.includes("step1-shirt-preview"), false);
assert.equal(
  (emptyMarkup.match(/data-testid="step1-garment-reference-gallery"/g) || []).length,
  4,
  "Exactly the four approved garment cards must reserve the dual-image layout.",
);
assert.equal(
  (emptyMarkup.match(/ankara-standard-shirt-long-sleeve\.webp/g) || []).length,
  1,
  "The Standard Shirt alternate must render alongside its primary image.",
);
for (const garmentType of STEP1_DUAL_IMAGE_GARMENT_TYPES) {
  assert.equal(isStep1DualImageGarmentType(garmentType), true);
  const secondary = getStep1GarmentSecondaryReferenceImage(garmentType);
  assert.equal(secondary?.filename, approvedSecondaryImageFiles[garmentType]);
  assert.ok(
    existsSync(join(repoRoot, "public", "images", "garments", secondary!.filename)),
    `${garmentType} must have a local approved secondary asset.`,
  );
  assert.deepEqual(
    webpDimensions(
      readFileSync(
        join(repoRoot, "public", "images", "garments", secondary!.filename),
      ),
    ),
    approvedSecondaryImageDimensions[garmentType],
    `${garmentType} secondary image dimensions`,
  );
  assert.ok(
    emptyMarkup.includes(`src="${secondary!.src}"`),
    `${garmentType} must render its secondary image alongside the primary one.`,
  );
}
assert.equal(isStep1DualImageGarmentType("skirt"), false);
assert.equal(isStep1DualImageGarmentType("long_skirt"), false);
assert.equal(getStep1GarmentSecondaryReferenceImage("shirt")?.filename, "ankara-standard-shirt-long-sleeve.webp");
assert.equal(
  getStep1GarmentSecondaryReferenceImage("kaftan")?.filename,
  "ankara-kaftan-short-sleeve.webp",
);
assert.equal(
  emptyMarkup.includes("Skirt length is From Waist Up to Ankle"),
  false,
  "Long Skirt's shared Custom Details description must not render on its Step 1 card.",
);
assert.ok(emptyMarkup.includes("Long Skirt"));
assert.ok(emptyMarkup.includes('data-testid="step1-garment-select-long_skirt"'));
const selectedLongSkirtMarkup = renderStepMarkup(["long_skirt"]);
assert.ok(selectedLongSkirtMarkup.includes("Long Skirt"));
assert.ok(selectedLongSkirtMarkup.includes("€80.00"));
assert.ok(selectedLongSkirtMarkup.includes('data-testid="step1-garment-select-long_skirt"'));
assert.ok(emptyMarkup.includes("Uses 1/2 fabric capacity unit."));
assert.ok(emptyMarkup.includes(">SELECT<"));
assert.equal(emptyMarkup.includes("✓ SELECTED"), false);
assert.equal(emptyMarkup.includes("SELECTED"), false);
assert.equal(emptyMarkup.includes('data-step1-deselect-cue="true"'), false);
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
assert.equal(
  (emptyMarkup.match(/aspect-square/g) || []).length,
  8,
  "Each of the four dual-image cards must render two equal-width image frames.",
);

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
assert.ok(selectedMarkup.includes("SELECTED"));
assert.ok(selectedMarkup.includes('data-step1-deselect-cue="true"'));
assert.equal(selectedMarkup.includes("✓ SELECTED"), false);
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
const shirtGallery = selectableRenderer.root
  .findByProps({ "data-testid": "step1-garment-card-shirt" })
  .findByProps({ "data-testid": "step1-garment-reference-gallery" });
const shirtGalleryImages = shirtGallery.findAllByProps({
  "data-testid": "step1-garment-reference-image",
});
assert.equal(shirtGalleryImages.length, 2);
assert.equal(shirtGalleryImages[0]?.props.src, STEP1_GARMENT_REFERENCE_IMAGES.shirt.src);
assert.equal(
  shirtGalleryImages[1]?.props.src,
  STEP1_GARMENT_SECONDARY_REFERENCE_IMAGES.shirt?.src,
);
assert.equal(
  selectableRenderer.root.findAllByProps({
    "data-testid": "step1-shirt-preview-base",
  }).length,
  0,
);
assert.equal(
  selectableRenderer.root.findAllByProps({
    "data-testid": "step1-shirt-preview-midlong",
  }).length,
  0,
);
assert.equal(selectedGarmentTypes.length, 0, "Gallery presentation must not select a garment");
assert.equal(garmentChangeCount, 0, "Gallery presentation must not change garment state");
assert.equal(constructionChangeCount, 0, "Gallery presentation must not change construction state");
assert.equal(
  selectableRenderer.root.findAllByProps({
    type: "checkbox",
    id: "garment-type-step-shirt",
  }).length,
  0,
);
for (const garmentType of CUSTOMER_SELECTABLE_GARMENT_TYPES) {
  const card = selectableRenderer.root.findByProps({
    "data-testid": `step1-garment-card-${garmentType}`,
  });
  const changeCountBeforeCardClick = garmentChangeCount;
  assert.ok(card.props.className.includes("cursor-pointer"));
  act(() => {
    card.props.onClick({ target: null });
  });
  assert.equal(
    garmentChangeCount,
    changeCountBeforeCardClick + 1,
    `Clicking ${garmentType}'s non-button card area must select it exactly once.`,
  );
  assert.ok(selectedGarmentTypes.includes(garmentType));
  act(() => {
    selectableRenderer.update(renderSelectable(selectedGarmentTypes));
  });
  const selectedCard = selectableRenderer.root.findByProps({
    "data-testid": `step1-garment-card-${garmentType}`,
  });
  act(() => {
    selectedCard.props.onClick({ target: null });
  });
  assert.equal(
    garmentChangeCount,
    changeCountBeforeCardClick + 2,
    `Clicking selected ${garmentType}'s non-button card area must deselect it exactly once.`,
  );
  assert.equal(selectedGarmentTypes.includes(garmentType), false);
  act(() => {
    selectableRenderer.update(renderSelectable(selectedGarmentTypes));
  });
}
assert.equal(selectedGarmentTypes.length, 0);
assert.equal(garmentChangeCount, CUSTOMER_SELECTABLE_GARMENT_TYPES.length * 2);
assert.equal(constructionChangeCount, CUSTOMER_SELECTABLE_GARMENT_TYPES.length * 2);
garmentChangeCount = 0;
constructionChangeCount = 0;
const shirtSelect = selectableRenderer.root.findByProps({
  "data-testid": "step1-garment-select-shirt",
});
const shirtCard = selectableRenderer.root.findByProps({
  "data-testid": "step1-garment-card-shirt",
});
assert.equal(shirtSelect.props.type, "button");
assert.equal(shirtSelect.props["aria-pressed"], false);
assert.equal(shirtSelect.props["aria-label"], "Select Standard Shirt");
assert.equal(
  shirtSelect.findAllByProps({ "data-step1-deselect-cue": "true" }).length,
  0,
  "Unselected SELECT must not render the selected X cue",
);
assert.ok(
  shirtSelect.props.className.includes(STEP1_GARMENT_SELECT_ATTENTION_CLASS),
);
assert.ok(shirtSelect.props.className.includes("min-h-11"));
act(() => {
  shirtSelect.props.onClick();
  shirtCard.props.onClick({
    target: {
      closest: () => ({}),
    },
  });
});
assert.equal(
  garmentChangeCount,
  1,
  "A button click plus its card bubble must produce one garment-state transition.",
);
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
assert.equal(selectedShirtSelect.props.type, "button");
assert.equal(
  selectedShirtSelect.findAll(
    (node) => node !== selectedShirtSelect && node.props?.type === "button",
  ).length,
  0,
  "SELECTED must remain one native button without a nested X control",
);
const shirtDeselectCue = selectedShirtSelect.findByProps({
  "data-step1-deselect-cue": "true",
});
assert.equal(shirtDeselectCue.props["aria-hidden"], "true");
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
for (const garmentType of ["shirt", "trouser", "dress"] as const) {
  const selectedControl = selectableRenderer.root.findByProps({
    "data-testid": `step1-garment-select-${garmentType}`,
  });
  assert.equal(selectedControl.props["aria-pressed"], true);
  assert.ok(
    selectedControl.findByProps({ "data-step1-deselect-cue": "true" }),
    `${garmentType} selected control must show the X deselect cue`,
  );
}
act(() => {
  selectableRenderer.root
    .findByProps({ "data-testid": "step1-garment-select-trouser" })
    .props.onClick();
});
assert.deepEqual(selectedGarmentTypes, ["shirt", "dress"]);
assert.equal(garmentChangeCount, 6);
act(() => {
  selectableRenderer.update(renderSelectable(selectedGarmentTypes));
});
assert.equal(
  selectableRenderer.root.findByProps({
    "data-testid": "step1-garment-select-shirt",
  }).props["aria-pressed"],
  true,
);
assert.ok(
  selectableRenderer.root
    .findByProps({ "data-testid": "step1-garment-select-shirt" })
    .findByProps({ "data-step1-deselect-cue": "true" }),
);
assert.equal(
  selectableRenderer.root.findByProps({
    "data-testid": "step1-garment-select-dress",
  }).props["aria-pressed"],
  true,
);
assert.equal(
  selectableRenderer.root.findByProps({
    "data-testid": "step1-garment-select-trouser",
  }).props["aria-pressed"],
  false,
);
assert.equal(
  selectableRenderer.root
    .findByProps({ "data-testid": "step1-garment-select-trouser" })
    .findAllByProps({ "data-step1-deselect-cue": "true" }).length,
  0,
);
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
