import { createHash } from "node:crypto";
import {
  getDecorativeFeaturePrice,
  getTraditionalAccessoryPrice,
  type TraditionalAccessory,
} from "../utils/decorativePricing.js";
import {
  parseAuthoritativeDesignStyleRecord,
  type AuthoritativeDesignStyleRecordV1,
} from "../utils/designStyleAuthority.js";
import type { FutureOrderMasterOrderV2 } from "../utils/futureOrderV2Storage.js";
import type { DecorativeFeature, StyleCategory } from "../types.js";
import {
  FUTURE_ORDER_V2_PRICING_AUTHORITY_INPUT_SCHEMA_VERSION,
  parseFutureOrderV2PricingAuthorityInput,
  type FutureOrderV2PricingAuthorityInputV1,
} from "../utils/futureOrderV2PricingAuthority.js";

export const FUTURE_ORDER_V2_PRICING_AUTHORITY_SCHEMA_VERSION = 1 as const;
export const FUTURE_ORDER_V2_PRICING_ENGINE_VERSION =
  "future-order-v2-server-pricing-v1" as const;
export const FUTURE_ORDER_V2_PRICING_AUTHORITY_RECORD_TYPE =
  "future_order_v2_pricing_authority" as const;

export interface FutureOrderV2PricingAuthoritySource {
  getStyle(styleId: string): Promise<unknown | null>;
}

export interface PersistedFutureOrderV2PricingAuthorityV1 {
  readonly schemaVersion: typeof FUTURE_ORDER_V2_PRICING_AUTHORITY_SCHEMA_VERSION;
  readonly recordType: typeof FUTURE_ORDER_V2_PRICING_AUTHORITY_RECORD_TYPE;
  readonly orderId: string;
  readonly ownerUid: string;
  readonly immutableOrderHash: string;
  readonly pricingInputHash: string;
  readonly pricingEngineVersion: typeof FUTURE_ORDER_V2_PRICING_ENGINE_VERSION;
  readonly shippingTariffVersion: string | null;
  readonly orderLevelPricing: null | Readonly<{
    topLevelStyleId: string;
    publicRevision: number;
    eligibilityRevision: number;
    eligibilityFingerprint: string;
    decorativeFeatureIds: readonly string[];
    accessoryIds: readonly string[];
    sourceFingerprint: string;
  }>;
  readonly createdAt: string;
}

export type PersistedFutureOrderV2PricingAuthorityParseResult =
  | { readonly status: "valid"; readonly value: PersistedFutureOrderV2PricingAuthorityV1 }
  | { readonly status: "invalid"; readonly code: string; readonly message: string };

export class FutureOrderV2PricingAuthorityError extends Error {
  readonly code:
    | "PRICING_AUTHORITY_SOURCE_UNAVAILABLE"
    | "PRICING_AUTHORITY_STYLE_INVALID"
    | "PRICING_AUTHORITY_STYLE_UNPUBLISHED"
    | "PRICING_AUTHORITY_PRICE_INVALID"
    | "PRICING_AUTHORITY_INPUT_INVALID";

  constructor(
    code: FutureOrderV2PricingAuthorityError["code"],
    message: string,
  ) {
    super(message);
    this.name = "FutureOrderV2PricingAuthorityError";
    this.code = code;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim() === value;

const isHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && typeof value === "number" && value > 0;

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const createFutureOrderV2ServerDigest = (value: unknown): string =>
  createHash("sha256").update(stableSerialize(value)).digest("hex");

export const createFutureOrderV2ImmutableOrderHash = (
  masterOrder: FutureOrderMasterOrderV2,
): string => createFutureOrderV2ServerDigest(masterOrder);

export const createFutureOrderV2PricingInputHash = ({
  masterOrder,
  ownerUid,
  input,
}: {
  masterOrder: FutureOrderMasterOrderV2;
  ownerUid: string;
  input: FutureOrderV2PricingAuthorityInputV1;
}): string =>
  createFutureOrderV2ServerDigest({
    schemaVersion: FUTURE_ORDER_V2_PRICING_AUTHORITY_INPUT_SCHEMA_VERSION,
    orderId: masterOrder.orderId,
    ownerUid,
    immutableOrderHash: createFutureOrderV2ImmutableOrderHash(masterOrder),
    input,
  });

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

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const parseOrderLevelPricing = (
  value: unknown,
): PersistedFutureOrderV2PricingAuthorityV1["orderLevelPricing"] | undefined => {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "topLevelStyleId",
      "publicRevision",
      "eligibilityRevision",
      "eligibilityFingerprint",
      "decorativeFeatureIds",
      "accessoryIds",
      "sourceFingerprint",
    ]) ||
    !hasText(value.topLevelStyleId) ||
    !isPositiveSafeInteger(value.publicRevision) ||
    !isPositiveSafeInteger(value.eligibilityRevision) ||
    !hasText(value.eligibilityFingerprint) ||
    !isHash(value.sourceFingerprint) ||
    !Array.isArray(value.decorativeFeatureIds) ||
    !Array.isArray(value.accessoryIds) ||
    value.decorativeFeatureIds.some((entry) => !hasText(entry)) ||
    value.accessoryIds.some((entry) => !hasText(entry))
  ) {
    return undefined;
  }
  const decorativeFeatureIds = [...value.decorativeFeatureIds] as string[];
  const accessoryIds = [...value.accessoryIds] as string[];
  if (
    new Set(decorativeFeatureIds).size !== decorativeFeatureIds.length ||
    new Set(accessoryIds).size !== accessoryIds.length
  ) {
    return undefined;
  }
  return {
    topLevelStyleId: value.topLevelStyleId,
    publicRevision: value.publicRevision,
    eligibilityRevision: value.eligibilityRevision,
    eligibilityFingerprint: value.eligibilityFingerprint,
    decorativeFeatureIds,
    accessoryIds,
    sourceFingerprint: value.sourceFingerprint,
  };
};

export const parsePersistedFutureOrderV2PricingAuthority = (
  value: unknown,
  expectedOrderId?: string,
): PersistedFutureOrderV2PricingAuthorityParseResult => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion",
      "recordType",
      "orderId",
      "ownerUid",
      "immutableOrderHash",
      "pricingInputHash",
      "pricingEngineVersion",
      "shippingTariffVersion",
      "orderLevelPricing",
      "createdAt",
    ]) ||
    value.schemaVersion !== FUTURE_ORDER_V2_PRICING_AUTHORITY_SCHEMA_VERSION ||
    value.recordType !== FUTURE_ORDER_V2_PRICING_AUTHORITY_RECORD_TYPE ||
    !hasText(value.orderId) ||
    !hasText(value.ownerUid) ||
    !isHash(value.immutableOrderHash) ||
    !isHash(value.pricingInputHash) ||
    value.pricingEngineVersion !== FUTURE_ORDER_V2_PRICING_ENGINE_VERSION ||
    (value.shippingTariffVersion !== null && !hasText(value.shippingTariffVersion))
  ) {
    return {
      status: "invalid",
      code: "MALFORMED_PRICING_AUTHORITY",
      message: "The pricing-authority sidecar is malformed.",
    };
  }
  if (expectedOrderId !== undefined && value.orderId !== expectedOrderId) {
    return {
      status: "invalid",
      code: "PRICING_AUTHORITY_ORDER_MISMATCH",
      message: "The pricing-authority sidecar belongs to a different order.",
    };
  }
  const createdAt = normalizeTimestamp(value.createdAt);
  const orderLevelPricing = parseOrderLevelPricing(value.orderLevelPricing);
  if (!createdAt || orderLevelPricing === undefined) {
    return {
      status: "invalid",
      code: "MALFORMED_PRICING_AUTHORITY",
      message: "The pricing-authority sidecar is malformed.",
    };
  }
  return {
    status: "valid",
    value: {
      schemaVersion: FUTURE_ORDER_V2_PRICING_AUTHORITY_SCHEMA_VERSION,
      recordType: FUTURE_ORDER_V2_PRICING_AUTHORITY_RECORD_TYPE,
      orderId: value.orderId as string,
      ownerUid: value.ownerUid as string,
      immutableOrderHash: value.immutableOrderHash as string,
      pricingInputHash: value.pricingInputHash as string,
      pricingEngineVersion: FUTURE_ORDER_V2_PRICING_ENGINE_VERSION,
      shippingTariffVersion: value.shippingTariffVersion as string | null,
      orderLevelPricing,
      createdAt,
    },
  };
};

const stylePricingProjection = (record: AuthoritativeDesignStyleRecordV1): StyleCategory =>
  ({
    id: record.id,
    name: record.presentation.name,
    description: record.presentation.description,
    gender: record.presentation.gender,
    options: [...record.presentation.options],
    constructionDetails: [...record.presentation.constructionDetails],
  }) as StyleCategory;

const verifyOrderLevelPrices = (
  record: AuthoritativeDesignStyleRecordV1,
  input: NonNullable<FutureOrderV2PricingAuthorityInputV1["orderLevelPricing"]>,
) => {
  const style = stylePricingProjection(record);
  const values = [
    ...input.decorativeFeatureIds.map((feature) =>
      getDecorativeFeaturePrice(style, feature),
    ),
    ...input.accessoryIds.map((accessory) =>
      getTraditionalAccessoryPrice(style, accessory as TraditionalAccessory),
    ),
  ];
  if (values.some((price) => !Number.isFinite(price) || price < 0)) {
    throw new FutureOrderV2PricingAuthorityError(
      "PRICING_AUTHORITY_PRICE_INVALID",
      "An order-level price source is invalid.",
    );
  }
};

export const createServerVerifiedFutureOrderV2PricingAuthority = async ({
  masterOrder,
  ownerUid,
  input,
  source,
  now = () => new Date(),
}: {
  masterOrder: FutureOrderMasterOrderV2;
  ownerUid: string;
  input: FutureOrderV2PricingAuthorityInputV1;
  source?: FutureOrderV2PricingAuthoritySource;
  now?: () => Date;
}): Promise<PersistedFutureOrderV2PricingAuthorityV1> => {
  const parsedInput = parseFutureOrderV2PricingAuthorityInput(
    input,
    masterOrder.cartItem.candidate,
  );
  if (parsedInput.status !== "valid") {
    throw new FutureOrderV2PricingAuthorityError(
      "PRICING_AUTHORITY_INPUT_INVALID",
      "The pricing-authority inputs do not match the immutable order.",
    );
  }
  const verifiedInput = parsedInput.value;
  const immutableOrderHash = createFutureOrderV2ImmutableOrderHash(masterOrder);
  let orderLevelPricing: PersistedFutureOrderV2PricingAuthorityV1["orderLevelPricing"] = null;
  if (verifiedInput.orderLevelPricing) {
    if (!source) {
      throw new FutureOrderV2PricingAuthorityError(
        "PRICING_AUTHORITY_SOURCE_UNAVAILABLE",
        "The published Design Style authority is unavailable.",
      );
    }
    const styleId = verifiedInput.orderLevelPricing.topLevelStyleId;
    const rawStyle = await source.getStyle(styleId);
    const parsedStyle = parseAuthoritativeDesignStyleRecord(styleId, rawStyle);
    if (parsedStyle.status !== "valid") {
      throw new FutureOrderV2PricingAuthorityError(
        "PRICING_AUTHORITY_STYLE_INVALID",
        "The selected Design Style is not a valid server authority.",
      );
    }
    if (parsedStyle.record.lifecycle !== "published") {
      throw new FutureOrderV2PricingAuthorityError(
        "PRICING_AUTHORITY_STYLE_UNPUBLISHED",
        "The selected Design Style is not published.",
      );
    }
    verifyOrderLevelPrices(parsedStyle.record, verifiedInput.orderLevelPricing);
    orderLevelPricing = {
      topLevelStyleId: parsedStyle.record.id,
      publicRevision: parsedStyle.record.publicRevision,
      eligibilityRevision: parsedStyle.record.eligibilityRevision,
      eligibilityFingerprint: parsedStyle.record.eligibilityFingerprint,
      decorativeFeatureIds: [...verifiedInput.orderLevelPricing.decorativeFeatureIds],
      accessoryIds: [...verifiedInput.orderLevelPricing.accessoryIds],
      sourceFingerprint: createFutureOrderV2ServerDigest({
        styleId: parsedStyle.record.id,
        publicRevision: parsedStyle.record.publicRevision,
        eligibilityRevision: parsedStyle.record.eligibilityRevision,
        eligibilityFingerprint: parsedStyle.record.eligibilityFingerprint,
        constructionDetails: parsedStyle.record.presentation.constructionDetails,
      }),
    };
  }
  const pricingInputHash = createFutureOrderV2PricingInputHash({
    masterOrder,
    ownerUid,
    input: verifiedInput,
  });
  return {
    schemaVersion: FUTURE_ORDER_V2_PRICING_AUTHORITY_SCHEMA_VERSION,
    recordType: FUTURE_ORDER_V2_PRICING_AUTHORITY_RECORD_TYPE,
    orderId: masterOrder.orderId,
    ownerUid,
    immutableOrderHash,
    pricingInputHash,
    pricingEngineVersion: FUTURE_ORDER_V2_PRICING_ENGINE_VERSION,
    shippingTariffVersion:
      masterOrder.cartItem.candidate.authorityVersions.shippingTariffVersion,
    orderLevelPricing,
    createdAt: now().toISOString(),
  };
};

export const hasPricingAuthorityForExactFutureOrderV2 = ({
  authority,
  masterOrder,
  ownerUid,
}: {
  authority: PersistedFutureOrderV2PricingAuthorityV1;
  masterOrder: FutureOrderMasterOrderV2;
  ownerUid: string;
}): boolean =>
  (() => {
    const parsedInput = parseFutureOrderV2PricingAuthorityInput(
      {
        schemaVersion: FUTURE_ORDER_V2_PRICING_AUTHORITY_INPUT_SCHEMA_VERSION,
        orderLevelPricing: authority.orderLevelPricing
          ? {
              topLevelStyleId: authority.orderLevelPricing.topLevelStyleId,
              decorativeFeatureIds:
                authority.orderLevelPricing.decorativeFeatureIds as readonly DecorativeFeature[],
              accessoryIds:
                authority.orderLevelPricing.accessoryIds as readonly TraditionalAccessory[],
            }
          : null,
      },
      masterOrder.cartItem.candidate,
    );
    return (
      parsedInput.status === "valid" &&
      authority.orderId === masterOrder.orderId &&
      authority.ownerUid === ownerUid &&
      authority.immutableOrderHash === createFutureOrderV2ImmutableOrderHash(masterOrder) &&
      authority.pricingInputHash ===
        createFutureOrderV2PricingInputHash({
          masterOrder,
          ownerUid,
          input: parsedInput.value,
        })
    );
  })();
