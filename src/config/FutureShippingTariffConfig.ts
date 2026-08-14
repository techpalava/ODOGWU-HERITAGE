import type { DeliveryAddress } from "../types";

export const FUTURE_SHIPPING_TARIFF_VERSION =
  "2026-08-14-future-shipping-tariff-v1" as const;

export type FutureShippingLeg =
  | "lagos_to_eindhoven"
  | "lagos_to_eindhoven_duty_tax"
  | "eindhoven_collection"
  | "eindhoven_to_final_destination";

export type FutureShippingFulfilmentMethod =
  | "individual_order"
  | "batch_order"
  | "eindhoven_pickup"
  | "destination_delivery";

export type FutureShippingDestinationZone =
  | "EINDHOVEN"
  | "NETHERLANDS_OTHER"
  | "EUROPE"
  | "NORTH_AMERICA"
  | "SOUTH_AMERICA"
  | "AFRICA"
  | "ASIA";

export type FutureShippingPricingUnit =
  | "per_parcel"
  | "per_garment"
  | "unconfirmed";

export type FutureShippingTariffRuleStatus =
  | "active"
  | "pending_confirmation"
  | "unsupported"
  | "rate_unavailable";

export interface FutureShippingWeightBoundary {
  minimumKgInclusive: number;
  maximumKgExclusive: number | null;
}

export interface FutureShippingGarmentCountBoundary {
  minimumInclusive: number;
  maximumInclusive: number | null;
}

export interface FutureShippingTariffRuleV1 {
  schemaVersion: 1;
  tariffVersion: typeof FUTURE_SHIPPING_TARIFF_VERSION;
  ruleId: string;
  shippingLeg: FutureShippingLeg;
  fulfilmentMethod: FutureShippingFulfilmentMethod;
  destinationZoneId: FutureShippingDestinationZone | null;
  currency: "EUR";
  amountCents: number | null;
  candidateAmountsCents?: readonly number[];
  pricingUnit: FutureShippingPricingUnit;
  supportedGarmentCountBoundary: FutureShippingGarmentCountBoundary | null;
  supportedWeightBoundary: FutureShippingWeightBoundary | null;
  minimumBatchSize: number | null;
  status: FutureShippingTariffRuleStatus;
  provenanceNote: string;
  confirmationReason: string | null;
}

export interface FutureShippingCustomerInformation {
  customerName: string;
  contactAddress: DeliveryAddress;
  phone: string;
  email: string;
  customerComment?: string;
}

export interface FutureGarmentWeightReference {
  garmentCount: number;
  weightKg: number;
}

export const FUTURE_GARMENT_WEIGHT_REFERENCES: readonly FutureGarmentWeightReference[] =
  Object.freeze([
    Object.freeze({ garmentCount: 5, weightKg: 2 }),
    Object.freeze({ garmentCount: 12, weightKg: 5 }),
    Object.freeze({ garmentCount: 24, weightKg: 10 }),
    Object.freeze({ garmentCount: 48, weightKg: 20 }),
  ]);
const makeRule = (
  rule: Omit<FutureShippingTariffRuleV1, "schemaVersion" | "tariffVersion">,
): FutureShippingTariffRuleV1 =>
  Object.freeze({
    schemaVersion: 1,
    tariffVersion: FUTURE_SHIPPING_TARIFF_VERSION,
    ...rule,
  });

const FINAL_MILE_BELOW_FIVE_KG: FutureShippingWeightBoundary = Object.freeze({
  minimumKgInclusive: 0,
  maximumKgExclusive: 5,
});

const finalMileRule = (
  ruleId: string,
  destinationZoneId: FutureShippingDestinationZone,
  amountCents: number,
  provenanceNote: string,
): FutureShippingTariffRuleV1 =>
  makeRule({
    ruleId,
    shippingLeg: "eindhoven_to_final_destination",
    fulfilmentMethod: "destination_delivery",
    destinationZoneId,
    currency: "EUR",
    amountCents,
    pricingUnit: "per_parcel",
    supportedGarmentCountBoundary: null,
    supportedWeightBoundary: FINAL_MILE_BELOW_FIVE_KG,
    minimumBatchSize: null,
    status: "active",
    provenanceNote,
    confirmationReason: null,
  });

export const FUTURE_SHIPPING_TARIFF_RULES: readonly FutureShippingTariffRuleV1[] =
  Object.freeze([
    makeRule({
      ruleId: "future_inbound_individual_lagos_eindhoven",
      shippingLeg: "lagos_to_eindhoven",
      fulfilmentMethod: "individual_order",
      destinationZoneId: null,
      currency: "EUR",
      amountCents: null,
      candidateAmountsCents: Object.freeze([12500, 13125]),
      pricingUnit: "per_parcel",
      supportedGarmentCountBoundary: Object.freeze({
        minimumInclusive: 1,
        maximumInclusive: 12,
      }),
      supportedWeightBoundary: Object.freeze({
        minimumKgInclusive: 0,
        maximumKgExclusive: 5,
      }),
      minimumBatchSize: null,
      status: "pending_confirmation",
      provenanceNote:
        "The source mentions approximately NGN 200,000 and EUR 125, while its price column states EUR 131.25 for individual Lagos-to-Eindhoven carriage.",
      confirmationReason:
        "EUR 125 conflicts with EUR 131.25, so no single amount is authoritative.",
    }),
    makeRule({
      ruleId: "future_inbound_batch_lagos_eindhoven",
      shippingLeg: "lagos_to_eindhoven",
      fulfilmentMethod: "batch_order",
      destinationZoneId: null,
      currency: "EUR",
      amountCents: 1509,
      pricingUnit: "unconfirmed",
      supportedGarmentCountBoundary: Object.freeze({
        minimumInclusive: 10,
        maximumInclusive: null,
      }),
      supportedWeightBoundary: null,
      minimumBatchSize: 10,
      status: "pending_confirmation",
      provenanceNote:
        "The source states EUR 15.09 and describes customer payment per garment for a batch of at least ten garments.",
      confirmationReason:
        "The pricing unit must be confirmed before EUR 15.09 can be treated as a per-garment or per-order charge.",
    }),
    makeRule({
      ruleId: "future_duty_tax_batch_lagos_eindhoven",
      shippingLeg: "lagos_to_eindhoven_duty_tax",
      fulfilmentMethod: "batch_order",
      destinationZoneId: null,
      currency: "EUR",
      amountCents: null,
      candidateAmountsCents: Object.freeze([300, 350]),
      pricingUnit: "unconfirmed",
      supportedGarmentCountBoundary: Object.freeze({
        minimumInclusive: 10,
        maximumInclusive: null,
      }),
      supportedWeightBoundary: null,
      minimumBatchSize: 10,
      status: "pending_confirmation",
      provenanceNote:
        "The source mentions approximately NGN 10,000 or EUR 3 for one shirt and approximately EUR 30 for ten shirts, while its price column states EUR 3.50.",
      confirmationReason:
        "EUR 3 conflicts with EUR 3.50 and the taxable unit and calculation basis are not confirmed.",
    }),
    makeRule({
      ruleId: "future_duty_tax_individual_lagos_eindhoven",
      shippingLeg: "lagos_to_eindhoven_duty_tax",
      fulfilmentMethod: "individual_order",
      destinationZoneId: null,
      currency: "EUR",
      amountCents: 7000,
      pricingUnit: "unconfirmed",
      supportedGarmentCountBoundary: null,
      supportedWeightBoundary: null,
      minimumBatchSize: null,
      status: "pending_confirmation",
      provenanceNote:
        "The source price column states EUR 70 for individual duty tax and VAT.",
      confirmationReason:
        "The calculation method and taxable basis remain undetermined.",
    }),
    makeRule({
      ruleId: "future_eindhoven_collection_fee",
      shippingLeg: "eindhoven_collection",
      fulfilmentMethod: "eindhoven_pickup",
      destinationZoneId: "EINDHOVEN",
      currency: "EUR",
      amountCents: null,
      pricingUnit: "unconfirmed",
      supportedGarmentCountBoundary: null,
      supportedWeightBoundary: null,
      minimumBatchSize: null,
      status: "rate_unavailable",
      provenanceNote:
        "The supplied instruction says customers may collect clothes at an arranged Eindhoven location.",
      confirmationReason:
        "No collection or handling fee is supplied, so pickup must not be represented as a zero-priced service.",
    }),
    finalMileRule(
      "future_final_mile_eindhoven_below_5kg",
      "EINDHOVEN",
      975,
      "Supplied baseline delivery within Eindhoven for parcels below 5 kg.",
    ),
    finalMileRule(
      "future_final_mile_netherlands_other_below_5kg",
      "NETHERLANDS_OTHER",
      975,
      "Supplied baseline delivery elsewhere in the Netherlands for parcels below 5 kg.",
    ),
    finalMileRule(
      "future_final_mile_europe_below_5kg",
      "EUROPE",
      2660,
      "Supplied baseline delivery to other parts of Europe for parcels below 5 kg.",
    ),
    finalMileRule(
      "future_final_mile_north_america_below_5kg",
      "NORTH_AMERICA",
      6080,
      "Supplied baseline delivery to North America for parcels below 5 kg.",
    ),
    finalMileRule(
      "future_final_mile_south_america_below_5kg",
      "SOUTH_AMERICA",
      7800,
      "Supplied baseline delivery to South America for parcels below 5 kg.",
    ),
    finalMileRule(
      "future_final_mile_africa_below_5kg",
      "AFRICA",
      7800,
      "Supplied baseline delivery to Africa for parcels below 5 kg.",
    ),
    finalMileRule(
      "future_final_mile_asia_below_5kg",
      "ASIA",
      7800,
      "Supplied baseline delivery to Asia for parcels below 5 kg.",
    ),
  ]);
