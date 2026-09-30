import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerFutureOrderV2List } from "./src/components/CustomerFutureOrderV2List";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import type { FutureOrderV2PaymentRecord } from "./src/utils/futureOrderV2PaymentRecord";

const OWNER_UID = "dashboard-owner";

const persistedOrder = (orderId: string, persistedAt: string) => {
  const result = createPersistedFutureOrderV2({
    masterOrder: createFutureOrderV2Fixture(orderId),
    owner: { uid: OWNER_UID, isAnonymous: false },
    customerOwnerUid: OWNER_UID,
    persistedAt,
  });
  if (result.status !== "valid") throw new Error("Expected a valid persisted V2 order.");
  return result.value;
};

const paidOrder = persistedOrder("future-order-paid", "2026-09-29T10:00:00.000Z");
const unpaidOrder = persistedOrder("future-order-unpaid", "2026-09-30T09:00:00.000Z");
const legacyOrder = {
  id: "legacy-order-1",
  batchType: "alone",
  customer: { name: "Legacy", email: "legacy@example.test" },
  style: { name: "Legacy style" },
};
const paidRecord: FutureOrderV2PaymentRecord = {
  schemaVersion: 1,
  orderId: "future-order-paid",
  ownerUid: OWNER_UID,
  paymentIntentId: "pi_dashboard_123",
  amountCents: 14000,
  currency: "eur",
  status: "succeeded",
  testMode: true,
  recordedAt: "2026-09-29T10:05:00.000Z",
};

const markup = renderToStaticMarkup(
  <CustomerFutureOrderV2List
    orders={[legacyOrder, { id: paidOrder.orderId, ...paidOrder }, unpaidOrder]}
    paymentsByOrderId={new Map([[paidRecord.orderId, paidRecord]])}
  />,
);

assert.ok(markup.includes("My orders"));
assert.ok(markup.includes("future-order-paid"), "the paid order is listed by its order ID");
assert.ok(markup.includes("future-order-unpaid"), "an unpaid saved order is listed too");
assert.match(markup, /data-customer-v2-order-paid="future-order-paid"[^>]*>Paid \(test\) €140\.00</);
assert.match(markup, /data-customer-v2-order-unpaid="future-order-unpaid"[^>]*>Awaiting payment</);
assert.equal(markup.includes('data-customer-v2-order-paid="future-order-unpaid"'), false);
assert.equal((markup.match(/data-customer-v2-order="/g) || []).length, 2, "only V2 orders are listed");
assert.equal(markup.includes("legacy-order-1"), false, "legacy orders stay in their own sections");
assert.ok(
  markup.indexOf("future-order-unpaid") < markup.indexOf("future-order-paid"),
  "newest orders come first",
);
assert.match(markup, /Total: <span[^>]*>€\d+\.\d{2}</);

assert.equal(
  renderToStaticMarkup(
    <CustomerFutureOrderV2List
      orders={[legacyOrder, { schemaVersion: 2, recordType: "future_order_v2", orderId: "broken" }]}
      paymentsByOrderId={new Map()}
    />,
  ),
  "",
  "no section when there are no valid V2 orders",
);

const dashboardSource = readFileSync("src/components/DashboardView.tsx", "utf8");
assert.match(dashboardSource, /StorageService\.subscribeToCustomerFutureOrderV2Payments/);
assert.match(dashboardSource, /<CustomerFutureOrderV2List\s+orders=\{activeOrders\}/);
const appSource = readFileSync("src/App.tsx", "utf8");
assert.match(
  appSource,
  /presentFutureOrderV2History\(o\)\.status === "not_v2" &&/,
  "a V2 order is never chosen as the legacy masterOrder",
);
const storageSource = readFileSync("src/services/storageService.ts", "utf8");
const paymentsSubscription = storageSource.slice(
  storageSource.indexOf("subscribeToCustomerFutureOrderV2Payments"),
);
assert.match(
  paymentsSubscription.slice(0, 900),
  /collection\(db, FUTURE_ORDER_V2_PAYMENT_COLLECTION\),\s*where\("ownerUid", "==", ownerUid\)/,
  "customers only query their own payment records",
);

console.log("Customer dashboard V2 order tests passed.");
