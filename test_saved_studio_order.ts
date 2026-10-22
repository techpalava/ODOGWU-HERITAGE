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
  peekSavedOrderCartLink,
  rememberSavedOrderPaymentLink,
  takeSavedOrderPaymentLink,
  evaluateSavedStudioOrderPriceChange,
} from "./src/utils/savedStudioOrderModel";
import {
  SavedStudioOrderAbsentError,
  SavedStudioOrderCapError,
  createMemorySavedStudioOrderAdapter,
  createSavedStudioOrderRepository,
  planSavedStudioOrderMutation,
  type SavedStudioOrderPersistenceAdapter,
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
  // Loaded catalogue without this code = genuinely unlisted.
  fabricCatalogueLoaded: true,
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

// --- B4: price change compares the saved snapshot with a live recomputed total.
assert.equal(evaluateSavedStudioOrderPriceChange({ savedTotal: 145, liveTotal: 145 }), null);
assert.equal(evaluateSavedStudioOrderPriceChange({ savedTotal: 145, liveTotal: 145.001 }), null);
assert.equal(
  evaluateSavedStudioOrderPriceChange({ savedTotal: 145, liveTotal: 150 })?.code,
  "price_changed",
);
assert.equal(evaluateSavedStudioOrderPriceChange({ savedTotal: null, liveTotal: 150 }), null);
assert.equal(evaluateSavedStudioOrderPriceChange({ savedTotal: 145, liveTotal: null }), null);
// Without a live total there is no price warning, even if the draft total differs.
assert.equal(
  evaluateSavedStudioOrderChangeWarnings({
    item: {
      draft: makeDraft(),
      priceSnapshot: {
        schemaVersion: 1,
        total: 1,
        garmentConstructionSubtotal: 1,
        customDetailsPrice: 0,
        capturedAt: "2026-10-22T12:00:00.000Z",
      },
    },
    liveFabrics: [],
    liveBatches: [],
  }).length,
  0,
  "no fabric or price warnings before the catalogue loads",
);

// --- B5: payment links map a prepared order id to exactly one saved order.
rememberSavedOrderCartLink("fp-pay", "savedordPAY0001");
assert.equal(peekSavedOrderCartLink("fp-pay"), "savedordPAY0001");
assert.equal(peekSavedOrderCartLink("fp-pay"), "savedordPAY0001", "peek does not consume");
rememberSavedOrderPaymentLink("future-order-1", peekSavedOrderCartLink("fp-pay"));
rememberSavedOrderPaymentLink("future-order-2", null);
assert.equal(takeSavedOrderPaymentLink("future-order-2"), null);
assert.equal(takeSavedOrderPaymentLink("future-order-1"), "savedordPAY0001");
assert.equal(takeSavedOrderPaymentLink("future-order-1"), null);
assert.equal(takeSavedOrderPaymentLink(undefined), null);

// --- B3: planning always works from the in-transaction read.
assert.deepEqual(
  planSavedStudioOrderMutation({
    currentIds: ["savedordA0000001"],
    storedRevision: null,
    mutation: {
      type: "upsert",
      item: { ...first.item, savedOrderId: "savedordB0000001", revision: 1 },
    },
  }),
  { itemIds: ["savedordB0000001", "savedordA0000001"], revision: 1, created: true },
);
assert.deepEqual(
  planSavedStudioOrderMutation({
    currentIds: ["savedordA0000001"],
    storedRevision: 7,
    mutation: {
      type: "upsert",
      item: { ...first.item, savedOrderId: "savedordA0000001", revision: 2 },
    },
  }),
  { itemIds: ["savedordA0000001"], revision: 8, created: false },
  "revision comes from the stored item, not the stale client copy",
);
assert.throws(
  () =>
    planSavedStudioOrderMutation({
      currentIds: ["savedord0000001", "savedord0000002", "savedord0000003", "savedord0000004", "savedord0000005"],
      storedRevision: null,
      mutation: { type: "upsert", item: { ...first.item, savedOrderId: "savedord0000006" } },
    }),
  SavedStudioOrderCapError,
);
assert.throws(
  () =>
    planSavedStudioOrderMutation({
      currentIds: [],
      storedRevision: null,
      mutation: { type: "upsert", item: first.item, requireExisting: true },
    }),
  SavedStudioOrderAbsentError,
);

// Concurrent saves from two devices that both loaded the same 4-item list:
// both new orders must survive (no lost ids), and a third is capped.
{
  const base = createMemorySavedStudioOrderAdapter();
  const racing: SavedStudioOrderPersistenceAdapter = {
    ...base,
    // Both writers see the same stale bundle; the write itself re-reads.
    loadBundle: (() => {
      let frozen: ReturnType<typeof base.loadBundle> | null = null;
      return (uid: string) => {
        if (!frozen) frozen = base.loadBundle(uid);
        return frozen;
      };
    })(),
  };
  const seedRepo = createSavedStudioOrderRepository(base);
  for (let index = 0; index < 3; index += 1) {
    const seeded = await seedRepo.save({ ownerUid: "race", draft: makeDraft(), savedStage: "fabric" });
    assert.equal(seeded.status, "saved");
  }
  const raceRepo = createSavedStudioOrderRepository(racing);
  const [a, b] = await Promise.all([
    raceRepo.save({ ownerUid: "race", draft: makeDraft(), savedStage: "fabric" }),
    raceRepo.save({ ownerUid: "race", draft: makeDraft(), savedStage: "summary" }),
  ]);
  assert.equal(a.status, "saved");
  assert.equal(b.status, "saved");
  const afterRace = await seedRepo.list("race");
  assert.equal(afterRace.index.itemIds.length, 5, "neither concurrent save dropped the other");
  assert.equal(afterRace.items.length, 5);
  // Stale client still believes 4 exist; the transaction-side cap must win.
  const capped = await raceRepo.save({ ownerUid: "race", draft: makeDraft(), savedStage: "fabric" });
  assert.equal(capped.status, "cap_reached");
  assert.equal((await seedRepo.list("race")).items.length, 5);

  // Rename racing a delete: rename must not resurrect the deleted order.
  const victim = afterRace.items[0];
  const staleRename = createSavedStudioOrderRepository({
    ...base,
    loadBundle: (() => {
      const snapshot = base.loadBundle("race");
      return () => snapshot;
    })(),
  });
  const snapshotTaken = staleRename.list("race");
  await snapshotTaken;
  assert.equal((await seedRepo.remove({ ownerUid: "race", savedOrderId: victim.savedOrderId })).status, "deleted");
  const renameAfterDelete = await staleRename.rename({
    ownerUid: "race",
    savedOrderId: victim.savedOrderId,
    name: "Ghost",
  });
  assert.equal(renameAfterDelete.status, "absent");
  const afterDelete = await seedRepo.list("race");
  assert.equal(afterDelete.items.length, 4);
  assert.equal(afterDelete.index.itemIds.includes(victim.savedOrderId), false);
}

// Re-save after a rename takes the stored revision (no stale revision write).
{
  const repoRev = createSavedStudioOrderRepository(createMemorySavedStudioOrderAdapter());
  const saved = await repoRev.save({ ownerUid: "rev", draft: makeDraft(), savedStage: "fabric" });
  if (saved.status !== "saved") throw new Error("expected saved");
  const renamedRev = await repoRev.rename({ ownerUid: "rev", savedOrderId: saved.item.savedOrderId, name: "Mine" });
  if (renamedRev.status !== "renamed") throw new Error("expected renamed");
  assert.equal(renamedRev.item.revision, 2);
  const resaved = await repoRev.save({
    ownerUid: "rev",
    draft: stampLinkedSavedOrderId(makeDraft(), saved.item.savedOrderId),
    savedStage: "summary",
  });
  if (resaved.status !== "updated") throw new Error("expected updated");
  assert.equal(resaved.item.revision, 3);
  assert.equal(resaved.item.name, "Mine");
  assert.equal((await repoRev.list("rev")).items.length, 1);
}

console.log("PASS: saved studio order model and service");
