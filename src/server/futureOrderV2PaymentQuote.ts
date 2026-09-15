import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import type { CanonicalOrderIdentity } from "../utils/orderContextIdentity.js";
import {
  parsePersistedFutureOrderV2,
  type PersistedFutureOrderV2,
} from "../utils/futureOrderV2PersistenceContract.js";
import {
  DECORATIVE_FEATURE_OPTIONS,
  getDecorativeFeaturePrice,
  getTraditionalAccessoryPrice,
  TRADITIONAL_ACCESSORY_OPTIONS,
  type TraditionalAccessory,
} from "../utils/decorativePricing.js";
import { parseAuthoritativeDesignStyleRecord } from "../utils/designStyleAuthority.js";
import type { DecorativeFeature, StyleCategory } from "../types.js";
import { resolveStep8AdditionalDelivery } from "../utils/step8AdditionalDelivery.js";
import {
  FUTURE_ORDER_V2_PRICING_AUTHORITY_INPUT_SCHEMA_VERSION,
} from "../utils/futureOrderV2PricingAuthority.js";
import {
  createFutureOrderV2ServerDigest,
  createServerVerifiedFutureOrderV2PricingAuthority,
  hasPricingAuthorityForExactFutureOrderV2,
  parsePersistedFutureOrderV2PricingAuthority,
  type PersistedFutureOrderV2PricingAuthorityV1,
} from "./futureOrderV2PricingAuthority.js";

export const FUTURE_ORDER_V2_PAYMENT_QUOTE_SCHEMA_VERSION = 1 as const;
export const FUTURE_ORDER_V2_PAYMENT_QUOTE_VALIDITY_MS = 30 * 60 * 1000;
export const FUTURE_ORDER_V2_PAYMENT_QUOTE_CURRENCY = "eur" as const;

export type FutureOrderV2PaymentReadinessReason =
  | "AUTH_REQUIRED"
  | "ANONYMOUS_NOT_ALLOWED"
  | "OWNER_MISMATCH"
  | "ORDER_NOT_FOUND"
  | "ORDER_INVALID"
  | "PRIVATE_BATCH_UNAUTHORIZED"
  | "PRIVATE_BATCH_UNAVAILABLE"
  | "PRICING_AUTHORITY_MISSING"
  | "PRICING_AUTHORITY_MISMATCH"
  | "PRICING_SOURCE_UNAVAILABLE"
  | "STYLE_UNAVAILABLE"
  | "CATALOGUE_OPTION_UNAVAILABLE"
  | "EVALUATION_REQUIRED"
  | "FABRIC_UNAVAILABLE"
  | "OCCURRENCE_MISMATCH"
  | "SHIPPING_QUOTE_REQUIRED"
  | "SHIPPING_UNAVAILABLE"
  | "PERSISTENCE_UNAVAILABLE";

export interface PersistedFutureOrderV2PaymentQuoteV1 {
  readonly schemaVersion: typeof FUTURE_ORDER_V2_PAYMENT_QUOTE_SCHEMA_VERSION;
  readonly quoteId: string;
  readonly orderId: string;
  readonly ownerUid: string;
  readonly currency: typeof FUTURE_ORDER_V2_PAYMENT_QUOTE_CURRENCY;
  readonly orderSubtotalCents: number;
  readonly shippingCents: number;
  readonly totalCents: number;
  readonly payableCents: number;
  readonly pricingEngineVersion: string;
  readonly canonicalInputHash: string;
  readonly immutableOrderHash: string;
  readonly pricingAuthorityInputHash: string;
  readonly sourceSnapshot: Readonly<{
    constructionOptionIds: readonly string[];
    customDetailOptionIds: readonly string[];
    fabricIds: readonly string[];
    orderLevelStyle: null | Readonly<{
      styleId: string;
      publicRevision: number;
      eligibilityRevision: number;
      sourceFingerprint: string;
    }>;
    shipping: Readonly<{
      tariffVersion: string;
      ruleId: string;
      ruleHash: string;
    }>;
  }>;
  readonly shippingTariffVersion: string;
  readonly shippingRuleHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lifecycleStatus: "active" | "expired" | "superseded" | "consumed";
}

export type FutureOrderV2PaymentReadiness =
  | Readonly<{
      status: "ready";
      orderId: string;
      quoteId: string;
      ownerUid: string;
      currency: typeof FUTURE_ORDER_V2_PAYMENT_QUOTE_CURRENCY;
      payableCents: number;
      expiresAt: string;
      quote: PersistedFutureOrderV2PaymentQuoteV1;
      reused: boolean;
    }>
  | Readonly<{
      status: "not_ready";
      orderId: string;
      reason: FutureOrderV2PaymentReadinessReason;
    }>;

export class FutureOrderV2PaymentQuoteError extends Error {
  readonly reason: FutureOrderV2PaymentReadinessReason;

  constructor(reason: FutureOrderV2PaymentReadinessReason, message: string) {
    super(message);
    this.name = "FutureOrderV2PaymentQuoteError";
    this.reason = reason;
  }
}

export interface VerifiedFutureOrderV2PaymentIdentity {
  readonly uid: string;
  readonly isAnonymous: boolean;
}

export interface FutureOrderV2PaymentQuoteTransaction {
  getOrder(orderId: string): Promise<unknown | null>;
  getPricingAuthority(orderId: string): Promise<unknown | null>;
  createPricingAuthority(orderId: string, value: unknown): void;
  getStyle(styleId: string): Promise<unknown | null>;
  getCustomDetailOption(optionId: string): Promise<unknown | null>;
  getFabric(fabricId: string): Promise<unknown | null>;
  listActiveQuotes(orderId: string): Promise<readonly unknown[]>;
  createQuote(orderId: string, quoteId: string, value: PersistedFutureOrderV2PaymentQuoteV1): void;
  updateQuoteLifecycle(orderId: string, quoteId: string, lifecycleStatus: "expired" | "superseded" | "consumed"): void;
  assertGroupOrderIdentity?: (
    identity: Extract<CanonicalOrderIdentity, { orderType: "Group Organizer" | "Group Member" }>,
    uid: string,
  ) => Promise<void>;
}

export interface FutureOrderV2PaymentQuoteAdapter {
  runTransaction<T>(
    operation: (transaction: FutureOrderV2PaymentQuoteTransaction) => Promise<T>,
  ): Promise<T>;
}

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim() === value;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isGroupOrderIdentity = (
  value: CanonicalOrderIdentity | undefined,
): value is Extract<CanonicalOrderIdentity, { orderType: "Group Organizer" | "Group Member" }> =>
  value?.orderType === "Group Organizer" || value?.orderType === "Group Member";

const asReadinessError = (
  orderId: string,
  reason: FutureOrderV2PaymentReadinessReason,
): FutureOrderV2PaymentReadiness => ({ status: "not_ready", orderId, reason });

const toCents = (value: number): number => Math.round(value * 100);

const normalizeTimestamp = (value: unknown): string | null => {
  const date =
    typeof value === "string"
      ? new Date(value)
      : value instanceof Date
        ? value
        : isRecord(value) && typeof value.toDate === "function"
          ? (value.toDate as () => Date)()
          : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

const readActiveQuote = (value: unknown): PersistedFutureOrderV2PaymentQuoteV1 | null => {
  if (!isRecord(value) || value.lifecycleStatus !== "active") return null;
  const fields = [
    "quoteId",
    "orderId",
    "ownerUid",
    "canonicalInputHash",
    "immutableOrderHash",
    "pricingAuthorityInputHash",
    "pricingEngineVersion",
    "shippingTariffVersion",
    "shippingRuleHash",
    "createdAt",
    "expiresAt",
  ];
  if (
    value.schemaVersion !== FUTURE_ORDER_V2_PAYMENT_QUOTE_SCHEMA_VERSION ||
    value.currency !== FUTURE_ORDER_V2_PAYMENT_QUOTE_CURRENCY ||
    fields.filter((field) => field !== "createdAt" && field !== "expiresAt").some((field) => !hasText(value[field])) ||
    ![value.orderSubtotalCents, value.shippingCents, value.totalCents, value.payableCents]
      .every((amount) => Number.isSafeInteger(amount) && (amount as number) >= 0) ||
    !isRecord(value.sourceSnapshot)
  ) {
    return null;
  }
  const createdAt = normalizeTimestamp(value.createdAt);
  const expiresAt = normalizeTimestamp(value.expiresAt);
  if (!createdAt || !expiresAt) return null;
  return {
    ...(value as unknown as PersistedFutureOrderV2PaymentQuoteV1),
    createdAt,
    expiresAt,
  };
};

const requireActiveCatalogueOption = ({
  raw,
  optionId,
  selectionGroup,
}: {
  raw: unknown;
  optionId: string;
  selectionGroup: string;
}): number => {
  if (
    !isRecord(raw) ||
    (raw.id !== undefined && raw.id !== optionId) ||
    raw.active !== true ||
    raw.selectionGroup !== selectionGroup ||
    raw.requiresEvaluation === true
  ) {
    throw new FutureOrderV2PaymentQuoteError(
      raw && isRecord(raw) && raw.requiresEvaluation === true
        ? "EVALUATION_REQUIRED"
        : "CATALOGUE_OPTION_UNAVAILABLE",
      "A selected catalogue option is no longer available for payment.",
    );
  }
  const priceCents = raw.priceCents;
  if (!Number.isSafeInteger(priceCents) || (priceCents as number) < 0) {
    throw new FutureOrderV2PaymentQuoteError(
      "CATALOGUE_OPTION_UNAVAILABLE",
      "A selected catalogue option has no valid EUR price.",
    );
  }
  return priceCents as number;
};

const repriceOrder = async ({
  order,
  authority,
  transaction,
}: {
  order: PersistedFutureOrderV2;
  authority: PersistedFutureOrderV2PricingAuthorityV1;
  transaction: FutureOrderV2PaymentQuoteTransaction;
}) => {
  const candidate = order.masterOrder.cartItem.candidate;
  const garmentByKey = new Map(candidate.garments.map((garment) => [garment.garmentKey, garment]));
  if (garmentByKey.size !== candidate.garments.length || garmentByKey.size === 0) {
    throw new FutureOrderV2PaymentQuoteError("OCCURRENCE_MISMATCH", "Garment occurrences are invalid.");
  }
  const constructionOptionIds: string[] = [];
  let constructionCents = 0;
  for (const garment of candidate.garments) {
    if (!Array.isArray(garment.construction) || garment.construction.length === 0) {
      throw new FutureOrderV2PaymentQuoteError(
        "PRICING_AUTHORITY_MISSING",
        "This order lacks server-verifiable garment construction inputs.",
      );
    }
    for (const component of garment.construction) {
      const source = await transaction.getCustomDetailOption(component.optionId);
      constructionCents += requireActiveCatalogueOption({
        raw: source,
        optionId: component.optionId,
        selectionGroup: component.selectionGroup,
      });
      constructionOptionIds.push(component.optionId);
    }
  }

  const customDetailOptionIds: string[] = [];
  let customDetailsCents = 0;
  for (const detail of candidate.customDetails) {
    if (detail.garmentKey === "order" && detail.selectionGroup === "order_optional_detail") {
      continue;
    }
    if (!garmentByKey.has(detail.garmentKey)) {
      throw new FutureOrderV2PaymentQuoteError(
        "OCCURRENCE_MISMATCH",
        "A selected custom detail does not belong to this order.",
      );
    }
    const source = await transaction.getCustomDetailOption(detail.optionId);
    customDetailsCents += requireActiveCatalogueOption({
      raw: source,
      optionId: detail.optionId,
      selectionGroup: detail.selectionGroup,
    });
    customDetailOptionIds.push(detail.optionId);
  }

  let orderLevelCents = 0;
  let orderLevelStyle: PersistedFutureOrderV2PaymentQuoteV1["sourceSnapshot"]["orderLevelStyle"] = null;
  if (authority.orderLevelPricing) {
    const rawStyle = await transaction.getStyle(authority.orderLevelPricing.topLevelStyleId);
    const parsedStyle = parseAuthoritativeDesignStyleRecord(
      authority.orderLevelPricing.topLevelStyleId,
      rawStyle,
    );
    if (parsedStyle.status !== "valid" || parsedStyle.record.lifecycle !== "published") {
      throw new FutureOrderV2PaymentQuoteError("STYLE_UNAVAILABLE", "The order-level Design Style is unavailable.");
    }
    const sourceFingerprint = createFutureOrderV2ServerDigest({
      styleId: parsedStyle.record.id,
      publicRevision: parsedStyle.record.publicRevision,
      eligibilityRevision: parsedStyle.record.eligibilityRevision,
      eligibilityFingerprint: parsedStyle.record.eligibilityFingerprint,
      constructionDetails: parsedStyle.record.presentation.constructionDetails,
    });
    const style = {
      id: parsedStyle.record.id,
      name: parsedStyle.record.presentation.name,
      description: parsedStyle.record.presentation.description,
      gender: parsedStyle.record.presentation.gender,
      options: [...parsedStyle.record.presentation.options],
      constructionDetails: [...parsedStyle.record.presentation.constructionDetails],
    } as StyleCategory;
    for (const feature of authority.orderLevelPricing.decorativeFeatureIds) {
      if (!(DECORATIVE_FEATURE_OPTIONS as readonly string[]).includes(feature)) {
        throw new FutureOrderV2PaymentQuoteError("PRICING_AUTHORITY_MISMATCH", "A decorative feature identifier is invalid.");
      }
      const price = getDecorativeFeaturePrice(style, feature as DecorativeFeature);
      if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(toCents(price))) {
        throw new FutureOrderV2PaymentQuoteError("STYLE_UNAVAILABLE", "A decorative price is unavailable.");
      }
      orderLevelCents += toCents(price);
    }
    for (const accessory of authority.orderLevelPricing.accessoryIds) {
      if (!(TRADITIONAL_ACCESSORY_OPTIONS as readonly string[]).includes(accessory)) {
        throw new FutureOrderV2PaymentQuoteError("PRICING_AUTHORITY_MISMATCH", "An accessory identifier is invalid.");
      }
      const price = getTraditionalAccessoryPrice(style, accessory as TraditionalAccessory);
      if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(toCents(price))) {
        throw new FutureOrderV2PaymentQuoteError("STYLE_UNAVAILABLE", "An accessory price is unavailable.");
      }
      orderLevelCents += toCents(price);
    }
    orderLevelStyle = {
      styleId: parsedStyle.record.id,
      publicRevision: parsedStyle.record.publicRevision,
      eligibilityRevision: parsedStyle.record.eligibilityRevision,
      sourceFingerprint,
    };
  }

  const assignedGarmentKeys = new Set<string>();
  const fabricIds: string[] = [];
  for (const allocation of candidate.fabricAllocations) {
    if (!hasText(allocation.fabricId)) {
      throw new FutureOrderV2PaymentQuoteError("FABRIC_UNAVAILABLE", "A selected Fabric reference is missing.");
    }
    const source = await transaction.getFabric(allocation.fabricId);
    if (
      !isRecord(source) ||
      source.code !== allocation.fabricCode ||
      (source.stockStatus !== "IN_STOCK" && source.stockStatus !== "LOW_STOCK")
    ) {
      throw new FutureOrderV2PaymentQuoteError("FABRIC_UNAVAILABLE", "A selected Fabric is unavailable.");
    }
    fabricIds.push(allocation.fabricId);
    for (const assignment of allocation.garmentAssignments) {
      if (
        !garmentByKey.has(assignment.garmentKey) ||
        assignment.code !== allocation.fabricCode ||
        assignedGarmentKeys.has(assignment.garmentKey)
      ) {
        throw new FutureOrderV2PaymentQuoteError("OCCURRENCE_MISMATCH", "Fabric assignments do not match garment occurrences.");
      }
      assignedGarmentKeys.add(assignment.garmentKey);
    }
  }
  if (candidate.fabricAllocations.length > 0 && assignedGarmentKeys.size !== garmentByKey.size) {
    throw new FutureOrderV2PaymentQuoteError("OCCURRENCE_MISMATCH", "Every garment must retain its exact Fabric assignment.");
  }

  const shippingState = candidate.shipping.state;
  if (
    shippingState.fulfilmentMethod !== "eindhoven_pickup" &&
    shippingState.fulfilmentMethod !== "destination_delivery"
  ) {
    throw new FutureOrderV2PaymentQuoteError("SHIPPING_UNAVAILABLE", "A fulfilment method is required.");
  }
  const delivery = resolveStep8AdditionalDelivery({
    deliveryMethod: shippingState.fulfilmentMethod,
    countryCode: shippingState.customerInformation.deliveryAddress.countryCode,
    city: shippingState.customerInformation.deliveryAddress.city,
    physicalGarmentCount: candidate.garments.length,
    destinationSelectionMode: shippingState.destinationSelectionMode,
  });
  if (delivery.quoteRequired || delivery.status === "quote_required") {
    throw new FutureOrderV2PaymentQuoteError("SHIPPING_QUOTE_REQUIRED", "This destination requires a staff shipping quote.");
  }
  if (delivery.status !== "resolved" || delivery.additionalDeliveryFeeCents === null) {
    throw new FutureOrderV2PaymentQuoteError("SHIPPING_UNAVAILABLE", "Shipping cannot be resolved for this order.");
  }
  const orderSubtotalCents = constructionCents + customDetailsCents + orderLevelCents;
  const shippingCents = delivery.additionalDeliveryFeeCents;
  const totalCents = orderSubtotalCents + shippingCents;
  return {
    orderSubtotalCents,
    shippingCents,
    totalCents,
    constructionOptionIds: [...new Set(constructionOptionIds)].sort(),
    customDetailOptionIds: [...new Set(customDetailOptionIds)].sort(),
    fabricIds: [...new Set(fabricIds)].sort(),
    shipping: {
      tariffVersion: delivery.rateVersion,
      ruleId: delivery.ruleId,
      ruleHash: createFutureOrderV2ServerDigest({
        rateVersion: delivery.rateVersion,
        ruleId: delivery.ruleId,
        destinationZone: delivery.destinationZone,
        weightTier: delivery.weightTier,
        shippingCents,
      }),
    },
    orderLevelStyle,
  };
};

export const createAdminFutureOrderV2PaymentQuoteAdapter = (
  db: Firestore,
): FutureOrderV2PaymentQuoteAdapter => ({
  runTransaction: (operation) =>
    db.runTransaction(async (adminTransaction) =>
      operation({
        async getOrder(orderId) {
          const snapshot = await adminTransaction.get(db.collection("orders").doc(orderId));
          return snapshot.exists ? snapshot.data() : null;
        },
        async getPricingAuthority(orderId) {
          const snapshot = await adminTransaction.get(
            db.collection("orders").doc(orderId).collection("pricingAuthority").doc("current"),
          );
          return snapshot.exists ? snapshot.data() : null;
        },
        createPricingAuthority(orderId, value) {
          const authority = value as { createdAt?: string };
          adminTransaction.create(
            db.collection("orders").doc(orderId).collection("pricingAuthority").doc("current"),
            {
              ...authority,
              ...(authority.createdAt ? { createdAt: Timestamp.fromDate(new Date(authority.createdAt)) } : {}),
            },
          );
        },
        async getStyle(styleId) {
          const snapshot = await adminTransaction.get(db.collection("styles").doc(styleId));
          return snapshot.exists ? snapshot.data() : null;
        },
        async getCustomDetailOption(optionId) {
          const snapshot = await adminTransaction.get(db.collection("custom_detail_catalog").doc(optionId));
          return snapshot.exists ? snapshot.data() : null;
        },
        async getFabric(fabricId) {
          const snapshot = await adminTransaction.get(db.collection("fabrics").doc(fabricId));
          return snapshot.exists ? snapshot.data() : null;
        },
        async listActiveQuotes(orderId) {
          const snapshot = await adminTransaction.get(
            db.collection("orders").doc(orderId).collection("paymentQuotes").where("lifecycleStatus", "==", "active"),
          );
          return snapshot.docs.map((document) => document.data());
        },
        createQuote(orderId, quoteId, value) {
          adminTransaction.create(
            db.collection("orders").doc(orderId).collection("paymentQuotes").doc(quoteId),
            {
              ...value,
              createdAt: Timestamp.fromDate(new Date(value.createdAt)),
              expiresAt: Timestamp.fromDate(new Date(value.expiresAt)),
            },
          );
        },
        updateQuoteLifecycle(orderId, quoteId, lifecycleStatus) {
          adminTransaction.update(
            db.collection("orders").doc(orderId).collection("paymentQuotes").doc(quoteId),
            { lifecycleStatus },
          );
        },
        async assertGroupOrderIdentity(identity, uid) {
          const groupReference = db.collection("customGroups").doc(identity.batchId);
          const groupSnapshot = await adminTransaction.get(groupReference);
          const group = groupSnapshot.exists ? groupSnapshot.data() : null;
          if (
            !isRecord(group) ||
            (group.visibility !== "PRIVATE" && group.visibility !== "PUBLIC") ||
            group.batchId !== identity.batchId
          ) {
            throw new FutureOrderV2PaymentQuoteError(
              "PRIVATE_BATCH_UNAVAILABLE",
              "The retained Private Batch is unavailable.",
            );
          }
          if (group.visibility === "PUBLIC") {
            if (
              identity.orderType === "Group Organizer" &&
              hasText(group.ownerUid) &&
              group.ownerUid !== uid
            ) {
              throw new FutureOrderV2PaymentQuoteError(
                "PRIVATE_BATCH_UNAUTHORIZED",
                "The authenticated customer does not own this personalized group.",
              );
            }
            return;
          }
          if (identity.orderType === "Group Organizer") {
            if (group.ownerUid !== uid) {
              throw new FutureOrderV2PaymentQuoteError(
                "PRIVATE_BATCH_UNAUTHORIZED",
                "The authenticated customer does not own this Private Batch.",
              );
            }
            return;
          }
          const membershipSnapshot = await adminTransaction.get(
            groupReference.collection("privateBatchMembers").doc(uid),
          );
          const membership = membershipSnapshot.exists ? membershipSnapshot.data() : null;
          if (
            !isRecord(membership) ||
            membership.memberUid !== uid ||
            membership.groupId !== identity.batchId ||
            membership.role !== "member"
          ) {
            throw new FutureOrderV2PaymentQuoteError(
              "PRIVATE_BATCH_UNAUTHORIZED",
              "The authenticated customer is not an authorized Private Batch member.",
            );
          }
        },
      }),
    ),
});

export const createFutureOrderV2PaymentQuoteForVerifiedIdentity = async ({
  identity,
  orderId,
  adapter,
  now = () => new Date(),
  createQuoteId = () => `payment-quote-${randomUUID()}`,
}: {
  identity: VerifiedFutureOrderV2PaymentIdentity;
  orderId: string;
  adapter: FutureOrderV2PaymentQuoteAdapter;
  now?: () => Date;
  createQuoteId?: () => string;
}): Promise<FutureOrderV2PaymentReadiness> => {
  if (!hasText(orderId)) return asReadinessError(orderId, "ORDER_NOT_FOUND");
  if (!hasText(identity.uid)) return asReadinessError(orderId, "AUTH_REQUIRED");
  if (identity.isAnonymous) return asReadinessError(orderId, "ANONYMOUS_NOT_ALLOWED");
  try {
    return await adapter.runTransaction(async (transaction) => {
      const rawOrder = await transaction.getOrder(orderId);
      if (rawOrder === null) return asReadinessError(orderId, "ORDER_NOT_FOUND");
      const parsedOrder = parsePersistedFutureOrderV2(rawOrder, orderId);
      if (parsedOrder.status !== "valid") return asReadinessError(orderId, "ORDER_INVALID");
      const order = parsedOrder.value;
      if (order.ownerUid !== identity.uid) return asReadinessError(orderId, "OWNER_MISMATCH");
      const orderIdentity = order.masterOrder.cartItem.candidate.orderIdentity;
      if (isGroupOrderIdentity(orderIdentity)) {
        if (!transaction.assertGroupOrderIdentity) {
          return asReadinessError(orderId, "PRIVATE_BATCH_UNAVAILABLE");
        }
        try {
          await transaction.assertGroupOrderIdentity(orderIdentity, identity.uid);
        } catch {
          return asReadinessError(orderId, "PRIVATE_BATCH_UNAUTHORIZED");
        }
      }
      const rawAuthority = await transaction.getPricingAuthority(orderId);
      let authority: PersistedFutureOrderV2PricingAuthorityV1;
      if (rawAuthority === null) {
        const hasOrderLevelDetail = order.masterOrder.cartItem.candidate.customDetails.some(
          (detail) => detail.garmentKey === "order" && detail.selectionGroup === "order_optional_detail",
        );
        if (hasOrderLevelDetail) return asReadinessError(orderId, "PRICING_AUTHORITY_MISSING");
        authority = await createServerVerifiedFutureOrderV2PricingAuthority({
          masterOrder: order.masterOrder,
          ownerUid: identity.uid,
          input: {
            schemaVersion: FUTURE_ORDER_V2_PRICING_AUTHORITY_INPUT_SCHEMA_VERSION,
            orderLevelPricing: null,
          },
          source: { getStyle: (styleId) => transaction.getStyle(styleId) },
          now,
        });
        transaction.createPricingAuthority(orderId, authority);
      } else {
        const parsedAuthority = parsePersistedFutureOrderV2PricingAuthority(rawAuthority, orderId);
        if (parsedAuthority.status !== "valid") return asReadinessError(orderId, "PRICING_AUTHORITY_MISMATCH");
        authority = parsedAuthority.value;
        if (!hasPricingAuthorityForExactFutureOrderV2({ authority, masterOrder: order.masterOrder, ownerUid: identity.uid })) {
          return asReadinessError(orderId, "PRICING_AUTHORITY_MISMATCH");
        }
      }
      const activeQuotes = (await transaction.listActiveQuotes(orderId))
        .map(readActiveQuote)
        .filter((quote): quote is PersistedFutureOrderV2PaymentQuoteV1 => quote !== null);
      const currentTime = now();
      const reusable = activeQuotes.find(
        (quote) =>
          quote.immutableOrderHash === authority.immutableOrderHash &&
          quote.pricingAuthorityInputHash === authority.pricingInputHash &&
          new Date(quote.expiresAt).getTime() > currentTime.getTime(),
      );
      if (reusable) {
        return {
          status: "ready",
          orderId,
          quoteId: reusable.quoteId,
          ownerUid: reusable.ownerUid,
          currency: reusable.currency,
          payableCents: reusable.payableCents,
          expiresAt: reusable.expiresAt,
          quote: reusable,
          reused: true,
        };
      }
      activeQuotes.forEach((quote) =>
        transaction.updateQuoteLifecycle(orderId, quote.quoteId, "expired"),
      );
      const repriced = await repriceOrder({ order, authority, transaction });
      const quoteId = createQuoteId();
      if (!hasText(quoteId)) return asReadinessError(orderId, "PERSISTENCE_UNAVAILABLE");
      const createdAt = currentTime.toISOString();
      const expiresAt = new Date(currentTime.getTime() + FUTURE_ORDER_V2_PAYMENT_QUOTE_VALIDITY_MS).toISOString();
      const quote: PersistedFutureOrderV2PaymentQuoteV1 = {
        schemaVersion: FUTURE_ORDER_V2_PAYMENT_QUOTE_SCHEMA_VERSION,
        quoteId,
        orderId,
        ownerUid: identity.uid,
        currency: FUTURE_ORDER_V2_PAYMENT_QUOTE_CURRENCY,
        orderSubtotalCents: repriced.orderSubtotalCents,
        shippingCents: repriced.shippingCents,
        totalCents: repriced.totalCents,
        payableCents: repriced.totalCents,
        pricingEngineVersion: authority.pricingEngineVersion,
        canonicalInputHash: createFutureOrderV2ServerDigest({
          immutableOrderHash: authority.immutableOrderHash,
          pricingInputHash: authority.pricingInputHash,
          pricingEngineVersion: authority.pricingEngineVersion,
          repriced,
        }),
        immutableOrderHash: authority.immutableOrderHash,
        pricingAuthorityInputHash: authority.pricingInputHash,
        sourceSnapshot: {
          constructionOptionIds: repriced.constructionOptionIds,
          customDetailOptionIds: repriced.customDetailOptionIds,
          fabricIds: repriced.fabricIds,
          orderLevelStyle: repriced.orderLevelStyle,
          shipping: repriced.shipping,
        },
        shippingTariffVersion: repriced.shipping.tariffVersion,
        shippingRuleHash: repriced.shipping.ruleHash,
        createdAt,
        expiresAt,
        lifecycleStatus: "active",
      };
      transaction.createQuote(orderId, quoteId, quote);
      return {
        status: "ready",
        orderId,
        quoteId,
        ownerUid: identity.uid,
        currency: FUTURE_ORDER_V2_PAYMENT_QUOTE_CURRENCY,
        payableCents: quote.payableCents,
        expiresAt,
        quote,
        reused: false,
      };
    });
  } catch (error) {
    if (error instanceof FutureOrderV2PaymentQuoteError) {
      return asReadinessError(orderId, error.reason);
    }
    return asReadinessError(orderId, "PERSISTENCE_UNAVAILABLE");
  }
};
