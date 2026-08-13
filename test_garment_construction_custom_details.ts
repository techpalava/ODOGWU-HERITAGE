import assert from "node:assert/strict";
import type {
  BusinessSettings,
  CanonicalPhysicalGarmentType,
  CustomDetailSelectionGroup,
  DesignSelections,
} from "./src/types";
import { DRESS_LINING_OPTION_ID } from "./src/config/GarmentDetailsConfig";
import {
  normalizeCustomDetailCatalog,
  type ApplicableCustomDetailGroup,
} from "./src/utils/catalogHelpers";
import {
  cleanupLockedGarmentConstructionSelections,
  normalizeGarmentConstructionSelectionMode,
  projectGarmentConstructionCustomDetails,
  resolveLockedGarmentConstructionBridge,
} from "./src/utils/garmentConstructionCustomDetails";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { calculateDesignPricing } from "./src/utils/designPricing";

const catalog = normalizeCustomDetailCatalog([]);
const selectionFor = (
  garmentTypes: CanonicalPhysicalGarmentType[],
  sourceCatalog = catalog,
) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    normalizedCustomDetailCatalog: sourceCatalog,
  }).selection;

const groupsFor = (
  groupIds: CustomDetailSelectionGroup[],
): ApplicableCustomDetailGroup[] =>
  groupIds.map((id) => {
    const options = catalog.filter((option) => option.selectionGroup === id);
    assert.ok(options.length > 0, `Expected catalog options for ${id}`);
    return { id, garmentGroup: options[0].garmentGroup, options };
  });

const baseSelections: DesignSelections = {
  customDetails: {
    shirt_construction: "shirt_std_short",
    shirt_pockets: "shirt_pocket_0",
    neck_design: "neck_no_round",
    dress_additional: [DRESS_LINING_OPTION_ID],
  },
};
const applicable = groupsFor([
  "shirt_construction",
  "shirt_pockets",
  "neck_design",
  "dress_additional",
]);
const shirtSelection = selectionFor(["shirt"]);

assert.equal(
  normalizeGarmentConstructionSelectionMode(undefined),
  "legacy_custom_details",
);
assert.equal(
  normalizeGarmentConstructionSelectionMode("unexpected"),
  "legacy_custom_details",
);

const legacyProjection = projectGarmentConstructionCustomDetails({
  catalog,
  applicableGroups: applicable,
  requiredSelectionGroups: ["shirt_construction", "shirt_pockets"],
  selections: baseSelections,
  garmentTypeSelection: shirtSelection,
});
assert.equal(legacyProjection.mode, "legacy_custom_details");
assert.equal(legacyProjection.editableGroups, applicable);
assert.equal(legacyProjection.cleanedSelections, baseSelections);
assert.deepEqual(legacyProjection.lockedSelectionGroups, []);
assert.deepEqual(legacyProjection.removedStaleOptionIds, []);

const lockedProjection = projectGarmentConstructionCustomDetails({
  mode: "garment_type_locked",
  catalog,
  applicableGroups: applicable,
  requiredSelectionGroups: ["shirt_construction", "shirt_pockets"],
  selections: baseSelections,
  garmentTypeSelection: shirtSelection,
});
assert.deepEqual(
  lockedProjection.editableGroups.map((group) => group.id),
  ["shirt_pockets", "neck_design", "dress_additional"],
);
assert.deepEqual(lockedProjection.requiredEditableGroups, ["shirt_pockets"]);
assert.equal(lockedProjection.isComplete, true);
assert.equal(lockedProjection.readOnlyConstructionRows.length, 1);
assert.equal(lockedProjection.readOnlyConstructionRows[0].label, "Shirt construction");
assert.equal(lockedProjection.readOnlyConstructionRows[0].price, 65);
assert.equal(
  lockedProjection.readOnlyConstructionRows[0].sourceLabel,
  "Included from Garment Type",
);
assert.deepEqual(lockedProjection.removedStaleOptionIds, ["shirt_std_short"]);
assert.equal(
  lockedProjection.cleanedSelections.customDetails?.shirt_construction,
  undefined,
);
assert.equal(
  lockedProjection.cleanedSelections.customDetails?.dress_additional?.[0],
  DRESS_LINING_OPTION_ID,
);
assert.equal(baseSelections.customDetails?.shirt_construction, "shirt_std_short");

const cleanupInput: DesignSelections = {
  customDetails: {
    shirt_construction: "shirt_std_short",
    shirt_additional: "nonconstruction_same_price",
  },
  customDetailSnapshots: [
    {
      optionId: "shirt_std_short",
      label: "Standard shirt",
      description: "",
      garmentGroup: "shirt",
      selectionGroup: "shirt_construction",
      priceCents: 6500,
    },
    {
      optionId: "nonconstruction_same_price",
      label: "Unrelated customization",
      description: "",
      garmentGroup: "shirt",
      selectionGroup: "shirt_additional",
      priceCents: 6500,
    },
  ],
};
const cleanupResult = cleanupLockedGarmentConstructionSelections(
  cleanupInput,
  ["shirt_construction", "shirt_additional"],
);
assert.deepEqual(cleanupResult.removedOptionIds, ["shirt_std_short"]);
assert.equal(
  cleanupResult.selections.customDetails?.shirt_additional,
  "nonconstruction_same_price",
);
assert.equal(cleanupResult.selections.customDetailSnapshots?.length, 1);
assert.equal(cleanupInput.customDetailSnapshots?.length, 2);

const missingOtherRequirement = projectGarmentConstructionCustomDetails({
  mode: "garment_type_locked",
  catalog,
  applicableGroups: applicable,
  requiredSelectionGroups: [
    "shirt_construction",
    "shirt_pockets",
    "neck_design",
  ],
  selections: {
    customDetails: { shirt_construction: "shirt_std_short" },
  },
  garmentTypeSelection: shirtSelection,
});
assert.deepEqual(missingOtherRequirement.missingRequiredGroups, [
  "shirt_pockets",
  "neck_design",
]);
assert.equal(missingOtherRequirement.isComplete, false);

const shortsProjection = projectGarmentConstructionCustomDetails({
  mode: "garment_type_locked",
  catalog,
  applicableGroups: groupsFor([
    "standard_shorts_fastening",
    "standard_shorts_pockets",
    "standard_shorts_additional",
    "bum_shorts_fastening",
    "bum_shorts_pockets",
    "bum_shorts_additional",
  ]),
  requiredSelectionGroups: [],
  selections: {},
  garmentTypeSelection: selectionFor(["standard_shorts", "bum_shorts"]),
});
assert.deepEqual(
  shortsProjection.editableGroups.map((group) => group.id),
  [
    "standard_shorts_pockets",
    "standard_shorts_additional",
    "bum_shorts_pockets",
    "bum_shorts_additional",
  ],
);

const inactiveShirtCatalog = catalog.map((option) =>
  option.selectionGroup === "shirt_construction"
    ? { ...option, active: false }
    : option,
);
const unresolvedProjection = projectGarmentConstructionCustomDetails({
  mode: "garment_type_locked",
  catalog: inactiveShirtCatalog,
  applicableGroups: applicable,
  requiredSelectionGroups: [],
  selections: {},
  garmentTypeSelection: selectionFor(["shirt"], inactiveShirtCatalog),
});
assert.deepEqual(unresolvedProjection.completionBlockers, ["shirt"]);
assert.equal(unresolvedProjection.isComplete, false);

const combinedSelection = selectionFor([
  "shirt",
  "trouser",
  "kaftan",
  "agbada",
]);
const combinedBridge = resolveLockedGarmentConstructionBridge({
  mode: "garment_type_locked",
  garmentTypeSelection: combinedSelection,
  catalog,
  selections: baseSelections,
});
assert.deepEqual(
  combinedBridge.readOnlyConstructionRows.map((row) => [
    row.garmentType,
    row.price,
  ]),
  [
    ["shirt", 65],
    ["trouser", 75],
    ["kaftan", 65],
    ["agbada", 140],
  ],
);
assert.equal(
  combinedBridge.readOnlyConstructionRows.find(
    (row) => row.garmentType === "agbada",
  )?.components.length,
  2,
);
assert.equal(
  combinedBridge.readOnlyConstructionRows.filter((row) =>
    row.components.some((component) => component.optionId === "shirt_std_short"),
  ).length,
  3,
);

const repricedCatalog = catalog.map((option) =>
  option.id === "shirt_std_short"
    ? { ...option, priceCents: 6600 }
    : option,
);
const repricedBridge = resolveLockedGarmentConstructionBridge({
  mode: "garment_type_locked",
  garmentTypeSelection: shirtSelection,
  catalog: repricedCatalog,
  selections: {},
});
assert.equal(repricedBridge.readOnlyConstructionRows[0].price, 66);

const businessSettings = {
  pricingSettings: { standardAccessoryCharge: 10 },
} as BusinessSettings;
const lockedPricing = calculateDesignPricing({
  route: "community",
  design: baseSelections,
  allowUnresolvedMaterialPricing: true,
  catalog,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection: combinedSelection,
});
assert.ok(lockedPricing);
assert.equal(lockedPricing.baseGarmentPricingStatus, "resolved");
assert.equal(lockedPricing.clothingPrice, 345);
assert.equal(lockedPricing.constructionUpgradesPrice, 10);
assert.equal(lockedPricing.customDetailsPrice, 10);
assert.equal(lockedPricing.garmentSubtotal, 355);

const individualLockedPricing = calculateDesignPricing({
  route: "alone",
  design: baseSelections,
  allowUnresolvedMaterialPricing: true,
  catalog,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection: combinedSelection,
});
assert.ok(individualLockedPricing);
assert.equal(individualLockedPricing.clothingPrice, 345);
assert.equal(individualLockedPricing.constructionSewingCost, 23.44);

const legacyPricingOmitted = calculateDesignPricing({
  route: "community",
  design: baseSelections,
  allowUnresolvedMaterialPricing: true,
  catalog,
  businessSettings,
});
const legacyPricingExplicit = calculateDesignPricing({
  route: "community",
  design: baseSelections,
  allowUnresolvedMaterialPricing: true,
  catalog,
  businessSettings,
  garmentConstructionSelectionMode: "legacy_custom_details",
  garmentTypeSelection: combinedSelection,
});
assert.deepEqual(legacyPricingOmitted, legacyPricingExplicit);
assert.deepEqual(
  combinedSelection,
  selectionFor(["shirt", "trouser", "kaftan", "agbada"]),
);

const unresolvedPricing = calculateDesignPricing({
  route: "community",
  design: {},
  allowUnresolvedMaterialPricing: true,
  catalog: inactiveShirtCatalog,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection: selectionFor(["shirt"], inactiveShirtCatalog),
});
assert.ok(unresolvedPricing);
assert.equal(unresolvedPricing.baseGarmentPricingStatus, "unresolved");
assert.deepEqual(unresolvedPricing.unresolvedBaseGarmentTypes, ["shirt"]);

console.log("Garment construction Custom Details bridge verification passed.");
