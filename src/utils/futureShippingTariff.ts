import {
  FUTURE_GARMENT_WEIGHT_REFERENCES,
  FUTURE_SHIPPING_TARIFF_RULES,
  type FutureShippingDestinationZone,
  type FutureShippingFulfilmentMethod,
  type FutureShippingTariffRuleV1,
} from "../config/FutureShippingTariffConfig";

export type FutureShippingTariffDiagnosticCode =
  | "INVALID_GARMENT_COUNT"
  | "GARMENT_COUNT_ESTIMATE_PENDING"
  | "INVALID_WEIGHT"
  | "WEIGHT_REQUIRED"
  | "WEIGHT_OUTSIDE_BASELINE"
  | "DESTINATION_REQUIRED"
  | "DESTINATION_UNSUPPORTED"
  | "PICKUP_FEE_PENDING"
  | "RULE_PENDING_CONFIRMATION"
  | "RULE_NOT_PENDING"
  | "RULE_NOT_FOUND";

export interface FutureShippingTariffDiagnostic {
  code: FutureShippingTariffDiagnosticCode;
  message: string;
}

export type FutureShippingTariffResolutionStatus =
  | "resolved_baseline"
  | "pending_confirmation"
  | "estimate_pending"
  | "pickup_fee_pending"
  | "quote_required"
  | "rate_unavailable";

export interface FutureShippingTariffResolution {
  status: FutureShippingTariffResolutionStatus;
  rule: FutureShippingTariffRuleV1 | null;
  amountCents: number | null;
  currency: "EUR" | null;
  diagnostic: FutureShippingTariffDiagnostic | null;
}

export type FutureGarmentWeightReferenceResolution =
  | {
      status: "exact";
      garmentCount: number;
      weightKg: number;
      diagnostic: null;
    }
  | {
      status: "estimate_pending" | "rate_unavailable";
      garmentCount: number | null;
      weightKg: null;
      diagnostic: FutureShippingTariffDiagnostic;
    };

const isPositiveInteger = (value: number): boolean =>
  Number.isInteger(value) && value > 0;

export const resolveFutureGarmentCountWeightReference = (
  garmentCount: number,
): FutureGarmentWeightReferenceResolution => {
  if (!isPositiveInteger(garmentCount)) {
    return {
      status: "rate_unavailable",
      garmentCount: null,
      weightKg: null,
      diagnostic: {
        code: "INVALID_GARMENT_COUNT",
        message: "A positive whole garment count is required.",
      },
    };
  }

  const exactReference = FUTURE_GARMENT_WEIGHT_REFERENCES.find(
    (reference) => reference.garmentCount === garmentCount,
  );
  if (exactReference) {
    return {
      status: "exact",
      garmentCount: exactReference.garmentCount,
      weightKg: exactReference.weightKg,
      diagnostic: null,
    };
  }

  return {
    status: "estimate_pending",
    garmentCount,
    weightKg: null,
    diagnostic: {
      code: "GARMENT_COUNT_ESTIMATE_PENDING",
      message:
        "No authoritative weight is supplied for this garment count. A parcel estimate or actual weight is required.",
    },
  };
};

const getFutureShippingTariffRule = (
  ruleId: string,
): FutureShippingTariffRuleV1 | null =>
  FUTURE_SHIPPING_TARIFF_RULES.find((rule) => rule.ruleId === ruleId) || null;

export const resolveFuturePendingTariffRule = (
  ruleId: string,
): FutureShippingTariffResolution => {
  const rule = getFutureShippingTariffRule(ruleId);
  if (!rule) {
    return {
      status: "rate_unavailable",
      rule: null,
      amountCents: null,
      currency: null,
      diagnostic: {
        code: "RULE_NOT_FOUND",
        message: "No future shipping tariff rule matches this stable ID.",
      },
    };
  }

  if (rule.status !== "pending_confirmation") {
    return {
      status: "rate_unavailable",
      rule,
      amountCents: null,
      currency: rule.currency,
      diagnostic: {
        code: "RULE_NOT_PENDING",
        message: "This rule is not a pending-confirmation tariff.",
      },
    };
  }

  return {
    status: "pending_confirmation",
    rule,
    amountCents: null,
    currency: rule.currency,
    diagnostic: {
      code: "RULE_PENDING_CONFIRMATION",
      message:
        rule.confirmationReason || "This tariff requires business confirmation.",
    },
  };
};

const isDestinationZone = (
  value: string,
): value is FutureShippingDestinationZone =>
  FUTURE_SHIPPING_TARIFF_RULES.some(
    (rule) =>
      rule.shippingLeg === "eindhoven_to_final_destination" &&
      rule.destinationZoneId === value,
  );

export const resolveFutureFinalMileBaseline = ({
  fulfilmentMethod,
  destinationZoneId,
  parcelWeightKg,
}: {
  fulfilmentMethod: Extract<
    FutureShippingFulfilmentMethod,
    "eindhoven_pickup" | "destination_delivery"
  >;
  destinationZoneId?: string | null;
  parcelWeightKg?: number | null;
}): FutureShippingTariffResolution => {
  if (fulfilmentMethod === "eindhoven_pickup") {
    const pickupRule = getFutureShippingTariffRule(
      "future_eindhoven_collection_fee",
    );
    return {
      status: "pickup_fee_pending",
      rule: pickupRule,
      amountCents: null,
      currency: pickupRule?.currency || "EUR",
      diagnostic: {
        code: "PICKUP_FEE_PENDING",
        message:
          "Final-destination delivery is not applicable to Eindhoven collection, and no collection fee has been confirmed.",
      },
    };
  }

  if (!destinationZoneId) {
    return {
      status: "rate_unavailable",
      rule: null,
      amountCents: null,
      currency: null,
      diagnostic: {
        code: "DESTINATION_REQUIRED",
        message: "A stable destination-zone ID is required.",
      },
    };
  }

  if (!isDestinationZone(destinationZoneId)) {
    return {
      status: "quote_required",
      rule: null,
      amountCents: null,
      currency: null,
      diagnostic: {
        code: "DESTINATION_UNSUPPORTED",
        message: "This destination zone requires a shipping quote.",
      },
    };
  }

  if (parcelWeightKg === null || parcelWeightKg === undefined) {
    return {
      status: "rate_unavailable",
      rule: null,
      amountCents: null,
      currency: null,
      diagnostic: {
        code: "WEIGHT_REQUIRED",
        message: "Parcel weight is required to resolve this baseline rate.",
      },
    };
  }

  if (!Number.isFinite(parcelWeightKg) || parcelWeightKg <= 0) {
    return {
      status: "rate_unavailable",
      rule: null,
      amountCents: null,
      currency: null,
      diagnostic: {
        code: "INVALID_WEIGHT",
        message: "Parcel weight must be a positive finite number.",
      },
    };
  }

  const rule = FUTURE_SHIPPING_TARIFF_RULES.find(
    (candidate) =>
      candidate.shippingLeg === "eindhoven_to_final_destination" &&
      candidate.fulfilmentMethod === "destination_delivery" &&
      candidate.destinationZoneId === destinationZoneId,
  );
  const boundary = rule?.supportedWeightBoundary;
  if (
    !rule ||
    !boundary ||
    parcelWeightKg < boundary.minimumKgInclusive ||
    (boundary.maximumKgExclusive !== null &&
      parcelWeightKg >= boundary.maximumKgExclusive)
  ) {
    return {
      status: "quote_required",
      rule: rule || null,
      amountCents: null,
      currency: rule?.currency || null,
      diagnostic: {
        code: "WEIGHT_OUTSIDE_BASELINE",
        message:
          "The supplied final-destination baseline applies only below 5 kg. A quote is required for this weight.",
      },
    };
  }

  return {
    status: "resolved_baseline",
    rule,
    amountCents: rule.amountCents,
    currency: rule.currency,
    diagnostic: null,
  };
};

export const resolveFutureFinalMileFromGarmentCount = ({
  fulfilmentMethod,
  destinationZoneId,
  garmentCount,
}: {
  fulfilmentMethod: Extract<
    FutureShippingFulfilmentMethod,
    "eindhoven_pickup" | "destination_delivery"
  >;
  destinationZoneId?: string | null;
  garmentCount: number;
}): FutureShippingTariffResolution => {
  if (fulfilmentMethod === "eindhoven_pickup") {
    return resolveFutureFinalMileBaseline({ fulfilmentMethod });
  }

  const weightReference = resolveFutureGarmentCountWeightReference(garmentCount);
  if (weightReference.status !== "exact") {
    return {
      status: weightReference.status,
      rule: null,
      amountCents: null,
      currency: null,
      diagnostic: weightReference.diagnostic,
    };
  }

  return resolveFutureFinalMileBaseline({
    fulfilmentMethod,
    destinationZoneId,
    parcelWeightKg: weightReference.weightKg,
  });
};
