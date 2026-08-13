import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { FABRIC_APPEND_GARMENT_CHOICES } from "./src/engine/FabricCapacityEngine";
import type {
  CustomDetailOption,
  FabricGarmentType,
  StyleCategory,
} from "./src/types";
import {
  getApplicableCustomDetailGroups,
  normalizeCustomDetailCatalog,
} from "./src/utils/catalogHelpers";
import {
  CANONICAL_PHYSICAL_GARMENT_TYPES,
  resolveGarmentConstructionPricing,
} from "./src/utils/garmentConstructionPricing";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const expectedGarments = [
  "shirt",
  "trouser",
  "skirt",
  "standard_shorts",
  "bum_shorts",
  "dress",
  "kaftan",
  "full_length_gown",
  "agbada",
] as const satisfies readonly FabricGarmentType[];

assert.deepEqual(CANONICAL_PHYSICAL_GARMENT_TYPES, expectedGarments);
assert.equal(
  FABRIC_APPEND_GARMENT_CHOICES.map((choice) => String(choice.id)).includes(
    "agbada",
  ),
  false,
  "Agbada remains a base garment without becoming optionally appendable",
);

const expectedDefaults: Record<
  (typeof expectedGarments)[number],
  { optionIds: string[]; totalPriceCents: number }
> = {
  shirt: { optionIds: ["shirt_std_short"], totalPriceCents: 6500 },
  trouser: { optionIds: ["trouser_rope"], totalPriceCents: 7500 },
  skirt: { optionIds: ["skirt_std"], totalPriceCents: 7500 },
  standard_shorts: {
    optionIds: ["shorts_std_rope"],
    totalPriceCents: 7000,
  },
  bum_shorts: { optionIds: ["bum_rope"], totalPriceCents: 7000 },
  dress: { optionIds: ["dress_std_sleeveless"], totalPriceCents: 7000 },
  kaftan: { optionIds: ["shirt_std_short"], totalPriceCents: 6500 },
  full_length_gown: {
    optionIds: ["dress_long_short"],
    totalPriceCents: 7500,
  },
  agbada: {
    optionIds: ["shirt_std_short", "trouser_rope"],
    totalPriceCents: 14000,
  },
};

for (const garmentType of expectedGarments) {
  const result = resolveGarmentConstructionPricing(garmentType, catalog);
  assert.equal(result.status, "resolved", `${garmentType} must resolve`);
  if (result.status !== "resolved") continue;
  assert.deepEqual(
    result.components.map((component) => component.optionId),
    expectedDefaults[garmentType].optionIds,
  );
  assert.equal(
    result.totalPriceCents,
    expectedDefaults[garmentType].totalPriceCents,
  );
}

const femaleShirtStyle: StyleCategory = {
  id: "female-shirt-demographic-check",
  name: "Female Shirt",
  description: "Demographic applicability fixture",
  gender: "female",
  targetDemographic: "female",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
};
const maleOnlyFixture: CustomDetailOption = {
  ...catalog.find((option) => option.id === "shirt_std_short")!,
  id: "male_only_demographic_fixture",
  label: "Male-only demographic fixture",
  eligibleDemographics: ["male"],
};
assert.equal(
  resolveGarmentConstructionPricing("shirt", catalog).status,
  "resolved",
  "Step 1 construction resolution deliberately ignores demographic eligibility",
);
assert.equal(
  getApplicableCustomDetailGroups(femaleShirtStyle, [
    ...catalog,
    maleOnlyFixture,
  ]).some(
    (option) => option.id === maleOnlyFixture.id,
  ),
  false,
  "Normal Custom Details must continue enforcing demographic applicability",
);

const withOption = (
  source: readonly CustomDetailOption[],
  optionId: string,
  update: Partial<CustomDetailOption>,
): CustomDetailOption[] =>
  source.map((option) =>
    option.id === optionId ? { ...option, ...update } : { ...option },
  );

const reordered = normalizeCustomDetailCatalog([
  { id: "shirt_std_short", displayOrder: 20, priceCents: 6500 },
  { id: "shirt_std_midlong", displayOrder: 10, priceCents: 7000 },
]);
const reorderedResult = resolveGarmentConstructionPricing("shirt", reordered);
assert.equal(reorderedResult.status, "resolved");
if (reorderedResult.status === "resolved") {
  assert.equal(
    reorderedResult.components[0]?.optionId,
    "shirt_std_midlong",
    "Admin displayOrder must override the legacy static option-ID order",
  );
  assert.equal(
    reorderedResult.totalPriceCents,
    7000,
    "The resolver must choose configured order rather than the cheapest option",
  );
}

const tiedLegacyOrder = withOption(
  withOption(catalog, "shirt_std_short", { displayOrder: 0 }),
  "shirt_std_midlong",
  { displayOrder: 0 },
);
const tiedResult = resolveGarmentConstructionPricing("shirt", tiedLegacyOrder);
assert.equal(tiedResult.status, "resolved");
if (tiedResult.status === "resolved") {
  assert.equal(
    tiedResult.components[0]?.optionId,
    "shirt_std_short",
    "Static option-ID ordering remains the deterministic fallback for ties",
  );
}

const repricedCatalog = withOption(catalog, "shirt_std_short", {
  priceCents: 6900,
});
const repricedShirt = resolveGarmentConstructionPricing(
  "shirt",
  repricedCatalog,
);
const repricedAgbada = resolveGarmentConstructionPricing(
  "agbada",
  repricedCatalog,
);
assert.equal(
  repricedShirt.status === "resolved" ? repricedShirt.totalPriceCents : null,
  6900,
);
assert.equal(
  repricedAgbada.status === "resolved" ? repricedAgbada.totalPriceCents : null,
  14400,
  "Agbada must derive its total from current component prices",
);

const zeroConstruction: CustomDetailOption = {
  ...catalog.find((option) => option.id === "shirt_std_short")!,
  id: "zero_cost_construction_fixture",
  label: "Zero-cost decoration",
  selectionGroup: "shirt_construction",
  priceCents: 0,
  displayOrder: 1,
};
const decorativeOption: CustomDetailOption = {
  ...zeroConstruction,
  id: "decorative_fixture",
  label: "Decorative fixture",
  selectionGroup: "shirt_pockets",
  displayOrder: 0,
};
const filteredResult = resolveGarmentConstructionPricing("shirt", [
  zeroConstruction,
  decorativeOption,
  ...catalog,
]);
assert.equal(filteredResult.status, "resolved");
if (filteredResult.status === "resolved") {
  assert.equal(filteredResult.components[0]?.optionId, "shirt_std_short");
}

const missingShirtPricing = catalog.filter(
  (option) => option.selectionGroup !== "shirt_construction",
);
const missingResult = resolveGarmentConstructionPricing(
  "shirt",
  missingShirtPricing,
);
assert.deepEqual(missingResult, {
  status: "unresolved",
  garmentType: "shirt",
  code: "missing_catalog_option",
  selectionGroup: "shirt_construction",
});

const unsupportedResult = resolveGarmentConstructionPricing("other", catalog);
assert.equal(unsupportedResult.status, "unresolved");
if (unsupportedResult.status === "unresolved") {
  assert.equal(unsupportedResult.code, "unsupported_garment");
}

const shirt = resolveGarmentConstructionPricing("shirt", catalog);
const kaftan = resolveGarmentConstructionPricing("kaftan", catalog);
assert.equal(shirt.status, "resolved");
assert.equal(kaftan.status, "resolved");
if (shirt.status === "resolved" && kaftan.status === "resolved") {
  assert.equal(shirt.components[0]?.optionId, kaftan.components[0]?.optionId);
  assert.notEqual(
    shirt.components[0]?.componentKey,
    kaftan.components[0]?.componentKey,
    "Shared source options must retain garment-specific component identity",
  );
}

console.log("Garment construction pricing resolver verification passed.");
