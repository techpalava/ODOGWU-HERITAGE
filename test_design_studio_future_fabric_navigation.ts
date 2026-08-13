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
const incomplete = createDormantDesignStudioJourneyState({
  mode: "future_nine_stage",
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(incomplete.currentStageId, "garment_type");
assert.equal(incomplete.canAdvance, false);
assert.equal(incomplete.nextStageId, null);

const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalog,
}).selection;
const draft = persistDormantGarmentTypeStage({
  mode: "future_nine_stage",
  currentStageId: "fabric",
  garmentTypeSelection,
  draft: {} as GuestDesignDraft,
});
const restored = createDormantDesignStudioJourneyState({
  mode: "future_nine_stage",
  persistedDraft: draft,
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(restored.currentStageId, "fabric");
assert.equal(restored.canAdvance, true);

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
assert.match(studioSource, /onSelectGarmentType=\{\(\) => setFutureStageId\("garment_type"\)\}/);
assert.match(studioSource, /onSelectFabric=\{handleOpenDormantFabricStage\}/);
assert.match(studioSource, /setFutureStageId\("fabric"\)/);
assert.match(studioSource, /setFutureStageId\("design_style"\)/);
assert.match(studioSource, /onContinue=\{handleOpenDormantDesignStyleStage\}/);
assert.equal(appSource.includes("future_nine_stage"), false);

console.log("PASS: future Fabric navigation and legacy boundary");
