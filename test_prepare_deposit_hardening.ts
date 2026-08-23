import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import {
  prepareDepositCheckout,
  PrepareDepositError,
  sanitizeCartItemChoices,
  type DepositCatalogSnapshot,
} from "./src/server/prepareDepositCheckout";
import type {
  CartItem,
  Fabric,
  MasterOrder,
  StyleCategory,
} from "./src/types";
import type {
  DepositCheckoutQuote,
  DepositPrepareLookupRecord,
} from "./src/utils/depositOrderFingerprint";
import {
  buildCanonicalCheckoutFingerprint,
  buildDepositCheckoutIdFromPrepareKey,
  buildDepositPrepareKey,
  buildOrderCheckoutFingerprint,
} from "./src/utils/depositOrderFingerprint";
import { calculateCartPricing } from "./src/utils/shippingPricing";

process.env.ALLOW_SIMULATED_DEPOSIT_PAYMENT = "true";
process.env.NODE_ENV = "test";
delete process.env.VERCEL_ENV;

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

const baseCartItem = (overrides: Partial<CartItem> = {}): CartItem =>
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
    garment: {
      code: "G1",
      totalPrice: 100,
      basePrice: 80,
    },
    measurements: {},
    deliverySelection: {
      method: "PICKUP",
      pickupLocation: "Eindhoven Atelier",
      pickupWindow: "Weekdays",
      actualParcelWeightKg: 0.1,
    },
    specialInstructions: "Handle with care",
    notesAboutLeftoverFabric: "Return leftover",
    ...overrides,
  }) as CartItem;

class MemoryPrepareStore {
  quotes = new Map<string, DepositCheckoutQuote>();
  lookups = new Map<string, DepositPrepareLookupRecord>();
  reservations = new Map<
    string,
    import("./src/server/fabricInventoryReservation").InventoryReservationRecord
  >();
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

  private asTxnStore() {
    return {
      getFabric: async (code: string) => this.fabrics.get(code) ?? null,
      getReservation: async (id: string) => this.reservations.get(id) ?? null,
      setReservation: (
        id: string,
        reservation: import("./src/server/fabricInventoryReservation").InventoryReservationRecord,
      ) => {
        this.reservations.set(id, reservation);
      },
      updateFabric: (
        code: string,
        patch: {
          stock?: number;
          reservedStock: number;
          stockStatus: string;
        },
      ) => {
        const current = this.fabrics.get(code);
        if (!current) return;
        this.fabrics.set(code, {
          ...current,
          ...(typeof patch.stock === "number" ? { stock: patch.stock } : {}),
          reservedStock: patch.reservedStock,
          stockStatus: patch.stockStatus,
        });
      },
      savePrepareLookup: (record: DepositPrepareLookupRecord) => {
        this.lookups.set(record.prepareKey, record);
      },
      saveQuote: (quote: DepositCheckoutQuote) => {
        this.quotes.set(quote.checkoutId, quote);
      },
      loadReservation: async (id: string) => this.reservations.get(id) ?? null,
      getQuote: async (id: string) => this.quotes.get(id) ?? null,
      setQuote: (id: string, quote: DepositCheckoutQuote) => {
        this.quotes.set(id, quote);
      },
    };
  }

  async prepare(
    cartItems: CartItem[],
    prepareRequestId: string,
    uid = "customer-1",
  ) {
    return prepareDepositCheckout({
      authenticatedUid: uid,
      token: { uid, firebase: { sign_in_provider: "password" } },
      cartItems,
      prepareRequestId,
      loadCatalogs: async () => catalogs,
      loadPrepareLookup: async (prepareKey) => this.lookups.get(prepareKey) ?? null,
      loadQuote: async (checkoutId) => this.quotes.get(checkoutId) ?? null,
      loadReservation: async (checkoutId) =>
        this.reservations.get(checkoutId) ?? null,
      savePrepareLookup: async (record) => {
        this.lookups.set(record.prepareKey, record);
      },
      saveQuote: async (quote) => {
        this.quotes.set(quote.checkoutId, quote);
      },
      runPrepareReservationTransaction: async (work) => work(this.asTxnStore()),
      validateAndPriceCart: ({ items }) => ({
        items,
        canProceed: true,
        blockers: [],
        pricing: {
          total: 200,
          depositDueNow: 100,
        },
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
        this.paymentIntentCreates += 1;
        return {
          id: `pi_${this.paymentIntentCreates}`,
          clientSecret: `secret_${this.paymentIntentCreates}`,
        };
      },
    });
  }
}

// Shipping weight: client actualParcelWeightKg must not affect pricing.
{
  const withTinyWeight = baseCartItem({
    deliverySelection: {
      method: "DELIVERY",
      address: {
        addressLine1: "Street 1",
        city: "Amsterdam",
        postalCode: "1011AB",
        countryCode: "NL",
      },
      actualParcelWeightKg: 0.1,
    },
  });
  const withHugeWeight = baseCartItem({
    id: "item-1",
    deliverySelection: {
      method: "DELIVERY",
      address: {
        addressLine1: "Street 1",
        city: "Amsterdam",
        postalCode: "1011AB",
        countryCode: "NL",
      },
      actualParcelWeightKg: 99,
    },
  });
  const missingWeight = baseCartItem({
    deliverySelection: {
      method: "DELIVERY",
      address: {
        addressLine1: "Street 1",
        city: "Amsterdam",
        postalCode: "1011AB",
        countryCode: "NL",
      },
    },
  });
  const left = calculateCartPricing([withTinyWeight], 0.5);
  const right = calculateCartPricing([withHugeWeight], 0.5);
  const missing = calculateCartPricing([missingWeight], 0.5);
  assert.equal(left.total, right.total);
  assert.equal(left.depositDueNow, right.depositDueNow);
  assert.equal(left.total, missing.total);
  assert.equal(
    sanitizeCartItemChoices(withTinyWeight).deliverySelection
      ?.actualParcelWeightKg,
    undefined,
  );
}

// Exact prepare retry reuses quote + payment proof
{
  const store = new MemoryPrepareStore();
  process.env.ALLOW_SIMULATED_DEPOSIT_PAYMENT = "false";
  const first = await store.prepare([baseCartItem()], "PREP-EXACT-1");
  const second = await store.prepare([baseCartItem()], "PREP-EXACT-1");
  assert.equal(first.reusedExisting, false);
  assert.equal(second.reusedExisting, true);
  assert.equal(first.quote.checkoutId, second.quote.checkoutId);
  assert.equal(first.quote.paymentIntentId, second.quote.paymentIntentId);
  assert.equal(store.paymentIntentCreates, 1);
  assert.equal(store.quotes.size, 1);
  process.env.ALLOW_SIMULATED_DEPOSIT_PAYMENT = "true";
}

// Altered payload same prepareRequestId => conflict
{
  const store = new MemoryPrepareStore();
  await store.prepare([baseCartItem()], "PREP-ALTER-1");
  await assert.rejects(
    () =>
      store.prepare(
        [
          baseCartItem({
            specialInstructions: "Changed instructions",
          }),
        ],
        "PREP-ALTER-1",
      ),
    (error: unknown) =>
      error instanceof PrepareDepositError &&
      error.code === "PREPARE_IDEMPOTENCY_CONFLICT",
  );
  assert.equal(store.quotes.size, 1);
}

// Cross-owner same raw prepareRequestId resolves to different prepare keys
{
  const store = new MemoryPrepareStore();
  const ownerA = await store.prepare(
    [baseCartItem()],
    "PREP-SHARED",
    "customer-1",
  );
  const ownerB = await store.prepare(
    [
      {
        ...baseCartItem(),
        customer: {
          ownerUid: "customer-2",
          name: "Bob",
          email: "bob@example.test",
          phone: "+31000000001",
        },
      } as CartItem,
    ],
    "PREP-SHARED",
    "customer-2",
  );
  assert.notEqual(ownerA.quote.checkoutId, ownerB.quote.checkoutId);
  assert.equal(
    buildDepositPrepareKey("customer-1", "PREP-SHARED") ===
      buildDepositPrepareKey("customer-2", "PREP-SHARED"),
    false,
  );
  assert.equal(store.quotes.size, 2);
}

// Confirmed quote cannot be overwritten
{
  const store = new MemoryPrepareStore();
  const prepared = await store.prepare([baseCartItem()], "PREP-CONFIRMED-1");
  const confirmed: DepositCheckoutQuote = {
    ...prepared.quote,
    status: "CONFIRMED",
    confirmedAt: new Date().toISOString(),
  };
  store.quotes.set(confirmed.checkoutId, confirmed);
  const reused = await store.prepare([baseCartItem()], "PREP-CONFIRMED-1");
  assert.equal(reused.reusedExisting, true);
  assert.equal(reused.quote.status, "CONFIRMED");
  await assert.rejects(
    () =>
      store.prepare(
        [baseCartItem({ specialInstructions: "mutate" })],
        "PREP-CONFIRMED-1",
      ),
    (error: unknown) =>
      error instanceof PrepareDepositError &&
      error.code === "PREPARE_IDEMPOTENCY_CONFLICT",
  );
}

// Fingerprint includes special instructions / leftover notes / uploaded reference
{
  const checkoutId = buildDepositCheckoutIdFromPrepareKey(
    buildDepositPrepareKey("customer-1", "PREP-FP"),
  );
  const leftOrder = {
    ownerUid: "customer-1",
    customer: {
      ownerUid: "customer-1",
      name: "Ada",
      email: "ada@example.test",
      phone: "+31",
    },
    specialInstructions: "A",
    notesAboutLeftoverFabric: "Keep",
    checkoutId,
    shipment: { trackingId: `${checkoutId}-item-1` },
    payment: { subtotal: 100, deposit: 50, remaining: 50 },
    fabricAllocations: [],
  } as MasterOrder;
  const rightOrder = {
    ...leftOrder,
    specialInstructions: "B",
  } as MasterOrder;
  assert.notEqual(
    buildOrderCheckoutFingerprint(leftOrder),
    buildOrderCheckoutFingerprint(rightOrder),
  );

  const withRef = {
    ...leftOrder,
    orderDesignSource: {
      kind: "uploaded",
      sourceKey: "uploaded:1",
      displayLabel: "Upload",
      fabricCapacityComposition: [],
      demographic: "male",
      imageState: {
        kind: "immutable_order_asset",
        orderReference: {
          orderId: `${checkoutId}-item-1`,
          storagePath: `customer-order-designs/customer-1/${checkoutId}-item-1/design-1/reference.png`,
          mimeType: "image/png",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
    },
  } as MasterOrder;
  const mutatedRef = {
    ...withRef,
    orderDesignSource: {
      ...withRef.orderDesignSource!,
      imageState: {
        kind: "immutable_order_asset",
        orderReference: {
          orderId: `${checkoutId}-item-1`,
          storagePath: `customer-order-designs/customer-1/${checkoutId}-item-1/design-1/reference-forged.png`,
          mimeType: "image/png",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
    },
  } as MasterOrder;
  assert.notEqual(
    buildOrderCheckoutFingerprint(withRef),
    buildOrderCheckoutFingerprint(mutatedRef),
  );

  const sortedA = buildCanonicalCheckoutFingerprint({
    checkoutId,
    ownerUid: "customer-1",
    orders: [leftOrder, { ...leftOrder, shipment: { trackingId: `${checkoutId}-b` } } as MasterOrder],
    totalCents: 10000,
    depositCents: 5000,
    currency: "eur",
  });
  const sortedB = buildCanonicalCheckoutFingerprint({
    checkoutId,
    ownerUid: "customer-1",
    orders: [
      { ...leftOrder, shipment: { trackingId: `${checkoutId}-b` } } as MasterOrder,
      leftOrder,
    ],
    totalCents: 10000,
    depositCents: 5000,
    currency: "eur",
  });
  assert.equal(sortedA, sortedB);
}

console.log("PASS: prepare deposit idempotency + shipping weight + fingerprint");
