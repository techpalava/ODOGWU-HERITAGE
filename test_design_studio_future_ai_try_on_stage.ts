import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  isFutureCustomDetailsContentReady,
} from "./src/utils/aiTryOnWorkflow";
import {
  createDormantDesignStudioJourneyState,
} from "./src/utils/designStudioJourneyMode";
import type { GarmentTypeStepSelection } from "./src/types";

assert.equal(
  isFutureCustomDetailsContentReady({ status: "complete", blockers: [] }),
  true,
);
assert.equal(
  isFutureCustomDetailsContentReady({
    status: "pricing_pending",
    blockers: [
      {
        code: "pricing_evaluation_required",
        message: "Evaluation required",
      },
    ],
  }),
  true,
  "Evaluation-required pricing must not trap valid content on Step 4.",
);
assert.equal(
  isFutureCustomDetailsContentReady({ status: "incomplete", blockers: [] }),
  false,
);
assert.equal(
  isFutureCustomDetailsContentReady({ status: "invalid", blockers: [] }),
  false,
);

const catalog = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const garmentTypeSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: {
      status: "resolved",
      garmentType: "shirt",
      components: [
        {
          componentKey: "shirt:shirt_construction:shirt_standard_short",
          optionId: "shirt_standard_short",
          selectionGroup: "shirt_construction",
          priceCents: 6500,
          price: 65,
        },
      ],
      totalPriceCents: 6500,
      totalPrice: 65,
    },
  },
};
assert.equal(
  createDormantDesignStudioJourneyState({
    mode: "future_nine_stage",
    persistedDraft: { currentStageId: "try_on", garmentTypeSelection },
    normalizedCustomDetailCatalog: catalog.activeOptions,
    isFabricStageComplete: true,
    isCustomDetailsStageReady: true,
  }).currentStageId,
  "try_on",
);
assert.equal(
  createDormantDesignStudioJourneyState({
    mode: "future_nine_stage",
    persistedDraft: { currentStageId: "try_on", garmentTypeSelection },
    normalizedCustomDetailCatalog: catalog.activeOptions,
    isFabricStageComplete: true,
    isCustomDetailsStageReady: false,
  }).currentStageId,
  "custom_details",
  "Step 5 must remain locked until Step 4 content is valid.",
);

const customDetailsSource = readFileSync(
  "src/components/DormantFutureCustomDetailsStep.tsx",
  "utf8",
);
const tryOnSource = readFileSync(
  "src/components/DormantFutureAiTryOnStep.tsx",
  "utf8",
);
const stepperSource = readFileSync(
  "src/components/DormantFutureJourneyStepper.tsx",
  "utf8",
);
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const legacyCardSource = readFileSync(
  "src/components/VirtualTryOnIntegrationCard.tsx",
  "utf8",
);
const appSource = readFileSync("src/App.tsx", "utf8");

assert.match(customDetailsSource, /isFutureCustomDetailsContentReady/);
assert.match(customDetailsSource, /onContinue/);
assert.match(customDetailsSource, /Continue to AI Try-on/);
assert.match(tryOnSource, /Step 5 of 9/);
assert.match(tryOnSource, /Back to Custom Details/);
assert.match(tryOnSource, /Continue to Measurement is locked/);
assert.match(tryOnSource, /aria-live="polite"/);
assert.match(tryOnSource, /Continue without AI Try-on/);
assert.match(tryOnSource, /AI Try-on is currently unavailable/);
assert.match(tryOnSource, /You chose to continue without AI Try-on/);
assert.match(tryOnSource, /getAiTryOnWorkflowAllowedActions/);
assert.equal(tryOnSource.includes("Reference:"), false);
assert.equal(tryOnSource.includes("workflow.failure.code"), false);
assert.equal(tryOnSource.includes("jobId"), false);
assert.equal(tryOnSource.includes("assetId"), false);
assert.equal(tryOnSource.includes("setTimeout"), false);
assert.equal(tryOnSource.includes("<input"), false);
assert.equal(tryOnSource.includes("type=\"file\""), false);
assert.match(stepperSource, /\{ id: "try_on", label: "AI Try-on" \}/);
assert.match(stepperSource, /canEnterTryOn/);
assert.match(
  stepperSource,
  /step\.id === "custom_details"[\s\S]*currentStageId === "try_on"[\s\S]*currentStageId === "measurement"/,
);
assert.match(studioSource, /handleOpenDormantAiTryOnStage/);
assert.match(studioSource, /onBack=\{\(\) => setFutureStageId\("custom_details"\)\}/);
assert.match(studioSource, /gatewayAvailable: false/);
assert.match(legacyCardSource, /Coming Soon/);
assert.equal(appSource.includes("future_nine_stage"), false);

console.log("PASS: dormant future AI Try-on stage navigation and truthful UI");
