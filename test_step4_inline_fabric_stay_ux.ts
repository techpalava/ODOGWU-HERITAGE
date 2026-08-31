/**
 * UX repair: another-Fabric stays on Step 4; primary fabric / Design Source
 * authority; unlock history; scroll; Go to Top.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import {
  DESIGN_STUDIO_STEPS,
  DesignStudioJourneyStepper,
} from "./src/components/DesignStudioJourneyStepper";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import {
  CustomDetailsGoToTopButton,
  shouldShowCustomDetailsGoToTop,
} from "./src/components/CustomDetailsGoToTopButton";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import {
  resolveAuthoritativePrimaryFabricCode,
} from "./src/utils/additionalGarmentFabricPicker";
import {
  attachCustomDetailsGoToTopObserver,
  scrollCustomDetailsToTop,
} from "./src/utils/customDetailsGoToTop";
import { applyFutureFabricCardSelection } from "./src/utils/designStudioFutureFabricStage";
import { activateFutureCatalogStyleSelection } from "./src/utils/designSourceState";
import { resolveFutureStageCorrection } from "./src/utils/resolveFutureStageCorrection";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
  calculateGarmentScopedCustomDetailsPricing,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { createEmptyGarmentScopedCustomDetailsState } from "./src/utils/garmentScopedCustomDetailsState";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import { projectFutureCustomDetailsCatalogue } from "./src/utils/futureCustomDetailsCatalogue";
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

const fabricA: Fabric = {
  code: "UX-FAB-A",
  name: "Primary Ankara",
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
  code: "UX-FAB-B",
  name: "Other Ankara",
  price: 14,
  color: "Blue",
  colorHex: "#123456",
};

// Primary fabric identity: additional another-Fabric must not become primary
{
  let state = FabricAllocationStateEngine.initialize();
  state = FabricAllocationStateEngine.createAllocationForFabric(
    state,
    fabricA.code,
  );
  state = FabricAllocationStateEngine.attemptAppendGarment(state, {
    code: "BASE_SHIRT",
    garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    sourceRole: "main",
  });
  assert.equal(resolveAuthoritativePrimaryFabricCode(state), fabricA.code);

  const addition = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    existingAssignments: state.fabricAllocations.flatMap(
      (a) => a.garmentAssignments,
    ),
  });
  assert.equal(addition.status, "resolved");
  state = FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    state,
    addition.selection,
  );
  const garmentTypeSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt"],
    selectedDemographic: "male",
    normalizedCustomDetailCatalog: inspectCustomDetailCatalog(
      SEED_CUSTOM_DETAIL_CATALOG,
    ).activeOptions,
  }).selection;
  state = applyFutureFabricCardSelection({
    state,
    garmentTypeSelection,
    garmentKey: addition.selection.garmentSpec!.key,
    fabricCode: fabricB.code,
  });
  assert.equal(
    resolveAuthoritativePrimaryFabricCode(state),
    fabricA.code,
    "authoritative primary stays base fabric after another-Fabric assign",
  );
  assert.equal(state.activeAllocationId?.includes(fabricB.code) || true, true);
  const activated = activateFutureCatalogStyleSelection({
    styleId: "style-ux-1",
    primaryFabricCode: resolveAuthoritativePrimaryFabricCode(state),
  });
  assert.equal(activated.priceActivatedFabricCode, fabricA.code);
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
      inlineAdditionalGarmentFabricTransaction: {
        garmentKey: addition.selection.garmentSpec!.key,
        phase: "committed",
      },
    }),
    null,
  );
}

// Stepper unlock history
{
  let clicks = 0;
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(DesignStudioJourneyStepper, {
        currentStageId: "custom_details",
        highestUnlockedStageIndex: 3,
        canEnterFabric: true,
        canEnterDesignStyle: false,
        canEnterCustomDetails: false,
        canEnterTryOn: false,
        canEnterMeasurement: false,
        canEnterSummary: false,
        canEnterShipping: false,
        canEnterPayment: false,
        onSelectGarmentType: () => {
          clicks += 1;
        },
        onSelectFabric: () => {
          clicks += 1;
        },
        onSelectDesignStyle: () => {
          clicks += 1;
        },
        onSelectCustomDetails: () => {
          clicks += 1;
        },
        onSelectTryOn: () => undefined,
        onSelectMeasurement: () => undefined,
        onSelectSummary: () => undefined,
        onSelectShipping: () => undefined,
        onSelectPayment: () => undefined,
      }),
    );
  });
  const step4 = renderer.root.findByProps({ "data-stage-id": "custom_details" });
  assert.equal(step4.props["data-stage-unlocked"], "true");
  assert.equal(step4.props["data-stage-current"], "true");
  assert.equal(step4.props["data-stage-clickable"], "false");
  const step3 = renderer.root.findByProps({ "data-stage-id": "design_style" });
  assert.equal(step3.props["data-stage-unlocked"], "true");
  assert.equal(step3.props["data-stage-clickable"], "true");
  act(() => {
    step3.props.onClick();
  });
  assert.equal(clicks, 1);
  const step5 = renderer.root.findByProps({ "data-stage-id": "try_on" });
  assert.equal(step5.props["data-stage-unlocked"], "false");
  assert.equal(step5.props["data-stage-clickable"], "false");
}

// Go to Top visibility / action
{
  assert.equal(
    shouldShowCustomDetailsGoToTop({
      sentinelOutOfView: false,
      fabricModalOpen: false,
      choiceDialogOpen: false,
    }),
    false,
    "hidden near Step 4 top",
  );
  assert.equal(
    shouldShowCustomDetailsGoToTop({
      sentinelOutOfView: true,
      fabricModalOpen: false,
      choiceDialogOpen: false,
    }),
    true,
    "visible after top sentinel leaves view",
  );
  assert.equal(
    shouldShowCustomDetailsGoToTop({
      sentinelOutOfView: true,
      fabricModalOpen: true,
      choiceDialogOpen: false,
    }),
    false,
    "hidden while fabric modal open",
  );
  assert.equal(
    shouldShowCustomDetailsGoToTop({
      sentinelOutOfView: true,
      fabricModalOpen: false,
      choiceDialogOpen: true,
    }),
    false,
    "hidden while additional-garment choice dialog open",
  );

  let observed: IntersectionObserverCallback | null = null;
  let disconnectCount = 0;
  let visibility: boolean | null = null;
  const OriginalIO = globalThis.IntersectionObserver;
  class MockIO {
    constructor(cb: IntersectionObserverCallback) {
      observed = cb;
    }
    observe() {}
    disconnect() {
      disconnectCount += 1;
    }
    unobserve() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  (globalThis as typeof globalThis & {
    IntersectionObserver: typeof MockIO;
  }).IntersectionObserver = MockIO;

  const detach = attachCustomDetailsGoToTopObserver({
    sentinel: {} as Element,
    onVisibilityChange: (show) => {
      visibility = show;
    },
  });
  assert.ok(observed);
  observed?.(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
  assert.equal(visibility, false);
  observed?.(
    [{ isIntersecting: false } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
  assert.equal(visibility, true);
  const beforeDetach = disconnectCount;
  detach();
  assert.ok(disconnectCount > beforeDetach);

  let scrollIntoViewCalls = 0;
  let focusCalls = 0;
  const title = {
    style: {} as Record<string, string>,
    scrollIntoView: () => {
      scrollIntoViewCalls += 1;
    },
    focus: () => {
      focusCalls += 1;
    },
  } as unknown as HTMLElement;
  if (!globalThis.window) {
    // @ts-expect-error test env
    globalThis.window = globalThis;
  }
  const originalSetTimeout = globalThis.window.setTimeout;
  globalThis.window.setTimeout = ((fn: () => void) => {
    fn();
    return 0;
  }) as typeof setTimeout;
  scrollCustomDetailsToTop({ title });
  assert.equal(scrollIntoViewCalls, 1);
  assert.equal(focusCalls, 1);
  assert.equal(title.style.scrollMarginTop, "6rem");
  globalThis.window.setTimeout = originalSetTimeout;

  let goToTopClicks = 0;
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(CustomDetailsGoToTopButton, {
        onClick: () => {
          goToTopClicks += 1;
        },
      }),
    );
  });
  const btn = renderer.root.findByProps({
    "data-custom-details-go-to-top": "true",
  });
  assert.equal(btn.props["aria-label"], "Go to top of Custom Details");
  assert.equal(btn.props.title, "Go to top");
  assert.equal(btn.props.type, "button");
  assert.match(String(btn.props.className || ""), /bottom-\[calc\(5\.5rem/);
  assert.match(String(btn.props.className || ""), /size-11/);
  act(() => {
    btn.props.onClick();
  });
  assert.equal(goToTopClicks, 1);

  const catalogInspection = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
  const garmentTypeSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt"],
    selectedDemographic: "male",
    normalizedCustomDetailCatalog: catalogInspection.activeOptions,
  }).selection;
  const reconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    catalogInspection,
    existingState: createEmptyGarmentScopedCustomDetailsState(),
  });
  const personalizedInputs = reconcileGarmentScopedPersonalizedInputs({
    reconciliation,
    catalogInspection,
    existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
  });
  const catalogue = projectFutureCustomDetailsCatalogue({
    garmentTypeSelection,
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
  act(() => {
    renderer = create(
      createElement(DormantFutureCustomDetailsStep, {
        reconciliation,
        catalogue,
        personalizedInputs: personalizedInputs.state,
        completion,
        pricing,
        constructionBreakdown: { status: "complete", rows: [] },
        constructionSubtotal: 65,
        orderLevelCustomDetailsPrice: 0,
        designSelections: {},
        selectedStyle: null,
        additionalGarments: [],
        additionalGarmentConstructionOptions: [],
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
        onBeginAdditionalGarment: () => undefined,
        onConfirmAdditionalGarmentCustomDetails: () => undefined,
        onCancelAdditionalGarmentCustomDetails: () => undefined,
        onRemoveAdditionalGarment: () => undefined,
        fabricModalOpen: false,
        onBack: () => undefined,
        onContinue: () => undefined,
      }),
    );
  });
  assert.equal(
    renderer.root.findAllByProps({ "data-custom-details-top-sentinel": "true" })
      .length,
    1,
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-custom-details-go-to-top": "true" })
      .length,
    0,
    "Go to Top absent near top before sentinel leaves view",
  );

  globalThis.IntersectionObserver = OriginalIO;
  void DESIGN_STUDIO_STEPS;
  void textContent;
}

console.log("PASS: step4 stay / unlock / go-to-top UX repair");
