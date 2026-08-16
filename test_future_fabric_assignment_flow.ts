import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricGarmentType } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  getFutureFabricCapacityOffer,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  reconcileFutureFabricAllocationState,
} from "./src/utils/designStudioFutureFabricStage";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const createSelection = (garmentTypes: FabricGarmentType[]) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: ["unisex"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
const createFabric = (
  code: string,
  name: string,
  price: number | undefined,
  stockStatus: Fabric["stockStatus"] = "IN_STOCK",
): Fabric => ({
  code,
  name,
  description: name,
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus,
  category: "Test Fabric",
  price,
});
const fabrics = [
  createFabric("FAB-A", "Fabric A", 10),
  createFabric("FAB-B", "Fabric B", 20),
  createFabric("FAB-C", "Fabric C", 30),
];
const assign = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
  garmentTypes: FabricGarmentType[],
  garmentKey: string,
  fabricCode: string,
) => {
  const result = assignFutureFabricToGarment({
    state,
    garmentTypeSelection: createSelection(garmentTypes),
    garmentKey,
    fabricCode,
  });
  assert.equal(result.status, "assigned");
  return result.state;
};

const threeRegular = ["shirt", "trouser", "skirt"] satisfies FabricGarmentType[];
let shared = assign(
  FabricAllocationStateEngine.initialize(),
  threeRegular,
  "base:shirt",
  "FAB-A",
);
assert.equal(shared.fabricAllocations.length, 1);
assert.equal(
  getFutureFabricCapacityOffer({
    garmentTypeSelection: createSelection(threeRegular),
    fabricAllocationState: shared,
  })?.target.assignment.garmentKey,
  "base:trouser",
);
shared = assign(shared, threeRegular, "base:trouser", "FAB-A");
assert.equal(shared.fabricAllocations.length, 1);
assert.deepEqual(
  shared.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt", "base:trouser"],
);
assert.equal(
  getFutureFabricCapacityOffer({
    garmentTypeSelection: createSelection(threeRegular),
    fabricAllocationState: shared,
  }),
  null,
  "A full active allocation must not offer another garment.",
);

let separate = assign(shared, threeRegular, "base:skirt", "FAB-B");
assert.equal(separate.fabricAllocations.length, 2);
assert.equal(separate.fabricAllocations[1].fabricCode, "FAB-B");
assert.deepEqual(getFutureGarmentFabricPlanning({
  garmentTypeSelection: createSelection(threeRegular),
  fabricAllocationState: separate,
}), {
  requiredGarmentCount: 3,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});

const repeatedProduct = assign(shared, threeRegular, "base:skirt", "FAB-A");
assert.equal(repeatedProduct.fabricAllocations.length, 2);
assert.equal(repeatedProduct.fabricAllocations[0].fabricCode, "FAB-A");
assert.equal(repeatedProduct.fabricAllocations[1].fabricCode, "FAB-A");
assert.notEqual(
  repeatedProduct.fabricAllocations[0].allocationId,
  repeatedProduct.fabricAllocations[1].allocationId,
);
assert.equal(
  resolveFabricAllocationMaterialPricing(repeatedProduct.fabricAllocations, fabrics)
    .status,
  "resolved",
);
const repeatedPricing = resolveFabricAllocationMaterialPricing(
  repeatedProduct.fabricAllocations,
  fabrics,
);
assert.equal(
  repeatedPricing.status === "resolved" ? repeatedPricing.totalMaterialPrice : null,
  20,
  "Two full allocations using one fabric product must produce two material charges.",
);

const exceptionTypes = ["kaftan", "shirt"] satisfies FabricGarmentType[];
let exceptionState = assign(
  FabricAllocationStateEngine.initialize(),
  exceptionTypes,
  "base:kaftan",
  "FAB-A",
);
assert.equal(
  getFutureFabricCapacityOffer({
    garmentTypeSelection: createSelection(exceptionTypes),
    fabricAllocationState: exceptionState,
  }),
  null,
);
exceptionState = assign(exceptionState, exceptionTypes, "base:shirt", "FAB-A");
assert.equal(exceptionState.fabricAllocations.length, 2);

separate = assign(separate, threeRegular, "base:trouser", "FAB-B");
assert.deepEqual(
  separate.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
);
assert.deepEqual(
  separate.fabricAllocations[1].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:skirt", "base:trouser"],
);

const singleSelection = ["shirt"] satisfies FabricGarmentType[];
let single = assign(
  FabricAllocationStateEngine.initialize(),
  singleSelection,
  "base:shirt",
  "FAB-A",
);
const originalAllocationId = single.fabricAllocations[0].allocationId;
single = assign(single, singleSelection, "base:shirt", "FAB-C");
assert.equal(single.fabricAllocations.length, 1);
assert.equal(single.fabricAllocations[0].allocationId, originalAllocationId);
assert.equal(single.fabricAllocations[0].fabricCode, "FAB-C");

const removed = reconcileFutureFabricAllocationState({
  state: separate,
  garmentTypeSelection: createSelection(["shirt", "skirt"]),
});
assert.deepEqual(
  removed.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ),
  ["base:shirt", "base:skirt"],
);

const reloaded = JSON.parse(JSON.stringify(repeatedProduct));
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(threeRegular),
    fabricAllocationState: reloaded,
    fabrics,
  }).isComplete,
  true,
);
assert.equal(reloaded.fabricAllocations.length, 2);
assert.notEqual(
  reloaded.fabricAllocations[0].allocationId,
  reloaded.fabricAllocations[1].allocationId,
);

for (const invalidFabrics of [
  [createFabric("FAB-A", "Fabric A", 10, "OUT_OF_STOCK")],
  [createFabric("FAB-A", "Fabric A", undefined)],
  [],
]) {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(threeRegular),
    fabricAllocationState: repeatedProduct,
    fabrics: invalidFabrics,
  });
  assert.equal(completion.isComplete, false);
  assert.equal(
    completion.blockers.some((blocker) =>
      ["FABRIC_UNAVAILABLE", "FABRIC_PRICE_UNAVAILABLE", "FABRIC_NOT_FOUND"].includes(
        blocker.code,
      ),
    ),
    true,
  );
}

const oldPrice = resolveFabricAllocationMaterialPricing(
  shared.fabricAllocations,
  fabrics,
);
const updatedPrice = resolveFabricAllocationMaterialPricing(
  shared.fabricAllocations,
  [createFabric("FAB-A", "Fabric A", 25)],
);
assert.equal(oldPrice.status === "resolved" ? oldPrice.totalMaterialPrice : null, 10);
assert.equal(
  updatedPrice.status === "resolved" ? updatedPrice.totalMaterialPrice : null,
  25,
);

const stepSource = readFileSync(
  "src/components/DormantFutureFabricStep.tsx",
  "utf8",
);
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.match(stepSource, /For which garment\?/);
assert.match(stepSource, /Fabrics selected:/);
assert.match(stepSource, /Your fabric can carry one more garment\. \(Optional\)/);
assert.match(stepSource, />\s*Use Same Fabric\s*</);
assert.match(stepSource, />\s*Select Different Fabric\s*</);
assert.match(stepSource, /aria-modal="true"/);
assert.match(stepSource, /event\.key === "Escape"/);
assert.match(stepSource, /restoreCatalogueFocus/);
assert.match(stepSource, /isConnected/);
assert.match(stepSource, /focus\(\{ preventScroll: true \}\)/);
assert.match(stepSource, /document\.activeElement === first/);
assert.match(stepSource, /overflow-x-hidden/);
assert.match(stepSource, /onAssignFabricToGarment\(fabric, garmentKey\)/);
assert.match(studioSource, /assignFutureFabricToGarment\(/);
assert.match(studioSource, /onBack=\{\(\) => setFutureStageId\("garment_type"\)\}/);

console.log("PASS: targeted future Fabric assignment flow");
