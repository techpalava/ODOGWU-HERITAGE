import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import {
  MONOGRAM_PREVIEW_FRAME_CLASS,
  MONOGRAM_PREVIEW_SILHOUETTES,
  MonogramNamePreview,
  monogramPlacementDot,
  monogramPlacementMapForGarment,
  monogramPlacementNameAnchor,
  monogramPreviewOutline,
  monogramPreviewSilhouette,
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
import {
  getAvailableMonogramPlacements,
  getDefaultMonogramPlacementForGarmentType,
  resolveMonogramPlacementForGarmentType,
} from "./src/utils/decorativePricing";
import { STEP_1_GARMENT_DISPLAY_LABELS } from "./src/utils/garmentConstructionPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import type {
  CanonicalPhysicalGarmentType,
  DesignSelections,
  MonogramPlacement,
  StyleCategory,
} from "./src/types";

const placements: MonogramPlacement[] = [
  "left_chest",
  "right_chest",
  "neckline",
  "upper_back",
  "cuff",
  "hem",
];
const shirtDotKeys = placements.map((placement) => {
  const dot = monogramPlacementDot("shirt", placement);
  return `${dot.cx}|${dot.cy}`;
});
assert.equal(new Set(shirtDotKeys).size, placements.length, "each shirt placement has its own dot");
assert.ok(monogramPlacementDot("shirt", "left_chest").cx > monogramPlacementDot("shirt", "right_chest").cx);
assert.ok(monogramPlacementDot("shirt", "neckline").cy < monogramPlacementDot("shirt", "left_chest").cy);
assert.ok(monogramPlacementDot("shirt", "hem").cy > monogramPlacementDot("shirt", "upper_back").cy);
assert.equal(
  monogramPlacementDot("trouser", "hem").cy,
  monogramPlacementDot("shirt", "hem").cy,
  "the placement map uses one hem position; the icon identifies the garment",
);
const outlines = MONOGRAM_PREVIEW_SILHOUETTES.map((silhouette) => {
  const garmentType = silhouette === "long_shirt"
    ? "kaftan"
    : silhouette === "long_dress"
      ? "full_length_gown"
      : silhouette === "nikka_shorts"
        ? "standard_shorts"
        : silhouette;
  return monogramPreviewOutline(garmentType);
});
assert.equal(new Set(outlines).size, MONOGRAM_PREVIEW_SILHOUETTES.length);
assert.notEqual(monogramPreviewOutline("trouser"), monogramPreviewOutline("shirt"));
assert.notEqual(monogramPreviewSilhouette("trouser"), monogramPreviewSilhouette("shirt"));

const shirtMap = monogramPlacementMapForGarment("shirt", "left_chest");
assert.equal(shirtMap.active, "left_chest");
assert.deepEqual(shirtMap.dots.includes("cuff"), false);
assert.deepEqual(shirtMap.dots, [
  "left_chest",
  "right_chest",
  "neckline",
  "upper_back",
  "hem",
]);
assert.equal(
  monogramPlacementMapForGarment("shirt", "left_chest", ["hem", "neckline", "left_chest"]).dots.includes(
    "left_chest",
  ),
  true,
);
assert.equal(
  monogramPlacementMapForGarment("shirt", "cuff", ["left_chest", "hem", "cuff"]).dots.includes("cuff"),
  true,
);

const lowerBodyTypes = [
  "trouser",
  "skirt",
  "long_skirt",
  "standard_shorts",
  "bum_shorts",
] as const satisfies readonly CanonicalPhysicalGarmentType[];
for (const garmentType of lowerBodyTypes) {
  assert.equal(
    getDefaultMonogramPlacementForGarmentType(garmentType),
    "hem",
    `${STEP_1_GARMENT_DISPLAY_LABELS[garmentType]} defaults to Hem`,
  );
  assert.deepEqual(
    getAvailableMonogramPlacements({}, null, { type: garmentType }).map(
      (option) => option.value,
    ),
    ["hem"],
    `${STEP_1_GARMENT_DISPLAY_LABELS[garmentType]} does not offer Left Chest`,
  );
  const resolved = resolveMonogramPlacementForGarmentType(garmentType, "left_chest");
  assert.equal(resolved, "hem");
  const drawn = monogramPlacementMapForGarment(garmentType, "left_chest", [
    "left_chest",
    "neckline",
    "hem",
  ]);
  assert.equal(drawn.active, "hem");
  assert.deepEqual(drawn.dots, ["hem"]);
}
assert.equal(getDefaultMonogramPlacementForGarmentType("shirt"), "left_chest");
assert.equal(getDefaultMonogramPlacementForGarmentType("kaftan"), "left_chest");
assert.equal(getDefaultMonogramPlacementForGarmentType("dress"), "left_chest");
assert.equal(STEP_1_GARMENT_DISPLAY_LABELS.trouser, "Trouser");
assert.equal(STEP_1_GARMENT_DISPLAY_LABELS.standard_shorts, "Standard Nikka Shorts");

const dotState = (node: ReactTestInstance, placement: MonogramPlacement) =>
  node.findByProps({ "data-monogram-placement-dot": placement }).props[
    "data-monogram-placement-dot-state"
  ];

let mapRenderer: ReturnType<typeof create>;
act(() => {
  mapRenderer = create(
    createElement(MonogramNamePreview, {
      garmentKey: "base:trouser",
      garmentType: "trouser",
      name: "",
      placement: "left_chest",
      placements: ["left_chest", "neckline", "hem"],
    }),
  );
});
const trouserMap = mapRenderer!.root.findByProps({
  "data-monogram-name-preview": "base:trouser",
});
assert.equal(trouserMap.props["data-monogram-preview-kind"], "icon-placement-map");
assert.equal(trouserMap.props["data-monogram-preview-placement"], "hem");
assert.equal(trouserMap.props.className, MONOGRAM_PREVIEW_FRAME_CLASS);
assert.match(String(trouserMap.props.className), /(^|\s)w-24(\s|$)/);
assert.doesNotMatch(String(trouserMap.props.className), /32rem|basis-full/);
assert.equal(trouserMap.findAllByType("rect").length, 0);
assert.equal(
  trouserMap.findByProps({ "data-monogram-garment-icon": "true" }).props.d,
  monogramPreviewOutline("trouser"),
);
assert.equal(
  trouserMap.findByProps({ "data-monogram-garment-label": "trouser" }).children.join(""),
  "Trouser",
);
assert.equal(trouserMap.findByProps({ "data-monogram-placement-map": "true" }).findAllByType("path").length, 0);
assert.equal(trouserMap.props["data-monogram-preview-silhouette"], "trouser");
assert.equal(trouserMap.findAllByProps({ "data-monogram-placement-dot": "left_chest" }).length, 0);
assert.equal(trouserMap.findAllByProps({ "data-monogram-placement-dot": "neckline" }).length, 0);
assert.equal(dotState(trouserMap, "hem"), "active");
assert.equal(trouserMap.findByProps({ "data-monogram-placement-dot": "hem" }).props.fill, "#0A291B");
assert.equal(trouserMap.findByProps({ "data-monogram-placement-label": "hem" }).children.join(""), "Hem");
assert.equal(trouserMap.props["data-monogram-preview-placeholder"], "true");
assert.equal(
  trouserMap.findByProps({ "data-monogram-preview-lettering": "true" }).props[
    "data-monogram-preview-lettering-anchor"
  ],
  "50%",
);
assert.equal(trouserMap.findByProps({ "data-monogram-preview-lettering": "true" }).props.style, undefined);
assert.equal(
  trouserMap.findByProps({ "data-monogram-placement-dot": "hem" }).props.cy,
  monogramPlacementDot("trouser", "hem").cy,
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
assert.equal(shirt.props["data-monogram-preview-kind"], "icon-placement-map");
assert.equal(shirt.props["data-monogram-preview-silhouette"], "shirt");
assert.equal(
  shirt.findByProps({ "data-monogram-garment-icon": "true" }).props.d,
  monogramPreviewOutline("shirt"),
);
assert.equal(
  shirt.findByProps({ "data-monogram-garment-label": "shirt" }).children.join(""),
  "Standard Shirt",
);
assert.notEqual(
  shirt.findByProps({ "data-monogram-garment-icon": "true" }).props.d,
  trouserMap.findByProps({ "data-monogram-garment-icon": "true" }).props.d,
);
assert.equal(shirt.props["data-monogram-preview-placement"], "left_chest");
assert.equal(shirt.props["data-monogram-preview-text"], "ADEBAYO");
assert.equal(shirt.props["data-monogram-preview-placeholder"], "false");
assert.equal(letteringText(shirt), "ADEBAYO");
assert.equal(dotState(shirt, "left_chest"), "active");
assert.equal(dotState(shirt, "hem"), "available");
assert.equal(shirt.props.className, MONOGRAM_PREVIEW_FRAME_CLASS);
assert.match(String(shirt.props.className), /(^|\s)w-24(\s|$)/);
assert.doesNotMatch(String(shirt.props.className), /32rem|basis-full/);

assert.equal(dress.props["data-monogram-preview-kind"], "icon-placement-map");
assert.equal(dress.props["data-monogram-preview-placement"], "hem");
assert.equal(dress.props["data-monogram-preview-text"], "");
assert.equal(dress.props["data-monogram-preview-placeholder"], "true");
assert.equal(lettering(dress).children.join(""), "YOUR NAME");
assert.equal(
  lettering(dress).props["data-monogram-preview-lettering-anchor"],
  monogramPlacementNameAnchor("dress", "hem").left,
);
assert.equal(dotState(dress, "hem"), "active");
assert.equal(dotState(dress, "left_chest"), "available");
assert.notEqual(
  monogramPlacementNameAnchor("shirt", "left_chest").top,
  monogramPlacementNameAnchor("dress", "hem").top,
);

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
assert.equal(dotState(preview("base:shirt"), "upper_back"), "active");
assert.equal(dotState(preview("base:shirt"), "left_chest"), "available");
assert.equal(
  lettering(preview("base:shirt")).props["data-monogram-preview-lettering-anchor"],
  "50%",
);

const dressInput = renderer.root.findByProps({ "data-monogram-name-input": "base:dress" });
act(() => {
  dressInput.props.onChange({ target: { value: "chioma" } });
});
assert.equal(preview("base:dress").props["data-monogram-preview-text"], "CHIOMA");
assert.equal(lettering(preview("base:dress")).children.join(""), "CHIOMA");
assert.equal(preview("base:shirt").props["data-monogram-preview-text"], "ADEBAYO");

console.log("PASS: Name Monogram preview shows the live name on the placement map");
