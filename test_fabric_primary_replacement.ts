import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric } from "./src/types";
import { cloneFabricAllocations } from "./src/utils/fabricAllocationPersistence";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";

const royal: Fabric = {
  code: "ROYAL_FOREST",
  name: "Royal Forest Mosaic",
  description: "Royal",
  color: "Teal",
  colorHex: "#006b54",
  category: "Lace",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
};
const imperial: Fabric = {
  code: "IMPERIAL_SAPPHIRE",
  name: "Imperial Sapphire Link",
  description: "Imperial",
  color: "Blue",
  colorHex: "#002397",
  category: "HiTarget Ankara",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
};
const lace: Fabric = {
  code: "LACE_SKIRT",
  name: "Lace Skirt Fabric",
  description: "Lace",
  color: "Gold",
  colorHex: "#c9a227",
  category: "Kampala",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
};
const fabrics = [royal, imperial, lace];

const initial = FabricAllocationStateEngine.selectPrimaryFabric(
  FabricAllocationStateEngine.initialize(),
  royal.code,
  { code: "G5.2" },
);
assert.equal(initial.fabricAllocations.length, 1);
assert.equal(initial.fabricAllocations[0].fabricCode, royal.code);
assert.equal(initial.fabricAllocations[0].garmentAssignments.length, 2);

const originalId = initial.fabricAllocations[0].allocationId;
const originalAssignments = initial.fabricAllocations[0].garmentAssignments;
const simpleReplacement = FabricAllocationStateEngine.selectPrimaryFabric(
  initial,
  imperial.code,
  { code: "G5.2" },
);
assert.equal(simpleReplacement.fabricAllocations.length, 1);
assert.equal(simpleReplacement.fabricAllocations[0].allocationId, originalId);
assert.equal(simpleReplacement.fabricAllocations[0].fabricCode, imperial.code);
assert.deepEqual(
  simpleReplacement.fabricAllocations[0].garmentAssignments,
  originalAssignments,
);
assert.equal(
  simpleReplacement.fabricAllocations.some(
    (allocation) => allocation.fabricCode === royal.code,
  ),
  false,
);

const repeatedSelection = FabricAllocationStateEngine.selectPrimaryFabric(
  simpleReplacement,
  imperial.code,
  { code: "G5.2" },
);
assert.strictEqual(repeatedSelection, simpleReplacement);

const overflow = FabricAllocationStateEngine.attemptAppendGarment(initial, {
  code: "APPEND_SKIRT",
  garmentSpec: {
    key: "append:skirt",
    garmentType: "skirt",
    fabricUnits: 1,
  },
});
assert(overflow.pendingFabricGarment);
const chooseAnother = FabricAllocationStateEngine.assignPendingGarmentToFabric(
  FabricAllocationStateEngine.beginChooseAnotherFabric(overflow),
  lace.code,
);
assert.equal(chooseAnother.fabricAllocations.length, 2);
assert.equal(chooseAnother.fabricAllocations[0].fabricCode, royal.code);
assert.equal(chooseAnother.fabricAllocations[1].fabricCode, lace.code);
assert.equal(
  chooseAnother.fabricAllocations[1].garmentAssignments[0].garmentType,
  "skirt",
);

const secondAllocationId = chooseAnother.fabricAllocations[1].allocationId;
const multiReplacement = FabricAllocationStateEngine.selectPrimaryFabric(
  chooseAnother,
  imperial.code,
  { code: "G5.2" },
);
assert.equal(multiReplacement.fabricAllocations.length, 2);
assert.equal(multiReplacement.fabricAllocations[0].allocationId, originalId);
assert.equal(multiReplacement.fabricAllocations[0].fabricCode, imperial.code);
assert.deepEqual(
  multiReplacement.fabricAllocations[0].garmentAssignments,
  originalAssignments,
);
assert.equal(
  multiReplacement.fabricAllocations[1].allocationId,
  secondAllocationId,
);
assert.equal(multiReplacement.fabricAllocations[1].fabricCode, lace.code);
assert.equal(
  multiReplacement.activeAllocationId,
  chooseAnother.activeAllocationId,
);

const sameFabricOverflow =
  FabricAllocationStateEngine.useSameFabricForPendingGarment(overflow);
assert.equal(sameFabricOverflow.fabricAllocations.length, 2);
assert.equal(sameFabricOverflow.fabricAllocations[0].fabricCode, royal.code);
assert.equal(sameFabricOverflow.fabricAllocations[1].fabricCode, royal.code);
assert.notEqual(
  sameFabricOverflow.fabricAllocations[0].allocationId,
  sameFabricOverflow.fabricAllocations[1].allocationId,
);

const beforePricing = resolveFabricAllocationMaterialPricing(
  chooseAnother.fabricAllocations,
  fabrics,
);
const afterPricing = resolveFabricAllocationMaterialPricing(
  multiReplacement.fabricAllocations,
  fabrics,
);
assert.equal(beforePricing.status, "resolved");
assert.equal(afterPricing.status, "resolved");
assert.equal(beforePricing.allocationCount, 2);
assert.equal(afterPricing.allocationCount, 2);
assert.equal(beforePricing.baseFabric.code, royal.code);
assert.equal(afterPricing.baseFabric.code, imperial.code);
assert.equal(beforePricing.additionalMaterialPrice, 5);
assert.equal(afterPricing.additionalMaterialPrice, 5);
assert.equal(beforePricing.totalMaterialPrice, 33.13);
assert.equal(afterPricing.totalMaterialPrice, 8.91);

const reloadedAllocations = cloneFabricAllocations(
  JSON.parse(JSON.stringify(multiReplacement.fabricAllocations)),
);
assert.deepEqual(
  reloadedAllocations,
  cloneFabricAllocations(multiReplacement.fabricAllocations),
);
assert.equal(reloadedAllocations?.[0].allocationId, originalId);
assert.equal(reloadedAllocations?.[0].fabricCode, imperial.code);
assert.equal(reloadedAllocations?.[1].allocationId, secondAllocationId);
assert.equal(reloadedAllocations?.[1].fabricCode, lace.code);

const designStudioSource = readFileSync(
  new URL("./src/components/DesignStudioView.tsx", import.meta.url),
  "utf8",
);
const futureFabricStageSource = readFileSync(
  new URL("./src/utils/designStudioFutureFabricStage.ts", import.meta.url),
  "utf8",
);
assert.match(
  designStudioSource,
  /handleAssignFutureFabricToGarment[\s\S]*assignFutureFabricToGarment/,
);
assert.match(
  futureFabricStageSource,
  /awaitingFabricForPendingGarment[\s\S]*FabricAllocationStateEngine\.assignPendingGarmentToFabricAndContinue/,
);
assert.match(
  futureFabricStageSource,
  /FabricAllocationStateEngine\.selectPrimaryFabric/,
);
assert.doesNotMatch(futureFabricStageSource, /syncForSelectedFabric/);

console.log("PASS: primary fabric replacement preserves allocation identity and pricing semantics");
