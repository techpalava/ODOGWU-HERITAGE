import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type { MeasurementProfileId } from "./src/config/MeasurementBlueprintConfig";
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
  getSampleClothCustomerLabel,
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
import { getFuturePaymentReviewMeasurementGroups } from "./src/utils/designStudioFuturePaymentReview";
import { getStep1GarmentDisplayLabel } from "./src/utils/garmentConstructionPricing";
import { projectTailoringMeasurementReadout } from "./src/utils/tailoringMeasurementProjection";

/**
 * Xavier (2026-10-28, finding 3): Payment Review and My orders named 41 fields from
 * internal ids ("Shoulder Length" for Step 7's "Shoulder Width", "Waist Circumference"
 * for "Waist across sample (laid flat)"). Every review label must be the label Step 7
 * shows for that field, for each method, garment profile (A–M), audience and person.
 */

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);

const construction = (garmentType: string, optionId: string) => ({
  status: "resolved" as const,
  garmentType,
  components: [{
    componentKey: `${garmentType}:construction:${optionId}`,
    optionId,
    selectionGroup: "construction",
    priceCents: 1,
  }],
});

/** One Step 1 garment per workbook profile, with the construction that selects it. */
const PROFILE_GARMENTS: Record<MeasurementProfileId, { type: FabricGarmentType; option?: string }> = {
  A: { type: "shirt", option: "shirt_std_short" },
  B: { type: "shirt", option: "shirt_std_midlong" },
  C: { type: "shirt", option: "shirt_long_short" },
  D: { type: "shirt", option: "shirt_long_midlong" },
  E: { type: "dress", option: "dress_std_short" },
  F: { type: "dress", option: "dress_std_midlong" },
  G: { type: "dress", option: "dress_long_short" },
  H: { type: "dress", option: "dress_long_midlong" },
  I: { type: "trouser" },
  J: { type: "standard_shorts" },
  K: { type: "bum_shorts" },
  L: { type: "skirt", option: "skirt_std" },
  M: { type: "skirt", option: "skirt_long" },
};

const selectionFor = (
  garments: { type: FabricGarmentType; option?: string }[],
  demographic: CustomDetailDemographic,
): GarmentTypeStepSelection => {
  const selection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garments.map((garment) => garment.type) as GarmentTypeStepSelection["garmentTypes"],
    selectedDemographics: [demographic],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  return {
    ...selection,
    constructionByGarment: {
      ...selection.constructionByGarment,
      ...Object.fromEntries(
        garments.flatMap((garment) =>
          garment.option ? [[garment.type, construction(garment.type, garment.option)]] : [],
        ),
      ),
    },
  } as GarmentTypeStepSelection;
};

const valueFor = (requirement: PlannedMeasurementRequirement): number => {
  const id = requirement.measurementId;
  if (id === "total_height") return 172;
  if (requirement.sampleGeometry === "laid_flat_half_width") return 46;
  if (/circ|waist|hip|chest/.test(id)) return 92;
  if (id.includes("length")) return 60;
  return 40;
};

type Person = { name: string; route: SelectedMeasurementMethod; garmentKeys?: string[] };

const orderFor = (selection: GarmentTypeStepSelection, people: Person[]) => {
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
    order = reconcile(
      addWearer({ order, physicalGarmentCount: garments.length, displayName: person.name, fitContext: null }).order,
    );
    ids.push(order.wearers.find((wearer) => !ids.includes(wearer.wearerId))!.wearerId);
  });
  people.forEach((person, index) =>
    (person.garmentKeys ?? []).forEach((garmentKey) => {
      order = assignGarmentToWearer({
        order,
        garmentKey,
        wearerId: ids[index],
        garment: garments.find((garment) => garment.garmentKey === garmentKey)!,
        garmentTypeSelection: selection,
      }).order;
    }),
  );
  order = reconcile(order);
  people.forEach((person, index) => {
    const wearerId = ids[index];
    order = updateWearerMeasurement(order, wearerId, createEmptyFutureMeasurementState(person.route, "cm"));
    const runtime = plan(order).find((candidate) => candidate.wearerId === wearerId)!;
    let state: FutureMeasurementStateV1 = runtime.measurement;
    runtime.plan.requirements
      .filter((requirement) => requirement.directInput)
      .forEach((requirement) => {
        state = setFutureMeasurementInput({ state, requirement, displayValue: valueFor(requirement) });
      });
    order = updateWearerMeasurement(order, wearerId, state);
    order = updateWearerMeasurement(order, wearerId, plan(order).find((candidate) => candidate.wearerId === wearerId)!.measurement);
  });
  const runtimes = plan(order);
  const saved = JSON.parse(
    JSON.stringify(
      projectAuthoritativeOrderMeasurements({
        wearerRuntimes: runtimes,
        measurementState: runtimes[0].measurement,
        measurementPlan: runtimes[0].plan,
      }),
    ),
  ) as WearerOrderStateV2;
  const reviewGarments = garments.map((garment) => ({
    garmentKey: garment.garmentKey,
    label: getStep1GarmentDisplayLabel(garment.garmentType),
    garmentType: garment.garmentType,
    demographic: selection.demographic ?? null,
  }));
  return { runtimes, saved, reviewGarments };
};

/** The label Step 7 shows for each field it presents to this person, by group. */
const step7Labels = (runtime: WearerMeasurementRuntime): Map<string, string> => {
  const labels = new Map<string, string>();
  projectMeasurementRequirementsForPresentation({
    requirements: runtime.plan.requirements,
    state: runtime.measurement,
  }).forEach((requirement) => {
    if (!getResolvedMeasurementValue(runtime.measurement, requirement)) return;
    // Same expression as the Step 7 field (DormantFutureMeasurementStep MeasurementField).
    const label = requirement.sampleGeometry
      ? getSampleClothCustomerLabel(
          requirement.measurementId,
          requirement.definition.customerLabel,
          requirement.labelDemographic,
        )
      : requirement.definition.customerLabel;
    const where = isSharedPresentationRequirement(requirement) ? "shared" : requirement.garmentKey!;
    labels.set(`${where}|${requirement.measurementId}`, label);
    labels.set(`any|${requirement.measurementId}`, label);
  });
  return labels;
};

const mismatches = new Map<string, Set<string>>();
let checked = 0;
const checkReview = (name: string, order: ReturnType<typeof orderFor>) => {
  const expected = order.runtimes.map(step7Labels);
  for (const plainPersonGarmentLabels of [true, false]) {
    const surface = plainPersonGarmentLabels ? "Payment Review" : "My orders";
    const groups = getFuturePaymentReviewMeasurementGroups(
      { measurements: order.saved, garments: order.reviewGarments },
      { plainPersonGarmentLabels },
    );
    groups.forEach((group) => {
      // Multi-person groups are titled "{person} — …"; solo orders belong to the one person.
      const personIndex = order.runtimes.length === 1
        ? 0
        : order.runtimes.findIndex((runtime) =>
            group.title.startsWith(`${order.saved.wearers.find((w) => w.wearerId === runtime.wearerId)!.displayName} `),
          );
      assert.ok(personIndex >= 0, `${name}: group "${group.title}" belongs to a person`);
      const labels = expected[personIndex];
      group.items.forEach((item) => {
        checked += 1;
        const want =
          labels.get(`${group.garmentKey ?? "shared"}|${item.measurementId}`) ??
          labels.get(`any|${item.measurementId}`);
        assert.ok(want, `${name} ${surface}: ${item.measurementId} is a field Step 7 shows this person`);
        // A laid-flat sample width is shown at its doubled production value; Step 7
        // shows that value under the field as its "Production equivalent".
        const wantLabel =
          item.provenanceLabel === "Converted from sample cloth" ? `${want}, production equivalent` : want;
        if (item.label !== wantLabel) {
          const key = `${item.label} → ${wantLabel}`;
          const where = mismatches.get(key) || new Set<string>();
          where.add(name);
          mismatches.set(key, where);
        }
      });
    });
  }
};

const METHODS: SelectedMeasurementMethod[] = ["low_risk", "medium_risk", "high_risk", "critical_risk", "sample_cloth"];
const AUDIENCES: CustomDetailDemographic[] = ["male", "female"];

for (const [profileId, garment] of Object.entries(PROFILE_GARMENTS)) {
  for (const audience of AUDIENCES) {
    for (const route of METHODS) {
      const selection = selectionFor([garment], audience);
      checkReview(`${profileId}/${audience}/${route}`, orderFor(selection, [{ name: "Ada", route }]));
    }
  }
}

// Several garments, and two people with different methods (per person and per garment).
for (const route of METHODS) {
  const selection = selectionFor([{ type: "shirt", option: "shirt_std_midlong" }, { type: "trouser" }, { type: "dress", option: "dress_std_short" }], "female");
  checkReview(`mixed/female/${route}`, orderFor(selection, [{ name: "Ada", route }]));
  checkReview(
    `two people/female/${route}+sample`,
    orderFor(selection, [
      { name: "Ada", route, garmentKeys: ["base:shirt", "base:trouser"] },
      { name: "Bola", route: "sample_cloth", garmentKeys: ["base:dress"] },
    ]),
  );
}

// The staff readout (#1140, #1146) words each field the same way.
for (const route of ["medium_risk", "critical_risk", "sample_cloth"] as SelectedMeasurementMethod[]) {
  const selection = selectionFor([{ type: "shirt", option: "shirt_std_short" }, { type: "trouser" }], "female");
  const order = orderFor(selection, [{ name: "Ada", route }]);
  const staff = new Map(
    projectTailoringMeasurementReadout(
      order.saved,
      Object.fromEntries(order.reviewGarments.map((garment) => [garment.garmentKey, garment.garmentType])),
      Object.fromEntries(order.reviewGarments.map((garment) => [garment.garmentKey, garment.demographic])),
    )!.flatMap((wearer) => [...wearer.shared, ...wearer.garments.flatMap((garment) => garment.values)])
      .map((value) => [value.measurementId, value.label]),
  );
  getFuturePaymentReviewMeasurementGroups({ measurements: order.saved, garments: order.reviewGarments })
    .flatMap((group) => group.items)
    .forEach((item) =>
      assert.equal(
        item.label.replace(/, production equivalent$/, ""),
        staff.get(item.measurementId),
        `${route}: staff readout and review agree on ${item.measurementId}`,
      ),
    );
}

const report = [...mismatches].map(([key, where]) => `  ${key}  (${where.size} orders, e.g. ${[...where][0]})`);
console.log(`checked ${checked} review labels`);
assert.equal(
  mismatches.size,
  0,
  `Payment Review / My orders labels differ from Step 7:\n${report.join("\n")}`,
);
console.log("review labels match step 7 tests passed");
