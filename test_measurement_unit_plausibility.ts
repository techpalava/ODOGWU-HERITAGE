import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import type { GarmentTypeStepSelection } from "./src/types";
import {
  createEmptyFutureMeasurementState,
  DEFAULT_CUSTOMER_MEASUREMENT_UNIT,
  formatDualUnitMeasurementDisplay,
  inchesToCentimetres,
  isFutureSummaryUnlockedByMeasurements,
  isImplausibleCanonicalMeasurement,
  normalizeFutureMeasurementState,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  setFutureMeasurementUnit,
} from "./src/utils/measurementBlueprint";

const construction = {
  status: "resolved" as const,
  garmentType: "shirt" as const,
  components: [{
    componentKey: "shirt:shirt_construction:shirt_std_short",
    optionId: "shirt_std_short",
    selectionGroup: "shirt_construction",
    priceCents: 1,
    price: 0.01,
  }],
  totalPriceCents: 1,
  totalPrice: 0.01,
};
const selection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: { shirt: construction },
};
const physicalGarments = [{ garmentKey: "base:shirt", garmentType: "shirt" as const }];
const plan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: selection,
  physicalGarments,
});

assert.equal(DEFAULT_CUSTOMER_MEASUREMENT_UNIT, "cm");
assert.equal(createEmptyFutureMeasurementState().unit, "cm");
assert.equal(createEmptyFutureMeasurementState("low_risk").unit, "cm");

const persistedInches = normalizeFutureMeasurementState(
  createEmptyFutureMeasurementState("low_risk", "inch"),
);
assert.equal(persistedInches?.unit, "inch");

const direct = plan.requirements.filter((requirement) => requirement.directInput);
const byId = (measurementId: string) =>
  direct.find((requirement) => requirement.measurementId === measurementId)!;

const enter = (
  unit: "cm" | "inch",
  values: Record<string, number>,
) => {
  let state = createEmptyFutureMeasurementState("low_risk", unit);
  for (const [measurementId, displayValue] of Object.entries(values)) {
    state = setFutureMeasurementInput({
      state,
      requirement: byId(measurementId),
      displayValue,
    });
  }
  return reconcileFutureMeasurementState({ state, plan });
};

const plausibleCm = enter("cm", {
  total_height: 175,
  chest_bust_circumference: 100,
});
assert.equal(
  plausibleCm.diagnostics.some((diagnostic) => diagnostic.code === "implausible_measurement_value"),
  false,
);
assert.equal(plausibleCm.entered.shared.chest_bust_circumference?.valueCm, 100);
assert.equal(plausibleCm.entered.shared.total_height?.valueCm, 175);
assert.equal(
  formatDualUnitMeasurementDisplay(100, "cm"),
  "100 cm (39.37 in)",
);

const childCm = enter("cm", {
  total_height: 110,
  chest_bust_circumference: 55,
});
assert.equal(
  childCm.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "implausible_measurement_value" &&
      (diagnostic.measurementId === "total_height" ||
        diagnostic.measurementId === "chest_bust_circumference"),
  ),
  false,
);

const plausibleInches = enter("inch", {
  total_height: 69,
  chest_bust_circumference: 40,
});
assert.equal(
  plausibleInches.diagnostics.some((diagnostic) => diagnostic.code === "implausible_measurement_value"),
  false,
);
assert.ok(
  Math.abs((plausibleInches.entered.shared.total_height?.valueCm ?? 0) - inchesToCentimetres(69)) < 1e-9,
);
assert.equal(isFutureSummaryUnlockedByMeasurements(plausibleInches), plausibleInches.calculationStatus === "complete");

const absurdInches = enter("inch", {
  total_height: 175,
  chest_bust_circumference: 100,
});
assert.equal(absurdInches.calculationStatus, "invalid");
assert.equal(isFutureSummaryUnlockedByMeasurements(absurdInches), false);
for (const measurementId of ["total_height", "chest_bust_circumference"] as const) {
  assert.equal(
    absurdInches.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "implausible_measurement_value" &&
        diagnostic.measurementId === measurementId,
    ),
    true,
    `${measurementId} typed as inches must be blocked`,
  );
}
assert.equal(
  absurdInches.entered.shared.chest_bust_circumference?.valueCm,
  inchesToCentimetres(100),
);
assert.equal(isImplausibleCanonicalMeasurement(254, "chest_bust_circumference", "circumference"), true);
assert.equal(isImplausibleCanonicalMeasurement(444.5, "total_height", "total_height"), true);
assert.equal(isImplausibleCanonicalMeasurement(100, "chest_bust_circumference", "circumference"), false);
assert.equal(isImplausibleCanonicalMeasurement(175, "total_height", "total_height"), false);

const switched = setFutureMeasurementUnit(absurdInches, "cm");
assert.equal(switched.unit, "cm");
assert.equal(
  switched.entered.shared.total_height?.valueCm,
  absurdInches.entered.shared.total_height?.valueCm,
  "Changing the unit converts the display and keeps the stored centimetres.",
);

const freshMarkup = renderToStaticMarkup(
  createElement(DormantFutureMeasurementStep, {
    plan,
    state: createEmptyFutureMeasurementState("low_risk", "cm"),
    physicalGarments,
    onChange: () => undefined,
    onRouteChange: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  }),
);
assert.match(freshMarkup, /data-measurement-entry-unit="cm"/);
assert.match(freshMarkup, /Numbers you type are centimetres/);
assert.match(freshMarkup, /Step 7 of 10/);
assert.equal(freshMarkup.includes("Step 7 of 9"), false);

const absurdMarkup = renderToStaticMarkup(
  createElement(DormantFutureMeasurementStep, {
    plan,
    state: absurdInches,
    physicalGarments,
    onChange: () => undefined,
    onRouteChange: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  }),
);
assert.match(absurdMarkup, /data-measurement-implausible="true"/);
assert.match(absurdMarkup, /outside the plausible range/);
assert.match(absurdMarkup, /100 in \(254 cm\)/);
assert.match(absurdMarkup, /175 in \(444.5 cm\)/);
assert.equal(
  absurdMarkup.includes('aria-label="Continue to Summary"') &&
    absurdMarkup.includes("disabled"),
  true,
);

console.log("PASS: measurement units default to centimetres and reject implausible values");
