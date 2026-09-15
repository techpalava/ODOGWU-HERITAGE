import type { DesignSelections, DecorativeFeature } from "../types.js";
import type { TraditionalAccessory } from "./decorativePricing.js";
import {
  DECORATIVE_FEATURE_OPTIONS,
  sortDecorativeFeatures,
  sortTraditionalAccessories,
  TRADITIONAL_ACCESSORY_OPTIONS,
} from "./decorativePricing.js";
import type { FutureOrderCandidateV2 } from "./futureOrderCandidate.js";

/**
 * This is an untrusted browser claim, never a price snapshot. The server
 * validates it against the immutable V2 order and current published sources
 * before creating the server-owned pricing-authority sidecar.
 */
export const FUTURE_ORDER_V2_PRICING_AUTHORITY_INPUT_SCHEMA_VERSION = 1 as const;

export interface FutureOrderV2OrderLevelPricingInputV1 {
  readonly topLevelStyleId: string;
  readonly decorativeFeatureIds: readonly DecorativeFeature[];
  readonly accessoryIds: readonly TraditionalAccessory[];
}

export interface FutureOrderV2PricingAuthorityInputV1 {
  readonly schemaVersion: typeof FUTURE_ORDER_V2_PRICING_AUTHORITY_INPUT_SCHEMA_VERSION;
  readonly orderLevelPricing: FutureOrderV2OrderLevelPricingInputV1 | null;
}

export type FutureOrderV2PricingAuthorityInputParseResult =
  | { readonly status: "valid"; readonly value: FutureOrderV2PricingAuthorityInputV1 }
  | { readonly status: "invalid"; readonly code: string; readonly message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim() === value;

const isStableStyleIdentifier = (value: unknown): value is string =>
  hasText(value) && value.length <= 128 && !value.includes("/");

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const parseUniqueEnumArray = <T extends string>(
  value: unknown,
  supported: readonly T[],
): readonly T[] | null => {
  if (!Array.isArray(value) || value.length > supported.length) return null;
  if (value.some((entry) => typeof entry !== "string" || !supported.includes(entry as T))) {
    return null;
  }
  const parsed = value as T[];
  if (new Set(parsed).size !== parsed.length) return null;
  return parsed;
};

const orderLevelDetailIds = (candidate: FutureOrderCandidateV2): readonly string[] =>
  candidate.customDetails
    .filter(
      (detail) =>
        detail.garmentKey === "order" &&
        detail.selectionGroup === "order_optional_detail",
    )
    .map((detail) => detail.optionId)
    .sort((left, right) => left.localeCompare(right));

const sameStringValues = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const createFutureOrderV2PricingAuthorityInput = ({
  candidate,
  selectedStyleId,
  designSelections,
}: {
  candidate: FutureOrderCandidateV2;
  selectedStyleId: string | null;
  designSelections: Pick<DesignSelections, "decorativeFeatures" | "accessories">;
}): FutureOrderV2PricingAuthorityInputV1 | null => {
  const expectedOrderDetailIds = orderLevelDetailIds(candidate);
  if (expectedOrderDetailIds.length === 0) {
    return {
      schemaVersion: FUTURE_ORDER_V2_PRICING_AUTHORITY_INPUT_SCHEMA_VERSION,
      orderLevelPricing: null,
    };
  }
  if (!isStableStyleIdentifier(selectedStyleId)) return null;
  const decorativeFeatureIds = sortDecorativeFeatures(
    designSelections.decorativeFeatures || [],
  );
  const accessoryIds = sortTraditionalAccessories(designSelections.accessories || []);
  const claimedOrderDetailIds = [...decorativeFeatureIds, ...accessoryIds].sort(
    (left, right) => left.localeCompare(right),
  );
  if (!sameStringValues(expectedOrderDetailIds, claimedOrderDetailIds)) return null;
  return {
    schemaVersion: FUTURE_ORDER_V2_PRICING_AUTHORITY_INPUT_SCHEMA_VERSION,
    orderLevelPricing: {
      topLevelStyleId: selectedStyleId,
      decorativeFeatureIds,
      accessoryIds,
    },
  };
};

export const parseFutureOrderV2PricingAuthorityInput = (
  value: unknown,
  candidate: FutureOrderCandidateV2,
): FutureOrderV2PricingAuthorityInputParseResult => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schemaVersion", "orderLevelPricing"]) ||
    value.schemaVersion !== FUTURE_ORDER_V2_PRICING_AUTHORITY_INPUT_SCHEMA_VERSION
  ) {
    return {
      status: "invalid",
      code: "MALFORMED_PRICING_AUTHORITY_INPUT",
      message: "The pricing-authority input is malformed.",
    };
  }
  const expectedOrderDetailIds = orderLevelDetailIds(candidate);
  if (value.orderLevelPricing === null) {
    return expectedOrderDetailIds.length === 0
      ? {
          status: "valid",
          value: {
            schemaVersion: FUTURE_ORDER_V2_PRICING_AUTHORITY_INPUT_SCHEMA_VERSION,
            orderLevelPricing: null,
          },
        }
      : {
          status: "invalid",
          code: "PRICING_AUTHORITY_CONTEXT_REQUIRED",
          message: "Paid order-level features need verified pricing context.",
        };
  }
  if (
    !isRecord(value.orderLevelPricing) ||
    !hasExactKeys(value.orderLevelPricing, [
      "topLevelStyleId",
      "decorativeFeatureIds",
      "accessoryIds",
    ]) ||
    !isStableStyleIdentifier(value.orderLevelPricing.topLevelStyleId)
  ) {
    return {
      status: "invalid",
      code: "MALFORMED_PRICING_AUTHORITY_CONTEXT",
      message: "The order-level pricing context is malformed.",
    };
  }
  const decorativeFeatureIds = parseUniqueEnumArray(
    value.orderLevelPricing.decorativeFeatureIds,
    DECORATIVE_FEATURE_OPTIONS,
  );
  const accessoryIds = parseUniqueEnumArray(
    value.orderLevelPricing.accessoryIds,
    TRADITIONAL_ACCESSORY_OPTIONS,
  );
  if (!decorativeFeatureIds || !accessoryIds) {
    return {
      status: "invalid",
      code: "INVALID_ORDER_LEVEL_PRICING_IDENTIFIER",
      message: "An order-level pricing identifier is invalid.",
    };
  }
  const normalizedDecorative = sortDecorativeFeatures(decorativeFeatureIds);
  const normalizedAccessories = sortTraditionalAccessories(accessoryIds);
  const claimedOrderDetailIds = [...normalizedDecorative, ...normalizedAccessories].sort(
    (left, right) => left.localeCompare(right),
  );
  if (!sameStringValues(expectedOrderDetailIds, claimedOrderDetailIds)) {
    return {
      status: "invalid",
      code: "ORDER_LEVEL_PRICING_MISMATCH",
      message: "Order-level pricing inputs do not match the immutable order.",
    };
  }
  return {
    status: "valid",
    value: {
      schemaVersion: FUTURE_ORDER_V2_PRICING_AUTHORITY_INPUT_SCHEMA_VERSION,
      orderLevelPricing: {
        topLevelStyleId: value.orderLevelPricing.topLevelStyleId,
        decorativeFeatureIds: normalizedDecorative,
        accessoryIds: normalizedAccessories,
      },
    },
  };
};
