import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import type {
  AdditionalGarmentConstructionStateV1,
  CustomDetailSelectionGroup,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  MeasurementRiskRoute,
} from "./src/types";
import {
  createEmptyFutureMeasurementState,
  isFutureSummaryUnlockedByMeasurements,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  setFutureMeasurementRoute,
  type MeasurementPhysicalGarment,
} from "./src/utils/measurementBlueprint";

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

const dressSelection = (optionId: string): GarmentTypeStepSelection => ({
  garmentTypes: ["dress"],
  demographic: "female",
  constructionByGarment: { dress: construction("dress", optionId, "dress_construction") },
});
const dress: MeasurementPhysicalGarment[] = [{ garmentKey: "base:dress", garmentType: "dress" }];
const neck = (neckOptionId: string) => ({
  schemaVersion: 1,
  selectionsByGarmentKey: { "base:dress": { neck_design: neckOptionId } },
}) as never;

const PROFILE_SELECTIONS: Array<[string, GarmentTypeStepSelection, MeasurementPhysicalGarment[]]> = [
  ["shirt std short", { garmentTypes: ["shirt"], demographic: "male", constructionByGarment: { shirt: construction("shirt", "shirt_std_short", "shirt_construction") } }, [{ garmentKey: "base:shirt", garmentType: "shirt" }]],
  ["shirt long midlong", { garmentTypes: ["shirt"], demographic: "male", constructionByGarment: { shirt: construction("shirt", "shirt_long_midlong", "shirt_construction") } }, [{ garmentKey: "base:shirt", garmentType: "shirt" }]],
  ["dress std short", dressSelection("dress_std_short"), dress],
  ["dress std sleeveless", dressSelection("dress_std_sleeveless"), dress],
  ["dress long sleeveless", dressSelection("dress_long_sleeveless"), dress],
  ["dress std midlong", dressSelection("dress_std_midlong"), dress],
  ["trouser", { garmentTypes: ["trouser"], demographic: "male", constructionByGarment: {} }, [{ garmentKey: "base:trouser", garmentType: "trouser" }]],
  ["bum shorts", { garmentTypes: ["bum_shorts"], demographic: "female", constructionByGarment: {} }, [{ garmentKey: "base:bum_shorts", garmentType: "bum_shorts" }]],
  ["long skirt", { garmentTypes: ["skirt"], demographic: "female", constructionByGarment: { skirt: construction("skirt", "skirt_long", "skirt_length") } }, [{ garmentKey: "base:skirt", garmentType: "skirt" }]],
];

const fill = (
  route: MeasurementRiskRoute,
  plan: ReturnType<typeof planMeasurementRequirements>,
  skip: readonly string[] = [],
) => {
  let state = createEmptyFutureMeasurementState(route, "cm");
  for (const requirement of plan.requirements) {
    if (skip.includes(requirement.measurementId)) continue;
    const required = requirement.directInput || Boolean(requirement.alternativeGroup && requirement.section === "required");
    if (!required) continue;
    state = setFutureMeasurementInput({
      state,
      requirement,
      displayValue: requirement.measurementId === "total_height" ? 170 : 40,
    });
  }
  return reconcileFutureMeasurementState({ state, plan });
};

// 1. On Low, Medium and High Risk, every measurement without an Average Factor
//    is required. Only square-neck rows without a proven U neck stay optional.
for (const route of ["low_risk", "medium_risk", "high_risk"] as const) {
  for (const [label, garmentTypeSelection, physicalGarments] of PROFILE_SELECTIONS) {
    const plan = planMeasurementRequirements({ route, garmentTypeSelection, physicalGarments });
    for (const requirement of plan.requirements) {
      if (requirement.averageFactor !== null || requirement.measurementId === "total_height") continue;
      if (requirement.measurementId.startsWith("square_neck_")) {
        assert.equal(requirement.section, "optional", `${route} ${label} ${requirement.measurementId} waits for a U neck`);
        continue;
      }
      assert.equal(
        requirement.section,
        "required",
        `${route} ${label} ${requirement.measurementId} has no factor, so it is required`,
      );
      assert.equal(requirement.inputSource, "route_marker");
    }
    assert.deepEqual(
      plan.requirements
        .filter((requirement) => requirement.inputSource === "optional_manual")
        .map((requirement) => requirement.measurementId)
        .filter((measurementId) => !measurementId.startsWith("square_neck_")),
      [],
      `${route} ${label} has no other optional factorless field`,
    );
  }
}
console.log("PASS: factorless measurements are required on Low/Medium/High Risk");

// 2. Sleeveless dress on Medium/High: Sleeveless Sleeve Length (no factor) is
//    now required and gates completion.
for (const route of ["medium_risk", "high_risk"] as const) {
  for (const optionId of ["dress_std_sleeveless", "dress_long_sleeveless"]) {
    const plan = planMeasurementRequirements({
      route,
      garmentTypeSelection: dressSelection(optionId),
      physicalGarments: dress,
    });
    const sleeveless = plan.requirements.find(
      (requirement) => requirement.measurementId === "sleeve_length_sleeveless",
    );
    assert.ok(sleeveless, `${route} ${optionId} plans the sleeveless length`);
    assert.equal(sleeveless!.directInput, true);
    assert.equal(sleeveless!.section, "required");
    const missing = fill(route, plan, ["sleeve_length_sleeveless"]);
    assert.equal(missing.calculationStatus, "incomplete");
    assert.equal(isFutureSummaryUnlockedByMeasurements(missing), false);
    assert.ok(
      missing.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "required_measurement_missing" &&
          diagnostic.measurementId === "sleeve_length_sleeveless",
      ),
    );
    const complete = fill(route, plan);
    assert.equal(complete.calculationStatus, "complete", `${route} ${optionId} completes once filled`);
  }
}
console.log("PASS: sleeveless sleeve length is required and gates Medium/High");

// 3. Dress body rows without a factor (Under Borst, Hip, Shoulder to
//    Under-Borst) gate completion; square-neck rows follow the neck choice.
{
  const plan = planMeasurementRequirements({
    route: "medium_risk",
    garmentTypeSelection: dressSelection("dress_std_short"),
    physicalGarments: dress,
    garmentScopedCustomDetails: neck("neck_vert_u"),
  });
  const required = plan.requirements
    .filter((requirement) => requirement.directInput && requirement.averageFactor === null)
    .map((requirement) => requirement.measurementId)
    .sort();
  assert.deepEqual(required, [
    "hip_circumference",
    "shoulder_to_under_bust_length",
    "square_neck_length",
    "square_neck_width",
    "under_bust_circumference",
  ]);
  for (const measurementId of required) {
    const state = fill("medium_risk", plan, [measurementId]);
    assert.equal(isFutureSummaryUnlockedByMeasurements(state), false, `${measurementId} gates Continue`);
  }
  assert.equal(isFutureSummaryUnlockedByMeasurements(fill("medium_risk", plan)), true);

  const roundNeck = planMeasurementRequirements({
    route: "medium_risk",
    garmentTypeSelection: dressSelection("dress_std_short"),
    physicalGarments: dress,
    garmentScopedCustomDetails: neck("neck_no_round"),
  });
  assert.equal(
    roundNeck.requirements.some((requirement) => requirement.measurementId.startsWith("square_neck_")),
    false,
    "a round neck does not ask for square-neck measurements",
  );
}
console.log("PASS: factorless dress rows gate completion; square neck follows the neck choice");

// 4. Each garment occurrence needs its own garment-specific value.
{
  const additionalGarmentConstructions: AdditionalGarmentConstructionStateV1 = {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:dress:1": construction("dress", "dress_std_sleeveless", "dress_construction"),
    },
  };
  const plan = planMeasurementRequirements({
    route: "high_risk",
    garmentTypeSelection: dressSelection("dress_std_sleeveless"),
    physicalGarments: [
      { garmentKey: "base:dress", garmentType: "dress" },
      { garmentKey: "additional:dress:1", garmentType: "dress" },
    ],
    additionalGarmentConstructions,
  });
  const sleeveless = plan.requirements.filter(
    (requirement) => requirement.measurementId === "sleeve_length_sleeveless" && requirement.directInput,
  );
  assert.deepEqual(sleeveless.map((requirement) => requirement.garmentKey).sort(), [
    "additional:dress:1",
    "base:dress",
  ]);
  let state = fill("high_risk", plan, ["sleeve_length_sleeveless"]);
  state = reconcileFutureMeasurementState({
    state: setFutureMeasurementInput({ state, requirement: sleeveless[0]!, displayValue: 5 }),
    plan,
  });
  assert.equal(isFutureSummaryUnlockedByMeasurements(state), false, "one occurrence is not enough");
  state = reconcileFutureMeasurementState({
    state: setFutureMeasurementInput({ state, requirement: sleeveless[1]!, displayValue: 5 }),
    plan,
  });
  assert.equal(isFutureSummaryUnlockedByMeasurements(state), true);
}
console.log("PASS: factorless garment rows are required per garment occurrence");

// 5. Critical Risk and Sample Cloth keep their contracts.
{
  const critical = planMeasurementRequirements({
    route: "critical_risk",
    garmentTypeSelection: dressSelection("dress_std_short"),
    physicalGarments: dress,
  });
  assert.deepEqual(
    critical.requirements.filter((requirement) => requirement.directInput).map((r) => r.measurementId),
    ["total_height"],
    "Critical Risk stays height-only",
  );
  const criticalSleeveless = planMeasurementRequirements({
    route: "critical_risk",
    garmentTypeSelection: dressSelection("dress_std_sleeveless"),
    physicalGarments: dress,
  });
  // Xavier (2026-10-20): factorless fields no longer block Height Only; they are required manual inputs.
  assert.equal(criticalSleeveless.criticalRiskSupported, true, "sleeveless can use Critical Risk");
  assert.deepEqual(
    criticalSleeveless.requirements.filter((requirement) => requirement.directInput).map((r) => r.measurementId).sort(),
    ["sleeve_length_sleeveless", "total_height"],
    "Critical Risk asks Total Height plus the factorless Sleeveless Finish Length",
  );

  const sample = planMeasurementRequirements({
    route: "sample_cloth",
    garmentTypeSelection: dressSelection("dress_std_short"),
    physicalGarments: dress,
  });
  assert.equal(
    sample.requirements.find((requirement) => requirement.measurementId === "under_bust_circumference")
      ?.section,
    "optional",
    "Sample Cloth If applicable rows stay optional",
  );
}
console.log("PASS: Critical Risk and Sample Cloth unchanged");

// 6. Step 7 shows the required marker and plain message, and Continue stays
//    locked until the factorless field is filled.
{
  const garmentTypeSelection = dressSelection("dress_std_sleeveless");
  const Harness = () => {
    const [state, setState] = useState<FutureMeasurementStateV1>(() =>
      setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "medium_risk"),
    );
    const plan = planMeasurementRequirements({
      route: state.route,
      garmentTypeSelection,
      physicalGarments: dress,
    });
    return createElement(DormantFutureMeasurementStep, {
      plan,
      state: reconcileFutureMeasurementState({ state, plan }),
      physicalGarments: dress,
      onChange: setState,
      onRouteChange: (route) => setState((current) => setFutureMeasurementRoute(current, route)),
      onBack: () => undefined,
      onContinue: () => undefined,
    });
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Harness));
  });
  const requiredSection = renderer.root.findByProps({ "data-measurement-section": "required" });
  const sleevelessField = requiredSection.findByProps({ "data-measurement-field": "sleeve_length_sleeveless" });
  assert.equal(
    sleevelessField.findByProps({ "data-measurement-badge": "Required" }).props["data-measurement-badge"],
    "Required",
  );
  const message = sleevelessField.findByProps({ "data-measurement-factorless-required": "true" });
  assert.equal(
    message.children.join(""),
    "Required: this measurement can't be calculated from height, so please measure it.",
  );
  // Fields that do have a factor do not get the message.
  const chestField = requiredSection.findByProps({ "data-measurement-field": "chest_bust_circumference" });
  assert.equal(chestField.findAllByProps({ "data-measurement-factorless-required": "true" }).length, 0);
  assert.equal(renderer.root.findAllByProps({ "data-measurement-section": "optional" }).length, 1);

  const continueButton = () =>
    renderer.root.findAllByType("button").find((node) => node.props["aria-label"] === "Continue to Summary");
  const inputFor = (fieldId: string) =>
    renderer.root.findByProps({ "data-measurement-field": fieldId })
      .find((node) => node.type === "input");
  const requiredFieldIds = () =>
    renderer.root.findByProps({ "data-measurement-section": "required" })
      .findAll((node) => typeof node.props?.["data-measurement-field"] === "string" && node.type === "label")
      .map((node) => String(node.props["data-measurement-field"]));
  for (const fieldId of requiredFieldIds()) {
    if (fieldId === "sleeve_length_sleeveless") continue;
    act(() => {
      inputFor(fieldId).props.onChange({ target: { value: fieldId === "total_height" ? "170" : "40" } });
    });
  }
  assert.equal(continueButton()?.props["aria-disabled"], "true", "Continue locked without the factorless field");
  act(() => {
    inputFor("sleeve_length_sleeveless").props.onChange({ target: { value: "5" } });
  });
  assert.equal(continueButton()?.props.disabled, false, "Continue unlocks once it is filled");
  act(() => renderer.unmount());
}
console.log("PASS: Step 7 marks factorless fields Required and gates Continue");
