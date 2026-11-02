import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import {
  DesignStudioJourneyStepper,
  DESIGN_STUDIO_STEPS,
} from "./src/components/DesignStudioJourneyStepper";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  createEmptyAiTryOnWorkflowState,
  getAiTryOnWorkflowAllowedActions,
  isFutureCustomDetailsContentReady,
  normalizeAiTryOnWorkflowState,
  reconcileAiTryOnWorkflow,
  transitionAiTryOnWorkflow,
} from "./src/utils/aiTryOnWorkflow";
import {
  createDormantDesignStudioJourneyState,
} from "./src/utils/designStudioJourneyMode";
import { isFutureMeasurementStageUnlocked } from "./src/utils/measurementBlueprint";
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
    persistedDraft: { currentStageId: "try_on", garmentTypeSelection },
    normalizedCustomDetailCatalog: catalog.activeOptions,
    isFabricStageComplete: true,
    isCustomDetailsStageReady: true,
  }).currentStageId,
  "try_on",
);
assert.equal(
  createDormantDesignStudioJourneyState({
    persistedDraft: { currentStageId: "try_on", garmentTypeSelection },
    normalizedCustomDetailCatalog: catalog.activeOptions,
    isFabricStageComplete: true,
    isCustomDetailsStageReady: false,
  }).currentStageId,
  "custom_details",
  "AI Try-on stays on Custom Details until that step's content is valid.",
);

assert.deepEqual(
  DESIGN_STUDIO_STEPS.map((step) => step.id),
  [
    "garment_type",
    "fabric",
    "design_style",
    "custom_details",
    "personalized_additions",
    "try_on",
    "measurement",
    "summary",
    "shipping",
    "payment",
  ],
);
assert.deepEqual(DESIGN_STUDIO_STEPS[4], {
  id: "personalized_additions",
  label: "Personalized Additions",
});
assert.deepEqual(DESIGN_STUDIO_STEPS[5], {
  id: "try_on",
  label: "AI Try-on",
});

const inputFingerprint = "tryon-v1-test-input";
const unavailableWorkflow = reconcileAiTryOnWorkflow({
  state: createEmptyAiTryOnWorkflowState(),
  currentInputFingerprint: inputFingerprint,
  policy: { gatewayAvailable: false, skipAllowed: true },
});
const skippedTransition = transitionAiTryOnWorkflow({
  state: unavailableWorkflow,
  event: { type: "skip" },
  skipAllowed: true,
});
assert.equal(skippedTransition.ok, true);
const skippedWorkflow = skippedTransition.ok
  ? skippedTransition.state
  : unavailableWorkflow;
assert.equal(isFutureMeasurementStageUnlocked(skippedWorkflow), true);
assert.deepEqual(
  normalizeAiTryOnWorkflowState(JSON.parse(JSON.stringify(skippedWorkflow))),
  skippedWorkflow,
  "A skipped Step 6 must remain complete after draft JSON restoration.",
);

const readyWorkflow = reconcileAiTryOnWorkflow({
  state: createEmptyAiTryOnWorkflowState(),
  currentInputFingerprint: inputFingerprint,
  policy: { gatewayAvailable: true, skipAllowed: true },
});
const processingTransition = transitionAiTryOnWorkflow({
  state: readyWorkflow,
  event: {
    type: "start",
    jobReference: { kind: "resumable_job", jobId: "try-on-job-1" },
  },
  skipAllowed: true,
});
assert.equal(processingTransition.ok, true);
const processingWorkflow = processingTransition.ok
  ? processingTransition.state
  : readyWorkflow;
const completedTransition = transitionAiTryOnWorkflow({
  state: processingWorkflow,
  event: {
    type: "complete",
    resultReference: {
      kind: "verified_private_try_on_result",
      assetId: "private-result-1",
      ownerBindingId: "owner-binding-1",
    },
  },
  skipAllowed: true,
});
assert.equal(completedTransition.ok, true);
assert.equal(
  isFutureMeasurementStageUnlocked(
    completedTransition.ok ? completedTransition.state : processingWorkflow,
  ),
  true,
  "Only a verified completion transition may complete AI Try-on.",
);

[
  unavailableWorkflow,
  processingWorkflow,
  {
    schemaVersion: 1 as const,
    status: "failed" as const,
    inputFingerprint,
    failure: { code: "interrupted" as const, retryable: true },
  },
  {
    schemaVersion: 1 as const,
    status: "stale" as const,
    inputFingerprint,
  },
  {
    schemaVersion: 1 as const,
    status: "awaiting_input" as const,
    inputFingerprint: null,
  },
].forEach((workflow) => {
  assert.equal(
    isFutureMeasurementStageUnlocked(workflow),
    false,
    `${workflow.status} must not unlock Measurement (Step 7).`,
  );
});
assert.deepEqual(
  getAiTryOnWorkflowAllowedActions({
    state: processingWorkflow,
    skipAllowed: true,
  }),
  { canRetry: false, canSkip: false },
);

const stepperMarkup = renderToStaticMarkup(
  createElement(DesignStudioJourneyStepper, {
    currentStageId: "measurement",
    highestUnlockedStageIndex: 5,
    canEnterFabric: true,
    canEnterDesignStyle: true,
    canEnterCustomDetails: true,
    canEnterTryOn: true,
    canEnterMeasurement: true,
    canEnterSummary: false,
    canEnterShipping: false,
    canEnterPayment: false,
    onSelectGarmentType: () => undefined,
    onSelectFabric: () => undefined,
    onSelectDesignStyle: () => undefined,
    onSelectCustomDetails: () => undefined,
    onSelectTryOn: () => undefined,
    onSelectMeasurement: () => undefined,
    onSelectSummary: () => undefined,
    onSelectShipping: () => undefined,
    onSelectPayment: () => undefined,
  }),
);
assert.match(
  stepperMarkup,
  /aria-label="Step 5: Personalized Additions, completed"/,
);
assert.match(
  stepperMarkup,
  /aria-label="Step 6: AI Try-on, completed"/,
  "Earlier completed steps must remain represented as navigable completed stages.",
);
assert.match(stepperMarkup, /aria-label="Step 8: Summary, locked"/);
assert.match(
  stepperMarkup,
  /aria-label="Step 9: Delivery &amp; Pickup, locked"/,
);
assert.match(
  stepperMarkup,
  /aria-label="Step 10: Order Review &amp; Payment, locked"/,
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
  "src/components/DesignStudioJourneyStepper.tsx",
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
assert.match(
  customDetailsSource,
  /const nextStageLabel = isPersonalizedAdditionsStage\s*\?\s*"AI Try-on"\s*:\s*"Personalized Additions"/,
);
assert.match(customDetailsSource, /Continue to \$\{nextStageLabel\}/);
assert.match(tryOnSource, /formatDesignStudioStepCounter\("try_on"\)/);
assert.match(tryOnSource, /DesignStudioBackButton/);
assert.match(tryOnSource, /const previousStageLabel = "Personalized Additions"/);
assert.equal((tryOnSource.match(/backDestination=\{previousStageLabel\}/g) || []).length, 2);
assert.equal(tryOnSource.includes('backDestination="Custom Details"'), false);
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
// Step 5 (approved design): the photo picker lives only in the live panel,
// which the step renders only when GET /api/ai-try-on reports available.
// The step shell itself still has no input and no photo handling.
assert.equal(tryOnSource.includes("<input"), false);
assert.equal(tryOnSource.includes("type=\"file\""), false);
assert.match(tryOnSource, /livePanel\?: ReactNode/);
assert.match(tryOnSource, /You can continue with your order without a Try-on preview\./);
const livePanelSource = readFileSync("src/components/AiTryOnPhotoPanel.tsx", "utf8");
assert.match(livePanelSource, /type="file"/);
assert.match(livePanelSource, /accept=\{AI_TRY_ON_PHOTO_ACCEPT\}/);
assert.equal(livePanelSource.includes("type=\"checkbox\""), false, "consent is a notice, not a checkbox");
// Privacy boundary: no photo or preview data is persisted in workflow state,
// the draft, or browser storage.
assert.equal(livePanelSource.includes("assetId"), false);
assert.equal(livePanelSource.includes("jobId"), false);
assert.equal(/localStorage|sessionStorage|indexedDB/.test(livePanelSource), false);
assert.match(stepperSource, /DESIGN_STUDIO_TEN_STAGE_FOUNDATION\.map/);
assert.match(stepperSource, /canEnterTryOn/);
assert.match(stepperSource, /canEnterMeasurement/);
assert.match(stepperSource, /data-step-state=\{state\}/);
assert.match(studioSource, /handleOpenDormantAiTryOnStage/);
assert.match(
  studioSource,
  /onBack=\{\(\) => handleBackDuringSummaryEdit\("personalized_additions"\)\}/,
);
// Availability comes from GET /api/ai-try-on (Step 5); unknown/unavailable → false.
assert.match(studioSource, /gatewayAvailable: aiTryOnGatewayAvailable/);
assert.match(studioSource, /aiTryOnAvailability\.status === "available"/);
assert.equal(studioSource.includes("gatewayAvailable: true"), false);
// Skip is hidden while a preview is generating (Xavier, Step 5).
assert.match(tryOnSource, /\{canSkip && !generating && \(/);
assert.match(studioSource, /onGeneratingChange=\{setAiTryOnGenerating\}/);
assert.match(studioSource, /generating=\{aiTryOnGenerating\}/);
assert.match(legacyCardSource, /Coming Soon/);
assert.equal(appSource.includes("future_nine_stage"), false);

console.log("PASS: dormant future AI Try-on stage navigation and truthful UI");
