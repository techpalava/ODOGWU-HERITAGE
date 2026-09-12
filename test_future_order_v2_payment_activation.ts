import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DormantFuturePaymentReviewStep } from "./src/components/DormantFuturePaymentReviewStep";
import {
  createFutureOrderV2PaymentReviewHandoff,
  FUTURE_ORDER_V2_PAYMENT_READY_MESSAGE,
} from "./src/utils/designStudioFuturePaymentReview";
import {
  createFutureOrderV2PaymentAttempt,
  executeFutureOrderV2Payment,
  validatePreparedFutureOrderV2PaymentEligibility,
} from "./src/utils/futureOrderV2Payment";
import { createFutureOrderV2PreparationAttempt } from "./src/utils/futureOrderV2Preparation";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import type { Batch } from "./src/types";

const preparedCandidate = createFutureOrderV2Fixture("payment-activation").cartItem
  .candidate;
const preparedResult = createFutureOrderV2PreparationAttempt({
  candidate: preparedCandidate,
  ids: { cartItemId: "future-cart-payment", orderId: "future-order-payment" },
});
assert.equal(preparedResult.status, "valid");
if (preparedResult.status !== "valid") throw new Error("Expected a prepared V2 order.");
const prepared = preparedResult.attempt;

const paymentAttempt = createFutureOrderV2PaymentAttempt({ prepared });
assert.equal(paymentAttempt.status, "valid");
if (paymentAttempt.status !== "valid") throw new Error("Expected payment eligibility.");
assert.equal(paymentAttempt.attempt.orderId, prepared.orderId);
assert.equal(paymentAttempt.attempt.cartItemId, prepared.cartItemId);
assert.equal(paymentAttempt.attempt.masterOrder, prepared.masterOrder);
assert.equal(
  paymentAttempt.attempt.paymentReference,
  "future-v2-payment-future-order-payment",
);

let authorizations = 0;
const authorized = await executeFutureOrderV2Payment({
  prepared,
  existingAttempt: paymentAttempt.attempt,
  async authorize(input) {
    authorizations += 1;
    assert.equal(input.orderId, prepared.orderId);
    assert.equal(input.masterOrder, prepared.masterOrder);
    assert.equal(input.paymentReference, paymentAttempt.attempt.paymentReference);
    return { status: "authorized", providerTransactionReference: "provider-payment-1" };
  },
});
assert.equal(authorizations, 1);
assert.equal(authorized.status, "authorized");
if (authorized.status !== "authorized") throw new Error("Expected authorization.");
assert.equal(authorized.attempt, paymentAttempt.attempt);
assert.equal(authorized.providerTransactionReference, "provider-payment-1");
assert.equal(authorized.attempt.masterOrder, prepared.masterOrder);

// Payment-time eligibility is evaluated after a Community order was prepared.
// Its retained batch-7 matters; an unrelated current homepage batch-8 does
// not replace it.
const retainedBatchCandidate = createFutureOrderV2Fixture(
  "retained-batch-payment",
  undefined,
  { orderType: "Community", batchId: "batch-7" },
).cartItem.candidate;
const retainedBatchPreparedResult = createFutureOrderV2PreparationAttempt({
  candidate: retainedBatchCandidate,
  ids: {
    cartItemId: "future-cart-retained-batch",
    orderId: "future-order-retained-batch",
  },
});
assert.equal(retainedBatchPreparedResult.status, "valid");
if (retainedBatchPreparedResult.status !== "valid") {
  throw new Error("Expected retained Community order to prepare.");
}
const retainedBatchPrepared = retainedBatchPreparedResult.attempt;
const openBatch = (id: string): Batch => ({
  id,
  batchNumber: id === "batch-7" ? 7 : 8,
  name: id === "batch-7" ? "Avatars" : "Pioneers",
  startDate: "2020-01-01T00:00:00.000Z",
  endDate: "2099-01-01T00:00:00.000Z",
  duration: "Open",
  targetGarments: 40,
  currentGarments: 0,
  currentOrders: 0,
  currentCustomers: 0,
  status: "OPEN",
  allowOrders: true,
  visibility: "PUBLIC",
});
let liveBatches: readonly Batch[] = [openBatch("batch-7"), openBatch("batch-8")];
let retainedAuthorizations = 0;
const retainedOpenOutcome = await executeFutureOrderV2Payment({
  prepared: retainedBatchPrepared,
  validateBeforeAuthorization: () =>
    validatePreparedFutureOrderV2PaymentEligibility({
      prepared: retainedBatchPrepared,
      liveBatches,
    }),
  async authorize() {
    retainedAuthorizations += 1;
    return { status: "authorized", providerTransactionReference: "retained-open" };
  },
});
assert.equal(retainedOpenOutcome.status, "authorized");
assert.equal(retainedAuthorizations, 1);
liveBatches = [
  { ...openBatch("batch-7"), allowOrders: false, status: "CLOSED" },
  openBatch("batch-8"),
];
const retainedClosedOutcome = await executeFutureOrderV2Payment({
  prepared: retainedBatchPrepared,
  validateBeforeAuthorization: () =>
    validatePreparedFutureOrderV2PaymentEligibility({
      prepared: retainedBatchPrepared,
      liveBatches,
    }),
  async authorize() {
    retainedAuthorizations += 1;
    return { status: "authorized", providerTransactionReference: "must-not-run" };
  },
});
assert.equal(retainedClosedOutcome.status, "invalid");
assert.equal(retainedAuthorizations, 1, "Closed retained batch must prevent authorization.");
assert.deepEqual(retainedBatchPrepared.cartItem.candidate.orderIdentity, {
  orderType: "Community",
  batchId: "batch-7",
});

const failed = await executeFutureOrderV2Payment({
  prepared,
  existingAttempt: authorized.attempt,
  async authorize(input) {
    assert.equal(input.paymentReference, authorized.attempt.paymentReference);
    return { status: "failed", message: "Provider temporarily unavailable." };
  },
});
assert.equal(failed.status, "failed");
if (failed.status !== "failed") throw new Error("Expected retryable failure.");
assert.equal(failed.attempt.paymentReference, authorized.attempt.paymentReference);
assert.equal(failed.attempt.masterOrder, prepared.masterOrder);
assert.equal(JSON.stringify(prepared.masterOrder), JSON.stringify(authorized.attempt.masterOrder));

const handoff = createFutureOrderV2PaymentReviewHandoff(preparedCandidate, {
  status: "prepared",
  cartItemId: prepared.cartItemId,
  orderId: prepared.orderId,
});
assert.deepEqual(handoff.blockers, []);
assert.equal(handoff.payment.status, "ready");
const markup = renderToStaticMarkup(
  createElement(DormantFuturePaymentReviewStep, {
    result: handoff,
    onBack: () => undefined,
    onEditStage: () => undefined,
    onPrepareOrder: () => undefined,
    onExecutePayment: () => undefined,
  }),
);
assert.ok(markup.includes(FUTURE_ORDER_V2_PAYMENT_READY_MESSAGE));
assert.ok(markup.includes("Authorize payment"));
assert.ok(markup.includes("data-future-order-v2-payment"));

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.match(studioSource, /handleExecuteFutureOrderV2Payment/);
assert.match(studioSource, /futureOrderV2PaymentInFlightRef/);
assert.match(studioSource, /executeFutureOrderV2Payment/);
assert.match(studioSource, /validatePreparedFutureOrderV2PaymentEligibility/);
assert.match(studioSource, /validateBeforeAuthorization/);
for (const forbidden of [
  "StorageService.saveOrder",
  "createFutureOrderMasterOrderV2",
  "createPaymentIntent",
  "setCartItems([])",
]) {
  assert.equal(studioSource.includes(forbidden), false, `Forbidden V2 payment path: ${forbidden}`);
}

console.log("PASS: Task 5F-E4 activates payment only for persisted FutureOrder V2");
