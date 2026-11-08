import { STEP8_OVER_20_KG_QUOTE_MESSAGE } from "../config/Step8AdditionalDeliveryConfig.js";
import type {
  FutureShippingDestinationSelectionMode,
  FutureShippingFulfilmentSelection,
} from "../types.js";
import {
  formatIndividualShippingNote,
  resolveIndividualInboundShippingDisplay,
} from "./individualInboundShippingDisplay.js";
import { PRICING_CURRENCY_SYMBOL } from "./money.js";
import {
  INDIVIDUAL_SHIPPING_BLOCK_PRICE_CENTS,
  INDIVIDUAL_SHIPPING_GARMENTS_PER_BLOCK,
  INDIVIDUAL_SHIPPING_KG_PER_BLOCK,
} from "./shippingPricing.js";
import { resolveStep8AdditionalDelivery } from "./step8AdditionalDelivery.js";

/** Homepage chip. The block rate, not a calculated order total. */
export const formatIndividualHomepageBlockRate = (): string => {
  const euros = (INDIVIDUAL_SHIPPING_BLOCK_PRICE_CENTS / 100).toFixed(2);
  return `Lagos → Eindhoven €${euros} per ${INDIVIDUAL_SHIPPING_GARMENTS_PER_BLOCK} garments (under ${INDIVIDUAL_SHIPPING_KG_PER_BLOCK} kg)`;
};

export const SHIPPING_ONWARD_LEG_LABEL = "Delivery from Eindhoven";
export const SHIPPING_ONWARD_NOT_YET_ESTIMATED = "Not yet estimated";
export const SHIPPING_ONWARD_CUSTOM_QUOTE = "Custom shipping quote required";
export const SHIPPING_ONWARD_NOT_ESTIMATED = "Not estimated";

export type ShippingOnwardEstimateStatus =
  | "resolved"
  | "not_yet_estimated"
  | "unresolved";

export interface ShippingDisplayEstimate {
  readonly subtotalCents: number | null;
  /** Separate Lagos → Eindhoven charge. Null for batch orders, which do not add this leg. */
  readonly lagosAmountCents: number | null;
  readonly lagosNote: string | null;
  readonly onwardStatus: ShippingOnwardEstimateStatus;
  readonly onwardAmountCents: number | null;
  readonly onwardLabel: typeof SHIPPING_ONWARD_LEG_LABEL;
  readonly onwardValueLabel: string;
  readonly onwardExplanation: string;
  /**
   * Subtotal + Lagos (individual only) + onward, each once.
   * Null unless every component is resolved. Never a stored quote.
   */
  readonly allInEstimateCents: number | null;
  readonly allInExplanation: string | null;
}

const moneyFromCents = (amountCents: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${(amountCents / 100).toFixed(2)}`;

const subtotalCentsFromPrice = (selectedDesignPrice: number | null): number | null =>
  selectedDesignPrice !== null &&
  Number.isFinite(selectedDesignPrice) &&
  selectedDesignPrice >= 0
    ? Math.round(selectedDesignPrice * 100)
    : null;

/**
 * Display-only projection. Reuses the Individual block quote and the Step 8
 * onward resolver. Does not write a quote, a payable total, or stored shipping.
 */
export const projectShippingDisplayEstimate = ({
  orderType = null,
  batchType = null,
  garmentCount,
  selectedDesignPrice,
  fulfilmentMethod,
  countryCode = null,
  city = null,
  destinationSelectionMode = null,
}: {
  orderType?: string | null;
  batchType?: string | null;
  garmentCount: number;
  selectedDesignPrice: number | null;
  fulfilmentMethod?: FutureShippingFulfilmentSelection | null;
  countryCode?: string | null;
  city?: string | null;
  destinationSelectionMode?: FutureShippingDestinationSelectionMode | null;
}): ShippingDisplayEstimate => {
  const subtotalCents = subtotalCentsFromPrice(selectedDesignPrice);
  const lagos = resolveIndividualInboundShippingDisplay({
    orderType,
    batchType,
    physicalGarmentCount: garmentCount,
    fulfilmentMethod,
  });
  const lagosAmountCents = lagos?.amountCents ?? null;
  // A second resolver call with one garment distinguishes "this route has no
  // separate Lagos leg" from "the leg applies, but the count cannot be priced".
  const lagosRoute = resolveIndividualInboundShippingDisplay({
    orderType,
    batchType,
    physicalGarmentCount: 1,
    fulfilmentMethod,
  });
  const individualLagosMissing = lagosRoute !== null && lagosAmountCents === null;

  if (!fulfilmentMethod) {
    return {
      subtotalCents,
      lagosAmountCents,
      lagosNote: lagos ? formatIndividualShippingNote(lagos) : null,
      onwardStatus: "not_yet_estimated",
      onwardAmountCents: null,
      onwardLabel: SHIPPING_ONWARD_LEG_LABEL,
      onwardValueLabel: SHIPPING_ONWARD_NOT_YET_ESTIMATED,
      onwardExplanation:
        "Delivery from Eindhoven is not yet estimated. It is not treated as €0.",
      allInEstimateCents: null,
      allInExplanation: null,
    };
  }

  const onward = resolveStep8AdditionalDelivery({
    deliveryMethod: fulfilmentMethod,
    countryCode,
    city,
    physicalGarmentCount: garmentCount,
    destinationSelectionMode,
  });

  let onwardStatus: ShippingOnwardEstimateStatus;
  let onwardAmountCents: number | null = null;
  let onwardValueLabel = SHIPPING_ONWARD_NOT_ESTIMATED;
  let onwardExplanation =
    "Delivery from Eindhoven is unresolved, so there is no all-in estimate.";

  if (onward.status === "resolved" && onward.additionalDeliveryFeeCents !== null) {
    onwardStatus = "resolved";
    onwardAmountCents = onward.additionalDeliveryFeeCents;
    onwardValueLabel = moneyFromCents(onwardAmountCents);
    onwardExplanation =
      fulfilmentMethod === "eindhoven_pickup"
        ? "Included once. Pickup adds no delivery fee from Eindhoven. Lagos → Eindhoven shipping stays separate."
        : "Included once in the estimate. This is optional delivery from Eindhoven, separate from Lagos → Eindhoven.";
  } else if (
    onward.quoteRequired ||
    onward.status === "quote_required" ||
    onward.weightTier === "over_20"
  ) {
    onwardStatus = "unresolved";
    onwardValueLabel =
      onward.weightTier === "over_20"
        ? STEP8_OVER_20_KG_QUOTE_MESSAGE
        : SHIPPING_ONWARD_CUSTOM_QUOTE;
    onwardExplanation =
      "Delivery from Eindhoven stays unresolved. It is not estimated and it is not €0.";
  } else if (onward.diagnosticCode === "COUNTRY_REQUIRED") {
    onwardStatus = "not_yet_estimated";
    onwardValueLabel = SHIPPING_ONWARD_NOT_YET_ESTIMATED;
    onwardExplanation =
      "Delivery from Eindhoven is not yet estimated. It is not treated as €0.";
  } else {
    onwardStatus = "unresolved";
  }

  const allInEstimateCents =
    subtotalCents !== null &&
    onwardStatus === "resolved" &&
    onwardAmountCents !== null &&
    !individualLagosMissing
      ? subtotalCents + (lagosAmountCents ?? 0) + onwardAmountCents
      : null;

  const allInExplanation =
    allInEstimateCents === null
      ? null
      : lagosAmountCents === null
        ? "Estimated total includes the order subtotal and delivery from Eindhoven, each once. Lagos → Eindhoven shipping is not added again."
        : "Estimated total includes the order subtotal, Lagos → Eindhoven shipping, and delivery from Eindhoven, each once. It is not the payable total.";

  return {
    subtotalCents,
    lagosAmountCents,
    lagosNote: lagos ? formatIndividualShippingNote(lagos) : null,
    onwardStatus,
    onwardAmountCents,
    onwardLabel: SHIPPING_ONWARD_LEG_LABEL,
    onwardValueLabel,
    onwardExplanation,
    allInEstimateCents,
    allInExplanation,
  };
};
