export const PRICING_CURRENCY = "EUR" as const;
export const PRICING_CURRENCY_SYMBOL = "€";

export const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const clampDepositPercentage = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
};

export const getDepositRatio = (percentage: number): number =>
  clampDepositPercentage(percentage) / 100;

export const clampRatio = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};
