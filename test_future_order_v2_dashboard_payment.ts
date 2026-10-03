import assert from "node:assert/strict";
import type { FutureOrderV2PaymentRecordResult } from "./src/services/futureOrderV2PaymentRecordClient";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import type {
  FutureOrderV2PaymentAttempt,
  FutureOrderV2PaymentAuthorizationResult,
} from "./src/utils/futureOrderV2Payment";
import {
  createFutureOrderV2DashboardPaymentAttempt,
  payFutureOrderV2FromDashboard,
  retryFutureOrderV2DashboardRecord,
} from "./src/utils/futureOrderV2DashboardPayment";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";

const OWNER_UID = "dashboard-payer";
const persisted = createPersistedFutureOrderV2({
  masterOrder: createFutureOrderV2Fixture("future-order-dashboard-pay"),
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
  persistedAt: "2026-09-30T09:00:00.000Z",
});
if (persisted.status !== "valid") throw new Error("Expected a valid persisted V2 order.");
const order = persisted.value;

const attempt = createFutureOrderV2DashboardPaymentAttempt(order);
assert.equal(attempt.orderId, "future-order-dashboard-pay");
assert.equal(attempt.paymentReference, "future-v2-payment-future-order-dashboard-pay");
assert.equal(attempt.cartItemId, order.masterOrder.cartItem.cartItemId);
assert.equal(attempt.masterOrder, order.masterOrder, "the saved order snapshot is charged as-is");

const recorded = (paymentIntentId: string): FutureOrderV2PaymentRecordResult => ({
  status: "recorded",
  record: {
    schemaVersion: 1,
    orderId: order.orderId,
    ownerUid: OWNER_UID,
    paymentIntentId,
    amountCents: 30000,
    currency: "eur",
    status: "succeeded",
    testMode: true,
    recordedAt: "2026-09-30T09:05:00.000Z",
  },
});

const createFakes = (
  authorizations: FutureOrderV2PaymentAuthorizationResult[],
  records: FutureOrderV2PaymentRecordResult[],
) => {
  const authorized: FutureOrderV2PaymentAttempt[] = [];
  const recordedCalls: { orderId: string; paymentIntentId: string }[] = [];
  return {
    authorized,
    recordedCalls,
    authorize: async (input: FutureOrderV2PaymentAttempt) => {
      authorized.push(input);
      return authorizations[authorized.length - 1];
    },
    record: async (input: { orderId: string; paymentIntentId: string }) => {
      recordedCalls.push(input);
      return records[recordedCalls.length - 1];
    },
  };
};

// Paid path: one charge, one record.
const paid = createFakes(
  [{ status: "authorized", providerTransactionReference: "pi_dashboard_ok" }],
  [recorded("pi_dashboard_ok")],
);
const paidOutcome = await payFutureOrderV2FromDashboard({ order, authorize: paid.authorize, record: paid.record });
assert.equal(paidOutcome.status, "paid");
assert.equal(paid.authorized.length, 1);
assert.deepEqual(paid.recordedCalls, [{ orderId: order.orderId, paymentIntentId: "pi_dashboard_ok" }]);

// Declined, then retried: the same payment reference, recorded only on success.
const declined = createFakes(
  [
    { status: "failed", message: "Your card was declined." },
    { status: "authorized", providerTransactionReference: "pi_dashboard_retry" },
  ],
  [recorded("pi_dashboard_retry")],
);
const declinedOutcome = await payFutureOrderV2FromDashboard({ order, authorize: declined.authorize, record: declined.record });
assert.deepEqual(declinedOutcome, { status: "failed", message: "Your card was declined." });
assert.equal(declined.recordedCalls.length, 0);
const retriedOutcome = await payFutureOrderV2FromDashboard({ order, authorize: declined.authorize, record: declined.record });
assert.equal(retriedOutcome.status, "paid");
assert.deepEqual(
  declined.authorized.map((input) => input.paymentReference),
  ["future-v2-payment-future-order-dashboard-pay", "future-v2-payment-future-order-dashboard-pay"],
  "Stripe reuses one idempotent payment for the retry",
);
assert.equal(declined.recordedCalls.length, 1);

// A thrown authorization is reported as a safe retry, never as paid.
const thrown = await payFutureOrderV2FromDashboard({
  order,
  authorize: async () => {
    throw new Error("network");
  },
  record: async () => recorded("pi_never"),
});
assert.equal(thrown.status, "failed");

// iDEAL redirects away before recording; the dashboard resumes after return.
const idealRedirect = createFakes([{ status: "redirecting" }], []);
const idealOutcome = await payFutureOrderV2FromDashboard({
  order,
  authorize: idealRedirect.authorize,
  record: idealRedirect.record,
});
assert.equal(idealOutcome.status, "redirecting");
assert.equal(idealRedirect.recordedCalls.length, 0);

// The charge succeeds but saving fails; retrying saves without charging again.
const saveFails = createFakes(
  [{ status: "authorized", providerTransactionReference: "pi_dashboard_saved_later" }],
  [
    { status: "failed", message: "Payment received, but saving it to your order failed." },
    recorded("pi_dashboard_saved_later"),
  ],
);
const saveFailedOutcome = await payFutureOrderV2FromDashboard({ order, authorize: saveFails.authorize, record: saveFails.record });
assert.deepEqual(saveFailedOutcome, {
  status: "record_failed",
  paymentIntentId: "pi_dashboard_saved_later",
  message: "Payment received, but saving it to your order failed.",
});
const savedOutcome = await retryFutureOrderV2DashboardRecord({
  orderId: order.orderId,
  paymentIntentId: "pi_dashboard_saved_later",
  record: saveFails.record,
});
assert.equal(savedOutcome.status, "paid");
assert.equal(saveFails.authorized.length, 1, "retrying the save never charges again");
assert.equal(saveFails.recordedCalls.length, 2);

console.log("Dashboard V2 payment tests passed.");
