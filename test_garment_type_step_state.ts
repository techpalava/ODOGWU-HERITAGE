import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type {
  GarmentTypeStepSelection,
  GuestDesignDraft,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { DESIGN_STUDIO_CUSTOMER_FLOW_STEPS } from "./src/utils/designSourceJourney";
import {
  getGarmentTypeStepControlledState,
  normalizePersistedGarmentTypeStepSelection,
  reconcileGarmentTypeStepSelection,
  reconcileGuestDesignDraftGarmentTypeSelection,
  reduceGarmentTypeStepSelection,
} from "./src/utils/garmentTypeStepState";
import { CANONICAL_PHYSICAL_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";

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
    "standard_shorts",
    "bum_shorts",
    "kaftan",
  ],
  selectedDemographic: "unisex",
  normalizedCustomDetailCatalog: catalog,
});
assert.deepEqual(initial.selection.garmentTypes, allGarments);
assert.equal(initial.selection.demographic, "unisex");
assert.equal(Object.keys(initial.selection.constructionByGarment).length, 9);

const shirt = initial.selection.constructionByGarment.shirt;
const kaftan = initial.selection.constructionByGarment.kaftan;
assert.equal(shirt?.status, "resolved");
assert.equal(kaftan?.status, "resolved");
if (shirt?.status === "resolved" && kaftan?.status === "resolved") {
  assert.equal(shirt.components[0].optionId, "shirt_std_short");
  assert.equal(kaftan.components[0].optionId, "shirt_std_short");
  assert.notEqual(shirt.components[0].componentKey, kaftan.components[0].componentKey);
  assert.match(shirt.components[0].componentKey, /^shirt:/);
  assert.match(kaftan.components[0].componentKey, /^kaftan:/);
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
  replacedDisabledOption.selection.constructionByGarment.shirt?.status ===
    "resolved"
    ? replacedDisabledOption.selection.constructionByGarment.shirt.components[0]
        .optionId
    : null,
  "shirt_std_midlong",
  "A disabled saved option must be replaced by the current authoritative default.",
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
const preservedAlternate = reconcileGarmentTypeStepSelection({
  persistedSelection: validAlternateOption,
  normalizedCustomDetailCatalog: catalog,
});
const preservedAlternateShirt =
  preservedAlternate.selection.constructionByGarment.shirt;
assert.equal(
  preservedAlternateShirt?.status === "resolved"
    ? preservedAlternateShirt.components[0].optionId
    : null,
  "shirt_std_midlong",
  "A still-valid persisted canonical option ID must survive reconciliation.",
);
assert.equal(
  preservedAlternateShirt?.status === "resolved"
    ? preservedAlternateShirt.totalPriceCents
    : null,
  7000,
  "A preserved option must use its current Admin price, not its persisted price.",
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
  {
    garmentType: "kaftan",
    previousTotalPriceCents: 6500,
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
  { garmentTypes: ["shirt"], demographic: null, constructionByGarment: {} },
);

const controlled = getGarmentTypeStepControlledState(initial.selection);
assert.deepEqual(controlled.selectedGarmentTypes, allGarments);
assert.equal(controlled.selectedDemographic, "unisex");
assert.equal(controlled.constructionDefaults.length, 9);

const demographicChanged = reduceGarmentTypeStepSelection(
  initial.selection,
  { type: "set_demographic", demographic: "female" },
  catalog,
);
assert.deepEqual(demographicChanged.selection.garmentTypes, allGarments);
assert.equal(demographicChanged.selection.demographic, "female");

const baseDraft = {
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
GuestOrderSessionService.saveGuestDesignDraft(draftWithSelection);
const persistedDraft = GuestOrderSessionService.getGuestDesignDraft();
assert.deepEqual(
  persistedDraft?.garmentTypeSelection,
  draftWithSelection.garmentTypeSelection,
  "Canonical garment identities and construction components must survive guest-session JSON persistence.",
);
assert.equal(
  (persistedDraft as typeof draftWithSelection | null)?.unrelatedLegacyField
    .preserved,
  true,
);

assert.deepEqual(
  DESIGN_STUDIO_CUSTOMER_FLOW_STEPS.map((step) => step.title),
  [
    "Garment / Style",
    "Fabric",
    "Custom Details",
    "Shipping & Delivery",
    "Review / Add to Cart",
  ],
  "The current five-stage runtime must remain unchanged.",
);

console.log("PASS: authoritative Garment Type Step state and draft persistence");
