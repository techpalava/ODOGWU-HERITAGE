import assert from "node:assert/strict";
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
} from "./src/utils/wearerOrder";
import { projectAuthoritativeOrderMeasurements } from "./src/utils/futureOrderCandidate";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { presentFutureOrderV2History } from "./src/utils/futureOrderV2History";
import { getStep1GarmentDisplayLabel } from "./src/utils/garmentConstructionPricing";
import {
  buildProductionManifestCsv,
  PRODUCTION_MANIFEST_HEADERS,
} from "./src/utils/productionManifestCsv";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

/**
 * Xavier (2026-10-28, last finding): the production manifest CSV wrote "N/A" in every
 * measurement column for V2 orders. V2 rows must carry the saved measurements as the
 * staff readout shows them (#1140, #1146); legacy rows and the header stay unchanged.
 */

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const selectionFor = (types: FabricGarmentType[], demographic: CustomDetailDemographic) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: types as GarmentTypeStepSelection["garmentTypes"],
    selectedDemographics: [demographic],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const valueFor = (requirement: PlannedMeasurementRequirement): number => {
  const id = requirement.measurementId;
  if (id === "total_height") return 172;
  if (requirement.sampleGeometry === "laid_flat_half_width") return 46.04;
  if (/circ|waist|hip|chest/.test(id)) return 92.04;
  if (id.includes("length")) return 60.26;
  return 40;
};

type Person = { name: string; route: SelectedMeasurementMethod; garmentKeys?: string[] };

/** Step 7 → saved order → persisted V2 order document, as the Master Orders list holds it. */
const v2OrderDocument = (
  orderId: string,
  types: FabricGarmentType[],
  demographic: CustomDetailDemographic,
  people: Person[],
) => {
  const selection = selectionFor(types, demographic);
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
  runtimes.forEach((runtime) => assert.equal(runtime.measurement.calculationStatus, "complete"));
  const saved = projectAuthoritativeOrderMeasurements({
    wearerRuntimes: runtimes,
    measurementState: runtimes[0].measurement,
    measurementPlan: runtimes[0].plan,
  });
  // The submitted order carries these garments and these measurements.
  const masterOrder = JSON.parse(JSON.stringify(createFutureOrderV2Fixture(orderId, "Classic Senator")));
  const template = masterOrder.cartItem.candidate.garments[0];
  masterOrder.cartItem.candidate.garments = garments.map((garment, index) => ({
    ...template,
    garmentKey: garment.garmentKey,
    garmentType: garment.garmentType,
    label: getStep1GarmentDisplayLabel(garment.garmentType),
    role: index === 0 ? "main" : "additional",
    demographic: selection.demographic,
    physicalComponents: [
      { garmentKey: garment.garmentKey, garmentType: garment.garmentType, label: getStep1GarmentDisplayLabel(garment.garmentType) },
    ],
  }));
  masterOrder.cartItem.candidate.measurements = JSON.parse(JSON.stringify(saved));
  const persisted = createPersistedFutureOrderV2({
    masterOrder,
    owner: { uid: "csv-owner", isAnonymous: false },
    customerOwnerUid: "csv-owner",
    persistedAt: "2026-10-28T12:00:00.000Z",
  });
  assert.equal(persisted.status, "valid", `${orderId}: persisted V2 order`);
  if (persisted.status !== "valid") throw new Error("persisted");
  return { id: orderId, ...persisted.value };
};

/** RFC 4180 parse: quoted fields may hold commas, doubled quotes and newlines. */
const parseCsv = (csv: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  row.push(field);
  rows.push(row);
  return rows;
};

const column = (name: (typeof PRODUCTION_MANIFEST_HEADERS)[number]) => PRODUCTION_MANIFEST_HEADERS.indexOf(name);
const MEASUREMENTS_TEXT = column("Special Workshop Instructions");

const legacyOrder = {
  shipment: { trackingId: "ODG-LEGACY-1" },
  customer: { name: "Ada, \"Legacy\"", email: "ada@example.com", phone: "+31 6" },
  style: { id: "senator", name: "Senator" },
  garment: { type: "Shirt" },
  fabric: { code: "ODG-001", name: "Ankara" },
  design: { collar: "Mandarin" },
  measurements: { unit: "inch", height: 70, chest: 40, waist: 34, neck: 15 },
  notesAboutLeftoverFabric: "Return with garment",
  specialInstructions: "Loose fit",
};
const LEGACY_ROW =
  '"ODG-LEGACY-1","Ada, ""Legacy""","ada@example.com","+31 6","senator","Senator","Shirt","ODG-001","Ankara","Mandarin","None","Long Sleeve","None","No","Standard Custom","inch","70","","","Average","Standard","15","","40","34","","","","","","Return with garment","Loose fit"';

const orders = [
  v2OrderDocument("future-csv-height-only", ["shirt", "trouser"], "male", [{ name: "Ada", route: "critical_risk" }]),
  v2OrderDocument("future-csv-medium-dress", ["dress"], "female", [{ name: "Bisi", route: "medium_risk" }]),
  v2OrderDocument("future-csv-sample", ["dress", "trouser"], "female", [{ name: "Chi", route: "sample_cloth" }]),
  v2OrderDocument("future-csv-two-people", ["shirt", "trouser", "dress"], "female", [
    { name: "Ada", route: "medium_risk", garmentKeys: ["base:shirt", "base:trouser"] },
    { name: "Bola", route: "critical_risk", garmentKeys: ["base:dress"] },
  ]),
];

const csv = buildProductionManifestCsv([legacyOrder, ...orders]);
const rows = parseCsv(csv);

// Header and legacy rows are unchanged.
assert.equal(csv.split("\n")[0], PRODUCTION_MANIFEST_HEADERS.join(","), "header unchanged");
assert.equal(csv.split("\n")[1], LEGACY_ROW, "legacy row unchanged");
assert.equal(rows.length, 2 + orders.length, "one row per order");
rows.forEach((row, index) => assert.equal(row.length, PRODUCTION_MANIFEST_HEADERS.length, `row ${index} has every column`));
assert.equal(csv.charCodeAt(0) === 0xfeff, false, "no BOM (the file never had one)");

const MEASUREMENT_COLUMNS = [
  "Measurement Unit",
  "Height (cm)",
  "Neck Dimension",
  "Shoulder Dimension",
  "Chest Dimension",
  "Waist Dimension",
  "Hip Dimension",
  "Head Size (Cap)",
  "Trouser Crotch Depth",
] as const;

orders.forEach((order, index) => {
  const row = rows[index + 2];
  const history = presentFutureOrderV2History(order);
  assert.equal(history.status, "valid");
  if (history.status !== "valid") return;
  const readout = history.value.tailoringMeasurements!;
  const text = row[MEASUREMENTS_TEXT];
  assert.ok(text.startsWith("V2 total"), `${order.id}: the V2 total stays first`);
  // Parity with the staff readout: every person, method, garment and value line.
  readout.forEach((wearer) => {
    assert.ok(text.includes(`${wearer.displayName} — Method: ${wearer.methodLabel}`), `${order.id}: ${wearer.displayName} and method`);
    if (wearer.methodNote) assert.ok(text.includes(wearer.methodNote));
    wearer.shared.forEach((value) => assert.ok(text.includes(`Shared ${value.label}: ${value.display}`), `${order.id}: shared ${value.label}`));
    wearer.garments.forEach((garment) => {
      assert.ok(text.includes(`${garment.label}: `), `${order.id}: ${garment.label}`);
      garment.values.forEach((value) => assert.ok(text.includes(`${value.label}: ${value.display}`), `${order.id}: ${value.label}`));
    });
    // Shared values once: a shared field never repeats under a garment.
    const sharedIds = new Set(wearer.shared.map((value) => value.measurementId));
    wearer.garments.forEach((garment) =>
      garment.values.forEach((value) => assert.equal(sharedIds.has(value.measurementId), false)),
    );
  });
  assert.equal(text.includes("\n"), false, `${order.id}: one line per order`);
  // Measurement columns: never N/A for a V2 order with saved values.
  MEASUREMENT_COLUMNS.forEach((name) =>
    assert.notEqual(row[column(name)], "N/A", `${order.id}: ${name} is not N/A`),
  );
  assert.equal(row[column("Measurement Unit")], "cm");
});

// One person, body method: the one-to-one columns hold the readout value (1 decimal, cm),
// and a height estimate says so.
{
  const row = rows[2];
  const ada = presentFutureOrderV2History(orders[0]);
  if (ada.status !== "valid") throw new Error("valid");
  assert.equal(row[column("Height (cm)")], "172");
  const chest = ada.value.tailoringMeasurements![0].garments
    .flatMap((garment) => garment.values)
    .find((value) => value.measurementId === "chest_bust_circumference")!;
  assert.equal(row[column("Chest Dimension")], `${Math.round(chest.valueCm * 10) / 10} (estimated from height)`);
  assert.match(row[MEASUREMENTS_TEXT], /Waist Circumference: \d+(\.\d)? cm \(estimated from height\)/);
  const medium = rows[3];
  assert.equal(medium[column("Chest Dimension")], "92", "typed value, rounded to 1 decimal");
}

// Sample Cloth: laid-flat widths are not body dimensions, so the columns stay blank and
// the text has the customer's wording with the full-round equivalent.
{
  const row = rows[4];
  assert.equal(row[column("Waist Dimension")], "");
  assert.match(row[MEASUREMENTS_TEXT], /Waist across sample \(laid flat\): 46 cm laid flat \(≈ 92\.1 cm around\)/);
  assert.match(row[MEASUREMENTS_TEXT], /Measured on the customer's sample garment/);
  assert.doesNotMatch(row[MEASUREMENTS_TEXT], /estimated from height/);
}

// Two people: each person's own garments; the single-value columns stay blank.
{
  const row = rows[5];
  const text = row[MEASUREMENTS_TEXT];
  const [total, ada, bola] = text.split(" || ");
  assert.ok(total.startsWith("V2 total"));
  assert.ok(ada.startsWith("Measurements: "));
  assert.ok(ada.startsWith("Measurements: Ada — Method:") && ada.includes("Standard Shirt: ") && ada.includes("Trouser: "));
  assert.equal(ada.includes("Dress"), false, "Ada's part has no dress fields");
  assert.ok(bola.startsWith("Bola — Method:") && bola.includes("Dress: "));
  assert.equal(bola.includes("Shirt"), false, "Bola's part has no shirt fields");
  assert.equal(row[column("Chest Dimension")], "", "two people: no single chest value");
}

console.log("production manifest V2 measurements tests passed");
