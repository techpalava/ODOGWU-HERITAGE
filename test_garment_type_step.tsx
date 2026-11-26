import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { resolveStep1DemographicMismatch } from "./src/utils/measurementBlueprint";
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
import { DesignStudioStepGuide } from "./src/components/DesignStudioStepGuide";
import {
  STEP_1_GARMENT_CARD_PRESETS,
  STEP_1_SELECTABLE_GARMENT_TYPES,
} from "./src/utils/garmentConstructionPricing";
import { getGarmentTypeStepSelectedFabricQuantity } from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  describeGarmentTypeStageBlockers,
  getGarmentTypeStageCompletion,
} from "./src/utils/designStudioJourneyMode";
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
  "Long Shirt",
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
const approvedPrices = [65, 70, 70, 75, 70, 70, 75, 75, 80];
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

const expectedPresetIds = [
  "shirt_short_sleeve",
  "shirt_long_sleeve",
  "kaftan_short_sleeve",
  "kaftan_long_sleeve",
  "dress_sleeveless",
  "dress_short_sleeve",
  "dress_mid_sleeve",
  "dress_long_sleeve",
  "full_length_gown_sleeveless",
  "full_length_gown_short_sleeve",
  "full_length_gown_mid_sleeve",
  "full_length_gown_long_sleeve",
  "skirt",
  "long_skirt",
  "trouser",
  "standard_shorts",
  "bum_shorts",
] as const;
const expectedPresetLabels = [
  "Standard Shirt — Short Sleeve",
  "Standard Shirt — Long Sleeve",
  "Long Shirt — Short Sleeve",
  "Long Shirt — Long Sleeve",
  "Standard Dress — Sleeveless",
  "Standard Dress — Short Sleeve",
  "Standard Dress — Mid Sleeve",
  "Standard Dress — Long Sleeve",
  "Long Dress — Sleeveless",
  "Long Dress — Short Sleeve",
  "Long Dress — Mid Sleeve",
  "Long Dress — Long Sleeve",
  "Standard Skirt",
  "Long Skirt",
  "Trouser",
  "Standard Nikka Shorts",
  "Standard Bum Shorts",
] as const;
const expectedPresetPrices = [65, 70, 70, 75, 70, 70, 75, 75, 75, 75, 80, 80, 75, 80, 75, 70, 70];
assert.equal(STEP_1_GARMENT_CARD_PRESETS.length, 17);
assert.deepEqual(
  STEP_1_GARMENT_CARD_PRESETS.map((preset) => preset.id),
  expectedPresetIds,
);

const emptyPresentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: [],
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(emptyPresentation.selectedGarmentTypes.length, 0);
assert.equal(emptyPresentation.constructionPricing.length, 0);
assert.equal(emptyPresentation.constructionSubtotalCents, 0);
assert.equal(emptyPresentation.customerFacingCapacityAmount, "0");
assert.equal(emptyPresentation.categories.length, 17);
assert.deepEqual(emptyPresentation.categories.map((item) => item.presetId), expectedPresetIds);
assert.deepEqual(emptyPresentation.categories.map((item) => item.label), expectedPresetLabels);
assert.deepEqual(
  emptyPresentation.categories.map((item) => item.fabricUnits),
  [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1],
);
assert.deepEqual(
  emptyPresentation.categories.map((item) =>
    item.constructionPricing?.status === "resolved"
      ? item.constructionPricing.totalPrice
      : null,
  ),
  expectedPresetPrices,
);

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
assert.equal((emptyMarkup.match(/Uses 1\/2 fabric capacity unit\./g) || []).length, 13);
assert.equal((emptyMarkup.match(/Uses 1 fabric capacity unit\./g) || []).length, 4);
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
  selectedFabricQuantity: 1,
});
assert.ok(populatedMarkup.includes("Step 1 of 10"));
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
assert.ok(shirtTrouserDressMarkup.includes("Ankara Standard Shirt — Short Sleeve reference"));
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
assert.equal(approvedProjection.readOnlyConstructionRows.reduce((sum, row) => sum + row.priceCents, 0), 65000);
for (const [garmentType, optionId] of [
  ["kaftan", "shirt_long_short"],
  ["full_length_gown", "dress_long_sleeveless"],
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
assert.deepEqual(renderedCards.map((match) => match[1]), expectedPresetIds);
renderedCards.forEach((match, index) => {
  assert.ok(match[2].includes(expectedPresetLabels[index]));
  assert.ok(match[2].includes(`€${expectedPresetPrices[index].toFixed(2)}`));
  assert.equal(/With Rope|LONG SLEEVES|crotch|upper-thigh/.test(match[2]), false);
  const visibleCardText = [
    match[2].replace(/<[^>]+>/g, " "),
    ...[...match[2].matchAll(/(?:alt|aria-label)="([^"]*)"/g)].map((attr) => attr[1]),
  ].join(" ");
  assert.equal(/\bkaftan\b/i.test(visibleCardText), false, "Customer-visible card text must never say Kaftan");
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

const continueDisabledMarkup = renderToStaticMarkup(
  createElement(GarmentTypeStep, {
    selectedGarmentTypes: ["shirt"],
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
    onGarmentTypesChange: () => undefined,
    onDemographicsChange: () => undefined,
    onConstructionDefaultsChange: () => undefined,
    onContinue: () => undefined,
    continueDisabled: true,
  }),
);
assert.equal(
  continueDisabledMarkup.includes('data-testid="future-garment-type-continue-action"'),
  false,
  "Continue to Fabric stays in the header until the step is complete",
);
assert.ok(continueDisabledMarkup.includes("Continue to Fabric"));

const continueEnabledMarkup = renderToStaticMarkup(
  createElement(GarmentTypeStep, {
    selectedGarmentTypes: ["shirt"],
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
    onGarmentTypesChange: () => undefined,
    onDemographicsChange: () => undefined,
    onConstructionDefaultsChange: () => undefined,
    onContinue: () => undefined,
    continueDisabled: false,
  }),
);
assert.ok(
  continueEnabledMarkup.includes('data-testid="future-garment-type-continue-action"'),
  "a complete Step 1 shows Continue to Fabric under the demographic cards",
);
const demographicCardsAt = continueEnabledMarkup.indexOf("Unisex / Family");
const inlineContinueAt = continueEnabledMarkup.indexOf(
  'data-testid="future-garment-type-continue-action"',
);
const orderSummaryAt = continueEnabledMarkup.indexOf("Order Summary");
assert.ok(demographicCardsAt > 0 && inlineContinueAt > demographicCardsAt);
assert.ok(
  orderSummaryAt > inlineContinueAt,
  "Continue sits immediately after the demographic cards",
);
assert.equal(continueEnabledMarkup.includes('data-docked="true"'), false);
assert.equal(continueEnabledMarkup.includes("fixed inset-x-0 bottom-0"), false);
assert.equal(continueEnabledMarkup.includes("pb-28"), false);
assert.ok(continueEnabledMarkup.includes('aria-label="Continue to Fabric"'));
assert.equal(
  continueEnabledMarkup.includes('data-testid="step1-still-needed"'),
  false,
  "A complete Step 1 does not show a still-needed hint",
);
assert.equal(
  continueEnabledMarkup.includes(">Guide<"),
  false,
  "A complete Step 1 does not keep the Guide beam",
);
assert.equal(
  continueEnabledMarkup.includes("motion-safe:animate-step-guide-beam"),
  false,
  "A complete Step 1 does not animate an empty guide",
);
assert.equal(
  continueEnabledMarkup.includes("data-step1-audience-needed"),
  false,
);
assert.equal(
  continueEnabledMarkup.includes("animate-step1-audience-beam"),
  false,
  "The audience beam stops once Continue to Fabric unlocks",
);

const stuckSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const stuckCompletion = getGarmentTypeStageCompletion(stuckSelection);
assert.equal(stuckCompletion.isComplete, false);
assert.deepEqual(
  describeGarmentTypeStageBlockers(stuckCompletion.blockers).map(
    (item) => item.code,
  ),
  ["DEMOGRAPHIC_REQUIRED"],
);
const stuckMarkup = renderToStaticMarkup(
  createElement(GarmentTypeStep, {
    selectedGarmentTypes: stuckSelection.garmentTypes,
    selectedDemographics: [],
    normalizedCustomDetailCatalog: catalog,
    onGarmentTypesChange: () => undefined,
    onDemographicsChange: () => undefined,
    onConstructionDefaultsChange: () => undefined,
    onContinue: () => undefined,
    continueDisabled: !stuckCompletion.isComplete,
    stageBlockers: stuckCompletion.blockers,
  }),
);
assert.ok(stuckMarkup.includes('data-testid="step1-still-needed"'));
assert.ok(
  stuckMarkup.includes(">Guide<"),
  "The Step 1 attention checklist is labelled Guide",
);
assert.ok(
  stuckMarkup.includes("motion-safe:animate-step-guide-beam"),
  "The Step 1 guide beams while a requirement remains",
);
assert.ok(
  stuckMarkup.includes('data-step1-still-needed="DEMOGRAPHIC_REQUIRED"'),
);
assert.ok(
  stuckMarkup.includes(
    "Choose who this design is for (Male, Female, or Unisex / Family).",
  ),
);
assert.ok(stuckMarkup.includes('href="#garment-type-step-audience"'));
assert.ok(stuckMarkup.includes('data-step1-audience-needed="true"'));
assert.ok(
  stuckMarkup.includes("motion-safe:animate-step1-audience-beam"),
  "The audience question beams softly while it blocks Continue to Fabric",
);
assert.ok(
  !stuckMarkup.includes("border-2 border-heritage-gold") &&
  !stuckMarkup.includes("ring-2 ring-heritage-gold/80"),
  "The audience question uses the same thin border as the garment cards",
);
assert.ok(stuckMarkup.includes("Still needed to continue to Fabric."));
assert.ok(stuckMarkup.includes('aria-describedby="garment-type-step-still-needed"'));
assert.equal(
  stuckMarkup.includes('data-testid="future-garment-type-continue-action"'),
  false,
  "The audience question still keeps Continue to Fabric in the header",
);
const continueLabelAt = stuckMarkup.indexOf('aria-label="Continue to Fabric"');
assert.ok(continueLabelAt > 0);
assert.ok(
  stuckMarkup.slice(continueLabelAt - 180, continueLabelAt).includes("disabled"),
  "Continue to Fabric stays disabled until the audience question is answered",
);

const emptyStepCompletion = getGarmentTypeStageCompletion(
  reconcileGarmentTypeStepSelection({
    normalizedCustomDetailCatalog: catalog,
  }).selection,
);
const emptyStepMarkup = renderToStaticMarkup(
  createElement(GarmentTypeStep, {
    selectedGarmentTypes: [],
    selectedDemographics: [],
    normalizedCustomDetailCatalog: catalog,
    onGarmentTypesChange: () => undefined,
    onDemographicsChange: () => undefined,
    onConstructionDefaultsChange: () => undefined,
    onContinue: () => undefined,
    continueDisabled: true,
    stageBlockers: emptyStepCompletion.blockers,
  }),
);
assert.ok(
  emptyStepMarkup.includes(
    'data-step1-still-needed="GARMENT_REQUIRED DEMOGRAPHIC_REQUIRED"',
  ),
);
assert.equal(
  emptyStepMarkup.includes("data-step1-audience-needed"),
  false,
  "The audience question is highlighted after a garment is selected",
);
assert.ok(emptyStepMarkup.includes('href="#garment-type-step-garments"'));

const unresolvedBlockerMarkup = renderToStaticMarkup(
  createElement(GarmentTypeStep, {
    selectedGarmentTypes: ["shirt"],
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: unresolvedCatalog,
    onGarmentTypesChange: () => undefined,
    onDemographicsChange: () => undefined,
    onConstructionDefaultsChange: () => undefined,
    onContinue: () => undefined,
    continueDisabled: true,
    stageBlockers: [
      { code: "CONSTRUCTION_UNRESOLVED", garmentType: "shirt" },
    ],
  }),
);
assert.ok(
  unresolvedBlockerMarkup.includes(
    'data-step1-still-needed="CONSTRUCTION_UNRESOLVED"',
  ),
);
assert.ok(
  unresolvedBlockerMarkup.includes(
    "Construction pricing needs review before this order can continue.",
  ),
);
assert.equal(
  unresolvedBlockerMarkup.includes("data-step1-audience-needed"),
  false,
);
assert.equal(
  describeGarmentTypeStageBlockers([
    { code: "CONSTRUCTION_UNRESOLVED", garmentType: "shirt" },
    { code: "CONSTRUCTION_UNRESOLVED", garmentType: "trouser" },
  ]).length,
  1,
  "Several unresolved constructions stay one still-needed line",
);

const idleGuideMarkup = renderToStaticMarkup(
  createElement(DesignStudioStepGuide, {
    title: "Still needed before Fabric",
    active: false,
  }),
);
assert.ok(idleGuideMarkup.includes(">Guide<"));
assert.equal(
  idleGuideMarkup.includes("motion-safe:animate-step-guide-beam"),
  false,
  "An idle guide does not keep the gold beam",
);
const emptyGuideMarkup = renderToStaticMarkup(
  createElement(
    DesignStudioStepGuide,
    { title: "Still needed before Fabric" },
    null,
  ),
);
assert.equal(
  emptyGuideMarkup.includes("motion-safe:animate-step-guide-beam"),
  false,
  "A guide with no remaining items does not animate",
);

// Category group rendering verification
const allGarmentsMarkup = renderStep({
  selectedGarmentTypes: [...STEP_1_SELECTABLE_GARMENT_TYPES],
  selectedDemographics: ["male"],
});

// 1. All 4 category group containers render in order
const groupIds = ["shirts", "dresses", "skirts", "trousers_and_shorts"];
let lastIndex = -1;
for (const groupId of groupIds) {
  const testId = `data-testid="step1-category-group-${groupId}"`;
  const idx = allGarmentsMarkup.indexOf(testId);
  assert.ok(idx > 0, `Category group ${groupId} container must render`);
  assert.ok(idx > lastIndex, `Category groups must render in order: ${groupId} after previous`);
  lastIndex = idx;
}

// 2. All 17 garment cards render exactly once
const expectedPresetIdsAll = [
  "shirt_short_sleeve",
  "shirt_long_sleeve",
  "kaftan_short_sleeve",
  "kaftan_long_sleeve",
  "dress_sleeveless",
  "dress_short_sleeve",
  "dress_mid_sleeve",
  "dress_long_sleeve",
  "full_length_gown_sleeveless",
  "full_length_gown_short_sleeve",
  "full_length_gown_mid_sleeve",
  "full_length_gown_long_sleeve",
  "skirt",
  "long_skirt",
  "trouser",
  "standard_shorts",
  "bum_shorts",
];
for (const presetId of expectedPresetIdsAll) {
  const testId = `data-testid="step1-garment-card-${presetId}"`;
  const count = (allGarmentsMarkup.match(new RegExp(testId.replace(/"/g, '\\"'), 'g')) || []).length;
  assert.equal(count, 1, `Card ${presetId} must render exactly once`);
}

// 3. Shirts & Dresses show "Choose 1 sleeve" helper, sub-group headers, and gold-bordered family cards
assert.ok(allGarmentsMarkup.includes("Choose 1 sleeve"), "Shirts/Dresses helper text present");
assert.ok(allGarmentsMarkup.includes("Standard Shirt"), "Standard Shirt sub-group header");
assert.ok(allGarmentsMarkup.includes("Long Shirt"), "Long Shirt sub-group header");
assert.ok(allGarmentsMarkup.includes("Standard Dress"), "Standard Dress sub-group header");
assert.ok(allGarmentsMarkup.includes("Long Dress"), "Long Dress sub-group header");
for (const subGroupId of ["standard_shirt", "long_shirt", "standard_dress", "long_dress"]) {
  assert.ok(
    allGarmentsMarkup.includes(`data-testid="step1-category-subgroup-${subGroupId}"`),
    `Sub-group family card ${subGroupId} must render with gold border container`,
  );
}
assert.ok(
  allGarmentsMarkup.includes("flex h-full flex-col gap-2.5 rounded-2xl border border-heritage-gold/40"),
  "Sub-group family containers must stretch (flex h-full flex-col) and expand their card grid (flex-1) so buttons align horizontally across side-by-side families",
);

// 4. Selecting a preset shows live selection count pill (test with one selection)
const shirtSelectedMarkup = renderStep({
  selectedGarmentTypes: ["shirt"],
  selectedDemographics: ["male"],
  normalizedCustomDetailCatalog: catalog,
});
assert.ok(shirtSelectedMarkup.includes("1 selected"), "Selection count pill shows for Shirts group");

// 5. Zero "Kaftan", "Knicker", or "Select all" strings appear
assert.equal(allGarmentsMarkup.includes("Kaftan"), false, "Kaftan must not appear in customer-facing text");
assert.equal(allGarmentsMarkup.includes("Knicker"), false, "Knicker must not appear");
assert.equal(allGarmentsMarkup.includes("Select all"), false, "Select all must not appear");

// 6. Step 1 non-blocking demographic mismatch warning & 1-click quick fixes
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

for (const garmentType of ["dress", "full_length_gown", "skirt", "long_skirt"] as const) {
  const mismatch = resolveStep1DemographicMismatch([garmentType], ["male"]);
  assert.ok(mismatch, `Male + ${garmentType} must produce mismatch`);
  assert.deepEqual(mismatch.mismatchedGarmentTypes, [garmentType]);
  assert.equal(mismatch.hasUnisexGarments, false);
  assert.equal(mismatch.message.includes("Kaftan"), false);
  assert.equal(mismatch.message.includes("Knicker"), false);

  const demographicChanges: CustomDetailDemographic[][] = [];
  let continueClicks = 0;
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      createElement(GarmentTypeStep, {
        selectedGarmentTypes: [garmentType],
        selectedDemographics: ["male"],
        normalizedCustomDetailCatalog: catalog,
        onGarmentTypesChange: () => undefined,
        onDemographicsChange: (next) => demographicChanges.push(next),
        onConstructionDefaultsChange: () => undefined,
        onContinue: () => {
          continueClicks += 1;
        },
        continueDisabled: false,
        stageBlockers: [],
      }),
    );
  });

  const banner = renderer.root.findByProps({
    "data-testid": "step1-demographic-mismatch-warning",
  });
  assert.equal(banner.props.role, "status");
  assert.equal(
    renderer.root.findAllByProps({ "data-testid": "step1-still-needed" }).length,
    0,
    "Warning is non-blocking (no still-needed blocker)",
  );
  const continueButtons = renderer.root.findAllByProps({
    "aria-label": "Continue to Fabric",
  });
  assert.ok(continueButtons.length > 0);
  assert.ok(
    continueButtons.every((button) => button.props.disabled !== true),
    `Continue to Fabric remains enabled for Male + ${garmentType}`,
  );
  await act(async () => {
    continueButtons[0]!.props.onClick();
  });
  assert.equal(continueClicks, 1);

  const switchFemale = renderer.root.findByProps({
    "data-testid": "step1-demographic-switch-female",
  });
  const switchUnisex = renderer.root.findByProps({
    "data-testid": "step1-demographic-switch-unisex",
  });
  assert.equal(
    renderer.root.findAllByProps({ "data-testid": "step1-demographic-add-female" }).length,
    0,
  );
  await act(async () => {
    switchFemale.props.onClick();
    switchUnisex.props.onClick();
  });
  assert.deepEqual(demographicChanges, [["female"], ["unisex"]]);
  await act(async () => {
    renderer.unmount();
  });
}

// Mixed order: Male + Standard Shirt + Standard Dress
{
  const mixed = resolveStep1DemographicMismatch(["shirt", "dress"], ["male"]);
  assert.ok(mixed);
  assert.deepEqual(mixed.mismatchedGarmentTypes, ["dress"]);
  assert.equal(mixed.hasUnisexGarments, true);
  assert.ok(mixed.message.includes("Standard Dress is usually a women's garment"));
  assert.equal(mixed.message.includes("Kaftan"), false);
  assert.equal(mixed.message.includes("Knicker"), false);

  const multiWomen = resolveStep1DemographicMismatch(["dress", "skirt"], ["male"]);
  assert.ok(multiWomen);
  assert.ok(
    multiWomen.message.includes("Standard Dress and Standard Skirt are usually women's garments"),
  );

  const demographicChanges: CustomDetailDemographic[][] = [];
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      createElement(GarmentTypeStep, {
        selectedGarmentTypes: ["shirt", "dress"],
        selectedDemographics: ["male"],
        normalizedCustomDetailCatalog: catalog,
        onGarmentTypesChange: () => undefined,
        onDemographicsChange: (next) => demographicChanges.push(next),
        onConstructionDefaultsChange: () => undefined,
        onContinue: () => undefined,
        continueDisabled: false,
        stageBlockers: [],
      }),
    );
  });

  const addFemale = renderer.root.findByProps({
    "data-testid": "step1-demographic-add-female",
  });
  const switchUnisex = renderer.root.findByProps({
    "data-testid": "step1-demographic-switch-unisex",
  });
  assert.equal(
    renderer.root.findAllByProps({ "data-testid": "step1-demographic-switch-female" }).length,
    0,
  );
  await act(async () => {
    addFemale.props.onClick();
    switchUnisex.props.onClick();
  });
  assert.deepEqual(demographicChanges, [["male", "female"], ["unisex"]]);
  await act(async () => {
    renderer.unmount();
  });
}

// No warning cases: unisex garments with Male, Female/Unisex/multi-audience/empty with any garment
for (const garmentType of ["shirt", "kaftan", "trouser", "standard_shorts", "bum_shorts"] as const) {
  assert.equal(
    resolveStep1DemographicMismatch([garmentType], ["male"]),
    null,
    `Male + ${garmentType} must NOT warn`,
  );
  const markup = renderStep({
    selectedGarmentTypes: [garmentType],
    selectedDemographics: ["male"],
  });
  assert.equal(
    markup.includes('data-testid="step1-demographic-mismatch-warning"'),
    false,
    `No mismatch banner for Male + ${garmentType}`,
  );
}

for (const demographics of [
  [],
  ["female"],
  ["unisex"],
  ["male", "female"],
  ["male", "unisex"],
] as CustomDetailDemographic[][]) {
  assert.equal(
    resolveStep1DemographicMismatch(["shirt", "trouser", "dress", "skirt"], demographics),
    null,
    `No mismatch for demographics=${JSON.stringify(demographics)}`,
  );
  const markup = renderStep({
    selectedGarmentTypes: ["shirt", "dress"],
    selectedDemographics: demographics,
  });
  assert.equal(
    markup.includes('data-testid="step1-demographic-mismatch-warning"'),
    false,
    `No mismatch banner for demographics=${JSON.stringify(demographics)}`,
  );
}

console.log("Garment Type Step controlled component verification passed.");
