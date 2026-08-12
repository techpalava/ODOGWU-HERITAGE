import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import {
  GarmentTypeStep,
  getGarmentTypeStepPresentation,
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
  "Shirt",
  "Trouser",
  "Skirt",
  "Nikka / Standard Shorts",
  "Bum Shorts",
  "Dress",
  "Kaftan",
  "Full-length Gown",
  "Agbada",
];

const renderStep = ({
  selectedGarmentTypes = [],
  selectedDemographic = null,
  normalizedCustomDetailCatalog = catalog,
}: {
  selectedGarmentTypes?: readonly FabricGarmentType[];
  selectedDemographic?: CustomDetailDemographic | null;
  normalizedCustomDetailCatalog?: readonly CustomDetailOption[];
} = {}) =>
  renderToStaticMarkup(
    createElement(GarmentTypeStep, {
      selectedGarmentTypes,
      selectedDemographic,
      normalizedCustomDetailCatalog,
      onGarmentTypesChange: () => undefined,
      onDemographicChange: () => undefined,
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

for (const demographic of ["male", "female", "unisex"] as const) {
  const markup = renderStep({ selectedDemographic: demographic });
  for (const label of expectedGarmentLabels) {
    assert.ok(markup.includes(label), `${label} must remain visible for ${demographic}`);
  }
}

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

const agbada = selectedPresentation.constructionPricing.find(
  (result) => result.garmentType === "agbada",
);
assert.equal(agbada?.status, "resolved");
if (agbada?.status === "resolved") {
  assert.equal(agbada.totalPriceCents, 14000);
  assert.equal(agbada.components.length, 2);
}

const capacityPresentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: ["shirt", "trouser", "skirt"],
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(capacityPresentation.garmentCount, 3);
assert.equal(capacityPresentation.capacityUnits, 3);
assert.equal(capacityPresentation.fabricQuantity, 2);
assert.equal(capacityPresentation.requiresMultipleFabricAllocations, true);

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
  selectedDemographic: "female",
});
assert.ok(populatedMarkup.includes("Step 1 of 9"));
assert.ok(populatedMarkup.includes("Garment Construction Subtotal"));
assert.ok(populatedMarkup.includes("€280.00"));
assert.ok(populatedMarkup.includes("Fabric, tax, shipping, and other selected options will be added in later steps."));
assert.equal(/upload your own design|uploaded design complete|design source/i.test(populatedMarkup), false);

console.log("Garment Type Step controlled component verification passed.");
