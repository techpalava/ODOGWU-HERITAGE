/**
 * Refresh on AI Try-on (Step 7) must reopen that step, keep the saved step
 * number, and scroll back to it. A Try-on draft whose Design Style does not
 * revalidate must stop on Design Style, not Step 1.
 *
 * Requires the Vite production Firebase harness.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import DesignStudioView from "./src/components/DesignStudioView";
import { DormantFutureAiTryOnStep } from "./src/components/DormantFutureAiTryOnStep";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { useAppStore } from "./src/store/useAppStore";
import type { Fabric, GuestDesignDraft, StyleCategory } from "./src/types";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  buildAuthoritativePhysicalOccurrences,
  createCatalogDesignSource,
} from "./src/utils/designSourceState";
import { DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";
import { createDesignStudioResumeLocus } from "./src/utils/designStudioResumeLocus";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";
import { createDesignStyleStepTestModel } from "./testing/designStyleStepFixtures";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const memoryStorage = new MemoryStorage();
const scrollTops: number[] = [];
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    scrollY: 640,
    scrollTo: (arg: number | { top?: number }) => {
      scrollTops.push(typeof arg === "number" ? arg : arg.top ?? -1);
    },
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
    location: { search: "", hash: "", pathname: "/" },
    matchMedia: () => ({
      matches: false,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  },
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: memoryStorage,
});

const { StorageService } = await import("./src/services/storageService");
const { GuestOrderSessionService } = await import("./src/services/guestOrderSessionService");

const fabric: Fabric = {
  code: "TRYON-01",
  name: "Try-on Restore Fabric",
  description: "",
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Test",
  price: 12,
};
const styleDraft = {
  id: "tryon-restore-style",
  name: "Try-on Restore Style",
  category: "Shirt",
  description: "",
  basePrice: 65,
  image: "https://example.test/style.jpg",
  availableFor: ["male"],
  garmentTypes: ["shirt"],
  gender: "male",
  options: [],
  status: "published",
  fabricCapacityComposition: [{ key: "base:shirt", garmentType: "shirt", fabricUnits: 1 }],
} as unknown as StyleCategory;
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG).activeOptions,
}).selection;
const occurrences = buildAuthoritativePhysicalOccurrences({
  sourceKind: "catalogue",
  step1GarmentTypeSelection: garmentTypeSelection,
  effectiveGarmentTypeSelection: garmentTypeSelection,
});
const model = createDesignStyleStepTestModel({
  styles: [styleDraft],
  garmentTypeSelection,
  occurrences,
  selectedStyleIdByGarmentKey: Object.fromEntries(
    occurrences.map((item) => [item.garmentKey, styleDraft.id]),
  ),
});
assert.equal(model.projection.isComplete, true);
const shirtPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection,
  physicalGarments: occurrences.map((item) => ({
    garmentKey: item.garmentKey,
    garmentType: item.garmentType,
  })),
});
let measurementState = createEmptyFutureMeasurementState("low_risk", "cm");
for (const requirement of shirtPlan.requirements.filter((item) => item.directInput)) {
  measurementState = setFutureMeasurementInput({
    state: measurementState,
    requirement,
    displayValue: requirement.measurementId === "total_height" ? 180 : 90,
  });
}
measurementState = reconcileFutureMeasurementState({
  state: measurementState,
  plan: shirtPlan,
});
assert.equal(measurementState.calculationStatus, "complete");
let fabricState = FabricAllocationStateEngine.initialize();
fabricState = FabricAllocationStateEngine.createAllocationForFabric(fabricState, fabric.code);
fabricState = FabricAllocationStateEngine.attemptAppendGarment(fabricState, {
  code: "BASE_SHIRT",
  garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
  sourceRole: "main",
});
const source = createCatalogDesignSource(model.styles[0].id);
assert.ok(source);

const orderContext = {
  orderType: "Individual" as const,
  deliveryWindow: "Within 2-3 weeks (Express Air Priority)",
};

const baseDraft = {
  journeySchemaVersion: DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION,
  garmentTypeSelection,
  aiTryOnWorkflow: { schemaVersion: 1, status: "skipped" as const, inputFingerprint: null },
  selectedFabricCode: fabric.code,
  selectedStyleId: model.styles[0].id,
  designSource: source,
  confirmedStyleId: model.styles[0].id,
  confirmedDesignSourceKey: source.sourceKey,
  priceActivatedFabricCode: fabric.code,
  selectedGarment: null,
  designSelections: { accessories: [] },
  measurements: {
    height: 180, weight: 80, age: 40, bodyBuild: "Average", fitPreference: "Standard",
    neck: 16, shoulder: 18, chest: 40, waist: 34, hip: 40, sleeve: 25, trouserLength: 42,
    isAiEstimated: false, unit: "inch" as const,
  },
  sizingMode: "manual" as const,
  deliveryMethod: null,
  deliveryAddress: { addressLine1: "", city: "", postalCode: "", countryCode: "" },
  pickupTime: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  batchType: "alone" as const,
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
    eindhovenToDestinationShipping: 0,
    total: 65,
  },
  shippingSnapshot: {},
  fabricAllocations: fabricState.fabricAllocations,
  designStyleAssignmentDraft: model.hydration.envelope,
  futureMeasurementState: measurementState,
  resumeLocus: createDesignStudioResumeLocus({ scrollY: 640 }),
  updatedAt: "2026-11-03T12:00:00.000Z",
};

const tryOnDraft = {
  ...baseDraft,
  currentStageId: "try_on" as const,
  currentStep: 7,
} as GuestDesignDraft;

const configureStore = () => {
  useAppStore.setState({
    businessSettings: DEFAULT_BUSINESS_SETTINGS,
    isLoadingData: false,
    stylesLoadState: "ready",
    batches: [],
    customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG,
    setNotification: () => undefined,
  } as Partial<ReturnType<typeof useAppStore.getState>> as never);
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const mount = async (draft: GuestDesignDraft) => {
  StorageService.clearGuestOrderSession();
  const saved = GuestOrderSessionService.saveFutureDesignDraft(draft);
  assert.equal(saved?.status, "saved", saved && "reason" in saved ? saved.reason : "save failed");
  configureStore();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(createElement(DesignStudioView, {
      onAddToCart: () => undefined,
      openCartDrawer: () => undefined,
      styles: [...model.styles],
      fabrics: [fabric],
      currentUser: null,
      orderContext,
    }));
    await flush();
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const root = renderer.root.findAllByProps({ id: "design-studio-ten-stage-journey" })[0];
    if (root?.props["data-future-draft-restoring"] === "false") break;
    await act(async () => { await flush(); });
  }
  return renderer;
};

const journey = (renderer: ReturnType<typeof create>) =>
  renderer.root.findByProps({ id: "design-studio-ten-stage-journey" });

const tryOnRenderer = await mount(tryOnDraft);
const tryOnRoot = journey(tryOnRenderer);
assert.equal(tryOnRoot.props["data-future-draft-persistence-status"], "ready");
assert.equal(
  tryOnRoot.props["data-stage-id"],
  "try_on",
  "refreshing a saved AI Try-on draft must reopen Step 7",
);
assert.equal(tryOnRenderer.root.findAllByType(DormantFutureAiTryOnStep).length, 1);
assert.match(
  tryOnRenderer.root.findByProps({ "data-design-studio-stage-target": "try_on" }).props["aria-label"],
  /Step 7 of 10: AI Try-on/,
);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 400));
});
assert.ok(
  scrollTops.includes(640),
  "refresh must restore the saved scroll position for the step the customer was on",
);
const autosaved = GuestOrderSessionService.getFutureDesignDraft();
assert.equal(autosaved?.currentStageId, "try_on");
assert.equal(
  autosaved?.currentStep,
  7,
  "autosave must keep the Step 7 index with the saved stage",
);
await act(async () => { tryOnRenderer.unmount(); });

scrollTops.length = 0;
const reloaded = await mount(autosaved!);
assert.equal(
  journey(reloaded).props["data-stage-id"],
  "try_on",
  "a second reload of the autosaved draft must still open Step 7",
);
await act(async () => { reloaded.unmount(); });

const {
  designStyleAssignmentDraft: _omittedStyleLedger,
  ...draftWithoutStyleLedger
} = baseDraft;
const blockedStyleDraft = {
  ...draftWithoutStyleLedger,
  currentStageId: "try_on" as const,
  currentStep: 7,
  selectedStyleId: null,
  designSource: null,
  confirmedStyleId: null,
  confirmedDesignSourceKey: null,
} as GuestDesignDraft;
const blocked = await mount(blockedStyleDraft);
assert.equal(
  journey(blocked).props["data-stage-id"],
  "design_style",
  "AI Try-on with Fabric saved but Design Style not ready must stop on Design Style, not Step 1",
);
assert.notEqual(journey(blocked).props["data-stage-id"], "garment_type");
await act(async () => { blocked.unmount(); });

console.log("PASS: AI Try-on step restores after reload");
