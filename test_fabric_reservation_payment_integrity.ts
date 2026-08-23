/**
 * Executable regressions for Fabric reservation / PaymentIntent state integrity.
 * Exercises real domain + handler paths with in-memory transactional stores.
 */
import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import {
  assertPayablePreparedCheckout,
  assertSymmetricPaymentIntentBinding,
  bindPaymentIntentToCheckout,
  makePaymentIntentNonPayableBeforeReservationRelease,
  PayableCheckoutValidationError,
} from "./src/server/depositCheckoutLifecycle";
import {
  prepareDepositCheckout,
  PrepareDepositError,
  type DepositCatalogSnapshot,
} from "./src/server/prepareDepositCheckout";
import {
  releaseInventoryReservation,
  reserveInventoryForCheckout,
  type InventoryReservationRecord,
  type ReservationTransactionStore,
} from "./src/server/fabricInventoryReservation";
import { createStripeWebhookHandler } from "./src/server/stripeWebhookHttp";
import { createReleaseDepositReservationHandler } from "./src/server/releaseDepositReservationHttp";
import type { DepositCheckoutQuote } from "./src/utils/depositOrderFingerprint";
import type { CartItem, Fabric, StyleCategory } from "./src/types";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";

process.env.ALLOW_SIMULATED_DEPOSIT_PAYMENT = "false";
process.env.NODE_ENV = "test";
delete process.env.VERCEL_ENV;

const NOW = new Date("2026-08-23T15:00:00.000Z");

const style: StyleCategory = {
  id: "style-shirt-trouser",
  name: "Shirt Trouser",
  description: "",
  gender: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};

const fabric: Fabric = {
  code: "ODG-010",
  name: "Test Fabric",
  description: "",
  color: "Green",
  colorHex: "#0f0",
  priceMultiplier: 1,
  price: 40,
  stockStatus: "IN_STOCK",
  stock: 30,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const catalogs: DepositCatalogSnapshot = {
  fabrics: [fabric],
  styles: [style],
  batches: [],
  customDetailCatalog: [],
  businessSettings: {
    pricingSettings: { depositPercentage: 50 },
  } as DepositCatalogSnapshot["businessSettings"],
};

const baseCartItem = (): CartItem =>
  ({
    id: "item-1",
    ownerUid: "customer-1",
    customer: {
      ownerUid: "customer-1",
      name: "Ada",
      email: "ada@example.test",
      phone: "+31000000000",
    },
    style,
    fabric,
    fabricAllocations: [
      {
        allocationId: "alloc-1",
        fabricCode: "ODG-010",
        garmentAssignments: [
          {
            garmentKey: "shirt-1",
            code: "shirt-1",
            garmentType: "shirt",
            fabricUnits: 1,
          },
          {
            garmentKey: "trouser-1",
            code: "trouser-1",
            garmentType: "trouser",
            fabricUnits: 1,
          },
        ],
      },
    ],
    cartDesignSource: {
      kind: "catalog",
      sourceKey: `catalog:${style.id}`,
      styleId: style.id,
    },
    design: {},
    garment: { code: "G1", type: "shirt", totalPrice: 100, basePrice: 80 },
    measurements: {},
    deliverySelection: {
      method: "PICKUP",
      pickupLocation: "Eindhoven Atelier",
      pickupWindow: "Weekdays",
      actualParcelWeightKg: 0.1,
    },
    specialInstructions: "Handle with care",
    notesAboutLeftoverFabric: "Return leftover",
  }) as unknown as CartItem;

class MemTxn {
  quotes = new Map<string, DepositCheckoutQuote>();
  lookups = new Map<string, unknown>();
  reservations = new Map<string, InventoryReservationRecord>();
  fabrics = new Map<
    string,
    { code: string; stock: number; reservedStock: number; stockStatus: string }
  >([
    [
      "ODG-010",
      { code: "ODG-010", stock: 30, reservedStock: 0, stockStatus: "IN_STOCK" },
    ],
  ]);
  paymentIntentCreates = 0;
  abortFails = false;
  createFails = false;

  asStore(): ReservationTransactionStore & {
    savePrepareLookup: (r: { prepareKey: string }) => void;
    saveQuote: (q: DepositCheckoutQuote) => void;
    loadReservation: (
      id: string,
    ) => Promise<InventoryReservationRecord | null>;
    getQuote: (id: string) => Promise<DepositCheckoutQuote | null>;
    setQuote: (id: string, quote: DepositCheckoutQuote) => void;
  } {
    return {
      getFabric: async (code) => this.fabrics.get(code) ?? null,
      getReservation: async (id) => this.reservations.get(id) ?? null,
      setReservation: (id, reservation) => {
        this.reservations.set(id, reservation);
      },
      updateFabric: (code, patch) => {
        const current = this.fabrics.get(code);
        if (!current) return;
        this.fabrics.set(code, {
          ...current,
          ...(typeof patch.stock === "number" ? { stock: patch.stock } : {}),
          reservedStock: patch.reservedStock,
          stockStatus: patch.stockStatus,
        });
      },
      savePrepareLookup: (record) => {
        this.lookups.set(record.prepareKey, record);
      },
      saveQuote: (quote) => {
        this.quotes.set(quote.checkoutId, quote);
      },
      loadReservation: async (id) => this.reservations.get(id) ?? null,
      getQuote: async (id) => this.quotes.get(id) ?? null,
      setQuote: (id, quote) => {
        this.quotes.set(id, quote);
      },
    };
  }

  async prepare(prepareRequestId: string) {
    return prepareDepositCheckout({
      authenticatedUid: "customer-1",
      token: {
        uid: "customer-1",
        firebase: { sign_in_provider: "password" },
      },
      cartItems: [baseCartItem()],
      prepareRequestId,
      loadCatalogs: async () => catalogs,
      loadPrepareLookup: async (key) =>
        (this.lookups.get(key) as any) ?? null,
      loadQuote: async (id) => this.quotes.get(id) ?? null,
      loadReservation: async (id) => this.reservations.get(id) ?? null,
      savePrepareLookup: async (record) => {
        this.lookups.set(record.prepareKey, record);
      },
      saveQuote: async (quote) => {
        this.quotes.set(quote.checkoutId, quote);
      },
      runPrepareReservationTransaction: async (work) => work(this.asStore()),
      abortPreparedCheckoutAfterPaymentIntentFailure: this.abortFails
        ? async () => {
            throw new Error("simulated abort transaction failure");
          }
        : undefined,
      validateAndPriceCart: ({ items }) => ({
        items,
        canProceed: true,
        blockers: [],
        pricing: { total: 200, depositDueNow: 100 },
      }),
      allocatePayments: ({ items }) =>
        items.map((item) => ({
          itemId: item.id,
          garmentSubtotal: 180,
          garmentDeposit: 90,
          remainingGarmentBalance: 90,
          lagosToEindhovenShipping: 10,
          eindhovenToDestinationShipping: 10,
          totalShipping: 20,
          orderSubtotal: 200,
          dueNow: 100,
        })),
      createStripePaymentIntent: async () => {
        if (this.createFails) {
          throw new Error("simulated stripe create failure");
        }
        this.paymentIntentCreates += 1;
        return {
          id: `pi_${this.paymentIntentCreates}`,
          clientSecret: `secret_${this.paymentIntentCreates}`,
        };
      },
    });
  }
}

const mockRes = () => {
  const state: {
    statusCode: number;
    body: any;
    headers: Record<string, string>;
  } = { statusCode: 200, body: null, headers: {} };
  const res = {
    setHeader(name: string, value: string) {
      state.headers[name] = value;
      return res;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
  } as unknown as HttpResponse;
  return { res, state };
};

const baseQuote = (
  overrides: Partial<DepositCheckoutQuote> = {},
): DepositCheckoutQuote => ({
  checkoutId: "CHK-1",
  ownerUid: "u1",
  status: "PREPARED",
  currency: "eur",
  canonicalOrders: [],
  orderIds: [],
  canonicalCheckoutFingerprint: "fp-1",
  totalCents: 20000,
  depositCents: 10000,
  paymentProvider: "stripe",
  paymentIntentId: "",
  clientSecret: null,
  createdAt: NOW.toISOString(),
  expiresAt: NOW.toISOString(),
  ...overrides,
});

const baseReservation = (
  overrides: Partial<InventoryReservationRecord> = {},
): InventoryReservationRecord => ({
  checkoutId: "CHK-1",
  ownerUid: "u1",
  checkoutFingerprint: "fp-1",
  status: "ACTIVE",
  lines: [{ fabricCode: "ODG-010", quantity: 2 }],
  createdAt: NOW.toISOString(),
  expiresAt: NOW.toISOString(),
  ...overrides,
});

// ---------- A: PREPARED + RELEASED + no quote PI => STALE, no Stripe create ----------
{
  const mem = new MemTxn();
  const prepared = await mem.prepare("PREP-TEST-A-01");
  const checkoutId = prepared.quote.checkoutId;
  await releaseInventoryReservation({
    store: mem.asStore(),
    checkoutId,
    ownerUid: "customer-1",
    reason: "crash_window_release",
    now: NOW,
    requireOwnerMatch: true,
  });
  // Simulate failed CANCELLED write: quote remains PREPARED with no PI
  mem.quotes.set(checkoutId, {
    ...prepared.quote,
    status: "PREPARED",
    paymentIntentId: "",
    clientSecret: null,
  });
  mem.paymentIntentCreates = 0;
  await assert.rejects(
    () => mem.prepare("PREP-TEST-A-01"),
    (error: unknown) =>
      error instanceof PrepareDepositError && error.code === "STALE_CHECKOUT",
  );
  assert.equal(mem.paymentIntentCreates, 0);
}

// ---------- B: PREPARED + EXPIRED + no PI => no Stripe creation ----------
{
  const mem = new MemTxn();
  const prepared = await mem.prepare("PREP-TEST-B-01");
  const checkoutId = prepared.quote.checkoutId;
  const reservation = mem.reservations.get(checkoutId)!;
  mem.reservations.set(checkoutId, { ...reservation, status: "EXPIRED" });
  mem.quotes.set(checkoutId, {
    ...prepared.quote,
    paymentIntentId: "",
    clientSecret: null,
  });
  // Drop PI from reservation to match pre-PI asymmetric-safe crash after release path
  mem.reservations.set(checkoutId, {
    ...mem.reservations.get(checkoutId)!,
    paymentIntentId: undefined,
  });
  mem.paymentIntentCreates = 0;
  await assert.rejects(
    () => mem.prepare("PREP-TEST-B-01"),
    (error: unknown) =>
      error instanceof PrepareDepositError && error.code === "STALE_CHECKOUT",
  );
  assert.equal(mem.paymentIntentCreates, 0);
}

// ---------- C: quote has PI, reservation missing PI => conflict ----------
{
  assert.throws(
    () =>
      assertSymmetricPaymentIntentBinding({
        quote: baseQuote({ paymentIntentId: "pi_q" }),
        reservation: baseReservation({ paymentIntentId: undefined }),
      }),
    (error: unknown) =>
      error instanceof PayableCheckoutValidationError &&
      error.code === "CHECKOUT_STATE_CONFLICT",
  );
  const mem = new MemTxn();
  const prepared = await mem.prepare("PREP-TEST-C-01");
  const checkoutId = prepared.quote.checkoutId;
  mem.quotes.set(checkoutId, {
    ...prepared.quote,
    paymentIntentId: "pi_only_quote",
    clientSecret: "sec",
  });
  mem.reservations.set(checkoutId, {
    ...mem.reservations.get(checkoutId)!,
    paymentIntentId: undefined,
  });
  mem.paymentIntentCreates = 0;
  await assert.rejects(
    () => mem.prepare("PREP-TEST-C-01"),
    (error: unknown) =>
      error instanceof PrepareDepositError &&
      error.code === "CHECKOUT_STATE_CONFLICT",
  );
  assert.equal(mem.paymentIntentCreates, 0);
  assert.equal(mem.quotes.get(checkoutId)?.clientSecret, "sec");
}

// ---------- D: reservation has PI, quote missing PI => conflict ----------
{
  const mem = new MemTxn();
  const prepared = await mem.prepare("PREP-TEST-D-01");
  const checkoutId = prepared.quote.checkoutId;
  mem.quotes.set(checkoutId, {
    ...prepared.quote,
    paymentIntentId: "",
    clientSecret: null,
  });
  mem.reservations.set(checkoutId, {
    ...mem.reservations.get(checkoutId)!,
    paymentIntentId: "pi_only_res",
  });
  mem.paymentIntentCreates = 0;
  await assert.rejects(
    () => mem.prepare("PREP-TEST-D-01"),
    (error: unknown) =>
      error instanceof PrepareDepositError &&
      error.code === "CHECKOUT_STATE_CONFLICT",
  );
  assert.equal(mem.paymentIntentCreates, 0);
}

// ---------- E: different PI ids => conflict ----------
{
  const mem = new MemTxn();
  const prepared = await mem.prepare("PREP-TEST-E-01");
  const checkoutId = prepared.quote.checkoutId;
  mem.quotes.set(checkoutId, {
    ...prepared.quote,
    paymentIntentId: "pi_a",
    clientSecret: "sec_a",
  });
  mem.reservations.set(checkoutId, {
    ...mem.reservations.get(checkoutId)!,
    paymentIntentId: "pi_b",
  });
  mem.paymentIntentCreates = 0;
  await assert.rejects(
    () => mem.prepare("PREP-TEST-E-01"),
    (error: unknown) =>
      error instanceof PrepareDepositError &&
      error.code === "CHECKOUT_STATE_CONFLICT",
  );
  assert.equal(mem.paymentIntentCreates, 0);
}

// ---------- F: pre-PI PREPARED+ACTIVE => create PI, bind both, then return ----------
{
  const mem = new MemTxn();
  const result = await mem.prepare("PREP-TEST-F-01");
  assert.equal(mem.paymentIntentCreates, 1);
  assert.equal(result.quote.paymentIntentId, "pi_1");
  assert.equal(result.clientSecret, "secret_1");
  assert.equal(mem.reservations.get(result.quote.checkoutId)?.paymentIntentId, "pi_1");
  assert.equal(mem.reservations.get(result.quote.checkoutId)?.status, "ACTIVE");
  // exact retry reuses same PI
  const retry = await mem.prepare("PREP-TEST-F-01");
  assert.equal(mem.paymentIntentCreates, 1);
  assert.equal(retry.reusedExisting, true);
  assert.equal(retry.quote.paymentIntentId, "pi_1");
  assert.equal(retry.clientSecret, "secret_1");
}

// ---------- G: PI create failure => atomic CANCELLED + RELEASED; retry stale ----------
{
  const mem = new MemTxn();
  mem.createFails = true;
  await assert.rejects(
    () => mem.prepare("PREP-TEST-G-01"),
    (error: unknown) =>
      error instanceof PrepareDepositError &&
      error.code === "PAYMENT_NOT_CONFIRMED",
  );
  assert.equal(mem.quotes.size, 1);
  const quote = [...mem.quotes.values()][0]!;
  assert.equal(quote.status, "CANCELLED");
  const reservation = mem.reservations.get(quote.checkoutId)!;
  assert.equal(reservation.status, "RELEASED");
  assert.equal(mem.fabrics.get("ODG-010")?.reservedStock, 0);
  mem.createFails = false;
  mem.paymentIntentCreates = 0;
  // Quote still CANCELLED under same prepare key => STALE / conflict, no PI
  await assert.rejects(
    () => mem.prepare("PREP-TEST-G-01"),
    (error: unknown) =>
      error instanceof PrepareDepositError &&
      (error.code === "STALE_CHECKOUT" ||
        error.code === "CHECKOUT_STATE_CONFLICT" ||
        error.code === "PREPARE_IDEMPOTENCY_CONFLICT"),
  );
  assert.equal(mem.paymentIntentCreates, 0);
}

// ---------- H: cleanup transaction failure => no payment info; inconsistent fails closed ----------
{
  const mem = new MemTxn();
  mem.createFails = true;
  mem.abortFails = true;
  await assert.rejects(
    () => mem.prepare("PREP-TEST-H-01"),
    (error: unknown) =>
      error instanceof PrepareDepositError && error.code === "SERVER_ERROR",
  );
  assert.equal(mem.paymentIntentCreates, 0);
  const quote = [...mem.quotes.values()][0]!;
  assert.equal(quote.status, "PREPARED");
  assert.equal(quote.clientSecret, null);
  assert.ok(!quote.paymentIntentId);
  // Simulate the previous crash window: reservation released, quote CANCELLED write failed
  await releaseInventoryReservation({
    store: mem.asStore(),
    checkoutId: quote.checkoutId,
    ownerUid: "customer-1",
    reason: "partial_cleanup",
    now: NOW,
    requireOwnerMatch: true,
  });
  mem.quotes.set(quote.checkoutId, {
    ...quote,
    status: "PREPARED",
    paymentIntentId: "",
    clientSecret: null,
  });
  mem.abortFails = false;
  mem.createFails = false;
  mem.paymentIntentCreates = 0;
  await assert.rejects(
    () => mem.prepare("PREP-TEST-H-01"),
    (error: unknown) =>
      error instanceof PrepareDepositError && error.code === "STALE_CHECKOUT",
  );
  assert.equal(mem.paymentIntentCreates, 0);
}

// ---------- I/J/K/L/M: payment_failed webhook executable paths ----------
{
  const runWebhook = async (input: {
    eventType: string;
    paymentIntentId: string;
    metadata: Record<string, string>;
    quote: DepositCheckoutQuote;
    reservation: InventoryReservationRecord;
    retrieveStatus: string;
    cancelResult?: { status: string } | "throw";
  }) => {
    let released = false;
    let confirmed = false;
    let cancelCalls = 0;
    const { res, state } = mockRes();
    const handler = createStripeWebhookHandler({
      env: {
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        STRIPE_SECRET_KEY: "sk_test_x",
      },
      getStripe: () =>
        ({
          webhooks: {
            constructEvent: () => ({
              type: input.eventType,
              data: {
                object: {
                  id: input.paymentIntentId,
                  metadata: input.metadata,
                },
              },
            }),
          },
          paymentIntents: {
            retrieve: async () => ({
              id: input.paymentIntentId,
              status: input.retrieveStatus,
            }),
            cancel: async () => {
              cancelCalls += 1;
              if (input.cancelResult === "throw") {
                throw new Error("cancel failed");
              }
              return {
                id: input.paymentIntentId,
                status: input.cancelResult?.status || "canceled",
              };
            },
          },
        }) as any,
      getServices: () => ({ db: {} as any }),
      loadQuote: async () => input.quote,
      loadReservation: async () => input.reservation,
      confirmCheckout: async () => {
        confirmed = true;
      },
      releaseReservation: async () => {
        released = true;
      },
    });
    await handler(
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        rawBody: Buffer.from("{}"),
        body: {},
      } as HttpRequest,
      res,
    );
    return { state, released, confirmed, cancelCalls };
  };

  const boundQuote = baseQuote({
    paymentIntentId: "pi_bound",
    clientSecret: "sec",
  });
  const boundRes = baseReservation({ paymentIntentId: "pi_bound" });
  const meta = {
    ownerUid: "u1",
    checkoutId: "CHK-1",
    checkoutFingerprint: "fp-1",
  };

  // I: requires_payment_method + cancel ok => release
  {
    const out = await runWebhook({
      eventType: "payment_intent.payment_failed",
      paymentIntentId: "pi_bound",
      metadata: meta,
      quote: boundQuote,
      reservation: boundRes,
      retrieveStatus: "requires_payment_method",
      cancelResult: { status: "canceled" },
    });
    assert.equal(out.released, true);
    assert.equal(out.confirmed, false);
    assert.equal(out.cancelCalls, 1);
    assert.equal(out.state.body.released, true);
  }

  // I: requires_payment_method + cancel fails => remain ACTIVE (no release)
  {
    const out = await runWebhook({
      eventType: "payment_intent.payment_failed",
      paymentIntentId: "pi_bound",
      metadata: meta,
      quote: boundQuote,
      reservation: boundRes,
      retrieveStatus: "requires_payment_method",
      cancelResult: "throw",
    });
    assert.equal(out.released, false);
    assert.equal(out.state.body.retained, true);
    assert.equal(out.cancelCalls, 1);
  }

  // J: processing => ACTIVE retained
  {
    const out = await runWebhook({
      eventType: "payment_intent.payment_failed",
      paymentIntentId: "pi_bound",
      metadata: meta,
      quote: boundQuote,
      reservation: boundRes,
      retrieveStatus: "processing",
    });
    assert.equal(out.released, false);
    assert.equal(out.state.body.retained, true);
    assert.equal(out.cancelCalls, 0);
  }

  // K: succeeded => finalize, not release
  {
    const out = await runWebhook({
      eventType: "payment_intent.payment_failed",
      paymentIntentId: "pi_bound",
      metadata: meta,
      quote: boundQuote,
      reservation: boundRes,
      retrieveStatus: "succeeded",
    });
    assert.equal(out.confirmed, true);
    assert.equal(out.released, false);
  }

  // L: genuine canceled bound PI => release exactly once
  {
    const out = await runWebhook({
      eventType: "payment_intent.canceled",
      paymentIntentId: "pi_bound",
      metadata: meta,
      quote: boundQuote,
      reservation: boundRes,
      retrieveStatus: "canceled",
    });
    assert.equal(out.released, true);
    assert.equal(out.cancelCalls, 0);
  }

  // M: foreign/mismatched PI => no release
  {
    const out = await runWebhook({
      eventType: "payment_intent.canceled",
      paymentIntentId: "pi_foreign",
      metadata: meta,
      quote: boundQuote,
      reservation: boundRes,
      retrieveStatus: "canceled",
    });
    assert.equal(out.released, false);
    assert.equal(out.state.body.ignored, true);
  }
}

// ---------- bindPaymentIntentToCheckout atomicity ----------
{
  const store = new MemTxn();
  await reserveInventoryForCheckout({
    store: store.asStore(),
    checkoutId: "CHK-BIND",
    ownerUid: "u1",
    checkoutFingerprint: "fp-1",
    quantities: new Map([["ODG-010", 2]]),
    now: NOW,
    paymentIntentId: null,
  });
  store.quotes.set(
    "CHK-BIND",
    baseQuote({ checkoutId: "CHK-BIND", paymentIntentId: "" }),
  );
  const bound = await bindPaymentIntentToCheckout({
    store: store.asStore(),
    checkoutId: "CHK-BIND",
    ownerUid: "u1",
    checkoutFingerprint: "fp-1",
    paymentIntentId: "pi_atomic",
    quantities: new Map([["ODG-010", 2]]),
    clientSecret: "cs_atomic",
    paymentProvider: "stripe",
  });
  assert.equal(bound.quote.paymentIntentId, "pi_atomic");
  assert.equal(bound.reservation.paymentIntentId, "pi_atomic");
  assert.equal(store.quotes.get("CHK-BIND")?.paymentIntentId, "pi_atomic");
  assert.equal(
    store.reservations.get("CHK-BIND")?.paymentIntentId,
    "pi_atomic",
  );

  // RELEASED reservation cannot bind
  store.reservations.set("CHK-BIND", {
    ...store.reservations.get("CHK-BIND")!,
    status: "RELEASED",
    paymentIntentId: undefined,
  });
  store.quotes.set("CHK-BIND", {
    ...store.quotes.get("CHK-BIND")!,
    paymentIntentId: "",
    clientSecret: null,
  });
  await assert.rejects(
    () =>
      bindPaymentIntentToCheckout({
        store: store.asStore(),
        checkoutId: "CHK-BIND",
        ownerUid: "u1",
        checkoutFingerprint: "fp-1",
        paymentIntentId: "pi_new",
        quantities: new Map([["ODG-010", 2]]),
        clientSecret: "cs",
        paymentProvider: "stripe",
      }),
    (error: unknown) =>
      error instanceof PayableCheckoutValidationError &&
      error.code === "STALE_CHECKOUT",
  );
}

// ---------- assertPayablePreparedCheckout RELEASED/EXPIRED ----------
{
  assert.throws(
    () =>
      assertPayablePreparedCheckout({
        quote: baseQuote(),
        reservation: baseReservation({ status: "RELEASED" }),
        ownerUid: "u1",
        checkoutId: "CHK-1",
        checkoutFingerprint: "fp-1",
        quantities: new Map([["ODG-010", 2]]),
      }),
    (e: unknown) =>
      e instanceof PayableCheckoutValidationError && e.code === "STALE_CHECKOUT",
  );
}

// ---------- makePaymentIntentNonPayableBeforeReservationRelease unit ----------
{
  const retain = await makePaymentIntentNonPayableBeforeReservationRelease({
    stripe: {
      retrieve: async () => ({ id: "pi", status: "requires_capture" }),
      cancel: async () => ({ id: "pi", status: "canceled" }),
    },
    paymentIntentId: "pi",
  });
  assert.equal(retain.outcome, "retain");

  const release = await makePaymentIntentNonPayableBeforeReservationRelease({
    stripe: {
      retrieve: async () => ({ id: "pi", status: "requires_payment_method" }),
      cancel: async () => ({ id: "pi", status: "canceled" }),
    },
    paymentIntentId: "pi",
  });
  assert.equal(release.outcome, "release_allowed");
}

// ---------- customer release uses same policy (processing retains) ----------
{
  const quotes = new Map<string, DepositCheckoutQuote>();
  const reservations = new Map<string, InventoryReservationRecord>();
  quotes.set("CHK-R", baseQuote({ checkoutId: "CHK-R", paymentIntentId: "pi_r" }));
  reservations.set(
    "CHK-R",
    baseReservation({ checkoutId: "CHK-R", paymentIntentId: "pi_r" }),
  );
  let released = false;
  const { res, state } = mockRes();
  const handler = createReleaseDepositReservationHandler({
    getServices: () =>
      ({
        auth: {
          verifyIdToken: async () => ({
            uid: "u1",
            firebase: { sign_in_provider: "password" },
          }),
        },
        db: {} as any,
      }) as any,
    getStripe: () =>
      ({
        paymentIntents: {
          retrieve: async () => ({ id: "pi_r", status: "processing" }),
          cancel: async () => ({ id: "pi_r", status: "canceled" }),
        },
      }) as any,
    loadQuote: async (_db, id) => quotes.get(id) ?? null,
    loadReservation: async (_db, id) => reservations.get(id) ?? null,
    runReservationTransaction: async (_db, work) => {
      released = true;
      return work({
        getFabric: async () => null,
        getReservation: async (id) => reservations.get(id) ?? null,
        setReservation: () => undefined,
        updateFabric: () => undefined,
      });
    },
    now: () => NOW,
  });
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { checkoutId: "CHK-R" },
    } as HttpRequest,
    res,
  );
  assert.equal(released, false);
  assert.equal(state.statusCode, 409);
  assert.equal(state.body.code, "PAYMENT_PROCESSING");
}

console.log("PASS: fabric reservation payment integrity executable regressions");
