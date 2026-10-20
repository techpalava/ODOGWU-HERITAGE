import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import type {
  CustomDetailSelectionGroup,
  FabricGarmentType,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  SelectedMeasurementMethod,
} from "./src/types";
import { getFuturePaymentReviewMeasurementGroups } from "./src/utils/designStudioFuturePaymentReview";
import { projectFutureSummaryMeasurementGroups } from "./src/utils/designStudioFutureSummary";
import {
  createEmptyFutureMeasurementState,
  isFutureSummaryUnlockedByMeasurements,
  isSharedPresentationRequirement,
  measurementAudienceNoticeCopy,
  projectActiveFutureMeasurementState,
  projectMeasurementRequirementsForPresentation,
  reconcileFutureMeasurementState,
  resolveMeasurementAudienceNotice,
  setFutureMeasurementInput,
  type MeasurementPhysicalGarment,
  type MeasurementRequirementPlan,
} from "./src/utils/measurementBlueprint";
import {
  createEmptyWearerOrder,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
} from "./src/utils/wearerOrder";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Xavier (2026-10-20): no audience chosen, or a female/unisex-only garment on
 * a Male order, must not block Critical Risk (Height Only). Measurement uses
 * the standard (unisex) sizing and Step 7 shows a short warning instead.
 */

const construction = (garmentType: string, optionId: string, selectionGroup: string) => ({
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

const CONSTRUCTIONS: Partial<Record<FabricGarmentType, [string, string]>> = {
  shirt: ["shirt_std_short", "shirt_construction"],
  dress: ["dress_std_short", "dress_construction"],
  full_length_gown: ["dress_long_short", "gown_construction"],
  skirt: ["skirt_std", "skirt_length"],
};

const selectionFor = (
  types: FabricGarmentType[],
  demographic: GarmentTypeStepSelection["demographic"],
): GarmentTypeStepSelection => ({
  garmentTypes: types,
  demographic,
  constructionByGarment: Object.fromEntries(
    types
      .filter((type) => CONSTRUCTIONS[type])
      .map((type) => [type, construction(type, CONSTRUCTIONS[type]![0], CONSTRUCTIONS[type]![1])]),
  ),
} as unknown as GarmentTypeStepSelection);

const garmentsFor = (types: FabricGarmentType[]): MeasurementPhysicalGarment[] =>
  types.map((type) => ({ garmentKey: `base:${type}`, garmentType: type }));

const soleRuntime = (types: FabricGarmentType[], demographic: GarmentTypeStepSelection["demographic"], route: SelectedMeasurementMethod) => {
  const garmentTypeSelection = selectionFor(types, demographic);
  const garments = garmentsFor(types);
  const reconciled = reconcileWearerOrder({
    order: createEmptyWearerOrder(),
    garmentKeys: garments.map((garment) => garment.garmentKey),
    compatibilityDemographic: demographic,
    garments,
    garmentTypeSelection,
  });
  const order = {
    ...reconciled,
    wearers: reconciled.wearers.map((wearer) => ({
      ...wearer,
      measurement: createEmptyFutureMeasurementState(route, "cm"),
    })),
  };
  const [runtime] = planWearerOrderMeasurements({
    order,
    garmentTypeSelection,
    physicalGarments: garments,
  });
  assert.ok(runtime, "sole wearer runtime");
  return { runtime: runtime!, garments, garmentTypeSelection };
};

// 1. The notice resolver.
assert.deepEqual(
  resolveMeasurementAudienceNotice({ garments: garmentsFor(["dress"]), garmentTypeSelection: selectionFor(["dress"], null) }),
  { kind: "no_audience", garmentKeys: ["base:dress"] },
);
assert.deepEqual(
  resolveMeasurementAudienceNotice({ garments: garmentsFor(["shirt", "dress"]), garmentTypeSelection: selectionFor(["shirt", "dress"], "male") }),
  { kind: "audience_mismatch", audience: "male", garmentKeys: ["base:dress"] },
  "only the female/unisex-only garment is flagged on a Male order",
);
assert.equal(
  resolveMeasurementAudienceNotice({ garments: garmentsFor(["shirt", "dress"]), garmentTypeSelection: selectionFor(["shirt", "dress"], "female") }),
  null,
);
assert.equal(
  resolveMeasurementAudienceNotice({ garments: garmentsFor(["shirt"]), garmentTypeSelection: selectionFor(["shirt"], "male") }),
  null,
);
assert.equal(
  resolveMeasurementAudienceNotice({ garments: garmentsFor(["agbada"]), garmentTypeSelection: selectionFor(["agbada"], "male") }),
  null,
  "Agbada (no profile) keeps its existing behaviour and gets no audience warning",
);
assert.equal(
  resolveMeasurementAudienceNotice({
    garments: garmentsFor(["dress"]),
    garmentTypeSelection: { ...selectionFor(["dress"], "male"), constructionByGarment: {} } as GarmentTypeStepSelection,
  }),
  null,
  "an unresolved construction keeps its existing behaviour and gets no audience warning",
);
console.log("PASS: audience notice resolver");

// 2. Exact copy.
assert.equal(
  measurementAudienceNoticeCopy({ kind: "no_audience", garmentKeys: ["base:dress"] }, ["Standard Dress"]),
  "No audience chosen for Standard Dress, so we're using our standard sizing. Please check your choice in Step 1.",
);
assert.equal(
  measurementAudienceNoticeCopy({ kind: "audience_mismatch", audience: "male", garmentKeys: ["base:dress"] }, ["Standard Dress"]),
  "Standard Dress is usually a women's garment, but this order is set to Male. We'll still measure it using our standard sizing. Please check your choice in Step 1.",
);
assert.equal(
  measurementAudienceNoticeCopy({ kind: "audience_mismatch", audience: "male", garmentKeys: ["base:dress", "base:skirt"] }, ["Standard Dress", "Skirt"]),
  "Standard Dress and Skirt are usually women's garments, but this order is set to Male. We'll still measure them using our standard sizing. Please check your choice in Step 1.",
);
console.log("PASS: audience warning copy");

// 3. Height Only stays available and completes; every method plans sensibly.
const cases: Array<[string, FabricGarmentType[], GarmentTypeStepSelection["demographic"], string]> = [
  ["no audience, Standard Dress", ["dress"], null, "no_audience"],
  ["no audience, Shirt + Standard Dress", ["shirt", "dress"], null, "no_audience"],
  ["Male, Standard Dress", ["dress"], "male", "audience_mismatch"],
  ["Male, Shirt + Standard Dress", ["shirt", "dress"], "male", "audience_mismatch"],
  ["Male, Full-Length Gown", ["full_length_gown"], "male", "audience_mismatch"],
  ["Male, Skirt", ["skirt"], "male", "audience_mismatch"],
  ["Male, Bum Shorts", ["bum_shorts"], "male", "audience_mismatch"],
];

const uniqueIds = (where: string, ids: readonly string[]) =>
  assert.equal(new Set(ids).size, ids.length, `${where}: repeated field (${ids.join(", ")})`);

for (const [label, types, demographic, kind] of cases) {
  for (const route of ["low_risk", "medium_risk", "high_risk", "critical_risk"] as const) {
    const { runtime, garments } = soleRuntime(types, demographic, route);
    const plan = runtime.plan;
    const where = `${label} / ${route}`;
    assert.equal(plan.criticalRiskSupported, true, `${where}: Height Only available`);
    assert.deepEqual(plan.criticalRiskBlockingGarmentKeys, []);
    assert.equal(plan.audienceNotice?.kind, kind, `${where}: warning kind`);
    assert.deepEqual(
      [...new Set(plan.profiles.map((profile) => profile.status))],
      ["resolved"],
      `${where}: every garment resolves a measurement profile`,
    );
    // Every garment gets fields only from its own profile.
    for (const garment of garments) {
      const profile = plan.profiles.find((item) => item.garmentKey === garment.garmentKey);
      assert.ok(profile && profile.status === "resolved");
      const allowed = new Set(profile.profile.fields.map((field) => field.measurementId as string));
      plan.requirements
        .filter((requirement) => requirement.garmentKey === garment.garmentKey)
        .forEach((requirement) =>
          assert.ok(allowed.has(requirement.measurementId), `${where}: ${requirement.measurementId} is not a ${garment.garmentType} field`),
        );
    }
    // Fill: Height Only types Total Height (plus any factorless required row);
    // the other methods type every manual row.
    let state: FutureMeasurementStateV1 = createEmptyFutureMeasurementState(route, "cm");
    for (const requirement of plan.requirements) {
      if (requirement.inputSource === "calculated_average_factor") continue;
      if (route === "critical_risk" && !requirement.directInput) continue;
      state = setFutureMeasurementInput({
        state,
        requirement,
        displayValue: requirement.measurementId === "total_height" ? 170 : 40,
      });
    }
    state = reconcileFutureMeasurementState({ state, plan });
    if (route === "critical_risk") {
      assert.equal(state.calculationStatus, "complete", `${where}: Height Only completes`);
      assert.equal(isFutureSummaryUnlockedByMeasurements(state), true);
    }
    const presented = projectMeasurementRequirementsForPresentation({ requirements: plan.requirements, state });
    uniqueIds(`${where} Step 7 shared`, presented.filter(isSharedPresentationRequirement).map((r) => r.measurementId));
    for (const garment of garments) {
      uniqueIds(
        `${where} Step 7 ${garment.garmentKey}`,
        presented
          .filter((r) => !isSharedPresentationRequirement(r) && r.garmentKey === garment.garmentKey)
          .map((r) => r.measurementId),
      );
    }
    const summary = projectFutureSummaryMeasurementGroups({
      measurementPlan: plan,
      measurementState: state,
      garmentLabels: new Map(garments.map((garment) => [garment.garmentKey, garment.garmentKey])),
      blockers: [],
    });
    uniqueIds(`${where} Summary shared`, summary.shared.map((value) => value.measurementId));
    summary.byGarment.forEach((group) =>
      uniqueIds(`${where} Summary ${group.garmentKey}`, group.values.map((value) => value.measurementId)),
    );
    const review = getFuturePaymentReviewMeasurementGroups({
      measurements: projectActiveFutureMeasurementState({ state, plan }),
      garments: garments.map((garment) => ({
        garmentKey: garment.garmentKey,
        label: garment.garmentKey,
        garmentType: garment.garmentType,
        demographic: demographic || "unisex",
      })),
    });
    assert.ok(review.length > 0, `${where}: Payment Review lists the measurements`);
    review.forEach((group) =>
      uniqueIds(`${where} Payment Review ${group.garmentKey ?? "shared"}`, group.items.map((item) => item.measurementId)),
    );
  }
}
console.log("PASS: Height Only allowed and completes; all methods plan cleanly for both audience cases");

// 4. Step 7 shows the warning near the method choice and keeps Height Only selectable.
const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");

const renderStep = (plan: MeasurementRequirementPlan, garments: MeasurementPhysicalGarment[]): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  const state = reconcileFutureMeasurementState({
    state: createEmptyFutureMeasurementState("critical_risk", "cm"),
    plan,
  });
  act(() => {
    renderer = create(createElement(DormantFutureMeasurementStep, {
      plan,
      state,
      physicalGarments: garments,
      onChange: () => undefined,
      onRouteChange: () => undefined,
      onBack: () => undefined,
      onContinue: () => undefined,
    }));
  });
  return renderer;
};

for (const [demographic, kind, expected] of [
  [null, "no_audience", /^No audience chosen for .+, so we're using our standard sizing\. Please check your choice in Step 1\.$/],
  ["male", "audience_mismatch", /^.+ is usually a women's garment, but this order is set to Male\. We'll still measure it using our standard sizing\. Please check your choice in Step 1\.$/],
] as const) {
  const { runtime, garments } = soleRuntime(["dress"], demographic, "critical_risk");
  const renderer = renderStep(runtime.plan, garments);
  const warning = renderer.root.findByProps({ "data-measurement-audience-warning": kind });
  assert.match(textOf(warning), expected);
  assert.equal(warning.props.role, "note");
  const critical = renderer.root.findByProps({ "data-measurement-risk-option": "critical_risk" });
  assert.equal(critical.props["data-measurement-risk-disabled"], "false", `${kind}: Height Only stays selectable`);
  const radio = renderer.root.findByProps({ type: "radio", name: "future-measurement-route", value: "critical_risk" });
  assert.equal(Boolean(radio.props.disabled), false);
  assert.equal(textOf(renderer.root).includes("is unavailable because"), false);
  act(() => renderer.unmount());
}
{
  const { runtime, garments } = soleRuntime(["dress"], "female", "critical_risk");
  const renderer = renderStep(runtime.plan, garments);
  assert.equal(
    renderer.root.findAll((node) => node.props?.["data-measurement-audience-warning"] !== undefined).length,
    0,
    "a Female dress order shows no audience warning",
  );
  act(() => renderer.unmount());
}
console.log("PASS: Step 7 shows the audience warning and keeps Height Only selectable");

// 5. Height Only on a sleeveless Standard Dress: the factorless Sleeveless
// Finish Length is a Required field with the #892 message, shown once.
{
  const garmentTypeSelection = {
    garmentTypes: ["dress"],
    demographic: "female",
    constructionByGarment: { dress: construction("dress", "dress_std_sleeveless", "dress_construction") },
  } as unknown as GarmentTypeStepSelection;
  const garments = garmentsFor(["dress"]);
  const order = reconcileWearerOrder({
    order: createEmptyWearerOrder(),
    garmentKeys: ["base:dress"],
    compatibilityDemographic: "female",
    garments,
    garmentTypeSelection,
  });
  const [runtime] = planWearerOrderMeasurements({
    order: { ...order, wearers: order.wearers.map((wearer) => ({ ...wearer, measurement: createEmptyFutureMeasurementState("critical_risk", "cm") })) },
    garmentTypeSelection,
    physicalGarments: garments,
  });
  assert.equal(runtime!.plan.criticalRiskSupported, true);
  const renderer = renderStep(runtime!.plan, garments);
  const fields = renderer.root.findAll(
    (node) => node.type === "label" && node.props?.["data-measurement-field"] === "sleeve_length_sleeveless",
  );
  assert.equal(fields.length, 1, "Sleeveless Finish Length shows once");
  assert.equal(fields[0]!.props["data-measurement-calculated"], "false");
  assert.equal(
    fields[0]!.findAll((node) => node.props?.["data-measurement-factorless-required"] === "true").length,
    1,
  );
  assert.ok(textOf(fields[0]!).includes("Required: this measurement can't be calculated from height, so please measure it."));
  assert.equal(textOf(renderer.root).includes("is unavailable because"), false);
  act(() => renderer.unmount());
}
console.log("PASS: Height Only asks Sleeveless Finish Length as a Required field");
