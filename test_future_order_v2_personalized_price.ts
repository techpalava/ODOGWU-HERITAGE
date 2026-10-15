import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { HttpResponse } from "./src/server/httpTypes";
import { handleFutureOrderV2PersonalizedPriceDecision } from "./src/server/futureOrderV2PersonalizedPriceDecision";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import {
  decidePersonalizedAddition,
  evaluatePersonalizedAddition,
  formatPersonalizedPriceEuros,
  parseFutureOrderV2PersonalizedPrice,
  readAcceptedPersonalizedDifferenceCents,
  readFutureOrderV2ChargeableCents,
  readPersonalizedStripeChargeCents,
  resolvePersonalizedAdditionPayable,
  type FutureOrderV2PersonalizedPriceRecord,
  type PersonalizedPriceChargeableOrder,
} from "./src/utils/futureOrderV2PersonalizedPrice";

const order = {
  pricing: {
    status: "pending",
    exactTotalCents: null,
    garmentConstructionSubtotalCents: 10000,
    postEindhovenAdjustmentCents: 0,
    components: {
      postEindhovenDelivery: { status: "separately_charged", amountCents: 0 },
      lagosToEindhovenShipping: { status: "separately_charged", amountCents: 1500 },
    },
  },
  customDetails: [
    {
      occurrenceKey: "shirt:monogram:plain",
      garmentKey: "shirt",
      optionId: "plain",
      priceStatus: "exact",
      priceCents: 500,
      personalizedText: null,
    },
    {
      occurrenceKey: "shirt:personalized_additional:personalized_additional_evaluation",
      garmentKey: "shirt",
      optionId: "personalized_additional_evaluation",
      priceStatus: "evaluation_required",
      priceCents: null,
      personalizedText: "Add a family crest on the left chest.",
    },
  ],
} satisfies PersonalizedPriceChargeableOrder;

const seeds = [
  {
    occurrenceKey: "shirt:personalized_additional:personalized_additional_evaluation",
    garmentKey: "shirt",
    optionId: "personalized_additional_evaluation",
    requirementText: "Add a family crest on the left chest.",
  },
];

const evaluated = evaluatePersonalizedAddition({
  existing: null,
  orderId: "future-order-crest",
  ownerUid: "customer-1",
  seeds,
  occurrenceKey: seeds[0].occurrenceKey,
  amountCents: 2500,
  tailorNote: "Crest is embroidered.",
  toEmail: "ada@example.com",
  orderLink: "https://heritage.example/?future_order_v2_order_id=future-order-crest",
});
assert.equal(evaluated.status, "ready");
if (evaluated.status !== "ready") throw new Error("expected a priced addition");
assert.equal(evaluated.record.lines[0].status, "price_ready");
assert.equal(evaluated.record.lines[0].pricingEvaluationRequired, false);
assert.equal(evaluated.record.lines[0].amountCents, 2500);
assert.equal(
  evaluated.notification.subject,
  "Your personalized addition is priced — Order #future-order-crest",
);
assert.match(evaluated.notification.body, /Add a family crest on the left chest/);
assert.match(evaluated.notification.body, /€25\.00/);
assert.match(evaluated.notification.body, /Crest is embroidered/);
assert.match(evaluated.notification.body, /future-order-crest/);
assert.match(evaluated.notification.body, /Accept and pay the difference/);
assert.match(evaluated.notification.body, /Decline the addition/);
assert.match(evaluated.notification.body, /email or WhatsApp/);
assert.match(evaluated.notification.body, /follow up once/);
assert.match(evaluated.notification.body, /never charge it automatically/);
assert.equal(evaluated.notification.body.includes("queued"), false);
assert.equal(evaluated.notification.status, "queued");
assert.equal("paymentIntentId" in evaluated.notification, false);
const pendingPayable = resolvePersonalizedAdditionPayable(order, evaluated.record);
assert.equal(pendingPayable.status, "payable");
if (pendingPayable.status !== "payable") throw new Error("expected a base payable");
assert.equal(pendingPayable.amountCents, 12000);
assert.equal(pendingPayable.differenceDueCents, 0);
assert.equal(readFutureOrderV2ChargeableCents(order, evaluated.record), 12000);
assert.equal(readFutureOrderV2ChargeableCents(order, null), 12000);
assert.equal(readAcceptedPersonalizedDifferenceCents(order, evaluated.record), null);
assert.equal(readAcceptedPersonalizedDifferenceCents(order, null), null);

const accepted = decidePersonalizedAddition(
  evaluated.record,
  seeds[0].occurrenceKey,
  "accepted",
);
assert.equal(accepted.status, "updated");
if (accepted.status !== "updated") throw new Error("expected accept");
assert.equal(accepted.record.lines[0].status, "accepted");
assert.equal(accepted.record.lines[0].amountCents, 2500);
const acceptedPayable = resolvePersonalizedAdditionPayable(order, accepted.record);
assert.deepEqual(acceptedPayable, {
  status: "payable",
  amountCents: 12000,
  baseCents: 12000,
  acceptedCents: 2500,
  differenceDueCents: 2500,
});
assert.equal(readFutureOrderV2ChargeableCents(order, accepted.record), 12000);
assert.equal(readAcceptedPersonalizedDifferenceCents(order, accepted.record), 2500);
assert.equal(
  readPersonalizedStripeChargeCents({
    orderId: "future-order-crest",
    order,
    record: accepted.record,
    paymentReference: "future-v2-payment-future-order-crest",
  }),
  12000,
);
assert.equal(
  readPersonalizedStripeChargeCents({
    orderId: "future-order-crest",
    order,
    record: accepted.record,
    paymentReference: "future-v2-addition-future-order-crest-2500",
  }),
  2500,
);
assert.equal(
  readPersonalizedStripeChargeCents({
    orderId: "future-order-crest",
    order,
    record: accepted.record,
    paymentReference: "future-v2-addition-future-order-crest-9999",
  }),
  null,
);
assert.equal(decidePersonalizedAddition(accepted.record, seeds[0].occurrenceKey, "accepted").status, "unchanged");

const declined = decidePersonalizedAddition(
  evaluated.record,
  seeds[0].occurrenceKey,
  "declined",
);
assert.equal(declined.status, "updated");
if (declined.status !== "updated") throw new Error("expected decline");
const declinedPayable = resolvePersonalizedAdditionPayable(order, declined.record);
assert.equal(declinedPayable.status, "payable");
if (declinedPayable.status !== "payable") throw new Error("expected a base payable");
assert.equal(declinedPayable.acceptedCents, 0);
assert.equal(declinedPayable.amountCents, 12000);
assert.equal(declinedPayable.amountCents, declinedPayable.baseCents);
assert.equal(declinedPayable.differenceDueCents, 0);
assert.equal(readAcceptedPersonalizedDifferenceCents(order, declined.record), null);
assert.equal(readFutureOrderV2ChargeableCents(order, declined.record), 12000);

const exactOrder: PersonalizedPriceChargeableOrder = {
  pricing: {
    status: "exact",
    exactTotalCents: 31400,
    garmentConstructionSubtotalCents: 30000,
    postEindhovenAdjustmentCents: 1400,
    components: {
      postEindhovenDelivery: { status: "separately_charged", amountCents: 1400 },
      lagosToEindhovenShipping: { status: "included_in_garment_construction", amountCents: null },
    },
  },
  customDetails: [
    {
      occurrenceKey: "shirt:monogram:plain",
      garmentKey: "shirt",
      optionId: "plain",
      priceStatus: "exact",
      priceCents: 0,
      personalizedText: null,
    },
  ],
};
assert.equal(readFutureOrderV2ChargeableCents(exactOrder, null), 31400);
assert.equal(readFutureOrderV2ChargeableCents(exactOrder, evaluated.record), 31400);

assert.equal(formatPersonalizedPriceEuros(2500), "€25.00");
assert.equal(parseFutureOrderV2PersonalizedPrice({ ...evaluated.record, schemaVersion: 2 }), null);

const writes: FutureOrderV2PersonalizedPriceRecord[] = [];
const response = () => {
  const state = { statusCode: 200, body: null as unknown };
  const res: HttpResponse = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    setHeader() {
      return res;
    },
    json(body) {
      state.body = body;
      return body;
    },
  };
  return { res, state };
};

const persisted = createPersistedFutureOrderV2({
  masterOrder: createFutureOrderV2Fixture("future-order-crest"),
  owner: { uid: "customer-1", isAnonymous: false },
  customerOwnerUid: "customer-1",
  persistedAt: "2026-10-15T12:00:00.000Z",
});
assert.equal(persisted.status, "valid");
if (persisted.status !== "valid") throw new Error("expected a persisted order");

{
  const { res, state } = response();
  await handleFutureOrderV2PersonalizedPriceDecision(
    {
      method: "POST",
      headers: { authorization: "Bearer customer" },
      body: {
        orderId: "future-order-crest",
        occurrenceKey: seeds[0].occurrenceKey,
        decision: "accepted",
      },
    },
    res,
    {
      getServices: () => ({
        auth: {
          async verifyIdToken() {
            return { uid: "customer-1", firebase: { sign_in_provider: "password" } };
          },
        },
        db: {},
      }),
      readOrder: async () => persisted.value,
      readPrice: async () => evaluated.record,
      writePrice: async (_db, _orderId, record) => {
        writes.push(record);
      },
    },
  );
  assert.equal(state.statusCode, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].lines[0].status, "accepted");
  assert.equal(writes[0].lines[0].amountCents, 2500);
  const body = state.body as { charged?: boolean; record?: { lines?: { status: string }[] } };
  assert.equal(body.charged, false);
  assert.equal(body.record?.lines?.[0]?.status, "accepted");
}

const rules = readFileSync("firestore.rules", "utf8");
assert.match(rules, /match \/future_order_v2_personalized_prices\/\{orderId\}/);
assert.match(rules, /match \/future_order_v2_notification_outbox\/\{notificationId\}/);
assert.match(
  readFileSync("src/components/DatabaseView.tsx", "utf8"),
  /evaluatePersonalizedAddition/,
);
assert.match(
  readFileSync("src/server/futureOrderV2StripePayment.ts", "utf8"),
  /readPersonalizedStripeChargeCents/,
);

console.log("personalized price evaluation flow ok");
