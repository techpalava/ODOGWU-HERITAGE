/**
 * Test for Admin Garment Guidance Unified Checkbox Sync
 */
import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig.js";
import type { StyleCategory } from "./src/types.js";
import {
  getUnifiedStyleGarmentTypes,
  syncUnifiedStyleGarmentComposition,
  toggleUnifiedStyleGarmentType,
} from "./src/utils/designStyleAdminDefaults.js";
import {
  createDefaultDesignStyleAuthorityMetadata,
  type DesignStyleAdminProjection,
  type DesignStyleReferenceComposition,
} from "./src/utils/designStyleAuthority.js";

const createBaseStyle = (overrides: Partial<StyleCategory> = {}): StyleCategory => ({
  id: "test-style-1",
  name: "Test Style",
  description: "A test style",
  gender: "unisex",
  options: ["Standard"],
  image: "https://example.test/style.webp",
  outfitType: "Senator Set",
  garmentComposition: "2-Piece Set",
  fabricCategory: "Any",
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
  customDetailConfig: {
    representedGenders: ["male", "female"],
    featuresMaleAndFemale: true,
    supportedGarmentGroups: ["shirt", "neck", "trousers"],
    requiredSelectionGroups: ["shirt_construction", "trouser_fastening"],
    enabled: true,
  },
  includedDesignFeatures: {
    hasMonogram: false,
    hasEmbroidery: true,
    hasMonogramTrimming: false,
  },
  monogramCuffEligible: true,
  embroideryProminence: "heavy",
  defaultGarmentDetails: {},
  styleApplicability: { mode: "exact_only" },
  ...overrides,
});

const createAdminProjection = (
  style: StyleCategory,
  referenceComposition: DesignStyleReferenceComposition = { status: "legacy_unresolved", garmentTypes: [] },
): DesignStyleAdminProjection => ({
  ...style,
  designStyleAuthority: {
    ...createDefaultDesignStyleAuthorityMetadata(0),
    referenceComposition,
  },
});

console.log("=== Test 1: Legacy style with only fabricCapacityComposition ===");
{
  const style = createBaseStyle({
    fabricCapacityComposition: [
      createStyleBaseGarmentSpec("shirt"),
      createStyleBaseGarmentSpec("trouser"),
    ],
  });
  const projection = createAdminProjection(style);
  
  const unified = getUnifiedStyleGarmentTypes(projection);
  assert.deepEqual(unified, ["shirt", "trouser"], "Should read from fabricCapacityComposition");
  console.log("PASS: Legacy style reads garment types from fabricCapacityComposition");
}

console.log("\n=== Test 2: Style with referenceComposition (known) ===");
{
  const style = createBaseStyle({
    fabricCapacityComposition: [
      createStyleBaseGarmentSpec("shirt"),
      createStyleBaseGarmentSpec("trouser"),
    ],
  });
  const projection = createAdminProjection(style, {
    status: "known",
    garmentTypes: ["dress", "kaftan"],
  });
  
  const unified = getUnifiedStyleGarmentTypes(projection);
  assert.deepEqual(unified, ["dress", "kaftan"], "Should prefer referenceComposition when known");
  console.log("PASS: Style with referenceComposition known reads from referenceComposition");
}

console.log("\n=== Test 3: Style with referenceComposition (legacy_unresolved) falls back to fabricCapacityComposition ===");
{
  const style = createBaseStyle({
    fabricCapacityComposition: [
      createStyleBaseGarmentSpec("skirt"),
      createStyleBaseGarmentSpec("dress"),
    ],
  });
  const projection = createAdminProjection(style, {
    status: "legacy_unresolved",
    garmentTypes: [],
  });
  
  const unified = getUnifiedStyleGarmentTypes(projection);
  assert.deepEqual(unified, ["skirt", "dress"], "Should fall back to fabricCapacityComposition");
  console.log("PASS: Style with legacy_unresolved falls back to fabricCapacityComposition");
}

console.log("\n=== Test 4: Toggle garment ON adds to both fabricCapacityComposition and referenceComposition ===");
{
  const style = createBaseStyle({
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
  });
  const projection = createAdminProjection(style, {
    status: "legacy_unresolved",
    garmentTypes: [],
  });
  
  // Add "dress"
  const updated = toggleUnifiedStyleGarmentType(projection, "dress");
  
  // Check fabricCapacityComposition
  const fabricTypes = updated.fabricCapacityComposition.map(s => s.garmentType);
  assert.deepEqual([...fabricTypes].sort(), ["dress", "shirt"].sort(), "fabricCapacityComposition should include both");
  
  // Check referenceComposition
  assert.equal(updated.designStyleAuthority.referenceComposition.status, "known", "referenceComposition status should be 'known'");
  assert.deepEqual([...updated.designStyleAuthority.referenceComposition.garmentTypes].sort(), ["dress", "shirt"].sort(), "referenceComposition garmentTypes should match");
  
  console.log("PASS: Adding garment updates both fields in lockstep");
}

console.log("\n=== Test 5: Toggle garment OFF removes from both fields ===");
{
  const style = createBaseStyle({
    fabricCapacityComposition: [
      createStyleBaseGarmentSpec("shirt"),
      createStyleBaseGarmentSpec("trouser"),
      createStyleBaseGarmentSpec("dress"),
    ],
  });
  const projection = createAdminProjection(style, {
    status: "known",
    garmentTypes: ["shirt", "trouser", "dress"],
  });
  
  // Remove "trouser"
  const updated = toggleUnifiedStyleGarmentType(projection, "trouser");
  
  // Check fabricCapacityComposition
  const fabricTypes = updated.fabricCapacityComposition.map(s => s.garmentType);
  assert.deepEqual([...fabricTypes].sort(), ["dress", "shirt"].sort(), "fabricCapacityComposition should not include removed garment");
  
  // Check referenceComposition
  assert.equal(updated.designStyleAuthority.referenceComposition.status, "known", "referenceComposition status should remain 'known'");
  assert.deepEqual([...updated.designStyleAuthority.referenceComposition.garmentTypes].sort(), ["dress", "shirt"].sort(), "referenceComposition garmentTypes should not include removed garment");
  
  console.log("PASS: Removing garment updates both fields in lockstep");
}

console.log("\n=== Test 6: Removing last garment resets referenceComposition to legacy_unresolved ===");
{
  const style = createBaseStyle({
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
  });
  const projection = createAdminProjection(style, {
    status: "known",
    garmentTypes: ["shirt"],
  });
  
  // Remove the last garment
  const updated = toggleUnifiedStyleGarmentType(projection, "shirt");
  
  // Check fabricCapacityComposition is empty
  assert.equal(updated.fabricCapacityComposition.length, 0, "fabricCapacityComposition should be empty");
  
  // Check referenceComposition is reset
  assert.equal(updated.designStyleAuthority.referenceComposition.status, "legacy_unresolved", "referenceComposition should reset to legacy_unresolved");
  assert.deepEqual(updated.designStyleAuthority.referenceComposition.garmentTypes, [], "referenceComposition garmentTypes should be empty");
  
  console.log("PASS: Clearing all garments resets referenceComposition to legacy_unresolved");
}

console.log("\n=== Test 7: Toggle maintains canonical order (STYLE_BASE_GARMENT_TYPES order) ===");
{
  const style = createBaseStyle({
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
  });
  const projection = createAdminProjection(style, {
    status: "legacy_unresolved",
    garmentTypes: [],
  });
  
  // Add multiple garments in non-canonical order
  let updated = toggleUnifiedStyleGarmentType(projection, "kaftan");
  updated = toggleUnifiedStyleGarmentType(updated, "trouser");
  updated = toggleUnifiedStyleGarmentType(updated, "dress");
  
  const fabricTypes = updated.fabricCapacityComposition.map(s => s.garmentType);
  const refTypes = updated.designStyleAuthority.referenceComposition.garmentTypes;
  
  // Should be in STYLE_BASE_GARMENT_TYPES order: shirt, trouser, dress, kaftan
  const expectedOrder = ["shirt", "trouser", "dress", "kaftan"];
  assert.deepEqual(fabricTypes, expectedOrder, "fabricCapacityComposition should be in canonical order");
  assert.deepEqual(refTypes, expectedOrder, "referenceComposition should be in canonical order");
  
  console.log("PASS: Garment order follows STYLE_BASE_GARMENT_TYPES canonical order");
}

console.log("\n=== Test 8: Adding garment to style with existing referenceComposition ===");
{
  const style = createBaseStyle({
    fabricCapacityComposition: [
      createStyleBaseGarmentSpec("shirt"),
      createStyleBaseGarmentSpec("trouser"),
    ],
  });
  const projection = createAdminProjection(style, {
    status: "known",
    garmentTypes: ["shirt", "trouser"],
  });
  
  // Add "kaftan"
  const updated = toggleUnifiedStyleGarmentType(projection, "kaftan");
  
  const fabricTypes = updated.fabricCapacityComposition.map(s => s.garmentType);
  const refTypes = updated.designStyleAuthority.referenceComposition.garmentTypes;
  
  const expectedOrder = ["shirt", "trouser", "kaftan"];
  assert.deepEqual(fabricTypes, expectedOrder, "fabricCapacityComposition should include new garment");
  assert.deepEqual(refTypes, expectedOrder, "referenceComposition should include new garment");
  
  console.log("PASS: Adding to existing referenceComposition works correctly");
}

console.log("\n=== Test 9: Syncing an untouched legacy style promotes referenceComposition to known ===");
{
  const style = createBaseStyle({
    fabricCapacityComposition: [
      createStyleBaseGarmentSpec("trouser"),
      createStyleBaseGarmentSpec("shirt"),
      createStyleBaseGarmentSpec("full_length_gown"),
    ],
  });
  const projection = createAdminProjection(style, {
    status: "legacy_unresolved",
    garmentTypes: [],
  });

  const synced = syncUnifiedStyleGarmentComposition(projection);
  assert.deepEqual(
    synced.fabricCapacityComposition.map((s) => ({
      garmentType: s.garmentType,
      fabricUnits: s.fabricUnits,
    })),
    [
      { garmentType: "shirt", fabricUnits: 1 },
      { garmentType: "trouser", fabricUnits: 1 },
      { garmentType: "full_length_gown", fabricUnits: 2 },
    ],
    "fabricCapacityComposition should preserve 1-unit and 2-unit specs in canonical order",
  );
  assert.deepEqual(
    synced.designStyleAuthority.referenceComposition,
    {
      status: "known",
      garmentTypes: ["shirt", "trouser", "full_length_gown"],
    },
    "referenceComposition should be promoted to known with canonical garmentTypes",
  );
  console.log("PASS: Untouched legacy style syncs both fields cleanly on save");
}

console.log("\n=== All tests passed! ===");