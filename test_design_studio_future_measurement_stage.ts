import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import type { GarmentTypeStepSelection } from "./src/types";
import {
  createEmptyFutureMeasurementState,
  planMeasurementRequirements,
  setFutureMeasurementInput,
  setFutureMeasurementRoute,
} from "./src/utils/measurementBlueprint";

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const measurementSource = readFileSync("src/components/DormantFutureMeasurementStep.tsx", "utf8");
const stepperSource = readFileSync("src/components/DesignStudioJourneyStepper.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");

assert.match(studioSource, /futureMeasurementState/);
assert.match(studioSource, /handleOpenDormantMeasurementStage/);
assert.match(studioSource, /futureStageId === "measurement"/);
assert.match(studioSource, /futureMeasurementState,/);
assert.match(measurementSource, /Dimension \/ Measurement/);
assert.match(measurementSource, /Enter the complete measurements required for your selected garments\./);
assert.match(measurementSource, /Enter the required measurements\. Optional values are calculated from height where available\./);
assert.match(measurementSource, /Required Measurements/);
assert.match(measurementSource, /Optional Measurements/);
assert.match(measurementSource, /Calculated from height/);
assert.match(measurementSource, /These values fill in from Total Height once the required measurements are complete\./);
assert.match(measurementSource, /Please recheck this measurement\./);
assert.match(measurementSource, /saved/);
assert.match(measurementSource, /Shared Body Measurements/);
assert.match(measurementSource, /Shared body measurements are entered once and used for all applicable garments\./);
assert.match(measurementSource, /Measurement setup pending/);
assert.match(measurementSource, /awaiting confirmation\. You can continue reviewing measurements for your other garments\./);
assert.match(measurementSource, /aria-invalid/);
assert.match(measurementSource, /Enter a positive measurement value\./);
assert.match(measurementSource, /Current route status/);
assert.match(measurementSource, /MEASUREMENT_RISK_ROUTE_LABELS\.low_risk/);
assert.match(measurementSource, /MEASUREMENT_RISK_ROUTE_LABELS\.medium_risk/);
assert.match(measurementSource, /MEASUREMENT_RISK_ROUTE_LABELS\.high_risk/);
assert.match(measurementSource, /MEASUREMENT_RISK_ROUTE_LABELS\.critical_risk/);
assert.match(measurementSource, /Body Measurements/);
assert.match(measurementSource, /data-measurement-option-heading="body"/);
assert.match(measurementSource, /data-measurement-option-subtitle="risk"/);
assert.match(measurementSource, /Measurement by Risk Level/);
assert.match(measurementSource, /MEASUREMENT_SAMPLE_CLOTH_LABEL/);
assert.match(measurementSource, /MEASUREMENT_SAMPLE_CLOTH_DESCRIPTION/);
assert.match(measurementSource, /MEASUREMENT_SAMPLE_CLOTH_FORM_TITLE/);
assert.match(measurementSource, /data-measurement-risk-selector/);
assert.match(measurementSource, /data-measurement-sample-selector/);
assert.match(measurementSource, /data-measurement-option-section="risk"/);
assert.match(measurementSource, /data-measurement-option-section="sample_cloth"/);
assert.match(measurementSource, /data-measurement-form=\{selectedMethod\}/);
assert.match(measurementSource, /data-measurement-section/);
assert.match(measurementSource, /MEASUREMENT_RISK_SELECTION_NOTICE/);
assert.match(measurementSource, /aria-describedby="measurement-risk-selection-notice"/);
assert.match(measurementSource, /DesignStudioBackButton/);
assert.match(measurementSource, /backDestination="AI Try-on"/);
assert.match(measurementSource, /Continue to Summary/);
assert.match(measurementSource, /isFutureSummaryUnlockedByMeasurements\(resolvedState\)/);
assert.equal(
  measurementSource.includes("Summary remains locked until Low Risk measurements are complete. Mid and High Risk calculations are still pending."),
  false,
);
assert.equal(measurementSource.includes("Your completed Low Risk measurements are ready for review."), false);
assert.equal(measurementSource.includes("LOW OR NO RISK"), false);
assert.equal(measurementSource.includes("Low / No Risk"), false);
assert.match(measurementSource, /aria-live="polite"/);
assert.match(stepperSource, /canEnterMeasurement/);
assert.match(stepperSource, /step\.id === "measurement"/);
assert.equal(appSource.includes("future_nine_stage"), false);
assert.equal(studioSource.includes("legacy_five_stage"), false);

console.log("PASS: dormant future Measurement stage integration and production lock");

const shirtConstruction = {
  status: "resolved" as const,
  garmentType: "shirt" as const,
  components: [{
    componentKey: "shirt:shirt_construction:shirt_std_short",
    optionId: "shirt_std_short",
    selectionGroup: "shirt_construction" as const,
    priceCents: 1,
    price: 0.01,
  }],
  totalPriceCents: 1,
  totalPrice: 0.01,
};
const shirtSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: { shirt: shirtConstruction },
};
const physicalShirts = [
  { garmentKey: "base:shirt", garmentType: "shirt" as const },
  { garmentKey: "additional:shirt:1", garmentType: "shirt" as const },
];
const headingText = (markup: { children?: unknown } | string | null | undefined): string => {
  if (markup == null || typeof markup === "boolean") return "";
  if (typeof markup === "string" || typeof markup === "number") return String(markup);
  if (typeof markup !== "object") return "";
  const children = Array.isArray(markup.children) ? markup.children : markup.children != null ? [markup.children] : [];
  return children.map((child) => headingText(child as never)).join("");
};
const renderMeasurement = (
  garmentKeys: readonly string[],
) => {
  const state = setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk");
  const plan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: physicalShirts.filter((garment) => garmentKeys.includes(garment.garmentKey)),
    additionalGarmentConstructions: {
      schemaVersion: 1,
      byGarmentKey: { "additional:shirt:1": shirtConstruction },
    },
  });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(DormantFutureMeasurementStep, {
      plan,
      state,
      physicalGarments: physicalShirts,
      onChange: () => undefined,
      onRouteChange: () => undefined,
      onBack: () => undefined,
      onContinue: () => undefined,
    }));
  });
  return headingText(renderer.root);
};

const oneShirtText = renderMeasurement(["base:shirt"]);
assert.ok(oneShirtText.includes("Standard Shirt Measurements"));
assert.equal(oneShirtText.includes("Standard Shirt 1"), false);
assert.equal(oneShirtText.includes("Standard Shirt 2"), false);

const bothShirtsText = renderMeasurement(["base:shirt", "additional:shirt:1"]);
assert.ok(bothShirtsText.includes("Standard Shirt"));
assert.ok(bothShirtsText.includes("Standard Shirt 2"));
assert.ok(bothShirtsText.includes("Standard Shirt Measurements"));
assert.equal(bothShirtsText.includes("Standard Shirt 2 Measurements"), false);
assert.equal(bothShirtsText.includes("Standard Shirt 1"), false);
const bothState = setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk");
const bothPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments: physicalShirts,
  additionalGarmentConstructions: {
    schemaVersion: 1,
    byGarmentKey: { "additional:shirt:1": shirtConstruction },
  },
});
let bothRenderer!: ReturnType<typeof create>;
act(() => {
  bothRenderer = create(createElement(DormantFutureMeasurementStep, {
    plan: bothPlan,
    state: bothState,
    physicalGarments: physicalShirts,
    onChange: () => undefined,
    onRouteChange: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  }));
});
act(() => {
  bothRenderer.root.findByProps({ "data-measurement-garment": "additional:shirt:1" }).props.onClick();
});
const secondShirtText = headingText(bothRenderer.root);
assert.ok(secondShirtText.includes("Standard Shirt 2 Measurements"));
assert.equal(secondShirtText.includes("Standard Shirt Measurements"), false);

const adaOnlyText = renderMeasurement(["additional:shirt:1"]);
assert.ok(adaOnlyText.includes("Standard Shirt 2 Measurements"));
assert.equal(adaOnlyText.includes("Standard Shirt Measurements"), false);

const storedPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments: physicalShirts,
  additionalGarmentConstructions: {
    schemaVersion: 1,
    byGarmentKey: { "additional:shirt:1": shirtConstruction },
  },
});
const lengthRequirement = storedPlan.requirements.find(
  (requirement) =>
    requirement.garmentKey === "additional:shirt:1" && requirement.scope === "garment",
);
assert.ok(lengthRequirement);
const stored = setFutureMeasurementInput({
  state: setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk"),
  requirement: lengthRequirement!,
  displayValue: 28,
});
assert.ok(stored.entered.byGarmentKey["additional:shirt:1"]);
assert.equal(stored.entered.byGarmentKey["base:shirt"], undefined);
assert.equal("Standard Shirt 2" in stored.entered.byGarmentKey, false);
