import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { STEP_1_SELECTABLE_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import { FabricCapacityEngine } from "./src/engine/FabricCapacityEngine";
import type {
  AdditionalGarmentConstructionStateV1,
  FabricAllocationState,
  FabricGarmentAssignment,
  FabricGarmentType,
} from "./src/types";
import { cloneGarmentConstructionPricingResolution } from "./src/utils/additionalGarmentConstructionState";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { buildAuthoritativePhysicalOccurrences } from "./src/utils/designSourceState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import {
  formatRequiredFabricQuantitySentence,
  getFutureFabricGarmentSelections,
  getFutureGarmentFabricPlanning,
  getGarmentTypeStepSelectedFabricQuantity,
} from "./src/utils/designStudioFutureFabricStage";
import { getGarmentTypeStepPresentation } from "./src/components/GarmentTypeStep";
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

const additionalConstructionEntry = (garmentType: FabricGarmentType) => {
  const pricing = resolveGarmentConstructionPricing(garmentType, catalog);
  assert.equal(pricing.status, "resolved");
  return cloneGarmentConstructionPricingResolution(pricing);
};

const buildAuthorizedAdditionalState = (
  entries: Array<{ garmentKey: string; garmentType: FabricGarmentType }>,
): AdditionalGarmentConstructionStateV1 => ({
  schemaVersion: 1,
  byGarmentKey: Object.fromEntries(
    entries.map(({ garmentKey, garmentType }) => [
      garmentKey,
      additionalConstructionEntry(garmentType),
    ]),
  ),
});

const buildAuthoritativeOccurrences = ({
  garmentTypes,
  additionalGarmentConstructionState = null,
}: {
  garmentTypes: FabricGarmentType[];
  additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1 | null;
}) => {
  const garmentTypeSelection = createSelection(garmentTypes);
  return buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: garmentTypeSelection,
    effectiveGarmentTypeSelection: garmentTypeSelection,
    additionalGarmentConstructionState,
  });
};

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

for (const exception of ["full_length_gown", "agbada"] as const) {
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

const kaftanWithShirt = getFutureGarmentFabricPlanning({
  garmentTypeSelection: createSelection(["kaftan", "shirt"]),
  fabricAllocationState: emptyState(),
});
assert.deepEqual(kaftanWithShirt, {
  requiredGarmentCount: 2,
  requiredFabricQuantity: 1,
  selectedFabricQuantity: 0,
});

const kaftanWithGown = getFutureGarmentFabricPlanning({
  garmentTypeSelection: createSelection(["kaftan", "full_length_gown"]),
  fabricAllocationState: emptyState(),
});
assert.deepEqual(kaftanWithGown, {
  requiredGarmentCount: 2,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 0,
});

const shirtTrouserSelection = createSelection(["shirt", "trouser"]);
const mainAssignments = resolveBaseAssignments(["shirt", "trouser"]);
const appendedKaftan: FabricGarmentAssignment = {
  garmentKey: "additional:kaftan:1",
  code: "APPEND_KAFTAN_1",
  garmentType: "kaftan",
  fabricUnits: 1,
  sourceRole: "additional",
};
const pendingSkirt: FabricGarmentAssignment = {
  garmentKey: "additional:skirt:1",
  code: "APPEND_SKIRT_1",
  garmentType: "skirt",
  fabricUnits: 1,
  sourceRole: "additional",
};
const fourGarmentAdditionalState = buildAuthorizedAdditionalState([
  { garmentKey: "additional:kaftan:1", garmentType: "kaftan" },
  { garmentKey: "additional:skirt:1", garmentType: "skirt" },
]);
const fourGarmentOccurrences = buildAuthoritativeOccurrences({
  garmentTypes: ["shirt", "trouser"],
  additionalGarmentConstructionState: fourGarmentAdditionalState,
});
assert.deepEqual(
  fourGarmentOccurrences.map((occurrence) => occurrence.garmentKey).sort(),
  [
    "additional:kaftan:1",
    "additional:skirt:1",
    "base:shirt",
    "base:trouser",
  ],
);
const kaftanOnlyAdditionalState = buildAuthorizedAdditionalState([
  { garmentKey: "additional:kaftan:1", garmentType: "kaftan" },
]);
const threeGarmentOccurrences = buildAuthoritativeOccurrences({
  garmentTypes: ["shirt", "trouser"],
  additionalGarmentConstructionState: kaftanOnlyAdditionalState,
});
const twoGarmentOccurrences = buildAuthoritativeOccurrences({
  garmentTypes: ["shirt", "trouser"],
});
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
  garmentTypeSelection: shirtTrouserSelection,
  fabricAllocationState: allocationState,
  requiredPhysicalOccurrences: fourGarmentOccurrences,
});
assert.deepEqual(appendedPlanning, {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
assert.equal(
  appendedPlanning.selectedFabricQuantity,
  2,
  "Two allocation IDs using the same fabric product must count as two selected fabrics.",
);

const fabricRemovedPlanning = getFutureGarmentFabricPlanning({
  garmentTypeSelection: shirtTrouserSelection,
  fabricAllocationState: {
    ...allocationState,
    fabricAllocations: [allocationState.fabricAllocations[0]],
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  },
  requiredPhysicalOccurrences: fourGarmentOccurrences,
});
assert.deepEqual(
  fabricRemovedPlanning,
  {
    requiredGarmentCount: 4,
    requiredFabricQuantity: 2,
    selectedFabricQuantity: 1,
  },
  "Fabric removal must not remove Step 4 authorized physical membership.",
);

const explicitGarmentRemovalPlanning = getFutureGarmentFabricPlanning({
  garmentTypeSelection: shirtTrouserSelection,
  fabricAllocationState: {
    fabricAllocations: [allocationState.fabricAllocations[0]],
    activeAllocationId: "fabric-selection-1",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  },
  requiredPhysicalOccurrences: twoGarmentOccurrences,
});
assert.deepEqual(explicitGarmentRemovalPlanning, {
  requiredGarmentCount: 2,
  requiredFabricQuantity: 1,
  selectedFabricQuantity: 1,
});

const pendingOnlyPlanning = getFutureGarmentFabricPlanning({
  garmentTypeSelection: shirtTrouserSelection,
  fabricAllocationState: allocationState,
  requiredPhysicalOccurrences: threeGarmentOccurrences,
});
assert.deepEqual(
  pendingOnlyPlanning,
  {
    requiredGarmentCount: 3,
    requiredFabricQuantity: 2,
    selectedFabricQuantity: 2,
  },
  "Pending Fabric without Step 4 authorization must not increase membership.",
);

const fabricOnlyKaftanState: FabricAllocationState = {
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
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
const fabricOnlyPlanning = getFutureGarmentFabricPlanning({
  garmentTypeSelection: shirtTrouserSelection,
  fabricAllocationState: fabricOnlyKaftanState,
  requiredPhysicalOccurrences: twoGarmentOccurrences,
});
assert.deepEqual(
  fabricOnlyPlanning,
  {
    requiredGarmentCount: 2,
    requiredFabricQuantity: 1,
    selectedFabricQuantity: 2,
  },
  "Fabric-only additional assignments must not become authoritative membership.",
);

const assertPlanning = (
  garmentTypes: FabricGarmentType[],
  fabricAllocationState: FabricAllocationState,
  expected: Pick<
    ReturnType<typeof getFutureGarmentFabricPlanning>,
    "requiredGarmentCount" | "requiredFabricQuantity"
  >,
) => {
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: createSelection(garmentTypes),
    fabricAllocationState,
  });
  assert.equal(planning.requiredGarmentCount, expected.requiredGarmentCount);
  assert.equal(planning.requiredFabricQuantity, expected.requiredFabricQuantity);
};

const halfCapacityGarments = [
  "shirt",
  "trouser",
  "skirt",
  "standard_shorts",
  "bum_shorts",
  "dress",
  "kaftan",
] as const satisfies readonly FabricGarmentType[];

assertPlanning(["shirt"], emptyState(), {
  requiredGarmentCount: 1,
  requiredFabricQuantity: 1,
});
assertPlanning(["shirt", "trouser"], emptyState(), {
  requiredGarmentCount: 2,
  requiredFabricQuantity: 1,
});
assertPlanning(["shirt", "trouser", "skirt"], emptyState(), {
  requiredGarmentCount: 3,
  requiredFabricQuantity: 2,
});
assertPlanning([...halfCapacityGarments], emptyState(), {
  requiredGarmentCount: 7,
  requiredFabricQuantity: 4,
});
assertPlanning([...halfCapacityGarments, "full_length_gown"], emptyState(), {
  requiredGarmentCount: 8,
  requiredFabricQuantity: 5,
});
assertPlanning([...STEP_1_SELECTABLE_GARMENT_TYPES], emptyState(), {
  requiredGarmentCount: 8,
  requiredFabricQuantity: 5,
});

const allEightAssignments = resolveBaseAssignments([
  ...STEP_1_SELECTABLE_GARMENT_TYPES,
]);
const staleAgbadaAssignment: FabricGarmentAssignment = {
  garmentKey: "base:agbada",
  code: "STALE_AGBADA",
  garmentType: "agbada",
  fabricUnits: 2,
};
const staleInflatedState: FabricAllocationState = {
  fabricAllocations: [
    {
      allocationId: "fabric-selection-stale",
      fabricCode: "ODG-001",
      garmentAssignments: [...allEightAssignments, staleAgbadaAssignment],
    },
  ],
  activeAllocationId: "fabric-selection-stale",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assertPlanning([...STEP_1_SELECTABLE_GARMENT_TYPES], staleInflatedState, {
  requiredGarmentCount: 8,
  requiredFabricQuantity: 5,
});

const shirtTrouserAssignments = resolveBaseAssignments(["shirt", "trouser"]);
const deselectedTrouserState: FabricAllocationState = {
  fabricAllocations: [
    {
      allocationId: "fabric-selection-1",
      fabricCode: "ODG-001",
      garmentAssignments: shirtTrouserAssignments,
    },
  ],
  activeAllocationId: "fabric-selection-1",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assertPlanning(["shirt"], deselectedTrouserState, {
  requiredGarmentCount: 1,
  requiredFabricQuantity: 1,
});

const orphanedAdditional: FabricGarmentAssignment = {
  garmentKey: "additional:skirt:orphan",
  code: "ORPHAN_SKIRT",
  garmentType: "skirt",
  fabricUnits: 1,
  sourceRole: "additional",
  dependencyStatus: "orphaned",
};
const orphanedAdditionalState: FabricAllocationState = {
  fabricAllocations: [
    {
      allocationId: "fabric-selection-1",
      fabricCode: "ODG-001",
      garmentAssignments: [
        ...resolveBaseAssignments(["shirt"]),
        orphanedAdditional,
      ],
    },
  ],
  activeAllocationId: "fabric-selection-1",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assertPlanning(["shirt"], orphanedAdditionalState, {
  requiredGarmentCount: 1,
  requiredFabricQuantity: 1,
});

const additionalShirt: FabricGarmentAssignment = {
  garmentKey: "additional:shirt:1",
  code: "ADDITIONAL_SHIRT_1",
  garmentType: "shirt",
  fabricUnits: 1,
  sourceRole: "additional",
  dependencyStatus: "valid",
  eligibilityRule: "catalog_all",
};
const allEightWithAdditionalShirtState: FabricAllocationState = {
  fabricAllocations: [
    {
      allocationId: "fabric-selection-1",
      fabricCode: "ODG-001",
      garmentAssignments: [additionalShirt],
    },
  ],
  activeAllocationId: "fabric-selection-1",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assertPlanning([...STEP_1_SELECTABLE_GARMENT_TYPES], allEightWithAdditionalShirtState, {
  requiredGarmentCount: 9,
  requiredFabricQuantity: 5,
});
assert.equal(
  getFutureGarmentFabricPlanning({
    garmentTypeSelection: createSelection([...STEP_1_SELECTABLE_GARMENT_TYPES]),
    fabricAllocationState: allEightWithAdditionalShirtState,
  }).selectedFabricQuantity,
  1,
  "Whole-order selected fabric quantity must include additional-only allocations.",
);

const assertStep1SelectedFabrics = (
  garmentTypes: FabricGarmentType[],
  fabricAllocationState: FabricAllocationState,
  expected: number,
) => {
  assert.equal(
    getGarmentTypeStepSelectedFabricQuantity({
      garmentTypeSelection: createSelection(garmentTypes),
      fabricAllocationState,
    }),
    expected,
  );
};

const shirtAssignment = resolveBaseAssignments(["shirt"])[0];
const allEightWithOneStep1Fabric: FabricAllocationState = {
  fabricAllocations: [
    {
      allocationId: "fabric-selection-step1-1",
      fabricCode: "ODG-001",
      garmentAssignments: [shirtAssignment],
    },
  ],
  activeAllocationId: "fabric-selection-step1-1",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assertStep1SelectedFabrics(
  [...STEP_1_SELECTABLE_GARMENT_TYPES],
  allEightWithOneStep1Fabric,
  1,
);

const allEightWithStep1AndAdditionalFabrics: FabricAllocationState = {
  fabricAllocations: [
    {
      allocationId: "fabric-selection-step1-1",
      fabricCode: "ODG-001",
      garmentAssignments: [shirtAssignment],
    },
    {
      allocationId: "fabric-selection-additional-1",
      fabricCode: "ODG-002",
      garmentAssignments: [additionalShirt],
    },
  ],
  activeAllocationId: "fabric-selection-additional-1",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assertStep1SelectedFabrics(
  [...STEP_1_SELECTABLE_GARMENT_TYPES],
  allEightWithStep1AndAdditionalFabrics,
  1,
);

const sharedStep1Allocation: FabricAllocationState = {
  fabricAllocations: [
    {
      allocationId: "fabric-selection-shared",
      fabricCode: "ODG-001",
      garmentAssignments: shirtTrouserAssignments,
    },
  ],
  activeAllocationId: "fabric-selection-shared",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assertStep1SelectedFabrics(["shirt", "trouser"], sharedStep1Allocation, 1);

assertStep1SelectedFabrics(
  [...STEP_1_SELECTABLE_GARMENT_TYPES],
  allEightWithAdditionalShirtState,
  0,
);

const staleShirtOnlyAllocation: FabricAllocationState = {
  fabricAllocations: [
    {
      allocationId: "fabric-selection-stale-shirt",
      fabricCode: "ODG-001",
      garmentAssignments: [shirtAssignment],
    },
  ],
  activeAllocationId: "fabric-selection-stale-shirt",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assertStep1SelectedFabrics(
  STEP_1_SELECTABLE_GARMENT_TYPES.filter((garmentType) => garmentType !== "shirt"),
  staleShirtOnlyAllocation,
  0,
);

const agbadaAssignment = resolveBaseAssignments(["agbada"])[0];
const shirtTrouserWithHiddenAgbadaFabrics: FabricAllocationState = {
  fabricAllocations: [
    {
      allocationId: "fabric-selection-step1-1",
      fabricCode: "ODG-001",
      garmentAssignments: shirtTrouserAssignments,
    },
    {
      allocationId: "fabric-selection-agbada-only",
      fabricCode: "ODG-003",
      garmentAssignments: [agbadaAssignment],
    },
  ],
  activeAllocationId: "fabric-selection-agbada-only",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assertStep1SelectedFabrics(
  ["shirt", "trouser", "agbada"],
  shirtTrouserWithHiddenAgbadaFabrics,
  1,
);

assertPlanning(["shirt", "trouser", "agbada"], emptyState(), {
  requiredGarmentCount: 3,
  requiredFabricQuantity: 2,
});

const allEightWithHiddenAgbadaSelection = createSelection([
  ...STEP_1_SELECTABLE_GARMENT_TYPES,
  "agbada",
]);
assert.equal(
  getGarmentTypeStepSelectedFabricQuantity({
    garmentTypeSelection: allEightWithHiddenAgbadaSelection,
    fabricAllocationState: {
      ...allEightWithAdditionalShirtState,
      fabricAllocations: [
        ...allEightWithAdditionalShirtState.fabricAllocations,
        {
          allocationId: "fabric-selection-agbada-only",
          fabricCode: "ODG-003",
          garmentAssignments: [agbadaAssignment],
        },
      ],
    },
  }),
  0,
);
assertPlanning(
  [...STEP_1_SELECTABLE_GARMENT_TYPES, "agbada"],
  {
    fabricAllocations: [
      {
        allocationId: "fabric-selection-agbada-only",
        fabricCode: "ODG-003",
        garmentAssignments: [agbadaAssignment],
      },
    ],
    activeAllocationId: "fabric-selection-agbada-only",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  },
  {
    requiredGarmentCount: 9,
    requiredFabricQuantity: 6,
  },
);

assert.equal(
  formatRequiredFabricQuantitySentence(1, 1),
  "You need 1 fabric for your 1 garment.",
);
assert.equal(
  formatRequiredFabricQuantitySentence(1, 2),
  "You need 1 fabric for your 2 garments.",
);
assert.equal(
  formatRequiredFabricQuantitySentence(5, 8),
  "You need 5 fabrics for your 8 garments.",
);
assert.match(
  formatRequiredFabricQuantitySentence(5, 8),
  /\.$/,
  "The customer-facing fabric quantity sentence must include a final period.",
);

const sevenHalfUnits = getFutureGarmentFabricPlanning({
  garmentTypeSelection: createSelection([...halfCapacityGarments]),
  fabricAllocationState: emptyState(),
});
assert.equal(sevenHalfUnits.requiredGarmentCount, 7);
assert.equal(
  sevenHalfUnits.requiredFabricQuantity,
  4,
  "Seven half-unit garments require 4 fabrics, not ceil(7/2) from a different rule.",
);
const sevenHalfPlusGown = getFutureGarmentFabricPlanning({
  garmentTypeSelection: createSelection([
    ...halfCapacityGarments,
    "full_length_gown",
  ]),
  fabricAllocationState: emptyState(),
});
assert.equal(sevenHalfPlusGown.requiredGarmentCount, 8);
assert.equal(
  sevenHalfPlusGown.requiredFabricQuantity,
  5,
  "Long Dress (2 internal units) must raise the required Fabric quantity from 4 to 5.",
);
assert.equal(
  formatRequiredFabricQuantitySentence(
    sevenHalfPlusGown.requiredFabricQuantity,
    sevenHalfPlusGown.requiredGarmentCount,
  ),
  "You need 5 fabrics for your 8 garments.",
);

const step1AllEight = getGarmentTypeStepPresentation({
  selectedGarmentTypes: [...STEP_1_SELECTABLE_GARMENT_TYPES],
  normalizedCustomDetailCatalog: catalog,
});
const step2AllEight = getFutureGarmentFabricPlanning({
  garmentTypeSelection: createSelection([...STEP_1_SELECTABLE_GARMENT_TYPES]),
  fabricAllocationState: emptyState(),
});
assert.equal(step1AllEight.capacityUnits, 9);
assert.equal(step1AllEight.garmentCount, 8);
assert.equal(step1AllEight.fabricQuantity, 5);
assert.equal(step2AllEight.requiredGarmentCount, 8);
assert.equal(step2AllEight.requiredFabricQuantity, 5);
assert.equal(
  step1AllEight.fabricQuantity,
  step2AllEight.requiredFabricQuantity,
  "Step 1 and Step 2 must share the same required Fabric quantity.",
);

console.log("PASS: Garment Type fabric planning and allocation counters");
