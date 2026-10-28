import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type {
  CustomDetailDemographic,
  FabricGarmentType,
  GarmentTypeStepSelection,
  MeasurementUnit,
  SelectedMeasurementMethod,
  WearerOrderStateV2,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  isSampleClothHalfWidthMeasurement,
  setFutureMeasurementInput,
  type PlannedMeasurementRequirement,
} from "./src/utils/measurementBlueprint";
import {
  createEmptyWearerOrder,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
  updateWearerMeasurement,
} from "./src/utils/wearerOrder";
import { projectAuthoritativeOrderMeasurements } from "./src/utils/futureOrderCandidate";
import {
  projectTailoringMeasurementReadout,
  type TailoringWearerReadout,
} from "./src/utils/tailoringMeasurementProjection";

/**
 * Xavier (2026-10-28, finding 2): staff saw Sample Cloth values as half-widths
 * under body names ("chest_bust_circumference: 92 cm" for 92 cm measured across
 * the sample laid flat). The staff readout must word each Sample Cloth value the
 * way the customer saw it, mark the method, and give the full-round equivalent
 * for laid-flat across widths only. Display only: saved data is unchanged.
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

/** Real Step 7 → saved order path: plan, type every field, reconcile, project, JSON round-trip. */
const savedOrderMeasurements = ({
  types,
  demographics,
  route,
  unit,
  valueFor,
}: {
  types: FabricGarmentType[];
  demographics: CustomDetailDemographic[];
  route: SelectedMeasurementMethod;
  unit: MeasurementUnit;
  valueFor: (requirement: PlannedMeasurementRequirement) => number;
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
  const runtimesOf = (order: WearerOrderStateV2) =>
    planWearerOrderMeasurements({ order, garmentTypeSelection: selection, physicalGarments: garments });
  let order = reconcile(createEmptyWearerOrder());
  const wearerId = order.wearers[0].wearerId;
  order = updateWearerMeasurement(order, wearerId, createEmptyFutureMeasurementState(route, unit));
  const runtime = runtimesOf(order)[0];
  let state = runtime.measurement;
  const requirements = runtime.plan.requirements.filter((requirement) => requirement.directInput);
  requirements.forEach((requirement) => {
    state = setFutureMeasurementInput({ state, requirement, displayValue: valueFor(requirement) });
  });
  order = updateWearerMeasurement(order, wearerId, state);
  const runtimes = runtimesOf(order);
  assert.equal(runtimes[0].measurement.calculationStatus, "complete", `fixture measures every field: ${JSON.stringify(runtimes[0].measurement.diagnostics.map((d) => [d.code, d.measurementId]))}`);
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
    requirements,
    garmentTypeByKey: Object.fromEntries(garments.map((garment) => [garment.garmentKey, garment.garmentType])),
    demographicByKey: Object.fromEntries(
      garments.map((garment) => [garment.garmentKey, selection.demographic ?? null]),
    ),
  };
};

const rows = (readout: readonly TailoringWearerReadout[] | null) => {
  assert.ok(readout);
  return readout.flatMap((wearer) => [
    ...wearer.shared.map((value) => ({ where: "shared", ...value })),
    ...wearer.garments.flatMap((garment) => garment.values.map((value) => ({ where: garment.garmentKey, ...value }))),
  ]);
};
const rowFor = (readout: readonly TailoringWearerReadout[] | null, measurementId: string) => {
  const row = rows(readout).find((candidate) => candidate.measurementId === measurementId);
  assert.ok(row, `${measurementId} is in the staff readout`);
  return row;
};

// 1. Female dress + trouser on Sample Cloth (cm): each value worded as the customer saw it.
{
  const order = savedOrderMeasurements({
    types: ["dress", "trouser"],
    demographics: ["female"],
    route: "sample_cloth",
    unit: "cm",
    valueFor: (requirement) =>
      requirement.measurementId === "chest_bust_circumference"
        ? 46
        : requirement.measurementId === "waist_circumference"
          ? 38.04
          : requirement.sampleGeometry === "laid_flat_half_width"
            ? 30
            : 101.26,
  });
  const readout = projectTailoringMeasurementReadout(order.saved, order.garmentTypeByKey, order.demographicByKey);
  assert.ok(readout);
  const chest = rowFor(readout, "chest_bust_circumference");
  assert.equal(chest.label, "Borst across sample (laid flat)");
  assert.equal(chest.display, "46 cm laid flat (≈ 92 cm around)");
  assert.match(readout[0].methodLabel, /Sample Cloth/);
  assert.match(
    readout[0].methodNote ?? "",
    /sample garment/i,
    "the readout says these are sample garment measurements, not body measurements",
  );
  const waist = rowFor(readout, "waist_circumference");
  assert.equal(waist.label, "Waist across sample (laid flat)");
  assert.equal(waist.display, "38 cm laid flat (≈ 76.1 cm around)", "rounded to 1 decimal in this readout");
  const dressLength = rowFor(readout, "dress_length_standard");
  assert.equal(dressLength.label, "Standard Dress Length");
  assert.equal(dressLength.display, "101.3 cm", "lengths are never doubled");
  // Every value: 'around' only for laid-flat across widths, never a raw id as the label.
  rows(readout).forEach((row) => {
    assert.notEqual(row.label, row.measurementId, `${row.measurementId} has a customer label`);
    assert.equal(
      row.display.includes("around"),
      isSampleClothHalfWidthMeasurement(row.measurementId),
      `${row.measurementId}: 'around' only for laid-flat across widths`,
    );
  });
  // Display only: the saved order still holds the laid-flat value the customer typed.
  assert.equal(order.saved.wearers[0].measurement.entered.shared.chest_bust_circumference?.valueCm, 46);
}

// 2. No audience known to the readout: the Chest / Borst fallback wording; inches are shown in cm.
{
  const order = savedOrderMeasurements({
    types: ["shirt"],
    demographics: ["male"],
    route: "sample_cloth",
    unit: "inch",
    valueFor: (requirement) => (requirement.measurementId === "chest_bust_circumference" ? 18 : 10),
  });
  const readout = projectTailoringMeasurementReadout(order.saved, order.garmentTypeByKey);
  const chest = rowFor(readout, "chest_bust_circumference");
  assert.equal(chest.label, "Chest / Borst across sample (laid flat)");
  assert.equal(chest.display, "45.7 cm laid flat (≈ 91.4 cm around)");
  const male = projectTailoringMeasurementReadout(order.saved, order.garmentTypeByKey, order.demographicByKey);
  assert.equal(rowFor(male, "chest_bust_circumference").label, "Chest across sample (laid flat)");
  assert.equal(rowFor(male, "neck_circumference").display, "25.4 cm", "neck is measured as an opening: not doubled");
}

// 3. Body-measurement routes keep the existing staff readout text.
{
  const order = savedOrderMeasurements({
    types: ["shirt"],
    demographics: ["male"],
    route: "low_risk",
    unit: "inch",
    valueFor: (requirement) => (requirement.measurementId === "total_height" ? 70 : 38),
  });
  const readout = projectTailoringMeasurementReadout(order.saved, order.garmentTypeByKey, order.demographicByKey);
  assert.ok(readout);
  assert.equal(readout[0].methodNote, null);
  const chest = rowFor(readout, "chest_bust_circumference");
  assert.equal(chest.label, "chest_bust_circumference");
  assert.equal(chest.display, `${chest.valueCm} cm`);
}

// 4. The staff order editor and the V2 history use the worded readout.
{
  const databaseView = readFileSync("./src/components/DatabaseView.tsx", "utf8");
  assert.match(databaseView, /\{value\.label\}: \{value\.display\}/);
  assert.match(databaseView, /Shared \{value\.label\}: \{value\.display\}/);
  assert.match(databaseView, /wearer\.methodNote/);
  assert.doesNotMatch(databaseView, /\{value\.measurementId\}: \{value\.valueCm\} cm/);
  const history = readFileSync("./src/utils/futureOrderV2History.ts", "utf8");
  assert.match(history, /garment\.demographic/);
}

console.log("staff sample cloth readout tests passed");
