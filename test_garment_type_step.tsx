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
import { STEP_1_SELECTABLE_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import { getGarmentTypeStepSelectedFabricQuantity } from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import type {
  CustomDetailDemographic,
  CustomDetailOption,
  FabricGarmentType,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { resolveLockedGarmentConstructionBridge } from "./src/utils/garmentConstructionCustomDetails";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const expectedGarmentLabels = [
  "Standard Shirt",
  "Long shirt",
  "Standard Dress",
  "Long Dress",
  "Standard Nikka Shorts",
  "Standard Bum Shorts",
  "Trouser",
  "Standard Skirt",
  "Long Skirt",
];
const hiddenStep1GarmentLabels = ["Long Shirt (Agbada)"];
const approvedGarmentIds = [
  "shirt", "kaftan", "dress", "full_length_gown",
  "standard_shorts", "bum_shorts", "trouser", "skirt", "long_skirt",
] as const;
const approvedPrices = [65, 75, 70, 75, 70, 70, 75, 75, 80];
assert.deepEqual(STEP_1_SELECTABLE_GARMENT_TYPES, approvedGarmentIds);

const renderStep = ({
  selectedGarmentTypes = [],
  selectedDemographics = [],
  selectedFabricQuantity,
  normalizedCustomDetailCatalog = catalog,
}: {
  selectedGarmentTypes?: readonly FabricGarmentType[];
  selectedDemographics?: readonly CustomDetailDemographic[];
  selectedFabricQuantity?: number;
  normalizedCustomDetailCatalog?: readonly CustomDetailOption[];
} = {}) =>
  renderToStaticMarkup(
    createElement(GarmentTypeStep, {
      selectedGarmentTypes,
      selectedDemographics,
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
assert.equal(emptyPresentation.categories.length, 9);
assert.deepEqual(emptyPresentation.categories.map((item) => item.garmentType), approvedGarmentIds);
assert.deepEqual(emptyPresentation.categories.map((item) => item.label), expectedGarmentLabels);
assert.deepEqual(emptyPresentation.categories.map((item) => item.fabricUnits), [1, 1, 1, 2, 1, 1, 1, 1, 1]);

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
    "kaftan",
    "dress",
    "full_length_gown",
    "standard_shorts",
    "bum_shorts",
    "trouser",
    "skirt",
    "long_skirt",
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
assert.equal(selectedPresentation.garmentCount, 2);
assert.equal(selectedPresentation.fabricQuantity, 1);

const confirmedPricePresentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: [
    "shirt",
    "dress",
    "standard_shorts",
    "bum_shorts",
    "trouser",
    "skirt",
    "long_skirt",
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
    ["long_skirt", 8000],
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
  assert.equal(kaftanPricing.totalPriceCents, 7500);
  assert.equal(kaftanPricing.components[0].optionId, "shirt_long_midlong");
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
  "long_skirt",
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
assert.equal((emptyMarkup.match(/Uses 1\/2 fabric capacity unit\./g) || []).length, 8);
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
assertSelectionCapacity(["skirt", "long_skirt"], 2, "1", 1);
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
  7500 + 6500,
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
  selectedFabricQuantity: 1,
});
assert.ok(populatedMarkup.includes("Step 1 of 9"));
assert.ok(populatedMarkup.includes("What garment type do you want to order?"));
assert.ok(populatedMarkup.includes("Who is this design for?"));
assert.ok(populatedMarkup.includes("1 fabric · 2 garments"));
assert.ok(populatedMarkup.includes("You need 1 fabric for your 2 garments."));
assert.equal(
  populatedMarkup.includes("Fabrics selected:"),
  false,
  "Step 1 must not show Fabric-selection progress.",
);
assert.equal(
  populatedMarkup.includes("Fabrics Selected:"),
  false,
  "Step 1 must not show Fabric-selection progress.",
);
assert.equal(
  (populatedMarkup.match(/1 fabric · 2 garments/g) || []).length,
  1,
  "Fabric quantity summary must render once",
);
const garmentTypeLegendIndex = populatedMarkup.indexOf("Garment Type");
const fabricSummaryIndex = populatedMarkup.indexOf("1 fabric · 2 garments");
const standardShirtCardIndex = populatedMarkup.indexOf("Standard Shirt");
const demographicLegendIndex = populatedMarkup.indexOf("Who is this design for?");
assert.ok(garmentTypeLegendIndex < fabricSummaryIndex);
assert.ok(fabricSummaryIndex < standardShirtCardIndex);
assert.ok(fabricSummaryIndex < demographicLegendIndex);
assert.equal((populatedMarkup.match(/type="checkbox"/g) || []).length, 3);
assert.ok(populatedMarkup.includes("Garment Construction Subtotal"));
assert.ok(populatedMarkup.includes("€280.00"));
assert.ok(populatedMarkup.includes("Long Shirt (Agbada)"));
assert.equal(
  populatedMarkup.includes('id="garment-type-step-agbada"'),
  false,
  "Agbada must not expose a Step 1 selection control",
);
assert.ok(populatedMarkup.includes("Fabric, tax, shipping, and other selected options will be added in later steps."));
assert.equal(/uploaded design complete|design source/i.test(populatedMarkup), false);
assert.ok(
  populatedMarkup.includes(
    "Step 3 will show every published Design Style, and you can map any reference to the exact garments you choose.",
  ),
);

const skirtOnlyMarkup = renderStep({
  selectedGarmentTypes: ["skirt"],
  selectedDemographics: ["female"],
});
assert.equal(
  skirtOnlyMarkup.includes("No direct catalogue composition match found"),
  false,
  "Step 1 must focus on physical garment selection, without catalogue-composition messaging",
);
assert.ok(skirtOnlyMarkup.includes("Standard Skirt"));
assert.ok(skirtOnlyMarkup.includes("Uses 1/2 fabric capacity unit."));

const allEightStep1Markup = renderStep({
  selectedGarmentTypes: [...STEP_1_SELECTABLE_GARMENT_TYPES],
  selectedDemographics: ["male"],
});
assert.ok(allEightStep1Markup.includes("5 fabrics · 9 garments"));
assert.ok(
  allEightStep1Markup.includes("You need 5 fabrics for your 9 garments."),
);

const allEightWithSelectedFabricMarkup = renderStep({
  selectedGarmentTypes: [...STEP_1_SELECTABLE_GARMENT_TYPES],
  selectedDemographics: ["male"],
  selectedFabricQuantity: 1,
});
assert.ok(allEightWithSelectedFabricMarkup.includes("5 fabrics · 9 garments"));
assert.equal(
  allEightWithSelectedFabricMarkup.includes("Fabrics selected:"),
  false,
  "Step 1 must not show Fabric-selection progress.",
);

const allEightWithHiddenAgbadaMarkup = renderStep({
  selectedGarmentTypes: [...STEP_1_SELECTABLE_GARMENT_TYPES, "agbada"],
  selectedDemographics: ["male"],
});
assert.ok(allEightWithHiddenAgbadaMarkup.includes("5 fabrics · 9 garments"));
assert.ok(
  allEightWithHiddenAgbadaMarkup.includes(
    "You need 5 fabrics for your 9 garments.",
  ),
);

const shirtTrouserHiddenAgbadaMarkup = renderStep({
  selectedGarmentTypes: ["shirt", "trouser", "agbada"],
  selectedDemographics: ["male"],
  selectedFabricQuantity: 1,
});
assert.ok(shirtTrouserHiddenAgbadaMarkup.includes("1 fabric · 2 garments"));
assert.equal(
  shirtTrouserHiddenAgbadaMarkup.includes("Fabrics selected: 1 / 1"),
  false,
  "Step 1 must not show Fabric-selection progress.",
);

const shirtTrouserDressPresentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: ["shirt", "trouser", "dress"],
  normalizedCustomDetailCatalog: catalog,
});
assert.deepEqual(
  shirtTrouserDressPresentation.categories
    .filter((category) => category.selected)
    .map((category) => category.garmentType),
  ["shirt", "dress", "trouser"],
);
assert.equal(shirtTrouserDressPresentation.constructionSubtotalCents, 21000);
assert.equal(
  JSON.stringify(shirtTrouserDressPresentation).includes("/images/garments"),
  false,
  "Reference image paths must not enter Step 1 presentation/pricing state",
);
const shirtTrouserDressMarkup = renderStep({
  selectedGarmentTypes: ["shirt", "trouser", "dress"],
});
assert.ok(shirtTrouserDressMarkup.includes("€210.00"));
assert.ok(shirtTrouserDressMarkup.includes("Ankara Standard Shirt reference"));
assert.equal(
  (shirtTrouserDressMarkup.match(/Reference images show garment types only\./g) || [])
    .length,
  1,
);

const deselectedShirtMarkup = renderStep({
  selectedGarmentTypes: STEP_1_SELECTABLE_GARMENT_TYPES.filter(
    (garmentType) => garmentType !== "shirt",
  ),
  selectedDemographics: ["male"],
});
assert.ok(deselectedShirtMarkup.includes("5 fabrics · 8 garments"));

const allEightSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: [...STEP_1_SELECTABLE_GARMENT_TYPES],
  selectedDemographics: ["male"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const approvedProjection = resolveLockedGarmentConstructionBridge({
  mode: "garment_type_locked",
  garmentTypeSelection: allEightSelection,
  catalog,
  selections: {},
});
assert.deepEqual(
  approvedGarmentIds.map((id) => approvedProjection.readOnlyConstructionRows.find((row) => row.garmentType === id)?.price),
  approvedPrices,
  "Downstream construction projection must receive every approved catalogue price",
);
assert.equal(approvedProjection.readOnlyConstructionRows.reduce((sum, row) => sum + row.priceCents, 0), 65500);
for (const [garmentType, optionId] of [
  ["kaftan", "shirt_long_midlong"],
  ["full_length_gown", "dress_long_short"],
  ["dress", "dress_std_sleeveless"],
] as const) {
  assert.deepEqual(
    approvedProjection.readOnlyConstructionRows.find((row) => row.garmentType === garmentType)
      ?.components.map((component) => component.optionId),
    [optionId],
    `${garmentType} must preserve its Step 1 construction in Custom Details`,
  );
}
assert.deepEqual(allEightSelection.garmentTypes, [
  "shirt", "trouser", "skirt", "long_skirt", "standard_shorts", "bum_shorts", "dress", "kaftan", "full_length_gown",
], "Display reordering must preserve canonical selection identity and ordering");
const renderedCards = [...allEightStep1Markup.matchAll(/<article[^>]+data-testid="step1-garment-card-([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
assert.deepEqual(renderedCards.map((match) => match[1]), approvedGarmentIds);
renderedCards.forEach((match, index) => {
  assert.ok(match[2].includes(expectedGarmentLabels[index]));
  assert.ok(match[2].includes(`€${approvedPrices[index].toFixed(2)}`));
  assert.equal(/With Rope|LONG SLEEVES|crotch|upper-thigh/.test(match[2]), false);
});
const additionalOnlyFabricState = {
  fabricAllocations: [
    {
      allocationId: "fabric-selection-additional-1",
      fabricCode: "ODG-002",
      garmentAssignments: [
        {
          garmentKey: "additional:shirt:1",
          code: "ADDITIONAL_SHIRT_1",
          garmentType: "shirt" as const,
          fabricUnits: 1 as const,
          sourceRole: "additional" as const,
          dependencyStatus: "valid" as const,
        },
      ],
    },
  ],
  activeAllocationId: "fabric-selection-additional-1",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assert.equal(
  getGarmentTypeStepSelectedFabricQuantity({
    garmentTypeSelection: allEightSelection,
    fabricAllocationState: additionalOnlyFabricState,
  }),
  0,
);
const additionalOnlyFabricMarkup = renderStep({
  selectedGarmentTypes: [...STEP_1_SELECTABLE_GARMENT_TYPES],
  selectedDemographics: ["male"],
  selectedFabricQuantity: 0,
});
assert.ok(additionalOnlyFabricMarkup.includes("5 fabrics · 9 garments"));
assert.equal(
  additionalOnlyFabricMarkup.includes("Fabrics selected:"),
  false,
  "Step 1 must not show Fabric-selection progress.",
);

const shirtTrouserAgbadaSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser", "agbada"],
  selectedDemographics: ["male"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const agbadaOnlyAllocationState = {
  fabricAllocations: [
    {
      allocationId: "fabric-selection-agbada-only",
      fabricCode: "ODG-003",
      garmentAssignments: [
        {
          garmentKey: "base:agbada",
          code: "GARMENT_TYPE_AGBADA",
          garmentType: "agbada" as const,
          fabricUnits: 2 as const,
        },
      ],
    },
  ],
  activeAllocationId: "fabric-selection-agbada-only",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assert.equal(
  getGarmentTypeStepSelectedFabricQuantity({
    garmentTypeSelection: shirtTrouserAgbadaSelection,
    fabricAllocationState: agbadaOnlyAllocationState,
  }),
  0,
);

console.log("Garment Type Step controlled component verification passed.");
