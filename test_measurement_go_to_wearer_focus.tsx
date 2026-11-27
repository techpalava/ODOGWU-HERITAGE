import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import type { FutureMeasurementStateV1, GarmentTypeStepSelection } from "./src/types";
import {
  createEmptyFutureMeasurementState,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  setFutureMeasurementRoute,
} from "./src/utils/measurementBlueprint";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
const physicalGarments = [{ garmentKey: "base:shirt", garmentType: "shirt" as const }];
const plan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments,
});

let completeState = setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk");
for (const requirement of plan.requirements.filter((item) => item.directInput)) {
  completeState = setFutureMeasurementInput({
    state: completeState,
    requirement,
    displayValue: requirement.measurementId === "total_height" ? 180 : 90,
  });
}
completeState = reconcileFutureMeasurementState({ state: completeState, plan });

const chips = [
  { wearerId: "wearer-ada", label: "Ada" },
  { wearerId: "wearer-xsv", label: "XSV" },
];

type ScrollOptions = { behavior?: string; block?: string };
type FocusOptions = { preventScroll?: boolean } | undefined;
type Calls = { scroll: ScrollOptions[]; focus: FocusOptions[] };
const emptyCalls = (): Calls => ({ scroll: [], focus: [] });

const renderHarness = (targetState: FutureMeasurementStateV1) => {
  const calls = { anchor: emptyCalls(), options: emptyCalls(), form: emptyCalls(), other: emptyCalls() };
  const selectCalls: string[] = [];
  const goToCalls: string[] = [];
  const Harness = () => {
    const [activeId, setActiveId] = useState("wearer-ada");
    const active = chips.find((chip) => chip.wearerId === activeId)!;
    const other = chips.find((chip) => chip.wearerId !== activeId)!;
    const activeComplete = activeId === "wearer-ada";
    return createElement(DormantFutureMeasurementStep, {
      plan,
      state: activeComplete ? completeState : targetState,
      physicalGarments,
      orderMeasurementsComplete: false,
      otherWearerIncompleteLabels: activeComplete ? [other.label] : [],
      nextIncompleteWearer: activeComplete ? { wearerId: other.wearerId, label: other.label } : null,
      onGoToWearer: (wearerId: string) => {
        goToCalls.push(wearerId);
        setActiveId(wearerId);
      },
      activeWearerLabel: active.label,
      activeWearerGarmentLabels: ["Standard Shirt"],
      wearerChips: chips,
      activeWearerId: activeId,
      onSelectWearer: (wearerId: string) => {
        selectCalls.push(wearerId);
        setActiveId(wearerId);
      },
      onChange: () => undefined,
      onRouteChange: () => undefined,
      onBack: () => undefined,
      onContinue: () => undefined,
    });
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Harness), {
      createNodeMock: (element) => {
        const props = element.props as Record<string, unknown>;
        const bucket =
          props["data-measurement-active-wearer-jump-anchor"] === "true"
            ? calls.anchor
            : props["data-measurement-option-section"] === "risk"
              ? calls.options
              : typeof props["data-measurement-form"] === "string"
                ? calls.form
                : calls.other;
        return {
          isConnected: true,
          scrollIntoView: (opts: ScrollOptions) => bucket.scroll.push(opts),
          focus: (opts?: { preventScroll?: boolean }) => bucket.focus.push(opts),
        };
      },
    });
  });
  return { renderer, calls, selectCalls, goToCalls };
};

const byData = (renderer: ReactTestRenderer, attribute: string, value?: string) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      node.props[attribute] !== undefined &&
      (value === undefined || node.props[attribute] === value),
  );

const selectedChip = (renderer: ReactTestRenderer) =>
  byData(renderer, "data-measurement-wearer-chip-selected", "true")[0]?.props[
    "data-measurement-wearer-chip"
  ];

const click = (node: ReactTestInstance) => {
  act(() => {
    node.props.onClick();
  });
};

const totalCalls = (calls: Record<string, Calls>) =>
  Object.values(calls).reduce((sum, entry) => sum + entry.scroll.length + entry.focus.length, 0);

// Case 1: GO TO <WEARER> switches the wearer and jumps to the anchor before "Measuring for".
{
  const { renderer, calls, goToCalls, selectCalls } = renderHarness(
    setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk"),
  );
  assert.equal(selectedChip(renderer), "wearer-ada");
  assert.equal(totalCalls(calls), 0, "no jump on initial mount");

  const anchor = byData(renderer, "data-measurement-active-wearer-jump-anchor", "true")[0];
  assert.ok(anchor, "jump anchor renders with the Measuring for banner");
  assert.equal(anchor.type, "div");
  assert.equal(anchor.props.tabIndex, -1);
  const anchorClass = String(anchor.props.className);
  for (const token of ["!m-0", "h-0", "scroll-mt-28", "sm:scroll-mt-24", "overflow-hidden", "outline-none"]) {
    assert.ok(anchorClass.split(/\s+/).includes(token), `anchor class has ${token}`);
  }
  assert.equal(/\bsticky\b/.test(anchorClass), false, "anchor is not sticky");
  const banner = byData(renderer, "data-measurement-active-wearer-banner", "true")[0];
  assert.match(String(banner.props.className), /\bsticky top-2 z-20\b/);
  const siblings = anchor.parent!.children;
  assert.equal(siblings.indexOf(banner), siblings.indexOf(anchor) + 1, "anchor sits directly before the banner");
  assert.equal(banner.parent, anchor.parent, "banner stays a direct sibling (sticky pinning preserved)");

  const goTo = byData(renderer, "data-measurement-go-to-wearer", "wearer-xsv")[0];
  assert.ok(goTo, "GO TO XSV renders while Ada is complete");
  click(goTo);
  assert.deepEqual(goToCalls, ["wearer-xsv"]);
  assert.deepEqual(selectCalls, []);
  assert.equal(selectedChip(renderer), "wearer-xsv");
  assert.equal(calls.anchor.scroll.length, 1);
  assert.equal(calls.anchor.scroll[0].block, "start");
  assert.equal(calls.anchor.scroll[0].behavior, "smooth");
  assert.deepEqual(calls.anchor.focus, [{ preventScroll: true }]);
  assert.equal(calls.options.scroll.length + calls.form.scroll.length + calls.other.scroll.length, 0);

  // One-shot: later re-renders/chip switches never replay the jump.
  click(byData(renderer, "data-measurement-wearer-chip", "wearer-ada")[0]);
  click(byData(renderer, "data-measurement-wearer-chip", "wearer-xsv")[0]);
  assert.equal(calls.anchor.scroll.length, 1);
  assert.equal(calls.anchor.focus.length, 1);
  act(() => renderer.unmount());
}
console.log("PASS: GO TO <WEARER> scrolls and focuses the Measuring for jump anchor");

// Case 2: top "Measuring for" wearer chips switch wearers without any jump.
{
  const { renderer, calls, selectCalls, goToCalls } = renderHarness(
    setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk"),
  );
  click(byData(renderer, "data-measurement-wearer-chip", "wearer-xsv")[0]);
  assert.deepEqual(selectCalls, ["wearer-xsv"]);
  assert.deepEqual(goToCalls, []);
  assert.equal(selectedChip(renderer), "wearer-xsv");
  click(byData(renderer, "data-measurement-wearer-chip", "wearer-ada")[0]);
  assert.equal(selectedChip(renderer), "wearer-ada");
  assert.equal(calls.anchor.scroll.length, 0);
  assert.equal(calls.anchor.focus.length, 0);
  assert.equal(totalCalls(calls), 0, "chip switching never scrolls or focuses");
  act(() => renderer.unmount());
}
console.log("PASS: Measuring for wearer chips switch without the jump");

// Case 3: target wearer has no measurement route -> fall back to the risk options section.
{
  const { renderer, calls, goToCalls } = renderHarness(createEmptyFutureMeasurementState());
  click(byData(renderer, "data-measurement-go-to-wearer", "wearer-xsv")[0]);
  assert.deepEqual(goToCalls, ["wearer-xsv"]);
  assert.equal(selectedChip(renderer), "wearer-xsv");
  assert.equal(
    byData(renderer, "data-measurement-active-wearer-banner", "true").length,
    0,
    "banner is not mounted before a route is chosen",
  );
  assert.equal(byData(renderer, "data-measurement-active-wearer-jump-anchor", "true").length, 0);
  const options = byData(renderer, "data-measurement-option-section", "risk")[0];
  assert.equal(options.props.tabIndex, -1);
  assert.equal(calls.options.scroll.length, 1);
  assert.equal(calls.options.scroll[0].block, "start");
  assert.deepEqual(calls.options.focus, [{ preventScroll: true }]);
  assert.equal(calls.anchor.scroll.length + calls.anchor.focus.length, 0);
  act(() => renderer.unmount());
}
console.log("PASS: GO TO <WEARER> falls back to the risk options when no route is selected");

// Case 4: with requestAnimationFrame, scroll runs on the first frame and focus on the next;
// reduced motion uses behavior "auto".
{
  const globals = globalThis as { window?: unknown };
  const previousWindow = globals.window;
  const frames: Array<() => void> = [];
  globals.window = {
    requestAnimationFrame: (callback: () => void) => {
      frames.push(callback);
      return frames.length;
    },
    matchMedia: (query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" }),
  };
  try {
    const { renderer, calls } = renderHarness(
      setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk"),
    );
    click(byData(renderer, "data-measurement-go-to-wearer", "wearer-xsv")[0]);
    assert.equal(selectedChip(renderer), "wearer-xsv");
    assert.equal(calls.anchor.scroll.length, 0, "scroll waits for the next animation frame");
    let guard = 0;
    while (frames.length > 0 && calls.anchor.scroll.length === 0 && guard++ < 10) {
      frames.shift()!();
    }
    assert.equal(calls.anchor.scroll.length, 1);
    assert.equal(calls.anchor.scroll[0].behavior, "auto");
    assert.equal(calls.anchor.focus.length, 0, "focus waits one more frame");
    while (frames.length > 0 && guard++ < 20) {
      frames.shift()!();
    }
    assert.deepEqual(calls.anchor.focus, [{ preventScroll: true }]);
    act(() => renderer.unmount());
  } finally {
    globals.window = previousWindow;
  }
}
console.log("PASS: GO TO <WEARER> jump uses animation frames and honours reduced motion");
