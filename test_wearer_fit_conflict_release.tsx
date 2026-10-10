/**
 * H1 + M1: a Fit change never leaves a garment assigned to someone who cannot
 * wear it, and Sole never claims garments its fit cannot wear.
 * - setWearerFitContext (with eligibility) unassigns ineligible garments like an
 *   untick: assignment cleared, that garment's fields stripped, body kept.
 * - The panel's fit-conflict attention picks up those newly released rows.
 * - The Sole notice lists ineligible garments separately with honest copy.
 * - Measurement status names the fit conflict, never "earlier steps".
 */
import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import { WearerAssignmentPanel } from "./src/components/WearerAssignmentPanel";
import type {
  CustomDetailSelectionGroup,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  WearerOrderStateV2,
} from "./src/types";
import {
  projectMeasurementStepProgressPresentation,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";
import { createWearerGarmentToggleHandlers } from "./src/utils/wearerGarmentToggle";
import {
  assignGarmentToWearer,
  clearWearerIdentity,
  createEmptyWearerOrder,
  createWearerProfile,
  hasUnassignedPhysicalGarments,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
  removeGarmentFromWearerOrder,
  resolveMeasurementFitConflict,
  setWearerFitContext,
  setWearerMeasurementRoute,
  updateWearerMeasurement,
  wearerFitConflictCopy,
} from "./src/utils/wearerOrder";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const pass = (label: string) => console.log(`PASS ${label}`);

const construction = (
  garmentType: "shirt" | "trouser" | "dress",
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
const selection = {
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: null,
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
    trouser: construction("trouser", "trouser_std", "trouser_fastening"),
    dress: construction("dress", "dress_std_short", "dress_construction"),
  },
} as GarmentTypeStepSelection;
const garments = [
  { garmentKey: "base:shirt", garmentType: "shirt" as const },
  { garmentKey: "base:trouser", garmentType: "trouser" as const },
  { garmentKey: "base:dress", garmentType: "dress" as const },
];
const garmentLabels: Record<string, string> = {
  "base:shirt": "Shirt",
  "base:trouser": "Trouser",
  "base:dress": "Dress",
};
const eligibility = { garments, garmentTypeSelection: selection };
const keys = garments.map((garment) => garment.garmentKey);
const reconcile = (order: WearerOrderStateV2) =>
  reconcileWearerOrder({
    order,
    garmentKeys: keys,
    compatibilityDemographic: null,
    garments,
    garmentTypeSelection: selection,
  });
const updated = (result: { status: string; order: WearerOrderStateV2 }) => {
  assert.equal(result.status, "updated");
  return result.order;
};
const assign = (order: WearerOrderStateV2, garmentKey: string, wearerId: string) =>
  updated(assignGarmentToWearer({
    order,
    garmentKey,
    wearerId,
    garment: garments.find((garment) => garment.garmentKey === garmentKey)!,
    garmentTypeSelection: selection,
  }));
const bag = (order: WearerOrderStateV2, wearerId: string) => {
  const measurement = order.wearers.find((wearer) => wearer.wearerId === wearerId)!.measurement;
  return measurement.enteredByRoute?.low_risk || measurement.entered;
};

/** Fill every direct requirement of `wearerId`'s plan with `value` (shared + garment fields). */
const fill = (order: WearerOrderStateV2, wearerId: string, value: number) => {
  const runtime = planWearerOrderMeasurements({
    order,
    garmentTypeSelection: selection,
    physicalGarments: garments,
  }).find((candidate) => candidate.wearerId === wearerId)!;
  let measurement: FutureMeasurementStateV1 = order.wearers.find(
    (wearer) => wearer.wearerId === wearerId,
  )!.measurement;
  for (const requirement of runtime.plan.requirements.filter((item) => item.directInput)) {
    measurement = setFutureMeasurementInput({ state: measurement, requirement, displayValue: value });
  }
  return updateWearerMeasurement(order, wearerId, measurement);
};

/** Split: Fred (male) owns the shirt; Nol (female) owns trouser + dress, with values. */
const splitOrder = () => {
  let order: WearerOrderStateV2 = {
    ...createEmptyWearerOrder(),
    wearers: [
      createWearerProfile({ wearerId: "w-fred", displayName: "Fred", fitContext: "male", presentationOrder: 0 }),
      createWearerProfile({ wearerId: "w-nol", displayName: "Nol", fitContext: "female", presentationOrder: 1 }),
    ],
  };
  order = assign(order, "base:shirt", "w-fred");
  order = assign(order, "base:trouser", "w-nol");
  order = assign(order, "base:dress", "w-nol");
  order = setWearerMeasurementRoute(order, "w-fred", "low_risk");
  order = setWearerMeasurementRoute(order, "w-nol", "low_risk");
  return fill(fill(order, "w-fred", 70), "w-nol", 90);
};

// ------------------------------------------------------------ wearerOrder
{
  const order = splitOrder();
  const nolBefore = bag(order, "w-nol");
  const fredBefore = JSON.stringify(bag(order, "w-fred"));
  assert.ok(nolBefore.byGarmentKey["base:dress"], "fixture: Nol has dress fields");
  assert.ok(nolBefore.byGarmentKey["base:trouser"], "fixture: Nol has trouser fields");
  assert.ok(Object.keys(nolBefore.shared).length > 0, "fixture: Nol has body fields");

  // Female -> Male: the dress is released; the trouser stays.
  const male = updated(setWearerFitContext(order, "w-nol", "male", eligibility));
  assert.equal(male.wearers.find((wearer) => wearer.wearerId === "w-nol")!.fitContext, "male");
  assert.equal(male.assignmentByGarmentKey["base:dress"], undefined, "dress unassigned");
  assert.equal(male.assignmentByGarmentKey["base:trouser"], "w-nol", "eligible trouser stays");
  assert.equal(male.assignmentByGarmentKey["base:shirt"], "w-fred");
  const nolAfter = bag(male, "w-nol");
  assert.equal(nolAfter.byGarmentKey["base:dress"], undefined, "dress fields stripped");
  assert.deepEqual(nolAfter.byGarmentKey["base:trouser"], nolBefore.byGarmentKey["base:trouser"], "trouser fields kept");
  assert.deepEqual(nolAfter.shared, nolBefore.shared, "shared body fields kept");
  assert.equal(JSON.stringify(bag(male, "w-fred")), fredBefore, "Fred untouched");
  assert.equal(
    hasUnassignedPhysicalGarments({ order: male, physicalGarmentKeys: keys }),
    true,
    "Split: the released dress falls under 'Assign all garments to continue.'",
  );

  // Male -> Female (reverse): nothing is ineligible, everything stays.
  const back = updated(setWearerFitContext(male, "w-nol", "female", eligibility));
  assert.deepEqual(back.assignmentByGarmentKey, male.assignmentByGarmentKey, "eligible garments survive");
  assert.deepEqual(bag(back, "w-nol"), nolAfter);
  const fredFemale = updated(setWearerFitContext(order, "w-fred", "female", eligibility));
  assert.deepEqual(fredFemale.assignmentByGarmentKey, order.assignmentByGarmentKey, "Male -> Female keeps the shirt");
  assert.equal(JSON.stringify(bag(fredFemale, "w-fred")), fredBefore);

  // Sole: Female owns all three; -> Male releases the dress; Sole auto-assign keeps it out.
  let sole: WearerOrderStateV2 = {
    ...createEmptyWearerOrder(),
    wearers: [createWearerProfile({ wearerId: "w-ada", displayName: "Ada", fitContext: "female", presentationOrder: 0 })],
  };
  sole = reconcile(sole);
  assert.deepEqual(Object.keys(sole.assignmentByGarmentKey).sort(), [...keys].sort());
  const soleMale = reconcile(updated(setWearerFitContext(sole, "w-ada", "male", eligibility)));
  assert.equal(soleMale.assignmentByGarmentKey["base:dress"], undefined, "Sole Male: dress not assigned");
  assert.equal(soleMale.assignmentByGarmentKey["base:shirt"], "w-ada");
  assert.equal(soleMale.assignmentByGarmentKey["base:trouser"], "w-ada");
  const soleFemale = reconcile(updated(setWearerFitContext(soleMale, "w-ada", "female", eligibility)));
  assert.equal(soleFemale.assignmentByGarmentKey["base:dress"], "w-ada", "Sole Female: dress auto-assigned again");
  pass("Fit change unassigns ineligible garments, strips their fields, keeps body + eligible garments");
}

// ------------------------------------------------------------ B1-safe live form
{
  const order = splitOrder();
  const fredLive = order.wearers.find((wearer) => wearer.wearerId === "w-fred")!.measurement;
  let committed = order;
  let liveForm: FutureMeasurementStateV1 | null = fredLive;
  const activeRef = { current: "w-fred" as string | null };
  const handlers = createWearerGarmentToggleHandlers({
    getOrder: () => committed,
    getActiveWearerId: () => activeRef.current,
    garments,
    garmentTypeSelection: selection,
    commitOrder: (next) => {
      committed = next;
    },
    setLiveForm: (measurement) => {
      liveForm = measurement;
    },
  });
  handlers.setFit("w-nol", "male");
  assert.equal(committed.assignmentByGarmentKey["base:dress"], undefined);
  assert.deepEqual(liveForm, fredLive, "changing Nol's fit leaves Fred's live form alone");
  // Nol selected: his own live form is re-synced without the dress fields.
  committed = order;
  activeRef.current = "w-nol";
  handlers.setFit("w-nol", "male");
  const live = (liveForm as FutureMeasurementStateV1 | null)!;
  const liveBag = live.enteredByRoute?.low_risk || live.entered;
  assert.equal(liveBag.byGarmentKey["base:dress"], undefined, "active live form loses the dress fields");
  assert.deepEqual(liveBag.shared, bag(order, "w-nol").shared, "active live form keeps Nol's body fields");
  assert.notDeepEqual(liveBag.shared, bag(order, "w-fred").shared, "never Fred's values");
  pass("setFit re-syncs the live form B1-safe (current selection only)");
}

// ------------------------------------------------------------ panel
const textOf = (node: ReactTestInstance | string): string =>
  typeof node === "string"
    ? node
    : node.children.map((child) => textOf(child as ReactTestInstance | string)).join("");
const cardFor = (root: ReactTestInstance, label: string) =>
  root.findAllByType("article").find((article) =>
    article.findAllByType("input").some(
      (input) => input.props["aria-label"] === `Name or nickname for ${label}`,
    ),
  )!;
const rowFor = (root: ReactTestInstance, label: string, garmentKey: string) =>
  cardFor(root, label).findAllByType("li").find((row) =>
    row.findAll((node) => node.props["data-wearer-garment-key"] === garmentKey).length > 0,
  )!;

const panelProps = (order: WearerOrderStateV2) => ({
  order,
  presentation: "people" as const,
  activeWearerId: order.wearers[0]?.wearerId ?? null,
  garments,
  garmentLabels,
  garmentTypeSelection: selection,
  onSelectWearer: () => undefined,
  onAddWearer: () => undefined,
  onRenameWearer: () => undefined,
  onReorderWearers: () => undefined,
  onDeleteWearer: () => ({ status: "blocked" as const, code: "UNUSED", order }),
  onAssignGarment: () => ({ status: "blocked" as const, code: "UNUSED", order }),
  onUnassignGarment: () => undefined,
});

await (async () => {
  const focused: string[] = [];
  const nodeMock = (element: { type: unknown; props: Record<string, unknown> }) =>
    element.type === "li"
      ? {
          focus: () => focused.push(String(element.props["data-wearer-garment-key"] ?? element.props["data-wearer-garment-unfit-focus"])),
          scrollIntoView: () => undefined,
        }
      : null;
  let latest = splitOrder();
  const Harness = () => {
    const [order, setOrder] = useState(latest);
    return (
      <WearerAssignmentPanel
        {...panelProps(order)}
        onSetFitContext={(wearerId, fitContext) => {
          latest = updated(setWearerFitContext(order, wearerId, fitContext, eligibility));
          setOrder(latest);
        }}
      />
    );
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<Harness />, { createNodeMock: nodeMock as never });
  });
  const dressBefore = rowFor(renderer.root, "Nol", "base:dress");
  assert.equal(dressBefore.props["data-wearer-garment-unfit"], undefined, "owned dress is not unfit yet");
  const maleRadio = cardFor(renderer.root, "Nol").findAll(
    (node) => node.type === "input" && node.props.type === "radio",
  )[0];
  await act(async () => {
    maleRadio.props.onChange();
  });
  assert.equal(latest.assignmentByGarmentKey["base:dress"], undefined, "fit change released the dress");
  const dress = rowFor(renderer.root, "Nol", "base:dress");
  assert.equal(dress.props["data-wearer-garment-unfit"], "true", "released dress reads as unfit");
  assert.equal(dress.findByType("label").props["data-wearer-garment-unfit-beam"], "true", "resting gold beam");
  assert.equal(dress.props["data-wearer-garment-unfit-pulse"], "true", "attention pulse fires for it");
  assert.equal(dress.props["data-wearer-garment-unfit-focus"], "true", "first released row is the focus target");
  assert.equal(focused.length, 1, "focus moved to the released row");
  assert.match(textOf(dress), /Not available for Nol's selected fit\./);
  const trouser = rowFor(renderer.root, "Nol", "base:trouser");
  assert.equal(trouser.findAllByType("input")[0].props.checked, true, "eligible trouser stays ticked");
  assert.equal(trouser.props["data-wearer-garment-unfit"], undefined);
  assert.equal(
    renderer.root.findAllByProps({ "data-wearer-unassigned-note": "true" }).length > 0,
    true,
    "Split gate: Assign all garments to continue.",
  );
  await act(async () => {
    renderer.unmount();
  });
  pass("Panel: fit change releases the dress into the fit-conflict attention (beam, pulse, focus)");
})();

const soleNotice = (order: WearerOrderStateV2) => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <WearerAssignmentPanel {...panelProps(order)} onSetFitContext={() => undefined} />,
    );
  });
  const notice = renderer.root.findByProps({ "data-wearer-sole-all-assigned": "true" });
  const names = notice.findAllByProps({ "data-wearer-sole-garment-names": "true" });
  const ineligible = notice.findAllByProps({ "data-wearer-sole-ineligible": "true" });
  const result = {
    text: textOf(notice),
    names: names.length ? textOf(names[0]) : null,
    ineligible: ineligible.length ? textOf(ineligible[0]) : null,
  };
  act(() => renderer.unmount());
  return result;
};

{
  const soleOf = (displayName: string, fitContext: "male" | "female") =>
    reconcile({
      ...createEmptyWearerOrder(),
      wearers: [createWearerProfile({ wearerId: "w-sole", displayName, fitContext, presentationOrder: 0 })],
    });
  const male = soleNotice(soleOf("Fred", "male"));
  assert.equal(male.names, "Shirt, Trouser", "Sole Male lists only the garments they can wear");
  assert.equal(
    male.ineligible,
    "Not available for Fred's selected fit: Dress. Change the fit or add another person to split garments.",
  );
  assert.equal(male.text.includes("All garments are for this person."), false, "no false claim");
  assert.match(male.text, /^These garments are for this person\./);
  const you = soleNotice(soleOf("", "male"));
  assert.equal(
    you.ineligible,
    "Not available for your selected fit: Dress. Change the fit or add another person to split garments.",
  );
  const female = soleNotice(soleOf("Ada", "female"));
  assert.equal(female.ineligible, null, "nothing ineligible: no conflict line");
  assert.equal(female.names, "Shirt, Trouser, Dress");
  assert.match(female.text, /^All garments are for this person\.Add another person to split garments between people\./);
  pass("Sole notice lists ineligible garments separately with honest copy");
}

// ------------------------------------------------------------ status copy
{
  const base = {
    selectedMethod: "low_risk" as const,
    sampleSelected: false,
    criticalRiskUnavailable: false,
    criticalRiskBlockMessage: "",
    activeWearerComplete: false,
    orderComplete: false,
    unassignedLabels: [] as string[],
    remainingManualInputCount: 0,
    riskSelectionNotice: "",
    sampleFormTitle: "",
  };
  const message = wearerFitConflictCopy({ wearerLabel: "Fred", garmentLabels: ["Dress"], sole: true });
  const conflict = projectMeasurementStepProgressPresentation({
    ...base,
    profilePendingLabels: [],
    fitConflictMessage: message,
  });
  assert.equal(conflict.statusMessage, message);
  assert.equal(conflict.statusLabel, "Fit conflict");
  assert.equal(conflict.statusMessage.includes("earlier steps"), false);
  const unmapped = projectMeasurementStepProgressPresentation({ ...base, profilePendingLabels: ["Agbada"] });
  assert.match(unmapped.statusMessage, /earlier steps/, "genuinely unmapped garments keep 'earlier steps'");
  assert.equal(
    wearerFitConflictCopy({ wearerLabel: "Nol", garmentLabels: ["Dress", "Skirt"], sole: false }),
    "Not available for Nol's selected fit: Dress, Skirt. Change the fit or assign them to another person.",
  );
  assert.equal(
    wearerFitConflictCopy({ wearerLabel: "Nol", garmentLabels: ["Dress"], sole: false }),
    "Not available for Nol's selected fit: Dress. Change the fit or assign it to another person.",
  );

  // DFMS: a dress still assigned to a now-Male sole person (older draft) shows the
  // fit conflict, not "Change or remove this garment in earlier steps".
  let legacy: WearerOrderStateV2 = reconcile({
    ...createEmptyWearerOrder(),
    wearers: [createWearerProfile({ wearerId: "w-sole", displayName: "Fred", fitContext: "female", presentationOrder: 0 })],
  });
  legacy = setWearerMeasurementRoute(legacy, "w-sole", "low_risk");
  legacy = updated(setWearerFitContext(legacy, "w-sole", "male")); // no eligibility: legacy shape
  assert.equal(legacy.assignmentByGarmentKey["base:dress"], "w-sole");
  const runtime = planWearerOrderMeasurements({
    order: legacy,
    garmentTypeSelection: selection,
    physicalGarments: garments,
  })[0];
  const headingCount = (root: ReactTestInstance) =>
    root.findAllByProps({ "data-measurement-fit-conflict-status": "true" }).length;
  const renderStep = (
    withConflict: boolean,
    options?: { orderMeasurementsComplete?: boolean; route?: null },
  ) => {
    let renderer!: ReturnType<typeof create>;
    const state = options?.route === null
      ? { ...runtime.measurement, route: null }
      : runtime.measurement;
    act(() => {
      renderer = create(
        createElement(DormantFutureMeasurementStep, {
          plan: runtime.plan,
          state,
          physicalGarments: garments,
          multiPersonAssignmentActive: false,
          orderMeasurementsComplete: options?.orderMeasurementsComplete ?? false,
          ...(withConflict
            ? {
                fitConflictMessage: wearerFitConflictCopy({
                  wearerLabel: "Fred",
                  garmentLabels: ["Dress"],
                  sole: true,
                }),
                fitConflictGarmentKeys: ["base:dress"],
              }
            : {}),
          onChange: () => undefined,
          onRouteChange: () => undefined,
          onBack: () => undefined,
          onContinue: () => undefined,
        }),
      );
    });
    const text = textOf(renderer.root);
    const headings = headingCount(renderer.root);
    act(() => renderer.unmount());
    return { text, headings };
  };
  assert.match(renderStep(false).text, /earlier steps/, "control: without the conflict props the old copy shows");
  assert.equal(renderStep(false).headings, 0, "no Fit conflict heading when the gate is clear");
  const fixed = renderStep(true);
  assert.equal(fixed.text.includes("earlier steps"), false, "fit conflict never says earlier steps");
  assert.ok(fixed.text.includes(message), "status names the ineligible garment and the fix");
  assert.ok(fixed.headings > 0, "Fit conflict heading is visible while Continue is blocked");
  assert.ok(fixed.text.includes("Fit conflict"), "the heading reads Fit conflict");
  const unlocked = renderStep(true, { orderMeasurementsComplete: true });
  assert.equal(unlocked.headings, 0, "heading is absent once Continue is no longer blocked");
  const beforeMethod = renderStep(true, { route: null });
  assert.ok(beforeMethod.headings > 0, "heading is visible before a measurement method is chosen");
  assert.equal(renderStep(false, { route: null }).headings, 0);
  pass("Measurement status names the fit conflict, never 'earlier steps'");
}

{
  const labelGarment = (garment: (typeof garments)[number]) => garmentLabels[garment.garmentKey];
  const labelWearer = (wearer: { displayName: string }) => wearer.displayName || "You";
  const released = updated(setWearerFitContext(splitOrder(), "w-nol", "male", eligibility));
  const splitConflict = resolveMeasurementFitConflict({
    order: released,
    garments,
    garmentTypeSelection: selection,
    garmentLabel: labelGarment,
    wearerLabel: labelWearer,
  });
  assert.ok(splitConflict, "Split: a released dress nobody can wear is a fit conflict");
  assert.deepEqual(splitConflict?.garmentKeys, ["base:dress"]);
  assert.match(splitConflict?.message ?? "", /Not available for/);
  const assignable = resolveMeasurementFitConflict({
    order: splitOrder(),
    garments,
    garmentTypeSelection: selection,
    garmentLabel: labelGarment,
    wearerLabel: labelWearer,
  });
  assert.equal(assignable, null, "no heading when every assigned garment matches its fit");
  let sole: WearerOrderStateV2 = {
    ...createEmptyWearerOrder(),
    wearers: [createWearerProfile({ wearerId: "w-ada", displayName: "Ada", fitContext: "female", presentationOrder: 0 })],
  };
  sole = reconcile(sole);
  const adaId = sole.wearers[0].wearerId;
  const soleConflict = resolveMeasurementFitConflict({
    order: reconcile(updated(setWearerFitContext(sole, adaId, "male", eligibility))),
    garments,
    garmentTypeSelection: selection,
    garmentLabel: labelGarment,
    wearerLabel: labelWearer,
  });
  assert.deepEqual(soleConflict?.garmentKeys, ["base:dress"], "Sole ineligible dress is the same gate");
  const cleared = reconcile(updated(clearWearerIdentity(sole, adaId)));
  assert.equal(cleared.wearers[0].wearerId, adaId, "Remove keeps the wearer id");
  assert.equal(cleared.wearers[0].displayName, "");
  assert.equal(cleared.wearers[0].fitContext, null);
  const dropped = removeGarmentFromWearerOrder(cleared, "base:dress");
  const refit = reconcile(updated(setWearerFitContext(dropped, adaId, "female", eligibility)));
  assert.equal(refit.wearers[0].wearerId, adaId);
  assert.equal(refit.assignmentByGarmentKey["base:dress"], adaId, "choosing a fit again sole-auto-assigns");
  assert.equal(
    resolveMeasurementFitConflict({
      order: refit,
      garments,
      garmentTypeSelection: selection,
      garmentLabel: labelGarment,
      wearerLabel: labelWearer,
    }),
    null,
    "heading is absent once the fit can wear every garment",
  );
  pass("Fit conflict gate covers Split release and Sole ineligible; clear identity restores auto-assign");
}

console.log("test_wearer_fit_conflict_release: all passed");
