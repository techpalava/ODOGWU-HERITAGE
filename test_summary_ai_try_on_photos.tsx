/**
 * Saved AI try-on photos on Design Studio Summary.
 * Mounts the real DesignStudioView and DormantFutureSummaryStep.
 * Generation, storage and auth are mocked. No Gemini and no live API.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import DesignStudioView from "./src/components/DesignStudioView";
import { DormantFutureSummaryStep } from "./src/components/DormantFutureSummaryStep";
import { AI_TRY_ON_ORDER_IMAGE_COPY as COPY } from "./src/utils/aiTryOnOrderImageCopy";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { aiTryOnBackgroundJobs } from "./src/services/aiTryOnBackgroundJobs";
import { useAppStore } from "./src/store/useAppStore";
import type { CanonicalPhysicalGarmentType, Fabric, GuestDesignDraft, StyleCategory } from "./src/types";
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
import { AI_TRY_ON_SESSION_HEADER_NAME } from "./src/utils/aiTryOnGatewayContract";

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
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9, 1, 2, 3, 4]);
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    documentElement: { scrollHeight: 1200 },
    createElement: (tag: string) => {
      if (tag !== "canvas") return { style: {} };
      return {
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: "", fillRect() {}, drawImage() {} }),
        toBlob: (callback: (blob: Blob | null) => void) => {
          callback(new Blob([jpegBytes], { type: "image/jpeg" }));
        },
      };
    },
  },
});
Object.defineProperty(globalThis, "createImageBitmap", {
  configurable: true,
  value: async () => ({ width: 600, height: 900, close() {} }),
});
if (typeof URL.createObjectURL !== "function") {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:preview-photo" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
}
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    scrollY: 0,
    innerHeight: 800,
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
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage });

const { StorageService } = await import("./src/services/storageService");
const { GuestOrderSessionService } = await import("./src/services/guestOrderSessionService");

const TOKEN = `tts1_${"a".repeat(43)}`;
const PREVIEW_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

interface StoredPreview {
  previewId: string;
  wearerKey: string;
  inputFingerprint: string;
  modelId?: string;
  expiresAt: string;
  image: { mimeType: string; data: string };
}

const stored = new Map<string, StoredPreview>();
const requests: Array<{ method: string; url: string; token: string | null; authorization: boolean; body: unknown }> = [];
let serial = 0;
let listFingerprintOverride: string | null = null;

const headerValue = (headers: HeadersInit | undefined, name: string): string | null => {
  const bag = new Headers(headers);
  return bag.get(name);
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/api/ai-try-on")) {
    return jsonResponse({ status: "unavailable" }, 404);
  }
  const method = (init?.method || "GET").toUpperCase();
  const token = headerValue(init?.headers, AI_TRY_ON_SESSION_HEADER_NAME);
  const authorization = Boolean(headerValue(init?.headers, "Authorization"));
  let body: unknown = null;
  if (typeof init?.body === "string") {
    try { body = JSON.parse(init.body); } catch { body = init.body; }
  }
  requests.push({ method, url, token, authorization, body });
  const parsed = new URL(url, "http://studio.test");
  if (method === "DELETE") return jsonResponse({ status: "deleted", deleted: 0 });
  if (method === "GET" && parsed.searchParams.get("previewId")) {
    const preview = stored.get(parsed.searchParams.get("previewId") || "");
    if (!token || token !== TOKEN || !preview) {
      return jsonResponse({ status: "error", code: "PREVIEW_NOT_FOUND" }, 404);
    }
    return jsonResponse({
      status: "preview",
      previewId: preview.previewId,
      wearerKey: preview.wearerKey,
      inputFingerprint: preview.inputFingerprint,
      expiresAt: preview.expiresAt,
      image: preview.image,
    });
  }
  if (method === "POST" && parsed.searchParams.get("action") === "session") {
    const owned = token === TOKEN;
    return jsonResponse({
      status: "available",
      triesPerOrder: 5,
      orderTriesRemaining: Math.max(0, 5 - stored.size),
      previews: owned
        ? [...stored.values()].map((preview) => ({
            previewId: preview.previewId,
            wearerKey: preview.wearerKey,
            inputFingerprint: listFingerprintOverride ?? preview.inputFingerprint,
            expiresAt: preview.expiresAt,
            ...(preview.modelId ? { modelId: preview.modelId } : {}),
          }))
        : [],
      sessionToken: owned ? TOKEN : TOKEN,
    });
  }
  if (method === "POST") {
    const request = (body || {}) as { wearerKey?: string; inputFingerprint?: string; defaultModelId?: string; personImage?: unknown };
    const previewId = `tryon-11111111-1111-4111-8111-${String(++serial).padStart(12, "0")}`;
    const preview: StoredPreview = {
      previewId,
      wearerKey: request.wearerKey || "order",
      inputFingerprint: request.inputFingerprint || "",
      ...(request.defaultModelId ? { modelId: request.defaultModelId } : {}),
      expiresAt: "2026-12-08T00:00:00.000Z",
      image: { mimeType: "image/png", data: PREVIEW_PNG },
    };
    stored.set(previewId, preview);
    return jsonResponse({
      status: "completed",
      resultReference: { kind: "verified_private_try_on_result", assetId: previewId, ownerBindingId: "order" },
      previewStored: true,
      image: preview.image,
      orderTriesRemaining: Math.max(0, 5 - stored.size),
      ...(preview.modelId ? { modelId: preview.modelId } : {}),
    });
  }
  return jsonResponse({ status: "unavailable", code: "NOT_CONFIGURED" });
};

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
  image: "https://example.test/fabric.jpg",
};

const styleFor = (id: string, garmentType: CanonicalPhysicalGarmentType): StyleCategory => ({
  id,
  name: `${garmentType} style`,
  category: garmentType === "trouser" ? "Trouser" : "Shirt",
  description: "",
  basePrice: 65,
  image: `https://example.test/${id}.jpg`,
  availableFor: ["male"],
  garmentTypes: [garmentType],
  gender: "male",
  options: [],
  status: "published",
  fabricCapacityComposition: [{ key: `base:${garmentType}`, garmentType, fabricUnits: 1 }],
} as unknown as StyleCategory);

const buildDraft = (garmentTypes: readonly CanonicalPhysicalGarmentType[]) => {
  const styles = garmentTypes.map((garmentType, index) => styleFor(`summary-style-${index}-${garmentType}`, garmentType));
  const garmentTypeSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: [...garmentTypes],
    selectedDemographic: "male",
    normalizedCustomDetailCatalog: inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG).activeOptions,
  }).selection;
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: garmentTypeSelection,
    effectiveGarmentTypeSelection: garmentTypeSelection,
  });
  const styleIdByType = new Map(garmentTypes.map((garmentType, index) => [garmentType, styles[index].id]));
  const selectedStyleIdByGarmentKey: Record<string, string> = {};
  occurrences.forEach((occurrence) => {
    const styleId = styleIdByType.get(occurrence.garmentType);
    if (styleId) selectedStyleIdByGarmentKey[occurrence.garmentKey] = styleId;
  });
  const model = createDesignStyleStepTestModel({
    styles,
    garmentTypeSelection,
    occurrences,
    selectedStyleIdByGarmentKey,
  });
  const plan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection,
    physicalGarments: occurrences.map((item) => ({ garmentKey: item.garmentKey, garmentType: item.garmentType })),
  });
  let measurementState = createEmptyFutureMeasurementState("low_risk", "cm");
  for (const requirement of plan.requirements.filter((item) => item.directInput)) {
    measurementState = setFutureMeasurementInput({
      state: measurementState,
      requirement,
      displayValue: requirement.measurementId === "total_height" ? 180 : 90,
    });
  }
  measurementState = reconcileFutureMeasurementState({ state: measurementState, plan });
  let fabricState = FabricAllocationStateEngine.initialize();
  fabricState = FabricAllocationStateEngine.createAllocationForFabric(fabricState, fabric.code);
  for (const occurrence of occurrences) {
    fabricState = FabricAllocationStateEngine.attemptAppendGarment(fabricState, {
      code: occurrence.garmentType === "shirt" ? "BASE_SHIRT" : `BASE_${occurrence.garmentType.toUpperCase()}`,
      garmentSpec: { key: occurrence.garmentKey, garmentType: occurrence.garmentType, fabricUnits: 1 },
      sourceRole: "main",
    });
  }
  if (fabricState.fabricAllocations.some((allocation) => allocation.garmentAssignments.length !== occurrences.length)) {
    console.log("FABRIC_DEBUG", JSON.stringify({
      occurrenceKeys: occurrences.map((item) => item.garmentKey),
      pending: fabricState.pendingFabricGarment,
      assignments: fabricState.fabricAllocations.map((allocation) => allocation.garmentAssignments),
    }));
  }
  const source = createCatalogDesignSource(model.styles[0].id);
  const draft = {
    journeySchemaVersion: DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION,
    garmentTypeSelection,
    aiTryOnWorkflow: { schemaVersion: 1, status: "ready" as const, inputFingerprint: null },
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
    garmentPieceCount: occurrences.length,
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
    resumeLocus: createDesignStudioResumeLocus({ scrollY: 0 }),
    updatedAt: "2026-11-08T12:00:00.000Z",
    currentStageId: "try_on" as const,
    currentStep: 7,
  } as GuestDesignDraft;
  return { draft, model, occurrences, styles: model.styles, measurementComplete: measurementState.calculationStatus };
};

const orderContext = {
  orderType: "Individual" as const,
  deliveryWindow: "Within 2-3 weeks (Express Air Priority)",
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

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
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
      styles: draftStyles,
      fabrics: [fabric],
      currentUser: null,
      orderContext,
    }));
  });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const root = renderer.root.findAllByProps({ id: "design-studio-ten-stage-journey" })[0];
    if (root?.props["data-future-draft-restoring"] === "false") break;
    await flush();
  }
  return renderer;
};

let draftStyles: StyleCategory[] = [];

const stageOf = (renderer: ReturnType<typeof create>) =>
  renderer.root.findByProps({ id: "design-studio-ten-stage-journey" }).props["data-stage-id"];

const textOf = (node: { children: readonly unknown[] }): string =>
  node.children.map((child) => typeof child === "string" ? child : child && typeof child === "object" && "children" in (child as object) ? textOf(child as { children: readonly unknown[] }) : "").join("");

const clickLabel = async (renderer: ReturnType<typeof create>, pattern: RegExp) => {
  const button = renderer.root.findAll((node) => node.type === "button" && pattern.test(textOf(node as never)))[0];
  assert.ok(button, `missing button ${pattern}`);
  await act(async () => {
    await button.props.onClick();
  });
  await flush();
};

const summaryImages = (renderer: ReturnType<typeof create>) => {
  const summary = renderer.root.findAllByType(DormantFutureSummaryStep)[0];
  if (!summary) return { present: false, images: [], stale: [], grid: null as string | null, classes: [] as string[] };
  const images = summary.findAll((node) => node.type === "img");
  const stale = summary.findAll((node) => node.props["data-ai-try-on-order-preview-stale"] !== undefined);
  const grid = summary.findAll((node) => node.props["data-ai-try-on-order-preview-count"] !== undefined)[0];
  return {
    present: true,
    images: images.map((image) => ({ alt: String(image.props.alt), className: String(image.props.className), src: String(image.props.src).slice(0, 32) })),
    stale: stale.map((node) => String(node.props["data-ai-try-on-order-preview-stale"])),
    grid: grid ? String(grid.props.className) : null,
    classes: images.map((image) => String(image.props.className)),
  };
};

const aiPreviewsOf = (images: ReturnType<typeof summaryImages>) =>
  images.images.filter((image) => image.alt.startsWith("AI try-on preview"));

const chooseModel = async (renderer: ReturnType<typeof create>) => {
  await clickLabel(renderer, /Try it on a model|Choose a model/);
  const model = renderer.root.findAll((node) => node.props["data-ai-try-on-model"] === "male-plus")[0];
  assert.ok(model, "model choice missing");
  await act(async () => { await model.props.onClick(); });
};

const choosePhoto = async (renderer: ReturnType<typeof create>) => {
  const input = renderer.root.find((node) => node.type === "input" && node.props.type === "file");
  const file = new File([jpegBytes], "me.jpg", { type: "image/jpeg" });
  await act(async () => { await input.props.onChange({ target: { files: [file] } }); });
  await flush();
};

const generateVisible = async (renderer: ReturnType<typeof create>) => {
  await clickLabel(renderer, /Generate preview|Generate combined outfit|Use this design/);
  await flush();
};

interface CaseOptions {
  garments: readonly CanonicalPhysicalGarmentType[];
  mode: "model" | "photo";
  outfit: boolean;
  wearers?: readonly string[];
  /** When set, garment i is assigned to wearers[assignment[i]]. */
  assignment?: readonly number[];
}

const observe = async (label: string, options: CaseOptions) => {
  const built = buildDraft(options.garments);
  if (options.wearers && options.wearers.length > 1) {
    const { createWearerProfile } = await import("./src/utils/wearerOrder");
    built.draft.futureMeasurementState = {
      schemaVersion: 2,
      wearers: options.wearers.map((name, index) => createWearerProfile({
        wearerId: `w-${name.toLowerCase()}`,
        displayName: name,
        fitContext: "male",
        presentationOrder: index,
        measurement: built.draft.futureMeasurementState as never,
      })),
      assignmentByGarmentKey: Object.fromEntries(
        built.occurrences.map((occurrence, index) => {
          const wearerIndex = options.assignment?.[index] ?? index % options.wearers!.length;
          return [occurrence.garmentKey, `w-${options.wearers![wearerIndex].toLowerCase()}`];
        }),
      ),
    } as never;
  }
  draftStyles = [...built.styles];
  stored.clear();
  requests.length = 0;
  serial = 0;
  listFingerprintOverride = null;
  aiTryOnBackgroundJobs.discardAll();
  if (built.model.projection.isComplete !== true || built.measurementComplete !== "complete") {
    return {
      label,
      blocked: "fixture",
      styleComplete: built.model.projection.isComplete,
      measurement: built.measurementComplete,
      diagnostics: (built.draft.futureMeasurementState as { diagnostics?: { code?: string }[] })?.diagnostics?.map((item) => item.code) || [],
    };
  }
  const renderer = await mount(built.draft);
  const opened = stageOf(renderer);
  const panel = renderer.root.findAll((node) => node.props["data-ai-try-on-panel"] === "live").length;
  if (opened !== "try_on" || panel !== 1) {
    await act(async () => { renderer.unmount(); });
    return { label, opened, panel, blocked: "stage" };
  }
  const prepare = options.mode === "photo" ? choosePhoto : chooseModel;
  const wearerChips = () => renderer.root.findAll((node) => node.type === "button" && node.props["data-wearer-chip"]);
  const garmentButtons = () => renderer.root.findAll((node) => node.type === "button" && node.props["data-ai-try-on-garment"]);
  const people = wearerChips();
  const generateForCurrentPerson = async () => {
    const garments = garmentButtons();
    if (garments.length === 0) {
      await prepare(renderer);
      await generateVisible(renderer);
      return;
    }
    for (const button of garments) {
      await act(async () => { await button.props.onClick(); });
      await prepare(renderer);
      await generateVisible(renderer);
    }
  };
  if (people.length === 0) await generateForCurrentPerson();
  else {
    for (const chip of people) {
      await act(async () => { await chip.props.onClick(); });
      await generateForCurrentPerson();
    }
  }
  let outfitGenerated = 0;
  if (options.outfit) {
    const peopleNow = wearerChips();
    const targets = peopleNow.length ? peopleNow : [null];
    for (const chip of targets) {
      if (chip) await act(async () => { await chip.props.onClick(); });
      const outfit = renderer.root.findAll((node) => node.props["data-ai-try-on-outfit-mode"])[0];
      if (!outfit) continue;
      await act(async () => { await outfit.props.onClick(); });
      const valueFor = (part: string) => {
        const select = renderer.root.findAll((node) => node.props["data-ai-try-on-outfit-choice"] === part)[0];
        const option = select?.findAll((node) => node.type === "option" && node.props.value)[0];
        return { select, value: option?.props.value as string | undefined };
      };
      const top = valueFor("top");
      const bottom = valueFor("bottom");
      if (!top.select || !bottom.select || !top.value || !bottom.value) {
        await act(async () => { renderer.unmount(); });
        return { label, blocked: "outfit-choices", topValue: top.value || null, bottomValue: bottom.value || null };
      }
      await act(async () => { top.select!.props.onChange({ target: { value: top.value } }); });
      await act(async () => { bottom.select!.props.onChange({ target: { value: bottom.value } }); });
      await prepare(renderer);
      await generateVisible(renderer);
      const single = renderer.root.findAll((node) => node.props["data-ai-try-on-single-mode"])[0];
      if (single) await act(async () => { await single.props.onClick(); });
      outfitGenerated += 1;
    }
    if (outfitGenerated === 0) {
      await act(async () => { renderer.unmount(); });
      return { label, blocked: "no-outfit-control", stored: stored.size };
    }
  }
  await clickLabel(renderer, /Continue to Summary|Continue without AI Try-on/);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); });
  const freshImages = summaryImages(renderer);
  const enlargeButtons = renderer.root.findAllByType(DormantFutureSummaryStep)[0]?.findAll((node) => node.type === "button" && String(node.props["aria-label"] || "").startsWith("See the AI preview")) || [];
  let enlarged = false;
  if (enlargeButtons[0]) {
    await act(async () => { await enlargeButtons[0].props.onClick(); });
    enlarged = renderer.root.findAll((node) => node.props["data-ai-try-on-order-preview-enlarged"] !== undefined).length > 0;
    const close = renderer.root.findAll((node) => node.type === "button" && node.props["aria-label"] === COPY.closeEnlarged)[0];
    if (close) await act(async () => { await close.props.onClick(); });
  }
  const fresh = {
    stage: stageOf(renderer),
    aiPreviews: aiPreviewsOf(freshImages).map((image) => image.alt),
    aiClasses: aiPreviewsOf(freshImages).map((image) => image.className),
    grid: freshImages.grid,
    stale: freshImages.stale,
    enlarged,
    stored: [...stored.values()].map((preview) => ({ wearerKey: preview.wearerKey, modelId: preview.modelId || null })),
    outfitGenerated,
  };
  const autosaved = GuestOrderSessionService.getFutureDesignDraft();
  rememberForStale(autosaved);
  await act(async () => { renderer.unmount(); });
  aiTryOnBackgroundJobs.discardAll();
  const refreshed = await mount(autosaved!);
  const refreshImages = summaryImages(refreshed);
  const refresh = {
    stage: stageOf(refreshed),
    workflow: autosaved?.aiTryOnWorkflow?.status,
    aiPreviews: aiPreviewsOf(refreshImages).map((image) => image.alt),
    grid: refreshImages.grid,
    stale: refreshImages.stale,
    refreshHadToken: requests.filter((entry) => entry.url.includes("action=session")).some((entry) => entry.token === TOKEN),
  };
  const edit = refreshed.root.findAll((node) => node.type === "button" && node.props["aria-label"] === "Edit AI Try-on")[0];
  let returned: { stage: string; aiPreviews: string[] } | null = null;
  if (edit) {
    await act(async () => { await edit.props.onClick(); });
    await flush();
    await clickLabel(refreshed, /Continue to Summary|Continue without AI Try-on/);
    await flush();
    returned = { stage: stageOf(refreshed), aiPreviews: aiPreviewsOf(summaryImages(refreshed)).map((image) => image.alt) };
  }
  await act(async () => { refreshed.unmount(); });
  return { label, opened, fresh, refresh, returned };
};

let savedForStale: GuestDesignDraft | null = null;
const rememberForStale = (draft: GuestDesignDraft | null | undefined) => {
  if (draft && stored.size > 0) savedForStale = draft;
};

const cases: CaseOptions[] = [
  { garments: ["shirt"], mode: "model", outfit: false },
  { garments: ["shirt"], mode: "photo", outfit: false },
  { garments: ["shirt", "trouser"], mode: "model", outfit: false },
  { garments: ["shirt", "trouser"], mode: "photo", outfit: true },
  { garments: ["shirt", "trouser"], mode: "model", outfit: false, wearers: ["Ada", "Obi"] },
];

const results = [];
for (const options of cases) {
  const label = `${options.wearers?.length || 1} wearer, ${options.garments.join("+")}, ${options.mode}, outfit ${options.outfit ? "on" : "off"}`;
  try {
    results.push(await observe(label, options));
  } catch (error) {
    results.push({ label, error: error instanceof Error ? error.message : String(error) });
  }
}

listFingerprintOverride = "tryon-v1-0000000000000000";
aiTryOnBackgroundJobs.discardAll();
const staleDraft = savedForStale;
let stale: unknown = { blocked: "no-draft" };
if (staleDraft && stored.size > 0) {
  const renderer = await mount({ ...staleDraft, currentStageId: "summary", currentStep: 8 });
  const images = summaryImages(renderer);
  stale = {
    stage: stageOf(renderer),
    aiPreviews: aiPreviewsOf(images).map((image) => image.alt),
    stale: images.stale,
    hasStaleCopy: JSON.stringify(renderer.toJSON()).includes("your design changed after this preview"),
  };
  await act(async () => { renderer.unmount(); });
}
results.push({ label: "genuine fingerprint change", stale });
results.push({
  untested: [
    "Uploaded-design mode was not mounted. Generate needs the private Step 3 photo URL, which this draft fixture does not restore.",
    "Two wearers with two garments each was not mounted. A four-garment measurement plan did not complete, and one fabric allocation held only two garments.",
    "Signed-in refresh was not mounted with a Firebase user. The same identity helper supplies that customer's ID token.",
  ],
});
console.log(JSON.stringify(results, null, 2));

for (const result of results) {
  if (!("fresh" in result) || !result.fresh || !("aiPreviews" in result.fresh)) continue;
  assert.ok(result.fresh.aiPreviews.length > 0, `${result.label} fresh Summary hid the saved photo`);
  assert.ok(result.refresh && "aiPreviews" in result.refresh && result.refresh.aiPreviews.length === result.fresh.aiPreviews.length, `${result.label} refresh hid a saved photo`);
  assert.ok(result.returned && result.returned.aiPreviews.length === result.fresh.aiPreviews.length, `${result.label} return from Step 7 hid a saved photo`);
  assert.equal(result.fresh.grid?.includes("sm:grid-cols-2"), false, `${result.label} Summary photos must use the full card width`);
  for (const className of result.fresh.aiClasses || []) {
    assert.equal(className.includes("object-cover") || className.includes("aspect-[2/3]") || className.includes("max-h-[560px]"), false, `${result.label} Summary photo must stay uncropped at the card width`);
    assert.equal(className.includes("w-full") && className.includes("object-contain"), true);
  }
  if (result.refresh && "grid" in result.refresh) {
    assert.equal(result.refresh.grid?.includes("sm:grid-cols-2"), false, `${result.label} refreshed Summary photos must use the full card width`);
  }
}
assert.equal((stale as { aiPreviews: string[] }).aiPreviews?.length, 0, "a changed design must not show the old photo");
assert.equal((stale as { hasStaleCopy: boolean }).hasStaleCopy, true, "a changed design keeps the make-a-new-one notice");
