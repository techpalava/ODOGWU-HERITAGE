/**
 * Later-stage leftover-capacity presentation must stay non-blocking while
 * Fabric-stage auto-open and allocation authority remain unchanged.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import DesignStudioView from "./src/components/DesignStudioView";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { DormantFutureFabricStep } from "./src/components/DormantFutureFabricStep";
import { DesignStudioJourneyStepper } from "./src/components/DesignStudioJourneyStepper";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { useAppStore } from "./src/store/useAppStore";
import type {
  Fabric,
  FabricAllocationState,
  GuestDesignDraft,
  Measurements,
  StyleCategory,
} from "./src/types";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  prepareAuthoritativeDesignStyleRecord,
  projectPublishedDesignStyleRecord,
} from "./src/utils/designStyleAuthority";
import { createCatalogDesignSource } from "./src/utils/designSourceState";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { cloneFabricAllocations } from "./src/utils/fabricAllocationPersistence";

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
    this.values.set(key, String(value));
  }
}

const memoryStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
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
    localStorage: memoryStorage,
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
const { GuestOrderSessionService } = await import(
  "./src/services/guestOrderSessionService"
);

const fabric: Fabric = {
  code: "LEFTOVER-01",
  name: "Leftover Capacity Test Fabric",
  description: "",
  color: "Green",
  colorHex: "#0A4A33",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Test",
  price: 12,
};
const styleDraft = {
  id: "leftover-capacity-style",
  name: "Leftover Capacity Style",
  category: "Shirt",
  description: "",
  basePrice: 65,
  image: "https://example.test/style.jpg",
  availableFor: ["male"],
  garmentTypes: ["shirt", "bum_shorts", "trouser"],
  gender: "male",
  options: [],
  status: "published",
  fabricCapacityComposition: [
    { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
  ],
} as unknown as StyleCategory;
const publishedStyle = projectPublishedDesignStyleRecord(
  prepareAuthoritativeDesignStyleRecord({
    style: styleDraft,
    lifecycle: "published",
    displayOrder: 1,
    referenceComposition: {
      status: "known",
      garmentTypes: ["shirt", "bum_shorts", "trouser"],
    },
    currentRecord: null,
  }),
);
assert.ok(publishedStyle);
const styles = [publishedStyle];
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: inspectCustomDetailCatalog(
    SEED_CUSTOM_DETAIL_CATALOG,
  ).activeOptions,
}).selection;
const createHalfUsedShirtState = (): FabricAllocationState => {
  let state = FabricAllocationStateEngine.initialize();
  state = FabricAllocationStateEngine.createAllocationForFabric(
    state,
    fabric.code,
  );
  return FabricAllocationStateEngine.attemptAppendGarment(state, {
    code: "BASE_SHIRT",
    garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    sourceRole: "main",
  });
};
const twoGarmentSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: inspectCustomDetailCatalog(
    SEED_CUSTOM_DETAIL_CATALOG,
  ).activeOptions,
}).selection;
const createFullShirtTrouserState = (): FabricAllocationState => {
  let state = createHalfUsedShirtState();
  return FabricAllocationStateEngine.attemptAppendGarment(state, {
    code: "BASE_TROUSER",
    garmentSpec: { key: "base:trouser", garmentType: "trouser", fabricUnits: 1 },
    sourceRole: "main",
  });
};
const measurements: Measurements = {
  height: 0,
  weight: 0,
  age: 0,
  bodyBuild: "Average",
  fitPreference: "Standard",
  neck: 0,
  shoulder: 0,
  chest: 0,
  waist: 0,
  hip: 0,
  sleeve: 0,
  trouserLength: 0,
  isAiEstimated: false,
};
const source = createCatalogDesignSource(styles[0].id);
assert.ok(source);
const createDraft = (
  stageId: GuestDesignDraft["currentStageId"],
  fabricAllocations: FabricAllocationState["fabricAllocations"],
  selection = garmentTypeSelection,
): GuestDesignDraft => ({
  journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
  currentStageId: stageId,
  currentStep: stageId === "fabric" ? 2 : 4,
  garmentTypeSelection: selection,
  selectedFabricCode: fabric.code,
  selectedStyleId: styles[0].id,
  designSource: source,
  confirmedStyleId: styles[0].id,
  confirmedDesignSourceKey: source.sourceKey,
  priceActivatedFabricCode: fabric.code,
  selectedGarment: null,
  designSelections: { accessories: [] },
  measurements,
  sizingMode: "manual",
  deliveryMethod: null,
  deliveryAddress: {
    addressLine1: "",
    city: "",
    postalCode: "",
    countryCode: "",
  },
  pickupTime: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  batchType: "alone",
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
    lagosToEindhovenShipping: 0,
    eindhovenToDestinationShipping: 0,
    total: 65,
  },
  shippingSnapshot: {},
  fabricAllocations,
  updatedAt: "2026-09-18T08:00:00.000Z",
});

let renderer!: ReturnType<typeof create>;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
const mount = async (seed: GuestDesignDraft) => {
  StorageService.clearGuestOrderSession();
  GuestOrderSessionService.saveFutureDesignDraft(seed);
  useAppStore.setState({
    businessSettings: DEFAULT_BUSINESS_SETTINGS,
    isLoadingData: false,
    stylesLoadState: "ready",
    batches: [],
    customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG,
    setNotification: () => undefined,
  } as Partial<ReturnType<typeof useAppStore.getState>> as never);
  await act(async () => {
    renderer = create(
      createElement(DesignStudioView, {
        onAddToCart: () => undefined,
        openCartDrawer: () => undefined,
        styles,
        fabrics: [fabric],
        currentUser: null,
        orderContext: null,
      }),
    );
    await flush();
  });
};
const journeyStage = () =>
  renderer.root.findByProps({ id: "design-studio-ten-stage-journey" }).props[
    "data-stage-id"
  ];
const offerModalCount = () =>
  renderer.root.findAllByProps({
    "data-testid": "remaining-fabric-capacity-offer",
  }).length;
const offerPromptCount = () =>
  renderer.root.findAllByProps({
    "data-testid": "remaining-fabric-capacity-offer-prompt",
  }).length;
const allocationSnapshotFromCustomDetails = () =>
  cloneFabricAllocations(
    renderer.root.findByType(DormantFutureCustomDetailsStep).props
      .fabricAllocationState.fabricAllocations,
  );
const advanceFromFabricStepToCustomDetails = async () => {
  await act(async () => {
    renderer.root.findByType(DormantFutureFabricStep).props.onContinue();
    await flush();
  });
  assert.equal(journeyStage(), "design_style");
  assert.equal(
    offerModalCount(),
    0,
    "Design Style must not auto-open leftover capacity.",
  );
  const designStyleStep = renderer.root.findByType(DormantFutureDesignStyleStep);
  const catalogueRequests = Object.values(
    designStyleStep.props.catalogueEntries[0].requestsByOccurrenceToken,
  );
  assert.ok(catalogueRequests.length >= 1);
  await act(async () => {
    designStyleStep.props.onAssignCatalogueStyle(catalogueRequests);
    await flush();
  });
  const completedDesignStyleStep = renderer.root.findByType(
    DormantFutureDesignStyleStep,
  );
  assert.equal(
    completedDesignStyleStep.props.exactSetComplete,
    true,
    "Design Style must be complete before Custom Details can open.",
  );
  await act(async () => {
    completedDesignStyleStep.props.onContinue();
    await flush();
  });
  assert.equal(journeyStage(), "custom_details");
};

const leftoverState = createHalfUsedShirtState();
await mount(createDraft("fabric", leftoverState.fabricAllocations));
assert.equal(journeyStage(), "fabric");
assert.equal(offerModalCount(), 1, "Fabric must still auto-open leftover capacity.");
assert.equal(offerPromptCount(), 0, "Fabric must not show the later-stage prompt.");
const leftoverAllocationId = leftoverState.fabricAllocations[0]!.allocationId;
const clickLaterStageAddGarment = async (allocationId = leftoverAllocationId) => {
  await act(async () => {
    renderer.root
      .findByProps({
        "data-testid": `remaining-fabric-capacity-offer-add-${allocationId}`,
      })
      .props.onClick();
    await flush();
  });
};

await advanceFromFabricStepToCustomDetails();
assert.equal(offerModalCount(), 0, "Custom Details must not auto-open leftover capacity.");
assert.equal(offerPromptCount(), 1, "Custom Details must show the leftover-capacity prompt.");
assert.equal(
  renderer.root.findAllByType(DormantFutureCustomDetailsStep).length,
  1,
  "Custom Details must remain the working stage behind the non-blocking prompt.",
);
assert.match(
  JSON.stringify(renderer.toJSON()),
  /Add Garment/,
  "Custom Details leftover capacity must identify the Fabric with an Add Garment action.",
);

const customDetailsAllocationsBeforeOpen = allocationSnapshotFromCustomDetails();
await clickLaterStageAddGarment();
assert.equal(offerModalCount(), 1, "The later-stage CTA must open the existing leftover-capacity flow.");
assert.equal(offerPromptCount(), 1);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "remaining-fabric-capacity-offer-selector",
  }).length,
  1,
  "Add Garment must open the leftover-capacity chooser for that exact Fabric.",
);
await act(async () => {
  renderer.root.findByProps({
    "aria-label": "Dismiss fabric capacity suggestion",
  }).props.onClick();
  await flush();
});
assert.equal(offerModalCount(), 0, "Closing the later-stage leftover-capacity flow must return to Custom Details.");
assert.equal(offerPromptCount(), 1, "Leftover capacity must remain discoverable after dismissal.");
assert.deepEqual(
  allocationSnapshotFromCustomDetails(),
  customDetailsAllocationsBeforeOpen,
  "Closing the leftover-capacity flow from Custom Details must not mutate Fabric allocations.",
);

await act(async () => {
  renderer.root.findByType(DormantFutureCustomDetailsStep).props.onBack();
  await flush();
});
assert.equal(journeyStage(), "design_style");
assert.equal(offerModalCount(), 0, "Leaving Custom Details must not carry a leftover-capacity modal.");
assert.equal(offerPromptCount(), 1, "Design Style must keep the leftover-capacity prompt.");
await act(async () => {
  renderer.root.findByType(DesignStudioJourneyStepper).props.onSelectCustomDetails();
  await flush();
});
assert.equal(journeyStage(), "custom_details");
assert.equal(offerModalCount(), 0, "Returning to Custom Details must not reopen a blocking leftover-capacity modal.");
assert.equal(offerPromptCount(), 1);

const restoredCustomDetailsDraft = GuestOrderSessionService.getFutureDesignDraft();
assert.ok(restoredCustomDetailsDraft);
assert.deepEqual(
  restoredCustomDetailsDraft.fabricAllocations?.map((allocation) => ({
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [{ fabricCode: fabric.code, garmentKeys: ["base:shirt"] }],
  "A restored draft must keep the leftover-capacity allocation.",
);

await act(async () => {
  renderer.root.findByType(DesignStudioJourneyStepper).props.onSelectPersonalizedAdditions();
  await flush();
});
if (journeyStage() === "personalized_additions") {
  assert.equal(
    offerModalCount(),
    0,
    "Personalized Additions must not auto-open leftover capacity.",
  );
  assert.equal(offerPromptCount(), 1);
} else {
  assert.equal(journeyStage(), "custom_details");
  assert.equal(offerModalCount(), 0);
  assert.equal(offerPromptCount(), 1);
}
await act(async () => {
  renderer.root
    .findByProps({ "data-testid": `remaining-fabric-capacity-offer-add-${leftoverAllocationId}` })
    .props.onClick();
  await flush();
});
assert.equal(offerModalCount(), 1, "The later-stage CTA must open the existing leftover-capacity flow.");
const stageAfterOpen = journeyStage();
await act(async () => {
  renderer.root
    .findByProps({
      "data-testid": "remaining-fabric-capacity-offer-select-bum_shorts",
    })
    .props.onClick();
});
await act(async () => {
  await flush();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await flush();
});
assert.equal(
  offerModalCount(),
  0,
  "Accepting leftover capacity must not reopen the leftover-capacity popup.",
);
assert.notEqual(
  journeyStage(),
  "fabric",
  "Accepting leftover capacity from a later stage must not bounce back to Fabric auto-open.",
);
assert.ok(
  journeyStage() === stageAfterOpen || journeyStage() === "design_style",
  `Accepting leftover capacity may stay on ${stageAfterOpen} or open Design Style for the new occurrence, not ${journeyStage()}.`,
);
const liveFabricState =
  renderer.root.findAllByType(DormantFutureFabricStep)[0]?.props
    .fabricAllocationState ||
  renderer.root.findAllByType(DormantFutureCustomDetailsStep)[0]?.props
    .fabricAllocationState;
const afterAcceptDraft = GuestOrderSessionService.getFutureDesignDraft();
const afterAcceptAllocations =
  liveFabricState?.fabricAllocations ||
  afterAcceptDraft?.fabricAllocations ||
  [];
assert.equal(
  afterAcceptAllocations.length,
  1,
  "Accepting leftover capacity from a later stage must reuse the existing allocation.",
);
const afterAcceptGarmentKeys = afterAcceptAllocations[0].garmentAssignments.map(
  (assignment: { garmentKey: string }) => assignment.garmentKey,
);
const bumShortsAssignment = afterAcceptAllocations[0].garmentAssignments.find(
  (assignment: { garmentKey: string }) =>
    assignment.garmentKey.startsWith("additional:bum_shorts:"),
);
assert.ok(
  bumShortsAssignment,
  `The leftover-capacity choice must create its exact physical Bum Shorts occurrence. Assigned: ${afterAcceptGarmentKeys.join(", ") || "(none)"} at ${journeyStage()}`,
);
assert.equal(
  afterAcceptAllocations[0].garmentAssignments.some(
    (assignment: { garmentKey: string }) => assignment.garmentKey === "base:shirt",
  ),
  true,
  "The original shirt occurrence must remain on the reused allocation.",
);
assert.equal(offerModalCount(), 0);
assert.equal(
  offerPromptCount(),
  0,
  "Exhausted leftover capacity must remove the later-stage prompt.",
);

await act(async () => {
  renderer.unmount();
  await flush();
});
const fullState = createFullShirtTrouserState();
await mount(
  createDraft("fabric", fullState.fabricAllocations, twoGarmentSelection),
);
assert.equal(offerModalCount(), 0);
assert.equal(offerPromptCount(), 0);
await advanceFromFabricStepToCustomDetails();
assert.equal(offerModalCount(), 0);
assert.equal(
  offerPromptCount(),
  0,
  "No leftover-capacity prompt may render when Fabric authority has no remaining capacity.",
);

await act(async () => {
  renderer.unmount();
  await flush();
});

console.log("PASS: remaining fabric capacity later-stage UX");
