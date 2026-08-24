import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import {
  getCustomerFacingFabricQuantityForAllocations,
} from "./src/engine/FabricCapacityEngine";
import {
  createUploadedDesignSourceWhenReady,
  getUploadedDesignCapacitySummary,
  getUploadedDesignStep1Readiness,
  toggleUploadedDesignGarmentComposition,
  UPLOADED_DESIGN_GARMENT_OPTIONS,
} from "./src/utils/uploadedDesignStep1";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import {
  getConfirmedDesignSourceKeyAfterSourceChange,
} from "./src/utils/designSourceState";
import { getPriceActivatedFabricCodeAfterDesignSourceChange } from "./src/utils/designStylePricingActivation";

const reference = createCustomerDesignUploadReference({
  ownerUid: "uploaded-design-step-1-test",
  designReferenceId: "uploaded-design-step-1-reference",
  mimeType: "image/png",
  createdAt: "2026-08-11T00:00:00.000Z",
});

const noInputs = getUploadedDesignStep1Readiness({
  uploadReference: null,
  fabricCapacityComposition: [],
  demographic: null,
});
assert.equal(noInputs.isReady, false);
assert.equal(
  createUploadedDesignSourceWhenReady({
    uploadReference: reference,
    fabricCapacityComposition: [],
    demographic: "male",
  }),
  null,
  "An image alone must not create an uploaded source.",
);

let composition = toggleUploadedDesignGarmentComposition([], "shirt");
composition = toggleUploadedDesignGarmentComposition(composition, "trouser");
assert.deepEqual(
  composition.map((spec) => spec.garmentType),
  ["shirt", "trouser"],
);
composition = toggleUploadedDesignGarmentComposition(composition, "shirt");
assert.deepEqual(
  composition.map((spec) => spec.garmentType),
  ["trouser"],
  "Repeated clicks must not create duplicate garment types.",
);

const threeGarmentComposition = (["shirt", "trouser", "skirt"] as const).reduce(
  (current, garmentType) =>
    toggleUploadedDesignGarmentComposition(current, garmentType),
  [] as ReturnType<typeof toggleUploadedDesignGarmentComposition>,
);
const capacity = getUploadedDesignCapacitySummary(threeGarmentComposition);
assert.deepEqual(capacity, {
  garmentCount: 3,
  fabricQuantity: 2,
  requiresAdditionalAllocation: true,
});

const summaryFor = (...garmentTypes: Parameters<typeof toggleUploadedDesignGarmentComposition>[1][]) =>
  getUploadedDesignCapacitySummary(
    garmentTypes.reduce(
      (current, garmentType) =>
        toggleUploadedDesignGarmentComposition(current, garmentType),
      [] as ReturnType<typeof toggleUploadedDesignGarmentComposition>,
    ),
  );

assert.deepEqual(summaryFor("shirt"), {
  garmentCount: 1,
  fabricQuantity: 1,
  requiresAdditionalAllocation: false,
});
assert.deepEqual(summaryFor("shirt", "trouser"), {
  garmentCount: 2,
  fabricQuantity: 1,
  requiresAdditionalAllocation: false,
});
assert.deepEqual(summaryFor("shirt", "trouser", "skirt", "bum_shorts"), {
  garmentCount: 4,
  fabricQuantity: 2,
  requiresAdditionalAllocation: true,
});
assert.deepEqual(summaryFor("kaftan"), {
  garmentCount: 1,
  fabricQuantity: 1,
  requiresAdditionalAllocation: false,
});
assert.deepEqual(summaryFor("full_length_gown"), {
  garmentCount: 1,
  fabricQuantity: 1,
  requiresAdditionalAllocation: false,
});
assert.deepEqual(
  getUploadedDesignCapacitySummary([createStyleBaseGarmentSpec("agbada")]),
  {
    garmentCount: 1,
    fabricQuantity: 1,
    requiresAdditionalAllocation: false,
  },
);
assert.ok(
  UPLOADED_DESIGN_GARMENT_OPTIONS.every(
    (option) => option.garmentType !== "agbada",
  ),
  "Upload garment options must hide Agbada",
);
assert.deepEqual(summaryFor("kaftan", "trouser"), {
  garmentCount: 2,
  fabricQuantity: 1,
  requiresAdditionalAllocation: false,
});

const shirtAssignment = {
  garmentKey: "shirt", code: "shirt", garmentType: "shirt" as const, fabricUnits: 1 as const,
};
const trouserAssignment = {
  garmentKey: "trouser", code: "trouser", garmentType: "trouser" as const, fabricUnits: 1 as const,
};
const sameFabricAllocations = getCustomerFacingFabricQuantityForAllocations([
  {
    allocationId: "fabric-1",
    fabricCode: "HERITAGE-IVORY",
    garmentAssignments: [shirtAssignment, trouserAssignment],
  },
]);
assert.equal(sameFabricAllocations.fabricQuantity, 1);
const repeatedFabricAllocations = getCustomerFacingFabricQuantityForAllocations([
  {
    allocationId: "fabric-1",
    fabricCode: "HERITAGE-IVORY",
    garmentAssignments: [shirtAssignment],
  },
  {
    allocationId: "fabric-2",
    fabricCode: "HERITAGE-IVORY",
    garmentAssignments: [trouserAssignment],
  },
]);
assert.equal(
  repeatedFabricAllocations.fabricQuantity,
  2,
  "Separate allocation IDs remain separate fabric quantities even with one fabric code.",
);
const differentFabricAllocations = getCustomerFacingFabricQuantityForAllocations([
  {
    allocationId: "fabric-1",
    fabricCode: "HERITAGE-IVORY",
    garmentAssignments: [shirtAssignment],
  },
  {
    allocationId: "fabric-2",
    fabricCode: "CRIMSON-RED",
    garmentAssignments: [trouserAssignment],
  },
]);
assert.equal(differentFabricAllocations.fabricQuantity, 2);
assert.deepEqual(
  differentFabricAllocations.allocations.map((allocation) => allocation.fabricCode),
  ["HERITAGE-IVORY", "CRIMSON-RED"],
);
assert.equal(UPLOADED_DESIGN_GARMENT_OPTIONS.length, 8);
assert.ok(
  UPLOADED_DESIGN_GARMENT_OPTIONS.every(
    (option) => option.garmentType !== "agbada",
  ),
);
assert.equal(
  UPLOADED_DESIGN_GARMENT_OPTIONS.find((option) => option.garmentType === "kaftan")
    ?.fabricUnits,
  1,
);

const source = createUploadedDesignSourceWhenReady({
  uploadReference: reference,
  fabricCapacityComposition: threeGarmentComposition,
  demographic: "unisex",
});
assert(source);
assert.equal(source.kind, "uploaded");
assert.equal(source.displayLabel, "Your Uploaded Design");
assert.equal(source.demographic, "unisex");
assert.equal(
  getConfirmedDesignSourceKeyAfterSourceChange(source, source.sourceKey, source),
  source.sourceKey,
);
const replacementSource = createUploadedDesignSourceWhenReady({
  uploadReference: createCustomerDesignUploadReference({
    ownerUid: "uploaded-design-step-1-test",
    designReferenceId: "uploaded-design-step-1-replacement",
    mimeType: "image/webp",
    createdAt: "2026-08-11T00:00:00.000Z",
  }),
  fabricCapacityComposition: threeGarmentComposition,
  demographic: "unisex",
});
assert(replacementSource);
assert.equal(
  getConfirmedDesignSourceKeyAfterSourceChange(
    source,
    source.sourceKey,
    replacementSource,
  ),
  null,
  "Replacing a private image must invalidate the old confirmation.",
);
assert.equal(
  getPriceActivatedFabricCodeAfterDesignSourceChange({
    currentSource: source,
    currentConfirmedDesignSourceKey: source.sourceKey,
    currentPriceActivatedFabricCode: "FABRIC-A",
    nextSource: replacementSource,
  }),
  null,
  "Replacing a private image must invalidate stale price activation.",
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
assert.match(designStyleStepSource, /data-testid="upload-your-design-panel"/);
assert(
  designStyleStepSource.indexOf("compatibilityByStyle.map") <
    designStyleStepSource.indexOf('data-testid="upload-your-design-panel"'),
  "The upload panel must appear below the Design Style catalogue.",
);
assert.match(designStyleStepSource, /Upload Your Design/);
assert.match(studioSource, /CustomerDesignUploadService\.validateCustomerDesignFile/);
assert.match(studioSource, /CustomerDesignUploadService\.uploadCustomerDesignDraft/);
assert.match(studioSource, /CustomerDesignUploadService\.replaceCustomerDesignDraft/);
assert.match(studioSource, /CustomerDesignUploadService\.readCustomerDesignDraft/);
assert.match(studioSource, /CustomerDesignUploadService\.deleteCustomerDesignDraft/);
assert.match(designStyleStepSource, /CUSTOMER_DESIGN_IMAGE_MIME_TYPES\.join/);
assert.match(designStyleStepSource, /Continue with Uploaded Design/);
assert.match(designStyleStepSource, /fabric quantit/);
assert.match(studioSource, /setFutureConfirmedDesignSourceKey\(activeUploadedDesignSource\.sourceKey\)/);
assert.match(studioSource, /setFuturePriceActivatedFabricCode\(null\)/);
assert.match(studioSource, /reconcileFutureFabricAllocationState/);
assert.match(studioSource, /selectedGarmentTypes:[\s\S]*fabricCapacityComposition/);
assert.match(studioSource, /URL\.revokeObjectURL/);
assert.doesNotMatch(studioSource, /getDownloadURL/);
assert.doesNotMatch(designStyleStepSource, /storagePath/);
assert.match(studioSource, /case "READ_NOT_AUTHORIZED":/);
assert.doesNotMatch(
  studioSource,
  /CustomerDesignUploadError[\s\S]{0,120}\? error\.message/,
  "Customer-facing upload errors must not expose raw ownership or storage details.",
);

console.log("PASS: uploaded design Step 1 readiness, composition, capacity, and secure UI wiring");
