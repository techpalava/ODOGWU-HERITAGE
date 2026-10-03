import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { FutureOrderV2AdminPaymentCell } from "./src/components/FutureOrderV2AdminPaymentCell";
import {
  adminOrderPaymentState,
  matchesAdminPaymentFilter,
  presentFutureOrderV2AdminPayment,
  summarizeAdminDocumentationOrders,
  type AdminOrderPaymentState,
} from "./src/utils/futureOrderV2AdminPayment";
import {
  formatCustomerOrderDate,
  type FutureOrderV2PaymentRecord,
} from "./src/utils/futureOrderV2PaymentRecord";
import {
  applyCustomerDetailsToMatchingOrders,
  ensureLegacyOrderEditorShape,
  formatAdminShippingStatus,
  presentLegacyMasterOrderRow,
  replaceOrderByTrackingId,
} from "./src/utils/masterOrderAdmin";
import {
  PRODUCTION_MANIFEST_HEADERS,
  buildProductionManifestCsv,
} from "./src/utils/productionManifestCsv";

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

const summary = summarizeAdminDocumentationOrders([
  { schemaVersion: 2, recordType: "future_order_v2", orderId: "future-order-admin" },
  { customer: { email: "member@example.com" } },
  {
    shipment: { currentStage: 1, status: "Pattern Drafting" },
    payment: { isPaid: true, subtotal: 195, deposit: 97.5, remaining: 97.5, secondPaymentStatus: "unpaid" },
  },
  {
    shipment: { currentStage: 6, status: "Cancelled by customer" },
    payment: { isPaid: false, subtotal: 40, deposit: 10, remaining: 30, secondPaymentStatus: "unpaid" },
  },
]);
assert.equal(summary.pending, 1, "A V2 order without shipment must not be counted or crash the panel");
assert.equal(summary.completed, 1);
assert.equal(summary.cancelled, 1);
assert.equal(summary.completedPayments, 205);
assert.equal(summary.pendingPayments, 97.5 + 30);
assert.equal(summary.outstandingBalance, 97.5 + 30);

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
  "Stripe:",
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
  filterSource.includes("getFutureOrderV2ProviderTransactionId"),
  "The orders search includes the payment provider reference",
);
assert.equal(
  filterSource.includes("payment provider unavailable"),
  false,
);

const v2Order = { schemaVersion: 2, recordType: "future_order_v2", orderId: "future-order-admin" };
const legacyOrder = {
  shipment: { trackingId: "ODG-1", currentStage: 3, status: "Sewing" },
  customer: { name: "Ada", email: "ada@example.com" },
  payment: { isPaid: true, subtotal: 195, date: "1 Oct 2026" },
  garment: { totalPrice: 195, type: "Shirt" },
  style: { name: "Senator" },
  fabric: { name: "Ankara", code: "ODG-001", colorHex: "#111111" },
};
const incompleteOrder = { customer: { email: "ada@example.com" } };
const replaced = replaceOrderByTrackingId<unknown>(
  [v2Order, legacyOrder, incompleteOrder],
  "ODG-1",
  { ...legacyOrder, specialInstructions: "Loose fit" },
);
assert.equal(replaced[0], v2Order, "A V2 order without shipment stays untouched");
assert.equal((replaced[1] as { specialInstructions?: string }).specialInstructions, "Loose fit");
assert.equal(replaced[2], incompleteOrder);

const renamed = applyCustomerDetailsToMatchingOrders(
  [v2Order, incompleteOrder, { customer: { email: "other@example.com", name: "Other" } }],
  { email: "ADA@example.com", name: "Ada Lovelace", phone: "1", location: "Eindhoven" },
);
assert.equal(renamed[0], v2Order);
assert.equal((renamed[1] as { customer: { name: string } }).customer.name, "Ada Lovelace");
assert.equal((renamed[2] as { customer: { name: string } }).customer.name, "Other");

const blankRow = presentLegacyMasterOrderRow(incompleteOrder);
assert.equal(blankRow.trackingId, "—");
assert.equal(blankRow.paymentLabel, "Unpaid");
assert.equal(blankRow.stage, 1);
assert.equal(blankRow.canMutate, false);
assert.equal(blankRow.totalLabel, "0.00");
const editor = ensureLegacyOrderEditorShape(incompleteOrder);
assert.equal((editor.shipment as { trackingId: string }).trackingId, "");
assert.equal((editor.shipment as { currentStage: number }).currentStage, 1);
assert.equal((editor.fabric as { code: string }).code, "");
assert.equal((editor.style as { id: string }).id, "");
assert.equal(formatAdminShippingStatus(undefined), "—");
assert.equal(formatAdminShippingStatus("READY_FOR_PICKUP"), "READY FOR PICKUP");

const csv = buildProductionManifestCsv([
  legacyOrder,
  v2Order,
  { schemaVersion: 2, recordType: "future_order_v2" },
]);
const csvLines = csv.split("\n");
assert.equal(csvLines.length, 4);
assert.equal(csvLines[0].split(",").length, PRODUCTION_MANIFEST_HEADERS.length);
assert.ok(csvLines[1].includes('"ODG-1"'));
assert.ok(csvLines[1].includes('"Ada"'));
assert.ok(csvLines[2].includes('"future-order-admin"'));
assert.ok(csvLines[2].includes('"N/A"'));
assert.equal(csvLines[2].split(",").length, PRODUCTION_MANIFEST_HEADERS.length);
assert.equal(csvLines[3].split(",").length, PRODUCTION_MANIFEST_HEADERS.length);

assert.ok(source.includes("StorageService.saveOrder"), "Sync writes the order");
assert.ok(source.includes("replaceOrderByTrackingId"));
assert.ok(source.includes("applyCustomerDetailsToMatchingOrders"));
assert.ok(source.includes("presentLegacyMasterOrderRow"));
assert.ok(source.includes("ensureLegacyOrderEditorShape"));
assert.ok(source.includes("formatAdminShippingStatus"));
assert.ok(source.includes("buildProductionManifestCsv"));
assert.ok(source.includes("editingItem.shipment?.trackingId"));
assert.equal(source.includes("o.shipment.trackingId"), false);
assert.equal(source.includes("o.customer.email"), false);
assert.equal(source.includes("/api/production-manifest"), false);
assert.equal(source.includes("history.shippingStatus.replaceAll"), false);

console.log("Future order V2 admin payment tests passed.");
