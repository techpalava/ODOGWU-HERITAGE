/**
 * Fit retired on Step 7 (replaces the #541 fit-conflict release tests).
 * - Any person can take any garment: no fit gate, no ineligible branch,
 *   no fit conflict, no unfit notes / beam / pulse.
 * - The panel shows no "Fit for measurements" block; Sole lists every garment.
 * - A split card collapses once its name is confirmed and it owns a garment
 *   (no fit needed).
 * - Measurement fields follow the Step 1 garment demographic, falling back to
 *   the default (unisex) blueprint when that demographic cannot resolve.
 * - A legacy stored fitContext still reads (backward compatible), but is not used.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { WearerAssignmentPanel } from "./src/components/WearerAssignmentPanel";
import type {
  CustomDetailSelectionGroup,
  GarmentTypeStepSelection,
  WearerOrderStateV2,
} from "./src/types";
import {
  assignGarmentToWearer,
  createEmptyWearerOrder,
  createWearerProfile,
  normalizeWearerOrderState,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
  resolveMeasurementFitConflict,
  resolveWearerMeasurementDemographic,
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
const keys = garments.map((garment) => garment.garmentKey);
const withDemographic = (demographic: GarmentTypeStepSelection["demographic"]) =>
  ({ ...selection, demographic }) as GarmentTypeStepSelection;
const updated = (result: { status: string; order?: WearerOrderStateV2 }) => {
  if (result.status !== "updated" || !result.order) throw new Error(`expected updated, got ${result.status}`);
  return result.order;
};
const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");

// Sole: every garment is assigned with no fit, and a legacy male fit no longer drops the dress.
{
  const fresh = reconcileWearerOrder({
    order: createEmptyWearerOrder(),
    garmentKeys: keys,
    compatibilityDemographic: "male",
    garments,
    garmentTypeSelection: withDemographic("male"),
  });
  assert.equal(fresh.wearers[0].fitContext, null);
  assert.deepEqual(Object.keys(fresh.assignmentByGarmentKey).sort(), [...keys].sort());
  const legacyMale = reconcileWearerOrder({
    order: {
      schemaVersion: 2,
      wearers: [createWearerProfile({ wearerId: "w-legacy", displayName: "Ade", fitContext: "male", presentationOrder: 0 })],
      assignmentByGarmentKey: {},
    },
    garmentKeys: keys,
    compatibilityDemographic: "male",
    garments,
    garmentTypeSelection: withDemographic("male"),
  });
  assert.equal(legacyMale.assignmentByGarmentKey["base:dress"], "w-legacy");
  pass("Sole: every garment assigned, no fit needed, legacy fit ignored");
}

// Split: a person with no fit (or a legacy male fit) can take the dress; no conflict.
const splitOrder = (): WearerOrderStateV2 => ({
  schemaVersion: 2,
  wearers: [
    createWearerProfile({ wearerId: "w-ada", displayName: "Ada", fitContext: null, presentationOrder: 0 }),
    createWearerProfile({ wearerId: "w-nol", displayName: "Nol", fitContext: "male", presentationOrder: 1 }),
  ],
  assignmentByGarmentKey: { "base:shirt": "w-ada", "base:trouser": "w-nol" },
});
{
  const noFit = updated(assignGarmentToWearer({
    order: splitOrder(),
    garmentKey: "base:dress",
    wearerId: "w-ada",
    garment: garments[2],
    garmentTypeSelection: selection,
  }));
  assert.equal(noFit.assignmentByGarmentKey["base:dress"], "w-ada");
  const legacyMale = updated(assignGarmentToWearer({
    order: splitOrder(),
    garmentKey: "base:dress",
    wearerId: "w-nol",
    garment: garments[2],
    garmentTypeSelection: selection,
  }));
  assert.equal(legacyMale.assignmentByGarmentKey["base:dress"], "w-nol");
  assert.equal(
    resolveMeasurementFitConflict({
      order: legacyMale,
      garments,
      garmentTypeSelection: selection,
      garmentLabel: (garment) => garmentLabels[garment.garmentKey],
      wearerLabel: (wearer) => wearer.displayName,
    }),
    null,
  );
  pass("Split: any person can take any garment; never a fit conflict");
}

// Measurement fields follow the Step 1 demographic, with a unisex fallback.
{
  assert.equal(resolveWearerMeasurementDemographic({ garments: [garments[0]], garmentTypeSelection: withDemographic("male") }), "male");
  assert.equal(resolveWearerMeasurementDemographic({ garments: [garments[2]], garmentTypeSelection: withDemographic("female") }), "female");
  assert.equal(resolveWearerMeasurementDemographic({ garments, garmentTypeSelection: withDemographic("male") }), "unisex", "male audience + dress falls back to the default blueprint");
  assert.equal(resolveWearerMeasurementDemographic({ garments, garmentTypeSelection: withDemographic(null) }), "unisex", "no Studio gender uses the default blueprint");
  const order: WearerOrderStateV2 = {
    ...splitOrder(),
    assignmentByGarmentKey: { "base:shirt": "w-ada", "base:trouser": "w-nol", "base:dress": "w-nol" },
  };
  const runtimes = planWearerOrderMeasurements({ order, garmentTypeSelection: withDemographic("male"), physicalGarments: garments });
  const nol = runtimes.find((runtime) => runtime.wearerId === "w-nol")!;
  assert.equal(nol.fitContext, "male", "legacy fitContext still carried for paid-order snapshots");
  assert.equal(
    JSON.stringify(nol.plan).includes("demographic_ineligible"),
    false,
    "a legacy male person with a dress still gets dress measurement fields",
  );
  pass("Measurement fields: Step 1 demographic, default blueprint fallback");
}

// Persisted drafts with fitContext still read.
{
  const raw = JSON.parse(JSON.stringify(splitOrder()));
  const normalized = normalizeWearerOrderState(raw);
  assert.ok(normalized);
  assert.equal(normalized!.wearers.find((wearer) => wearer.wearerId === "w-nol")?.fitContext, "male");
  pass("Persisted fitContext stays readable");
}

const panelProps = (order: WearerOrderStateV2, activeWearerId: string | null) => ({
  order,
  presentation: "people" as const,
  activeWearerId,
  garments,
  garmentLabels,
  onSelectWearer: () => undefined,
  onAddWearer: () => undefined,
  onRenameWearer: () => undefined,
  onReorderWearers: () => undefined,
  onDeleteWearer: () => ({ status: "blocked" as const, code: "UNUSED", order }),
  onAssignGarment: () => ({ status: "blocked" as const, code: "UNUSED", order }),
  onUnassignGarment: () => undefined,
});
const render = (order: WearerOrderStateV2, activeWearerId: string | null) => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(WearerAssignmentPanel, panelProps(order, activeWearerId)));
  });
  return renderer;
};

// Split panel: no fit block, no unfit rows, unowned dress tickable by anyone.
{
  const renderer = render(splitOrder(), "w-ada");
  const text = textOf(renderer.root);
  assert.equal(/Fit for measurements|Male fit|Female fit|selected fit/.test(text), false, "no fit copy");
  assert.equal(renderer.root.findAll((node) => node.type === "input" && node.props.type === "radio").length, 0, "no fit radios");
  for (const attr of ["data-wearer-garment-unfit", "data-wearer-garment-unfit-beam", "data-wearer-garment-unfit-pulse", "data-wearer-garment-unfit-note"]) {
    assert.equal(renderer.root.findAll((node) => node.props?.[attr] !== undefined && typeof node.type === "string").length, 0, `${attr} is gone`);
  }
  const dressBoxes = renderer.root.findAll(
    (node) => node.type === "input" && node.props["data-wearer-garment-key"] === "base:dress",
  );
  assert.ok(dressBoxes.length >= 1);
  assert.equal(dressBoxes.every((node) => node.props.disabled === false), true, "unowned dress is open to every open card");
  act(() => renderer.unmount());
  pass("Split panel: no fit block and no fit-based locks");
}

// Collapse rule: confirmed name + at least one garment, no fit required.
{
  const order: WearerOrderStateV2 = {
    ...splitOrder(),
    wearers: splitOrder().wearers.map((wearer) => ({ ...wearer, fitContext: null })),
    assignmentByGarmentKey: { "base:shirt": "w-ada", "base:trouser": "w-nol", "base:dress": "w-nol" },
  };
  const renderer = render(order, "w-ada");
  const collapsed = renderer.root.findAll(
    (node) => node.type === "article" && node.props["data-wearer-card-collapsed"] === "true",
  );
  assert.equal(collapsed.length, 1, "Nol (name + garments, no fit) collapses");
  assert.match(textOf(collapsed[0]), /Nol/);
  assert.match(textOf(collapsed[0]), /Trouser, Dress/);
  act(() => renderer.unmount());
  pass("Collapsed card: name confirmed + a garment, no fit");
}

// Sole panel: lists every garment, never an ineligible split.
{
  const order: WearerOrderStateV2 = {
    schemaVersion: 2,
    wearers: [createWearerProfile({ wearerId: "w-solo", displayName: "Ada", fitContext: "male", presentationOrder: 0 })],
    assignmentByGarmentKey: { "base:shirt": "w-solo", "base:trouser": "w-solo", "base:dress": "w-solo" },
  };
  const renderer = render(order, "w-solo");
  assert.equal(renderer.root.findAll((node) => node.props?.["data-wearer-sole-ineligible"] !== undefined && typeof node.type === "string").length, 0);
  const names = renderer.root.findAll((node) => node.props?.["data-wearer-sole-garment-names"] === "true" && typeof node.type === "string");
  assert.equal(names.length, 1);
  assert.equal(textOf(names[0]), "Shirt, Trouser, Dress");
  assert.match(textOf(renderer.root), /All garments are for this person\./);
  act(() => renderer.unmount());
  pass("Sole notice: every garment, no ineligible branch");
}

console.log("wearer fit retirement tests passed");