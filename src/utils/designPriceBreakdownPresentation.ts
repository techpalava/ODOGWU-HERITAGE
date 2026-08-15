import type { AuthoritativeDesignPricing } from "./designPricing";

export const SELECTED_DESIGN_PRICE_SUPPORTING_TEXT =
  "Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing.";

/**
 * Presentation-only mapping of the pricing engine's explanatory garment rows.
 * It deliberately owns no monetary arithmetic.
 */
export const resolveCustomerDesignPriceBreakdown = (
  pricing: Pick<
    AuthoritativeDesignPricing,
    | "baseGarmentPricingStatus"
    | "baseGarmentPriceRows"
    | "additionalGarmentPricingStatus"
    | "additionalGarmentPriceRows"
  > | null,
) => ({
  baseGarmentRows:
    pricing?.baseGarmentPricingStatus === "resolved"
      ? pricing.baseGarmentPriceRows
      : [],
  additionalGarmentRows:
    pricing?.additionalGarmentPricingStatus === "resolved"
      ? pricing.additionalGarmentPriceRows
      : [],
  requiresPricingReview:
    pricing?.baseGarmentPricingStatus === "unresolved" ||
    pricing?.additionalGarmentPricingStatus === "unresolved",
});
