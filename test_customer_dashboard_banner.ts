import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CustomerJourneyEngine } from "./src/engine/CustomerJourneyEngine";
import { presentCustomerDashboardBanner } from "./src/utils/customerDashboardBanner";
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

console.log("Customer dashboard banner tests passed.");
