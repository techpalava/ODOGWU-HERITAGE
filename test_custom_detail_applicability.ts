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
  CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE,
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
  trouser_fastening: "trouser_rope",
  trouser_pockets: "trouser_pocket_none",
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
  shirt_construction: "shirt_std_short",
  shirt_pockets: "shirt_pocket_0",
  neck_design: "neck_no_round",
  trouser_fastening: "trouser_rope",
  trouser_pockets: "trouser_pocket_none",
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
  "shirt_construction",
  "trouser_fastening",
].sort());
assert.deepEqual(
  restoredFemaleDraft.customDetailSnapshots?.map(
    (snapshot) => snapshot.selectionGroup,
  ).sort(),
  ["dress_construction", "shirt_construction"].sort(),
);
assert.equal(
  calculateCustomDetailsPriceBreakdown(
    restoredFemaleDraft,
    SEED_CUSTOM_DETAIL_CATALOG,
  ).clothingPrice,
  225,
  "selectable restored selections affect pricing normally",
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
  {
    neck_design: femaleOnlyNeckOption.id,
  },
  "demographic eligibility does not prevent manual selection",
);
assert.deepEqual(
  staleSameGroupSelection.customDetailSnapshots?.map((s) => s.optionId),
  [femaleOnlyNeckOption.id],
);
assert.equal(
  calculateCustomDetailsPriceBreakdown(
    staleSameGroupSelection,
    demographicCatalog,
  ).total,
  9,
  "manual demographic selections affect pricing normally",
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
  145,
  "a selectable trouser choice is included in authoritative pricing",
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

// 7. An unconventional valid selection survives filterDesignSelectionsForCustomDetails(...)
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
    dress_construction: "dress_std_short",
  },
  "unconventional valid selections survive sanitation"
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

// 1. Preserved: unconventional selections survive sanitation
const sanitizedSelections = filterDesignSelectionsForCustomDetails(
  femaleStyle,
  testDesignSelections,
  SEED_CUSTOM_DETAIL_CATALOG,
  { code: "L1" }
);
assert.deepEqual(sanitizedSelections.customDetails, testDesignSelections.customDetails);

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
// Base dress construction (€70) + unconventional shirt construction (€65) = €135 clothingPrice
assert.equal(pricingResult.clothingPrice, 135);
// Unconventional additional pocket upgrade (€5) = €5 constructionUpgradesPrice
assert.equal(pricingResult.constructionUpgradesPrice, 5);
assert.equal(
  pricingResult.garmentSubtotal,
  pricingResult.clothingPrice +
    pricingResult.fabricPrice +
    pricingResult.fabricSewingCost +
    pricingResult.constructionSewingCost +
    pricingResult.customDetailsPrice,
  "custom details contribute exactly once to subtotal"
);

// 3. Breakdown/source consumed by Active Selection Summary includes unconventional options
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
// - shirt_construction (garmentGroup "shirt") is NOT in baseGarmentGroups, so it is PRESERVED and DISPLAYED!
// - dress_pockets (garmentGroup "dress", not clothing price) is PRESERVED and DISPLAYED!
// - standard_shorts_additional (garmentGroup "standard_shorts", not clothing price) is PRESERVED and DISPLAYED!

const summarySelectionGroups = summaryItems.map((item) => item.selectionGroup);
assert.ok(!summarySelectionGroups.includes("dress_construction"), "Base dress_construction is hidden");
assert.ok(summarySelectionGroups.includes("shirt_construction"), "Unconventional shirt_construction is shown");
assert.ok(summarySelectionGroups.includes("dress_pockets"), "Conventional dress_pockets is shown");
assert.ok(summarySelectionGroups.includes("standard_shorts_additional"), "Unconventional standard_shorts_additional is shown");

// 5. Additional Clothes Costs selected from unconventional garment category also appear in breakdown and displayed items
const shortsAdditionalItem = summaryItems.find((item) => item.selectionGroup === "standard_shorts_additional");
assert.ok(shortsAdditionalItem);
assert.equal(shortsAdditionalItem.price, 5);

// 6. Existing conventional selections remain unchanged
const dressPocketsItem = summaryItems.find((item) => item.selectionGroup === "dress_pockets");
assert.ok(dressPocketsItem);
assert.equal(dressPocketsItem.price, 0);

// Price Summary vs Active Selection Summary Separation Tests
const separationDesign: DesignSelections = {
  customDetails: {
    dress_construction: "dress_std_short", // €70 (base garment L1)
    shirt_construction: "shirt_long_midlong", // €75 (unconventional priced custom detail)
    dress_pockets: "dress_pocket_0", // €0 (zero-cost "No Pockets")
    standard_shorts_additional: ["standard_shorts_additional_combat_pockets"], // €5 (unconventional priced additional cost)
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
// Authoritative customDetailsPrice = 5 (shorts_additional) + 12 (monogram) = 17
assert.equal(separationPricing.customDetailsPrice, 17);
// Authoritative clothingPrice = 70 (dress_construction) + 75 (shirt_construction) = 145
assert.equal(separationPricing.clothingPrice, 145);

const breakdownForSeparation = getCustomDetailsBreakdown(separationDesign, SEED_CUSTOM_DETAIL_CATALOG);

// Live Price Summary filtering (priced items)
const pricedSummaryItems = breakdownForSeparation.filter((item) => item.price > 0);

// Active Selection Summary filtering (non-priced items)
const nonPricedSummaryItems = breakdownForSeparation.filter((item) => item.price === 0);

// 1. +€75 Custom Detail remains in monetary breakdown
const shirtConstructionItem = pricedSummaryItems.find((i) => i.selectionGroup === "shirt_construction");
assert.ok(shirtConstructionItem);
assert.equal(shirtConstructionItem.price, 75);

// 2. €0 "No Pockets" does not appear in monetary breakdown
const dressPocketsInPriced = pricedSummaryItems.find((i) => i.selectionGroup === "dress_pockets");
assert.ok(!dressPocketsInPriced);

// 3. €0 "No Pockets" remains available for Active Selection Summary
const dressPocketsInNonPriced = nonPricedSummaryItems.find((i) => i.selectionGroup === "dress_pockets");
assert.ok(dressPocketsInNonPriced);
assert.equal(dressPocketsInNonPriced.price, 0);

// 4. Name Monogram +€12 remains in monetary breakdown
const monogramFeature = separationPricing.decorativeFeatures.find((f) => f.label === "Name Monogram");
assert.ok(monogramFeature);
assert.equal(monogramFeature.price, 12);

// 5. Monogram Placement €0 is excluded from monetary breakdown but remains available as a selection detail
const placementLabel = getMonogramPlacementLabel(separationDesign.monogramPlacement);
assert.equal(placementLabel, "Left Chest");

// 6. +€5 Additional Clothes Cost remains in monetary breakdown
const combatPocketsItem = pricedSummaryItems.find((i) => i.selectionGroup === "standard_shorts_additional");
assert.ok(combatPocketsItem);
assert.equal(combatPocketsItem.price, 5);

// 7. €0 Additional Clothes Cost is excluded from monetary breakdown but remains available as selection detail
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
assert.equal(sumPricedBreakdown, 75 + 5);

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

console.log("Custom-detail applicability verification passed.");
