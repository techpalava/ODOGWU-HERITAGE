import assert from "node:assert/strict";
import type {
  BusinessSettings,
  CartItem,
  CustomDetailGarmentContext,
  DecorativeFeature,
  DesignSelections,
  Fabric,
  GuestDesignDraft,
  MonogramPlacement,
  StyleCategory,
} from "./src/types";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { filterDesignSelectionsForCustomDetails } from "./src/utils/catalogHelpers";
import {
  calculateGarmentDetailsPrice,
  DEFAULT_MONOGRAM_PLACEMENT,
  DECORATIVE_FEATURE_DESCRIPTIONS,
  DECORATIVE_FEATURE_OPTIONS,
  DECORATIVE_FEATURE_PRICE_CENTS,
  filterDesignSelectionsForDecorativeFeatures,
  getApplicableDecorativeFeatures,
  getAvailableMonogramPlacements,
  getDecorativeFeaturePrice,
  getMonogramPlacementLabel,
  hasHeavyEmbroideryMetadata,
  isMonogramCuffEligible,
  isNameMonogramApplicable,
} from "./src/utils/decorativePricing";
import {
  calculateAuthoritativeDesignPricing,
  calculateDesignPricing,
} from "./src/utils/designPricing";
import { calculateCartPricing } from "./src/utils/shippingPricing";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const makeStyle = (
  overrides: Partial<StyleCategory> = {},
): StyleCategory => ({
  id: "monogram-test-style",
  name: "Monogram Test Style",
  description: "A test garment.",
  gender: "female",
  targetDemographic: "female",
  options: [],
  customDetailConfig: {
    representedGenders: ["female"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: ["dress", "neck"],
    requiredSelectionGroups: [],
    enabled: true,
  },
  ...overrides,
});

const fabric: Fabric = {
  code: "MONO-001",
  name: "Monogram Test Fabric",
  description: "Test fabric",
  color: "Green",
  colorHex: "#006b54",
  priceMultiplier: 1,
  category: "HiTarget Ankara",
  stockStatus: "IN_STOCK",
};

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

const expectedDescriptions: Readonly<Record<DecorativeFeature, string>> = {
  "Name Monogram":
    "Add your name to an eligible upper-body garment. Left Chest is the recommended placement.",
  Embroidery:
    "Additional decorative patterns on your clothing, depending on the selected design.",
  "Monogram Trimming":
    "Additional decorative trimming or patterned finishing, depending on the selected design.",
};

assert.deepEqual(DECORATIVE_FEATURE_OPTIONS, [
  "Name Monogram",
  "Embroidery",
  "Monogram Trimming",
]);

for (const feature of DECORATIVE_FEATURE_OPTIONS) {
  assert.equal(DECORATIVE_FEATURE_PRICE_CENTS[feature], 1200);
  assert.equal(DECORATIVE_FEATURE_DESCRIPTIONS[feature], expectedDescriptions[feature]);
  assert.equal(getDecorativeFeaturePrice(null, feature), 12);
  assert.equal(
    calculateGarmentDetailsPrice(
      { decorativeFeatures: [feature] },
      makeStyle(),
    ).monogramPrice,
    12,
  );
}

assert.equal(calculateGarmentDetailsPrice({}).monogramPrice, 0);

const featurePairs: DecorativeFeature[][] = [
  ["Name Monogram", "Embroidery"],
  ["Name Monogram", "Monogram Trimming"],
  ["Embroidery", "Monogram Trimming"],
];
for (const pair of featurePairs) {
  assert.equal(
    calculateGarmentDetailsPrice(
      { decorativeFeatures: pair },
      makeStyle(),
    ).monogramPrice,
    24,
  );
}

const allFeatures = [...DECORATIVE_FEATURE_OPTIONS];
const allFeaturePricing = calculateGarmentDetailsPrice(
  { decorativeFeatures: allFeatures },
  makeStyle(),
);
assert.equal(allFeaturePricing.monogramPrice, 36);
assert.equal(allFeaturePricing.decorativeFeatures.length, 3);

const deduplicatedPricing = calculateGarmentDetailsPrice(
  {
    decorativeFeatures: [
      "Name Monogram",
      "Embroidery",
      "Name Monogram",
    ],
    embroideryDesign: "Embroidery",
  },
  makeStyle(),
);
assert.equal(deduplicatedPricing.monogramPrice, 24);
assert.deepEqual(
  deduplicatedPricing.decorativeFeatures.map((feature) => feature.label),
  ["Name Monogram", "Embroidery"],
);

const includedStyle = makeStyle({
  includedDesignFeatures: { hasEmbroidery: true },
});
assert.equal(
  calculateGarmentDetailsPrice(
    { decorativeFeatures: ["Embroidery"] },
    includedStyle,
  ).monogramPrice,
  12,
);

const overrideStyle = makeStyle({
  constructionDetails: [
    { type: "embroideryDesign", code: "Name Monogram", price: 14.5 },
  ],
});
assert.equal(getDecorativeFeaturePrice(overrideStyle, "Name Monogram"), 14.5);
assert.equal(
  calculateGarmentDetailsPrice(
    { decorativeFeatures: ["Name Monogram", "Embroidery"] },
    overrideStyle,
  ).monogramPrice,
  26.5,
);

const makeGarmentAwareStyle = (
  supportedGarmentGroups: NonNullable<
    StyleCategory["customDetailConfig"]
  >["supportedGarmentGroups"],
  overrides: Partial<StyleCategory> = {},
): StyleCategory =>
  makeStyle({
    customDetailConfig: {
      representedGenders: ["male", "female"],
      featuresMaleAndFemale: true,
      supportedGarmentGroups,
      requiredSelectionGroups: [],
      enabled: true,
    },
    ...overrides,
  });

const shirtStyle = makeGarmentAwareStyle(["shirt", "neck"]);
const dressStyle = makeGarmentAwareStyle(["dress", "neck"]);
const topAndSkirtStyle = makeGarmentAwareStyle([
  "shirt",
  "neck",
  "skirt",
]);
const trouserStyle = makeGarmentAwareStyle(["trousers"]);
const standardShortsStyle = makeGarmentAwareStyle(["standard_shorts"]);
const bumShortsStyle = makeGarmentAwareStyle(["bum_shorts"]);
const skirtStyle = makeGarmentAwareStyle(["skirt"]);
const neckOnlyStyle = makeGarmentAwareStyle(["neck"]);

const garmentApplicabilityCases: Array<{
  label: string;
  style: StyleCategory;
  garment: CustomDetailGarmentContext;
  expected: boolean;
}> = [
    {
      label: "shirt only",
      style: shirtStyle,
      garment: { code: "G1", type: "Shirt Only" },
      expected: true,
    },
    {
      label: "shirt and trouser",
      style: makeGarmentAwareStyle(["shirt", "neck", "trousers"]),
      garment: { code: "G5.2", type: "Shirt + Trouser" },
      expected: true,
    },
    {
      label: "dress",
      style: dressStyle,
      garment: { code: "L1", type: "Dress" },
      expected: true,
    },
    {
      label: "top and skirt",
      style: topAndSkirtStyle,
      garment: { code: "EXACT", type: "Use Exact Design Style" },
      expected: true,
    },
    {
      label: "kaftan from explicit shirt metadata",
      style: makeGarmentAwareStyle(["shirt", "neck"], {
        garmentComposition: "Kaftan Only",
      }),
      garment: { code: "EXACT", type: "Use Exact Design Style" },
      expected: true,
    },
    {
      label: "gown from explicit dress metadata",
      style: makeGarmentAwareStyle(["dress", "neck"], {
        garmentComposition: "Gown Only",
      }),
      garment: { code: "EXACT", type: "Use Exact Design Style" },
      expected: true,
    },
    {
      label: "trouser only",
      style: trouserStyle,
      garment: { code: "G4", type: "Trouser Only" },
      expected: false,
    },
    {
      label: "standard shorts only",
      style: standardShortsStyle,
      garment: { code: "G3", type: "Standard Shorts Only" },
      expected: false,
    },
    {
      label: "bum shorts only",
      style: bumShortsStyle,
      garment: { type: "Bum Shorts Only" },
      expected: false,
    },
    {
      label: "skirt only",
      style: skirtStyle,
      garment: { code: "EXACT", type: "Use Exact Design Style" },
      expected: false,
    },
    {
      label: "neck only",
      style: neckOnlyStyle,
      garment: { code: "EXACT", type: "Use Exact Design Style" },
      expected: false,
    },
  ];

for (const applicabilityCase of garmentApplicabilityCases) {
  assert.equal(
    isNameMonogramApplicable(
      applicabilityCase.style,
      applicabilityCase.garment,
    ),
    applicabilityCase.expected,
    applicabilityCase.label,
  );
  assert.equal(
    getApplicableDecorativeFeatures(
      applicabilityCase.style,
      applicabilityCase.garment,
    ).includes("Name Monogram"),
    applicabilityCase.expected,
    `${applicabilityCase.label} visible option`,
  );
}

const genderOnlyStyle = makeStyle({
  name: "Generic Style",
  description: "No garment composition has been configured.",
  gender: "female",
  targetDemographic: "female",
  customDetailConfig: undefined,
  garmentComposition: undefined,
  garmentCompositionList: undefined,
  outfitType: undefined,
});
assert.equal(isNameMonogramApplicable(genderOnlyStyle), false);

const sleevedShirtSelection: DesignSelections = {
  customDetails: { shirt_construction: "shirt_std_midlong" },
  decorativeFeatures: ["Name Monogram"],
};
const normalizedShirtSelection =
  filterDesignSelectionsForDecorativeFeatures(
    sleevedShirtSelection,
    shirtStyle,
    { code: "G1", type: "Shirt Only" },
  );
assert.equal(
  normalizedShirtSelection.monogramPlacement,
  DEFAULT_MONOGRAM_PLACEMENT,
);
assert.equal(
  getMonogramPlacementLabel(normalizedShirtSelection.monogramPlacement),
  "Left Chest",
);
assert.equal(
  isMonogramCuffEligible(
    normalizedShirtSelection,
    shirtStyle,
    { code: "G1" },
  ),
  true,
);

const allPlacementValues: MonogramPlacement[] = [
  "left_chest",
  "right_chest",
  "cuff",
  "neckline",
  "upper_back",
  "hem",
];
assert.deepEqual(
  getAvailableMonogramPlacements(
    normalizedShirtSelection,
    shirtStyle,
    { code: "G1" },
  ).map((option) => option.value),
  allPlacementValues,
);
for (const placement of allPlacementValues) {
  assert.equal(
    filterDesignSelectionsForDecorativeFeatures(
      { ...normalizedShirtSelection, monogramPlacement: placement },
      shirtStyle,
      { code: "G1" },
    ).monogramPlacement,
    placement,
  );
}

const sleevelessDressSelection = {
  customDetails: { dress_construction: "dress_std_sleeveless" },
  decorativeFeatures: ["Name Monogram"] as DecorativeFeature[],
  monogramPlacement: "cuff" as MonogramPlacement,
};
const normalizedSleevelessDress =
  filterDesignSelectionsForDecorativeFeatures(
    sleevelessDressSelection,
    dressStyle,
    { code: "L1", type: "Sleeveless Dress" },
  );
assert.equal(
  isMonogramCuffEligible(
    normalizedSleevelessDress,
    dressStyle,
    { code: "L1" },
  ),
  false,
);
assert.equal(
  getAvailableMonogramPlacements(
    normalizedSleevelessDress,
    dressStyle,
    { code: "L1" },
  ).some((option) => option.value === "cuff"),
  false,
);
assert.equal(
  normalizedSleevelessDress.monogramPlacement,
  DEFAULT_MONOGRAM_PLACEMENT,
);

const heavyEmbroideryStyle = makeStyle({ embroideryProminence: "heavy" });
assert.equal(hasHeavyEmbroideryMetadata(heavyEmbroideryStyle), true);
assert.equal(hasHeavyEmbroideryMetadata(makeStyle()), false);

const baseDesign = {
  customDetails: {
    dress_construction: "dress_std_short",
    dress_pockets: "dress_pocket_0",
    neck_design: "neck_no_round",
    dress_additional: ["dress_additional_net"],
  },
  accessories: ["Traditional Hat"],
};
const baselinePricing = calculateDesignPricing({
  route: "alone",
  design: baseDesign,
  fabric,
  style: makeStyle(),
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings,
});
const decoratedPricing = calculateDesignPricing({
  route: "alone",
  design: { ...baseDesign, decorativeFeatures: allFeatures },
  fabric,
  style: makeStyle(),
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings,
});
assert.ok(baselinePricing);
assert.ok(decoratedPricing);
assert.equal(baselinePricing.monogramPrice, 0);
assert.equal(decoratedPricing.monogramPrice, 36);
assert.equal(baselinePricing.constructionUpgradesPrice, 10);
assert.equal(baselinePricing.traditionalAccessoriesPrice, 12);
assert.equal(
  decoratedPricing.constructionUpgradesPrice,
  baselinePricing.constructionUpgradesPrice,
);
assert.equal(
  decoratedPricing.traditionalAccessoriesPrice,
  baselinePricing.traditionalAccessoriesPrice,
);
assert.equal(
  decoratedPricing.garmentSubtotal - baselinePricing.garmentSubtotal,
  36,
);

const nameMonogramLeftChestPricing = calculateDesignPricing({
  route: "alone",
  design: {
    ...baseDesign,
    decorativeFeatures: ["Name Monogram"],
    monogramPlacement: "left_chest",
  },
  fabric,
  style: makeStyle(),
  garment: { code: "L1", type: "Dress" },
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings,
});
const nameMonogramUpperBackPricing = calculateDesignPricing({
  route: "alone",
  design: {
    ...baseDesign,
    decorativeFeatures: ["Name Monogram"],
    monogramPlacement: "upper_back",
  },
  fabric,
  style: makeStyle(),
  garment: { code: "L1", type: "Dress" },
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings,
});
assert.ok(nameMonogramLeftChestPricing);
assert.ok(nameMonogramUpperBackPricing);
assert.equal(nameMonogramLeftChestPricing.monogramPrice, 12);
assert.equal(nameMonogramUpperBackPricing.monogramPrice, 12);
assert.equal(
  nameMonogramLeftChestPricing.garmentSubtotal,
  nameMonogramUpperBackPricing.garmentSubtotal,
);
assert.equal(
  nameMonogramLeftChestPricing.constructionUpgradesPrice,
  baselinePricing.constructionUpgradesPrice,
);
assert.equal(
  nameMonogramLeftChestPricing.traditionalAccessoriesPrice,
  baselinePricing.traditionalAccessoriesPrice,
);
assert.equal(
  nameMonogramLeftChestPricing.garmentSubtotal -
  baselinePricing.garmentSubtotal,
  12,
);

const staleIneligibleMonogram: DesignSelections = {
  decorativeFeatures: ["Name Monogram"],
  monogramPlacement: "cuff",
};
const cleanedIneligibleMonogram =
  filterDesignSelectionsForDecorativeFeatures(
    staleIneligibleMonogram,
    trouserStyle,
    { code: "G4", type: "Trouser Only" },
  );
assert.deepEqual(cleanedIneligibleMonogram.decorativeFeatures, []);
assert.equal(cleanedIneligibleMonogram.monogramPlacement, undefined);
const ineligibleMonogramPricing = calculateDesignPricing({
  route: "alone",
  design: staleIneligibleMonogram,
  fabric,
  style: trouserStyle,
  garment: { code: "G4", type: "Trouser Only" },
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings,
});
assert.ok(ineligibleMonogramPricing);
assert.equal(ineligibleMonogramPricing.monogramPrice, 0);

const includedButIneligibleStyle = makeGarmentAwareStyle(["trousers"], {
  includedDesignFeatures: { hasMonogram: true },
});
assert.equal(
  calculateGarmentDetailsPrice(
    {},
    includedButIneligibleStyle,
    SEED_CUSTOM_DETAIL_CATALOG,
    { code: "G4", type: "Trouser Only" },
  ).monogramPrice,
  0,
);

const staleShirtSelection = {
  ...baseDesign,
  customDetails: {
    ...baseDesign.customDetails,
    standard_shorts_additional:
      "standard_shorts_additional_combat_pockets",
  },
  decorativeFeatures: allFeatures,
};
const filteredSelections = filterDesignSelectionsForCustomDetails(
  makeStyle(),
  staleShirtSelection,
  SEED_CUSTOM_DETAIL_CATALOG,
  { code: "L1" },
);
assert.equal(
  "standard_shorts_additional" in
  (filteredSelections.customDetails || {}),
  false,
);
assert.deepEqual(filteredSelections.decorativeFeatures, allFeatures);
const stalePricing = calculateDesignPricing({
  route: "alone",
  design: staleShirtSelection,
  fabric,
  style: makeStyle(),
  garment: { code: "L1" },
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings,
});
assert.ok(stalePricing);
assert.equal(stalePricing.constructionUpgradesPrice, baselinePricing.constructionUpgradesPrice);
assert.equal(stalePricing.monogramPrice, 36);

const makeCartItem = (
  id: string,
  pricing: NonNullable<ReturnType<typeof calculateDesignPricing>>,
  decorativeFeatures: DecorativeFeature[],
  monogramPlacement?: MonogramPlacement,
): CartItem => ({
  id,
  customer: { name: "Test Customer", email: "", phone: "" },
  style: makeStyle(),
  fabric,
  design: { ...baseDesign, decorativeFeatures, monogramPlacement },
  garment: {
    type: "Test Dress",
    totalPrice: pricing.garmentSubtotal,
    constructionUpgradesPrice: pricing.constructionUpgradesPrice,
    monogramPrice: pricing.monogramPrice,
    traditionalAccessoriesPrice: pricing.traditionalAccessoriesPrice,
  },
  measurements: {
    height: 170,
    weight: 65,
    age: 30,
    bodyBuild: "Average",
    fitPreference: "Standard",
    neck: 14,
    shoulder: 16,
    chest: 36,
    waist: 30,
    hip: 40,
    sleeve: 23,
    trouserLength: 39,
    isAiEstimated: false,
  },
  specialInstructions: "",
  notesAboutLeftoverFabric: "",
  batchType: "alone",
  deliverySelection: {
    method: "PICKUP",
    pickupLocation: "Veldhoven Campus Lockers",
  },
});

const baselineCartPricing = calculateCartPricing(
  [makeCartItem("base", baselinePricing, [])],
  0.5,
);
const decoratedCartPricing = calculateCartPricing(
  [makeCartItem("decorated", decoratedPricing, allFeatures)],
  0.5,
);
const toCents = (value: number): number => Math.round(value * 100);
assert.equal(
  toCents(decoratedCartPricing.total || 0) -
  toCents(baselineCartPricing.total || 0),
  3600,
);
assert.equal(
  toCents(decoratedCartPricing.depositDueNow || 0) -
  toCents(baselineCartPricing.depositDueNow || 0),
  1800,
);
assert.equal(
  toCents(decoratedCartPricing.remainingDue) -
  toCents(baselineCartPricing.remainingDue),
  1800,
);

const leftChestCartPricing = calculateCartPricing(
  [
    makeCartItem(
      "left-chest",
      nameMonogramLeftChestPricing,
      ["Name Monogram"],
      "left_chest",
    ),
  ],
  0.5,
);
const upperBackCartPricing = calculateCartPricing(
  [
    makeCartItem(
      "upper-back",
      nameMonogramUpperBackPricing,
      ["Name Monogram"],
      "upper_back",
    ),
  ],
  0.5,
);
assert.equal(leftChestCartPricing.total, upperBackCartPricing.total);
assert.equal(
  leftChestCartPricing.depositDueNow,
  upperBackCartPricing.depositDueNow,
);
assert.equal(leftChestCartPricing.remainingDue, upperBackCartPricing.remainingDue);

const staleCheckoutItem: CartItem = {
  ...makeCartItem(
    "stale-checkout",
    nameMonogramLeftChestPricing,
    ["Name Monogram"],
    "left_chest",
  ),
  style: trouserStyle,
  design: staleIneligibleMonogram,
  garment: {
    type: "Trouser Only [Code: G4]",
    totalPrice: nameMonogramLeftChestPricing.garmentSubtotal,
  },
};
const authoritativeStaleCheckoutPricing =
  calculateAuthoritativeDesignPricing(
    staleCheckoutItem,
    fabric,
    trouserStyle,
    SEED_CUSTOM_DETAIL_CATALOG,
    businessSettings,
  );
assert.ok(authoritativeStaleCheckoutPricing);
assert.equal(authoritativeStaleCheckoutPricing.monogramPrice, 0);

const memoryStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: memoryStorage,
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: memoryStorage },
});
const { GuestOrderSessionService } = await import(
  "./src/services/guestOrderSessionService"
);
const draft: GuestDesignDraft = {
  currentStep: 3,
  selectedFabricCode: fabric.code,
  selectedStyleId: "monogram-test-style",
  selectedGarment: {
    type: "Dress",
    fee: 0,
    code: "L1",
  },
  designSelections: {
    ...baseDesign,
    decorativeFeatures: allFeatures,
    monogramPlacement: "upper_back",
  },
  measurements: makeCartItem("draft", decoratedPricing, allFeatures).measurements,
  sizingMode: "manual",
  deliveryMethod: "PICKUP",
  deliveryAddress: {
    addressLine1: "",
    city: "",
    postalCode: "",
    countryCode: "",
  },
  pickupTime: "",
  customerName: "Test Customer",
  customerEmail: "",
  customerPhone: "",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "",
  leftoverFabricChoice: "",
  hasLining: false,
  pricingBreakdown: {
    fabricPrice: decoratedPricing.fabricPrice,
    fabricSewingCost: decoratedPricing.fabricSewingCost,
    constructionSewingCost: decoratedPricing.constructionSewingCost,
    customDetailsPrice: decoratedPricing.customDetailsPrice,
    lagosToEindhovenShipping: 131.25,
    eindhovenToDestinationShipping: 0,
    total: decoratedCartPricing.total || 0,
  },
  shippingSnapshot: {},
  updatedAt: "2026-08-02T00:00:00.000Z",
};
GuestOrderSessionService.saveGuestDesignDraft(draft);
const restoredDraft = GuestOrderSessionService.getGuestDesignDraft();
assert.deepEqual(
  restoredDraft?.designSelections.decorativeFeatures,
  allFeatures,
);
assert.equal(
  restoredDraft?.designSelections.monogramPlacement,
  "upper_back",
);
const validRestoredSelections = filterDesignSelectionsForDecorativeFeatures(
  restoredDraft?.designSelections || {},
  makeStyle(),
  draft.selectedGarment,
);
assert.equal(validRestoredSelections.monogramPlacement, "upper_back");

const stalePlacementDraft: GuestDesignDraft = {
  ...draft,
  designSelections: {
    ...draft.designSelections,
    customDetails: {
      ...draft.designSelections.customDetails,
      dress_construction: "dress_std_sleeveless",
    },
    monogramPlacement: "cuff",
  },
};
GuestOrderSessionService.saveGuestDesignDraft(stalePlacementDraft);
const restoredStalePlacementDraft =
  GuestOrderSessionService.getGuestDesignDraft();
const revalidatedStalePlacement =
  filterDesignSelectionsForDecorativeFeatures(
    restoredStalePlacementDraft?.designSelections || {},
    makeStyle(),
    stalePlacementDraft.selectedGarment,
  );
assert.equal(
  revalidatedStalePlacement.monogramPlacement,
  DEFAULT_MONOGRAM_PLACEMENT,
);

// Test case: included/required Name Monogram with valid placement exposes placement for cart presentation
const styleWithIncludedMonogram = makeStyle({
  includedDesignFeatures: { hasMonogram: true },
});
const selectionsWithoutExplicitMonogram: DesignSelections = {
  decorativeFeatures: [], // customer did not explicitly select it
  monogramPlacement: "upper_back",
};
const resolvedSelections = filterDesignSelectionsForDecorativeFeatures(
  selectionsWithoutExplicitMonogram,
  styleWithIncludedMonogram,
  { type: "Dress" }, // eligible garment
);
// Exposes the placement correctly
assert.equal(resolvedSelections.monogramPlacement, "upper_back");

// Cuff eligibility tests
const checkCuffAvailability = (
  constructionId: string,
  group: "shirt" | "dress",
): boolean => {
  const selections: DesignSelections = {
    customDetails: {
      [group === "shirt" ? "shirt_construction" : "dress_construction"]: constructionId,
    },
    decorativeFeatures: ["Name Monogram"],
  };
  const targetStyle = makeGarmentAwareStyle([group]);
  const context = { type: group === "shirt" ? "Shirt" : "Dress" };
  return isMonogramCuffEligible(selections, targetStyle, context);
};

// 1. shirt_std_midlong -> Cuff available
assert.equal(checkCuffAvailability("shirt_std_midlong", "shirt"), true);
// 2. shirt_long_midlong -> Cuff available
assert.equal(checkCuffAvailability("shirt_long_midlong", "shirt"), true);
// 3. dress_std_midlong -> Cuff available
assert.equal(checkCuffAvailability("dress_std_midlong", "dress"), true);
// 4. dress_long_midlong -> Cuff available
assert.equal(checkCuffAvailability("dress_long_midlong", "dress"), true);

// 5. shirt_std_short -> Cuff unavailable
assert.equal(checkCuffAvailability("shirt_std_short", "shirt"), false);
// 6. shirt_long_short -> Cuff unavailable
assert.equal(checkCuffAvailability("shirt_long_short", "shirt"), false);
// 7. dress_std_short -> Cuff unavailable
assert.equal(checkCuffAvailability("dress_std_short", "dress"), false);
// 8. dress_long_short -> Cuff unavailable
assert.equal(checkCuffAvailability("dress_long_short", "dress"), false);

// 9. dress_std_sleeveless -> Cuff unavailable
assert.equal(checkCuffAvailability("dress_std_sleeveless", "dress"), false);
// 10. dress_long_sleeveless -> Cuff unavailable
assert.equal(checkCuffAvailability("dress_long_sleeveless", "dress"), false);

// 11. stale Cuff on an ineligible construction falls back to Left Chest
const staleCuffSelections: DesignSelections = {
  customDetails: {
    dress_construction: "dress_std_short", // ineligible
  },
  decorativeFeatures: ["Name Monogram"],
  monogramPlacement: "cuff",
};
const cleanedStaleCuff = filterDesignSelectionsForDecorativeFeatures(
  staleCuffSelections,
  makeGarmentAwareStyle(["dress"]),
  { type: "Dress" },
);
assert.equal(cleanedStaleCuff.monogramPlacement, "left_chest");

console.log("PASS: monogram and embroidery pricing regression suite");