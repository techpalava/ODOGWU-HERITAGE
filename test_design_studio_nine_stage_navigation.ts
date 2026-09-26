import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DESIGN_STUDIO_STEPS,
  getDesignStudioJourneyStepState,
} from "./src/components/DesignStudioJourneyStepper";

assert.equal(DESIGN_STUDIO_STEPS.length, 10);
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

assert.equal(
  getDesignStudioJourneyStepState({
    stepIndex: 3,
    currentStageIndex: 3,
    isUnlocked: true,
  }),
  "current",
);
assert.equal(
  getDesignStudioJourneyStepState({
    stepIndex: 2,
    currentStageIndex: 3,
    isUnlocked: true,
  }),
  "completed",
);
assert.equal(
  getDesignStudioJourneyStepState({
    stepIndex: 4,
    currentStageIndex: 3,
    isUnlocked: true,
  }),
  "available",
);
assert.equal(
  getDesignStudioJourneyStepState({
    stepIndex: 5,
    currentStageIndex: 3,
    isUnlocked: false,
  }),
  "locked",
);
assert.equal(
  getDesignStudioJourneyStepState({
    stepIndex: 0,
    currentStageIndex: 3,
    isUnlocked: true,
  }),
  "completed",
  "Previously unlocked earlier stages remain navigable.",
);
assert.equal(
  getDesignStudioJourneyStepState({
    stepIndex: 0,
    currentStageIndex: 3,
    isUnlocked: false,
  }),
  "locked",
  "Never-unlocked earlier stages stay locked.",
);

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const stepperSource = readFileSync(
  "src/components/DesignStudioJourneyStepper.tsx",
  "utf8",
);
const backButtonSource = readFileSync(
  "src/components/DesignStudioBackButton.tsx",
  "utf8",
);
const garmentTypeSource = readFileSync(
  "src/components/GarmentTypeStep.tsx",
  "utf8",
);

assert.match(
  studioSource,
  /useState<DesignStudioStageId>\("garment_type"\)/,
  "A fresh current Studio entry must start at Garment Type (Step 1).",
);
assert.match(stepperSource, /getDesignStudioJourneyStepState/);
assert.match(stepperSource, /data-step-state=\{state\}/);
assert.match(stepperSource, /data-stage-clickable=/);
assert.match(stepperSource, /highestUnlockedStageIndex/);
assert.match(stepperSource, /disabled=\{!isClickable\}/);
assert.match(stepperSource, /bg-heritage-green\/10/);
assert.match(stepperSource, /border-heritage-green\/25 bg-white text-heritage-ink/);
assert.match(backButtonSource, /<button/);
assert.match(backButtonSource, /aria-label=\{label\}/);
assert.match(backButtonSource, /min-h-12/);
assert.match(backButtonSource, /text-heritage-ink/);
assert.match(backButtonSource, /Back one step/);
assert.match(garmentTypeSource, /backDisabled/);

for (const file of [
  "DormantFutureFabricStep.tsx",
  "DormantFutureDesignStyleStep.tsx",
  "DormantFutureCustomDetailsStep.tsx",
  "DormantFutureAiTryOnStep.tsx",
  "DormantFutureMeasurementStep.tsx",
  "DormantFutureSummaryStep.tsx",
  "DormantFutureShippingStep.tsx",
  "DormantFuturePaymentReviewStep.tsx",
]) {
  const source = readFileSync(`src/components/${file}`, "utf8");
  assert.match(source, /DesignStudioBackButton/);
}

assert.match(studioSource, /onBack=\{\(\) => navigateToFutureStage\("garment_type"\)\}/);
assert.match(
  studioSource,
  /futureStageId === "custom_details"\s*\? "design_style"\s*:\s*"custom_details"/,
);
assert.match(
  studioSource,
  /onBack=\{\(\) => navigateToFutureStage\("personalized_additions"\)\}/,
);
assert.match(studioSource, /onBack=\{\(\) => navigateToFutureStage\("shipping"\)\}/);
assert.equal(studioSource.includes("legacy_five_stage"), false);

console.log("PASS: ten-stage navigation states and back controls");
