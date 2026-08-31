import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricGarmentType } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  assignFutureGarmentToExistingFabricAllocation,
  getFutureFabricStageCompletion,
  removeFutureFabricAssignment,
} from "./src/utils/designStudioFutureFabricStage";
import { getFabricAvailabilityMessage } from "./src/utils/fabricCatalogueAvailability";
import {
  canCreatePhysicalFabricAllocationForStock,
  getFabricPhysicalAllocationCount,
  getFabricRemainingPhysicalStock,
  getOrderAwareFabricStockPresentation,
  isAuthoritativeNumericFabricStock,
} from "./src/utils/fabricStockAvailability";
import {
  buildStep1FabricAssignmentCandidates,
  commitStep1FabricAssignment,
  evaluateStep1FabricAssignmentSelection,
} from "./src/utils/step1FabricAssignmentPopup";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const createSelection = (garmentTypes: FabricGarmentType[]) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: ["unisex"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const createFabric = (
  code: string,
  name: string,
  stock?: number,
  stockStatus: Fabric["stockStatus"] = "IN_STOCK",
): Fabric => ({
  code,
  name,
  description: name,
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus,
  category: "Test Fabric",
  price: 10,
  stock,
});

const fabrics = [
  createFabric("FAB-A", "Fabric A", 1),
  createFabric("FAB-B", "Fabric B", 2),
  createFabric("FAB-C", "Fabric C", 5, "OUT_OF_STOCK"),
  createFabric("FAB-D", "Fabric D", 0, "IN_STOCK"),
  createFabric("FAB-E", "Fabric E", undefined, "IN_STOCK"),
];

const assign = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
  selection: ReturnType<typeof createSelection>,
  garmentKey: string,
  fabricCode: string,
) =>
  assignFutureFabricToGarment({
    state,
    garmentTypeSelection: selection,
    garmentKey,
    fabricCode,
    fabrics,
  });

assert.equal(isAuthoritativeNumericFabricStock(1), true);
assert.equal(isAuthoritativeNumericFabricStock(undefined), false);
assert.equal(isAuthoritativeNumericFabricStock(-1), false);

{
  let state = FabricAllocationStateEngine.initialize();
  const selection = createSelection(["shirt", "trouser"]);
  state = assign(state, selection, "base:shirt", "FAB-A").state;
  assert.equal(getFabricPhysicalAllocationCount(state, "FAB-A"), 1);
  assert.equal(getFabricRemainingPhysicalStock(fabrics[0]!, state), 0);
  assert.equal(
    canCreatePhysicalFabricAllocationForStock({ fabric: fabrics[0]!, state }),
    false,
  );
  const trouserResult = assignFutureGarmentToExistingFabricAllocation({
    state,
    garmentTypeSelection: selection,
    garmentKey: "base:trouser",
    allocationId: state.fabricAllocations[0]!.allocationId,
  });
  assert.equal(trouserResult.status, "assigned");
  assert.equal(getFabricPhysicalAllocationCount(trouserResult.state, "FAB-A"), 1);
  assert.equal(
    trouserResult.state.fabricAllocations[0]!.garmentAssignments.length,
    2,
  );
}

{
  let state = FabricAllocationStateEngine.initialize();
  const selection = createSelection(["shirt", "trouser", "skirt"]);
  state = assign(state, selection, "base:shirt", "FAB-A").state;
  state = assign(state, selection, "base:trouser", "FAB-A").state;
  const blocked = assign(state, selection, "base:skirt", "FAB-A");
  assert.equal(blocked.status, "blocked");
  assert.equal(
    blocked.status === "blocked" ? blocked.reason : null,
    "FABRIC_STOCK_EXHAUSTED",
  );
  assert.deepEqual(blocked.state, state);
}

{
  let state = FabricAllocationStateEngine.initialize();
  const selection = createSelection([
    "shirt",
    "trouser",
    "standard_shorts",
    "bum_shorts",
  ]);
  state = assign(state, selection, "base:shirt", "FAB-B").state;
  state = assign(state, selection, "base:trouser", "FAB-B").state;
  state = assign(state, selection, "base:standard_shorts", "FAB-B").state;
  state = assign(state, selection, "base:bum_shorts", "FAB-B").state;
  assert.equal(getFabricPhysicalAllocationCount(state, "FAB-B"), 2);
  assert.equal(canCreatePhysicalFabricAllocationForStock({ fabric: fabrics[1]!, state }), false);
  const selectionWithExtra = createSelection([
    "shirt",
    "trouser",
    "standard_shorts",
    "bum_shorts",
    "skirt",
  ]);
  let extraState = FabricAllocationStateEngine.initialize();
  extraState = assign(extraState, selectionWithExtra, "base:shirt", "FAB-B").state;
  extraState = assign(extraState, selectionWithExtra, "base:trouser", "FAB-B").state;
  extraState = assign(extraState, selectionWithExtra, "base:standard_shorts", "FAB-B").state;
  extraState = assign(extraState, selectionWithExtra, "base:bum_shorts", "FAB-B").state;
  const blocked = assign(extraState, selectionWithExtra, "base:skirt", "FAB-B");
  assert.equal(blocked.status, "blocked");
  assert.equal(
    blocked.status === "blocked" ? blocked.reason : null,
    "FABRIC_STOCK_EXHAUSTED",
  );
}

{
  const selection = createSelection(["shirt", "trouser", "full_length_gown"]);
  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, selection, "base:full_length_gown", "FAB-A").state;
  const blocked = assign(state, selection, "base:shirt", "FAB-A");
  assert.equal(blocked.status, "blocked");
  assert.equal(
    blocked.status === "blocked" ? blocked.reason : null,
    "FABRIC_STOCK_EXHAUSTED",
  );
  assert.equal(getFabricPhysicalAllocationCount(state, "FAB-A"), 1);
}

{
  let state = FabricAllocationStateEngine.initialize();
  const selection = createSelection(["full_length_gown"]);
  state = assign(state, selection, "base:full_length_gown", "FAB-A").state;
  state = removeFutureFabricAssignment({
    state,
    garmentKey: "base:full_length_gown",
  });
  assert.equal(getFabricPhysicalAllocationCount(state, "FAB-A"), 0);
  assert.equal(canCreatePhysicalFabricAllocationForStock({ fabric: fabrics[0]!, state }), true);
}

{
  let state = FabricAllocationStateEngine.initialize();
  const selection = createSelection(["shirt", "trouser"]);
  state = assign(state, selection, "base:shirt", "FAB-A").state;
  state = assign(state, selection, "base:trouser", "FAB-A").state;
  state = removeFutureFabricAssignment({ state, garmentKey: "base:trouser" });
  assert.equal(getFabricPhysicalAllocationCount(state, "FAB-A"), 1);
  assert.equal(canCreatePhysicalFabricAllocationForStock({ fabric: fabrics[0]!, state }), false);
  state = removeFutureFabricAssignment({ state, garmentKey: "base:shirt" });
  assert.equal(getFabricPhysicalAllocationCount(state, "FAB-A"), 0);
}

{
  const selection = createSelection(["shirt", "trouser"]);
  let first = FabricAllocationStateEngine.initialize();
  first = assign(first, selection, "base:shirt", "FAB-A").state;
  let second = FabricAllocationStateEngine.initialize();
  second = assign(second, selection, "base:trouser", "FAB-A").state;
  const legacyState = {
    ...first,
    fabricAllocations: [
      first.fabricAllocations[0]!,
      {
        ...second.fabricAllocations[0]!,
        allocationId: "legacy-second-allocation",
      },
    ],
    activeAllocationId: "legacy-second-allocation",
  };
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: selection,
    fabricAllocationState: legacyState,
    fabrics,
  });
  assert.equal(completion.isComplete, false);
  assert.ok(
    completion.blockers.some((blocker) => blocker.code === "FABRIC_STOCK_OVER_ALLOCATED"),
  );
}

assert.equal(getFabricAvailabilityMessage(fabrics[2]!), "Currently out of stock.");
assert.equal(getFabricAvailabilityMessage(fabrics[3]!), null);
assert.equal(
  getOrderAwareFabricStockPresentation(fabrics[3]!, FabricAllocationStateEngine.initialize())
    .visible &&
    getOrderAwareFabricStockPresentation(fabrics[3]!, FabricAllocationStateEngine.initialize())
      .status === "OUT_OF_STOCK"
    ? (
        getOrderAwareFabricStockPresentation(
          fabrics[3]!,
          FabricAllocationStateEngine.initialize(),
        ) as { label: string }
      ).label
    : null,
  "Out of Stock",
);

assert.equal(getFabricAvailabilityMessage(fabrics[4]!), null);

{
  let state = FabricAllocationStateEngine.initialize();
  const selection = createSelection(["shirt", "trouser"]);
  state = assign(state, selection, "base:shirt", "FAB-E").state;
  state = assign(state, selection, "base:trouser", "FAB-E").state;
  assert.equal(getFabricPhysicalAllocationCount(state, "FAB-E"), 1);
}

{
  let state = FabricAllocationStateEngine.initialize();
  const selection = createSelection(["shirt", "trouser", "skirt", "kaftan"]);
  state = assign(state, selection, "base:shirt", "FAB-B").state;
  state = assign(state, selection, "base:trouser", "FAB-B").state;
  state = assign(state, selection, "base:skirt", "FAB-B").state;
  assert.equal(getFabricPhysicalAllocationCount(state, "FAB-B"), 2);
  assert.equal(
    new Set(
      state.fabricAllocations
        .filter((allocation) => allocation.fabricCode === "FAB-B")
        .map((allocation) => allocation.allocationId),
    ).size,
    2,
  );
}

{
  const selection = createSelection(["shirt", "trouser", "skirt"]);
  let state = FabricAllocationStateEngine.initialize();
  state = assign(state, selection, "base:shirt", "FAB-A").state;
  state = assign(state, selection, "base:trouser", "FAB-A").state;
  const candidates = buildStep1FabricAssignmentCandidates({
    garmentTypeSelection: selection,
    fabricAllocationState: state,
    fabricCode: "FAB-A",
    fabrics,
  });
  const evaluation = evaluateStep1FabricAssignmentSelection({
    candidates,
    selectedGarmentKeys: ["base:skirt"],
    garmentTypeSelection: selection,
    fabricAllocationState: state,
    fabricCode: "FAB-A",
    fabrics,
  });
  assert.equal(evaluation.canAssignSelected, false);
  const commit = commitStep1FabricAssignment({
    state,
    garmentTypeSelection: selection,
    fabrics,
    fabricCode: "FAB-A",
    selectedGarmentKeys: ["base:skirt"],
    mode: "selected",
  });
  assert.equal(commit.status, "blocked");
  assert.equal(
    commit.status === "blocked" ? commit.reason : null,
    "FABRIC_STOCK_EXHAUSTED",
  );
}

console.log("PASS: fabric stock allocation authority");
