import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { isAdditionalGarmentType } from "./src/config/AdditionalGarmentPolicy";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import { CATALOGUE_ADDITIONAL_GARMENT_TYPES } from "./src/utils/additionalGarmentDomain";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { setDecorativeFeatureGarmentAssignment } from "./src/utils/decorativePricing";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import { projectFutureCustomDetailsCatalogue } from "./src/utils/futureCustomDetailsCatalogue";
import {
  CUSTOMER_SELECTABLE_GARMENT_TYPES,
  getStep1GarmentDisplayLabel,
  orderByCustomerSelectableGarmentType,
  resolveGarmentConstructionPricing,
} from "./src/utils/garmentConstructionPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import type { FabricGarmentType, StyleCategory } from "./src/types";

const scrambled = [
  { garmentKey: "additional:shirt:1", garmentType: "shirt" as const },
  { garmentKey: "base:dress", garmentType: "dress" as const },
  { garmentKey: "base:standard_shorts", garmentType: "standard_shorts" as const },
  { garmentKey: "base:shirt", garmentType: "shirt" as const },
  { garmentKey: "base:skirt", garmentType: "skirt" as const },
  { garmentKey: "base:kaftan", garmentType: "kaftan" as const },
  { garmentKey: "other:1", garmentType: "other" as const },
  { garmentKey: "base:trouser", garmentType: "trouser" as const },
  { garmentKey: "base:bum_shorts", garmentType: "bum_shorts" as const },
  { garmentKey: "base:long_skirt", garmentType: "long_skirt" as const },
  { garmentKey: "base:full_length_gown", garmentType: "full_length_gown" as const },
];

const ordered = orderByCustomerSelectableGarmentType(
  scrambled,
  (item) => item.garmentType,
);

assert.deepEqual(
  ordered.map((item) => item.garmentKey),
  [
    "additional:shirt:1",
    "base:shirt",
    "base:trouser",
    "base:skirt",
    "base:long_skirt",
    "base:standard_shorts",
    "base:bum_shorts",
    "base:dress",
    "base:kaftan",
    "base:full_length_gown",
    "other:1",
  ],
);
const orderedTypes: FabricGarmentType[] = [];
for (const item of ordered) {
  if (item.garmentType === "other" || orderedTypes.includes(item.garmentType)) continue;
  orderedTypes.push(item.garmentType);
}
assert.deepEqual(orderedTypes, [...CUSTOMER_SELECTABLE_GARMENT_TYPES]);
assert.ok(
  ordered.findIndex((item) => item.garmentKey === "additional:shirt:1") <
    ordered.findIndex((item) => item.garmentKey === "base:shirt"),
  "repeated shirts keep the order they already had",
);

assert.deepEqual(
  CATALOGUE_ADDITIONAL_GARMENT_TYPES,
  CUSTOMER_SELECTABLE_GARMENT_TYPES.filter(isAdditionalGarmentType),
);

const style: StyleCategory = {
  id: "assign-order-style",
  name: "Assign Order",
  description: "Test",
  gender: "unisex",
  targetDemographic: "unisex",
  options: [],
  customDetailConfig: {
    representedGenders: ["male", "female"],
    featuresMaleAndFemale: true,
    supportedGarmentGroups: ["shirt", "dress", "neck", "trousers", "skirt"],
    requiredSelectionGroups: [],
    enabled: true,
  },
};

const catalogInspection = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const selectedGarmentTypes = CUSTOMER_SELECTABLE_GARMENT_TYPES.filter(
  (garmentType) => garmentType !== "agbada",
);
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: [...selectedGarmentTypes],
  selectedDemographic: "unisex",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
const reconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection,
  additionalGarmentConstructions: {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:shirt:1": resolveGarmentConstructionPricing(
        "shirt",
        catalogInspection.activeOptions,
      ),
    },
  },
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
const selections = setDecorativeFeatureGarmentAssignment(
  setDecorativeFeatureGarmentAssignment({}, "Name Monogram", "base:shirt", true),
  "Embroidery",
  "base:dress",
  true,
);

let renderer!: ReturnType<typeof create>;
act(() => {
  renderer = create(
    createElement(DormantFutureCustomDetailsStep, {
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
      onMonogramPlacementChange: () => undefined,
      onMonogramTextChange: () => undefined,
      onAccessoryToggle: () => undefined,
      onClearAccessories: () => undefined,
      onAddAdditionalGarment: () => undefined,
      onBack: () => undefined,
      onContinue: () => undefined,
    }),
  );
});

const textContent = (node: ReactTestInstance): string =>
  (node.children || [])
    .map((child) => (typeof child === "string" ? child : textContent(child)))
    .join("");

const assignKeys = (feature: string) => {
  const list = renderer.root.findByProps({
    "data-decorative-garment-assign": feature,
  });
  return list
    .findAll((node) => typeof node.props?.["data-decorative-garment"] === "string")
    .map((node) => node.props["data-decorative-garment"] as string);
};

const seen = new Set<string>();
const subjectParents: { garmentKey: string; garmentType: FabricGarmentType }[] = [];
reconciliation.subjects.forEach((subject) => {
  if (seen.has(subject.parentGarmentKey)) return;
  seen.add(subject.parentGarmentKey);
  subjectParents.push({
    garmentKey: subject.parentGarmentKey,
    garmentType: subject.parentGarmentType,
  });
});
const expectedKeys = orderByCustomerSelectableGarmentType(
  subjectParents,
  (parent) => parent.garmentType,
).map((parent) => parent.garmentKey);

assert.deepEqual(assignKeys("Name Monogram"), expectedKeys);
assert.deepEqual(assignKeys("Embroidery"), expectedKeys);
assert.deepEqual(expectedKeys.slice(0, 2), ["base:shirt", "additional:shirt:1"]);
assert.deepEqual(
  expectedKeys.map((garmentKey) =>
    getStep1GarmentDisplayLabel(
      subjectParents.find((parent) => parent.garmentKey === garmentKey)!.garmentType,
    ),
  ),
  [
    "Standard Shirt",
    "Standard Shirt",
    "Trouser",
    "Standard Skirt",
    "Long Skirt",
    "Standard Nikka Shorts",
    "Standard Bum Shorts",
    "Standard Dress",
    "Long Shirt",
    "Long Dress",
  ],
);

const monogramRows = renderer.root
  .findByProps({ "data-decorative-garment-assign": "Name Monogram" })
  .findAll((node) => typeof node.props?.["data-decorative-garment"] === "string")
  .map((node) => textContent(node).replace(/\s+/g, " "));
assert.match(monogramRows[0] || "", /Standard Shirt - Base garment/);
assert.match(monogramRows[1] || "", /Standard Shirt 2 - Added garment/);
assert.match(monogramRows[0] || "", /1 × €12\.00/);
assert.equal((monogramRows[1] || "").includes("€12.00"), false);

console.log("PASS: Step 5 assign lists follow the Step 1 garment order");
