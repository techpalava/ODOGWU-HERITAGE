/**
 * Mounts the actual Design Studio for a Community order whose batch is past
 * its end date: Step 1 shows the closed notice with "Join next open batch"
 * and "Start an individual order instead", and Continue to Fabric is blocked
 * even though Step 1 is complete. With the admin keep-open toggle the same
 * order continues. Requires the Vite production Firebase harness.
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
    location: { search: "" },
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

const batch = (overrides: Partial<Batch>): Batch => ({
  id: "batch-6",
  batchNumber: 6,
  name: "Avatars",
  startDate: "2026-07-06",
  endDate: "2026-09-30",
  duration: "Jul 06 - Sep 30, 2026",
  targetGarments: 72,
  currentGarments: 26,
  currentOrders: 18,
  currentCustomers: 12,
  status: "OPEN",
  allowOrders: true,
  visibility: "PUBLIC",
  isAutoScheduled: false,
  isActive: true,
  ...overrides,
});

// Avatars ended 2026-09-30 (MANUAL, OPEN). Musketeers is open today and later.
const nextOpen = batch({
  id: "batch-8",
  batchNumber: 8,
  name: "Musketeers",
  startDate: "2026-01-01",
  endDate: "2099-01-01",
  isAutoScheduled: true,
  isActive: false,
});

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
    ...(batchId ? { batchId, batchName: "Avatars" } : {}),
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



const configureStore = (batches: Batch[]) => {
  useAppStore.setState({
    businessSettings: DEFAULT_BUSINESS_SETTINGS,
    isLoadingData: false,
    stylesLoadState: "ready",
    batches,
    hasLoadedBatches: true,
    customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG,
    setNotification: () => undefined,
  } as Partial<ReturnType<typeof useAppStore.getState>> as never);
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

// Autosave never runs: nothing is persisted by this test.
const scheduler = {
  schedule: (_callback: () => void, _delayMs: number) => 0,
  cancel: (_handle: unknown) => undefined,
};

type TextNode = { children: ReadonlyArray<TextNode | string> };
const textOf = (node: TextNode): string =>
  node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");

const joined: Batch[] = [];
let individualStarts = 0;

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
        futureDraftAutosaveScheduler: scheduler,
        onJoinCommunityBatch: (selected: Batch) => {
          joined.push(selected);
        },
        onStartFreshIndividualOrder: () => {
          individualStarts += 1;
        },
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
      // Hydration may still be settling.
    }
    await act(async () => {
      await flush();
    });
  }
  return renderer;
};

const continueButtons = (renderer: ReturnType<typeof create>) =>
  renderer.root.findAll(
    (node) =>
      node.type === "button" && node.props?.["aria-label"] === "Continue to Fabric",
  );

const isBlocked = (button: { props: Record<string, unknown> }) =>
  button.props.disabled === true || button.props["aria-disabled"] === "true";

try {
  // Closed: Avatars past its end date with the keep-open toggle off.
  configureStore([batch({}), nextOpen]);
  StorageService.clearGuestOrderSession();
  GuestOrderSessionService.saveFutureDesignDraft(draftFor("batch-6"));
  const closed = await mountStudio();
  const closedRoot = closed.root.findByProps({ id: "design-studio-ten-stage-journey" });
  assert.equal(closedRoot.props["data-order-context-batch-id"], "batch-6");
  assert.equal(closedRoot.props["data-stage-id"], "garment_type");
  assert.equal(closedRoot.props["data-stage-complete"], true, "Step 1 itself is complete");
  const notice = closed.root.findByProps({ "data-testid": "community-batch-closed" });
  const noticeText = textOf(notice);
  assert.match(noticeText, /This batch is closed/);
  assert.match(noticeText, /30 September 2026/);
  const buttons = continueButtons(closed);
  assert.ok(buttons.length > 0, "Step 1 renders Continue to Fabric");
  for (const button of buttons) {
    assert.equal(isBlocked(button), true, "a closed community batch blocks Continue at Step 1");
  }
  const joinNext = closed.root.findByProps({
    "data-testid": "community-batch-closed-join-next",
  });
  assert.match(textOf(joinNext), /Join next open batch: Musketeers/);
  await act(async () => {
    joinNext.props.onClick();
  });
  assert.deepEqual(joined.map((entry) => entry.id), ["batch-8"], "the customer joins only by choice");
  assert.equal(
    closed.root.findByProps({ id: "design-studio-ten-stage-journey" }).props[
      "data-order-context-batch-id"
    ],
    "batch-6",
    "the order is never moved automatically",
  );
  await act(async () => {
    closed.root
      .findByProps({ "data-testid": "community-batch-closed-start-individual" })
      .props.onClick();
  });
  assert.equal(individualStarts, 1);
  await act(async () => closed.unmount());

  // No other open batch: no Join button, the individual option remains.
  configureStore([batch({})]);
  const alone = await mountStudio();
  assert.equal(
    alone.root.findAll(
      (node) => node.props?.["data-testid"] === "community-batch-closed-join-next",
    ).length,
    0,
  );
  assert.equal(
    alone.root.findAll(
      (node) => node.props?.["data-testid"] === "community-batch-closed-start-individual",
    ).length,
    1,
  );
  await act(async () => alone.unmount());

  // Ongoing: the same order continues once the admin keeps Avatars open.
  configureStore([batch({ keepOpenAfterEndDate: true }), nextOpen]);
  const ongoing = await mountStudio();
  assert.equal(
    ongoing.root.findAll((node) => node.props?.["data-testid"] === "community-batch-closed")
      .length,
    0,
    "a kept-open batch shows no closed notice",
  );
  const ongoingButtons = continueButtons(ongoing);
  assert.ok(ongoingButtons.length > 0);
  assert.equal(
    ongoingButtons.some((button) => !isBlocked(button)),
    true,
    "a kept-open batch can continue to Fabric",
  );
  await act(async () => ongoing.unmount());
} finally {
  if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (priorLocalStorage) Object.defineProperty(globalThis, "localStorage", priorLocalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
}

console.log("PASS: closed community batch stops at Step 1 with Join next / individual choices");
