import assert from "node:assert/strict";
import type {
  CartItem,
  CustomDetailOption,
  Fabric,
  OrderContext,
  StyleCategory,
} from "./src/types";
import {
  getCustomDetailsBreakdown,
  isLiningEligibleForStyle,
} from "./src/utils/catalogHelpers";
import {
  calculateGarmentDetailsPrice,
  getIncludedDecorativeFeatures,
} from "./src/utils/decorativePricing";
import {
  getFabricPricingError,
  getFabricSewingCost,
  resolveFabricPrice,
} from "./src/utils/fabricPricing";
import {
  clampDepositPercentage,
  getDepositRatio,
  PRICING_CURRENCY,
  roundMoney,
} from "./src/utils/money";
import { resolvePersonalizedBatchShippingContext } from "./src/utils/personalizedBatchContext";
import { calculateCartPricing } from "./src/utils/shippingPricing";

const makeStyle = (
  overrides: Partial<StyleCategory> = {},
): StyleCategory => ({
  id: "style-test",
  name: "Plain Test Style",
  description: "A plain garment.",
  gender: "male",
  options: [],
  ...overrides,
});

const makeFabric = (overrides: Partial<Fabric> = {}): Fabric => ({
  code: "TEST-001",
  name: "Test Fabric",
  description: "Test fabric",
  color: "Green",
  colorHex: "#006b54",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  ...overrides,
});

assert.equal(PRICING_CURRENCY, "EUR");

const femaleDress = makeStyle({
  gender: "female",
  targetDemographic: "female",
  customDetailConfig: {
    representedGenders: ["female"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: ["dress"],
    requiredSelectionGroups: [],
    enabled: true,
  },
});
assert.equal(isLiningEligibleForStyle(femaleDress, "EXACT"), true);
assert.equal(isLiningEligibleForStyle(femaleDress, "L1"), true);
assert.equal(
  isLiningEligibleForStyle(
    makeStyle({
      customDetailConfig: {
        representedGenders: ["male"],
        featuresMaleAndFemale: false,
        supportedGarmentGroups: ["shirt"],
        requiredSelectionGroups: [],
        enabled: true,
      },
    }),
    "EXACT",
  ),
  false,
);

const marketingCopyOnly = makeStyle({
  name: "Embroidered Monogram Masterpiece",
  description: "Includes decorative embroidery and monogram styling.",
});
assert.deepEqual(getIncludedDecorativeFeatures(marketingCopyOnly), []);

const embroideryStyle = makeStyle({
  includedDesignFeatures: {
    hasMonogram: false,
    hasEmbroidery: true,
    hasMonogramTrimming: false,
  },
});
assert.deepEqual(getIncludedDecorativeFeatures(embroideryStyle), [
  "Embroidery",
]);
assert.equal(
  calculateGarmentDetailsPrice({}, embroideryStyle).monogramPrice,
  12,
);

const nestedFalseOverridesLegacyTrue = makeStyle({
  hasEmbroidery: true,
  includedDesignFeatures: {
    hasEmbroidery: false,
  },
});
assert.deepEqual(
  getIncludedDecorativeFeatures(nestedFalseOverridesLegacyTrue),
  [],
);

const trimmingStyle = makeStyle({
  includedDesignFeatures: {
    hasMonogramTrimming: true,
  },
});
assert.deepEqual(getIncludedDecorativeFeatures(trimmingStyle), [
  "Monogram Trimming",
]);
assert.equal(
  calculateGarmentDetailsPrice({}, trimmingStyle).monogramPrice,
  12,
);

const deduplicatedDetails = calculateGarmentDetailsPrice(
  {
    decorativeFeatures: ["Embroidery", "Name Monogram", "Embroidery"],
    accessories: [
      "Traditional Hat",
      "Traditional Hat",
      "Traditional Stick",
    ],
  },
  embroideryStyle,
);
assert.equal(deduplicatedDetails.monogramPrice, 24);
assert.equal(deduplicatedDetails.decorativeFeatures.length, 2);
assert.equal(deduplicatedDetails.accessories.length, 2);
assert.equal(deduplicatedDetails.total, 48);

const overrideStyle = makeStyle({
  includedDesignFeatures: { hasEmbroidery: true, hasMonogram: true },
  constructionDetails: [
    { type: "embroideryDesign", code: "Embroidery", price: 15 },
  ],
});
const overridePrice = calculateGarmentDetailsPrice({}, overrideStyle);
assert.equal(overridePrice.monogramPrice, 27);

const groupContext: OrderContext = {
  orderType: "Group Organizer",
  batchId: "PRIVATE-001",
  batchName: "Private Group",
  expectedParticipants: 12,
};
assert.deepEqual(
  resolvePersonalizedBatchShippingContext(groupContext, "").context,
  {
    batchId: "PRIVATE-001",
    batchName: "Private Group",
    plannedGarmentCapacity: 12,
  },
);
assert.equal(
  resolvePersonalizedBatchShippingContext(
    {
      orderType: "Community",
      batchId: "COMMUNITY-001",
      batchName: "Community Batch",
      expectedParticipants: 40,
    },
    "",
  ).context,
  null,
);
assert.equal(
  resolvePersonalizedBatchShippingContext(
    { orderType: "Group Member", batchId: "PRIVATE-002" },
    "",
  ).context,
  null,
);

const liveOption: CustomDetailOption = {
  id: "test-live-option",
  label: "Live Choice",
  description: "Current selection",
  garmentGroup: "shirt",
  selectionGroup: "shirt_construction",
  priceCents: 6500,
  eligibleDemographics: ["male"],
  displayOrder: 999,
  required: false,
  active: true,
  allowMultiple: false,
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
};
const liveBreakdown = getCustomDetailsBreakdown(
  {
    customDetails: { shirt_construction: liveOption.id },
    customDetailSnapshots: [
      {
        optionId: "stale-option",
        label: "Stale Choice",
        description: "Old selection",
        garmentGroup: "shirt",
        selectionGroup: "shirt_construction",
        priceCents: 100,
      },
    ],
  },
  [liveOption],
);
assert.equal(liveBreakdown.length, 1);
assert.equal(liveBreakdown[0].label, "Live Choice");
assert.equal(liveBreakdown[0].price, 65);
const seedFallbackBreakdown = getCustomDetailsBreakdown(
  {
    customDetails: {
      shirt_construction: "shirt_std_short",
    },
  },
  [],
);
assert.equal(seedFallbackBreakdown.length, 1);
assert.equal(seedFallbackBreakdown[0].price, 65);

const hiTarget = makeFabric({
  category: "HiTarget Ankara",
  name: "Imperial Sapphire",
});
assert.equal(resolveFabricPrice(hiTarget), 3.91);
assert.equal(getFabricSewingCost(hiTarget), 4.06);
assert.equal(
  resolveFabricPrice(
    makeFabric({ category: "Future Fabric", price: 7.555 }),
  ),
  7.56,
);
const unpricedFabric = makeFabric({ category: "Future Fabric" });
assert.equal(resolveFabricPrice(unpricedFabric), null);
assert.match(getFabricPricingError(unpricedFabric) || "", /not configured/i);

assert.equal(clampDepositPercentage(-5), 0);
assert.equal(clampDepositPercentage(125), 100);
assert.equal(getDepositRatio(55), 0.55);
assert.equal(roundMoney(10.005), 10.01);

const cartItem = {
  id: "cart-test",
  batchType: "alone",
  deliverySelection: {
    method: "PICKUP",
    pickupLocation: "Veldhoven Campus Lockers",
  },
  garment: {
    type: "Test",
    totalPrice: 10.005,
  },
} as CartItem;
const fullDeposit = calculateCartPricing([cartItem], 2);
assert.equal(fullDeposit.garmentSubtotal, 10.01);
assert.equal(fullDeposit.depositDueNow, 141.26);
assert.equal(fullDeposit.remainingDue, 0);
const zeroDeposit = calculateCartPricing([cartItem], -1);
assert.equal(zeroDeposit.depositDueNow, 131.25);
assert.equal(zeroDeposit.remainingDue, 10.01);

console.log("PASS: pricing fixes 1-7 regression suite");
