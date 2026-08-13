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
  mode: "future_nine_stage",
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
  mode: "future_nine_stage",
  persistedDraft: serialized,
  normalizedCustomDetailCatalog: catalog,
  isFabricStageComplete: false,
});
assert.equal(blockedWithoutFabric.currentStageId, "fabric");

const blockedWithIncompleteGarment = createDormantDesignStudioJourneyState({
  mode: "future_nine_stage",
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
  mode: "future_nine_stage",
  persistedDraft: serialized,
  normalizedCustomDetailCatalog: catalog,
  isFabricStageComplete: true,
});
assert.equal(restoredWithFabric.currentStageId, "design_style");

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const styleStepSource = readFileSync(
  "src/components/DormantFutureDesignStyleStep.tsx",
  "utf8",
);
const stepperSource = readFileSync(
  "src/components/DormantFutureJourneyStepper.tsx",
  "utf8",
);
const appSource = readFileSync("src/App.tsx", "utf8");

assert.match(studioSource, /setFutureSelectedStyleId/);
assert.match(studioSource, /onSelectStyle=\{setFutureSelectedStyleId\}/);
assert.match(studioSource, /onContinue=\{handleOpenDormantDesignStyleStage\}/);
assert.match(studioSource, /futureFabricStageCompletion\.isComplete/);
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
assert.match(styleStepSource, /Continue to Custom Details/);
assert.match(styleStepSource, /disabled/);
assert.match(stepperSource, /canEnterDesignStyle/);
assert.equal(appSource.includes("future_nine_stage"), false);
assert.match(studioSource, /journeyMode = "legacy_five_stage"/);

console.log("PASS: future Design Style navigation, persistence, and legacy boundary");
