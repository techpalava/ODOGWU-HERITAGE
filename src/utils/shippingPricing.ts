import type {
  BatchShippingSnapshot,
  CartItem,
  GarmentSelection,
  IndividualShippingSnapshot,
} from "../types";
import { clampRatio, roundMoney } from "./money";

export const LAGOS_EINDHOVEN_EXCHANGE_RATE_NGN_PER_EUR = 1600;
export const GARMENT_WEIGHT_KG = 5 / 12;
export const BATCH_SHIPPING_PRICING_VERSION = "2026-07-30-flat-v1" as const;
export const BATCH_FLAT_RATE_EUR_PER_GARMENT = 15.09;
export const BATCH_MINIMUM_GARMENTS = 10;

export const BATCH_SHIPPING_POLICY = Object.freeze({
  rateModel: "FLAT_PER_GARMENT" as const,
  rateEurPerGarment: BATCH_FLAT_RATE_EUR_PER_GARMENT,
  minimumBatchGarments: BATCH_MINIMUM_GARMENTS,
  allowsSplitShipments: true,
});

export type IndividualShippingQuote = IndividualShippingSnapshot;
export type BatchShippingQuote = BatchShippingSnapshot;

export interface CartPricingSummary {
  garmentSubtotal: number;
  shippingTotal: number;
  total: number;
  depositDueNow: number;
  remainingDue: number;
  individualShippingQuote: IndividualShippingQuote | null;
  batchShippingQuotes: BatchShippingQuote[];
  // Compatibility for existing consumers while they migrate to the explicit name.
  shippingQuote: IndividualShippingQuote | null;
}

interface BatchShippingInput {
  batchId: string;
  batchName: string;
  plannedGarmentCapacity: number;
  garmentPieceCount: number;
}

const normalizePositiveInteger = (value: number): number =>
  Math.max(1, Math.ceil(Number.isFinite(value) ? value : 1));

export const getGarmentPieceCount = (composition?: string): number => {
  if (!composition) return 1;

  const numericComposition = composition.match(/(\d+)\s*-\s*piece/i);
  if (numericComposition) {
    return normalizePositiveInteger(Number.parseInt(numericComposition[1], 10));
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
  const normalizedPieceCount = normalizePositiveInteger(garmentPieceCount);
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

export const calculateBatchShipping = ({
  batchId,
  batchName,
  plannedGarmentCapacity,
  garmentPieceCount,
}: BatchShippingInput): BatchShippingQuote => {
  const normalizedCapacity = normalizePositiveInteger(plannedGarmentCapacity);
  const normalizedPieceCount = normalizePositiveInteger(garmentPieceCount);
  const exactRateEurPerGarment = BATCH_SHIPPING_POLICY.rateEurPerGarment;
  const rateNgnPerGarment = Math.round(
    exactRateEurPerGarment *
      LAGOS_EINDHOVEN_EXCHANGE_RATE_NGN_PER_EUR,
  );
  const priceEur = roundMoney(
    exactRateEurPerGarment * normalizedPieceCount,
  );
  const priceNgn = rateNgnPerGarment * normalizedPieceCount;

  return {
    routeId: "LAGOS_EINDHOVEN_BATCH",
    pricingVersion: BATCH_SHIPPING_PRICING_VERSION,
    rateModel: BATCH_SHIPPING_POLICY.rateModel,
    origin: "Lagos",
    destination: "Eindhoven",
    batchId: batchId.trim() || "UNASSIGNED-BATCH",
    batchName: batchName.trim() || "Batch Order",
    plannedGarmentCapacity: normalizedCapacity,
    capacityBand: "10+ garments",
    minimumBatchGarments: BATCH_SHIPPING_POLICY.minimumBatchGarments,
    allowsSplitShipments: BATCH_SHIPPING_POLICY.allowsSplitShipments,
    garmentPieceCount: normalizedPieceCount,
    exactRateEurPerGarment,
    rateNgnPerGarment,
    priceEur,
    priceNgn,
    exchangeRateNgnPerEur: LAGOS_EINDHOVEN_EXCHANGE_RATE_NGN_PER_EUR,
  };
};

export const getStoredShippingCost = (
  garment: GarmentSelection,
): number =>
  garment.individualShipping?.priceEur ??
  garment.batchShipping?.priceEur ??
  garment.courierSurcharge ??
  0;

export const getStoredIndividualShippingCost = (
  garment: GarmentSelection,
): number => getStoredShippingCost(garment);

const isBatchRoute = (item: CartItem): boolean =>
  item.batchType === "community" ||
  item.batchType === "personalized" ||
  item.batchType === "actual";

export const calculateCartPricing = (
  cartItems: CartItem[],
  depositRatio: number,
): CartPricingSummary => {
  const normalizedDepositRatio = clampRatio(depositRatio);
  const garmentSubtotal = roundMoney(
    cartItems.reduce(
      (total, item) =>
        total +
        Math.max(
          0,
          item.garment.totalPrice - getStoredShippingCost(item.garment),
        ),
      0,
    ),
  );

  const individualPieceCount = cartItems.reduce((total, item) => {
    if (item.batchType !== "alone") return total;
    return total + (item.garment.individualShipping?.garmentPieceCount ?? 1);
  }, 0);

  const individualShippingQuote =
    individualPieceCount > 0
      ? calculateIndividualShipping(individualPieceCount)
      : null;

  const batchGroups = new Map<
    string,
    {
      batchId: string;
      batchName: string;
      plannedGarmentCapacity: number;
      garmentPieceCount: number;
    }
  >();

  cartItems.forEach((item) => {
    if (!isBatchRoute(item) || !item.garment.batchShipping) return;

    const snapshot = item.garment.batchShipping;
    const key = snapshot.batchId || item.batchId || item.customGroupCode || item.batchName;
    const existing = batchGroups.get(key);

    if (existing) {
      existing.garmentPieceCount += snapshot.garmentPieceCount;
      return;
    }

    batchGroups.set(key, {
      batchId: snapshot.batchId,
      batchName: snapshot.batchName,
      plannedGarmentCapacity: snapshot.plannedGarmentCapacity,
      garmentPieceCount: snapshot.garmentPieceCount,
    });
  });

  const batchShippingQuotes = Array.from(batchGroups.values()).map(
    calculateBatchShipping,
  );
  const shippingTotal = roundMoney(
    (individualShippingQuote?.priceEur ?? 0) +
      batchShippingQuotes.reduce((total, quote) => total + quote.priceEur, 0),
  );
  const garmentDeposit = roundMoney(
    garmentSubtotal * normalizedDepositRatio,
  );

  return {
    garmentSubtotal,
    shippingTotal,
    total: roundMoney(garmentSubtotal + shippingTotal),
    depositDueNow: roundMoney(garmentDeposit + shippingTotal),
    remainingDue: roundMoney(garmentSubtotal - garmentDeposit),
    individualShippingQuote,
    batchShippingQuotes,
    shippingQuote: individualShippingQuote,
  };
};
