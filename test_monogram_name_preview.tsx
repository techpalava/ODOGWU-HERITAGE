import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import {
  MONOGRAM_PREVIEW_CENTER_X,
  MONOGRAM_PREVIEW_FRAME_CLASS,
  MONOGRAM_PREVIEW_MIN_FONT,
  MONOGRAM_PREVIEW_SEAM_MARGIN_RATIO,
  MONOGRAM_PREVIEW_SILHOUETTE_BY_GARMENT_TYPE,
  MONOGRAM_PREVIEW_SILHOUETTES,
  MONOGRAM_PREVIEW_SLEEVE_SEAM_X,
  MONOGRAM_PREVIEW_VIEWBOX_WIDTH,
  MonogramNamePreview,
  monogramPreviewChestBox,
  monogramPreviewLetteringFit,
  monogramPreviewLineAdvance,
  monogramPreviewLetteringPosition,
  monogramPreviewOutline,
  monogramPreviewSilhouette,
  type MonogramPreviewSilhouette,
} from "./src/components/MonogramNamePreview";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  setMonogramPlacementForGarment,
  setMonogramTextForGarment,
} from "./src/utils/decorativePricing";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import { projectFutureCustomDetailsCatalogue } from "./src/utils/futureCustomDetailsCatalogue";
import { CUSTOMER_SELECTABLE_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { STEP1_GARMENT_REFERENCE_IMAGES } from "./src/utils/step1GarmentReferenceImages";
import type {
  CanonicalPhysicalGarmentType,
  DesignSelections,
  FabricGarmentType,
  MonogramPlacement,
  StyleCategory,
} from "./src/types";

const EXPECTED_SILHOUETTE: Record<CanonicalPhysicalGarmentType, MonogramPreviewSilhouette> = {
  shirt: "shirt",
  trouser: "trouser",
  skirt: "skirt",
  long_skirt: "long_skirt",
  standard_shorts: "nikka_shorts",
  bum_shorts: "bum_shorts",
  dress: "dress",
  kaftan: "long_shirt",
  full_length_gown: "long_dress",
  agbada: "agbada",
};

for (const garmentType of CUSTOMER_SELECTABLE_GARMENT_TYPES) {
  assert.equal(
    monogramPreviewSilhouette(garmentType),
    EXPECTED_SILHOUETTE[garmentType],
    `${garmentType} must use its Step 1 silhouette`,
  );
  assert.equal(
    MONOGRAM_PREVIEW_SILHOUETTE_BY_GARMENT_TYPE[garmentType],
    EXPECTED_SILHOUETTE[garmentType],
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(STEP1_GARMENT_REFERENCE_IMAGES, garmentType),
    `${garmentType} is a Step 1 reference garment`,
  );
}
assert.equal(monogramPreviewSilhouette("agbada"), "agbada");
assert.equal(monogramPreviewSilhouette("other"), "shirt");

const outlines = MONOGRAM_PREVIEW_SILHOUETTES.map((silhouette) => monogramPreviewOutline(silhouette));
assert.equal(new Set(outlines).size, MONOGRAM_PREVIEW_SILHOUETTES.length, "each silhouette has its own outline");
for (const garmentType of [
  "trouser",
  "skirt",
  "long_skirt",
  "standard_shorts",
  "bum_shorts",
  "kaftan",
  "full_length_gown",
] as const) {
  const silhouette = monogramPreviewSilhouette(garmentType);
  assert.notEqual(silhouette, "shirt", `${garmentType} must not fall back to the shirt outline`);
  assert.notEqual(silhouette, "dress", `${garmentType} must not fall back to the dress outline`);
  assert.notEqual(monogramPreviewOutline(silhouette), monogramPreviewOutline("shirt"));
  assert.notEqual(monogramPreviewOutline(silhouette), monogramPreviewOutline("dress"));
}
assert.notEqual(monogramPreviewOutline("long_skirt"), monogramPreviewOutline("skirt"));
assert.notEqual(monogramPreviewOutline("bum_shorts"), monogramPreviewOutline("nikka_shorts"));
assert.notEqual(monogramPreviewOutline("nikka_shorts"), monogramPreviewOutline("trouser"));

const hemTop = (silhouette: MonogramPreviewSilhouette) =>
  Number(monogramPreviewLetteringPosition("hem", silhouette).top.replace("%", ""));
assert.ok(hemTop("long_shirt") > hemTop("shirt"));
assert.ok(hemTop("long_dress") > hemTop("dress"));
assert.ok(hemTop("long_skirt") > hemTop("skirt"));
assert.ok(hemTop("trouser") > hemTop("nikka_shorts"));
assert.ok(hemTop("nikka_shorts") > hemTop("bum_shorts"));

for (const garmentType of Object.keys(EXPECTED_SILHOUETTE) as CanonicalPhysicalGarmentType[]) {
  let previewRenderer: ReturnType<typeof create>;
  act(() => {
    previewRenderer = create(
      createElement(MonogramNamePreview, {
        garmentKey: `base:${garmentType}`,
        garmentType: garmentType as FabricGarmentType,
        name: "",
      }),
    );
  });
  const node = previewRenderer!.root.findByProps({
    "data-monogram-name-preview": `base:${garmentType}`,
  });
  const silhouette = EXPECTED_SILHOUETTE[garmentType];
  assert.equal(node.props["data-monogram-preview-silhouette"], silhouette);
  assert.equal(node.props.className, MONOGRAM_PREVIEW_FRAME_CLASS);
  assert.equal(node.props.className.includes("w-24"), true);
  assert.equal(node.props.className.includes("32rem"), false);
  assert.equal(node.props.className.includes("basis-full"), false);
  const outline = node.findAllByType("path").find((path) => path.props.fill === "#F9F6F0");
  assert.equal(outline?.props.d, monogramPreviewOutline(silhouette));
}

const placements: MonogramPlacement[] = [
  "left_chest",
  "right_chest",
  "neckline",
  "upper_back",
  "cuff",
  "hem",
];
const positions = placements.map((placement) =>
  monogramPreviewLetteringPosition(placement, "shirt"),
);
const positionKeys = positions.map((position) => `${position.top}|${position.left}|${position.rotate}`);
assert.equal(new Set(positionKeys).size, placements.length);
assert.notEqual(
  monogramPreviewLetteringPosition("left_chest", "shirt").left,
  monogramPreviewLetteringPosition("right_chest", "shirt").left,
);
assert.notEqual(
  monogramPreviewLetteringPosition("hem", "dress").top,
  monogramPreviewLetteringPosition("hem", "shirt").top,
);

const shirtChest = monogramPreviewChestBox("shirt");
const dressChest = monogramPreviewChestBox("dress");
const seamMargin = MONOGRAM_PREVIEW_VIEWBOX_WIDTH * MONOGRAM_PREVIEW_SEAM_MARGIN_RATIO;
assert.ok(shirtChest.x > MONOGRAM_PREVIEW_CENTER_X, "left chest stays off the center line");
assert.ok(shirtChest.x < 41.2, "single-word box starts just past the placket");
assert.ok(shirtChest.width > 12.3, "single-word box runs wider across the chest");
assert.ok(shirtChest.y <= 25, "lettering starts just below the collar");
assert.ok(shirtChest.x + shirtChest.width < 58, "left chest stays inside the shirt body");
assert.ok(
  MONOGRAM_PREVIEW_SLEEVE_SEAM_X.shirt - (shirtChest.x + shirtChest.width) >= seamMargin - 0.001,
  "shirt lettering keeps a 6% margin from the sleeve seam",
);
assert.ok(dressChest.x > MONOGRAM_PREVIEW_CENTER_X);
assert.ok(dressChest.x < 41.2);
assert.ok(dressChest.width > shirtChest.width * 0.6);
assert.ok(dressChest.y <= 21.5, "dress lettering starts just below the collar");
assert.ok(dressChest.x + dressChest.width < 54);
assert.ok(
  MONOGRAM_PREVIEW_SLEEVE_SEAM_X.dress - (dressChest.x + dressChest.width) >= seamMargin - 0.001,
  "dress lettering keeps a 6% margin from the sleeve seam",
);
for (const sample of ["ADEBAYO", "MMMMMMMMMMMM", "IJ", "O'NEIL-ÉMI", "ADA OBI", "YOUR NAME"]) {
  for (const box of [shirtChest, dressChest]) {
    const fit = monogramPreviewLetteringFit(sample, box);
    const longestLine = fit.lines.reduce((best, line) =>
      Array.from(line).length > Array.from(best).length ? line : best,
    );
    const longest = Array.from(longestLine).length;
    assert.ok(fit.fontSize > 0.4);
    assert.ok(fit.fontSize <= box.height);
    assert.ok(
      longest * fit.fontSize * monogramPreviewLineAdvance(longestLine) <= box.width + 0.05,
    );
    assert.equal(fit.lines.join(""), sample.replace(/\s+/g, ""));
    assert.ok(
      fit.lines.every((line) => /^[^\s-]+-?$/.test(line)),
      `${sample} must not break a word or drop a hyphen`,
    );
    const textWidth = longest * fit.fontSize * monogramPreviewLineAdvance(longestLine);
    const leftEdge = box.x + box.width / 2 - textWidth / 2;
    assert.ok(leftEdge > MONOGRAM_PREVIEW_CENTER_X, `${sample} must not cross the center line`);
  }
}
const adebayoFit = monogramPreviewLetteringFit("ADEBAYO", shirtChest);
assert.equal(adebayoFit.lines.length, 1);
assert.ok(
  Array.from("ADEBAYO").length * adebayoFit.fontSize * monogramPreviewLineAdvance("ADEBAYO") >=
    shirtChest.width * 0.9,
  "a single word fills the wider chest box",
);
assert.deepEqual(monogramPreviewLetteringFit("IJ", shirtChest).lines, ["IJ"]);
assert.ok(monogramPreviewLetteringFit("IJ", shirtChest).fontSize >= MONOGRAM_PREVIEW_MIN_FONT);
assert.deepEqual(monogramPreviewLetteringFit("ADEBAYO", shirtChest).lines, ["ADEBAYO"]);
assert.deepEqual(monogramPreviewLetteringFit("MMMMMMMMMMMM", shirtChest).lines, ["MMMMMMMMMMMM"]);
assert.deepEqual(monogramPreviewLetteringFit("O'NEIL-ÉMI", shirtChest).lines, ["O'NEIL-", "ÉMI"]);
assert.deepEqual(monogramPreviewLetteringFit("ADA OBI", shirtChest).lines, ["ADA", "OBI"]);
assert.ok(
  monogramPreviewLetteringFit("IJ", shirtChest).fontSize >
    monogramPreviewLetteringFit("MMMMMMMMMMMM", shirtChest).fontSize,
);
assert.ok(
  monogramPreviewLetteringFit("ADEBAYO", shirtChest).fontSize >
    monogramPreviewLetteringFit("MMMMMMMMMMMM", shirtChest).fontSize,
);

const style: StyleCategory = {
  id: "monogram-preview-style",
  name: "Monogram Preview",
  description: "Test",
  gender: "female",
  targetDemographic: "female",
  options: [],
  customDetailConfig: {
    representedGenders: ["female"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: ["shirt", "dress", "neck"],
    requiredSelectionGroups: [],
    enabled: true,
  },
};

const catalogInspection = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "dress", "kaftan"],
  selectedDemographic: "female",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
const reconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection,
  catalogInspection,
  existingState: {
    schemaVersion: 1,
    selectionsByGarmentKey: {},
    snapshotsByGarmentKey: {},
  },
});
const catalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection,
  style: null,
  reconciliation,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [],
});
const pricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation,
  catalogInspection,
});

const initialSelections: DesignSelections = {
  decorativeFeaturesByGarmentKey: {
    "base:shirt": ["Name Monogram"],
    "base:dress": ["Name Monogram"],
  },
  monogramPlacementByGarmentKey: {
    "base:shirt": "left_chest",
    "base:dress": "hem",
  },
  monogramTextByGarmentKey: {
    "base:shirt": "ADEBAYO",
  },
};

const Harness = () => {
  const [selections, setSelections] = useState(initialSelections);
  return createElement(DormantFutureCustomDetailsStep, {
    stage: "personalized_additions",
    reconciliation,
    catalogue,
    personalizedInputs: createEmptyGarmentScopedCustomDetailInputs(),
    completion: { status: "complete", blockers: [] },
    pricing,
    orderLevelCustomDetailsPrice: 0,
    constructionBreakdown: { status: "complete", rows: [] },
    constructionSubtotal: 0,
    designSelections: selections,
    selectedStyle: style,
    additionalGarments: [],
    additionalGarmentConstructionOptions: [],
    onSingleSelect: () => undefined,
    onClearSelection: () => undefined,
    onConstructionSelect: () => undefined,
    onToggleMultiSelect: () => undefined,
    onPersonalizedTextChange: () => undefined,
    onDecorativeFeatureEnable: () => undefined,
    onDecorativeFeatureDisable: () => undefined,
    onDecorativeFeatureGarmentAssign: () => undefined,
    onClearDecorativeFeatures: () => undefined,
    onMonogramPlacementChange: (garmentKey, placement) => {
      setSelections((current) =>
        setMonogramPlacementForGarment(current, garmentKey, placement),
      );
    },
    onMonogramTextChange: (garmentKey, text) => {
      setSelections((current) => setMonogramTextForGarment(current, garmentKey, text));
    },
    onAccessoryToggle: () => undefined,
    onClearAccessories: () => undefined,
    onAddAdditionalGarment: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  });
};

let renderer!: ReturnType<typeof create>;
act(() => {
  renderer = create(createElement(Harness));
});

const preview = (garmentKey: string) =>
  renderer.root.findByProps({ "data-monogram-name-preview": garmentKey });

const lettering = (node: ReactTestInstance) =>
  node.findByProps({ "data-monogram-preview-lettering": "true" });

const letteringText = (node: ReactTestInstance) =>
  lettering(node)
    .children.map((child) =>
      typeof child === "string" ? child : (child as ReactTestInstance).children.join(""),
    )
    .join("");

const shirt = preview("base:shirt");
const dress = preview("base:dress");
assert.equal(shirt.props["data-monogram-preview-silhouette"], "shirt");
assert.equal(shirt.props["data-monogram-preview-placement"], "left_chest");
assert.equal(shirt.props["data-monogram-preview-text"], "ADEBAYO");
assert.equal(shirt.props["data-monogram-preview-placeholder"], "false");
assert.equal(letteringText(shirt), "ADEBAYO");
assert.equal(lettering(shirt).children.length, 1);
assert.ok(Number(lettering(shirt).props.x) > 40);
assert.ok(Number(lettering(shirt).props.fontSize) > 0);
assert.equal(lettering(shirt).props.fontWeight, 700);
assert.equal(lettering(shirt).props.fill, "#0A291B");
assert.equal(shirt.props.className, MONOGRAM_PREVIEW_FRAME_CLASS);
assert.match(String(shirt.props.className), /(^|\s)w-24(\s|$)/);
assert.doesNotMatch(String(shirt.props.className), /32rem|basis-full/);
assert.ok(
  Number(lettering(shirt).props.fontSize) >= 2,
  "ADEBAYO stays large enough to read on the desktop silhouette",
);
assert.match(String(lettering(shirt).props.clipPath), /monogram-chest-base-shirt-chest/);

assert.equal(dress.props["data-monogram-preview-silhouette"], "dress");
assert.equal(dress.props["data-monogram-preview-placement"], "hem");
assert.equal(dress.props["data-monogram-preview-text"], "");
assert.equal(dress.props["data-monogram-preview-placeholder"], "true");
assert.equal(lettering(dress).children.join(""), "YOUR NAME");
assert.equal(lettering(dress).props.style.top, "62%");
assert.notEqual(lettering(shirt).props.y, lettering(dress).props.style.top);

assert.equal(
  renderer.root.findAll(
    (node) => node.props?.["data-monogram-name-preview"] === "base:kaftan",
  ).length,
  0,
);

const shirtRow = renderer.root.findAll(
  (node) => node.props?.["data-decorative-garment"] === "base:shirt",
)[0];
const rowText = (node: ReactTestInstance): string =>
  (node.children || [])
    .map((child) => (typeof child === "string" ? child : rowText(child)))
    .join("");
assert.match(rowText(shirtRow), /€12\.00/);

act(() => {
  const upperBack = shirtRow
    .findAllByType("input")
    .find(
      (input) =>
        input.props.type === "radio" &&
        rowText(input.parent || input).includes("Upper Back"),
    );
  upperBack?.props.onChange();
});
assert.equal(preview("base:shirt").props["data-monogram-preview-placement"], "upper_back");
assert.equal(preview("base:shirt").props["data-monogram-preview-view"], "back");
assert.equal(lettering(preview("base:shirt")).props.style.left, "50%");

const dressInput = renderer.root.findByProps({ "data-monogram-name-input": "base:dress" });
act(() => {
  dressInput.props.onChange({ target: { value: "chioma" } });
});
assert.equal(preview("base:dress").props["data-monogram-preview-text"], "CHIOMA");
assert.equal(lettering(preview("base:dress")).children.join(""), "CHIOMA");
assert.equal(preview("base:shirt").props["data-monogram-preview-text"], "ADEBAYO");

console.log("PASS: Name Monogram preview shows the live name on the garment silhouette");
