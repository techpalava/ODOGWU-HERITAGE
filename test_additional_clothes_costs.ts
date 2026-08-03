import assert from "node:assert/strict";
import type {
  BusinessSettings,
  CartItem,
  CustomDetailGarmentContext,
  CustomDetailSelectionGroup,
  DesignSelections,
  Fabric,
  StyleCategory,
} from "./src/types";
import {
  ADDITIONAL_CLOTHES_COST_OPTION_ORDER,
  ADDITIONAL_CLOTHES_COST_SECTION_ORDER,
  DRESS_LINING_OPTION_ID,
  SEED_CUSTOM_DETAIL_CATALOG,
} from "./src/config/GarmentDetailsConfig";
import {
  calculateCustomDetailsPriceBreakdown,
  filterDesignSelectionsForCustomDetails,
  getCustomDetailSnapshots,
  groupApplicableCustomDetails,
  isAdditionalClothesCostSection,
  normalizeCustomDetailCatalog,
} from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import { calculateCartPricing } from "./src/utils/shippingPricing";

const optionSpecification = [
  ["shirt_additional_no_cost", "shirt_additional", 0],
  [DRESS_LINING_OPTION_ID, "dress_additional", 1000],
  ["dress_additional_net", "dress_additional", 1000],
  ["dress_additional_head_wrap", "dress_additional", 1000],
  ["dress_additional_shoulder_waist_wrap", "dress_additional", 1500],
  ["neck_additional_no_cost", "neck_additional", 0],
  ["trouser_additional_no_cost", "trouser_additional", 0],
  [
    "standard_shorts_additional_combat_pockets",
    "standard_shorts_additional",
    500,
  ],
  ["bum_shorts_additional_no_cost", "bum_shorts_additional", 0],
  ["skirt_additional_lining", "skirt_additional", 1000],
  ["skirt_additional_net", "skirt_additional", 1000],
  ["personalized_additional_evaluation", "personalized_additional", 0],
] as const;

for (const [optionId, section, priceCents] of optionSpecification) {
  const option = SEED_CUSTOM_DETAIL_CATALOG.find(
    (candidate) => candidate.id === optionId,
  );
  assert.ok(option, `${optionId} exists in the canonical catalog`);
  assert.equal(option.selectionGroup, section);
  assert.equal(option.priceCents, priceCents);
  assert.equal(option.required, false);
  assert.ok(
    ADDITIONAL_CLOTHES_COST_OPTION_ORDER[optionId] > 0,
    `${optionId} has deterministic business ordering`,
  );
}
assert.equal(
  new Set(optionSpecification.map(([optionId]) => optionId)).size,
  optionSpecification.length,
  "every Additional Clothes Costs option has a unique stable ID",
);
assert.equal(
  SEED_CUSTOM_DETAIL_CATALOG.find(
    (option) => option.id === "shirt_additional_no_cost",
  )?.informational,
  true,
);
const neckNoCostOption = SEED_CUSTOM_DETAIL_CATALOG.find(
  (option) => option.id === "neck_additional_no_cost",
);
assert.equal(neckNoCostOption?.informational, true);
assert.equal(neckNoCostOption?.allowMultiple, false);
assert.equal(
  SEED_CUSTOM_DETAIL_CATALOG.find(
    (option) => option.id === "personalized_additional_evaluation",
  )?.requiresEvaluation,
  true,
);
assert.ok(
  SEED_CUSTOM_DETAIL_CATALOG.filter(
    (option) => option.selectionGroup === "dress_additional",
  ).every((option) => option.allowMultiple),
  "all Dress additions can coexist",
);
assert.ok(
  SEED_CUSTOM_DETAIL_CATALOG.filter(
    (option) => option.selectionGroup === "skirt_additional",
  ).every((option) => option.allowMultiple),
  "both Skirt additions can coexist",
);

const makeStyle = (
  gender: StyleCategory["gender"],
  supportedGarmentGroups: NonNullable<
    StyleCategory["customDetailConfig"]
  >["supportedGarmentGroups"],
  representedGenders: Array<"male" | "female">,
): StyleCategory => ({
  id: `${gender}-additional-cost-style`,
  name: `${gender} Additional Cost Style`,
  description: "Additional Clothes Costs verification style.",
  gender,
  options: [],
  customDetailConfig: {
    representedGenders,
    featuresMaleAndFemale: representedGenders.length > 1,
    supportedGarmentGroups,
    requiredSelectionGroups: [],
    enabled: true,
  },
});

const maleStyle = makeStyle(
  "male",
  ["shirt", "neck", "trousers", "standard_shorts", "bum_shorts"],
  ["male"],
);
const femaleStyle = makeStyle(
  "female",
  ["shirt", "dress", "neck", "skirt"],
  ["female"],
);
const familyStyle = makeStyle(
  "family",
  ["shirt", "dress", "neck", "trousers"],
  ["male", "female"],
);

const getAdditionalGroups = (
  style: StyleCategory,
  garment?: CustomDetailGarmentContext | null,
): CustomDetailSelectionGroup[] =>
  groupApplicableCustomDetails(
    style,
    SEED_CUSTOM_DETAIL_CATALOG,
    garment,
  )
    .filter((group) => isAdditionalClothesCostSection(group.id))
    .map((group) => group.id);

assert.deepEqual(getAdditionalGroups(maleStyle, { code: "G1" }), [
  "shirt_additional",
  "neck_additional",
  "personalized_additional",
]);
assert.deepEqual(getAdditionalGroups(maleStyle, { code: "G5.2" }), [
  "shirt_additional",
  "neck_additional",
  "trouser_additional",
  "personalized_additional",
]);
assert.deepEqual(getAdditionalGroups(maleStyle, { code: "G5.1" }), [
  "shirt_additional",
  "neck_additional",
  "standard_shorts_additional",
  "personalized_additional",
]);
assert.deepEqual(
  getAdditionalGroups(maleStyle, { type: "Shirt + Bum Shorts" }),
  [
    "shirt_additional",
    "neck_additional",
    "bum_shorts_additional",
    "personalized_additional",
  ],
);
assert.deepEqual(getAdditionalGroups(femaleStyle, { code: "L1" }), [
  "dress_additional",
  "neck_additional",
  "personalized_additional",
]);
assert.deepEqual(
  groupApplicableCustomDetails(
    femaleStyle,
    SEED_CUSTOM_DETAIL_CATALOG,
    { code: "L1" },
  ).map((group) => group.id),
  [
    "dress_construction",
    "dress_pockets",
    "neck_design",
    "dress_additional",
    "neck_additional",
    "personalized_additional",
  ],
  "additional sections follow standard garment details in deterministic order",
);
assert.deepEqual(
  getAdditionalGroups(femaleStyle, { type: "Top + Skirt" }),
  [
    "shirt_additional",
    "neck_additional",
    "skirt_additional",
    "personalized_additional",
  ],
);
assert.deepEqual(
  getAdditionalGroups(femaleStyle, { composition: "Dress + Skirt" }),
  [
    "dress_additional",
    "neck_additional",
    "skirt_additional",
    "personalized_additional",
  ],
);
assert.deepEqual(getAdditionalGroups(familyStyle), [
  "shirt_additional",
  "dress_additional",
  "neck_additional",
  "trouser_additional",
  "personalized_additional",
]);
assert.ok(
  getAdditionalGroups(familyStyle).every((group) =>
    ADDITIONAL_CLOTHES_COST_SECTION_ORDER.includes(
      group as (typeof ADDITIONAL_CLOTHES_COST_SECTION_ORDER)[number],
    ),
  ),
);

const dressOptionIds = groupApplicableCustomDetails(
  femaleStyle,
  SEED_CUSTOM_DETAIL_CATALOG,
  { code: "L1" },
).find((group) => group.id === "dress_additional")?.options.map(
  (option) => option.id,
);
assert.deepEqual(dressOptionIds, [
  DRESS_LINING_OPTION_ID,
  "dress_additional_net",
  "dress_additional_head_wrap",
  "dress_additional_shoulder_waist_wrap",
]);

const priceSelections = (
  customDetails: NonNullable<DesignSelections["customDetails"]>,
) =>
  calculateCustomDetailsPriceBreakdown(
    { customDetails },
    SEED_CUSTOM_DETAIL_CATALOG,
  );

assert.equal(
  priceSelections({
    dress_additional: [
      DRESS_LINING_OPTION_ID,
      "dress_additional_net",
    ],
  }).constructionUpgradesPrice,
  20,
);
assert.equal(
  priceSelections({
    dress_additional: [
      DRESS_LINING_OPTION_ID,
      "dress_additional_net",
      "dress_additional_head_wrap",
    ],
  }).constructionUpgradesPrice,
  30,
);
const allDressAdditions: DesignSelections = {
  customDetails: {
    dress_additional: [
      DRESS_LINING_OPTION_ID,
      "dress_additional_net",
      "dress_additional_head_wrap",
      "dress_additional_shoulder_waist_wrap",
    ],
  },
};
assert.equal(
  calculateCustomDetailsPriceBreakdown(
    allDressAdditions,
    SEED_CUSTOM_DETAIL_CATALOG,
  ).constructionUpgradesPrice,
  45,
);
assert.deepEqual(
  getCustomDetailSnapshots(
    allDressAdditions,
    SEED_CUSTOM_DETAIL_CATALOG,
  ).map((snapshot) => snapshot.optionId),
  dressOptionIds,
);
assert.equal(
  priceSelections({
    neck_additional: ["neck_additional_no_cost"],
  }).constructionUpgradesPrice,
  0,
  "the Neck Additional placeholder creates no construction upgrade charge",
);
assert.equal(
  priceSelections({
    standard_shorts_additional: [
      "standard_shorts_additional_combat_pockets",
    ],
  }).constructionUpgradesPrice,
  5,
);
assert.equal(
  priceSelections({
    skirt_additional: [
      "skirt_additional_lining",
      "skirt_additional_net",
    ],
  }).constructionUpgradesPrice,
  20,
);
assert.equal(
  priceSelections({
    shirt_additional: "shirt_additional_no_cost",
    trouser_additional: "trouser_additional_no_cost",
    bum_shorts_additional: "bum_shorts_additional_no_cost",
    personalized_additional: ["personalized_additional_evaluation"],
  }).constructionUpgradesPrice,
  0,
);

const fabric = {
  code: "ADD-001",
  name: "Additional Cost Test Fabric",
  description: "Pricing test fabric.",
  color: "Green",
  colorHex: "#006b54",
  category: "HiTarget Ankara",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
} as Fabric;
const businessSettings = {
  pricingSettings: {
    depositPercentage: 50,
    balancePercentage: 50,
    currency: "EUR",
    vatTaxPercentage: 0,
    discountRulesEnabled: false,
    standardAccessoryCharge: 10,
  },
} as BusinessSettings;

const designWithoutNeckAdditional: DesignSelections = {};
const designWithNeckAdditional: DesignSelections = {
  customDetails: {
    neck_additional: ["neck_additional_no_cost"],
  },
};
const pricedWithoutNeckAdditional = calculateDesignPricing({
  route: "alone",
  design: designWithoutNeckAdditional,
  fabric,
  style: femaleStyle,
  garment: { code: "L1" },
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings,
});
const pricedWithNeckAdditional = calculateDesignPricing({
  route: "alone",
  design: designWithNeckAdditional,
  fabric,
  style: femaleStyle,
  garment: { code: "L1" },
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings,
});
assert.ok(pricedWithoutNeckAdditional);
assert.ok(pricedWithNeckAdditional);
assert.equal(pricedWithNeckAdditional.constructionUpgradesPrice, 0);
assert.equal(
  pricedWithNeckAdditional.constructionUpgradesPrice,
  pricedWithoutNeckAdditional.constructionUpgradesPrice,
);
assert.equal(
  pricedWithNeckAdditional.customDetailsPrice,
  pricedWithoutNeckAdditional.customDetailsPrice,
);
assert.equal(
  pricedWithNeckAdditional.garmentSubtotal,
  pricedWithoutNeckAdditional.garmentSubtotal,
  "adding or removing the Neck Additional placeholder leaves totals unchanged",
);

const makeNeckCheckoutItem = (
  id: string,
  design: DesignSelections,
  garmentTotal: number,
): CartItem =>
  ({
    id,
    batchType: "alone",
    design,
    deliverySelection: {
      method: "PICKUP",
      pickupLocation: "Veldhoven Campus Lockers",
    },
    garment: {
      type: "Neck additional pricing test",
      totalPrice: garmentTotal,
    },
  }) as CartItem;
const checkoutWithoutNeckAdditional = calculateCartPricing(
  [
    makeNeckCheckoutItem(
      "neck-without-placeholder",
      designWithoutNeckAdditional,
      pricedWithoutNeckAdditional.garmentSubtotal,
    ),
  ],
  0.5,
);
const checkoutWithNeckAdditional = calculateCartPricing(
  [
    makeNeckCheckoutItem(
      "neck-with-placeholder",
      designWithNeckAdditional,
      pricedWithNeckAdditional.garmentSubtotal,
    ),
  ],
  0.5,
);
assert.equal(
  checkoutWithNeckAdditional.garmentSubtotal,
  checkoutWithoutNeckAdditional.garmentSubtotal,
);
assert.equal(
  checkoutWithNeckAdditional.depositDueNow,
  checkoutWithoutNeckAdditional.depositDueNow,
  "the Neck Additional placeholder does not affect the deposit",
);
assert.equal(
  checkoutWithNeckAdditional.total,
  checkoutWithoutNeckAdditional.total,
  "the Neck Additional placeholder does not affect checkout totals",
);
assert.equal(
  checkoutWithNeckAdditional.remainingDue,
  checkoutWithoutNeckAdditional.remainingDue,
);

const pricedDress = calculateDesignPricing({
  route: "alone",
  design: allDressAdditions,
  fabric,
  style: femaleStyle,
  garment: { code: "L1" },
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings,
});
assert.ok(pricedDress);
assert.equal(pricedDress.constructionUpgradesPrice, 45);
assert.equal(pricedDress.customDetailsPrice, 45);

const pricedDressWithLegacyFlag = calculateDesignPricing({
  route: "alone",
  design: { ...allDressAdditions, hasLining: true },
  fabric,
  style: femaleStyle,
  garment: { code: "L1" },
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings,
});
assert.ok(pricedDressWithLegacyFlag);
assert.equal(
  pricedDressWithLegacyFlag.constructionUpgradesPrice,
  45,
  "the legacy lining flag cannot double-charge the catalog lining option",
);

const legacyLiningPricing = calculateDesignPricing({
  route: "alone",
  design: { hasLining: true },
  fabric,
  style: femaleStyle,
  garment: { code: "L1" },
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings,
});
assert.ok(legacyLiningPricing);
assert.equal(
  legacyLiningPricing.constructionUpgradesPrice,
  10,
  "legacy Dress Lining drafts retain their existing price",
);

const maleWithCombatAndPersonalization: DesignSelections = {
  customDetails: {
    standard_shorts_additional: [
      "standard_shorts_additional_combat_pockets",
    ],
    personalized_additional: ["personalized_additional_evaluation"],
  },
};
const changedToDress = filterDesignSelectionsForCustomDetails(
  femaleStyle,
  maleWithCombatAndPersonalization,
  SEED_CUSTOM_DETAIL_CATALOG,
  { code: "L1" },
);
assert.deepEqual(changedToDress.customDetails, {
  standard_shorts_additional: [
    "standard_shorts_additional_combat_pockets",
  ],
  personalized_additional: ["personalized_additional_evaluation"],
});
assert.equal(
  calculateCustomDetailsPriceBreakdown(
    changedToDress,
    SEED_CUSTOM_DETAIL_CATALOG,
  ).constructionUpgradesPrice,
  5,
  "a selectable Combat selection is included in pricing",
);

const femaleAdditionsChangedToMale = filterDesignSelectionsForCustomDetails(
  maleStyle,
  {
    customDetails: {
      dress_additional: [
        DRESS_LINING_OPTION_ID,
        "dress_additional_net",
      ],
      personalized_additional: ["personalized_additional_evaluation"],
    },
  },
  SEED_CUSTOM_DETAIL_CATALOG,
  { code: "G1" },
);
assert.deepEqual(femaleAdditionsChangedToMale.customDetails, {
  dress_additional: [
    DRESS_LINING_OPTION_ID,
    "dress_additional_net",
  ],
  personalized_additional: ["personalized_additional_evaluation"],
});
assert.equal(
  calculateCustomDetailsPriceBreakdown(
    femaleAdditionsChangedToMale,
    SEED_CUSTOM_DETAIL_CATALOG,
  ).constructionUpgradesPrice,
  20,
  "selectable Dress additions affect pricing normally",
);

const restoredDraft = filterDesignSelectionsForCustomDetails(
  femaleStyle,
  {
    customDetails: {
      dress_additional: [
        "dress_additional_net",
        DRESS_LINING_OPTION_ID,
      ],
      standard_shorts_additional: [
        "standard_shorts_additional_combat_pockets",
      ],
    },
  },
  SEED_CUSTOM_DETAIL_CATALOG,
  { code: "L1" },
);
assert.deepEqual(restoredDraft.customDetails, {
  dress_additional: [
    DRESS_LINING_OPTION_ID,
    "dress_additional_net",
  ],
  standard_shorts_additional: [
    "standard_shorts_additional_combat_pockets",
  ],
});
assert.equal(
  calculateCustomDetailsPriceBreakdown(
    restoredDraft,
    SEED_CUSTOM_DETAIL_CATALOG,
  ).constructionUpgradesPrice,
  25,
);
const restoredSnapshots = getCustomDetailSnapshots(
  restoredDraft,
  SEED_CUSTOM_DETAIL_CATALOG,
);
assert.deepEqual(
  restoredSnapshots.map((snapshot) => snapshot.optionId),
  [DRESS_LINING_OPTION_ID, "dress_additional_net", "standard_shorts_additional_combat_pockets"],
  "restored multi-select drafts retain deterministic snapshot ordering",
);

const normalizedWithAdminOverride = normalizeCustomDetailCatalog([
  {
    id: DRESS_LINING_OPTION_ID,
    label: "Administrator Lining Label",
    priceCents: 1250,
  },
]);
const overriddenLining = normalizedWithAdminOverride.find(
  (option) => option.id === DRESS_LINING_OPTION_ID,
);
assert.ok(overriddenLining);
assert.equal(overriddenLining.label, "Administrator Lining Label");
assert.equal(overriddenLining.priceCents, 1250);
assert.equal(
  normalizedWithAdminOverride.find(
    (option) => option.id === "dress_additional_net",
  )?.priceCents,
  1000,
  "missing canonical records continue to use their supplied defaults",
);

console.log("Additional Clothes Costs verification passed.");
