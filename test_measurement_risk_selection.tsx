import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import type {
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  MeasurementRiskRoute,
} from "./src/types";
import {
  createEmptyFutureMeasurementState,
  getActiveFutureMeasurementEntered,
  isFutureMeasurementEnteredBagEmpty,
  isFutureMeasurementSelectedPathInputComplete,
  isFutureMeasurementStageComplete,
  isFutureSummaryUnlockedByMeasurements,
  MEASUREMENT_RISK_ROUTE_LABELS,
  MEASUREMENT_RISK_SELECTION_NOTICE,
  planMeasurementRequirements,
  projectActiveFutureMeasurementState,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
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

const fillDirectRequirements = (
  route: MeasurementRiskRoute,
  existing: FutureMeasurementStateV1 = createEmptyFutureMeasurementState(route, "inch"),
): { state: FutureMeasurementStateV1; plan: ReturnType<typeof planMeasurementRequirements> } => {
  const plan = planMeasurementRequirements({
    route,
    garmentTypeSelection: selection,
    physicalGarments,
  });
  let state = existing.route === route
    ? existing
    : setFutureMeasurementRoute(existing, route);
  for (const requirement of plan.requirements.filter((candidate) => candidate.directInput)) {
    state = setFutureMeasurementInput({
      state,
      requirement,
      displayValue: 10,
    });
  }
  state = reconcileFutureMeasurementState({ state, plan });
  return { state, plan };
};

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

const selectRoute = (renderer: ReactTestRenderer, route: MeasurementRiskRoute) => {
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
const radios = renderer.root.findAllByProps({
  type: "radio",
  name: "future-measurement-route",
});
assert.equal(radios.length, 3);
assert.deepEqual(
  radios.map((radio) => radio.props.value),
  ["low_risk", "medium_risk", "high_risk"],
);
const optionLabels = renderer.root.findAll(
  (node) => node.props && node.props["data-measurement-risk-option"],
);
assert.equal(optionLabels.length, 3);
assert.deepEqual(
  optionLabels.map((node) => node.props["data-measurement-risk-option"]),
  ["low_risk", "medium_risk", "high_risk"],
);
assert.deepEqual(
  optionLabels.map((node) => MEASUREMENT_RISK_ROUTE_LABELS[node.props["data-measurement-risk-option"] as MeasurementRiskRoute]),
  ["Low / No Risk", "Mid Risk", "High Risk"],
);
const pageText = collectText(renderer.root);
assert.match(pageText, /Low \/ No Risk/);
assert.match(pageText, /Mid Risk/);
assert.match(pageText, /High Risk/);
assert.equal(radios.filter((radio) => radio.props.checked).length, 0);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "low_risk" }).length, 0);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "medium_risk" }).length, 0);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "high_risk" }).length, 0);

const notice = renderer.root.findByProps({ "data-measurement-risk-notice": "true" });
assert.equal(notice.props.children, MEASUREMENT_RISK_SELECTION_NOTICE);
assert.equal(
  pageText.includes("Summary remains locked until Low Risk measurements are complete"),
  false,
);
assert.equal(pageText.includes("Your completed Low Risk measurements are ready for review."), false);

selectRoute(renderer, "low_risk");
assert.equal(
  renderer.root.findByProps({ type: "radio", value: "low_risk" }).props.checked,
  true,
);
assert.equal(
  renderer.root.findAllByProps({ type: "radio" }).filter((radio) => radio.props.checked).length,
  1,
);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "low_risk" }).length, 1);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "medium_risk" }).length, 0);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "high_risk" }).length, 0);

selectRoute(renderer, "medium_risk");
assert.equal(
  renderer.root.findByProps({ type: "radio", value: "medium_risk" }).props.checked,
  true,
);
assert.equal(
  renderer.root.findByProps({ type: "radio", value: "low_risk" }).props.checked,
  false,
);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "medium_risk" }).length, 1);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "low_risk" }).length, 0);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "high_risk" }).length, 0);

selectRoute(renderer, "high_risk");
assert.equal(
  renderer.root.findByProps({ type: "radio", value: "high_risk" }).props.checked,
  true,
);
assert.equal(
  renderer.root.findByProps({ type: "radio", value: "medium_risk" }).props.checked,
  false,
);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "high_risk" }).length, 1);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "low_risk" }).length, 0);
assert.equal(renderer.root.findAllByProps({ "data-measurement-form": "medium_risk" }).length, 0);

const lowFilled = fillDirectRequirements("low_risk");
assert.equal(isFutureMeasurementSelectedPathInputComplete(lowFilled.state), true);
assert.equal(isFutureMeasurementStageComplete(lowFilled.state), true);
assert.equal(isFutureSummaryUnlockedByMeasurements(lowFilled.state), true);

const midIgnoringLow = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(lowFilled.state, "medium_risk"),
  plan: planMeasurementRequirements({
    route: "medium_risk",
    garmentTypeSelection: selection,
    physicalGarments,
  }),
});
assert.equal(midIgnoringLow.route, "medium_risk");
assert.equal(isFutureMeasurementEnteredBagEmpty(getActiveFutureMeasurementEntered(midIgnoringLow)), true);
assert.equal(
  midIgnoringLow.diagnostics.filter((diagnostic) => diagnostic.code === "required_measurement_missing").length > 0,
  true,
);
assert.equal(isFutureMeasurementSelectedPathInputComplete(midIgnoringLow), false);
assert.equal(
  midIgnoringLow.diagnostics.some((diagnostic) =>
    diagnostic.code === "required_measurement_missing" &&
    !planMeasurementRequirements({
      route: "medium_risk",
      garmentTypeSelection: selection,
      physicalGarments,
    }).requirements.some((requirement) =>
      requirement.directInput && requirement.measurementId === diagnostic.measurementId,
    ),
  ),
  false,
);

const midFilled = fillDirectRequirements("medium_risk", lowFilled.state);
assert.equal(isFutureMeasurementSelectedPathInputComplete(midFilled.state), true);
assert.equal(isFutureMeasurementStageComplete(midFilled.state), false);
assert.equal(isFutureSummaryUnlockedByMeasurements(midFilled.state), false);

const highIgnoringMid = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(midFilled.state, "high_risk"),
  plan: planMeasurementRequirements({
    route: "high_risk",
    garmentTypeSelection: selection,
    physicalGarments,
  }),
});
assert.equal(highIgnoringMid.route, "high_risk");
assert.equal(isFutureMeasurementEnteredBagEmpty(getActiveFutureMeasurementEntered(highIgnoringMid)), true);
assert.equal(isFutureMeasurementSelectedPathInputComplete(highIgnoringMid), false);
assert.equal(
  highIgnoringMid.diagnostics.some((diagnostic) => diagnostic.code === "required_measurement_missing"),
  true,
);

const highFilled = fillDirectRequirements("high_risk");
assert.equal(isFutureMeasurementSelectedPathInputComplete(highFilled.state), true);
assert.equal(isFutureMeasurementStageComplete(highFilled.state), false);

const incompleteActive = reconcileFutureMeasurementState({
  state: createEmptyFutureMeasurementState("low_risk"),
  plan: lowFilled.plan,
});
assert.equal(isFutureMeasurementSelectedPathInputComplete(incompleteActive), false);
assert.equal(isFutureMeasurementStageComplete(incompleteActive), false);

const inactiveMissingDoesNotBlock = fillDirectRequirements("medium_risk");
assert.equal(isFutureMeasurementSelectedPathInputComplete(inactiveMissingDoesNotBlock.state), true);
assert.equal(
  inactiveMissingDoesNotBlock.state.diagnostics.some((diagnostic) =>
    diagnostic.code === "required_measurement_missing" &&
    lowFilled.plan.requirements.some((requirement) =>
      requirement.directInput &&
      requirement.measurementId === diagnostic.measurementId &&
      !inactiveMissingDoesNotBlock.plan.requirements.some((candidate) =>
        candidate.directInput && candidate.key === requirement.key,
      ),
    ),
  ),
  false,
);

const switchedImmediate = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(lowFilled.state, "high_risk"),
  plan: planMeasurementRequirements({
    route: "high_risk",
    garmentTypeSelection: selection,
    physicalGarments,
  }),
});
assert.equal(switchedImmediate.route, "high_risk");
assert.equal(isFutureMeasurementSelectedPathInputComplete(switchedImmediate), false);
assert.equal(
  switchedImmediate.diagnostics.some((diagnostic) => diagnostic.code === "required_measurement_missing"),
  true,
);
assert.notEqual(isFutureMeasurementStageComplete(switchedImmediate), true);

const restored = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(switchedImmediate, "low_risk"),
  plan: lowFilled.plan,
});
assert.equal(isFutureMeasurementSelectedPathInputComplete(restored), true);
assert.deepEqual(restored.entered, lowFilled.state.entered);

const projectedHigh = projectActiveFutureMeasurementState({
  state: switchedImmediate,
  plan: planMeasurementRequirements({
    route: "high_risk",
    garmentTypeSelection: selection,
    physicalGarments,
  }),
});
assert.equal(projectedHigh.route, "high_risk");
assert.equal(
  isFutureMeasurementEnteredBagEmpty(getActiveFutureMeasurementEntered(projectedHigh)),
  true,
);
assert.equal(projectedHigh.entered.shared.chest_bust_circumference, undefined);
const projectedLow = projectActiveFutureMeasurementState(lowFilled);
assert.equal(projectedLow.route, "low_risk");
assert.equal(
  projectedLow.entered.shared === restored.entered.shared ||
    Object.keys(projectedLow.entered.shared).length > 0 ||
    Object.keys(projectedLow.entered.byGarmentKey).length > 0,
  true,
);
assert.ok(projectedLow.entered.shared.chest_bust_circumference);
assert.equal(projectedLow.enteredByRoute?.medium_risk.shared.chest_bust_circumference, undefined);

const overlappingId = "chest_bust_circumference";
const lowChest = lowFilled.state.entered.shared[overlappingId];
assert.ok(lowChest, "Low Shirt must store overlapping chest.");
const midAfterLow = setFutureMeasurementRoute(lowFilled.state, "medium_risk");
assert.equal(midAfterLow.entered.shared[overlappingId], undefined);
assert.equal(getActiveFutureMeasurementEntered(midAfterLow).shared[overlappingId], undefined);
const midPlanForOverlap = planMeasurementRequirements({
  route: "medium_risk",
  garmentTypeSelection: selection,
  physicalGarments,
});
const midChestRequirement = midPlanForOverlap.requirements.find(
  (requirement) => requirement.directInput && requirement.measurementId === overlappingId,
)!;
const midOwnValue = setFutureMeasurementInput({
  state: midAfterLow,
  requirement: midChestRequirement,
  displayValue: 21,
});
assert.notEqual(midOwnValue.entered.shared[overlappingId]?.valueCm, lowChest.valueCm);
assert.equal(
  setFutureMeasurementRoute(midOwnValue, "low_risk").entered.shared[overlappingId]?.valueCm,
  lowChest.valueCm,
);
assert.equal(
  setFutureMeasurementRoute(setFutureMeasurementRoute(midOwnValue, "low_risk"), "medium_risk")
    .entered.shared[overlappingId]?.valueCm,
  midOwnValue.entered.shared[overlappingId]?.valueCm,
);
const projectedMidOwn = projectActiveFutureMeasurementState({
  state: midOwnValue,
  plan: midPlanForOverlap,
});
assert.equal(
  projectedMidOwn.entered.shared[overlappingId]?.valueCm,
  midOwnValue.entered.shared[overlappingId]?.valueCm,
);
assert.equal(projectedMidOwn.enteredByRoute?.low_risk.shared[overlappingId], undefined);

const hydrated = fillDirectRequirements("low_risk");
assert.equal(hydrated.state.route, "low_risk");
assert.equal(isFutureMeasurementStageComplete(hydrated.state), true);

console.log("PASS: mutually exclusive measurement risk selection, active-path validation, and notice");
