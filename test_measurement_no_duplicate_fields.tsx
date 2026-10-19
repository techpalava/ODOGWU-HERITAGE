import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import type {
  AdditionalGarmentConstructionStateV1,
  CustomDetailSelectionGroup,
  FabricGarmentType,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  SelectedMeasurementMethod,
  WearerOrderStateV2,
} from "./src/types";
import { getFuturePaymentReviewMeasurementGroups } from "./src/utils/designStudioFuturePaymentReview";
import { projectFutureSummaryMeasurementGroups } from "./src/utils/designStudioFutureSummary";
import {
  createEmptyFutureMeasurementState,
  getMeasurementDefinition,
  isSharedPresentationRequirement,
  planMeasurementRequirements,
  projectActiveFutureMeasurementState,
  projectMeasurementRequirementsForPresentation,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  type MeasurementPhysicalGarment,
  type MeasurementRequirementPlan,
} from "./src/utils/measurementBlueprint";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Xavier (2026-10-19): "waist circumference showed twice in a measurement
 * card … make sure there are no duplicate fields". Every garment × route,
 * one or two garments (and two of the same garment), filled and height-only:
 *  - a shared body measurement shows at most once per person,
 *  - no field repeats inside one group,
 *  - every garment group lists only fields of that garment's profile,
 * in Step 7, the Summary card, and Payment Review / My Orders.
 */

const construction = (
  garmentType: string,
  optionId: string,
  selectionGroup: string,
) => ({
  status: "resolved" as const,
  garmentType,
  components: [{
    componentKey: `${garmentType}:${selectionGroup}:${optionId}`,
    optionId,
    selectionGroup: selectionGroup as CustomDetailSelectionGroup,
    priceCents: 1,
    price: 0.01,
  }],
  totalPriceCents: 1,
  totalPrice: 0.01,
});

type Variant = {
  type: FabricGarmentType;
  option?: [string, string];
  femaleOnly?: boolean;
};

const VARIANTS: Record<string, Variant> = {
  "Shirt A": { type: "shirt", option: ["shirt_std_short", "shirt_construction"] },
  "Shirt B": { type: "shirt", option: ["shirt_std_midlong", "shirt_construction"] },
  "Shirt C": { type: "shirt", option: ["shirt_long_short", "shirt_construction"] },
  "Shirt D": { type: "shirt", option: ["shirt_long_midlong", "shirt_construction"] },
  "Kaftan C": { type: "kaftan", option: ["shirt_long_short", "kaftan_construction"] },
  "Dress E": { type: "dress", option: ["dress_std_short", "dress_construction"], femaleOnly: true },
  "Dress E sleeveless": { type: "dress", option: ["dress_std_sleeveless", "dress_construction"], femaleOnly: true },
  "Dress F": { type: "dress", option: ["dress_std_midlong", "dress_construction"], femaleOnly: true },
  "Dress G": { type: "dress", option: ["dress_long_short", "dress_construction"], femaleOnly: true },
  "Dress H": { type: "dress", option: ["dress_long_midlong", "dress_construction"], femaleOnly: true },
  "Gown G": { type: "full_length_gown", option: ["dress_long_short", "gown_construction"], femaleOnly: true },
  "Trousers I": { type: "trouser" },
  "Shorts J": { type: "standard_shorts" },
  "Bum Shorts K": { type: "bum_shorts", femaleOnly: true },
  "Skirt L": { type: "skirt", option: ["skirt_std", "skirt_length"], femaleOnly: true },
  "Long Skirt M": { type: "long_skirt", option: ["skirt_long", "skirt_length"], femaleOnly: true },
};

const ROUTES: SelectedMeasurementMethod[] = [
  "low_risk",
  "medium_risk",
  "high_risk",
  "critical_risk",
  "sample_cloth",
];

type Scenario = {
  name: string;
  selection: GarmentTypeStepSelection;
  garments: MeasurementPhysicalGarment[];
  additional?: AdditionalGarmentConstructionStateV1;
};

const scenario = (names: string[], repeat = false): Scenario => {
  const variants = names.map((name) => VARIANTS[name]!);
  const demographic = variants.some((variant) => variant.femaleOnly) ? "female" : "male";
  const garments: MeasurementPhysicalGarment[] = variants.map((variant) => ({
    garmentKey: `base:${variant.type}`,
    garmentType: variant.type,
  }));
  let additional: AdditionalGarmentConstructionStateV1 | undefined;
  if (repeat) {
    const variant = variants[0]!;
    const garmentKey = `additional:${variant.type}:1`;
    garments.push({ garmentKey, garmentType: variant.type });
    additional = {
      schemaVersion: 1,
      byGarmentKey: {
        [garmentKey]: variant.option
          ? construction(variant.type, variant.option[0], variant.option[1])
          : { status: "resolved", garmentType: variant.type, components: [], totalPriceCents: 0, totalPrice: 0 },
      },
    } as unknown as AdditionalGarmentConstructionStateV1;
  }
  return {
    name: repeat ? `2 × ${names[0]}` : names.join(" + "),
    selection: {
      garmentTypes: variants.map((variant) => variant.type),
      demographic,
      constructionByGarment: Object.fromEntries(
        variants
          .filter((variant) => variant.option)
          .map((variant) => [
            variant.type,
            construction(variant.type, variant.option![0], variant.option![1]),
          ]),
      ),
    } as unknown as GarmentTypeStepSelection,
    garments,
    additional,
  };
};

const names = Object.keys(VARIANTS);
const SCENARIOS: Scenario[] = [
  ...names.map((name) => scenario([name])),
  ...names.flatMap((left, index) =>
    names
      .slice(index + 1)
      .filter((right) => VARIANTS[left]!.type !== VARIANTS[right]!.type)
      .map((right) => scenario([left, right])),
  ),
  ...["Shirt A", "Dress E", "Trousers I", "Shorts J", "Skirt L"].map((name) => scenario([name], true)),
];

const plan = (item: Scenario, route: SelectedMeasurementMethod) =>
  planMeasurementRequirements({
    route,
    garmentTypeSelection: item.selection,
    physicalGarments: item.garments,
    additionalGarmentConstructions: item.additional,
  });

const fill = (
  route: SelectedMeasurementMethod,
  current: MeasurementRequirementPlan,
  heightOnly: boolean,
): FutureMeasurementStateV1 => {
  let state = createEmptyFutureMeasurementState(route, "cm");
  for (const requirement of current.requirements) {
    if (requirement.inputSource === "calculated_average_factor") continue;
    if (heightOnly && requirement.measurementId !== "total_height") continue;
    state = setFutureMeasurementInput({
      state,
      requirement,
      displayValue: requirement.measurementId === "total_height" ? 170 : 40,
    });
  }
  return reconcileFutureMeasurementState({ state, plan: current });
};

const isSharedBody = (measurementId: string) =>
  getMeasurementDefinition(measurementId as never)?.scope === "shared_body";

const profileFieldsByGarment = (current: MeasurementRequirementPlan) =>
  new Map(
    current.profiles.flatMap((profile) =>
      profile.status === "resolved"
        ? [[profile.garmentKey, new Set(profile.profile.fields.map((field) => field.measurementId as string))] as const]
        : [],
    ),
  );

/** One person's card: shared rows + per-garment rows, by measurement id. */
const assertCard = ({
  where,
  shared,
  byGarment,
  current,
}: {
  where: string;
  shared: readonly { id: string; label: string }[];
  byGarment: ReadonlyMap<string, readonly { id: string; label: string }[]>;
  current: MeasurementRequirementPlan;
}) => {
  const fields = profileFieldsByGarment(current);
  const allFields = new Set([...fields.values()].flatMap((set) => [...set]));
  const check = (group: string, rows: readonly { id: string; label: string }[]) => {
    const ids = rows.map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length, `${where}: ${group} repeats a field (${ids.join(", ")})`);
    const labels = rows.map((row) => row.label);
    assert.equal(new Set(labels).size, labels.length, `${where}: ${group} repeats a label (${labels.join(", ")})`);
  };
  check("shared", shared);
  shared.forEach((row) =>
    assert.ok(allFields.has(row.id), `${where}: shared ${row.id} belongs to none of this person's garments`),
  );
  const bodySeen = new Map<string, string[]>();
  shared.forEach((row) => bodySeen.set(row.id, ["shared"]));
  byGarment.forEach((rows, garmentKey) => {
    check(garmentKey, rows);
    const allowed = fields.get(garmentKey);
    assert.ok(allowed, `${where}: group ${garmentKey} has no resolved profile`);
    rows.forEach((row) => {
      assert.ok(allowed!.has(row.id), `${where}: ${row.id} shown for ${garmentKey}, which does not use it`);
      if (isSharedBody(row.id)) bodySeen.set(row.id, [...(bodySeen.get(row.id) || []), garmentKey]);
    });
  });
  bodySeen.forEach((groups, id) =>
    assert.equal(groups.length, 1, `${where}: body measurement ${id} shows ${groups.length} times (${groups.join(", ")})`),
  );
};

let cases = 0;
for (const item of SCENARIOS) {
  for (const route of ROUTES) {
    const current = plan(item, route);
    if (route === "critical_risk" && !current.criticalRiskSupported) continue;
    for (const heightOnly of [false, true]) {
      const state = fill(route, current, heightOnly);
      const where = `${item.name} / ${route}${heightOnly ? " / height only typed" : ""}`;

      // Step 7 form rows (Required + Calculated + Optional sections together).
      const presented = projectMeasurementRequirementsForPresentation({
        requirements: current.requirements,
        state,
      });
      const step7Garments = new Map<string, { id: string; label: string }[]>();
      presented
        .filter((requirement) => !isSharedPresentationRequirement(requirement))
        .forEach((requirement) =>
          step7Garments.set(requirement.garmentKey, [
            ...(step7Garments.get(requirement.garmentKey) || []),
            { id: requirement.measurementId, label: requirement.definition.customerLabel },
          ]),
        );
      assertCard({
        where: `Step 7 ${where}`,
        shared: presented
          .filter(isSharedPresentationRequirement)
          .map((requirement) => ({ id: requirement.measurementId, label: requirement.definition.customerLabel })),
        byGarment: step7Garments,
        current,
      });

      // Summary card.
      const summary = projectFutureSummaryMeasurementGroups({
        measurementPlan: current,
        measurementState: state,
        garmentLabels: new Map(item.garments.map((garment) => [garment.garmentKey, garment.garmentKey])),
        blockers: [],
      });
      assertCard({
        where: `Summary ${where}`,
        shared: summary.shared.map((value) => ({ id: value.measurementId, label: value.label })),
        byGarment: new Map(
          summary.byGarment.map((group) => [
            group.garmentKey,
            group.values.map((value) => ({ id: value.measurementId, label: value.label })),
          ]),
        ),
        current,
      });

      // Payment Review / My Orders read the stored order bags.
      const stored = projectActiveFutureMeasurementState({ state, plan: current });
      const review = getFuturePaymentReviewMeasurementGroups({
        measurements: stored,
        garments: item.garments.map((garment) => ({
          garmentKey: garment.garmentKey,
          label: garment.garmentKey,
          garmentType: garment.garmentType,
          demographic: item.selection.demographic,
        })),
      });
      assertCard({
        where: `Payment Review ${where}`,
        shared: (review.find((group) => group.garmentKey === null)?.items || []).map((entry) => ({
          id: entry.measurementId,
          label: entry.label,
        })),
        byGarment: new Map(
          review
            .filter((group) => group.garmentKey !== null)
            .map((group) => [
              group.garmentKey!,
              group.items.map((entry) => ({ id: entry.measurementId, label: entry.label })),
            ]),
        ),
        current,
      });
      cases += 1;
    }
  }
}
assert.ok(cases > 1000, `enumerated ${cases} cases`);
console.log(`PASS: no duplicate or out-of-scope measurement fields across ${cases} garment × route cases`);

// The reported case: Waist on Height Only for Trousers + Shorts shows once,
// with the shared body measurements, and the value is the same estimate.
{
  const item = scenario(["Trousers I", "Shorts J"]);
  const current = plan(item, "critical_risk");
  assert.equal(current.criticalRiskSupported, true);
  const state = fill("critical_risk", current, false);
  const summary = projectFutureSummaryMeasurementGroups({
    measurementPlan: current,
    measurementState: state,
    garmentLabels: new Map([["base:trouser", "Trousers"], ["base:standard_shorts", "Shorts"]]),
    blockers: [],
  });
  const waist = [
    ...summary.shared,
    ...summary.byGarment.flatMap((group) => group.values),
  ].filter((value) => value.measurementId === "waist_circumference");
  assert.equal(waist.length, 1, "Waist Circumference shows once in the Summary card");
  assert.equal(waist[0]!.garmentKey, null, "and sits with the shared body measurements");
  assert.equal(waist[0]!.provenance, "calculated_average_factor");
  assert.ok(summary.byGarment.every((group) => group.values.length > 0), "each garment keeps its own lengths");
  assert.ok(
    summary.byGarment.find((group) => group.garmentKey === "base:standard_shorts")!.values.some(
      (value) => value.measurementId === "waist_to_knee_length",
    ),
  );
  // Stored order data is unchanged: each garment still carries its own estimate.
  assert.ok(state.derived.byGarmentKey["base:trouser"]?.waist_circumference);
  assert.ok(state.derived.byGarmentKey["base:standard_shorts"]?.waist_circumference);
  assert.equal(
    state.derived.byGarmentKey["base:trouser"]!.waist_circumference!.valueCm,
    state.derived.byGarmentKey["base:standard_shorts"]!.waist_circumference!.valueCm,
  );
}
console.log("PASS: Height Only Trousers + Shorts shows Waist Circumference once");

// A body measurement typed for one garment is not also shown as a height
// estimate for another (Dress Hip is required; Trousers would estimate it).
{
  const item = scenario(["Dress E", "Trousers I"]);
  const current = plan(item, "high_risk");
  const state = fill("high_risk", current, true);
  const hip = projectMeasurementRequirementsForPresentation({
    requirements: current.requirements,
    state,
  }).filter((requirement) => requirement.measurementId === "hip_circumference");
  assert.equal(hip.length, 1, "Hip shows once before it is typed");
  assert.equal(hip[0]!.section, "required");
  assert.equal(hip[0]!.scope, "shared");
}
console.log("PASS: a required shared field is not duplicated by an estimate");

// Multi-person: each person's Payment Review / My Orders groups stay clean.
{
  const item = scenario(["Trousers I", "Shorts J"]);
  const current = plan(item, "critical_risk");
  const stored = projectActiveFutureMeasurementState({
    state: fill("critical_risk", current, false),
    plan: current,
  });
  const other = scenario(["Shirt A"]);
  const otherPlan = plan(other, "medium_risk");
  const otherStored = projectActiveFutureMeasurementState({
    state: fill("medium_risk", otherPlan, false),
    plan: otherPlan,
  });
  const order: WearerOrderStateV2 = {
    schemaVersion: 2,
    wearers: [
      { wearerId: "w1", displayName: "Ada", fitContext: null, presentationOrder: 0, measurement: stored },
      { wearerId: "w2", displayName: "Obi", fitContext: null, presentationOrder: 1, measurement: otherStored },
    ],
    assignmentByGarmentKey: {
      "base:trouser": "w1",
      "base:standard_shorts": "w1",
      "base:shirt": "w2",
    },
  };
  const groups = getFuturePaymentReviewMeasurementGroups({
    measurements: order,
    garments: [
      { garmentKey: "base:trouser", label: "Trousers", garmentType: "trouser", demographic: "male" },
      { garmentKey: "base:standard_shorts", label: "Shorts", garmentType: "standard_shorts", demographic: "male" },
      { garmentKey: "base:shirt", label: "Shirt", garmentType: "shirt", demographic: "male" },
    ],
  });
  assert.ok(groups.length >= 3, "multi-person groups are produced");
  const adaWaist = groups
    .filter((group) => group.title.startsWith("Ada"))
    .flatMap((group) => group.items)
    .filter((entry) => entry.measurementId === "waist_circumference");
  assert.equal(adaWaist.length, 1, "Ada's Waist shows once");
  const obiItems = groups.filter((group) => group.title.startsWith("Obi")).flatMap((group) => group.items);
  assert.equal(obiItems.some((entry) => entry.measurementId === "waist_circumference"), false, "Obi's shirt has no Waist");
}
console.log("PASS: multi-person Payment Review keeps one Waist per person");

// Step 7 renders the shared estimate once, under Shared Body Measurements.
{
  const item = scenario(["Trousers I", "Shorts J"]);
  const current = plan(item, "critical_risk");
  const state = fill("critical_risk", current, false);
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(DormantFutureMeasurementStep, {
        plan: current,
        state,
        physicalGarments: item.garments,
        onChange: () => undefined,
        onRouteChange: () => undefined,
        onBack: () => undefined,
        onContinue: () => undefined,
      }),
    );
  });
  const hostFields = (root: ReactTestInstance, id: string) =>
    root.findAll(
      (node) => typeof node.type === "string" && node.props["data-measurement-field"] === id,
    );
  assert.equal(hostFields(renderer.root, "waist_circumference").length, 1, "Step 7 shows Waist once");
  const calculatedShared = renderer.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      node.props["data-measurement-group"] === "shared" &&
      node.props["data-measurement-group-section"] === "calculated",
  );
  assert.equal(calculatedShared.length, 1);
  assert.equal(hostFields(calculatedShared[0]!, "waist_circumference").length, 1);
  act(() => renderer.unmount());
}
console.log("PASS: Step 7 shows the shared Waist estimate once");
