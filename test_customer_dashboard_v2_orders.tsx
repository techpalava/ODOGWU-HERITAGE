import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { CustomerFutureOrderV2Details } from "./src/components/CustomerFutureOrderV2Details";
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

const deliveredOrder = structuredClone(paidOrder) as unknown as {
  masterOrder: { cartItem: { candidate: Record<string, any> } };
};
const deliveredCandidate = deliveredOrder.masterOrder.cartItem.candidate;
deliveredCandidate.shipping.state.fulfilmentMethod = "destination_delivery";
deliveredCandidate.shipping.state.customerInformation.deliveryAddress = {
  addressLine1: "Kerkstraat 12",
  city: "Veldhoven",
  postalCode: "5504 AB",
  countryCode: "NL",
};
deliveredCandidate.measurements.entered.shared = {
  chest: { valueCm: 101.6, provenance: "customer_entered" },
};
deliveredCandidate.fabricAllocations = [
  {
    allocationId: "allocation-1",
    fabricId: "fabric-1",
    fabricCode: "ODG-001",
    fabricName: "Royal Aso Oke",
    availability: "available",
    capacityUnits: 1,
    materialPriceCents: null,
    pricingTreatment: "included_in_garment_construction",
    garmentAssignments: [
      { garmentKey: "base:shirt", code: "ODG-001", garmentType: "shirt", fabricUnits: 1 },
    ],
  },
];
const deliveredPersisted = deliveredOrder as unknown as typeof paidOrder;

const paidDetails = renderToStaticMarkup(
  <CustomerFutureOrderV2Details order={deliveredPersisted} payment={paidRecord} onClose={() => undefined} />,
);
for (const expected of [
  'role="dialog"',
  'aria-modal="true"',
  "Order placed",
  "future-order-paid",
  "Shirt Historical Style",
  "Royal Aso Oke",
  "ODG-001",
  "Shared measurements",
  "Chest",
  "40 in",
  "Deliver to an Address",
  "Kerkstraat 12",
  "5504 AB Veldhoven",
  "Ada Lovelace",
  "Garment Construction Subtotal",
  "Custom Details Subtotal",
  "Total",
  "€300.00",
  "Paid (test) €140.00",
  "pi_dashboard_123",
  "Print / Save PDF",
]) {
  assert.ok(paidDetails.includes(expected), `Paid order details missing: ${expected}`);
}
assert.equal(paidDetails.includes("Awaiting payment"), false);

const unpaidDetails = renderToStaticMarkup(
  <CustomerFutureOrderV2Details order={unpaidOrder} payment={undefined} onClose={() => undefined} />,
);
assert.ok(unpaidDetails.includes("Awaiting payment"));
assert.ok(unpaidDetails.includes("Your order is saved but has not been paid yet."));
assert.ok(unpaidDetails.includes("Pick Up in Eindhoven"));
assert.equal(unpaidDetails.includes("Payment reference"), false);
assert.equal(unpaidDetails.includes("pi_"), false);

const keyListeners = new Set<(event: { key: string }) => void>();
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  window: {
    addEventListener: (_type: string, listener: (event: { key: string }) => void) => keyListeners.add(listener),
    removeEventListener: (_type: string, listener: (event: { key: string }) => void) => keyListeners.delete(listener),
    print: () => undefined,
  },
});
let focusedCloseButton = false;
let listTree!: ReturnType<typeof create>;
act(() => {
  listTree = create(
    <CustomerFutureOrderV2List
      orders={[paidOrder, unpaidOrder]}
      paymentsByOrderId={new Map([[paidRecord.orderId, paidRecord]])}
    />,
    {
      createNodeMock: (element) =>
        element.props["data-customer-v2-order-dialog-close"]
          ? { focus: () => { focusedCloseButton = true; } }
          : null,
    },
  );
});
const dialogs = () => listTree.root.findAll((node) => node.props.role === "dialog");
const detailsButtons = listTree.root.findAll(
  (node) => node.type === "button" && typeof node.props["data-customer-v2-order-details"] === "string",
);
assert.deepEqual(
  detailsButtons.map((button) => button.props["data-customer-v2-order-details"]),
  ["future-order-unpaid", "future-order-paid"],
  "one View details button per order",
);
assert.equal(dialogs().length, 0);
act(() => detailsButtons[1].props.onClick());
assert.equal(dialogs().length, 1);
assert.equal(dialogs()[0].props["data-customer-v2-order-dialog"], "future-order-paid");
assert.equal(dialogs()[0].props["aria-modal"], "true");
assert.ok(focusedCloseButton, "the close button receives focus when the dialog opens");
act(() => {
  listTree.root.findByProps({ "data-customer-v2-order-dialog-close": true }).props.onClick();
});
assert.equal(dialogs().length, 0, "the close button closes the dialog");
act(() => detailsButtons[0].props.onClick());
assert.equal(dialogs()[0].props["data-customer-v2-order-dialog"], "future-order-unpaid");
act(() => keyListeners.forEach((listener) => listener({ key: "Escape" })));
assert.equal(dialogs().length, 0, "Escape closes the dialog");
act(() => listTree.unmount());

console.log("Customer dashboard V2 order tests passed.");
