import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import {
  createUploadedDesignSource,
  resolveAuthoritativePhysicalOrder,
} from "./src/utils/designSourceState";
import {
  evaluateAuthoritativeUploadedDesignReadiness,
  getUploadedDesignStep1Readiness,
  mergeUploadedDesignCompositionWithStep1,
} from "./src/utils/uploadedDesignStep1";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const step1 = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser", "full_length_gown"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalog,
}).selection;

const uploadReference = createCustomerDesignUploadReference({
  ownerUid: "parent-readiness-test",
  designReferenceId: "parent-readiness-ref",
  mimeType: "image/png",
  createdAt: "2026-08-11T00:00:00.000Z",
});

const rawUploadComposition = [
  createStyleBaseGarmentSpec("shirt"),
  createStyleBaseGarmentSpec("trouser"),
];

const uploaded = createUploadedDesignSource({
  uploadReference,
  demographic: "male",
  fabricCapacityComposition: rawUploadComposition,
});

const staleHydratedReadiness = evaluateAuthoritativeUploadedDesignReadiness({
  uploadInput: {
    uploadReference,
    fabricCapacityComposition: rawUploadComposition,
    demographic: "male",
  },
  step1GarmentTypes: step1.garmentTypes,
  designSource: uploaded,
  confirmedDesignSourceKey: uploaded.sourceKey,
  selectedFabricCode: "FAB-A",
  priceActivatedFabricCode: "FAB-A",
});

assert.equal(staleHydratedReadiness.isReady, false);
assert.equal(staleHydratedReadiness.isProgressionReady, false);
assert.equal(staleHydratedReadiness.isPricingEligible, false);

const blockedOrder = resolveAuthoritativePhysicalOrder({
  garmentTypeSelection: step1,
  designSource: uploaded,
  confirmedDesignSourceKey: uploaded.sourceKey,
  normalizedCustomDetailCatalog: catalog,
});

assert.equal(blockedOrder.status, "blocked");
if (blockedOrder.status !== "blocked") {
  throw new Error("expected blocked authoritative upload order");
}
assert.equal(blockedOrder.diagnostics[0]?.code, "upload_missing_required_step1_garment");

const mergedComposition = mergeUploadedDesignCompositionWithStep1({
  step1GarmentTypes: step1.garmentTypes,
  preservedHiddenComposition: rawUploadComposition,
});

const mergedReadiness = getUploadedDesignStep1Readiness(
  {
    uploadReference,
    fabricCapacityComposition: mergedComposition,
    demographic: "male",
  },
  step1.garmentTypes,
);
const rawReadiness = getUploadedDesignStep1Readiness(
  {
    uploadReference,
    fabricCapacityComposition: rawUploadComposition,
    demographic: "male",
  },
  step1.garmentTypes,
);

assert.equal(
  mergedReadiness.isReady,
  true,
  "merged composition must not be used for Step 1 coverage validation",
);
assert.equal(rawReadiness.isReady, false);
assert.equal(rawReadiness.missingRequiredStep1Garments, true);

const continueGate = evaluateAuthoritativeUploadedDesignReadiness({
  uploadInput: {
    uploadReference,
    fabricCapacityComposition: rawUploadComposition,
    demographic: "male",
  },
  step1GarmentTypes: step1.garmentTypes,
  designSource: uploaded,
  confirmedDesignSourceKey: null,
});

assert.equal(
  continueGate.isReady,
  false,
  "handleContinueWithUploadedDesign must not confirm a stale upload missing Step 1 garments",
);

console.log("PASS: uploaded design parent readiness and hydration authority");
