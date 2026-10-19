/**
 * Summary section Edit -> Step 7 group jump.
 * - Stage 8 section Edit links emit {wearerId, groupKey}; the card's main
 *   "Edit Measurements" button is unchanged.
 * - Step 7 consumes a transient groupFocusRequest: selects the person and
 *   garment through its normal selection paths, scrolls + focuses that
 *   group's heading, or reports found=false so Design Studio falls back to
 *   the top of Step 7.
 * - The request never reaches measurement state (drafts).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement, useState } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import {
  DormantFutureMeasurementStep,
  type MeasurementGroupFocusRequest,
} from "./src/components/DormantFutureMeasurementStep";
import {
  DormantFutureSummaryStep,
  type SummaryMeasurementGroupEditTarget,
} from "./src/components/DormantFutureSummaryStep";
import type { FutureMeasurementStateV1, GarmentTypeStepSelection } from "./src/types";
import type { FutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import {
  createEmptyFutureMeasurementState,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
} from "./src/utils/measurementBlueprint";
import {
  getMeasurementGroupNavigationTarget,
  MEASUREMENT_SHARED_GROUP_KEY,
} from "./src/utils/designStudioNavigation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// requestAnimationFrame runs synchronously so scroll / focus are observable.
(globalThis as { window?: unknown }).window = {
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  },
  cancelAnimationFrame: () => undefined,
  matchMedia: () => ({ matches: true }),
};

const isButtonWith = (attribute: string, value?: unknown) => (node: ReactTestInstance) =>
  node.type === "button" &&
  (value === undefined ? node.props[attribute] !== undefined : node.props[attribute] === value);

// ---------------------------------------------------------------------------
// 1. Navigation target helper
// ---------------------------------------------------------------------------
assert.equal(MEASUREMENT_SHARED_GROUP_KEY, "shared");
assert.deepEqual(
  getMeasurementGroupNavigationTarget({ wearerId: "w-amaka", groupKey: "additional:shirt:1" }),
  { kind: "measurement_group", wearerId: "w-amaka", groupKey: "additional:shirt:1" },
);

// ---------------------------------------------------------------------------
// 2. Stage 8: each section Edit emits its own target; main Edit unchanged
// ---------------------------------------------------------------------------
const value = (id: string, garmentKey: string | null) => ({
  requirementKey: `${garmentKey ?? "shared"}:${id}`,
  measurementId: id,
  garmentKey,
  label: id,
  formattedValue: "40 in (101.6 cm)",
  formattedParts: { preferred: "40 in", alternate: "101.6 cm" },
  convertedFormattedValue: null,
  convertedFormattedParts: null,
  outsideUsualRange: false,
  convertedLabel: null,
  value: 40,
  unit: "inch" as const,
  provenance: "customer_input" as never,
  profileId: null,
  averageFactor: null,
});
const baseSummary = {
  status: "incomplete",
  blockers: [],
  garmentSummary: [],
  fabricSummary: [],
  designStyleSummary: null,
  designStyleOccurrences: [],
  customDetailsSummary: [],
  aiTryOnSummary: { status: "skipped", label: "Skipped" },
  pricingSummary: {
    status: "pending",
    garmentConstructionSubtotal: null,
    customDetailsExactSubtotal: 0,
    selectedDesignPrice: null,
  },
} as unknown as Omit<FutureDesignStudioSummary, "measurementSummary">;
const multiSummary = {
  ...baseSummary,
  measurementSummary: {
    route: null,
    routeLabel: "2 people",
    unit: "inch",
    shared: [],
    byGarment: [],
    wearerGroups: [
      {
        wearerId: "w-chidi", displayName: "Chidi", garmentKeys: ["base:shirt"],
        route: "low_risk", routeLabel: "Low Risk", unit: "inch", status: "complete",
        shared: [value("total_height", null)],
        byGarment: [{ garmentKey: "base:shirt", garmentLabel: "Standard Shirt", values: [value("shirt_length", "base:shirt")] }],
      },
      {
        wearerId: "w-amaka", displayName: "Amaka", garmentKeys: ["additional:shirt:1"],
        route: "high_risk", routeLabel: "High Risk", unit: "inch", status: "complete",
        shared: [value("total_height", null)],
        byGarment: [{ garmentKey: "additional:shirt:1", garmentLabel: "Standard Shirt", values: [value("shirt_length", "additional:shirt:1")] }],
      },
    ],
  },
} as unknown as FutureDesignStudioSummary;
const soloSummary = {
  ...baseSummary,
  measurementSummary: {
    route: "high_risk",
    routeLabel: "High Risk",
    unit: "inch",
    shared: [value("total_height", null)],
    byGarment: [{ garmentKey: "base:shirt", garmentLabel: "Standard Shirt", values: [value("shirt_length", "base:shirt")] }],
  },
} as unknown as FutureDesignStudioSummary;

const renderSummary = (
  summary: FutureDesignStudioSummary,
  withGroupHandler: boolean,
) => {
  const groupTargets: SummaryMeasurementGroupEditTarget[] = [];
  let mainEdits = 0;
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(DormantFutureSummaryStep, {
        summary,
        onBack: () => {},
        onEditGarments: () => {},
        onEditFabrics: () => {},
        onEditDesignStyle: () => {},
        onEditCustomDetails: () => {},
        onEditAiTryOn: () => {},
        onEditMeasurements: () => { mainEdits += 1; },
        ...(withGroupHandler
          ? { onEditMeasurementGroup: (target: SummaryMeasurementGroupEditTarget) => { groupTargets.push(target); } }
          : {}),
        canContinueToShipping: false,
        onContinueToShipping: () => {},
      }),
    );
  });
  return { renderer, groupTargets, mainEdits: () => mainEdits };
};

{
  const { renderer, groupTargets, mainEdits } = renderSummary(multiSummary, true);
  const sectionEdits = renderer.root.findAll(isButtonWith("data-summary-measurement-section-edit", true));
  assert.deepEqual(
    sectionEdits.map((button) => button.props["aria-label"]),
    [
      "Edit Chidi's shared measurements",
      "Edit Chidi's Standard Shirt measurements",
      "Edit Amaka's shared measurements",
      "Edit Amaka's Standard Shirt measurements",
    ],
  );
  for (const button of sectionEdits) act(() => { button.props.onClick(); });
  assert.deepEqual(groupTargets, [
    { wearerId: "w-chidi", groupKey: "shared" },
    { wearerId: "w-chidi", groupKey: "base:shirt" },
    { wearerId: "w-amaka", groupKey: "shared" },
    { wearerId: "w-amaka", groupKey: "additional:shirt:1" },
  ]);
  assert.equal(mainEdits(), 0, "section Edit links use the group path when it is wired");
  const mainEdit = renderer.root.find(isButtonWith("aria-label", "Edit Measurements"));
  act(() => { mainEdit.props.onClick(); });
  assert.equal(mainEdits(), 1, "main Edit Measurements keeps the stage-top path");
  assert.equal(groupTargets.length, 4, "main Edit Measurements never emits a group target");
  act(() => renderer.unmount());
}
{
  const { renderer, groupTargets } = renderSummary(soloSummary, true);
  for (const button of renderer.root.findAll(isButtonWith("data-summary-measurement-section-edit", true))) {
    act(() => { button.props.onClick(); });
  }
  assert.deepEqual(groupTargets, [
    { wearerId: null, groupKey: "shared" },
    { wearerId: null, groupKey: "base:shirt" },
  ], "solo: no person switch, just the group");
  act(() => renderer.unmount());
}
{
  const { renderer, groupTargets, mainEdits } = renderSummary(soloSummary, false);
  for (const button of renderer.root.findAll(isButtonWith("data-summary-measurement-section-edit", true))) {
    act(() => { button.props.onClick(); });
  }
  assert.equal(groupTargets.length, 0);
  assert.equal(mainEdits(), 2, "without a group handler section Edit falls back to Edit Measurements");
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 3. Step 7 consumes the request
// ---------------------------------------------------------------------------
const construction = (garmentType: "shirt" | "trouser", optionId: string, selectionGroup: string) => ({
  status: "resolved" as const,
  garmentType,
  components: [{
    componentKey: `${garmentType}:${selectionGroup}:${optionId}`,
    optionId,
    selectionGroup: selectionGroup as never,
    priceCents: 1,
    price: 0.01,
  }],
  totalPriceCents: 1,
  totalPrice: 0.01,
});
const selection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
    trouser: construction("trouser", "trouser_rope", "trouser_fastening"),
  },
} as GarmentTypeStepSelection;
const physicalGarments = [
  { garmentKey: "shirt:1", garmentType: "shirt" as const },
  { garmentKey: "trouser:1", garmentType: "trouser" as const },
];
const plan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: selection,
  physicalGarments,
});
assert.ok(plan.requirements.some((requirement) => requirement.garmentKey === "trouser:1"));
const startState = reconcileFutureMeasurementState({
  state: { ...createEmptyFutureMeasurementState("low_risk", "inch"), activeGarmentKey: "shirt:1" },
  plan,
});

type Mock = { key: string; scrolls: number; focuses: number };
const run = ({
  request,
  activeWearerId = "w-chidi",
  wearerIds = ["w-chidi", "w-amaka"],
}: {
  request: MeasurementGroupFocusRequest;
  activeWearerId?: string | null;
  wearerIds?: string[];
}) => {
  const mocks: Mock[] = [];
  const handled: Array<[number, boolean]> = [];
  const selectedWearers: string[] = [];
  const stateChanges: FutureMeasurementStateV1[] = [];
  const latest: { state: FutureMeasurementStateV1 } = { state: startState };
  const Harness = () => {
    const [state, setState] = useState(startState);
    const [wearer, setWearer] = useState(activeWearerId);
    latest.state = state;
    return createElement(DormantFutureMeasurementStep, {
      plan,
      state,
      physicalGarments,
      activeWearerLabel: wearerIds.length > 1 ? wearer : null,
      wearerChips: wearerIds.length > 1 ? wearerIds.map((wearerId) => ({ wearerId, label: wearerId })) : [],
      activeWearerId: wearer,
      onSelectWearer: (wearerId: string) => {
        selectedWearers.push(wearerId);
        setWearer(wearerId);
      },
      groupFocusRequest: request,
      onGroupFocusHandled: (id: number, found: boolean) => { handled.push([id, found]); },
      onChange: (next: FutureMeasurementStateV1) => {
        stateChanges.push(next);
        setState(reconcileFutureMeasurementState({ state: next, plan }));
      },
      onRouteChange: () => undefined,
      onBack: () => undefined,
      onContinue: () => undefined,
    });
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Harness), {
      createNodeMock: (node) => {
        const key = node.props["data-measurement-group-heading"];
        if (!key) return null;
        const mock: Mock & { scrollIntoView: () => void; focus: () => void } = {
          key,
          scrolls: 0,
          focuses: 0,
          scrollIntoView() { mock.scrolls += 1; },
          focus() { mock.focuses += 1; },
        };
        mocks.push(mock);
        return mock;
      },
    });
  });
  return { renderer, mocks, handled, selectedWearers, stateChanges, state: () => latest.state, rerender: () => act(() => renderer.update(createElement(Harness))) };
};

const touched = (mocks: Mock[]) =>
  mocks.filter((mock) => mock.scrolls > 0 || mock.focuses > 0).map((mock) => [mock.key, mock.scrolls, mock.focuses]);

// 3a. Another person's garment group: person switch, garment switch, scroll + focus.
{
  const result = run({ request: { id: 7, wearerId: "w-amaka", groupKey: "trouser:1" } });
  assert.deepEqual(result.selectedWearers, ["w-amaka"], "switches to that person via onSelectWearer");
  assert.equal(result.state().activeGarmentKey, "trouser:1", "selects the garment like a chip tap");
  const garmentChip = result.renderer.root.find(isButtonWith("data-measurement-garment", "trouser:1"));
  assert.equal(garmentChip.props["aria-pressed"], true);
  assert.deepEqual(touched(result.mocks), [["trouser:1", 1, 1]], "only that group heading scrolls and gets focus");
  assert.deepEqual(result.handled, [[7, true]]);
  const group = result.renderer.root.find(
    (node) => node.type === "div" && node.props["data-measurement-group"] === "trouser:1",
  );
  assert.equal(group.props["data-measurement-group-section"], "required");
  const heading = group.find((node) => node.props["data-measurement-group-heading"] === "trouser:1");
  assert.equal(heading.type, "h4");
  assert.equal(heading.props.tabIndex, -1, "heading is programmatically focusable");
  assert.match(heading.props.className, /\bscroll-mt-24\b/);
  // Not persisted: the only state writes are the existing garment selection.
  assert.ok(result.stateChanges.length >= 1);
  for (const change of result.stateChanges) {
    const { activeGarmentKey: _ignored, ...rest } = change;
    const { activeGarmentKey: _ignored2, ...before } = startState;
    assert.deepEqual(rest, before, "jump never edits values, route, unit or other fields");
    assert.equal(JSON.stringify(change).includes("groupKey"), false);
    assert.equal(JSON.stringify(change).includes("measurement_group"), false);
  }
  // A re-render with the same request is not consumed twice.
  result.rerender();
  assert.deepEqual(result.handled, [[7, true]]);
  act(() => result.renderer.unmount());
}

// 3b. Same person's shared group: no switches, shared heading focused.
{
  const result = run({ request: { id: 8, wearerId: "w-chidi", groupKey: "shared" } });
  assert.deepEqual(result.selectedWearers, []);
  assert.equal(result.stateChanges.length, 0, "shared jump writes nothing");
  assert.deepEqual(touched(result.mocks), [["shared", 1, 1]]);
  assert.deepEqual(result.handled, [[8, true]]);
  act(() => result.renderer.unmount());
}

// 3c. Solo (wearerId null): garment group on the sole wearer.
{
  const result = run({ request: { id: 9, wearerId: null, groupKey: "shirt:1" }, activeWearerId: "w-solo", wearerIds: ["w-solo"] });
  assert.deepEqual(result.selectedWearers, []);
  assert.deepEqual(touched(result.mocks), [["shirt:1", 1, 1]]);
  assert.deepEqual(result.handled, [[9, true]]);
  act(() => result.renderer.unmount());
}

// 3d. Fallbacks: garment gone, person gone, no method selected.
{
  const result = run({ request: { id: 10, wearerId: "w-chidi", groupKey: "dress:1" } });
  assert.deepEqual(result.handled, [[10, false]], "unknown garment -> top-of-Step-7 fallback");
  assert.deepEqual(touched(result.mocks), []);
  assert.equal(result.stateChanges.length, 0);
  act(() => result.renderer.unmount());
}
{
  const result = run({ request: { id: 11, wearerId: "w-gone", groupKey: "shared" } });
  assert.deepEqual(result.selectedWearers, [], "never selects a person who is not in the order");
  assert.deepEqual(result.handled, [[11, false]]);
  assert.deepEqual(touched(result.mocks), []);
  act(() => result.renderer.unmount());
}
{
  const handled: Array<[number, boolean]> = [];
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(DormantFutureMeasurementStep, {
      plan,
      state: createEmptyFutureMeasurementState(),
      physicalGarments,
      groupFocusRequest: { id: 12, wearerId: null, groupKey: "shared" },
      onGroupFocusHandled: (id: number, found: boolean) => { handled.push([id, found]); },
      onChange: () => undefined,
      onRouteChange: () => undefined,
      onBack: () => undefined,
      onContinue: () => undefined,
    }));
  });
  assert.deepEqual(handled, [[12, false]], "no form on screen (method not chosen) -> fallback");
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 4. Design Studio wiring (source checks; the full view is too heavy to mount)
// ---------------------------------------------------------------------------
const view = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const summaryWiring = view.match(/onEditMeasurements=\{\(\) => \{[\s\S]*?\}\}\s*onEditMeasurementGroup=\{\(target\) => \{[\s\S]*?\}\}/)?.[0] || "";
assert.match(
  summaryWiring,
  /onEditMeasurements=\{\(\) => \{\s*beginSummaryEditReturn\(\{ focusStageId: "measurement" \}\);\s*navigateToFutureStage\("measurement"\);\s*\}\}/,
  "main Edit Measurements: unchanged stage-top navigation",
);
assert.match(
  summaryWiring,
  /navigateToFutureStage\(\s*"measurement",\s*getMeasurementGroupNavigationTarget\(target\),\s*\)/,
);
assert.match(
  view,
  /request\.target\.kind === "measurement_group" &&\s*request\.stage === "measurement"\s*\) \{\s*setMeasurementGroupFocusRequest\(\{/,
  "Step 7 arrival hands the target to Step 7 instead of scrolling to the top",
);
assert.match(
  view,
  /effectiveTarget\.kind === "measurement_group" &&\s*effectiveStage !== "measurement"\s*\) \{\s*effectiveTarget = getMainStageNavigationTarget\(\);/,
  "a redirect away from Step 7 drops the group target",
);
assert.match(
  view,
  /if \(previousFutureStageIdRef\.current === "measurement"\) \{\s*setMeasurementGroupFocusRequest\(null\);/,
  "leaving Step 7 clears an unconsumed target",
);
assert.match(
  view,
  /onGroupFocusHandled=\{\(requestId, found\) => \{\s*setMeasurementGroupFocusRequest\(\(current\) =>\s*current\?\.id === requestId \? null : current,\s*\);\s*if \(found\) return;[\s\S]*?stage: "measurement",\s*target: getMainStageNavigationTarget\(\),/,
  "consumed once, cleared, and a miss falls back to the top of Step 7",
);
// Transient only: the focus request is plain React state, never part of a draft.
const requestMentions = view.split("\n").filter((line) => line.includes("measurementGroupFocusRequest") || line.includes("MeasurementGroupFocusRequest"));
assert.ok(requestMentions.length > 0);
for (const line of requestMentions) {
  assert.doesNotMatch(line, /draft|persist|serialize|firestore|localStorage/i, line);
}
const types = readFileSync("src/types.ts", "utf8");
assert.equal(types.includes("measurement_group"), false, "no persisted schema carries the target");

console.log("PASS: Summary section Edit jumps to the exact Step 7 group");
