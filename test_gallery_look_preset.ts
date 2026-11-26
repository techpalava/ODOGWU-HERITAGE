import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { Fabric, GarmentTypeStepSelection, StyleCategory } from "./src/types";
import { createStrictPublishedStyle } from "./testing/designStyleStepFixtures";
import {
  prepareAuthoritativeDesignStyleRecord,
  projectPublishedDesignStyleRecord,
} from "./src/utils/designStyleAuthority";
import {
  buildDesignStyleDraftValidationAuthority,
  hydrateDesignStyleDraftPersistence,
} from "./src/utils/designStyleDraftPersistence";
import { buildAuthoritativePhysicalOccurrences } from "./src/utils/designSourceState";
import { projectDesignStyleStep } from "./src/utils/designStyleStepRuntime";
import {
  auditGalleryShowpieceIds,
  buildGalleryLookDraft,
  galleryLookBannerCopy,
} from "./src/utils/galleryLookPreset";
import { validateDesignStyleDraftFieldForStorage } from "./src/utils/designStyleDraftPersistence";
import { hasAuthoritativeFutureDraftMarker } from "./src/utils/designStudioDraftPersistence";

const catalog = SEED_CUSTOM_DETAIL_CATALOG;

const senator = (id: string): StyleCategory =>
  createStrictPublishedStyle({
    id,
    name: "Royal Senator",
    description: "Long shirt and trouser.",
    gender: "male",
    targetDemographic: "male",
    options: [],
    fabricCapacityComposition: ["kaftan", "trouser"].map(createStyleBaseGarmentSpec),
  });

const emerald = (
  overrides: Partial<Fabric> = {},
): Fabric => ({
  code: "ODG-902",
  name: "Royal Emerald Cotton",
  description: "Emerald cotton.",
  color: "Emerald",
  colorHex: "#014421",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
  stock: 4,
  price: 40,
  ...overrides,
});

const ready = {
  stylesLoadState: "ready" as const,
  fabricsLoadState: "ready" as const,
  customDetailCatalog: catalog,
};

const published = senator("royal-senator");
const fabrics = [emerald()];

{
  const result = buildGalleryLookDraft({
    ...ready,
    styleId: "royal-senator",
    fabricCode: "ODG-902",
    title: "The Classic Royal Emerald Senator",
    styleName: "Royal Senator",
    fabricName: "Royal Emerald Cotton",
    styles: [published],
    fabrics,
    now: "2026-11-08T12:00:00.000Z",
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected a loaded look");
  assert.deepEqual([...result.garmentTypes].sort(), ["kaftan", "trouser"]);
  assert.equal(result.styleId, "royal-senator");
  assert.equal(result.fabricCode, "ODG-902");
  assert.equal(result.corrections.length, 0);
  assert.equal(result.stageId, "measurement");
  assert.equal(
    result.banner,
    "Loaded: The Classic Royal Emerald Senator. Next, choose your size and measurements.",
  );
  assert.equal(
    result.banner,
    galleryLookBannerCopy(result.title, result.stageId),
  );
  assert.equal(
    result.toast,
    "Gallery preset loaded: The Classic Royal Emerald Senator.",
  );
  assert.equal(result.draft.currentStageId, "measurement");
  assert.equal(result.draft.selectedFabricCode, "ODG-902");
  assert.equal(result.draft.batchType, "alone");
  assert.equal(hasAuthoritativeFutureDraftMarker(result.draft), true);
  assert.equal(validateDesignStyleDraftFieldForStorage(result.draft).status, "valid");
  const allocations = result.draft.fabricAllocations || [];
  const assignedKeys = allocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  );
  assert.deepEqual(assignedKeys.sort(), ["base:kaftan", "base:trouser"]);
  assert.ok(
    allocations.every((allocation) => allocation.fabricCode === "ODG-902"),
  );
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: result.draft.garmentTypeSelection as GarmentTypeStepSelection,
    effectiveGarmentTypeSelection: result.draft.garmentTypeSelection as GarmentTypeStepSelection,
  });
  const authority = buildDesignStyleDraftValidationAuthority({
    catalogueState: "ready",
    styles: [published],
    garmentTypeSelection: result.draft.garmentTypeSelection as GarmentTypeStepSelection,
    activeOccurrences: occurrences,
  });
  const hydration = hydrateDesignStyleDraftPersistence({
    rawDraft: result.draft,
    activeOccurrences: occurrences,
    authority,
  });
  const projection = projectDesignStyleStep({
    activeOccurrences: occurrences,
    hydration,
    authority,
    styles: [published],
  });
  assert.equal(projection.isComplete, true);
  assert.equal(projection.completedCount, 2);
  assert.ok(
    projection.occurrences.every(
      (occurrence) =>
        occurrence.assignment?.sourceKind === "catalog" &&
        occurrence.assignment.catalogStyleId === "royal-senator",
    ),
  );
}

{
  const missingStyle = buildGalleryLookDraft({
    ...ready,
    styleId: "missing-style",
    fabricCode: "ODG-902",
    styles: [published],
    fabrics,
  });
  assert.equal(missingStyle.ok, false);
  if (missingStyle.ok) throw new Error("expected a missing style");
  assert.match(missingStyle.message, /missing-style/);
  assert.match(missingStyle.message, /not in the catalogue/);
  assert.doesNotMatch(missingStyle.message, /Gallery preset loaded/);
}

{
  const missingFabric = buildGalleryLookDraft({
    ...ready,
    styleId: "royal-senator",
    fabricCode: "ODG-404",
    styles: [published],
    fabrics,
  });
  assert.equal(missingFabric.ok, false);
  if (missingFabric.ok) throw new Error("expected a missing fabric");
  assert.match(missingFabric.message, /ODG-404/);
  assert.match(missingFabric.message, /not in the catalogue/);
}

{
  const bothMissing = buildGalleryLookDraft({
    ...ready,
    styleId: "missing-style",
    fabricCode: "ODG-404",
    styles: [published],
    fabrics,
  });
  assert.equal(bothMissing.ok, false);
  if (bothMissing.ok) throw new Error("expected both ids missing");
  assert.match(bothMissing.message, /missing-style/);
  assert.match(bothMissing.message, /ODG-404/);
}

{
  const outOfStock = buildGalleryLookDraft({
    ...ready,
    styleId: "royal-senator",
    fabricCode: "ODG-902",
    styles: [published],
    fabrics: [emerald({ stockStatus: "OUT_OF_STOCK", stock: 0 })],
  });
  assert.equal(outOfStock.ok, false);
  if (outOfStock.ok) throw new Error("expected out of stock");
  assert.match(outOfStock.message, /Royal Emerald Cotton \(ODG-902\) is out of stock/);
}

{
  const renamed = senator("ODGH-0007");
  const result = buildGalleryLookDraft({
    ...ready,
    styleId: "royal-senator",
    fabricCode: "ODG-OLD",
    title: "The Classic Royal Emerald Senator",
    styleName: "Royal Senator",
    fabricName: "Royal Emerald Cotton",
    styles: [renamed],
    fabrics,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected a corrected look");
  assert.equal(result.styleId, "ODGH-0007");
  assert.equal(result.fabricCode, "ODG-902");
  assert.deepEqual(result.corrections, [
    {
      field: "styleId",
      from: "royal-senator",
      to: "ODGH-0007",
      matchedName: "Royal Senator",
    },
    {
      field: "fabricCode",
      from: "ODG-OLD",
      to: "ODG-902",
      matchedName: "Royal Emerald Cotton",
    },
  ]);
}

{
  const audit = auditGalleryShowpieceIds({
    showpieces: [
      {
        id: "look-1",
        title: "The Classic Royal Emerald Senator",
        category: "male",
        styleId: "royal-senator",
        fabricCode: "ODG-902",
        styleName: "Royal Senator",
        fabricName: "Royal Emerald Cotton",
        colorHex: "#014421",
        description: "",
        tag: "Senator",
      },
      {
        id: "look-2",
        title: "Broken card",
        category: "male",
        styleId: "gone-style",
        fabricCode: "GONE",
        styleName: "Not A Style",
        fabricName: "Not A Fabric",
        colorHex: "#000",
        description: "",
        tag: "Broken",
      },
    ],
    styles: [published],
    fabrics,
    stylesLoadState: "ready",
    fabricsLoadState: "ready",
  });
  assert.equal(audit[0].corrections.length, 0);
  assert.deepEqual(audit[0].problems, []);
  assert.equal(audit[1].corrections.length, 0);
  assert.equal(audit[1].problems.length, 2);
}

{
  const loading = buildGalleryLookDraft({
    ...ready,
    stylesLoadState: "loading",
    styleId: "royal-senator",
    fabricCode: "ODG-902",
    styles: [published],
    fabrics,
  });
  assert.equal(loading.ok, false);
  if (loading.ok) throw new Error("expected a loading failure");
  assert.match(loading.message, /design catalogue is still loading/);
}

{
  // Live Royal Senator: the original garments are Long Shirt + Trouser, while
  // the catalogue also allows other garments. The look must use the original set.
  const base = {
    id: "royal-senator-1",
    name: "Royal Senator",
    description: "Live-shaped senator record.",
    gender: "male" as const,
    targetDemographic: "male" as const,
    options: [],
    fabricCapacityComposition: ["kaftan", "shirt", "standard_shorts", "trouser"].map(
      createStyleBaseGarmentSpec,
    ),
  };
  const record = prepareAuthoritativeDesignStyleRecord({
    style: base,
    lifecycle: "published",
    displayOrder: 1,
    referenceComposition: {
      status: "known",
      garmentTypes: ["kaftan", "trouser"],
    },
    currentRecord: null,
  });
  const liveSenator = projectPublishedDesignStyleRecord(record);
  assert.ok(liveSenator);
  const result = buildGalleryLookDraft({
    ...ready,
    styleId: "royal-senator",
    fabricCode: "ODG-007",
    title: "The Classic Royal Emerald Senator",
    styleName: "Royal Senator",
    fabricName: "Classic Ivory Shield",
    styles: [liveSenator],
    fabrics: [emerald({ code: "ODG-007", name: "Classic Ivory Shield" })],
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected the live senator shape to load");
  assert.deepEqual([...result.garmentTypes].sort(), ["kaftan", "trouser"]);
  assert.equal(result.styleId, "royal-senator-1");
  assert.deepEqual(result.corrections, [
    {
      field: "styleId",
      from: "royal-senator",
      to: "royal-senator-1",
      matchedName: "Royal Senator",
    },
  ]);
  assert.equal(
    result.banner,
    "Loaded: The Classic Royal Emerald Senator. Next, choose your size and measurements.",
  );
}

console.log("gallery look preset tests passed");
