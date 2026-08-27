import type {
  FutureShippingDestinationZone,
  FutureShippingFulfilmentSelection,
} from "../types";
import {
  STEP8_ADDITIONAL_DELIVERY_RATES_CENTS,
  STEP8_COUNTRY_ZONE_INDEX,
  STEP8_DELIVERY_RATE_VERSION,
  STEP8_DESTINATION_ZONE_LABELS,
  STEP8_HEADLINE_RATES_CENTS,
  STEP8_KG_PER_PHYSICAL_GARMENT,
  STEP8_PICKUP_FEE_CENTS,
  STEP8_REGION_REQUIRED_COUNTRY_CODES,
  STEP8_RULE_IDS,
  STEP8_WEIGHT_TIER_LABELS,
  formatStep8CountryLabel,
  isSupportedStep8RateVersion,
  type Step8DestinationZone,
  type Step8WeightTier,
} from "../config/Step8AdditionalDeliveryConfig";

export type Step8DeliveryMethod = FutureShippingFulfilmentSelection;

export interface Step8AdditionalDeliveryResolution {
  readonly rateVersion: typeof STEP8_DELIVERY_RATE_VERSION;
  readonly ruleId: string;
  readonly deliveryMethod: Step8DeliveryMethod;
  readonly destinationZone: Step8DestinationZone | null;
  readonly destinationLabel: string | null;
  readonly shipmentWeightKg: number | null;
  readonly weightTier: Step8WeightTier | null;
  readonly weightTierLabel: string | null;
  readonly headlineRateCents: number | null;
  readonly additionalDeliveryFeeCents: number | null;
  readonly quoteRequired: boolean;
  readonly status: "resolved" | "quote_required" | "unavailable";
  readonly diagnosticCode: string | null;
  readonly diagnosticMessage: string | null;
}

const ISO_COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export const normalizeStep8CountryCode = (value: string | null | undefined): string => {
  const normalized = (value || "").trim().toUpperCase();
  if (normalized === "UK") return "GB";
  return normalized;
};

export const isValidIsoCountryCode = (value: string | null | undefined): boolean =>
  ISO_COUNTRY_CODE_PATTERN.test(normalizeStep8CountryCode(value));

export const step8RequiresRegion = (
  countryCode: string | null | undefined,
): boolean =>
  STEP8_REGION_REQUIRED_COUNTRY_CODES.has(normalizeStep8CountryCode(countryCode));

export { isSupportedStep8RateVersion };

export const formatStep8CustomerDestination = ({
  city,
  countryCode,
}: {
  city?: string | null;
  countryCode?: string | null;
}): string | null => {
  const trimmedCity = (city || "").trim().replace(/\s+/g, " ");
  const normalizedCountry = normalizeStep8CountryCode(countryCode);
  const countryLabel = isValidIsoCountryCode(normalizedCountry)
    ? formatStep8CountryLabel(normalizedCountry)
    : "";
  if (trimmedCity && countryLabel) return `${trimmedCity}, ${countryLabel}`;
  if (trimmedCity) return trimmedCity;
  if (countryLabel) return countryLabel;
  return null;
};

export const normalizeStep8City = (value: string | null | undefined): string =>
  (value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

export const isEindhovenCity = (value: string | null | undefined): boolean =>
  normalizeStep8City(value) === "eindhoven";

export const resolveStep8ShipmentWeightKg = (
  physicalGarmentCount: number,
): number | null => {
  if (!Number.isInteger(physicalGarmentCount) || physicalGarmentCount <= 0) {
    return null;
  }
  return physicalGarmentCount * STEP8_KG_PER_PHYSICAL_GARMENT;
};

export const resolveStep8WeightTier = (weightKg: number): Step8WeightTier => {
  if (weightKg <= 2) return "0_2";
  if (weightKg <= 5) return "2_5";
  if (weightKg <= 10) return "5_10";
  if (weightKg <= 20) return "10_20";
  return "over_20";
};

export const resolveStep8DestinationZone = ({
  countryCode,
  city,
}: {
  countryCode?: string | null;
  city?: string | null;
}): {
  zone: Step8DestinationZone | null;
  quoteRequired: boolean;
  diagnosticCode: string | null;
  diagnosticMessage: string | null;
} => {
  const normalizedCountry = normalizeStep8CountryCode(countryCode);
  if (!normalizedCountry) {
    return {
      zone: null,
      quoteRequired: false,
      diagnosticCode: "COUNTRY_REQUIRED",
      diagnosticMessage: "Select a destination country.",
    };
  }
  if (!isValidIsoCountryCode(normalizedCountry)) {
    return {
      zone: null,
      quoteRequired: true,
      diagnosticCode: "COUNTRY_UNSUPPORTED",
      diagnosticMessage: "Custom shipping quote required",
    };
  }
  if (normalizedCountry === "NL") {
    return {
      zone: isEindhovenCity(city) ? "EINDHOVEN" : "NETHERLANDS_OTHER",
      quoteRequired: false,
      diagnosticCode: null,
      diagnosticMessage: null,
    };
  }
  const mapped = STEP8_COUNTRY_ZONE_INDEX.get(normalizedCountry);
  if (mapped && mapped !== "quote_required") {
    return {
      zone: mapped,
      quoteRequired: false,
      diagnosticCode: null,
      diagnosticMessage: null,
    };
  }
  return {
    zone: null,
    quoteRequired: true,
    diagnosticCode: "DESTINATION_QUOTE_REQUIRED",
    diagnosticMessage: "Custom shipping quote required",
  };
};

const unavailable = ({
  deliveryMethod,
  destinationZone,
  shipmentWeightKg,
  weightTier,
  diagnosticCode,
  diagnosticMessage,
  quoteRequired,
}: {
  deliveryMethod: Step8DeliveryMethod;
  destinationZone?: Step8DestinationZone | null;
  shipmentWeightKg?: number | null;
  weightTier?: Step8WeightTier | null;
  diagnosticCode: string;
  diagnosticMessage: string;
  quoteRequired: boolean;
}): Step8AdditionalDeliveryResolution => ({
  rateVersion: STEP8_DELIVERY_RATE_VERSION,
  ruleId: quoteRequired ? STEP8_RULE_IDS.quoteRequired : STEP8_RULE_IDS.courier,
  deliveryMethod,
  destinationZone: destinationZone ?? null,
  destinationLabel: destinationZone
    ? STEP8_DESTINATION_ZONE_LABELS[destinationZone]
    : null,
  shipmentWeightKg: shipmentWeightKg ?? null,
  weightTier: weightTier ?? null,
  weightTierLabel: weightTier ? STEP8_WEIGHT_TIER_LABELS[weightTier] : null,
  headlineRateCents: destinationZone
    ? STEP8_HEADLINE_RATES_CENTS[destinationZone]
    : null,
  additionalDeliveryFeeCents: null,
  quoteRequired,
  status: quoteRequired ? "quote_required" : "unavailable",
  diagnosticCode,
  diagnosticMessage,
});

/**
 * Authoritative Step 8 additional-delivery resolver.
 * Never accepts a client-supplied fee. Recompute from garment count, ISO country,
 * and city (for Eindhoven) using rate version step8-delivery-v1.
 */
export const resolveStep8AdditionalDelivery = ({
  deliveryMethod,
  countryCode,
  city,
  physicalGarmentCount,
}: {
  deliveryMethod: Step8DeliveryMethod;
  countryCode?: string | null;
  city?: string | null;
  physicalGarmentCount: number;
}): Step8AdditionalDeliveryResolution => {
  const shipmentWeightKg = resolveStep8ShipmentWeightKg(physicalGarmentCount);
  const weightTier =
    shipmentWeightKg === null ? null : resolveStep8WeightTier(shipmentWeightKg);

  if (deliveryMethod === "eindhoven_pickup") {
    if (shipmentWeightKg === null || !weightTier) {
      return unavailable({
        deliveryMethod,
        diagnosticCode: "INVALID_GARMENT_COUNT",
        diagnosticMessage: "A positive whole garment count is required.",
        quoteRequired: false,
      });
    }
    return {
      rateVersion: STEP8_DELIVERY_RATE_VERSION,
      ruleId: STEP8_RULE_IDS.pickup,
      deliveryMethod,
      destinationZone: "EINDHOVEN",
      destinationLabel: "Pick Up in Eindhoven",
      shipmentWeightKg,
      weightTier,
      weightTierLabel: STEP8_WEIGHT_TIER_LABELS[weightTier],
      headlineRateCents: STEP8_PICKUP_FEE_CENTS,
      additionalDeliveryFeeCents: STEP8_PICKUP_FEE_CENTS,
      quoteRequired: false,
      status: "resolved",
      diagnosticCode: null,
      diagnosticMessage: null,
    };
  }

  if (shipmentWeightKg === null || !weightTier) {
    return unavailable({
      deliveryMethod,
      diagnosticCode: "INVALID_GARMENT_COUNT",
      diagnosticMessage: "A positive whole garment count is required.",
      quoteRequired: false,
    });
  }

  const zoneResolution = resolveStep8DestinationZone({ countryCode, city });
  if (zoneResolution.quoteRequired || !zoneResolution.zone) {
    return unavailable({
      deliveryMethod,
      shipmentWeightKg,
      weightTier,
      diagnosticCode: zoneResolution.diagnosticCode || "DESTINATION_QUOTE_REQUIRED",
      diagnosticMessage:
        zoneResolution.diagnosticMessage || "Custom shipping quote required",
      quoteRequired: zoneResolution.quoteRequired || Boolean(countryCode),
    });
  }

  if (weightTier === "over_20") {
    return unavailable({
      deliveryMethod,
      destinationZone: zoneResolution.zone,
      shipmentWeightKg,
      weightTier,
      diagnosticCode: "WEIGHT_QUOTE_REQUIRED",
      diagnosticMessage: "Custom shipping quote required",
      quoteRequired: true,
    });
  }

  const additionalDeliveryFeeCents =
    STEP8_ADDITIONAL_DELIVERY_RATES_CENTS[zoneResolution.zone][weightTier];

  return {
    rateVersion: STEP8_DELIVERY_RATE_VERSION,
    ruleId: STEP8_RULE_IDS.courier,
    deliveryMethod,
    destinationZone: zoneResolution.zone,
    destinationLabel: STEP8_DESTINATION_ZONE_LABELS[zoneResolution.zone],
    shipmentWeightKg,
    weightTier,
    weightTierLabel: STEP8_WEIGHT_TIER_LABELS[weightTier],
    headlineRateCents: STEP8_HEADLINE_RATES_CENTS[zoneResolution.zone],
    additionalDeliveryFeeCents,
    quoteRequired: false,
    status: "resolved",
    diagnosticCode: null,
    diagnosticMessage: null,
  };
};

export const getStep8HeadlineRateCents = (
  zone: FutureShippingDestinationZone,
): number => STEP8_HEADLINE_RATES_CENTS[zone];
