import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DesignStudioJourneyStepper } from "./src/components/DesignStudioJourneyStepper";
import {
  DESIGN_STUDIO_FLOW_VARIANTS,
  DESIGN_STUDIO_TEN_STAGE_FOUNDATION,
  formatDesignStudioStepCounter,
  getDesignStudioActiveStages,
  getDesignStudioStepCounter,
} from "./src/utils/designSourceJourney";

const expectedSequence = [
  ["garment_type", "Garment Type", "Step 1 of 10"],
  ["fabric", "Fabric", "Step 2 of 10"],
  ["design_style", "Design Style", "Step 3 of 10"],
  ["custom_details", "Custom Details", "Step 4 of 10"],
  ["personalized_additions", "Personalized Additions", "Step 5 of 10"],
  ["measurement", "Measurement", "Step 6 of 10"],
  ["try_on", "AI Try-on", "Step 7 of 10"],
  ["summary", "Summary", "Step 8 of 10"],
  ["shipping", "Delivery & Pickup", "Step 9 of 10"],
  ["payment", "Order Review & Payment", "Step 10 of 10"],
] as const;

for (const variant of DESIGN_STUDIO_FLOW_VARIANTS) {
  const stages = getDesignStudioActiveStages(variant);
  assert.equal(
    stages.length,
    expectedSequence.length,
    `${variant.orderFlow}/${variant.fulfilment} must keep one stage per counter`,
  );
  const counters = stages.map((stage) =>
    getDesignStudioStepCounter(stage.id, variant),
  );
  const total = counters[0]?.total;
  assert.equal(total, expectedSequence.length);
  counters.forEach((counter, index) => {
    const [stageId, title, label] = expectedSequence[index];
    assert.equal(counter.stageId, stageId);
    assert.equal(counter.title, title);
    assert.equal(counter.step, index + 1);
    assert.equal(counter.total, total);
    assert.equal(counter.label, label);
    assert.equal(formatDesignStudioStepCounter(counter.stageId, variant), label);
    assert.equal(
      counter.step,
      stages[index]?.position,
      "displayed step number must match the stage's place in the active list",
    );
  });
  assert.deepEqual(
    counters.map((counter) => counter.label),
    counters.map((counter) => formatDesignStudioStepCounter(counter.stageId)),
    `${variant.orderFlow}/${variant.fulfilment} must use the same counter as the default journey`,
  );
}

assert.deepEqual(
  DESIGN_STUDIO_TEN_STAGE_FOUNDATION.map((stage) => stage.id),
  expectedSequence.map(([stageId]) => stageId),
);

const stepperMarkup = renderToStaticMarkup(
  createElement(DesignStudioJourneyStepper, {
    currentStageId: "shipping",
    highestUnlockedStageIndex: 8,
    canEnterFabric: true,
    canEnterDesignStyle: true,
    canEnterCustomDetails: true,
    canEnterPersonalizedAdditions: true,
    canEnterTryOn: true,
    canEnterMeasurement: true,
    canEnterSummary: true,
    canEnterShipping: true,
    canEnterPayment: false,
    onSelectGarmentType: () => undefined,
    onSelectFabric: () => undefined,
    onSelectDesignStyle: () => undefined,
    onSelectCustomDetails: () => undefined,
    onSelectPersonalizedAdditions: () => undefined,
    onSelectTryOn: () => undefined,
    onSelectMeasurement: () => undefined,
    onSelectSummary: () => undefined,
    onSelectShipping: () => undefined,
    onSelectPayment: () => undefined,
  }),
);

for (const [stageId, , label] of expectedSequence) {
  assert.ok(
    stepperMarkup.includes(`data-stage-id="${stageId}"`),
    `stepper must include ${stageId}`,
  );
  assert.ok(
    stepperMarkup.includes(`data-step-counter="${label}"`),
    `stepper counter for ${stageId} must be ${label}`,
  );
}
assert.equal(stepperMarkup.includes("Step 8 of 9"), false);
assert.equal(stepperMarkup.includes("Step 5 of 9"), false);
assert.equal(stepperMarkup.includes("of 9"), false);

const stageScreens: ReadonlyArray<readonly [string, string]> = [
  ["src/components/GarmentTypeStep.tsx", '"garment_type"'],
  ["src/components/DormantFutureFabricStep.tsx", '"fabric"'],
  ["src/components/DormantFutureDesignStyleStep.tsx", '"design_style"'],
  ["src/components/DormantFutureCustomDetailsStep.tsx", "stage"],
  ["src/components/DormantFutureAiTryOnStep.tsx", '"try_on"'],
  ["src/components/DormantFutureMeasurementStep.tsx", '"measurement"'],
  ["src/components/DormantFutureSummaryStep.tsx", '"summary"'],
  ["src/components/DormantFutureShippingStep.tsx", '"shipping"'],
  ["src/components/DormantFuturePaymentReviewStep.tsx", '"payment"'],
  ["src/components/VirtualTryOnIntegrationCard.tsx", '"try_on"'],
];

for (const [file, stageArgument] of stageScreens) {
  const source = readFileSync(file, "utf8");
  assert.match(
    source,
    new RegExp(`formatDesignStudioStepCounter\\(\\s*${stageArgument}\\s*\\)`),
    `${file} must read its Step X of Y label from the shared counter`,
  );
  assert.equal(
    /Step \d+ of \d+/.test(source),
    false,
    `${file} must not hardcode a step counter`,
  );
}

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.match(
  studioSource,
  /formatDesignStudioStepCounter\(\s*futureStageId\s*\)/,
  "the stage region label must use the same counter as the screen header",
);
assert.equal(/Step \d+ of \d+/.test(studioSource), false);

const shippingSource = readFileSync(
  "src/components/DormantFutureShippingStep.tsx",
  "utf8",
);
assert.equal(
  shippingSource.includes("Step 8 only adds"),
  false,
  "Delivery & Pickup copy must not keep the pre-split step number",
);
assert.match(shippingSource, /type="email"/);
assert.match(shippingSource, /WhatsApp/);

for (const file of readdirSync("src/components")) {
  if (!file.endsWith(".tsx")) continue;
  const source = readFileSync(`src/components/${file}`, "utf8");
  assert.equal(
    /Step \d+ of \d+/.test(source),
    false,
    `${file} still hardcodes a Step X of Y counter`,
  );
}

console.log("PASS: Design Studio step counters share one sequence");
