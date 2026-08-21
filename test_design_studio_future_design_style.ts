import assert from "node:assert/strict";
import {
  reconcileFutureDesignStyleSelection,
  resolveFutureDesignStyleCompatibility,
} from "./src/utils/designStudioFutureDesignStyle";
import type {
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: GarmentTypeStepSelection["demographic"],
  demographics?: NonNullable<
    GarmentTypeStepSelection["audienceSelection"]
  >["demographics"],
): GarmentTypeStepSelection => ({
  garmentTypes,
  ...(demographics
    ? { audienceSelection: { schemaVersion: 1, demographics } }
    : {}),
  demographic,
  constructionByGarment: {},
});

const style = (
  overrides: Partial<StyleCategory> = {},
): StyleCategory => ({
  id: "shirt-trouser-style",
  name: "Structured Set",
  description: "Canonical metadata fixture",
  gender: "male",
  options: [],
  targetDemographic: "male",
  fabricCapacityComposition: [
    { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    { key: "base:trouser", garmentType: "trouser", fabricUnits: 1 },
  ],
  ...overrides,
});

const selectedGarments = selection(["shirt", "trouser"], "male");
const compatibleStyle = style();
assert.equal(
  resolveFutureDesignStyleCompatibility({
    garmentTypeSelection: selectedGarments,
    style: compatibleStyle,
  }).status,
  "compatible",
);

const shirtOnly = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: selection(["shirt"], "male"),
  style: compatibleStyle,
});
assert.equal(shirtOnly.status, "compatible");

const trouserOnly = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: selection(["trouser"], "male"),
  style: compatibleStyle,
});
assert.equal(trouserOnly.status, "compatible");

const unsupportedCombination = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: selection(["shirt", "skirt"], "male"),
  style: compatibleStyle,
});
assert.equal(unsupportedCombination.status, "incompatible");
assert.equal(
  unsupportedCombination.code,
  "GARMENT_COMPOSITION_MISMATCH",
);
assert.equal(
  unsupportedCombination.customerReason,
  "This design does not support Skirt.",
);

const unsupportedGarment = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: selection(["standard_shorts"], "male"),
  style: compatibleStyle,
});
assert.equal(unsupportedGarment.status, "incompatible");

const incompatibleDemographic = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: selection(["shirt", "trouser"], "female"),
  style: compatibleStyle,
});
assert.equal(incompatibleDemographic.status, "incompatible");
assert.equal(incompatibleDemographic.code, "DEMOGRAPHIC_MISMATCH");

const malformedAudience = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: {
    ...selection(["shirt"], "male"),
    audienceSelection: {
      schemaVersion: 1,
      demographics: ["male", "unknown"] as unknown as NonNullable<
        GarmentTypeStepSelection["audienceSelection"]
      >["demographics"],
    },
  },
  style: compatibleStyle,
});
assert.equal(malformedAudience.status, "incompatible");
assert.equal(malformedAudience.code, "DEMOGRAPHIC_MISMATCH");

const noStructuredComposition = style({
  id: "words-must-not-drive-compatibility",
  name: "Male Shirt and Trouser",
  description: "A matching shirt and trouser design",
  garmentComposition: "Shirt + Trouser",
  outfitType: "Two Piece",
  fabricCapacityComposition: undefined,
});
const indeterminate = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: selectedGarments,
  style: noStructuredComposition,
});
assert.equal(indeterminate.status, "indeterminate");
assert.equal(indeterminate.code, "STYLE_COMPOSITION_MISSING");

const missingDemographic = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: selectedGarments,
  style: style({
    gender: undefined as unknown as StyleCategory["gender"],
    targetDemographic: undefined,
  }),
});
assert.equal(missingDemographic.status, "indeterminate");
assert.equal(missingDemographic.code, "STYLE_DEMOGRAPHIC_MISSING");

const stableIdBridge = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: selection(["shirt"], "male"),
  style: style({
    id: "royal-senator-1",
    fabricCapacityComposition: undefined,
  }),
});
assert.equal(stableIdBridge.status, "compatible");

const disabled = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: selectedGarments,
  style: { ...compatibleStyle, isActive: false } as StyleCategory,
});
assert.equal(disabled.code, "STYLE_DISABLED");

const selected = reconcileFutureDesignStyleSelection({
  selectedStyleId: compatibleStyle.id,
  styles: [compatibleStyle],
  garmentTypeSelection: selectedGarments,
});
assert.equal(selected.status, "selected");
assert.equal(selected.selectedStyle, compatibleStyle);

const stillCompatibleAfterStepOneChange = reconcileFutureDesignStyleSelection({
  selectedStyleId: compatibleStyle.id,
  styles: [compatibleStyle],
  garmentTypeSelection: selection(["trouser", "shirt"], "male"),
});
assert.equal(stillCompatibleAfterStepOneChange.status, "selected");

const needsReselectionAfterStepOneChange =
  reconcileFutureDesignStyleSelection({
    selectedStyleId: compatibleStyle.id,
    styles: [compatibleStyle],
    garmentTypeSelection: selection(["shirt", "skirt"], "male"),
  });
assert.equal(needsReselectionAfterStepOneChange.status, "reselection_required");
assert.equal(
  needsReselectionAfterStepOneChange.selectedStyleId,
  compatibleStyle.id,
);

const refreshedAdminStyle = style({ targetDemographic: "female", gender: "female" });
const refreshed = reconcileFutureDesignStyleSelection({
  selectedStyleId: compatibleStyle.id,
  styles: [refreshedAdminStyle],
  garmentTypeSelection: selectedGarments,
});
assert.equal(refreshed.status, "reselection_required");
assert.equal(refreshed.selectedStyle, refreshedAdminStyle);

const deleted = reconcileFutureDesignStyleSelection({
  selectedStyleId: compatibleStyle.id,
  styles: [],
  garmentTypeSelection: selectedGarments,
});
assert.equal(deleted.status, "reselection_required");
assert.equal(deleted.compatibility?.code, "STYLE_ID_MISSING");

const allCanonicalGarments: GarmentTypeStepSelection["garmentTypes"] = [
  "shirt",
  "trouser",
  "skirt",
  "standard_shorts",
  "bum_shorts",
  "dress",
  "kaftan",
  "full_length_gown",
  "agbada",
];
const allGarmentStyle = style({
  id: "all-canonical-garments",
  gender: "family",
  targetDemographic: "unisex",
  fabricCapacityComposition: allCanonicalGarments.map((garmentType) => ({
    key: `base:${garmentType}`,
    garmentType,
    fabricUnits:
      garmentType === "full_length_gown" ||
      garmentType === "agbada"
        ? 2
        : 1,
  })),
});
allCanonicalGarments.forEach((garmentType) => {
  assert.equal(
    resolveFutureDesignStyleCompatibility({
      garmentTypeSelection: selection([garmentType], "unisex"),
      style: allGarmentStyle,
    }).status,
    "compatible",
    `${garmentType} should use its canonical identity in subset matching`,
  );
});

assert.equal(
  resolveFutureDesignStyleCompatibility({
    garmentTypeSelection: selection(["agbada"], "male"),
    style: compatibleStyle,
  }).status,
  "incompatible",
  "Agbada must not be reinterpreted as Shirt plus Trouser",
);

assert.equal(
  resolveFutureDesignStyleCompatibility({
    garmentTypeSelection: selection(
      ["shirt"],
      "unisex",
      ["female", "male"],
    ),
    style: compatibleStyle,
  }).status,
  "compatible",
  "A multi-audience selection should match when at least one audience is represented",
);

const duplicateCustomerTypes = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: selection(
    ["shirt", "shirt"] as GarmentTypeStepSelection["garmentTypes"],
    "male",
  ),
  style: compatibleStyle,
});
assert.equal(duplicateCustomerTypes.status, "compatible");

const preservedSelection = selection(["shirt"], "male");
preservedSelection.constructionByGarment.shirt = {
  status: "unresolved",
  garmentType: "shirt",
  code: "missing_catalog_option",
};
const preservedSnapshot = JSON.stringify(preservedSelection);
resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: preservedSelection,
  style: compatibleStyle,
});
assert.equal(
  JSON.stringify(preservedSelection),
  preservedSnapshot,
  "Compatibility checks must not mutate Step 1 construction or garment state",
);

console.log("PASS: future Design Style compatibility and catalogue reconciliation");
