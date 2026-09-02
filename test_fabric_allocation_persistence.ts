/**
 * Fabric allocation persistence and hydration normalization.
 * Requires Vite production Firebase env — do not run with plain `tsx`.
 * Canonical: npm run test:fabric-allocation-persistence
 */
import assert from "node:assert/strict";
import type {
  CartItem,
  Fabric,
  FabricAllocation,
  GuestDesignDraft,
  StyleCategory,
} from "./src/types";
import { stampCurrentCartShippingItem } from "./src/utils/shippingPricing";
import {
  getFabricAllocationSyncSignature,
  getPersistableCartItemFabricAllocationsForOrder,
  resolveDraftAutosaveFabricAllocations,
  resolveDraftHydrationAllocations,
} from "./src/utils/fabricAllocationPersistence";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";

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

const memoryStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: memoryStorage,
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: memoryStorage },
});

const { StorageService } = await import("./src/services/storageService");
const { GuestOrderSessionService, getCartItemConfigurationHash } = await import(
  "./src/services/guestOrderSessionService"
);

const style: StyleCategory = {
  id: "stage4-style",
  name: "Stage 4 Style",
  description: "Fabric persistence validation style.",
  gender: "female",
  options: [],
};

const makeFabric = (code: string): Fabric => ({
  code,
  name: `${code} Name`,
  description: `${code} Description`,
  color: "Blue",
  colorHex: "#1e40af",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
});

const defaultFabric = makeFabric("FABRIC-A");

const multiAllocationFixture: FabricAllocation[] = [
  {
    allocationId: "alloc-A",
    fabricCode: "FABRIC-A",
    garmentAssignments: [
      {
        garmentKey: "G5.2:shirt",
        code: "G5.2",
        garmentType: "shirt",
        fabricUnits: 1,
      },
      {
        garmentKey: "G5.2:trouser",
        code: "G5.2",
        garmentType: "trouser",
        fabricUnits: 1,
      },
    ],
  },
  {
    allocationId: "alloc-B",
    fabricCode: "FABRIC-B",
    garmentAssignments: [
      {
        garmentKey: "L7:skirt",
        code: "L7",
        garmentType: "skirt",
        fabricUnits: 1,
        lowerGarmentType: "skirt",
      },
    ],
  },
];

const sameFabricDifferentIdsFixture: FabricAllocation[] = [
  {
    allocationId: "same-fabric-1",
    fabricCode: "FABRIC-A",
    garmentAssignments: [
      {
        garmentKey: "G1:shirt",
        code: "G1",
        garmentType: "shirt",
        fabricUnits: 1,
      },
    ],
  },
  {
    allocationId: "same-fabric-2",
    fabricCode: "FABRIC-A",
    garmentAssignments: [
      {
        garmentKey: "G4:trouser",
        code: "G4",
        garmentType: "trouser",
        fabricUnits: 1,
      },
    ],
  },
];

const makeCartItem = (
  id: string,
  overrides: Partial<CartItem> = {},
): CartItem =>
  stampCurrentCartShippingItem(
    {
      id,
      customer: {
        name: "Stage 4 Customer",
        email: "stage4@example.com",
        phone: "",
      },
      style,
      fabric: defaultFabric,
      design: {
        customDetails: {},
        priceCode: "G5.2",
      },
      garment: {
        type: "Shirt and Trouser",
        totalPrice: 120,
        fabricPrice: 30,
        fabricSewingCost: 15,
        constructionSewingCost: 75,
      },
      measurements: {
        height: 175,
        weight: 72,
        age: 29,
        bodyBuild: "Average",
        fitPreference: "Standard",
        neck: 15,
        shoulder: 18,
        chest: 40,
        waist: 33,
        hip: 41,
        sleeve: 24,
        trouserLength: 41,
        isAiEstimated: false,
      },
      specialInstructions: "",
      notesAboutLeftoverFabric: "",
      batchType: "alone",
      garmentPieceCount: 1,
      deliverySelection: {
        method: "PICKUP",
        pickupLocation: "Veldhoven Campus Lockers",
      },
      ...overrides,
    } as CartItem,
    "2026-08-07T08:00:00.000Z",
  );

const makeGuestDraft = (
  overrides: Partial<GuestDesignDraft> = {},
): GuestDesignDraft => ({
  journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
  currentStageId: "fabric",
  currentStep: 4,
  selectedFabricCode: "FABRIC-A",
  selectedStyleId: style.id,
  selectedGarment: {
    type: "Shirt and Trouser",
    fee: 0,
    code: "G5.2",
  },
  designSelections: {
    lowerGarmentType: "trousers",
    priceCode: "G5.2",
  },
  measurements: makeCartItem("draft-measurements").measurements,
  sizingMode: "manual",
  deliveryMethod: "PICKUP",
  deliveryAddress: {
    addressLine1: "",
    city: "",
    postalCode: "",
    countryCode: "",
  },
  pickupTime: "Morning",
  customerName: "Stage 4 Draft",
  customerEmail: "stage4@example.com",
  customerPhone: "",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "",
  leftoverFabricChoice: "",
  hasLining: false,
  pricingBreakdown: {
    fabricPrice: 30,
    fabricSewingCost: 15,
    constructionSewingCost: 75,
    customDetailsPrice: 0,
    lagosToEindhovenShipping: 0,
    eindhovenToDestinationShipping: 0,
    total: 120,
  },
  shippingSnapshot: {},
  updatedAt: "2026-08-07T08:00:00.000Z",
  ...overrides,
});

memoryStorage.clear();
StorageService.clearGuestOrderSession();

const savedMulti = GuestOrderSessionService.saveGuestCartItems([
  makeCartItem("multi-alloc", {
    fabricAllocations: multiAllocationFixture,
  }),
])[0];
assert.equal(savedMulti.fabricAllocations?.length, 2);
assert.deepEqual(savedMulti.fabricAllocations, multiAllocationFixture);
assert.equal(savedMulti.fabricAllocations?.[0].allocationId, "alloc-A");
assert.equal(savedMulti.fabricAllocations?.[1].allocationId, "alloc-B");

const restoredMulti = GuestOrderSessionService.getGuestCartItems()[0];
assert.equal(restoredMulti.fabricAllocations?.length, 2);
assert.deepEqual(restoredMulti.fabricAllocations, multiAllocationFixture);
assert.deepEqual(
  restoredMulti.fabricAllocations?.[0].garmentAssignments.map((assignment) => assignment.garmentKey),
  ["G5.2:shirt", "G5.2:trouser"],
);
assert.deepEqual(
  restoredMulti.fabricAllocations?.[1].garmentAssignments.map((assignment) => assignment.garmentKey),
  ["L7:skirt"],
);

const savedSameFabric = GuestOrderSessionService.saveGuestCartItems([
  makeCartItem("same-fabric", {
    fabricAllocations: sameFabricDifferentIdsFixture,
  }),
])[0];
assert.equal(savedSameFabric.fabricAllocations?.length, 2);
assert.equal(savedSameFabric.fabricAllocations?.[0].fabricCode, "FABRIC-A");
assert.equal(savedSameFabric.fabricAllocations?.[1].fabricCode, "FABRIC-A");
assert.notEqual(
  savedSameFabric.fabricAllocations?.[0].allocationId,
  savedSameFabric.fabricAllocations?.[1].allocationId,
);

const kaftanItem = GuestOrderSessionService.saveGuestCartItems([
  makeCartItem("kaftan", {
    garmentPieceCount: 1,
    design: {
      priceCode: "KAFTAN",
    },
    fabricAllocations: [
      {
        allocationId: "kaftan-1",
        fabricCode: "FABRIC-KAFTAN",
        garmentAssignments: [
          {
            garmentKey: "KAFTAN:kaftan",
            code: "KAFTAN",
            garmentType: "kaftan",
            fabricUnits: 2,
            garmentSpec: {
              key: "KAFTAN:kaftan",
              garmentType: "kaftan",
              fabricUnits: 2,
            },
          },
        ],
      },
    ],
  }),
])[0];
assert.equal(kaftanItem.garmentPieceCount, 1);
assert.equal(
  kaftanItem.fabricAllocations?.[0].garmentAssignments[0].fabricUnits,
  2,
);

const modernHashA = makeCartItem("modern-hash-a", {
  fabric: makeFabric("LEGACY-CONFLICT-A"),
  fabricAllocations: multiAllocationFixture,
});
const modernHashB = makeCartItem("modern-hash-b", {
  fabric: makeFabric("LEGACY-CONFLICT-B"),
  fabricAllocations: multiAllocationFixture,
});
assert.equal(
  getCartItemConfigurationHash(modernHashA),
  getCartItemConfigurationHash(modernHashB),
  "valid modern allocations must override stale legacy singular fabric code in hash identity",
);

const legacyHashA = makeCartItem("legacy-hash-a", {
  fabric: makeFabric("LEGACY-ONLY-A"),
  design: {
    priceCode: "UNKNOWN",
  },
});
const legacyHashB = makeCartItem("legacy-hash-b", {
  fabric: makeFabric("LEGACY-ONLY-B"),
  design: {
    priceCode: "UNKNOWN",
  },
});
assert.notEqual(
  getCartItemConfigurationHash(legacyHashA),
  getCartItemConfigurationHash(legacyHashB),
  "legacy-only hash behavior must continue to include singular fabric code",
);

const hashBase = makeCartItem("hash-base", {
  fabricAllocations: multiAllocationFixture,
});
const hashVariant = makeCartItem("hash-variant", {
  fabricAllocations: [
    multiAllocationFixture[0],
    {
      ...multiAllocationFixture[1],
      fabricCode: "FABRIC-C",
    },
  ],
});
assert.notEqual(
  getCartItemConfigurationHash(hashBase),
  getCartItemConfigurationHash(hashVariant),
);

const transientHash = getCartItemConfigurationHash({
  ...hashBase,
  activeAllocationId: "alloc-B",
  pendingFabricGarment: multiAllocationFixture[1].garmentAssignments[0],
  awaitingFabricForPendingGarment: true,
} as CartItem);
assert.equal(transientHash, getCartItemConfigurationHash(hashBase));

const activeSession = GuestOrderSessionService.getActiveSession();
const malformedModernAllocations = [
  {
    allocationId: "malformed-alloc-1",
    fabricCode: "FABRIC-MALFORMED",
    garmentAssignments: [
      {
        garmentKey: "G1:shirt",
        code: "G1",
        garmentType: "shirt",
        fabricUnits: 1,
      },
      {
        garmentKey: "BROKEN",
        code: "BROKEN",
        fabricUnits: 1,
      },
    ],
  },
];
const malformedModernItem = makeCartItem("malformed-modern", {
  fabricAllocations: malformedModernAllocations as unknown as FabricAllocation[],
});
StorageService.saveGuestOrderSession({
  ...activeSession,
  cartItems: [
    {
      ...malformedModernItem,
      fabricAllocations: malformedModernAllocations as unknown as FabricAllocation[],
    },
  ],
  updatedAt: "2026-08-07T09:15:00.000Z",
});
GuestOrderSessionService.getActiveSession();
const persistedMalformedSession = StorageService.getGuestOrderSession();
assert(persistedMalformedSession, "Expected malformed session to remain stored");
const persistedMalformedItem = persistedMalformedSession.cartItems[0] as unknown as Record<
  string,
  unknown
>;
assert.deepEqual(
  persistedMalformedItem.fabricAllocations,
  malformedModernAllocations,
  "malformed modern allocations must be preserved non-destructively and never partially rewritten",
);
const preservedAutosaveAllocations = resolveDraftAutosaveFabricAllocations({
  preservedInvalidHydratedFabricAllocations: malformedModernAllocations,
  hasUnresolvedHydratedFabricIntegrity: true,
  generatedFabricAllocations: [],
});
assert.equal(preservedAutosaveAllocations.preserveInvalidHydratedModernData, true);
assert.deepEqual(
  preservedAutosaveAllocations.fabricAllocations,
  malformedModernAllocations,
  "hydration autosave must preserve malformed modern allocations while their integrity blocker remains unresolved",
);
const replacedAutosaveAllocations = resolveDraftAutosaveFabricAllocations({
  preservedInvalidHydratedFabricAllocations: malformedModernAllocations,
  hasUnresolvedHydratedFabricIntegrity: false,
  generatedFabricAllocations: multiAllocationFixture,
});
assert.equal(replacedAutosaveAllocations.preserveInvalidHydratedModernData, false);
assert.deepEqual(
  replacedAutosaveAllocations.fabricAllocations,
  multiAllocationFixture,
  "an explicitly resolved integrity condition should allow regenerated valid allocations",
);
assert.notEqual(
  getFabricAllocationSyncSignature("FABRIC-A", "EXACT", undefined, "style-a"),
  getFabricAllocationSyncSignature("FABRIC-A", "EXACT", undefined, "style-b"),
  "an exact-style replacement must invalidate the previous allocation signature",
);

const legacyStructured = GuestOrderSessionService.saveGuestCartItems([
  makeCartItem("legacy-structured", {
    fabric: makeFabric("LEGACY-FABRIC"),
    design: {
      priceCode: "G5.2",
      lowerGarmentType: "trousers",
    },
  }),
])[0];
assert.equal(legacyStructured.fabricAllocations?.length, 1);
assert.equal(legacyStructured.fabricAllocations?.[0].allocationId, "LEGACY-FABRIC-1");
assert.equal(legacyStructured.fabricAllocations?.[0].fabricCode, "LEGACY-FABRIC");

const legacyUnstructured = GuestOrderSessionService.saveGuestCartItems([
  makeCartItem("legacy-unstructured", {
    design: {
      customDetails: {
        neck_design: "neck_no_round",
      },
    },
  }),
])[0];
assert.equal(legacyUnstructured.fabricAllocations, undefined);

const conflictingModernCartItem = GuestOrderSessionService.saveGuestCartItems([
  makeCartItem("modern-authority", {
    fabric: makeFabric("LEGACY-FABRIC-A"),
    fabricAllocations: [
      {
        allocationId: "modern-authority-1",
        fabricCode: "FABRIC-B",
        garmentAssignments: [
          {
            garmentKey: "L7:skirt",
            code: "L7",
            garmentType: "skirt",
            fabricUnits: 1,
            lowerGarmentType: "skirt",
          },
        ],
      },
    ],
  }),
])[0];
assert.equal(
  conflictingModernCartItem.fabricAllocations?.[0].fabricCode,
  "FABRIC-B",
);
const persistableOrderAllocations =
  getPersistableCartItemFabricAllocationsForOrder(conflictingModernCartItem);
assert.deepEqual(
  persistableOrderAllocations,
  conflictingModernCartItem.fabricAllocations,
  "valid modern cart allocations should be carried into order mapping",
);
const malformedPersistableOrderAllocations =
  getPersistableCartItemFabricAllocationsForOrder(
    malformedModernItem,
  );
assert.equal(
  malformedPersistableOrderAllocations,
  undefined,
  "invalid modern cart allocations should be omitted during order mapping without throwing or partial cloning",
);
const legacyOrderAllocations = getPersistableCartItemFabricAllocationsForOrder(
  legacyStructured,
);
assert.equal(legacyOrderAllocations?.length, 1);
assert.equal(legacyOrderAllocations?.[0].allocationId, "LEGACY-FABRIC-1");

const conflictingDraft = makeGuestDraft({
  selectedFabricCode: "LEGACY-DRAFT-FABRIC-A",
  fabricAllocations: [
    {
      allocationId: "draft-modern-1",
      fabricCode: "FABRIC-B",
      garmentAssignments: [
        {
          garmentKey: "L7:skirt",
          code: "L7",
          garmentType: "skirt",
          fabricUnits: 1,
          lowerGarmentType: "skirt",
        },
      ],
    },
  ],
});
const hydrationResolution = resolveDraftHydrationAllocations(conflictingDraft);
assert.equal(hydrationResolution.hasValidModernAllocations, true);
assert.equal(
  hydrationResolution.primaryFabricCode,
  "FABRIC-B",
  "conflicting selectedFabricCode must not override authoritative modern allocation ownership",
);
const customDetailGarmentDraft = makeGuestDraft({
  fabricAllocations: [
    multiAllocationFixture[0],
    {
      allocationId: "draft-bum-shorts-2",
      fabricCode: "FABRIC-B",
      garmentAssignments: [
        {
          garmentKey: "custom-detail:additional_physical_garment:bum-shorts",
          code: "additional_garment_bum_shorts",
          garmentType: "bum_shorts",
          fabricUnits: 1,
          garmentSpec: {
            key: "additional-garment-bum-shorts",
            garmentType: "bum_shorts",
            fabricUnits: 1,
          },
        },
      ],
    },
  ],
});
const customDetailGarmentHydration =
  resolveDraftHydrationAllocations(customDetailGarmentDraft);
assert.equal(customDetailGarmentHydration.hasValidModernAllocations, true);
assert.equal(customDetailGarmentHydration.fabricAllocations.length, 2);
assert.equal(
  customDetailGarmentHydration.fabricAllocations[1]?.garmentAssignments[0]
    ?.garmentType,
  "bum_shorts",
  "Custom Detail physical garments must survive strict draft hydration",
);
const catalogAdditionalGarmentDraft = makeGuestDraft({
  fabricAllocations: [
    {
      allocationId: "catalog-additional-1",
      fabricCode: "FABRIC-A",
      garmentAssignments: [
        {
          garmentKey: "base:trouser",
          code: "STYLE_BASE_TROUSER",
          garmentType: "trouser",
          fabricUnits: 1,
          sourceRole: "main",
        },
        {
          garmentKey: "additional:shirt:1",
          code: "ADDITIONAL_SHIRT_1",
          garmentType: "shirt",
          fabricUnits: 1,
          garmentSpec: {
            key: "additional:shirt:1",
            garmentType: "shirt",
            fabricUnits: 1,
          },
          sourceRole: "additional",
          eligibilityRule: "catalog_all",
          dependencyStatus: "valid",
        },
      ],
    },
  ],
});
const catalogAdditionalHydration = resolveDraftHydrationAllocations(
  catalogAdditionalGarmentDraft,
);
assert.equal(catalogAdditionalHydration.hasValidModernAllocations, true);
assert.deepEqual(
  catalogAdditionalHydration.fabricAllocations[0]?.garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:trouser", "additional:shirt:1"],
  "catalog-wide additional garments must survive strict draft hydration",
);
GuestOrderSessionService.saveFutureDesignDraft(catalogAdditionalGarmentDraft);
const restoredCatalogAdditionalDraft =
  GuestOrderSessionService.getFutureDesignDraft();
assert.deepEqual(
  restoredCatalogAdditionalDraft?.fabricAllocations,
  catalogAdditionalHydration.fabricAllocations,
  "catalog-wide additional garments must round-trip through draft persistence",
);
GuestOrderSessionService.saveFutureDesignDraft(conflictingDraft);
const restoredDraft = GuestOrderSessionService.getFutureDesignDraft();
assert(restoredDraft, "Expected a guest draft to be restored");
assert.equal(restoredDraft.fabricAllocations?.[0].fabricCode, "FABRIC-B");
assert.equal(
  Object.prototype.hasOwnProperty.call(savedMulti, "quantity"),
  false,
);
assert.equal(
  Object.prototype.hasOwnProperty.call(restoredDraft, "quantity"),
  false,
);

console.log("PASS: stage 4 fabric allocation persistence and normalization");
