import assert from "node:assert/strict";
import type { GuestDesignDraft } from "./src/types";

const memoryStore = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value);
  },
  removeItem: (key: string) => {
    memoryStore.delete(key);
  },
};
if (typeof sessionStorage === "undefined") {
  Object.defineProperty(globalThis, "sessionStorage", { value: memoryStorage });
}
if (typeof localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage });
}
import {
  SAVED_STUDIO_ORDER_CAP_MESSAGE,
  SAVED_STUDIO_ORDER_GARMENT_GATE_REASON,
  SAVED_STUDIO_ORDER_MAX_PER_CUSTOMER,
  buildSavedStudioOrderGarmentSummary,
  clearPendingSaveStudioOrder,
  collectUploadedSourceRefsFromDraft,
  createSavedStudioOrderPriceSnapshot,
  evaluateSavedStudioOrderChangeWarnings,
  generateSavedStudioOrderName,
  getSavedStudioOrderGate,
  hasConflictingActiveStudioDraft,
  hasPendingSaveStudioOrder,
  isUploadedSourceReferencedBySavedOrders,
  markPendingSaveStudioOrder,
  normalizeSavedStudioOrderName,
  rememberSavedOrderCartLink,
  stampLinkedSavedOrderId,
  takeSavedOrderCartLink,
} from "./src/utils/savedStudioOrderModel";
import {
  createMemorySavedStudioOrderAdapter,
  createSavedStudioOrderRepository,
} from "./src/services/savedStudioOrderService";

const makeDraft = (
  overrides: Partial<GuestDesignDraft> = {},
): GuestDesignDraft => ({
  journeySchemaVersion: 2,
  currentStageId: "fabric",
  currentStep: 2,
  garmentTypeSelection: {
    garmentTypes: ["dress", "full_length_gown"],
    demographic: "female",
    constructionByGarment: {
      dress: {
        status: "resolved",
        garmentType: "dress",
        components: [],
        totalPriceCents: 7000,
        totalPrice: 70,
      },
      full_length_gown: {
        status: "resolved",
        garmentType: "full_length_gown",
        components: [],
        totalPriceCents: 7500,
        totalPrice: 75,
      },
    },
  },
  selectedFabricCode: "FABRIC-A",
  selectedStyleId: null,
  selectedGarment: null,
  designSelections: { accessories: [] },
  measurements: {
    height: 170,
    weight: 65,
    age: 30,
    bodyBuild: "Average",
    fitPreference: "Standard",
    neck: 14,
    shoulder: 16,
    chest: 36,
    waist: 28,
    hip: 38,
    sleeve: 23,
    trouserLength: 40,
    isAiEstimated: false,
    unit: "inch",
  },
  sizingMode: "manual",
  deliveryMethod: null,
  deliveryAddress: {
    addressLine1: "",
    city: "",
    postalCode: "",
    countryCode: "",
  },
  pickupTime: "",
  customerName: "Ada",
  customerEmail: "ada@example.com",
  customerPhone: "+31000000000",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 2,
  specialInstructions: "",
  leftoverFabricChoice: "return",
  hasLining: false,
  pricingBreakdown: {
    customDetailsPrice: 0,
    garmentConstructionSubtotal: 145,
    eindhovenToDestinationShipping: null,
    total: 145,
  },
  shippingSnapshot: {},
  fabricAllocations: [
    {
      allocationId: "allocation-1",
      fabricCode: "FABRIC-A",
      garmentAssignments: [],
    },
  ],
  updatedAt: "2026-10-22T12:00:00.000Z",
  ...overrides,
});

assert.deepEqual(
  getSavedStudioOrderGate({
    garmentTypeSelection: {
      garmentTypes: [],
      demographic: "female",
      constructionByGarment: {},
    },
  }),
  { ok: false, reason: SAVED_STUDIO_ORDER_GARMENT_GATE_REASON },
);
assert.equal(getSavedStudioOrderGate(makeDraft()).ok, true);

const named = generateSavedStudioOrderName(
  makeDraft(),
  new Date("2026-10-22T12:00:00.000Z"),
);
assert.match(named, /Standard Dress \+ Long Dress, 22 Oct/);
assert.equal(buildSavedStudioOrderGarmentSummary(makeDraft()), "Standard Dress + Long Dress");
const renamedOk = normalizeSavedStudioOrderName("  Ada's dress  ");
assert.equal("name" in renamedOk && renamedOk.name, "Ada's dress");
const emptyName = normalizeSavedStudioOrderName("");
assert.equal("error" in emptyName && emptyName.error, "empty");
const longName = normalizeSavedStudioOrderName("x".repeat(61));
assert.equal("error" in longName && longName.error, "too_long");

clearPendingSaveStudioOrder();
assert.equal(hasPendingSaveStudioOrder(), false);
markPendingSaveStudioOrder();
assert.equal(hasPendingSaveStudioOrder(), true);
clearPendingSaveStudioOrder();
assert.equal(hasPendingSaveStudioOrder(), false);

const active = makeDraft({ linkedSavedOrderId: "savedord00000001" });
assert.equal(
  hasConflictingActiveStudioDraft({
    activeDraft: active,
    continuingSavedOrderId: "savedord00000001",
  }),
  false,
);
assert.equal(
  hasConflictingActiveStudioDraft({
    activeDraft: makeDraft(),
    continuingSavedOrderId: "savedord00000001",
  }),
  true,
);
assert.equal(
  hasConflictingActiveStudioDraft({
    activeDraft: makeDraft({
      garmentTypeSelection: {
        garmentTypes: [],
        demographic: "female",
        constructionByGarment: {},
      },
    }),
    continuingSavedOrderId: "savedord00000001",
  }),
  false,
);

const soldOutWarnings = evaluateSavedStudioOrderChangeWarnings({
  item: {
    draft: makeDraft(),
    priceSnapshot: createSavedStudioOrderPriceSnapshot(makeDraft()),
  },
  liveFabrics: [
    {
      code: "FABRIC-A",
      name: "Gone",
      description: "",
      color: "gold",
      colorHex: "#c9a227",
      priceMultiplier: 1,
      stock: 0,
      stockStatus: "OUT_OF_STOCK",
    },
  ],
  liveBatches: [],
  recomputedTotal: 145,
});
assert.equal(
  soldOutWarnings.some((warning) => warning.code === "fabric_unavailable"),
  true,
);

const unlistedWarnings = evaluateSavedStudioOrderChangeWarnings({
  item: {
    draft: makeDraft(),
    priceSnapshot: createSavedStudioOrderPriceSnapshot(makeDraft()),
  },
  liveFabrics: [],
  liveBatches: [],
});
assert.equal(
  unlistedWarnings.some((warning) => warning.code === "fabric_unavailable"),
  true,
);

const closedBatchWarnings = evaluateSavedStudioOrderChangeWarnings({
  item: {
    draft: makeDraft({
      batchType: "community",
      batchId: "batch-closed",
    }),
    priceSnapshot: createSavedStudioOrderPriceSnapshot(makeDraft()),
  },
  liveFabrics: [
    {
      code: "FABRIC-A",
      name: "In stock",
      description: "",
      color: "gold",
      colorHex: "#c9a227",
      priceMultiplier: 1,
      stock: 10,
      stockStatus: "IN_STOCK",
    },
  ],
  liveBatches: [
    {
      id: "batch-closed",
      batchNumber: 1,
      name: "Closed",
      startDate: "2026-01-01",
      endDate: "2026-01-02",
      duration: "1 week",
      targetGarments: 10,
      currentGarments: 10,
      currentOrders: 10,
      currentCustomers: 10,
      status: "CLOSED",
      visibility: "PUBLIC",
      allowOrders: false,
    },
  ],
});
assert.equal(
  closedBatchWarnings.some((warning) => warning.code === "community_batch_ineligible"),
  true,
);

const priceWarnings = evaluateSavedStudioOrderChangeWarnings({
  item: {
    draft: makeDraft(),
    priceSnapshot: {
      schemaVersion: 1,
      total: 145,
      garmentConstructionSubtotal: 145,
      customDetailsPrice: 0,
      capturedAt: "2026-10-22T12:00:00.000Z",
    },
  },
  liveFabrics: [
    {
      code: "FABRIC-A",
      name: "In stock",
      description: "",
      color: "gold",
      colorHex: "#c9a227",
      priceMultiplier: 1,
      stock: 10,
      stockStatus: "IN_STOCK",
    },
  ],
  liveBatches: [],
  recomputedTotal: 160,
});
assert.equal(
  priceWarnings.some((warning) => warning.code === "price_changed"),
  true,
);

rememberSavedOrderCartLink("fp-1", "savedord00000009");
assert.equal(takeSavedOrderCartLink("fp-1"), "savedord00000009");
assert.equal(takeSavedOrderCartLink("fp-1"), null);

const repo = createSavedStudioOrderRepository(createMemorySavedStudioOrderAdapter());
const ownerUid = "owner-1";

const first = await repo.save({
  ownerUid,
  draft: makeDraft(),
  savedStage: "fabric",
  savedStep: 2,
  now: new Date("2026-10-22T12:00:00.000Z"),
});
assert.equal(first.status, "saved");
if (first.status !== "saved") throw new Error("expected saved");
assert.equal(first.item.revision, 1);
assert.match(first.item.name, /Standard Dress \+ Long Dress/);
assert.equal(first.item.draft.linkedSavedOrderId, first.item.savedOrderId);

const updated = await repo.save({
  ownerUid,
  draft: stampLinkedSavedOrderId(makeDraft({ currentStageId: "measurement" }), first.item.savedOrderId),
  savedStage: "measurement",
  savedOrderId: first.item.savedOrderId,
});
assert.equal(updated.status, "updated");
if (updated.status !== "updated") throw new Error("expected updated");
assert.equal(updated.item.savedOrderId, first.item.savedOrderId);
assert.equal(updated.item.revision, 2);
assert.equal(updated.item.savedStage, "measurement");
assert.equal((await repo.list(ownerUid)).items.length, 1);

const renamed = await repo.rename({
  ownerUid,
  savedOrderId: first.item.savedOrderId,
  name: "  Chioma's dress  ",
});
assert.equal(renamed.status, "renamed");
if (renamed.status !== "renamed") throw new Error("expected renamed");
assert.equal(renamed.item.name, "Chioma's dress");

for (let index = 0; index < SAVED_STUDIO_ORDER_MAX_PER_CUSTOMER - 1; index += 1) {
  const extra = await repo.save({
    ownerUid,
    draft: makeDraft({ updatedAt: new Date(Date.now() + index).toISOString() }),
    savedStage: "garment_type",
  });
  assert.equal(extra.status, "saved", `extra save ${index} should succeed`);
}
const sixth = await repo.save({
  ownerUid,
  draft: makeDraft(),
  savedStage: "garment_type",
});
assert.equal(sixth.status, "cap_reached");
if (sixth.status !== "cap_reached") throw new Error("expected cap");
assert.equal(sixth.message, SAVED_STUDIO_ORDER_CAP_MESSAGE);
assert.equal((await repo.list(ownerUid)).items.length, 5);

const listed = await repo.list(ownerUid);
const deleted = await repo.remove({
  ownerUid,
  savedOrderId: listed.items[0].savedOrderId,
});
assert.equal(deleted.status, "deleted");
assert.equal((await repo.list(ownerUid)).items.length, 4);

const startNewLeavesIntact = createSavedStudioOrderRepository(
  createMemorySavedStudioOrderAdapter(),
);
const kept = await startNewLeavesIntact.save({
  ownerUid: "owner-2",
  draft: makeDraft(),
  savedStage: "summary",
});
assert.equal(kept.status, "saved");
assert.equal((await startNewLeavesIntact.list("owner-2")).items.length, 1);

const withUpload = makeDraft({
  designSource: {
    kind: "uploaded",
    sourceKey: "uploaded:upload-ref-1",
    uploadReference: {
      ownerUid,
      designReferenceId: "upload-ref-1",
      storagePath: "customers/x/designs/upload-ref-1.jpg",
    },
  },
} as Partial<GuestDesignDraft>);
assert.equal(
  collectUploadedSourceRefsFromDraft(withUpload).includes("upload-ref-1"),
  true,
);
assert.equal(
  isUploadedSourceReferencedBySavedOrders("upload-ref-1", [
    { draft: withUpload },
  ]),
  true,
);
assert.equal(
  isUploadedSourceReferencedBySavedOrders("upload-ref-2", [
    { draft: withUpload },
  ]),
  false,
);

console.log("PASS: saved studio order model and service");
