/**
 * Mounted guest-load + Studio autosave preservation for invalid measurements.
 * Requires the Vite production Firebase harness.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import DesignStudioView from "./src/components/DesignStudioView";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import {
  GUEST_ORDER_SESSION_VERSION,
  GuestOrderSessionService,
  normalizeGuestDesignDraft,
} from "./src/services/guestOrderSessionService";
import { StorageService } from "./src/services/storageService";
import { useAppStore } from "./src/store/useAppStore";
import type { Fabric, GuestDesignDraft, GuestOrderSession } from "./src/types";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";
import {
  FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
  GUEST_ORDER_SESSION_STORAGE_NAMESPACE,
} from "./src/utils/designStudioDraftPersistence";
import {
  classifyFutureMeasurementHydration,
  createEmptyFutureMeasurementState,
  FUTURE_MEASUREMENT_INVALID_HYDRATION_MESSAGE,
} from "./src/utils/measurementBlueprint";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

class DeterministicAutosaveScheduler {
  private nextHandle = 0;
  private readonly callbacks = new Map<number, () => void>();
  cancelCount = 0;
  get pending() {
    return this.callbacks.size;
  }
  schedule(callback: () => void, _delayMs: number): number {
    const handle = ++this.nextHandle;
    this.callbacks.set(handle, callback);
    return handle;
  }
  cancel(handle: unknown): void {
    if (typeof handle === "number") {
      this.cancelCount += 1;
      this.callbacks.delete(handle);
    }
  }
  runAll(): void {
    while (this.callbacks.size > 0) {
      const queued = [...this.callbacks.entries()];
      this.callbacks.clear();
      queued.forEach(([, callback]) => callback());
    }
  }
}

const storage = new MemoryStorage();
const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const priorLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: storage,
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
  value: storage,
});

const fabric: Fabric = {
  code: "INVALID-DRAFT-FABRIC",
  name: "Invalid Draft Fabric",
  description: "Fixture fabric",
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Fixture",
  price: 12,
  image: "https://example.test/invalid-draft.jpg",
};

const emptyBag = { shared: {}, byGarmentKey: {} };

const malformedSampleMeasurements = {
  schemaVersion: 1,
  route: "sample_cloth",
  unit: "inch",
  entered: emptyBag,
  enteredByRoute: {
    low_risk: emptyBag,
    medium_risk: emptyBag,
    high_risk: emptyBag,
    critical_risk: emptyBag,
    sample_cloth: "malformed",
  },
  derived: emptyBag,
};

const malformedLowMeasurements = {
  schemaVersion: 1,
  route: "low_risk",
  unit: "inch",
  entered: emptyBag,
  enteredByRoute: {
    low_risk: "malformed",
    medium_risk: emptyBag,
    high_risk: emptyBag,
    critical_risk: emptyBag,
    sample_cloth: emptyBag,
  },
  derived: emptyBag,
};

const oldThreeRouteMeasurements = {
  schemaVersion: 1,
  route: "low_risk",
  unit: "inch",
  entered: {
    shared: { total_height: { valueCm: 180, provenance: "customer_entered" } },
    byGarmentKey: {},
  },
  derived: emptyBag,
  blueprintVersion: "measurement-blueprint-v1",
  formulaVersion: null,
  inputFingerprint: "",
  calculationStatus: "incomplete",
  diagnostics: [],
  invalidInputKeys: [],
};

const oldFourRouteMeasurements = {
  schemaVersion: 1,
  route: "medium_risk",
  unit: "cm",
  entered: {
    shared: { total_height: { valueCm: 180, provenance: "customer_entered" } },
    byGarmentKey: {},
  },
  enteredByRoute: {
    low_risk: emptyBag,
    medium_risk: {
      shared: { total_height: { valueCm: 180, provenance: "customer_entered" } },
      byGarmentKey: {},
    },
    high_risk: emptyBag,
    critical_risk: emptyBag,
  },
  derived: emptyBag,
  blueprintVersion: "measurement-blueprint-v1",
  formulaVersion: null,
  inputFingerprint: "",
  calculationStatus: "incomplete",
  diagnostics: [],
  invalidInputKeys: [],
};

const validSampleMeasurements = {
  schemaVersion: 1,
  route: "sample_cloth",
  unit: "inch",
  entered: {
    shared: {
      chest_bust_circumference: { valueCm: 50.8, provenance: "customer_entered" },
    },
    byGarmentKey: {},
  },
  enteredByRoute: {
    low_risk: emptyBag,
    medium_risk: emptyBag,
    high_risk: emptyBag,
    critical_risk: emptyBag,
    sample_cloth: {
      shared: {
        chest_bust_circumference: { valueCm: 50.8, provenance: "customer_entered" },
      },
      byGarmentKey: {},
    },
  },
  derived: emptyBag,
  blueprintVersion: "measurement-blueprint-v1",
  formulaVersion: null,
  inputFingerprint: "",
  calculationStatus: "incomplete",
  diagnostics: [],
  invalidInputKeys: [],
};

const makeDraft = (overrides: Record<string, unknown> = {}): GuestDesignDraft =>
  ({
    journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
    currentStageId: "garment_type",
    currentStep: 1,
    garmentTypeSelection: {
      garmentTypes: ["shirt"],
      demographic: "male",
      constructionByGarment: {},
    },
    aiTryOnWorkflow: { schemaVersion: 1, status: "skipped", inputFingerprint: null },
    selectedFabricCode: fabric.code,
    selectedStyleId: null,
    selectedGarment: null,
    designSelections: { accessories: [] },
    measurements: {
      height: 180,
      weight: 80,
      age: 40,
      bodyBuild: "Average",
      fitPreference: "Standard",
      neck: 16,
      shoulder: 18,
      chest: 40,
      waist: 34,
      hip: 40,
      sleeve: 25,
      trouserLength: 42,
      isAiEstimated: false,
      unit: "inch",
    },
    sizingMode: "manual",
    deliveryMethod: null,
    deliveryAddress: { addressLine1: "", city: "", postalCode: "", countryCode: "" },
    pickupTime: "",
    customerName: "Invalid Draft Customer",
    customerEmail: "invalid-draft@example.test",
    customerPhone: "+31000000000",
    batchType: "community",
    customGroupCode: "",
    garmentPieceCount: 1,
    specialInstructions: "",
    leftoverFabricChoice: "return",
    hasLining: false,
    pricingBreakdown: { total: 65 },
    shippingSnapshot: {},
    fabricAllocations: [],
    updatedAt: "2026-09-21T00:00:00.000Z",
    ...overrides,
  }) as GuestDesignDraft;

const readV1Draft = (): GuestDesignDraft | null => {
  const raw = storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { draft?: GuestDesignDraft };
  return parsed.draft || null;
};

const readV1Measurements = (): unknown => readV1Draft()?.futureMeasurementState;

const isEmptyReplacement = (value: unknown): boolean => {
  if (value == null) return false;
  const empty = createEmptyFutureMeasurementState();
  return JSON.stringify(value) === JSON.stringify(empty);
};

const routeBag = (value: unknown, route: string): unknown => {
  if (!value || typeof value !== "object") return undefined;
  const enteredByRoute = (value as { enteredByRoute?: Record<string, unknown> }).enteredByRoute;
  return enteredByRoute?.[route];
};

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

const collectText = (
  node: { children?: unknown; props?: { children?: unknown } } | string | number | boolean | null | undefined,
): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node !== "object") return "";
  const children = (node as { children?: unknown; props?: { children?: unknown } }).children
    ?? (node as { props?: { children?: unknown } }).props?.children;
  const list = Array.isArray(children) ? children : children != null ? [children] : [];
  return list.map((child) => collectText(child as never)).join("");
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const mountStudio = async (scheduler: DeterministicAutosaveScheduler) => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      createElement(DesignStudioView, {
        onAddToCart: () => undefined,
        openCartDrawer: () => undefined,
        currentUser: null,
        orderContext: null,
        styles: [],
        fabrics: [fabric],
        futureDraftAutosaveScheduler: scheduler,
      }),
    );
    await flush();
  });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const root = renderer.root.findByProps({ id: "design-studio-ten-stage-journey" });
      if (root.props["data-future-draft-persistence-status"] === "ready") {
        return renderer;
      }
    } catch {
      // Auth/hydration may still be settling.
    }
    await act(async () => {
      await flush();
    });
  }
  return renderer;
};

const unmountStudio = async (renderer: ReturnType<typeof create>) => {
  await act(async () => {
    renderer.unmount();
  });
};

const seedV1 = (draft: GuestDesignDraft) => {
  StorageService.clearGuestOrderSession();
  storage.removeItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
  GuestOrderSessionService.saveFutureDesignDraft(draft);
};

const caseResults: Array<{ id: number; name: string; status: "PASS" }> = [];
const recordPass = (id: number, name: string) => {
  caseResults.push({ id, name, status: "PASS" });
  console.log(`PASS: write-path case ${id} ${name}`);
};

try {
  configureStore();

  // CASE 1 — absent measurement state
  {
    const scheduler = new DeterministicAutosaveScheduler();
    const absentDraft = makeDraft();
    delete (absentDraft as { futureMeasurementState?: unknown }).futureMeasurementState;
    assert.equal("futureMeasurementState" in absentDraft, false);
    seedV1(absentDraft);
    const renderer = await mountStudio(scheduler);
    await act(async () => {
      scheduler.runAll();
      await flush();
    });
    const loaded = GuestOrderSessionService.getFutureDesignDraft();
    const hydration = classifyFutureMeasurementHydration(loaded?.futureMeasurementState);
    assert.notEqual(hydration.status, "invalid");
    await unmountStudio(renderer);
    GuestOrderSessionService.saveFutureDesignDraft(
      makeDraft({ futureMeasurementState: validSampleMeasurements }),
    );
    const afterSave = GuestOrderSessionService.getFutureDesignDraft();
    assert.equal(afterSave?.futureMeasurementState?.route, "sample_cloth");
    assert.equal(
      afterSave?.futureMeasurementState?.entered.shared.chest_bust_circumference?.valueCm,
      50.8,
    );
    recordPass(1, "absent measurement state initializes and later valid save works");
  }

  // CASE 2 — valid empty measurement state
  {
    const scheduler = new DeterministicAutosaveScheduler();
    const empty = createEmptyFutureMeasurementState();
    seedV1(makeDraft({ futureMeasurementState: empty }));
    const renderer = await mountStudio(scheduler);
    await act(async () => {
      scheduler.runAll();
      await flush();
    });
    const loaded = GuestOrderSessionService.getFutureDesignDraft();
    assert.equal(classifyFutureMeasurementHydration(loaded?.futureMeasurementState).status, "valid");
    assert.equal(loaded?.futureMeasurementState?.route, null);
    assert.equal(renderer.root.findAllByType(DormantFutureMeasurementStep).length, 0);
    await unmountStudio(renderer);
    recordPass(2, "valid empty measurement state is accepted");
  }

  // CASE 3 — old three-route draft
  {
    const scheduler = new DeterministicAutosaveScheduler();
    seedV1(makeDraft({ futureMeasurementState: oldThreeRouteMeasurements }));
    const guestNormalized = normalizeGuestDesignDraft(
      makeDraft({ futureMeasurementState: oldThreeRouteMeasurements }),
    );
    assert.equal(guestNormalized.futureMeasurementState?.route, "low_risk");
    assert.equal(
      guestNormalized.futureMeasurementState?.entered.shared.total_height?.valueCm,
      180,
    );
    const renderer = await mountStudio(scheduler);
    await act(async () => {
      scheduler.runAll();
      await flush();
    });
    const loaded = GuestOrderSessionService.getFutureDesignDraft();
    assert.equal(loaded?.futureMeasurementState?.route, "low_risk");
    assert.equal(loaded?.futureMeasurementState?.entered.shared.total_height?.valueCm, 180);
    assert.ok(loaded?.futureMeasurementState?.enteredByRoute?.sample_cloth);
    await unmountStudio(renderer);
    recordPass(3, "old three-route draft survives guest load and Studio autosave");
  }

  // CASE 4 — old four-route draft
  {
    const scheduler = new DeterministicAutosaveScheduler();
    seedV1(makeDraft({ futureMeasurementState: oldFourRouteMeasurements }));
    const renderer = await mountStudio(scheduler);
    await act(async () => {
      scheduler.runAll();
      await flush();
    });
    const loaded = GuestOrderSessionService.getFutureDesignDraft();
    assert.equal(loaded?.futureMeasurementState?.route, "medium_risk");
    assert.equal(loaded?.futureMeasurementState?.entered.shared.total_height?.valueCm, 180);
    assert.ok(loaded?.futureMeasurementState?.enteredByRoute?.sample_cloth);
    assert.deepEqual(loaded?.futureMeasurementState?.enteredByRoute?.sample_cloth, emptyBag);
    await unmountStudio(renderer);
    recordPass(4, "old four-route draft survives; Sample bag initializes empty");
  }

  // CASE 5 — valid Sample draft
  {
    const scheduler = new DeterministicAutosaveScheduler();
    seedV1(makeDraft({ futureMeasurementState: validSampleMeasurements }));
    const renderer = await mountStudio(scheduler);
    await act(async () => {
      scheduler.runAll();
      await flush();
    });
    const loaded = GuestOrderSessionService.getFutureDesignDraft();
    assert.equal(loaded?.futureMeasurementState?.route, "sample_cloth");
    assert.equal(
      loaded?.futureMeasurementState?.entered.shared.chest_bust_circumference?.valueCm,
      50.8,
    );
    await unmountStudio(renderer);
    const remountScheduler = new DeterministicAutosaveScheduler();
    const remounted = await mountStudio(remountScheduler);
    await act(async () => {
      remountScheduler.runAll();
      await flush();
    });
    const restored = GuestOrderSessionService.getFutureDesignDraft();
    assert.equal(restored?.futureMeasurementState?.route, "sample_cloth");
    assert.equal(
      restored?.futureMeasurementState?.entered.shared.chest_bust_circumference?.valueCm,
      50.8,
    );
    await unmountStudio(remounted);
    recordPass(5, "valid Sample draft restores through the application path");
  }

  // CASE 6 — malformed present Sample
  {
    const scheduler = new DeterministicAutosaveScheduler();
    const malformedDraft = makeDraft({ futureMeasurementState: malformedSampleMeasurements });
    const guestNormalized = normalizeGuestDesignDraft(malformedDraft);
    assert.equal(routeBag(guestNormalized.futureMeasurementState, "sample_cloth"), "malformed");
    assert.equal(isEmptyReplacement(guestNormalized.futureMeasurementState), false);
    seedV1(malformedDraft);
    const renderer = await mountStudio(scheduler);
    await act(async () => {
      scheduler.runAll();
      await flush();
    });
    const stored = readV1Measurements();
    assert.equal(routeBag(stored, "sample_cloth"), "malformed");
    assert.equal(isEmptyReplacement(stored), false);
    await unmountStudio(renderer);
    recordPass(6, "malformed Sample is not replaced with empty state");
  }

  // CASE 7 — storage survives hydration, timers, remount
  {
    const scheduler = new DeterministicAutosaveScheduler();
    const malformedDraft = makeDraft({ futureMeasurementState: malformedSampleMeasurements });
    seedV1(malformedDraft);
    const originalRaw = storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
    assert.ok(originalRaw);
    const renderer = await mountStudio(scheduler);
    await act(async () => {
      scheduler.runAll();
      await flush();
    });
    const afterHydrate = readV1Measurements();
    assert.equal(routeBag(afterHydrate, "sample_cloth"), "malformed");
    assert.equal(isEmptyReplacement(afterHydrate), false);
    await unmountStudio(renderer);
    const remountScheduler = new DeterministicAutosaveScheduler();
    const remounted = await mountStudio(remountScheduler);
    await act(async () => {
      remountScheduler.runAll();
      await flush();
    });
    const afterRemount = readV1Measurements();
    assert.equal(routeBag(afterRemount, "sample_cloth"), "malformed");
    await unmountStudio(remounted);
    recordPass(7, "malformed Sample survives hydrate, timers, and remount");
  }

  // CASE 8 — outer guest persist does not treat invalid as no-draft
  {
    const malformedDraft = makeDraft({ futureMeasurementState: malformedSampleMeasurements });
    const session: GuestOrderSession = {
      schemaVersion: GUEST_ORDER_SESSION_VERSION,
      guestCartId: "guest_invalid_measurements",
      status: "ACTIVE",
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
      checkoutIntent: false,
      cartItems: [],
      designDraft: malformedDraft,
    };
    StorageService.saveGuestOrderSession(session);
    const before = JSON.parse(
      storage.getItem(GUEST_ORDER_SESSION_STORAGE_NAMESPACE) || "null",
    ) as GuestOrderSession;
    assert.equal(routeBag(before.designDraft?.futureMeasurementState, "sample_cloth"), "malformed");
    const active = GuestOrderSessionService.getActiveSession();
    assert.ok(active.designDraft);
    assert.equal("futureMeasurementState" in (active.designDraft || {}), true);
    assert.equal(routeBag(active.designDraft?.futureMeasurementState, "sample_cloth"), "malformed");
    const after = JSON.parse(
      storage.getItem(GUEST_ORDER_SESSION_STORAGE_NAMESPACE) || "null",
    ) as GuestOrderSession;
    assert.equal("futureMeasurementState" in (after.designDraft || {}), true);
    assert.equal(routeBag(after.designDraft?.futureMeasurementState, "sample_cloth"), "malformed");
    assert.equal(isEmptyReplacement(after.designDraft?.futureMeasurementState), false);
    recordPass(8, "outer guest persist keeps the original invalid measurement entry");
  }

  // CASE 9 — queued autosave cannot empty; cancelled timers cannot overwrite later valid data
  {
    const scheduler = new DeterministicAutosaveScheduler();
    seedV1(makeDraft({ futureMeasurementState: malformedSampleMeasurements }));
    const renderer = await mountStudio(scheduler);
    await act(async () => {
      scheduler.runAll();
      await flush();
    });
    assert.equal(
      routeBag(readV1Measurements(), "sample_cloth"),
      "malformed",
      "A queued Studio autosave must keep the original malformed Sample payload.",
    );
    await unmountStudio(renderer);
    assert.equal(scheduler.pending, 0, "unmount must cancel any queued autosave");
    seedV1(makeDraft({ futureMeasurementState: validSampleMeasurements }));
    const validScheduler = new DeterministicAutosaveScheduler();
    const validRenderer = await mountStudio(validScheduler);
    await act(async () => {
      scheduler.runAll();
      validScheduler.runAll();
      await flush();
    });
    const afterValid = GuestOrderSessionService.getFutureDesignDraft();
    assert.equal(afterValid?.futureMeasurementState?.route, "sample_cloth");
    assert.equal(
      afterValid?.futureMeasurementState?.entered.shared.chest_bust_circumference?.valueCm,
      50.8,
    );
    assert.notEqual(routeBag(afterValid?.futureMeasurementState, "sample_cloth"), "malformed");
    await unmountStudio(validRenderer);
    recordPass(9, "queued invalid autosave cannot overwrite later valid data");
  }

  // CASE 10 — other edits and navigation cannot bypass protection
  {
    const scheduler = new DeterministicAutosaveScheduler();
    seedV1(makeDraft({
      futureMeasurementState: malformedSampleMeasurements,
      specialInstructions: "keep-me",
    }));
    const renderer = await mountStudio(scheduler);
    await act(async () => {
      renderer.root.findByProps({ "data-testid": "step1-garment-select-trouser" }).props.onClick();
      await flush();
    });
    await act(async () => {
      scheduler.runAll();
      await flush();
    });
    const stored = GuestOrderSessionService.getFutureDesignDraft();
    assert.equal(routeBag(stored?.futureMeasurementState, "sample_cloth"), "malformed");
    assert.equal(isEmptyReplacement(stored?.futureMeasurementState), false);
    const measurementSteps = renderer.root.findAllByType(DormantFutureMeasurementStep);
    if (measurementSteps.length > 0) {
      const step = measurementSteps[0]!;
      assert.equal(step.props.hydrationInvalid, true);
      const continueButtons = renderer.root.findAllByType("button").filter((button) =>
        collectText(button).includes("Continue to Summary"),
      );
      continueButtons.forEach((button) => {
        assert.equal(button.props.disabled, true);
      });
      assert.match(collectText(renderer.root), new RegExp(FUTURE_MEASUREMENT_INVALID_HYDRATION_MESSAGE));
      step.props.onRouteChange("low_risk");
      step.props.onChange(createEmptyFutureMeasurementState());
    }
    await unmountStudio(renderer);
    const afterUnmount = readV1Measurements();
    assert.equal(routeBag(afterUnmount, "sample_cloth"), "malformed");
    recordPass(10, "other-field edits, route attempts, and unmount keep the invalid payload");
  }

  // CASE 11 — next valid draft is not blocked by the previous invalid guard
  {
    const scheduler = new DeterministicAutosaveScheduler();
    seedV1(makeDraft({ futureMeasurementState: validSampleMeasurements }));
    const renderer = await mountStudio(scheduler);
    await act(async () => {
      scheduler.runAll();
      await flush();
    });
    await act(async () => {
      renderer.root.findByProps({ "data-testid": "step1-garment-select-trouser" }).props.onClick();
      await flush();
    });
    await act(async () => {
      scheduler.runAll();
      await flush();
    });
    const loaded = GuestOrderSessionService.getFutureDesignDraft();
    assert.equal(loaded?.futureMeasurementState?.route, "sample_cloth");
    assert.equal(
      loaded?.futureMeasurementState?.entered.shared.chest_bust_circumference?.valueCm,
      50.8,
    );
    GuestOrderSessionService.saveFutureDesignDraft({
      ...loaded!,
      specialInstructions: "written-after-invalid-guard",
    });
    const rewritten = GuestOrderSessionService.getFutureDesignDraft();
    assert.equal(rewritten?.specialInstructions, "written-after-invalid-guard");
    assert.equal(rewritten?.futureMeasurementState?.route, "sample_cloth");
    await unmountStudio(renderer);
    recordPass(11, "subsequent valid draft remains writable");
  }

  // CASE 12 — other malformed route bags use the same boundary
  {
    const scheduler = new DeterministicAutosaveScheduler();
    const malformedDraft = makeDraft({ futureMeasurementState: malformedLowMeasurements });
    const guestNormalized = normalizeGuestDesignDraft(malformedDraft);
    assert.equal(routeBag(guestNormalized.futureMeasurementState, "low_risk"), "malformed");
    seedV1(malformedDraft);
    const renderer = await mountStudio(scheduler);
    await act(async () => {
      scheduler.runAll();
      await flush();
    });
    const stored = readV1Measurements();
    assert.equal(routeBag(stored, "low_risk"), "malformed");
    assert.equal(isEmptyReplacement(stored), false);
    await unmountStudio(renderer);
    recordPass(12, "malformed Low Risk uses the same preservation boundary");
  }

  assert.equal(caseResults.length, 12);
  console.log("PASS: measurement invalid-draft write-path cases 1-12");
} finally {
  if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (priorLocalStorage) Object.defineProperty(globalThis, "localStorage", priorLocalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
}
