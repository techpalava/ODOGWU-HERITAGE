import type {
  CustomDetailSelectionGroup,
  DecorativeFeature,
  FabricGarmentType,
} from "../types.js";
import {
  CLOTHING_PRICE_SELECTION_GROUPS,
  normalizeCustomDetailCatalog,
} from "./catalogHelpers.js";
import {
  DECORATIVE_FEATURE_PRICE_CENTS,
  getDecorativeFeaturePrice,
  getTraditionalAccessoryPrice,
  TRADITIONAL_ACCESSORY_OPTIONS,
  type TraditionalAccessory,
} from "./decorativePricing.js";
import type { FutureOrderCandidateV2 } from "./futureOrderCandidate.js";
import {
  isCanonicalPhysicalGarmentType,
  resolveGarmentConstructionPricing,
} from "./garmentConstructionPricing.js";
import { reconcileGarmentConstructionResolution } from "./garmentTypeStepState.js";
import { individualLagosToEindhovenChargeCents } from "./individualInboundShippingDisplay.js";
import { resolveStep8AdditionalDelivery } from "./step8AdditionalDelivery.js";

const NON_AUTHORITATIVE_TOTAL_MESSAGE =
  "The order total does not match the catalogue and shipping price.";

export const FUTURE_ORDER_PRICE_OUTDATED_CODE = "PRICE_OUTDATED" as const;
export const FUTURE_ORDER_PRICE_OUTDATED_MESSAGE =
  "Shipping prices changed. Review your order to see the new total.";

const CLOTHING_PRICE_GROUPS = new Set<string>(CLOTHING_PRICE_SELECTION_GROUPS);
const DECORATIVE_FEATURES = new Set<string>(
  Object.keys(DECORATIVE_FEATURE_PRICE_CENTS),
);
const TRADITIONAL_ACCESSORIES = new Set<string>(TRADITIONAL_ACCESSORY_OPTIONS);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const eurosToCents = (euros: number): number | null => {
  if (!Number.isFinite(euros) || euros < 0) return null;
  const cents = Math.round(euros * 100);
  return Number.isSafeInteger(cents) ? cents : null;
};

const decorativeOrAccessoryCents = (optionId: string): number | null => {
  if (DECORATIVE_FEATURES.has(optionId)) {
    return eurosToCents(
      getDecorativeFeaturePrice(null, optionId as DecorativeFeature),
    );
  }
  if (TRADITIONAL_ACCESSORIES.has(optionId)) {
    return eurosToCents(
      getTraditionalAccessoryPrice(null, optionId as TraditionalAccessory),
    );
  }
  return null;
};

export interface FutureOrderPayableQuote {
  readonly garmentConstructionSubtotalCents: number;
  readonly customDetailsCents: number;
  readonly selectedDesignTotalCents: number;
  readonly postEindhovenAdjustmentCents: number;
  /** Individual Lagos→Eindhoven band. Null when that leg stays inside construction. */
  readonly lagosToEindhovenShippingCents: number | null;
  readonly exactTotalCents: number;
  readonly garments: readonly {
    readonly totalPriceCents: number;
    readonly components: readonly {
      readonly optionId: string;
      readonly selectionGroup: string;
      readonly priceCents: number;
    }[];
  }[];
  readonly customDetailPriceCents: readonly number[];
}

export type FutureOrderPayableTotalResult =
  | ({ readonly status: "exact" } & FutureOrderPayableQuote)
  | { readonly status: "not_exact" }
  | {
      readonly status: "rejected";
      readonly code: "NON_AUTHORITATIVE_TOTAL";
      readonly message: string;
    };

const rejected = (): FutureOrderPayableTotalResult => ({
  status: "rejected",
  code: "NON_AUTHORITATIVE_TOTAL",
  message: NON_AUTHORITATIVE_TOTAL_MESSAGE,
});

/**
 * Catalogue and Step 8 shipping quote for a persisted Future Order.
 * Construction option ids come from the order; prices come from
 * `normalizeCustomDetailCatalog` and `resolveStep8AdditionalDelivery`.
 */
export const quoteFutureOrderPayableTotal = (
  candidate: FutureOrderCandidateV2,
  catalog: unknown = [],
  options: { readonly skipEvaluationRequired?: boolean } = {},
): FutureOrderPayableQuote | null => {
  const normalizedCatalog = normalizeCustomDetailCatalog(
    Array.isArray(catalog) ? catalog : [],
  );
  const optionsById = new Map(
    normalizedCatalog.map((option) => [option.id, option] as const),
  );
  let garmentConstructionSubtotalCents = 0;
  const garments: FutureOrderPayableQuote["garments"][number][] = [];

  for (const garment of candidate.garments) {
    const garmentType = garment.garmentType as FabricGarmentType;
    if (!isCanonicalPhysicalGarmentType(garmentType)) return null;
    const canonical = resolveGarmentConstructionPricing(
      garmentType,
      normalizedCatalog,
    );
    if (canonical.status !== "resolved") return null;
    const submittedComponents = [];
    for (const component of garment.construction) {
      if (
        !isRecord(component) ||
        typeof component.optionId !== "string" ||
        typeof component.selectionGroup !== "string" ||
        typeof component.componentKey !== "string"
      ) {
        return null;
      }
      const priceCents = component.priceCents;
      submittedComponents.push({
        componentKey: component.componentKey,
        optionId: component.optionId,
        selectionGroup: component.selectionGroup as CustomDetailSelectionGroup,
        priceCents: typeof priceCents === "number" ? priceCents : 0,
        price: typeof priceCents === "number" ? priceCents / 100 : 0,
      });
    }
    const reconciled = reconcileGarmentConstructionResolution(
      {
        status: "resolved",
        garmentType,
        components: submittedComponents,
        totalPriceCents: submittedComponents.reduce(
          (total, component) => total + component.priceCents,
          0,
        ),
        totalPrice: 0,
      },
      canonical,
      normalizedCatalog,
    );
    if (!reconciled || reconciled.status !== "resolved") return null;
    garmentConstructionSubtotalCents += reconciled.totalPriceCents;
    garments.push({
      totalPriceCents: reconciled.totalPriceCents,
      components: reconciled.components.map((component) => ({
        optionId: component.optionId,
        selectionGroup: component.selectionGroup,
        priceCents: component.priceCents,
      })),
    });
  }

  const customDetailPriceCents: number[] = [];
  for (const detail of candidate.customDetails) {
    if (CLOTHING_PRICE_GROUPS.has(detail.selectionGroup)) return null;
    if (
      options.skipEvaluationRequired &&
      detail.priceStatus === "evaluation_required"
    ) {
      if (detail.selectionGroup === "order_optional_detail") return null;
      const evaluationOption = optionsById.get(detail.optionId);
      if (
        evaluationOption?.active &&
        evaluationOption.requiresEvaluation &&
        evaluationOption.selectionGroup === detail.selectionGroup
      ) {
        continue;
      }
      return null;
    }
    if (detail.selectionGroup === "order_optional_detail") {
      const cents = decorativeOrAccessoryCents(detail.optionId);
      if (cents === null) return null;
      customDetailPriceCents.push(cents);
      continue;
    }
    const option = optionsById.get(detail.optionId);
    if (
      !option ||
      !option.active ||
      option.requiresEvaluation ||
      option.selectionGroup !== detail.selectionGroup
    ) {
      return null;
    }
    customDetailPriceCents.push(option.priceCents);
  }
  const customDetailsCents = customDetailPriceCents.reduce(
    (total, cents) => total + cents,
    0,
  );
  const selectedDesignTotalCents =
    garmentConstructionSubtotalCents + customDetailsCents;

  const fulfilment = candidate.shipping.state.fulfilmentMethod;
  if (fulfilment !== "eindhoven_pickup" && fulfilment !== "destination_delivery") {
    return null;
  }
  const address = candidate.shipping.state.customerInformation.deliveryAddress;
  const delivery = resolveStep8AdditionalDelivery({
    deliveryMethod: fulfilment,
    countryCode: address.countryCode,
    city: address.city,
    physicalGarmentCount: candidate.garments.length,
    destinationSelectionMode: candidate.shipping.state.destinationSelectionMode,
  });
  if (delivery.status !== "resolved" || delivery.additionalDeliveryFeeCents === null) {
    return null;
  }
  const postEindhovenAdjustmentCents = delivery.additionalDeliveryFeeCents;
  const lagosToEindhovenShippingCents = individualLagosToEindhovenChargeCents({
    orderType: candidate.orderIdentity?.orderType ?? null,
    physicalGarmentCount: candidate.garments.length,
    fulfilmentMethod: fulfilment,
  });
  return {
    garmentConstructionSubtotalCents,
    customDetailsCents,
    selectedDesignTotalCents,
    postEindhovenAdjustmentCents,
    lagosToEindhovenShippingCents,
    exactTotalCents:
      selectedDesignTotalCents +
      postEindhovenAdjustmentCents +
      (lagosToEindhovenShippingCents ?? 0),
    garments,
    customDetailPriceCents,
  };
};

const garmentConstructionMatches = (
  candidate: FutureOrderCandidateV2,
  quote: FutureOrderPayableQuote,
): boolean =>
  candidate.garments.length === quote.garments.length &&
  candidate.garments.every((garment, index) => {
    const quoted = quote.garments[index];
    return (
      garment.constructionTotalCents === quoted?.totalPriceCents &&
      garment.construction.length === quoted.components.length &&
      garment.construction.every((component, componentIndex) => {
        const priced = quoted.components[componentIndex];
        return (
          component.optionId === priced?.optionId &&
          component.selectionGroup === priced.selectionGroup &&
          component.priceCents === priced.priceCents
        );
      })
    );
  });

const sameComponentPrices = (
  candidate: FutureOrderCandidateV2,
  quote: FutureOrderPayableQuote,
): boolean =>
  garmentConstructionMatches(candidate, quote) &&
  candidate.customDetails.length === quote.customDetailPriceCents.length &&
  candidate.customDetails.every(
    (detail, index) => detail.priceCents === quote.customDetailPriceCents[index],
  );

/**
 * Construction, exact custom details, post-Eindhoven, and the Individual
 * Lagos→Eindhoven band. Evaluation-required lines are absent from the quote.
 */
const knownBaseMatches = (
  candidate: FutureOrderCandidateV2,
  quote: FutureOrderPayableQuote,
): boolean => {
  const exactDetails = candidate.customDetails.filter(
    (detail) => detail.priceStatus !== "evaluation_required",
  );
  return (
    garmentConstructionMatches(candidate, quote) &&
    includedComponentsMatch(candidate) &&
    candidate.pricing.garmentConstructionSubtotalCents ===
      quote.garmentConstructionSubtotalCents &&
    exactDetails.length === quote.customDetailPriceCents.length &&
    exactDetails.every(
      (detail, index) => detail.priceCents === quote.customDetailPriceCents[index],
    ) &&
    candidate.pricing.postEindhovenAdjustmentCents ===
      quote.postEindhovenAdjustmentCents &&
    candidate.shipping.additionalDeliveryFeeCents ===
      quote.postEindhovenAdjustmentCents &&
    candidate.pricing.components.postEindhovenDelivery.status ===
      "separately_charged" &&
    candidate.pricing.components.postEindhovenDelivery.amountCents ===
      quote.postEindhovenAdjustmentCents
  );
};

const includedComponentsMatch = (candidate: FutureOrderCandidateV2): boolean => {
  const constructionIncluded = (
    ["fabric", "sewing", "tax"] as const
  ).every((key) => {
    const component = candidate.pricing.components[key];
    return (
      component.status === "included_in_garment_construction" &&
      component.amountCents === null
    );
  });
  const lagos = candidate.pricing.components.lagosToEindhovenShipping;
  const lagosChargeCents = individualLagosToEindhovenChargeCents({
    orderType: candidate.orderIdentity?.orderType ?? null,
    physicalGarmentCount: candidate.garments.length,
    fulfilmentMethod: candidate.shipping.state.fulfilmentMethod,
  });
  const lagosMatches =
    lagosChargeCents === null
      ? lagos.status === "included_in_garment_construction" &&
        lagos.amountCents === null
      : lagos.status === "separately_charged" &&
        lagos.amountCents === lagosChargeCents;
  return constructionIncluded && lagosMatches;
};

const hasEvaluationRequiredDetail = (
  candidate: FutureOrderCandidateV2,
): boolean =>
  candidate.customDetails.some(
    (detail) => detail.priceStatus === "evaluation_required",
  );

/**
 * Accepts an exact client ledger only when every payable cent matches the
 * catalogue and Step 8 quote. A pending personalized addition stays payable
 * at the known base only when construction, exact custom details,
 * post-Eindhoven, and the Individual Lagos→Eindhoven band match that quote.
 * Other non-exact orders are left unchanged.
 */
export const recomputeFutureOrderPayableTotal = (
  candidate: FutureOrderCandidateV2,
  catalog: unknown = [],
): FutureOrderPayableTotalResult => {
  if (candidate.pricing.status !== "exact") {
    if (!hasEvaluationRequiredDetail(candidate)) return { status: "not_exact" };
    const knownBaseQuote = quoteFutureOrderPayableTotal(candidate, catalog, {
      skipEvaluationRequired: true,
    });
    if (!knownBaseQuote || !knownBaseMatches(candidate, knownBaseQuote)) {
      return rejected();
    }
    return { status: "not_exact" };
  }
  const quote = quoteFutureOrderPayableTotal(candidate, catalog);
  const pricing = candidate.pricing;
  if (
    !quote ||
    !includedComponentsMatch(candidate) ||
    !sameComponentPrices(candidate, quote) ||
    pricing.garmentConstructionSubtotalCents !== quote.garmentConstructionSubtotalCents ||
    pricing.customDetailsCents !== quote.customDetailsCents ||
    pricing.selectedDesignTotalCents !== quote.selectedDesignTotalCents ||
    pricing.postEindhovenAdjustmentCents !== quote.postEindhovenAdjustmentCents ||
    pricing.exactTotalCents !== quote.exactTotalCents ||
    candidate.shipping.additionalDeliveryFeeCents !== quote.postEindhovenAdjustmentCents ||
    pricing.components.customDetails.status !== "separately_charged" ||
    pricing.components.customDetails.amountCents !== quote.customDetailsCents ||
    pricing.components.postEindhovenDelivery.status !== "separately_charged" ||
    pricing.components.postEindhovenDelivery.amountCents !==
      quote.postEindhovenAdjustmentCents
  ) {
    return rejected();
  }
  return { status: "exact", ...quote };
};

/**
 * True when a pending personalized base can be charged. Orders without an
 * evaluation-required detail keep the exact-total charge path.
 */
export const pendingPersonalizedKnownBaseIsAuthoritative = (
  candidate: FutureOrderCandidateV2,
  catalog: unknown = [],
): boolean => {
  if (!hasEvaluationRequiredDetail(candidate)) return true;
  return recomputeFutureOrderPayableTotal(candidate, catalog).status === "not_exact";
};

const isIndividualFutureOrderCandidate = (
  candidate: FutureOrderCandidateV2,
): boolean => candidate.orderIdentity?.orderType === "Individual";

/**
 * Individual orders whose stored Lagos → Eindhoven amount no longer matches
 * the current block quote must not be charged. Community/batch are skipped.
 * Pickup and delivery use the same Lagos charge. Construction-only ledger
 * mismatches keep the existing persist-time NON_AUTHORITATIVE_TOTAL path.
 */
export const refuseOutdatedStoredIndividualPayableTotal = (
  candidate: FutureOrderCandidateV2,
  _catalog: unknown = [],
):
  | { readonly status: "ok" }
  | {
      readonly status: "price_outdated";
      readonly code: typeof FUTURE_ORDER_PRICE_OUTDATED_CODE;
      readonly message: string;
    } => {
  if (!isIndividualFutureOrderCandidate(candidate)) {
    return { status: "ok" };
  }
  const expectedLagos = individualLagosToEindhovenChargeCents({
    orderType: candidate.orderIdentity?.orderType ?? null,
    physicalGarmentCount: candidate.garments.length,
    fulfilmentMethod: candidate.shipping.state.fulfilmentMethod,
  });
  const stored = candidate.pricing.components.lagosToEindhovenShipping;
  const storedLagos =
    stored.status === "separately_charged" ? stored.amountCents : null;
  if (storedLagos === expectedLagos) {
    return { status: "ok" };
  }
  return {
    status: "price_outdated",
    code: FUTURE_ORDER_PRICE_OUTDATED_CODE,
    message: FUTURE_ORDER_PRICE_OUTDATED_MESSAGE,
  };
};

/**
 * Re-apply the current Individual Lagos → Eindhoven quote to an unpaid
 * pickup or destination-delivery candidate. Community/batch, matching quotes,
 * and paid orders are left unchanged.
 */
export const repriceUnpaidIndividualDeliveryCandidate = (
  candidate: FutureOrderCandidateV2,
  options: { readonly hasPaymentRecord?: boolean; readonly catalog?: unknown } = {},
): FutureOrderCandidateV2 => {
  if (options.hasPaymentRecord) return candidate;
  if (!isIndividualFutureOrderCandidate(candidate)) return candidate;
  const fulfilment = candidate.shipping.state.fulfilmentMethod;
  if (fulfilment !== "destination_delivery" && fulfilment !== "eindhoven_pickup") {
    return candidate;
  }
  const expectedLagos = individualLagosToEindhovenChargeCents({
    orderType: candidate.orderIdentity?.orderType ?? null,
    physicalGarmentCount: candidate.garments.length,
    fulfilmentMethod: candidate.shipping.state.fulfilmentMethod,
  });
  if (expectedLagos === null) return candidate;
  const stored = candidate.pricing.components.lagosToEindhovenShipping;
  const storedLagos =
    stored.status === "separately_charged" ? stored.amountCents : null;
  const quote = quoteFutureOrderPayableTotal(candidate, options.catalog ?? []);
  if (quote && candidate.pricing.status === "exact") {
    if (
      storedLagos === expectedLagos &&
      candidate.pricing.exactTotalCents === quote.exactTotalCents
    ) {
      return candidate;
    }
    return {
      ...candidate,
      pricing: {
        ...candidate.pricing,
        exactTotalCents: quote.exactTotalCents,
        postEindhovenAdjustmentCents: quote.postEindhovenAdjustmentCents,
        components: {
          ...candidate.pricing.components,
          lagosToEindhovenShipping: {
            status: "separately_charged",
            amountCents: expectedLagos,
          },
        },
      },
      shipping: {
        ...candidate.shipping,
        additionalDeliveryFeeCents: quote.postEindhovenAdjustmentCents,
      },
    };
  }
  if (storedLagos === expectedLagos) return candidate;
  const previousLagos = storedLagos ?? 0;
  const delta = expectedLagos - previousLagos;
  const nextLagos = {
    status: "separately_charged" as const,
    amountCents: expectedLagos,
  };
  if (
    candidate.pricing.status === "exact" &&
    candidate.pricing.exactTotalCents !== null
  ) {
    return {
      ...candidate,
      pricing: {
        ...candidate.pricing,
        exactTotalCents: candidate.pricing.exactTotalCents + delta,
        components: {
          ...candidate.pricing.components,
          lagosToEindhovenShipping: nextLagos,
        },
      },
    };
  }
  return {
    ...candidate,
    pricing: {
      ...candidate.pricing,
      components: {
        ...candidate.pricing.components,
        lagosToEindhovenShipping: nextLagos,
      },
    },
  };
};
