/**
 * Exercises the real App -> HomeView -> homepage replacement dialog path with
 * the production guest preflight. The legacy source is written directly only
 * to seed the old storage format; the App must not write it during preflight.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import App from "./src/App";
// Warm the exact lazy module before mounting App so react-test-renderer can
// commit the real HomeView within this explicit act boundary.
import "./src/components/HomeView";
import "./src/components/DesignStudioView";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { GuestOrderSessionService } from "./src/services/guestOrderSessionService";
import { useAppStore } from "./src/store/useAppStore";
import type { Batch, GuestDesignDraft } from "./src/types";
import {
  FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE,
  FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
  GUEST_ORDER_SESSION_STORAGE_NAMESPACE,
} from "./src/utils/designStudioDraftPersistence";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  writes = 0;

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
    this.writes += 1;
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.writes += 1;
    this.values.set(key, value);
  }
}

const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();
const keyboardListeners = new Set<(event: KeyboardEvent) => void>();
const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const priorLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const priorSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const priorIntersectionObserver = Object.getOwnPropertyDescriptor(
  globalThis,
  "IntersectionObserver",
);
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage,
    sessionStorage,
    location: { hash: "" },
    scrollY: 0,
    scrollTo: () => undefined,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
    cancelAnimationFrame: () => undefined,
    addEventListener: (type: string, listener: (event: KeyboardEvent) => void) => {
      if (type === "keydown") keyboardListeners.add(listener);
    },
    removeEventListener: (type: string, listener: (event: KeyboardEvent) => void) => {
      if (type === "keydown") keyboardListeners.delete(listener);
    },
  },
});
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: sessionStorage });
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    body: { style: {} },
    getElementById: () => null,
  },
});
Object.defineProperty(globalThis, "IntersectionObserver", {
  configurable: true,
  value: class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
});

const batch: Batch = {
  id: "batch-8",
  batchNumber: 8,
  name: "Pioneers",
  startDate: "2020-01-01T00:00:00.000Z",
  endDate: "2099-01-01T00:00:00.000Z",
  duration: "Open",
  targetGarments: 40,
  currentGarments: 0,
  currentOrders: 0,
  currentCustomers: 0,
  status: "OPEN",
  allowOrders: true,
  visibility: "PUBLIC",
  isAutoScheduled: false,
  isActive: true,
};
const savedBatch: Batch = {
  ...batch,
  id: "batch-7",
  batchNumber: 7,
  name: "Avatars",
  // It remains eligible for exact-draft Continue, but is not the rendered
  // homepage batch because batch-8 has the active manual override.
  isAutoScheduled: true,
  isActive: false,
};

const legacyDraft: GuestDesignDraft = {
  journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
  currentStageId: "garment_type",
  currentStep: 1,
  garmentTypeSelection: {
    garmentTypes: ["shirt"],
    demographic: "male",
    constructionByGarment: {},
  },
  aiTryOnWorkflow: { schemaVersion: 1, status: "skipped", inputFingerprint: null },
  selectedFabricCode: "LEGACY-FABRIC",
  selectedStyleId: null,
  selectedGarment: null,
  designSelections: { accessories: ["legacy-accessory"] },
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
  customerName: "Legacy Customer",
  customerEmail: "legacy@example.test",
  customerPhone: "+31000000000",
  batchType: "community",
  batchId: "batch-7",
  batchName: "Avatars",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "legacy details",
  leftoverFabricChoice: "return",
  hasLining: false,
  pricingBreakdown: {
    customDetailsPrice: 0,
    eindhovenToDestinationShipping: null,
    total: 65,
  },
  shippingSnapshot: {},
  fabricAllocations: [],
  updatedAt: "2026-09-12T00:00:00.000Z",
};

localStorage.values.set(
  GUEST_ORDER_SESSION_STORAGE_NAMESPACE,
  JSON.stringify({
    schemaVersion: "2026-07-30-guest-order-v1",
    guestCartId: "guest-homepage-app-test",
    status: "ACTIVE",
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
    checkoutIntent: false,
    cartItems: [],
    designDraft: legacyDraft,
  }),
);

useAppStore.setState({
  activeTab: "home",
  orderContext: null,
  currentUser: null,
  batches: [savedBatch, batch],
  fabrics: [],
  styles: [],
  showpieces: [],
  communityPhotos: [],
  customers: [],
  orders: [],
  historicalOrders: [],
  cartItems: [],
  isLoadingData: false,
  hasLoadedBatches: true,
  hasLoadedOrders: true,
  hasLoadedBusinessSettings: true,
  stylesLoadState: "ready",
  businessSettings: DEFAULT_BUSINESS_SETTINGS,
  customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG,
  initializeData: async () => undefined,
} as Partial<ReturnType<typeof useAppStore.getState>> as never);

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  await Promise.resolve();
};

let renderer: ReturnType<typeof create> | null = null;
const assertDraftRemainsUntouched = () => {
  assert.equal(localStorage.writes, 0, "Homepage preflight and Cancel must not write legacy storage.");
  assert.equal(localStorage.values.has(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE), false);
  assert.equal(localStorage.values.has(FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE), false);
  assert.equal(
    JSON.parse(localStorage.getItem(GUEST_ORDER_SESSION_STORAGE_NAMESPACE) || "{}").designDraft.batchId,
    "batch-7",
  );
  assert.equal(useAppStore.getState().activeTab, "home");
  assert.equal(useAppStore.getState().orderContext, null);
};
const openMismatch = async () => {
  await act(async () => {
    renderer!.root.findByProps({ id: "btn-quick-join-cohort" }).props.onClick();
    await flush();
  });
  return renderer!.root.findByProps({ "data-homepage-draft-replacement-dialog": "true" });
};

try {
  await act(async () => {
    renderer = create(createElement(App));
    await flush();
  });
  // App shell effects may persist unrelated UI preferences during mount. The
  // following counter starts precisely before the production homepage flow.
  localStorage.writes = 0;

  // Idle backdrop, Escape, and Cancel are all real App interactions. Each
  // must leave the production legacy source untouched and allow reopening.
  let dialog = await openMismatch();
  const backdrop = dialog.parent?.findAllByType("button").find(
    (button) => button.props.tabIndex === -1,
  );
  assert.ok(backdrop, "Expected App mismatch backdrop.");
  await act(async () => backdrop!.props.onClick());
  assertDraftRemainsUntouched();

  await openMismatch();
  await act(async () => {
    for (const listener of keyboardListeners) {
      listener({ key: "Escape", preventDefault: () => undefined } as KeyboardEvent);
    }
  });
  assertDraftRemainsUntouched();

  dialog = await openMismatch();
  await act(async () => {
    dialog.findByProps({ "data-homepage-draft-cancel": "true" }).props.onClick();
  });
  assertDraftRemainsUntouched();

  await openMismatch();
  assertDraftRemainsUntouched();

  // Use a current V1 draft for operation ownership. Both real button handlers
  // begin with an await; invoke the competing action before that continuation
  // can resume to prove the first synchronous BUSY acquisition wins.
  await act(async () => {
    renderer!.root
      .findByProps({ "data-homepage-draft-cancel": "true" })
      .props.onClick();
  });
  localStorage.values.delete(GUEST_ORDER_SESSION_STORAGE_NAMESPACE);
  GuestOrderSessionService.saveFutureDesignDraft(legacyDraft);
  localStorage.writes = 0;

  dialog = await openMismatch();
  await act(async () => {
    dialog.findByProps({ "data-homepage-draft-continue": "true" }).props.onClick();
    dialog
      .findByProps({ "data-homepage-draft-discard-and-join": "true" })
      .props.onClick();
    await flush();
  });
  assert.equal(
    useAppStore.getState().orderContext?.batchId,
    "batch-7",
    "Continue owns the dialog and resumes only the exact saved identity.",
  );
  assert.equal(
    GuestOrderSessionService.inspectFutureDesignDraft().status,
    "valid",
    "Discard attempted during Continue must not clear the V1 draft.",
  );

  await act(async () => {
    useAppStore.setState({ activeTab: "home", orderContext: null });
    await flush();
  });
  dialog = await openMismatch();
  await act(async () => {
    dialog
      .findByProps({ "data-homepage-draft-discard-and-join": "true" })
      .props.onClick();
    dialog.findByProps({ "data-homepage-draft-continue": "true" }).props.onClick();
    await flush();
  });
  assert.equal(
    useAppStore.getState().orderContext?.batchId,
    "batch-8",
    "Discard owns the dialog and may only bootstrap the rendered target batch.",
  );
  assert.equal(
    GuestOrderSessionService.inspectFutureDesignDraft().status,
    "empty",
    "Continue attempted during Discard must not preserve or reopen old state.",
  );
} finally {
  if (renderer) {
    await act(async () => renderer!.unmount());
  }
  if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (priorLocalStorage) Object.defineProperty(globalThis, "localStorage", priorLocalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
  if (priorSessionStorage) Object.defineProperty(globalThis, "sessionStorage", priorSessionStorage);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
  if (priorDocument) Object.defineProperty(globalThis, "document", priorDocument);
  else Reflect.deleteProperty(globalThis, "document");
  if (priorIntersectionObserver) {
    Object.defineProperty(globalThis, "IntersectionObserver", priorIntersectionObserver);
  } else {
    Reflect.deleteProperty(globalThis, "IntersectionObserver");
  }
}

console.log("PASS: mounted App homepage mismatch Cancel, Escape, backdrop, and legacy zero-write safety");
