/**
 * Fabric reservation + payment conversion domain tests.
 */
import assert from "node:assert/strict";
import {
  reserveInventoryForCheckout,
  releaseInventoryReservation,
  consumeInventoryReservationForSale,
  FabricReservationError,
  type InventoryReservationRecord,
  type ReservationFabricSnapshot,
  type ReservationTransactionStore,
} from "./src/server/fabricInventoryReservation";
import {
  computeAvailableStock,
  normalizeReservedStock,
} from "./src/utils/fabricInventoryAvailability";
import { DEPOSIT_RESERVATION_MINUTES } from "./src/config/depositReservationConfig";
import { existsSync, readFileSync } from "node:fs";

assert.equal(typeof DEPOSIT_RESERVATION_MINUTES, "number");
assert.ok(DEPOSIT_RESERVATION_MINUTES > 0);

type MemFabric = ReservationFabricSnapshot;

class MemReservationDb {
  fabrics = new Map<string, MemFabric>();
  reservations = new Map<string, InventoryReservationRecord>();

  seed(code: string, stock: number, reservedStock = 0, status = "IN_STOCK") {
    this.fabrics.set(code, {
      code,
      stock,
      reservedStock,
      stockStatus: status,
    });
  }

  store(): ReservationTransactionStore {
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
    };
  }
}

const NOW = new Date("2026-08-23T12:00:00.000Z");

// --- RESERVATION ---
{
  const db = new MemReservationDb();
  db.seed("F1", 10);
  const { reservation, reusedExisting } = await reserveInventoryForCheckout({
    store: db.store(),
    checkoutId: "CHK-A",
    ownerUid: "u1",
    checkoutFingerprint: "fp-a",
    quantities: new Map([["F1", 2]]),
    now: NOW,
  });
  assert.equal(reusedExisting, false);
  assert.equal(reservation.status, "ACTIVE");
  assert.equal(db.fabrics.get("F1")?.reservedStock, 2);
  assert.equal(computeAvailableStock(10, 2), 8);
  assert.equal(db.fabrics.get("F1")?.stockStatus, "IN_STOCK");
}

// Exact retry does not double-reserve
{
  const db = new MemReservationDb();
  db.seed("F1", 10);
  const store = db.store();
  await reserveInventoryForCheckout({
    store,
    checkoutId: "CHK-B",
    ownerUid: "u1",
    checkoutFingerprint: "fp-b",
    quantities: new Map([["F1", 2]]),
    now: NOW,
  });
  const second = await reserveInventoryForCheckout({
    store,
    checkoutId: "CHK-B",
    ownerUid: "u1",
    checkoutFingerprint: "fp-b",
    quantities: new Map([["F1", 2]]),
    now: NOW,
  });
  assert.equal(second.reusedExisting, true);
  assert.equal(db.fabrics.get("F1")?.reservedStock, 2);
}

// Multi-fabric atomic reserve
{
  const db = new MemReservationDb();
  db.seed("F1", 5);
  db.seed("F2", 5);
  await reserveInventoryForCheckout({
    store: db.store(),
    checkoutId: "CHK-MULTI",
    ownerUid: "u1",
    checkoutFingerprint: "fp-m",
    quantities: new Map([
      ["F1", 2],
      ["F2", 3],
    ]),
    now: NOW,
  });
  assert.equal(db.fabrics.get("F1")?.reservedStock, 2);
  assert.equal(db.fabrics.get("F2")?.reservedStock, 3);
}

// One insufficient => none reserved
{
  const db = new MemReservationDb();
  db.seed("F1", 5);
  db.seed("F2", 1);
  await assert.rejects(
    () =>
      reserveInventoryForCheckout({
        store: db.store(),
        checkoutId: "CHK-FAIL",
        ownerUid: "u1",
        checkoutFingerprint: "fp-f",
        quantities: new Map([
          ["F1", 2],
          ["F2", 3],
        ]),
        now: NOW,
      }),
    (error: unknown) =>
      error instanceof FabricReservationError &&
      error.code === "INSUFFICIENT_STOCK",
  );
  assert.equal(normalizeReservedStock(db.fabrics.get("F1")?.reservedStock), 0);
  assert.equal(normalizeReservedStock(db.fabrics.get("F2")?.reservedStock), 0);
}

// Concurrent final-unit: one winner
{
  const db = new MemReservationDb();
  db.seed("F1", 1);
  const first = await reserveInventoryForCheckout({
    store: db.store(),
    checkoutId: "CHK-WIN",
    ownerUid: "u1",
    checkoutFingerprint: "fp-1",
    quantities: new Map([["F1", 1]]),
    now: NOW,
  });
  assert.equal(first.reservation.status, "ACTIVE");
  await assert.rejects(
    () =>
      reserveInventoryForCheckout({
        store: db.store(),
        checkoutId: "CHK-LOSE",
        ownerUid: "u2",
        checkoutFingerprint: "fp-2",
        quantities: new Map([["F1", 1]]),
        now: NOW,
      }),
    (error: unknown) =>
      error instanceof FabricReservationError &&
      (error.code === "INSUFFICIENT_STOCK" ||
        error.code === "FABRIC_UNAVAILABLE"),
  );
  assert.equal(db.fabrics.get("F1")?.reservedStock, 1);
  assert.equal(computeAvailableStock(1, 1), 0);
  assert.equal(db.fabrics.get("F1")?.stockStatus, "OUT_OF_STOCK");
}

// Different checkout cannot steal reservation
{
  const db = new MemReservationDb();
  db.seed("F1", 2);
  await reserveInventoryForCheckout({
    store: db.store(),
    checkoutId: "CHK-OWN",
    ownerUid: "u1",
    checkoutFingerprint: "fp-own",
    quantities: new Map([["F1", 1]]),
    now: NOW,
  });
  await assert.rejects(
    () =>
      reserveInventoryForCheckout({
        store: db.store(),
        checkoutId: "CHK-OWN",
        ownerUid: "u2",
        checkoutFingerprint: "fp-other",
        quantities: new Map([["F1", 1]]),
        now: NOW,
      }),
    (error: unknown) =>
      error instanceof FabricReservationError &&
      error.code === "RESERVATION_CONFLICT",
  );
}

// --- SALE CONVERSION ---
{
  const db = new MemReservationDb();
  db.seed("F1", 10);
  await reserveInventoryForCheckout({
    store: db.store(),
    checkoutId: "CHK-SALE",
    ownerUid: "u1",
    checkoutFingerprint: "fp-sale",
    quantities: new Map([["F1", 2]]),
    now: NOW,
    paymentIntentId: "pi_sale",
  });
  const consumed = await consumeInventoryReservationForSale({
    store: db.store(),
    checkoutId: "CHK-SALE",
    ownerUid: "u1",
    checkoutFingerprint: "fp-sale",
    paymentIntentId: "pi_sale",
    expectedLines: [{ fabricCode: "F1", quantity: 2 }],
    now: NOW,
  });
  assert.equal(consumed.reservation.status, "CONSUMED");
  assert.equal(db.fabrics.get("F1")?.stock, 8);
  assert.equal(db.fabrics.get("F1")?.reservedStock, 0);
  assert.equal(computeAvailableStock(8, 0), 8);
}

// --- RELEASE ---
{
  const db = new MemReservationDb();
  db.seed("F1", 10);
  await reserveInventoryForCheckout({
    store: db.store(),
    checkoutId: "CHK-REL",
    ownerUid: "u1",
    checkoutFingerprint: "fp-rel",
    quantities: new Map([["F1", 2]]),
    now: NOW,
  });
  const released = await releaseInventoryReservation({
    store: db.store(),
    checkoutId: "CHK-REL",
    ownerUid: "u1",
    reason: "payment_failed",
    now: NOW,
    requireOwnerMatch: true,
  });
  assert.equal(released.released, true);
  assert.equal(db.fabrics.get("F1")?.stock, 10);
  assert.equal(db.fabrics.get("F1")?.reservedStock, 0);

  const again = await releaseInventoryReservation({
    store: db.store(),
    checkoutId: "CHK-REL",
    ownerUid: "u1",
    reason: "payment_failed",
    now: NOW,
    requireOwnerMatch: true,
  });
  assert.equal(again.idempotent, true);
}

// Consumed cannot release
{
  const db = new MemReservationDb();
  db.seed("F1", 5);
  await reserveInventoryForCheckout({
    store: db.store(),
    checkoutId: "CHK-CON",
    ownerUid: "u1",
    checkoutFingerprint: "fp-con",
    quantities: new Map([["F1", 1]]),
    now: NOW,
    paymentIntentId: "pi_con",
  });
  await consumeInventoryReservationForSale({
    store: db.store(),
    checkoutId: "CHK-CON",
    ownerUid: "u1",
    checkoutFingerprint: "fp-con",
    paymentIntentId: "pi_con",
    expectedLines: [{ fabricCode: "F1", quantity: 1 }],
    now: NOW,
  });
  await assert.rejects(
    () =>
      releaseInventoryReservation({
        store: db.store(),
        checkoutId: "CHK-CON",
        ownerUid: "u1",
        reason: "customer_cancelled",
        now: NOW,
        requireOwnerMatch: true,
      }),
    (error: unknown) =>
      error instanceof FabricReservationError &&
      error.code === "RESERVATION_NOT_ACTIVE",
  );
}

// Corrupted reservation line mismatch fails closed
{
  const db = new MemReservationDb();
  db.seed("F1", 5);
  await reserveInventoryForCheckout({
    store: db.store(),
    checkoutId: "CHK-BAD",
    ownerUid: "u1",
    checkoutFingerprint: "fp-bad",
    quantities: new Map([["F1", 1]]),
    now: NOW,
    paymentIntentId: "pi_bad",
  });
  await assert.rejects(
    () =>
      consumeInventoryReservationForSale({
        store: db.store(),
        checkoutId: "CHK-BAD",
        ownerUid: "u1",
        checkoutFingerprint: "fp-bad",
        paymentIntentId: "pi_bad",
        expectedLines: [{ fabricCode: "F1", quantity: 2 }],
        now: NOW,
      }),
    (error: unknown) =>
      error instanceof FabricReservationError &&
      error.code === "RESERVATION_CONFLICT",
  );
}

// Payment UI: raw card inputs removed; PaymentElement present
{
  const appSource = readFileSync("src/App.tsx", "utf8");
  assert.equal(appSource.includes("checkoutCardNumber"), false);
  assert.equal(appSource.includes("4242 4242 4242 4242"), false);
  assert.equal(appSource.includes("DepositPaymentElement"), true);
  assert.equal(existsSync("src/components/DepositPaymentElement.tsx"), true);
  const elementSource = readFileSync(
    "src/components/DepositPaymentElement.tsx",
    "utf8",
  );
  assert.equal(elementSource.includes("PaymentElement"), true);
  assert.equal(elementSource.includes("confirmPayment"), true);
}

// Webhook + reconcile routes exist
assert.equal(existsSync("api/orders/stripe-webhook.ts"), true);
assert.equal(existsSync("api/orders/reconcile-expired-reservations.ts"), true);
assert.equal(existsSync("api/orders/release-deposit-reservation.ts"), true);
assert.equal(
  readFileSync("firestore.rules", "utf8").includes("inventory_reservations"),
  true,
);

console.log("PASS: fabric inventory reservation + payment conversion");
