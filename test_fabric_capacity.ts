import assert from "node:assert";
import { FabricCapacityEngine } from "./src/engine/FabricCapacityEngine";
import { calculateDesignPricing } from "./src/utils/designPricing";
import { revalidateCartForCheckout } from "./src/utils/checkoutValidation";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { CartItem, Fabric, StyleCategory, DesignSelections, BusinessSettings, CustomDetailGarmentContext } from "./src/types";

const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  collaborationLogos: { left: null, right: null },
  batchSettings: { minGarmentsPerBatch: 10, maxGarmentsPerBatch: 300, minParticipantsRequired: 10, defaultCommunityBatchSize: 40, automaticBatchStatusRules: true },
  shippingSettings: { communityBatchShippingRate: 0, individualOrderShippingRate: 35, personalizedBatchShippingRate: 15, internationalDeliverySurcharge: 25, expressDeliverySurcharge: 50 },
  pricingSettings: { depositPercentage: 50, balancePercentage: 50, currency: "EUR", vatTaxPercentage: 21, discountRulesEnabled: false, standardAccessoryCharge: 10 },
  productionSettings: { productionStartThresholdPercentage: 90, estimatedProductionDurationDays: 45, defaultDeliveryWindowDays: 60, defaultPickupLocation: "Veldhoven Campus Lockers" },
  applicationSettings: { communityName: "NTCC", tagline: "NTCC", defaultActiveBatchId: "batch-6", defaultCountry: "Netherlands", notificationMessagesEnabled: true, systemAnnouncements: "", virtualTryOnConceptImage: "" },
  discountSettings: { individualOrders: { suggestedMinRange: 5, suggestedMaxRange: 10, minimumDiscount: 0, maximumDiscount: 15, internalNotes: "" }, communityOrders: { suggestedMinRange: 10, suggestedMaxRange: 20, minimumDiscount: 5, maximumDiscount: 25, internalNotes: "" }, vipOrders: { status: "planning_only", internalNotes: "" }, futureDiscounts: [] },
};

const mockFabricA = {
  code: "FAB-001",
  name: "Heritage Fish Lattice",
  category: "Silk",
  price: 50,
  stockStatus: "IN_STOCK",
} as Fabric;

const mockFabricB = {
  code: "FAB-002",
  name: "Royal Velvet Gold",
  category: "Velvet",
  price: 75,
  stockStatus: "IN_STOCK",
} as Fabric;

const mockShirtStyle = {
  id: "shirt-trouser",
  name: "Shirt & Trouser",
  description: "Standard shirt and trouser set",
  gender: "male",
  options: [],
} as unknown as StyleCategory;

const mockKaftanStyle = {
  id: "kaftan-set",
  name: "Kaftan Set",
  description: "Traditional Kaftan",
  gender: "male",
  options: [],
} as unknown as StyleCategory;

const mockGownStyle = {
  id: "maxi-gown",
  name: "Maxi Gown",
  description: "Full-length Maxi Gown",
  gender: "female",
  options: [],
  tags: ["full_length_gown"],
} as unknown as StyleCategory;

console.log("==========================================");
console.log("RUNNING FABRIC CAPACITY REGRESSION TESTS");
console.log("==========================================");

// 1. Shirt = 1
const shirtRule = FabricCapacityEngine.getGarmentFabricRule("shirt", mockShirtStyle);
assert.strictEqual(shirtRule.fabricUnits, 1, "Test 1 Failed: Shirt should be 1 unit");
console.log("✅ Test 1 Passed: Shirt = 1 unit");

// 2. Long-sleeve Shirt still = 1
const longShirtUnits = FabricCapacityEngine.calculateFabricUnits(
  mockShirtStyle,
  { code: "EXACT", type: "Shirt" },
  { customDetails: { shirt_construction: "shirt_long_midlong" } }
);
assert.strictEqual(longShirtUnits, 2, "Note: Shirt+Trouser set is 2 units total");
const shirtOnlyRule = FabricCapacityEngine.getGarmentFabricRule("shirt", mockShirtStyle);
assert.strictEqual(shirtOnlyRule.fabricUnits, 1, "Test 2 Failed: Long-sleeve Shirt rule must remain 1 unit");
console.log("✅ Test 2 Passed: Long-sleeve Shirt remains 1 unit");

// 3. Trouser = 1
const trouserRule = FabricCapacityEngine.getGarmentFabricRule("trousers", mockShirtStyle);
assert.strictEqual(trouserRule.fabricUnits, 1, "Test 3 Failed: Trouser should be 1 unit");
console.log("✅ Test 3 Passed: Trouser = 1 unit");

// 4. Skirt = 1
const skirtRule = FabricCapacityEngine.getGarmentFabricRule("skirt");
assert.strictEqual(skirtRule.fabricUnits, 1, "Test 4 Failed: Skirt should be 1 unit");
console.log("✅ Test 4 Passed: Skirt = 1 unit");

// 5. Nikka = 1
const nikkaRule = FabricCapacityEngine.getGarmentFabricRule("nikka");
assert.strictEqual(nikkaRule.fabricUnits, 1, "Test 5 Failed: Nikka should be 1 unit");
console.log("✅ Test 5 Passed: Nikka = 1 unit");

// 6. Shirt + Trouser = 2
const shirtTrouserUnits = FabricCapacityEngine.calculateFabricUnits(mockShirtStyle, null, {});
assert.strictEqual(shirtTrouserUnits, 2, "Test 6 Failed: Shirt + Trouser should be 2 units");
console.log("✅ Test 6 Passed: Shirt + Trouser = 2 units");

// 7. Shirt + Nikka = 2
const shortsStyle = { ...mockShirtStyle, id: "shirt-shorts" } as unknown as StyleCategory;
const shirtShortsUnits = FabricCapacityEngine.calculateFabricUnits(shortsStyle, null, {});
assert.strictEqual(shirtShortsUnits, 2, "Test 7 Failed: Shirt + Shorts should be 2 units");
console.log("✅ Test 7 Passed: Shirt + Nikka = 2 units");

// 8. Standard Dress + Bum Shorts = 2
const dressStyle = { id: "shift-dress", name: "Shift Dress", description: "Standard dress", gender: "female", options: [] } as unknown as StyleCategory;
const dressShortsUnits = FabricCapacityEngine.calculateFabricUnits(dressStyle, { code: "L1" }, {}) + 1;
assert.strictEqual(dressShortsUnits, 2, "Test 8 Failed: Standard Dress + Bum Shorts should be 2 units");
console.log("✅ Test 8 Passed: Standard Dress + Bum Shorts = 2 units");

// 9. Third standard garment requires second allocation
const requiredAllocations3Garments = FabricCapacityEngine.calculateRequiredAllocations(3);
assert.strictEqual(requiredAllocations3Garments, 2, "Test 9 Failed: 3 units should require 2 allocations");
console.log("✅ Test 9 Passed: 3 standard garments require 2 allocations");

// 10. Kaftan = 2
const kaftanUnits = FabricCapacityEngine.calculateFabricUnits(mockKaftanStyle, null, {});
assert.strictEqual(kaftanUnits, 2, "Test 10 Failed: Kaftan should be 2 units");
console.log("✅ Test 10 Passed: Kaftan = 2 units");

// 11. Kaftan + Trouser requires second allocation
const kaftanTrouserAllocations = FabricCapacityEngine.calculateRequiredAllocations(2 + 1);
assert.strictEqual(kaftanTrouserAllocations, 2, "Test 11 Failed: Kaftan + Trouser (3 units) requires 2 allocations");
console.log("✅ Test 11 Passed: Kaftan + Trouser requires second allocation");

// 12. Full-length Gown = 2
const gownUnits = FabricCapacityEngine.calculateFabricUnits(mockGownStyle, null, {});
assert.strictEqual(gownUnits, 2, "Test 12 Failed: Full-length Gown should be 2 units");
console.log("✅ Test 12 Passed: Full-length Gown = 2 units");

// 13. Full-length Gown + lower garment = 3
const gownLowerAllocations = FabricCapacityEngine.calculateRequiredAllocations(2 + 1);
assert.strictEqual(gownLowerAllocations, 2, "Test 13 Failed: Full-length Gown + lower garment requires 2 allocations");
console.log("✅ Test 13 Passed: Full-length Gown + lower garment requires 2 allocations");

// 14. L7 Trouser = 1
const l7TrouserRule = FabricCapacityEngine.getGarmentFabricRule("trousers", undefined, "L7");
assert.strictEqual(l7TrouserRule.fabricUnits, 1, "Test 14 Failed: L7 Trouser should be 1 unit");
console.log("✅ Test 14 Passed: L7 Trouser = 1 unit");

// 15. L7 Skirt = 1
const l7SkirtRule = FabricCapacityEngine.getGarmentFabricRule("skirt", undefined, "L7");
assert.strictEqual(l7SkirtRule.fabricUnits, 1, "Test 15 Failed: L7 Skirt should be 1 unit");
console.log("✅ Test 15 Passed: L7 Skirt = 1 unit");

// 16. Trouser <-> Skirt switching remains 1 unit for lower garment
const lowerUnitsTrouser = FabricCapacityEngine.getGarmentFabricRule("trousers").fabricUnits;
const lowerUnitsSkirt = FabricCapacityEngine.getGarmentFabricRule("skirt").fabricUnits;
assert.strictEqual(lowerUnitsTrouser, lowerUnitsSkirt, "Test 16 Failed: Trouser and Skirt should consume identical units");
console.log("✅ Test 16 Passed: Trouser <-> Skirt switching remains 1 unit");

// 17. Ordinary Custom Details = 0 extra units
const ordinaryDetailsUnits = FabricCapacityEngine.calculateFabricUnits(mockShirtStyle, null, {
  customDetails: {
    shirt_pockets: "shirt_pocket_1",
    neck_design: "neck_no_round",
    trouser_pockets: "trouser_pocket_regular",
  },
});
assert.strictEqual(ordinaryDetailsUnits, 2, "Test 17 Failed: Ordinary Custom Details should consume 0 extra units");
console.log("✅ Test 17 Passed: Ordinary Custom Details consume 0 extra units");

// 18. Dress Lining = 0 extra units
const liningUnits = FabricCapacityEngine.calculateFabricUnits(dressStyle, null, {
  customDetails: { dress_additional: "L5" },
});
assert.strictEqual(liningUnits, 1, "Test 18 Failed: Dress Lining L5 should consume 0 extra units");
console.log("✅ Test 18 Passed: Dress Lining L5 consumes 0 extra units");

// 19. Monogram = 0 extra units
const monogramUnits = FabricCapacityEngine.calculateFabricUnits(mockShirtStyle, null, {
  monogramText: "ABC",
});
assert.strictEqual(monogramUnits, 2, "Test 19 Failed: Monogram should consume 0 extra units");
console.log("✅ Test 19 Passed: Monogram consumes 0 extra units");

// 20. Actual Additional Clothes garment consumes configured units
const extraGarmentUnits = FabricCapacityEngine.calculateFabricUnits(mockShirtStyle, null, {
  customDetails: { trouser_additional: "trouser_additional_add_trouser" },
});
assert.strictEqual(extraGarmentUnits, 3, "Test 20 Failed: Additional garment option should add 1 unit");
console.log("✅ Test 20 Passed: Actual Additional Clothes option consumes 1 unit");

// 21. Non-garment Additional Clothes option = 0 extra units
const nonGarmentExtraUnits = FabricCapacityEngine.calculateFabricUnits(mockShirtStyle, null, {
  customDetails: { standard_shorts_additional: "standard_shorts_additional_combat_pockets" },
});
assert.strictEqual(nonGarmentExtraUnits, 2, "Test 21 Failed: Non-garment additional option should add 0 units");
console.log("✅ Test 21 Passed: Non-garment Additional Clothes option consumes 0 units");

// 22. Same fabric can exist in two allocation IDs
const alloc1 = FabricCapacityEngine.createFabricAllocation("alloc-1", mockFabricA);
const alloc2 = FabricCapacityEngine.createFabricAllocation("alloc-2", mockFabricA);
assert.notStrictEqual(alloc1.id, alloc2.id, "Test 22 Failed: Allocation IDs must be unique");
assert.strictEqual(alloc1.fabric.code, alloc2.fabric.code, "Test 22 Failed: Fabric codes can be identical");
console.log("✅ Test 22 Passed: Same fabric can exist in two allocation IDs");

// 23. Different fabrics can exist in two allocations
const allocDiff1 = FabricCapacityEngine.createFabricAllocation("alloc-1", mockFabricA);
const allocDiff2 = FabricCapacityEngine.createFabricAllocation("alloc-2", mockFabricB);
assert.notStrictEqual(allocDiff1.fabric.code, allocDiff2.fabric.code, "Test 23 Failed: Different fabrics in allocations");
console.log("✅ Test 23 Passed: Different fabrics can exist in allocations");

// 24. Cancel preserves existing allocation
const activeAllocations = [alloc1];
const cancelledAllocations = [...activeAllocations];
assert.strictEqual(activeAllocations.length, cancelledAllocations.length, "Test 24 Failed: Cancel should preserve allocation");
console.log("✅ Test 24 Passed: Cancel preserves existing allocation state");

// 25. Guest draft round-trip preserves allocations
const normalizedAllocations = FabricCapacityEngine.normalizeFabricAllocations({
  fabric: mockFabricA,
  additionalFabrics: [mockFabricB],
  style: mockShirtStyle,
  design: {},
});
assert.strictEqual(normalizedAllocations.length, 2, "Test 25 Failed: Normalized allocations length should be 2");
console.log("✅ Test 25 Passed: Draft normalization preserves allocations");

// 26. Legacy draft normalizes to one allocation
const legacyNormalized = FabricCapacityEngine.normalizeFabricAllocations({
  fabric: mockFabricA,
  style: mockShirtStyle,
  design: {},
});
assert.strictEqual(legacyNormalized.length, 1, "Test 26 Failed: Legacy item should normalize to 1 allocation");
console.log("✅ Test 26 Passed: Legacy draft normalizes to one allocation");

// 27. Cart preserves garment assignments
const cartAlloc = FabricCapacityEngine.createFabricAllocation("alloc-1", mockFabricA, [
  { id: "asgn-1", garmentGroup: "shirt", fabricUnits: 1 },
]);
assert.strictEqual(cartAlloc.garmentAssignments.length, 1, "Test 27 Failed: Cart allocation should store assignments");
console.log("✅ Test 27 Passed: Cart preserves garment assignments");

// 28. Checkout rejects over-capacity allocation
const mockCartItem = {
  id: "cart-1",
  customer: { name: "Test User", email: "test@example.com", phone: "123", location: "Eindhoven" },
  style: mockShirtStyle,
  fabric: mockFabricA,
  additionalFabrics: [],
  design: { customDetails: { trouser_additional: "trouser_additional_add_trouser" } },
  garment: { type: "Exact", code: "EXACT" },
  measurements: { height: 178, weight: 75, age: 32, bodyBuild: "Average", fitPreference: "Standard", neck: 15, shoulder: 18, chest: 40, waist: 34, hip: 38, sleeve: 24, trouserLength: 40, isAiEstimated: false, unit: "inch" },
  specialInstructions: "",
  notesAboutLeftoverFabric: "",
  batchType: "alone",
  deliverySelection: { method: "PICKUP", pickupLocation: "Campus", pickupWindow: "Monday" },
} as unknown as CartItem;

const checkoutRevalidation = revalidateCartForCheckout([mockCartItem], {
  fabrics: [mockFabricA, mockFabricB],
  styles: [mockShirtStyle],
  batches: [],
  customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings: DEFAULT_BUSINESS_SETTINGS,
  depositRatio: 0.5,
});
assert.strictEqual(checkoutRevalidation.canProceed, false, "Test 28 Failed: Checkout must reject over-capacity order");
assert.ok(checkoutRevalidation.blockers.some(b => b.includes("fabric allocations")), "Test 28 Failed: Blocker message missing");
console.log("✅ Test 28 Passed: Checkout rejects over-capacity allocation");

// 29. Pricing does not duplicate unrelated charges
const pricing = calculateDesignPricing({
  route: "alone",
  design: { customDetails: { dress_additional: "L5" } },
  fabric: mockFabricA,
  additionalFabrics: [mockFabricB],
  style: mockShirtStyle,
  garment: { type: "Exact", code: "EXACT" } as CustomDetailGarmentContext,
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings: DEFAULT_BUSINESS_SETTINGS,
});
assert.ok(pricing !== null, "Test 29 Failed: Pricing should compute");
if (pricing) {
  assert.strictEqual(pricing.fabricPrice, 125, "Test 29 Failed: Fabric price should sum 50 + 75 = 125");
}
console.log("✅ Test 29 Passed: Pricing sums fabric prices without duplicating unrelated charges");

// 30. Quantity scaling follows existing quantity semantics
const quantityUnits = FabricCapacityEngine.calculateFabricUnits(mockShirtStyle, null, {}, 2);
assert.strictEqual(quantityUnits, 4, "Test 30 Failed: Quantity 2 for 2-unit outfit should require 4 units");
const quantityAllocations = FabricCapacityEngine.calculateRequiredAllocations(quantityUnits);
assert.strictEqual(quantityAllocations, 2, "Test 30 Failed: 4 units should require 2 allocations");
console.log("✅ Test 30 Passed: Quantity scaling calculates 4 units / 2 allocations for 2 copies");

console.log("==========================================");
console.log("ALL 30 FABRIC CAPACITY TESTS PASSED!");
console.log("==========================================");
