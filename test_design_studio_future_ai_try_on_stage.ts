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
  "Step 5 must remain locked until Step 4 content is valid.",
);

assert.deepEqual(
  DESIGN_STUDIO_STEPS.map((step) => step.id),
  [
    "garment_type",
    "fabric",
    "design_style",
    "custom_details",
    "try_on",
    "measurement",
    "summary",
    "shipping",
    "payment",
  ],
);
assert.deepEqual(DESIGN_STUDIO_STEPS[4], {
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
  "A skipped Step 5 must remain complete after draft JSON restoration.",
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
    `${workflow.status} must not unlock Step 6.`,
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
  /aria-label="Step 5: AI Try-on, completed"/,
  "Earlier completed steps must remain represented as navigable completed stages.",
);
assert.match(stepperMarkup, /aria-label="Step 7: Summary, locked"/);
assert.match(
  stepperMarkup,
  /aria-label="Step 8: Delivery &amp; Pickup, locked"/,
);
assert.match(
  stepperMarkup,
  /aria-label="Step 9: Order Review &amp; Payment, locked"/,
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
assert.match(customDetailsSource, /Continue to AI Try-on/);
assert.match(tryOnSource, /Step 5 of 9/);
assert.match(tryOnSource, /DesignStudioBackButton/);
assert.match(tryOnSource, /destination="Custom Details"/);
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
assert.match(stepperSource, /DESIGN_STUDIO_NINE_STAGE_FOUNDATION\.map/);
assert.match(stepperSource, /canEnterTryOn/);
assert.match(stepperSource, /canEnterMeasurement/);
assert.match(stepperSource, /data-step-state=\{state\}/);
assert.match(studioSource, /handleOpenDormantAiTryOnStage/);
assert.match(studioSource, /onBack=\{\(\) => setFutureStageId\("custom_details"\)\}/);
assert.match(studioSource, /gatewayAvailable: false/);
assert.match(legacyCardSource, /Coming Soon/);
assert.equal(appSource.includes("future_nine_stage"), false);

console.log("PASS: dormant future AI Try-on stage navigation and truthful UI");
