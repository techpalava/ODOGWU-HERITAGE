import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
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
import {
  FUTURE_PICKUP_ATELIER_PHONE_DISPLAY,
  FUTURE_PICKUP_ATELIER_WHATSAPP_URL,
} from "./src/utils/designStudioFutureShipping";

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
    physicalGarments,
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
  ["risk", "sample_cloth", "alternate_contact", "ai_measurements"],
);
assert.equal(optionSections.length, 4);
// Options 2-4 share one md:grid-cols-3 grid; Option 1 stays full width above it.
const optionGrid = renderer.root.findByProps({ "data-measurement-option-grid": "true" });
assert.match(optionGrid.props.className, /md:grid-cols-3/);
assert.deepEqual(
  optionGrid
    .findAll((node) => node.props && node.props["data-measurement-option-section"])
    .map((node) => node.props["data-measurement-option-section"]),
  ["sample_cloth", "alternate_contact", "ai_measurements"],
);

// Onsite / AI sections are display-only: no radio, no route, shared atelier WhatsApp contact.
const alternateSection = renderer.root.findByProps({
  "data-measurement-option-section": "alternate_contact",
});
const aiSection = renderer.root.findByProps({
  "data-measurement-option-section": "ai_measurements",
});
for (const infoSection of [alternateSection, aiSection]) {
  assert.equal(infoSection.findAll((node) => node.type === "input").length, 0);
  assert.equal(
    infoSection.findAll((node) => typeof node.props?.onClick === "function").length,
    0,
  );
}
assert.equal(alternateSection.findAllByProps({ "data-measurement-ai-coming-soon": "true" }).length, 0);
assert.match(collectText(alternateSection), /Information only\. These do not complete your measurements\./);
assert.doesNotMatch(collectText(aiSection), /Information only/);
const onsiteCard = alternateSection.findByProps({ "data-measurement-onsite-info": "true" });
const onsiteHeading = alternateSection.findByProps({ "data-measurement-option-heading": "onsite" });
assert.equal(onsiteHeading.type, "h3");
assert.equal(onsiteHeading.props.className, "font-serif text-lg font-bold leading-snug text-heritage-green");
assert.equal(collectText(onsiteHeading), "Option 3: Onsite Physical Measurements");
assert.equal(onsiteCard.findAll((node) => node.type === "h3").length, 0);
assert.match(collectText(onsiteCard), /Reach out to the contact to arrange a measurement/);
const onsiteBookingWindow = onsiteCard.findByProps({
  "data-measurement-onsite-booking-window": "true",
});
assert.equal(
  collectText(onsiteBookingWindow),
  "Please book within 3 days of placing your order, so we can keep your tailoring slot and deliver on time.",
);
const onsiteLink = onsiteCard.findByType("a");
assert.equal(onsiteLink.props.href, FUTURE_PICKUP_ATELIER_WHATSAPP_URL);
assert.equal(onsiteLink.props.target, "_blank");
assert.equal(onsiteLink.props.rel, "noopener noreferrer");
assert.match(onsiteLink.props["aria-label"], /WhatsApp/);
assert.equal(
  collectText(onsiteLink),
  `${FUTURE_PICKUP_ATELIER_PHONE_DISPLAY} (WhatsApp)`,
);
const aiCard = aiSection.findByProps({ "data-measurement-ai-coming-soon": "true" });
assert.equal(aiCard.props["aria-disabled"], "true");
const aiHeading = aiSection.findByProps({ "data-measurement-option-heading": "ai_measurements" });
assert.equal(aiHeading.type, "h3");
assert.equal(aiHeading.props.className, "font-serif text-lg font-bold leading-snug text-heritage-green");
assert.equal(collectText(aiHeading), "Option 4: AI Photo Measurements");
assert.match(collectText(aiCard), /Coming soon/);
assert.equal(aiCard.findAll((node) => node.type === "a" || node.type === "button").length, 0);
assert.equal(
  renderer.root.findAllByProps({ type: "radio" }).filter((radio) => radio.props.checked).length,
  0,
);

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
  "Option 1: Close-to-Body Measurements",
);
assert.equal(
  renderer.root.findByProps({ "data-measurement-option-subtitle": "risk" }).children[0],
  "Measurement by Risk Level",
);
assert.match(pageText, /Measurement by Risk Level/);
assert.match(pageText, /Option 1: Close-to-Body Measurements/);
const sampleLegend = renderer.root
  .findByProps({ "data-measurement-sample-selector": "true" })
  .findByType("legend");
assert.equal(collectText(sampleLegend), "Option 2: Sample Cloth Measurements");
assert.equal(sampleLegend.props.className, "block w-full font-serif text-lg font-bold leading-snug text-heritage-green");
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
// Single garment: unit block fills the card (no empty garment column, no divider).
const unitRow = renderer.root.findByProps({ "data-measurement-unit-garment-row": "true" });
assert.equal(unitRow.props["data-measurement-unit-garment-layout"], "unit-only");
assert.equal(unitRow.findAllByProps({ "data-measurement-garment-picker": "true" }).length, 0);
const unitFieldset = unitRow.find((node) => node.type === "fieldset");
assert.doesNotMatch(unitFieldset.props.className, /border-l|border-t|max-w-xs|ml-auto/);
assert.match(unitFieldset.props.className, /w-full/);
assert.match(unitFieldset.props.className, /sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
assert.doesNotMatch((unitRow.children[0] as ReactTestInstance).props.className, /sm:flex-row|justify-between/);
const unitToggle = unitRow.findByProps({ "data-measurement-unit-toggle": "true" });
assert.match(unitToggle.props.className, /sm:justify-self-end/);
assert.equal(
  unitRow.find((node) => node.type === "fieldset").props["data-measurement-unit"],
  "cm",
);
for (const buttonRow of renderer.root.findAllByProps({ "data-studio-step-actions-buttons": "true" })) {
  assert.match(buttonRow.props.className, /flex-row/);
  assert.match(buttonRow.props.className, /flex-nowrap/);
  assert.equal(buttonRow.props.className.includes("sm:flex-row"), false);
}
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
assert.match(collectText(renderer.root), /Chest across sample \(laid flat\)/);
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
assert.equal(continueButton?.props["aria-disabled"], "true");
assert.equal(invalidRenderer.root.findByProps({ type: "radio", value: "low_risk" }).props.disabled, true);
assert.equal(invalidRenderer.root.findByProps({ type: "radio", value: "sample_cloth" }).props.disabled, true);


// Guide cue: clicking an Option 1 / Option 2 radio (or locked Continue) scrolls to the guide,
// flashes its gold border, then starts the existing beam. Nothing fires on mount.
const cueCalls: string[] = [];
const createNodeMock = (element: { props: Record<string, unknown> }) => {
  const name = element.props["data-measurement-form"]
    ? "form"
    : element.props["data-measurement-option-section"] === "risk"
      ? "options"
      : "other";
  return {
    scrollIntoView: (options: ScrollIntoViewOptions) => cueCalls.push(`scroll:${name}:${options.behavior}`),
    focus: () => cueCalls.push(`focus:${name}`),
  };
};
const findLockedContinue = (target: ReactTestRenderer) =>
  target.root.findAllByType("button").filter((button) =>
    button.props["aria-label"] === "Continue to Summary",
  );
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let cueRenderer!: ReactTestRenderer;
act(() => {
  cueRenderer = create(createElement(Harness, {}), { createNodeMock } as never);
});
assert.deepEqual(cueCalls, [], "no scroll or focus on mount");
assert.equal(cueRenderer.root.findAllByProps({ "data-measurement-guide-flash": "true" }).length, 0);

// Locked Continue with no method: jump to Option 1 options area.
const lockedButtons = findLockedContinue(cueRenderer);
assert.ok(lockedButtons.length > 0);
for (const button of lockedButtons) {
  assert.equal(button.props.disabled, undefined);
  assert.equal(button.props["aria-disabled"], "true");
}
act(() => {
  lockedButtons[0].props.onClick();
});
assert.deepEqual(cueCalls, ["scroll:options:smooth", "focus:options"]);
assert.equal(
  cueRenderer.root.findByProps({ "data-measurement-option-section": "risk" })
    .props["data-measurement-guide-flash"],
  "true",
);

// Option click: scroll to the revealed form, flash first, then beam.
cueCalls.length = 0;
selectMethod(cueRenderer, "low_risk");
assert.deepEqual(cueCalls, ["scroll:form:smooth", "focus:form"]);
const flashingForm = cueRenderer.root.findByProps({ "data-measurement-form": "low_risk" });
assert.equal(flashingForm.props["data-measurement-guide-flash"], "true");
assert.equal(flashingForm.props["data-measurement-guide-beam"], undefined);
assert.match(flashingForm.props.className, /ring-heritage-gold/);
await act(async () => {
  await sleep(900);
});
const beamingForm = cueRenderer.root.findByProps({ "data-measurement-form": "low_risk" });
assert.equal(beamingForm.props["data-measurement-guide-flash"], undefined);
assert.equal(beamingForm.props["data-measurement-guide-beam"], "true");
assert.match(beamingForm.props.className, /animate-step-guide-beam/);

// Locked Continue after a method is chosen: back to the form guide.
cueCalls.length = 0;
act(() => {
  findLockedContinue(cueRenderer)[0].props.onClick();
});
assert.deepEqual(cueCalls, ["scroll:form:smooth", "focus:form"]);

// Restored state with a method: no cue on mount.
cueCalls.length = 0;
act(() => {
  create(
    createElement(Harness, {
      initialState: setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "sample_cloth"),
    }),
    { createNodeMock } as never,
  );
});
assert.deepEqual(cueCalls, [], "restored method must not scroll or flash");

// Reduced motion: instant scroll, focus, no flash/beam.
const originalWindow = (globalThis as { window?: unknown }).window;
(globalThis as { window?: unknown }).window = {
  matchMedia: (query: string) => ({ matches: query.includes("reduce") }),
};
try {
  let reducedRenderer!: ReactTestRenderer;
  act(() => {
    reducedRenderer = create(createElement(Harness, {}), { createNodeMock } as never);
  });
  cueCalls.length = 0;
  selectMethod(reducedRenderer, "medium_risk");
  assert.deepEqual(cueCalls, ["scroll:form:auto", "focus:form"]);
  const reducedForm = reducedRenderer.root.findByProps({ "data-measurement-form": "medium_risk" });
  assert.equal(reducedForm.props["data-measurement-guide-flash"], undefined);
  assert.equal(reducedForm.props["data-measurement-guide-beam"], undefined);
} finally {
  (globalThis as { window?: unknown }).window = originalWindow;
}

act(() => {
  cueRenderer.unmount();
});

const TwoGarmentHarness = () => {
  const [state, setState] = useState(createEmptyFutureMeasurementState());
  const twoPhysical = [
    { garmentKey: "shirt:1", garmentType: "shirt" as const },
    { garmentKey: "shirt:2", garmentType: "shirt" as const },
  ];
  const plan = planMeasurementRequirements({
    route: state.route,
    garmentTypeSelection: selection,
    physicalGarments: twoPhysical,
  });
  const reconciled = reconcileFutureMeasurementState({ state, plan });
  return createElement(DormantFutureMeasurementStep, {
    plan,
    state: reconciled,
    physicalGarments: twoPhysical,
    onChange: setState,
    onRouteChange: (route) => {
      setState((current) => setFutureMeasurementRoute(current, route));
    },
    onBack: () => undefined,
    onContinue: () => undefined,
  });
};
let twoRenderer!: ReactTestRenderer;
act(() => {
  twoRenderer = create(createElement(TwoGarmentHarness));
});
selectMethod(twoRenderer, "low_risk");
const splitRow = twoRenderer.root.findByProps({ "data-measurement-unit-garment-row": "true" });
assert.equal(splitRow.props["data-measurement-unit-garment-layout"], "split");
assert.equal(splitRow.findAllByProps({ "data-measurement-garment-picker": "true" }).length, 1);
const splitFieldset = splitRow.find((node) => node.type === "fieldset");
assert.match(splitFieldset.props.className, /sm:border-l/);
assert.match(splitFieldset.props.className, /sm:max-w-xs/);
assert.equal(
  splitFieldset.props["data-measurement-unit"],
  "cm",
);
for (const buttonRow of twoRenderer.root.findAllByProps({ "data-studio-step-actions-buttons": "true" })) {
  assert.match(buttonRow.props.className, /flex-nowrap/);
  assert.equal(buttonRow.props.className.includes("sm:flex-row"), false);
}

console.log("PASS: sample cloth two-section layout, laid-flat labels, and single active method");
