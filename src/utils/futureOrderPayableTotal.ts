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
import { resolveStep8AdditionalDelivery } from "./step8AdditionalDelivery.js";

const NON_AUTHORITATIVE_TOTAL_MESSAGE =
  "The order total does not match the catalogue and shipping price.";

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
  return {
    garmentConstructionSubtotalCents,
    customDetailsCents,
    selectedDesignTotalCents,
    postEindhovenAdjustmentCents,
    exactTotalCents: selectedDesignTotalCents + postEindhovenAdjustmentCents,
    garments,
    customDetailPriceCents,
  };
};

const sameComponentPrices = (
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
  }) &&
  candidate.customDetails.length === quote.customDetailPriceCents.length &&
  candidate.customDetails.every(
    (detail, index) => detail.priceCents === quote.customDetailPriceCents[index],
  );

const includedComponentsMatch = (candidate: FutureOrderCandidateV2): boolean =>
  (
    ["fabric", "sewing", "tax", "lagosToEindhovenShipping"] as const
  ).every((key) => {
    const component = candidate.pricing.components[key];
    return (
      component.status === "included_in_garment_construction" &&
      component.amountCents === null
    );
  });

/**
 * Accepts an exact client ledger only when every payable cent matches the
 * catalogue and Step 8 quote. Non-exact orders are not chargeable and are
 * left unchanged.
 */
export const recomputeFutureOrderPayableTotal = (
  candidate: FutureOrderCandidateV2,
  catalog: unknown = [],
): FutureOrderPayableTotalResult => {
  if (candidate.pricing.status !== "exact") return { status: "not_exact" };
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
