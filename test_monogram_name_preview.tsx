import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import {
  MONOGRAM_PREVIEW_MIN_FONT,
  monogramPreviewChestBox,
  monogramPreviewLetteringFit,
  monogramPreviewLetteringPosition,
  monogramPreviewSilhouette,
} from "./src/components/MonogramNamePreview";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  setDecorativeFeatureGarmentAssignment,
  setMonogramPlacementForGarment,
  setMonogramTextForGarment,
} from "./src/utils/decorativePricing";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import { projectFutureCustomDetailsCatalogue } from "./src/utils/futureCustomDetailsCatalogue";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import type { DesignSelections, MonogramPlacement, StyleCategory } from "./src/types";

assert.equal(monogramPreviewSilhouette("shirt"), "shirt");
assert.equal(monogramPreviewSilhouette("kaftan"), "shirt");
assert.equal(monogramPreviewSilhouette("dress"), "dress");
assert.equal(monogramPreviewSilhouette("full_length_gown"), "dress");

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
assert.ok(shirtChest.x > 40, "left chest sits on the viewer's right");
assert.ok(shirtChest.x + shirtChest.width < 58, "left chest stays inside the shirt body");
assert.ok(dressChest.x > 40);
assert.ok(dressChest.x + dressChest.width < 54);
for (const sample of ["ADEBAYO", "MMMMMMMMMMMM", "IJ", "O'NEIL-ÉMI", "YOUR NAME"]) {
  for (const box of [shirtChest, dressChest]) {
    const fit = monogramPreviewLetteringFit(sample, box);
    assert.ok(fit.fontSize >= MONOGRAM_PREVIEW_MIN_FONT);
    assert.ok(fit.fontSize <= box.height);
    if (fit.textLength !== undefined) {
      assert.ok(fit.textLength <= box.width);
      assert.ok(fit.textLength > 0);
    }
  }
}
assert.equal(monogramPreviewLetteringFit("IJ", shirtChest).textLength, undefined);
assert.ok(monogramPreviewLetteringFit("ADEBAYO", shirtChest).textLength);
assert.ok(monogramPreviewLetteringFit("MMMMMMMMMMMM", shirtChest).textLength);
assert.ok(
  (monogramPreviewLetteringFit("IJ", shirtChest).fontSize ?? 0) >
    (monogramPreviewLetteringFit("MMMMMMMMMMMM", shirtChest).fontSize ?? 0),
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

const shirt = preview("base:shirt");
const dress = preview("base:dress");
assert.equal(shirt.props["data-monogram-preview-silhouette"], "shirt");
assert.equal(shirt.props["data-monogram-preview-placement"], "left_chest");
assert.equal(shirt.props["data-monogram-preview-text"], "ADEBAYO");
assert.equal(shirt.props["data-monogram-preview-placeholder"], "false");
assert.equal(lettering(shirt).children.join(""), "ADEBAYO");
assert.ok(Number(lettering(shirt).props.x) > 40);
assert.ok(Number(lettering(shirt).props.textLength) <= shirtChest.width);
assert.match(String(lettering(shirt).props.clipPath), /monogram-chest-base-shirt-chest/);

assert.equal(dress.props["data-monogram-preview-silhouette"], "dress");
assert.equal(dress.props["data-monogram-preview-placement"], "hem");
assert.equal(dress.props["data-monogram-preview-text"], "");
assert.equal(dress.props["data-monogram-preview-placeholder"], "true");
assert.equal(lettering(dress).children.join(""), "YOUR NAME");
assert.equal(lettering(dress).props.style.top, "80%");
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
