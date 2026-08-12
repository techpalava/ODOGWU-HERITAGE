import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import {
  applyLegacyStyleFabricCapacityConfig,
  createStyleBaseGarmentSpec,
  getStyleBaseFabricGarmentSelections,
} from "./src/config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type {
  CustomDetailOption,
  FabricAllocationState,
  StyleCategory,
} from "./src/types";
import {
  getRequiredCustomDetailGroups,
  getSupportedCustomDetailGroups,
  groupApplicableCustomDetails,
} from "./src/utils/catalogHelpers";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { transitionCustomDetailPhysicalGarment } from "./src/utils/fabricGarmentAppendFlow";
import { reconcileAdditionalGarmentDependencies } from "./src/utils/additionalGarmentDomain";
import { resolveShippingGarmentPieceCount } from "./src/utils/shippingPricing";

const baseStyle: StyleCategory = {
  id: "casual-native-1",
  name: "Casual Native",
  description: "Configured shirt and trouser design.",
  gender: "male",
  options: [],
  customDetailConfig: {
    representedGenders: ["male"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: ["shirt", "neck", "trousers"],
    requiredSelectionGroups: [
      "shirt_construction",
      "shirt_pockets",
      "neck_design",
      "trouser_fastening",
      "trouser_pockets",
    ],
    enabled: true,
  },
};
const casualNative = applyLegacyStyleFabricCapacityConfig(baseStyle);
const baseSelections = getStyleBaseFabricGarmentSelections(casualNative);
assert.deepEqual(
  baseSelections.map((selection) => selection.garmentSpec?.garmentType),
  ["shirt", "trouser"],
  "Casual Native must resolve its configured base shirt and trouser",
);
assert.deepEqual(
  getSupportedCustomDetailGroups(casualNative, { code: "EXACT" }),
  ["shirt", "neck", "trousers"],
  "Base composition must activate shirt, neck, and trouser details",
);
assert.ok(
  groupApplicableCustomDetails(
    casualNative,
    SEED_CUSTOM_DETAIL_CATALOG,
    { code: "EXACT" },
    { customDetails: {} },
  ).some((group) => group.id === "additional_physical_garment"),
  "Custom Details must expose the structured additional-garment group",
);

const getOption = (id: string): CustomDetailOption => {
  const option = SEED_CUSTOM_DETAIL_CATALOG.find(
    (candidate) => candidate.id === id,
  );
  assert.ok(option, `Expected Custom Detail option ${id}`);
  return option;
};
const bumShorts = getOption("additional_garment_bum_shorts");
const skirt = getOption("additional_garment_skirt");
const kaftan = getOption("additional_garment_kaftan");
const ordinaryNeckDetail = getOption("neck_no_round");
const primaryFabricCode = "ODG-PRIMARY";

const syncBase = (
  style: StyleCategory,
  fabricCode = primaryFabricCode,
): FabricAllocationState =>
  FabricAllocationStateEngine.syncPrimaryGarmentComposition(
    FabricAllocationStateEngine.initialize(),
    fabricCode,
    getStyleBaseFabricGarmentSelections(style),
  );

const getPieceCount = (state: FabricAllocationState): number =>
  resolveShippingGarmentPieceCount({
    fabricAllocations: state.fabricAllocations,
  });

let state = syncBase(casualNative);
assert.equal(state.fabricAllocations.length, 1);
assert.deepEqual(
  state.fabricAllocations[0]?.garmentAssignments.map(
    (assignment) => assignment.garmentType,
  ),
  ["shirt", "trouser"],
);
assert.equal(state.pendingFabricGarment, null);
assert.equal(getPieceCount(state), 2);

const overflow = transitionCustomDetailPhysicalGarment({
  state,
  fabricCode: primaryFabricCode,
  nextOption: bumShorts,
});
assert.equal(overflow.status, "pending");
assert.equal(overflow.state.pendingFabricGarment?.garmentType, "bum_shorts");
assert.equal(overflow.state.fabricAllocations.length, 1);
assert.equal(getPieceCount(overflow.state), 2);

assert.deepEqual(
  getRequiredCustomDetailGroups(
    casualNative,
    SEED_CUSTOM_DETAIL_CATALOG,
    { code: "EXACT" },
    {
      customDetails: {
        additional_physical_garment: bumShorts.id,
      },
    },
  ).filter((groupId) => groupId.startsWith("bum_shorts_")),
  ["bum_shorts_fastening", "bum_shorts_pockets"],
  "an added physical garment must require its priced construction choices",
);

const sameFabricState =
  FabricAllocationStateEngine.useSameFabricForPendingGarment(overflow.state);
assert.equal(sameFabricState.fabricAllocations.length, 2);
assert.notEqual(
  sameFabricState.fabricAllocations[0]?.allocationId,
  sameFabricState.fabricAllocations[1]?.allocationId,
);
assert.equal(
  sameFabricState.fabricAllocations[0]?.fabricCode,
  sameFabricState.fabricAllocations[1]?.fabricCode,
);
assert.deepEqual(
  sameFabricState.fabricAllocations[1]?.garmentAssignments.map(
    (assignment) => assignment.garmentType,
  ),
  ["bum_shorts"],
);
assert.equal(getPieceCount(sameFabricState), 3);

const materialPricing = resolveFabricAllocationMaterialPricing(
  sameFabricState.fabricAllocations,
  [
    {
      code: primaryFabricCode,
      name: "Royal Forest Mosaic",
      category: "HiTarget Ankara",
      price: 3.91,
    } as any,
  ],
);
assert.equal(materialPricing.status, "resolved");
if (materialPricing.status === "resolved") {
  assert.equal(materialPricing.allocationCount, 2);
  assert.equal(materialPricing.allocationLines.length, 2);
  assert.equal(materialPricing.totalMaterialPrice, 7.82);
}

const anotherFabricPending =
  FabricAllocationStateEngine.beginChooseAnotherFabric(overflow.state);
const anotherFabricState =
  FabricAllocationStateEngine.assignPendingGarmentToFabric(
    anotherFabricPending,
    "ODG-SECONDARY",
  );
assert.equal(anotherFabricState.fabricAllocations.length, 2);
assert.equal(
  anotherFabricState.fabricAllocations[0]?.fabricCode,
  primaryFabricCode,
);
assert.equal(
  anotherFabricState.fabricAllocations[1]?.fabricCode,
  "ODG-SECONDARY",
);

const cancelledState = FabricAllocationStateEngine.cancelPendingGarment(
  overflow.state,
);
assert.equal(cancelledState.pendingFabricGarment, null);
assert.equal(cancelledState.fabricAllocations.length, 1);
assert.equal(getPieceCount(cancelledState), 2);

const shirtOnlyStyle: StyleCategory = {
  ...baseStyle,
  id: "test-shirt-only",
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
};
const shirtOnlyState = syncBase(shirtOnlyStyle);
const availableCapacity = transitionCustomDetailPhysicalGarment({
  state: shirtOnlyState,
  fabricCode: primaryFabricCode,
  nextOption: bumShorts,
});
assert.equal(availableCapacity.status, "selected");
assert.equal(availableCapacity.state.pendingFabricGarment, null);
assert.deepEqual(
  availableCapacity.state.fabricAllocations[0]?.garmentAssignments.map(
    (assignment) => assignment.garmentType,
  ),
  ["shirt", "bum_shorts"],
);

const replaced = transitionCustomDetailPhysicalGarment({
  state: sameFabricState,
  fabricCode: primaryFabricCode,
  previousOption: bumShorts,
  nextOption: skirt,
});
assert.equal(replaced.status, "selected");
assert.deepEqual(
  replaced.state.fabricAllocations[1]?.garmentAssignments.map(
    (assignment) => assignment.garmentType,
  ),
  ["skirt"],
);
assert.equal(
  replaced.state.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ).some((assignment) => assignment.garmentType === "bum_shorts"),
  false,
);

const removed = transitionCustomDetailPhysicalGarment({
  state: sameFabricState,
  fabricCode: primaryFabricCode,
  previousOption: bumShorts,
  nextOption: null,
});
assert.equal(removed.status, "removed");
assert.equal(removed.state.fabricAllocations.length, 1);
assert.equal(getPieceCount(removed.state), 2);

const capacityChangingReplacement = transitionCustomDetailPhysicalGarment({
  state: availableCapacity.state,
  fabricCode: primaryFabricCode,
  previousOption: bumShorts,
  nextOption: kaftan,
});
assert.equal(capacityChangingReplacement.status, "pending");
assert.equal(
  capacityChangingReplacement.state.pendingFabricGarment?.garmentType,
  "kaftan",
);

const ordinaryDetailTransition = transitionCustomDetailPhysicalGarment({
  state,
  fabricCode: primaryFabricCode,
  nextOption: ordinaryNeckDetail,
});
assert.equal(ordinaryDetailTransition.status, "unchanged");
assert.deepEqual(ordinaryDetailTransition.state, state);

const dressStyle: StyleCategory = {
  ...baseStyle,
  id: "test-dress-style",
  gender: "female",
  fabricCapacityComposition: [createStyleBaseGarmentSpec("dress")],
};
const replacedStyleState = reconcileAdditionalGarmentDependencies(
  FabricAllocationStateEngine.syncPrimaryGarmentComposition(
    sameFabricState,
    primaryFabricCode,
    getStyleBaseFabricGarmentSelections(dressStyle),
  ),
  [createStyleBaseGarmentSpec("dress")],
);
assert.equal(replacedStyleState.fabricAllocations.length, 2);
assert.deepEqual(
  replacedStyleState.fabricAllocations[0]?.garmentAssignments.map(
    (assignment) => assignment.garmentType,
  ),
  ["dress"],
);
assert.equal(
  replacedStyleState.fabricAllocations[1]?.garmentAssignments[0]
    ?.dependencyStatus,
  "orphaned",
  "A changed style preserves the extra garment for review instead of silently dropping it",
);

const primaryFabricReplacement =
  FabricAllocationStateEngine.syncPrimaryGarmentComposition(
    sameFabricState,
    "ODG-REPLACEMENT",
    baseSelections,
  );
assert.equal(primaryFabricReplacement.fabricAllocations.length, 2);
assert.equal(
  primaryFabricReplacement.fabricAllocations[0]?.fabricCode,
  "ODG-REPLACEMENT",
);
assert.equal(
  primaryFabricReplacement.fabricAllocations[1]?.fabricCode,
  primaryFabricCode,
);

const designStudioSource = readFileSync(
  fileURLToPath(
    new URL("./src/components/DesignStudioView.tsx", import.meta.url),
  ),
  "utf8",
);
assert.doesNotMatch(
  designStudioSource,
  /onPhysicalGarmentOptionChange/,
  "The retired custom-detail radio handler must not remain active",
);
assert.match(
  designStudioSource,
  /handleAddAdditionalGarment[\s\S]*?createAdditionalGarmentSelection[\s\S]*?appendCustomerFabricGarment/,
  "The UI-facing additional garment composer must route through centralized orchestration",
);
assert.match(
  designStudioSource,
  /onAddAdditionalGarment=\{handleAddAdditionalGarment\}/,
  "The rendered selector must receive the allocation-aware composer handler",
);

console.log(
  "PASS: Additional garment composition uses style base composition and centralized allocation transitions",
);
