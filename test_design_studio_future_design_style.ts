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
): GarmentTypeStepSelection => ({
  garmentTypes,
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

const incompatibleComposition = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: selection(["shirt"], "male"),
  style: compatibleStyle,
});
assert.equal(incompatibleComposition.status, "incompatible");
assert.equal(incompatibleComposition.code, "GARMENT_COMPOSITION_MISMATCH");

const incompatibleDemographic = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: selection(["shirt", "trouser"], "female"),
  style: compatibleStyle,
});
assert.equal(incompatibleDemographic.status, "incompatible");
assert.equal(incompatibleDemographic.code, "DEMOGRAPHIC_MISMATCH");

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
  garmentTypeSelection: selectedGarments,
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
    garmentTypeSelection: selection(["shirt"], "male"),
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

console.log("PASS: future Design Style compatibility and catalogue reconciliation");
