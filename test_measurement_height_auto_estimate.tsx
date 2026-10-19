import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import type {
  CustomDetailSelectionGroup,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  MeasurementRiskRoute,
} from "./src/types";
import {
  createEmptyFutureMeasurementState,
  getResolvedMeasurementValue,
  isFutureSummaryUnlockedByMeasurements,
  isValidHeightForEstimates,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  setFutureMeasurementRoute,
  type MeasurementPhysicalGarment,
  type PlannedMeasurementRequirement,
} from "./src/utils/measurementBlueprint";
import { calculateMeasurementFromAverageFactor } from "./src/utils/measurementFactorEngine";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const construction = (
  garmentType: keyof GarmentTypeStepSelection["constructionByGarment"],
  optionId: string,
  selectionGroup: CustomDetailSelectionGroup,
) => ({
  status: "resolved" as const,
  garmentType,
  components: [{
    componentKey: `${garmentType}:${selectionGroup}:${optionId}`,
    optionId,
    selectionGroup,
    priceCents: 1,
    price: 0.01,
  }],
  totalPriceCents: 1,
  totalPrice: 0.01,
});

const shirtSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};
const shirtGarments: MeasurementPhysicalGarment[] = [
  { garmentKey: "base:shirt", garmentType: "shirt" },
  { garmentKey: "base:trouser", garmentType: "trouser" },
];

const near = (actual: number | undefined, expected: number, message?: string) => {
  assert.ok(actual !== undefined, message || "value missing");
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message || ""} expected ${expected}, received ${actual}`);
};

const heightOf = (plan: ReturnType<typeof planMeasurementRequirements>) => {
  const requirement = plan.requirements.find(
    (candidate) => candidate.measurementId === "total_height" && candidate.directInput,
  );
  assert.ok(requirement, "plan has a Total Height input");
  return requirement!;
};

const withHeight = (
  route: MeasurementRiskRoute,
  plan: ReturnType<typeof planMeasurementRequirements>,
  heightCm: number | null,
  base?: FutureMeasurementStateV1,
) =>
  reconcileFutureMeasurementState({
    state: setFutureMeasurementInput({
      state: base || createEmptyFutureMeasurementState(route, "cm"),
      requirement: heightOf(plan),
      displayValue: heightCm,
    }),
    plan,
  });

const calculatedOf = (plan: ReturnType<typeof planMeasurementRequirements>) =>
  plan.requirements.filter(
    (requirement): requirement is PlannedMeasurementRequirement & { averageFactor: number } =>
      requirement.inputSource === "calculated_average_factor" &&
      requirement.averageFactor !== null,
  );

// 1. Medium and High: Total Height alone fills every height estimate, for every
//    garment occurrence, before any other required measurement is entered.
for (const route of ["medium_risk", "high_risk"] as const) {
  const plan = planMeasurementRequirements({
    route,
    garmentTypeSelection: shirtSelection,
    physicalGarments: shirtGarments,
  });
  const calculated = calculatedOf(plan);
  assert.ok(calculated.length > 0, `${route} has height estimates`);
  const state = withHeight(route, plan, 180);
  for (const requirement of calculated) {
    const value = getResolvedMeasurementValue(state, requirement);
    near(
      value?.valueCm,
      calculateMeasurementFromAverageFactor(180, requirement.averageFactor),
      `${route} ${requirement.garmentKey} ${requirement.measurementId}`,
    );
    assert.equal(value?.provenance, "calculated_average_factor", "estimates stay marked as calculated");
  }
  for (const garment of shirtGarments) {
    assert.ok(state.derived.byGarmentKey[garment.garmentKey], `${route} ${garment.garmentKey} has estimates`);
  }
  // Completion still needs every required measurement.
  assert.equal(state.calculationStatus, "incomplete");
  assert.equal(isFutureSummaryUnlockedByMeasurements(state), false);
  // Required manual fields are never auto-filled.
  for (const requirement of plan.requirements.filter((item) => item.directInput)) {
    if (requirement.measurementId === "total_height") continue;
    assert.equal(
      getResolvedMeasurementValue(state, requirement),
      undefined,
      `${route} required ${requirement.measurementId} stays empty`,
    );
  }

  // A height change replaces the estimates; clearing height removes them.
  const taller = withHeight(route, plan, 190, state);
  near(
    getResolvedMeasurementValue(taller, calculated[0]!)?.valueCm,
    calculateMeasurementFromAverageFactor(190, calculated[0]!.averageFactor),
  );
  const cleared = withHeight(route, plan, null, taller);
  assert.equal(Object.keys(cleared.derived.byGarmentKey).length, 0, `${route} clearing height clears estimates`);
}
console.log("PASS: Medium/High height estimates fill from a valid height alone");

// 2. What counts as a valid height: positive, finite and within 40-230 cm.
{
  const plan = planMeasurementRequirements({
    route: "medium_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: shirtGarments.slice(0, 1),
  });
  for (const bad of [0, -170, 5.9, 400]) {
    const state = withHeight("medium_risk", plan, bad);
    assert.equal(
      Object.keys(state.derived.byGarmentKey).length,
      0,
      `height ${bad} cm gives no estimates`,
    );
  }
  assert.equal(isValidHeightForEstimates({ valueCm: 40, provenance: "customer_entered" }), true);
  assert.equal(isValidHeightForEstimates({ valueCm: 230, provenance: "customer_entered" }), true);
  assert.equal(isValidHeightForEstimates({ valueCm: 39.9, provenance: "customer_entered" }), false);
  assert.equal(isValidHeightForEstimates(undefined), false);
  // Inches convert first: 70 in = 177.8 cm is valid.
  const inchState = reconcileFutureMeasurementState({
    state: setFutureMeasurementInput({
      state: createEmptyFutureMeasurementState("medium_risk", "inch"),
      requirement: heightOf(plan),
      displayValue: 70,
    }),
    plan,
  });
  const head = calculatedOf(plan).find((item) => item.measurementId === "head_circumference")!;
  near(
    getResolvedMeasurementValue(inchState, head)?.valueCm,
    calculateMeasurementFromAverageFactor(177.8, head.averageFactor),
  );
}
console.log("PASS: only a valid Total Height drives estimates");

// 3. A value the customer typed is never overwritten by an estimate.
{
  // Medium: Skirt estimates Thigh from height, Trousers asks for it. Both share
  // one body Thigh value.
  const plan = planMeasurementRequirements({
    route: "medium_risk",
    garmentTypeSelection: {
      garmentTypes: ["skirt", "trouser"],
      demographic: "female",
      constructionByGarment: { skirt: construction("skirt", "skirt_std", "skirt_length") },
    },
    physicalGarments: [
      { garmentKey: "base:skirt", garmentType: "skirt" },
      { garmentKey: "base:trouser", garmentType: "trouser" },
    ],
  });
  const skirtThigh = plan.requirements.find(
    (item) => item.garmentKey === "base:skirt" && item.measurementId === "thigh_circumference",
  )!;
  const trouserThigh = plan.requirements.find(
    (item) => item.garmentKey === "base:trouser" && item.measurementId === "thigh_circumference",
  )!;
  assert.equal(skirtThigh.inputSource, "calculated_average_factor");
  assert.equal(trouserThigh.directInput, true);
  let state = createEmptyFutureMeasurementState("medium_risk", "cm");
  state = setFutureMeasurementInput({ state, requirement: trouserThigh, displayValue: 61 });
  state = withHeight("medium_risk", plan, 180, state);
  assert.equal(getResolvedMeasurementValue(state, skirtThigh)?.valueCm, 61);
  assert.equal(getResolvedMeasurementValue(state, skirtThigh)?.provenance, "customer_entered");
  assert.equal(state.derived.byGarmentKey["base:skirt"]?.thigh_circumference, undefined);
}
console.log("PASS: typed values win over height estimates");

// 4. Other methods keep their contracts.
{
  const lowPlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: shirtGarments.slice(0, 1),
  });
  const low = withHeight("low_risk", lowPlan, 180);
  assert.equal(Object.keys(low.derived.byGarmentKey).length, 0, "Low Risk never estimates");

  const criticalPlan = planMeasurementRequirements({
    route: "critical_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: shirtGarments.slice(0, 1),
  });
  const critical = withHeight("critical_risk", criticalPlan, 180);
  assert.equal(critical.calculationStatus, "complete", "Critical still completes from height");
  assert.ok(Object.keys(critical.derived.byGarmentKey["base:shirt"] || {}).length > 0);
}
console.log("PASS: Low Risk and Critical Risk unchanged");

// 5. In Step 7, typing a height fills the Calculated from height values on the
//    same change (no blur, button or other field needed).
{
  const plan = planMeasurementRequirements({
    route: "medium_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: shirtGarments.slice(0, 1),
  });
  const Harness = () => {
    const [state, setState] = useState<FutureMeasurementStateV1>(() =>
      setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "medium_risk"),
    );
    return createElement(DormantFutureMeasurementStep, {
      plan,
      state,
      physicalGarments: shirtGarments.slice(0, 1),
      onChange: setState,
      onRouteChange: () => undefined,
      onBack: () => undefined,
      onContinue: () => undefined,
    });
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Harness));
  });
  const calculatedValues = () =>
    renderer.root.findAll(
      (node) => typeof node.props?.["data-measurement-calculated-value"] === "string",
    ).map((node) => String(node.props["data-measurement-calculated-value"]));
  assert.ok(calculatedValues().length > 0);
  assert.ok(calculatedValues().every((value) => value === "pending"));
  assert.equal(
    renderer.root.findAllByProps({ "data-measurement-calculated-pending": "true" }).length,
    1,
  );
  const heightInput = renderer.root.find(
    (node) =>
      node.type === "input" &&
      String(node.props.id || "").includes("total_height"),
  );
  act(() => {
    heightInput.props.onChange({ target: { value: "180" } });
  });
  const values = calculatedValues();
  assert.ok(values.every((value) => value !== "pending"), `all estimates shown: ${values.join(",")}`);
  const head = calculatedOf(plan).find((item) => item.measurementId === "head_circumference")!;
  assert.ok(
    values.includes(String(Math.round(calculateMeasurementFromAverageFactor(180, head.averageFactor) * 10) / 10)) ||
      values.some((value) => Math.abs(Number(value) - calculateMeasurementFromAverageFactor(180, head.averageFactor)) < 0.06),
    "head estimate shown",
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-measurement-calculated-pending": "true" }).length,
    0,
  );
  // Continue stays locked until the required measurements are entered.
  const section = renderer.root.findByProps({ "data-stage-id": "measurement" });
  assert.equal(section.props["data-measurement-status"], "incomplete");
  act(() => renderer.unmount());
}
console.log("PASS: Step 7 fills estimates on the height keystroke");
