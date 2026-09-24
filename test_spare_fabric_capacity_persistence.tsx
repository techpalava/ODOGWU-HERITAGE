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
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import { DormantFutureSummaryStep } from "./src/components/DormantFutureSummaryStep";
import { DormantFutureShippingStep } from "./src/components/DormantFutureShippingStep";
import { DormantFuturePaymentReviewStep } from "./src/components/DormantFuturePaymentReviewStep";
import { FutureRemainingFabricCapacityOfferCard } from "./src/components/FutureRemainingFabricCapacityOffer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { useAppStore } from "./src/store/useAppStore";
import type { Fabric, GuestDesignDraft, Measurements, StyleCategory } from "./src/types";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { prepareAuthoritativeDesignStyleRecord, projectPublishedDesignStyleRecord } from "./src/utils/designStyleAuthority";
import { buildAuthoritativePhysicalOccurrences, createCatalogDesignSource, physicalOccurrencesToFabricRequirements } from "./src/utils/designSourceState";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import { resolveDraftHydrationAllocations } from "./src/utils/fabricAllocationPersistence";
import { inspectPersistedDesignStyleDraft } from "./src/utils/designStyleDraftPersistence";
import { createDesignStyleStepTestModel } from "./testing/designStyleStepFixtures";
import { createRevision342FabricHydrationFixture } from "./testing/revision342FabricHydrationFixture";
import { reconcileGarmentTypeSelectionOccurrenceIdentities } from "./src/utils/physicalGarmentOccurrenceIdentity";
import { createEmptyFutureMeasurementState, reconcileFutureMeasurementState, requireFutureMeasurementStateV1, setFutureMeasurementInput } from "./src/utils/measurementBlueprint";
import { createEmptyFutureShippingState } from "./src/utils/designStudioFutureShipping";
import { getFuturePaymentReviewGarments } from "./src/utils/designStudioFuturePaymentReview";
import { STEP_1_SELECTABLE_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";

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
const mount = async (
  seed: GuestDesignDraft | null,
  options: { styles?: StyleCategory[]; fabrics?: Fabric[] } = {},
) => {
  if (seed) { StorageService.clearGuestOrderSession(); GuestOrderSessionService.saveFutureDesignDraft(seed); }
  useAppStore.setState({ businessSettings: DEFAULT_BUSINESS_SETTINGS, isLoadingData: false, stylesLoadState: "ready", batches: [], customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG, setNotification: () => undefined } as Partial<ReturnType<typeof useAppStore.getState>> as never);
  await act(async () => {
    renderer = create(createElement(DesignStudioView, {
      onAddToCart: () => undefined,
      openCartDrawer: () => undefined,
      styles: options.styles || styles,
      fabrics: options.fabrics || [fabric],
      currentUser: null,
      orderContext: null,
    }));
    await flush();
  });
};

await mount(initialDraft);
assert.ok(STEP_1_SELECTABLE_GARMENT_TYPES.includes("long_skirt"));
assert.deepEqual(
  renderer.root.findByType(FutureRemainingFabricCapacityOfferCard).props.eligibleGarmentTypes,
  ["shirt", "trouser", "skirt", "standard_shorts", "bum_shorts", "dress", "kaftan"],
  "The spare-capacity selector must retain only the approved additional garments.",
);
assert.equal(renderer.root.findByProps({ id: "design-studio-nine-stage-journey" }).props["data-stage-id"], "fabric");
const allocationId = baseFabricState.fabricAllocations[0].allocationId;
assert.equal(renderer.root.findAllByProps({ "data-testid": "remaining-fabric-capacity-offer" }).length, 1);
assert.doesNotMatch(
  JSON.stringify(renderer.toJSON()),
  /Add Garment Using This Fabric/,
  "The redundant generic capacity CTA must not render.",
);
await act(async () => {
  renderer.root.findByProps({ "data-testid": `remaining-fabric-capacity-offer-allocation-${allocationId}` }).props.onClick();
  await flush();
});
assert.equal(renderer.root.findAllByProps({
  "data-testid": "remaining-fabric-capacity-offer-select-long_skirt",
}).length, 0, "The remaining-capacity offer must not expose Long Skirt.");
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
assert.ok(
  persisted.designSelections.additionalGarmentConstructions?.byGarmentKey[
    bumShortsAssignment.garmentKey
  ],
  "The completed spare-capacity transaction must persist its construction-ledger authority.",
);
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
assert.deepEqual(
  renderer.root.findByType(DormantFutureCustomDetailsStep).props.additionalGarmentConstructionOptions.map(
    (item: { garmentType: string }) => item.garmentType,
  ),
  ["shirt", "trouser", "skirt", "standard_shorts", "bum_shorts", "dress", "kaftan", "full_length_gown"],
  "The normal Additional Garments selector must exclude Long Skirt.",
);
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

// A non-empty persisted array that cannot pass the strict reader must remain
// intact after hydration. The component must not schedule an empty replacement
// autosave while its structural blocker is active.
StorageService.clearGuestOrderSession();
const parserInvalidDraft: GuestDesignDraft = {
  ...initialDraft,
  updatedAt: "2026-09-08T08:10:00.000Z",
  designSource: {
    ...source,
    sourceKey: "catalog:malformed-source",
  },
  fabricAllocations: [
    {
      allocationId: "parser-invalid-1",
      fabricCode: fabric.code,
      garmentAssignments: [
        {
          garmentKey: "invalid:shirt",
          code: "ADDITIONAL_SHIRT",
          garmentType: "shirt",
          fabricUnits: 1,
          sourceRole: "additional",
        },
      ],
    },
  ],
};
GuestOrderSessionService.saveFutureDesignDraft(parserInvalidDraft);
const persistedInvalidBeforeMount = GuestOrderSessionService.getFutureDesignDraft();
const invalidAfterSourceNormalization = resolveDraftHydrationAllocations(
  persistedInvalidBeforeMount!,
);
assert.equal(
  invalidAfterSourceNormalization.status,
  "invalid",
  "Design-source normalization must retain invalid non-empty Fabric payloads for the hydration blocker.",
);
if (invalidAfterSourceNormalization.status === "invalid") {
  assert.equal(
    invalidAfterSourceNormalization.diagnostic.code,
    "garment_assignment_invalid",
  );
  assert.deepEqual(
    invalidAfterSourceNormalization.rawFabricAllocations,
    parserInvalidDraft.fabricAllocations,
  );
}
assert.deepEqual(
  persistedInvalidBeforeMount?.fabricAllocations,
  parserInvalidDraft.fabricAllocations,
  "The fixture must reach component hydration as non-empty raw persisted Fabric data.",
);
await mount(null);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 350));
});
const persistedInvalidAfterHydration = GuestOrderSessionService.getFutureDesignDraft();
assert.deepEqual(
  persistedInvalidAfterHydration?.fabricAllocations,
  parserInvalidDraft.fabricAllocations,
  "Invalid non-empty persisted Fabric data must not be replaced by an empty autosave.",
);
assert.equal(
  persistedInvalidAfterHydration?.updatedAt,
  parserInvalidDraft.updatedAt,
  "Blocked hydration must suppress the normal draft autosave.",
);
act(() => renderer.unmount());
StorageService.clearGuestOrderSession();

// A real empty allocation array is materially different from malformed
// non-empty data: it hydrates as valid and stays eligible for normal autosave.
const trueEmptyDraft: GuestDesignDraft = {
  ...initialDraft,
  fabricAllocations: [],
  selectedFabricCode: null,
  updatedAt: "2026-09-08T08:11:00.000Z",
};
GuestOrderSessionService.saveFutureDesignDraft(trueEmptyDraft);
assert.equal(
  resolveDraftHydrationAllocations(
    GuestOrderSessionService.getFutureDesignDraft()!,
  ).status,
  "valid",
);
await mount(null);
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 350));
});
const persistedTrueEmpty = GuestOrderSessionService.getFutureDesignDraft();
assert.deepEqual(persistedTrueEmpty?.fabricAllocations, []);
assert.notEqual(
  persistedTrueEmpty?.updatedAt,
  trueEmptyDraft.updatedAt,
  "A genuine empty allocation set must remain autosavable.",
);
act(() => renderer.unmount());
StorageService.clearGuestOrderSession();

// This is a real component lifecycle regression, not a direct repository
// save. The fixture carries the same occurrence generations as its persisted
// Design Style ledger, so hydration must not invent new identities.
const revision342Fixture = createRevision342FabricHydrationFixture();
const revision342Selection = {
  ...reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt", "trouser", "skirt"],
    selectedDemographic: "female",
    normalizedCustomDetailCatalog: inspectCustomDetailCatalog(
      SEED_CUSTOM_DETAIL_CATALOG,
    ).activeOptions,
  }).selection,
  physicalOccurrenceIdentityState: revision342Fixture.occurrenceIdentityState,
};
const revision342StyleDraft = {
  id: "revision-342-component-style",
  name: "Revision 342 Component Fixture Style",
  category: "Historical fixture",
  description: "Deterministic historical full-draft component regression.",
  basePrice: 65,
  image: "https://example.test/revision-342.jpg",
  availableFor: ["female"],
  garmentTypes: ["shirt", "trouser", "skirt", "kaftan", "bum_shorts"],
  gender: "female",
  targetDemographic: "female",
  options: [],
  status: "published",
  fabricCapacityComposition: [
    { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    { key: "base:trouser", garmentType: "trouser", fabricUnits: 1 },
    { key: "base:skirt", garmentType: "skirt", fabricUnits: 1 },
  ],
} as unknown as StyleCategory;
const revision342PublishedStyle = projectPublishedDesignStyleRecord(
  prepareAuthoritativeDesignStyleRecord({
    style: revision342StyleDraft,
    lifecycle: "published",
    displayOrder: 1,
    referenceComposition: {
      status: "known",
      garmentTypes: ["shirt", "trouser", "skirt", "kaftan", "bum_shorts"],
    },
    currentRecord: null,
  }),
);
assert.ok(revision342PublishedStyle);
const revision342StyleModel = createDesignStyleStepTestModel({
  styles: [revision342PublishedStyle],
  garmentTypeSelection: revision342Selection,
  occurrences: revision342Fixture.occurrences,
  selectedStyleIdByGarmentKey: Object.fromEntries(
    revision342Fixture.occurrences.map((occurrence) => [
      occurrence.garmentKey,
      revision342PublishedStyle.id,
    ]),
  ),
});
assert.ok(revision342StyleModel.hydration.envelope);
assert.equal(revision342StyleModel.projection.completedCount, 6);
const revision342AdditionalGarmentConstructions = Object.fromEntries(
  revision342Fixture.occurrences
    .filter((occurrence) => occurrence.sourceRole === "additional")
    .map((occurrence) => {
      const construction = resolveGarmentConstructionPricing(
        occurrence.garmentType,
        inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG).activeOptions,
      );
      assert.equal(construction.status, "resolved");
      return [occurrence.garmentKey, construction];
    }),
);
const revision342Source = createCatalogDesignSource(revision342PublishedStyle.id);
assert.ok(revision342Source);
const revision342Draft: GuestDesignDraft = {
  ...initialDraft,
  journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
  currentStageId: "measurement",
  currentStep: 6,
  garmentTypeSelection: revision342Selection,
  selectedFabricCode: "ODG-009",
  selectedStyleId: revision342PublishedStyle.id,
  designSource: revision342Source,
  confirmedStyleId: revision342PublishedStyle.id,
  confirmedDesignSourceKey: revision342Source.sourceKey,
  priceActivatedFabricCode: "ODG-009",
  fabricAllocations: revision342Fixture.legacyFabricAllocations,
  designStyleAssignmentDraft: revision342StyleModel.hydration.envelope,
  designSelections: {
    accessories: [],
    additionalGarmentConstructions: {
      schemaVersion: 1,
      byGarmentKey: revision342AdditionalGarmentConstructions,
    },
    garmentScopedCustomDetails: {
      schemaVersion: 1,
      selectionsByGarmentKey: {
        "base:shirt": { shirt_pockets: "shirt_pocket_0" },
        "additional:kaftan:1": { shirt_pockets: "shirt_pocket_0" },
      },
      snapshotsByGarmentKey: {},
    },
  },
  aiTryOnWorkflow: {
    schemaVersion: 1,
    status: "skipped",
    inputFingerprint: null,
  },
  futureMeasurementState: {
    schemaVersion: 1,
    route: "low_risk",
    unit: "inch",
    entered: {
      shared: {
        chest_bust_circumference: {
          valueCm: 102,
          provenance: "customer_entered",
        },
      },
      byGarmentKey: {},
    },
    derived: { shared: {}, byGarmentKey: {} },
    blueprintVersion: "measurement-blueprint-v1",
    formulaVersion: null,
    inputFingerprint: "measurement-input-v1",
    calculationStatus: "complete",
    diagnostics: [],
    invalidInputKeys: [],
  },
};
const revision342Fabrics = ["ODG-009", "ODG-010", "ODG-012"].map((code) => ({
  ...fabric,
  code,
  name: `${code} Historical Fixture Fabric`,
}));
const summarizeRevision342Draft = (draft: GuestDesignDraft | null) => ({
  stage: draft?.currentStageId,
  identity: draft?.garmentTypeSelection.physicalOccurrenceIdentityState,
  allocations: draft?.fabricAllocations?.map((allocation) => ({
    allocationId: allocation.allocationId,
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  styleKeys: (() => {
    const parsed = inspectPersistedDesignStyleDraft(draft || {});
    return parsed.status === "valid"
      ? Object.keys(parsed.envelope.ledger.assignmentsByGarmentKey).sort()
      : [];
  })(),
  customDetails:
    draft?.designSelections.garmentScopedCustomDetails?.selectionsByGarmentKey,
  chestBust:
    requireFutureMeasurementStateV1(draft?.futureMeasurementState).entered.shared.chest_bust_circumference
      ?.valueCm,
});
const expectedRevision342Summary = {
  stage: "measurement",
  identity: revision342Fixture.occurrenceIdentityState,
  allocations: [
    { allocationId: "ODG-009-1", fabricCode: "ODG-009", garmentKeys: ["base:shirt", "base:trouser"] },
    { allocationId: "ODG-010-1", fabricCode: "ODG-010", garmentKeys: ["base:skirt", "additional:kaftan:1"] },
    { allocationId: "ODG-012-1", fabricCode: "ODG-012", garmentKeys: ["additional:bum_shorts:1", "additional:shirt:1"] },
  ],
  styleKeys: revision342Fixture.occurrences.map((occurrence) => occurrence.garmentKey).sort(),
  customDetails: revision342Draft.designSelections.garmentScopedCustomDetails
    ?.selectionsByGarmentKey,
  chestBust: 102,
};
await mount(revision342Draft, {
  styles: revision342StyleModel.styles as StyleCategory[],
  fabrics: revision342Fabrics,
});
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 350));
});
const revision343Payload = GuestOrderSessionService.getFutureDesignDraft();
assert.deepEqual(
  summarizeRevision342Draft(revision343Payload),
  expectedRevision342Summary,
  "The actual component autosave must preserve the full historical draft payload.",
);
act(() => renderer.unmount());
await mount(null, {
  styles: revision342StyleModel.styles as StyleCategory[],
  fabrics: revision342Fabrics,
});
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 350));
});
assert.deepEqual(
  summarizeRevision342Draft(GuestOrderSessionService.getFutureDesignDraft()),
  expectedRevision342Summary,
  "The second component hydration must preserve the component-generated revision.",
);
act(() => renderer.unmount());
StorageService.clearGuestOrderSession();

// Both skirt identities traverse the production component's hydrate/autosave/
// unmount/remount path, followed by its actual fresh V2 Payment Review handoff.
const skirtKeys = ["base:skirt", "base:long_skirt"];
const skirtSelection = reconcileGarmentTypeSelectionOccurrenceIdentities({
  selection: reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["skirt", "long_skirt"], selectedDemographic: "female",
    normalizedCustomDetailCatalog: inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG).activeOptions,
  }).selection,
  activeGarmentKeys: skirtKeys,
});
const skirtOccurrences = buildAuthoritativePhysicalOccurrences({
  sourceKind: "catalogue", step1GarmentTypeSelection: skirtSelection,
  effectiveGarmentTypeSelection: skirtSelection,
});
const skirtFabrics = ["SKIRT-FABRIC-A", "SKIRT-FABRIC-B"].map((code) => ({
  ...fabric, code, name: code,
}));
const skirtStyles = ["standard", "long"].map((id) => ({
  ...revision342StyleDraft, id: `skirt-style-${id}`, name: `Skirt Style ${id}`,
  garmentTypes: ["skirt", "long_skirt"],
  fabricCapacityComposition: skirtOccurrences.map((occurrence) => ({
    key: occurrence.garmentKey, garmentType: occurrence.garmentType, fabricUnits: 1 as const,
  })),
}));
const skirtStyleModel = createDesignStyleStepTestModel({
  styles: skirtStyles, garmentTypeSelection: skirtSelection, occurrences: skirtOccurrences,
  selectedStyleIdByGarmentKey: {
    "base:skirt": "skirt-style-standard", "base:long_skirt": "skirt-style-long",
  },
});
assert.equal(skirtStyleModel.projection.completedCount, 2);
assert.ok(skirtStyleModel.hydration.envelope);
const skirtSource = createCatalogDesignSource(skirtStyles[0].id);
assert.ok(skirtSource);
const skirtDraft: GuestDesignDraft = {
  ...initialDraft, currentStageId: "measurement", currentStep: 6,
  garmentTypeSelection: skirtSelection, garmentPieceCount: 2,
  selectedFabricCode: skirtFabrics[0].code, priceActivatedFabricCode: skirtFabrics[0].code,
  selectedStyleId: skirtStyles[0].id, confirmedStyleId: skirtStyles[0].id,
  designSource: skirtSource, confirmedDesignSourceKey: skirtSource.sourceKey,
  designStyleAssignmentDraft: skirtStyleModel.hydration.envelope,
  fabricAllocations: physicalOccurrencesToFabricRequirements(skirtOccurrences).map((assignment, index) => ({
    allocationId: `skirt-allocation-${index}`, fabricCode: skirtFabrics[index].code,
    garmentAssignments: [assignment],
  })),
  designSelections: {
    accessories: [], garmentScopedCustomDetails: {
      schemaVersion: 1,
      selectionsByGarmentKey: {
        "base:skirt": { skirt_pockets: "skirt_pocket_1" },
        "base:long_skirt": { skirt_pockets: "skirt_pocket_2" },
      },
      snapshotsByGarmentKey: {},
    },
  },
  aiTryOnWorkflow: { schemaVersion: 1, status: "skipped", inputFingerprint: null },
  futureMeasurementState: createEmptyFutureMeasurementState("low_risk", "cm"),
  updatedAt: "2026-09-10T08:00:00.000Z",
};
const skirtMountOptions = { styles: [...skirtStyleModel.styles], fabrics: skirtFabrics };
await mount(skirtDraft, skirtMountOptions);
const skirtMeasurementStep = renderer.root.findByType(DormantFutureMeasurementStep);
const initialSkirtProfiles = skirtMeasurementStep.props.plan.profiles;
assert.deepEqual(skirtMeasurementStep.props.plan.profiles.map((profile: {
  garmentKey: string; profile: { id: string }; constructionOptionId: string;
}) => [profile.garmentKey, profile.profile.id, profile.constructionOptionId]), [
  ["base:long_skirt", "M", "skirt_long"], ["base:skirt", "L", "skirt_std"],
]);
let skirtMeasurements = skirtMeasurementStep.props.state;
const skirtMeasurementValuesCm: Record<string, number> = {
  waist_circumference: 76, hip_circumference: 100, thigh_circumference: 58,
  waist_to_hip_length: 20, skirt_bottom_circumference: 110,
  waist_to_lap_length: 35, waist_to_knee_length: 55, waist_to_ankle_length: 95,
  total_height: 170, height_head_to_lower_neck: 30,
  height_lower_neck_to_waist: 40, height_waist_to_feet: 100,
};
for (const requirement of skirtMeasurementStep.props.plan.requirements.filter(
  (item: { directInput: boolean }) => item.directInput,
)) {
  assert.ok(skirtMeasurementValuesCm[requirement.measurementId],
    `Missing fixture value for ${requirement.measurementId}`);
  skirtMeasurements = setFutureMeasurementInput({
    state: skirtMeasurements, requirement,
    displayValue: skirtMeasurementValuesCm[requirement.measurementId],
  });
}
await act(async () => {
  skirtMeasurementStep.props.onChange(reconcileFutureMeasurementState({
    state: skirtMeasurements, plan: skirtMeasurementStep.props.plan,
  }));
  await flush();
});
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
const skirtAutosaved = GuestOrderSessionService.getFutureDesignDraft();
assert.ok(skirtAutosaved);
assert.notEqual(skirtAutosaved.updatedAt, skirtDraft.updatedAt, "The production autosave must actually run.");
assert.deepEqual(requireFutureMeasurementStateV1(skirtAutosaved.futureMeasurementState).entered, skirtMeasurements.entered,
  "Persist customer measurements; derived measurement status is rebuilt on hydration.");
act(() => renderer.unmount());
await mount(null, skirtMountOptions);
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
const remountedSkirts = GuestOrderSessionService.getFutureDesignDraft();
assert.ok(remountedSkirts);
assert.deepEqual(remountedSkirts.garmentTypeSelection, skirtAutosaved.garmentTypeSelection);
assert.deepEqual(remountedSkirts.garmentTypeSelection.physicalOccurrenceIdentityState,
  skirtSelection.physicalOccurrenceIdentityState);
assert.deepEqual(remountedSkirts.fabricAllocations, skirtDraft.fabricAllocations);
assert.deepEqual(remountedSkirts.designSelections.garmentScopedCustomDetails?.selectionsByGarmentKey,
  skirtDraft.designSelections.garmentScopedCustomDetails?.selectionsByGarmentKey);
const remountedStyleDraft = inspectPersistedDesignStyleDraft(remountedSkirts);
assert.ok(remountedStyleDraft.status === "valid");
assert.deepEqual(remountedStyleDraft.envelope.ledger.assignmentsByGarmentKey,
  skirtStyleModel.hydration.envelope.ledger.assignmentsByGarmentKey);
const remountedOccurrences = buildAuthoritativePhysicalOccurrences({
  sourceKind: "catalogue", step1GarmentTypeSelection: remountedSkirts.garmentTypeSelection,
  effectiveGarmentTypeSelection: remountedSkirts.garmentTypeSelection,
});
assert.deepEqual(remountedOccurrences.map((item) => [item.garmentKey, item.garmentType]),
  [["base:skirt", "skirt"], ["base:long_skirt", "long_skirt"]]);
const remountedMeasurementStep = renderer.root.findByType(DormantFutureMeasurementStep);
assert.deepEqual(remountedMeasurementStep.props.plan.profiles, initialSkirtProfiles);
assert.equal(remountedMeasurementStep.props.state.calculationStatus, "complete",
  JSON.stringify(remountedMeasurementStep.props.state.diagnostics));
await act(async () => { remountedMeasurementStep.props.onContinue(); await flush(); });
const skirtSummary = renderer.root.findByType(DormantFutureSummaryStep);
const expectedSkirtRows = [
  ["base:skirt", "skirt", "Standard Skirt", "skirt_std", 7500],
  ["base:long_skirt", "long_skirt", "Long Skirt", "skirt_long", 8000],
];
const summarizeSkirtRow = (garment: {
  garmentKey: string; garmentType: string; label: string;
  construction: readonly { optionId: string }[]; constructionTotalCents: number | null;
}) => [garment.garmentKey, garment.garmentType, garment.label,
  garment.construction[0].optionId, garment.constructionTotalCents];
assert.deepEqual(skirtSummary.props.summary.garmentSummary.map(summarizeSkirtRow), expectedSkirtRows);
assert.equal(skirtSummary.props.canContinueToShipping, true);
await act(async () => { skirtSummary.props.onContinueToShipping(); await flush(); });
await act(async () => {
  renderer.root.findByType(DormantFutureShippingStep).props.onChange({
    ...createEmptyFutureShippingState(), fulfilmentMethod: "eindhoven_pickup",
    customerInformation: {
      ...createEmptyFutureShippingState().customerInformation,
      fullName: "Skirt Regression", phone: "+31612345678", email: "skirts@example.test",
    },
  });
  await flush();
});
const skirtShipping = renderer.root.findByType(DormantFutureShippingStep);
assert.equal(skirtShipping.props.canContinueToReview, true);
await act(async () => { skirtShipping.props.onContinueToReview(); await flush(); });
const skirtPayment = renderer.root.findByType(DormantFuturePaymentReviewStep).props.result;
assert.equal(skirtPayment.status, "reviewable");
assert.equal(skirtPayment.candidate.schemaVersion, 2, "Exercise the production occurrence-aware V2 builder.");
assert.deepEqual(getFuturePaymentReviewGarments(skirtPayment.candidate).map(({ garment }) =>
  summarizeSkirtRow(garment)), expectedSkirtRows);
assert.deepEqual(skirtPayment.candidate.occurrenceStyleSnapshots.map((row: {
  occurrence: { garmentKey: string }; catalogue: { styleId: string };
}) => [row.occurrence.garmentKey, row.catalogue.styleId]), [
  ["base:skirt", "skirt-style-standard"], ["base:long_skirt", "skirt-style-long"],
]);
assert.deepEqual(skirtPayment.candidate.fabricAllocations.map((allocation: {
  fabricCode: string; garmentAssignments: readonly { garmentKey: string }[];
}) => [allocation.fabricCode, allocation.garmentAssignments.map((item) => item.garmentKey)]), [
  ["SKIRT-FABRIC-A", ["base:skirt"]], ["SKIRT-FABRIC-B", ["base:long_skirt"]],
]);
assert.deepEqual(skirtPayment.candidate.customDetails.map((detail: {
  garmentKey: string; optionId: string;
}) => [detail.garmentKey, detail.optionId]).sort(), [
  ["base:long_skirt", "skirt_pocket_2"], ["base:skirt", "skirt_pocket_1"],
]);
act(() => renderer.unmount());
StorageService.clearGuestOrderSession();
console.log("PASS: Standard Skirt + Long Skirt component autosave/remount and V2 Payment Review coexistence");
console.log("PASS: spare capacity Fabric commits finalize and persist before Design Style");
