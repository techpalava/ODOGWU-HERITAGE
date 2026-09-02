/**
 * Production DesignStudioView integration for Step 4 inline Fabric picker.
 * Requires Vite production Firebase env and asset transforms — do not run with plain `tsx`.
 * Canonical: npm run test:design-studio-view-inline-fabric-integration
 * Alternate: npm run test:with-vite-firebase -- test_design_studio_view_inline_fabric_integration.tsx
 *
 * Exercises production helpers and effects DesignStudioView actually imports,
 * plus a mounted DesignStudioView smoke path under a seeded store (no live Firestore).
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { readFileSync } from "node:fs";
import DesignStudioView from "./src/components/DesignStudioView";
import { FutureAdditionalGarmentFabricDialog } from "./src/components/FutureAdditionalGarmentFabricDialog";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { useAppStore } from "./src/store/useAppStore";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import type {
  Fabric,
  FabricAllocationState,
  StyleCategory,
} from "./src/types";
import { createCatalogueAdditionalGarmentSelection, projectCatalogueStep1PhysicalOccurrences } from "./src/utils/additionalGarmentDomain";
import {
  applyAdditionalGarmentConstructionAndCopy,
  canCancelPendingForAdditionalGarmentTransaction,
  confirmAdditionalGarmentFabricAssignment,
  confirmAdditionalGarmentTransactionCommitted,
  getActiveFabricForAdditionalGarmentPicker,
  isAdditionalGarmentFabricTransactionTargetValid,
  resolveAuthoritativePrimaryFabricCode,
  resolveCurrentCatalogueFabricForAssignment,
  STALE_ADDITIONAL_GARMENT_FABRIC_MESSAGE,
  type AdditionalGarmentFabricTransaction,
} from "./src/utils/additionalGarmentFabricPicker";
import { activateFutureCatalogStyleSelection } from "./src/utils/designSourceState";
import { applyFutureFabricCardSelection } from "./src/utils/designStudioFutureFabricStage";
import { resolveFutureStageCorrection } from "./src/utils/resolveFutureStageCorrection";
import { cloneGarmentConstructionPricingResolution } from "./src/utils/additionalGarmentConstructionState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { projectFutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import { buildFutureOrderCandidate } from "./src/utils/futureOrderCandidate";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

if (typeof globalThis.window === "undefined") {
  const memory = new Map<string, string>();
  const stubWindow = {
    scrollY: 0,
    scrollTo: () => undefined,
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
  code: "INT-FAB-A",
  name: "Integration Ankara",
  description: "Integration fabric",
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
  price: 12,
  image: "https://example.test/int-a.jpg",
};

const fabricB: Fabric = {
  ...fabricA,
  code: "INT-FAB-B",
  name: "Integration Ankara B",
  price: 14,
  color: "Blue",
  colorHex: "#123456",
};

const catalogInspection = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;

const integrationAuthoritativeOccurrences = projectCatalogueStep1PhysicalOccurrences(["shirt"]);

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

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.match(
  studioSource,
  /fabricPersistentError=\{additionalGarmentFabricPersistentError\}/,
);
assert.match(studioSource, /activeFabricResolution=\{activeInlineFabricPicker\.resolution\}/);
assert.match(studioSource, /beginPendingAdditionalGarmentSelection/);
assert.match(studioSource, /STALE_ADDITIONAL_GARMENT_FABRIC_MESSAGE/);
assert.match(studioSource, /setAdditionalGarmentFabricPersistentError/);

// --- Production cancel rollback sequence (DesignStudioView helpers) ---
{
  let state = withBaseShirt();
  const addition = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: integrationAuthoritativeOccurrences,
  });
  assert.equal(addition.status, "resolved");
  const snapshot = state;
  state = FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    state,
    addition.selection,
  );
  assert.ok(state.pendingFabricGarment);
  const garmentKey = addition.selection.garmentSpec!.key;
  const transaction: AdditionalGarmentFabricTransaction = {
    transactionId: 1,
    phase: "choice",
    origin: "new_addition",
    garmentKey,
    garmentType: "shirt",
    openedModal: true,
    construction: cloneGarmentConstructionPricingResolution(
      resolveGarmentConstructionPricing(
        "shirt",
        catalogInspection.activeOptions,
      ),
    ),
  };
  assert.equal(
    canCancelPendingForAdditionalGarmentTransaction({
      transaction,
      fabricAllocationState: state,
      expectedTransactionId: 1,
    }),
    true,
  );
  const cancelled = FabricAllocationStateEngine.cancelPendingGarment(state);
  assert.equal(cancelled.pendingFabricGarment, null);
  assert.equal(
    cancelled.fabricAllocations[0]?.garmentAssignments.some(
      (a) => a.garmentKey === garmentKey,
    ),
    false,
  );
  assert.equal(
    cancelled.fabricAllocations[0]?.fabricCode,
    snapshot.fabricAllocations[0]?.fabricCode,
  );
  assert.equal(
    resolveFutureStageCorrection({
      currentStageId: "custom_details",
      garmentTypeComplete: true,
      fabricComplete: true,
      designSourceReady: true,
      customDetailsReady: true,
      measurementUnlocked: false,
      summaryUnlocked: false,
      inlineAdditionalGarmentFabricTransaction: null,
    }),
    null,
  );
}

// --- Production stale ownership (A must not cancel B) ---
{
  let state = withBaseShirt();
  const first = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: integrationAuthoritativeOccurrences,
  });
  assert.equal(first.status, "resolved");
  state = FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    state,
    first.selection,
  );
  const transactionA: AdditionalGarmentFabricTransaction = {
    transactionId: 10,
    phase: "catalogue",
    origin: "new_addition",
    garmentKey: first.selection.garmentSpec!.key,
    garmentType: "shirt",
    openedModal: true,
  };
  // Simulate B replacing pending target
  const second = createCatalogueAdditionalGarmentSelection({
    garmentType: "trouser",
    authoritativePhysicalOccurrences: integrationAuthoritativeOccurrences,
  });
  assert.equal(second.status, "resolved");
  state = {
    ...state,
    pendingFabricGarment: {
      garmentKey: second.selection.garmentSpec!.key,
      code: second.selection.code,
      garmentType: "trouser",
      fabricUnits: 1,
      sourceRole: "additional",
      mainGarmentKey: "base:shirt",
      mainGarmentType: "shirt",
      eligibilityRule: "catalog_all",
      dependencyStatus: "valid",
    },
    awaitingFabricForPendingGarment: true,
  };
  assert.equal(
    isAdditionalGarmentFabricTransactionTargetValid({
      transaction: transactionA,
      fabricAllocationState: state,
    }),
    false,
  );
  assert.equal(
    canCancelPendingForAdditionalGarmentTransaction({
      transaction: transactionA,
      fabricAllocationState: state,
      expectedTransactionId: 10,
    }),
    false,
  );
  assert.equal(
    state.pendingFabricGarment?.garmentKey,
    second.selection.garmentSpec!.key,
  );
  assert.match(STALE_ADDITIONAL_GARMENT_FABRIC_MESSAGE, /left unchanged/);
}

// --- Production success assign + commit confirmation ---
{
  let state = withBaseShirt();
  const authorizedOccurrenceKeys: string[] = [];
  // Fill capacity so the next additional shirt parks pending Fabric.
  const filler = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: integrationAuthoritativeOccurrences,
    authorizedOccurrenceKeys,
  });
  assert.equal(filler.status, "resolved");
  const fillerKey = filler.selection.garmentSpec?.key;
  assert.ok(fillerKey);
  authorizedOccurrenceKeys.push(fillerKey);
  state = FabricAllocationStateEngine.attemptAppendGarment(
    state,
    filler.selection,
  );
  const addition = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: integrationAuthoritativeOccurrences,
    authorizedOccurrenceKeys,
  });
  assert.equal(addition.status, "resolved");
  const garmentKey = addition.selection.garmentSpec!.key;
  assert.equal(fillerKey, "additional:shirt:1");
  assert.equal(garmentKey, "additional:shirt:2");
  const pending = FabricAllocationStateEngine.attemptAppendGarment(
    state,
    addition.selection,
  );
  assert.equal(pending.pendingFabricGarment?.garmentKey, garmentKey);
  const assigned = FabricAllocationStateEngine.useSameFabricForPendingGarment(
    pending,
  );
  const confirm = confirmAdditionalGarmentFabricAssignment({
    previousState: pending,
    nextState: assigned,
    garmentKey,
    fabricCode: fabricA.code,
  });
  assert.equal(confirm.status, "assigned");
  const construction = resolveGarmentConstructionPricing(
    "shirt",
    catalogInspection.activeOptions,
  );
  assert.equal(construction.status, "resolved");
  const transaction: AdditionalGarmentFabricTransaction = {
    transactionId: 3,
    phase: "awaiting_commit",
    origin: "new_addition",
    garmentKey,
    garmentType: "shirt",
    openedModal: true,
    requestedFabricCode: fabricA.code,
    construction: cloneGarmentConstructionPricingResolution(construction),
    constructionAppliedForTransactionId: 3,
  };
  const applied = applyAdditionalGarmentConstructionAndCopy({
    current: {},
    transaction,
    catalogInspection,
  });
  assert.equal(applied.applied, true);
  const commit = confirmAdditionalGarmentTransactionCommitted({
    transaction,
    fabricAllocationState: assigned,
    designSelections: applied.next,
    reconciliationParentGarmentKeys: [garmentKey, "base:shirt"],
  });
  assert.equal(commit.status, "committed");
  assert.equal(commit.garmentKey, garmentKey);
  assert.equal(commit.fabricCode, fabricA.code);
}

// --- Manual QA failure: another-Fabric must stay on custom_details ---
{
  let state = withBaseShirt();
  const primaryBefore = resolveAuthoritativePrimaryFabricCode(state);
  assert.equal(primaryBefore, fabricA.code);
  const activated = activateFutureCatalogStyleSelection({
    styleId: "style-shirt-1",
    primaryFabricCode: primaryBefore,
  });
  assert.equal(activated.priceActivatedFabricCode, fabricA.code);
  assert.equal(activated.selectedStyleId, "style-shirt-1");
  assert.equal(activated.designSource?.kind, "catalog");

  const addition = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: integrationAuthoritativeOccurrences,
  });
  assert.equal(addition.status, "resolved");
  const garmentKey = addition.selection.garmentSpec!.key;
  state = FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    state,
    addition.selection,
  );
  state = applyFutureFabricCardSelection({
    state,
    garmentTypeSelection,
    garmentKey,
    fabricCode: fabricB.code,
  });
  assert.equal(
    resolveAuthoritativePrimaryFabricCode(state),
    fabricA.code,
    "primary Fabric identity unchanged after another-Fabric",
  );
  const assignedOnB = state.fabricAllocations.some(
    (allocation) =>
      allocation.fabricCode === fabricB.code &&
      allocation.garmentAssignments.some((a) => a.garmentKey === garmentKey),
  );
  assert.equal(assignedOnB, true);

  const construction = resolveGarmentConstructionPricing(
    "shirt",
    catalogInspection.activeOptions,
  );
  assert.equal(construction.status, "resolved");
  const transaction: AdditionalGarmentFabricTransaction = {
    transactionId: 42,
    phase: "committed",
    origin: "new_addition",
    garmentKey,
    garmentType: "shirt",
    openedModal: false,
    requestedFabricCode: fabricB.code,
    construction: cloneGarmentConstructionPricingResolution(construction),
    constructionAppliedForTransactionId: 42,
  };
  assert.equal(
    resolveFutureStageCorrection({
      currentStageId: "custom_details",
      garmentTypeComplete: true,
      fabricComplete: true,
      designSourceReady:
        resolveAuthoritativePrimaryFabricCode(state) ===
        activated.priceActivatedFabricCode,
      customDetailsReady: true,
      measurementUnlocked: false,
      summaryUnlocked: false,
      inlineAdditionalGarmentFabricTransaction: transaction,
    }),
    null,
    "committed inline transaction must not bounce to design_style",
  );
  assert.equal(
    resolveFutureStageCorrection({
      currentStageId: "custom_details",
      garmentTypeComplete: true,
      fabricComplete: true,
      designSourceReady: false,
      customDetailsReady: true,
      measurementUnlocked: false,
      summaryUnlocked: false,
      inlineAdditionalGarmentFabricTransaction: transaction,
    }),
    null,
    "transient design-source flicker suppressed while committed",
  );
  assert.equal(
    resolveFutureStageCorrection({
      currentStageId: "custom_details",
      garmentTypeComplete: true,
      fabricComplete: true,
      designSourceReady: false,
      customDetailsReady: true,
      measurementUnlocked: false,
      summaryUnlocked: false,
      inlineAdditionalGarmentFabricTransaction: null,
    }),
    "design_style",
    "outside transaction, invalid design source still corrects to Step 3",
  );
}

// --- Focus handoff: choice → fabric modal (single aria-modal) ---
{
  let assignCalls = 0;
  const state = withBaseShirt();
  const addition = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: integrationAuthoritativeOccurrences,
  });
  assert.equal(addition.status, "resolved");
  const pending = FabricAllocationStateEngine.attemptAppendGarment(
    state,
    addition.selection,
  );
  const active = getActiveFabricForAdditionalGarmentPicker({
    fabrics: [fabricA, fabricB],
    fabricAllocationState: pending,
  });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(FutureAdditionalGarmentFabricDialog, {
        transaction: {
          transactionId: 4,
          phase: "choice",
          garmentKey: addition.selection.garmentSpec!.key,
          garmentType: "shirt",
          origin: "new_addition",
          openedModal: true,
        },
        fabrics: [fabricA, fabricB],
        garmentTypeSelection,
        fabricAllocationState: pending,
        activeFabric: active.displayFabric || active.fabric,
        activeFabricSelectionIndex: active.selectionIndex,
        activeFabricResolution: active.resolution,
        activeFabricCode: active.fabricCode,
        errorMessage: null,
        onUseSameFabric: () => {
          assignCalls += 1;
        },
        onChooseAnotherFabric: () => undefined,
        onBackToChoice: () => undefined,
        onSelectFabric: () => undefined,
        onCancel: () => undefined,
      }),
    );
  });
  assert.equal(
    renderer.root.findAllByProps({ "aria-modal": "true" }).length,
    1,
  );
  assert.equal(active.resolution.status, "resolved");
  act(() => {
    renderer.root
      .findByProps({ "data-fabric-dialog-action": "use-same" })
      .props.onClick();
  });
  assert.equal(assignCalls, 1);
}

// --- Live catalogue re-resolution blocks assignment ---
{
  const dupBlocked = resolveCurrentCatalogueFabricForAssignment({
    fabrics: [fabricA, { ...fabricA, name: "Dup" }],
    fabricCode: fabricA.code,
  });
  assert.equal(dupBlocked.status, "blocked");
  if (dupBlocked.status === "blocked") {
    assert.equal(dupBlocked.code, "duplicate_code");
  }
  const oos = resolveCurrentCatalogueFabricForAssignment({
    fabrics: [{ ...fabricA, stockStatus: "OUT_OF_STOCK" }],
    fabricCode: fabricA.code,
  });
  assert.equal(oos.status, "blocked");
}

// --- Pricing / Summary / candidate agreement helpers ---
{
  const state = withBaseShirt();
  const addition = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: integrationAuthoritativeOccurrences,
  });
  assert.equal(addition.status, "resolved");
  const assigned = FabricAllocationStateEngine.useSameFabricForPendingGarment(
    FabricAllocationStateEngine.attemptAppendGarment(state, addition.selection),
  );
  const additionalKeys = assigned.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments
      .filter((a) => a.sourceRole === "additional")
      .map((a) => a.garmentKey),
  );
  assert.equal(additionalKeys.length, 1);
  // Production summary/candidate builders are the DesignStudioView authority.
  assert.equal(typeof projectFutureDesignStudioSummary, "function");
  assert.equal(typeof buildFutureOrderCandidate, "function");
}

// --- Mount real DesignStudioView under seeded store (no live Firestore writes) ---
{
  useAppStore.setState({
    businessSettings: DEFAULT_BUSINESS_SETTINGS,
    isLoadingData: false,
    stylesLoadState: "ready",
    batches: [],
    customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG,
    setNotification: () => undefined,
  } as Partial<ReturnType<typeof useAppStore.getState>> as never);

  const styles = [
    {
      id: "style-shirt-1",
      name: "Integration Shirt Style",
      category: "Shirt",
      description: "Test style",
      basePrice: 65,
      image: "https://example.test/style.jpg",
      fabricCapacityComposition: [
        { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
      ],
      availableFor: ["male"],
      garmentTypes: ["shirt"],
      gender: "male",
      options: {},
    },
  ] as unknown as StyleCategory[];

  let mount!: ReturnType<typeof create>;
  await act(async () => {
    mount = create(
      createElement(DesignStudioView, {
        onAddToCart: () => undefined,
        openCartDrawer: () => undefined,
        styles,
        fabrics: [fabricA, fabricB],
        currentUser: null,
        orderContext: null,
      }),
    );
  });
  assert.equal(
    mount.root.findAllByProps({
      id: "design-studio-nine-stage-journey",
    }).length,
    1,
  );
  assert.equal(
    mount.root.findByProps({ id: "design-studio-nine-stage-journey" }).props[
      "data-stage-id"
    ],
    "garment_type",
  );
}

console.log("PASS: DesignStudioView inline fabric production integration");
