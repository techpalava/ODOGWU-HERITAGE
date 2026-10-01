import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { FutureOrderV2AdminPaymentCell } from "./src/components/FutureOrderV2AdminPaymentCell";
import {
  adminOrderPaymentState,
  matchesAdminPaymentFilter,
  presentFutureOrderV2AdminPayment,
  type AdminOrderPaymentState,
} from "./src/utils/futureOrderV2AdminPayment";
import {
  formatCustomerOrderDate,
  type FutureOrderV2PaymentRecord,
} from "./src/utils/futureOrderV2PaymentRecord";

const record: FutureOrderV2PaymentRecord = {
  schemaVersion: 1,
  orderId: "future-order-admin",
  ownerUid: "admin-owner",
  paymentIntentId: "pi_3ULN2kC60p6I1AWT3Kwv3mF4",
  amountCents: 14000,
  currency: "eur",
  status: "succeeded",
  testMode: true,
  recordedAt: "2026-09-30T12:55:00.000Z",
};

const paid = presentFutureOrderV2AdminPayment(record);
assert.equal(paid.kind, "paid");
if (paid.kind !== "paid") throw new Error("Expected a paid presentation.");
assert.equal(paid.amountLabel, "€140.00");
assert.equal(paid.paidOnLabel, formatCustomerOrderDate(record.recordedAt));
assert.equal(paid.paymentIntentId, record.paymentIntentId);
assert.equal(
  paid.stripeUrl,
  `https://dashboard.stripe.com/test/payments/${record.paymentIntentId}`,
);
assert.deepEqual(presentFutureOrderV2AdminPayment(undefined), { kind: "awaiting" });

assert.equal(
  adminOrderPaymentState({ historyStatus: "not_v2", hasV2PaymentRecord: false, legacyIsPaid: undefined }),
  "awaiting",
  "A legacy order with no payment object must not be treated as paid",
);
assert.equal(
  adminOrderPaymentState({ historyStatus: "not_v2", hasV2PaymentRecord: false, legacyIsPaid: true }),
  "paid",
);
assert.equal(
  adminOrderPaymentState({ historyStatus: "valid", hasV2PaymentRecord: false, legacyIsPaid: true }),
  "awaiting",
);
assert.equal(
  adminOrderPaymentState({ historyStatus: "invalid_history", hasV2PaymentRecord: false, legacyIsPaid: true }),
  "unknown",
);

const states: AdminOrderPaymentState[] = ["paid", "awaiting", "unknown"];
for (const state of states) {
  assert.equal(matchesAdminPaymentFilter("all", state), true, `all includes ${state}`);
  assert.equal(matchesAdminPaymentFilter("paid", state), state === "paid");
  assert.equal(matchesAdminPaymentFilter("awaiting", state), state === "awaiting");
}

const paidMarkup = renderToStaticMarkup(
  <FutureOrderV2AdminPaymentCell orderId={record.orderId} record={record} />,
);
for (const expected of [
  "Paid (test) €140.00",
  formatCustomerOrderDate(record.recordedAt),
  `href="https://dashboard.stripe.com/test/payments/${record.paymentIntentId}"`,
  'target="_blank"',
  'rel="noreferrer"',
  record.paymentIntentId,
  `data-future-order-v2-paid="${record.orderId}"`,
  "data-future-order-v2-stripe-link",
]) {
  assert.ok(paidMarkup.includes(expected), `Paid cell missing: ${expected}`);
}
assert.equal(paidMarkup.includes("payment provider unavailable"), false);

const awaitingMarkup = renderToStaticMarkup(
  <FutureOrderV2AdminPaymentCell orderId="future-order-unpaid" record={undefined} />,
);
assert.ok(awaitingMarkup.includes("Awaiting payment"));
assert.ok(awaitingMarkup.includes('data-future-order-v2-awaiting="future-order-unpaid"'));
assert.equal(awaitingMarkup.includes("<a "), false, "An unpaid order has no Stripe link");
assert.equal(awaitingMarkup.includes("payment provider unavailable"), false);

const source = readFileSync("src/components/DatabaseView.tsx", "utf8");
assert.ok(source.includes("<FutureOrderV2AdminPaymentCell"));
const filterSource = source.slice(
  source.indexOf("const filteredOrders"),
  source.indexOf("const filteredPhotos"),
);
assert.ok(
  filterSource.includes("matchesAdminPaymentFilter"),
  "The orders table filters by payment state",
);
assert.ok(
  filterSource.includes("paymentIntentId"),
  "The orders search includes the Stripe reference",
);
assert.equal(
  filterSource.includes("payment provider unavailable"),
  false,
);

console.log("Future order V2 admin payment tests passed.");
