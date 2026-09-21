import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import type {
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  MeasurementMethodId,
} from "./src/types";
import {
  createEmptyFutureMeasurementState,
  FUTURE_MEASUREMENT_INVALID_HYDRATION_MESSAGE,
  MEASUREMENT_SAMPLE_CLOTH_DESCRIPTION,
  MEASUREMENT_SAMPLE_CLOTH_FORM_TITLE,
  MEASUREMENT_SAMPLE_CLOTH_LABEL,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementRoute,
} from "./src/utils/measurementBlueprint";

const construction = (
  garmentType: keyof GarmentTypeStepSelection["constructionByGarment"],
  optionId: string,
  selectionGroup: any,
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

const selection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};
const physicalGarments = [{ garmentKey: "shirt:1", garmentType: "shirt" as const }];

const collectText = (node: { children?: unknown } | string | number | boolean | null | undefined): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node !== "object") return "";
  const children = Array.isArray(node.children) ? node.children : node.children != null ? [node.children] : [];
  return children.map((child) => collectText(child as never)).join("");
};

const Harness = ({
  initialState = createEmptyFutureMeasurementState(),
}: {
  initialState?: FutureMeasurementStateV1;
}) => {
  const [state, setState] = useState(initialState);
  const plan = planMeasurementRequirements({
    route: state.route,
    garmentTypeSelection: selection,
    physicalGarments,
  });
  const reconciled = reconcileFutureMeasurementState({ state, plan });
  return createElement(DormantFutureMeasurementStep, {
    plan,
    state: reconciled,
    onChange: setState,
    onRouteChange: (route) => {
      setState((current) => setFutureMeasurementRoute(current, route));
    },
    onBack: () => undefined,
    onContinue: () => undefined,
  });
};

const renderHarness = (initialState?: FutureMeasurementStateV1): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Harness, { initialState }));
  });
  return renderer;
};

const selectMethod = (renderer: ReactTestRenderer, route: MeasurementMethodId) => {
  const radio = renderer.root.findByProps({
    type: "radio",
    name: "future-measurement-route",
    value: route,
  });
  act(() => {
    radio.props.onChange({ target: { value: route } });
  });
};

const renderer = renderHarness();
const optionSections = renderer.root.findAll(
  (node) => node.props && node.props["data-measurement-option-section"],
);
assert.deepEqual(
  optionSections.map((node) => node.props["data-measurement-option-section"]),
  ["risk", "sample_cloth"],
);
assert.equal(optionSections.length, 2);

const riskSelector = renderer.root.findByProps({ "data-measurement-risk-selector": "true" });
const riskOptions = riskSelector.findAll(
  (node) => node.props && node.props["data-measurement-risk-option"],
);
assert.deepEqual(
  riskOptions.map((node) => node.props["data-measurement-risk-option"]),
  ["low_risk", "medium_risk", "high_risk", "critical_risk"],
);
assert.equal(
  riskSelector.findAll((node) => node.props && node.props["data-measurement-sample-option"]).length,
  0,
);

const sampleSelector = renderer.root.findByProps({ "data-measurement-sample-selector": "true" });
assert.equal(
  sampleSelector.findAll((node) => node.props && node.props["data-measurement-sample-option"]).length,
  1,
);
assert.equal(
  renderer.root.findAllByProps({ "data-measurement-sample-option": "sample_cloth" }).length,
  1,
);

const pageText = collectText(renderer.root);
assert.equal(
  renderer.root.findByProps({ "data-measurement-option-heading": "body" }).children[0],
  "Body Measurements",
);
assert.equal(
  renderer.root.findByProps({ "data-measurement-option-subtitle": "risk" }).children[0],
  "Measurement by Risk Level",
);
assert.match(pageText, /Measurement by Risk Level/);
assert.match(pageText, /Body Measurements/);
assert.equal(
  renderer.root.findAll(
    (node) =>
      node.type === "legend" &&
      collectText(node) === "Measurement by Risk Level",
  ).length,
  0,
);
assert.match(pageText, new RegExp(MEASUREMENT_SAMPLE_CLOTH_LABEL));
assert.ok(pageText.includes(MEASUREMENT_SAMPLE_CLOTH_DESCRIPTION));
assert.equal(
  pageText.split(MEASUREMENT_SAMPLE_CLOTH_DESCRIPTION).length - 1,
  1,
  "Sample Cloth explanation must appear once under the heading, not again inside the radio.",
);
assert.equal(
  collectText(
    renderer.root.findByProps({ "data-measurement-sample-option": "sample_cloth" }),
  ).includes(MEASUREMENT_SAMPLE_CLOTH_DESCRIPTION),
  false,
);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "low_risk" }).length, 0);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "sample_cloth" }).length, 0);

selectMethod(renderer, "low_risk");
assert.equal(renderer.root.findByProps({ type: "radio", value: "low_risk" }).props.checked, true);
assert.equal(renderer.root.findByProps({ type: "radio", value: "sample_cloth" }).props.checked, false);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "low_risk" }).length, 1);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "sample_cloth" }).length, 0);
assert.equal(
  renderer.root.findByProps({ "data-measurement-section": "required" })
    .findAll((node) => Boolean(node.props?.["data-measurement-field"]))[0]
    ?.props["data-measurement-field"],
  "total_height",
);

selectMethod(renderer, "sample_cloth");
assert.equal(renderer.root.findByProps({ type: "radio", value: "sample_cloth" }).props.checked, true);
assert.equal(
  renderer.root.findAllByProps({ type: "radio" }).filter((radio) => radio.props.checked).length,
  1,
);
assert.equal(renderer.root.findByProps({ type: "radio", value: "low_risk" }).props.checked, false);
assert.equal(renderer.root.findByProps({ type: "radio", value: "medium_risk" }).props.checked, false);
assert.equal(renderer.root.findByProps({ type: "radio", value: "high_risk" }).props.checked, false);
assert.equal(renderer.root.findByProps({ type: "radio", value: "critical_risk" }).props.checked, false);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "sample_cloth" }).length, 1);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "low_risk" }).length, 0);
assert.equal(renderer.root.findAllByProps({ "data-measurement-section": "calculated" }).length, 0);
assert.equal(
  collectText(renderer.root).split(MEASUREMENT_SAMPLE_CLOTH_DESCRIPTION).length - 1,
  1,
  "Selecting Sample must not repeat the Option 2 explanation in the form.",
);
assert.match(collectText(renderer.root), new RegExp(MEASUREMENT_SAMPLE_CLOTH_FORM_TITLE));
assert.match(collectText(renderer.root), /Measure these on the sample garment/);
assert.match(collectText(renderer.root), /Chest \/ bust across sample \(laid flat\)/);
assert.equal(renderer.root.findAllByProps({ "data-measurement-field": "total_height" }).length, 0);
assert.equal(renderer.root.findAllByProps({ "data-measurement-field": "head_circumference" }).length, 0);
assert.notEqual(
  renderer.root.findByProps({ "data-measurement-section": "required" })
    .findAll((node) => Boolean(node.props?.["data-measurement-field"]))[0]
    ?.props["data-measurement-field"],
  "total_height",
);

const chestField = renderer.root.findByProps({ "data-measurement-field": "chest_bust_circumference" });
assert.equal(chestField.props["data-sample-geometry"], "laid_flat_half_width");
const chestInput = chestField.findByType("input");
act(() => {
  chestInput.props.onChange({ target: { value: "20" } });
});
assert.equal(
  renderer.root.findByProps({ "data-measurement-field": "chest_bust_circumference" })
    .findByProps({ "data-sample-converted": "true" }).props["data-sample-converted-value"],
  "40",
);

const sampleFormIndex = renderer.root.findAll(
  (node) => node.props && node.props["data-measurement-form"],
);
assert.equal(sampleFormIndex.length, 1);

selectMethod(renderer, "high_risk");
assert.equal(renderer.root.findByProps({ type: "radio", value: "high_risk" }).props.checked, true);
assert.equal(renderer.root.findByProps({ type: "radio", value: "sample_cloth" }).props.checked, false);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "high_risk" }).length, 1);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "sample_cloth" }).length, 0);

const emptyState = createEmptyFutureMeasurementState();
const emptyPlan = planMeasurementRequirements({
  route: emptyState.route,
  garmentTypeSelection: selection,
  physicalGarments,
});
let invalidRenderer!: ReactTestRenderer;
act(() => {
  invalidRenderer = create(createElement(DormantFutureMeasurementStep, {
    plan: emptyPlan,
    state: emptyState,
    hydrationInvalid: true,
    onChange: () => undefined,
    onRouteChange: () => {
      throw new Error("invalid hydration must not change measurement method");
    },
    onBack: () => undefined,
    onContinue: () => {
      throw new Error("invalid hydration must not continue");
    },
  }));
});
assert.equal(
  invalidRenderer.root.findByProps({ "data-measurement-hydration": "invalid" }).props["data-measurement-status"],
  "invalid",
);
assert.match(collectText(invalidRenderer.root), new RegExp(FUTURE_MEASUREMENT_INVALID_HYDRATION_MESSAGE));
assert.equal(invalidRenderer.root.findAllByProps({ "data-measurement-form": "low_risk" }).length, 0);
assert.equal(invalidRenderer.root.findAllByProps({ "data-measurement-form": "sample_cloth" }).length, 0);
const continueButton = invalidRenderer.root.findAllByType("button").find((button) =>
  collectText(button).includes("Continue to Summary"),
);
assert.equal(continueButton?.props.disabled, true);
assert.equal(invalidRenderer.root.findByProps({ type: "radio", value: "low_risk" }).props.disabled, true);
assert.equal(invalidRenderer.root.findByProps({ type: "radio", value: "sample_cloth" }).props.disabled, true);

console.log("PASS: sample cloth two-section layout, laid-flat labels, and single active method");
