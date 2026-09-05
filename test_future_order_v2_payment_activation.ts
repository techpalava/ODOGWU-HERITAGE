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
} from "./src/utils/futureOrderV2Payment";
import { createFutureOrderV2PreparationAttempt } from "./src/utils/futureOrderV2Preparation";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

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
for (const forbidden of [
  "StorageService.saveOrder",
  "createFutureOrderMasterOrderV2",
  "createPaymentIntent",
  "setCartItems([])",
]) {
  assert.equal(studioSource.includes(forbidden), false, `Forbidden V2 payment path: ${forbidden}`);
}

console.log("PASS: Task 5F-E4 activates payment only for persisted FutureOrder V2");
