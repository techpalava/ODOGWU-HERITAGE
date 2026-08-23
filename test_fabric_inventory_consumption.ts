import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import {
  confirmDepositCheckoutBatch,
  assertNonAnonymousAuth,
  FabricInventoryError,
  type CheckoutConfirmationRecord,
  type FabricInventoryLedger,
  type InventoryFabricSnapshot,
  type InventoryTransactionReaderWriter,
  type RunInventoryTransaction,
} from "./src/server/fabricInventoryConsumption";
import { createConfirmDepositOrderHandler } from "./src/server/confirmDepositOrderHttp";
import {
  isSimulatedDepositPaymentAllowed,
  verifyDepositPaymentProof,
} from "./src/server/depositPaymentVerification";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";
import type {
  FabricAllocation,
  FabricGarmentAssignment,
  MasterOrder,
  StyleCategory,
} from "./src/types";
import { countPhysicalFabricAllocationsByCode } from "./src/utils/fabricInventoryQuantities";
import { validateMasterOrderFabricAllocationsForDeposit } from "./src/server/orderFabricAllocationValidation";
import {
  deriveFabricStockStatus,
  isKnownFabricStockStatus,
} from "./src/utils/fabricStockStatus";
import { getFabricStockPresentation } from "./src/utils/fabricStockPresentation";
import {
  buildCanonicalCheckoutFingerprint,
  buildSimulationToken,
  type DepositPaymentConfirmationRecord,
  type DepositCheckoutQuote,
} from "./src/utils/depositOrderFingerprint";
import { existsSync } from "node:fs";

process.env.ALLOW_SIMULATED_DEPOSIT_PAYMENT = "true";
process.env.NODE_ENV = "test";

const shirtTrouserStyle: StyleCategory = {
  id: "test-shirt-trouser",
  name: "Shirt Trouser",
  description: "",
  gender: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};

const fiveGarmentStyle: StyleCategory = {
  id: "test-five",
  name: "Five Garments",
  description: "",
  gender: "unisex",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
    createStyleBaseGarmentSpec("dress"),
    createStyleBaseGarmentSpec("skirt"),
    createStyleBaseGarmentSpec("kaftan"),
  ],
};

const assignment = (
  garmentKey: string,
  garmentType: FabricGarmentAssignment["garmentType"],
  extras: Partial<FabricGarmentAssignment> = {},
): FabricGarmentAssignment => ({
  garmentKey,
  code: garmentKey,
  garmentType,
  fabricUnits: createStyleBaseGarmentSpec(garmentType).fabricUnits,
  ...extras,
});

const allocation = (
  fabricCode: string,
  allocationId: string,
  garmentAssignments: FabricGarmentAssignment[],
): FabricAllocation => ({
  allocationId,
  fabricCode,
  garmentAssignments,
});

const shirtTrouserShared = [
  allocation("ODG-010", "alloc-1", [
    assignment("shirt-1", "shirt"),
    assignment("trouser-1", "trouser"),
  ]),
];

const fiveSameFabric = [
  allocation("ODG-010", "a1", [assignment("g1", "shirt")]),
  allocation("ODG-010", "a2", [assignment("g2", "trouser")]),
  allocation("ODG-010", "a3", [assignment("g3", "dress")]),
  allocation("ODG-010", "a4", [assignment("g4", "skirt")]),
  allocation("ODG-010", "a5", [assignment("g5", "kaftan")]),
];

type MemFabric = InventoryFabricSnapshot;

class MemoryInventoryDb {
  fabrics = new Map<string, MemFabric>();
  ledgers = new Map<string, FabricInventoryLedger>();
  checkouts = new Map<string, CheckoutConfirmationRecord>();
  quotes = new Map<string, DepositCheckoutQuote>();
  paymentConfirmations = new Map<string, DepositPaymentConfirmationRecord>();
  orders = new Map<string, MasterOrder>();
  reservations = new Map<
    string,
    import("./src/server/fabricInventoryReservation").InventoryReservationRecord
  >();
  private queue: Promise<unknown> = Promise.resolve();

  seed(fabricCode: string, stock: unknown, stockStatus: string) {
    this.fabrics.set(fabricCode, {
      code: fabricCode,
      stock,
      reservedStock: 0,
      stockStatus,
    });
  }

  runInTransaction: RunInventoryTransaction = (work) => {
    const run = this.queue.then(async () => {
      const fabricDraft = new Map(
        [...this.fabrics.entries()].map(([key, value]) => [key, { ...value }]),
      );
      const ledgerDraft = new Map(this.ledgers);
      const checkoutDraft = new Map(this.checkouts);
      const quoteDraft = new Map(this.quotes);
      const paymentConfirmationDraft = new Map(this.paymentConfirmations);
      const orderDraft = new Map(this.orders);
      const reservationDraft = new Map(this.reservations);

      const store: InventoryTransactionReaderWriter = {
        getLedger: async (orderId) => ledgerDraft.get(orderId) ?? null,
        getCheckoutConfirmation: async (checkoutId) =>
          checkoutDraft.get(checkoutId) ?? null,
        getDepositQuote: async (checkoutId) => quoteDraft.get(checkoutId) ?? null,
        getPaymentConfirmation: async (paymentIntentId) =>
          paymentConfirmationDraft.get(paymentIntentId) ?? null,
        getFabric: async (fabricCode) => fabricDraft.get(fabricCode) ?? null,
        getOrder: async (orderId) => orderDraft.get(orderId) ?? null,
        getReservation: async (checkoutId) =>
          reservationDraft.get(checkoutId) ?? null,
        setLedger: (orderId, ledger) => {
          ledgerDraft.set(orderId, ledger);
        },
        setCheckoutConfirmation: (checkoutId, record) => {
          checkoutDraft.set(checkoutId, record);
        },
        setDepositQuote: (checkoutId, quote) => {
          quoteDraft.set(checkoutId, quote);
        },
        setPaymentConfirmation: (paymentIntentId, record) => {
          paymentConfirmationDraft.set(paymentIntentId, record);
        },
        setReservation: (checkoutId, reservation) => {
          reservationDraft.set(checkoutId, reservation);
        },
        updateFabric: (fabricCode, patch) => {
          const current = fabricDraft.get(fabricCode);
          if (!current) return;
          fabricDraft.set(fabricCode, {
            ...current,
            ...(typeof patch.stock === "number" ? { stock: patch.stock } : {}),
            ...(typeof patch.reservedStock === "number"
              ? { reservedStock: patch.reservedStock }
              : {}),
            stockStatus: patch.stockStatus,
          });
        },
        setOrder: (orderId, order) => {
          orderDraft.set(orderId, order);
        },
      };

      const result = await work(store);
      this.fabrics = fabricDraft;
      this.ledgers = ledgerDraft;
      this.checkouts = checkoutDraft;
      this.quotes = quoteDraft;
      this.paymentConfirmations = paymentConfirmationDraft;
      this.orders = orderDraft;
      this.reservations = reservationDraft;
      return result;
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

const baseOrder = (
  orderId: string,
  fabricAllocations: FabricAllocation[],
  options: {
    uid?: string;
    checkoutId?: string;
    style?: StyleCategory;
    deposit?: number;
    customerOwnerUid?: string;
    ownerUid?: string;
  } = {},
): MasterOrder => {
  const uid = options.uid ?? "customer-1";
  return {
    ownerUid: options.ownerUid ?? uid,
    customer: {
      ownerUid: options.customerOwnerUid ?? uid,
      name: "Test Customer",
      email: "customer@example.com",
      phone: "+31000000000",
    },
    style: options.style ?? shirtTrouserStyle,
    fabric: {
      code: fabricAllocations[0]?.fabricCode || "ODG-010",
      name: "Test Fabric",
      description: "",
      color: "Green",
      colorHex: "#0f0",
      priceMultiplier: 1,
      stockStatus: "IN_STOCK",
      stock: 30,
    },
    fabricAllocations,
    design: {} as MasterOrder["design"],
    garment: {} as MasterOrder["garment"],
    measurements: {} as MasterOrder["measurements"],
    payment: {
      subtotal: 200,
      deposit: options.deposit ?? 100,
      remaining: 100,
      method: "Stripe Credit Card",
      date: "2026-08-22T00:00:00.000Z",
      isPaid: false,
      paymentMethod: "Stripe",
      secondPaymentStatus: "unpaid",
    },
    shipment: {
      trackingId: orderId,
      status: "Pending",
      currentStage: 0,
      estimatedDeliveryDate: "TBD",
    },
    checkoutId: options.checkoutId ?? "CHECKOUT-1",
  } as MasterOrder;
};

const FIXED_NOW = () => new Date("2026-08-22T20:00:00.000Z");

const makeQuote = (
  orders: MasterOrder[],
  uid = "customer-1",
): DepositCheckoutQuote => {
  const checkoutId = getCheckoutId(orders);
  const depositCents = Math.round(
    orders.reduce((total, order) => total + (order.payment?.deposit || 0), 0) *
      100,
  );
  const totalCents = Math.round(
    orders.reduce((total, order) => total + (order.payment?.subtotal || 0), 0) *
      100,
  );
  const canonicalCheckoutFingerprint = buildCanonicalCheckoutFingerprint({
    checkoutId,
    ownerUid: uid,
    orders,
    totalCents,
    depositCents,
    currency: "eur",
  });
  const simulationToken = buildSimulationToken({
    checkoutId,
    ownerUid: uid,
    checkoutFingerprint: canonicalCheckoutFingerprint,
    depositCents,
  });
  return {
    checkoutId,
    ownerUid: uid,
    status: "PREPARED",
    currency: "eur",
    canonicalOrders: orders,
    orderIds: orders.map((order) => String(order.shipment?.trackingId)),
    canonicalCheckoutFingerprint,
    totalCents,
    depositCents,
    paymentProvider: "simulated",
    paymentIntentId: `sim_${checkoutId}`,
    simulationToken,
    clientSecret: null,
    createdAt: FIXED_NOW().toISOString(),
  };
};

const confirm = async (
  db: MemoryInventoryDb,
  orders: MasterOrder[],
  uid = "customer-1",
) => {
  const checkoutId = getCheckoutId(orders);
  const quote = db.quotes.get(checkoutId) ?? makeQuote(orders, uid);
  if (!db.quotes.has(checkoutId)) {
    db.quotes.set(quote.checkoutId, quote);
  }

  // Trusted inventory identity always comes from the persisted quote.
  const canonicalOrders = quote.canonicalOrders;

  const { prepareDepositOrderForConfirmation } = await import(
    "./src/server/fabricInventoryConsumption.js"
  );
  for (const order of canonicalOrders) {
    prepareDepositOrderForConfirmation(order, uid);
  }

  // Payment success converts an ACTIVE reservation — seed it as prepare would.
  if (!db.reservations.has(checkoutId)) {
    const quantities = new Map<string, number>();
    for (const order of canonicalOrders) {
      for (const [code, qty] of countPhysicalFabricAllocationsByCode(
        order.fabricAllocations || [],
      )) {
        quantities.set(code, (quantities.get(code) || 0) + qty);
      }
    }
    await db.runInTransaction(async (store) => {
      const { reserveInventoryForCheckout } = await import(
        "./src/server/fabricInventoryReservation.js"
      );
      await reserveInventoryForCheckout({
        store: {
          getFabric: (code) => store.getFabric(code),
          getReservation: (id) => store.getReservation(id),
          setReservation: (id, reservation) =>
            store.setReservation(id, reservation),
          updateFabric: (code, patch) => store.updateFabric(code, patch),
        },
        checkoutId,
        ownerUid: uid,
        checkoutFingerprint: quote.canonicalCheckoutFingerprint,
        quantities,
        now: FIXED_NOW(),
        paymentIntentId: quote.paymentIntentId,
      });
    });
  }

  return confirmDepositCheckoutBatch({
    quote,
    paymentProof: {
      provider: "simulated",
      checkoutId: quote.checkoutId,
      simulationToken: quote.simulationToken!,
    },
    authenticatedUid: uid,
    runInTransaction: db.runInTransaction,
    now: FIXED_NOW,
  });
};

const getCheckoutId = (orders: MasterOrder[]) =>
  String((orders[0] as { checkoutId?: string }).checkoutId || "CHECKOUT-1");

// Quantity derivation preserved
assert.equal(
  countPhysicalFabricAllocationsByCode(shirtTrouserShared).get("ODG-010"),
  1,
);
assert.equal(countPhysicalFabricAllocationsByCode(fiveSameFabric).get("ODG-010"), 5);

// 1. Vercel route bridge exists
assert.equal(existsSync("api/orders/confirm-deposit.ts"), true);

// Shared shirt+trouser consumes 1
{
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", 30, "IN_STOCK");
  const result = await confirm(db, [
    baseOrder("ORDER-ST", shirtTrouserShared),
  ]);
  assert.equal(result.status, "consumed");
  assert.equal(db.fabrics.get("ODG-010")?.stock, 29);
}

// Five allocations consume 5
{
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", 30, "IN_STOCK");
  await confirm(db, [
    baseOrder("ORDER-FIVE", fiveSameFabric, { style: fiveGarmentStyle }),
  ]);
  assert.equal(db.fabrics.get("ODG-010")?.stock, 25);
}

// Mixed fabrics + multi-order aggregate
{
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", 30, "IN_STOCK");
  db.seed("ODG-007", 10, "IN_STOCK");
  const orderA = baseOrder(
    "ORDER-A",
    [
      allocation("ODG-010", "a1", [assignment("s1", "shirt")]),
      allocation("ODG-010", "a2", [assignment("t1", "trouser")]),
    ],
    { checkoutId: "BATCH-1", deposit: 50 },
  );
  const orderB = baseOrder(
    "ORDER-B",
    [allocation("ODG-007", "b1", [
      assignment("s2", "shirt"),
      assignment("t2", "trouser"),
    ])],
    { checkoutId: "BATCH-1", deposit: 50 },
  );
  await confirm(db, [orderA, orderB]);
  assert.equal(db.fabrics.get("ODG-010")?.stock, 28);
  assert.equal(db.fabrics.get("ODG-007")?.stock, 9);
}

// 6 -> 5 LOW_STOCK, 1 -> 0 OUT_OF_STOCK
{
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", 6, "IN_STOCK");
  await confirm(db, [baseOrder("ORDER-LOW", shirtTrouserShared)]);
  assert.equal(db.fabrics.get("ODG-010")?.stock, 5);
  assert.equal(db.fabrics.get("ODG-010")?.stockStatus, "LOW_STOCK");
}
{
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", 1, "LOW_STOCK");
  await confirm(db, [baseOrder("ORDER-OUT", shirtTrouserShared)]);
  assert.equal(db.fabrics.get("ODG-010")?.stock, 0);
  assert.equal(db.fabrics.get("ODG-010")?.stockStatus, "OUT_OF_STOCK");
}

// Atomic multi-order failure: none commit
{
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", 1, "IN_STOCK");
  db.seed("ODG-007", 0, "IN_STOCK");
  await assert.rejects(
    () =>
      confirm(db, [
        baseOrder("FAIL-A", shirtTrouserShared, {
          checkoutId: "FAIL-BATCH",
          deposit: 40,
        }),
        baseOrder(
          "FAIL-B",
          [
            allocation("ODG-007", "x", [
              assignment("s", "shirt"),
              assignment("t", "trouser"),
            ]),
          ],
          { checkoutId: "FAIL-BATCH", deposit: 40 },
        ),
      ]),
    (error: unknown) => {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : "";
      return (
        code === "INSUFFICIENT_STOCK" ||
        code === "FABRIC_UNAVAILABLE" ||
        code === "CHECKOUT_STATE_CONFLICT"
      );
    },
  );
  assert.equal(db.fabrics.get("ODG-010")?.stock, 1);
  assert.equal(db.orders.size, 0);
  assert.equal(db.ledgers.size, 0);
}

// Empty allocation spoof
assert.throws(
  () =>
    validateMasterOrderFabricAllocationsForDeposit(
      baseOrder("EMPTY", []),
      shirtTrouserStyle,
    ),
  /Empty Fabric allocations|required/i,
);

// Omitted garment
assert.throws(
  () =>
    validateMasterOrderFabricAllocationsForDeposit(
      baseOrder("OMIT", [
        allocation("ODG-010", "only-shirt", [assignment("s1", "shirt")]),
      ]),
      shirtTrouserStyle,
    ),
  /do not cover the required physical garments|trusted style catalogue/i,
);

// Duplicate allocation ID
assert.throws(
  () =>
    validateMasterOrderFabricAllocationsForDeposit(
      baseOrder("DUP-ID", [
        allocation("ODG-010", "same", [assignment("s1", "shirt")]),
        allocation("ODG-010", "same", [assignment("t1", "trouser")]),
      ]),
      shirtTrouserStyle,
    ),
  /Duplicate Fabric allocationId/i,
);

// Duplicate garment key
assert.throws(
  () =>
    validateMasterOrderFabricAllocationsForDeposit(
      baseOrder("DUP-KEY", [
        allocation("ODG-010", "a", [assignment("same-key", "shirt")]),
        allocation("ODG-010", "b", [assignment("same-key", "trouser")]),
      ]),
      shirtTrouserStyle,
    ),
  /Duplicate garment key/i,
);

// Capacity-invalid allocation (gown + shirt)
assert.throws(
  () =>
    validateMasterOrderFabricAllocationsForDeposit(
      baseOrder(
        "CAP",
        [
          allocation("ODG-010", "a", [
            assignment("gown", "full_length_gown"),
            assignment("shirt", "shirt"),
          ]),
        ],
        {
          style: {
            ...shirtTrouserStyle,
            fabricCapacityComposition: [
              createStyleBaseGarmentSpec("full_length_gown"),
              createStyleBaseGarmentSpec("shirt"),
            ],
          },
        },
      ),
      {
        ...shirtTrouserStyle,
        fabricCapacityComposition: [
          createStyleBaseGarmentSpec("full_length_gown"),
          createStyleBaseGarmentSpec("shirt"),
        ],
      },
    ),
  /capacity rules/i,
);

// Additional orphan
assert.throws(
  () =>
    validateMasterOrderFabricAllocationsForDeposit(
      baseOrder("ORPHAN", [
        ...shirtTrouserShared,
        allocation("ODG-010", "add", [
          assignment("extra", "shirt", {
            sourceRole: "additional",
            mainGarmentType: "shirt",
            eligibilityRule: "same_type",
            dependencyStatus: "orphaned",
            mainGarmentKey: "missing",
          }),
        ]),
      ]),
      shirtTrouserStyle,
    ),
  /orphaned|not attached/i,
);

// Too few physical allocations for five garments (3 rows)
assert.throws(
  () =>
    validateMasterOrderFabricAllocationsForDeposit(
      baseOrder(
        "TOO-FEW",
        [
          allocation("ODG-010", "a1", [assignment("g1", "shirt")]),
          allocation("ODG-010", "a2", [assignment("g2", "trouser")]),
          allocation("ODG-010", "a3", [assignment("g3", "dress")]),
        ],
        { style: fiveGarmentStyle },
      ),
      fiveGarmentStyle,
    ),
  /do not cover the required physical garments/i,
);

// Fake requiredQuantities rejected by HTTP
{
  const handler = createConfirmDepositOrderHandler({
    getServices: () => ({
      auth: { verifyIdToken: async () => ({ uid: "customer-1", firebase: { sign_in_provider: "password" } }) },
      db: {} as never,
    }),
  });
  let statusCode = 0;
  let body: Record<string, unknown> | null = null;
  const res: HttpResponse = {
    status(code) {
      statusCode = code;
      return res;
    },
    setHeader() {
      return res;
    },
    json(payload) {
      body = payload as Record<string, unknown>;
      return payload;
    },
  };
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: {
        orders: [baseOrder("FAKE-Q", shirtTrouserShared)],
        paymentProof: { provider: "simulated", checkoutId: "CHECKOUT-1" },
        requiredQuantities: { "ODG-010": 99 },
      },
    } satisfies HttpRequest,
    res,
  );
  assert.equal(statusCode, 400);
  assert.equal(body?.code, "INVALID_ORDER");
}

// Altered payload / different owner conflicts
{
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", 30, "IN_STOCK");
  await confirm(db, [baseOrder("IDEMP", shirtTrouserShared)]);
  const altered = baseOrder("IDEMP", [
    allocation("ODG-010", "alloc-1", [
      assignment("shirt-1", "shirt"),
      assignment("trouser-1", "trouser"),
    ]),
    allocation("ODG-010", "extra-spoof", [
      assignment("extra-shirt", "shirt", { sourceRole: "additional", mainGarmentKey: "shirt-1" }),
    ]),
  ]);
  // Confirmation replays the persisted quote, not altered client order input.
  const replay = await confirm(db, [altered]);
  assert.equal(replay.status, "already_consumed");
}
{
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", 30, "IN_STOCK");
  await confirm(db, [baseOrder("OWNER-X", shirtTrouserShared, { uid: "customer-1" })]);
  await assert.rejects(
    () =>
      confirm(
        db,
        [baseOrder("OWNER-X", shirtTrouserShared, { uid: "customer-2" })],
        "customer-2",
      ),
    (error: unknown) =>
      error instanceof FabricInventoryError &&
      (error.code === "ORDER_IDEMPOTENCY_CONFLICT" ||
        error.code === "ORDER_OWNERSHIP_MISMATCH" ||
        error.code === "CHECKOUT_STATE_CONFLICT"),
  );
}

// Anonymous auth
assert.throws(
  () =>
    assertNonAnonymousAuth({
      uid: "anon",
      firebase: { sign_in_provider: "anonymous" },
    }),
  (error: unknown) =>
    error instanceof FabricInventoryError &&
    error.code === "AUTH_ANONYMOUS_NOT_ALLOWED",
);

// owner mismatches
await assert.rejects(
  () =>
    confirm(new MemoryInventoryDb(), [
      baseOrder("OWN1", shirtTrouserShared, {
        ownerUid: "customer-1",
        customerOwnerUid: "other",
      }),
    ]),
  (error: unknown) =>
    error instanceof FabricInventoryError &&
    error.code === "ORDER_OWNERSHIP_MISMATCH",
);

// Unknown stockStatus
{
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", 30, "WEIRD_STATUS");
  await assert.rejects(
    () => confirm(db, [baseOrder("BAD-STATUS", shirtTrouserShared)]),
    (error: unknown) => {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : "";
      return code === "INVALID_FABRIC_INVENTORY";
    },
  );
  assert.equal(isKnownFabricStockStatus("WEIRD_STATUS"), false);
}

// Payment not confirmed / amount mismatch
{
  await assert.rejects(
    () =>
      verifyDepositPaymentProof({
        paymentProof: { provider: "stripe", paymentIntentId: "pi_x" },
        authenticatedUid: "customer-1",
        checkoutId: "CHECKOUT-1",
        checkoutFingerprint: "fingerprint-1",
        expectedDepositCents: 10000,
        expectedPaymentIntentId: "pi_x",
        stripe: {
          paymentIntents: {
            retrieve: async () => ({
              id: "pi_x",
              status: "requires_payment_method",
              amount: 10000,
              currency: "eur",
              metadata: {},
            }),
          },
        },
      }),
    /has not succeeded/i,
  );
  await assert.rejects(
    () =>
      verifyDepositPaymentProof({
        paymentProof: { provider: "stripe", paymentIntentId: "pi_x" },
        authenticatedUid: "customer-1",
        checkoutId: "CHECKOUT-1",
        checkoutFingerprint: "fingerprint-1",
        expectedDepositCents: 10000,
        expectedPaymentIntentId: "pi_x",
        stripe: {
          paymentIntents: {
            retrieve: async () => ({
              id: "pi_x",
              status: "succeeded",
              amount: 5000,
              currency: "eur",
              metadata: { ownerUid: "customer-1", checkoutId: "CHECKOUT-1" },
            }),
          },
        },
      }),
    /amount does not match/i,
  );
  await assert.rejects(
    () =>
      verifyDepositPaymentProof({
        paymentProof: { provider: "stripe", paymentIntentId: "pi_x" },
        authenticatedUid: "customer-1",
        checkoutId: "CHECKOUT-1",
        checkoutFingerprint: "fingerprint-1",
        expectedDepositCents: 10000,
        expectedPaymentIntentId: "pi_x",
        stripe: {
          paymentIntents: {
            retrieve: async () => ({
              id: "pi_x",
              status: "succeeded",
              amount: 10000,
              currency: "eur",
              metadata: {
                ownerUid: "other",
                checkoutId: "CHECKOUT-1",
                checkoutFingerprint: "fingerprint-1",
              },
            }),
          },
        },
      }),
    /owner does not match/i,
  );
}

assert.equal(isSimulatedDepositPaymentAllowed(), true);

// Production must reject simulation even when ALLOW_SIMULATED_DEPOSIT_PAYMENT=true.
{
  assert.equal(
    isSimulatedDepositPaymentAllowed({
      VERCEL_ENV: "production",
      NODE_ENV: "production",
      ALLOW_SIMULATED_DEPOSIT_PAYMENT: "true",
    }),
    false,
  );
  assert.equal(
    isSimulatedDepositPaymentAllowed({
      NODE_ENV: "production",
      ALLOW_SIMULATED_DEPOSIT_PAYMENT: "true",
    }),
    false,
  );
  assert.equal(
    isSimulatedDepositPaymentAllowed({
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
      ALLOW_SIMULATED_DEPOSIT_PAYMENT: "true",
    }),
    true,
  );
  await assert.rejects(
    () =>
      verifyDepositPaymentProof({
        paymentProof: {
          provider: "simulated",
          checkoutId: "CHK-PROD",
          simulationToken: "token",
        },
        authenticatedUid: "customer-1",
        checkoutId: "CHK-PROD",
        checkoutFingerprint: "fp",
        expectedDepositCents: 5000,
        expectedPaymentIntentId: "sim_CHK-PROD",
        simulationToken: "token",
        env: {
          VERCEL_ENV: "production",
          ALLOW_SIMULATED_DEPOSIT_PAYMENT: "true",
        },
      }),
    (error: unknown) =>
      error instanceof Error &&
      /not allowed|production/i.test(error.message),
  );
}

// Exact idempotent replay
{
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", 30, "IN_STOCK");
  const orders = [baseOrder("REPLAY", shirtTrouserShared)];
  const first = await confirm(db, orders);
  const second = await confirm(db, orders);
  assert.equal(first.status, "consumed");
  assert.equal(second.status, "already_consumed");
  assert.equal(second.idempotent, true);
  assert.equal(db.fabrics.get("ODG-010")?.stock, 29);
}

// Two orders sharing fabric aggregate
{
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", 10, "IN_STOCK");
  await confirm(db, [
    baseOrder("SHARE-A", shirtTrouserShared, {
      checkoutId: "SHARE",
      deposit: 25,
    }),
    baseOrder("SHARE-B", shirtTrouserShared, {
      checkoutId: "SHARE",
      deposit: 25,
    }),
  ]);
  assert.equal(db.fabrics.get("ODG-010")?.stock, 8);
}

// Presentation still updates from derived status
{
  const after = getFabricStockPresentation({
    stockStatus: deriveFabricStockStatus(5, "IN_STOCK"),
    stock: 5,
  });
  assert.equal(after.visible && after.label, "Low Stock: 5");
}

// HIDDEN / OUT_OF_STOCK / invalid numeric stock
for (const [status, code] of [
  ["HIDDEN", "FABRIC_UNAVAILABLE"],
  ["OUT_OF_STOCK", "FABRIC_UNAVAILABLE"],
] as const) {
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", 30, status);
  await assert.rejects(
    () => confirm(db, [baseOrder(`BLK-${status}`, shirtTrouserShared)]),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code: string }).code === code,
      ),
  );
}
{
  const db = new MemoryInventoryDb();
  db.seed("ODG-010", undefined, "IN_STOCK");
  await assert.rejects(
    () => confirm(db, [baseOrder("MISS-STOCK", shirtTrouserShared)]),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code: string }).code === "INVALID_FABRIC_INVENTORY",
      ),
  );
}

console.log("PASS: fabric inventory consumption phase 1 hardened");
