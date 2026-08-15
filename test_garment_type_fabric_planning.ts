import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricCapacityEngine } from "./src/engine/FabricCapacityEngine";
import type {
  FabricAllocationState,
  FabricGarmentAssignment,
  FabricGarmentType,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  getFutureFabricGarmentSelections,
  getFutureGarmentFabricPlanning,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const createSelection = (garmentTypes: FabricGarmentType[]) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: ["unisex"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const resolveBaseAssignments = (
  garmentTypes: FabricGarmentType[],
): FabricGarmentAssignment[] =>
  getFutureFabricGarmentSelections(createSelection(garmentTypes)).flatMap(
    (input) => {
      const resolution = FabricCapacityEngine.resolveGarmentAssignment(input);
      return resolution.status === "resolved" ? resolution.assignments : [];
    },
  );

const emptyState = (): FabricAllocationState => ({
  fabricAllocations: [],
  activeAllocationId: null,
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
});

const regularPlanning = getFutureGarmentFabricPlanning({
  garmentTypeSelection: createSelection([
    "shirt",
    "trouser",
    "skirt",
    "standard_shorts",
  ]),
  fabricAllocationState: emptyState(),
});
assert.deepEqual(regularPlanning, {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 0,
});

for (const exception of [
  "kaftan",
  "full_length_gown",
  "agbada",
] as const) {
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: createSelection([exception, "shirt", "trouser"]),
    fabricAllocationState: emptyState(),
  });
  assert.equal(planning.requiredGarmentCount, 3);
  assert.equal(
    planning.requiredFabricQuantity,
    2,
    `${exception} must reserve one fabric quantity while two regular garments share one.`,
  );
}

const mainAssignments = resolveBaseAssignments(["shirt", "trouser"]);
const appendedKaftan: FabricGarmentAssignment = {
  garmentKey: "additional:kaftan:1",
  code: "APPEND_KAFTAN_1",
  garmentType: "kaftan",
  fabricUnits: 2,
  sourceRole: "additional",
};
const pendingSkirt: FabricGarmentAssignment = {
  garmentKey: "additional:skirt:1",
  code: "APPEND_SKIRT_1",
  garmentType: "skirt",
  fabricUnits: 1,
  sourceRole: "additional",
};
const allocationState: FabricAllocationState = {
  fabricAllocations: [
    {
      allocationId: "fabric-selection-1",
      fabricCode: "ODG-001",
      garmentAssignments: mainAssignments,
    },
    {
      allocationId: "fabric-selection-2",
      fabricCode: "ODG-001",
      garmentAssignments: [appendedKaftan],
    },
  ],
  activeAllocationId: "fabric-selection-2",
  pendingFabricGarment: pendingSkirt,
  awaitingFabricForPendingGarment: true,
};
const appendedPlanning = getFutureGarmentFabricPlanning({
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricAllocationState: allocationState,
});
assert.deepEqual(appendedPlanning, {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 3,
  selectedFabricQuantity: 2,
});
assert.equal(
  appendedPlanning.selectedFabricQuantity,
  2,
  "Two allocation IDs using the same fabric product must count as two selected fabrics.",
);

const removedPlanning = getFutureGarmentFabricPlanning({
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricAllocationState: {
    ...allocationState,
    fabricAllocations: [allocationState.fabricAllocations[0]],
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  },
});
assert.deepEqual(removedPlanning, {
  requiredGarmentCount: 2,
  requiredFabricQuantity: 1,
  selectedFabricQuantity: 1,
});

console.log("PASS: Garment Type fabric planning and allocation counters");
