/**
 * Uploaded-design Summary photos, reached through the real confirmation
 * and Fabric approval clicks. Pricing and confirmation are not seeded.
 * Generation, storage and auth are mocked. No Gemini and no live API.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { onAuthStateChanged } from "firebase/auth";
import DesignStudioView from "./src/components/DesignStudioView";
import { DormantFutureSummaryStep } from "./src/components/DormantFutureSummaryStep";
import { AI_TRY_ON_SUMMARY_IMAGE_CLASS } from "./src/components/AiTryOnOrderPreviewThumbnails";
import { AI_TRY_ON_ORDER_IMAGE_COPY as COPY } from "./src/utils/aiTryOnOrderImageCopy";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { aiTryOnBackgroundJobs } from "./src/services/aiTryOnBackgroundJobs";
import { CustomerDesignUploadService } from "./src/services/customerDesignUploadService";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import { auth } from "./src/services/firebase";
import { useAppStore } from "./src/store/useAppStore";
import type { AuthenticatedFutureDraftRepository } from "./src/services/authenticatedFutureDraftService";
import type { CanonicalPhysicalGarmentType, Fabric, GuestDesignDraft, StyleCategory } from "./src/types";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  buildAuthoritativePhysicalOccurrences,
  createCatalogDesignSource,
  createUploadedDesignSource,
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
import { createWearerProfile } from "./src/utils/wearerOrder";
import { UPLOADED_DESIGN_SOURCE_REGISTRY_SCHEMA_VERSION } from "./src/utils/uploadedDesignSourceRegistry";
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
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9, 1, 2, 3, 4, 5, 6]);
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    documentElement: { scrollHeight: 2400 },
    createElement: (tag: string) => tag === "canvas"
      ? { width: 0, height: 0, getContext: () => ({ fillStyle: "", fillRect() {}, drawImage() {} }), toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob([jpegBytes], { type: "image/jpeg" })) }
      : { style: {} },
  },
});
Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: async () => ({ width: 600, height: 900, close() {} }) });
if (typeof URL.createObjectURL !== "function") {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:uploaded-design" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
}
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    scrollY: 0, innerHeight: 900, scrollTo() {},
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 1; },
    cancelAnimationFrame() {},
    addEventListener() {}, removeEventListener() {},
    localStorage: memoryStorage,
    location: { search: "", hash: "", pathname: "/" },
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
  },
});
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage });

const { StorageService } = await import("./src/services/storageService");
const { GuestOrderSessionService } = await import("./src/services/guestOrderSessionService");

const TOKEN = `tts1_${"c".repeat(43)}`;
const ID_TOKEN = "id-token-signed-in";
const UPLOAD_UID = "upload-owner";
const PREVIEW_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
CustomerDesignUploadService.readCustomerDesignDraft = async () => new Blob([jpegBytes], { type: "image/jpeg" });

interface StoredPreview {
  previewId: string;
  wearerKey: string;
  inputFingerprint: string;
  expiresAt: string;
  image: { mimeType: string; data: string };
  uploaded?: boolean;
}
const stored = new Map<string, StoredPreview>();
const requests: Array<{ method: string; url: string; token: string | null; authorization: string | null }> = [];
let serial = 0;
let listFingerprintOverride: string | null = null;
const headerValue = (headers: HeadersInit | undefined, name: string) => new Headers(headers).get(name);
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ownedRequest = (token: string | null, authorization: string | null) =>
  token === TOKEN || authorization === `Bearer ${ID_TOKEN}`;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("blob:")) return new Response(jpegBytes, { status: 200, headers: { "Content-Type": "image/jpeg" } });
  if (!url.includes("/api/ai-try-on")) return jsonResponse({ status: "unavailable" }, 404);
  const method = (init?.method || "GET").toUpperCase();
  const token = headerValue(init?.headers, AI_TRY_ON_SESSION_HEADER_NAME);
  const authorization = headerValue(init?.headers, "Authorization");
  requests.push({ method, url, token, authorization });
  let body: Record<string, unknown> = {};
  if (typeof init?.body === "string") {
    try { body = JSON.parse(init.body) as Record<string, unknown>; } catch { body = {}; }
  }
  const parsed = new URL(url, "http://studio.test");
  if (method === "DELETE") return jsonResponse({ status: "deleted", deleted: 0 });
  if (method === "GET" && parsed.searchParams.get("previewId")) {
    const preview = stored.get(parsed.searchParams.get("previewId") || "");
    if (!ownedRequest(token, authorization) || !preview) return jsonResponse({ code: "PREVIEW_NOT_FOUND" }, 404);
    return jsonResponse({ status: "preview", previewId: preview.previewId, wearerKey: preview.wearerKey, inputFingerprint: preview.inputFingerprint, expiresAt: preview.expiresAt, image: preview.image });
  }
  if (method === "POST" && parsed.searchParams.get("action") === "session") {
    const owned = ownedRequest(token, authorization);
    return jsonResponse({
      status: "available",
      triesPerOrder: 5,
      orderTriesRemaining: Math.max(0, 5 - stored.size),
      previews: owned ? [...stored.values()].map((preview) => ({
        previewId: preview.previewId,
        wearerKey: preview.wearerKey,
        inputFingerprint: listFingerprintOverride ?? preview.inputFingerprint,
        expiresAt: preview.expiresAt,
      })) : [],
      sessionToken: authorization ? null : TOKEN,
    });
  }
  if (method === "POST") {
    if (stored.size >= 5) return jsonResponse({ status: "error", code: "ORDER_TRY_LIMIT_REACHED", orderTriesRemaining: 0 }, 429);
    const previewId = `tryon-33333333-3333-4333-8333-${String(++serial).padStart(12, "0")}`;
    const preview: StoredPreview = {
      previewId,
      wearerKey: String(body.wearerKey || "order"),
      inputFingerprint: String(body.inputFingerprint || ""),
      expiresAt: "2026-12-08T00:00:00.000Z",
      image: { mimeType: "image/png", data: PREVIEW_PNG },
      uploaded: Boolean(body.uploadedDesignImage),
    };
    stored.set(previewId, preview);
    return jsonResponse({
      status: "completed",
      resultReference: { kind: "verified_private_try_on_result", assetId: previewId, ownerBindingId: "order" },
      previewStored: true,
      image: preview.image,
      triesPerOrder: 5,
      orderTriesRemaining: Math.max(0, 5 - stored.size),
    });
  }
  return jsonResponse({ status: "unavailable" });
};

const setAuthUser = (user: { uid: string; isAnonymous: boolean; email?: string; getIdToken: () => Promise<string | null> } | null) => {
  Object.defineProperty(auth, "currentUser", { configurable: true, get: () => user });
};

const fabricOf = (code: string): Fabric => ({
  code, name: code, description: "", color: "Green", colorHex: "#0A4A33", priceMultiplier: 1,
  stockStatus: "IN_STOCK", category: "Test", price: 12, image: `https://example.test/${code}.jpg`,
});
const styleFor = (garmentType: CanonicalPhysicalGarmentType): StyleCategory => ({
  id: `style-${garmentType}`, name: `${garmentType} style`, category: "Shirt", description: "", basePrice: 65,
  image: `https://example.test/${garmentType}.jpg`, availableFor: ["male"], garmentTypes: [garmentType],
  gender: "male", options: [], status: "published",
  fabricCapacityComposition: [createStyleBaseGarmentSpec(garmentType)],
} as unknown as StyleCategory);

const selectionFor = (types: readonly CanonicalPhysicalGarmentType[]) => reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: [...types],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG).activeOptions,
}).selection;

const completeMeasurement = (types: readonly CanonicalPhysicalGarmentType[], occurrences: ReturnType<typeof buildAuthoritativePhysicalOccurrences>) => {
  const garmentTypeSelection = selectionFor(types);
  const plan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection,
    physicalGarments: occurrences.map((item) => ({ garmentKey: item.garmentKey, garmentType: item.garmentType })),
  });
  let state = createEmptyFutureMeasurementState("low_risk", "cm");
  for (const requirement of plan.requirements.filter((item) => item.directInput)) {
    state = setFutureMeasurementInput({
      state,
      requirement,
      displayValue: requirement.measurementId === "total_height" ? 180 : 90,
    });
  }
  return reconcileFutureMeasurementState({ state, plan });
};

const allocate = (occurrences: ReturnType<typeof buildAuthoritativePhysicalOccurrences>) => {
  const fabrics = [fabricOf("FABRIC-A"), fabricOf("FABRIC-B")];
  let fabricState = FabricAllocationStateEngine.initialize();
  [occurrences.slice(0, 2), occurrences.slice(2)].forEach((group, index) => {
    if (group.length === 0) return;
    fabricState = FabricAllocationStateEngine.createAllocationForFabric(fabricState, fabrics[index].code);
    for (const occurrence of group) {
      fabricState = FabricAllocationStateEngine.attemptAppendGarment(fabricState, {
        code: `BASE_${occurrence.garmentType.toUpperCase()}`,
        garmentSpec: { key: occurrence.garmentKey, garmentType: occurrence.garmentType, fabricUnits: 1 },
        sourceRole: "main",
      });
    }
  });
  return { fabricState, fabrics: fabrics.slice(0, occurrences.length > 2 ? 2 : 1) };
};

const shell = (extra: Partial<GuestDesignDraft>): GuestDesignDraft => ({
  journeySchemaVersion: DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION,
  currentStageId: "design_style",
  currentStep: 3,
  aiTryOnWorkflow: { schemaVersion: 1, status: "ready", inputFingerprint: null },
  selectedFabricCode: "FABRIC-A",
  selectedStyleId: null,
  selectedGarment: null,
  designSelections: { accessories: [] },
  measurements: {
    height: 180, weight: 80, age: 40, bodyBuild: "Average", fitPreference: "Standard",
    neck: 16, shoulder: 18, chest: 40, waist: 34, hip: 40, sleeve: 25, trouserLength: 42,
    isAiEstimated: false, unit: "inch",
  },
  sizingMode: "manual",
  deliveryMethod: null,
  deliveryAddress: { addressLine1: "", city: "", postalCode: "", countryCode: "" },
  pickupTime: "", customerName: "", customerEmail: "", customerPhone: "",
  batchType: "alone", customGroupCode: "", garmentPieceCount: 1, specialInstructions: "",
  leftoverFabricChoice: "", hasLining: false,
  pricingBreakdown: { pricingModel: "all_inclusive_garment_construction", garmentConstructionSubtotal: 65, customDetailsPrice: 0, selectedDesignPrice: 65, eindhovenToDestinationShipping: 0, total: 65 },
  shippingSnapshot: {},
  resumeLocus: createDesignStudioResumeLocus({ scrollY: 0 }),
  updatedAt: "2026-11-08T12:00:00.000Z",
  ...extra,
} as GuestDesignDraft);

const uploadedDraft = (confirmed: boolean) => {
  const reference = createCustomerDesignUploadReference({
    ownerUid: UPLOAD_UID, mimeType: "image/jpeg", designReferenceId: "upload-shirt-1", createdAt: "2026-11-08T12:00:00.000Z",
  });
  const source = createUploadedDesignSource({
    uploadReference: reference,
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
    demographic: "male",
  });
  const garmentTypeSelection = selectionFor(["shirt"]);
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "uploaded",
    step1GarmentTypeSelection: garmentTypeSelection,
    effectiveGarmentTypeSelection: garmentTypeSelection,
    uploadedCompositionSpecs: source.fabricCapacityComposition,
  });
  const measurement = completeMeasurement(["shirt"], occurrences);
  const model = createDesignStyleStepTestModel({
    styles: [styleFor("shirt")],
    garmentTypeSelection,
    occurrences,
    uploadedSource: source,
    uploadedAssignmentGarmentKeys: occurrences.map((item) => item.garmentKey),
    confirmedUploadedSourceKey: source.sourceKey,
    expectedUploadOwnerUid: UPLOAD_UID,
  });
  const { fabricState, fabrics } = allocate(occurrences);
  const draft = shell({
    garmentTypeSelection,
    designSource: source,
    ...(confirmed ? { confirmedDesignSourceKey: source.sourceKey } : {}),
    fabricAllocations: fabricState.fabricAllocations,
    designStyleAssignmentDraft: model.hydration.envelope,
    uploadedDesignSourceRegistry: {
      schemaVersion: UPLOADED_DESIGN_SOURCE_REGISTRY_SCHEMA_VERSION,
      sourcesByUploadedSourceRef: { [reference.designReferenceId]: source },
    },
    futureMeasurementState: measurement,
    garmentPieceCount: occurrences.length,
  });
  return { draft, styles: model.styles, fabrics, measurement: measurement.calculationStatus };
};

const catalogDraft = (types: readonly CanonicalPhysicalGarmentType[], wearers?: { name: string; keys: string[] }[]) => {
  const garmentTypeSelection = selectionFor(types);
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: garmentTypeSelection,
    effectiveGarmentTypeSelection: garmentTypeSelection,
  });
  const measurement = completeMeasurement(types, occurrences);
  const styles = types.map(styleFor);
  const model = createDesignStyleStepTestModel({
    styles,
    garmentTypeSelection,
    occurrences,
    selectedStyleIdByGarmentKey: Object.fromEntries(occurrences.map((occurrence) => [occurrence.garmentKey, `style-${occurrence.garmentType}`])),
  });
  const { fabricState, fabrics } = allocate(occurrences);
  const source = createCatalogDesignSource(model.styles[0].id);
  const draft = shell({
    currentStageId: "try_on",
    currentStep: 7,
    garmentTypeSelection,
    selectedStyleId: model.styles[0].id,
    designSource: source,
    confirmedStyleId: model.styles[0].id,
    confirmedDesignSourceKey: source.sourceKey,
    priceActivatedFabricCode: fabrics[0].code,
    fabricAllocations: fabricState.fabricAllocations,
    designStyleAssignmentDraft: model.hydration.envelope,
    futureMeasurementState: wearers ? {
      schemaVersion: 2,
      wearers: wearers.map((person, index) => createWearerProfile({
        wearerId: `w-${person.name.toLowerCase()}`,
        displayName: person.name,
        fitContext: "male",
        presentationOrder: index,
        measurement,
      })),
      assignmentByGarmentKey: Object.fromEntries(wearers.flatMap((person) => person.keys.map((key) => [key, `w-${person.name.toLowerCase()}`]))),
    } as never : measurement,
    garmentPieceCount: occurrences.length,
  });
  return { draft, styles: model.styles, fabrics, pending: fabricState.pendingFabricGarment?.garmentKey || null, measurement: measurement.calculationStatus };
};

const cloudDrafts = new Map<string, GuestDesignDraft>();
const repository = {
  async synchronize(draft: GuestDesignDraft | null) {
    const saved = draft || cloudDrafts.get(UPLOAD_UID) || null;
    if (draft) cloudDrafts.set(UPLOAD_UID, draft);
    return { status: draft ? "equivalent" as const : "cloud_restored" as const, draft: saved, record: { schemaVersion: 1 as const, lifecycleStatus: "active" as const, revision: 2, createdAt: "2026-11-08T12:00:00.000Z", updatedAt: "2026-11-08T12:00:00.000Z", draft: saved } };
  },
  async save(draft: GuestDesignDraft) {
    cloudDrafts.set(UPLOAD_UID, draft);
    return { status: "saved" as const, record: { schemaVersion: 1 as const, lifecycleStatus: "active" as const, revision: 3, createdAt: "2026-11-08T12:00:00.000Z", updatedAt: "2026-11-08T12:10:00.000Z", draft } };
  },
  async load() { return cloudDrafts.get(UPLOAD_UID) || null; },
  async clear() { return { status: "saved" as const, record: { schemaVersion: 1 as const, lifecycleStatus: "cleared" as const, revision: 4, createdAt: "2026-11-08T12:00:00.000Z", updatedAt: "2026-11-08T12:20:00.000Z" } }; },
} as unknown as AuthenticatedFutureDraftRepository;

const configureStore = () => {
  useAppStore.setState({
    businessSettings: DEFAULT_BUSINESS_SETTINGS, isLoadingData: false, stylesLoadState: "ready", batches: [],
    customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG, setNotification: () => undefined,
  } as Partial<ReturnType<typeof useAppStore.getState>> as never);
};
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); }); };
const textOf = (node: { children: readonly unknown[] }): string => node.children.map((child) => typeof child === "string" ? child : child && typeof child === "object" && "children" in (child as object) ? textOf(child as { children: readonly unknown[] }) : "").join("");

let rendererStyles: StyleCategory[] = [];
let rendererFabrics: Fabric[] = [];

const mount = async (draft: GuestDesignDraft, signedIn = false) => {
  StorageService.clearGuestOrderSession();
  const saved = GuestOrderSessionService.saveFutureDesignDraft(draft);
  assert.equal(saved?.status, "saved", saved && "reason" in saved ? String(saved.reason) : "save failed");
  configureStore();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(createElement(DesignStudioView, {
      onAddToCart: () => undefined,
      openCartDrawer: () => undefined,
      styles: rendererStyles,
      fabrics: rendererFabrics,
      orderContext: { orderType: "Individual", deliveryWindow: "Within 2-3 weeks (Express Air Priority)" },
      currentUser: signedIn ? { name: "Signed In", email: "owner@example.test", ownerUid: UPLOAD_UID } : null,
      ...(signedIn ? { futureDraftRepository: repository } : {}),
    }));
  });
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const root = renderer.root.findAllByProps({ id: "design-studio-ten-stage-journey" })[0];
    if (root?.props["data-future-draft-restoring"] === "false") break;
    await flush();
  }
  return renderer;
};
const stageOf = (renderer: ReturnType<typeof create>) => renderer.root.findByProps({ id: "design-studio-ten-stage-journey" }).props["data-stage-id"];
const enabledForward = (renderer: ReturnType<typeof create>) =>
  renderer.root.findAll((node) => node.type === "button" && node.props["data-studio-nav"] === "forward" && node.props.disabled !== true && /Continue to /.test(String(node.props["aria-label"] || "")))[0];
const clickForward = async (renderer: ReturnType<typeof create>) => {
  const button = enabledForward(renderer);
  assert.ok(button, `no enabled continue on ${stageOf(renderer)}`);
  await act(async () => { await button.props.onClick(); });
  await flush();
};
const summaryImages = (renderer: ReturnType<typeof create>) => {
  const summary = renderer.root.findAllByType(DormantFutureSummaryStep)[0];
  if (!summary) return [];
  return summary.findAll((node) => node.type === "img" && String(node.props.alt || "").startsWith("AI try-on preview"));
};
const draftPrice = () => GuestOrderSessionService.getFutureDesignDraft()?.priceActivatedFabricCode ?? null;
const draftConfirmed = () => GuestOrderSessionService.getFutureDesignDraft()?.confirmedDesignSourceKey ?? null;

const waitForAuth = async () => {
  await new Promise<void>((resolve) => {
    const stop = onAuthStateChanged(auth, () => { stop(); resolve(); });
  });
};

setAuthUser({ uid: UPLOAD_UID, isAnonymous: true, getIdToken: async () => null });
await waitForAuth();

const unconfirmed = uploadedDraft(false);
assert.equal(unconfirmed.measurement, "complete");
assert.equal(unconfirmed.draft.priceActivatedFabricCode ?? null, null);
assert.equal(unconfirmed.draft.confirmedDesignSourceKey ?? null, null);
rendererStyles = [...unconfirmed.styles];
rendererFabrics = unconfirmed.fabrics;
stored.clear();
requests.length = 0;
serial = 0;
aiTryOnBackgroundJobs.discardAll();

const studio = await mount(unconfirmed.draft);
assert.equal(stageOf(studio), "design_style", "an unconfirmed uploaded design opens on Design Style");
await clickForward(studio);
assert.equal(stageOf(studio), "fabric", "confirming an uploaded design uses the existing path onto Fabric and does not price it yet");
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
assert.equal(draftPrice(), null, "confirmation must not activate fabric pricing");
assert.equal(typeof draftConfirmed(), "string");
await clickForward(studio);
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
assert.equal(draftPrice(), "FABRIC-A", "leaving Fabric after confirmation activates the primary fabric price");
assert.equal(stageOf(studio), "design_style");

for (let step = 0; step < 6 && stageOf(studio) !== "try_on"; step += 1) {
  const before = stageOf(studio);
  await clickForward(studio);
  await flush();
  if (stageOf(studio) === before) break;
}
assert.equal(stageOf(studio), "try_on", "confirmed, priced uploaded design reaches AI Try-on");
assert.equal(studio.root.findAll((node) => node.props["data-ai-try-on-source-cards"] !== undefined).length, 0);
const generate = studio.root.findAll((node) => node.type === "button" && /Use this design/.test(textOf(node as never)) && node.props.disabled !== true)[0];
assert.ok(generate, "Use this design was not offered");
await act(async () => { await generate.props.onClick(); });
await flush();
await flush();
assert.equal([...stored.values()].some((preview) => preview.uploaded && preview.wearerKey === "wearer-legacy"), true);
const summaryContinue = studio.root.findAll((node) => node.type === "button" && node.props["aria-label"] === "Continue to Summary" && node.props.disabled !== true)[0];
assert.ok(summaryContinue, "Summary stayed locked after a real uploaded preview");
await act(async () => { await summaryContinue.props.onClick(); });
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 800)); });
assert.equal(stageOf(studio), "summary");
const fresh = summaryImages(studio);
assert.equal(fresh.length, 1);
assert.equal(String(fresh[0].props.className), AI_TRY_ON_SUMMARY_IMAGE_CLASS);
const enlarge = studio.root.findAllByType(DormantFutureSummaryStep)[0].findAll((node) => node.type === "button" && String(node.props["aria-label"] || "").startsWith("See the AI preview"))[0];
assert.ok(enlarge);
await act(async () => { enlarge.props.onClick(); });
assert.ok(studio.root.findAll((node) => node.props["data-ai-try-on-order-preview-enlarged"] !== undefined).length > 0);
const close = studio.root.findAll((node) => node.type === "button" && node.props["aria-label"] === COPY.closeEnlarged)[0];
if (close) await act(async () => { close.props.onClick(); });
const autosaved = GuestOrderSessionService.getFutureDesignDraft();
assert.ok(autosaved);
assert.equal(autosaved.currentStageId, "summary");
assert.equal(autosaved.aiTryOnWorkflow.status, "completed");
await act(async () => { studio.unmount(); });
aiTryOnBackgroundJobs.discardAll();

const refreshed = await mount(autosaved);
assert.equal(stageOf(refreshed), "summary", "a saved uploaded Summary opens on Summary");
const refreshImages = summaryImages(refreshed);
assert.equal(refreshImages.length, 1);
assert.equal(requests.some((entry) => entry.url.includes("action=session") && entry.token === TOKEN), true);
const edit = refreshed.root.findAll((node) => node.type === "button" && node.props["aria-label"] === "Edit AI Try-on")[0];
assert.ok(edit);
await act(async () => { edit.props.onClick(); });
await flush();
assert.equal(stageOf(refreshed), "try_on");
const back = refreshed.root.findAll((node) => node.type === "button" && node.props["aria-label"] === "Continue to Summary" && node.props.disabled !== true)[0];
assert.ok(back);
await act(async () => { await back.props.onClick(); });
await flush();
assert.equal(stageOf(refreshed), "summary");
assert.equal(summaryImages(refreshed).length, 1);
await act(async () => { refreshed.unmount(); });

listFingerprintOverride = "tryon-v1-0000000000000000";
aiTryOnBackgroundJobs.discardAll();
const staleRenderer = await mount(autosaved);
assert.equal(summaryImages(staleRenderer).length, 0, "a genuinely different fingerprint hides the saved photo");
assert.equal(JSON.stringify(staleRenderer.toJSON()).includes("your design changed after this preview"), true);
await act(async () => { staleRenderer.unmount(); });
listFingerprintOverride = null;

const incomplete = uploadedDraft(true);
incomplete.draft.currentStageId = "summary";
incomplete.draft.currentStep = 8;
incomplete.draft.priceActivatedFabricCode = "FABRIC-A";
incomplete.draft.futureMeasurementState = createEmptyFutureMeasurementState();
incomplete.draft.aiTryOnWorkflow = { schemaVersion: 1, status: "completed", inputFingerprint: "tryon-v1-aaaaaaaaaaaaaaaa", resultReference: { kind: "verified_private_try_on_result", assetId: "tryon-33333333-3333-4333-8333-000000000099", ownerBindingId: "order" } };
const incompleteStudio = await mount(incomplete.draft);
assert.notEqual(stageOf(incompleteStudio), "summary", "incomplete measurements do not restore Summary");
const summaryStep = incompleteStudio.root.findAll((node) => node.type === "button" && node.props["data-stage-id"] === "summary")[0];
assert.equal(summaryStep?.props["data-stage-unlocked"], "false");
await act(async () => { incompleteStudio.unmount(); });

const pricedTooSoon = uploadedDraft(false);
pricedTooSoon.draft.currentStageId = "fabric";
pricedTooSoon.draft.currentStep = 2;
const fabricStudio = await mount(pricedTooSoon.draft);
assert.equal(stageOf(fabricStudio), "fabric");
await clickForward(fabricStudio);
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
assert.equal(draftPrice(), null, "leaving Fabric does not price an unconfirmed upload");
await act(async () => { fabricStudio.unmount(); });

setAuthUser({ uid: UPLOAD_UID, isAnonymous: false, email: "owner@example.test", getIdToken: async () => ID_TOKEN });
await waitForAuth();
cloudDrafts.set(UPLOAD_UID, autosaved);
requests.length = 0;
const signedIn = await mount(autosaved, true);
assert.equal(stageOf(signedIn), "summary");
assert.equal(summaryImages(signedIn).length, 1);
assert.equal(requests.some((entry) => entry.authorization === `Bearer ${ID_TOKEN}`), true, "signed-in refresh sends the ID token");
await act(async () => { signedIn.unmount(); });

setAuthUser(null);
stored.clear();
serial = 0;
requests.length = 0;
aiTryOnBackgroundJobs.discardAll();
const four = catalogDraft(
  ["shirt", "trouser", "kaftan", "standard_shorts"],
  [
    { name: "Ada", keys: ["base:shirt", "base:trouser"] },
    { name: "Obi", keys: ["base:kaftan", "base:standard_shorts"] },
  ],
);
assert.equal(four.pending, null, `fabric pending ${four.pending}`);
assert.equal(four.measurement, "complete");
rendererStyles = [...four.styles];
rendererFabrics = four.fabrics;
const people = await mount(four.draft);
assert.equal(stageOf(people), "try_on");
const chips = () => people.root.findAll((node) => node.type === "button" && node.props["data-wearer-chip"]);
const garments = () => people.root.findAll((node) => node.type === "button" && node.props["data-ai-try-on-garment"]);
for (const chip of chips()) {
  await act(async () => { chip.props.onClick(); });
  for (const button of garments()) {
    await act(async () => { button.props.onClick(); });
    const model = people.root.findAll((node) => node.props["data-ai-try-on-model"] === "male-plus")[0];
    if (!model) {
      const choose = people.root.findAll((node) => node.type === "button" && /Try it on a model|Choose a model/.test(textOf(node as never)))[0];
      assert.ok(choose);
      await act(async () => { await choose.props.onClick(); });
    }
    const picked = people.root.findAll((node) => node.props["data-ai-try-on-model"] === "male-plus")[0];
    assert.ok(picked);
    await act(async () => { picked.props.onClick(); });
    const preview = people.root.findAll((node) => node.type === "button" && /Generate preview/.test(textOf(node as never)) && node.props.disabled !== true)[0];
    assert.ok(preview, "a garment preview was not available inside the five-try cap");
    await act(async () => { await preview.props.onClick(); });
    await flush();
  }
}
assert.equal(stored.size, 4);
const outfitBlocked = people.root.findAll((node) => node.type === "button" && /Generate combined outfit/.test(textOf(node as never)))[0];
if (outfitBlocked) assert.equal(outfitBlocked.props.disabled, true);
await clickForward(people);
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 800)); });
const fourFresh = summaryImages(people).map((image) => String(image.props.alt));
assert.equal(fourFresh.length, 4);
for (const name of ["Ada", "Obi"]) assert.equal(fourFresh.filter((alt) => alt.includes(name)).length, 2, name);
assert.equal(fourFresh.some((alt) => alt.includes("Combined outfit")), false);
await act(async () => { people.unmount(); });

stored.clear();
serial = 0;
aiTryOnBackgroundJobs.discardAll();
const obi = catalogDraft(["kaftan", "standard_shorts"]);
assert.equal(obi.measurement, "complete");
rendererStyles = [...obi.styles];
rendererFabrics = obi.fabrics;
const obiStudio = await mount(obi.draft);
assert.equal(stageOf(obiStudio), "try_on");
for (const button of obiStudio.root.findAll((node) => node.type === "button" && node.props["data-ai-try-on-garment"])) {
  await act(async () => { button.props.onClick(); });
  const choose = obiStudio.root.findAll((node) => node.type === "button" && /Try it on a model|Choose a model/.test(textOf(node as never)))[0];
  if (choose) await act(async () => { await choose.props.onClick(); });
  const picked = obiStudio.root.findAll((node) => node.props["data-ai-try-on-model"] === "male-plus")[0];
  assert.ok(picked);
  await act(async () => { picked.props.onClick(); });
  const preview = obiStudio.root.findAll((node) => node.type === "button" && /Generate preview/.test(textOf(node as never)) && node.props.disabled !== true)[0];
  assert.ok(preview);
  await act(async () => { await preview.props.onClick(); });
  await flush();
}
const outfit = obiStudio.root.findAll((node) => node.props["data-ai-try-on-outfit-mode"])[0];
assert.ok(outfit);
await act(async () => { outfit.props.onClick(); });
for (const part of ["top", "bottom"]) {
  const select = obiStudio.root.findAll((node) => node.props["data-ai-try-on-outfit-choice"] === part)[0];
  const option = select?.findAll((node) => node.type === "option" && node.props.value)[0];
  assert.ok(select && option?.props.value, part);
  await act(async () => { select.props.onChange({ target: { value: option.props.value } }); });
}
const combined = obiStudio.root.findAll((node) => node.type === "button" && /Generate combined outfit/.test(textOf(node as never)) && node.props.disabled !== true)[0];
assert.ok(combined, "the separate outfit order is inside the five-try cap");
await act(async () => { await combined.props.onClick(); });
await flush();
assert.equal(stored.size, 3);
await clickForward(obiStudio);
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 800)); });
const obiAlts = summaryImages(obiStudio).map((image) => String(image.props.alt));
assert.equal(obiAlts.length, 3);
assert.ok(obiAlts.some((alt) => alt.includes("Long Shirt")), obiAlts.join(" | "));
assert.ok(obiAlts.some((alt) => alt.includes("Combined outfit")));
await act(async () => { obiStudio.unmount(); });

console.log("PASS: uploaded Summary, refresh, staleness, and separate five-try wearer scenarios");
