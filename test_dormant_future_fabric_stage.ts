import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { CANONICAL_PHYSICAL_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { FabricCapacityEngine } from "./src/engine/FabricCapacityEngine";
import type {
  BusinessSettings,
  Fabric,
  GarmentTypeStepSelection,
  GuestDesignDraft,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  createDormantDesignStudioJourneyState,
  persistDormantGarmentTypeStage,
} from "./src/utils/designStudioJourneyMode";
import {
  getFutureFabricCapacityComposition,
  getFutureFabricGarmentSelections,
  getFutureFabricStageCompletion,
  reconcileFutureFabricAllocationState,
  selectFutureFabric,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { calculateDesignPricing } from "./src/utils/designPricing";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const fabric = (
  code: string,
  name: string,
  price: number,
  stockStatus: Fabric["stockStatus"] = "IN_STOCK",
): Fabric => ({
  code,
  name,
  description: `${name} fabric`,
  color: "Emerald",
  colorHex: "#0B5D3B",
  priceMultiplier: 1,
  stockStatus,
  category: "Future Test Fabric",
  price,
});
const fabrics = [
  fabric("FAB-A", "Future Fabric A", 10),
  fabric("FAB-B", "Future Fabric B", 20),
];
const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: "unisex",
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const incompleteJourney = createDormantDesignStudioJourneyState({
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(incompleteJourney.currentStageId, "garment_type");
assert.equal(incompleteJourney.canAdvance, false);
assert.equal(incompleteJourney.nextStageId, null);
assert.equal(
  createDormantDesignStudioJourneyState({
    normalizedCustomDetailCatalog: catalog,
  }).currentStageId,
  "garment_type",
);

const shirtTrouser = selection(["shirt", "trouser"]);
const completedJourney = createDormantDesignStudioJourneyState({
  persistedDraft: { garmentTypeSelection: shirtTrouser },
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(completedJourney.nextStageId, "fabric");
assert.equal(completedJourney.canAdvance, true);

assert.deepEqual(
  getFutureFabricCapacityComposition(
    selection([...CANONICAL_PHYSICAL_GARMENT_TYPES]),
  ).map((spec) => [spec.key, spec.garmentType, spec.fabricUnits]),
  [
    ["base:shirt", "shirt", 1],
    ["base:trouser", "trouser", 1],
    ["base:skirt", "skirt", 1],
    ["base:standard_shorts", "standard_shorts", 1],
    ["base:bum_shorts", "bum_shorts", 1],
    ["base:dress", "dress", 1],
    ["base:kaftan", "kaftan", 1],
    ["base:full_length_gown", "full_length_gown", 2],
    ["base:agbada", "agbada", 2],
  ],
);
for (const garment of getFutureFabricGarmentSelections(
  selection([...CANONICAL_PHYSICAL_GARMENT_TYPES]),
)) {
  assert.equal(
    FabricCapacityEngine.resolveGarmentAssignment(garment).status,
    "resolved",
  );
}
const identitySelections = getFutureFabricGarmentSelections(
  selection(["shirt", "kaftan"]),
);
assert.notEqual(
  identitySelections[0].garmentSpec?.key,
  identitySelections[1].garmentSpec?.key,
);

let sharedState = selectFutureFabric({
  state: FabricAllocationStateEngine.initialize(),
  fabricCode: "FAB-A",
  garmentTypeSelection: shirtTrouser,
});
assert.equal(sharedState.fabricAllocations.length, 1);
assert.deepEqual(
  sharedState.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt", "base:trouser"],
);
assert.equal(sharedState.pendingFabricGarment, null);
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: shirtTrouser,
    fabricAllocationState: sharedState,
    fabrics,
  }).isComplete,
  true,
);

const threeGarments = selection(["shirt", "trouser", "skirt"]);
let overflowState = reconcileFutureFabricAllocationState({
  state: sharedState,
  garmentTypeSelection: threeGarments,
});
overflowState = selectFutureFabric({
  state: overflowState,
  fabricCode: "FAB-A",
  garmentTypeSelection: threeGarments,
});
assert.equal(overflowState.pendingFabricGarment?.garmentKey, "base:skirt");
overflowState =
  FabricAllocationStateEngine.beginChooseAnotherFabric(overflowState);
overflowState = selectFutureFabric({
  state: overflowState,
  fabricCode: "FAB-B",
  garmentTypeSelection: threeGarments,
});
assert.equal(overflowState.fabricAllocations.length, 2);
assert.equal(overflowState.fabricAllocations[0].fabricCode, "FAB-A");
assert.equal(overflowState.fabricAllocations[1].fabricCode, "FAB-B");
assert.equal(
  overflowState.fabricAllocations[1].garmentAssignments[0].garmentKey,
  "base:skirt",
);

const reconciledRemoval = reconcileFutureFabricAllocationState({
  state: overflowState,
  garmentTypeSelection: selection(["shirt", "skirt"]),
});
assert.deepEqual(
  reconciledRemoval.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ),
  ["base:shirt", "base:skirt"],
);
assert.equal(reconciledRemoval.fabricAllocations[0].fabricCode, "FAB-A");
assert.equal(reconciledRemoval.fabricAllocations[1].fabricCode, "FAB-B");
const reconciledAddition = reconcileFutureFabricAllocationState({
  state: reconciledRemoval,
  garmentTypeSelection: threeGarments,
});
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: threeGarments,
    fabricAllocationState: reconciledAddition,
    fabrics,
  }).blockers.some(
    (blocker) =>
      blocker.code === "GARMENT_ASSIGNMENT_REQUIRED" &&
      blocker.garmentKey === "base:trouser",
  ),
  true,
);

const missingFabricCompletion = getFutureFabricStageCompletion({
  garmentTypeSelection: shirtTrouser,
  fabricAllocationState: sharedState,
  fabrics: [],
});
assert.equal(
  missingFabricCompletion.blockers.some(
    (blocker) => blocker.code === "FABRIC_NOT_FOUND",
  ),
  true,
);
const disabledFabricCompletion = getFutureFabricStageCompletion({
  garmentTypeSelection: shirtTrouser,
  fabricAllocationState: sharedState,
  fabrics: [fabric("FAB-A", "Future Fabric A", 10, "HIDDEN")],
});
assert.equal(
  disabledFabricCompletion.blockers.some(
    (blocker) => blocker.code === "FABRIC_UNAVAILABLE",
  ),
  true,
);

const oldPrice = resolveFabricAllocationMaterialPricing(
  sharedState.fabricAllocations,
  fabrics,
);
const refreshedPrice = resolveFabricAllocationMaterialPricing(
  sharedState.fabricAllocations,
  [fabric("FAB-A", "Future Fabric A", 37)],
);
assert.equal(
  oldPrice.status === "resolved" ? oldPrice.totalMaterialPrice : null,
  10,
);
assert.equal(
  refreshedPrice.status === "resolved"
    ? refreshedPrice.totalMaterialPrice
    : null,
  37,
);
assert.equal(oldPrice.status, "resolved");
assert.equal(refreshedPrice.status, "resolved");
if (oldPrice.status === "resolved" && refreshedPrice.status === "resolved") {
  const businessSettings = {
    pricingSettings: { standardAccessoryCharge: 10 },
  } as BusinessSettings;
  const constructionPrice = shirtTrouser.garmentTypes.reduce(
    (total, garmentType) =>
      total +
      (shirtTrouser.constructionByGarment[garmentType]?.status === "resolved"
        ? shirtTrouser.constructionByGarment[garmentType].totalPrice
        : 0),
    0,
  );
  const priceWithCurrentCatalog = calculateDesignPricing({
    route: "alone",
    design: {},
    materialPricing: oldPrice,
    baseGarmentComposition: getFutureFabricCapacityComposition(shirtTrouser),
    catalog,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection: shirtTrouser,
  });
  const priceAfterAdminUpdate = calculateDesignPricing({
    route: "alone",
    design: {},
    materialPricing: refreshedPrice,
    baseGarmentComposition: getFutureFabricCapacityComposition(shirtTrouser),
    catalog,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection: shirtTrouser,
  });
  assert.ok(priceWithCurrentCatalog && priceAfterAdminUpdate);
  assert.equal(priceWithCurrentCatalog.clothingPrice, constructionPrice);
  assert.equal(priceWithCurrentCatalog.totalFabricMaterialPrice, 10);
  assert.equal(priceWithCurrentCatalog.fabricPrice, 10);
  assert.equal(priceAfterAdminUpdate.clothingPrice, constructionPrice);
  assert.equal(priceAfterAdminUpdate.totalFabricMaterialPrice, 37);
  assert.equal(priceAfterAdminUpdate.fabricPrice, 37);
  assert.equal(
    priceAfterAdminUpdate.garmentSubtotal -
      priceWithCurrentCatalog.garmentSubtotal,
    27,
  );
}

const agbadaSelection = selection(["agbada"]);
const agbadaState = selectFutureFabric({
  state: FabricAllocationStateEngine.initialize(),
  fabricCode: "FAB-A",
  garmentTypeSelection: agbadaSelection,
});
assert.equal(
  agbadaState.fabricAllocations[0].garmentAssignments[0].fabricUnits,
  2,
);
const persistedDraft = persistDormantGarmentTypeStage({
  currentStageId: "fabric",
  garmentTypeSelection: agbadaSelection,
  draft: {
    currentStep: 1,
    selectedFabricCode: "FAB-A",
    selectedStyleId: null,
    selectedGarment: null,
    designSelections: {},
    measurements: {},
    sizingMode: "manual",
    deliveryMethod: null,
    deliveryAddress: {
      addressLine1: "",
      city: "",
      postalCode: "",
      countryCode: "",
    },
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
      fabricPrice: 10,
      fabricSewingCost: 0,
      constructionSewingCost: 0,
      customDetailsPrice: 0,
      lagosToEindhovenShipping: 0,
      eindhovenToDestinationShipping: null,
      total: 80,
    },
    shippingSnapshot: {},
    fabricAllocations: agbadaState.fabricAllocations,
    updatedAt: "2026-08-13T12:00:00.000Z",
  } as GuestDesignDraft,
});
const reloadedDraft = JSON.parse(
  JSON.stringify(persistedDraft),
) as GuestDesignDraft;
assert.equal(reloadedDraft.currentStageId, "fabric");
assert.equal(
  reloadedDraft.fabricAllocations?.[0].garmentAssignments[0].fabricUnits,
  2,
);
assert.equal(
  createDormantDesignStudioJourneyState({
    persistedDraft: reloadedDraft,
    normalizedCustomDetailCatalog: catalog,
  }).currentStageId,
  "fabric",
);

const appSource = readFileSync("src/App.tsx", "utf8");
const studioSource = readFileSync(
  "src/components/DesignStudioView.tsx",
  "utf8",
);
assert.equal(appSource.includes("future_nine_stage"), false);
assert.equal(studioSource.includes("legacy_five_stage"), false);
assert.match(studioSource, /futureStageId === ["']garment_type["']/);
assert.match(studioSource, /setFutureStageId\("design_style"\)/);
assert.match(
  studioSource,
  /getFutureFabricGarmentSelections\(garmentTypeSelection\)/,
);

console.log("PASS: dormant future Fabric stage integration");
