import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { getFabricGarmentSelectionsForComposition } from "./src/config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type { CustomDetailSelectionGroup, DesignSelections } from "./src/types";
import {
  filterDesignSelectionsForCustomDetails,
  getRequiredCustomDetailGroups,
  groupApplicableCustomDetails,
} from "./src/utils/catalogHelpers";
import {
  createUploadedDesignSource,
  resolveActiveCustomDetailDesignContext,
  resolveActiveDesignComposition,
} from "./src/utils/designSourceState";
import { buildFutureOrderCandidate } from "./src/utils/futureOrderCandidate";
import { resolveShippingGarmentPieceCount } from "./src/utils/shippingPricing";

const createUploadedContext = (
  composition: Parameters<typeof createUploadedDesignSource>[0]["fabricCapacityComposition"],
  demographic: "male" | "female" | "unisex",
) => {
  const source = createUploadedDesignSource({
    uploadReference: createCustomerDesignUploadReference({
      ownerUid: "anonymous-uploaded-design-test",
      designReferenceId: `uploaded-${composition.map((spec) => spec.key).join("-")}`,
      mimeType: "image/png",
      createdAt: "2026-08-11T00:00:00.000Z",
    }),
    fabricCapacityComposition: composition,
    demographic,
  });
  const context = resolveActiveCustomDetailDesignContext(source, null);
  assert(context && "kind" in context && context.kind === "uploaded");
  return { source, context };
};

const allGroupIds = (context: ReturnType<typeof createUploadedContext>["context"]) =>
  groupApplicableCustomDetails(context, SEED_CUSTOM_DETAIL_CATALOG)
    .map((group) => group.id)
    .filter((groupId) => groupId !== "additional_physical_garment");

const groupIds = (context: ReturnType<typeof createUploadedContext>["context"]) =>
  allGroupIds(context).filter((groupId) => !groupId.endsWith("_additional"));

const shirtTrouser = createUploadedContext(
  [
    { key: "uploaded-shirt", garmentType: "shirt", fabricUnits: 1 },
    { key: "uploaded-trouser", garmentType: "trouser", fabricUnits: 1 },
  ],
  "male",
);

assert.deepEqual(resolveActiveDesignComposition(shirtTrouser.source, null), [
  { key: "uploaded-shirt", garmentType: "shirt", fabricUnits: 1 },
  { key: "uploaded-trouser", garmentType: "trouser", fabricUnits: 1 },
]);
assert.deepEqual(groupIds(shirtTrouser.context), [
  "shirt_construction",
  "shirt_pockets",
  "neck_design",
  "trouser_fastening",
  "trouser_pockets",
]);

const shirtTrouserSelections = getFabricGarmentSelectionsForComposition(
  shirtTrouser.context.fabricCapacityComposition,
);
let allocationState = FabricAllocationStateEngine.syncPrimaryGarmentComposition(
  FabricAllocationStateEngine.initialize(),
  "FABRIC_UPLOADED_A",
  shirtTrouserSelections,
);
assert.equal(allocationState.fabricAllocations.length, 1);
assert.equal(allocationState.fabricAllocations[0].garmentAssignments.length, 2);
assert.equal(allocationState.pendingFabricGarment, null);
assert.equal(
  resolveShippingGarmentPieceCount({
    fabricAllocations: allocationState.fabricAllocations,
  }),
  2,
  "Two one-unit garments are two shipping pieces.",
);

const shirtTrouserSkirt = createUploadedContext(
  [
    ...shirtTrouser.context.fabricCapacityComposition,
    { key: "uploaded-skirt", garmentType: "skirt", fabricUnits: 1 },
  ],
  "unisex",
);
allocationState = FabricAllocationStateEngine.syncPrimaryGarmentComposition(
  allocationState,
  "FABRIC_UPLOADED_A",
  getFabricGarmentSelectionsForComposition(
    shirtTrouserSkirt.context.fabricCapacityComposition,
  ),
);
assert.equal(allocationState.fabricAllocations.length, 1);
assert.equal(allocationState.fabricAllocations[0].garmentAssignments.length, 2);
assert.equal(allocationState.pendingFabricGarment?.garmentType, "skirt");

const sameFabricOverflow =
  FabricAllocationStateEngine.useSameFabricForPendingGarment(allocationState);
assert.equal(sameFabricOverflow.fabricAllocations.length, 2);
assert.equal(
  sameFabricOverflow.fabricAllocations[1].fabricCode,
  "FABRIC_UPLOADED_A",
);
assert.notEqual(
  sameFabricOverflow.fabricAllocations[0].allocationId,
  sameFabricOverflow.fabricAllocations[1].allocationId,
);
assert.equal(
  resolveShippingGarmentPieceCount({
    fabricAllocations: sameFabricOverflow.fabricAllocations,
  }),
  3,
  "Overflow allocations remain physical garments for shipping.",
);

const kaftan = createUploadedContext(
  [{ key: "uploaded-kaftan", garmentType: "kaftan", fabricUnits: 2 }],
  "male",
);
const kaftanState = FabricAllocationStateEngine.syncPrimaryGarmentComposition(
  FabricAllocationStateEngine.initialize(),
  "FABRIC_KAFTAN",
  getFabricGarmentSelectionsForComposition(kaftan.context.fabricCapacityComposition),
);
assert.equal(kaftanState.fabricAllocations[0].garmentAssignments[0].fabricUnits, 2);
assert.equal(
  resolveShippingGarmentPieceCount({ fabricAllocations: kaftanState.fabricAllocations }),
  1,
  "A two-unit kaftan is one physical shipping piece.",
);
assert.deepEqual(groupIds(kaftan.context), [
  "shirt_construction",
  "shirt_pockets",
  "neck_design",
]);

const dress = createUploadedContext(
  [{ key: "uploaded-dress", garmentType: "dress", fabricUnits: 1 }],
  "female",
);
assert.deepEqual(groupIds(dress.context), [
  "dress_construction",
  "dress_pockets",
  "neck_design",
]);
const staleMaleSelections: DesignSelections = {
  customDetails: {
    shirt_construction: "shirt_std_short",
    trouser_fastening: "trouser_rope",
    dress_construction: "dress_std_short",
  },
};
const filteredDressSelections = filterDesignSelectionsForCustomDetails(
  dress.context,
  staleMaleSelections,
  SEED_CUSTOM_DETAIL_CATALOG,
);
assert.deepEqual(filteredDressSelections.customDetails, {
  dress_construction: "dress_std_short",
});
const requiredDressGroups = getRequiredCustomDetailGroups(
  dress.context,
  SEED_CUSTOM_DETAIL_CATALOG,
  undefined,
  filteredDressSelections,
);
assert(
  requiredDressGroups.every((groupId) =>
    new Set<CustomDetailSelectionGroup>(allGroupIds(dress.context)).has(groupId),
  ),
  "Uploaded designs must never require hidden custom-detail groups.",
);

const studioSource = readFileSync(
  fileURLToPath(new URL("./src/components/DesignStudioView.tsx", import.meta.url)),
  "utf8",
);
const designStyleStepSource = readFileSync(
  fileURLToPath(
    new URL("./src/components/DormantFutureDesignStyleStep.tsx", import.meta.url),
  ),
  "utf8",
);
assert.match(studioSource, /createUploadedDesignSourceWhenReady/);
assert.match(studioSource, /reconcileFutureFabricAllocationState/);
assert.match(studioSource, /activeFutureDesignSource/);
assert.match(studioSource, /source: activeFutureDesignSource/);
assert.match(studioSource, /isFutureDesignSourceReadyForCustomDetails/);
assert.match(designStyleStepSource, /data-testid="upload-your-design-panel"/);
assert.match(designStyleStepSource, /Final review and payment for uploaded designs remain unavailable/);
assert.equal(typeof buildFutureOrderCandidate, "function");
assert.doesNotMatch(studioSource, /uploadedDesignShippingReady/);

console.log("PASS: uploaded design capacity, shipping, and custom-detail integration");
