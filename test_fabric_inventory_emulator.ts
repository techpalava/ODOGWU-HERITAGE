import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import {
  confirmDepositCheckoutBatchWithAdminDb,
  createAdminReservationTransactionRunner,
  saveDepositCheckoutQuote,
} from "./src/server/fabricInventoryAdmin";
import { FabricInventoryError } from "./src/server/fabricInventoryConsumption";
import {
  FabricReservationError,
  reserveInventoryForCheckout,
} from "./src/server/fabricInventoryReservation";
import type { FabricAllocation, MasterOrder, StyleCategory } from "./src/types";
import {
  buildCanonicalCheckoutFingerprint,
  buildSimulationToken,
  type DepositCheckoutQuote,
} from "./src/utils/depositOrderFingerprint";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8088";
process.env.ALLOW_SIMULATED_DEPOSIT_PAYMENT = "true";
process.env.NODE_ENV = "test";

const PROJECT_ID = "demo-odogwu-future-drafts";

const testEnvironment = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    host: "127.0.0.1",
    port: 8088,
    rules: readFileSync("firestore.rules", "utf8"),
  },
});

const signedIn = (uid: string): RulesTestContext =>
  testEnvironment.authenticatedContext(uid, {
    email: `${uid}@example.test`,
    firebase: { sign_in_provider: "password" },
  });

const adminApp =
  getApps().find((app) => app.name === "fabric-inventory-emulator") ||
  initializeApp(
    {
      projectId: PROJECT_ID,
    },
    "fabric-inventory-emulator",
  );
const adminDb = getFirestore(adminApp);

const style: StyleCategory = {
  id: "emulator-shirt-trouser",
  name: "Emulator Style",
  description: "",
  gender: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};

const allocations = (
  fabricCode: string,
): FabricAllocation[] => [
  {
    allocationId: `${fabricCode}-1`,
    fabricCode,
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
];

const orderFor = (
  orderId: string,
  checkoutId: string,
  uid: string,
  fabricCode: string,
): MasterOrder =>
  ({
    ownerUid: uid,
    customer: {
      ownerUid: uid,
      name: "Emulator Customer",
      email: `${uid}@example.test`,
      phone: "+31000000000",
    },
    style,
    fabric: {
      code: fabricCode,
      name: "Race Fabric",
      description: "",
      color: "Green",
      colorHex: "#0f0",
      priceMultiplier: 1,
      stockStatus: "IN_STOCK",
      stock: 1,
    },
    fabricAllocations: allocations(fabricCode),
    design: {},
    garment: {},
    measurements: {},
    payment: {
      subtotal: 100,
      deposit: 50,
      remaining: 50,
      method: "Stripe Credit Card",
      date: new Date().toISOString(),
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
    checkoutId,
  }) as MasterOrder;

const quoteFor = (
  order: MasterOrder,
  uid: string,
): DepositCheckoutQuote => {
  const checkoutId = String((order as { checkoutId?: string }).checkoutId);
  const depositCents = Math.round((order.payment?.deposit || 0) * 100);
  const totalCents = Math.round((order.payment?.subtotal || 0) * 100);
  const canonicalCheckoutFingerprint = buildCanonicalCheckoutFingerprint({
    checkoutId,
    ownerUid: uid,
    orders: [order],
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
    canonicalOrders: [order],
    orderIds: [String(order.shipment?.trackingId)],
    canonicalCheckoutFingerprint,
    totalCents,
    depositCents,
    paymentProvider: "simulated",
    paymentIntentId: `sim_${checkoutId}`,
    simulationToken,
    clientSecret: null,
    createdAt: new Date().toISOString(),
  };
};

await testEnvironment.clearFirestore();

await testEnvironment.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), "fabrics", "ODG-RACE"), {
    code: "ODG-RACE",
    name: "Race Fabric",
    stock: 1,
    reservedStock: 0,
    stockStatus: "IN_STOCK",
  });
});

const customerCtx = signedIn("customer-race");
await assertFails(
  setDoc(doc(customerCtx.firestore(), "orders", "direct-create"), {
    ownerUid: "customer-race",
    customer: { ownerUid: "customer-race" },
  }),
);
await assertFails(
  setDoc(doc(customerCtx.firestore(), "inventory_reservations", "CHK-HACK"), {
    checkoutId: "CHK-HACK",
    ownerUid: "customer-race",
    status: "ACTIVE",
    lines: [{ fabricCode: "ODG-RACE", quantity: 1 }],
  }),
);

await testEnvironment.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), "orders", "admin-created"), {
    ownerUid: "customer-race",
    customer: { ownerUid: "customer-race" },
  });
});
await assertSucceeds(
  getDoc(doc(customerCtx.firestore(), "orders", "admin-created")),
);

const quoteA = quoteFor(
  orderFor("ORDER-RACE-A", "CHECKOUT-RACE-A", "customer-race", "ODG-RACE"),
  "customer-race",
);
const quoteB = quoteFor(
  orderFor("ORDER-RACE-B", "CHECKOUT-RACE-B", "customer-race", "ODG-RACE"),
  "customer-race",
);

const reserveForQuote = async (quote: DepositCheckoutQuote) => {
  const run = createAdminReservationTransactionRunner(adminDb);
  return run(async (store) =>
    reserveInventoryForCheckout({
      store,
      checkoutId: quote.checkoutId,
      ownerUid: quote.ownerUid,
      checkoutFingerprint: quote.canonicalCheckoutFingerprint,
      quantities: new Map([["ODG-RACE", 1]]),
      now: new Date(),
      paymentIntentId: quote.paymentIntentId,
    }),
  );
};

const reserveResults = await Promise.allSettled([
  reserveForQuote(quoteA),
  reserveForQuote(quoteB),
]);
const reserveFulfilled = reserveResults.filter((r) => r.status === "fulfilled");
const reserveRejected = reserveResults.filter((r) => r.status === "rejected");
assert.equal(reserveFulfilled.length, 1, "exactly one reservation must succeed");
assert.equal(reserveRejected.length, 1, "exactly one reservation must fail");
const reserveError = (reserveRejected[0] as PromiseRejectedResult).reason;
assert.ok(
  reserveError instanceof FabricReservationError &&
    (reserveError.code === "INSUFFICIENT_STOCK" ||
      reserveError.code === "FABRIC_UNAVAILABLE"),
  `losing reserve must fail closed, got: ${
    reserveError instanceof Error
      ? `${reserveError.name}:${(reserveError as { code?: string }).code || reserveError.message}`
      : String(reserveError)
  }`,
);

const fabricAfterReserve = await adminDb.collection("fabrics").doc("ODG-RACE").get();
assert.equal(fabricAfterReserve.data()?.stock, 1);
assert.equal(fabricAfterReserve.data()?.reservedStock, 1);
assert.equal(fabricAfterReserve.data()?.stockStatus, "OUT_OF_STOCK");

const winningReserve = (
  reserveFulfilled[0] as PromiseFulfilledResult<
    Awaited<ReturnType<typeof reserveForQuote>>
  >
).value.reservation;
const winningQuote =
  winningReserve.checkoutId === quoteA.checkoutId ? quoteA : quoteB;
const losingQuote =
  winningReserve.checkoutId === quoteA.checkoutId ? quoteB : quoteA;

await saveDepositCheckoutQuote(adminDb, winningQuote);
await saveDepositCheckoutQuote(adminDb, losingQuote);

const confirmWinner = await confirmDepositCheckoutBatchWithAdminDb({
  db: adminDb,
  quote: winningQuote,
  paymentProof: {
    provider: "simulated",
    checkoutId: winningQuote.checkoutId,
    simulationToken: winningQuote.simulationToken!,
  },
  authenticatedUid: "customer-race",
});
assert.equal(confirmWinner.status, "consumed");

await assert.rejects(
  () =>
    confirmDepositCheckoutBatchWithAdminDb({
      db: adminDb,
      quote: losingQuote,
      paymentProof: {
        provider: "simulated",
        checkoutId: losingQuote.checkoutId,
        simulationToken: losingQuote.simulationToken!,
      },
      authenticatedUid: "customer-race",
    }),
  (error: unknown) =>
    error instanceof FabricInventoryError &&
    (error.code === "CHECKOUT_STATE_CONFLICT" ||
      error.code === "INSUFFICIENT_STOCK" ||
      error.code === "FABRIC_UNAVAILABLE"),
);

const fabricSnap = await adminDb.collection("fabrics").doc("ODG-RACE").get();
assert.equal(fabricSnap.data()?.stock, 0);
assert.equal(fabricSnap.data()?.reservedStock, 0);
assert.equal(fabricSnap.data()?.stockStatus, "OUT_OF_STOCK");

const ledgers = await adminDb.collection("inventory_transactions").get();
assert.equal(ledgers.size, 1, "exactly one inventory sale ledger");

const raceOrders = await adminDb
  .collection("orders")
  .where("checkoutId", "in", [quoteA.checkoutId, quoteB.checkoutId])
  .get();
assert.equal(raceOrders.size, 1, "exactly one final order for the race");

const checkoutConfirmations = await adminDb
  .collection("checkout_confirmations")
  .get();
assert.equal(
  checkoutConfirmations.size,
  1,
  "exactly one checkout confirmation",
);

const paymentConfirmations = await adminDb
  .collection("deposit_payment_confirmations")
  .get();
assert.equal(
  paymentConfirmations.size,
  1,
  "exactly one payment confirmation",
);

const winnerReservation = await adminDb
  .collection("inventory_reservations")
  .doc(winningQuote.checkoutId)
  .get();
assert.equal(winnerReservation.data()?.status, "CONSUMED");

const loserReservation = await adminDb
  .collection("inventory_reservations")
  .doc(losingQuote.checkoutId)
  .get();
assert.equal(loserReservation.exists, false);

console.log("PASS: fabric inventory firestore emulator concurrency + rules");
await testEnvironment.cleanup();
