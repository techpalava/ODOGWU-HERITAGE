import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type {
  GarmentTypeStepSelection,
  GuestDesignDraft,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  DESIGN_STUDIO_NINE_STAGE_FOUNDATION,
  DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
} from "./src/utils/designSourceJourney";
import {
  getGarmentTypeStepControlledState,
  GARMENT_TYPE_AUDIENCE_SCHEMA_VERSION,
  getGarmentTypeCompatibilityDemographic,
  getGarmentTypeSelectedDemographics,
  normalizePersistedGarmentTypeStepSelection,
  reconcileGarmentTypeStepSelection,
  reconcileGuestDesignDraftGarmentTypeSelection,
  reduceGarmentTypeStepSelection,
} from "./src/utils/garmentTypeStepState";
import { CANONICAL_PHYSICAL_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import { buildAuthoritativePhysicalOccurrences } from "./src/utils/designSourceState";
import { resolveMeasurementProfile } from "./src/utils/measurementBlueprint";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const allGarments = [...CANONICAL_PHYSICAL_GARMENT_TYPES];

const initial = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: [
    "agbada",
    "shirt",
    "shirt",
    "other",
    "dress",
    "trouser",
    "full_length_gown",
    "skirt",
    "long_skirt",
    "standard_shorts",
    "bum_shorts",
    "kaftan",
  ],
  selectedDemographic: "unisex",
  normalizedCustomDetailCatalog: catalog,
});
assert.deepEqual(initial.selection.garmentTypes, allGarments);
assert.equal(initial.selection.demographic, "unisex");
assert.deepEqual(initial.selection.audienceSelection, {
  schemaVersion: GARMENT_TYPE_AUDIENCE_SCHEMA_VERSION,
  demographics: ["unisex"],
});
assert.equal(Object.keys(initial.selection.constructionByGarment).length, 10);

const shirt = initial.selection.constructionByGarment.shirt;
const kaftan = initial.selection.constructionByGarment.kaftan;
const longDress = initial.selection.constructionByGarment.full_length_gown;
const standardSkirt = initial.selection.constructionByGarment.skirt;
const longSkirt = initial.selection.constructionByGarment.long_skirt;
assert.equal(shirt?.status, "resolved");
assert.equal(kaftan?.status, "resolved");
assert.equal(longDress?.status, "resolved");
assert.equal(standardSkirt?.status, "resolved");
assert.equal(longSkirt?.status, "resolved");
if (shirt?.status === "resolved" && kaftan?.status === "resolved") {
  assert.equal(shirt.components[0].optionId, "shirt_std_short");
  assert.equal(kaftan.components[0].optionId, "shirt_long_midlong");
  assert.notEqual(shirt.components[0].componentKey, kaftan.components[0].componentKey);
  assert.match(shirt.components[0].componentKey, /^shirt:/);
  assert.match(kaftan.components[0].componentKey, /^kaftan:/);
}

if (longDress?.status === "resolved") {
  assert.equal(longDress.components[0].optionId, "dress_long_short");
  assert.equal(longDress.totalPriceCents, 7500);
}

if (standardSkirt?.status === "resolved" && longSkirt?.status === "resolved") {
  assert.equal(standardSkirt.components[0].optionId, "skirt_std");
  assert.equal(standardSkirt.totalPriceCents, 7500);
  assert.equal(longSkirt.components[0].optionId, "skirt_long");
  assert.equal(longSkirt.totalPriceCents, 8000);
}

const agbada = initial.selection.constructionByGarment.agbada;
assert.equal(agbada?.status, "resolved");
if (agbada?.status === "resolved") {
  assert.deepEqual(
    agbada.components.map((component) => component.optionId),
    ["shirt_std_short", "trouser_rope"],
  );
  assert.equal(agbada.totalPriceCents, 14000);
}

const roundTripped = JSON.parse(
  JSON.stringify(initial.selection),
) as GarmentTypeStepSelection;
const hydrated = reconcileGarmentTypeStepSelection({
  persistedSelection: roundTripped,
  normalizedCustomDetailCatalog: catalog,
});
assert.deepEqual(hydrated.selection.garmentTypes, allGarments);
assert.equal(hydrated.selection.demographic, "unisex");
assert.deepEqual(
  hydrated.selection.constructionByGarment.agbada,
  initial.selection.constructionByGarment.agbada,
);
assert.deepEqual(hydrated.selection.constructionByGarment.skirt, standardSkirt);
assert.deepEqual(hydrated.selection.constructionByGarment.long_skirt, longSkirt);
assert.deepEqual(
  hydrated.selection.constructionByGarment.full_length_gown,
  longDress,
  "Draft hydration must restore Long Dress through its stable garment ID and current canonical construction.",
);

const staleLongDressDraft = structuredClone(initial.selection);
const staleLongDress = staleLongDressDraft.constructionByGarment.full_length_gown;
if (staleLongDress?.status === "resolved") {
  staleLongDress.components[0].optionId = "dress_long_midlong";
  staleLongDress.components[0].componentKey =
    "full_length_gown:dress_construction:dress_long_midlong";
  staleLongDress.components[0].priceCents = 8000;
  staleLongDress.components[0].price = 80;
  staleLongDress.totalPriceCents = 8000;
  staleLongDress.totalPrice = 80;
}
const repairedLongDressDraft = reconcileGarmentTypeStepSelection({
  persistedSelection: staleLongDressDraft,
  normalizedCustomDetailCatalog: catalog,
}).selection.constructionByGarment.full_length_gown;
assert.equal(
  repairedLongDressDraft?.status === "resolved"
    ? repairedLongDressDraft.components[0].optionId
    : null,
  "dress_long_short",
);
assert.equal(
  repairedLongDressDraft?.status === "resolved"
    ? repairedLongDressDraft.totalPriceCents
    : null,
  7500,
  "Hydration must replace a stale €80 Long Dress construction with the canonical €75 option.",
);

const malformedSkirtPair = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["skirt", "long_skirt"],
  selectedDemographic: "female",
  normalizedCustomDetailCatalog: catalog,
}).selection;
assert.ok(standardSkirt?.status === "resolved");
malformedSkirtPair.constructionByGarment.long_skirt = {
  ...standardSkirt,
  garmentType: "long_skirt",
  components: standardSkirt.components.map((component) => ({
    ...component,
    componentKey: `long_skirt:${component.selectionGroup}:${component.optionId}`,
  })),
};
const repairedSkirtPair = reconcileGarmentTypeStepSelection({
  persistedSelection: JSON.parse(JSON.stringify(malformedSkirtPair)),
  normalizedCustomDetailCatalog: catalog,
}).selection;
assert.deepEqual(repairedSkirtPair.constructionByGarment.skirt, standardSkirt);
assert.deepEqual(repairedSkirtPair.constructionByGarment.long_skirt, longSkirt,
  "Malformed long_skirt + skirt_std must repair to the catalogue's skirt_long / EUR80 default.");
const repairedOccurrences = buildAuthoritativePhysicalOccurrences({
  sourceKind: "catalogue",
  step1GarmentTypeSelection: repairedSkirtPair,
  effectiveGarmentTypeSelection: repairedSkirtPair,
});
assert.deepEqual(repairedOccurrences.map((garment) => {
  const result = resolveMeasurementProfile({ garment, garmentTypeSelection: repairedSkirtPair });
  assert.equal(result.status, "resolved");
  return result.status === "resolved"
    ? [garment.garmentKey, result.profile.id, result.constructionOptionId]
    : null;
}), [["base:skirt", "L", "skirt_std"], ["base:long_skirt", "M", "skirt_long"]]);

const deselected = reconcileGarmentTypeStepSelection({
  persistedSelection: initial.selection,
  selectedGarmentTypes: ["shirt", "kaftan"],
  normalizedCustomDetailCatalog: catalog,
});
assert.deepEqual(Object.keys(deselected.selection.constructionByGarment), [
  "shirt",
  "kaftan",
]);
assert.equal(deselected.selection.constructionByGarment.agbada, undefined);

const added = reconcileGarmentTypeStepSelection({
  persistedSelection: deselected.selection,
  selectedGarmentTypes: ["shirt", "kaftan", "trouser"],
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(added.selection.constructionByGarment.trouser?.status, "resolved");

const invalidSavedOption = structuredClone(deselected.selection);
const invalidShirt = invalidSavedOption.constructionByGarment.shirt;
if (invalidShirt?.status === "resolved") {
  invalidShirt.components[0].optionId = "deleted-option";
  invalidShirt.components[0].componentKey = "shirt:shirt_construction:deleted-option";
}
const repaired = reconcileGarmentTypeStepSelection({
  persistedSelection: invalidSavedOption,
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(
  repaired.selection.constructionByGarment.shirt?.status === "resolved"
    ? repaired.selection.constructionByGarment.shirt.components[0].optionId
    : null,
  "shirt_std_short",
);

const disabledCatalog = normalizeCustomDetailCatalog([
  { id: "shirt_std_short", active: false },
]);
const replacedDisabledOption = reconcileGarmentTypeStepSelection({
  persistedSelection: deselected.selection,
  selectedGarmentTypes: ["shirt"],
  normalizedCustomDetailCatalog: disabledCatalog,
});
assert.equal(
  replacedDisabledOption.selection.constructionByGarment.shirt?.status,
  "unresolved",
  "A missing exact-garment default must not fall back to another construction option.",
);

const validAlternateOption = structuredClone(deselected.selection);
const alternateShirt = validAlternateOption.constructionByGarment.shirt;
if (alternateShirt?.status === "resolved") {
  alternateShirt.components[0].optionId = "shirt_std_midlong";
  alternateShirt.components[0].componentKey =
    "shirt:shirt_construction:shirt_std_midlong";
  alternateShirt.totalPriceCents = 1;
  alternateShirt.totalPrice = 0.01;
}
const restoredCanonicalDefault = reconcileGarmentTypeStepSelection({
  persistedSelection: validAlternateOption,
  normalizedCustomDetailCatalog: catalog,
});
const restoredCanonicalDefaultShirt =
  restoredCanonicalDefault.selection.constructionByGarment.shirt;
assert.equal(
  restoredCanonicalDefaultShirt?.status === "resolved"
    ? restoredCanonicalDefaultShirt.components[0].optionId
    : null,
  "shirt_std_short",
  "A saved construction must restore the current exact-garment Step 1 default.",
);
assert.equal(
  restoredCanonicalDefaultShirt?.status === "resolved"
    ? restoredCanonicalDefaultShirt.totalPriceCents
    : null,
  6500,
  "The restored default must use its current canonical price.",
);

const stalePrice = structuredClone(deselected.selection);
const staleShirt = stalePrice.constructionByGarment.shirt;
if (staleShirt?.status === "resolved") {
  staleShirt.components[0].priceCents = 1;
  staleShirt.components[0].price = 0.01;
  staleShirt.totalPriceCents = 1;
  staleShirt.totalPrice = 0.01;
}
const repricedCatalog = normalizeCustomDetailCatalog([
  { id: "shirt_std_short", priceCents: 6900 },
]);
const repriced = reconcileGarmentTypeStepSelection({
  persistedSelection: stalePrice,
  normalizedCustomDetailCatalog: repricedCatalog,
});
const repricedShirt = repriced.selection.constructionByGarment.shirt;
assert.equal(
  repricedShirt?.status === "resolved" ? repricedShirt.totalPriceCents : null,
  6900,
);
assert.deepEqual(repriced.priceChanges, [
  {
    garmentType: "shirt",
    previousTotalPriceCents: 1,
    currentTotalPriceCents: 6900,
  },
]);

const unresolved = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalog.filter(
    (option) => option.selectionGroup !== "shirt_construction",
  ),
});
assert.equal(unresolved.selection.constructionByGarment.shirt?.status, "unresolved");
assert.deepEqual(unresolved.unresolvedGarmentTypes, ["shirt"]);

assert.doesNotThrow(() =>
  normalizePersistedGarmentTypeStepSelection({
    garmentTypes: [null, "shirt", "shirt", "other", 12],
    demographic: "unknown",
    constructionByGarment: { shirt: { status: "resolved", components: "bad" } },
  }),
);
assert.deepEqual(
  normalizePersistedGarmentTypeStepSelection({
    garmentTypes: [null, "shirt", "shirt", "other", 12],
    demographic: "unknown",
  }),
  {
    garmentTypes: ["shirt"],
    audienceSelection: { schemaVersion: 1, demographics: [] },
    demographic: null,
    constructionByGarment: {},
  },
);

const migratedLegacyAudience = normalizePersistedGarmentTypeStepSelection({
  garmentTypes: ["shirt"],
  demographic: "female",
});
assert.deepEqual(migratedLegacyAudience.audienceSelection, {
  schemaVersion: 1,
  demographics: ["female"],
});
assert.equal(migratedLegacyAudience.demographic, "female");

const restoredMultipleAudiences = normalizePersistedGarmentTypeStepSelection({
  garmentTypes: ["shirt"],
  audienceSelection: {
    schemaVersion: 1,
    demographics: ["female", "male"],
  },
  demographic: "female",
});
assert.deepEqual(getGarmentTypeSelectedDemographics(restoredMultipleAudiences), [
  "male",
  "female",
]);
assert.equal(
  restoredMultipleAudiences.demographic,
  "unisex",
  "Multiple explicit audiences project to the existing inclusive compatibility value.",
);
assert.equal(
  getGarmentTypeCompatibilityDemographic(["male", "female"]),
  "unisex",
);

const malformedVersionedAudience = normalizePersistedGarmentTypeStepSelection({
  garmentTypes: ["shirt"],
  audienceSelection: {
    schemaVersion: 1,
    demographics: ["female", "unknown"],
  },
  demographic: "female",
});
assert.deepEqual(
  malformedVersionedAudience.audienceSelection?.demographics,
  [],
  "Malformed versioned audience data must fail closed rather than guess from a legacy field.",
);
assert.equal(malformedVersionedAudience.demographic, null);

const unsupportedVersionedAudience = normalizePersistedGarmentTypeStepSelection({
  garmentTypes: ["shirt"],
  audienceSelection: {
    schemaVersion: 2,
    demographics: ["female"],
  },
  demographic: "female",
});
assert.deepEqual(unsupportedVersionedAudience.audienceSelection?.demographics, []);
assert.equal(
  unsupportedVersionedAudience.demographic,
  null,
  "An unsupported audience schema must not fall back to a legacy guess.",
);

const controlled = getGarmentTypeStepControlledState(initial.selection);
assert.deepEqual(controlled.selectedGarmentTypes, allGarments);
assert.deepEqual(controlled.selectedDemographics, ["unisex"]);
assert.equal(controlled.selectedDemographic, "unisex");
assert.equal(controlled.constructionDefaults.length, 10);

const demographicChanged = reduceGarmentTypeStepSelection(
  initial.selection,
  { type: "set_demographic", demographic: "female" },
  catalog,
);
assert.deepEqual(demographicChanged.selection.garmentTypes, allGarments);
assert.equal(demographicChanged.selection.demographic, "female");

const demographicsChanged = reduceGarmentTypeStepSelection(
  demographicChanged.selection,
  { type: "set_demographics", demographics: ["male", "female"] },
  catalog,
);
assert.deepEqual(
  demographicsChanged.selection.audienceSelection?.demographics,
  ["male", "female"],
);
assert.equal(demographicsChanged.selection.demographic, "unisex");

const baseDraft = {
  journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
  currentStageId: "garment_type" as const,
  currentStep: 1,
  selectedFabricCode: null,
  selectedStyleId: null,
  selectedGarment: null,
  designSelections: {},
  measurements: {},
  sizingMode: "manual",
  deliveryMethod: null,
  deliveryAddress: { addressLine1: "", city: "", postalCode: "", countryCode: "" },
  pickupTime: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: null,
  specialInstructions: "",
  leftoverFabricChoice: "",
  hasLining: false,
  pricingBreakdown: {
    fabricPrice: 0,
    fabricSewingCost: 0,
    constructionSewingCost: 0,
    customDetailsPrice: 0,
    lagosToEindhovenShipping: 0,
    eindhovenToDestinationShipping: null,
    total: 0,
  },
  shippingSnapshot: {},
  updatedAt: "2026-08-13T00:00:00.000Z",
  unrelatedLegacyField: { preserved: true },
} as GuestDesignDraft & { unrelatedLegacyField: { preserved: boolean } };

assert.equal(
  reconcileGuestDesignDraftGarmentTypeSelection(baseDraft),
  baseDraft,
  "Old drafts without Step 1 state must remain unchanged.",
);
const draftWithSelection = reconcileGuestDesignDraftGarmentTypeSelection(
  { ...baseDraft, garmentTypeSelection: roundTripped },
  catalog,
);
assert.equal(draftWithSelection.unrelatedLegacyField.preserved, true);
assert.deepEqual(
  draftWithSelection.garmentTypeSelection?.constructionByGarment.agbada,
  initial.selection.constructionByGarment.agbada,
);

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});
const { StorageService } = await import("./src/services/storageService");
const { GuestOrderSessionService } = await import(
  "./src/services/guestOrderSessionService"
);
StorageService.clearGuestOrderSession();
GuestOrderSessionService.saveFutureDesignDraft(draftWithSelection);
const persistedDraft = GuestOrderSessionService.getFutureDesignDraft();
assert.deepEqual(
  persistedDraft?.garmentTypeSelection?.garmentTypes,
  allGarments.filter((garmentType) => garmentType !== "agbada"),
  "Active guest-draft persistence must migrate the retired Agbada choice.",
);
assert.equal(
  persistedDraft?.garmentTypeSelection?.constructionByGarment.agbada,
  undefined,
  "Active guest-draft persistence must remove Agbada construction pricing.",
);
assert.deepEqual(
  roundTripped.garmentTypes,
  allGarments,
  "Canonical historical garment data must remain readable without mutating the source record.",
);
assert.deepEqual(
  roundTripped.constructionByGarment.agbada,
  initial.selection.constructionByGarment.agbada,
  "Canonical historical Agbada construction data must remain decodable.",
);
assert.equal(
  (persistedDraft as typeof draftWithSelection | null)?.unrelatedLegacyField
    .preserved,
  true,
);

assert.deepEqual(
  DESIGN_STUDIO_NINE_STAGE_FOUNDATION.map((step) => step.title),
  [
    "Garment Type",
    "Fabric",
    "Design Style",
    "Custom Details",
    "AI Try-on",
    "Measurement",
    "Summary",
    "Delivery & Pickup",
    "Order Review & Payment",
  ],
  "The active Design Studio must expose the approved nine-stage journey.",
);

console.log("PASS: authoritative Garment Type Step state and draft persistence");
