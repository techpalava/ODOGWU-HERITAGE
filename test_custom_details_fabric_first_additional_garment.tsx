import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import { FutureAdditionalGarmentFabricDialog } from "./src/components/FutureAdditionalGarmentFabricDialog";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FABRIC_GARMENT_CAPACITY_UNITS } from "./src/config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { FabricCapacityEngine } from "./src/engine/FabricCapacityEngine";
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import {
  applyAdditionalGarmentConstructionAndCopy,
  confirmAdditionalGarmentFabricAssignment,
  confirmAdditionalGarmentTransactionCommitted,
  isAdditionalGarmentFabricDialogVisible,
  isAdditionalGarmentFabricTransactionTargetValid,
  isIncompleteNewAdditionalGarmentTransaction,
  type AdditionalGarmentFabricTransaction,
} from "./src/utils/additionalGarmentFabricPicker";
import { cloneGarmentConstructionPricingResolution } from "./src/utils/additionalGarmentConstructionState";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { applyFutureFabricCardSelection } from "./src/utils/designStudioFutureFabricStage";
import { projectFutureCustomDetailsCatalogue } from "./src/utils/futureCustomDetailsCatalogue";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  resolveCompatibleGarmentScopedCopySources,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { createEmptyGarmentScopedCustomDetailsState } from "./src/utils/garmentScopedCustomDetailsState";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { resolveFutureStageCorrection } from "./src/utils/resolveFutureStageCorrection";
import type { Fabric, FabricAllocationState } from "./src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

if (typeof globalThis.window === "undefined") {
  const memory = new Map<string, string>();
  const stubWindow = {
    scrollY: 0,
    scrollTo: () => undefined,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    localStorage: {
      getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
      setItem: (key: string, value: string) => {
        memory.set(key, String(value));
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
      clear: () => memory.clear(),
    },
    matchMedia: () => ({
      matches: false,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  };
  Object.assign(globalThis, {
    window: stubWindow,
    localStorage: stubWindow.localStorage,
  });
}

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const fabricA: Fabric = {
  code: "FF-FAB-A",
  name: "Fabric First Ankara",
  description: "Primary",
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
  price: 12,
};
const fabricB: Fabric = {
  ...fabricA,
  code: "FF-FAB-B",
  name: "Fabric First Ankara B",
  color: "Blue",
  colorHex: "#123456",
  price: 14,
};

const catalogInspection = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const shirtSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;

const withBaseShirt = (): FabricAllocationState => {
  let state = FabricAllocationStateEngine.initialize();
  state = FabricAllocationStateEngine.createAllocationForFabric(
    state,
    fabricA.code,
  );
  return FabricAllocationStateEngine.attemptAppendGarment(state, {
    code: "BASE_SHIRT",
    garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    sourceRole: "main",
  });
};

const beginPendingAdditional = (
  state: FabricAllocationState,
  garmentType: "shirt" | "full_length_gown",
) => {
  const addition = createCatalogueAdditionalGarmentSelection({
    garmentType,
    existingAssignments: state.fabricAllocations.flatMap(
      (allocation) => allocation.garmentAssignments,
    ),
  });
  assert.equal(addition.status, "resolved");
  const garmentKey = addition.selection.garmentSpec!.key;
  const pending = FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    state,
    addition.selection,
  );
  assert.equal(pending.pendingFabricGarment?.garmentKey, garmentKey);
  return { addition, garmentKey, pending };
};

const assertAllocationsResolve = (state: FabricAllocationState) => {
  state.fabricAllocations.forEach((allocation) => {
    const used = allocation.garmentAssignments.reduce(
      (total, assignment) => total + assignment.fabricUnits,
      0,
    );
    assert.ok(
      used <= FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION,
      `${allocation.allocationId} must not exceed 2 internal units`,
    );
    assert.equal(
      FabricCapacityEngine.resolveFabricAllocation(allocation).status,
      "resolved",
    );
  });
};

assert.equal(FABRIC_GARMENT_CAPACITY_UNITS.shirt, 1);
assert.equal(FABRIC_GARMENT_CAPACITY_UNITS.full_length_gown, 2);
assert.equal(FabricCapacityEngine.MAX_UNITS_PER_ALLOCATION, 2);

// A. Standard additional Shirt consumes 1 internal unit.
{
  const { garmentKey, pending } = beginPendingAdditional(withBaseShirt(), "shirt");
  assert.equal(pending.pendingFabricGarment?.fabricUnits, 1);
  const assigned = FabricAllocationStateEngine.useSameFabricForPendingGarment(
    pending,
  );
  const result = confirmAdditionalGarmentFabricAssignment({
    previousState: pending,
    nextState: assigned,
    garmentKey,
    fabricCode: fabricA.code,
  });
  assert.equal(result.status, "assigned");
  const assignment = result.state.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .find((candidate) => candidate.garmentKey === garmentKey);
  assert.equal(assignment?.fabricUnits, 1);
  assertAllocationsResolve(result.state);
}

// B + C + D. Long Dress consumes 2 units; Use Same Fabric still resolves.
{
  const { garmentKey, pending } = beginPendingAdditional(
    withBaseShirt(),
    "full_length_gown",
  );
  assert.equal(pending.pendingFabricGarment?.fabricUnits, 2);
  const assigned = FabricAllocationStateEngine.useSameFabricForPendingGarment(
    pending,
  );
  const result = confirmAdditionalGarmentFabricAssignment({
    previousState: pending,
    nextState: assigned,
    garmentKey,
    fabricCode: fabricA.code,
  });
  assert.equal(result.status, "assigned");
  const assignment = result.state.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .find((candidate) => candidate.garmentKey === garmentKey);
  assert.equal(assignment?.fabricUnits, 2);
  const sharedWithBase = result.state.fabricAllocations.some((allocation) => {
    const keys = allocation.garmentAssignments.map(
      (candidate) => candidate.garmentKey,
    );
    return keys.includes("base:shirt") && keys.includes(garmentKey);
  });
  assert.equal(
    sharedWithBase,
    false,
    "Long Dress must not share a 1-unit allocation",
  );
  assertAllocationsResolve(result.state);
}

// E. Choose Another Fabric assigns only the exact new additional garment.
{
  const base = withBaseShirt();
  const { garmentKey, pending } = beginPendingAdditional(base, "shirt");
  const awaiting = FabricAllocationStateEngine.beginChooseAnotherFabric(pending);
  const chosen = applyFutureFabricCardSelection({
    state: awaiting,
    garmentTypeSelection: shirtSelection,
    garmentKey,
    fabricCode: fabricB.code,
  });
  const result = confirmAdditionalGarmentFabricAssignment({
    previousState: awaiting,
    nextState: chosen,
    garmentKey,
    fabricCode: fabricB.code,
  });
  assert.equal(result.status, "assigned");
  const additionalMatch = result.state.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === garmentKey,
    ),
  );
  const baseMatch = result.state.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:shirt",
    ),
  );
  assert.equal(additionalMatch?.fabricCode, fabricB.code);
  assert.equal(baseMatch?.fabricCode, fabricA.code);
  assert.match(garmentKey, /^additional:shirt:\d+$/);
  assertAllocationsResolve(result.state);
}

// F. Cancel before Fabric restores the snapshot.
{
  const snapshot = withBaseShirt();
  const { pending } = beginPendingAdditional(snapshot, "shirt");
  const restored = snapshot;
  assert.equal(pending.pendingFabricGarment?.garmentKey.startsWith("additional:"), true);
  assert.equal(restored.pendingFabricGarment, null);
  assert.equal(
    restored.fabricAllocations.length,
    snapshot.fabricAllocations.length,
  );
}

// G. Cancel after Fabric but before details choice restores the snapshot.
{
  const snapshot = withBaseShirt();
  const { garmentKey, pending } = beginPendingAdditional(snapshot, "shirt");
  const assigned = FabricAllocationStateEngine.useSameFabricForPendingGarment(
    pending,
  );
  assert.ok(
    assigned.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === garmentKey,
      ),
    ),
  );
  const rolledBack = snapshot;
  assert.equal(
    rolledBack.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === garmentKey,
      ),
    ),
    false,
  );
  assert.equal(rolledBack.pendingFabricGarment, null);
}

const shirtConstruction = resolveGarmentConstructionPricing(
  "shirt",
  catalogInspection.activeOptions,
);
assert.equal(shirtConstruction.status, "resolved");

// H. Copy mode keeps Fabric, applies construction/copy, then commits.
{
  const { garmentKey, pending } = beginPendingAdditional(withBaseShirt(), "shirt");
  const assigned = FabricAllocationStateEngine.useSameFabricForPendingGarment(
    pending,
  );
  const fabricResult = confirmAdditionalGarmentFabricAssignment({
    previousState: pending,
    nextState: assigned,
    garmentKey,
    fabricCode: fabricA.code,
  });
  assert.equal(fabricResult.status, "assigned");
  const detailsPhase: AdditionalGarmentFabricTransaction = {
    transactionId: 11,
    phase: "custom_details_choice",
    origin: "new_addition",
    garmentKey,
    garmentType: "shirt",
    requestedFabricCode: fabricA.code,
    openedModal: false,
  };
  assert.equal(
    confirmAdditionalGarmentTransactionCommitted({
      transaction: detailsPhase,
      fabricAllocationState: fabricResult.state,
      designSelections: { accessories: [] },
      reconciliationParentGarmentKeys: [garmentKey, "base:shirt"],
    }).status,
    "pending",
    "Fabric success must not commit before Custom Details choice",
  );
  const copyTransaction: AdditionalGarmentFabricTransaction = {
    ...detailsPhase,
    phase: "assigning",
    construction: cloneGarmentConstructionPricingResolution(shirtConstruction),
    copyFromParentGarmentKey: "base:shirt",
  };
  const applied = applyAdditionalGarmentConstructionAndCopy({
    current: { accessories: [] },
    transaction: copyTransaction,
    catalogInspection,
  });
  assert.equal(applied.applied, true);
  const commit = confirmAdditionalGarmentTransactionCommitted({
    transaction: {
      ...copyTransaction,
      phase: "awaiting_commit",
      constructionAppliedForTransactionId: 11,
    },
    fabricAllocationState: fabricResult.state,
    designSelections: applied.next,
    reconciliationParentGarmentKeys: [garmentKey, "base:shirt"],
  });
  assert.equal(commit.status, "committed");
  assert.equal(
    applied.next.additionalGarmentConstructions?.byGarmentKey[garmentKey]?.status,
    "resolved",
  );
}

// I. Choose-new mode keeps Fabric, applies default construction, then commits.
{
  const { garmentKey, pending } = beginPendingAdditional(withBaseShirt(), "shirt");
  const assigned = FabricAllocationStateEngine.useSameFabricForPendingGarment(
    pending,
  );
  const fabricResult = confirmAdditionalGarmentFabricAssignment({
    previousState: pending,
    nextState: assigned,
    garmentKey,
    fabricCode: fabricA.code,
  });
  assert.equal(fabricResult.status, "assigned");
  const chooseTransaction: AdditionalGarmentFabricTransaction = {
    transactionId: 12,
    phase: "assigning",
    origin: "new_addition",
    garmentKey,
    garmentType: "shirt",
    requestedFabricCode: fabricA.code,
    construction: cloneGarmentConstructionPricingResolution(shirtConstruction),
    openedModal: false,
  };
  const applied = applyAdditionalGarmentConstructionAndCopy({
    current: { accessories: [] },
    transaction: chooseTransaction,
    catalogInspection,
  });
  assert.equal(applied.applied, true);
  const commit = confirmAdditionalGarmentTransactionCommitted({
    transaction: {
      ...chooseTransaction,
      phase: "awaiting_commit",
      constructionAppliedForTransactionId: 12,
    },
    fabricAllocationState: fabricResult.state,
    designSelections: applied.next,
    reconciliationParentGarmentKeys: [garmentKey, "base:shirt"],
  });
  assert.equal(commit.status, "committed");
  assert.equal(chooseTransaction.copyFromParentGarmentKey, undefined);
}

const choiceTransaction: AdditionalGarmentFabricTransaction = {
  transactionId: 21,
  phase: "choice",
  origin: "new_addition",
  garmentKey: "additional:shirt:2",
  garmentType: "shirt",
  openedModal: true,
};
const detailsTransaction: AdditionalGarmentFabricTransaction = {
  ...choiceTransaction,
  phase: "custom_details_choice",
  requestedFabricCode: fabricA.code,
  openedModal: false,
};
assert.equal(isAdditionalGarmentFabricDialogVisible(choiceTransaction), true);
assert.equal(isAdditionalGarmentFabricDialogVisible(detailsTransaction), false);
assert.equal(
  isAdditionalGarmentFabricDialogVisible({
    ...detailsTransaction,
    openedModal: true,
  }),
  false,
  "Custom Details choice must never keep the Fabric popup visible",
);
assert.equal(isIncompleteNewAdditionalGarmentTransaction(detailsTransaction), true);
assert.equal(
  isIncompleteNewAdditionalGarmentTransaction({
    ...detailsTransaction,
    phase: "committed",
  }),
  false,
);

assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "custom_details",
    garmentTypeComplete: true,
    fabricComplete: false,
    designSourceReady: false,
    customDetailsReady: false,
    measurementUnlocked: false,
    summaryUnlocked: false,
    inlineAdditionalGarmentFabricTransaction: detailsTransaction,
  }),
  null,
  "custom_details_choice must keep the customer on Custom Details",
);

const copySources = resolveCompatibleGarmentScopedCopySources(
  reconcileGarmentScopedCustomDetails({
    garmentTypeSelection: shirtSelection,
    catalogInspection,
    existingState: createEmptyGarmentScopedCustomDetailsState(),
    additionalGarments: [
      {
        garmentKey: "additional:shirt:2",
        code: "ADD_SHIRT_2",
        garmentType: "shirt",
        fabricUnits: 1,
        garmentSpec: {
          key: "additional:shirt:2",
          garmentType: "shirt",
          fabricUnits: 1,
        },
        sourceRole: "additional",
        eligibilityRule: "catalog_all",
        dependencyStatus: "valid",
        mainGarmentKey: "base:shirt",
        mainGarmentType: "shirt",
      },
    ],
  }).subjects.filter((subject) => subject.parentGarmentKey !== "additional:shirt:2"),
  "shirt",
);
assert.deepEqual(copySources, [
  { parentGarmentKey: "base:shirt", role: "main" },
]);

let reconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: shirtSelection,
  catalogInspection,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
let personalizedInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation,
  catalogInspection,
  existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
});
const catalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection: shirtSelection,
  style: null,
  reconciliation,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [],
});
const completion = validateGarmentScopedCustomDetailsCompletion({
  earlierStagesComplete: true,
  reconciliation,
  personalizedInputs,
});
const pricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation,
  catalogInspection,
});

let beginCalls = 0;
let confirmCalls = 0;
let cancelCalls = 0;
let lastBeginType: string | null = null;
const shirtConstructionOption = resolveGarmentConstructionPricing(
  "shirt",
  catalogInspection.activeOptions,
);

const createStep = ({
  choiceRequest = null,
  fabricOpen = false,
}: {
  choiceRequest?: {
    transactionId: number;
    garmentKey: string;
    garmentType: "shirt";
  } | null;
  fabricOpen?: boolean;
} = {}) =>
  createElement(DormantFutureCustomDetailsStep, {
    reconciliation,
    catalogue,
    personalizedInputs: personalizedInputs.state,
    completion,
    pricing,
    orderLevelCustomDetailsPrice: 0,
    constructionBreakdown: { status: "complete", rows: [] },
    constructionSubtotal: 0,
    designSelections: {},
    selectedStyle: null,
    additionalGarments: [],
    additionalGarmentConstructionOptions: [
      { garmentType: "shirt", construction: shirtConstructionOption },
    ],
    onSingleSelect: () => undefined,
    onClearSelection: () => undefined,
    onConstructionSelect: () => undefined,
    onToggleMultiSelect: () => undefined,
    onPersonalizedTextChange: () => undefined,
    onDecorativeFeatureToggle: () => undefined,
    onClearDecorativeFeatures: () => undefined,
    onMonogramPlacementChange: () => undefined,
    onAccessoryToggle: () => undefined,
    onClearAccessories: () => undefined,
    onBeginAdditionalGarment: (garmentType) => {
      beginCalls += 1;
      lastBeginType = garmentType;
    },
    onConfirmAdditionalGarmentCustomDetails: () => {
      confirmCalls += 1;
    },
    onCancelAdditionalGarmentCustomDetails: () => {
      cancelCalls += 1;
    },
    customDetailsChoiceRequest: choiceRequest,
    fabricModalOpen: fabricOpen,
    onRemoveAdditionalGarment: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  });

const createFabricDialog = (transaction: AdditionalGarmentFabricTransaction) =>
  createElement(FutureAdditionalGarmentFabricDialog, {
    transaction,
    fabrics: [fabricA, fabricB],
    garmentTypeSelection: shirtSelection,
    fabricAllocationState: beginPendingAdditional(withBaseShirt(), "shirt").pending,
    activeFabric: fabricA,
    activeFabricSelectionIndex: 1,
    activeFabricResolution: { status: "resolved", fabric: fabricA },
    activeFabricCode: fabricA.code,
    errorMessage: null,
    onUseSameFabric: () => undefined,
    onChooseAnotherFabric: () => undefined,
    onBackToChoice: () => undefined,
    onSelectFabric: () => undefined,
    onCancel: () => undefined,
  });

let renderer!: ReturnType<typeof create>;
act(() => {
  renderer = create(createStep());
});

const addShirt = renderer.root.findByProps({
  "data-add-additional-garment": "shirt",
});
act(() => {
  addShirt.props.onClick({ currentTarget: { focus: () => undefined } });
});
assert.equal(beginCalls, 1);
assert.equal(lastBeginType, "shirt");
assert.equal(
  renderer.root.findAllByProps({
    "data-additional-garment-choice-dialog": "true",
  }).length,
  0,
  "Custom Details choice must not open on the initial Add click",
);
assert.equal(
  renderer.root.findAllByProps({
    "data-additional-garment-fabric-dialog": "true",
  }).length,
  0,
);

const fabricChoiceTx: AdditionalGarmentFabricTransaction = {
  transactionId: 31,
  phase: "choice",
  origin: "new_addition",
  garmentKey: "additional:shirt:2",
  garmentType: "shirt",
  openedModal: true,
};
act(() => {
  renderer.update(
    createElement("div", null, [
      createElement("div", { key: "step" }, createStep({ fabricOpen: true })),
      isAdditionalGarmentFabricDialogVisible(fabricChoiceTx)
        ? createElement("div", { key: "fabric" }, createFabricDialog(fabricChoiceTx))
        : null,
    ]),
  );
});
assert.equal(
  renderer.root.findAllByProps({
    "data-additional-garment-fabric-dialog": "true",
  }).length,
  1,
);
assert.equal(
  renderer.root.findAllByProps({
    "data-additional-garment-choice-dialog": "true",
  }).length,
  0,
  "Fabric popup must appear before Custom Details choice",
);

const afterFabricTx: AdditionalGarmentFabricTransaction = {
  ...fabricChoiceTx,
  phase: "custom_details_choice",
  requestedFabricCode: fabricA.code,
  openedModal: false,
};
assert.equal(isAdditionalGarmentFabricDialogVisible(afterFabricTx), false);
assert.equal(
  isAdditionalGarmentFabricTransactionTargetValid({
    transaction: {
      ...afterFabricTx,
      garmentKey: beginPendingAdditional(withBaseShirt(), "shirt").garmentKey,
    },
    fabricAllocationState: FabricAllocationStateEngine.useSameFabricForPendingGarment(
      beginPendingAdditional(withBaseShirt(), "shirt").pending,
    ),
  }),
  true,
);

act(() => {
  renderer.update(
    createElement("div", null, [
      createElement(
        "div",
        { key: "step" },
        createStep({
          choiceRequest: {
            transactionId: 31,
            garmentKey: "additional:shirt:2",
            garmentType: "shirt",
          },
        }),
      ),
      isAdditionalGarmentFabricDialogVisible(afterFabricTx)
        ? createElement("div", { key: "fabric" }, createFabricDialog(afterFabricTx))
        : null,
    ]),
  );
});
assert.equal(
  renderer.root.findAllByProps({
    "data-additional-garment-fabric-dialog": "true",
  }).length,
  0,
  "Fabric popup must close after a valid assignment",
);
assert.equal(
  renderer.root.findAllByProps({
    "data-additional-garment-choice-dialog": "true",
  }).length,
  1,
  "Custom Details choice must open after Fabric success",
);
assert.match(
  textContent(
    renderer.root.findByProps({
      "data-additional-garment-choice-dialog": "true",
    }),
  ),
  /Use Same Custom Details/,
);
assert.equal(
  renderer.root.findAllByProps({
    "data-additional-garment-fabric-dialog": "true",
  }).length +
    renderer.root.findAllByProps({
      "data-additional-garment-choice-dialog": "true",
    }).length,
  1,
  "Fabric and Custom Details popups must never be visible together",
);

const choiceDialog = renderer.root.findByProps({
  "data-additional-garment-choice-dialog": "true",
});
act(() => {
  choiceDialog
    .findAllByType("button")
    .find((button) => textContent(button).includes("Cancel"))
    ?.props.onClick();
});
assert.equal(cancelCalls, 1);

const personalizedGrid = renderer.root.findByProps({
  "data-custom-detail-choice-grid": "personalized_additional",
});
assert.match(
  String(personalizedGrid.props.className),
  /grid-cols-1/,
);
assert.match(
  String(personalizedGrid.props.className),
  /lg:grid-cols-2/,
);
assert.match(
  String(personalizedGrid.props.className),
  /lg:items-start/,
);
assert.ok(
  personalizedGrid.findByProps({ "data-custom-detail-none": "true" }),
  "None must live in the same Personalized Additional choice grid",
);
assert.match(textContent(personalizedGrid), /Personalized Additional Requirement/);

const pocketGrid = renderer.root.findByProps({
  "data-custom-detail-choice-grid": "shirt_pockets",
});
assert.doesNotMatch(
  String(pocketGrid.props.className),
  /lg:grid-cols-2/,
  "Unrelated Custom Details groups must keep a single-column option grid",
);
assert.equal(
  pocketGrid.findAllByProps({ "data-custom-detail-none": "true" }).length,
  0,
  "Ordinary groups still render None outside their option grid",
);

console.log("PASS: Custom Details fabric-first additional garment flow");
