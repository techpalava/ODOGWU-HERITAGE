import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { HttpResponse } from "./src/server/httpTypes";
import { CustomerFutureOrderV2Details } from "./src/components/CustomerFutureOrderV2Details";
import { CustomerFutureOrderV2List } from "./src/components/CustomerFutureOrderV2List";
import { FutureOrderV2AdminPaymentCell } from "./src/components/FutureOrderV2AdminPaymentCell";
import { PersonalizedAdditionContactScript } from "./src/components/PersonalizedAdditionContactScript";
import { handleFutureOrderV2PersonalizedPriceDecision } from "./src/server/futureOrderV2PersonalizedPriceDecision";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { buildProductionManifestCsv } from "./src/utils/productionManifestCsv";
import {
  formatFutureOrderV2PaidAmount,
  type FutureOrderV2PaymentRecord,
} from "./src/utils/futureOrderV2PaymentRecord";
import { createCatalogueAuthoritativeFutureOrderV2Fixture, createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import {
  applyConfirmedAdditionPayment,
  contactScriptForPricedLine,
  decidePersonalizedAddition,
  evaluatePersonalizedAddition,
  formatPersonalizedPriceEuros,
  parseFutureOrderV2PersonalizedPrice,
  presentPersonalizedAdditionSettlement,
  readAcceptedPersonalizedDifferenceCents,
  readFutureOrderV2ChargeableCents,
  readPersonalizedStripeChargeCents,
  reportedPaidTotalCents,
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
  customerName: "Ada Lovelace",
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
assert.match(evaluated.notification.body, /Hi Ada Lovelace/);
assert.match(evaluated.notification.body, /Add a family crest on the left chest/);
assert.match(evaluated.notification.body, /€25\.00/);
assert.match(evaluated.notification.body, /Crest is embroidered/);
assert.match(evaluated.notification.body, /How to accept/);
assert.match(evaluated.notification.body, /Follow-up reminder/);
assert.equal(evaluated.record.lines[0].contactMessage.includes("Ada Lovelace"), true);
assert.equal(evaluated.record.lines[0].contactFollowUp.includes("one follow-up"), true);
assert.equal(evaluated.record.lines[0].contactMessage.includes("mailto:"), false);
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

const unpaidAcceptedSettlement = presentPersonalizedAdditionSettlement(order, accepted.record);
assert.equal(unpaidAcceptedSettlement.additionSettled, false);
assert.equal(unpaidAcceptedSettlement.paidAdditionCents, 0);
assert.deepEqual(unpaidAcceptedSettlement.additionPaymentReferences, []);
assert.equal(unpaidAcceptedSettlement.customDetailsDisplayCents, null);
assert.equal(
  reportedPaidTotalCents({ basePaymentCents: 7700, settlement: unpaidAcceptedSettlement }),
  7700,
);
const declinedSettlement = presentPersonalizedAdditionSettlement(order, declined.record);
assert.equal(declinedSettlement.additionSettled, false);
assert.equal(
  reportedPaidTotalCents({ basePaymentCents: 7700, settlement: declinedSettlement }),
  7700,
);
assert.equal(
  applyConfirmedAdditionPayment(declined.record, {
    amountCents: 2500,
    paymentIntentId: "pi_declined_addition_1",
    recordedAt: "2026-10-18T00:00:00.000Z",
  }).status,
  "rejected",
);
assert.equal(
  applyConfirmedAdditionPayment(evaluated.record, {
    amountCents: 2500,
    paymentIntentId: "pi_unaccepted_addition_1",
    recordedAt: "2026-10-18T00:00:00.000Z",
  }).status,
  "rejected",
);
assert.equal(
  applyConfirmedAdditionPayment(accepted.record, {
    amountCents: 999,
    paymentIntentId: "pi_wrong_addition_1",
    recordedAt: "2026-10-18T00:00:00.000Z",
  }).status,
  "rejected",
);
const confirmed = applyConfirmedAdditionPayment(accepted.record, {
  amountCents: 2500,
  paymentIntentId: "pi_addition_confirmed_1",
  recordedAt: "2026-10-18T00:00:00.000Z",
});
assert.equal(confirmed.status, "recorded");
if (confirmed.status !== "recorded") throw new Error("expected a confirmed addition payment");
assert.equal(confirmed.record.additionPaidCents, 2500);
assert.equal(confirmed.record.additionPayments[0]?.paymentIntentId, "pi_addition_confirmed_1");
const paidSettlement = presentPersonalizedAdditionSettlement(order, confirmed.record);
assert.equal(paidSettlement.additionSettled, true);
assert.equal(paidSettlement.paidAdditionCents, 2500);
assert.deepEqual(paidSettlement.additionPaymentReferences, ["pi_addition_confirmed_1"]);
assert.equal(paidSettlement.customDetailsDisplayCents, 3000);
assert.equal(reportedPaidTotalCents({ basePaymentCents: 12000, settlement: paidSettlement }), 14500);
assert.equal(
  applyConfirmedAdditionPayment(confirmed.record, {
    amountCents: 2500,
    paymentIntentId: "pi_addition_confirmed_1",
    recordedAt: "2026-10-18T00:00:00.000Z",
  }).status,
  "already_recorded",
);
const legacySource: Record<string, unknown> = {
  ...accepted.record,
  additionPaidCents: 2500,
  additionPaymentIntentId: "pi_legacy_addition_1",
};
delete legacySource.additionPayments;
const legacyPaid = parseFutureOrderV2PersonalizedPrice(legacySource);
assert.equal(legacyPaid?.additionPayments[0]?.paymentIntentId, "pi_legacy_addition_1");
assert.equal(legacyPaid?.additionPaidCents, 2500);
const legacySettlement = presentPersonalizedAdditionSettlement(order, legacyPaid);
assert.equal(legacySettlement.additionSettled, true);
assert.equal(reportedPaidTotalCents({ basePaymentCents: 7700, settlement: legacySettlement }), 10200);

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
const databaseView = readFileSync("src/components/DatabaseView.tsx", "utf8");
assert.match(databaseView, /evaluatePersonalizedAddition/);
assert.match(databaseView, /customerName:/);
assert.match(databaseView, /PersonalizedAdditionContactScript/);
assert.match(databaseView, /data-admin-v2-saved-contact-script/);
assert.match(databaseView, /presentPersonalizedAdditionSettlement/);
const saveStart = databaseView.indexOf("const handleSaveV2PersonalizedPrice");
const saveEnd = databaseView.indexOf("const handleDeleteOrder");
const saveHandler = databaseView.slice(saveStart, saveEnd);
assert.equal(saveHandler.includes("setEditingType(null)"), false);
assert.match(saveHandler, /contactMessage/);
assert.doesNotMatch(saveHandler, /mailto:|sendMail|twilio|whatsapp\.com/i);
assert.match(
  readFileSync("src/server/futureOrderV2StripePayment.ts", "utf8"),
  /readPersonalizedStripeChargeCents/,
);
assert.match(
  readFileSync("src/server/futureOrderV2PaymentRecord.ts", "utf8"),
  /isPersonalizedAdditionPaymentReference/,
);

const scriptMarkup = renderToStaticMarkup(
  <PersonalizedAdditionContactScript
    customerName="Ada Lovelace"
    message={evaluated.record.lines[0].contactMessage}
    followUp={evaluated.record.lines[0].contactFollowUp}
  />,
);
for (const expected of [
  "data-admin-v2-contact-script",
  "data-admin-v2-contact-message",
  "data-admin-v2-contact-follow-up",
  "Copy message",
  "Copy follow-up",
  "Ada Lovelace",
  "Add a family crest on the left chest.",
  "€25.00",
  "Crest is embroidered.",
  "How to accept",
  "one follow-up",
  "Nothing is sent automatically",
]) {
  assert.ok(scriptMarkup.includes(expected), `contact script missing: ${expected}`);
}
assert.equal(scriptMarkup.includes("mailto:"), false);
assert.equal(scriptMarkup.includes("wa.me"), false);
const rebuiltScript = contactScriptForPricedLine({
  customerName: "Ada Lovelace",
  orderId: "future-order-crest",
  orderLink: "https://heritage.example/?future_order_v2_order_id=future-order-crest",
  line: { ...evaluated.record.lines[0], contactMessage: "", contactFollowUp: "" },
});
assert.match(rebuiltScript?.message ?? "", /Ada Lovelace/);
assert.match(rebuiltScript?.message ?? "", /How to accept/);
assert.match(rebuiltScript?.followUp ?? "", /one follow-up/);
assert.equal(
  contactScriptForPricedLine({
    customerName: "Ada Lovelace",
    orderId: "future-order-crest",
    orderLink: "https://heritage.example/",
    line: { ...declined.record.lines[0], contactMessage: "stale", contactFollowUp: "stale" },
  })?.message,
  "stale",
);

{
  const displayOrderId = "future-order-display";
  const master = structuredClone(
    createCatalogueAuthoritativeFutureOrderV2Fixture(displayOrderId),
  ) as unknown as {
    cartItem: {
      candidate: {
        pricing: Record<string, unknown>;
        customDetails: unknown[];
      };
    };
  };
  master.cartItem.candidate.pricing = {
    ...master.cartItem.candidate.pricing,
    status: "pending",
    customDetailsCents: null,
    selectedDesignTotalCents: null,
    exactTotalCents: null,
    components: {
      ...(master.cartItem.candidate.pricing.components as object),
      customDetails: { status: "pricing_pending", amountCents: null },
    },
  };
  master.cartItem.candidate.customDetails = [
    {
      occurrenceKey: "base:shirt:personalized_additional:personalized_additional_evaluation",
      garmentKey: "base:shirt",
      garmentLabel: "Shirt",
      selectionGroup: "personalized_additional",
      selectionGroupTitle: "Personalized",
      optionId: "personalized_additional_evaluation",
      optionLabel: "Personalized Additional Requirement",
      priceStatus: "evaluation_required",
      priceCents: null,
      personalizedText: "Add a family crest on the left chest.",
      snapshot: {
        label: "Personalized Additional Requirement",
        description: "Additional cost will depend on evaluation of personalized needs.",
        garmentGroup: "personalized",
        informational: false,
        requiresEvaluation: true,
      },
    },
  ];
  const stored = createPersistedFutureOrderV2({
    masterOrder: master as unknown as Parameters<typeof createPersistedFutureOrderV2>[0]["masterOrder"],
    owner: { uid: "customer-1", isAnonymous: false },
    customerOwnerUid: "customer-1",
    persistedAt: "2026-10-16T18:00:00.000Z",
  });
  assert.equal(stored.status, "valid");
  if (stored.status !== "valid") throw new Error("expected a display order");
  const displayCandidate = stored.value.masterOrder.cartItem.candidate;
  const displaySeeds = [
    {
      occurrenceKey: "base:shirt:personalized_additional:personalized_additional_evaluation",
      garmentKey: "base:shirt",
      optionId: "personalized_additional_evaluation",
      requirementText: "Add a family crest on the left chest.",
    },
  ];
  const displayPriced = evaluatePersonalizedAddition({
    existing: null,
    orderId: displayOrderId,
    ownerUid: "customer-1",
    seeds: displaySeeds,
    occurrenceKey: displaySeeds[0].occurrenceKey,
    amountCents: 1500,
    tailorNote: "Crest is embroidered.",
    toEmail: "ada@example.com",
    customerName: "Ada Lovelace",
    orderLink: "https://heritage.example/?future_order_v2_order_id=future-order-display",
  });
  assert.equal(displayPriced.status, "ready");
  if (displayPriced.status !== "ready") throw new Error("expected display price");
  const displayAccepted = decidePersonalizedAddition(
    displayPriced.record,
    displaySeeds[0].occurrenceKey,
    "accepted",
  );
  assert.equal(displayAccepted.status, "updated");
  if (displayAccepted.status !== "updated") throw new Error("expected display accept");
  const displayDeclined = decidePersonalizedAddition(
    displayPriced.record,
    displaySeeds[0].occurrenceKey,
    "declined",
  );
  assert.equal(displayDeclined.status, "updated");
  if (displayDeclined.status !== "updated") throw new Error("expected display decline");
  const baseCents = readFutureOrderV2ChargeableCents(displayCandidate, null);
  assert.equal(typeof baseCents, "number");
  if (baseCents === null) throw new Error("expected a base total");
  const basePayment: FutureOrderV2PaymentRecord = {
    schemaVersion: 1,
    orderId: displayOrderId,
    ownerUid: "customer-1",
    paymentIntentId: "pi_base_display",
    amountCents: baseCents,
    currency: "eur",
    status: "succeeded",
    testMode: true,
    recordedAt: "2026-10-16T18:05:00.000Z",
  };
  const displayConfirmed = applyConfirmedAdditionPayment(displayAccepted.record, {
    amountCents: 1500,
    paymentIntentId: "pi_addition_display",
    recordedAt: "2026-10-16T19:00:00.000Z",
  });
  assert.equal(displayConfirmed.status, "recorded");
  if (displayConfirmed.status !== "recorded") throw new Error("expected display confirmation");
  const paidTotal = reportedPaidTotalCents({
    basePaymentCents: baseCents,
    settlement: presentPersonalizedAdditionSettlement(displayCandidate, displayConfirmed.record),
  });
  assert.equal(paidTotal, baseCents + 1500);
  const paidDetails = renderToStaticMarkup(
    <CustomerFutureOrderV2Details
      order={stored.value}
      payment={basePayment}
      personalizedPrice={displayConfirmed.record}
      onClose={() => undefined}
    />,
  );
  assert.ok(paidDetails.includes(`Paid (test) ${formatFutureOrderV2PaidAmount(paidTotal!)}`));
  assert.ok(paidDetails.includes("Personalized addition"));
  assert.ok(paidDetails.includes(formatFutureOrderV2PaidAmount(1500)));
  assert.ok(paidDetails.includes("pi_addition_display"));
  assert.ok(paidDetails.includes("Total paid"));
  assert.equal(
    paidDetails.includes(`Paid (test) ${formatFutureOrderV2PaidAmount(baseCents)}`),
    false,
    "a paid addition replaces the base-only paid badge",
  );
  assert.equal(paidDetails.includes(">Pending<"), false);

  const unpaidDetails = renderToStaticMarkup(
    <CustomerFutureOrderV2Details
      order={stored.value}
      payment={basePayment}
      personalizedPrice={displayAccepted.record}
      onClose={() => undefined}
    />,
  );
  assert.ok(unpaidDetails.includes(`Paid (test) ${formatFutureOrderV2PaidAmount(baseCents)}`));
  assert.ok(unpaidDetails.includes("Base total"));
  assert.ok(unpaidDetails.includes(">Pending<"));
  assert.equal(unpaidDetails.includes("pi_addition_display"), false);
  assert.equal(unpaidDetails.includes("Total paid"), false);

  const declinedDetails = renderToStaticMarkup(
    <CustomerFutureOrderV2Details
      order={stored.value}
      payment={basePayment}
      personalizedPrice={displayDeclined.status === "updated" ? displayDeclined.record : null}
      onClose={() => undefined}
    />,
  );
  assert.ok(declinedDetails.includes(`Paid (test) ${formatFutureOrderV2PaidAmount(baseCents)}`));
  assert.equal(declinedDetails.includes("Total paid"), false);
  assert.equal(declinedDetails.includes("pi_addition_display"), false);

  const listMarkup = renderToStaticMarkup(
    <CustomerFutureOrderV2List
      orders={[stored.value]}
      paymentsByOrderId={new Map([[displayOrderId, basePayment]])}
      personalizedPricesByOrderId={new Map([[displayOrderId, displayConfirmed.record]])}
    />,
  );
  assert.ok(listMarkup.includes(`Paid (test) ${formatFutureOrderV2PaidAmount(paidTotal!)}`));
  assert.ok(listMarkup.includes("Total paid"));
  assert.ok(listMarkup.includes("pi_addition_display"));

  const adminMarkup = renderToStaticMarkup(
    <FutureOrderV2AdminPaymentCell
      orderId={displayOrderId}
      record={basePayment}
      settledAddition={{
        paidCents: 1500,
        references: ["pi_addition_display"],
        totalPaidCents: paidTotal!,
      }}
    />,
  );
  assert.ok(adminMarkup.includes(`Paid (test) ${formatFutureOrderV2PaidAmount(paidTotal!)}`));
  assert.ok(adminMarkup.includes("Addition"));
  assert.ok(adminMarkup.includes("pi_addition_display"));
  assert.ok(adminMarkup.includes("pi_base_display"));

  const csv = buildProductionManifestCsv([stored.value], {
    personalizedPricesByOrderId: new Map([[displayOrderId, displayConfirmed.record]]),
    paymentsByOrderId: new Map([[displayOrderId, basePayment]]),
  });
  assert.ok(csv.includes(`addition ${formatFutureOrderV2PaidAmount(1500)}`));
  assert.ok(csv.includes(formatFutureOrderV2PaidAmount(paidTotal!)));
  assert.ok(csv.includes("pi_addition_display"));
  const unpaidCsv = buildProductionManifestCsv([stored.value], {
    personalizedPricesByOrderId: new Map([[displayOrderId, displayAccepted.record]]),
    paymentsByOrderId: new Map([[displayOrderId, basePayment]]),
  });
  assert.equal(unpaidCsv.includes("pi_addition_display"), false);
  assert.ok(unpaidCsv.includes("N/A") || unpaidCsv.includes(`V2 total ${formatFutureOrderV2PaidAmount(baseCents)}`) || unpaidCsv.includes("V2 total"));
}

console.log("personalized price evaluation flow ok");
