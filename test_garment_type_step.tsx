import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import {
  FABRIC_GARMENT_CAPACITY_UNITS,
  formatCustomerFacingFabricCapacityAmount,
  getGarmentFabricCapacityUsageCopy,
} from "./src/config/StyleFabricCapacityConfig";
import {
  GarmentTypeStep,
  getGarmentTypeStepLabel,
  getGarmentTypeStepPresentation,
  updateGarmentTypeDemographics,
  updateGarmentTypeSelection,
} from "./src/components/GarmentTypeStep";
import type {
  CustomDetailDemographic,
  CustomDetailOption,
  FabricGarmentType,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const expectedGarmentLabels = [
  "Standard Shirt",
  "Trouser",
  "Standard Skirt",
  "Standard Shorts (Nikka)",
  "Bum Shorts",
  "Standard Dress",
  "Long Shirt (Kaftan)",
  "Long Dress (Gown)",
];
const hiddenStep1GarmentLabels = ["Long Shirt (Agbada)"];

const renderStep = ({
  selectedGarmentTypes = [],
  selectedDemographics = [],
  requiredGarmentCount,
  requiredFabricQuantity,
  selectedFabricQuantity,
  normalizedCustomDetailCatalog = catalog,
}: {
  selectedGarmentTypes?: readonly FabricGarmentType[];
  selectedDemographics?: readonly CustomDetailDemographic[];
  requiredGarmentCount?: number;
  requiredFabricQuantity?: number;
  selectedFabricQuantity?: number;
  normalizedCustomDetailCatalog?: readonly CustomDetailOption[];
} = {}) =>
  renderToStaticMarkup(
    createElement(GarmentTypeStep, {
      selectedGarmentTypes,
      selectedDemographics,
      requiredGarmentCount,
      requiredFabricQuantity,
      selectedFabricQuantity,
      normalizedCustomDetailCatalog,
      onGarmentTypesChange: () => undefined,
      onDemographicsChange: () => undefined,
      onConstructionDefaultsChange: () => undefined,
    }),
  );

const emptyPresentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: [],
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(emptyPresentation.selectedGarmentTypes.length, 0);
assert.equal(emptyPresentation.constructionPricing.length, 0);
assert.equal(emptyPresentation.constructionSubtotalCents, 0);
assert.equal(emptyPresentation.customerFacingCapacityAmount, "0");

for (const demographic of ["male", "female", "unisex"] as const) {
  const markup = renderStep({ selectedDemographics: [demographic] });
  for (const label of expectedGarmentLabels) {
    assert.ok(markup.includes(label), `${label} must remain visible for ${demographic}`);
  }
  for (const label of hiddenStep1GarmentLabels) {
    assert.equal(
      markup.includes(label),
      false,
      `${label} must be hidden from Step 1 for ${demographic}`,
    );
  }
}
assert.deepEqual(
  expectedGarmentLabels,
  [
    "shirt",
    "trouser",
    "skirt",
    "standard_shorts",
    "bum_shorts",
    "dress",
    "kaftan",
    "full_length_gown",
  ].map((garmentType) =>
    getGarmentTypeStepLabel(
      garmentType as Exclude<FabricGarmentType, "other">,
    ),
  ),
);

const selectedPresentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: ["shirt", "trouser", "agbada"],
  normalizedCustomDetailCatalog: catalog,
});
assert.deepEqual(selectedPresentation.selectedGarmentTypes, [
  "shirt",
  "trouser",
  "agbada",
]);
assert.deepEqual(
  selectedPresentation.constructionPricing.map((result) =>
    result.status === "resolved"
      ? [result.garmentType, result.components.map((component) => component.optionId)]
      : [result.garmentType, result.code],
  ),
  [
    ["shirt", ["shirt_std_short"]],
    ["trouser", ["trouser_rope"]],
    ["agbada", ["shirt_std_short", "trouser_rope"]],
  ],
);
assert.equal(selectedPresentation.constructionSubtotalCents, 28000);

const confirmedPricePresentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: [
    "shirt",
    "dress",
    "standard_shorts",
    "bum_shorts",
    "trouser",
    "skirt",
  ],
  normalizedCustomDetailCatalog: catalog,
});
assert.deepEqual(
  confirmedPricePresentation.constructionPricing.map((resolution) => [
    resolution.garmentType,
    resolution.status === "resolved" ? resolution.totalPriceCents : null,
  ]),
  [
    ["shirt", 6500],
    ["trouser", 7500],
    ["skirt", 7500],
    ["standard_shorts", 7000],
    ["bum_shorts", 7000],
    ["dress", 7000],
  ],
);

const agbada = selectedPresentation.constructionPricing.find(
  (result) => result.garmentType === "agbada",
);
assert.equal(agbada?.status, "resolved");
if (agbada?.status === "resolved") {
  assert.equal(agbada.totalPriceCents, 14000);
  assert.equal(agbada.components.length, 2);
}

const kaftanPresentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: ["kaftan"],
  normalizedCustomDetailCatalog: catalog,
});
const kaftanPricing = kaftanPresentation.constructionPricing.find(
  (result) => result.garmentType === "kaftan",
);
assert.equal(kaftanPricing?.status, "resolved");
if (kaftanPricing?.status === "resolved") {
  assert.equal(kaftanPricing.totalPriceCents, 7000);
  assert.equal(kaftanPricing.components[0].optionId, "shirt_long_short");
}
assert.equal(
  kaftanPresentation.categories.find((category) => category.garmentType === "kaftan")
    ?.fabricUnits,
  1,
);

const halfCapacitySelectableTypes = [
  "shirt",
  "trouser",
  "skirt",
  "standard_shorts",
  "bum_shorts",
  "dress",
  "kaftan",
] as const;
for (const garmentType of halfCapacitySelectableTypes) {
  const category = emptyPresentation.categories.find(
    (entry) => entry.garmentType === garmentType,
  );
  assert.equal(FABRIC_GARMENT_CAPACITY_UNITS[garmentType], 1);
  assert.equal(category?.fabricUnits, 1);
  assert.equal(category?.fabricCapacityUsage, "Uses 1/2 fabric capacity unit.");
  assert.equal(
    getGarmentFabricCapacityUsageCopy(garmentType),
    "Uses 1/2 fabric capacity unit.",
  );
}
const gownCategory = emptyPresentation.categories.find(
  (category) => category.garmentType === "full_length_gown",
);
assert.equal(FABRIC_GARMENT_CAPACITY_UNITS.full_length_gown, 2);
assert.equal(gownCategory?.fabricUnits, 2);
assert.equal(gownCategory?.fabricCapacityUsage, "Uses 1 fabric capacity unit.");
assert.equal(
  getGarmentFabricCapacityUsageCopy("full_length_gown"),
  "Uses 1 fabric capacity unit.",
);

const emptyMarkup = renderStep();
assert.equal((emptyMarkup.match(/Uses 1\/2 fabric capacity unit\./g) || []).length, 7);
assert.equal((emptyMarkup.match(/Uses 1 fabric capacity unit\./g) || []).length, 1);
assert.equal(emptyMarkup.includes("Uses one fabric capacity unit."), false);
assert.equal(emptyMarkup.includes("Uses two fabric capacity units."), false);
assert.equal(emptyMarkup.includes("Uses 0.5"), false);
assert.ok(
  emptyPresentation.categories.every(
    (category) => !category.fabricCapacityUsage.includes("0.5"),
  ),
);

const assertSelectionCapacity = (
  selectedGarmentTypes: FabricGarmentType[],
  expectedInternalUnits: number,
  expectedCustomerAmount: string,
  expectedFabricQuantity: number,
) => {
  const presentation = getGarmentTypeStepPresentation({
    selectedGarmentTypes,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(presentation.capacityUnits, expectedInternalUnits);
  assert.equal(presentation.customerFacingCapacityAmount, expectedCustomerAmount);
  assert.equal(
    formatCustomerFacingFabricCapacityAmount(presentation.capacityUnits),
    expectedCustomerAmount,
  );
  assert.equal(presentation.fabricQuantity, expectedFabricQuantity);
};

assertSelectionCapacity(["shirt"], 1, "1/2", 1);
assertSelectionCapacity(["shirt", "trouser"], 2, "1", 1);
assertSelectionCapacity(["shirt", "trouser", "skirt"], 3, "1 1/2", 2);
assertSelectionCapacity(["shirt", "trouser", "skirt", "dress"], 4, "2", 2);
assertSelectionCapacity(["full_length_gown"], 2, "1", 1);
assertSelectionCapacity(["shirt", "full_length_gown"], 3, "1 1/2", 2);
assertSelectionCapacity(["shirt", "trouser", "full_length_gown"], 4, "2", 2);
assertSelectionCapacity(["kaftan"], 1, "1/2", 1);
assertSelectionCapacity(["kaftan", "shirt"], 2, "1", 1);
assertSelectionCapacity(["kaftan", "full_length_gown"], 3, "1 1/2", 2);

const kaftanPlusShirtPresentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: ["kaftan", "shirt"],
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(
  kaftanPlusShirtPresentation.constructionSubtotalCents,
  7000 + 6500,
  "Kaftan must contribute exactly once to the construction subtotal",
);

const capacityPresentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: ["shirt", "trouser", "skirt"],
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(capacityPresentation.garmentCount, 3);
assert.equal(capacityPresentation.capacityUnits, 3);
assert.equal(capacityPresentation.fabricQuantity, 2);
assert.equal(capacityPresentation.requiresMultipleFabricAllocations, true);

assert.deepEqual(
  updateGarmentTypeDemographics(["male"], "female", true),
  ["male", "female"],
);
assert.deepEqual(
  updateGarmentTypeDemographics(["male", "female"], "male", false),
  ["female"],
);

assert.deepEqual(
  updateGarmentTypeSelection(["shirt", "trouser"], "skirt", true),
  ["shirt", "trouser", "skirt"],
);
assert.deepEqual(
  updateGarmentTypeSelection(["shirt", "trouser", "skirt"], "trouser", false),
  ["shirt", "skirt"],
  "Removing a garment must remove its price source exactly once",
);

const repricedCatalog = normalizeCustomDetailCatalog([
  { id: "shirt_std_short", priceCents: 6900 },
]);
const repricedPresentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: ["shirt"],
  normalizedCustomDetailCatalog: repricedCatalog,
});
assert.equal(repricedPresentation.constructionSubtotalCents, 6900);

const unresolvedCatalog = catalog.filter(
  (option) => option.selectionGroup !== "shirt_construction",
);
const unresolvedPresentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: ["shirt"],
  normalizedCustomDetailCatalog: unresolvedCatalog,
});
assert.equal(unresolvedPresentation.constructionSubtotalCents, 0);
assert.equal(unresolvedPresentation.constructionPricing[0]?.status, "unresolved");
const unresolvedMarkup = renderStep({
  selectedGarmentTypes: ["shirt"],
  normalizedCustomDetailCatalog: unresolvedCatalog,
});
assert.ok(unresolvedMarkup.includes("Pricing review required"));
assert.equal(unresolvedMarkup.includes("€0.00"), false);

const populatedMarkup = renderStep({
  selectedGarmentTypes: ["shirt", "trouser", "agbada"],
  selectedDemographics: ["male", "female"],
  requiredGarmentCount: 4,
  requiredFabricQuantity: 3,
  selectedFabricQuantity: 2,
});
assert.ok(populatedMarkup.includes("Step 1 of 9"));
assert.ok(populatedMarkup.includes("What garment type do you want to order?"));
assert.ok(populatedMarkup.includes("Who is this design for?"));
assert.ok(populatedMarkup.includes("3 fabrics · 4 garments"));
assert.ok(populatedMarkup.includes("You need 3 fabrics for your 4 garments."));
assert.ok(populatedMarkup.includes("Fabrics selected: 2 / 3"));
assert.equal((populatedMarkup.match(/type="checkbox"/g) || []).length, 11);
assert.ok(populatedMarkup.includes("Garment Construction Subtotal"));
assert.ok(populatedMarkup.includes("€280.00"));
assert.ok(populatedMarkup.includes("Long Shirt (Agbada)"));
assert.equal(
  populatedMarkup.includes('id="garment-type-step-agbada"'),
  false,
  "Agbada must not expose a Step 1 selection control",
);
assert.ok(populatedMarkup.includes("Fabric, tax, shipping, and other selected options will be added in later steps."));
assert.equal(/upload your own design|uploaded design complete|design source/i.test(populatedMarkup), false);

console.log("Garment Type Step controlled component verification passed.");
