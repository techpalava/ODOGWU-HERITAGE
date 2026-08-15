import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type { GuestDesignDraft } from "./src/types";
import { getGarmentTypeStepPresentation } from "./src/components/GarmentTypeStep";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  acceptDormantGarmentConstructionDefaults,
  createDormantDesignStudioJourneyState,
  getGarmentTypeStageCompletion,
  persistDormantGarmentTypeStage,
  updateDormantGarmentTypeSelection,
} from "./src/utils/designStudioJourneyMode";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const persistedSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "kaftan", "agbada"],
  selectedDemographic: "unisex",
  normalizedCustomDetailCatalog: catalog,
}).selection;

const baseDraft = {
  currentStep: 3,
  garmentTypeSelection: persistedSelection,
  selectedFabricCode: null,
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
    fabricPrice: 0,
    fabricSewingCost: 0,
    constructionSewingCost: 0,
    customDetailsPrice: 0,
    lagosToEindhovenShipping: 0,
    eindhovenToDestinationShipping: null,
    total: 0,
  },
  shippingSnapshot: {},
  updatedAt: "2026-08-13T12:00:00.000Z",
} as GuestDesignDraft;

const activeJourney = createDormantDesignStudioJourneyState({
  persistedDraft: baseDraft,
  normalizedCustomDetailCatalog: catalog,
});
const future = activeJourney;
assert.equal(future.currentStageId, "garment_type");
assert.equal(future.constructionSelectionMode, "garment_type_locked");
assert.equal(future.nextStageId, "fabric");
assert.equal(future.canAdvance, true);
assert.equal(future.completion.isComplete, true);

const presentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: future.garmentTypeSelection.garmentTypes,
  normalizedCustomDetailCatalog: catalog,
});
assert.deepEqual(presentation.selectedGarmentTypes, [
  "shirt",
  "kaftan",
  "agbada",
]);
assert.equal(presentation.constructionSubtotalCents, 27000);
assert.equal(
  presentation.constructionPricing.find(
    (resolution) => resolution.garmentType === "agbada",
  )?.status,
  "resolved",
);
const agbada = future.garmentTypeSelection.constructionByGarment.agbada;
assert.equal(agbada?.status, "resolved");
if (agbada?.status === "resolved") {
  assert.equal(agbada.components.length, 2);
  assert.equal(agbada.totalPriceCents, 14000);
}
const shirt = future.garmentTypeSelection.constructionByGarment.shirt;
const kaftan = future.garmentTypeSelection.constructionByGarment.kaftan;
assert.equal(shirt?.status, "resolved");
assert.equal(kaftan?.status, "resolved");
if (shirt?.status === "resolved" && kaftan?.status === "resolved") {
  assert.equal(shirt.components[0].optionId, kaftan.components[0].optionId);
  assert.notEqual(
    shirt.components[0].componentKey,
    kaftan.components[0].componentKey,
  );
}

const changedGarments = updateDormantGarmentTypeSelection({
  currentSelection: future.garmentTypeSelection,
  selectedGarmentTypes: ["shirt", "trouser"],
  normalizedCustomDetailCatalog: catalog,
});
assert.deepEqual(changedGarments.garmentTypes, ["shirt", "trouser"]);
assert.equal(changedGarments.constructionByGarment.trouser?.status, "resolved");
assert.equal(changedGarments.constructionByGarment.kaftan, undefined);

const changedDemographic = updateDormantGarmentTypeSelection({
  currentSelection: changedGarments,
  selectedDemographic: "female",
  normalizedCustomDetailCatalog: catalog,
});
assert.deepEqual(changedDemographic.garmentTypes, ["shirt", "trouser"]);
assert.equal(changedDemographic.demographic, "female");

const staleSelection = structuredClone(changedGarments);
const staleShirt = staleSelection.constructionByGarment.shirt;
if (staleShirt?.status === "resolved") {
  staleShirt.components[0].priceCents = 1;
  staleShirt.components[0].price = 0.01;
  staleShirt.totalPriceCents = 1;
  staleShirt.totalPrice = 0.01;
}
const repricedCatalog = normalizeCustomDetailCatalog([
  { id: "shirt_std_short", priceCents: 6900 },
]);
const repriced = updateDormantGarmentTypeSelection({
  currentSelection: staleSelection,
  normalizedCustomDetailCatalog: repricedCatalog,
});
assert.equal(
  repriced.constructionByGarment.shirt?.status === "resolved"
    ? repriced.constructionByGarment.shirt.totalPriceCents
    : null,
  6900,
);

const acceptedDefaults = acceptDormantGarmentConstructionDefaults({
  currentSelection: changedGarments,
  resolutions: getGarmentTypeStepPresentation({
    selectedGarmentTypes: changedGarments.garmentTypes,
    normalizedCustomDetailCatalog: catalog,
  }).constructionPricing,
  normalizedCustomDetailCatalog: catalog,
});
assert.deepEqual(acceptedDefaults, changedGarments);

assert.deepEqual(
  getGarmentTypeStageCompletion({
    garmentTypes: [],
    demographic: "male",
    constructionByGarment: {},
  }).blockers,
  [{ code: "GARMENT_REQUIRED" }],
);
assert.deepEqual(
  getGarmentTypeStageCompletion({
    ...changedGarments,
    demographic: null,
  }).blockers,
  [{ code: "DEMOGRAPHIC_REQUIRED" }],
);
const unresolvedCatalog = catalog.filter(
  (option) => option.selectionGroup !== "shirt_construction",
);
const unresolvedSelection = updateDormantGarmentTypeSelection({
  currentSelection: changedGarments,
  selectedGarmentTypes: ["shirt"],
  normalizedCustomDetailCatalog: unresolvedCatalog,
});
const unresolvedCompletion = getGarmentTypeStageCompletion(unresolvedSelection);
assert.equal(unresolvedCompletion.isComplete, false);
assert.deepEqual(unresolvedCompletion.blockers, [
  { code: "CONSTRUCTION_UNRESOLVED", garmentType: "shirt" },
]);
assert.equal(
  unresolvedSelection.constructionByGarment.shirt?.status,
  "unresolved",
);

const futureDraft = persistDormantGarmentTypeStage({
  draft: baseDraft,
  garmentTypeSelection: changedDemographic,
});
const reloaded = createDormantDesignStudioJourneyState({
  persistedDraft: JSON.parse(JSON.stringify(futureDraft)),
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(futureDraft.currentStageId, "garment_type");
assert.deepEqual(reloaded.garmentTypeSelection, changedDemographic);
assert.deepEqual(
  persistDormantGarmentTypeStage({
    draft: baseDraft,
    garmentTypeSelection: changedDemographic,
  }).garmentTypeSelection,
  changedDemographic,
  "The only active journey must persist authoritative Step 1 state.",
);

const uploadedDraft = {
  ...baseDraft,
  designSource: {
    kind: "uploaded" as const,
    sourceKey: "uploaded:test",
    displayLabel: "Private design",
    uploadReference: {
      designReferenceId: "design-ref",
      ownerUid: "owner",
      storagePath: "customer-designs/owner/design-ref.webp",
      mimeType: "image/webp" as const,
      createdAt: "2026-08-13T12:00:00.000Z",
    },
    fabricCapacityComposition: [],
    demographic: "unisex" as const,
  },
};
const persistedUploadedDraft = persistDormantGarmentTypeStage({
  draft: uploadedDraft,
  garmentTypeSelection: changedDemographic,
});
assert.equal(persistedUploadedDraft.designSource, uploadedDraft.designSource);

const appSource = readFileSync("src/App.tsx", "utf8");
const studioSource = readFileSync(
  "src/components/DesignStudioView.tsx",
  "utf8",
);
assert.equal(appSource.includes("future_nine_stage"), false);
assert.equal(studioSource.includes("legacy_five_stage"), false);
assert.equal(studioSource.includes("isFutureNineStageMode"), false);
assert.match(studioSource, /data-stage-id=\{futureStageId\}/);

console.log("PASS: dormant Garment Type stage integration");
