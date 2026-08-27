import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createStyleBaseGarmentSpec,
  getFabricGarmentSelectionsForComposition,
} from "./src/config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { getCustomerFacingFabricQuantityForAllocations } from "./src/engine/FabricCapacityEngine";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type { StyleCategory } from "./src/types";
import { DESIGN_STUDIO_NINE_STAGE_FOUNDATION } from "./src/utils/designSourceJourney";
import {
  createCatalogDesignSource,
  createUploadedDesignSource,
  hasValidActiveDesignSource,
} from "./src/utils/designSourceState";
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
assert.equal(hasValidActiveDesignSource(catalogSource, null), false);
assert.equal(hasValidActiveDesignSource(uploadedSource, null), true);

assert.deepEqual(
  DESIGN_STUDIO_NINE_STAGE_FOUNDATION.map(({ id, position, title }) => ({
    id,
    position,
    title,
  })),
  [
    { id: "garment_type", position: 1, title: "Garment Type" },
    { id: "fabric", position: 2, title: "Fabric" },
    { id: "design_style", position: 3, title: "Design Style" },
    { id: "custom_details", position: 4, title: "Custom Details" },
    { id: "try_on", position: 5, title: "AI Try-on" },
    { id: "measurement", position: 6, title: "Measurement" },
    { id: "summary", position: 7, title: "Summary" },
    { id: "shipping", position: 8, title: "Delivery & Pickup" },
    { id: "payment", position: 9, title: "Order Review & Payment" },
  ],
);

const fabricCode = "JOURNEY-FABRIC";
for (const source of [catalogSource, uploadedSource]) {
  assert.equal(
    isDesignSourcePricingActive({
      designSource: source,
      selectedStyle: source.kind === "catalog" ? catalogStyle : null,
      confirmedStyleId: source.kind === "catalog" ? catalogStyle.id : null,
      confirmedDesignSourceKey: source.sourceKey,
      selectedFabricCode: fabricCode,
      priceActivatedFabricCode: fabricCode,
    }),
    true,
  );
}

const uploadedAllocations =
  FabricAllocationStateEngine.syncPrimaryGarmentComposition(
    FabricAllocationStateEngine.initialize(),
    fabricCode,
    getFabricGarmentSelectionsForComposition(
      uploadedSource.fabricCapacityComposition,
    ),
  ).fabricAllocations;
assert.equal(
  resolveShippingGarmentPieceCount({ fabricAllocations: uploadedAllocations }),
  2,
);
assert.equal(
  getCustomerFacingFabricQuantityForAllocations(uploadedAllocations)
    .fabricQuantity,
  1,
);
assert.deepEqual(
  resolveCustomerFabricAssignmentSummary({
    fabricAllocations: uploadedAllocations,
    fabrics: [{ code: fabricCode, name: "Journey Fabric" } as any],
  }).garmentRows.map((row) => [row.garmentLabel, row.fabricCode]),
  [
    ["Shirt", fabricCode],
    ["Trouser", fabricCode],
  ],
);

const studioSource = readFileSync(
  "src/components/DesignStudioView.tsx",
  "utf8",
);
const appSource = readFileSync("src/App.tsx", "utf8");
assert.match(studioSource, /DesignStudioJourneyStepper/);
assert.match(studioSource, /data-stage-id=\{futureStageId\}/);
assert.match(studioSource, /setFutureStageId\("garment_type"\)/);
assert.match(studioSource, /setFutureStageId\("fabric"\)/);
assert.match(studioSource, /setFutureStageId\("design_style"\)/);
assert.match(studioSource, /setFutureStageId\("custom_details"\)/);
assert.equal(studioSource.includes("legacy_five_stage"), false);
assert.doesNotMatch(appSource, /useStaffPreviewClientGate|journeyMode=/);

console.log(
  "PASS: catalog and uploaded sources preserve nine-stage domain parity",
);
