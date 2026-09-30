import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { CustomerFutureOrderV2Details } from "./src/components/CustomerFutureOrderV2Details";
import { CustomerFutureOrderV2List } from "./src/components/CustomerFutureOrderV2List";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import type { FutureOrderV2PaymentRecord } from "./src/utils/futureOrderV2PaymentRecord";
import type { FutureOrderV2DashboardPaymentActions } from "./src/utils/futureOrderV2DashboardPayment";

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
const overlayClass = unpaidDetails.match(/^<div class="([^"]*)"/)?.[1] ?? "";
assert.ok(overlayClass.includes("overflow-y-auto"), "the overlay scrolls");
assert.equal(overlayClass.includes("items-center"), false, "the scrolling overlay never centres, so the top stays reachable");
assert.match(
  unpaidDetails,
  /<div data-customer-v2-order-dialog-frame="true" class="[^"]*min-h-full[^"]*items-center/,
  "the inner frame centres only when there is room",
);
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

// Pay now: the card field only mounts for unpaid orders when payment actions are provided.
Object.assign(globalThis, { fetch: () => new Promise(() => undefined) });
const recordFor = (orderId: string, paymentIntentId: string): FutureOrderV2PaymentRecord => ({
  ...paidRecord,
  orderId,
  paymentIntentId,
  amountCents: 30000,
});
const fakeActions = (
  authorizations: Awaited<ReturnType<FutureOrderV2DashboardPaymentActions["authorize"]>>[],
  records: Awaited<ReturnType<FutureOrderV2DashboardPaymentActions["record"]>>[],
) => {
  const calls = { authorize: 0, record: 0 };
  const actions: FutureOrderV2DashboardPaymentActions = {
    authorize: async () => authorizations[calls.authorize++],
    record: async () => records[calls.record++],
  };
  return { calls, actions };
};
const idleActions = fakeActions([], []).actions;

const payableList = renderToStaticMarkup(
  <CustomerFutureOrderV2List
    orders={[paidOrder, unpaidOrder]}
    paymentsByOrderId={new Map([[paidRecord.orderId, paidRecord]])}
    paymentActions={idleActions}
  />,
);
assert.equal((payableList.match(/data-customer-v2-order-pay-now="/g) || []).length, 1);
assert.ok(payableList.includes('data-customer-v2-order-pay-now="future-order-unpaid"'));
assert.equal(markup.includes("data-customer-v2-order-pay-now"), false, "no Pay now without payment actions");

const payableDetails = renderToStaticMarkup(
  <CustomerFutureOrderV2Details order={unpaidOrder} payment={undefined} onClose={() => undefined} paymentActions={idleActions} />,
);
assert.ok(payableDetails.includes("data-future-order-v2-card"));
assert.equal((payableDetails.match(/data-customer-v2-order-pay="true"/g) || []).length, 1, "exactly one Pay button");
assert.match(payableDetails, /Pay €300\.00/);
assert.equal(unpaidDetails.includes("data-future-order-v2-card"), false, "read-only without payment actions");
const paidWithActions = renderToStaticMarkup(
  <CustomerFutureOrderV2Details order={paidOrder} payment={paidRecord} onClose={() => undefined} paymentActions={idleActions} />,
);
for (const hidden of ["data-future-order-v2-card", "data-customer-v2-order-pay=", "data-customer-v2-order-retry-record"]) {
  assert.equal(paidWithActions.includes(hidden), false, `A paid order never offers: ${hidden}`);
}

const mountPayableDetails = (actions: FutureOrderV2DashboardPaymentActions) => {
  let tree!: ReturnType<typeof create>;
  const events = { closed: 0, successFocused: 0 };
  act(() => {
    tree = create(
      <CustomerFutureOrderV2Details
        order={unpaidOrder}
        payment={undefined}
        onClose={() => { events.closed += 1; }}
        paymentActions={actions}
      />,
      {
        createNodeMock: (element) =>
          element.props["data-customer-v2-order-pay-success"]
            ? { focus: () => { events.successFocused += 1; }, scrollIntoView: () => undefined }
            : null,
      },
    );
  });
  const payButtons = () =>
    tree.root.findAll((node) => node.type === "button" && node.props["data-customer-v2-order-pay"] === true);
  const retryButtons = () =>
    tree.root.findAll((node) => node.type === "button" && node.props["data-customer-v2-order-retry-record"] === true);
  const alerts = () =>
    tree.root.findAll((node) => node.type === "div" && node.props["data-future-order-v2-payment-error"] === true);
  const successPanels = () =>
    tree.root.findAll((node) => node.type === "div" && node.props["data-customer-v2-order-pay-success"] === true);
  const text = () => JSON.stringify(tree.toJSON());
  return { tree, events, payButtons, retryButtons, alerts, successPanels, text };
};

const happy = fakeActions(
  [{ status: "authorized", providerTransactionReference: "pi_pay_now_ok" }],
  [{ status: "recorded", record: recordFor("future-order-unpaid", "pi_pay_now_ok") }],
);
const happyView = mountPayableDetails(happy.actions);
assert.equal(happyView.payButtons().length, 1);
await act(async () => {
  await happyView.payButtons()[0].props.onClick();
});
assert.deepEqual(happy.calls, { authorize: 1, record: 1 });
assert.ok(happyView.text().includes("pi_pay_now_ok"), "the payment reference is shown straight away");
assert.match(happyView.text(), /Paid \(test\) /);
assert.equal(happyView.payButtons().length, 0, "a paid order cannot be paid again");
assert.equal(happyView.successPanels().length, 1, "a clear success panel replaces the pay controls");
assert.match(happyView.text(), /Payment successful/);
assert.match(happyView.text(), /€300\.00/);
assert.match(happyView.text(), /paid\. Reference/);
assert.equal(happyView.events.successFocused, 1, "the success panel receives focus");
assert.equal(happyView.alerts().length, 0);
act(() => {
  happyView.tree.root.findByProps({ "data-customer-v2-order-pay-done": true }).props.onClick();
});
assert.equal(happyView.events.closed, 1, "Done closes the window");
act(() => happyView.tree.unmount());

const declinedPay = fakeActions([{ status: "failed", message: "Your card was declined." }], []);
const declinedView = mountPayableDetails(declinedPay.actions);
await act(async () => {
  await declinedView.payButtons()[0].props.onClick();
});
assert.equal(declinedView.alerts().length, 1, "a decline shows a prominent alert");
assert.equal(declinedView.alerts()[0].props.role, "alert");
assert.ok(declinedView.text().includes("Payment not completed"));
assert.ok(declinedView.text().includes("Your card was declined."));
assert.equal(declinedView.successPanels().length, 0);
assert.equal(declinedView.payButtons().length, 1, "a declined card leaves the Pay button available");
assert.equal(declinedPay.calls.record, 0);
act(() => declinedView.tree.unmount());

const saveFailing = fakeActions(
  [{ status: "authorized", providerTransactionReference: "pi_pay_now_saved_later" }],
  [
    { status: "failed", message: "Payment received, but saving it to your order failed." },
    { status: "recorded", record: recordFor("future-order-unpaid", "pi_pay_now_saved_later") },
  ],
);
const saveFailView = mountPayableDetails(saveFailing.actions);
await act(async () => {
  await saveFailView.payButtons()[0].props.onClick();
});
assert.ok(saveFailView.text().includes("saving it to your order failed"));
assert.equal(saveFailView.alerts().length, 1);
assert.ok(saveFailView.text().includes("Payment received, not saved yet"));
assert.equal(saveFailView.payButtons().length, 0, "a received payment is never offered for a second charge");
assert.equal(saveFailView.retryButtons().length, 1);
await act(async () => {
  await saveFailView.retryButtons()[0].props.onClick();
});
assert.deepEqual(saveFailing.calls, { authorize: 1, record: 2 }, "Retry saving never charges again");
assert.ok(saveFailView.text().includes("pi_pay_now_saved_later"));
assert.equal(saveFailView.successPanels().length, 1, "a saved retry ends in the success panel");
assert.equal(saveFailView.alerts().length, 0);
act(() => saveFailView.tree.unmount());

console.log("Customer dashboard V2 order tests passed.");
