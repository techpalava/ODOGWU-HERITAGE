import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DormantFuturePaymentReviewStep } from "./src/components/DormantFuturePaymentReviewStep";
import {
  FUTURE_ORDER_V2_PAYMENT_READY_MESSAGE,
  createFutureOrderV2PaymentReviewHandoff,
} from "./src/utils/designStudioFuturePaymentReview";
import {
  areFutureOrderV2CandidatesSemanticallyEqual,
  createFutureOrderV2PreparationAttempt,
  createFutureOrderV2PreparationIds,
  prepareFutureOrderV2Submission,
  resolveFutureOrderV2ReviewedCandidate,
} from "./src/utils/futureOrderV2Preparation";
import {
  createPersistedFutureOrderV2,
  type PersistFutureOrderV2Result,
} from "./src/utils/futureOrderV2PersistenceContract";
import type {
  FutureOrderCandidateBlocker,
  FutureOrderCandidateV2,
} from "./src/utils/futureOrderCandidate";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const OWNER_UID = "payment-review-owner";
const candidate = createFutureOrderV2Fixture("review-fixture").cartItem
  .candidate;
const fresh = { status: "valid" as const, candidate, blockers: [] as const };
const ids = createFutureOrderV2PreparationIds(() => "stable-uuid");
assert.deepEqual(ids, {
  cartItemId: "future-cart-stable-uuid",
  orderId: "future-order-stable-uuid",
});
const createdAttempt = createFutureOrderV2PreparationAttempt({ candidate, ids });
assert.equal(createdAttempt.status, "valid");
if (createdAttempt.status !== "valid") throw new Error("Expected valid preparation");
const attempt = createdAttempt.attempt;
assert.equal(attempt.cartItem.schemaVersion, 2);
assert.equal(attempt.masterOrder.schemaVersion, 2);
assert.deepEqual(attempt.masterOrder.cartItem.candidate, candidate);
assert.equal(JSON.stringify(attempt.masterOrder).includes("selectedStyleId"), false);
assert.equal(attempt.masterOrder.cartItem.candidate.occurrenceStyleSnapshots.length, 3);
assert.deepEqual(
  attempt.masterOrder.cartItem.candidate.occurrenceStyleSnapshots.map(
    (snapshot) => snapshot.occurrence.garmentKey,
  ),
  ["base:shirt", "additional:shirt:1", "additional:shirt:2"],
);

const mustNotPersist = async (): Promise<PersistFutureOrderV2Result> => {
  throw new Error("Persistence must not run.");
};
assert.equal(
  (
    await prepareFutureOrderV2Submission({
      reviewed: candidate,
      fresh,
      identity: null,
      persist: mustNotPersist,
    })
  ).status,
  "authentication_required",
);
assert.equal(
  (
    await prepareFutureOrderV2Submission({
      reviewed: candidate,
      fresh,
      identity: { uid: OWNER_UID, isAnonymous: true },
      persist: mustNotPersist,
    })
  ).status,
  "authentication_required",
);

const invalidBlocker: FutureOrderCandidateBlocker = {
  code: "DESIGN_STYLE_ASSIGNMENT_INVALID",
  stage: "design_style",
  message: "Design Style assignments are no longer valid.",
};
assert.deepEqual(
  await prepareFutureOrderV2Submission({
    reviewed: candidate,
    fresh: { status: "blocked", candidate: null, blockers: [invalidBlocker] },
    identity: { uid: OWNER_UID, isAnonymous: false },
    persist: mustNotPersist,
  }),
  { status: "invalid_current", blockers: [invalidBlocker] },
);

for (const mutate of [
  (value: FutureOrderCandidateV2) => {
    (value.occurrenceStyleSnapshots[0]!.catalogue as { name: string }).name =
      "Changed catalogue style";
  },
  (value: FutureOrderCandidateV2) => {
    (value.measurements as { inputFingerprint: string }).inputFingerprint =
      "changed-measurement";
  },
  (value: FutureOrderCandidateV2) => {
    (
      value.shipping.state.customerInformation as { fullName: string }
    ).fullName = "Changed customer";
  },
  (value: FutureOrderCandidateV2) => {
    (value.pricing as { exactTotalCents: number }).exactTotalCents = 99999;
  },
]) {
  const changed = structuredClone(candidate) as FutureOrderCandidateV2;
  mutate(changed);
  assert.equal(areFutureOrderV2CandidatesSemanticallyEqual(candidate, changed), false);
  assert.deepEqual(
    resolveFutureOrderV2ReviewedCandidate({
      reviewed: candidate,
      fresh: { status: "valid", candidate: changed, blockers: [] },
    }),
    { status: "review_refresh_required", candidate: changed },
  );
  assert.equal(
    (
      await prepareFutureOrderV2Submission({
        reviewed: candidate,
        fresh: { status: "valid", candidate: changed, blockers: [] },
        identity: { uid: OWNER_UID, isAnonymous: false },
        persist: mustNotPersist,
      })
    ).status,
    "review_refresh_required",
  );
}

let successfulCalls = 0;
const created = await prepareFutureOrderV2Submission({
  reviewed: candidate,
  fresh,
  identity: { uid: OWNER_UID, isAnonymous: false },
  existingAttempt: attempt,
  async persist(input) {
    successfulCalls += 1;
    assert.equal(input.customerOwnerUid, OWNER_UID);
    assert.deepEqual(input.masterOrder, attempt.masterOrder);
    const envelope = createPersistedFutureOrderV2({
      masterOrder: input.masterOrder,
      owner: { uid: OWNER_UID, isAnonymous: false },
      customerOwnerUid: OWNER_UID,
      persistedAt: "2026-09-05T12:00:00.000Z",
    });
    assert.equal(envelope.status, "valid");
    if (envelope.status !== "valid") throw new Error("Expected V2 envelope");
    return { status: "created", value: envelope.value };
  },
});
assert.equal(successfulCalls, 1);
assert.equal(created.status, "prepared");
assert.equal(created.status === "prepared" && created.attempt.orderId, ids.orderId);

const retryEnvelope = createPersistedFutureOrderV2({
  masterOrder: attempt.masterOrder,
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
  persistedAt: "2026-09-05T12:00:00.000Z",
});
assert.equal(retryEnvelope.status, "valid");
if (retryEnvelope.status !== "valid") throw new Error("Expected retry envelope");
let retryCalls = 0;
const ambiguous = await prepareFutureOrderV2Submission({
  reviewed: candidate,
  fresh,
  identity: { uid: OWNER_UID, isAnonymous: false },
  existingAttempt: attempt,
  async persist() {
    retryCalls += 1;
    throw new Error("response lost after commit");
  },
});
assert.equal(ambiguous.status, "persistence_failed");
if (ambiguous.status !== "persistence_failed") throw new Error("Expected retry state");
const retry = await prepareFutureOrderV2Submission({
  reviewed: candidate,
  fresh,
  identity: { uid: OWNER_UID, isAnonymous: false },
  existingAttempt: ambiguous.attempt,
  async persist(input) {
    retryCalls += 1;
    assert.equal(input.masterOrder.orderId, ids.orderId);
    assert.deepEqual(input.masterOrder, attempt.masterOrder);
    return { status: "already_persisted", value: retryEnvelope.value };
  },
});
assert.equal(retryCalls, 2);
assert.equal(retry.status, "prepared");
assert.equal(retry.status === "prepared" && retry.result.status, "already_persisted");

const conflict = await prepareFutureOrderV2Submission({
  reviewed: candidate,
  fresh,
  identity: { uid: OWNER_UID, isAnonymous: false },
  existingAttempt: attempt,
  async persist() {
    return { status: "conflict", code: "ORDER_ID_PAYLOAD_CONFLICT" };
  },
});
assert.equal(conflict.status, "persistence_failed");
assert.equal(conflict.status === "persistence_failed" && conflict.attempt.orderId, ids.orderId);

const preparedHandoff = createFutureOrderV2PaymentReviewHandoff(candidate, {
  status: "prepared",
  cartItemId: ids.cartItemId,
  orderId: ids.orderId,
});
assert.deepEqual(preparedHandoff.blockers, []);
assert.equal(preparedHandoff.payment.status, "ready");
const markup = renderToStaticMarkup(
  createElement(DormantFuturePaymentReviewStep, {
    result: preparedHandoff,
    onBack: () => undefined,
    onEditStage: () => undefined,
    onPrepareOrder: () => undefined,
    onExecutePayment: () => undefined,
  }),
);
assert.ok(markup.includes(FUTURE_ORDER_V2_PAYMENT_READY_MESSAGE));
assert.ok(markup.includes(ids.orderId));
assert.ok(markup.includes("Authorize payment"));

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.match(studioSource, /buildCurrentFutureOrderCandidateV2\(\)/);
assert.match(studioSource, /prepareFutureOrderV2Submission/);
assert.match(studioSource, /futureOrderV2PreparationInFlightRef/);
assert.match(studioSource, /persistFutureOrderV2/);
for (const forbidden of [
  "StorageService.saveOrder",
  "createPaymentIntent",
  "processPayment",
  "payment gateway",
]) {
  assert.equal(studioSource.includes(forbidden), false, `Forbidden path: ${forbidden}`);
}

console.log("PASS: Task 5F-E3 V2 payment review preparation lifecycle");
