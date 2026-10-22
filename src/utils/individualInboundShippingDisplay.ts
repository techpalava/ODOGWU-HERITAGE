import {
  calculateIndividualShipping,
  INDIVIDUAL_SHIPPING_BLOCK_PRICE_CENTS,
  INDIVIDUAL_SHIPPING_GARMENTS_PER_BLOCK,
  INDIVIDUAL_SHIPPING_KG_PER_BLOCK,
} from "./shippingPricing.js";

/** Display label for the included Individual inbound leg. */
export const INDIVIDUAL_INBOUND_SHIPPING_DISPLAY_LABEL =
  "Lagos → Eindhoven shipping";

export const INDIVIDUAL_INBOUND_SHIPPING_INCLUDED_LABEL = "Included";

/** Individual construction no longer absorbs the Lagos → Eindhoven band. */
export const INDIVIDUAL_GARMENT_CONSTRUCTION_INCLUSION_NOTE =
  "Includes fabric, tax, and sewing.";

export const INDIVIDUAL_PAYMENT_REVIEW_CONSTRUCTION_NOTE =
  "Fabric, tax, and sewing included.";

/**
 * Cents to add for an Individual order, or null when Lagos → Eindhoven
 * shipping is not charged. Garment count is the number of garment rows
 * (`candidate.garments.length` / `summary.garmentSummary.length`); a set
 * counts as 1 even when it has several physicalComponents.
 */
export const individualLagosToEindhovenChargeCents = (input: {
  orderType?: string | null;
  batchType?: string | null;
  physicalGarmentCount: number;
  fulfilmentMethod?: string | null;
}): number | null =>
  resolveIndividualInboundShippingDisplay(input)?.amountCents ?? null;

export interface IndividualInboundShippingDisplay {
  readonly label: typeof INDIVIDUAL_INBOUND_SHIPPING_DISPLAY_LABEL;
  readonly includedLabel: typeof INDIVIDUAL_INBOUND_SHIPPING_INCLUDED_LABEL;
  readonly priceEur: number;
  readonly amountCents: number;
  readonly weightBand: ReturnType<typeof calculateIndividualShipping>["weightBand"];
  readonly physicalGarmentCount: number;
  readonly garmentCount: number;
  readonly blockCount: number;
  readonly coveredGarments: number;
  readonly coveredWeightKg: number;
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

const formatBlockPriceEur = (): string =>
  `€${(INDIVIDUAL_SHIPPING_BLOCK_PRICE_CENTS / 100).toFixed(2)}`;

/**
 * Shown only when there is a Lagos charge (Individual home delivery).
 * Never used for Eindhoven pickup or Community/batch orders.
 */
export const formatIndividualShippingNote = (
  display: IndividualInboundShippingDisplay,
): string => {
  const baseline = `Shipping covers up to ${INDIVIDUAL_SHIPPING_GARMENTS_PER_BLOCK} garments (under ${INDIVIDUAL_SHIPPING_KG_PER_BLOCK} kg).`;
  if (display.blockCount < 2) return baseline;
  return `${baseline} Your order has ${display.garmentCount} garments, so it uses the ${display.coveredWeightKg} kg range: ${display.blockCount} × ${formatBlockPriceEur()}.`;
};

/**
 * Individual Lagos→Eindhoven block charge.
 * Community, other batch routes, and Eindhoven pickup return null.
 * Callers add `amountCents` to the payable total once. Pickup never
 * carries this charge, even when an older draft still has a delivery quote.
 */
export const resolveIndividualInboundShippingDisplay = (input: {
  orderType?: string | null;
  batchType?: string | null;
  physicalGarmentCount: number;
  fulfilmentMethod?: string | null;
}): IndividualInboundShippingDisplay | null => {
  if (input.fulfilmentMethod === "eindhoven_pickup") return null;
  if (!isIndividualOrder(input)) return null;
  if (
    !Number.isInteger(input.physicalGarmentCount) ||
    input.physicalGarmentCount < 1
  ) {
    return null;
  }
  const quote = calculateIndividualShipping(input.physicalGarmentCount);
  const blockCount = quote.blockCount ?? 1;
  const coveredWeightKg =
    quote.coveredWeightKg ?? blockCount * INDIVIDUAL_SHIPPING_KG_PER_BLOCK;
  return {
    label: INDIVIDUAL_INBOUND_SHIPPING_DISPLAY_LABEL,
    includedLabel: INDIVIDUAL_INBOUND_SHIPPING_INCLUDED_LABEL,
    priceEur: quote.priceEur,
    amountCents: blockCount * INDIVIDUAL_SHIPPING_BLOCK_PRICE_CENTS,
    weightBand: quote.weightBand,
    physicalGarmentCount: quote.garmentPieceCount,
    garmentCount: quote.garmentPieceCount,
    blockCount,
    coveredGarments: blockCount * INDIVIDUAL_SHIPPING_GARMENTS_PER_BLOCK,
    coveredWeightKg,
  };
};
