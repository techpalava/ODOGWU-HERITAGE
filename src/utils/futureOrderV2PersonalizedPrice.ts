import { PRICING_CURRENCY_SYMBOL } from "./money.js";
import { FUTURE_ORDER_V2_STRIPE_RETURN_ORDER_PARAM } from "./futureOrderV2StripeReturn.js";

export const FUTURE_ORDER_V2_PERSONALIZED_PRICE_COLLECTION =
  "future_order_v2_personalized_prices" as const;

export const FUTURE_ORDER_V2_NOTIFICATION_OUTBOX_COLLECTION =
  "future_order_v2_notification_outbox" as const;

export const PERSONALIZED_PRICE_READY_NOTIFICATION_KIND =
  "personalized_price_ready" as const;

/** Stripe's minimum charge. Matches the reviewed-total payment gate. */
export const PERSONALIZED_PRICE_MINIMUM_CHARGE_CENTS = 50;

/** Shown wherever the customer can pay while an addition is still unevaluated. */
export const PERSONALIZED_BASE_PAYMENT_NOTICE =
  "The total today is the base garment. Personalized additions are reviewed after you order. We contact you by email or WhatsApp with the evaluated price, and you pay that extra only if you accept it. If you do not reply, we follow up once after a few days, then leave the addition off. We never charge it automatically.";

/** Customer-facing status. No extra enum: no reply is left off by declining it. */
export const personalizedAdditionCustomerStatusLabel = (
  status: PersonalizedAdditionPriceStatus,
): string => {
  switch (status) {
    case "evaluation_pending":
      return "Evaluation pending";
    case "price_ready":
      return "Price ready — awaiting your reply";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
  }
};

/** Ops-facing status. A priced line is waiting on the customer, not on a mailer. */
export const personalizedAdditionOpsStatusLabel = (
  status: PersonalizedAdditionPriceStatus,
): string => {
  switch (status) {
    case "evaluation_pending":
      return "Evaluation pending";
    case "price_ready":
      return "Price ready — awaiting customer";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined — left off";
  }
};

export const PERSONALIZED_ADDITION_PRICE_STATUSES = [
  "evaluation_pending",
  "price_ready",
  "accepted",
  "declined",
] as const;

export type PersonalizedAdditionPriceStatus =
  (typeof PERSONALIZED_ADDITION_PRICE_STATUSES)[number];

export interface PersonalizedEvaluationSeed {
  readonly occurrenceKey: string;
  readonly garmentKey: string;
  readonly optionId: string;
  readonly requirementText: string;
}

export interface PersonalizedAdditionPriceLine {
  readonly occurrenceKey: string;
  readonly garmentKey: string;
  readonly optionId: string;
  readonly requirementText: string;
  /** Cleared when the tailor saves an evaluated euro amount. */
  readonly pricingEvaluationRequired: boolean;
  readonly status: PersonalizedAdditionPriceStatus;
  /** Null while evaluation is still pending. Kept for audit after decline. */
  readonly amountCents: number | null;
  readonly tailorNote: string;
  /** Staff-only email/WhatsApp text. Empty until the tailor saves a price. */
  readonly contactMessage: string;
  /** The single follow-up reminder. Empty until the tailor saves a price. */
  readonly contactFollowUp: string;
}

/** A difference charge Stripe has already confirmed. */
export interface PersonalizedAdditionPayment {
  readonly paymentIntentId: string;
  readonly amountCents: number;
  readonly recordedAt: string;
}

export interface FutureOrderV2PersonalizedPriceRecord {
  readonly schemaVersion: 1;
  readonly orderId: string;
  readonly ownerUid: string;
  readonly lines: readonly PersonalizedAdditionPriceLine[];
  /**
   * Cents already confirmed for accepted additions. The base payment is separate.
   * Stays null until Stripe confirms a difference charge.
   */
  readonly additionPaidCents: number | null;
  /** Confirmed difference charges. Empty while the addition is unpaid or declined. */
  readonly additionPayments: readonly PersonalizedAdditionPayment[];
}

export interface PersonalizedPriceReadyNotification {
  readonly schemaVersion: 1;
  readonly notificationId: string;
  readonly kind: typeof PERSONALIZED_PRICE_READY_NOTIFICATION_KIND;
  readonly status: "queued";
  readonly orderId: string;
  readonly ownerUid: string;
  readonly toEmail: string;
  readonly subject: string;
  readonly body: string;
  readonly occurrenceKey: string;
  readonly requirementText: string;
  readonly amountCents: number;
  readonly tailorNote: string;
  readonly orderReference: string;
  readonly orderLink: string;
}

export type PersonalizedAdditionPayable =
  | {
      readonly status: "payable";
      /** Known base only. Accepted additions are paid separately. */
      readonly amountCents: number;
      readonly baseCents: number;
      readonly acceptedCents: number;
      readonly differenceDueCents: number;
    }
  | { readonly status: "unavailable" };

interface EvaluationDetail {
  readonly occurrenceKey: string;
  readonly garmentKey: string;
  readonly optionId: string;
  readonly priceStatus: string;
  readonly priceCents: number | null;
  readonly personalizedText: string | null;
}

interface ChargeablePricing {
  readonly status: string;
  readonly exactTotalCents: number | null;
  readonly garmentConstructionSubtotalCents: number | null;
  readonly postEindhovenAdjustmentCents: number | null;
  readonly components: {
    readonly postEindhovenDelivery: {
      readonly status: string;
      readonly amountCents: number | null;
    };
    readonly lagosToEindhovenShipping: {
      readonly status: string;
      readonly amountCents: number | null;
    };
  };
}

export interface PersonalizedPriceChargeableOrder {
  readonly pricing: ChargeablePricing;
  readonly customDetails: readonly EvaluationDetail[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isCents = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isStatus = (value: unknown): value is PersonalizedAdditionPriceStatus =>
  value === "evaluation_pending" ||
  value === "price_ready" ||
  value === "accepted" ||
  value === "declined";

const trimText = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
};

export const formatPersonalizedPriceEuros = (amountCents: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${(amountCents / 100).toFixed(2)}`;

export const parseEuroAmountToCents = (input: string): number | null => {
  const trimmed = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const cents = Math.round(Number(trimmed) * 100);
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 100_000_00) return null;
  return cents;
};

export const buildPersonalizedPriceOrderLink = (
  origin: string,
  orderId: string,
): string => {
  const base = origin.replace(/\/$/, "");
  return `${base}/?${FUTURE_ORDER_V2_STRIPE_RETURN_ORDER_PARAM}=${encodeURIComponent(orderId)}`;
};

export const listPersonalizedEvaluationSeeds = (
  order: Pick<PersonalizedPriceChargeableOrder, "customDetails">,
): PersonalizedEvaluationSeed[] =>
  order.customDetails
    .filter((detail) => detail.priceStatus === "evaluation_required")
    .map((detail) => ({
      occurrenceKey: detail.occurrenceKey,
      garmentKey: detail.garmentKey,
      optionId: detail.optionId,
      requirementText: (detail.personalizedText ?? "").trim(),
    }))
    .filter((seed) => seed.occurrenceKey && seed.requirementText);

const pendingLine = (seed: PersonalizedEvaluationSeed): PersonalizedAdditionPriceLine => ({
  occurrenceKey: seed.occurrenceKey,
  garmentKey: seed.garmentKey,
  optionId: seed.optionId,
  requirementText: seed.requirementText,
  pricingEvaluationRequired: true,
  status: "evaluation_pending",
  amountCents: null,
  tailorNote: "",
  contactMessage: "",
  contactFollowUp: "",
});

const ADDITION_PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9_]{1,255}$/;

const optionalScript = (value: unknown, max: number): string | null => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : null;
};

const parseAdditionPayment = (value: unknown): PersonalizedAdditionPayment | null => {
  if (!isRecord(value)) return null;
  const paymentIntentId = typeof value.paymentIntentId === "string" ? value.paymentIntentId : "";
  const recordedAt = typeof value.recordedAt === "string" ? value.recordedAt : "";
  if (!ADDITION_PAYMENT_INTENT_ID.test(paymentIntentId)) return null;
  if (!isCents(value.amountCents) || value.amountCents < 1) return null;
  if (recordedAt && Number.isNaN(Date.parse(recordedAt))) return null;
  return {
    paymentIntentId,
    amountCents: value.amountCents,
    recordedAt,
  };
};

/**
 * Older saves stored one PaymentIntent id beside the paid cents. Newer saves
 * store `additionPayments`. Either shape is a confirmed difference charge.
 */
const parseAdditionPayments = (
  value: Record<string, unknown>,
  additionPaidCents: number | null,
): PersonalizedAdditionPayment[] | null => {
  if (Array.isArray(value.additionPayments)) {
    if (value.additionPayments.length > 8) return null;
    const payments: PersonalizedAdditionPayment[] = [];
    for (const item of value.additionPayments) {
      const payment = parseAdditionPayment(item);
      if (!payment) return null;
      payments.push(payment);
    }
    if (new Set(payments.map((payment) => payment.paymentIntentId)).size !== payments.length) {
      return null;
    }
    return payments;
  }
  const legacyId = value.additionPaymentIntentId;
  if (typeof legacyId !== "string" || !ADDITION_PAYMENT_INTENT_ID.test(legacyId)) return [];
  if (additionPaidCents === null || additionPaidCents < 1) return [];
  const recordedAt =
    typeof value.additionPaymentRecordedAt === "string" && !Number.isNaN(Date.parse(value.additionPaymentRecordedAt))
      ? value.additionPaymentRecordedAt
      : "";
  return [{ paymentIntentId: legacyId, amountCents: additionPaidCents, recordedAt }];
};

const parseLine = (value: unknown): PersonalizedAdditionPriceLine | null => {
  if (!isRecord(value) || !isStatus(value.status)) return null;
  const occurrenceKey = trimText(value.occurrenceKey, 200);
  const garmentKey = trimText(value.garmentKey, 200);
  const optionId = trimText(value.optionId, 200);
  const requirementText = trimText(value.requirementText, 2000);
  const tailorNote = typeof value.tailorNote === "string" ? value.tailorNote.trim() : null;
  const contactMessage = optionalScript(value.contactMessage, 4000);
  const contactFollowUp = optionalScript(value.contactFollowUp, 2000);
  if (
    !occurrenceKey ||
    !garmentKey ||
    !optionId ||
    !requirementText ||
    tailorNote === null ||
    contactMessage === null ||
    contactFollowUp === null
  ) {
    return null;
  }
  if (tailorNote.length > 500) return null;
  if (value.amountCents !== null && value.amountCents !== undefined && !isCents(value.amountCents)) {
    return null;
  }
  const amountCents: number | null = isCents(value.amountCents) ? value.amountCents : null;
  const pricingEvaluationRequired = value.pricingEvaluationRequired === true;
  if (value.status === "evaluation_pending") {
    if (!pricingEvaluationRequired || amountCents !== null) return null;
  } else if (pricingEvaluationRequired || amountCents === null || amountCents < 1) {
    return null;
  }
  return {
    occurrenceKey,
    garmentKey,
    optionId,
    requirementText,
    pricingEvaluationRequired,
    status: value.status,
    amountCents,
    tailorNote,
    contactMessage,
    contactFollowUp,
  };
};

export const parseFutureOrderV2PersonalizedPrice = (
  value: unknown,
): FutureOrderV2PersonalizedPriceRecord | null => {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (typeof value.orderId !== "string" || !value.orderId) return null;
  if (typeof value.ownerUid !== "string" || !value.ownerUid) return null;
  if (!Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 12) {
    return null;
  }
  const lines = value.lines.map(parseLine);
  if (lines.some((line) => line === null)) return null;
  const parsed = lines as PersonalizedAdditionPriceLine[];
  const keys = new Set(parsed.map((line) => line.occurrenceKey));
  if (keys.size !== parsed.length) return null;
  const rawAdditionPaidCents = value.additionPaidCents;
  let storedPaidCents: number | null = null;
  if (rawAdditionPaidCents != null) {
    if (!isCents(rawAdditionPaidCents)) return null;
    storedPaidCents = rawAdditionPaidCents;
  }
  const additionPayments = parseAdditionPayments(value, storedPaidCents);
  if (!additionPayments) return null;
  const confirmedCents = additionPayments.reduce((total, payment) => total + payment.amountCents, 0);
  const additionPaidCents = additionPayments.length > 0 ? confirmedCents : storedPaidCents;
  return {
    schemaVersion: 1,
    orderId: value.orderId,
    ownerUid: value.ownerUid,
    lines: parsed,
    additionPaidCents,
    additionPayments,
  };
};

export const personalizedAdditionPaymentReference = (
  orderId: string,
  amountCents: number,
): string => `future-v2-addition-${orderId}-${amountCents}`;

export const isPersonalizedAdditionPaymentReference = (
  orderId: string,
  paymentReference: string,
): boolean => paymentReference.startsWith(`future-v2-addition-${orderId}-`);

const knownBaseCents = (order: PersonalizedPriceChargeableOrder): number | null => {
  const pricing = order.pricing;
  if (!isCents(pricing.garmentConstructionSubtotalCents)) return null;
  if (!isCents(pricing.postEindhovenAdjustmentCents)) return null;
  if (pricing.components.postEindhovenDelivery.status !== "separately_charged") return null;
  const lagos = pricing.components.lagosToEindhovenShipping;
  const lagosCents =
    lagos.status === "included_in_garment_construction" && lagos.amountCents === null
      ? 0
      : lagos.status === "separately_charged" && isCents(lagos.amountCents)
        ? lagos.amountCents
        : null;
  if (lagosCents === null) return null;
  let customExactCents = 0;
  for (const detail of order.customDetails) {
    if (detail.priceStatus === "evaluation_required") continue;
    if (detail.priceStatus === "exact" && isCents(detail.priceCents)) {
      customExactCents += detail.priceCents;
      continue;
    }
    return null;
  }
  return (
    pricing.garmentConstructionSubtotalCents +
    customExactCents +
    pricing.postEindhovenAdjustmentCents +
    lagosCents
  );
};

const lineByKey = (
  record: FutureOrderV2PersonalizedPriceRecord | null,
  occurrenceKey: string,
): PersonalizedAdditionPriceLine | undefined =>
  record?.lines.find((line) => line.occurrenceKey === occurrenceKey);

const acceptedAdditionCents = (
  order: PersonalizedPriceChargeableOrder,
  record: FutureOrderV2PersonalizedPriceRecord | null,
): number =>
  listPersonalizedEvaluationSeeds(order).reduce((total, seed) => {
    const line = lineByKey(record, seed.occurrenceKey);
    return total + (line?.status === "accepted" ? line.amountCents ?? 0 : 0);
  }, 0);

/**
 * The base garment stays payable while a personalized addition is pending,
 * priced, or already decided. Pending and price-ready amounts are excluded.
 * Accepted amounts are not added here; they are a separate difference charge.
 */
export const resolvePersonalizedAdditionPayable = (
  order: PersonalizedPriceChargeableOrder,
  record: FutureOrderV2PersonalizedPriceRecord | null,
): PersonalizedAdditionPayable => {
  const seeds = listPersonalizedEvaluationSeeds(order);
  if (seeds.length === 0) return { status: "unavailable" };
  const baseCents = knownBaseCents(order);
  if (baseCents === null) return { status: "unavailable" };
  const acceptedCents = acceptedAdditionCents(order, record);
  const paidCents = record?.additionPaidCents ?? 0;
  const differenceDueCents = Math.max(0, acceptedCents - paidCents);
  return {
    status: "payable",
    amountCents: baseCents,
    baseCents,
    acceptedCents,
    differenceDueCents,
  };
};

const chargeableExactCents = (amountCents: number | null, status: string): number | null => {
  if (
    status !== "exact" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < PERSONALIZED_PRICE_MINIMUM_CHARGE_CENTS
  ) {
    return null;
  }
  return amountCents;
};

/**
 * Cents the base payment may charge. Exact orders keep the snapshot total.
 * A personalized addition never increases this amount until it is accepted,
 * and even then it is charged as a separate difference.
 */
export const readFutureOrderV2ChargeableCents = (
  order: PersonalizedPriceChargeableOrder,
  _record: FutureOrderV2PersonalizedPriceRecord | null,
): number | null => {
  const seeds = listPersonalizedEvaluationSeeds(order);
  if (seeds.length === 0) {
    return chargeableExactCents(order.pricing.exactTotalCents, order.pricing.status);
  }
  const payable = resolvePersonalizedAdditionPayable(order, null);
  if (
    payable.status !== "payable" ||
    payable.amountCents < PERSONALIZED_PRICE_MINIMUM_CHARGE_CENTS
  ) {
    return null;
  }
  return payable.amountCents;
};

/** Accepted addition cents still unpaid. Null when there is nothing to charge. */
export const readAcceptedPersonalizedDifferenceCents = (
  order: PersonalizedPriceChargeableOrder,
  record: FutureOrderV2PersonalizedPriceRecord | null,
): number | null => {
  const payable = resolvePersonalizedAdditionPayable(order, record);
  if (
    payable.status !== "payable" ||
    payable.differenceDueCents < PERSONALIZED_PRICE_MINIMUM_CHARGE_CENTS
  ) {
    return null;
  }
  return payable.differenceDueCents;
};

/**
 * Server charge for one payment reference. The base reference charges the
 * known base. An addition reference charges only the unpaid accepted difference.
 */
export const readPersonalizedStripeChargeCents = ({
  orderId,
  order,
  record,
  paymentReference,
}: {
  orderId: string;
  order: PersonalizedPriceChargeableOrder;
  record: FutureOrderV2PersonalizedPriceRecord | null;
  paymentReference: string;
}): number | null => {
  if (paymentReference === `future-v2-payment-${orderId}`) {
    return readFutureOrderV2ChargeableCents(order, record);
  }
  if (!isPersonalizedAdditionPaymentReference(orderId, paymentReference)) return null;
  const requested = Number(paymentReference.slice(`future-v2-addition-${orderId}-`.length));
  const due = readAcceptedPersonalizedDifferenceCents(order, record);
  if (!Number.isSafeInteger(requested) || due === null || requested !== due) return null;
  return due;
};

export const personalizedPriceNotificationId = (
  orderId: string,
  occurrenceKey: string,
  amountCents: number,
): string => {
  const safeKey = occurrenceKey.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  return `${orderId}__${safeKey}__${amountCents}`.slice(0, 700);
};

const emailSubject = (orderId: string): string =>
  `Your personalized addition is priced — Order #${orderId}`;

export interface PersonalizedAdditionContactScript {
  readonly message: string;
  readonly followUp: string;
}

/**
 * Staff copy for one priced addition. The message and the single follow-up
 * are written down for a person to send. Nothing is sent automatically.
 */
export const buildPersonalizedAdditionContactScript = ({
  customerName,
  orderId,
  requirementText,
  amountCents,
  tailorNote,
  orderLink,
}: {
  customerName: string;
  orderId: string;
  requirementText: string;
  amountCents: number;
  tailorNote: string;
  orderLink: string;
}): PersonalizedAdditionContactScript => {
  const price = formatPersonalizedPriceEuros(amountCents);
  const note = tailorNote.trim() ? `Tailor note: ${tailorNote.trim()}` : "Tailor note: none";
  const message = [
    `Hi ${customerName},`,
    "",
    "Your personalized addition is priced.",
    "",
    `Order #${orderId}`,
    "",
    "What you asked for:",
    `"${requirementText}"`,
    "",
    `Evaluated price: ${price}`,
    note,
    "",
    "How to accept:",
    "- Accept and pay the difference from your order only if you want this addition. Accepting does not charge you.",
    "- Decline the addition to leave it off. Your base garment stays.",
    "- Reply by email or WhatsApp if you have a question.",
    "",
    `Open your order: ${orderLink}`,
  ].join("\n");
  const followUp = [
    `Hi ${customerName}, this is our one follow-up about your personalized addition.`,
    "",
    `Order #${orderId}`,
    `What you asked for: "${requirementText}"`,
    `Evaluated price: ${price}`,
    note,
    "",
    "If you still want it, accept and pay the difference from your order. If we do not hear back, we follow up once after a few days, then leave this addition off. We never charge it automatically.",
    "",
    `Open your order: ${orderLink}`,
  ].join("\n");
  return { message, followUp };
};

/** Saved script, or one rebuilt from a priced line so staff can still copy it. */
export const contactScriptForPricedLine = ({
  customerName,
  orderId,
  orderLink,
  line,
}: {
  customerName: string;
  orderId: string;
  orderLink: string;
  line: Pick<
    PersonalizedAdditionPriceLine,
    | "status"
    | "amountCents"
    | "requirementText"
    | "tailorNote"
    | "contactMessage"
    | "contactFollowUp"
  >;
}): PersonalizedAdditionContactScript | null => {
  if (line.contactMessage.trim()) {
    return { message: line.contactMessage, followUp: line.contactFollowUp };
  }
  if (
    line.amountCents === null ||
    line.status === "evaluation_pending" ||
    line.status === "declined" ||
    !customerName.trim()
  ) {
    return null;
  }
  return buildPersonalizedAdditionContactScript({
    customerName: customerName.trim(),
    orderId,
    requirementText: line.requirementText,
    amountCents: line.amountCents,
    tailorNote: line.tailorNote,
    orderLink,
  });
};

const emailBody = (script: PersonalizedAdditionContactScript): string =>
  `${script.message}\n\nFollow-up reminder (send once, only if there is no reply):\n${script.followUp}`;

export type EvaluatePersonalizedAdditionResult =
  | {
      readonly status: "ready";
      readonly record: FutureOrderV2PersonalizedPriceRecord;
      readonly notification: PersonalizedPriceReadyNotification;
    }
  | { readonly status: "invalid"; readonly message: string };

/**
 * One tailor save: clear the pending flag, store the euro amount, mark the
 * line price_ready, and store a contact script for staff. Nothing is sent
 * automatically, and this does not charge the customer.
 */
export const evaluatePersonalizedAddition = ({
  existing,
  orderId,
  ownerUid,
  seeds,
  occurrenceKey,
  amountCents,
  tailorNote,
  toEmail,
  orderLink,
  customerName,
}: {
  existing: FutureOrderV2PersonalizedPriceRecord | null;
  orderId: string;
  ownerUid: string;
  seeds: readonly PersonalizedEvaluationSeed[];
  occurrenceKey: string;
  amountCents: number;
  tailorNote: string;
  toEmail: string;
  orderLink: string;
  customerName: string;
}): EvaluatePersonalizedAdditionResult => {
  if (!orderId || !ownerUid) {
    return { status: "invalid", message: "A saved order and owner are required." };
  }
  if (existing && (existing.orderId !== orderId || existing.ownerUid !== ownerUid)) {
    return { status: "invalid", message: "This price record belongs to another order." };
  }
  const email = toEmail.trim();
  if (!email.includes("@") || email.length > 320) {
    return { status: "invalid", message: "This order has no customer email." };
  }
  const name = customerName.trim();
  if (!name || name.length > 120) {
    return { status: "invalid", message: "This order has no customer name." };
  }
  const note = tailorNote.trim();
  if (note.length > 500) {
    return { status: "invalid", message: "The tailor note is too long." };
  }
  if (!isCents(amountCents) || amountCents < 1) {
    return { status: "invalid", message: "Enter the evaluated euro amount." };
  }
  const seed = seeds.find((item) => item.occurrenceKey === occurrenceKey);
  if (!seed) {
    return { status: "invalid", message: "That personalized requirement is not on this order." };
  }
  const current = existing?.lines.find((line) => line.occurrenceKey === occurrenceKey);
  if (current && (current.status === "accepted" || current.status === "declined")) {
    return {
      status: "invalid",
      message: "The customer has already decided on this personalized addition.",
    };
  }
  const contact = buildPersonalizedAdditionContactScript({
    customerName: name,
    orderId,
    requirementText: seed.requirementText,
    amountCents,
    tailorNote: note,
    orderLink,
  });
  const byKey = new Map((existing?.lines ?? []).map((line) => [line.occurrenceKey, line]));
  const lines = seeds.map((item) => {
    if (item.occurrenceKey !== occurrenceKey) {
      return byKey.get(item.occurrenceKey) ?? pendingLine(item);
    }
    return {
      occurrenceKey: item.occurrenceKey,
      garmentKey: item.garmentKey,
      optionId: item.optionId,
      requirementText: item.requirementText,
      pricingEvaluationRequired: false,
      status: "price_ready" as const,
      amountCents,
      tailorNote: note,
      contactMessage: contact.message,
      contactFollowUp: contact.followUp,
    };
  });
  const record: FutureOrderV2PersonalizedPriceRecord = {
    schemaVersion: 1,
    orderId,
    ownerUid,
    lines,
    additionPaidCents: existing?.additionPaidCents ?? null,
    additionPayments: existing?.additionPayments ?? [],
  };
  const parsed = parseFutureOrderV2PersonalizedPrice(record);
  if (!parsed) {
    return { status: "invalid", message: "The evaluated price could not be saved." };
  }
  const notification: PersonalizedPriceReadyNotification = {
    schemaVersion: 1,
    notificationId: personalizedPriceNotificationId(orderId, occurrenceKey, amountCents),
    kind: PERSONALIZED_PRICE_READY_NOTIFICATION_KIND,
    status: "queued",
    orderId,
    ownerUid,
    toEmail: email,
    subject: emailSubject(orderId),
    body: emailBody(contact),
    occurrenceKey,
    requirementText: seed.requirementText,
    amountCents,
    tailorNote: note,
    orderReference: orderId,
    orderLink,
  };
  return { status: "ready", record: parsed, notification };
};

export type DecidePersonalizedAdditionResult =
  | { readonly status: "updated"; readonly record: FutureOrderV2PersonalizedPriceRecord }
  | { readonly status: "unchanged"; readonly record: FutureOrderV2PersonalizedPriceRecord }
  | { readonly status: "invalid"; readonly message: string };

/**
 * Customer decision only. Accept unlocks payment of the evaluated amount.
 * Decline drops that line from the payable total. Neither decision charges.
 */
export const decidePersonalizedAddition = (
  record: FutureOrderV2PersonalizedPriceRecord,
  occurrenceKey: string,
  decision: "accepted" | "declined",
): DecidePersonalizedAdditionResult => {
  const line = record.lines.find((item) => item.occurrenceKey === occurrenceKey);
  if (!line) {
    return { status: "invalid", message: "That personalized addition is not on this order." };
  }
  if (line.status === decision) return { status: "unchanged", record };
  if (line.status !== "price_ready") {
    return {
      status: "invalid",
      message: "This personalized addition is not waiting for a decision.",
    };
  }
  const next: FutureOrderV2PersonalizedPriceRecord = {
    ...record,
    lines: record.lines.map((item) =>
      item.occurrenceKey === occurrenceKey
        ? { ...item, status: decision, pricingEvaluationRequired: false }
        : item,
    ),
  };
  const parsed = parseFutureOrderV2PersonalizedPrice(next);
  if (!parsed) {
    return { status: "invalid", message: "The decision could not be saved." };
  }
  return { status: "updated", record: parsed };
};

export type ConfirmedAdditionPaymentResult =
  | { readonly status: "recorded" | "already_recorded"; readonly record: FutureOrderV2PersonalizedPriceRecord }
  | { readonly status: "rejected" };

/**
 * Marks one difference charge paid only when the PaymentIntent is new and its
 * amount is exactly the accepted amount still unpaid. A declined or still
 * unaccepted addition is rejected, so the total stays at the base.
 */
export const applyConfirmedAdditionPayment = (
  record: FutureOrderV2PersonalizedPriceRecord,
  input: {
    readonly amountCents: number;
    readonly paymentIntentId: string;
    readonly recordedAt: string;
  },
): ConfirmedAdditionPaymentResult => {
  if (!ADDITION_PAYMENT_INTENT_ID.test(input.paymentIntentId)) return { status: "rejected" };
  if (!isCents(input.amountCents) || input.amountCents < PERSONALIZED_PRICE_MINIMUM_CHARGE_CENTS) {
    return { status: "rejected" };
  }
  if (Number.isNaN(Date.parse(input.recordedAt))) return { status: "rejected" };
  if (record.additionPayments.some((payment) => payment.paymentIntentId === input.paymentIntentId)) {
    return { status: "already_recorded", record };
  }
  const acceptedCents = record.lines.reduce(
    (total, line) => total + (line.status === "accepted" ? line.amountCents ?? 0 : 0),
    0,
  );
  const paidCents = record.additionPayments.reduce((total, payment) => total + payment.amountCents, 0);
  if (acceptedCents - paidCents !== input.amountCents) return { status: "rejected" };
  const next: FutureOrderV2PersonalizedPriceRecord = {
    ...record,
    additionPaidCents: paidCents + input.amountCents,
    additionPayments: [
      ...record.additionPayments,
      {
        paymentIntentId: input.paymentIntentId,
        amountCents: input.amountCents,
        recordedAt: input.recordedAt,
      },
    ],
  };
  const parsed = parseFutureOrderV2PersonalizedPrice(next);
  if (!parsed) return { status: "rejected" };
  return { status: "recorded", record: parsed };
};

export interface PersonalizedAdditionSettlement {
  readonly baseCents: number | null;
  /** Confirmed paid addition cents. Zero when the addition is declined or unpaid. */
  readonly paidAdditionCents: number;
  readonly additionPaymentReferences: readonly string[];
  readonly additionSettled: boolean;
  /**
   * Custom-details row once a confirmed addition is included.
   * Null leaves the snapshot row, including "Pending", unchanged.
   */
  readonly customDetailsDisplayCents: number | null;
}

const exactCustomDetailCents = (order: PersonalizedPriceChargeableOrder): number =>
  order.customDetails.reduce((total, detail) => {
    if (detail.priceStatus === "exact" && isCents(detail.priceCents)) return total + detail.priceCents;
    return total;
  }, 0);

/**
 * Totals reported to the customer, admin row, and exports. A declined or
 * unpaid addition contributes nothing. A paid addition is included only after
 * a confirmed PaymentIntent is stored on the price record.
 */
export const presentPersonalizedAdditionSettlement = (
  order: PersonalizedPriceChargeableOrder,
  record: FutureOrderV2PersonalizedPriceRecord | null,
): PersonalizedAdditionSettlement => {
  const payable = resolvePersonalizedAdditionPayable(order, record);
  const baseCents = payable.status === "payable" ? payable.baseCents : null;
  const acceptedCents = payable.status === "payable" ? payable.acceptedCents : 0;
  const payments = record?.additionPayments ?? [];
  const confirmedCents = payments.reduce((total, payment) => total + payment.amountCents, 0);
  const additionSettled =
    acceptedCents >= PERSONALIZED_PRICE_MINIMUM_CHARGE_CENTS &&
    confirmedCents === acceptedCents &&
    payments.length > 0 &&
    (record?.additionPaidCents ?? 0) === confirmedCents;
  return {
    baseCents,
    paidAdditionCents: additionSettled ? confirmedCents : 0,
    additionPaymentReferences: additionSettled
      ? payments.map((payment) => payment.paymentIntentId)
      : [],
    additionSettled,
    customDetailsDisplayCents: additionSettled ? exactCustomDetailCents(order) + confirmedCents : null,
  };
};

/** Base payment plus a confirmed addition. Unpaid and declined additions stay at the base. */
export const reportedPaidTotalCents = ({
  basePaymentCents,
  settlement,
}: {
  basePaymentCents: number | null;
  settlement: PersonalizedAdditionSettlement | null;
}): number | null => {
  if (!settlement?.additionSettled) return basePaymentCents;
  const base = basePaymentCents ?? settlement.baseCents;
  if (base === null) return null;
  return base + settlement.paidAdditionCents;
};

export interface PersonalizedAdditionPresentationLine {
  readonly occurrenceKey: string;
  readonly requirementText: string;
  readonly status: PersonalizedAdditionPriceStatus;
  readonly amountCents: number | null;
  readonly tailorNote: string;
}

export const presentPersonalizedAdditionLines = (
  order: Pick<PersonalizedPriceChargeableOrder, "customDetails">,
  record: FutureOrderV2PersonalizedPriceRecord | null,
): PersonalizedAdditionPresentationLine[] =>
  listPersonalizedEvaluationSeeds(order).map((seed) => {
    const line = lineByKey(record, seed.occurrenceKey);
    if (!line) {
      return {
        occurrenceKey: seed.occurrenceKey,
        requirementText: seed.requirementText,
        status: "evaluation_pending" as const,
        amountCents: null,
        tailorNote: "",
      };
    }
    return {
      occurrenceKey: line.occurrenceKey,
      requirementText: line.requirementText,
      status: line.status,
      amountCents: line.amountCents,
      tailorNote: line.tailorNote,
    };
  });

export const listUnevaluatedPersonalizedLines = (
  order: Pick<PersonalizedPriceChargeableOrder, "customDetails">,
  record: FutureOrderV2PersonalizedPriceRecord | null,
): PersonalizedEvaluationSeed[] =>
  listPersonalizedEvaluationSeeds(order).filter((seed) => {
    const line = lineByKey(record, seed.occurrenceKey);
    return !line || line.status === "evaluation_pending";
  });

/** Lines a tailor can still price: not yet decided by the customer. */
export const listTailorPricablePersonalizedLines = (
  order: Pick<PersonalizedPriceChargeableOrder, "customDetails">,
  record: FutureOrderV2PersonalizedPriceRecord | null,
): PersonalizedEvaluationSeed[] =>
  listPersonalizedEvaluationSeeds(order).filter((seed) => {
    const line = lineByKey(record, seed.occurrenceKey);
    return !line || line.status === "evaluation_pending" || line.status === "price_ready";
  });
