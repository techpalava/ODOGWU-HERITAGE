import assert from "node:assert/strict";
import type {
  BusinessSettings,
  CustomDetailGarmentContext,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  DesignSelections,
  Fabric,
  StyleCategory,
} from "./src/types";
import {
  ADDITIONAL_CLOTHES_COST_SECTION_ORDER,
  SEED_CUSTOM_DETAIL_CATALOG,
  CUSTOM_DETAIL_PARENT_SECTION_ORDER,
  CUSTOM_DETAIL_SELECTION_GROUP_TO_PARENT_SECTION,
  type StandardCustomDetailSelectionGroup,
} from "./src/config/GarmentDetailsConfig";
import {
  calculateCustomDetailsPriceBreakdown,
  filterDesignSelectionsForCustomDetails,
  getSupportedCustomDetailGroups,
  groupApplicableCustomDetails,
  isAdditionalClothesCostSection,
  sortAdditionalClothesCostSections,
  groupCustomDetailGroupsByParentSection,
} from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  calculateGarmentDetailsPrice,
  DECORATIVE_FEATURE_OPTIONS,
  sortDecorativeFeatures,
  sortTraditionalAccessories,
  TRADITIONAL_ACCESSORY_OPTIONS,
} from "./src/utils/decorativePricing";

const makeStyle = (
  overrides: Partial<StyleCategory> = {},
): StyleCategory => ({
  id: "context-style",
  name: "Context Test Style",
  description: "A configured test style.",
  gender: "male",
  options: [],
  ...overrides,
});

const getSelectionGroups = (
  style: StyleCategory,
  garment?: CustomDetailGarmentContext | null,
): CustomDetailSelectionGroup[] =>
  groupApplicableCustomDetails(
    style,
    SEED_CUSTOM_DETAIL_CATALOG,
    garment,
  )
    .filter((group) => !isAdditionalClothesCostSection(group.id))
    .map((group) => group.id);

const expectGroups = (
  label: string,
  style: StyleCategory,
  garment: CustomDetailGarmentContext | null,
  expected: CustomDetailSelectionGroup[],
) => {
  assert.deepEqual(
    getSelectionGroups(style, garment),
    expected,
    label,
  );
};

const getOptionIdsByGroup = (
  style: StyleCategory,
  catalog: CustomDetailOption[],
  garment?: CustomDetailGarmentContext | null,
): Record<string, string[]> =>
  Object.fromEntries(
    groupApplicableCustomDetails(style, catalog, garment)
      .filter((group) => !isAdditionalClothesCostSection(group.id))
      .map((group) => [
        group.id,
        group.options.map((option) => option.id),
      ]),
  );

const deterministicallyShuffle = <T>(values: readonly T[]): T[] => {
  const shuffled = [...values];
  let seed = 73;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = (seed * 48271) % 2147483647;
    const swapIndex = seed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
};

const maleStyle = makeStyle({
  customDetailConfig: {
    representedGenders: ["male"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: [
      "shirt",
      "neck",
      "standard_shorts",
      "bum_shorts",
      "trousers",
    ],
    requiredSelectionGroups: [],
    enabled: true,
  },
});

expectGroups("male shirt only", maleStyle, { code: "G1" }, [
  "shirt_construction",
  "shirt_pockets",
  "neck_design",
]);

expectGroups("male shirt and trouser", maleStyle, { code: "G5.2" }, [
  "shirt_construction",
  "shirt_pockets",
  "neck_design",
  "trouser_fastening",
  "trouser_pockets",
]);

expectGroups("male shirt and standard shorts", maleStyle, { code: "G5.1" }, [
  "shirt_construction",
  "shirt_pockets",
  "neck_design",
  "standard_shorts_fastening",
  "standard_shorts_pockets",
]);

expectGroups(
  "male shirt and bum shorts",
  maleStyle,
  { type: "Shirt + Bum Shorts" },
  [
    "shirt_construction",
    "shirt_pockets",
    "neck_design",
    "bum_shorts_fastening",
    "bum_shorts_pockets",
  ],
);

const femaleStyle = makeStyle({
  gender: "female",
  targetDemographic: "female",
  customDetailConfig: {
    representedGenders: ["female"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: ["dress", "neck", "skirt"],
    requiredSelectionGroups: [],
    enabled: true,
  },
});

expectGroups("female dress", femaleStyle, { code: "L1" }, [
  "dress_construction",
  "dress_pockets",
  "neck_design",
]);

expectGroups("female skirt", femaleStyle, { type: "Skirt Only" }, [
  "skirt_length",
  "skirt_pockets",
]);

const femaleTopAndSkirtStyle = makeStyle({
  gender: "female",
  targetDemographic: "female",
  customDetailConfig: {
    representedGenders: ["female"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: ["shirt", "dress", "neck", "skirt"],
    requiredSelectionGroups: [],
    enabled: true,
  },
});
expectGroups(
  "female top and skirt composition",
  femaleTopAndSkirtStyle,
  { type: "Top + Skirt" },
  [
    "shirt_construction",
    "shirt_pockets",
    "neck_design",
    "skirt_length",
    "skirt_pockets",
  ],
);
expectGroups(
  "female dress and skirt composition",
  femaleStyle,
  { type: "Dress + Skirt" },
  [
    "dress_construction",
    "dress_pockets",
    "neck_design",
    "skirt_length",
    "skirt_pockets",
  ],
);

expectGroups(
  "female kaftan gown metadata resolves to dress controls",
  makeStyle({
    name: "Classic V-Neck Maxi Dress",
    gender: "female",
    targetDemographic: "female",
    outfitType: "Maxi Gown",
    garmentComposition: "Kaftan Only",
  }),
  null,
  ["dress_construction", "dress_pockets", "neck_design"],
);

const familyStyle = makeStyle({
  gender: "family",
  targetDemographic: "unisex",
  garmentCompositionList: ["Male Shirt", "Female Dress", "Skirt"],
  customDetailConfig: {
    representedGenders: ["male", "female"],
    featuresMaleAndFemale: true,
    supportedGarmentGroups: ["shirt", "dress", "neck", "trousers"],
    requiredSelectionGroups: [],
    enabled: true,
  },
});

assert.deepEqual(
  getSupportedCustomDetailGroups(familyStyle),
  ["shirt", "dress", "neck", "trousers"],
  "explicit family configuration wins over broader composition metadata",
);
expectGroups("configured family garments only", familyStyle, null, [
  "shirt_construction",
  "shirt_pockets",
  "dress_construction",
  "dress_pockets",
  "neck_design",
  "trouser_fastening",
  "trouser_pockets",
]);

const allGarmentStyle = makeStyle({
  gender: "family",
  targetDemographic: "unisex",
  customDetailConfig: {
    representedGenders: ["male", "female"],
    featuresMaleAndFemale: true,
    supportedGarmentGroups: [
      "shirt",
      "dress",
      "neck",
      "standard_shorts",
      "bum_shorts",
      "trousers",
      "skirt",
    ],
    requiredSelectionGroups: [],
    enabled: true,
  },
});

expectGroups("master selection-group order", allGarmentStyle, null, [
  "shirt_construction",
  "shirt_pockets",
  "dress_construction",
  "dress_pockets",
  "neck_design",
  "standard_shorts_fastening",
  "standard_shorts_pockets",
  "bum_shorts_fastening",
  "bum_shorts_pockets",
  "trouser_fastening",
  "trouser_pockets",
  "skirt_length",
  "skirt_pockets",
]);

const expectedOptionIdsByGroup: Record<string, string[]> = {
  shirt_construction: [
    "shirt_std_short",
    "shirt_std_midlong",
    "shirt_long_short",
    "shirt_long_midlong",
  ],
  shirt_pockets: ["shirt_pocket_1", "shirt_pocket_2", "shirt_pocket_0"],
  dress_construction: [
    "dress_std_sleeveless",
    "dress_std_short",
    "dress_std_midlong",
    "dress_long_sleeveless",
    "dress_long_short",
    "dress_long_midlong",
  ],
  dress_pockets: ["dress_pocket_1", "dress_pocket_multi", "dress_pocket_0"],
  neck_design: [
    "neck_no_round",
    "neck_no_v",
    "neck_no_u",
    "neck_vert_round",
    "neck_vert_v",
    "neck_vert_u",
    "neck_flat_round",
    "neck_flat_v",
    "neck_flat_u",
  ],
  standard_shorts_fastening: [
    "shorts_std_rope",
    "shorts_std_elastic",
    "shorts_std_belt",
  ],
  standard_shorts_pockets: [
    "shorts_std_pocket_regular",
    "shorts_std_pocket_back",
    "shorts_std_pocket_none",
  ],
  bum_shorts_fastening: ["bum_rope", "bum_elastic", "bum_belt"],
  bum_shorts_pockets: [
    "bum_pocket_regular",
    "bum_pocket_back",
    "bum_pocket_none",
  ],
  trouser_fastening: ["trouser_rope", "trouser_elastic", "trouser_belt"],
  trouser_pockets: [
    "trouser_pocket_regular",
    "trouser_pocket_back",
    "trouser_pocket_none",
  ],
  skirt_length: ["skirt_std", "skirt_long"],
  skirt_pockets: ["skirt_pocket_1", "skirt_pocket_2", "skirt_pocket_none"],
};

assert.deepEqual(
  getOptionIdsByGroup(
    allGarmentStyle,
    SEED_CUSTOM_DETAIL_CATALOG,
  ),
  expectedOptionIdsByGroup,
  "every selection group follows its centralized option order",
);

const shuffledCatalog = deterministicallyShuffle(
  SEED_CUSTOM_DETAIL_CATALOG.map((option, index) => ({
    ...option,
    displayOrder: index % 3,
  })),
);
assert.deepEqual(
  getOptionIdsByGroup(allGarmentStyle, shuffledCatalog),
  expectedOptionIdsByGroup,
  "Firestore order and legacy displayOrder values cannot change canonical presentation",
);

assert.deepEqual(
  sortAdditionalClothesCostSections(
    [...ADDITIONAL_CLOTHES_COST_SECTION_ORDER].reverse(),
  ),
  ADDITIONAL_CLOTHES_COST_SECTION_ORDER,
  "additional-cost subsections use the centralized business order",
);
assert.deepEqual(
  sortDecorativeFeatures([
    "Monogram Trimming",
    "Embroidery",
    "Name Monogram",
  ]),
  DECORATIVE_FEATURE_OPTIONS,
  "monogram and embroidery choices use deterministic business order",
);
assert.deepEqual(
  sortTraditionalAccessories([
    "Traditional Stick",
    "Traditional Bead",
    "Traditional Hat",
  ]),
  TRADITIONAL_ACCESSORY_OPTIONS,
  "traditional accessories use deterministic business order",
);

const orderedOptionalPricing = calculateGarmentDetailsPrice(
  {
    decorativeFeatures: [
      "Monogram Trimming",
      "Name Monogram",
      "Embroidery",
    ],
    accessories: [
      "Traditional Stick",
      "Traditional Hat",
      "Traditional Bead",
    ],
  },
  allGarmentStyle,
);
assert.deepEqual(
  orderedOptionalPricing.decorativeFeatures.map((item) => item.label),
  DECORATIVE_FEATURE_OPTIONS,
  "pricing summaries retain decorative business order",
);
assert.deepEqual(
  orderedOptionalPricing.accessories.map((item) => item.label),
  TRADITIONAL_ACCESSORY_OPTIONS,
  "pricing summaries retain accessory business order",
);
assert.equal(
  orderedOptionalPricing.total,
  72,
  "deterministic optional ordering does not alter optional pricing",
);

expectGroups(
  "composition metadata precedes legacy marketing copy",
  makeStyle({
    name: "Trouser Collection",
    description: "Marketing copy mentions skirts and dresses.",
    garmentComposition: "Shirt Only",
  }),
  null,
  ["shirt_construction", "shirt_pockets", "neck_design"],
);

expectGroups(
  "legacy style records still infer their garments",
  makeStyle({
    name: "Heritage Shirt and Trouser",
    description: "A coordinated two-piece outfit.",
  }),
  null,
  [
    "shirt_construction",
    "shirt_pockets",
    "neck_design",
    "trouser_fastening",
    "trouser_pockets",
  ],
);

const shirtAndTrouserSelections: DesignSelections = {
  customDetails: {
    shirt_construction: "shirt_std_short",
    shirt_pockets: "shirt_pocket_0",
    neck_design: "neck_no_round",
    trouser_fastening: "trouser_rope",
    trouser_pockets: "trouser_pocket_none",
  },
  decorativeFeatures: ["Embroidery"],
  accessories: ["Traditional Hat"],
};
const changedToShorts = filterDesignSelectionsForCustomDetails(
  maleStyle,
  shirtAndTrouserSelections,
  SEED_CUSTOM_DETAIL_CATALOG,
  { code: "G5.1" },
);
assert.deepEqual(changedToShorts.customDetails, {
  shirt_construction: "shirt_std_short",
  shirt_pockets: "shirt_pocket_0",
  neck_design: "neck_no_round",
});
assert.deepEqual(changedToShorts.decorativeFeatures, ["Embroidery"]);
assert.deepEqual(changedToShorts.accessories, ["Traditional Hat"]);

const changedToDress = filterDesignSelectionsForCustomDetails(
  femaleStyle,
  shirtAndTrouserSelections,
  SEED_CUSTOM_DETAIL_CATALOG,
  { code: "L1" },
);
assert.deepEqual(changedToDress.customDetails, {
  neck_design: "neck_no_round",
});
assert.deepEqual(changedToDress.decorativeFeatures, ["Embroidery"]);
assert.deepEqual(changedToDress.accessories, ["Traditional Hat"]);

const restoredDraft: DesignSelections = {
  customDetails: {
    dress_construction: "dress_std_short",
    dress_pockets: "dress_pocket_0",
    neck_design: "neck_no_round",
    shirt_construction: "shirt_long_midlong",
    trouser_fastening: "trouser_belt",
  },
  customDetailSnapshots: [
    {
      optionId: "dress_std_short",
      label: "Standard Length, Short Sleeve",
      description: "Saved dress choice",
      garmentGroup: "dress",
      selectionGroup: "dress_construction",
      priceCents: 7000,
    },
    {
      optionId: "shirt_long_midlong",
      label: "Long Length Shirt, Mid-Long Sleeve",
      description: "Obsolete shirt choice",
      garmentGroup: "shirt",
      selectionGroup: "shirt_construction",
      priceCents: 7500,
    },
  ],
};
const restoredFemaleDraft = filterDesignSelectionsForCustomDetails(
  femaleStyle,
  restoredDraft,
  SEED_CUSTOM_DETAIL_CATALOG,
  { code: "L1" },
);
assert.deepEqual(Object.keys(restoredFemaleDraft.customDetails || {}).sort(), [
  "dress_construction",
  "dress_pockets",
  "neck_design",
]);
assert.deepEqual(
  restoredFemaleDraft.customDetailSnapshots?.map(
    (snapshot) => snapshot.selectionGroup,
  ),
  ["dress_construction"],
);
assert.equal(
  calculateCustomDetailsPriceBreakdown(
    restoredFemaleDraft,
    SEED_CUSTOM_DETAIL_CATALOG,
  ).clothingPrice,
  70,
  "hidden restored selections do not affect pricing",
);

const femaleOnlyNeckOption: CustomDetailOption = {
  id: "female-only-neck-detail",
  label: "Female-only Neck Detail",
  description: "Only available for female garments.",
  garmentGroup: "neck",
  selectionGroup: "neck_design",
  priceCents: 900,
  eligibleDemographics: ["female"],
  displayOrder: 999,
  required: false,
  active: true,
  allowMultiple: false,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const demographicCatalog = [
  ...SEED_CUSTOM_DETAIL_CATALOG,
  femaleOnlyNeckOption,
];
const staleSameGroupSelection = filterDesignSelectionsForCustomDetails(
  familyStyle,
  {
    customDetails: {
      neck_design: femaleOnlyNeckOption.id,
    },
    customDetailSnapshots: [
      {
        optionId: femaleOnlyNeckOption.id,
        label: femaleOnlyNeckOption.label,
        description: femaleOnlyNeckOption.description,
        garmentGroup: femaleOnlyNeckOption.garmentGroup,
        selectionGroup: femaleOnlyNeckOption.selectionGroup,
        priceCents: femaleOnlyNeckOption.priceCents,
      },
    ],
  },
  demographicCatalog,
  { code: "G1" },
);
assert.deepEqual(
  staleSameGroupSelection.customDetails,
  {},
  "a demographic-ineligible option is removed even when its group remains visible",
);
assert.deepEqual(staleSameGroupSelection.customDetailSnapshots, []);
assert.equal(
  calculateCustomDetailsPriceBreakdown(
    staleSameGroupSelection,
    demographicCatalog,
  ).total,
  0,
  "a hidden demographic-ineligible option cannot affect pricing",
);

const validShirtSelections: DesignSelections = {
  customDetails: {
    shirt_construction: "shirt_std_short",
    shirt_pockets: "shirt_pocket_0",
    neck_design: "neck_no_round",
  },
};
const validPricingBefore = calculateCustomDetailsPriceBreakdown(
  validShirtSelections,
  SEED_CUSTOM_DETAIL_CATALOG,
);
assert.deepEqual(
  calculateCustomDetailsPriceBreakdown(
    validShirtSelections,
    shuffledCatalog,
  ),
  validPricingBefore,
  "presentation ordering does not change valid-selection pricing",
);
const unchangedValidSelections = filterDesignSelectionsForCustomDetails(
  maleStyle,
  validShirtSelections,
  SEED_CUSTOM_DETAIL_CATALOG,
  { code: "G1" },
);
assert.equal(
  unchangedValidSelections,
  validShirtSelections,
  "valid selections keep their original object when no cleanup is needed",
);
assert.deepEqual(
  calculateCustomDetailsPriceBreakdown(
    unchangedValidSelections,
    SEED_CUSTOM_DETAIL_CATALOG,
  ),
  validPricingBefore,
  "unchanged applicable selections keep identical pricing",
);

const stalePricedSelections: DesignSelections = {
  ...validShirtSelections,
  customDetails: {
    ...validShirtSelections.customDetails,
    trouser_fastening: "trouser_belt",
  },
};
const protectedPricing = calculateDesignPricing({
  route: "alone",
  design: stalePricedSelections,
  fabric: {
    code: "CTX-001",
    name: "Context Fabric",
    description: "Pricing protection fabric",
    color: "Green",
    colorHex: "#006b54",
    category: "HiTarget Ankara",
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
  } as Fabric,
  style: maleStyle,
  garment: { code: "G1" },
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings: {
    pricingSettings: {
      depositPercentage: 50,
      balancePercentage: 50,
      currency: "EUR",
      vatTaxPercentage: 0,
      discountRulesEnabled: false,
      standardAccessoryCharge: 10,
    },
  } as BusinessSettings,
});
assert.ok(protectedPricing);
assert.equal(
  protectedPricing.clothingPrice,
  65,
  "an inapplicable hidden trouser choice cannot reach authoritative pricing",
);
// Parent display section grouping tests
const allApplicableGroups = groupApplicableCustomDetails(
  allGarmentStyle,
  SEED_CUSTOM_DETAIL_CATALOG,
  null
).filter((g) => !isAdditionalClothesCostSection(g.id));

const parentSections = groupCustomDetailGroupsByParentSection(allApplicableGroups);

// 1. exact canonical parent order
assert.deepEqual(
  parentSections.map((p) => p.id),
  [...CUSTOM_DETAIL_PARENT_SECTION_ORDER]
);

// 2. exact selection-group-to-parent mapping
for (const section of parentSections) {
  for (const group of section.groups) {
    assert.equal(
      CUSTOM_DETAIL_SELECTION_GROUP_TO_PARENT_SECTION[group.id as StandardCustomDetailSelectionGroup],
      section.id
    );
  }
}

// 3. Shirt construction + Shirt pockets stay together
const shirtSection = parentSections.find((p) => p.id === "shirt");
assert.ok(shirtSection);
assert.deepEqual(
  shirtSection.groups.map((g) => g.id),
  ["shirt_construction", "shirt_pockets"]
);

// 4. Dress construction + Dress pockets stay together
const dressSection = parentSections.find((p) => p.id === "dress");
assert.ok(dressSection);
assert.deepEqual(
  dressSection.groups.map((g) => g.id),
  ["dress_construction", "dress_pockets"]
);

// 5. Neck Design remains its own parent
const neckSection = parentSections.find((p) => p.id === "neck");
assert.ok(neckSection);
assert.deepEqual(
  neckSection.groups.map((g) => g.id),
  ["neck_design"]
);

// 6. Standard Shorts fastening + pockets stay together
const stdShortsSection = parentSections.find((p) => p.id === "standard_shorts");
assert.ok(stdShortsSection);
assert.deepEqual(
  stdShortsSection.groups.map((g) => g.id),
  ["standard_shorts_fastening", "standard_shorts_pockets"]
);

// 7. Bum Shorts fastening + pockets stay together
const bumShortsSection = parentSections.find((p) => p.id === "bum_shorts");
assert.ok(bumShortsSection);
assert.deepEqual(
  bumShortsSection.groups.map((g) => g.id),
  ["bum_shorts_fastening", "bum_shorts_pockets"]
);

// 8. Trouser fastening + pockets stay together
const trousersSection = parentSections.find((p) => p.id === "trousers");
assert.ok(trousersSection);
assert.deepEqual(
  trousersSection.groups.map((g) => g.id),
  ["trouser_fastening", "trouser_pockets"]
);

// 9. Skirt length + pockets stay together
const skirtsSection = parentSections.find((p) => p.id === "skirts");
assert.ok(skirtsSection);
assert.deepEqual(
  skirtsSection.groups.map((g) => g.id),
  ["skirt_length", "skirt_pockets"]
);

// 10. absent subgroups do not produce empty parent sections
const partialGroups = allApplicableGroups.filter(
  (g) => g.id !== "dress_construction" && g.id !== "dress_pockets"
);
const partialSections = groupCustomDetailGroupsByParentSection(partialGroups);
assert.equal(partialSections.some((p) => p.id === "dress"), false);

// 11. subgroup order inside each parent remains correct
for (const section of parentSections) {
  const originalSubgroups = allApplicableGroups
    .filter((g) => CUSTOM_DETAIL_SELECTION_GROUP_TO_PARENT_SECTION[g.id as StandardCustomDetailSelectionGroup] === section.id)
    .map((g) => g.id);
  assert.deepEqual(
    section.groups.map((g) => g.id),
    originalSubgroups
  );
}

// 12. option arrays/options retain their existing order unchanged
for (const section of parentSections) {
  for (const group of section.groups) {
    const originalGroup = allApplicableGroups.find((g) => g.id === group.id);
    assert.ok(originalGroup);
    assert.deepEqual(
      group.options.map((o) => o.id),
      originalGroup.options.map((o) => o.id)
    );
  }
}

// 13. grouping does not modify the input groups/options
const inputBackup = JSON.stringify(allApplicableGroups);
groupCustomDetailGroupsByParentSection(allApplicableGroups);
assert.equal(JSON.stringify(allApplicableGroups), inputBackup);

console.log("Custom-detail applicability verification passed.");
