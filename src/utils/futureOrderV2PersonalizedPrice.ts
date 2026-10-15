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
}

export interface FutureOrderV2PersonalizedPriceRecord {
  readonly schemaVersion: 1;
  readonly orderId: string;
  readonly ownerUid: string;
  readonly lines: readonly PersonalizedAdditionPriceLine[];
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
      readonly amountCents: number;
      readonly baseCents: number;
      readonly acceptedCents: number;
    }
  | {
      readonly status: "locked";
      readonly reason: "evaluation_pending" | "awaiting_acceptance";
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
});

const parseLine = (value: unknown): PersonalizedAdditionPriceLine | null => {
  if (!isRecord(value) || !isStatus(value.status)) return null;
  const occurrenceKey = trimText(value.occurrenceKey, 200);
  const garmentKey = trimText(value.garmentKey, 200);
  const optionId = trimText(value.optionId, 200);
  const requirementText = trimText(value.requirementText, 2000);
  const tailorNote = typeof value.tailorNote === "string" ? value.tailorNote.trim() : null;
  if (!occurrenceKey || !garmentKey || !optionId || !requirementText || tailorNote === null) {
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
  return {
    schemaVersion: 1,
    orderId: value.orderId,
    ownerUid: value.ownerUid,
    lines: parsed,
  };
};

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

/**
 * Payable total after every personalized line is accepted or declined.
 * `price_ready` is known but not accepted, so it stays locked and is never charged.
 * Declined lines contribute nothing and leave the base garment payable.
 */
export const resolvePersonalizedAdditionPayable = (
  order: PersonalizedPriceChargeableOrder,
  record: FutureOrderV2PersonalizedPriceRecord | null,
): PersonalizedAdditionPayable => {
  const seeds = listPersonalizedEvaluationSeeds(order);
  if (seeds.length === 0) return { status: "unavailable" };
  if (
    !record ||
    seeds.some((seed) => !lineByKey(record, seed.occurrenceKey))
  ) {
    return { status: "locked", reason: "evaluation_pending" };
  }
  const lines = seeds.map((seed) => lineByKey(record, seed.occurrenceKey)!);
  if (lines.some((line) => line.status === "evaluation_pending" || line.pricingEvaluationRequired)) {
    return { status: "locked", reason: "evaluation_pending" };
  }
  if (lines.some((line) => line.status === "price_ready")) {
    return { status: "locked", reason: "awaiting_acceptance" };
  }
  if (lines.some((line) => line.status !== "accepted" && line.status !== "declined")) {
    return { status: "unavailable" };
  }
  const baseCents = knownBaseCents(order);
  if (baseCents === null) return { status: "unavailable" };
  const acceptedCents = lines.reduce(
    (total, line) => total + (line.status === "accepted" ? line.amountCents ?? 0 : 0),
    0,
  );
  return {
    status: "payable",
    amountCents: baseCents + acceptedCents,
    baseCents,
    acceptedCents,
  };
};

/**
 * Cents the server may charge. Exact orders with no personalized evaluation
 * keep the snapshot total. A priced-but-unaccepted addition returns null.
 */
export const readFutureOrderV2ChargeableCents = (
  order: PersonalizedPriceChargeableOrder,
  record: FutureOrderV2PersonalizedPriceRecord | null,
): number | null => {
  const seeds = listPersonalizedEvaluationSeeds(order);
  if (seeds.length === 0) {
    const amountCents = order.pricing.exactTotalCents;
    if (
      order.pricing.status !== "exact" ||
      !Number.isSafeInteger(amountCents) ||
      amountCents < PERSONALIZED_PRICE_MINIMUM_CHARGE_CENTS
    ) {
      return null;
    }
    return amountCents;
  }
  const payable = resolvePersonalizedAdditionPayable(order, record);
  if (
    payable.status !== "payable" ||
    payable.amountCents < PERSONALIZED_PRICE_MINIMUM_CHARGE_CENTS
  ) {
    return null;
  }
  return payable.amountCents;
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

const emailBody = ({
  orderId,
  requirementText,
  amountCents,
  tailorNote,
  orderLink,
}: {
  orderId: string;
  requirementText: string;
  amountCents: number;
  tailorNote: string;
  orderLink: string;
}): string => {
  const note = tailorNote
    ? `\nTailor note: ${tailorNote}\n`
    : "\n";
  return [
    "Your personalized addition is priced.",
    "",
    `Order #${orderId}`,
    "",
    "What you asked for:",
    `"${requirementText}"`,
    "",
    `Evaluated price: ${formatPersonalizedPriceEuros(amountCents)}`,
    note.trimEnd(),
    "",
    "Next steps:",
    "- Accept and pay the difference from your order. Accepting does not charge you; payment is a separate step.",
    "- Decline the addition. Your base garment stays, and this personalized line is dropped.",
    "- Reply to this email if you have a question.",
    "",
    `Open your order: ${orderLink}`,
  ].join("\n");
};

export type EvaluatePersonalizedAdditionResult =
  | {
      readonly status: "ready";
      readonly record: FutureOrderV2PersonalizedPriceRecord;
      readonly notification: PersonalizedPriceReadyNotification;
    }
  | { readonly status: "invalid"; readonly message: string };

/**
 * One tailor save: clear the pending flag, store the euro amount, mark the
 * line price_ready, and build the customer email queued with that same result.
 * This does not charge the customer.
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
    };
  });
  const record: FutureOrderV2PersonalizedPriceRecord = {
    schemaVersion: 1,
    orderId,
    ownerUid,
    lines,
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
    body: emailBody({
      orderId,
      requirementText: seed.requirementText,
      amountCents,
      tailorNote: note,
      orderLink,
    }),
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
