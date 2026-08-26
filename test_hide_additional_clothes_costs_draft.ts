import assert from "node:assert/strict";
import type {
  BusinessSettings,
  Fabric,
  GuestDesignDraft,
} from "./src/types";
import {
  DRESS_LINING_OPTION_ID,
  SEED_CUSTOM_DETAIL_CATALOG,
} from "./src/config/GarmentDetailsConfig";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { projectActiveCustomerDesignSelections } from "./src/utils/customerAvailableDesignSelections";
import { calculateDesignPricing } from "./src/utils/designPricing";
import { getFutureFabricCapacityComposition } from "./src/utils/designStudioFutureFabricStage";
import { createCatalogDesignSource } from "./src/utils/designSourceState";
import {
  DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
} from "./src/utils/designSourceJourney";
import { createDesignStudioDraftRepository } from "./src/utils/designStudioDraftPersistence";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const { normalizeGuestDesignDraft } = await import(
  "./src/services/guestOrderSessionService"
);

class MemoryDraftStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const storage = new MemoryDraftStorage();
const repository = createDesignStudioDraftRepository({
  storage,
  legacy: { load: () => null },
  normalizeDraft: normalizeGuestDesignDraft,
  legacySourceVersion: "hide-additional-clothes-costs-test",
  now: () => "2026-08-25T12:00:00.000Z",
});

const visiblePaidOptionId = "neck_priced_visible_test";
const visiblePaidOption = {
  ...SEED_CUSTOM_DETAIL_CATALOG.find((option) => option.id === "neck_no_round")!,
  id: visiblePaidOptionId,
  label: "Visible Priced Neck Option",
  priceCents: 2500,
  displayOrder: 99,
};
const normalizedCatalog = normalizeCustomDetailCatalog([
  ...SEED_CUSTOM_DETAIL_CATALOG,
  visiblePaidOption,
]);
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["dress"],
  selectedDemographic: "female",
  normalizedCustomDetailCatalog: normalizedCatalog,
}).selection;
const designSource = createCatalogDesignSource("draft-style-hide-costs");
const rawDraft: GuestDesignDraft = {
  journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
  currentStageId: "custom_details",
  currentStep: 4,
  garmentTypeSelection,
  selectedFabricCode: "FAB-DRAFT-HIDE-COSTS",
  selectedStyleId: "draft-style-hide-costs",
  designSource,
  confirmedStyleId: "draft-style-hide-costs",
  confirmedDesignSourceKey: designSource.sourceKey,
  priceActivatedFabricCode: "FAB-DRAFT-HIDE-COSTS",
  selectedGarment: null,
  designSelections: {
    hasLining: true,
    customDetails: {
      dress_additional: [DRESS_LINING_OPTION_ID],
      neck_design: visiblePaidOptionId,
    },
    accessories: [],
  },
  measurements: {
    height: 170,
    weight: 65,
    age: 35,
    bodyBuild: "Average",
    fitPreference: "Standard",
    neck: 14,
    shoulder: 16,
    chest: 36,
    waist: 30,
    hip: 38,
    sleeve: 23,
    trouserLength: 40,
    isAiEstimated: false,
  },
  sizingMode: "manual",
  deliveryMethod: null,
  deliveryAddress: {
    addressLine1: "",
    city: "",
    postalCode: "",
    countryCode: "",
  },
  pickupTime: "",
  customerName: "Draft Customer",
  customerEmail: "draft@example.com",
  customerPhone: "",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "",
  leftoverFabricChoice: "Return leftover fabric pieces with garment",
  hasLining: false,
  pricingBreakdown: {
    customDetailsPrice: 0,
    eindhovenToDestinationShipping: null,
  },
  shippingSnapshot: {},
  fabricAllocations: [
    {
      allocationId: "allocation-draft-dress",
      fabricCode: "FAB-DRAFT-HIDE-COSTS",
      garmentAssignments: [
        {
          garmentKey: "base:dress",
          code: "BASE_DRESS",
          garmentType: "dress",
          fabricUnits: 1,
          sourceRole: "main",
        },
      ],
    },
  ],
  updatedAt: "2026-08-25T12:00:00.000Z",
};

const firstSave = repository.saveFutureDraftV1(rawDraft);
assert.equal(firstSave.status, "saved");
const firstLoad = repository.loadFutureDraftV1();
assert.equal(firstLoad.status, "loaded");
if (firstLoad.status !== "loaded") {
  throw new Error("expected the first future draft hydration to succeed");
}

assert.equal(firstLoad.draft.designSelections.hasLining, true);
assert.deepEqual(
  firstLoad.draft.designSelections.customDetails?.dress_additional,
  [DRESS_LINING_OPTION_ID],
);
assert.equal(
  firstLoad.draft.designSelections.customDetails?.neck_design,
  visiblePaidOptionId,
);
assert.deepEqual(firstLoad.draft.garmentTypeSelection, garmentTypeSelection);
assert.equal(firstLoad.draft.fabricAllocations?.[0]?.fabricCode, "FAB-DRAFT-HIDE-COSTS");
assert.deepEqual(firstLoad.draft.designSource, designSource);

const activeSelections = projectActiveCustomerDesignSelections({
  designSelections: firstLoad.draft.designSelections,
});
assert.equal(activeSelections.hasLining, true);
assert.deepEqual(
  activeSelections.customDetails?.dress_additional,
  [DRESS_LINING_OPTION_ID],
);
assert.equal(
  activeSelections.customDetails?.neck_design,
  visiblePaidOptionId,
);

const fabric: Fabric = {
  code: "FAB-DRAFT-HIDE-COSTS",
  name: "Draft round-trip fabric",
  description: "Regression fabric",
  color: "Indigo",
  colorHex: "#1f3b73",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
};
const materialPricing = resolveFabricAllocationMaterialPricing(
  firstLoad.draft.fabricAllocations || [],
  [fabric],
);
assert.equal(materialPricing.status, "resolved");
if (materialPricing.status !== "resolved") {
  throw new Error("expected hydrated fabric allocation pricing to resolve");
}
const hydratedPricing = calculateDesignPricing({
  route: "alone",
  design: activeSelections,
  materialPricing,
  baseGarmentComposition: getFutureFabricCapacityComposition(
    garmentTypeSelection,
  ),
  catalog: normalizedCatalog,
  businessSettings: {
    pricingSettings: {
      depositPercentage: 50,
      balancePercentage: 50,
      currency: "EUR",
      vatTaxPercentage: 7.5,
      discountRulesEnabled: false,
      standardAccessoryCharge: 10,
    },
  } as BusinessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection,
});
assert.equal(hydratedPricing.customDetailsPrice, 35);

const firstHydrationSnapshot = JSON.stringify(firstLoad.draft);
const secondSave = repository.saveFutureDraftV1(firstLoad.draft);
assert.equal(secondSave.status, "saved");
const secondLoad = repository.loadFutureDraftV1();
assert.equal(secondLoad.status, "loaded");
if (secondLoad.status !== "loaded") {
  throw new Error("expected the second future draft hydration to succeed");
}
assert.equal(JSON.stringify(secondLoad.draft), firstHydrationSnapshot);
assert.equal(secondLoad.draft.designSelections.hasLining, true);
assert.deepEqual(
  secondLoad.draft.designSelections.customDetails?.dress_additional,
  [DRESS_LINING_OPTION_ID],
);

console.log(
  "PASS: Dress Additional Clothes Costs survive the real future draft round trip and remain in the active projection",
);
