export const FUTURE_ORDER_V2_STRIPE_CURRENCY = "eur";

export const FUTURE_ORDER_V2_STRIPE_METHOD_ORDER = ["card", "ideal", "klarna"] as const;

export type FutureOrderV2StripeAccountMethod =
  (typeof FUTURE_ORDER_V2_STRIPE_METHOD_ORDER)[number];

/**
 * Methods this Stripe account can charge for a currency.
 * Klarna on this account is USD-only. iDEAL is EUR-only. Card works for both.
 * Asking Stripe for any other pair rejects the PaymentIntent.
 */
const METHODS_BY_CURRENCY: Record<string, readonly FutureOrderV2StripeAccountMethod[]> = {
  eur: ["card", "ideal"],
  usd: ["card", "klarna"],
};

export const futureOrderV2StripePaymentMethodTypes = (
  currency: string,
): readonly FutureOrderV2StripeAccountMethod[] => {
  const normalized = currency.trim().toLowerCase();
  return METHODS_BY_CURRENCY[normalized] ?? ["card"];
};

/** Euro checkout methods. Future Order V2 charges EUR. */
export const FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES =
  futureOrderV2StripePaymentMethodTypes(FUTURE_ORDER_V2_STRIPE_CURRENCY);

export const futureOrderV2StripeMethodIsOffered = (
  method: string,
  offered: readonly string[] = FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES,
): boolean => offered.includes(method);
