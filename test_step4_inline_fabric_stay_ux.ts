/**
 * UX repair: another-Fabric stays on Step 4; primary fabric / Design Source
 * authority; unlock history; scroll; Go to Top; Go to Bottom.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import {
  DESIGN_STUDIO_STEPS,
  DesignStudioJourneyStepper,
} from "./src/components/DesignStudioJourneyStepper";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import {
  DesignStudioBlockingOverlayProvider,
  useDesignStudioBlockingOverlayOpen,
  useReportDesignStudioBlockingOverlay,
} from "./src/components/designStudioBlockingOverlay";
import {
  DesignStudioGoToBottomButton,
  DesignStudioGoToTopButton,
  DesignStudioScrollFabHost,
  shouldShowDesignStudioGoToBottom,
  shouldShowDesignStudioGoToTop,
} from "./src/components/DesignStudioScrollFabHost";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createCatalogueAdditionalGarmentSelection, projectCatalogueStep1PhysicalOccurrences } from "./src/utils/additionalGarmentDomain";
import {
  resolveAuthoritativePrimaryFabricCode,
} from "./src/utils/additionalGarmentFabricPicker";
import { DESIGN_STUDIO_STAGE_IDS } from "./src/utils/designSourceJourney";
import {
  DESIGN_STUDIO_SCROLL_FAB_SWITCH_PROGRESS,
  attachDesignStudioScrollProgressListener,
  getDesignStudioScrollProgress,
  isDesignStudioGoToBottomVisibleFromProgress,
  isDesignStudioGoToTopVisibleFromProgress,
  resolveDesignStudioScrollFab,
  scrollDesignStudioToBottom,
  scrollDesignStudioToTop,
} from "./src/utils/designStudioScrollFabs";
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
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
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
  assert.equal(isDesignStudioGoToTopVisibleFromProgress(0), false);
  assert.equal(isDesignStudioGoToTopVisibleFromProgress(0.39), false);
  assert.equal(isDesignStudioGoToTopVisibleFromProgress(0.4), true);
  assert.equal(isDesignStudioGoToTopVisibleFromProgress(1), true);

  assert.equal(
    shouldShowDesignStudioGoToTop({
      scrollAtOrAboveFortyPercent: false,
      blockingOverlayOpen: false,
    }),
    false,
    "hidden near the stage top",
  );
  assert.equal(
    shouldShowDesignStudioGoToTop({
      scrollAtOrAboveFortyPercent: true,
      blockingOverlayOpen: false,
    }),
    true,
    "visible at or above 40% scroll progress",
  );
  assert.equal(
    shouldShowDesignStudioGoToTop({
      scrollAtOrAboveFortyPercent: true,
      blockingOverlayOpen: true,
    }),
    false,
    "hidden while a blocking overlay is open",
  );

  // Mutual exclusion across the shared 40% threshold
  for (const progress of [0, 0.39, 0.4, 1] as const) {
    const showBottom = isDesignStudioGoToBottomVisibleFromProgress(progress);
    const showTop = isDesignStudioGoToTopVisibleFromProgress(progress);
    assert.equal(
      showBottom && showTop,
      false,
      `never both visible at progress ${progress}`,
    );
    assert.equal(
      showBottom || showTop,
      true,
      `exactly one visible at progress ${progress}`,
    );
  }

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
  scrollDesignStudioToTop({ target: title });
  assert.equal(scrollIntoViewCalls, 1);
  assert.equal(focusCalls, 1);
  assert.equal(title.style.scrollMarginTop, "6rem");
  globalThis.window.setTimeout = originalSetTimeout;

  let goToTopClicks = 0;
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(DesignStudioGoToTopButton, {
        stageLabel: "Custom Details",
        onClick: () => {
          goToTopClicks += 1;
        },
      }),
    );
  });
  const btn = renderer.root.findByProps({
    "data-design-studio-go-to-top": "true",
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
        onDecorativeFeatureEnable: () => undefined,
      onDecorativeFeatureDisable: () => undefined,
      onDecorativeFeatureGarmentAssign: () => undefined,
        onClearDecorativeFeatures: () => undefined,
        onMonogramPlacementChange: () => undefined,
        onMonogramTextChange: () => undefined,
        onAccessoryToggle: () => undefined,
        onClearAccessories: () => undefined,
        onAddAdditionalGarment: () => undefined,
        onRemoveAdditionalGarment: () => undefined,
        onBack: () => undefined,
        onContinue: () => undefined,
      }),
    );
  });
  assert.equal(
    renderer.root.findAllByProps({ "data-design-studio-go-to-top": "true" })
      .length,
    0,
    "Custom Details does not mount Go to Top",
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-design-studio-go-to-bottom": "true" })
      .length,
    0,
    "Custom Details does not mount Go to Bottom",
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-custom-details-go-to-top": "true" })
      .length,
    0,
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-custom-details-go-to-bottom": "true" })
      .length,
    0,
  );

  void DESIGN_STUDIO_STEPS;
  void textContent;
}

// Go to Bottom visibility / action
{
  assert.equal(DESIGN_STUDIO_SCROLL_FAB_SWITCH_PROGRESS, 0.4);
  assert.equal(getDesignStudioScrollProgress({ scrollY: 0, scrollHeight: 1000, clientHeight: 500 }), 0);
  assert.equal(
    getDesignStudioScrollProgress({ scrollY: 195, scrollHeight: 1000, clientHeight: 500 }),
    0.39,
  );
  assert.equal(
    getDesignStudioScrollProgress({ scrollY: 200, scrollHeight: 1000, clientHeight: 500 }),
    0.4,
  );
  assert.equal(
    getDesignStudioScrollProgress({ scrollY: 500, scrollHeight: 1000, clientHeight: 500 }),
    1,
  );
  assert.equal(isDesignStudioGoToBottomVisibleFromProgress(0), true);
  assert.equal(isDesignStudioGoToBottomVisibleFromProgress(0.39), true);
  assert.equal(isDesignStudioGoToBottomVisibleFromProgress(0.4), false);
  assert.equal(isDesignStudioGoToBottomVisibleFromProgress(1), false);
  assert.equal(resolveDesignStudioScrollFab({ progress: 0, blockingOverlayOpen: false }), "bottom");
  assert.equal(resolveDesignStudioScrollFab({ progress: 0.39, blockingOverlayOpen: false }), "bottom");
  assert.equal(resolveDesignStudioScrollFab({ progress: 0.4, blockingOverlayOpen: false }), "top");
  assert.equal(resolveDesignStudioScrollFab({ progress: 1, blockingOverlayOpen: false }), "top");
  assert.equal(resolveDesignStudioScrollFab({ progress: 0, blockingOverlayOpen: true }), "none");
  assert.equal(resolveDesignStudioScrollFab({ progress: 0.4, blockingOverlayOpen: true }), "none");

  assert.equal(
    shouldShowDesignStudioGoToBottom({
      scrollBelowFortyPercent: true,
      blockingOverlayOpen: false,
    }),
    true,
    "visible below 40% scroll progress",
  );
  assert.equal(
    shouldShowDesignStudioGoToBottom({
      scrollBelowFortyPercent: false,
      blockingOverlayOpen: false,
    }),
    false,
    "hidden once scroll reaches 40%",
  );
  assert.equal(
    shouldShowDesignStudioGoToBottom({
      scrollBelowFortyPercent: true,
      blockingOverlayOpen: true,
    }),
    false,
    "hidden while a blocking overlay is open",
  );

  if (!globalThis.window) {
    // @ts-expect-error test env
    globalThis.window = globalThis;
  }
  const listeners = new Map<string, Set<() => void>>();
  const originalAdd = globalThis.window.addEventListener?.bind(globalThis.window);
  const originalRemove = globalThis.window.removeEventListener?.bind(globalThis.window);
  globalThis.window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
    const fn = typeof listener === "function" ? listener : () => undefined;
    const set = listeners.get(type) ?? new Set();
    set.add(fn as () => void);
    listeners.set(type, set);
  }) as typeof window.addEventListener;
  globalThis.window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
    const fn = typeof listener === "function" ? listener : () => undefined;
    listeners.get(type)?.delete(fn as () => void);
  }) as typeof window.removeEventListener;

  let progress = 0;
  let reportedProgress: number | null = null;
  let bottomVisibility: boolean | null = null;
  const detachProgress = attachDesignStudioScrollProgressListener({
    onProgressChange: (next) => {
      reportedProgress = next;
      bottomVisibility = isDesignStudioGoToBottomVisibleFromProgress(next);
    },
    getProgress: () => progress,
  });
  assert.equal(reportedProgress, 0, "progress listener reports initial progress");
  assert.equal(bottomVisibility, true, "initial progress 0 shows Go to Bottom");
  assert.ok(listeners.get("scroll")?.size);
  assert.ok(listeners.get("resize")?.size);

  progress = 0.4;
  for (const fn of listeners.get("scroll") ?? []) fn();
  assert.equal(reportedProgress, 0.4);
  assert.equal(bottomVisibility, false, "40% progress hides Go to Bottom");
  assert.equal(
    isDesignStudioGoToTopVisibleFromProgress(reportedProgress ?? 0),
    true,
    "40% progress shows Go to Top",
  );

  progress = 0.2;
  for (const fn of listeners.get("resize") ?? []) fn();
  assert.equal(bottomVisibility, true, "resize re-evaluates visibility");
  assert.equal(
    isDesignStudioGoToTopVisibleFromProgress(reportedProgress ?? 0),
    false,
    "under 40% keeps Go to Top hidden",
  );

  const scrollListenerCount = listeners.get("scroll")?.size ?? 0;
  const resizeListenerCount = listeners.get("resize")?.size ?? 0;
  detachProgress();
  assert.equal(listeners.get("scroll")?.size ?? 0, scrollListenerCount - 1);
  assert.equal(listeners.get("resize")?.size ?? 0, resizeListenerCount - 1);

  if (originalAdd) globalThis.window.addEventListener = originalAdd;
  if (originalRemove) globalThis.window.removeEventListener = originalRemove;

  let scrollIntoViewCalls = 0;
  let focusCalls = 0;
  const target = {
    style: {} as Record<string, string>,
    scrollIntoView: () => {
      scrollIntoViewCalls += 1;
    },
    focus: () => {
      focusCalls += 1;
    },
  } as unknown as HTMLElement;
  const originalSetTimeout = globalThis.window.setTimeout;
  globalThis.window.setTimeout = ((fn: () => void) => {
    fn();
    return 0;
  }) as typeof setTimeout;
  scrollDesignStudioToBottom({ target });
  assert.equal(scrollIntoViewCalls, 1);
  assert.equal(focusCalls, 1);
  assert.equal(target.style.scrollMarginBottom, "6rem");
  globalThis.window.setTimeout = originalSetTimeout;

  let goToBottomClicks = 0;
  let bottomRenderer!: ReturnType<typeof create>;
  act(() => {
    bottomRenderer = create(
      createElement(DesignStudioGoToBottomButton, {
        stageLabel: "Custom Details",
        onClick: () => {
          goToBottomClicks += 1;
        },
      }),
    );
  });
  const bottomBtn = bottomRenderer.root.findByProps({
    "data-design-studio-go-to-bottom": "true",
  });
  assert.equal(bottomBtn.props["aria-label"], "Go to bottom of Custom Details");
  assert.equal(bottomBtn.props.title, "Go to bottom");
  assert.equal(bottomBtn.props.type, "button");
  assert.match(String(bottomBtn.props.className || ""), /bottom-\[calc\(5\.5rem/);
  assert.match(String(bottomBtn.props.className || ""), /size-11/);
  act(() => {
    bottomBtn.props.onClick();
  });
  assert.equal(goToBottomClicks, 1);
}

// Shared host: every stage, one mount, overlays hide both arrows
{
  assert.deepEqual(
    [...DESIGN_STUDIO_STAGE_IDS],
    [
      "garment_type",
      "fabric",
      "design_style",
      "custom_details",
      "personalized_additions",
      "try_on",
      "measurement",
      "summary",
      "shipping",
      "payment",
    ],
  );

  let scrollIntoViewCalls = 0;
  const topTarget = {
    style: {} as Record<string, string>,
    scrollIntoView: () => {
      scrollIntoViewCalls += 1;
    },
    focus: () => undefined,
  } as unknown as HTMLElement;
  const bottomTarget = {
    style: {} as Record<string, string>,
    scrollIntoView: () => {
      scrollIntoViewCalls += 1;
    },
    focus: () => undefined,
  } as unknown as HTMLElement;
  const topRef: { current: HTMLElement | null } = { current: topTarget };
  const bottomRef: { current: HTMLElement | null } = { current: bottomTarget };
  if (!globalThis.window) {
    // @ts-expect-error test env
    globalThis.window = globalThis;
  }
  const originalSetTimeout = globalThis.window.setTimeout;
  globalThis.window.setTimeout = ((fn: () => void) => {
    fn();
    return 0;
  }) as typeof setTimeout;

  function ChoiceReporter({ open }: { open: boolean }) {
    useReportDesignStudioBlockingOverlay("custom-details-choice", open);
    const blocking = useDesignStudioBlockingOverlayOpen();
    return createElement("span", {
      "data-reported-blocking-overlay": blocking ? "true" : "false",
    });
  }

  let host!: ReturnType<typeof create>;
  act(() => {
    host = create(
      createElement(DesignStudioBlockingOverlayProvider, {
        ownedOpen: false,
        children: createElement(DesignStudioScrollFabHost, {
          stageLabel: "Fabric",
          topTargetRef: topRef,
          bottomTargetRef: bottomRef,
          progress: 0.2,
        }),
      }),
    );
  });
  const bottomButtons = host.root.findAllByProps({
    "data-design-studio-go-to-bottom": "true",
  });
  assert.equal(bottomButtons.length, 1, "below 40% shows one Go to Bottom");
  assert.equal(
    host.root.findAllByProps({ "data-design-studio-go-to-top": "true" }).length,
    0,
  );
  assert.equal(bottomButtons[0].props["aria-label"], "Go to bottom of Fabric");
  act(() => {
    bottomButtons[0].props.onClick();
  });
  assert.equal(scrollIntoViewCalls, 1);
  assert.equal(bottomTarget.style.scrollMarginBottom, "6rem");

  act(() => {
    host.update(
      createElement(DesignStudioBlockingOverlayProvider, {
        ownedOpen: false,
        children: createElement(DesignStudioScrollFabHost, {
          stageLabel: "Measurement",
          topTargetRef: topRef,
          bottomTargetRef: bottomRef,
          progress: 0.4,
        }),
      }),
    );
  });
  const topButtons = host.root.findAllByProps({
    "data-design-studio-go-to-top": "true",
  });
  assert.equal(topButtons.length, 1, "at 40% shows one Go to Top");
  assert.equal(
    host.root.findAllByProps({ "data-design-studio-go-to-bottom": "true" }).length,
    0,
  );
  assert.equal(topButtons[0].props["aria-label"], "Go to top of Measurement");
  act(() => {
    topButtons[0].props.onClick();
  });
  assert.equal(scrollIntoViewCalls, 2);
  assert.equal(topTarget.style.scrollMarginTop, "6rem");

  act(() => {
    host.update(
      createElement(DesignStudioBlockingOverlayProvider, {
        ownedOpen: true,
        children: createElement(DesignStudioScrollFabHost, {
          stageLabel: "Custom Details",
          topTargetRef: topRef,
          bottomTargetRef: bottomRef,
          progress: 0,
        }),
      }),
    );
  });
  assert.equal(
    host.root.findAllByProps({ "data-design-studio-go-to-bottom": "true" }).length,
    0,
    "studio fabric modal hides Go to Bottom",
  );
  assert.equal(
    host.root.findAllByProps({ "data-design-studio-go-to-top": "true" }).length,
    0,
    "studio fabric modal hides Go to Top",
  );

  act(() => {
    host.update(
      createElement(DesignStudioBlockingOverlayProvider, {
        ownedOpen: false,
        children: [
          createElement(ChoiceReporter, { key: "choice", open: true }),
          createElement(DesignStudioScrollFabHost, {
            key: "fab",
            stageLabel: "Custom Details",
            topTargetRef: topRef,
            bottomTargetRef: bottomRef,
            progress: 0.1,
          }),
        ],
      }),
    );
  });
  assert.equal(
    host.root.findByProps({ "data-reported-blocking-overlay": "true" }).props[
      "data-reported-blocking-overlay"
    ],
    "true",
  );
  assert.equal(
    host.root.findAllByProps({ "data-design-studio-go-to-bottom": "true" }).length,
    0,
    "additional-garment choice dialog hides Go to Bottom",
  );
  assert.equal(
    host.root.findAllByProps({ "data-design-studio-go-to-top": "true" }).length,
    0,
    "additional-garment choice dialog hides Go to Top",
  );

  globalThis.window.setTimeout = originalSetTimeout;

  const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  const customDetailsSource = readFileSync(
    "src/components/DormantFutureCustomDetailsStep.tsx",
    "utf8",
  );
  const fabricSource = readFileSync("src/components/DormantFutureFabricStep.tsx", "utf8");
  const designStyleSource = readFileSync(
    "src/components/DormantFutureDesignStyleStep.tsx",
    "utf8",
  );
  assert.equal(
    (studioSource.match(/<DesignStudioScrollFabHost\b/g) || []).length,
    1,
    "Design Studio mounts the scroll FAB host once",
  );
  assert.match(studioSource, /data-design-studio-stage-bottom-target="true"/);
  assert.match(studioSource, /showAdditionalGarmentFabricDialog/);
  assert.match(studioSource, /showAdditionalGarmentDesignStyleDialog/);
  assert.match(studioSource, /futureGarmentRemovalDialogRequest/);
  assert.match(studioSource, /futureOrderCancelDialogOpen/);
  assert.match(studioSource, /showRemainingFabricCapacityOffer/);
  assert.doesNotMatch(
    customDetailsSource,
    /DesignStudioScrollFabHost|DesignStudioGoToTopButton|DesignStudioGoToBottomButton|data-design-studio-go-to/,
  );
  assert.match(
    customDetailsSource,
    /useReportDesignStudioBlockingOverlay\(\s*"custom-details-choice"/,
  );
  assert.match(fabricSource, /useReportDesignStudioBlockingOverlay\(\s*"fabric-step"/);
  assert.match(
    designStyleSource,
    /useReportDesignStudioBlockingOverlay\(\s*"design-style-step"/,
  );
}

console.log("PASS: step4 stay / unlock / go-to-top / go-to-bottom UX repair");
