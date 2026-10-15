import { calculateIndividualShipping } from "./shippingPricing";

/** Display label for the included Individual inbound leg. */
export const INDIVIDUAL_INBOUND_SHIPPING_DISPLAY_LABEL =
  "Lagos → Eindhoven shipping";

export const INDIVIDUAL_INBOUND_SHIPPING_INCLUDED_LABEL = "Included";

/** Individual construction no longer absorbs the Lagos → Eindhoven band. */
export const INDIVIDUAL_GARMENT_CONSTRUCTION_INCLUSION_NOTE =
  "Includes fabric, tax, and sewing.";

export const INDIVIDUAL_PAYMENT_REVIEW_CONSTRUCTION_NOTE =
  "Fabric, tax, and sewing included.";

/** Cents to add for an Individual order, or null when the band is not charged. */
export const individualLagosToEindhovenChargeCents = (input: {
  orderType?: string | null;
  batchType?: string | null;
  physicalGarmentCount: number;
}): number | null =>
  resolveIndividualInboundShippingDisplay(input)?.amountCents ?? null;

export interface IndividualInboundShippingDisplay {
  readonly label: typeof INDIVIDUAL_INBOUND_SHIPPING_DISPLAY_LABEL;
  readonly includedLabel: typeof INDIVIDUAL_INBOUND_SHIPPING_INCLUDED_LABEL;
  readonly priceEur: number;
  readonly amountCents: number;
  readonly weightBand: ReturnType<typeof calculateIndividualShipping>["weightBand"];
  readonly physicalGarmentCount: number;
}

const isBatchOrder = (input: {
  orderType?: string | null;
  batchType?: string | null;
}): boolean =>
  input.orderType === "Community" ||
  input.orderType === "Group Organizer" ||
  input.orderType === "Group Member" ||
  input.batchType === "community" ||
  input.batchType === "personalized" ||
  input.batchType === "actual";

const isIndividualOrder = (input: {
  orderType?: string | null;
  batchType?: string | null;
}): boolean =>
  !isBatchOrder(input) &&
  (input.orderType === "Individual" || input.batchType === "alone");

/**
 * Individual Lagos→Eindhoven band.
 * Community and other batch routes return null. Callers add `amountCents`
 * to the payable total once.
 */
export const resolveIndividualInboundShippingDisplay = (input: {
  orderType?: string | null;
  batchType?: string | null;
  physicalGarmentCount: number;
}): IndividualInboundShippingDisplay | null => {
  if (!isIndividualOrder(input)) return null;
  if (
    !Number.isInteger(input.physicalGarmentCount) ||
    input.physicalGarmentCount < 1
  ) {
    return null;
  }
  const quote = calculateIndividualShipping(input.physicalGarmentCount);
  return {
    label: INDIVIDUAL_INBOUND_SHIPPING_DISPLAY_LABEL,
    includedLabel: INDIVIDUAL_INBOUND_SHIPPING_INCLUDED_LABEL,
    priceEur: quote.priceEur,
    amountCents: Math.round(quote.priceEur * 100),
    weightBand: quote.weightBand,
    physicalGarmentCount: quote.garmentPieceCount,
  };
};
