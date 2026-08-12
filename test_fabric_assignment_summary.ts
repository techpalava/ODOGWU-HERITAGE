import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Fabric, FabricAllocation, FabricGarmentAssignment } from "./src/types";
import { resolveCustomerFabricAssignmentSummary } from "./src/utils/fabricAssignmentSummary";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";

const ivory: Fabric = {
  code: "ODG-010",
  name: "Heritage Ivory Lattice",
  description: "",
  color: "Ivory",
  colorHex: "#f4eee2",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
};
const crimson: Fabric = {
  ...ivory,
  code: "ODG-020",
  name: "Crimson Red",
};

const garment = (
  garmentKey: string,
  garmentType: FabricGarmentAssignment["garmentType"],
  fabricUnits: 1 | 2 = 1,
): FabricGarmentAssignment => ({ garmentKey, code: garmentKey, garmentType, fabricUnits });

const allocation = (
  allocationId: string,
  fabricCode: string,
  garmentAssignments: FabricGarmentAssignment[],
): FabricAllocation => ({ allocationId, fabricCode, garmentAssignments });

const sameFabric = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory, crimson],
  fabricAllocations: [
    allocation("ivory-1", ivory.code, [garment("shirt", "shirt"), garment("trouser", "trouser")]),
  ],
});
assert.equal(sameFabric.garmentCount, 2);
assert.equal(sameFabric.fabricQuantity, 1);
assert.deepEqual(sameFabric.garmentRows.map((row) => row.fabricLabel), [
  "Heritage Ivory Lattice (ODG-010)",
  "Heritage Ivory Lattice (ODG-010)",
]);

const sameFabricTwoAllocations = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory, crimson],
  fabricAllocations: [
    allocation("ivory-1", ivory.code, [garment("shirt", "shirt"), garment("trouser", "trouser")]),
    allocation("ivory-2", ivory.code, [garment("skirt", "skirt")]),
  ],
});
assert.equal(sameFabricTwoAllocations.garmentCount, 3);
assert.equal(sameFabricTwoAllocations.fabricQuantity, 2);
assert.deepEqual(sameFabricTwoAllocations.fabricQuantityRows, [{
  fabricCode: ivory.code,
  fabricLabel: "Heritage Ivory Lattice (ODG-010)",
  fabricQuantity: 2,
}]);
const sameFabricTwoAllocationPricing = resolveFabricAllocationMaterialPricing(
  [
    allocation("ivory-1", ivory.code, [garment("shirt", "shirt"), garment("trouser", "trouser")]),
    allocation("ivory-2", ivory.code, [garment("skirt", "skirt")]),
  ],
  [ivory, crimson],
);
assert.equal(sameFabricTwoAllocationPricing.status, "resolved");
assert.equal(sameFabricTwoAllocationPricing.totalMaterialPrice, 7.82);

const differentFabrics = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory, crimson],
  fabricAllocations: [
    allocation("ivory-1", ivory.code, [garment("shirt", "shirt")]),
    allocation("crimson-1", crimson.code, [garment("trouser", "trouser")]),
  ],
});
assert.equal(differentFabrics.garmentCount, 2);
assert.equal(differentFabrics.fabricQuantity, 2);
assert.deepEqual(differentFabrics.fabricQuantityRows.map((row) => row.fabricCode), [
  ivory.code,
  crimson.code,
]);
const differentFabricPricing = resolveFabricAllocationMaterialPricing(
  [
    allocation("ivory-1", ivory.code, [garment("shirt", "shirt")]),
    allocation("crimson-1", crimson.code, [garment("trouser", "trouser")]),
  ],
  [ivory, crimson],
);
assert.equal(differentFabricPricing.status, "resolved");
assert.equal(differentFabricPricing.totalMaterialPrice, 7.82);

const kaftan = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory],
  fabricAllocations: [
    allocation("ivory-1", ivory.code, [garment("kaftan", "kaftan", 2)]),
  ],
});
assert.equal(kaftan.garmentCount, 1);
assert.equal(kaftan.fabricQuantity, 1);

const fullLengthGown = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory],
  fabricAllocations: [
    allocation("ivory-1", ivory.code, [garment("gown", "full_length_gown", 2)]),
  ],
});
assert.equal(fullLengthGown.garmentCount, 1);
assert.equal(fullLengthGown.fabricQuantity, 1);

const kaftanAndTrouser = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory],
  fabricAllocations: [
    allocation("ivory-1", ivory.code, [garment("kaftan", "kaftan", 2)]),
    allocation("ivory-2", ivory.code, [garment("trouser", "trouser")]),
  ],
});
assert.equal(kaftanAndTrouser.garmentCount, 2);
assert.equal(kaftanAndTrouser.fabricQuantity, 2);

const mixedThreeGarments = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory, crimson],
  fabricAllocations: [
    allocation("ivory-1", ivory.code, [garment("shirt", "shirt"), garment("trouser", "trouser")]),
    allocation("crimson-1", crimson.code, [garment("skirt", "skirt")]),
  ],
});
assert.equal(mixedThreeGarments.garmentCount, 3);
assert.equal(mixedThreeGarments.fabricQuantity, 2);

const gold: Fabric = { ...ivory, code: "ODG-030", name: "Gold Leaf" };
const threeFabricGarments = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory, crimson, gold],
  fabricAllocations: [
    allocation("ivory-1", ivory.code, [garment("shirt", "shirt")]),
    allocation("crimson-1", crimson.code, [garment("trouser", "trouser")]),
    allocation("gold-1", gold.code, [garment("skirt", "skirt")]),
  ],
});
assert.equal(threeFabricGarments.garmentCount, 3);
assert.equal(threeFabricGarments.fabricQuantity, 3);

const beforeFabricChange = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory, crimson],
  fabricAllocations: [
    allocation("ivory-1", ivory.code, [garment("shirt", "shirt")]),
    allocation("crimson-1", crimson.code, [garment("skirt", "skirt")]),
  ],
});
const afterFabricChange = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory, crimson],
  fabricAllocations: [
    allocation("ivory-1", ivory.code, [garment("shirt", "shirt")]),
    allocation("ivory-2", ivory.code, [garment("skirt", "skirt")]),
  ],
});
assert.equal(beforeFabricChange.garmentRows.find((row) => row.garmentKey === "skirt")?.fabricCode, crimson.code);
assert.equal(afterFabricChange.garmentRows.find((row) => row.garmentKey === "skirt")?.fabricCode, ivory.code);
assert.equal(afterFabricChange.fabricQuantityRows.some((row) => row.fabricCode === crimson.code), false);

const withOptionalExtra = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory],
  fabricAllocations: [
    allocation("ivory-1", ivory.code, [garment("shirt", "shirt"), garment("trouser", "trouser")]),
    allocation("ivory-2", ivory.code, [garment("extra-skirt", "skirt")]),
  ],
});
const withoutOptionalExtra = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory],
  fabricAllocations: [
    allocation("ivory-1", ivory.code, [garment("shirt", "shirt"), garment("trouser", "trouser")]),
  ],
});
assert.equal(withOptionalExtra.garmentCount, 3);
assert.equal(withOptionalExtra.fabricQuantity, 2);
assert.equal(withoutOptionalExtra.garmentCount, 2);
assert.equal(withoutOptionalExtra.fabricQuantity, 1);

const unresolved = resolveCustomerFabricAssignmentSummary({
  fabrics: [ivory],
  fabricAllocations: [allocation("ivory-1", ivory.code, [garment("shirt", "shirt")])],
  unassignedGarments: [garment("skirt", "skirt")],
});
assert.equal(unresolved.garmentCount, 2);
assert.equal(unresolved.assignedGarmentCount, 1);
assert.equal(unresolved.unresolvedGarmentCount, 1);
assert.deepEqual(unresolved.garmentRows.at(-1), {
  garmentKey: "skirt",
  garmentLabel: "Skirt",
  fabricCode: null,
  fabricLabel: null,
  isAssigned: false,
  sourceRole: "main",
  roleLabel: "Main",
});

const designStudioSource = readFileSync(
  new URL("./src/components/DesignStudioView.tsx", import.meta.url),
  "utf8",
);
assert.match(
  designStudioSource,
  /resolveCustomerFabricAssignmentSummary[\s\S]*?Garments &amp; Fabrics/,
  "Active Selection must render the centralized assignment summary.",
);
assert.doesNotMatch(
  designStudioSource,
  /Fabric Selection \{index \+ 1\}/,
  "Active Selection must not regress to raw allocation-selection rows.",
);
assert.match(
  designStudioSource,
  /Complete fabric assignments to see the final design total\./,
  "Incomplete assignments must not appear as a final price.",
);

console.log("PASS: customer fabric assignment summary");
