import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type {
  CustomDetailDemographic,
  FabricGarmentType,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  SelectedMeasurementMethod,
  WearerOrderStateV2,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  getResolvedMeasurementValue,
  isSharedPresentationRequirement,
  projectMeasurementRequirementsForPresentation,
  setFutureMeasurementInput,
  type PlannedMeasurementRequirement,
} from "./src/utils/measurementBlueprint";
import {
  addWearer,
  assignGarmentToWearer,
  createEmptyWearerOrder,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
  renameWearer,
  updateWearerMeasurement,
  type WearerMeasurementRuntime,
} from "./src/utils/wearerOrder";
import { projectAuthoritativeOrderMeasurements } from "./src/utils/futureOrderCandidate";
import {
  projectTailoringMeasurementReadout,
  type TailoringWearerReadout,
} from "./src/utils/tailoringMeasurementProjection";

/**
 * Xavier (2026-10-28, finding 1): the staff readout dropped every height estimate, so
 * Height Only showed 1 of 25 values, High 6 and Medium 14. Staff must see every saved
 * value for the chosen method, in Step 7's order with Step 7's labels, each estimate
 * marked, rounded to 1 decimal. Display only: saved data is unchanged.
 */

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const selectionFor = (
  types: FabricGarmentType[],
  demographics: CustomDetailDemographic[],
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: types as GarmentTypeStepSelection["garmentTypes"],
    selectedDemographics: demographics,
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const valueFor = (requirement: PlannedMeasurementRequirement): number => {
  const id = requirement.measurementId;
  if (id === "total_height") return 172;
  if (/circ|waist|hip|chest/.test(id)) return 92.04;
  if (id.includes("length")) return 60.26;
  return 40;
};

/** Real Step 7 path: choose the method, type every field Step 7 asks for, reconcile. */
const fillPerson = (
  order: WearerOrderStateV2,
  plan: (order: WearerOrderStateV2) => WearerMeasurementRuntime[],
  wearerId: string,
  route: SelectedMeasurementMethod,
): WearerOrderStateV2 => {
  let next = updateWearerMeasurement(order, wearerId, createEmptyFutureMeasurementState(route, "cm"));
  const runtime = plan(next).find((candidate) => candidate.wearerId === wearerId)!;
  let state: FutureMeasurementStateV1 = runtime.measurement;
  runtime.plan.requirements
    .filter((requirement) => requirement.directInput)
    .forEach((requirement) => {
      state = setFutureMeasurementInput({ state, requirement, displayValue: valueFor(requirement) });
    });
  next = updateWearerMeasurement(next, wearerId, state);
  return updateWearerMeasurement(
    next,
    wearerId,
    plan(next).find((candidate) => candidate.wearerId === wearerId)!.measurement,
  );
};

const orderFor = ({
  types,
  demographics,
  people,
}: {
  types: FabricGarmentType[];
  demographics: CustomDetailDemographic[];
  /** One entry per person: their method and garment keys (first person takes the rest). */
  people: { name: string; route: SelectedMeasurementMethod; garmentKeys?: string[] }[];
}) => {
  const selection = selectionFor(types, demographics);
  const garments = getMeasurementPhysicalGarments({ garmentTypeSelection: selection });
  const reconcile = (order: WearerOrderStateV2) =>
    reconcileWearerOrder({
      order,
      garmentKeys: garments.map((garment) => garment.garmentKey),
      compatibilityDemographic: selection.demographic,
      garments,
      garmentTypeSelection: selection,
    });
  const plan = (order: WearerOrderStateV2) =>
    planWearerOrderMeasurements({ order, garmentTypeSelection: selection, physicalGarments: garments });
  let order = reconcile(createEmptyWearerOrder());
  const ids = [order.wearers[0].wearerId];
  order = renameWearer(order, ids[0], people[0].name).order;
  people.slice(1).forEach((person) => {
    const added = addWearer({
      order,
      physicalGarmentCount: garments.length,
      displayName: person.name,
      fitContext: null,
    });
    order = reconcile(added.order);
    ids.push(order.wearers.find((wearer) => !ids.includes(wearer.wearerId))!.wearerId);
  });
  people.forEach((person, index) => {
    (person.garmentKeys ?? []).forEach((garmentKey) => {
      order = assignGarmentToWearer({
        order,
        garmentKey,
        wearerId: ids[index],
        garment: garments.find((garment) => garment.garmentKey === garmentKey)!,
        garmentTypeSelection: selection,
      }).order;
    });
  });
  order = reconcile(order);
  people.forEach((person, index) => {
    order = fillPerson(order, plan, ids[index], person.route);
  });
  const runtimes = plan(order);
  runtimes.forEach((runtime) =>
    assert.equal(
      runtime.measurement.calculationStatus,
      "complete",
      `fixture completes ${runtime.wearerId}: ${JSON.stringify(runtime.measurement.diagnostics.map((d) => [d.code, d.measurementId]))}`,
    ),
  );
  const saved = JSON.parse(
    JSON.stringify(
      projectAuthoritativeOrderMeasurements({
        wearerRuntimes: runtimes,
        measurementState: runtimes[0].measurement,
        measurementPlan: runtimes[0].plan,
      }),
    ),
  ) as WearerOrderStateV2;
  return {
    saved,
    runtimes,
    garmentTypeByKey: Object.fromEntries(garments.map((garment) => [garment.garmentKey, garment.garmentType])),
    demographicByKey: Object.fromEntries(
      garments.map((garment) => [garment.garmentKey, selection.demographic ?? null]),
    ),
  };
};

const round1 = (valueCm: number) => Math.round(valueCm * 10) / 10;

type Line = { where: string; measurementId: string; label: string; display: string };

/**
 * What Step 7 shows one person, as staff should read it: shared values first, then each
 * garment, each block in Step 7's section order (required, calculated, optional) and
 * Step 7's order inside a section.
 */
const step7Lines = (runtime: WearerMeasurementRuntime): Line[] => {
  const presented = projectMeasurementRequirementsForPresentation({
    requirements: runtime.plan.requirements,
    state: runtime.measurement,
  });
  const sections = [
    presented.filter((requirement) => requirement.section === "required"),
    presented.filter((requirement) => requirement.inputSource === "calculated_average_factor"),
    presented.filter((requirement) => requirement.inputSource === "optional_manual"),
  ];
  const line = (where: string) => (requirement: PlannedMeasurementRequirement): Line[] => {
    const value = getResolvedMeasurementValue(runtime.measurement, requirement);
    if (!value || !(value.valueCm > 0)) return [];
    const estimated = requirement.inputSource === "calculated_average_factor";
    return [
      {
        where,
        measurementId: requirement.measurementId,
        label: requirement.definition.customerLabel,
        display: `${round1(value.valueCm)} cm${estimated ? " (estimated from height)" : ""}`,
      },
    ];
  };
  const shared = sections.flatMap((section) =>
    section.filter(isSharedPresentationRequirement).flatMap(line("shared")),
  );
  const garmentKeys = [...runtime.garmentKeys].sort((left, right) => left.localeCompare(right));
  return [
    ...shared,
    ...garmentKeys.flatMap((garmentKey) =>
      sections.flatMap((section) =>
        section
          .filter(
            (requirement) =>
              !isSharedPresentationRequirement(requirement) && requirement.garmentKey === garmentKey,
          )
          .flatMap(line(garmentKey)),
      ),
    ),
  ];
};

const readoutLines = (wearer: TailoringWearerReadout): Line[] => [
  ...wearer.shared.map((value) => ({ where: "shared", ...value })),
  ...wearer.garments.flatMap((garment) =>
    garment.values.map((value) => ({ where: garment.garmentKey, ...value })),
  ),
].map(({ where, measurementId, label, display }) => ({ where, measurementId, label, display }));

const counts: string[] = [];
const checkOrder = (name: string, order: ReturnType<typeof orderFor>) => {
  const before = JSON.stringify(order.saved);
  const readout = projectTailoringMeasurementReadout(
    order.saved,
    order.garmentTypeByKey,
    order.demographicByKey,
  );
  assert.ok(readout, `${name}: readout`);
  assert.equal(JSON.stringify(order.saved), before, `${name}: display only, saved order unchanged`);
  assert.equal(readout.length, order.runtimes.length, `${name}: one readout per person`);
  order.runtimes.forEach((runtime) => {
    const wearer = readout.find((candidate) => candidate.wearerId === runtime.wearerId);
    assert.ok(wearer, `${name}: ${runtime.wearerId} has a readout`);
    const expected = step7Lines(runtime);
    const actual = readoutLines(wearer);
    assert.deepEqual(actual, expected, `${name} (${wearer.displayName}): same values, order and labels as Step 7`);
    // No duplicates; each garment block holds only that person's garments.
    const keys = actual.map((line) => `${line.where}|${line.measurementId}`);
    assert.equal(new Set(keys).size, keys.length, `${name}: no duplicate rows`);
    actual
      .filter((line) => line.where !== "shared")
      .forEach((line) =>
        assert.ok(runtime.garmentKeys.includes(line.where), `${name}: ${line.where} belongs to this person`),
      );
    const estimated = actual.filter((line) => line.display.endsWith("(estimated from height)")).length;
    counts.push(`${name} (${wearer.displayName}): ${actual.length} values, ${estimated} estimated`);
  });
  return readout;
};

// 1. Height Only, shirt + trouser: Total Height plus every estimate.
{
  const order = orderFor({ types: ["shirt", "trouser"], demographics: ["male"], people: [{ name: "Ada", route: "critical_risk" }] });
  const readout = checkOrder("Height Only", order);
  const lines = readoutLines(readout[0]);
  assert.equal(lines[0].label, "Total Height", "Total Height leads, as on Step 7");
  assert.equal(lines[0].display, "172 cm");
  assert.ok(lines.length > 20, `Height Only shows every estimate (got ${lines.length})`);
  const waist = lines.find((line) => line.measurementId === "waist_circumference");
  assert.ok(waist, "waist estimate is shown");
  assert.match(waist.display, /^\d+(\.\d)? cm \(estimated from height\)$/);
}

// 2. High and Medium, shirt + trouser.
checkOrder("High", orderFor({ types: ["shirt", "trouser"], demographics: ["male"], people: [{ name: "Ada", route: "high_risk" }] }));
checkOrder("Medium", orderFor({ types: ["shirt", "trouser"], demographics: ["male"], people: [{ name: "Ada", route: "medium_risk" }] }));
// Low (no estimates) and a female dress + skirt order keep Step 7's labels and order too.
checkOrder("Low", orderFor({ types: ["shirt", "trouser"], demographics: ["male"], people: [{ name: "Ada", route: "low_risk" }] }));
checkOrder("Medium dress+skirt", orderFor({ types: ["dress", "skirt"], demographics: ["female"], people: [{ name: "Ada", route: "medium_risk" }] }));
checkOrder("Height Only dress", orderFor({ types: ["dress"], demographics: ["female"], people: [{ name: "Ada", route: "critical_risk" }] }));

// 3. Two people: Ada (Medium) has shirt + trouser, Bola (Height Only) has the dress.
{
  const order = orderFor({
    types: ["shirt", "trouser", "dress"],
    demographics: ["female"],
    people: [
      { name: "Ada", route: "medium_risk", garmentKeys: ["base:shirt", "base:trouser"] },
      { name: "Bola", route: "critical_risk", garmentKeys: ["base:dress"] },
    ],
  });
  const readout = checkOrder("Two people", order);
  assert.deepEqual(readout.map((wearer) => wearer.displayName), ["Ada", "Bola"]);
  assert.deepEqual(readout[1].garments.map((garment) => garment.garmentKey), ["base:dress"]);
}

// 4. The staff order editor renders the worded rows.
{
  const databaseView = readFileSync("./src/components/DatabaseView.tsx", "utf8");
  assert.match(databaseView, /\{value\.label\}: \{value\.display\}/);
  assert.doesNotMatch(databaseView, /\{value\.measurementId\}: \{value\.valueCm\} cm/);
}

console.log(counts.join("\n"));
console.log("staff readout height estimate tests passed");
