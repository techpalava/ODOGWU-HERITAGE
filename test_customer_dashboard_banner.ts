import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CustomerJourneyEngine } from "./src/engine/CustomerJourneyEngine";
import { presentCustomerDashboardBanner } from "./src/utils/customerDashboardBanner";
import { presentFutureOrderV2WorkshopCard, parseFutureOrderV2WorkshopProgress, resolveWorkshopPickupPin } from "./src/utils/futureOrderV2WorkshopProgress";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { formatCustomerOrderDate } from "./src/utils/futureOrderV2PaymentRecord";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const persisted = (orderId: string, persistedAt: string) => {
  const result = createPersistedFutureOrderV2({
    masterOrder: createFutureOrderV2Fixture(orderId),
    owner: { uid: "banner-owner", isAnonymous: false },
    customerOwnerUid: "banner-owner",
    persistedAt,
  });
  if (result.status !== "valid") throw new Error("Expected a valid persisted V2 order.");
  return result.value;
};

const paid = persisted("future-order-paid", "2026-09-30T12:00:00.000Z");
const unpaid = persisted("future-order-unpaid", "2026-09-29T12:00:00.000Z");
const paidMap = new Map<string, unknown>([[paid.orderId, { paid: true }]]);
const placed = `Order placed ${formatCustomerOrderDate(paid.persistedAt)}`;

const onePaid = presentCustomerDashboardBanner([paid], paidMap);
assert.ok(onePaid);
assert.equal(onePaid.message, `${placed} is paid. Production has not started.`);
assert.deepEqual(onePaid.action, { orderId: paid.orderId, label: "View details" });

const oneUnpaid = presentCustomerDashboardBanner([unpaid], new Map());
assert.ok(oneUnpaid);
assert.equal(
  oneUnpaid.message,
  `Order placed ${formatCustomerOrderDate(unpaid.persistedAt)} is waiting for payment.`,
);
assert.equal(oneUnpaid.action?.orderId, unpaid.orderId);

const twoPaid = presentCustomerDashboardBanner(
  [paid, persisted("future-order-paid-2", "2026-09-28T12:00:00.000Z")],
  new Map([
    [paid.orderId, {}],
    ["future-order-paid-2", {}],
  ]),
);
assert.ok(twoPaid);
assert.equal(twoPaid.message, "You have 2 orders. 2 paid. Production has not started.");
assert.equal(twoPaid.action, null);

const oneWaiting = presentCustomerDashboardBanner([paid, unpaid], paidMap);
assert.ok(oneWaiting);
assert.equal(oneWaiting.message, "You have 2 orders. 1 is waiting for payment.");
assert.deepEqual(oneWaiting.action, { orderId: unpaid.orderId, label: "View details" });

const sewing = {
  schemaVersion: 1 as const,
  orderId: paid.orderId,
  ownerUid: "banner-owner",
  currentStage: 3,
  status: "Pattern Drafting & Sewing on Lagos floor",
  estimatedDeliveryDate: "2026-05-30",
  pickupPin: "",
  dispatchStatus: "not_dispatched" as const,
};
const withProgress = presentCustomerDashboardBanner([paid], paidMap, new Map([[paid.orderId, sewing]]));
assert.ok(withProgress);
assert.ok(withProgress.message.includes("Pattern Drafting & Sewing on Lagos floor"));
assert.ok(withProgress.message.includes("Stage 3 of 6"));
assert.ok(withProgress.message.includes("30 May 2026"));
assert.equal(withProgress.action?.orderId, paid.orderId);

const twoWithProgress = presentCustomerDashboardBanner(
  [paid, persisted("future-order-paid-2", "2026-09-28T12:00:00.000Z")],
  new Map([[paid.orderId, {}], ["future-order-paid-2", {}]]),
  new Map([[paid.orderId, sewing]]),
);
assert.ok(twoWithProgress);
assert.equal(twoWithProgress.message, "You have 2 orders. 2 paid.");
assert.equal(twoWithProgress.action, null);

const emptyCard = presentFutureOrderV2WorkshopCard(undefined);
assert.equal(emptyCard.statusLabel, "Production has not started");
assert.equal(emptyCard.stageLabel, null);
assert.equal(emptyCard.deliveryLabel, "Not scheduled yet");
assert.equal(emptyCard.dispatchLabel, null);
const sewingCard = presentFutureOrderV2WorkshopCard(sewing);
assert.equal(sewingCard.statusLabel, sewing.status);
assert.equal(sewingCard.stageLabel, "Stage 3 of 6");
assert.equal(sewingCard.deliveryLabel, "30 May 2026");
assert.equal(sewingCard.pickupPinLabel, null);
assert.equal(sewingCard.dispatchLabel, "Not dispatched");
assert.equal(withProgress.message.includes("Dispatch:"), false);
assert.equal(withProgress.message.includes("Pickup PIN"), false);

const arrived = {
  ...sewing,
  currentStage: 6,
  status: "Arrived at Eindhoven. Ready for secure PIN pickup!",
  pickupPin: "482913",
};
const arrivedBanner = presentCustomerDashboardBanner([paid], paidMap, new Map([[paid.orderId, arrived]]));
assert.ok(arrivedBanner);
assert.ok(arrivedBanner.message.includes("Pickup PIN 482913"));
assert.equal(presentFutureOrderV2WorkshopCard(arrived).pickupPinLabel, "482913");
const arrivedWithoutPin = presentFutureOrderV2WorkshopCard({ ...arrived, pickupPin: "" });
assert.equal(arrivedWithoutPin.pickupPinLabel, null);
const hiddenEarlyPin = presentFutureOrderV2WorkshopCard({ ...sewing, pickupPin: "482913" });
assert.equal(hiddenEarlyPin.pickupPinLabel, null);
const twoAtArrival = presentCustomerDashboardBanner(
  [paid, persisted("future-order-paid-2", "2026-09-28T12:00:00.000Z")],
  new Map([[paid.orderId, {}], ["future-order-paid-2", {}]]),
  new Map([[paid.orderId, arrived]]),
);
assert.ok(twoAtArrival);
assert.equal(twoAtArrival.message, "You have 2 orders. 2 paid.");
assert.equal(twoAtArrival.message.includes("482913"), false);
assert.equal(resolveWorkshopPickupPin(3, arrived), "");
assert.equal(resolveWorkshopPickupPin(6, arrived), "482913");
assert.match(resolveWorkshopPickupPin(6, sewing), /^\d{6}$/);
assert.equal(resolveWorkshopPickupPin(6, { ...arrived, pickupPin: "" }).length, 6);
const dispatched = { ...sewing, dispatchStatus: "dispatched" as const };
assert.equal(presentFutureOrderV2WorkshopCard(dispatched).dispatchLabel, "Dispatched");
const arrivedDispatch = { ...sewing, dispatchStatus: "arrived" as const };
assert.equal(presentFutureOrderV2WorkshopCard(arrivedDispatch).dispatchLabel, "Arrived for pickup");
const { dispatchStatus: _ignoredDispatch, ...withoutDispatch } = sewing;
const parsedWithoutDispatch = parseFutureOrderV2WorkshopProgress(withoutDispatch);
assert.equal(parsedWithoutDispatch?.dispatchStatus, "not_dispatched");

assert.equal(presentCustomerDashboardBanner([{ shipment: { trackingId: "ODG-1" } }], new Map()), null);

const customer = {
  name: "Ada",
  email: "ada@example.com",
  phone: "1",
  role: "Customer",
};
const v2Only = CustomerJourneyEngine.getCurrentJourney({
  currentUser: customer as never,
  drafts: [],
  activeOrders: [{
    schemaVersion: 2,
    recordType: "future_order_v2",
    orderId: "future-order-claimed",
    customer: { email: "ada@example.com", name: "Ada" },
  }] as never,
  historicalOrders: [],
  allBatches: [],
});
assert.notEqual(v2Only.notification, "Payment received. Awaiting production start.");

const legacyAfterV2 = CustomerJourneyEngine.getCurrentJourney({
  currentUser: customer as never,
  drafts: [],
  activeOrders: [
    {
      schemaVersion: 2,
      recordType: "future_order_v2",
      orderId: "future-order-claimed",
      customer: { email: "ada@example.com", name: "Ada" },
    },
    {
      customer: { email: "ada@example.com", name: "Ada" },
      payment: { isPaid: false },
      shipment: { status: "Sewing", currentStage: 1 },
    },
  ] as never,
  historicalOrders: [],
  allBatches: [],
});
assert.equal(
  legacyAfterV2.notification,
  "Your order is pending payment. Please complete the deposit.",
);

const dashboard = readFileSync("src/components/DashboardView.tsx", "utf8");
const v2Branch = dashboard.slice(
  dashboard.indexOf("v2Banner ?"),
  dashboard.indexOf("journey.requiresAttention"),
);
assert.ok(v2Branch.includes("data-customer-dashboard-banner"));
assert.ok(v2Branch.includes("setOpenV2OrderId(v2Banner.action.orderId)"));
assert.equal(v2Branch.includes("onNavigateToTab"), false);
assert.ok(dashboard.includes("presentCustomerDashboardBanner"));
assert.ok(dashboard.includes("openOrderId={openV2OrderId}"));
assert.ok(dashboard.includes("subscribeToCustomerFutureOrderV2Workshop"));

const admin = readFileSync("src/components/DatabaseView.tsx", "utf8");
const paidAction = admin.slice(
  admin.indexOf("futureOrderV2PaymentsByOrderId.has(history.orderId)"),
  admin.indexOf("Read-only"),
);
assert.ok(paidAction.includes("data-admin-v2-workshop-progress"));
assert.ok(paidAction.includes("Update progress"));
assert.ok(admin.includes("Only a paid order can move into production."));
assert.ok(admin.includes("resolveWorkshopPickupPin"));
assert.ok(admin.includes("A pickup PIN is created when you save stage 6."));
assert.ok(admin.includes("workshopDispatchLabel"));
assert.ok(admin.includes("Arrived for pickup"));
assert.ok(admin.includes("FUTURE_ORDER_V2_WORKSHOP_COLLECTION"));
assert.equal(admin.includes("setOrders"), true);

console.log("Customer dashboard banner tests passed.");
