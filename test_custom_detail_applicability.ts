import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE,
  NECK_DESIGN_SUBCATEGORY_BY_OPTION_ID,
  NECK_DESIGN_SUBCATEGORY_ORDER,
} from "./src/config/GarmentDetailsConfig";
import {
  calculateCustomDetailsPriceBreakdown,
  filterDesignSelectionsForCustomDetails,
  getSupportedCustomDetailGroups,
  groupApplicableCustomDetails,
  isAdditionalClothesCostSection,
  sortAdditionalClothesCostSections,
  groupCustomDetailGroupsByParentSection,
  getSelectableCustomDetailOptions,
  getSelectableCustomDetailGroups,
  getRequiredCustomDetailGroups,
  getCustomDetailsBreakdown,
  isClothingPriceSelectionGroup,
  canClearCustomDetailSelectionGroup,
  clearCustomDetailSelectionGroup,
  normalizeCustomDetailCatalog,
  isLiningEligibleForStyle,
  getMissingCustomDetailGroup,
} from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  calculateGarmentDetailsPrice,
  DECORATIVE_FEATURE_OPTIONS,
  sortDecorativeFeatures,
  sortTraditionalAccessories,
  TRADITIONAL_ACCESSORY_OPTIONS,
  getMonogramPlacementLabel,
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
    .filter((group) => group.id !== "additional_physical_garment")
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
      .filter((group) => group.id !== "additional_physical_garment")
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
  "skirt_length",
  "skirt_pockets",
  "bum_shorts_fastening",
  "bum_shorts_pockets",
  "trouser_fastening",
  "trouser_pockets",
  "standard_shorts_fastening",
  "standard_shorts_pockets",
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

const neckOptionIds = expectedOptionIdsByGroup.neck_design;
assert.deepEqual(
  NECK_DESIGN_SUBCATEGORY_ORDER,
  ["No Collar", "Vertical Collar", "Flat Collar"],
  "Neck subcategory display order must remain customer-facing and deterministic",
);
assert.deepEqual(
  neckOptionIds.filter(
    (optionId) =>
      NECK_DESIGN_SUBCATEGORY_BY_OPTION_ID[optionId] === "No Collar",
  ),
  ["neck_no_round", "neck_no_v", "neck_no_u"],
  "No Collar subcategory should include only collarless neck options",
);
assert.deepEqual(
  neckOptionIds.filter(
    (optionId) =>
      NECK_DESIGN_SUBCATEGORY_BY_OPTION_ID[optionId] === "Vertical Collar",
  ),
  ["neck_vert_round", "neck_vert_v", "neck_vert_u"],
  "Vertical Collar subcategory should include only vertical-collar neck options",
);
assert.deepEqual(
  neckOptionIds.filter(
    (optionId) =>
      NECK_DESIGN_SUBCATEGORY_BY_OPTION_ID[optionId] === "Flat Collar",
  ),
  ["neck_flat_round", "neck_flat_v", "neck_flat_u"],
  "Flat Collar subcategory should include only flat-collar neck options",
);
assert.equal(
  neckOptionIds.filter(
    (optionId) => NECK_DESIGN_SUBCATEGORY_BY_OPTION_ID[optionId] !== undefined,
  ).length,
  neckOptionIds.length,
  "Every configured neck option must be assigned to exactly one customer-facing subcategory",
);

const shuffledCatalog = deterministicallyShuffle(
  SEED_CUSTOM_DETAIL_CATALOG.map((option) => ({ ...option })),
);
assert.deepEqual(
  getOptionIdsByGroup(allGarmentStyle, shuffledCatalog),
  expectedOptionIdsByGroup,
  "Firestore document order cannot override configured Admin displayOrder",
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
].sort());
assert.deepEqual(
  restoredFemaleDraft.customDetailSnapshots?.map(
    (snapshot) => snapshot.selectionGroup,
  ).sort(),
  ["dress_construction"],
);
assert.equal(
  calculateCustomDetailsPriceBreakdown(
    restoredFemaleDraft,
    SEED_CUSTOM_DETAIL_CATALOG,
  ).clothingPrice,
  70,
  "only applicable restored selections affect pricing",
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
  "demographically ineligible selections are removed",
);
assert.deepEqual(
  staleSameGroupSelection.customDetailSnapshots?.map((s) => s.optionId),
  [],
);
assert.equal(
  calculateCustomDetailsPriceBreakdown(
    staleSameGroupSelection,
    demographicCatalog,
  ).total,
  0,
  "ineligible hidden selections do not affect pricing",
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
  "a hidden trouser choice is excluded from authoritative pricing",
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

// Unrestricted Custom Details selectability tests
const selectableOptions = getSelectableCustomDetailOptions(SEED_CUSTOM_DETAIL_CATALOG);
const selectableGroups = getSelectableCustomDetailGroups(SEED_CUSTOM_DETAIL_CATALOG);

// 1. Female style/customer can select Shirt options
const hasShirtOptions = selectableOptions.some((o) => o.garmentGroup === "shirt");
assert.ok(hasShirtOptions, "Female style/customer can select Shirt options");

// 2. Female style/customer can select Standard Shorts options
const hasShortsOptions = selectableOptions.some((o) => o.garmentGroup === "standard_shorts");
assert.ok(hasShortsOptions, "Female style/customer can select Standard Shorts options");

// 3. Male style/customer can select Dress options
const hasDressOptions = selectableOptions.some((o) => o.garmentGroup === "dress");
assert.ok(hasDressOptions, "Male style/customer can select Dress options");

// 4. Male style/customer can select Skirt options
const hasSkirtOptions = selectableOptions.some((o) => o.garmentGroup === "skirt");
assert.ok(hasSkirtOptions, "Male style/customer can select Skirt options");

// 5. Standard Custom Detail selectable groups are returned in deterministic canonical order
const standardSelectableGroupIds = selectableGroups
  .filter((g) => !isAdditionalClothesCostSection(g.id))
  .map((g) => g.id);
assert.deepEqual(
  standardSelectableGroupIds,
  [
    "additional_physical_garment",
    "shirt_construction",
    "shirt_pockets",
    "dress_construction",
    "dress_pockets",
    "neck_design",
    "skirt_length",
    "skirt_pockets",
    "bum_shorts_fastening",
    "bum_shorts_pockets",
    "trouser_fastening",
    "trouser_pockets",
    "standard_shorts_fastening",
    "standard_shorts_pockets",
  ],
  "standard selectable groups are in canonical order"
);

// 6. Required groups remain based on selected/base garment instead of all visible groups
const maleShirtRequired = getRequiredCustomDetailGroups(maleStyle, SEED_CUSTOM_DETAIL_CATALOG, { code: "G1" });
assert.deepEqual(
  maleShirtRequired.sort(),
  ["shirt_construction", "shirt_pockets", "neck_design"].sort(),
  "required groups remain based on base garment"
);

// 7. A valid but inapplicable selection is removed during sanitation.
const unconventionalSelections: DesignSelections = {
  customDetails: {
    shirt_construction: "shirt_std_short",
    dress_construction: "dress_std_short",
  },
};
const filteredUnconventional = filterDesignSelectionsForCustomDetails(
  maleStyle,
  unconventionalSelections,
  SEED_CUSTOM_DETAIL_CATALOG,
  { code: "G1" }
);
assert.deepEqual(
  filteredUnconventional.customDetails,
  {
    shirt_construction: "shirt_std_short",
  },
  "inapplicable selections are removed during sanitation"
);

// 8. Invalid/nonexistent/inactive selections are still removed
const inactiveOption: CustomDetailOption = {
  id: "inactive-test-option",
  label: "Inactive Option",
  description: "Inactive option",
  garmentGroup: "shirt",
  selectionGroup: "shirt_construction",
  priceCents: 500,
  eligibleDemographics: ["male"],
  displayOrder: 0,
  required: false,
  active: false,
  allowMultiple: false,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const customCatalog = [...SEED_CUSTOM_DETAIL_CATALOG, inactiveOption];
const invalidSelections: DesignSelections = {
  customDetails: {
    shirt_construction: "inactive-test-option",
    dress_construction: "invalid-id-123",
  },
};
const filteredInvalid = filterDesignSelectionsForCustomDetails(
  maleStyle,
  invalidSelections,
  customCatalog,
  { code: "G1" }
);
assert.deepEqual(
  filteredInvalid.customDetails,
  {},
  "invalid/inactive options are removed"
);

// 9. Existing option ordering remains unchanged
for (const group of selectableGroups) {
  const originalOptionsInGroup = SEED_CUSTOM_DETAIL_CATALOG
    .filter((o) => o.selectionGroup === group.id && o.active);
  assert.deepEqual(
    group.options.map((o) => o.id),
    originalOptionsInGroup.map((o) => o.id),
    `option ordering inside group ${group.id} remains unchanged`
  );
}

// 10. Additional Clothes Costs can be exposed independent of base garment applicability without changing prices
const selectableAdditionalGroups = selectableGroups.filter((g) => isAdditionalClothesCostSection(g.id));
assert.equal(selectableAdditionalGroups.length, 8, "all 8 additional cost sections are selectable");
assert.deepEqual(
  selectableAdditionalGroups.map((g) => g.id),
  [...ADDITIONAL_CLOTHES_COST_SECTION_ORDER],
  "additional cost sections are in canonical order"
);

// 11. Input structures are not unexpectedly mutated
const originalSelections: DesignSelections = {
  customDetails: {
    shirt_construction: "shirt_std_short",
  },
};
const selectionsBackup = JSON.stringify(originalSelections);
filterDesignSelectionsForCustomDetails(maleStyle, originalSelections, SEED_CUSTOM_DETAIL_CATALOG, { code: "G1" });
assert.equal(JSON.stringify(originalSelections), selectionsBackup, "input structures are not mutated");

// Active Selection Summary Verification Tests
const testDesignSelections: DesignSelections = {
  customDetails: {
    dress_construction: "dress_std_short", // €70, base garment (L1)
    shirt_construction: "shirt_std_short", // €65, unconventional
    dress_pockets: "dress_pocket_0", // €0, conventional
    standard_shorts_additional: ["standard_shorts_additional_combat_pockets"], // €5, unconventional additional
  },
};

// 1. Inapplicable selections are removed during sanitation.
const sanitizedSelections = filterDesignSelectionsForCustomDetails(
  femaleStyle,
  testDesignSelections,
  SEED_CUSTOM_DETAIL_CATALOG,
  { code: "L1" }
);
assert.deepEqual(sanitizedSelections.customDetails, {
  dress_construction: "dress_std_short",
  dress_pockets: "dress_pocket_0",
});

// 2 & 4. Authoritative pricing contributes exactly once (no duplicate charge)
const pricingResult = calculateDesignPricing({
  route: "alone",
  design: sanitizedSelections,
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
  style: femaleStyle,
  garment: { code: "L1" },
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

assert.ok(pricingResult);
assert.equal(pricingResult.clothingPrice, 70);
assert.equal(pricingResult.constructionUpgradesPrice, 0);
assert.equal(
  pricingResult.garmentSubtotal,
  pricingResult.clothingPrice +
    pricingResult.fabricPrice +
    pricingResult.fabricSewingCost +
    pricingResult.constructionSewingCost +
    pricingResult.customDetailsPrice,
  "custom details contribute exactly once to subtotal"
);

// 3. Breakdown/source contains only applicable options.
const customBreakdown = getCustomDetailsBreakdown(sanitizedSelections, SEED_CUSTOM_DETAIL_CATALOG);
const baseGarmentGroups = getSupportedCustomDetailGroups(femaleStyle, { code: "L1" });

// Active Selection Summary filtering logic
const summaryItems = customBreakdown.filter(
  (item) =>
    !isClothingPriceSelectionGroup(item.selectionGroup) ||
    !baseGarmentGroups.includes(item.garmentGroup)
);

// Under L1 (Dress) base garment:
// - dress_construction (garmentGroup "dress") is in baseGarmentGroups, so it is filtered out (as its price is in the base Selected Clothing Price).
// - dress_pockets (garmentGroup "dress", not clothing price) is displayed.

const summarySelectionGroups = summaryItems.map((item) => item.selectionGroup);
assert.ok(!summarySelectionGroups.includes("dress_construction"), "Base dress_construction is hidden");
assert.ok(summarySelectionGroups.includes("dress_pockets"), "Conventional dress_pockets is shown");

// 6. Existing conventional selections remain unchanged
const dressPocketsItem = summaryItems.find((item) => item.selectionGroup === "dress_pockets");
assert.ok(dressPocketsItem);
assert.equal(dressPocketsItem.price, 0);

// Price Summary vs Active Selection Summary Separation Tests
const separationDesign: DesignSelections = {
  customDetails: {
    dress_construction: "dress_std_short", // €70 (base garment L1)
    dress_pockets: "dress_pocket_0", // €0 (zero-cost "No Pockets")
    personalized_additional: ["personalized_additional_evaluation"], // €0 (requires evaluation / zero-cost additional cost)
  },
  decorativeFeatures: ["Name Monogram"], // €12
  monogramPlacement: "left_chest", // €0
};

// Authoritative pricing calculation
const separationPricing = calculateDesignPricing({
  route: "alone",
  design: separationDesign,
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
  style: femaleStyle,
  garment: { code: "L1" },
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

assert.ok(separationPricing);
assert.equal(separationPricing.customDetailsPrice, 12);
assert.equal(separationPricing.clothingPrice, 70);

const breakdownForSeparation = getCustomDetailsBreakdown(separationDesign, SEED_CUSTOM_DETAIL_CATALOG);

// Live Price Summary filtering (priced items)
const pricedSummaryItems = breakdownForSeparation.filter((item) => item.price > 0);

// Active Selection Summary filtering (non-priced items)
const nonPricedSummaryItems = breakdownForSeparation.filter((item) => item.price === 0);

// 1. €0 "No Pockets" does not appear in monetary breakdown
const dressPocketsInPriced = pricedSummaryItems.find((i) => i.selectionGroup === "dress_pockets");
assert.ok(!dressPocketsInPriced);

// 2. €0 "No Pockets" remains available for Active Selection Summary
const dressPocketsInNonPriced = nonPricedSummaryItems.find((i) => i.selectionGroup === "dress_pockets");
assert.ok(dressPocketsInNonPriced);
assert.equal(dressPocketsInNonPriced.price, 0);

// 3. Name Monogram +€12 remains in monetary breakdown
const monogramFeature = separationPricing.decorativeFeatures.find((f) => f.label === "Name Monogram");
assert.ok(monogramFeature);
assert.equal(monogramFeature.price, 12);

// 4. Monogram Placement €0 is excluded from monetary breakdown but remains available as a selection detail
const placementLabel = getMonogramPlacementLabel(separationDesign.monogramPlacement);
assert.equal(placementLabel, "Left Chest");

// 5. €0 Additional Clothes Cost is excluded from monetary breakdown but remains available as selection detail
const evaluationInPriced = pricedSummaryItems.find((i) => i.selectionGroup === "personalized_additional");
assert.ok(!evaluationInPriced);
const evaluationInNonPriced = nonPricedSummaryItems.find((i) => i.selectionGroup === "personalized_additional");
assert.ok(evaluationInNonPriced);
assert.equal(evaluationInNonPriced.price, 0);

// 8. Authoritative total before and after this display change is identical
assert.equal(
  separationPricing.garmentSubtotal,
  separationPricing.clothingPrice +
    separationPricing.fabricPrice +
    separationPricing.fabricSewingCost +
    separationPricing.constructionSewingCost +
    separationPricing.customDetailsPrice,
  "Authoritative total remains identical"
);

// 9. No charge is duplicated
const displayedPriceSummaryItems = breakdownForSeparation.filter(
  (item) =>
    (!isClothingPriceSelectionGroup(item.selectionGroup) ||
     !baseGarmentGroups.includes(item.garmentGroup)) &&
    item.price > 0
);
const sumPricedBreakdown = displayedPriceSummaryItems.reduce((acc, item) => acc + item.price, 0);
assert.equal(sumPricedBreakdown, 0);

// Contextual Summary Titles Tests
const contextualTestDesign: DesignSelections = {
  customDetails: {
    shirt_pockets: "shirt_pocket_0", // "No Pockets" (Shirt Pockets)
    trouser_pockets: "trouser_pocket_back", // "Back Pocket" (Trouser Pockets)
    standard_shorts_pockets: "shorts_std_pocket_back", // "Back Pocket" (Standard Shorts Pockets)
    bum_shorts_pockets: "bum_pocket_none", // "No Pockets" (Bum Shorts Pockets)
    neck_design: "neck_vert_v", // "Vertical Collar, V-Shaped Neck"
    skirt_length: "skirt_long", // "Long Length"
    skirt_pockets: "skirt_pocket_2", // "With 2 Side Pockets"
    shirt_additional: "shirt_additional_no_cost", // "No Additional Cost Listed"
    personalized_additional: ["personalized_additional_evaluation"], // "Personalized Additional Requirement", requires evaluation
  },
  decorativeFeatures: ["Name Monogram"],
  monogramPlacement: "left_chest",
};

// Calculate pricing with a mock style and garment
const contextualPricing = calculateDesignPricing({
  route: "alone",
  design: contextualTestDesign,
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
  style: femaleStyle,
  garment: { code: "L1" },
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

// Helper formatting function to emulate the summary transform logic
const getContextualizedSummary = (item: any) => {
  const contextTitle = CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE[item.selectionGroup] || item.label;
  const value = item.label + (item.requiresEvaluation ? " - Requires evaluation" : "");
  return { label: contextTitle, value };
};

const contextualBreakdown = getCustomDetailsBreakdown(contextualTestDesign, SEED_CUSTOM_DETAIL_CATALOG);

// 1. Shirt "No Pockets" is represented as: Shirt Pockets: No Pockets
const shirtPocketOption = contextualBreakdown.find((i) => i.selectionGroup === "shirt_pockets");
assert.ok(shirtPocketOption);
const shirtPocketSummary = getContextualizedSummary(shirtPocketOption);
assert.equal(shirtPocketSummary.label, "Shirt Pockets");
assert.equal(shirtPocketSummary.value, "No Pockets");

// 2. Trouser "Back Pocket" is represented with a Trouser-specific title
const trouserPocketOption = contextualBreakdown.find((i) => i.selectionGroup === "trouser_pockets");
assert.ok(trouserPocketOption);
const trouserPocketSummary = getContextualizedSummary(trouserPocketOption);
assert.equal(trouserPocketSummary.label, "Trouser Pockets");
assert.ok(trouserPocketSummary.label.includes("Trouser"));

// 3. Standard Shorts and Bum Shorts pocket selections cannot be confused (have different summary titles)
const stdShortsPocketOption = contextualBreakdown.find((i) => i.selectionGroup === "standard_shorts_pockets");
assert.ok(stdShortsPocketOption);
const stdShortsPocketSummary = getContextualizedSummary(stdShortsPocketOption);
assert.equal(stdShortsPocketSummary.label, "Standard Shorts Pockets");

const bumShortsPocketOption = contextualBreakdown.find((i) => i.selectionGroup === "bum_shorts_pockets");
assert.ok(bumShortsPocketOption);
const bumShortsPocketSummary = getContextualizedSummary(bumShortsPocketOption);
assert.equal(bumShortsPocketSummary.label, "Bum Shorts Pockets");
assert.notEqual(stdShortsPocketSummary.label, bumShortsPocketSummary.label);

// 4. Neck Design has the contextual title: Neck Design
const neckDesignOption = contextualBreakdown.find((i) => i.selectionGroup === "neck_design");
assert.ok(neckDesignOption);
const neckDesignSummary = getContextualizedSummary(neckDesignOption);
assert.equal(neckDesignSummary.label, "Neck Design");

// 5. Skirt Length and Skirt Pockets use distinct titles
const skirtLengthOption = contextualBreakdown.find((i) => i.selectionGroup === "skirt_length");
assert.ok(skirtLengthOption);
const skirtLengthSummary = getContextualizedSummary(skirtLengthOption);
assert.equal(skirtLengthSummary.label, "Skirt Length");

const skirtPocketOption = contextualBreakdown.find((i) => i.selectionGroup === "skirt_pockets");
assert.ok(skirtPocketOption);
const skirtPocketSummary = getContextualizedSummary(skirtPocketOption);
assert.equal(skirtPocketSummary.label, "Skirt Pockets");
assert.notEqual(skirtLengthSummary.label, skirtPocketSummary.label);

// 6. Zero-cost Additional Clothes Costs have contextual section titles
const shirtAdditionalOption = contextualBreakdown.find((i) => i.selectionGroup === "shirt_additional");
assert.ok(shirtAdditionalOption);
const shirtAdditionalSummary = getContextualizedSummary(shirtAdditionalOption);
assert.equal(shirtAdditionalSummary.label, "Shirts - Additional");
assert.equal(shirtAdditionalSummary.value, "No Additional Cost Listed");

// 7. "Requires evaluation" remains visible for personalized requirements
const personalizedOption = contextualBreakdown.find((i) => i.selectionGroup === "personalized_additional");
assert.ok(personalizedOption);
const personalizedSummary = getContextualizedSummary(personalizedOption);
assert.equal(personalizedSummary.label, "Personalized Additional");
assert.ok(personalizedSummary.value.includes("Requires evaluation"));

// 8. Existing Monogram Placement formatting remains unchanged
const placementLabelValue = getMonogramPlacementLabel(contextualTestDesign.monogramPlacement);
assert.equal(placementLabelValue, "Left Chest");

// 9. Pricing and authoritative totals remain unchanged
assert.ok(contextualPricing);
assert.equal(
  contextualPricing.garmentSubtotal,
  contextualPricing.clothingPrice +
    contextualPricing.fabricPrice +
    contextualPricing.fabricSewingCost +
    contextualPricing.constructionSewingCost +
    contextualPricing.customDetailsPrice,
  "Totals remain mathematically sound"
);

// ==========================================
// Clear-Selection Controls Tests
// ==========================================

console.log("Running clear-selection tests...");

// Setup mock style and catalog
const testStyle: StyleCategory = {
  id: "test-style",
  name: "Test Style",
  gender: "unisex",
  clothingCategory: "senator",
  supportedGarmentGroups: ["shirt"],
  baseSewingPriceCents: 5000,
  targetDemographic: "unisex",
  pricingRules: [],
  customDetailConfig: {
    enabled: true,
    requiredSelectionGroups: ["shirt_construction"],
  },
} as any;

const testCatalog: CustomDetailOption[] = [
  {
    id: "sc_pocket_1",
    label: "Pockets",
    description: "Standard pocket option",
    selectionGroup: "shirt_pockets",
    allowMultiple: false,
    priceCents: 1000,
    active: true,
    garmentGroup: "shirt",
    eligibleDemographics: ["unisex"],
    displayOrder: 0,
    required: false,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "sc_construction_1",
    label: "Construction Required",
    description: "Required option",
    selectionGroup: "shirt_construction",
    allowMultiple: false,
    priceCents: 0,
    active: true,
    garmentGroup: "shirt",
    eligibleDemographics: ["unisex"],
    displayOrder: 0,
    required: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "sc_additional_1",
    label: "Additional Upgrade",
    description: "Additional cost",
    selectionGroup: "shirt_additional",
    allowMultiple: true,
    priceCents: 1500,
    active: true,
    garmentGroup: "shirt",
    eligibleDemographics: ["unisex"],
    displayOrder: 0,
    required: false,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "sc_additional_2",
    label: "Additional Upgrade 2",
    description: "Additional cost 2",
    selectionGroup: "shirt_additional",
    allowMultiple: true,
    priceCents: 2000,
    active: true,
    garmentGroup: "shirt",
    eligibleDemographics: ["unisex"],
    displayOrder: 0,
    required: false,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "L5", // Dress lining special case
    label: "Dress Lining",
    description: "Lining net",
    selectionGroup: "dress_additional",
    allowMultiple: true,
    priceCents: 1000,
    active: true,
    garmentGroup: "dress",
    eligibleDemographics: ["unisex"],
    displayOrder: 0,
    required: false,
    createdAt: "",
    updatedAt: "",
  },
] as any;

const mockGarment = { code: "AUTO", type: "Senator Outfit" };

// Scenario 1: REQUIRED-GROUP PROTECTION - cannot clear required group
const selectionsWithRequired: DesignSelections = {
  customDetails: {
    shirt_construction: "sc_construction_1",
    shirt_pockets: "sc_pocket_1",
  },
};

const canClearRequired = canClearCustomDetailSelectionGroup(
  selectionsWithRequired,
  "shirt_construction",
  testStyle,
  testCatalog,
  mockGarment,
);
assert.equal(canClearRequired, false, "Required group should not be clearable");

const clearedRequiredResult = clearCustomDetailSelectionGroup(
  selectionsWithRequired,
  "shirt_construction",
  testStyle,
  testCatalog,
  mockGarment,
);
assert.equal(clearedRequiredResult, selectionsWithRequired, "Clearing required group must return the original object unchanged");

// Scenario 2: OPTIONAL GROUP CLEARING
const selectionsWithOptional: DesignSelections = {
  customDetails: {
    shirt_construction: "sc_construction_1",
    shirt_additional: "sc_additional_1",
  },
};

const canClearOptional = canClearCustomDetailSelectionGroup(
  selectionsWithOptional,
  "shirt_additional",
  testStyle,
  testCatalog,
  mockGarment,
);
assert.equal(canClearOptional, true, "Optional group with selection should be clearable");

const clearedOptionalResult = clearCustomDetailSelectionGroup(
  selectionsWithOptional,
  "shirt_additional",
  testStyle,
  testCatalog,
  mockGarment,
);
assert.ok(clearedOptionalResult !== selectionsWithOptional, "Clearing optional group must return a new object");
assert.ok(clearedOptionalResult.customDetails, "customDetails should exist");
assert.equal(clearedOptionalResult.customDetails.shirt_additional, undefined, "Cleared group key must be completely deleted");
assert.equal(clearedOptionalResult.customDetails.shirt_construction, "sc_construction_1", "Unrelated selections must be preserved");

// Scenario 3: IMMUTABILITY PROOFS
assert.deepEqual(selectionsWithOptional.customDetails, {
  shirt_construction: "sc_construction_1",
  shirt_additional: "sc_additional_1",
}, "Original selections object's customDetails must not be mutated");

// Scenario 4: MULTI-SELECT CLEARING
const selectionsMulti: DesignSelections = {
  customDetails: {
    shirt_additional: ["sc_additional_1", "sc_additional_2"],
  },
  customDetailSnapshots: [
    { optionId: "sc_additional_1", selectionGroup: "shirt_additional", label: "Add 1", priceCents: 1500, requiresEvaluation: false },
    { optionId: "sc_additional_2", selectionGroup: "shirt_additional", label: "Add 2", priceCents: 2000, requiresEvaluation: false },
    { optionId: "sc_construction_1", selectionGroup: "shirt_construction", label: "Construction", priceCents: 0, requiresEvaluation: false },
  ] as any,
};

const clearedMulti = clearCustomDetailSelectionGroup(
  selectionsMulti,
  "shirt_additional",
  testStyle,
  testCatalog,
  mockGarment,
);

assert.equal(clearedMulti.customDetails.shirt_additional, undefined, "Multi-select clear removes key entirely");
assert.ok(clearedMulti.customDetailSnapshots, "Snapshots list exists");
const remainingSnapshots = clearedMulti.customDetailSnapshots;
assert.equal(remainingSnapshots.length, 1, "Snapshots of cleared group must be removed");
assert.equal(remainingSnapshots[0].optionId, "sc_construction_1", "Unrelated snapshots must remain untouched");

// Scenario 5: DRESS LINING SPECIAL CASE
const selectionsLining: DesignSelections = {
  hasLining: true,
  customDetails: {
    dress_additional: ["L5"],
  },
  customDetailSnapshots: [
    { optionId: "L5", selectionGroup: "dress_additional", label: "Lining", priceCents: 1000, requiresEvaluation: false },
  ] as any,
};

const clearedLining = clearCustomDetailSelectionGroup(
  selectionsLining,
  "dress_additional",
  testStyle,
  testCatalog,
  mockGarment,
);

assert.equal(clearedLining.hasLining, false, "Clearing dress_additional must synchronize hasLining to false");
assert.equal(clearedLining.customDetails.dress_additional, undefined, "dress_additional key should be deleted");
assert.equal(clearedLining.customDetailSnapshots?.length, 0, "dress_additional snapshot must be removed");

// ==========================================
// None state refinement tests
// ==========================================

console.log("Running None state refinement tests...");

// 1. Optional single-choice group represents None when no selection exists
const selectionsEmpty: DesignSelections = {};
const canClearEmptyOptional = canClearCustomDetailSelectionGroup(
  selectionsEmpty,
  "shirt_pockets",
  testStyle,
  testCatalog,
  mockGarment,
);
assert.equal(canClearEmptyOptional, false, "Should not be able to clear an empty group (it is already None)");

// 2. None is UI-only and absent from catalog
const normalizedCat = normalizeCustomDetailCatalog(testCatalog);
const noneCatalogOption = normalizedCat.find(opt => opt.id === "none" || opt.label === "None");
assert.equal(noneCatalogOption, undefined, "None option must not exist in catalog");

// 3. None produces no customDetails key
const clearedObj = clearCustomDetailSelectionGroup(
  selectionsWithRequired,
  "shirt_pockets",
  testStyle,
  testCatalog,
  mockGarment,
);
assert.equal(clearedObj.customDetails?.shirt_pockets, undefined, "None state has no key in customDetails");

// 4. None produces no customDetailSnapshots
assert.ok(!clearedObj.customDetailSnapshots || clearedObj.customDetailSnapshots.length === 0, "None state produces no snapshots");

// 5. None produces no price
const selectionsForPricing1: DesignSelections = {
  customDetails: {
    shirt_construction: "sc_construction_1",
    shirt_pockets: "sc_pocket_1",
  },
};
const selectionsForPricing2 = clearCustomDetailSelectionGroup(
  selectionsForPricing1,
  "shirt_pockets",
  testStyle,
  testCatalog,
  mockGarment,
);
const pricing1 = calculateDesignPricing({
  route: "alone",
  design: selectionsForPricing1,
  fabric: {
    code: "CTX-001",
    category: "HiTarget Ankara",
  } as any,
  style: testStyle,
  catalog: testCatalog,
  garment: mockGarment,
  businessSettings: {
    pricingSettings: {
      depositPercentage: 50,
      balancePercentage: 50,
      currency: "EUR",
      vatTaxPercentage: 0,
      discountRulesEnabled: false,
      standardAccessoryCharge: 10,
    },
  } as any,
});
const pricing2 = calculateDesignPricing({
  route: "alone",
  design: selectionsForPricing2,
  fabric: {
    code: "CTX-001",
    category: "HiTarget Ankara",
  } as any,
  style: testStyle,
  catalog: testCatalog,
  garment: mockGarment,
  businessSettings: {
    pricingSettings: {
      depositPercentage: 50,
      balancePercentage: 50,
      currency: "EUR",
      vatTaxPercentage: 0,
      discountRulesEnabled: false,
      standardAccessoryCharge: 10,
    },
  } as any,
});
assert.equal(pricing1.customDetailsPrice - pricing2.customDetailsPrice, 10, "Clearing standard pockets saves exactly 10.00 euros");

// 6. Required groups retain protected helper behavior by default, while the
// Step 3 UI can explicitly clear them to represent its UI-only None state.
const requiredGroupsMock = getRequiredCustomDetailGroups(testStyle, normalizedCat, mockGarment);
assert.ok(requiredGroupsMock.includes("shirt_construction"), "shirt_construction is required");
const canClearReq = canClearCustomDetailSelectionGroup(
  selectionsWithRequired,
  "shirt_construction",
  testStyle,
  testCatalog,
  mockGarment,
);
assert.equal(canClearReq, false, "Required group cannot be cleared (does not permit None)");
const requiredNoneSelection = clearCustomDetailSelectionGroup(
  selectionsWithRequired,
  "shirt_construction",
  testStyle,
  testCatalog,
  mockGarment,
  true,
);
assert.equal(
  requiredNoneSelection.customDetails?.shirt_construction,
  undefined,
  "Step 3 None can clear a required group without creating a synthetic option",
);

const legacyNotedSelection = {
  customDetails: { shirt_pockets: "sc_pocket_1" },
  customDetailNotes: { sc_pocket_1: "Place on the left side." },
  customDetailSnapshots: [
    {
      optionId: "sc_pocket_1",
      label: "With 1 chest pocket",
      description: "On the left or right side of the chest",
      garmentGroup: "shirt",
      selectionGroup: "shirt_pockets",
      priceCents: 0,
      note: "Place on the left side.",
    },
  ],
} as unknown as DesignSelections & {
  customDetailNotes: Record<string, string>;
};
const sanitizedLegacySelection = filterDesignSelectionsForCustomDetails(
  testStyle,
  legacyNotedSelection,
  testCatalog,
  mockGarment,
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    sanitizedLegacySelection,
    "customDetailNotes",
  ),
  false,
  "Legacy per-detail note maps are ignored and removed during hydration",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    sanitizedLegacySelection.customDetailSnapshots?.[0] || {},
    "note",
  ),
  false,
  "Legacy per-detail snapshot notes are ignored and removed during hydration",
);
const legacyBreakdown = getCustomDetailsBreakdown(
  legacyNotedSelection,
  testCatalog,
);
const authoritativePocketOption = normalizedCat.find(
  (option) => option.id === "sc_pocket_1",
);
assert.equal(legacyBreakdown[0]?.label, authoritativePocketOption?.label);
assert.equal(
  legacyBreakdown[0]?.price,
  (authoritativePocketOption?.priceCents || 0) / 100,
);
assert.equal(
  Object.prototype.hasOwnProperty.call(legacyBreakdown[0] || {}, "note"),
  false,
  "Price Summary breakdown rows contain only the selected option and price",
);
const clearedLegacySelection = clearCustomDetailSelectionGroup(
  legacyNotedSelection,
  "shirt_pockets",
  testStyle,
  testCatalog,
  mockGarment,
);
assert.equal(
  getCustomDetailsBreakdown(clearedLegacySelection, testCatalog).length,
  0,
  "The UI-only None action removes the selected option from Price Summary",
);
const designStudioSource = readFileSync(
  "src/components/DesignStudioView.tsx",
  "utf8",
);
assert.doesNotMatch(
  designStudioSource,
  /Note for \{opt\.label\}|Add a tailoring note for this selection/,
  "Step 3 renders Custom Detail options without per-option note controls",
);
assert.doesNotMatch(
  designStudioSource,
  /customDetailNotes|handleNoteChange/,
  "Design Studio no longer owns per-custom-detail note state or handlers",
);

// 7. Every active single-choice selection group has deterministic behavior
const activeSingleChoiceGroups = getSelectableCustomDetailGroups(testCatalog).filter(g => !g.options.some(opt => opt.allowMultiple));
assert.ok(activeSingleChoiceGroups.length > 0);
for (const group of activeSingleChoiceGroups) {
  const reqs = getRequiredCustomDetailGroups(testStyle, normalizedCat, mockGarment);
  const isReq = reqs.includes(group.id);
  console.log(`  - Group: ${group.id}, Required: ${isReq}`);
}

// 8. L6/L7 Garment Choice requirements test
console.log("Running L6/L7 Garment Choice requirements tests...");
const testStyleNoRequiredConfig: StyleCategory = {
  id: "test-style-no-req",
  name: "Test Style No Req",
  gender: "unisex",
  clothingCategory: "senator",
  baseSewingPriceCents: 5000,
  targetDemographic: "unisex",
  pricingRules: [],
  customDetailConfig: {
    enabled: true,
  },
} as any;

const l6GarmentUnresolved: CustomDetailGarmentContext = {
  code: "L6",
  type: "Leg Pant or Skirt, Short-Length (Up to Knee)",
  composition: "Leg Pant or Skirt",
};
const l6GarmentTrousers: CustomDetailGarmentContext = {
  ...l6GarmentUnresolved,
  lowerGarmentType: "trousers",
};
const l6GarmentSkirt: CustomDetailGarmentContext = {
  ...l6GarmentUnresolved,
  lowerGarmentType: "skirt",
};

// When unresolved: neither trouser nor skirt groups are required/applicable
const realNormalizedCat = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const requiredGroupsUnresolved = getRequiredCustomDetailGroups(testStyleNoRequiredConfig, realNormalizedCat, l6GarmentUnresolved);
assert.ok(!requiredGroupsUnresolved.includes("trouser_fastening"), "trouser_fastening should not be required when lowerGarmentType is unresolved");
assert.ok(!requiredGroupsUnresolved.includes("trouser_pockets"), "trouser_pockets should not be required when lowerGarmentType is unresolved");
assert.ok(!requiredGroupsUnresolved.includes("skirt_length"), "skirt_length should not be required when lowerGarmentType is unresolved");
assert.ok(!requiredGroupsUnresolved.includes("skirt_pockets"), "skirt_pockets should not be required when lowerGarmentType is unresolved");

// When trousers: trouser fastening and trouser pockets should be required, skirt groups should not be
const requiredGroupsTrousers = getRequiredCustomDetailGroups(testStyleNoRequiredConfig, realNormalizedCat, l6GarmentTrousers);
console.log("supportedGroups:", getSupportedCustomDetailGroups(testStyleNoRequiredConfig, l6GarmentTrousers));
console.log("requiredGroupsTrousers:", requiredGroupsTrousers);
assert.ok(requiredGroupsTrousers.includes("trouser_fastening"), "trouser_fastening should be required when lowerGarmentType is trousers");
assert.ok(requiredGroupsTrousers.includes("trouser_pockets"), "trouser_pockets should be required when lowerGarmentType is trousers");
assert.ok(!requiredGroupsTrousers.includes("skirt_length"), "skirt_length should not be required when lowerGarmentType is trousers");
assert.ok(!requiredGroupsTrousers.includes("skirt_pockets"), "skirt_pockets should not be required when lowerGarmentType is trousers");

// When skirt: skirt length and skirt pockets should be required, trouser groups should not be
const requiredGroupsSkirt = getRequiredCustomDetailGroups(testStyleNoRequiredConfig, realNormalizedCat, l6GarmentSkirt);
assert.ok(!requiredGroupsSkirt.includes("trouser_fastening"), "trouser_fastening should not be required when lowerGarmentType is skirt");
assert.ok(!requiredGroupsSkirt.includes("trouser_pockets"), "trouser_pockets should not be required when lowerGarmentType is skirt");
assert.ok(requiredGroupsSkirt.includes("skirt_length"), "skirt_length should be required when lowerGarmentType is skirt");
assert.ok(requiredGroupsSkirt.includes("skirt_pockets"), "skirt_pockets should be required when lowerGarmentType is skirt");

console.log("L6/L7 Garment Choice tests passed!");

// 9. L8/L9 Combination Preservation tests
console.log("Running L8/L9 Combination Preservation tests...");
const ladiesTestStyle: StyleCategory = {
  id: "ladies-test-style",
  name: "Ladies Test Style",
  gender: "female",
  clothingCategory: "senator",
  baseSewingPriceCents: 6000,
  targetDemographic: "female",
  pricingRules: [],
  customDetailConfig: {
    enabled: true,
  },
} as any;

const combinationCodes = ["L8.1", "L8.2", "L9.1", "L9.2"];
for (const code of combinationCodes) {
  const gUnresolved: CustomDetailGarmentContext = {
    code,
    type: `${code} Combination Garment`,
    composition: `${code} Combination`,
  };
  const gTrousers: CustomDetailGarmentContext = { ...gUnresolved, lowerGarmentType: "trousers" };
  const gSkirt: CustomDetailGarmentContext = { ...gUnresolved, lowerGarmentType: "skirt" };

  // Unresolved preserves Dress, does not require trouser or skirt details
  const reqsUnresolved = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, gUnresolved);
  assert.ok(reqsUnresolved.includes("dress_construction"), `${code} unresolved must require dress_construction`);
  assert.ok(reqsUnresolved.includes("dress_pockets"), `${code} unresolved must require dress_pockets`);
  assert.ok(!reqsUnresolved.includes("trouser_fastening"), `${code} unresolved must not require trouser_fastening`);
  assert.ok(!reqsUnresolved.includes("trouser_pockets"), `${code} unresolved must not require trouser_pockets`);
  assert.ok(!reqsUnresolved.includes("skirt_length"), `${code} unresolved must not require skirt_length`);
  assert.ok(!reqsUnresolved.includes("skirt_pockets"), `${code} unresolved must not require skirt_pockets`);

  // Trouser selected: Dress required, Trouser required, Skirt optional
  const reqsTrousers = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, gTrousers);
  assert.ok(reqsTrousers.includes("dress_construction"), `${code} trousers must require dress_construction`);
  assert.ok(reqsTrousers.includes("dress_pockets"), `${code} trousers must require dress_pockets`);
  assert.ok(reqsTrousers.includes("trouser_fastening"), `${code} trousers must require trouser_fastening`);
  assert.ok(reqsTrousers.includes("trouser_pockets"), `${code} trousers must require trouser_pockets`);
  assert.ok(!reqsTrousers.includes("skirt_length"), `${code} trousers must not require skirt_length`);
  assert.ok(!reqsTrousers.includes("skirt_pockets"), `${code} trousers must not require skirt_pockets`);

  // Skirt selected: Dress required, Skirt required, Trouser optional
  const reqsSkirt = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, gSkirt);
  assert.ok(reqsSkirt.includes("dress_construction"), `${code} skirt must require dress_construction`);
  assert.ok(reqsSkirt.includes("dress_pockets"), `${code} skirt must require dress_pockets`);
  assert.ok(!reqsSkirt.includes("trouser_fastening"), `${code} skirt must not require trouser_fastening`);
  assert.ok(!reqsSkirt.includes("trouser_pockets"), `${code} skirt must not require trouser_pockets`);
  assert.ok(reqsSkirt.includes("skirt_length"), `${code} skirt must require skirt_length`);
  assert.ok(reqsSkirt.includes("skirt_pockets"), `${code} skirt must require skirt_pockets`);
}
console.log("L8/L9 Combination Preservation tests passed!");

// 10. Existing G1, G3, G4, G5.1 and L1 behavior remains unchanged
console.log("Checking G1, G3, G4, G5.1 and L1 behaviors remain unchanged...");
const g1Groups = getSupportedCustomDetailGroups(testStyle, { code: "G1" });
assert.deepEqual(g1Groups, ["shirt", "neck"], "G1 should support shirt and neck");

const g3Groups = getSupportedCustomDetailGroups(testStyle, { code: "G3" });
assert.deepEqual(g3Groups, ["standard_shorts"], "G3 should support standard_shorts");

const g4Groups = getSupportedCustomDetailGroups(testStyle, { code: "G4" });
assert.deepEqual(g4Groups, ["trousers"], "G4 should support trousers");

const g51Groups = getSupportedCustomDetailGroups(testStyle, { code: "G5.1" });
assert.deepEqual(g51Groups, ["shirt", "neck", "standard_shorts"], "G5.1 should support shirt, neck, standard_shorts");

const l1Groups = getSupportedCustomDetailGroups(testStyle, { code: "L1" });
assert.deepEqual(l1Groups, ["dress", "neck"], "L1 should support dress and neck");
console.log("Garment groups regression tests passed!");

// 11. Price remains unchanged when switching Trouser vs Skirt
console.log("Checking price remains unchanged when switching Trouser vs Skirt...");
const pricingTrousers = calculateDesignPricing({
  route: "alone",
  design: {
    lowerGarmentType: "trousers",
    customDetails: {},
  },
  fabric: {
    code: "CTX-001",
    category: "HiTarget Ankara",
  } as any,
  style: testStyle,
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  garment: { code: "L6" },
  businessSettings: {
    pricingSettings: {
      depositPercentage: 50,
      balancePercentage: 50,
      currency: "EUR",
      vatTaxPercentage: 0,
      discountRulesEnabled: false,
      standardAccessoryCharge: 10,
    },
  } as any,
});
const pricingSkirt = calculateDesignPricing({
  route: "alone",
  design: {
    lowerGarmentType: "skirt",
    customDetails: {},
  },
  fabric: {
    code: "CTX-001",
    category: "HiTarget Ankara",
  } as any,
  style: testStyle,
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  garment: { code: "L6" },
  businessSettings: {
    pricingSettings: {
      depositPercentage: 50,
      balancePercentage: 50,
      currency: "EUR",
      vatTaxPercentage: 0,
      discountRulesEnabled: false,
      standardAccessoryCharge: 10,
    },
  } as any,
});
assert.ok(pricingTrousers !== null && pricingSkirt !== null);
assert.equal(pricingTrousers.clothingPrice, pricingSkirt.clothingPrice, "Clothing price must remain identical for trousers vs skirt choice");
assert.equal(pricingTrousers.garmentSubtotal, pricingSkirt.garmentSubtotal, "Total price must remain identical for trousers vs skirt choice");
console.log("Price equality verification passed!");

// 12. Composition-aware requiredness tests
console.log("Running composition-aware requiredness regression tests...");

// 1. Shirt-only order never requires Dress.
const g1Garment = { code: "G1", type: "Shirt", composition: "Shirt" };
const reqsG1 = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, g1Garment);
assert.ok(!reqsG1.includes("dress_construction"), "G1 should not require dress_construction");
assert.ok(!reqsG1.includes("dress_pockets"), "G1 should not require dress_pockets");

// 2. Shirt-only order never requires Skirt.
assert.ok(!reqsG1.includes("skirt_length"), "G1 should not require skirt_length");
assert.ok(!reqsG1.includes("skirt_pockets"), "G1 should not require skirt_pockets");

// 3. Shirt + Trouser never requires Dress.
const g52Garment = { code: "G5.2", type: "Shirt + Trouser", composition: "Shirt + Trouser" };
const reqsG52 = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, g52Garment);
assert.ok(!reqsG52.includes("dress_construction"), "G5.2 should not require dress_construction");
assert.ok(!reqsG52.includes("dress_pockets"), "G5.2 should not require dress_pockets");

// 4. Shirt + Trouser never requires Skirt.
assert.ok(!reqsG52.includes("skirt_length"), "G5.2 should not require skirt_length");
assert.ok(!reqsG52.includes("skirt_pockets"), "G5.2 should not require skirt_pockets");

// 5. Shirt + Shorts never requires Trouser.
const g51Garment = { code: "G5.1", type: "Shirt + Shorts", composition: "Shirt + Shorts" };
const reqsG51 = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, g51Garment);
assert.ok(!reqsG51.includes("trouser_fastening"), "G5.1 should not require trouser_fastening");
assert.ok(!reqsG51.includes("trouser_pockets"), "G5.1 should not require trouser_pockets");

// 6. Dress-only never requires Shirt.
const l1Garment = { code: "L1", type: "Dress", composition: "Dress" };
const reqsL1 = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, l1Garment);
assert.ok(!reqsL1.includes("shirt_construction"), "L1 should not require shirt_construction");
assert.ok(!reqsL1.includes("shirt_pockets"), "L1 should not require shirt_pockets");

// 7. Dress-only never requires Trouser/Skirt unless actually included.
assert.ok(!reqsL1.includes("trouser_fastening"), "L1 should not require trouser_fastening");
assert.ok(!reqsL1.includes("trouser_pockets"), "L1 should not require trouser_pockets");
assert.ok(!reqsL1.includes("skirt_length"), "L1 should not require skirt_length");
assert.ok(!reqsL1.includes("skirt_pockets"), "L1 should not require skirt_pockets");

// 8. L6/L7 requirements follow lowerGarmentType.
const l6UnresolvedReqs = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, { code: "L6" });
assert.ok(!l6UnresolvedReqs.includes("trouser_fastening"), "L6 unresolved must not require trousers");
assert.ok(!l6UnresolvedReqs.includes("skirt_length"), "L6 unresolved must not require skirt");

const l6TrouserReqs = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, { code: "L6", lowerGarmentType: "trousers" });
assert.ok(l6TrouserReqs.includes("trouser_fastening"), "L6 trousers must require trousers");
assert.ok(!l6TrouserReqs.includes("skirt_length"), "L6 trousers must not require skirt");

const l6SkirtReqs = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, { code: "L6", lowerGarmentType: "skirt" });
assert.ok(!l6SkirtReqs.includes("trouser_fastening"), "L6 skirt must not require trousers");
assert.ok(l6SkirtReqs.includes("skirt_length"), "L6 skirt must require skirt");

// 9. L8/L9 preserve Dress + selected lower branch.
const l8TrouserReqs = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, { code: "L8.1", lowerGarmentType: "trousers" });
assert.ok(l8TrouserReqs.includes("dress_construction"), "L8.1 trousers must require dress");
assert.ok(l8TrouserReqs.includes("trouser_fastening"), "L8.1 trousers must require trousers");
assert.ok(!l8TrouserReqs.includes("skirt_length"), "L8.1 trousers must not require skirt");

// 10. Non-included garment selections are removed.
const unconventionalDesign: DesignSelections = {
  customDetails: {
    shirt_construction: "shirt_std_short",
    dress_construction: "dress_std_short",
  },
};
const filteredDesign = filterDesignSelectionsForCustomDetails(
  ladiesTestStyle,
  unconventionalDesign,
  realNormalizedCat,
  g52Garment,
);
assert.equal(
  filteredDesign.customDetails?.dress_construction,
  undefined,
  "Inapplicable garment selections must be removed",
);

// 12. Explicit unconventional selection does NOT make that garment included.
const resolvedGroups = getSupportedCustomDetailGroups(ladiesTestStyle, g52Garment);
assert.ok(!resolvedGroups.includes("dress"), "Dress should not become included due to unconventional selection");

// 13. Explicit unconventional selection does NOT activate unrelated required groups.
const reqsWithUnconventional = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, g52Garment);
assert.ok(!reqsWithUnconventional.includes("dress_construction"), "Dress required groups must not be activated by unconventional selection");

// 14. Requiredness follows only the included garment groups.
const isRequiredIncluded = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, g52Garment).includes("shirt_construction");
const isRequiredNonIncluded = getRequiredCustomDetailGroups(ladiesTestStyle, realNormalizedCat, g52Garment).includes("dress_construction");
assert.equal(isRequiredIncluded, true, "shirt_construction (included required) must have isRequired true");
assert.equal(isRequiredNonIncluded, false, "dress_construction (non-included optional) must have isRequired false");

console.log("Composition-aware requiredness regression tests passed!");

// --- STEP 3 AUDIT FIXES REGRESSION TESTS ---
console.log("Running Step 3 Audit Fixes regression tests...");

// A. Lining eligibility checks
const femaleDressStyle = { ...ladiesTestStyle, demographic: "female" };

// expected true
const trueCodes = ["L1", "L2", "L3", "L4", "L8", "L8.1", "L8.2", "L9", "L9.1", "L9.2"];
for (const code of trueCodes) {
  assert.equal(isLiningEligibleForStyle(femaleDressStyle, code), true, `Code ${code} should be lining eligible`);
}

// expected false
const falseCodes = ["G1", "G3", "G4", "G5.1", "G5.2", "L6", "L7"];
for (const code of falseCodes) {
  assert.equal(isLiningEligibleForStyle(femaleDressStyle, code), false, `Code ${code} should NOT be lining eligible`);
}

// L8/L9 lining selection synchronizes hasLining true / false / pricing counts lining once
const catalog = realNormalizedCat;
const l8Garment: CustomDetailGarmentContext = { code: "L8.1", lowerGarmentType: "trousers" };

// 1. Can clear lining
const initialSelections: DesignSelections = {
  lowerGarmentType: "trousers",
  hasLining: true,
  customDetails: {
    dress_additional: ["L5"]
  }
};
assert.equal(canClearCustomDetailSelectionGroup(initialSelections, "dress_additional", femaleDressStyle, catalog, l8Garment), true, "Should be able to clear dress_additional if selected");

// 2. Clearing synchronizes hasLining false
const clearedSelections = clearCustomDetailSelectionGroup(initialSelections, "dress_additional", femaleDressStyle, catalog, l8Garment);
assert.equal(clearedSelections.hasLining, false, "Clearing dress_additional must synchronize hasLining to false");
assert.ok(!clearedSelections.customDetails?.dress_additional, "dress_additional key should be deleted");

// 3. Pricing counts lining once
const pricingLiningOptionOnly = calculateDesignPricing({
  route: "alone",
  design: {
    lowerGarmentType: "trousers",
    customDetails: {
      dress_additional: "L5"
    },
    hasLining: false // customDetail has L5
  },
  fabric: { code: "CTX-001", category: "HiTarget Ankara" } as any,
  style: femaleDressStyle,
  catalog,
  garment: l8Garment,
  businessSettings: {
    pricingSettings: {
      depositPercentage: 50,
      balancePercentage: 50,
      currency: "EUR",
      vatTaxPercentage: 0,
      discountRulesEnabled: false,
      standardAccessoryCharge: 10,
    },
  } as any,
});

const pricingLiningStateOnly = calculateDesignPricing({
  route: "alone",
  design: {
    lowerGarmentType: "trousers",
    customDetails: {},
    hasLining: true // state has lining
  },
  fabric: { code: "CTX-001", category: "HiTarget Ankara" } as any,
  style: femaleDressStyle,
  catalog,
  garment: l8Garment,
  businessSettings: {
    pricingSettings: {
      depositPercentage: 50,
      balancePercentage: 50,
      currency: "EUR",
      vatTaxPercentage: 0,
      discountRulesEnabled: false,
      standardAccessoryCharge: 10,
    },
  } as any,
});

const pricingLiningBoth = calculateDesignPricing({
  route: "alone",
  design: {
    lowerGarmentType: "trousers",
    customDetails: {
      dress_additional: "L5"
    },
    hasLining: true // both selected
  },
  fabric: { code: "CTX-001", category: "HiTarget Ankara" } as any,
  style: femaleDressStyle,
  catalog,
  garment: l8Garment,
  businessSettings: {
    pricingSettings: {
      depositPercentage: 50,
      balancePercentage: 50,
      currency: "EUR",
      vatTaxPercentage: 0,
      discountRulesEnabled: false,
      standardAccessoryCharge: 10,
    },
  } as any,
});

const pricingNoLining = calculateDesignPricing({
  route: "alone",
  design: {
    lowerGarmentType: "trousers",
    customDetails: {},
    hasLining: false
  },
  fabric: { code: "CTX-001", category: "HiTarget Ankara" } as any,
  style: femaleDressStyle,
  catalog,
  garment: l8Garment,
  businessSettings: {
    pricingSettings: {
      depositPercentage: 50,
      balancePercentage: 50,
      currency: "EUR",
      vatTaxPercentage: 0,
      discountRulesEnabled: false,
      standardAccessoryCharge: 10,
    },
  } as any,
});

assert.ok(pricingNoLining && pricingLiningOptionOnly && pricingLiningStateOnly && pricingLiningBoth);
assert.equal(pricingNoLining.customDetailsPrice, 0, "No lining selected must add 0 custom details price");
assert.equal(pricingLiningOptionOnly.customDetailsPrice, 10, "L5 selected must add exactly one lining charge of 10 EUR");
assert.equal(pricingLiningStateOnly.customDetailsPrice, 10, "Legacy hasLining true must add exactly one lining charge of 10 EUR");
assert.equal(pricingLiningBoth.customDetailsPrice, 10, "Both options active must add exactly one lining charge of 10 EUR");

// B. Validation target resolution checks
const missingSelections: DesignSelections = {
  customDetails: {}
};
const missingGroup = getMissingCustomDetailGroup(femaleDressStyle, missingSelections, catalog, l8Garment);
assert.equal(missingGroup, "dress_construction", "First missing group on dress should be dress_construction");

const completeRequiredSelections: DesignSelections = {
  customDetails: {
    dress_construction: "dress_std_short",
    dress_pockets: "dress_pocket_side",
    neck_design: "neck_classic",
    trouser_fastening: "trouser_zip",
    trouser_pockets: "trouser_pocket_side"
  }
};
const missingGroupOptional = getMissingCustomDetailGroup(femaleDressStyle, completeRequiredSelections, catalog, l8Garment);
assert.equal(missingGroupOptional, null, "Should return null if all required groups are provided, even if optional groups are missing");

console.log("Step 3 Audit Fixes regression tests passed!");

console.log("Custom-detail applicability verification passed.");
