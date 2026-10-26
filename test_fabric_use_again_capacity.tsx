/**
 * Regression: the Use Again panel's "Fabric Capacity" summary ignored the
 * garments already on the saved piece. Fabric C holds Standard Nikka Shorts
 * (1/2); its Use Again panel showed "Fabric Capacity: 0/2", and ticking Long
 * Shirt showed "1/2 … will remain available" although the piece was full.
 * It must start at 1/2 and reach 2/2 "Fabric capacity complete."
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricAllocationState, GarmentTypeStepSelection } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { assignFutureFabricToGarment } from "./src/utils/designStudioFutureFabricStage";
import {
  STEP1_EXISTING_FABRIC_PIECE_FULL_MESSAGE,
  STEP1_FABRIC_CAPACITY_COMPLETE_MESSAGE,
  STEP1_SELECT_MORE_GARMENT_CAPACITY_MESSAGE,
  STEP1_ZERO_CAPACITY_GUIDANCE_MESSAGE,
  buildStep1FabricAssignmentCandidates,
  commitStep1FabricAssignment,
  evaluateStep1FabricAssignmentSelection,
  projectPendingStep1FabricStockPresentation,
  resolveStep1FabricCatalogueCardPresentation,
} from "./src/utils/step1FabricAssignmentPopup";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;
const { Step1FabricAssignmentDialog } = await import("./src/components/Step1FabricAssignmentDialog");
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const nine: GarmentTypeStepSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: [
    "shirt",
    "trouser",
    "skirt",
    "long_skirt",
    "standard_shorts",
    "bum_shorts",
    "dress",
    "kaftan",
    "full_length_gown",
  ],
  selectedDemographics: ["male", "female"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const fabric = (suffix: string, name: string, stock: number): Fabric => ({
  code: `UA-${suffix}`,
  name,
  description: "Test fabric",
  color: "Red",
  colorHex: "#8B1A1A",
  category: "Test",
  price: 20,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  stock,
  image: `https://cdn.example.com/fabrics/ua-${suffix}.jpg`,
});
const fabrics = [
  fabric("A", "Fabric A", 30),
  fabric("B", "Fabric B", 30),
  fabric("C", "Crimson Heritage Kite", 6),
  fabric("N", "New Fabric", 30),
];
const assign = (state: FabricAllocationState, garmentKey: string, fabricCode: string) => {
  const result = assignFutureFabricToGarment({ state, garmentTypeSelection: nine, garmentKey, fabricCode, fabrics });
  assert.equal(result.status, "assigned", `${garmentKey} -> ${fabricCode}`);
  return result.state;
};
let base = FabricAllocationStateEngine.initialize();
base = assign(base, "base:shirt", "UA-A");
base = assign(base, "base:trouser", "UA-A");
base = assign(base, "base:skirt", "UA-B");
base = assign(base, "base:long_skirt", "UA-B");
base = assign(base, "base:standard_shorts", "UA-C");

const panel = (state: FabricAllocationState, fabricCode: string) => {
  const candidates = buildStep1FabricAssignmentCandidates({ garmentTypeSelection: nine, fabricAllocationState: state, fabricCode, fabrics });
  const evaluate = (selectedGarmentKeys: string[]) =>
    evaluateStep1FabricAssignmentSelection({ candidates, selectedGarmentKeys, garmentTypeSelection: nine, fabricAllocationState: state, fabricCode, fabrics });
  const stock = (selectedGarmentKeys: string[]) =>
    projectPendingStep1FabricStockPresentation({
      fabric: fabrics.find((item) => item.code === fabricCode)!,
      fabricAllocationState: state,
      selectedGarmentKeys,
      garmentTypeSelection: nine,
      fabrics,
    });
  return { candidates, evaluate, stock };
};

// 1. Use Again on Fabric C (Nikka Shorts already uses 1/2).
assert.equal(
  resolveStep1FabricCatalogueCardPresentation({ fabricCode: "UA-C", garmentTypeSelection: nine, fabricAllocationState: base, availabilityMessage: null, fabrics }).status,
  "USE AGAIN",
);
const c = panel(base, "UA-C");
const cOpen = c.evaluate([]);
assert.deepEqual(
  [cOpen.existingCapacityUnits, cOpen.capacityUnitsInUse, cOpen.selectedCapacityUnits, cOpen.groupingCapacityStatus],
  [1, 1, 0, STEP1_ZERO_CAPACITY_GUIDANCE_MESSAGE],
  "opens at 1/2: Nikka Shorts is counted",
);
const cKaftan = c.evaluate(["base:kaftan"]);
assert.deepEqual(
  [cKaftan.capacityUnitsInUse, cKaftan.groupingCapacityStatus, cKaftan.canAssignSelected],
  [2, STEP1_FABRIC_CAPACITY_COMPLETE_MESSAGE, true],
  "Long Shirt fills the saved piece: 2/2 complete",
);
// Stock label: joining the saved piece takes no extra stock.
assert.deepEqual(c.stock(["base:kaftan"]), c.stock([]));
// Per-row states come from the same projection the commit uses.
for (const candidate of c.candidates) {
  if (candidate.garmentKey === "base:kaftan") continue;
  const enabled = cKaftan.candidateEnabled[candidate.garmentKey];
  const committed = commitStep1FabricAssignment({
    state: base,
    garmentTypeSelection: nine,
    fabrics,
    fabricCode: "UA-C",
    selectedGarmentKeys: ["base:kaftan", candidate.garmentKey],
    mode: "selected",
  });
  assert.equal(enabled, committed.status === "assigned", `row ${candidate.garmentKey} matches commit`);
}
const committed = commitStep1FabricAssignment({
  state: base,
  garmentTypeSelection: nine,
  fabrics,
  fabricCode: "UA-C",
  selectedGarmentKeys: ["base:kaftan"],
  mode: "selected",
});
assert.equal(committed.status, "assigned");
const afterKaftan = committed.state;
assert.equal(afterKaftan.fabricAllocations.length, 3, "no new piece was created");
assert.deepEqual(
  afterKaftan.fabricAllocations[2]!.garmentAssignments.map((a) => a.garmentKey),
  ["base:standard_shorts", "base:kaftan"],
);

// 2. Use Again on a FULL saved piece (2/2): a new piece starts at 0/2, and the
//    panel says so.
const full = panel(afterKaftan, "UA-C");
const fullOpen = full.evaluate([]);
assert.deepEqual(
  [fullOpen.existingCapacityUnits, fullOpen.capacityUnitsInUse, fullOpen.groupingCapacityStatus],
  [0, 0, STEP1_EXISTING_FABRIC_PIECE_FULL_MESSAGE],
);
const fullBum = full.evaluate(["base:bum_shorts"]);
assert.deepEqual(
  [fullBum.capacityUnitsInUse, fullBum.groupingCapacityStatus, fullBum.canAssignSelected],
  [1, STEP1_SELECT_MORE_GARMENT_CAPACITY_MESSAGE, true],
);
assert.notDeepEqual(full.stock(["base:bum_shorts"]), full.stock([]), "a new piece takes one more from stock");

// 3. A brand-new Fabric is unchanged: starts at 0/2.
const fresh = panel(base, "UA-N").evaluate([]);
assert.deepEqual([fresh.existingCapacityUnits, fresh.capacityUnitsInUse], [0, 0]);
assert.equal(panel(base, "UA-N").evaluate(["base:bum_shorts", "base:dress"]).capacityUnitsInUse, 2);

// 4. Rendered header.
const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";
const createNodeMock = () => ({
  focus: () => undefined,
  scrollIntoView: () => undefined,
  getAttribute: () => null,
  hasAttribute: () => false,
  isConnected: true,
  tabIndex: 0,
  parentElement: null,
  tagName: "DIV",
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  querySelectorAll: () => [],
  contains: () => false,
});
const renderDialog = (selectedGarmentKeys: string[]) =>
  createElement(Step1FabricAssignmentDialog, {
    displayFabric: fabrics[2]!,
    currentFabric: fabrics[2]!,
    candidates: c.candidates,
    selectedGarmentKeys,
    ...c.evaluate(selectedGarmentKeys),
    errorMessage: null,
    onToggleGarmentKey: () => undefined,
    onAssignSelected: () => undefined,
    onUseForAll: () => undefined,
    onCancel: () => undefined,
  });
const progress = (root: ReactTestInstance) =>
  textContent(root.find((node) => typeof node.type === "string" && node.props["data-testid"] === "step1-fabric-assignment-capacity-progress"));
const grouping = (root: ReactTestInstance) =>
  textContent(root.find((node) => typeof node.type === "string" && node.props["data-testid"] === "step1-fabric-assignment-grouping-capacity"));
{
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderDialog([]), { createNodeMock });
  });
  assert.equal(progress(renderer.root), "Fabric Capacity: 1/2");
  await act(async () => {
    renderer.update(renderDialog(["base:kaftan"]));
  });
  assert.equal(progress(renderer.root), "Fabric Capacity: 2/2");
  assert.equal(grouping(renderer.root), "Fabric capacity complete.");
  assert.doesNotMatch(textContent(renderer.root), /1\/2 fabric capacity will remain available/);
}
{
  const { readFileSync } = await import("node:fs");
  assert.match(
    readFileSync("src/components/DormantFutureFabricStep.tsx", "utf8"),
    /capacityUnitsInUse=\{step1AssignmentEvaluation\.capacityUnitsInUse\}/,
  );
}

console.log("test_fabric_use_again_capacity: PASS");
