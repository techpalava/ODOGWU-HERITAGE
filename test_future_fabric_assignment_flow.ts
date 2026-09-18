import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { DormantFutureFabricStep } from "./src/components/DormantFutureFabricStep";
import {
  FutureRemainingFabricCapacityOfferCard,
  FutureRemainingFabricCapacityOfferPrompt,
  REMAINING_FABRIC_CAPACITY_OFFER_ADD_GARMENT,
  REMAINING_FABRIC_CAPACITY_OFFER_BODY,
  REMAINING_FABRIC_CAPACITY_OFFER_TITLE,
  resolveRemainingFabricCapacityOfferPresentation,
  resolveRemainingFabricCapacityReturnStage,
} from "./src/components/FutureRemainingFabricCapacityOffer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricGarmentType } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  applyFutureFabricCardSelection,
  assignSameFabricProductToGarments,
  cancelFutureFabricCatalogueAssignment,
  getFutureFabricAssignmentTargets,
  getFutureFabricCapacityOffer,
  getFutureRemainingFabricCapacityOffers,
  getRemainingFabricCapacityOfferSignature,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  reconcileFutureFabricAllocationState,
  removeFutureFabricAssignment,
  resolveFutureFabricCatalogueCardPresentation,
  getFutureFabricCatalogueCancelTargets,
} from "./src/utils/designStudioFutureFabricStage";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { createCatalogueAdditionalGarmentSelection, projectCatalogueStep1PhysicalOccurrences } from "./src/utils/additionalGarmentDomain";
import { cloneFabricAllocations } from "./src/utils/fabricAllocationPersistence";
import { buildAuthoritativePhysicalOccurrences } from "./src/utils/designSourceState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import {
  cloneGarmentConstructionPricingResolution,
} from "./src/utils/additionalGarmentConstructionState";

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
  price: number | undefined,
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
  price,
});
const fabrics = [
  createFabric("FAB-A", "Fabric A", 10),
  createFabric("FAB-B", "Fabric B", 20),
  createFabric("FAB-C", "Fabric C", 30),
];
const commitSameFabric = (
  args: Parameters<typeof assignSameFabricProductToGarments>[0],
) => {
  const result = assignSameFabricProductToGarments(args);
  assert.equal(
    result.status,
    "assigned",
    result.status === "blocked" ? result.reason : "",
  );
  return result.state;
};
const commitCatalogueCancel = (
  args: Parameters<typeof cancelFutureFabricCatalogueAssignment>[0],
) => {
  const result = cancelFutureFabricCatalogueAssignment(args);
  assert.equal(
    result.status,
    "cancelled",
    result.status === "blocked" ? result.reason : "",
  );
  return result.state;
};

let customerCardState = FabricAllocationStateEngine.initialize();
customerCardState = applyFutureFabricCardSelection({
  state: customerCardState,
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
});
assert.deepEqual(
  customerCardState.fabricAllocations[0]?.garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
  "The UI-facing card orchestration must assign only the clicked garment on the first selection.",
);
customerCardState = commitSameFabric({
  state: customerCardState,
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
assert.deepEqual(
  customerCardState.fabricAllocations[0]?.garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt", "base:trouser"],
  "Bulk same-product assignment must route remaining garments through the shared allocation engine.",
);
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    fabricAllocationState: customerCardState,
    fabrics,
  }).isComplete,
  true,
);
customerCardState = applyFutureFabricCardSelection({
  state: customerCardState,
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  garmentKey: "base:shirt",
  fabricCode: "FAB-B",
  fabrics,
});
assert.deepEqual(
  customerCardState.fabricAllocations.map((allocation) => ({
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [{ fabricCode: "FAB-B", garmentKeys: ["base:shirt", "base:trouser"] }],
  "Changing Fabric for a shared Shirt + Trouser allocation replaces the whole physical group.",
);
const assign = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
  garmentTypes: FabricGarmentType[],
  garmentKey: string,
  fabricCode: string,
) => {
  const result = assignFutureFabricToGarment({
    state,
    garmentTypeSelection: createSelection(garmentTypes),
    garmentKey,
    fabricCode,
    fabrics,
  });
  assert.equal(result.status, "assigned");
  return result.state;
};

const threeRegular = ["shirt", "trouser", "skirt"] satisfies FabricGarmentType[];
let shared = assign(
  FabricAllocationStateEngine.initialize(),
  threeRegular,
  "base:shirt",
  "FAB-A",
);
assert.equal(shared.fabricAllocations.length, 1);
assert.equal(
  getFutureFabricCapacityOffer({
    garmentTypeSelection: createSelection(threeRegular),
    fabricAllocationState: shared,
  })?.target.assignment.garmentKey,
  "base:trouser",
);
shared = assign(shared, threeRegular, "base:trouser", "FAB-A");
assert.equal(shared.fabricAllocations.length, 1);
assert.deepEqual(
  shared.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt", "base:trouser"],
);
assert.equal(
  getFutureFabricCapacityOffer({
    garmentTypeSelection: createSelection(threeRegular),
    fabricAllocationState: shared,
  }),
  null,
  "A full active allocation must not offer another garment.",
);

// The restored offer is only for a completed current Fabric stage. It is
// allocation-scoped and leaves the existing Additional Garment domain to the
// caller that supplies eligibility.
const completedHalfCapacityState = assign(
  FabricAllocationStateEngine.initialize(),
  ["shirt"],
  "base:shirt",
  "FAB-A",
);
const completedHalfCapacityCompletion = getFutureFabricStageCompletion({
  garmentTypeSelection: createSelection(["shirt"]),
  fabricAllocationState: completedHalfCapacityState,
  fabrics,
});
assert.equal(completedHalfCapacityCompletion.isComplete, true);
const completedHalfCapacityOffers = getFutureRemainingFabricCapacityOffers({
  fabricAllocationState: completedHalfCapacityState,
  fabricStageComplete: completedHalfCapacityCompletion.isComplete,
  hasEligibleHalfCapacityAdditionalGarment: true,
});
assert.equal(completedHalfCapacityOffers.length, 1);
assert.equal(completedHalfCapacityOffers[0].fabricCode, "FAB-A");
assert.equal(completedHalfCapacityOffers[0].remainingUnits, 1);
assert.equal(
  getFutureRemainingFabricCapacityOffers({
    fabricAllocationState: completedHalfCapacityState,
    fabricStageComplete: completedHalfCapacityCompletion.isComplete,
    hasEligibleHalfCapacityAdditionalGarment: false,
  }).length,
  0,
  "the offer must remain hidden when the existing Additional Garment domain has no eligible half-capacity choice",
);
assert.equal(
  getFutureRemainingFabricCapacityOffers({
    fabricAllocationState: shared,
    fabricStageComplete: false,
    hasEligibleHalfCapacityAdditionalGarment: true,
  }).length,
  0,
  "unassigned current garments must suppress the optional capacity offer",
);
assert.equal(
  getFutureRemainingFabricCapacityOffers({
    fabricAllocationState: customerCardState,
    fabricStageComplete: true,
    hasEligibleHalfCapacityAdditionalGarment: true,
  }).length,
  0,
  "a full two-half allocation must not offer another garment",
);

const gownCapacityState = assign(
  FabricAllocationStateEngine.initialize(),
  ["full_length_gown"],
  "base:full_length_gown",
  "FAB-A",
);
assert.equal(
  getFutureRemainingFabricCapacityOffers({
    fabricAllocationState: gownCapacityState,
    fabricStageComplete:
      getFutureFabricStageCompletion({
        garmentTypeSelection: createSelection(["full_length_gown"]),
        fabricAllocationState: gownCapacityState,
        fabrics,
      }).isComplete,
    hasEligibleHalfCapacityAdditionalGarment: true,
  }).length,
  0,
  "a full-capacity Long Dress must not create a half-capacity offer",
);

// Deliberately separate half Fabrics complete the stage and are charged once each.
const twoGarmentSelection = createSelection(["shirt", "trouser"]);
const firstHalfState = assign(FabricAllocationStateEngine.initialize(), ["shirt", "trouser"], "base:shirt", "FAB-A");
const firstHalfCompletion = getFutureFabricStageCompletion({ garmentTypeSelection: twoGarmentSelection, fabricAllocationState: firstHalfState, fabrics });
assert.equal(firstHalfCompletion.isComplete, false);
assert.deepEqual(getFutureRemainingFabricCapacityOffers({ fabricAllocationState: firstHalfState, fabricStageComplete: firstHalfCompletion.isComplete, hasEligibleHalfCapacityAdditionalGarment: true }), []);
const separateHalvesState = assign(firstHalfState, ["shirt", "trouser"], "base:trouser", "FAB-B");
const separateHalvesCompletion = getFutureFabricStageCompletion({ garmentTypeSelection: twoGarmentSelection, fabricAllocationState: separateHalvesState, fabrics });
assert.equal(separateHalvesCompletion.isComplete, true);
assert.deepEqual(separateHalvesCompletion.blockers, []);
assert.equal(separateHalvesState.fabricAllocations.length, 2);
const separateHalvesPricing = resolveFabricAllocationMaterialPricing(separateHalvesState.fabricAllocations, fabrics);
assert.equal(separateHalvesPricing.status, "resolved");
if (separateHalvesPricing.status !== "resolved") throw new Error("Expected material pricing");
assert.equal(separateHalvesPricing.allocationCount, 2);
assert.equal(separateHalvesPricing.totalMaterialPrice, 30);
const combinedCapacityOffers = getFutureRemainingFabricCapacityOffers({ fabricAllocationState: separateHalvesState, fabricStageComplete: separateHalvesCompletion.isComplete, hasEligibleHalfCapacityAdditionalGarment: true });
assert.deepEqual(combinedCapacityOffers.map((offer) => offer.fabricCode), ["FAB-A", "FAB-B"]);
const combinedSignature = getRemainingFabricCapacityOfferSignature(combinedCapacityOffers);
const dismissedSignatures = new Set([combinedSignature]);
assert.equal(dismissedSignatures.has(getRemainingFabricCapacityOfferSignature([...combinedCapacityOffers].reverse())), true);
assert.equal(dismissedSignatures.has(getRemainingFabricCapacityOfferSignature(combinedCapacityOffers.slice(1))), false);
assert.notEqual(combinedSignature, getRemainingFabricCapacityOfferSignature(combinedCapacityOffers.map((offer) => ({ ...offer, fabricCode: "FAB-C" }))));
assert.equal(getRemainingFabricCapacityOfferSignature([]), "");
for (const malformedState of [
  { ...separateHalvesState, fabricAllocations: [...separateHalvesState.fabricAllocations, separateHalvesState.fabricAllocations[0]] },
  { ...separateHalvesState, fabricAllocations: separateHalvesState.fabricAllocations.map((allocation) => ({ ...allocation, allocationId: "duplicate-id" })) },
]) {
  const completion = getFutureFabricStageCompletion({ garmentTypeSelection: twoGarmentSelection, fabricAllocationState: malformedState, fabrics });
  assert.equal(completion.isComplete, false);
  assert.ok(completion.blockers.some((blocker) => blocker.code === "MALFORMED_ASSIGNMENT"));
}

let capacityOfferDismissals = 0;
let capacityOfferContinues = 0;
let selectedCapacityOfferGarment: FabricGarmentType | null = null;
let selectedCapacityOfferAllocationId: string | null = null;
let capacityOfferRenderer!: ReturnType<typeof create>;
act(() => {
  capacityOfferRenderer = create(
    createElement(FutureRemainingFabricCapacityOfferCard, {
      offers: combinedCapacityOffers,
      fabrics,
      eligibleGarmentTypes: ["trouser"],
      onAddAdditionalGarment: (garmentType, allocationId) => {
        selectedCapacityOfferGarment = garmentType;
        selectedCapacityOfferAllocationId = allocationId;
      },
      onContinue: () => {
        capacityOfferContinues += 1;
      },
      onDismiss: () => {
        capacityOfferDismissals += 1;
      },
    }),
  );
});
assert.match(
  capacityOfferRenderer.toJSON() ? JSON.stringify(capacityOfferRenderer.toJSON()) : "",
  /UNUSED FABRIC CAPACITY AVAILABLE/,
);
assert.equal(capacityOfferRenderer.root.findAllByProps({ role: "dialog" }).length, 1);
assert.equal(capacityOfferRenderer.root.findAllByType("li").length, 2);
assert.match(JSON.stringify(capacityOfferRenderer.toJSON()), /Fabric A/);
assert.match(JSON.stringify(capacityOfferRenderer.toJSON()), /Fabric B/);
assert.equal(
  capacityOfferRenderer.root.findAllByProps({
    "data-testid": "remaining-fabric-capacity-offer-selector",
  }).length,
  0,
  "Garment buttons must not appear until a Fabric-specific Add Garment action.",
);
assert.equal(
  capacityOfferRenderer.root.findAllByProps({
    "data-testid": `remaining-fabric-capacity-offer-add-${combinedCapacityOffers[0].allocationId}`,
  }).length,
  1,
);
assert.equal(
  capacityOfferRenderer.root.findAllByProps({
    "data-testid": `remaining-fabric-capacity-offer-add-${combinedCapacityOffers[1].allocationId}`,
  }).length,
  1,
);
assert.equal(
  capacityOfferRenderer.root.findAllByProps({
    "data-testid": "remaining-fabric-capacity-offer-select-trouser",
  }).length,
  0,
  "The root leftover-capacity modal must not show a global garment chooser.",
);
act(() => {
  capacityOfferRenderer.root
    .findByProps({ "data-testid": "remaining-fabric-capacity-offer-decline" })
    .props.onClick();
});
assert.equal(capacityOfferContinues, 1);
act(() => {
  capacityOfferRenderer.root
    .findByProps({
      "data-testid": `remaining-fabric-capacity-offer-add-${combinedCapacityOffers[0].allocationId}`,
    })
    .props.onClick();
});
assert.equal(
  capacityOfferRenderer.root.findAllByProps({
    "data-testid": "remaining-fabric-capacity-offer-selector",
  }).length,
  1,
  "Add Garment must open the garment chooser for that exact Fabric.",
);
assert.equal(
  capacityOfferRenderer.root.findByProps({
    "data-testid": "remaining-fabric-capacity-offer-chooser-fabric",
  }).children.join(""),
  "Fabric A",
  "The chooser must name the locked Fabric.",
);
assert.equal(
  capacityOfferRenderer.root.findByProps({
    "data-testid": "remaining-fabric-capacity-offer-chooser-heading",
  }).children.join(""),
  "Adding garment to Fabric A",
);
assert.equal(
  capacityOfferRenderer.root.findByProps({
    "data-testid": "remaining-fabric-capacity-offer-chooser-instruction",
  }).children.join(""),
  "Choose a garment to use with Fabric A.",
);
assert.equal(
  capacityOfferRenderer.root.findByProps({
    "data-testid": "remaining-fabric-capacity-offer-selector",
  }).props["data-fabric-capacity-offer-allocation-id"],
  combinedCapacityOffers[0].allocationId,
);
assert.equal(
  capacityOfferRenderer.root.findAllByProps({
    "data-testid": `remaining-fabric-capacity-offer-add-${combinedCapacityOffers[1].allocationId}`,
  }).length,
  0,
  "The chooser must hide the other Fabric Add Garment actions.",
);
act(() => {
  capacityOfferRenderer.root
    .findByProps({
      "data-testid": "remaining-fabric-capacity-offer-select-trouser",
    })
    .props.onClick();
});
assert.equal(selectedCapacityOfferGarment, "trouser");
assert.equal(
  selectedCapacityOfferAllocationId,
  combinedCapacityOffers[0].allocationId,
  "the selected garment must retain the specific physical Fabric allocation",
);
assert.doesNotMatch(
  JSON.stringify(capacityOfferRenderer.toJSON()),
  /Add Garment Using This Fabric/,
  "The redundant generic capacity CTA must not render.",
);
act(() => {
  capacityOfferRenderer.root
    .findByProps({ "data-testid": "remaining-fabric-capacity-offer-back" })
    .props.onClick();
});
assert.equal(
  capacityOfferRenderer.root.findAllByProps({
    "data-testid": "remaining-fabric-capacity-offer-selector",
  }).length,
  0,
  "Back must return to the capacity-offer list.",
);
assert.equal(
  capacityOfferRenderer.root.findAllByType("li").length,
  2,
  "Back must keep every leftover Fabric offer.",
);
assert.equal(
  selectedCapacityOfferGarment,
  "trouser",
  "Back must not create another garment occurrence.",
);
assert.equal(
  capacityOfferRenderer.root.findAllByProps({
    "data-testid": `remaining-fabric-capacity-offer-add-${combinedCapacityOffers[0].allocationId}`,
  }).length,
  1,
);
assert.equal(
  capacityOfferRenderer.root.findAllByProps({
    "data-testid": `remaining-fabric-capacity-offer-add-${combinedCapacityOffers[1].allocationId}`,
  }).length,
  1,
);
act(() => {
  capacityOfferRenderer.root
    .findByProps({
      "data-testid": `remaining-fabric-capacity-offer-add-${combinedCapacityOffers[1].allocationId}`,
    })
    .props.onClick();
});
assert.equal(
  capacityOfferRenderer.root.findByProps({
    "data-testid": "remaining-fabric-capacity-offer-chooser-fabric",
  }).children.join(""),
  "Fabric B",
  "Add Garment on the second Fabric must lock that Fabric, not the first offer.",
);
assert.equal(
  capacityOfferRenderer.root.findByProps({
    "data-testid": "remaining-fabric-capacity-offer-chooser-instruction",
  }).children.join(""),
  "Choose a garment to use with Fabric B.",
);
assert.equal(
  capacityOfferRenderer.root.findByProps({
    "data-testid": "remaining-fabric-capacity-offer-selector",
  }).props["data-fabric-capacity-offer-allocation-id"],
  combinedCapacityOffers[1].allocationId,
);
act(() => {
  capacityOfferRenderer.root
    .findByProps({
      "data-testid": "remaining-fabric-capacity-offer-select-trouser",
    })
    .props.onClick();
});
assert.equal(
  selectedCapacityOfferAllocationId,
  combinedCapacityOffers[1].allocationId,
  "Selecting another Fabric Add Garment must retain that exact physical allocation.",
);
act(() => {
  capacityOfferRenderer.root
    .findByProps({ "aria-label": "Dismiss fabric capacity suggestion" })
    .props.onClick();
});
assert.equal(capacityOfferDismissals, 1);
act(() => capacityOfferRenderer.unmount());

assert.deepEqual(
  resolveRemainingFabricCapacityOfferPresentation({
    stageId: "fabric",
    offerExists: true,
    offerDismissed: false,
    requested: false,
  }),
  { showPrompt: false, showModal: true },
  "Fabric still auto-opens the leftover-capacity modal.",
);
assert.deepEqual(
  resolveRemainingFabricCapacityOfferPresentation({
    stageId: "fabric",
    offerExists: true,
    offerDismissed: true,
    requested: true,
  }),
  { showPrompt: false, showModal: false },
  "A dismissed Fabric offer must not auto-open again in the same session.",
);
for (const laterStage of ["design_style", "custom_details", "personalized_additions"] as const) {
  assert.deepEqual(
    resolveRemainingFabricCapacityOfferPresentation({
      stageId: laterStage,
      offerExists: true,
      offerDismissed: false,
      requested: false,
    }),
    { showPrompt: true, showModal: false },
    `${laterStage} must show a non-blocking prompt instead of auto-opening the modal.`,
  );
  assert.deepEqual(
    resolveRemainingFabricCapacityOfferPresentation({
      stageId: laterStage,
      offerExists: true,
      offerDismissed: true,
      requested: false,
    }),
    { showPrompt: true, showModal: false },
    `${laterStage} must keep leftover capacity discoverable after modal dismissal.`,
  );
  assert.deepEqual(
    resolveRemainingFabricCapacityOfferPresentation({
      stageId: laterStage,
      offerExists: true,
      offerDismissed: true,
      requested: true,
    }),
    { showPrompt: true, showModal: true },
    `${laterStage} may open the existing leftover-capacity flow only after an explicit request.`,
  );
  assert.deepEqual(
    resolveRemainingFabricCapacityOfferPresentation({
      stageId: laterStage,
      offerExists: false,
      offerDismissed: false,
      requested: true,
    }),
    { showPrompt: false, showModal: false },
    `${laterStage} must not keep a stale leftover-capacity prompt once capacity is gone.`,
  );
  assert.equal(
    resolveRemainingFabricCapacityReturnStage(laterStage),
    laterStage,
    `${laterStage} leftover-capacity acceptance must stay on that stage.`,
  );
}
assert.equal(resolveRemainingFabricCapacityReturnStage("fabric"), "fabric");
assert.deepEqual(
  resolveRemainingFabricCapacityOfferPresentation({
    stageId: "try_on",
    offerExists: true,
    offerDismissed: false,
    requested: true,
  }),
  { showPrompt: false, showModal: false },
  "Try-On is not a leftover-capacity presentation surface.",
);

const stockOneHalfOffers = getFutureRemainingFabricCapacityOffers({
  fabricAllocationState: completedHalfCapacityState,
  fabricStageComplete: true,
  hasEligibleHalfCapacityAdditionalGarment: true,
});
assert.equal(stockOneHalfOffers.length, 1);
assert.equal(
  getFutureRemainingFabricCapacityOffers({
    fabricAllocationState: {
      ...completedHalfCapacityState,
      fabricAllocations: completedHalfCapacityState.fabricAllocations.map(
        (allocation) => ({ ...allocation, fabricCode: "STOCK-ONE" }),
      ),
    },
    fabricStageComplete: true,
    hasEligibleHalfCapacityAdditionalGarment: true,
  }).length,
  1,
  "A stock count of 1 must not suppress leftover capacity that still exists on the assigned Fabric unit.",
);

let laterStagePromptOpens: string[] = [];
let laterStagePromptRenderer!: ReturnType<typeof create>;
act(() => {
  laterStagePromptRenderer = create(
    createElement(FutureRemainingFabricCapacityOfferPrompt, {
      offers: combinedCapacityOffers,
      fabrics,
      onAddGarment: (allocationId) => {
        laterStagePromptOpens.push(allocationId);
      },
    }),
  );
});
assert.equal(
  laterStagePromptRenderer.root.findAllByProps({ role: "dialog" }).length,
  0,
  "The later-stage leftover-capacity affordance must not be a blocking dialog.",
);
assert.match(
  JSON.stringify(laterStagePromptRenderer.toJSON()),
  new RegExp(REMAINING_FABRIC_CAPACITY_OFFER_TITLE),
);
assert.match(
  JSON.stringify(laterStagePromptRenderer.toJSON()),
  new RegExp(REMAINING_FABRIC_CAPACITY_OFFER_BODY),
);
assert.equal(
  laterStagePromptRenderer.root.findAllByType("li").length,
  2,
  "Later-stage leftover capacity must list each remaining Fabric separately.",
);
act(() => {
  laterStagePromptRenderer.root
    .findByProps({
      "data-testid": `remaining-fabric-capacity-offer-add-${combinedCapacityOffers[1].allocationId}`,
    })
    .props.onClick();
});
assert.deepEqual(laterStagePromptOpens, [combinedCapacityOffers[1].allocationId]);
assert.match(
  JSON.stringify(laterStagePromptRenderer.toJSON()),
  new RegExp(REMAINING_FABRIC_CAPACITY_OFFER_ADD_GARMENT),
);
assert.doesNotMatch(
  JSON.stringify(laterStagePromptRenderer.toJSON()),
  /Use unused Fabric capacity/,
  "Later stages must not use a generic leftover-capacity CTA.",
);
act(() => laterStagePromptRenderer.unmount());

let lockedCapacityOfferGarment: FabricGarmentType | null = null;
let lockedCapacityOfferAllocationId: string | null = null;
let lockedCapacityOfferRenderer!: ReturnType<typeof create>;
act(() => {
  lockedCapacityOfferRenderer = create(
    createElement(FutureRemainingFabricCapacityOfferCard, {
      offers: combinedCapacityOffers,
      fabrics,
      eligibleGarmentTypes: ["trouser"],
      lockedAllocationId: combinedCapacityOffers[1].allocationId,
      showContinueToDesignStyle: false,
      onAddAdditionalGarment: (garmentType, allocationId) => {
        lockedCapacityOfferGarment = garmentType;
        lockedCapacityOfferAllocationId = allocationId;
      },
      onContinue: () => undefined,
      onDismiss: () => undefined,
    }),
  );
});
assert.equal(
  lockedCapacityOfferRenderer.root.findAllByProps({
    "data-testid": "remaining-fabric-capacity-offer-selector",
  }).length,
  1,
  "A later-stage Add Garment action must open the garment chooser for that Fabric immediately.",
);
assert.equal(
  lockedCapacityOfferRenderer.root.findAllByProps({
    "data-testid": "remaining-fabric-capacity-offer-decline",
  }).length,
  0,
  "Later-stage leftover capacity must not use Continue to Design Style.",
);
assert.equal(
  lockedCapacityOfferRenderer.root.findByProps({
    "data-testid": "remaining-fabric-capacity-offer-chooser-fabric",
  }).children.join(""),
  "Fabric B",
);
assert.equal(
  lockedCapacityOfferRenderer.root.findByProps({
    "data-testid": "remaining-fabric-capacity-offer-chooser-instruction",
  }).children.join(""),
  "Choose a garment to use with Fabric B.",
);
assert.equal(
  lockedCapacityOfferRenderer.root.findByProps({
    "data-testid": "remaining-fabric-capacity-offer-selector",
  }).props["data-fabric-capacity-offer-allocation-id"],
  combinedCapacityOffers[1].allocationId,
);
act(() => {
  lockedCapacityOfferRenderer.root
    .findByProps({ "data-testid": "remaining-fabric-capacity-offer-back" })
    .props.onClick();
});
assert.equal(
  lockedCapacityOfferRenderer.root.findAllByProps({
    "data-testid": "remaining-fabric-capacity-offer-selector",
  }).length,
  0,
  "Back from a later-stage chooser must return to the Fabric-offer list without closing the modal.",
);
assert.equal(lockedCapacityOfferRenderer.root.findAllByType("li").length, 2);
assert.equal(lockedCapacityOfferGarment, null);
act(() => {
  lockedCapacityOfferRenderer.root
    .findByProps({
      "data-testid": `remaining-fabric-capacity-offer-add-${combinedCapacityOffers[0].allocationId}`,
    })
    .props.onClick();
});
assert.equal(
  lockedCapacityOfferRenderer.root.findByProps({
    "data-testid": "remaining-fabric-capacity-offer-chooser-fabric",
  }).children.join(""),
  "Fabric A",
  "After Back, Add Garment must lock the clicked Fabric rather than the original later-stage Fabric.",
);
act(() => {
  lockedCapacityOfferRenderer.root
    .findByProps({
      "data-testid": "remaining-fabric-capacity-offer-select-trouser",
    })
    .props.onClick();
});
assert.equal(lockedCapacityOfferGarment, "trouser");
assert.equal(
  lockedCapacityOfferAllocationId,
  combinedCapacityOffers[0].allocationId,
  "The locked later-stage chooser must keep the exact Fabric allocation identity.",
);
act(() => lockedCapacityOfferRenderer.unmount());

// Physical allocation ordinals must be calculated before partial allocations
// are filtered. Here Selection 1 is full while Selections 2 and 3 still have
// one standard-garment slot each.
const threePhysicalSelections = [
  "shirt",
  "trouser",
  "skirt",
  "kaftan",
] satisfies FabricGarmentType[];
let ordinalState = assign(
  FabricAllocationStateEngine.initialize(),
  threePhysicalSelections,
  "base:shirt",
  "FAB-A",
);
ordinalState = assign(ordinalState, threePhysicalSelections, "base:trouser", "FAB-A");
ordinalState = assign(ordinalState, threePhysicalSelections, "base:skirt", "FAB-B");
ordinalState = assign(ordinalState, threePhysicalSelections, "base:kaftan", "FAB-C");
const ordinalOffers = getFutureRemainingFabricCapacityOffers({
  fabricAllocationState: ordinalState,
  fabricStageComplete: true,
  hasEligibleHalfCapacityAdditionalGarment: true,
});
assert.deepEqual(
  ordinalOffers.map(({ allocationId, selectionOrdinal }) => ({ allocationId, selectionOrdinal })),
  ordinalState.fabricAllocations.slice(1).map((allocation, index) => ({
    allocationId: allocation.allocationId,
    selectionOrdinal: index + 2,
  })),
  "Filtered spare offers must retain the full physical Fabric selection ordinal.",
);
let ordinalActionAllocationId: string | null = null;
let ordinalOfferRenderer!: ReturnType<typeof create>;
act(() => {
  ordinalOfferRenderer = create(
    createElement(FutureRemainingFabricCapacityOfferCard, {
      offers: ordinalOffers,
      fabrics,
      eligibleGarmentTypes: ["trouser"],
      onAddAdditionalGarment: (_garmentType, allocationId) => {
        ordinalActionAllocationId = allocationId;
      },
      onContinue: () => undefined,
      onDismiss: () => undefined,
    }),
  );
});
assert.deepEqual(
  ordinalOfferRenderer.root
    .findAllByType("li")
    .map((offer) => offer.findAllByType("p")[1].children.join("")),
  ["Fabric Selection 2", "Fabric Selection 3"],
  "The filtered popup must render the authoritative Selection 2 and 3 labels.",
);
act(() => {
  ordinalOfferRenderer.root
    .findByProps({
      "data-testid": `remaining-fabric-capacity-offer-add-${ordinalOffers[1].allocationId}`,
    })
    .props.onClick();
});
act(() => {
  ordinalOfferRenderer.root
    .findByProps({
      "data-testid": "remaining-fabric-capacity-offer-select-trouser",
    })
    .props.onClick();
});
assert.equal(
  ordinalActionAllocationId,
  ordinalOffers[1].allocationId,
  "The Selection 3 card action must retain Selection 3's allocation identity.",
);
act(() => ordinalOfferRenderer.unmount());

// A completed Step 4 additional-garment Fabric operation uses the same
// allocation-scoped authority. Only the distinct half-used allocation can
// trigger the next optional offer.
const stepFourAdditionalAllocationId = "step4-additional-fabric";
const stepFourAdditionalPartialState = {
  ...customerCardState,
  fabricAllocations: [
    ...customerCardState.fabricAllocations,
    {
      allocationId: stepFourAdditionalAllocationId,
      fabricCode: "FAB-A",
      garmentAssignments: [
        {
          garmentKey: "additional:trouser:step4",
          code: "additional:trouser:step4",
          garmentType: "trouser" as const,
          fabricUnits: 1 as const,
          garmentSpec: {
            key: "additional:trouser:step4",
            garmentType: "trouser" as const,
            fabricUnits: 1 as const,
          },
          sourceRole: "additional" as const,
          mainGarmentKey: "base:shirt",
          mainGarmentType: "shirt" as const,
          eligibilityRule: "catalog_all" as const,
          dependencyStatus: "valid" as const,
        },
      ],
    },
  ],
};
const stepFourCapacityOffers = getFutureRemainingFabricCapacityOffers({
  fabricAllocationState: stepFourAdditionalPartialState,
  fabricStageComplete: true,
  hasEligibleHalfCapacityAdditionalGarment: true,
});
assert.deepEqual(
  stepFourCapacityOffers.map((offer) => ({
    allocationId: offer.allocationId,
    fabricCode: offer.fabricCode,
    assignedGarmentKeys: offer.assignedGarmentKeys,
  })),
  [
    {
      allocationId: stepFourAdditionalAllocationId,
      fabricCode: "FAB-A",
      assignedGarmentKeys: ["additional:trouser:step4"],
    },
  ],
  "a Step 4 additional garment can offer only its own remaining Fabric allocation",
);

let separate = assign(shared, threeRegular, "base:skirt", "FAB-B");
assert.equal(separate.fabricAllocations.length, 2);
assert.equal(separate.fabricAllocations[1].fabricCode, "FAB-B");
assert.deepEqual(getFutureGarmentFabricPlanning({
  garmentTypeSelection: createSelection(threeRegular),
  fabricAllocationState: separate,
}), {
  requiredGarmentCount: 3,
  requiredFabricQuantity: 2,
  selectedFabricQuantity: 2,
});

const repeatedProduct = assign(shared, threeRegular, "base:skirt", "FAB-A");
assert.equal(repeatedProduct.fabricAllocations.length, 2);
assert.equal(repeatedProduct.fabricAllocations[0].fabricCode, "FAB-A");
assert.equal(repeatedProduct.fabricAllocations[1].fabricCode, "FAB-A");
assert.notEqual(
  repeatedProduct.fabricAllocations[0].allocationId,
  repeatedProduct.fabricAllocations[1].allocationId,
);
assert.equal(
  resolveFabricAllocationMaterialPricing(repeatedProduct.fabricAllocations, fabrics)
    .status,
  "resolved",
);
const repeatedPricing = resolveFabricAllocationMaterialPricing(
  repeatedProduct.fabricAllocations,
  fabrics,
);
assert.equal(
  repeatedPricing.status === "resolved" ? repeatedPricing.totalMaterialPrice : null,
  20,
  "Two full allocations using one fabric product must produce two material charges.",
);

const exceptionTypes = ["kaftan", "shirt"] satisfies FabricGarmentType[];
let exceptionState = assign(
  FabricAllocationStateEngine.initialize(),
  exceptionTypes,
  "base:kaftan",
  "FAB-A",
);
assert.equal(
  getFutureFabricCapacityOffer({
    garmentTypeSelection: createSelection(exceptionTypes),
    fabricAllocationState: exceptionState,
  })?.target.assignment.garmentKey,
  "base:shirt",
);
exceptionState = assign(exceptionState, exceptionTypes, "base:shirt", "FAB-A");
assert.equal(exceptionState.fabricAllocations.length, 1);
assert.deepEqual(
  exceptionState.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:kaftan", "base:shirt"],
);

separate = assign(separate, threeRegular, "base:trouser", "FAB-B");
assert.equal(separate.fabricAllocations[0].fabricCode, "FAB-B");
assert.deepEqual(
  separate.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt", "base:trouser"],
  "Changing Trouser's Fabric changes the whole shared Shirt + Trouser allocation.",
);
assert.deepEqual(
  separate.fabricAllocations[1].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:skirt"],
);
assert.equal(separate.fabricAllocations[1].fabricCode, "FAB-B");

const singleSelection = ["shirt"] satisfies FabricGarmentType[];
let single = assign(
  FabricAllocationStateEngine.initialize(),
  singleSelection,
  "base:shirt",
  "FAB-A",
);
const originalAllocationId = single.fabricAllocations[0].allocationId;
single = assign(single, singleSelection, "base:shirt", "FAB-C");
assert.equal(single.fabricAllocations.length, 1);
assert.equal(single.fabricAllocations[0].allocationId, originalAllocationId);
assert.equal(single.fabricAllocations[0].fabricCode, "FAB-C");

let sharedRemovalState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
});
sharedRemovalState = commitSameFabric({
  state: sharedRemovalState,
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
const sharedRemovalAllocationId = sharedRemovalState.fabricAllocations[0].allocationId;
sharedRemovalState = removeFutureFabricAssignment({
  state: sharedRemovalState,
  garmentKey: "base:shirt",
});
assert.equal(sharedRemovalState.fabricAllocations.length, 1);
assert.equal(sharedRemovalState.fabricAllocations[0].allocationId, sharedRemovalAllocationId);
assert.deepEqual(
  sharedRemovalState.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:trouser"],
  "Removing one shared assignment must preserve the unrelated garment in its allocation.",
);
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    fabricAllocationState: sharedRemovalState,
    fabrics,
  }).isComplete,
  false,
);
sharedRemovalState = removeFutureFabricAssignment({
  state: sharedRemovalState,
  garmentKey: "base:trouser",
});
assert.equal(sharedRemovalState.fabricAllocations.length, 0);
assert.equal(sharedRemovalState.activeAllocationId, null);
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    fabricAllocationState: sharedRemovalState,
    fabrics,
  }).isComplete,
  false,
  "Removing the last assignment must make the fabric stage incomplete without leaving an empty allocation.",
);

const overflowRemovalSelection = createSelection([
  "shirt",
  "trouser",
  "skirt",
]);
let overflowRemovalState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: overflowRemovalSelection,
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
});
overflowRemovalState = assignFutureFabricToGarment({
  state: overflowRemovalState,
  garmentTypeSelection: overflowRemovalSelection,
  garmentKey: "base:trouser",
  fabricCode: "FAB-A",
}).state;
const overflowSkirtTarget = getFutureFabricAssignmentTargets(
  overflowRemovalSelection,
).find(({ assignment }) => assignment.garmentKey === "base:skirt");
assert.ok(overflowSkirtTarget);
overflowRemovalState = FabricAllocationStateEngine.attemptAppendGarment(
  overflowRemovalState,
  overflowSkirtTarget.selection,
);
assert.equal(overflowRemovalState.pendingFabricGarment?.garmentKey, "base:skirt");
const overflowAllocationId = overflowRemovalState.fabricAllocations[0].allocationId;
const sharedAfterOverflowRemoval = removeFutureFabricAssignment({
  state: overflowRemovalState,
  garmentKey: "base:shirt",
});
assert.equal(
  sharedAfterOverflowRemoval.pendingFabricGarment?.garmentKey,
  "base:skirt",
  "Removing an unrelated committed garment must preserve a different pending overflow garment.",
);
assert.equal(
  sharedAfterOverflowRemoval.awaitingFabricForPendingGarment,
  overflowRemovalState.awaitingFabricForPendingGarment,
);
assert.equal(sharedAfterOverflowRemoval.fabricAllocations[0].allocationId, overflowAllocationId);
assert.deepEqual(
  sharedAfterOverflowRemoval.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:trouser"],
  "Removal must not delete an unrelated committed assignment.",
);

const oneCommittedWithDifferentPending =
  FabricAllocationStateEngine.removeGarmentAssignments(
    overflowRemovalState,
    ["base:shirt"],
  );
assert.equal(
  oneCommittedWithDifferentPending.pendingFabricGarment?.garmentKey,
  "base:skirt",
  "The regression fixture must reproduce a different stale pending overflow garment.",
);
const finalAfterOverflowRemoval = removeFutureFabricAssignment({
  state: oneCommittedWithDifferentPending,
  garmentKey: "base:trouser",
});
assert.equal(finalAfterOverflowRemoval.fabricAllocations.length, 0);
assert.equal(finalAfterOverflowRemoval.activeAllocationId, null);
assert.equal(
  finalAfterOverflowRemoval.pendingFabricGarment?.garmentKey,
  "base:skirt",
  "Removing the last unrelated committed garment must still preserve the pending overflow garment.",
);
assert.equal(
  finalAfterOverflowRemoval.awaitingFabricForPendingGarment,
  oneCommittedWithDifferentPending.awaitingFabricForPendingGarment,
);

const separateBeforeRemoval = assign(
  assign(
    FabricAllocationStateEngine.initialize(),
    ["shirt", "trouser", "skirt"],
    "base:shirt",
    "FAB-A",
  ),
  ["shirt", "trouser", "skirt"],
  "base:trouser",
  "FAB-B",
);
const separateAfterRemoval = removeFutureFabricAssignment({
  state: separateBeforeRemoval,
  garmentKey: "base:shirt",
});
assert.deepEqual(
  separateAfterRemoval.fabricAllocations.map((allocation) => ({
    allocationId: allocation.allocationId,
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [{
    allocationId: separateBeforeRemoval.fabricAllocations[1].allocationId,
    fabricCode: "FAB-B",
    garmentKeys: ["base:trouser"],
  }],
  "Removing one separate allocation must preserve the unrelated allocation and its identity.",
);

const inUsePresentation = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(["shirt"]),
  fabricAllocationState: applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: createSelection(["shirt"]),
    garmentKey: "base:shirt",
    fabricCode: "FAB-A",
  }),
  currentTargetGarmentKey: null,
});
assert.equal(inUsePresentation.status, "IN USE");
assert.equal(inUsePresentation.action, "cancel");
assert.equal(inUsePresentation.cancelGarmentKey, "base:shirt");
assert.deepEqual(inUsePresentation.cancelGarmentKeys, ["base:shirt"]);

const pendingSharePresentation = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(["shirt", "trouser", "kaftan"]),
  fabricAllocationState: applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: createSelection(["shirt", "trouser", "kaftan"]),
    garmentKey: "base:shirt",
    fabricCode: "FAB-A",
  }),
  currentTargetGarmentKey: "base:kaftan",
});
assert.equal(pendingSharePresentation.status, "IN USE");
assert.equal(
  pendingSharePresentation.action,
  "select",
  "IN USE must still assign to a pending garment instead of cancelling the existing occurrence.",
);
assert.equal(pendingSharePresentation.cancelGarmentKey, null);
assert.deepEqual(pendingSharePresentation.cancelGarmentKeys, []);

const focusedAssignedPresentation = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricAllocationState: applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    garmentKey: "base:shirt",
    fabricCode: "FAB-A",
  }),
  currentTargetGarmentKey: "base:shirt",
});
assert.equal(focusedAssignedPresentation.status, "ASSIGNED");
assert.equal(focusedAssignedPresentation.action, "cancel");
assert.equal(focusedAssignedPresentation.cancelGarmentKey, "base:shirt");
assert.deepEqual(focusedAssignedPresentation.cancelGarmentKeys, ["base:shirt"]);

const sharedCodeState = commitSameFabric({
  state: applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    garmentKey: "base:shirt",
    fabricCode: "FAB-A",
  }),
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
const sharedCodeCard = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricAllocationState: sharedCodeState,
  currentTargetGarmentKey: null,
});
assert.equal(sharedCodeCard.action, "cancel");
assert.equal(
  sharedCodeCard.cancelGarmentKey,
  null,
  "Multiple assignments must not expose a hidden single cancel target.",
);
assert.deepEqual(sharedCodeCard.cancelGarmentKeys, [
  "base:shirt",
  "base:trouser",
]);
assert.deepEqual(
  getFutureFabricCatalogueCancelTargets({
    fabricCode: "FAB-A",
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    fabricAllocationState: sharedCodeState,
    currentTargetGarmentKey: null,
  }),
  ["base:shirt", "base:trouser"],
);
const sharedCodeAfterCancelShirt = commitCatalogueCancel({
  state: sharedCodeState,
  garmentKey: "base:shirt",
});
assert.deepEqual(
  sharedCodeAfterCancelShirt.fabricAllocations[0]?.garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:trouser"],
  "Catalogue cancellation must follow garment identity, not delete every user of the fabric code.",
);
const sharedCodeAfterCancelTrouser = commitCatalogueCancel({
  state: sharedCodeState,
  garmentKey: "base:trouser",
});
assert.deepEqual(
  sharedCodeAfterCancelTrouser.fabricAllocations[0]?.garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
  "Removing Trouser must not depend on array order or silently target Shirt.",
);
const sharedAfterShirtOnly = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricAllocationState: sharedCodeAfterCancelShirt,
  currentTargetGarmentKey: null,
});
assert.equal(sharedAfterShirtOnly.cancelGarmentKey, "base:trouser");
assert.deepEqual(sharedAfterShirtOnly.cancelGarmentKeys, ["base:trouser"]);

let additionalState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
});
additionalState = commitSameFabric({
  state: additionalState,
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
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
if (additionalState.pendingFabricGarment) {
  additionalState = FabricAllocationStateEngine.assignPendingGarmentToFabric(
    additionalState,
    "FAB-B",
  );
}
additionalState = commitCatalogueCancel({
  state: additionalState,
  garmentKey: "additional:shirt:1",
});
assert.equal(additionalState.pendingFabricGarment?.garmentKey, "additional:shirt:1");
assert.equal(additionalState.awaitingFabricForPendingGarment, true);
assert.ok(
  additionalState.fabricAllocations.some((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:shirt",
    ),
  ),
);
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    fabricAllocationState: additionalState,
    fabrics,
  }).isComplete,
  false,
);
const additionalFlowSelection = createSelection(["shirt", "trouser"]);
const additionalShirtConstruction = resolveGarmentConstructionPricing(
  "shirt",
  catalog,
);
assert.equal(additionalShirtConstruction.status, "resolved");
if (additionalShirtConstruction.status !== "resolved") {
  throw new Error("Expected shirt construction for additional flow");
}
const additionalAuthorizedOccurrences = buildAuthoritativePhysicalOccurrences({
  sourceKind: "catalogue",
  step1GarmentTypeSelection: additionalFlowSelection,
  effectiveGarmentTypeSelection: additionalFlowSelection,
  additionalGarmentConstructionState: {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:shirt:1": cloneGarmentConstructionPricingResolution(
        additionalShirtConstruction,
      ),
    },
  },
});

// Browser regression: all base Step 1 garments can have Fabric while an
// exact Step 4 Additional occurrence still needs Fabric. The production
// Fabric-stage wrapper must keep that target out of the Step 1 bulk-card
// path, where every card would otherwise say ALL GARMENTS HAVE FABRIC.
let missingAdditionalFabricState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: additionalFlowSelection,
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
  fabrics,
});
missingAdditionalFabricState = commitSameFabric({
  state: missingAdditionalFabricState,
  garmentTypeSelection: additionalFlowSelection,
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser"],
});
const repairPickerFabrics = [
  ...fabrics,
  createFabric("FAB-OUT", "Out of Stock Fabric", 15, "OUT_OF_STOCK"),
];
const missingAdditionalPlanning = getFutureGarmentFabricPlanning({
  garmentTypeSelection: additionalFlowSelection,
  fabricAllocationState: missingAdditionalFabricState,
  requiredPhysicalOccurrences: additionalAuthorizedOccurrences,
});
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: additionalFlowSelection,
    fabricAllocationState: missingAdditionalFabricState,
    fabrics: repairPickerFabrics,
    requiredPhysicalOccurrences: additionalAuthorizedOccurrences,
  }).isComplete,
  false,
  "The missing exact Additional occurrence must keep completion blocked before repair.",
);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let repairPickerRenderer!: ReturnType<typeof create>;
act(() => {
  repairPickerRenderer = create(
    createElement(DormantFutureFabricStep, {
      fabrics: repairPickerFabrics,
      garmentTypeSelection: additionalFlowSelection,
      fabricAllocationState: missingAdditionalFabricState,
      completion: getFutureFabricStageCompletion({
        garmentTypeSelection: additionalFlowSelection,
        fabricAllocationState: missingAdditionalFabricState,
        fabrics: repairPickerFabrics,
        requiredPhysicalOccurrences: additionalAuthorizedOccurrences,
      }),
      requiredPhysicalOccurrences: additionalAuthorizedOccurrences,
      requiredFabricQuantity: missingAdditionalPlanning.requiredFabricQuantity,
      selectedFabricQuantity: missingAdditionalPlanning.selectedFabricQuantity,
      constructionPrice: 0,
      onAssignFabricToGarment: (fabric, garmentKey) => {
        const result = assignFutureFabricToGarment({
          state: missingAdditionalFabricState,
          garmentTypeSelection: additionalFlowSelection,
          garmentKey,
          fabricCode: fabric.code,
          fabrics: repairPickerFabrics,
          requiredPhysicalOccurrences: additionalAuthorizedOccurrences,
        });
        assert.equal(result.status, "assigned");
        if (result.status === "assigned") {
          missingAdditionalFabricState = result.state;
        }
        return missingAdditionalFabricState;
      },
      onChangeFabricAllocationProduct: () => undefined,
      onRemoveFabricFromGarment: () => undefined,
      onUseSameFabricForGarment: () => undefined,
      onAssignSameFabricProduct: () => undefined,
      onAssignGarmentToExistingAllocation: () => undefined,
      onBack: () => undefined,
      onContinue: () => undefined,
      onUseSameFabric: () => undefined,
      onChooseAnotherFabric: () => undefined,
      onCancelPendingFabric: () => undefined,
    }),
  );
});
const additionalRepairButton = repairPickerRenderer.root.findByProps({
  "aria-label": "Add fabric for Standard Shirt",
});
act(() => {
  additionalRepairButton.props.onClick({ currentTarget: {} });
});
const repairCatalogueCopy = repairPickerRenderer.root
  .findByProps({ id: "future-fabric-catalogue-help" })
  .children.join("");
assert.match(
  repairCatalogueCopy,
  /Select a fabric card to assign it to Standard Shirt\./,
  "The production picker must give target-occurrence guidance.",
);
assert.doesNotMatch(
  repairCatalogueCopy,
  /All selected garments have fabric assignments\./,
  "A missing Additional occurrence must not be classified as base-only complete.",
);
const selectableRepairFabric = repairPickerRenderer.root.findByProps({
  "data-fabric-code": "FAB-B",
});
assert.equal(selectableRepairFabric.props.disabled, false);
assert.equal(selectableRepairFabric.props["data-fabric-action"], "select");
const outOfStockRepairFabric = repairPickerRenderer.root.findByProps({
  "data-fabric-code": "FAB-OUT",
});
assert.equal(outOfStockRepairFabric.props.disabled, true);
act(() => {
  selectableRepairFabric.props.onClick({ currentTarget: {} });
});
assert.deepEqual(
  missingAdditionalFabricState.fabricAllocations.map((allocation) => ({
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [
    { fabricCode: "FAB-A", garmentKeys: ["base:shirt", "base:trouser"] },
    { fabricCode: "FAB-B", garmentKeys: ["additional:shirt:1"] },
  ],
  "Selecting Fabric B repairs only the exact Additional Shirt and preserves both base assignments.",
);
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: additionalFlowSelection,
    fabricAllocationState: missingAdditionalFabricState,
    fabrics: repairPickerFabrics,
    requiredPhysicalOccurrences: additionalAuthorizedOccurrences,
  }).isComplete,
  true,
  "Completion may update only after the exact Additional occurrence is assigned.",
);
act(() => repairPickerRenderer.unmount());

const reassignmentResult = assignFutureFabricToGarment({
  state: additionalState,
  garmentTypeSelection: additionalFlowSelection,
  garmentKey: "additional:shirt:1",
  fabricCode: "FAB-C",
  requiredPhysicalOccurrences: additionalAuthorizedOccurrences,
});
assert.equal(
  reassignmentResult.status,
  "assigned",
  `Expected cancelled additional reassignment to succeed: ${reassignmentResult.status}`,
);
additionalState = reassignmentResult.state;
assert.ok(
  additionalState.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === "FAB-C" &&
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "additional:shirt:1",
      ),
  ),
  "A cancelled additional garment must be reassignable through the existing pending assignment path.",
);

let mixedStep4State = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
});
const mixedAdditionalSelection = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt", "trouser"]),
});
assert.equal(mixedAdditionalSelection.status, "resolved");
if (mixedAdditionalSelection.status !== "resolved") {
  throw new Error("Expected additional shirt");
}
mixedStep4State = FabricAllocationStateEngine.attemptAppendGarment(
  mixedStep4State,
  mixedAdditionalSelection.selection,
);
if (mixedStep4State.pendingFabricGarment) {
  mixedStep4State = FabricAllocationStateEngine.assignPendingGarmentToFabric(
    mixedStep4State,
    "FAB-A",
  );
}
mixedStep4State = applyFutureFabricCardSelection({
  state: mixedStep4State,
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  garmentKey: "base:trouser",
  fabricCode: "FAB-B",
});
assert.deepEqual(
  getFutureFabricCatalogueCancelTargets({
    fabricCode: "FAB-A",
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    fabricAllocationState: mixedStep4State,
    currentTargetGarmentKey: null,
  }),
  ["base:shirt"],
  "Untargeted Step 2 card cancellation must not include Step 4 additional assignments when a Step 1 assignment exists.",
);
const mixedStep4Card = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(["shirt", "trouser"]),
  fabricAllocationState: mixedStep4State,
  currentTargetGarmentKey: null,
});
assert.equal(mixedStep4Card.cancelGarmentKey, "base:shirt");
assert.deepEqual(mixedStep4Card.cancelGarmentKeys, ["base:shirt"]);
const mixedAfterShirtCancel = commitCatalogueCancel({
  state: mixedStep4State,
  garmentKey: "base:shirt",
});
assert.ok(
  mixedAfterShirtCancel.fabricAllocations.some((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "additional:shirt:1",
    ),
  ),
  "Removing the Step 1 Shirt assignment must leave the Step 4 additional Shirt assignment intact.",
);
assert.equal(
  mixedAfterShirtCancel.fabricAllocations.some((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:shirt",
    ),
  ),
  false,
);
assert.ok(
  mixedAfterShirtCancel.fabricAllocations.some((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:trouser",
    ),
  ),
);

let threeSharedState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: createSelection(["shirt", "trouser", "skirt"]),
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
});
threeSharedState = commitSameFabric({
  state: threeSharedState,
  garmentTypeSelection: createSelection(["shirt", "trouser", "skirt"]),
  fabricCode: "FAB-A",
  garmentKeys: ["base:trouser", "base:skirt"],
});
assert.deepEqual(
  getFutureFabricCatalogueCancelTargets({
    fabricCode: "FAB-A",
    garmentTypeSelection: createSelection(["shirt", "trouser", "skirt"]),
    fabricAllocationState: threeSharedState,
    currentTargetGarmentKey: null,
  }),
  ["base:shirt", "base:trouser", "base:skirt"],
);
const threeSharedCard = resolveFutureFabricCatalogueCardPresentation({
  fabricCode: "FAB-A",
  garmentTypeSelection: createSelection(["shirt", "trouser", "skirt"]),
  fabricAllocationState: threeSharedState,
  currentTargetGarmentKey: null,
});
assert.equal(threeSharedCard.cancelGarmentKey, null);
assert.deepEqual(threeSharedCard.cancelGarmentKeys, [
  "base:shirt",
  "base:trouser",
  "base:skirt",
]);
const threeAfterShirtCancel = commitCatalogueCancel({
  state: threeSharedState,
  garmentKey: "base:shirt",
});
assert.deepEqual(
  getFutureFabricCatalogueCancelTargets({
    fabricCode: "FAB-A",
    garmentTypeSelection: createSelection(["shirt", "trouser", "skirt"]),
    fabricAllocationState: threeAfterShirtCancel,
    currentTargetGarmentKey: null,
  }),
  ["base:trouser", "base:skirt"],
);

const persistCancelState = commitCatalogueCancel({
  state: commitSameFabric({
    state: applyFutureFabricCardSelection({
      state: FabricAllocationStateEngine.initialize(),
      garmentTypeSelection: createSelection(["shirt", "trouser"]),
      garmentKey: "base:shirt",
      fabricCode: "FAB-A",
    }),
    garmentTypeSelection: createSelection(["shirt", "trouser"]),
    fabricCode: "FAB-A",
    garmentKeys: ["base:trouser"],
  }),
  garmentKey: "base:shirt",
});
const restoredAllocations = cloneFabricAllocations(
  JSON.parse(JSON.stringify(persistCancelState.fabricAllocations)),
);
assert.deepEqual(
  restoredAllocations?.map((allocation) => ({
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [{ fabricCode: "FAB-A", garmentKeys: ["base:trouser"] }],
  "Draft serialize/restore must keep the cancelled assignment cancelled.",
);

const removed = reconcileFutureFabricAllocationState({
  state: separate,
  garmentTypeSelection: createSelection(["shirt", "skirt"]),
});
assert.deepEqual(
  removed.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ),
  ["base:shirt", "base:skirt"],
);

const reloaded = JSON.parse(JSON.stringify(repeatedProduct));
assert.equal(
  getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(threeRegular),
    fabricAllocationState: reloaded,
    fabrics,
  }).isComplete,
  true,
);
assert.equal(reloaded.fabricAllocations.length, 2);
assert.notEqual(
  reloaded.fabricAllocations[0].allocationId,
  reloaded.fabricAllocations[1].allocationId,
);

for (const invalidFabrics of [
  [createFabric("FAB-A", "Fabric A", 10, "OUT_OF_STOCK")],
  [createFabric("FAB-A", "Fabric A", undefined)],
  [],
]) {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: createSelection(threeRegular),
    fabricAllocationState: repeatedProduct,
    fabrics: invalidFabrics,
  });
  assert.equal(completion.isComplete, false);
  assert.equal(
    completion.blockers.some((blocker) =>
      ["FABRIC_UNAVAILABLE", "FABRIC_PRICE_UNAVAILABLE", "FABRIC_NOT_FOUND"].includes(
        blocker.code,
      ),
    ),
    true,
  );
}

const oldPrice = resolveFabricAllocationMaterialPricing(
  shared.fabricAllocations,
  fabrics,
);
const updatedPrice = resolveFabricAllocationMaterialPricing(
  shared.fabricAllocations,
  [createFabric("FAB-A", "Fabric A", 25)],
);
assert.equal(oldPrice.status === "resolved" ? oldPrice.totalMaterialPrice : null, 10);
assert.equal(
  updatedPrice.status === "resolved" ? updatedPrice.totalMaterialPrice : null,
  25,
);

const stepSource = readFileSync(
  "src/components/DormantFutureFabricStep.tsx",
  "utf8",
);
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const remainingOfferGate = studioSource.slice(
  studioSource.indexOf("const remainingFabricCapacityOffers ="),
  studioSource.indexOf("const futureCatalogInspection ="),
);
assert.match(remainingOfferGate, /futureFabricStageCompletion\.isComplete/);
assert.match(remainingOfferGate, /additionalGarmentFabricTransaction\.phase === "committed"/,
  "A terminal Fabric commit must not suppress the shared offer while Design Style is unfinished.");
assert.doesNotMatch(
  remainingOfferGate,
  /futureStageId === "fabric" \|\|/,
  "Offer existence must come from Fabric capacity authority, not the current stage.",
);
assert.match(
  remainingOfferGate,
  /resolveRemainingFabricCapacityOfferPresentation/,
  "later-stage leftover-capacity presentation must reuse the shared lifecycle helper.",
);
assert.match(
  remainingOfferGate,
  /showModal/,
  "Fabric still uses the existing leftover-capacity modal when the helper says to show it.",
);
assert.match(
  remainingOfferGate,
  /showPrompt/,
  "Design Style, Custom Details, and Personalized Additions must use the non-blocking leftover-capacity prompt.",
);
assert.match(
  remainingOfferGate,
  /setRemainingFabricCapacityOfferRequested\(false\)/,
  "Stage changes must close a later-stage leftover-capacity modal without consuming Fabric.",
);
assert.match(
  studioSource,
  /FutureRemainingFabricCapacityOfferPrompt/,
  "later stages must render the non-blocking leftover-capacity affordance.",
);
assert.match(
  studioSource,
  /setRemainingFabricCapacityOfferRequested\(true\)/,
  "the later-stage CTA must open the existing leftover-capacity flow.",
);
assert.match(
  studioSource,
  /setRemainingFabricCapacityOfferRequestedAllocationId\(allocationId\)/,
  "the later-stage Add Garment action must lock to the exact Fabric allocation.",
);
assert.match(
  studioSource,
  /onAddAdditionalGarment=\{\(garmentType, allocationId\) => \{[\s\S]*origin: "remaining_fabric_capacity_offer"/,
  "accepting from the later-stage leftover-capacity flow must still use existing Fabric authority.",
);
const capacityAdditionHandler = studioSource.slice(
  studioSource.indexOf("const handleAddFutureAdditionalGarment ="),
  studioSource.indexOf("const handleCompleteAdditionalGarmentCustomDetails ="),
);
assert.match(capacityAdditionHandler, /context\?\.origin === "remaining_fabric_capacity_offer" &&\s*additionalGarmentFabricTransactionRef\.current\.phase === "committed"/,
  "Accepting the shared offer may supersede a terminal transaction, never an in-flight assignment.");
assert.match(capacityAdditionHandler, /capacityReuse:\s*\{[\s\S]*allocationId: selectedCapacityOffer\.allocationId/,
  "A spare-capacity transaction must retain the exact selected physical allocation.");
assert.match(capacityAdditionHandler, /openedModal: !selectedCapacityOffer/,
  "A spare-capacity transaction must not open the normal Fabric catalogue.");
assert.doesNotMatch(capacityAdditionHandler, /setFutureStageId\("custom_details"\)/,
  "Step 2 spare-capacity acceptance must not route through Custom Details.");
assert.match(studioSource, /transaction\.phase === "catalogue" &&\s*transaction\.capacityReuse/,
  "The spare-capacity transaction must commit from its targeted state, not a catalogue selection.");
assert.match(studioSource, /assignFutureGarmentToExistingFabricAllocation\(/,
  "Spare capacity must reuse an existing allocation through Fabric authority.");
assert.match(studioSource, /setFutureStageId\(transaction\.capacityReuse\.returnStage\)/,
  "The transaction must return to the originating leftover-capacity stage.");
assert.match(studioSource, /resolveRemainingFabricCapacityReturnStage\(futureStageId\)/,
  "Leftover-capacity acceptance must keep the exact originating stage instead of forcing Fabric.");
const capacityOfferSource = readFileSync(
  "src/components/FutureRemainingFabricCapacityOffer.tsx",
  "utf8",
);
assert.doesNotMatch(capacityOfferSource, /Add Garment Using This Fabric/);
assert.match(capacityOfferSource, /Fabric Selection \{offer\.selectionOrdinal\}/,
  "Offer labels must retain their physical allocation ordinal after filtering.");
assert.doesNotMatch(capacityOfferSource, /Add Another Garment/,
  "The ambiguous generic capacity action must not remain.");
assert.doesNotMatch(
  stepSource,
  />\s*Select Fabric\s*</,
  "Step 2 must not retain a bottom Select Fabric confirmation control.",
);
assert.match(stepSource, /data-fabric-progress="true"/);
assert.match(stepSource, /data-fabric-selection-progress="true"/);
assert.match(stepSource, /data-garment-assignment-progress="true"/);
assert.match(stepSource, /data-fabric-planning-sentence="true"/);
assert.match(stepSource, /formatRequiredFabricQuantitySentence/);
assert.match(stepSource, /Fabrics Selected:/);
assert.doesNotMatch(
  stepSource,
  /Fabric selections:/,
  "Step 2 must use Fabrics Selected, not Fabric selections.",
);
assert.doesNotMatch(
  stepSource,
  /of \$\{requiredFabricQuantity\} needed/,
  "Step 2 counter copy must not append needed.",
);
assert.match(
  stepSource,
  /\$\{selectedFabricQuantity\} · Minimum needed: \$\{requiredFabricQuantity\}/,
  "The efficient minimum must not look like a mandatory maximum.",
);
assert.match(
  stepSource,
  /\$\{assignedGarmentCount\}\/\$\{requiredGarmentCount\}/,
  "Garments assigned must use X/Y with no spaces around the slash.",
);
assert.match(stepSource, /data-fabric-progress-icon="true"/);
assert.match(stepSource, /data-catalogue-scroll-anchor="true"/);
assert.match(stepSource, /catalogueScrollAnchorRef/);
assert.match(stepSource, /assignSingleEligibleStep1FabricCandidate/);
assert.match(stepSource, /shouldOpenStep1FabricGroupingDialog/);
assert.match(stepSource, /finalizeSuccessfulStep1FabricAssignment/);
assert.doesNotMatch(
  stepSource,
  /querySelector<HTMLElement>\("\[data-fabric-card\]"\)/,
  "Inline Add/Change Fabric must not focus the first Fabric card after scrolling.",
);
assert.match(stepSource, /Garments assigned:/);
assert.doesNotMatch(
  stepSource,
  /Fabrics selected:/,
  "Step 2 must not use the ambiguous single-line Fabric progress label.",
);
assert.match(stepSource, /Step1FabricAssignmentDialog/);
assert.match(stepSource, /RemoveFabricAssignmentDialog/);
assert.match(stepSource, /pendingStep1FabricAssignment/);
assert.match(stepSource, /projectPendingStep1FabricStockPresentation/);
assert.match(stepSource, /hasFutureReusableHalfCapacityForFabric/);
assert.match(stepSource, /commitStep1FabricAssignment/);
assert.match(stepSource, /onAssignSameFabricProduct/);
assert.match(stepSource, /aria-modal="true"/);
assert.match(stepSource, /restoreCatalogueFocus/);
assert.match(stepSource, /focusElementSafely/);
assert.match(stepSource, /isConnected/);
assert.match(stepSource, /focus\(\{ preventScroll: true \}\)/);
assert.match(stepSource, /document\.activeElement === first/);
assert.match(stepSource, /overflow-x-hidden/);
assert.match(stepSource, /onAssignFabricToGarment\(fabric, garmentKey\)/);
assert.match(stepSource, /handleFabricSelection\(/);
assert.match(stepSource, /removeAssignedFabric\(/);
assert.match(stepSource, /resolveFutureFabricCatalogueCardPresentation/);
assert.match(stepSource, /resolveStep1FabricCatalogueCardPresentation/);
const assignmentDialogSource = readFileSync(
  "src/components/Step1FabricAssignmentDialog.tsx",
  "utf8",
);
assert.match(assignmentDialogSource, /STEP1_FABRIC_ASSIGNMENT_TITLE/);
assert.match(assignmentDialogSource, /STEP1_FABRIC_ASSIGNMENT_DESCRIPTION/);
assert.match(assignmentDialogSource, /STEP1_USE_FOR_ALL_LABEL/);
assert.match(assignmentDialogSource, /STEP1_FABRIC_GROUP_ASSIGN_BUTTON_LABEL/);
assert.doesNotMatch(
  assignmentDialogSource,
  /priceMultiplier|toFixed\(|PRICING_CURRENCY/,
  "The Step 1 assignment popup must not show customer-facing Fabric price.",
);
assert.match(assignmentDialogSource, /role="dialog"/);
assert.match(assignmentDialogSource, /aria-modal="true"/);
const assignmentHelperSource = readFileSync(
  "src/utils/step1FabricAssignmentPopup.ts",
  "utf8",
);
assert.match(assignmentHelperSource, /Assign Fabric to Garments/);
assert.match(
  assignmentHelperSource,
  /Choose which garments should use this Fabric\./,
);
assert.match(assignmentHelperSource, /YES — Use for All/);
const catalogueCardSource = readFileSync(
  "src/components/FutureFabricCatalogueCard.tsx",
  "utf8",
);
assert.match(
  catalogueCardSource,
  /Remove \$\{fabric\.name\} from \$\{/,
  "Single-assignment X must name the exact garment in the accessible label.",
);
assert.match(
  catalogueCardSource,
  /Choose garment to remove \$\{fabric\.name\} from/,
  "Multi-assignment X must describe the chooser instead of naming one garment.",
);
assert.match(stepSource, /FutureFabricCatalogueCard/);
assert.match(stepSource, /aria-live="polite"/);
assert.match(studioSource, /assignFutureFabricToGarment\(/);
assert.match(
  studioSource,
  /cancelFutureFabricCatalogueAssignment\(/,
  "DesignStudioView must cancel catalogue assignments through the canonical removal wrapper.",
);
assert.match(
  studioSource,
  /applyFutureFabricCardSelection\(/,
  "DesignStudioView must route the customer-facing card action through the shared orchestration seam.",
);
assert.doesNotMatch(
  studioSource,
  /selectFutureFabric\(/,
  "The parent UI must not bypass the orchestration seam with a second direct selection path.",
);
assert.match(studioSource, /assignSameFabricProductToGarments\(/);
assert.match(
  studioSource,
  /onBack=\{\(\) => navigateToFutureStage\("garment_type"\)\}/,
  "Step 2 Back must retain the approved navigation helper and return to Garment Type.",
);
assert.match(
  studioSource,
  /additionalGarmentFabricTransaction\?\.garmentKey === garmentKey/,
  "DesignStudioView must only clear pending additional construction when the removed garment is that pending garment.",
);
const removeHandler = studioSource.slice(
  studioSource.indexOf("const handleRemoveFutureFabricAssignment"),
  studioSource.indexOf("const handleRemoveFutureAdditionalGarment"),
);
assert.doesNotMatch(
  removeHandler,
  /setAdditionalGarmentFabricTransaction\(null\);\s*setFabricAllocationState/,
  "Unrelated fabric removal must not wipe pending additional construction metadata.",
);
assert.match(
  removeHandler,
  /result.status !== "cancelled"/,
  "DesignStudioView must leave allocation and construction metadata unchanged when cancellation is blocked.",
);
assert.match(
  stepSource,
  /Finish assigning fabric to the pending additional garment before removing fabric from another additional garment\./,
);
const stageSource = readFileSync(
  "src/utils/designStudioFutureFabricStage.ts",
  "utf8",
);
assert.match(stageSource, /OTHER_ADDITIONAL_GARMENT_PENDING/);
assert.match(
  stageSource,
  /status: "blocked"/,
);
assert.doesNotMatch(
  stageSource,
  /cancelGarmentKey:\s*usingFabric\[0\]/,
  "Multi-assignment cancellation must not silently target usingFabric[0].",
);
assert.doesNotMatch(
  stageSource.slice(
    stageSource.indexOf("export const removeFutureFabricAssignment"),
    stageSource.indexOf("export type FutureFabricCatalogueCardStatus"),
  ),
  /cancelPendingGarment\(state\);\s*const removed/,
  "removeFutureFabricAssignment must not cancel pending additional state unconditionally.",
);
assert.match(stepSource, /openStep1FabricAssignment/);
assert.match(stepSource, /restoreStep1AssignmentFocus/);
assert.match(stepSource, /resolveStep2PostAssignmentDestination/);
assert.match(stepSource, /navigateToStep2PostAssignmentDestination/);
assert.match(stepSource, /prefers-reduced-motion/);
assert.match(stepSource, /motion-reduce:animate-none/);
assert.match(stepSource, /getFocusable\(\)\[0\]\?\.focus\(\)/);
assert.match(stepSource, /result\.assignedGarmentKeys/);

console.log("PASS: targeted future Fabric assignment flow");
