import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createStyleBaseGarmentSpec,
  getFabricGarmentSelectionsForComposition,
} from "./src/config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { getCustomerFacingFabricQuantityForAllocations } from "./src/engine/FabricCapacityEngine";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type { StyleCategory } from "./src/types";
import {
  createCatalogDesignSource,
  createUploadedDesignSource,
  hasValidActiveDesignSource,
} from "./src/utils/designSourceState";
import {
  DESIGN_STUDIO_CUSTOMER_FLOW_STEPS,
  getNextCustomerFlowStep,
  getPreviousCustomerFlowStep,
  normalizeCustomerFlowStep,
} from "./src/utils/designSourceJourney";
import { isDesignSourcePricingActive } from "./src/utils/designStylePricingActivation";
import { resolveCustomerFabricAssignmentSummary } from "./src/utils/fabricAssignmentSummary";
import { resolveShippingGarmentPieceCount } from "./src/utils/shippingPricing";

const catalogStyle: StyleCategory = {
  id: "journey-parity-catalog-style",
  name: "Journey Parity Catalog Style",
  description: "Catalog fixture for the common Design Studio journey.",
  gender: "male",
  options: [],
};

const uploadedSource = createUploadedDesignSource({
  uploadReference: createCustomerDesignUploadReference({
    ownerUid: "journey-parity-owner",
    designReferenceId: "journey-parity-upload",
    mimeType: "image/png",
    createdAt: "2026-08-12T00:00:00.000Z",
  }),
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
  demographic: "male",
});

const catalogSource = createCatalogDesignSource(catalogStyle.id);
assert(catalogSource);
assert.equal(hasValidActiveDesignSource(catalogSource, catalogStyle), true);
assert.equal(
  hasValidActiveDesignSource(catalogSource, null),
  false,
  "Catalog flow must continue to require its real StyleCategory.",
);
assert.equal(
  hasValidActiveDesignSource(uploadedSource, null),
  true,
  "A valid uploaded design must not require a synthetic catalog StyleCategory.",
);

const canonicalSteps = DESIGN_STUDIO_CUSTOMER_FLOW_STEPS.map((step) => step.title);
assert.deepEqual(canonicalSteps, [
  "Garment / Style",
  "Fabric",
  "Custom Details",
  "Shipping & Delivery",
  "Review / Add to Cart",
]);

const followCanonicalJourney = () => {
  const visited: number[] = [1];
  let step = 1;
  while (true) {
    const next = getNextCustomerFlowStep(step);
    if (next === null) return visited;
    visited.push(next);
    step = next;
  }
};

const catalogJourney = followCanonicalJourney();
const uploadedJourney = followCanonicalJourney();
assert.deepEqual(catalogJourney, [1, 2, 3, 7, 9]);
assert.deepEqual(uploadedJourney, catalogJourney);
assert.deepEqual(
  [...uploadedJourney].reverse().map((step) => getPreviousCustomerFlowStep(step)),
  [7, 3, 2, 1, null],
  "Uploaded designs must retain the same backwards route as catalog designs.",
);
assert.equal(normalizeCustomerFlowStep(4), 7);
assert.equal(normalizeCustomerFlowStep(8), 9);

const fabricCode = "JOURNEY-FABRIC";
assert.equal(
  isDesignSourcePricingActive({
    designSource: catalogSource,
    selectedStyle: catalogStyle,
    confirmedStyleId: null,
    confirmedDesignSourceKey: null,
    selectedFabricCode: fabricCode,
    priceActivatedFabricCode: null,
  }),
  false,
  "Catalog pricing remains inactive before source and fabric confirmation.",
);
assert.equal(
  isDesignSourcePricingActive({
    designSource: catalogSource,
    selectedStyle: catalogStyle,
    confirmedStyleId: catalogStyle.id,
    confirmedDesignSourceKey: catalogSource.sourceKey,
    selectedFabricCode: fabricCode,
    priceActivatedFabricCode: fabricCode,
  }),
  true,
);
assert.equal(
  isDesignSourcePricingActive({
    designSource: uploadedSource,
    selectedStyle: null,
    confirmedStyleId: null,
    confirmedDesignSourceKey: uploadedSource.sourceKey,
    selectedFabricCode: fabricCode,
    priceActivatedFabricCode: null,
  }),
  false,
  "Uploaded pricing stays inactive until Fabric Proceed.",
);
assert.equal(
  isDesignSourcePricingActive({
    designSource: uploadedSource,
    selectedStyle: null,
    confirmedStyleId: null,
    confirmedDesignSourceKey: uploadedSource.sourceKey,
    selectedFabricCode: fabricCode,
    priceActivatedFabricCode: fabricCode,
  }),
  true,
);

const uploadedAllocations = FabricAllocationStateEngine.syncPrimaryGarmentComposition(
  FabricAllocationStateEngine.initialize(),
  fabricCode,
  getFabricGarmentSelectionsForComposition(
    uploadedSource.fabricCapacityComposition,
  ),
).fabricAllocations;
assert.equal(uploadedAllocations.length, 1);
assert.equal(
  resolveShippingGarmentPieceCount({ fabricAllocations: uploadedAllocations }),
  2,
  "Shipping remains based on two physical uploaded garments.",
);
assert.equal(
  getCustomerFacingFabricQuantityForAllocations(uploadedAllocations)
    .fabricQuantity,
  1,
  "F1 fabric quantity remains separate from physical shipping pieces.",
);
const assignmentSummary = resolveCustomerFabricAssignmentSummary({
  fabricAllocations: uploadedAllocations,
  fabrics: [{ code: fabricCode, name: "Journey Fabric" } as any],
});
assert.deepEqual(
  assignmentSummary.garmentRows.map((row) => [row.garmentLabel, row.fabricCode]),
  [["Shirt", fabricCode], ["Trouser", fabricCode]],
  "F3 allocation summaries survive the common downstream journey.",
);

const studioSource = readFileSync(
  fileURLToPath(new URL("./src/components/DesignStudioView.tsx", import.meta.url)),
  "utf8",
);
assert.match(studioSource, /hasValidActiveDesignSource\(/);
assert.match(studioSource, /getNextCustomerFlowStep\(currentStep\)/);
assert.match(studioSource, /getPreviousCustomerFlowStep\(currentStep\)/);
assert.match(studioSource, /DESIGN_STUDIO_CUSTOMER_FLOW_STEPS as CUSTOMER_FLOW_STEPS/);

console.log("PASS: catalog and uploaded design sources share the canonical customer journey");
