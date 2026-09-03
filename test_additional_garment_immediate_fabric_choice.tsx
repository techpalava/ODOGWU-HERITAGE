/**
 * Additional garments must enter the explicit Step 4 Fabric transaction before
 * any spare capacity is consumed. Requires the Vite production Firebase harness.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import DesignStudioView from "./src/components/DesignStudioView";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import { FutureAdditionalGarmentFabricDialog } from "./src/components/FutureAdditionalGarmentFabricDialog";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { useAppStore } from "./src/store/useAppStore";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import type {
  Fabric,
  FabricAllocationState,
  GuestDesignDraft,
  Measurements,
  StyleCategory,
} from "./src/types";
import { createCatalogDesignSource } from "./src/utils/designSourceState";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  createCatalogueAdditionalGarmentSelection,
  projectCatalogueStep1PhysicalOccurrences,
} from "./src/utils/additionalGarmentDomain";
import {
  applyAdditionalGarmentConstructionAndCopy,
  getActiveFabricForAdditionalGarmentPicker,
  type AdditionalGarmentFabricTransaction,
} from "./src/utils/additionalGarmentFabricPicker";
import {
  isCurrentAdditionalGarmentFabricOperation,
  preparePendingAdditionalGarmentCancellationCommit,
} from "./src/utils/midProcessGarmentRemovalIntegration";
import { applyFutureFabricCardSelection } from "./src/utils/designStudioFutureFabricStage";
import { cloneGarmentConstructionPricingResolution } from "./src/utils/additionalGarmentConstructionState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const memoryStorage = new MemoryStorage();
const stubWindow = {
  scrollY: 0,
  scrollTo: () => undefined,
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  },
  cancelAnimationFrame: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  localStorage: memoryStorage,
  matchMedia: () => ({
    matches: false,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
};
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: stubWindow,
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: memoryStorage,
});

const { StorageService } = await import("./src/services/storageService");
const { GuestOrderSessionService } = await import(
  "./src/services/guestOrderSessionService"
);

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const fabricA: Fabric = {
  code: "ODG-009",
  name: "Green Ankara",
  description: "Authoritative test fabric",
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
  price: 12,
  image: "https://example.test/odg-009.jpg",
};
const fabricB: Fabric = {
  ...fabricA,
  code: "ODG-010",
  name: "Blue Ankara",
  color: "Blue",
  colorHex: "#164E63",
  price: 14,
  image: "https://example.test/odg-010.jpg",
};

const styles = [
  {
    id: "immediate-choice-style",
    name: "Immediate Choice Style",
    category: "Shirt",
    description: "Supports Shirt and Trouser independently.",
    basePrice: 65,
    image: "https://example.test/style.jpg",
    fabricCapacityComposition: [
      { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    ],
    availableFor: ["male"],
    garmentTypes: ["shirt", "trouser"],
    gender: "male",
    options: {},
  },
] as unknown as StyleCategory[];

const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: inspectCustomDetailCatalog(
    SEED_CUSTOM_DETAIL_CATALOG,
  ).activeOptions,
}).selection;

const createBaseFabricState = (): FabricAllocationState => {
  let state = FabricAllocationStateEngine.initialize();
  state = FabricAllocationStateEngine.createAllocationForFabric(
    state,
    fabricA.code,
  );
  return FabricAllocationStateEngine.attemptAppendGarment(state, {
    code: "BASE_SHIRT",
    garmentSpec: {
      key: "base:shirt",
      garmentType: "shirt",
      fabricUnits: 1,
    },
    sourceRole: "main",
  });
};

const emptyMeasurements: Measurements = {
  height: 0,
  weight: 0,
  age: 0,
  bodyBuild: "Average",
  fitPreference: "Standard",
  neck: 0,
  shoulder: 0,
  chest: 0,
  waist: 0,
  hip: 0,
  sleeve: 0,
  trouserLength: 0,
  isAiEstimated: false,
};

const source = createCatalogDesignSource(styles[0].id);
assert.ok(source);
const baseFabricState = createBaseFabricState();
const draft: GuestDesignDraft = {
  journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
  currentStageId: "custom_details",
  currentStep: 4,
  garmentTypeSelection,
  selectedFabricCode: fabricA.code,
  selectedStyleId: styles[0].id,
  designSource: source,
  confirmedStyleId: styles[0].id,
  confirmedDesignSourceKey: source.sourceKey,
  priceActivatedFabricCode: fabricA.code,
  selectedGarment: null,
  designSelections: { accessories: [] },
  measurements: emptyMeasurements,
  sizingMode: "manual",
  deliveryMethod: null,
  deliveryAddress: {
    addressLine1: "",
    city: "",
    postalCode: "",
    countryCode: "",
  },
  pickupTime: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "",
  leftoverFabricChoice: "",
  hasLining: false,
  pricingBreakdown: {
    pricingModel: "all_inclusive_garment_construction",
    garmentConstructionSubtotal: 65,
    customDetailsPrice: 0,
    selectedDesignPrice: 65,
    lagosToEindhovenShipping: 0,
    eindhovenToDestinationShipping: 0,
    total: 65,
  },
  shippingSnapshot: {},
  fabricAllocations: baseFabricState.fabricAllocations,
  updatedAt: "2026-09-02T08:00:00.000Z",
};

let renderer!: ReturnType<typeof create>;
const mountSeededStudio = async (): Promise<void> => {
  StorageService.clearGuestOrderSession();
  GuestOrderSessionService.saveFutureDesignDraft(draft);
  useAppStore.setState({
    businessSettings: DEFAULT_BUSINESS_SETTINGS,
    isLoadingData: false,
    stylesLoadState: "ready",
    batches: [],
    customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG,
    setNotification: () => undefined,
  } as Partial<ReturnType<typeof useAppStore.getState>> as never);
  await act(async () => {
    renderer = create(
      createElement(DesignStudioView, {
        onAddToCart: () => undefined,
        openCartDrawer: () => undefined,
        styles,
        fabrics: [fabricA, fabricB],
        currentUser: null,
        orderContext: null,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
};

await mountSeededStudio();

assert.equal(
  renderer.root.findByProps({ id: "design-studio-nine-stage-journey" }).props[
    "data-stage-id"
  ],
  "custom_details",
  "the seeded production journey must hydrate at Custom Details",
);
const hydratedBaseDesignSelections = renderer.root.findByType(
  DormantFutureCustomDetailsStep,
).props.designSelections;

const findButton = (label: string): ReactTestInstance => {
  const buttons = renderer.root.findAllByType("button");
  const button = buttons.find(
    (candidate) => textContent(candidate).trim().startsWith(label),
  );
  assert.ok(
    button,
    `Expected rendered button: ${label}. Rendered: ${buttons
      .map((candidate) => textContent(candidate).trim())
      .filter(Boolean)
      .join(" | ")}`,
  );
  return button;
};

act(() => {
  findButton("Add Trouser").props.onClick({ currentTarget: null });
});

assert.equal(
  renderer.root
    .findAllByType("button")
    .some((button) =>
      ["Use Same Custom Details", "Choose Custom Details"].some((label) =>
        textContent(button).trim().startsWith(label),
      ),
    ),
  false,
  "Custom Details choices must not render before the additional garment has an explicit Fabric choice",
);

const renderedFabricDialogs = renderer.root.findAllByProps({
  "data-additional-garment-fabric-dialog": "true",
});
assert.equal(
  renderedFabricDialogs.length,
  1,
  "a half-used allocation must open the Fabric chooser before assigning the new Trouser",
);

const dialog = renderer.root.findByType(FutureAdditionalGarmentFabricDialog);
const pendingState = dialog.props.fabricAllocationState as FabricAllocationState;
assert.equal(dialog.props.transaction.phase, "choice");
assert.equal(dialog.props.transaction.openedModal, true);
assert.match(textContent(dialog), /Use Same Fabric Again/);
assert.match(textContent(dialog), /Choose Another Fabric/);
assert.equal(pendingState.fabricAllocations.length, 1);
assert.deepEqual(
  pendingState.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
  "the original allocation must remain at 1/2 before customer choice",
);
assert.equal(pendingState.pendingFabricGarment?.garmentType, "trouser");
assert.match(
  pendingState.pendingFabricGarment?.garmentKey || "",
  /^additional:trouser:/,
);
const pendingTrouserKey = pendingState.pendingFabricGarment!.garmentKey;
const pendingTrouserGeneration = dialog.props.transaction.occurrenceGeneration;
assert.equal(Number.isSafeInteger(pendingTrouserGeneration), true);
assert.ok(pendingTrouserGeneration > 0);
const originalAllocationId = pendingState.fabricAllocations[0].allocationId;

// A second add is blocked while the exact first transaction remains pending.
const pendingSnapshot = JSON.stringify(pendingState);
const customDetailsDuringPending = renderer.root.findByType(
  DormantFutureCustomDetailsStep,
);
act(() => {
  customDetailsDuringPending.props.onAddAdditionalGarment(
    "skirt",
    null,
  );
});
const stillPendingDialog = renderer.root.findByType(
  FutureAdditionalGarmentFabricDialog,
);
assert.equal(stillPendingDialog.props.transaction.garmentKey, pendingTrouserKey);
assert.equal(
  JSON.stringify(stillPendingDialog.props.fabricAllocationState),
  pendingSnapshot,
  "a second add must not mutate the active pending transaction",
);

// Use Same consumes real spare capacity only after the explicit customer choice.
await act(async () => {
  renderer.root
    .findByProps({ "data-fabric-dialog-action": "use-same" })
    .props.onClick();
  await Promise.resolve();
  await Promise.resolve();
});
const afterUseSame = renderer.root.findByType(
  DormantFutureCustomDetailsStep,
);
const sameFabricState =
  afterUseSame.props.fabricAllocationState as FabricAllocationState;
assert.equal(sameFabricState.fabricAllocations.length, 1);
assert.equal(
  sameFabricState.fabricAllocations[0].allocationId,
  originalAllocationId,
  "spare capacity must retain the exact allocation identity",
);
assert.deepEqual(
  sameFabricState.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt", pendingTrouserKey],
);
assert.equal(sameFabricState.pendingFabricGarment, null);
assert.equal(
  renderer.root.findAllByType(FutureAdditionalGarmentFabricDialog).length,
  0,
  "Fabric success must close the Fabric dialog before Custom Details",
);
assert.equal(
  renderer.root.findAllByProps({
    "data-additional-garment-custom-details-dialog": "true",
  }).length,
  1,
  "Custom Details choices must open only after Fabric succeeds",
);
assert.equal(
  afterUseSame.props.additionalGarmentCustomDetailsRequest.garmentKey,
  pendingTrouserKey,
);
assert.equal(
  afterUseSame.props.additionalGarmentCustomDetailsRequest.occurrenceGeneration,
  pendingTrouserGeneration,
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    afterUseSame.props.designSelections.additionalGarmentConstructions
      ?.byGarmentKey || {},
    pendingTrouserKey,
  ),
  false,
  "Fabric success alone must not expose a half-committed construction occurrence",
);
const completedTrouserRequest =
  afterUseSame.props.additionalGarmentCustomDetailsRequest;
const completeTrouserCustomDetails =
  afterUseSame.props.onCompleteAdditionalGarmentCustomDetails;

await act(async () => {
  findButton("Choose Custom Details").props.onClick();
  await Promise.resolve();
  await Promise.resolve();
});
const finalizedTrouser = renderer.root.findByType(
  DormantFutureCustomDetailsStep,
);
assert.equal(finalizedTrouser.props.constructionSubtotal, 140);
assert.equal(
  finalizedTrouser.props.additionalGarmentCustomDetailsRequest,
  null,
);
let duplicateCompletionResult = true;
act(() => {
  duplicateCompletionResult = completeTrouserCustomDetails(
    completedTrouserRequest,
    { mode: "choose" },
  );
});
assert.equal(
  duplicateCompletionResult,
  false,
  "the same Custom Details completion callback must not finalize twice",
);
assert.equal(
  renderer.root.findAllByProps({
    "data-additional-garment-fabric-summary": pendingTrouserKey,
  }).length,
  1,
);

// Choosing another Fabric applies only to the provisional occurrence. Cancelling
// the later Custom Details choice rolls the whole provisional addition back.
assert.equal(
  renderer.root.findAllByProps({
    "data-additional-garment-fabric-dialog": "true",
  }).length,
  0,
  "the completed Trouser assignment must close its Fabric transaction",
);
act(() => {
  findButton("Add Shirt").props.onClick({ currentTarget: null });
});
const chooseAnotherDialog = renderer.root.findByType(
  FutureAdditionalGarmentFabricDialog,
);
const cancelledShirtKey = chooseAnotherDialog.props.transaction.garmentKey;
const cancelledShirtGeneration =
  chooseAnotherDialog.props.transaction.occurrenceGeneration;
act(() => {
  renderer.root
    .findByProps({ "data-fabric-dialog-action": "choose-another" })
    .props.onClick();
});
act(() => {
  renderer.root
    .findByProps({
      "data-fabric-card": "true",
      "data-fabric-code": fabricB.code,
      "data-fabric-action": "select",
    })
    .props.onClick();
});
const customDetailsAfterDifferentFabric = renderer.root.findByType(
  DormantFutureCustomDetailsStep,
);
const staleCustomDetailsRequest =
  customDetailsAfterDifferentFabric.props
    .additionalGarmentCustomDetailsRequest;
const staleCustomDetailsCompletion =
  customDetailsAfterDifferentFabric.props
    .onCompleteAdditionalGarmentCustomDetails;
assert.equal(
  customDetailsAfterDifferentFabric.props.additionalGarmentCustomDetailsRequest
    .garmentKey,
  cancelledShirtKey,
);
const differentFabricState =
  customDetailsAfterDifferentFabric.props
    .fabricAllocationState as FabricAllocationState;
assert.equal(differentFabricState.fabricAllocations.length, 2);
assert.deepEqual(
  differentFabricState.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt", pendingTrouserKey],
  "the original allocation must remain unchanged after choosing another Fabric",
);
assert.equal(
  differentFabricState.fabricAllocations[1].fabricCode,
  fabricB.code,
);
act(() => {
  findButton("Cancel").props.onClick();
});
assert.equal(
  renderer.root.findAllByType(FutureAdditionalGarmentFabricDialog).length,
  0,
  "cancelling copy-mode Fabric choice must close only its transaction",
);
const afterCustomDetailsCancellation = renderer.root.findByType(
  DormantFutureCustomDetailsStep,
);
assert.deepEqual(
  (
    afterCustomDetailsCancellation.props
      .fabricAllocationState as FabricAllocationState
  ).fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt", pendingTrouserKey],
  "Custom Details cancellation must preserve already committed sibling assignments",
);
assert.equal(
  (
    afterCustomDetailsCancellation.props
      .fabricAllocationState as FabricAllocationState
  ).fabricAllocations.length,
  1,
  "Custom Details cancellation must restore the exact pre-add Fabric snapshot",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    afterCustomDetailsCancellation.props.designSelections
      .additionalGarmentConstructions?.byGarmentKey || {},
    cancelledShirtKey,
  ),
  false,
  "Custom Details cancellation must remove only the provisional occurrence",
);
const cancelledStateSnapshot = JSON.stringify({
  fabricAllocationState:
    afterCustomDetailsCancellation.props.fabricAllocationState,
  designSelections: afterCustomDetailsCancellation.props.designSelections,
});
let staleCompletionResult = true;
act(() => {
  staleCompletionResult = staleCustomDetailsCompletion(
    staleCustomDetailsRequest,
    { mode: "choose" },
  );
});
assert.equal(staleCompletionResult, false);
const afterStaleCompletion = renderer.root.findByType(
  DormantFutureCustomDetailsStep,
);
assert.equal(
  JSON.stringify({
    fabricAllocationState: afterStaleCompletion.props.fabricAllocationState,
    designSelections: afterStaleCompletion.props.designSelections,
  }),
  cancelledStateSnapshot,
  "a stale Custom Details callback must not mutate a cancelled occurrence",
);

// Re-adding the same type uses a fresh occurrence generation. Copying Custom
// Details after Fabric selection retains the explicitly selected Fabric.
act(() => {
  findButton("Add Shirt").props.onClick({ currentTarget: null });
});
act(() => {
  renderer.root
    .findByProps({ "data-fabric-dialog-action": "choose-another" })
    .props.onClick();
});
act(() => {
  renderer.root
    .findByProps({
      "data-fabric-card": "true",
      "data-fabric-code": fabricB.code,
      "data-fabric-action": "select",
    })
    .props.onClick();
});
const copyRequestStep = renderer.root.findByType(
  DormantFutureCustomDetailsStep,
);
const copiedShirtRequest =
  copyRequestStep.props.additionalGarmentCustomDetailsRequest;
assert.match(copiedShirtRequest.garmentKey, /^additional:shirt:/);
assert.notEqual(
  copiedShirtRequest.occurrenceGeneration,
  cancelledShirtGeneration,
  "a removed provisional occurrence generation must never be reissued",
);
await act(async () => {
  findButton("Use Same Custom Details").props.onClick();
  await Promise.resolve();
  await Promise.resolve();
});
const afterCopyCompletion = renderer.root.findByType(
  DormantFutureCustomDetailsStep,
);
const copiedShirtFabricState =
  afterCopyCompletion.props.fabricAllocationState as FabricAllocationState;
const copiedShirtAllocation = copiedShirtFabricState.fabricAllocations.find(
  (allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === copiedShirtRequest.garmentKey,
    ),
);
assert.equal(copiedShirtAllocation?.fabricCode, fabricB.code);
assert.equal(
  afterCopyCompletion.props.designSelections.additionalGarmentConstructions
    ?.byGarmentKey?.[copiedShirtRequest.garmentKey]?.status,
  "resolved",
);

act(() => renderer.unmount());

// Cancelling either Fabric phase removes the provisional transaction without
// ever exposing Custom Details or changing the original allocation.
await mountSeededStudio();
act(() => {
  findButton("Add Trouser").props.onClick({ currentTarget: null });
});
act(() => {
  renderer.root.findByType(FutureAdditionalGarmentFabricDialog).props.onCancel();
});
let afterInitialFabricCancel = renderer.root.findByType(
  DormantFutureCustomDetailsStep,
);
assert.equal(
  renderer.root.findAllByType(FutureAdditionalGarmentFabricDialog).length,
  0,
);
assert.equal(
  renderer.root.findAllByProps({
    "data-additional-garment-custom-details-dialog": "true",
  }).length,
  0,
);
assert.deepEqual(
  (
    afterInitialFabricCancel.props.fabricAllocationState as FabricAllocationState
  ).fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
);
assert.equal(
  Object.keys(
    afterInitialFabricCancel.props.designSelections
      .additionalGarmentConstructions?.byGarmentKey || {},
  ).length,
  0,
);

act(() => {
  findButton("Add Trouser").props.onClick({ currentTarget: null });
});
act(() => {
  renderer.root
    .findByProps({ "data-fabric-dialog-action": "choose-another" })
    .props.onClick();
});
act(() => {
  renderer.root.findByType(FutureAdditionalGarmentFabricDialog).props.onCancel();
});
afterInitialFabricCancel = renderer.root.findByType(
  DormantFutureCustomDetailsStep,
);
assert.equal(
  renderer.root.findAllByType(FutureAdditionalGarmentFabricDialog).length,
  0,
);
assert.deepEqual(
  (
    afterInitialFabricCancel.props.fabricAllocationState as FabricAllocationState
  ).fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
);
act(() => renderer.unmount());

// Copy mode uses the same production construction-copy and pending-Fabric
// authorities. Cancelling removes only the provisional occurrence.
const copyAddition = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  authoritativePhysicalOccurrences:
    projectCatalogueStep1PhysicalOccurrences(["shirt"]),
});
assert.equal(copyAddition.status, "resolved");
const copiedGarmentKey = copyAddition.selection.garmentSpec!.key;
const copyConstruction = resolveGarmentConstructionPricing(
  "shirt",
  inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG).activeOptions,
);
assert.equal(copyConstruction.status, "resolved");
const copyTransaction: AdditionalGarmentFabricTransaction = {
  transactionId: 21,
  phase: "choice",
  origin: "new_addition",
  garmentKey: copiedGarmentKey,
  garmentType: "shirt",
  construction: cloneGarmentConstructionPricingResolution(copyConstruction),
  copyFromParentGarmentKey: "base:shirt",
  constructionAppliedForTransactionId: 21,
  openedModal: true,
};
const copiedDetails = applyAdditionalGarmentConstructionAndCopy({
  current: hydratedBaseDesignSelections,
  transaction: copyTransaction,
  catalogInspection: inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG),
});
assert.equal(copiedDetails.applied, true);
const copyPending =
  FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    createBaseFabricState(),
    copyAddition.selection,
  );
assert.equal(copyPending.pendingFabricGarment?.garmentKey, copiedGarmentKey);
assert.deepEqual(
  copyPending.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
  "copying Custom Details must not copy Fabric",
);
const cancellation = preparePendingAdditionalGarmentCancellationCommit({
  garmentKey: copiedGarmentKey,
  fabricAllocationState: copyPending,
  designSelections: copiedDetails.next,
});
assert.deepEqual(
  cancellation.fabricAllocationState.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
);
assert.equal(cancellation.fabricAllocationState.pendingFabricGarment, null);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    cancellation.designSelections.additionalGarmentConstructions?.byGarmentKey ||
      {},
    copiedGarmentKey,
  ),
  false,
);

// Choose Another keeps the original allocation unchanged and assigns exactly
// the pending occurrence to the selected catalogue product.
const chooseAnotherPending =
  FabricAllocationStateEngine.beginChooseAnotherFabric(copyPending);
const choseAnother = applyFutureFabricCardSelection({
  state: chooseAnotherPending,
  garmentTypeSelection,
  garmentKey: copiedGarmentKey,
  fabricCode: fabricB.code,
});
assert.equal(choseAnother.fabricAllocations.length, 2);
assert.deepEqual(
  choseAnother.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
);
assert.deepEqual(
  choseAnother.fabricAllocations[1].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  [copiedGarmentKey],
);
assert.equal(choseAnother.fabricAllocations[1].fabricCode, fabricB.code);

// Captured transaction identities reject stale callbacks before mutation.
const newerTransaction: AdditionalGarmentFabricTransaction = {
  ...copyTransaction,
  transactionId: 22,
  garmentKey: "additional:shirt:2",
};
assert.equal(
  isCurrentAdditionalGarmentFabricOperation({
    currentTransaction: newerTransaction,
    expectedTransactionId: copyTransaction.transactionId,
    expectedGarmentKey: copyTransaction.garmentKey,
  }),
  false,
);

// No active allocation parks the exact occurrence for catalogue selection.
const noAllocationAddition = createCatalogueAdditionalGarmentSelection({
  garmentType: "trouser",
  authoritativePhysicalOccurrences:
    projectCatalogueStep1PhysicalOccurrences(["shirt"]),
});
assert.equal(noAllocationAddition.status, "resolved");
const noAllocationPending =
  FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    { ...createBaseFabricState(), activeAllocationId: null },
    noAllocationAddition.selection,
  );
assert.deepEqual(
  noAllocationPending.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
);
assert.equal(
  noAllocationPending.pendingFabricGarment?.garmentKey,
  noAllocationAddition.selection.garmentSpec?.key,
);

// A full allocation remains unchanged before choice; choosing the same product
// creates the required next physical allocation without disturbing siblings.
let fullState = createBaseFabricState();
const firstRepeated = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  authoritativePhysicalOccurrences:
    projectCatalogueStep1PhysicalOccurrences(["shirt"]),
});
assert.equal(firstRepeated.status, "resolved");
fullState = FabricAllocationStateEngine.attemptAppendGarment(
  fullState,
  firstRepeated.selection,
);
const firstRepeatedKey = firstRepeated.selection.garmentSpec!.key;
const secondRepeated = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  authoritativePhysicalOccurrences:
    projectCatalogueStep1PhysicalOccurrences(["shirt"]),
  authorizedOccurrenceKeys: [firstRepeatedKey],
});
assert.equal(secondRepeated.status, "resolved");
const fullPending =
  FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    fullState,
    secondRepeated.selection,
  );
assert.deepEqual(
  fullPending.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt", firstRepeatedKey],
);
const fullActiveFabric = getActiveFabricForAdditionalGarmentPicker({
  fabrics: [fabricA, fabricB],
  fabricAllocationState: fullPending,
});
assert.equal(fullActiveFabric.resolution.status, "resolved");
let fullDialogRenderer!: ReturnType<typeof create>;
act(() => {
  fullDialogRenderer = create(
    createElement(FutureAdditionalGarmentFabricDialog, {
      transaction: {
        transactionId: 99,
        phase: "choice",
        origin: "new_addition",
        garmentKey: secondRepeated.selection.garmentSpec!.key,
        garmentType: "shirt",
        openedModal: true,
      },
      fabrics: [fabricA, fabricB],
      garmentTypeSelection,
      fabricAllocationState: fullPending,
      activeFabric: fullActiveFabric.displayFabric,
      activeFabricSelectionIndex: fullActiveFabric.selectionIndex,
      activeFabricResolution: fullActiveFabric.resolution,
      activeFabricCode: fullActiveFabric.fabricCode,
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
  fullDialogRenderer.root.findAllByProps({
    "data-additional-garment-fabric-dialog": "true",
  }).length,
  1,
);
const fullAssigned =
  FabricAllocationStateEngine.useSameFabricForPendingGarment(fullPending);
assert.equal(fullAssigned.fabricAllocations.length, 2);
assert.deepEqual(
  fullAssigned.fabricAllocations[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt", firstRepeatedKey],
);
assert.deepEqual(
  fullAssigned.fabricAllocations[1].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  [secondRepeated.selection.garmentSpec!.key],
);
act(() => fullDialogRenderer.unmount());
StorageService.clearGuestOrderSession();

console.log(
  "PASS: additional garment Fabric choice opens before spare capacity is consumed",
);
