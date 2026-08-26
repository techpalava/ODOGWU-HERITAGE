import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { FutureAdditionalGarmentFabricDialog } from "./src/components/FutureAdditionalGarmentFabricDialog";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import {
  confirmAdditionalGarmentFabricAssignment,
  confirmAdditionalGarmentTransactionCommitted,
  getActiveFabricForAdditionalGarmentPicker,
  isFabricAvailableForCustomerSelection,
  type AdditionalGarmentFabricTransaction,
} from "./src/utils/additionalGarmentFabricPicker";
import { getFabricAvailabilityMessage } from "./src/utils/fabricCatalogueAvailability";
import { applyFutureFabricCardSelection } from "./src/utils/designStudioFutureFabricStage";
import { resolveFutureStageCorrection } from "./src/utils/resolveFutureStageCorrection";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import type { Fabric } from "./src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const catalog = inspectCustomDetailCatalog([]);
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalog.activeOptions,
}).selection;

const fabricA: Fabric = {
  code: "FAB-A",
  name: "Ankara A",
  description: "Primary",
  color: "Blue",
  colorHex: "#123456",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
  price: 12,
};
const fabricB: Fabric = {
  code: "FAB-B",
  name: "Ankara B",
  description: "Secondary",
  color: "Red",
  colorHex: "#654321",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
  price: 14,
};
const fabricOutOfStock: Fabric = {
  ...fabricA,
  code: "FAB-OOS",
  name: "Out Of Stock",
  stockStatus: "OUT_OF_STOCK",
};
const fabricHidden: Fabric = {
  ...fabricA,
  code: "FAB-HID",
  name: "Hidden",
  stockStatus: "HIDDEN",
};
const fabricNoPrice: Fabric = {
  ...fabricA,
  code: "FAB-NOPRICE",
  name: "Unpriced Custom Weave",
  category: "Unknown Category",
  price: undefined as unknown as number,
  priceMultiplier: undefined as unknown as number,
};

// --- Stage correction helper ---
assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "custom_details",
    garmentTypeComplete: true,
    fabricComplete: false,
    designSourceReady: true,
    customDetailsReady: true,
    measurementUnlocked: false,
    summaryUnlocked: false,
    inlineAdditionalGarmentFabricTransaction: {
      garmentKey: "additional:shirt:2",
    },
  }),
  null,
  "active inline transaction must keep custom_details",
);
assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "custom_details",
    garmentTypeComplete: true,
    fabricComplete: false,
    designSourceReady: true,
    customDetailsReady: true,
    measurementUnlocked: false,
    summaryUnlocked: false,
    inlineAdditionalGarmentFabricTransaction: null,
  }),
  "fabric",
  "without inline transaction incomplete fabric redirects to fabric",
);

let state = FabricAllocationStateEngine.initialize();
state = FabricAllocationStateEngine.createAllocationForFabric(state, fabricA.code);
state = FabricAllocationStateEngine.attemptAppendGarment(state, {
  code: "BASE_SHIRT",
  garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
  sourceRole: "main",
});

const firstExtra = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  existingAssignments: state.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
});
assert.equal(firstExtra.status, "resolved");
const firstKey = firstExtra.selection.garmentSpec!.key;
state = FabricAllocationStateEngine.attemptAppendGarment(state, firstExtra.selection);

const secondExtra = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  existingAssignments: state.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
});
assert.equal(secondExtra.status, "resolved");
const secondKey = secondExtra.selection.garmentSpec!.key;
const pendingState = FabricAllocationStateEngine.attemptAppendGarment(
  state,
  secondExtra.selection,
);
assert.equal(pendingState.pendingFabricGarment?.garmentKey, secondKey);

// TEST B — use same fabric assignment confirmation
const sameFabricState =
  FabricAllocationStateEngine.useSameFabricForPendingGarment(pendingState);
const sameResult = confirmAdditionalGarmentFabricAssignment({
  previousState: pendingState,
  nextState: sameFabricState,
  garmentKey: secondKey,
  fabricCode: fabricA.code,
});
assert.equal(sameResult.status, "assigned");

// Transaction ordering — fabric assigned but construction not committed yet
const orderingTransaction: AdditionalGarmentFabricTransaction = {
  transactionId: 7,
  phase: "awaiting_commit",
  origin: "new_addition",
  garmentKey: secondKey,
  garmentType: "shirt",
  requestedFabricCode: fabricA.code,
  construction: {
    status: "resolved",
    garmentType: "shirt",
    basePrice: 10,
    totalPrice: 10,
    optionId: "standard",
    label: "Standard",
  } as never,
  openedModal: true,
};
const pendingCommit = confirmAdditionalGarmentTransactionCommitted({
  transaction: orderingTransaction,
  fabricAllocationState: sameResult.state,
  designSelections: { accessories: [] },
  reconciliationParentGarmentKeys: [],
});
assert.equal(
  pendingCommit.status,
  "pending",
  "TEST ordering — modal must not close before construction commit",
);
const committed = confirmAdditionalGarmentTransactionCommitted({
  transaction: {
    ...orderingTransaction,
    constructionAppliedForTransactionId: 7,
  },
  fabricAllocationState: sameResult.state,
  designSelections: {
    accessories: [],
    additionalGarmentConstructions: {
      schemaVersion: 1,
      byGarmentKey: {
        [secondKey]: orderingTransaction.construction!,
      },
    },
  },
  reconciliationParentGarmentKeys: [secondKey],
});
assert.equal(committed.status, "committed");

// Choose another fabric
const awaiting = FabricAllocationStateEngine.beginChooseAnotherFabric(pendingState);
const chosen = applyFutureFabricCardSelection({
  state: awaiting,
  garmentTypeSelection,
  garmentKey: secondKey,
  fabricCode: fabricB.code,
});
const chooseResult = confirmAdditionalGarmentFabricAssignment({
  previousState: awaiting,
  nextState: chosen,
  garmentKey: secondKey,
  fabricCode: fabricB.code,
});
assert.equal(chooseResult.status, "assigned");

// Duplicate assignment rejection
const duplicateState = {
  ...chooseResult.state,
  fabricAllocations: [
    ...chooseResult.state.fabricAllocations,
    {
      allocationId: "dup-alloc",
      fabricCode: fabricA.code,
      garmentAssignments: [
        {
          ...chooseResult.state.fabricAllocations
            .flatMap((allocation) => allocation.garmentAssignments)
            .find((assignment) => assignment.garmentKey === secondKey)!,
        },
      ],
    },
  ],
};
const duplicateBlocked = confirmAdditionalGarmentFabricAssignment({
  previousState: chooseResult.state,
  nextState: duplicateState,
  garmentKey: secondKey,
  fabricCode: fabricB.code,
});
assert.equal(duplicateBlocked.status, "blocked");
assert.match(duplicateBlocked.reason, /conflicting/i);

// Engine hardening — beginPendingAdditionalGarmentSelection
const empty = FabricAllocationStateEngine.initialize();
const withBaseForParking = (() => {
  let baseOnly = FabricAllocationStateEngine.initialize();
  baseOnly = FabricAllocationStateEngine.createAllocationForFabric(
    baseOnly,
    fabricA.code,
  );
  return FabricAllocationStateEngine.attemptAppendGarment(baseOnly, {
    code: "BASE_SHIRT",
    garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    sourceRole: "main",
  });
})();
const parked = FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
  withBaseForParking,
  secondExtra.selection,
);
assert.equal(parked.pendingFabricGarment?.garmentKey, secondKey);
assert.equal(parked.awaitingFabricForPendingGarment, true);

const baseRejected = FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
  empty,
  {
    code: "BASE_SHIRT",
    garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    sourceRole: "main",
  },
);
assert.equal(baseRejected.pendingFabricGarment, null);

const malformedRejected =
  FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(empty, {
    sourceRole: "additional",
  });
assert.equal(malformedRejected.pendingFabricGarment, null);

const alreadyCommittedRejected =
  FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    chooseResult.state,
    firstExtra.selection,
  );
assert.equal(
  alreadyCommittedRejected.pendingFabricGarment,
  null,
  "already-committed additional key must be rejected",
);

const conflictingPendingRejected =
  FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    pendingState,
    secondExtra.selection,
  );
assert.equal(
  conflictingPendingRejected.pendingFabricGarment?.garmentKey,
  pendingState.pendingFabricGarment?.garmentKey,
);

// Same-fabric availability
assert.equal(isFabricAvailableForCustomerSelection(fabricA), true);
assert.equal(isFabricAvailableForCustomerSelection(fabricOutOfStock), false);
assert.equal(isFabricAvailableForCustomerSelection(fabricHidden), false);
assert.equal(isFabricAvailableForCustomerSelection(null), false);
assert.equal(isFabricAvailableForCustomerSelection(fabricNoPrice), false);
assert.ok(getFabricAvailabilityMessage(fabricOutOfStock));

const resolvedOk = {
  status: "resolved" as const,
  fabric: fabricA,
};
const blockedOutOfStock = {
  status: "blocked" as const,
  code: "out_of_stock" as const,
  reason: getFabricAvailabilityMessage(fabricOutOfStock) || "Currently out of stock.",
};

// Dialog — available same fabric shows Use Same
let renderer!: ReturnType<typeof create>;
act(() => {
  renderer = create(
    createElement(FutureAdditionalGarmentFabricDialog, {
      transaction: {
        transactionId: 1,
        phase: "choice",
        garmentKey: secondKey,
        garmentType: "shirt",
        origin: "new_addition",
        openedModal: true,
      },
      fabrics: [fabricA, fabricB],
      garmentTypeSelection,
      fabricAllocationState: pendingState,
      activeFabric: fabricA,
      activeFabricSelectionIndex: 1,
      activeFabricResolution: resolvedOk,
      activeFabricCode: fabricA.code,
      errorMessage: null,
      onUseSameFabric: () => undefined,
      onChooseAnotherFabric: () => undefined,
      onBackToChoice: () => undefined,
      onSelectFabric: () => undefined,
      onCancel: () => undefined,
    }),
  );
});
assert.match(textContent(renderer.root), /Use Same Fabric Again/);
assert.equal(
  renderer.root.findByProps({ "data-fabric-dialog-action": "use-same" }).props
    .disabled,
  false,
);

// OUT_OF_STOCK active fabric keeps choice UI but disables Same Fabric
act(() => {
  renderer.update(
    createElement(FutureAdditionalGarmentFabricDialog, {
      transaction: {
        transactionId: 2,
        phase: "choice",
        garmentKey: secondKey,
        garmentType: "shirt",
        origin: "new_addition",
        openedModal: true,
      },
      fabrics: [fabricOutOfStock, fabricB],
      garmentTypeSelection,
      fabricAllocationState: pendingState,
      activeFabric: fabricOutOfStock,
      activeFabricSelectionIndex: 1,
      activeFabricResolution: blockedOutOfStock,
      activeFabricCode: fabricOutOfStock.code,
      errorMessage: null,
      onUseSameFabric: () => undefined,
      onChooseAnotherFabric: () => undefined,
      onBackToChoice: () => undefined,
      onSelectFabric: () => undefined,
      onCancel: () => undefined,
    }),
  );
});
assert.equal(
  renderer.root.findByProps({
    "data-dialog-phase": "choice",
  }).props["data-dialog-phase"],
  "choice",
);
assert.equal(
  renderer.root.findByProps({ "data-fabric-dialog-action": "use-same" }).props
    .disabled,
  true,
);
assert.ok(
  renderer.root.findAllByProps({ "data-same-fabric-unavailable-reason": "true" })
    .length >= 1,
);

// awaiting_commit keeps modal open with finishing state
act(() => {
  renderer.update(
    createElement(FutureAdditionalGarmentFabricDialog, {
      transaction: {
        transactionId: 3,
        phase: "awaiting_commit",
        garmentKey: secondKey,
        garmentType: "shirt",
        origin: "new_addition",
        requestedFabricCode: fabricB.code,
        openedModal: true,
      },
      fabrics: [fabricA, fabricB],
      garmentTypeSelection,
      fabricAllocationState: chooseResult.state,
      activeFabric: fabricA,
      activeFabricSelectionIndex: 1,
      activeFabricResolution: resolvedOk,
      activeFabricCode: fabricA.code,
      errorMessage: null,
      onUseSameFabric: () => undefined,
      onChooseAnotherFabric: () => undefined,
      onBackToChoice: () => undefined,
      onSelectFabric: () => undefined,
      onCancel: () => undefined,
    }),
  );
});
assert.match(textContent(renderer.root), /Finishing garment setup/i);
assert.equal(
  renderer.root.findAllByProps({
    "data-additional-garment-fabric-dialog": "true",
  }).length,
  1,
);

// Change Fabric reassignment targets only one occurrence
const withTwoShirts = chooseResult.state;
const reassigned = applyFutureFabricCardSelection({
  state: withTwoShirts,
  garmentTypeSelection,
  garmentKey: secondKey,
  fabricCode: fabricA.code,
});
assert.equal(
  withTwoShirts.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === firstKey,
    ),
  )?.fabricCode,
  fabricA.code,
);
assert.equal(
  reassigned.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === secondKey,
    ),
  )?.fabricCode,
  fabricA.code,
);

assert.equal(
  getActiveFabricForAdditionalGarmentPicker({
    fabrics: [fabricA, fabricB],
    fabricAllocationState: parked,
  }).fabric?.code,
  fabricA.code,
);
assert.equal(
  getActiveFabricForAdditionalGarmentPicker({
    fabrics: [fabricA, fabricB],
    fabricAllocationState: empty,
  }).fabric,
  null,
);

console.log("PASS: custom details inline fabric picker regressions");
