import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  createDormantDesignStudioJourneyState,
  persistDormantGarmentTypeStage,
} from "./src/utils/designStudioJourneyMode";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import type { GuestDesignDraft } from "./src/types";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalog,
}).selection;

const persisted = persistDormantGarmentTypeStage({
  currentStageId: "design_style",
  garmentTypeSelection,
  draft: {
    selectedStyleId: "royal-senator-1",
  } as GuestDesignDraft,
});
const serialized = JSON.parse(JSON.stringify(persisted)) as GuestDesignDraft;
assert.equal(serialized.selectedStyleId, "royal-senator-1");
assert.equal(serialized.currentStageId, "design_style");

const blockedWithoutFabric = createDormantDesignStudioJourneyState({
  persistedDraft: serialized,
  normalizedCustomDetailCatalog: catalog,
  isFabricStageComplete: false,
});
assert.equal(blockedWithoutFabric.currentStageId, "fabric");

const blockedWithIncompleteGarment = createDormantDesignStudioJourneyState({
  persistedDraft: {
    ...serialized,
    garmentTypeSelection: {
      garmentTypes: [],
      demographic: null,
      constructionByGarment: {},
    },
  },
  normalizedCustomDetailCatalog: catalog,
  isFabricStageComplete: true,
});
assert.equal(blockedWithIncompleteGarment.currentStageId, "garment_type");

const restoredWithFabric = createDormantDesignStudioJourneyState({
  persistedDraft: serialized,
  normalizedCustomDetailCatalog: catalog,
  isFabricStageComplete: true,
});
assert.equal(restoredWithFabric.currentStageId, "design_style");

const shirtOnlyDraft = persistDormantGarmentTypeStage({
  currentStageId: "design_style",
  garmentTypeSelection: reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt"],
    selectedDemographic: "male",
    normalizedCustomDetailCatalog: catalog,
  }).selection,
  draft: {
    selectedStyleId: "royal-senator-1",
  } as GuestDesignDraft,
});
assert.equal(
  createDormantDesignStudioJourneyState({
    persistedDraft: JSON.parse(JSON.stringify(shirtOnlyDraft)),
    normalizedCustomDetailCatalog: catalog,
    isFabricStageComplete: true,
  }).currentStageId,
  "design_style",
  "A valid Shirt-only draft must restore without adopting Trouser from the selected style",
);

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const styleStepSource = readFileSync(
  "src/components/DormantFutureDesignStyleStep.tsx",
  "utf8",
);
const stepperSource = readFileSync(
  "src/components/DesignStudioJourneyStepper.tsx",
  "utf8",
);
const appSource = readFileSync("src/App.tsx", "utf8");

assert.match(studioSource, /occurrences=\{futureDesignStyleStepProjection\.occurrences\}/);
assert.match(
  studioSource,
  /exactSetComplete=\{futureDesignStyleStepProjection\.isComplete\}/,
);
assert.match(
  studioSource,
  /onSelectOccurrence=\{handleSelectFutureDesignStyleOccurrence\}/,
);
assert.match(
  studioSource,
  /onAssignCatalogueStyle=\{handleAssignFutureCatalogueStyle\}/,
);
assert.match(
  studioSource,
  /onClearAssignment=\{handleClearFutureDesignStyleAssignment\}/,
);
assert.match(studioSource, /onContinue=\{handleOpenDormantDesignStyleStage\}/);
assert.match(studioSource, /futureFabricStageCompletion\.isComplete/);
const futureClearRequestSource = studioSource.slice(
  studioSource.indexOf(
    "const futureDesignStyleClearRequest: DesignStyleStepClearMutationRequest | null =",
  ),
  studioSource.indexOf("const activeFutureDesignStyleUploadUi"),
);
assert.match(futureClearRequestSource, /runtimeGeneration:/);
assert.match(
  futureClearRequestSource,
  /target:\s*resolvedFutureActiveDesignStyleOccurrence/,
);
const clearAssignmentHandlerSource = studioSource.slice(
  studioSource.indexOf("const handleClearFutureDesignStyleAssignment ="),
  studioSource.indexOf("const handleOpenDormantCustomDetailsStage ="),
);
assert.ok(
  clearAssignmentHandlerSource.includes("request.target"),
  "Clear mutation must target the exact active occurrence",
);
assert.ok(
  clearAssignmentHandlerSource.includes("detachUploadedStyleThroughStepRuntime"),
  "Clear mutation should flow through the occurrence-level detach runtime path",
);
assert.equal(
  clearAssignmentHandlerSource.includes("setFutureSelectedStyleId"),
  false,
  "Scalar Design Style setters must not be used for Step 3 clear",
);
const futureFabricSelectionHandler = studioSource.slice(
  studioSource.indexOf("const handleSelectFabric"),
  studioSource.indexOf("// STEP 3: Design Details"),
);
assert.equal(
  futureFabricSelectionHandler.includes("setFutureSelectedStyleId"),
  false,
);
assert.match(studioSource, /garmentConstructionSelectionMode:\s*"garment_type_locked"/);
const futurePricingBlock = studioSource.slice(
  studioSource.indexOf("const futureFabricAuthoritativePricing"),
  studioSource.indexOf("const futureConstructionPrice"),
);
assert.equal(futurePricingBlock.includes("style:"), false);
assert.equal(styleStepSource.includes("handleStyleChange"), false);
assert.equal(styleStepSource.includes("setFabricAllocationState"), false);
assert.equal(styleStepSource.includes("Upload Your Own Design"), false);
assert.equal(styleStepSource.includes("Continue with Uploaded Design"), false);
assert.match(styleStepSource, /Choose a design for/);
assert.match(styleStepSource, /Previous garment/);
assert.match(styleStepSource, /Next garment/);
assert.match(styleStepSource, /Continue to Custom Details/);
assert.match(styleStepSource, /disabled/);
const occurrenceMutationHandlers = studioSource.slice(
  studioSource.indexOf("const handleAssignFutureCatalogueStyle"),
  studioSource.indexOf("const isStageHistoricallyUnlocked"),
);
assert.equal(
  occurrenceMutationHandlers.includes("setFutureSelectedStyleId"),
  false,
  "Occurrence-scoped Step 3 mutations must not dual-write the legacy scalar style",
);
assert.equal(
  occurrenceMutationHandlers.includes("setFutureDesignSource"),
  false,
  "Occurrence-scoped Step 3 mutations must not dual-write the legacy scalar source",
);
assert.equal(
  occurrenceMutationHandlers.includes("setFuturePriceActivatedFabricCode"),
  false,
  "Occurrence-scoped Step 3 mutations must not use price activation as completion",
);
const futureDraftAutosaveEffect = studioSource.slice(
  studioSource.indexOf(
    "if (!guestDraftHydrated || isAdditionalGarmentCommitPending) return;",
  ),
  studioSource.indexOf("const handleDormantGarmentTypesChange"),
);
assert.ok(
  futureDraftAutosaveEffect.length > 0,
  "Expected to locate the future-draft autosave effect",
);
assert.match(
  futureDraftAutosaveEffect,
  /currentFutureDesignStyleDraftHydration\?\.result\.ledger\?\.revision/,
  "A Step 3 ledger revision must schedule the canonical Task 5C autosave path",
);
assert.match(stepperSource, /canEnterDesignStyle/);
assert.equal(appSource.includes("future_nine_stage"), false);
assert.equal(studioSource.includes("legacy_five_stage"), false);

console.log("PASS: future Design Style navigation, persistence, and legacy boundary");
