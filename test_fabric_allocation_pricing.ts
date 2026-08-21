import assert from "node:assert/strict";
import type { CartItem, Fabric, FabricAllocation } from "./src/types";
import {
  resolveCartItemFabricAllocationPricing,
  resolveFabricAllocationMaterialPricing,
} from "./src/utils/fabricAllocationPricing";

const makeFabric = (overrides: Partial<Fabric>): Fabric => ({
  code: "FABRIC-DEFAULT",
  name: "Default Fabric",
  description: "Default",
  color: "Green",
  colorHex: "#006b54",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  ...overrides,
});

const hiTarget = makeFabric({
  code: "FAB-HI",
  name: "HiTarget Royal",
  category: "HiTarget Ankara",
});
const lace = makeFabric({
  code: "FAB-LACE",
  name: "Royal Lace",
  category: "Lace",
});
const unpriced = makeFabric({
  code: "FAB-UNPRICED",
  name: "Future Unpriced",
  category: "Future Fabric",
});

const fabrics = [hiTarget, lace, unpriced];

const makeAllocation = (
  allocationId: string,
  fabricCode: string,
  garmentAssignments: FabricAllocation["garmentAssignments"],
): FabricAllocation => ({
  allocationId,
  fabricCode,
  garmentAssignments,
});

const oneHiTarget = resolveFabricAllocationMaterialPricing(
  [
    makeAllocation("alloc-1", hiTarget.code, [
      {
        garmentKey: "G1:shirt",
        code: "G1",
        garmentType: "shirt",
        fabricUnits: 1,
      },
    ]),
  ],
  fabrics,
);
assert.equal(oneHiTarget.status, "resolved");
assert.equal(oneHiTarget.allocationCount, 1);
assert.equal(oneHiTarget.baseMaterialPrice, 3.91);
assert.equal(oneHiTarget.additionalMaterialPrice, 0);
assert.equal(oneHiTarget.totalMaterialPrice, 3.91);
assert.equal(oneHiTarget.baseFabricSewingCost, 4.06);

const mixedTwo = resolveFabricAllocationMaterialPricing(
  [
    makeAllocation("alloc-1", hiTarget.code, [
      {
        garmentKey: "G1:shirt",
        code: "G1",
        garmentType: "shirt",
        fabricUnits: 1,
      },
    ]),
    makeAllocation("alloc-2", lace.code, [
      {
        garmentKey: "L7:skirt",
        code: "L7",
        garmentType: "skirt",
        fabricUnits: 1,
        lowerGarmentType: "skirt",
      },
    ]),
  ],
  fabrics,
);
assert.equal(mixedTwo.status, "resolved");
assert.equal(mixedTwo.baseMaterialPrice, 3.91);
assert.equal(mixedTwo.additionalMaterialPrice, 28.13);
assert.equal(mixedTwo.totalMaterialPrice, 32.04);
assert.equal(mixedTwo.baseFabricSewingCost, 4.06);

const sameFabricTwice = resolveFabricAllocationMaterialPricing(
  [
    makeAllocation("alloc-A", hiTarget.code, [
      {
        garmentKey: "G1:shirt",
        code: "G1",
        garmentType: "shirt",
        fabricUnits: 1,
      },
    ]),
    makeAllocation("alloc-B", hiTarget.code, [
      {
        garmentKey: "G4:trouser",
        code: "G4",
        garmentType: "trouser",
        fabricUnits: 1,
      },
    ]),
  ],
  fabrics,
);
assert.equal(sameFabricTwice.status, "resolved");
assert.equal(sameFabricTwice.allocationCount, 2);
assert.equal(sameFabricTwice.totalMaterialPrice, 7.82);

const twoGarmentsSingleAllocation = resolveFabricAllocationMaterialPricing(
  [
    makeAllocation("alloc-G52", hiTarget.code, [
      {
        garmentKey: "G5.2:shirt",
        code: "G5.2",
        garmentType: "shirt",
        fabricUnits: 1,
      },
      {
        garmentKey: "G5.2:trouser",
        code: "G5.2",
        garmentType: "trouser",
        fabricUnits: 1,
      },
    ]),
  ],
  fabrics,
);
assert.equal(twoGarmentsSingleAllocation.status, "resolved");
assert.equal(twoGarmentsSingleAllocation.totalMaterialPrice, 3.91);

const kaftanSingle = resolveFabricAllocationMaterialPricing(
  [
    makeAllocation("alloc-kaftan", hiTarget.code, [
      {
        garmentKey: "KAFTAN:kaftan",
        code: "KAFTAN",
        garmentType: "kaftan",
        fabricUnits: 1,
        garmentSpec: {
          key: "KAFTAN:kaftan",
          garmentType: "kaftan",
          fabricUnits: 1,
        },
      },
    ]),
  ],
  fabrics,
);
assert.equal(kaftanSingle.status, "resolved");
assert.equal(kaftanSingle.totalMaterialPrice, 3.91);

const threeAllocations = resolveFabricAllocationMaterialPricing(
  [
    makeAllocation("alloc-1", hiTarget.code, [
      { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
    ]),
    makeAllocation("alloc-2", lace.code, [
      { garmentKey: "L1:dress", code: "L1", garmentType: "dress", fabricUnits: 1 },
    ]),
    makeAllocation("alloc-3", hiTarget.code, [
      { garmentKey: "G4:trouser", code: "G4", garmentType: "trouser", fabricUnits: 1 },
    ]),
  ],
  fabrics,
);
assert.equal(threeAllocations.status, "resolved");
assert.equal(threeAllocations.totalMaterialPrice, 35.95);

const hiThenLace = resolveFabricAllocationMaterialPricing(
  [
    makeAllocation("order-1", hiTarget.code, [
      { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
    ]),
    makeAllocation("order-2", lace.code, [
      { garmentKey: "L1:dress", code: "L1", garmentType: "dress", fabricUnits: 1 },
    ]),
  ],
  fabrics,
);
const laceThenHi = resolveFabricAllocationMaterialPricing(
  [
    makeAllocation("order-1", lace.code, [
      { garmentKey: "L1:dress", code: "L1", garmentType: "dress", fabricUnits: 1 },
    ]),
    makeAllocation("order-2", hiTarget.code, [
      { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
    ]),
  ],
  fabrics,
);
assert.equal(hiThenLace.status, "resolved");
assert.equal(laceThenHi.status, "resolved");
assert.equal(hiThenLace.totalMaterialPrice, laceThenHi.totalMaterialPrice);
assert.notEqual(hiThenLace.baseMaterialPrice, laceThenHi.baseMaterialPrice);
assert.notEqual(hiThenLace.baseFabricSewingCost, laceThenHi.baseFabricSewingCost);

const missingFabric = resolveFabricAllocationMaterialPricing(
  [
    makeAllocation("missing", "NO-SUCH-FABRIC", [
      { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
    ]),
  ],
  fabrics,
);
assert.equal(missingFabric.status, "unresolved");
assert.equal(missingFabric.reason, "FABRIC_NOT_FOUND");

const unpricedFabric = resolveFabricAllocationMaterialPricing(
  [
    makeAllocation("unpriced", unpriced.code, [
      { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
    ]),
  ],
  fabrics,
);
assert.equal(unpricedFabric.status, "unresolved");
assert.equal(unpricedFabric.reason, "FABRIC_PRICE_UNAVAILABLE");

const makeCartItem = (overrides: Partial<CartItem>): CartItem =>
  ({
    id: "cart-1",
    customer: { name: "Test", email: "test@example.com", phone: "" },
    style: { id: "style-1", name: "Style", description: "", gender: "male", options: [] },
    fabric: hiTarget,
    design: { priceCode: "G1" },
    garment: { type: "Shirt", totalPrice: 10 },
    measurements: {
      height: 170,
      weight: 70,
      age: 30,
      bodyBuild: "Average",
      fitPreference: "Standard",
      neck: 15,
      shoulder: 17,
      chest: 38,
      waist: 33,
      hip: 38,
      sleeve: 24,
      trouserLength: 40,
      isAiEstimated: false,
    },
    specialInstructions: "",
    notesAboutLeftoverFabric: "",
    batchType: "alone",
    ...overrides,
  }) as CartItem;

const modernBeatsLegacy = resolveCartItemFabricAllocationPricing(
  makeCartItem({
    fabric: lace,
    fabricAllocations: [
      makeAllocation("modern-1", hiTarget.code, [
        { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
      ]),
    ],
  }),
  fabrics,
);
assert.equal(modernBeatsLegacy.status, "resolved");
assert.equal(modernBeatsLegacy.baseFabric.code, hiTarget.code);

const invalidModern = resolveCartItemFabricAllocationPricing(
  makeCartItem({
    fabricAllocations: [
      {
        allocationId: "broken",
        fabricCode: hiTarget.code,
        garmentAssignments: [
          {
            garmentKey: "BROKEN",
            code: "BROKEN",
            fabricUnits: 1,
          } as unknown as FabricAllocation["garmentAssignments"][number],
        ],
      },
    ],
  }),
  fabrics,
);
assert.equal(invalidModern.status, "unresolved");
assert.equal(invalidModern.reason, "INVALID_MODERN_ALLOCATIONS");

const absentModernLegacyPricing = resolveCartItemFabricAllocationPricing(
  makeCartItem({
    fabric: lace,
  }),
  fabrics,
);
assert.equal(absentModernLegacyPricing.status, "resolved");
assert.equal(absentModernLegacyPricing.source, "legacy");
assert.equal(absentModernLegacyPricing.totalMaterialPrice, 28.13);

console.log("PASS: fabric allocation pricing");
