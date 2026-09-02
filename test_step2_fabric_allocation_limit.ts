import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricGarmentAssignment, FabricGarmentType } from "./src/types";
import { createCatalogueAdditionalGarmentSelection, projectCatalogueStep1PhysicalOccurrences } from "./src/utils/additionalGarmentDomain";
import {
  cloneGarmentConstructionPricingResolution,
} from "./src/utils/additionalGarmentConstructionState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import { buildAuthoritativePhysicalOccurrences } from "./src/utils/designSourceState";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  assignFutureGarmentToExistingFabricAllocation,
  canCreatePhysicalFabricAllocation,
  formatFabricQuantityLimitReachedCopy,
  formatRequiredFabricQuantitySentence,
  getFutureCompatiblePartialFabricAllocations,
  getFutureFabricAssignmentTargets,
  getFuturePartialFabricAllocationCompatibleTargets,
  getFuturePartialFabricAllocationSummaries,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  hasAvoidablePartialFabricAllocation,
  isFutureFinalPartialFabricAllocation,
  removeFutureFabricAssignment,
  resolveFutureFabricCatalogueCardPresentation,
} from "./src/utils/designStudioFutureFabricStage";
import { resolveStep1FabricCatalogueCardPresentation } from "./src/utils/step1FabricAssignmentPopup";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const createSelection = (garmentTypes: FabricGarmentType[]) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: ["unisex"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const createFabric = (code: string, name: string): Fabric => ({
  code,
  name,
  description: name,
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Test Fabric",
  price: 10,
});

const fabrics = [
  createFabric("FAB-A", "Fabric A"),
  createFabric("FAB-B", "Fabric B"),
  createFabric("FAB-C", "Fabric C"),
  createFabric("FAB-D", "Fabric D"),
  createFabric("FAB-E", "Fabric E"),
];

const fourOrdinary = [
  "shirt",
  "trouser",
  "standard_shorts",
  "bum_shorts",
] satisfies FabricGarmentType[];

const assign = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
  garmentTypes: readonly FabricGarmentType[],
  garmentKey: string,
  fabricCode: string,
) =>
  assignFutureFabricToGarment({
    state,
    garmentTypeSelection: createSelection([...garmentTypes]),
    garmentKey,
    fabricCode,
    fabrics,
  });

const planningOf = (
  garmentTypes: readonly FabricGarmentType[],
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
) =>
  getFutureGarmentFabricPlanning({
    garmentTypeSelection: createSelection([...garmentTypes]),
    fabricAllocationState: state,
  });

const completionOf = (
  garmentTypes: readonly FabricGarmentType[],
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
) =>
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection([...garmentTypes]),
    fabricAllocationState: state,
    fabrics,
  });

const empty = () => FabricAllocationStateEngine.initialize();

const emptyPlanning = planningOf(fourOrdinary, empty());
assert.deepEqual(emptyPlanning, {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 0,
});
assert.equal(
  formatRequiredFabricQuantitySentence(2, 4),
  "You need 2 fabrics for your 4 garments.",
);

let fourState = empty();
fourState = assign(fourState, fourOrdinary, "base:shirt", "FAB-A").state;
assert.equal(assign(fourState, fourOrdinary, "base:shirt", "FAB-A").status, "assigned");
assert.deepEqual(planningOf(fourOrdinary, fourState), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 1,
});

fourState = assign(fourState, fourOrdinary, "base:trouser", "FAB-B").state;
assert.deepEqual(planningOf(fourOrdinary, fourState), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
assert.equal(
  canCreatePhysicalFabricAllocation({
    state: fourState,
    garmentTypeSelection: createSelection(fourOrdinary),
  }),
  false,
);

const blockedThird = assign(fourState, fourOrdinary, "base:standard_shorts", "FAB-C");
assert.equal(blockedThird.status, "blocked");
assert.equal(
  blockedThird.status === "blocked" ? blockedThird.reason : null,
  "FABRIC_QUANTITY_LIMIT_REACHED",
);
assert.equal(blockedThird.state.fabricAllocations.length, 2);
assert.deepEqual(planningOf(fourOrdinary, blockedThird.state), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});

const unusedAtLimit = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: "FAB-C",
  garmentTypeSelection: createSelection(fourOrdinary),
  fabricAllocationState: fourState,
  availabilityMessage: null,
});
assert.deepEqual(unusedAtLimit, { status: "SELECT", action: "none" });

const useAgainA = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(fourOrdinary),
  fabricAllocationState: fourState,
  availabilityMessage: null,
});
assert.deepEqual(useAgainA, { status: "USE AGAIN", action: "use_again" });

fourState = assign(fourState, fourOrdinary, "base:standard_shorts", "FAB-A").state;
assert.equal(
  fourState.fabricAllocations.some((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:standard_shorts",
    ),
  ),
  true,
);
assert.deepEqual(planningOf(fourOrdinary, fourState), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});

fourState = assign(fourState, fourOrdinary, "base:bum_shorts", "FAB-B").state;
assert.deepEqual(planningOf(fourOrdinary, fourState), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
assert.equal(completionOf(fourOrdinary, fourState).assignedGarmentCount, 4);
assert.equal(completionOf(fourOrdinary, fourState).isComplete, true);
assert.equal(
  fourState.fabricAllocations.some((allocation) => allocation.fabricCode === "FAB-C"),
  false,
  "A third unused Fabric product must never create allocation 3.",
);

let sameProduct = empty();
for (const garmentKey of [
  "base:shirt",
  "base:trouser",
  "base:standard_shorts",
  "base:bum_shorts",
]) {
  const result = assign(sameProduct, fourOrdinary, garmentKey, "FAB-A");
  assert.equal(result.status, "assigned", `${garmentKey} must assign onto Fabric A`);
  sameProduct = result.state;
}
assert.equal(sameProduct.fabricAllocations.length, 2);
assert.ok(
  sameProduct.fabricAllocations.every((allocation) => allocation.fabricCode === "FAB-A"),
);
assert.deepEqual(
  sameProduct.fabricAllocations.map(
    (allocation) => allocation.garmentAssignments.length,
  ),
  [2, 2],
);
assert.deepEqual(planningOf(fourOrdinary, sameProduct), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
const sharedGroupChange = assign(sameProduct, fourOrdinary, "base:shirt", "FAB-C");
assert.equal(
  sharedGroupChange.status,
  "assigned",
  "Changing Fabric for a shared allocation replaces the whole physical group in place.",
);
assert.equal(sharedGroupChange.state.fabricAllocations.length, 2);
assert.ok(
  sharedGroupChange.state.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === "FAB-C" &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:shirt",
      ) &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:trouser",
      ),
  ),
);

let gownState = assign(empty(), ["full_length_gown"], "base:full_length_gown", "FAB-A")
  .state;
assert.deepEqual(planningOf(["full_length_gown"], gownState), {
  requiredGarmentCount: 1,
  requiredFabricQuantity: 1,
  selectedFabricQuantity: 1,
});
assert.equal(completionOf(["full_length_gown"], gownState).isComplete, true);
const gownSecond = assign(
  gownState,
  ["full_length_gown"],
  "base:full_length_gown",
  "FAB-B",
);
assert.equal(gownSecond.status, "assigned");
assert.equal(
  gownSecond.state.fabricAllocations.length,
  1,
  "Changing the only Long Dress allocation replaces the fabricCode in place.",
);
assert.equal(gownSecond.state.fabricAllocations[0]?.fabricCode, "FAB-B");

const mixedTypes = [
  "full_length_gown",
  "shirt",
  "trouser",
] satisfies FabricGarmentType[];
let mixed = assign(empty(), mixedTypes, "base:full_length_gown", "FAB-A").state;
mixed = assign(mixed, mixedTypes, "base:shirt", "FAB-B").state;
mixed = assign(mixed, mixedTypes, "base:trouser", "FAB-B").state;
assert.deepEqual(planningOf(mixedTypes, mixed), {
  requiredGarmentCount: 3,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
assert.equal(completionOf(mixedTypes, mixed).isComplete, true);
const mixedSharedChange = assign(mixed, mixedTypes, "base:shirt", "FAB-C");
assert.equal(
  mixedSharedChange.status,
  "assigned",
  "Changing Fabric for a shared Shirt + Trouser allocation replaces the whole group.",
);
assert.equal(mixedSharedChange.state.fabricAllocations.length, 2);
assert.ok(
  mixedSharedChange.state.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === "FAB-C" &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:shirt",
      ) &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:trouser",
      ),
  ),
);
const mixedDressReplace = assign(
  mixed,
  mixedTypes,
  "base:full_length_gown",
  "FAB-C",
);
assert.equal(mixedDressReplace.status, "assigned");
assert.equal(mixedDressReplace.state.fabricAllocations.length, 2);
assert.equal(
  mixedDressReplace.state.fabricAllocations.find(
    (allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:full_length_gown",
      ),
  )?.fabricCode,
  "FAB-C",
);

let splitAtLimit = empty();
splitAtLimit = assign(splitAtLimit, fourOrdinary, "base:shirt", "FAB-A").state;
splitAtLimit = assign(splitAtLimit, fourOrdinary, "base:standard_shorts", "FAB-A")
  .state;
splitAtLimit = assign(splitAtLimit, fourOrdinary, "base:trouser", "FAB-B").state;
splitAtLimit = assign(splitAtLimit, fourOrdinary, "base:bum_shorts", "FAB-B").state;
assert.equal(splitAtLimit.fabricAllocations.length, 2);
const groupChangeAtLimit = assign(splitAtLimit, fourOrdinary, "base:shirt", "FAB-C");
assert.equal(
  groupChangeAtLimit.status,
  "assigned",
  "At the Fabric limit, a shared allocation may still change product in place.",
);
assert.equal(groupChangeAtLimit.state.fabricAllocations.length, 2);
assert.ok(
  groupChangeAtLimit.state.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === "FAB-C" &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:shirt",
      ) &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:standard_shorts",
      ),
  ),
);
assert.equal(
  resolveFutureFabricCatalogueCardPresentation({
    fabricCode: "FAB-C",
    garmentTypeSelection: createSelection(fourOrdinary),
    fabricAllocationState: splitAtLimit,
    currentTargetGarmentKey: "base:shirt",
  }).action,
  "select",
);

let replaceOnly = empty();
replaceOnly = assign(replaceOnly, fourOrdinary, "base:shirt", "FAB-A").state;
replaceOnly = assign(replaceOnly, fourOrdinary, "base:trouser", "FAB-B").state;
const replaced = assign(replaceOnly, fourOrdinary, "base:shirt", "FAB-C");
assert.equal(replaced.status, "assigned");
assert.equal(replaced.state.fabricAllocations.length, 2);
assert.ok(
  replaced.state.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === "FAB-C" &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:shirt",
      ),
  ),
);

let splitAllowed = empty();
splitAllowed = assign(splitAllowed, fourOrdinary, "base:shirt", "FAB-A").state;
splitAllowed = assign(splitAllowed, fourOrdinary, "base:standard_shorts", "FAB-A")
  .state;
assert.equal(splitAllowed.fabricAllocations.length, 1);
const groupChangeCreated = assign(splitAllowed, fourOrdinary, "base:shirt", "FAB-C");
assert.equal(groupChangeCreated.status, "assigned");
assert.equal(groupChangeCreated.state.fabricAllocations.length, 1);
assert.equal(
  groupChangeCreated.state.fabricAllocations[0]?.fabricCode,
  "FAB-C",
);
assert.equal(
  groupChangeCreated.state.fabricAllocations[0]?.garmentAssignments.length,
  2,
);

const assignmentTargets = getFutureFabricAssignmentTargets(
  createSelection(fourOrdinary),
);
const legacyAssignments = assignmentTargets.map(
  (target) => target.assignment,
) as FabricGarmentAssignment[];
const legacyState = {
  fabricAllocations: [
    {
      allocationId: "legacy-a",
      fabricCode: "FAB-A",
      garmentAssignments: [legacyAssignments[0]!],
    },
    {
      allocationId: "legacy-b",
      fabricCode: "FAB-B",
      garmentAssignments: [legacyAssignments[1]!],
    },
    {
      allocationId: "legacy-c",
      fabricCode: "FAB-C",
      garmentAssignments: [legacyAssignments[2]!],
    },
    {
      allocationId: "legacy-d",
      fabricCode: "FAB-D",
      garmentAssignments: [legacyAssignments[3]!],
    },
  ],
  activeAllocationId: "legacy-d",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assert.deepEqual(planningOf(fourOrdinary, legacyState), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 4,
});
const legacyCompletion = completionOf(fourOrdinary, legacyState);
assert.equal(legacyCompletion.isComplete, false);
assert.ok(
  legacyCompletion.blockers.some(
    (blocker) => blocker.code === "FABRIC_QUANTITY_OVER_ALLOCATED",
  ),
);

let repaired = removeFutureFabricAssignment({
  state: legacyState,
  garmentKey: "base:bum_shorts",
});
repaired = removeFutureFabricAssignment({
  state: repaired,
  garmentKey: "base:standard_shorts",
});
repaired = assign(repaired, fourOrdinary, "base:standard_shorts", "FAB-A").state;
repaired = assign(repaired, fourOrdinary, "base:bum_shorts", "FAB-B").state;
assert.deepEqual(planningOf(fourOrdinary, repaired), {
  requiredGarmentCount: 4,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
assert.equal(completionOf(fourOrdinary, repaired).isComplete, true);

let additionalState = fourState;
const additionalSelection = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt", "trouser"]),
});
assert.equal(additionalSelection.status, "resolved");
if (additionalSelection.status !== "resolved") {
  throw new Error("Expected additional shirt");
}
additionalState = FabricAllocationStateEngine.attemptAppendGarment(
  additionalState,
  additionalSelection.selection,
);
assert.equal(
  additionalState.pendingFabricGarment?.garmentKey,
  "additional:shirt:1",
);
assert.equal(
  planningOf(fourOrdinary, additionalState).requiredFabricQuantity,
  2,
  "Pending Fabric without Step 4 authorization must not raise required fabric quantity.",
);
const fourSelection = createSelection(fourOrdinary);
const shirtConstruction = resolveGarmentConstructionPricing("shirt", catalog);
assert.equal(shirtConstruction.status, "resolved");
if (shirtConstruction.status !== "resolved") {
  throw new Error("Expected shirt construction pricing");
}
const authorizedOccurrences = buildAuthoritativePhysicalOccurrences({
  sourceKind: "catalogue",
  step1GarmentTypeSelection: fourSelection,
  effectiveGarmentTypeSelection: fourSelection,
  additionalGarmentConstructionState: {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:shirt:1":
        cloneGarmentConstructionPricingResolution(shirtConstruction),
    },
  },
});
assert.equal(
  getFutureGarmentFabricPlanning({
    garmentTypeSelection: fourSelection,
    fabricAllocationState: additionalState,
    requiredPhysicalOccurrences: authorizedOccurrences,
  }).requiredFabricQuantity,
  3,
  "Authorized additional garments raise fabric requirements even before assignment.",
);
assert.equal(
  canCreatePhysicalFabricAllocation({
    state: additionalState,
    garmentTypeSelection: fourSelection,
  }),
  false,
  "Legacy fabric ceiling ignores unauthorized pending garments.",
);
assert.equal(
  getFutureGarmentFabricPlanning({
    garmentTypeSelection: fourSelection,
    fabricAllocationState: additionalState,
    requiredPhysicalOccurrences: authorizedOccurrences,
  }).selectedFabricQuantity <
    getFutureGarmentFabricPlanning({
      garmentTypeSelection: fourSelection,
      fabricAllocationState: additionalState,
      requiredPhysicalOccurrences: authorizedOccurrences,
    }).requiredFabricQuantity,
  true,
  "Authorized additional garments must leave room for another fabric allocation.",
);

const twoOrdinary = ["shirt", "trouser"] satisfies FabricGarmentType[];
let twoShared = assign(empty(), twoOrdinary, "base:shirt", "FAB-A").state;
twoShared = assign(twoShared, twoOrdinary, "base:trouser", "FAB-A").state;
const twoSharedChange = assign(twoShared, twoOrdinary, "base:shirt", "FAB-B");
assert.equal(
  twoSharedChange.status,
  "assigned",
  "A full shared Shirt + Trouser allocation changes product for the whole group.",
);
assert.equal(twoSharedChange.state.fabricAllocations.length, 1);
assert.equal(
  twoSharedChange.state.fabricAllocations[0]?.fabricCode,
  "FAB-B",
);
assert.equal(
  twoSharedChange.state.fabricAllocations[0]?.garmentAssignments.length,
  2,
);
assert.equal(
  formatFabricQuantityLimitReachedCopy(2),
  "You have selected the 2 fabrics needed for this order. Use one of your selected fabrics for the remaining garments, or change a selected fabric.",
);

const mixedScreenshotTypes = [
  "full_length_gown",
  "shirt",
  "trouser",
] satisfies FabricGarmentType[];
const mixedScreenshotSelection = createSelection(mixedScreenshotTypes);
let screenshotPartial = assign(empty(), mixedScreenshotTypes, "base:full_length_gown", "FAB-A")
  .state;
screenshotPartial = assign(
  screenshotPartial,
  mixedScreenshotTypes,
  "base:shirt",
  "FAB-B",
).state;
assert.deepEqual(planningOf(mixedScreenshotTypes, screenshotPartial), {
  requiredGarmentCount: 3,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
assert.equal(completionOf(mixedScreenshotTypes, screenshotPartial).assignedGarmentCount, 2);
assert.equal(completionOf(mixedScreenshotTypes, screenshotPartial).isComplete, false);
const screenshotSummaries = getFuturePartialFabricAllocationSummaries({
  fabricAllocationState: screenshotPartial,
});
const gownSummary = screenshotSummaries.find((summary) =>
  summary.assignedGarmentKeys.includes("base:full_length_gown"),
);
const shirtSummary = screenshotSummaries.find((summary) =>
  summary.assignedGarmentKeys.includes("base:shirt"),
);
assert.ok(gownSummary);
assert.ok(shirtSummary);
assert.deepEqual(
  { usedUnits: gownSummary!.usedUnits, remainingUnits: gownSummary!.remainingUnits },
  { usedUnits: 2, remainingUnits: 0 },
);
assert.deepEqual(
  { usedUnits: shirtSummary!.usedUnits, remainingUnits: shirtSummary!.remainingUnits },
  { usedUnits: 1, remainingUnits: 1 },
);
const trouserCompatible = getFutureCompatiblePartialFabricAllocations({
  garmentTypeSelection: mixedScreenshotSelection,
  fabricAllocationState: screenshotPartial,
  garmentKey: "base:trouser",
});
assert.deepEqual(
  trouserCompatible.map((entry) => entry.allocationId),
  [shirtSummary!.allocationId],
);
assert.equal(
  hasAvoidablePartialFabricAllocation({
    garmentTypeSelection: mixedScreenshotSelection,
    fabricAllocationState: screenshotPartial,
  }),
  true,
);
assert.deepEqual(
  getFuturePartialFabricAllocationCompatibleTargets({
    garmentTypeSelection: mixedScreenshotSelection,
    fabricAllocationState: screenshotPartial,
  }).map((entry) => ({
    allocationId: entry.allocationId,
    compatibleGarmentKeys: [...entry.compatibleGarmentKeys],
  })),
  [
    {
      allocationId: shirtSummary!.allocationId,
      compatibleGarmentKeys: ["base:trouser"],
    },
  ],
);
assert.equal(
  isFutureFinalPartialFabricAllocation({
    garmentTypeSelection: mixedScreenshotSelection,
    fabricAllocationState: screenshotPartial,
    allocationId: shirtSummary!.allocationId,
  }),
  false,
);

const shirtGownTypes = ["shirt", "full_length_gown"] satisfies FabricGarmentType[];
const shirtGownSelection = createSelection(shirtGownTypes);
let shirtGownPartial = assign(empty(), shirtGownTypes, "base:shirt", "FAB-A").state;
const shirtGownSummary = getFuturePartialFabricAllocationSummaries({
  fabricAllocationState: shirtGownPartial,
}).find((summary) => summary.assignedGarmentKeys.includes("base:shirt"));
assert.ok(shirtGownSummary);
assert.equal(
  isFutureFinalPartialFabricAllocation({
    garmentTypeSelection: shirtGownSelection,
    fabricAllocationState: shirtGownPartial,
    allocationId: shirtGownSummary!.allocationId,
  }),
  false,
  "Shirt 1/2 with Gown still unassigned must not be treated as a final residual.",
);
const blockedDifferentProduct = assign(
  screenshotPartial,
  mixedScreenshotTypes,
  "base:trouser",
  "FAB-C",
);
assert.equal(blockedDifferentProduct.status, "blocked");
assert.equal(
  blockedDifferentProduct.status === "blocked"
    ? blockedDifferentProduct.reason
    : null,
  "FABRIC_QUANTITY_LIMIT_REACHED",
);
assert.equal(
  getFutureCompatiblePartialFabricAllocations({
    garmentTypeSelection: mixedScreenshotSelection,
    fabricAllocationState: screenshotPartial,
    garmentKey: "base:trouser",
  }).length,
  1,
  "Domain analysis must still expose the partial Fabric A/B allocation even when Fabric C is blocked.",
);
let screenshotComplete = assign(
  screenshotPartial,
  mixedScreenshotTypes,
  "base:trouser",
  "FAB-B",
).state;
assert.deepEqual(planningOf(mixedScreenshotTypes, screenshotComplete), {
  requiredGarmentCount: 3,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});
assert.equal(completionOf(mixedScreenshotTypes, screenshotComplete).assignedGarmentCount, 3);
assert.equal(completionOf(mixedScreenshotTypes, screenshotComplete).isComplete, true);
assert.equal(
  hasAvoidablePartialFabricAllocation({
    garmentTypeSelection: mixedScreenshotSelection,
    fabricAllocationState: screenshotComplete,
  }),
  false,
);
const completedShirtAllocation = screenshotComplete.fabricAllocations.find((allocation) =>
  allocation.garmentAssignments.some(
    (assignment) => assignment.garmentKey === "base:shirt",
  ),
);
assert.ok(completedShirtAllocation);
assert.equal(completedShirtAllocation!.garmentAssignments.length, 2);
assert.ok(
  completedShirtAllocation!.garmentAssignments.some(
    (assignment) => assignment.garmentKey === "base:trouser",
  ),
);

let shirtTrouserPartial = assign(empty(), twoOrdinary, "base:shirt", "FAB-A").state;
assert.equal(
  hasAvoidablePartialFabricAllocation({
    garmentTypeSelection: createSelection(twoOrdinary),
    fabricAllocationState: shirtTrouserPartial,
  }),
  true,
);
assert.deepEqual(
  getFutureCompatiblePartialFabricAllocations({
    garmentTypeSelection: createSelection(twoOrdinary),
    fabricAllocationState: shirtTrouserPartial,
    garmentKey: "base:trouser",
  }).map((entry) => entry.fabricCode),
  ["FAB-A"],
);
shirtTrouserPartial = assign(
  shirtTrouserPartial,
  twoOrdinary,
  "base:trouser",
  "FAB-A",
).state;
assert.equal(shirtTrouserPartial.fabricAllocations.length, 1);
assert.equal(
  getFuturePartialFabricAllocationSummaries({
    fabricAllocationState: shirtTrouserPartial,
  })[0]?.remainingUnits,
  0,
);
assert.equal(completionOf(twoOrdinary, shirtTrouserPartial).isComplete, true);

const threeOddTypes = ["shirt", "trouser", "skirt"] satisfies FabricGarmentType[];
const threeOddSelection = createSelection(threeOddTypes);
let oddResidual = assign(empty(), threeOddTypes, "base:shirt", "FAB-A").state;
oddResidual = assign(oddResidual, threeOddTypes, "base:trouser", "FAB-A").state;
oddResidual = assign(oddResidual, threeOddTypes, "base:skirt", "FAB-B").state;
assert.equal(completionOf(threeOddTypes, oddResidual).isComplete, true);
const skirtSummary = getFuturePartialFabricAllocationSummaries({
  fabricAllocationState: oddResidual,
}).find((summary) => summary.assignedGarmentKeys.includes("base:skirt"));
assert.ok(skirtSummary);
assert.equal(skirtSummary!.remainingUnits, 1);
assert.equal(
  hasAvoidablePartialFabricAllocation({
    garmentTypeSelection: threeOddSelection,
    fabricAllocationState: oddResidual,
  }),
  false,
);
assert.equal(
  isFutureFinalPartialFabricAllocation({
    garmentTypeSelection: threeOddSelection,
    fabricAllocationState: oddResidual,
    allocationId: skirtSummary!.allocationId,
  }),
  true,
);

const gownOnly = assign(empty(), ["full_length_gown"], "base:full_length_gown", "FAB-A")
  .state;
assert.deepEqual(
  getFuturePartialFabricAllocationSummaries({
    fabricAllocationState: gownOnly,
  }).filter((summary) => summary.remainingUnits > 0),
  [],
);
assert.equal(
  getFutureCompatiblePartialFabricAllocations({
    garmentTypeSelection: createSelection(["full_length_gown", "shirt"]),
    fabricAllocationState: gownOnly,
    garmentKey: "base:shirt",
  }).length,
  0,
);

const legacyPartialTargets = getFutureFabricAssignmentTargets(
  mixedScreenshotSelection,
);
const legacyPartialState = {
  fabricAllocations: [
    {
      allocationId: "legacy-gown",
      fabricCode: "FAB-A",
      garmentAssignments: [
        legacyPartialTargets.find(
          (target) => target.assignment.garmentKey === "base:full_length_gown",
        )!.assignment,
      ],
    },
    {
      allocationId: "legacy-shirt",
      fabricCode: "FAB-B",
      garmentAssignments: [
        legacyPartialTargets.find(
          (target) => target.assignment.garmentKey === "base:shirt",
        )!.assignment,
      ],
    },
  ],
  activeAllocationId: "legacy-shirt",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assert.equal(
  hasAvoidablePartialFabricAllocation({
    garmentTypeSelection: mixedScreenshotSelection,
    fabricAllocationState: legacyPartialState,
  }),
  true,
);
assert.equal(completionOf(mixedScreenshotTypes, legacyPartialState).isComplete, false);
assert.deepEqual(
  getFutureCompatiblePartialFabricAllocations({
    garmentTypeSelection: mixedScreenshotSelection,
    fabricAllocationState: legacyPartialState,
    garmentKey: "base:trouser",
  }).map((entry) => entry.allocationId),
  ["legacy-shirt"],
);

const existingAllocationResult = assignFutureGarmentToExistingFabricAllocation({
  state: screenshotPartial,
  garmentTypeSelection: mixedScreenshotSelection,
  garmentKey: "base:trouser",
  allocationId: shirtSummary!.allocationId,
});
assert.equal(existingAllocationResult.status, "assigned");
assert.equal(
  existingAllocationResult.state.fabricAllocations.find(
    (allocation) => allocation.allocationId === shirtSummary!.allocationId,
  )?.garmentAssignments.length,
  2,
);
assert.equal(
  completionOf(mixedScreenshotTypes, existingAllocationResult.state).isComplete,
  true,
);

const staleAlreadyAssigned = assignFutureGarmentToExistingFabricAllocation({
  state: existingAllocationResult.state,
  garmentTypeSelection: mixedScreenshotSelection,
  garmentKey: "base:trouser",
  allocationId: shirtSummary!.allocationId,
});
assert.equal(staleAlreadyAssigned.status, "blocked");
assert.equal(
  staleAlreadyAssigned.status === "blocked" ? staleAlreadyAssigned.reason : null,
  "GARMENT_ALREADY_ASSIGNED",
);
assert.deepEqual(
  staleAlreadyAssigned.state.fabricAllocations.map((allocation) => ({
    allocationId: allocation.allocationId,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  existingAllocationResult.state.fabricAllocations.map((allocation) => ({
    allocationId: allocation.allocationId,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
);

// H1 A–J: authorized additional Shirt fills an existing base-Shirt partial allocation.
{
  const shirtOnly = ["shirt"] satisfies FabricGarmentType[];
  const shirtSelection = createSelection(shirtOnly);
  let shirtPartialState = assign(empty(), shirtOnly, "base:shirt", "FAB-A").state;
  const shirtPartialSummary = getFuturePartialFabricAllocationSummaries({
    fabricAllocationState: shirtPartialState,
  }).find((summary) => summary.assignedGarmentKeys.includes("base:shirt"));
  assert.ok(shirtPartialSummary);
  assert.equal(shirtPartialSummary!.remainingUnits, 1);
  const shirtConstruction = resolveGarmentConstructionPricing("shirt", catalog);
  assert.equal(shirtConstruction.status, "resolved");
  if (shirtConstruction.status !== "resolved") {
    throw new Error("Expected shirt construction pricing");
  }
  const authorizedShirtOccurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: shirtSelection,
    effectiveGarmentTypeSelection: shirtSelection,
    additionalGarmentConstructionState: {
      schemaVersion: 1,
      byGarmentKey: {
        "additional:shirt:1": cloneGarmentConstructionPricingResolution(
          shirtConstruction,
        ),
      },
    },
  });
  assert.deepEqual(
    getFuturePartialFabricAllocationCompatibleTargets({
      garmentTypeSelection: shirtSelection,
      fabricAllocationState: shirtPartialState,
    }).map((entry) => ({
      allocationId: entry.allocationId,
      compatibleGarmentKeys: [...entry.compatibleGarmentKeys],
    })),
    [
      {
        allocationId: shirtPartialSummary!.allocationId,
        compatibleGarmentKeys: [],
      },
    ],
    "Without authority, additional shirts must not appear as partial targets.",
  );
  assert.deepEqual(
    getFuturePartialFabricAllocationCompatibleTargets({
      garmentTypeSelection: shirtSelection,
      fabricAllocationState: shirtPartialState,
      requiredPhysicalOccurrences: authorizedShirtOccurrences,
    }).map((entry) => ({
      allocationId: entry.allocationId,
      compatibleGarmentKeys: [...entry.compatibleGarmentKeys],
    })),
    [
      {
        allocationId: shirtPartialSummary!.allocationId,
        compatibleGarmentKeys: ["additional:shirt:1"],
      },
    ],
  );
  assert.deepEqual(
    getFutureCompatiblePartialFabricAllocations({
      garmentTypeSelection: shirtSelection,
      fabricAllocationState: shirtPartialState,
      garmentKey: "additional:shirt:1",
      requiredPhysicalOccurrences: authorizedShirtOccurrences,
    }).map((entry) => entry.allocationId),
    [shirtPartialSummary!.allocationId],
  );
  const allocationCountBefore = shirtPartialState.fabricAllocations.length;
  const stockBefore = planningOf(shirtOnly, shirtPartialState).selectedFabricQuantity;
  const assignResult = assignFutureGarmentToExistingFabricAllocation({
    state: shirtPartialState,
    garmentTypeSelection: shirtSelection,
    garmentKey: "additional:shirt:1",
    allocationId: shirtPartialSummary!.allocationId,
    requiredPhysicalOccurrences: authorizedShirtOccurrences,
  });
  assert.equal(assignResult.status, "assigned");
  assert.equal(
    assignResult.state.fabricAllocations.length,
    allocationCountBefore,
    "Filling a partial allocation must not create another physical Fabric allocation.",
  );
  assert.equal(
    planningOf(shirtOnly, assignResult.state).selectedFabricQuantity,
    stockBefore,
    "Filling a partial allocation must not consume another stock unit.",
  );
  const filledAllocation = assignResult.state.fabricAllocations.find(
    (allocation) => allocation.allocationId === shirtPartialSummary!.allocationId,
  );
  assert.deepEqual(
    filledAllocation?.garmentAssignments.map((assignment) => assignment.garmentKey).sort(),
    ["additional:shirt:1", "base:shirt"],
  );
  assert.equal(
    getFuturePartialFabricAllocationSummaries({
      fabricAllocationState: assignResult.state,
    }).find((summary) => summary.allocationId === shirtPartialSummary!.allocationId)
      ?.remainingUnits,
    0,
  );
  const authorizedCompletion = getFutureFabricStageCompletion({
    garmentTypeSelection: shirtSelection,
    fabricAllocationState: assignResult.state,
    fabrics,
    requiredPhysicalOccurrences: authorizedShirtOccurrences,
  });
  assert.equal(authorizedCompletion.requiredGarmentCount, 2);
  assert.equal(authorizedCompletion.assignedGarmentCount, 2);
  assert.equal(authorizedCompletion.isComplete, true);
}

// H1 F: Gown requiring 2 units cannot enter a 1-unit partial remainder.
{
  const shirtGownTypes = ["shirt", "full_length_gown"] satisfies FabricGarmentType[];
  const shirtGownSelection = createSelection(shirtGownTypes);
  const shirtGownPartial = assign(empty(), shirtGownTypes, "base:shirt", "FAB-A").state;
  const gownConstruction = resolveGarmentConstructionPricing(
    "full_length_gown",
    catalog,
  );
  assert.equal(gownConstruction.status, "resolved");
  if (gownConstruction.status !== "resolved") {
    throw new Error("Expected gown construction pricing");
  }
  const authorizedGownOccurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: shirtGownSelection,
    effectiveGarmentTypeSelection: shirtGownSelection,
    additionalGarmentConstructionState: {
      schemaVersion: 1,
      byGarmentKey: {
        "additional:full_length_gown:1": cloneGarmentConstructionPricingResolution(
          gownConstruction,
        ),
      },
    },
  });
  assert.deepEqual(
    getFutureCompatiblePartialFabricAllocations({
      garmentTypeSelection: shirtGownSelection,
      fabricAllocationState: shirtGownPartial,
      garmentKey: "additional:full_length_gown:1",
      requiredPhysicalOccurrences: authorizedGownOccurrences,
    }),
    [],
  );
}

// H1 G: orphan Fabric assignments are not partial-capacity targets.
{
  const shirtOnly = ["shirt"] satisfies FabricGarmentType[];
  const shirtSelection = createSelection(shirtOnly);
  const shirtPartialBase = assign(empty(), shirtOnly, "base:shirt", "FAB-A").state;
  const shirtPartialSummary = getFuturePartialFabricAllocationSummaries({
    fabricAllocationState: shirtPartialBase,
  }).find((summary) => summary.assignedGarmentKeys.includes("base:shirt"));
  assert.ok(shirtPartialSummary);
  const orphanState = {
    ...shirtPartialBase,
    fabricAllocations: [
      ...shirtPartialBase.fabricAllocations,
      {
        allocationId: "orphan-allocation",
        fabricCode: "FAB-B",
        garmentAssignments: [
          {
            garmentKey: "additional:full_length_gown:99",
            code: "ADDITIONAL_GOWN",
            garmentType: "full_length_gown",
            fabricUnits: 2,
            sourceRole: "additional",
          } satisfies FabricGarmentAssignment,
        ],
      },
    ],
  };
  const shirtConstruction = resolveGarmentConstructionPricing("shirt", catalog);
  assert.equal(shirtConstruction.status, "resolved");
  if (shirtConstruction.status !== "resolved") {
    throw new Error("Expected shirt construction pricing");
  }
  const authoritativeOnlyBase = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: shirtSelection,
    effectiveGarmentTypeSelection: shirtSelection,
    additionalGarmentConstructionState: {
      schemaVersion: 1,
      byGarmentKey: {
        "additional:shirt:1": cloneGarmentConstructionPricingResolution(
          shirtConstruction,
        ),
      },
    },
  });
  const compatibleTargets = getFuturePartialFabricAllocationCompatibleTargets({
    garmentTypeSelection: shirtSelection,
    fabricAllocationState: orphanState,
    requiredPhysicalOccurrences: authoritativeOnlyBase,
  });
  const shirtPartialTargets = compatibleTargets.find(
    (entry) => entry.allocationId === shirtPartialSummary!.allocationId,
  );
  assert.deepEqual(shirtPartialTargets?.compatibleGarmentKeys, ["additional:shirt:1"]);
  assert.equal(
    compatibleTargets.flatMap((entry) => entry.compatibleGarmentKeys).includes(
      "additional:full_length_gown:99",
    ),
    false,
    "Orphan Fabric rows must not broaden partial-capacity targets.",
  );
}

// H1 H: final residual remains only when no authoritative compatible target remains.
{
  const threeOddSelection = createSelection(["shirt", "trouser", "skirt"]);
  let oddResidual = assign(empty(), ["shirt", "trouser", "skirt"], "base:shirt", "FAB-A").state;
  oddResidual = assign(oddResidual, ["shirt", "trouser", "skirt"], "base:trouser", "FAB-A").state;
  oddResidual = assign(oddResidual, ["shirt", "trouser", "skirt"], "base:skirt", "FAB-B").state;
  const skirtSummary = getFuturePartialFabricAllocationSummaries({
    fabricAllocationState: oddResidual,
  }).find((summary) => summary.assignedGarmentKeys.includes("base:skirt"));
  assert.ok(skirtSummary);
  assert.equal(
    isFutureFinalPartialFabricAllocation({
      garmentTypeSelection: threeOddSelection,
      fabricAllocationState: oddResidual,
      allocationId: skirtSummary!.allocationId,
      requiredPhysicalOccurrences: buildAuthoritativePhysicalOccurrences({
        sourceKind: "catalogue",
        step1GarmentTypeSelection: threeOddSelection,
        effectiveGarmentTypeSelection: threeOddSelection,
      }),
    }),
    true,
  );
}

console.log("test_step2_fabric_allocation_limit: ok");
