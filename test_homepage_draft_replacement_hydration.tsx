/**
 * Mounts the actual Design Studio hydration effect for homepage draft-context
 * safety. Requires the Vite production Firebase harness.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import DesignStudioView from "./src/components/DesignStudioView";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { GuestOrderSessionService } from "./src/services/guestOrderSessionService";
import { StorageService } from "./src/services/storageService";
import { useAppStore } from "./src/store/useAppStore";
import type { Batch, Fabric, GuestDesignDraft } from "./src/types";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";
import {
  FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE,
  FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
} from "./src/utils/designStudioDraftPersistence";

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
  code: "HYDRATION-FABRIC",
  name: "Hydration Fabric",
  description: "Fixture fabric",
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Fixture",
  price: 12,
  image: "https://example.test/hydration.jpg",
};

const batch = (id: string, name: string, active = false): Batch => ({
  id,
  batchNumber: id === "batch-7" ? 7 : 8,
  name,
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
  isActive: active,
});

const configuredBatches = [batch("batch-7", "Avatars"), batch("batch-8", "Pioneers", true)];

const draftFor = (batchId: string | undefined): GuestDesignDraft =>
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
    selectedFabricCode: "HYDRATION-FABRIC",
    selectedStyleId: null,
    selectedGarment: null,
    designSelections: { accessories: ["persisted-accessory"] },
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
    customerName: "Hydration Customer",
    customerEmail: "hydration@example.test",
    customerPhone: "+31000000000",
    batchType: "community",
    ...(batchId ? { batchId, batchName: batchId === "batch-7" ? "Avatars" : "Pioneers" } : {}),
    customGroupCode: "",
    garmentPieceCount: 1,
    specialInstructions: "persisted details",
    leftoverFabricChoice: "return",
    hasLining: false,
    pricingBreakdown: { total: 65 },
    shippingSnapshot: {},
    fabricAllocations: [],
    updatedAt: "2026-09-12T00:00:00.000Z",
  }) as GuestDesignDraft;

const configureStore = () => {
  useAppStore.setState({
    businessSettings: DEFAULT_BUSINESS_SETTINGS,
    isLoadingData: false,
    stylesLoadState: "ready",
    batches: configuredBatches,
    customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG,
    setNotification: () => undefined,
  } as Partial<ReturnType<typeof useAppStore.getState>> as never);
};

const mountStudio = async () => {
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
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
};

try {
  configureStore();
  StorageService.clearGuestOrderSession();
  GuestOrderSessionService.saveFutureDesignDraft(draftFor("batch-7"));
  const validRenderer = await mountStudio();
  const validRoot = validRenderer.root.findByProps({ id: "design-studio-nine-stage-journey" });
  assert.equal(validRoot.props["data-order-context-type"], "Community");
  assert.equal(
    validRoot.props["data-order-context-batch-id"],
    "batch-7",
    "Actual context-less hydration must retain batch-7, never the current batch-8.",
  );
  assert.equal(validRoot.props["data-future-draft-persistence-status"], "ready");
  await act(async () => validRenderer.unmount());

  StorageService.clearGuestOrderSession();
  GuestOrderSessionService.saveFutureDesignDraft(draftFor(undefined));
  const malformedBytes = storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
  const invalidRenderer = await mountStudio();
  const invalidRoot = invalidRenderer.root.findByProps({ id: "design-studio-nine-stage-journey" });
  assert.equal(invalidRoot.props["data-stage-id"], "garment_type");
  assert.equal(invalidRoot.props["data-future-draft-persistence-status"], "invalid");
  assert.equal(invalidRoot.props["data-persisted-order-context-status"], "invalid");
  assert.notEqual(
    invalidRoot.props["data-order-context-batch-id"],
    "batch-8",
    "Malformed persisted Community identity must not attach the current batch.",
  );
  assert.equal(
    invalidRoot.props["data-stage-complete"],
    false,
    "Malformed persisted selections must not hydrate into the Stage 1 shell.",
  );
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(
    storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE),
    malformedBytes,
    "Invalid canonical draft bytes must not be overwritten by Studio autosave.",
  );
  await act(async () => invalidRenderer.unmount());

  // An actually empty store remains a valid fresh Community entry. The
  // invalid-context sentinel must not suppress this normal homepage outcome.
  StorageService.clearGuestOrderSession();
  storage.removeItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
  storage.removeItem(FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE);
  const emptyRenderer = await mountStudio();
  const emptyRoot = emptyRenderer.root.findByProps({ id: "design-studio-nine-stage-journey" });
  assert.equal(emptyRoot.props["data-persisted-order-context-status"], "empty");
  assert.equal(emptyRoot.props["data-order-context-type"], "Community");
  assert.equal(emptyRoot.props["data-order-context-batch-id"], "batch-8");
  assert.equal(emptyRoot.props["data-future-draft-persistence-status"], "ready");
  await act(async () => emptyRenderer.unmount());
} finally {
  if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (priorLocalStorage) Object.defineProperty(globalThis, "localStorage", priorLocalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
}

console.log("PASS: actual Design Studio context-less and malformed identity hydration");
