/**
 * Step 4 sleeve split: men choose Short or Long Sleeve, women choose
 * Mid Sleeve and Long Sleeve at the same price, and a saved Mid-to-Long
 * Sleeve value resolves to Long Sleeve.
 */
import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { inspectCustomDetailCatalog, normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { projectFutureCustomDetailsCatalogue } from "./src/utils/futureCustomDetailsCatalogue";
import {
  reconcileGarmentScopedCustomDetails,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { createEmptyGarmentScopedCustomDetailsState } from "./src/utils/garmentScopedCustomDetailsState";
import {
  reconcileGarmentTypeStepSelection,
  selectGarmentConstructionOption,
} from "./src/utils/garmentTypeStepState";
import {
  DRESS_LONG_LENGTH_MID_OR_LONG_SLEEVE_PRICE_CENTS,
  DRESS_STANDARD_MID_OR_LONG_SLEEVE_PRICE_CENTS,
  LEGACY_MID_TO_LONG_SLEEVE_VALUE,
  SHIRT_LONG_LENGTH_LONG_SLEEVE_PRICE_CENTS,
  SHIRT_STANDARD_LONG_SLEEVE_PRICE_CENTS,
  resolveLegacySleeveConstructionOptionId,
} from "./src/utils/sleeveConstruction";
import type { GarmentConstructionPricingResolution } from "./src/types";

const catalogInspection = inspectCustomDetailCatalog([]);
const catalog = catalogInspection.activeOptions;

const option = (id: string) => {
  const found = catalog.find((candidate) => candidate.id === id);
  assert.ok(found, id);
  return found;
};

const dressCatalogueIds = (garmentTypes: Array<"dress" | "full_length_gown" | "shirt" | "kaftan">, demographic: "female" | "male") => {
  const garmentTypeSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: demographic,
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  const reconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    catalogInspection,
    existingState: createEmptyGarmentScopedCustomDetailsState(),
  });
  return projectFutureCustomDetailsCatalogue({
    garmentTypeSelection,
    reconciliation,
    activeOptions: catalog,
    additionalGarments: [],
  }).coreGroups.find((group) =>
    group.selectionGroup === (demographic === "male" ? "shirt_construction" : "dress_construction"),
  )!.options;
};

{
  const shirts = dressCatalogueIds(["shirt", "kaftan"], "male");
  const standard = shirts.filter((entry) => entry.id.startsWith("shirt_std_"));
  const long = shirts.filter((entry) => entry.id.startsWith("shirt_long_"));
  assert.deepEqual(standard.map((entry) => entry.label), [
    "Standard Length Shirt, Short Sleeve",
    "Standard Length Shirt, Long Sleeve",
  ]);
  assert.deepEqual(long.map((entry) => entry.label), [
    "Long Length Shirt, Short Sleeve",
    "Long Length Shirt, Long Sleeve",
  ]);
  assert.equal(standard[1]!.id, "shirt_std_midlong");
  assert.equal(standard[1]!.priceCents, SHIRT_STANDARD_LONG_SLEEVE_PRICE_CENTS);
  assert.equal(long[1]!.priceCents, SHIRT_LONG_LENGTH_LONG_SLEEVE_PRICE_CENTS);
  assert.equal(shirts.some((entry) => /Mid Sleeve|Mid-Long|Mid-to-Long/.test(entry.label)), false);
}

{
  const dresses = dressCatalogueIds(["dress", "full_length_gown"], "female");
  assert.deepEqual(dresses.map((entry) => entry.id), [
    "dress_std_sleeveless",
    "dress_std_short",
    "dress_std_mid",
    "dress_std_long",
    "dress_long_sleeveless",
    "dress_long_short",
    "dress_long_mid",
    "dress_long_long",
  ]);
  const standardMid = dresses.find((entry) => entry.id === "dress_std_mid")!;
  const standardLong = dresses.find((entry) => entry.id === "dress_std_long")!;
  const longMid = dresses.find((entry) => entry.id === "dress_long_mid")!;
  const longLong = dresses.find((entry) => entry.id === "dress_long_long")!;
  assert.equal(standardMid.label, "Standard Length, Mid Sleeve");
  assert.equal(standardLong.label, "Standard Length, Long Sleeve");
  assert.equal(standardMid.priceCents, DRESS_STANDARD_MID_OR_LONG_SLEEVE_PRICE_CENTS);
  assert.equal(standardLong.priceCents, standardMid.priceCents);
  assert.equal(longMid.priceCents, DRESS_LONG_LENGTH_MID_OR_LONG_SLEEVE_PRICE_CENTS);
  assert.equal(longLong.priceCents, longMid.priceCents);
  assert.equal(option("dress_std_midlong").priceCents, standardLong.priceCents);
  assert.equal(option("dress_long_midlong").priceCents, longLong.priceCents);
}

{
  const overridden = normalizeCustomDetailCatalog([
    { ...option("shirt_std_midlong"), label: "Standard Length Shirt, Mid-to-Long Sleeve" },
    { ...option("dress_std_midlong"), label: "Standard Length, Mid (3-Quarter) / Long Sleeve" },
  ]);
  assert.equal(
    overridden.find((entry) => entry.id === "shirt_std_midlong")?.label,
    "Standard Length Shirt, Long Sleeve",
  );
  assert.equal(
    overridden.find((entry) => entry.id === "dress_std_midlong")?.label,
    "Standard Length, Long Sleeve",
  );
}

const restore = (
  garmentType: "shirt" | "dress" | "kaftan" | "full_length_gown",
  demographic: "male" | "female",
  optionId: string,
  componentKey: string,
) => {
  const selection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: [garmentType],
    selectedDemographic: demographic,
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  const saved = structuredClone(selection);
  const resolution = saved.constructionByGarment[garmentType];
  assert.equal(resolution?.status, "resolved");
  if (resolution?.status !== "resolved") throw new Error("unresolved");
  resolution.components[0] = {
    ...resolution.components[0]!,
    optionId,
    componentKey,
    priceCents: 1,
    price: 0.01,
  };
  resolution.totalPriceCents = 1;
  resolution.totalPrice = 0.01;
  return reconcileGarmentTypeStepSelection({
    persistedSelection: saved,
    normalizedCustomDetailCatalog: catalog,
  }).selection.constructionByGarment[garmentType] as GarmentConstructionPricingResolution;
};

{
  const restored = restore(
    "dress",
    "female",
    "dress_std_midlong",
    "dress:dress_construction:dress_std_midlong",
  );
  assert.equal(restored.status, "resolved");
  if (restored.status !== "resolved") throw new Error("unresolved");
  assert.equal(restored.components[0]!.optionId, "dress_std_long");
  assert.equal(restored.totalPriceCents, DRESS_STANDARD_MID_OR_LONG_SLEEVE_PRICE_CENTS);
}

{
  const restored = restore(
    "full_length_gown",
    "female",
    LEGACY_MID_TO_LONG_SLEEVE_VALUE,
    "full_length_gown:dress_construction:dress_long_midlong",
  );
  assert.equal(restored.status, "resolved");
  if (restored.status !== "resolved") throw new Error("unresolved");
  assert.equal(restored.components[0]!.optionId, "dress_long_long");
  assert.equal(restored.totalPriceCents, DRESS_LONG_LENGTH_MID_OR_LONG_SLEEVE_PRICE_CENTS);
}

{
  const restored = restore(
    "shirt",
    "male",
    LEGACY_MID_TO_LONG_SLEEVE_VALUE,
    "shirt:shirt_construction:shirt_std_midlong",
  );
  assert.equal(restored.status, "resolved");
  if (restored.status !== "resolved") throw new Error("unresolved");
  assert.equal(restored.components[0]!.optionId, "shirt_std_midlong");
  assert.equal(restored.totalPriceCents, SHIRT_STANDARD_LONG_SLEEVE_PRICE_CENTS);
  assert.equal(option("shirt_std_midlong").label, "Standard Length Shirt, Long Sleeve");
}

{
  assert.equal(resolveLegacySleeveConstructionOptionId("shirt_std_short"), "shirt_std_short");
  assert.equal(resolveLegacySleeveConstructionOptionId("dress_std_mid"), "dress_std_mid");
  assert.equal(resolveLegacySleeveConstructionOptionId("dress_long_midlong"), "dress_long_long");
}

{
  const selection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["dress", "full_length_gown"],
    selectedDemographic: "female",
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  for (const [garmentType, optionId, priceCents] of [
    ["dress", "dress_std_mid", DRESS_STANDARD_MID_OR_LONG_SLEEVE_PRICE_CENTS],
    ["dress", "dress_std_long", DRESS_STANDARD_MID_OR_LONG_SLEEVE_PRICE_CENTS],
    ["full_length_gown", "dress_long_mid", DRESS_LONG_LENGTH_MID_OR_LONG_SLEEVE_PRICE_CENTS],
    ["full_length_gown", "dress_long_long", DRESS_LONG_LENGTH_MID_OR_LONG_SLEEVE_PRICE_CENTS],
  ] as const) {
    const selected = selectGarmentConstructionOption({
      resolution: selection.constructionByGarment[garmentType]!,
      selectionGroup: "dress_construction",
      optionId,
      normalizedCustomDetailCatalog: catalog,
    });
    assert.equal(selected.status, "selected", optionId);
    if (selected.status !== "selected" || selected.resolution.status !== "resolved") {
      assert.fail(`${optionId} did not resolve`);
    }
    assert.equal(selected.resolution.components[0]!.optionId, optionId);
    assert.equal(selected.resolution.totalPriceCents, priceCents);
  }
}

assert.equal(
  SEED_CUSTOM_DETAIL_CATALOG.some((entry) => /Mid-to-Long Sleeve|Mid-Long Sleeve|3-Quarter/.test(entry.label)),
  false,
);

console.log("PASS: Step 4 sleeve split");
