/**
 * A spare-capacity selection is a completed physical/Fabric transaction before
 * Step 3. This production-component regression protects that refresh boundary.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import DesignStudioView from "./src/components/DesignStudioView";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { DormantFutureFabricStep } from "./src/components/DormantFutureFabricStep";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { useAppStore } from "./src/store/useAppStore";
import type { Fabric, GuestDesignDraft, Measurements, StyleCategory } from "./src/types";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { prepareAuthoritativeDesignStyleRecord, projectPublishedDesignStyleRecord } from "./src/utils/designStyleAuthority";
import { createCatalogDesignSource } from "./src/utils/designSourceState";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

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
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    scrollY: 0,
    scrollTo: () => undefined,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 1; },
    cancelAnimationFrame: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    localStorage: memoryStorage,
    matchMedia: () => ({ matches: false, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined }),
  },
});
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage });

const { StorageService } = await import("./src/services/storageService");
const { GuestOrderSessionService } = await import("./src/services/guestOrderSessionService");

const fabric: Fabric = {
  code: "SPARE-01", name: "Spare Capacity Test Fabric", description: "", color: "Green", colorHex: "#0A4A33",
  priceMultiplier: 1, stockStatus: "IN_STOCK", category: "Test", price: 12,
};
const styleDraft = {
  id: "spare-capacity-style", name: "Spare Capacity Style", category: "Shirt", description: "",
  basePrice: 65, image: "https://example.test/style.jpg", availableFor: ["male"], garmentTypes: ["shirt", "bum_shorts"],
  gender: "male", options: [], status: "published", fabricCapacityComposition: [{ key: "base:shirt", garmentType: "shirt", fabricUnits: 1 }],
} as unknown as StyleCategory;
const publishedStyle = projectPublishedDesignStyleRecord(
  prepareAuthoritativeDesignStyleRecord({
    style: styleDraft,
    lifecycle: "published",
    displayOrder: 1,
    referenceComposition: { status: "known", garmentTypes: ["shirt", "bum_shorts"] },
    currentRecord: null,
  }),
);
assert.ok(publishedStyle);
const styles = [publishedStyle];
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"], selectedDemographic: "male",
  normalizedCustomDetailCatalog: inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG).activeOptions,
}).selection;
let baseFabricState = FabricAllocationStateEngine.initialize();
baseFabricState = FabricAllocationStateEngine.createAllocationForFabric(baseFabricState, fabric.code);
baseFabricState = FabricAllocationStateEngine.attemptAppendGarment(baseFabricState, {
  code: "BASE_SHIRT", garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 }, sourceRole: "main",
});
const source = createCatalogDesignSource(styles[0].id);
assert.ok(source);
const measurements: Measurements = { height: 0, weight: 0, age: 0, bodyBuild: "Average", fitPreference: "Standard", neck: 0, shoulder: 0, chest: 0, waist: 0, hip: 0, sleeve: 0, trouserLength: 0, isAiEstimated: false };
const initialDraft: GuestDesignDraft = {
  journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION, currentStageId: "fabric", currentStep: 2,
  garmentTypeSelection, selectedFabricCode: fabric.code, selectedStyleId: styles[0].id, designSource: source,
  confirmedStyleId: styles[0].id, confirmedDesignSourceKey: source.sourceKey, priceActivatedFabricCode: fabric.code,
  selectedGarment: null, designSelections: { accessories: [] }, measurements, sizingMode: "manual", deliveryMethod: null,
  deliveryAddress: { addressLine1: "", city: "", postalCode: "", countryCode: "" }, pickupTime: "", customerName: "", customerEmail: "", customerPhone: "",
  batchType: "alone", customGroupCode: "", garmentPieceCount: 1, specialInstructions: "", leftoverFabricChoice: "", hasLining: false,
  pricingBreakdown: { pricingModel: "all_inclusive_garment_construction", garmentConstructionSubtotal: 65, customDetailsPrice: 0, selectedDesignPrice: 65, lagosToEindhovenShipping: 0, eindhovenToDestinationShipping: 0, total: 65 },
  shippingSnapshot: {}, fabricAllocations: baseFabricState.fabricAllocations, updatedAt: "2026-09-08T08:00:00.000Z",
};

let renderer!: ReturnType<typeof create>;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const mount = async (seed: GuestDesignDraft | null) => {
  if (seed) { StorageService.clearGuestOrderSession(); GuestOrderSessionService.saveFutureDesignDraft(seed); }
  useAppStore.setState({ businessSettings: DEFAULT_BUSINESS_SETTINGS, isLoadingData: false, stylesLoadState: "ready", batches: [], customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG, setNotification: () => undefined } as Partial<ReturnType<typeof useAppStore.getState>> as never);
  await act(async () => {
    renderer = create(createElement(DesignStudioView, { onAddToCart: () => undefined, openCartDrawer: () => undefined, styles, fabrics: [fabric], currentUser: null, orderContext: null }));
    await flush();
  });
};

await mount(initialDraft);
assert.equal(renderer.root.findByProps({ id: "design-studio-nine-stage-journey" }).props["data-stage-id"], "fabric");
const allocationId = baseFabricState.fabricAllocations[0].allocationId;
assert.equal(renderer.root.findAllByProps({ "data-testid": "remaining-fabric-capacity-offer" }).length, 1);
await act(async () => {
  renderer.root.findByProps({ "data-testid": `remaining-fabric-capacity-offer-accept-${allocationId}` }).props.onClick();
  await flush();
});
await act(async () => {
  renderer.root.findByProps({ "data-testid": "remaining-fabric-capacity-offer-select-bum_shorts" }).props.onClick();
  await flush();
});

const afterCommitFabricStep = renderer.root.findByType(DormantFutureFabricStep);
const committedState = afterCommitFabricStep.props.fabricAllocationState;
const bumShortsAssignment = committedState.fabricAllocations[0].garmentAssignments.find((assignment: { garmentKey: string }) => assignment.garmentKey.startsWith("additional:bum_shorts:"));
assert.ok(bumShortsAssignment, "The spare-capacity choice must create its exact physical Bum Shorts occurrence.");
assert.equal(committedState.fabricAllocations.length, 1, "Capacity reuse must not create a duplicate Fabric allocation.");
assert.equal(renderer.root.findAllByProps({ "data-additional-garment-fabric-dialog": "true" }).length, 0, "Capacity reuse must not open the normal Fabric catalogue.");

await act(async () => { afterCommitFabricStep.props.onContinue(); await flush(); });
assert.equal(renderer.root.findByProps({ id: "design-studio-nine-stage-journey" }).props["data-stage-id"], "design_style");
const beforeRefreshStyleStep = renderer.root.findByType(DormantFutureDesignStyleStep);
const beforeRefreshBumShorts = beforeRefreshStyleStep.props.occurrences.find((occurrence: { target: { garmentKey: string } }) => occurrence.target.garmentKey === bumShortsAssignment.garmentKey);
assert.ok(beforeRefreshBumShorts);
assert.equal(beforeRefreshBumShorts.assignment, null, "The Fabric transaction must not silently assign Design Style.");

await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
const persisted = GuestOrderSessionService.getFutureDesignDraft();
assert.ok(persisted);
assert.deepEqual(
  persisted.fabricAllocations.map((allocation) => ({
    allocationId: allocation.allocationId,
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  })),
  committedState.fabricAllocations.map((allocation: { allocationId: string; fabricCode: string; garmentAssignments: { garmentKey: string }[] }) => ({
    allocationId: allocation.allocationId,
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  })),
  "The finalized capacity commit must autosave before Step 3 Design Style is complete.",
);

act(() => renderer.unmount());
await mount(null);
assert.equal(renderer.root.findByProps({ id: "design-studio-nine-stage-journey" }).props["data-stage-id"], "design_style");
const refreshedStyleStep = renderer.root.findByType(DormantFutureDesignStyleStep);
const refreshedBumShorts = refreshedStyleStep.props.occurrences.find((occurrence: { target: { garmentKey: string } }) => occurrence.target.garmentKey === bumShortsAssignment.garmentKey);
assert.ok(refreshedBumShorts, "Refresh must restore the exact added occurrence.");
assert.equal(refreshedBumShorts.assignment, null, "Refresh must leave the new occurrence's Design Style unassigned.");
assert.equal(refreshedStyleStep.props.occurrences.filter((occurrence: { target: { garmentKey: string } }) => occurrence.target.garmentKey === bumShortsAssignment.garmentKey).length, 1, "Refresh must not duplicate the capacity-added occurrence.");

// Completing Step 3 later must leave Step 4 free to begin a separate normal
// additional-garment transaction rather than treating the old capacity commit
// as pending.
const catalogueRequests = Object.values(
  refreshedStyleStep.props.catalogueEntries[0].requestsByOccurrenceToken,
);
assert.equal(catalogueRequests.length, 2);
await act(async () => {
  refreshedStyleStep.props.onAssignCatalogueStyle(catalogueRequests);
  await flush();
});
const completedStyleStep = renderer.root.findByType(DormantFutureDesignStyleStep);
assert.equal(completedStyleStep.props.exactSetComplete, true);
await act(async () => { completedStyleStep.props.onContinue(); await flush(); });
assert.equal(renderer.root.findByProps({ id: "design-studio-nine-stage-journey" }).props["data-stage-id"], "custom_details");
await act(async () => {
  renderer.root.findByType(DormantFutureCustomDetailsStep).props.onAddAdditionalGarment("trouser", null);
  await flush();
});
assert.equal(
  renderer.root.findAllByProps({ "data-additional-garment-fabric-dialog": "true" }).length,
  1,
  "A completed spare-capacity transaction must not block the Step 4 manual Fabric catalogue.",
);
act(() => renderer.unmount());
StorageService.clearGuestOrderSession();

console.log("PASS: spare capacity Fabric commits finalize and persist before Design Style");
