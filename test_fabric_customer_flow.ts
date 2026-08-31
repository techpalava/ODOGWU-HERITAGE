import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FABRIC_APPEND_GARMENT_CHOICES,
  type FabricAppendGarmentChoice,
} from "./src/engine/FabricCapacityEngine";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { appendCustomerFabricGarment } from "./src/utils/fabricGarmentAppendFlow";

const getChoice = (id: FabricAppendGarmentChoice["id"]) => {
  const choice = FABRIC_APPEND_GARMENT_CHOICES.find((item) => item.id === id);
  assert.ok(choice, `Expected customer garment choice ${id}`);
  return choice;
};

const fabricCode = "ODG-007";
const appendableGarmentTypes = FABRIC_APPEND_GARMENT_CHOICES.map(
  (choice) => choice.id,
).sort();
const customDetailPhysicalGarmentTypes = [
  ...new Set(
    SEED_CUSTOM_DETAIL_CATALOG.filter((option) =>
      Boolean(option.fabricCapacityGarmentSpec),
    )
      .map((option) => option.fabricCapacityGarmentSpec?.garmentType)
      .filter((value): value is NonNullable<typeof value> => Boolean(value)),
  ),
].sort();
assert.deepEqual(
  customDetailPhysicalGarmentTypes,
  appendableGarmentTypes,
  "The retained catalog provenance must cover every physical garment type",
);

let state = FabricAllocationStateEngine.initialize();
state = appendCustomerFabricGarment(
  state,
  fabricCode,
  getChoice("shirt").selection,
);
state = appendCustomerFabricGarment(
  state,
  fabricCode,
  getChoice("trouser").selection,
);
assert.equal(state.fabricAllocations.length, 1);
assert.equal(state.fabricAllocations[0]?.garmentAssignments.length, 2);
assert.equal(state.pendingFabricGarment, null);

const overflow = appendCustomerFabricGarment(
  state,
  fabricCode,
  getChoice("skirt").selection,
);
assert.equal(overflow.fabricAllocations.length, 1);
assert.equal(overflow.fabricAllocations[0]?.garmentAssignments.length, 2);
assert.equal(overflow.pendingFabricGarment?.garmentType, "skirt");

const sameFabric =
  FabricAllocationStateEngine.useSameFabricForPendingGarment(overflow);
assert.equal(sameFabric.fabricAllocations.length, 2);
assert.equal(sameFabric.fabricAllocations[0]?.fabricCode, fabricCode);
assert.equal(sameFabric.fabricAllocations[1]?.fabricCode, fabricCode);
assert.notEqual(
  sameFabric.fabricAllocations[0]?.allocationId,
  sameFabric.fabricAllocations[1]?.allocationId,
);

const anotherFabric = FabricAllocationStateEngine.assignPendingGarmentToFabric(
  FabricAllocationStateEngine.beginChooseAnotherFabric(overflow),
  "ODG-SECONDARY",
);
assert.equal(anotherFabric.fabricAllocations.length, 2);
assert.equal(anotherFabric.fabricAllocations[1]?.fabricCode, "ODG-SECONDARY");

const cancelled = FabricAllocationStateEngine.cancelPendingGarment(overflow);
assert.equal(cancelled.fabricAllocations.length, 1);
assert.equal(cancelled.pendingFabricGarment, null);

const readSource = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const designStudioSource = readSource("./src/components/DesignStudioView.tsx");
const garmentTypeStepSource = readSource("./src/components/GarmentTypeStep.tsx");
const futureFabricStageSource = readSource(
  "./src/utils/designStudioFutureFabricStage.ts",
);
const futureFabricStepSource = readSource(
  "./src/components/DormantFutureFabricStep.tsx",
);

assert.match(
  garmentTypeStepSource,
  /Select every physical garment included in this order/,
  "Step 1 must make the complete physical-garment composition explicit",
);
assert.match(garmentTypeStepSource, /type="checkbox"/);
assert.match(
  designStudioSource,
  /onGarmentTypesChange=\{handleDormantGarmentTypesChange\}/,
  "The active customer control must update the authoritative Step 1 composition",
);
assert.match(
  futureFabricStageSource,
  /FabricAllocationStateEngine\.attemptAppendGarment/,
  "Step 2 must route each unassigned physical garment through the allocation engine",
);
assert.match(
  futureFabricStageSource,
  /FabricAllocationStateEngine\.selectPrimaryFabric/,
  "Normal fabric selection must replace the primary allocation fabric",
);
assert.match(futureFabricStepSource, /Fabric Selection Limit/);
assert.match(futureFabricStepSource, /Use Same Fabric Again/);
assert.match(futureFabricStepSource, /Choose Another Fabric/);
assert.match(futureFabricStepSource, />\s*Cancel\s*</);
assert.match(
  futureFabricStepSource,
  /aria-label=\{`Change fabric for \$\{garmentLabel\}`\}/,
);
assert.match(
  futureFabricStepSource,
  /aria-label=\{`Add fabric for \$\{garmentLabel\}`\}/,
);
assert.match(
  futureFabricStepSource,
  /aria-label=\{`Assign fabric for \$\{garmentLabel\}`\}/,
);
assert.doesNotMatch(designStudioSource, /onPhysicalGarmentOptionChange/);
assert.doesNotMatch(designStudioSource, /<OptionalAdditionalGarmentSection/);

console.log(
  "PASS: active garment composition and Fabric stage use centralized allocation transitions",
);
