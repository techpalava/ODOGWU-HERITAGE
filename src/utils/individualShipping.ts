import type { CartItem, GarmentSelection } from "../types";

export const LAGOS_EINDHOVEN_EXCHANGE_RATE_NGN_PER_EUR = 1600;
export const GARMENT_WEIGHT_KG = 5 / 12;

export interface IndividualShippingQuote {
  routeId: "LAGOS_EINDHOVEN";
  origin: "Lagos";
  destination: "Eindhoven";
  garmentPieceCount: number;
  estimatedWeightKg: number;
  weightBand: "0 - 2 kg" | ">2 - 5 kg" | ">5 - 10 kg" | ">10 - 20 kg" | ">20 kg";
  priceEur: number;
  priceNgn: number;
  exchangeRateNgnPerEur: number;
}

export interface CartPricingSummary {
  garmentSubtotal: number;
  shippingTotal: number;
  total: number;
  depositDueNow: number;
  remainingDue: number;
  shippingQuote: IndividualShippingQuote | null;
}

export const getGarmentPieceCount = (composition?: string): number => {
  if (!composition) return 1;

  const numericComposition = composition.match(/(\d+)\s*-\s*piece/i);
  if (numericComposition) {
    return Math.max(1, Number.parseInt(numericComposition[1], 10));
  }

  const normalized = composition.toLowerCase();
  if (
    normalized.includes("couple") ||
    normalized.includes("parent & child") ||
    normalized.includes("parent and child")
  ) {
    return 2;
  }
  if (normalized.includes("family")) return 4;

  return 1;
};

export const calculateIndividualShipping = (
  garmentPieceCount: number,
): IndividualShippingQuote => {
  const normalizedPieceCount = Math.max(1, Math.ceil(garmentPieceCount));
  const estimatedWeightKg = Math.max(
    2,
    normalizedPieceCount * GARMENT_WEIGHT_KG,
  );

  let weightBand: IndividualShippingQuote["weightBand"];
  let priceEur: number;

  if (estimatedWeightKg <= 2) {
    weightBand = "0 - 2 kg";
    priceEur = 131.25;
  } else if (estimatedWeightKg <= 5) {
    weightBand = ">2 - 5 kg";
    priceEur = 131.25;
  } else if (estimatedWeightKg <= 10) {
    weightBand = ">5 - 10 kg";
    priceEur = 236.25;
  } else if (estimatedWeightKg <= 20) {
    weightBand = ">10 - 20 kg";
    priceEur = 425.25;
  } else {
    weightBand = ">20 kg";
    priceEur = 765.45;
  }

  return {
    routeId: "LAGOS_EINDHOVEN",
    origin: "Lagos",
    destination: "Eindhoven",
    garmentPieceCount: normalizedPieceCount,
    estimatedWeightKg: Number(estimatedWeightKg.toFixed(2)),
    weightBand,
    priceEur,
    priceNgn: Math.round(
      priceEur * LAGOS_EINDHOVEN_EXCHANGE_RATE_NGN_PER_EUR,
    ),
    exchangeRateNgnPerEur: LAGOS_EINDHOVEN_EXCHANGE_RATE_NGN_PER_EUR,
  };
};

export const getStoredIndividualShippingCost = (
  garment: GarmentSelection,
): number =>
  garment.individualShipping?.priceEur ?? garment.courierSurcharge ?? 0;

export const calculateCartPricing = (
  cartItems: CartItem[],
  depositRatio: number,
): CartPricingSummary => {
  const garmentSubtotal = cartItems.reduce(
    (total, item) =>
      total +
      Math.max(
        0,
        item.garment.totalPrice -
          getStoredIndividualShippingCost(item.garment),
      ),
    0,
  );

  const individualPieceCount = cartItems.reduce((total, item) => {
    if (item.batchType !== "alone") return total;
    return total + (item.garment.individualShipping?.garmentPieceCount ?? 1);
  }, 0);

  const shippingQuote =
    individualPieceCount > 0
      ? calculateIndividualShipping(individualPieceCount)
      : null;
  const shippingTotal = shippingQuote?.priceEur ?? 0;
  const garmentDeposit = garmentSubtotal * depositRatio;

  return {
    garmentSubtotal,
    shippingTotal,
    total: garmentSubtotal + shippingTotal,
    depositDueNow: garmentDeposit + shippingTotal,
    remainingDue: garmentSubtotal - garmentDeposit,
    shippingQuote,
  };
};
