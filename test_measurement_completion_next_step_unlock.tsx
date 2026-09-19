import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import type {
  CustomDetailSelectionGroup,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
} from "./src/types";
import {
  createEmptyFutureMeasurementState,
  isFutureSummaryUnlockedByMeasurements,
  planMeasurementRequirements,
  projectMeasurementRequirementsForPresentation,
  reconcileFutureMeasurementState,
  setFutureMeasurementRoute,
} from "./src/utils/measurementBlueprint";

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

const dressSelection: GarmentTypeStepSelection = {
  garmentTypes: ["dress"],
  demographic: "female",
  constructionByGarment: {
    dress: construction("dress", "dress_std_short", "dress_construction"),
  },
};
const midLongDressSelection: GarmentTypeStepSelection = {
  garmentTypes: ["dress"],
  demographic: "female",
  constructionByGarment: {
    dress: construction("dress", "dress_std_midlong", "dress_construction"),
  },
};
const physicalGarments = [{ garmentKey: "base:dress", garmentType: "dress" as const }];

const collectText = (
  node: { children?: unknown; props?: { children?: unknown } } | string | number | boolean | null | undefined,
): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node !== "object") return "";
  const children = "props" in node && node.props?.children != null
    ? node.props.children
    : "children" in node
      ? node.children
      : undefined;
  const list = Array.isArray(children) ? children : children != null ? [children] : [];
  return list.map((child) => collectText(child as never)).join("");
};

const Harness = ({
  initialState = createEmptyFutureMeasurementState(),
  garmentTypeSelection = dressSelection,
}: {
  initialState?: FutureMeasurementStateV1;
  garmentTypeSelection?: GarmentTypeStepSelection;
}) => {
  const [state, setState] = useState(initialState);
  const plan = planMeasurementRequirements({
    route: state.route,
    garmentTypeSelection,
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

const renderHarness = (
  initialState?: FutureMeasurementStateV1,
  garmentTypeSelection?: GarmentTypeStepSelection,
): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Harness, { initialState, garmentTypeSelection }));
  });
  return renderer;
};

const continueButton = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByType("button").find((node) => collectText(node).includes("Continue to Summary"));

const requiredInputs = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByProps({ "data-measurement-section": "required" }).flatMap((section) =>
    section.findAll((node) => node.type === "input" && node.props?.type === "number"),
  );

const renderer = renderHarness();
act(() => {
  renderer.root.findByProps({
    type: "radio",
    name: "future-measurement-route",
    value: "low_risk",
  }).props.onChange({ target: { value: "low_risk" } });
});

const continueLocked = continueButton(renderer);
assert.ok(continueLocked);
assert.equal(continueLocked.props.disabled, true);

assert.ok(requiredInputs(renderer).length > 0);
const fillRequiredExceptLast = () => {
  const inputs = requiredInputs(renderer);
  for (let index = 0; index < inputs.length - 1; index += 1) {
    act(() => {
      requiredInputs(renderer)[index].props.onChange({ target: { value: "10" } });
    });
  }
};
fillRequiredExceptLast();
assert.equal(continueButton(renderer)?.props.disabled, true);

act(() => {
  requiredInputs(renderer).at(-1)!.props.onChange({ target: { value: "10" } });
});
assert.equal(continueButton(renderer)?.props.disabled, false);

act(() => {
  requiredInputs(renderer).at(-1)!.props.onChange({ target: { value: "" } });
});
assert.equal(continueButton(renderer)?.props.disabled, true);

act(() => {
  requiredInputs(renderer).at(-1)!.props.onChange({ target: { value: "10" } });
});
assert.equal(continueButton(renderer)?.props.disabled, false);

const highRenderer = renderHarness();
act(() => {
  highRenderer.root.findByProps({
    type: "radio",
    name: "future-measurement-route",
    value: "high_risk",
  }).props.onChange({ target: { value: "high_risk" } });
});
assert.equal(continueButton(highRenderer)?.props.disabled, true);
const highCount = requiredInputs(highRenderer).length;
assert.ok(highCount > 0);
for (let index = 0; index < highCount; index += 1) {
  act(() => {
    requiredInputs(highRenderer)[index].props.onChange({ target: { value: "66.9" } });
  });
}
assert.equal(continueButton(highRenderer)?.props.disabled, false);

const dressPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: dressSelection,
  physicalGarments,
});
const presentedOptional = projectMeasurementRequirementsForPresentation({
  requirements: dressPlan.requirements,
}).filter((requirement) => requirement.section === "optional");
assert.ok(
  presentedOptional.some((requirement) => requirement.measurementId === "under_bust_circumference"),
);
assert.equal(
  isFutureSummaryUnlockedByMeasurements(
    reconcileFutureMeasurementState({
      state: createEmptyFutureMeasurementState("low_risk", "cm"),
      plan: dressPlan,
    }),
  ),
  false,
);

const midLongRenderer = renderHarness(undefined, midLongDressSelection);
act(() => {
  midLongRenderer.root.findByProps({
    type: "radio",
    name: "future-measurement-route",
    value: "low_risk",
  }).props.onChange({ target: { value: "low_risk" } });
});
const alternativeGroup = midLongRenderer.root.findByProps({
  "data-measurement-alternative-group": "F_sleeve_length",
});
assert.ok(alternativeGroup);
assert.equal(collectText(alternativeGroup).includes("Optional"), false);
assert.equal(collectText(alternativeGroup).includes("Sleeve Length"), true);
assert.equal(continueButton(midLongRenderer)?.props.disabled, true);

const fieldInput = (fieldId: string) =>
  midLongRenderer.root.findByProps({ "data-measurement-field": fieldId })
    .findAll((node) => node.type === "input" && node.props?.type === "number")[0];

const midLongPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: midLongDressSelection,
  physicalGarments,
});
const individualFieldIds = midLongPlan.requirements
  .filter((requirement) => requirement.directInput)
  .map((requirement) => requirement.measurementId);
for (const fieldId of individualFieldIds) {
  act(() => {
    fieldInput(fieldId).props.onChange({ target: { value: "10" } });
  });
}
assert.equal(continueButton(midLongRenderer)?.props.disabled, true);
act(() => {
  fieldInput("sleeve_length_mid").props.onChange({ target: { value: "10" } });
});
assert.equal(continueButton(midLongRenderer)?.props.disabled, false);
act(() => {
  fieldInput("sleeve_length_mid").props.onChange({ target: { value: "" } });
});
assert.equal(continueButton(midLongRenderer)?.props.disabled, true);
act(() => {
  fieldInput("sleeve_length_long").props.onChange({ target: { value: "10" } });
});
assert.equal(continueButton(midLongRenderer)?.props.disabled, false);

console.log("PASS: measurement completion next-step unlock UI");
