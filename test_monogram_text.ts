import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  areAssignedMonogramNamesComplete,
  calculateGarmentDetailsPrice,
  clearAllDecorativeFeatures,
  clearDecorativeFeatureAcrossGarments,
  clearDecorativeFeaturesForGarment,
  formatCartMonogramLines,
  prefillMonogramTextForGarment,
  setDecorativeFeatureGarmentAssignment,
  setMonogramTextForGarment,
} from "./src/utils/decorativePricing";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import { projectFutureCustomDetailsCatalogue } from "./src/utils/futureCustomDetailsCatalogue";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  MONOGRAM_TEXT_MAX_LENGTH,
  normalizeMonogramText,
  presentMonogramDraft,
  validateMonogramText,
} from "./src/utils/monogramText";
import type { DesignSelections, StyleCategory } from "./src/types";

const monogramStyle: StyleCategory = {
  id: "monogram-name-style",
  name: "Monogram Name Style",
  description: "A test garment.",
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

const assertStatus = (
  value: unknown,
  status: string,
  text?: string,
) => {
  const result = validateMonogramText(value);
  assert.equal(result.status, status, JSON.stringify(result));
  if (text !== undefined && result.status === "valid") {
    assert.equal(result.text, text);
  }
  if (text !== undefined && result.status === "too_long") {
    assert.equal(result.text, text);
  }
};

assertStatus("", "empty");
assertStatus("   ", "empty");
assertStatus("abcdefghijkl", "valid", "ABCDEFGHIJKL");
assert.equal("abcdefghijkl".length, MONOGRAM_TEXT_MAX_LENGTH);
assertStatus("abcdefghijklm", "too_long", "ABCDEFGHIJKLM");
assertStatus("ADE1", "invalid_characters");
assertStatus("ADE BAYO 🎉", "invalid_characters");
assertStatus("ADE-BAYO", "valid", "ADE-BAYO");
assertStatus("O'BRIEN", "valid", "O'BRIEN");
assertStatus("O’BRIEN", "valid", "O'BRIEN");
assertStatus("Chióma", "valid", "CHIÓMA");
assertStatus("  ade  bayo  ", "valid", "ADE BAYO");
assert.equal(normalizeMonogramText("ADE   BAYO"), "ADE BAYO");
assert.equal(presentMonogramDraft("ade "), "ADE ");
assertStatus(12, "invalid_characters");
assertStatus("---", "invalid_characters");

const shirtAndDress = {
  decorativeFeaturesByGarmentKey: {
    "base:shirt": ["Name Monogram" as const],
    "base:dress": ["Name Monogram" as const],
  },
  monogramPlacementByGarmentKey: {
    "base:shirt": "left_chest" as const,
    "base:dress": "left_chest" as const,
  },
  monogramTextByGarmentKey: {
    "base:shirt": "ADEBAYO",
    "base:dress": "CHIOMA",
  },
};

const unchecked = setDecorativeFeatureGarmentAssignment(
  shirtAndDress,
  "Name Monogram",
  "base:dress",
  false,
);
assert.equal(unchecked.monogramTextByGarmentKey?.["base:dress"], undefined);
assert.equal(unchecked.monogramTextByGarmentKey?.["base:shirt"], "ADEBAYO");
assert.equal(
  unchecked.decorativeFeaturesByGarmentKey?.["base:dress"],
  undefined,
);

const disabled = clearDecorativeFeatureAcrossGarments(
  shirtAndDress,
  "Name Monogram",
);
assert.deepEqual(disabled.monogramTextByGarmentKey, {});
assert.equal(disabled.monogramText, undefined);

const cleared = clearAllDecorativeFeatures(shirtAndDress);
assert.deepEqual(cleared.monogramTextByGarmentKey, {});
assert.equal(cleared.monogramText, undefined);

const removed = clearDecorativeFeaturesForGarment(shirtAndDress, "base:shirt");
assert.equal(removed.monogramTextByGarmentKey?.["base:shirt"], undefined);
assert.equal(removed.monogramTextByGarmentKey?.["base:dress"], "CHIOMA");

const parentOrder = ["base:shirt", "base:dress", "base:kaftan"];
const assignedKaftan = setDecorativeFeatureGarmentAssignment(
  shirtAndDress,
  "Name Monogram",
  "base:kaftan",
  true,
);
const prefilled = prefillMonogramTextForGarment(
  assignedKaftan,
  "base:kaftan",
  parentOrder,
);
assert.equal(prefilled.monogramTextByGarmentKey?.["base:kaftan"], "ADEBAYO");
const edited = setMonogramTextForGarment(prefilled, "base:kaftan", "Ngozi");
assert.equal(edited.monogramTextByGarmentKey?.["base:kaftan"], "NGOZI");
assert.equal(edited.monogramTextByGarmentKey?.["base:shirt"], "ADEBAYO");
assert.equal(edited.monogramTextByGarmentKey?.["base:dress"], "CHIOMA");
assert.equal(areAssignedMonogramNamesComplete(edited), true);
assert.equal(
  areAssignedMonogramNamesComplete(
    setMonogramTextForGarment(edited, "base:dress", ""),
  ),
  false,
);

const priced = calculateGarmentDetailsPrice(edited);
assert.equal(
  priced.decorativeFeatures.filter((feature) => feature.label === "Name Monogram")
    .length,
  3,
);
assert.ok(
  priced.decorativeFeatures
    .filter((feature) => feature.label === "Name Monogram")
    .every((feature) => feature.price === 12),
);
assert.equal(priced.monogramPrice, 36);

assert.deepEqual(formatCartMonogramLines(edited), [
  "CHIOMA · Left Chest",
  "NGOZI · Left Chest",
  "ADEBAYO · Left Chest",
]);
assert.deepEqual(
  formatCartMonogramLines({
    decorativeFeatures: ["Name Monogram"],
    monogramPlacement: "left_chest",
  }),
  ["Left Chest"],
);

const textContent = (node: ReactTestInstance): string => {
  const children = node.children || [];
  return children
    .map((child) => (typeof child === "string" ? child : textContent(child)))
    .join("");
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
const orderedGarmentKeys = ["base:shirt", "base:dress", "base:kaftan"];
const initialSelections: DesignSelections = {
  decorativeFeaturesByGarmentKey: {
    "base:shirt": ["Name Monogram"],
    "base:dress": ["Name Monogram"],
  },
  monogramPlacementByGarmentKey: {
    "base:shirt": "left_chest",
    "base:dress": "left_chest",
  },
  monogramTextByGarmentKey: {
    "base:shirt": "ADEBAYO",
    "base:dress": "CHIOMA",
  },
};

const MonogramStepHarness = ({
  seed = initialSelections,
}: {
  seed?: DesignSelections;
}) => {
  const [selections, setSelections] = useState(seed);
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
    selectedStyle: monogramStyle,
    additionalGarments: [],
    additionalGarmentConstructionOptions: [],
    onSingleSelect: () => undefined,
    onClearSelection: () => undefined,
    onConstructionSelect: () => undefined,
    onToggleMultiSelect: () => undefined,
    onPersonalizedTextChange: () => undefined,
    onDecorativeFeatureEnable: () => undefined,
    onDecorativeFeatureDisable: () => undefined,
    onDecorativeFeatureGarmentAssign: (feature, garmentKey, assigned) => {
      setSelections((current) => {
        const next = setDecorativeFeatureGarmentAssignment(
          current,
          feature,
          garmentKey,
          assigned,
        );
        if (!assigned || feature !== "Name Monogram") return next;
        return prefillMonogramTextForGarment(
          next,
          garmentKey,
          orderedGarmentKeys,
        );
      });
    },
    onClearDecorativeFeatures: () => undefined,
    onMonogramPlacementChange: () => undefined,
    onMonogramTextChange: (garmentKey, text) => {
      setSelections((current) =>
        setMonogramTextForGarment(current, garmentKey, text),
      );
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
  renderer = create(createElement(MonogramStepHarness, {}));
});

const nameInput = (garmentKey: string) =>
  renderer.root.findAll(
    (node) => node.props?.["data-monogram-name-input"] === garmentKey,
  );

assert.equal(nameInput("base:shirt")[0]?.props.value, "ADEBAYO");
assert.equal(nameInput("base:dress")[0]?.props.value, "CHIOMA");
assert.equal(nameInput("base:kaftan").length, 0);
assert.equal(
  nameInput("base:shirt")[0]?.props.value === nameInput("base:dress")[0]?.props.value,
  false,
);

const forwardButtons = () =>
  renderer.root.findAll(
    (node) => node.props?.["data-studio-nav"] === "forward",
  );
assert.ok(forwardButtons().length >= 1);
assert.ok(forwardButtons().every((button) => button.props.disabled !== true));

const shirtRow = renderer.root.findAll(
  (node) => node.props?.["data-decorative-garment"] === "base:shirt",
)[0];
const shirtPlacement = shirtRow
  ?.findAll((node) => node.type === "fieldset")
  .find((node) => textContent(node).includes("Monogram placement"));
const shirtName = shirtRow?.findAll(
  (node) => node.props?.["data-monogram-name-input"] === "base:shirt",
)[0];
if (shirtPlacement && shirtName) {
  const placementIndex = shirtRow.children.indexOf(shirtPlacement);
  const nameIndex = shirtRow.children.indexOf(shirtName.parent || shirtName);
  assert.ok(
    nameIndex >= 0 && placementIndex >= 0 && nameIndex < placementIndex,
    "the name field sits above the placement control",
  );
}

act(() => {
  nameInput("base:shirt")[0]?.props.onChange({ target: { value: "" } });
});
assert.equal(
  renderer.root.findByProps({ "data-monogram-name-error": "base:shirt" }).children.join(""),
  "Enter the name for this garment.",
);
assert.ok(forwardButtons().every((button) => button.props.disabled === true));

act(() => {
  nameInput("base:shirt")[0]?.props.onChange({ target: { value: "Ade1" } });
});
assert.equal(nameInput("base:shirt")[0]?.props.value, "ADE1");
assert.match(
  textContent(
    renderer.root.findByProps({ "data-monogram-name-error": "base:shirt" }),
  ),
  /letters, spaces, hyphens, and apostrophes/,
);
assert.ok(forwardButtons().every((button) => button.props.disabled === true));

act(() => {
  nameInput("base:shirt")[0]?.props.onChange({ target: { value: "nia" } });
});
assert.equal(nameInput("base:shirt")[0]?.props.value, "NIA");
assert.equal(nameInput("base:dress")[0]?.props.value, "CHIOMA");
assert.ok(forwardButtons().every((button) => button.props.disabled !== true));

const kaftanCheckbox = renderer.root
  .findAll((node) => node.props?.["data-decorative-garment"] === "base:kaftan")[0]
  ?.findAllByType("input")
  .find((input) => input.props.type === "checkbox");
assert.ok(kaftanCheckbox, "Long Shirt assignment checkbox renders");
act(() => {
  kaftanCheckbox?.props.onChange({ target: { checked: true } });
});
assert.equal(
  nameInput("base:kaftan")[0]?.props.value,
  "NIA",
  "a newly checked row is prefilled from the first stored name",
);
act(() => {
  nameInput("base:kaftan")[0]?.props.onChange({ target: { value: "Adaeze" } });
});
assert.equal(nameInput("base:kaftan")[0]?.props.value, "ADAEZE");
assert.equal(nameInput("base:shirt")[0]?.props.value, "NIA");
assert.ok(forwardButtons().every((button) => button.props.disabled !== true));

console.log("PASS: per-garment monogram names");
