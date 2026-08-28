import {
  STEP8_DELIVERY_RATE_VERSION,
  STEP8_DESTINATION_ZONE_LABELS,
  STEP8_DESTINATION_ZONES,
  formatStep8CountryLabel,
  isStep8CustomerSelectableCountry,
  isStep8DestinationZone,
  type Step8WeightTier,
} from "../config/Step8AdditionalDeliveryConfig";
import type {
  FutureShippingDestinationSelectionMode,
  FutureShippingDestinationZone,
  FutureShippingQuoteReferenceV1,
  FutureShippingStateV1,
  FutureShippingFulfilmentSelection,
  FutureShippingWeightTier,
} from "../types";
import type { FutureDesignStudioSummaryStatus } from "./designStudioFutureSummary";
import { PRICING_CURRENCY_SYMBOL } from "./money";
import {
  formatStep8CustomerDestination,
  isStep8FakeCountryCode,
  isValidIsoCountryCode,
  normalizeStep8CountryCode,
  resolveStep8AdditionalDelivery,
  step8RequiresRegion,
} from "./step8AdditionalDelivery";

export const FUTURE_SHIPPING_STATE_SCHEMA_VERSION = 1 as const;

export const FUTURE_SHIPPING_DESTINATION_ZONE_OPTIONS: readonly {
  id: FutureShippingDestinationZone;
  label: string;
}[] = Object.freeze(
  STEP8_DESTINATION_ZONES.map((id) =>
    Object.freeze({
      id,
      label: STEP8_DESTINATION_ZONE_LABELS[id],
    }),
  ),
);

export type FutureShippingStageStatus =
  | "incomplete"
  | "invalid"
  | "quote_pending"
  | "quote_ready"
  | "quote_unavailable"
  | "quote_stale"
  | "pickup_arrangement_pending";

export type FutureShippingFieldId =
  | "fulfilmentMethod"
  | "fullName"
  | "phone"
  | "email"
  | "addressLine1"
  | "city"
  | "postalCode"
  | "countryCode"
  | "destinationZoneId"
  | "state"
  | "stateRegion"
  | "otherDestinationCountry";

export interface FutureShippingStageDiagnostic {
  code: string;
  field: FutureShippingFieldId;
  message: string;
}

export interface FutureShippingStageResolution {
  state: FutureShippingStateV1;
  status: FutureShippingStageStatus;
  customerInformationComplete: boolean;
  formInputsComplete: boolean;
  formComplete: boolean;
  quoteReady: boolean;
  quoteRequired: boolean;
  diagnostics: FutureShippingStageDiagnostic[];
  postEindhovenAdjustmentCents: number | null;
  projectedTotalCents: number | null;
  destinationLabel: string | null;
  parcelWeightKg: number | null;
  weightTier: FutureShippingWeightTier | null;
  rateVersion: typeof STEP8_DELIVERY_RATE_VERSION;
  paymentLocked: true;
}

export interface FutureShippingStateNormalization {
  state: FutureShippingStateV1;
  diagnostics: FutureShippingStageDiagnostic[];
}

const MAX_LENGTHS = Object.freeze({
  fullName: 120,
  phone: 60,
  email: 254,
  addressLine1: 200,
  addressLine2: 200,
  city: 120,
  stateRegion: 120,
  postalCode: 32,
  countryCode: 8,
  otherDestinationCountry: 80,
  comment: 1000,
});

const FULFILMENT_METHODS = new Set<FutureShippingFulfilmentSelection>([
  "eindhoven_pickup",
  "destination_delivery",
]);

const emptyAddress = () => ({
  addressLine1: "",
  addressLine2: "",
  city: "",
  stateRegion: "",
  postalCode: "",
  countryCode: "",
});

export const createEmptyFutureShippingState = (): FutureShippingStateV1 => ({
  schemaVersion: FUTURE_SHIPPING_STATE_SCHEMA_VERSION,
  fulfilmentMethod: null,
  destinationSelectionMode: null,
  otherDestinationCountry: "",
  customerInformation: {
    fullName: "",
    phone: "",
    email: "",
    deliveryAddress: emptyAddress(),
    comment: "",
  },
  destinationZoneId: null,
  destinationZoneSource: null,
  quoteReference: null,
});

const normalizeText = ({
  value,
  maximumLength,
  multiline = false,
}: {
  value: unknown;
  maximumLength: number;
  multiline?: boolean;
}): { value: string; malformed: boolean } => {
  if (value === undefined || value === null) {
    return { value: "", malformed: false };
  }
  if (typeof value !== "string") {
    return { value: "", malformed: true };
  }
  const normalizedLineEndings = value.replace(/\r\n?/g, "\n");
  const normalized = multiline
    ? normalizedLineEndings.trim()
    : normalizedLineEndings.replace(/\n+/g, " ").trim();
  return {
    value: normalized.slice(0, maximumLength),
    malformed: normalized.length > maximumLength,
  };
};

const isDestinationSelectionMode = (
  value: unknown,
): value is FutureShippingDestinationSelectionMode =>
  value === "supported_country" || value === "other_destination";

const resolveDestinationSelection = ({
  fulfilmentMethod,
  requestedMode,
  countryCode,
  otherDestinationCountry,
}: {
  fulfilmentMethod: FutureShippingFulfilmentSelection | null;
  requestedMode: unknown;
  countryCode: string;
  otherDestinationCountry: string;
}): {
  mode: FutureShippingDestinationSelectionMode | null;
  countryCode: string;
  otherDestinationCountry: string;
} => {
  const trimmedOther = otherDestinationCountry.trim();
  if (fulfilmentMethod !== "destination_delivery") {
    return {
      mode: null,
      countryCode: isStep8CustomerSelectableCountry(countryCode) ? countryCode : "",
      otherDestinationCountry: "",
    };
  }
  if (
    requestedMode === "other_destination" ||
    isStep8FakeCountryCode(countryCode)
  ) {
    return {
      mode: "other_destination",
      countryCode: "",
      otherDestinationCountry: trimmedOther,
    };
  }
  if (isStep8CustomerSelectableCountry(countryCode)) {
    return {
      mode: "supported_country",
      countryCode,
      otherDestinationCountry: "",
    };
  }
  if (isValidIsoCountryCode(countryCode)) {
    return {
      mode: "other_destination",
      countryCode: "",
      otherDestinationCountry:
        trimmedOther || formatStep8CountryLabel(countryCode),
    };
  }
  if (requestedMode === "supported_country" && !countryCode) {
    return {
      mode: "supported_country",
      countryCode: "",
      otherDestinationCountry: "",
    };
  }
  if (trimmedOther) {
    return {
      mode: "other_destination",
      countryCode: "",
      otherDestinationCountry: trimmedOther,
    };
  }
  return {
    mode: isDestinationSelectionMode(requestedMode) ? requestedMode : null,
    countryCode: "",
    otherDestinationCountry: "",
  };
};

const isWeightTier = (value: unknown): value is Step8WeightTier =>
  value === "0_2" ||
  value === "2_5" ||
  value === "5_10" ||
  value === "10_20" ||
  value === "over_20";

const normalizeQuoteReference = (
  value: unknown,
): FutureShippingQuoteReferenceV1 | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FutureShippingQuoteReferenceV1>;
  const destinationZoneId =
    candidate.destinationZoneId &&
    isStep8DestinationZone(candidate.destinationZoneId)
      ? candidate.destinationZoneId
      : null;
  if (
    typeof candidate.tariffVersion !== "string" ||
    typeof candidate.ruleId !== "string" ||
    typeof candidate.ruleFingerprint !== "string" ||
    typeof candidate.inputFingerprint !== "string" ||
    !Number.isInteger(candidate.garmentCount) ||
    (candidate.garmentCount || 0) <= 0 ||
    !Number.isFinite(candidate.weightKg) ||
    (candidate.weightKg || 0) <= 0
  ) {
    return null;
  }
  return {
    tariffVersion: candidate.tariffVersion,
    ruleId: candidate.ruleId,
    ruleFingerprint: candidate.ruleFingerprint,
    inputFingerprint: candidate.inputFingerprint,
    garmentCount: candidate.garmentCount!,
    weightKg: candidate.weightKg!,
    weightTier: isWeightTier(candidate.weightTier) ? candidate.weightTier : null,
    destinationZoneId,
    quoteRequired: candidate.quoteRequired === true,
  };
};

export const normalizeFutureShippingState = (
  value: unknown,
): FutureShippingStateNormalization => {
  if (value === undefined || value === null) {
    return { state: createEmptyFutureShippingState(), diagnostics: [] };
  }
  if (!value || typeof value !== "object") {
    return {
      state: createEmptyFutureShippingState(),
      diagnostics: [{
        code: "MALFORMED_SHIPPING_STATE",
        field: "state",
        message: "Saved Shipping information needs to be entered again.",
      }],
    };
  }

  const candidate = value as Partial<FutureShippingStateV1>;
  const customer =
    candidate.customerInformation &&
    typeof candidate.customerInformation === "object"
      ? candidate.customerInformation
      : {};
  const address =
    "deliveryAddress" in customer &&
    customer.deliveryAddress &&
    typeof customer.deliveryAddress === "object"
      ? customer.deliveryAddress
      : {};
  const normalizedFields = {
    fullName: normalizeText({
      value: "fullName" in customer ? customer.fullName : undefined,
      maximumLength: MAX_LENGTHS.fullName,
    }),
    phone: normalizeText({
      value: "phone" in customer ? customer.phone : undefined,
      maximumLength: MAX_LENGTHS.phone,
    }),
    email: normalizeText({
      value: "email" in customer ? customer.email : undefined,
      maximumLength: MAX_LENGTHS.email,
    }),
    addressLine1: normalizeText({
      value: "addressLine1" in address ? address.addressLine1 : undefined,
      maximumLength: MAX_LENGTHS.addressLine1,
    }),
    addressLine2: normalizeText({
      value: "addressLine2" in address ? address.addressLine2 : undefined,
      maximumLength: MAX_LENGTHS.addressLine2,
    }),
    city: normalizeText({
      value: "city" in address ? address.city : undefined,
      maximumLength: MAX_LENGTHS.city,
    }),
    stateRegion: normalizeText({
      value: "stateRegion" in address ? address.stateRegion : undefined,
      maximumLength: MAX_LENGTHS.stateRegion,
    }),
    postalCode: normalizeText({
      value: "postalCode" in address ? address.postalCode : undefined,
      maximumLength: MAX_LENGTHS.postalCode,
    }),
    countryCode: normalizeText({
      value: "countryCode" in address ? address.countryCode : undefined,
      maximumLength: MAX_LENGTHS.countryCode,
    }),
    otherDestinationCountry: normalizeText({
      value:
        "otherDestinationCountry" in candidate
          ? candidate.otherDestinationCountry
          : undefined,
      maximumLength: MAX_LENGTHS.otherDestinationCountry,
    }),
    comment: normalizeText({
      value: "comment" in customer ? customer.comment : undefined,
      maximumLength: MAX_LENGTHS.comment,
      multiline: true,
    }),
  };
  const hasMalformedField = Object.values(normalizedFields).some(
    (field) => field.malformed,
  );
  const fulfilmentMethod = FULFILMENT_METHODS.has(
    candidate.fulfilmentMethod as FutureShippingFulfilmentSelection,
  )
    ? (candidate.fulfilmentMethod as FutureShippingFulfilmentSelection)
    : null;
  const malformedIdentity =
    candidate.fulfilmentMethod !== undefined &&
    candidate.fulfilmentMethod !== null &&
    !fulfilmentMethod;

  const destinationSelection = resolveDestinationSelection({
    fulfilmentMethod,
    requestedMode: candidate.destinationSelectionMode,
    countryCode: normalizeStep8CountryCode(normalizedFields.countryCode.value),
    otherDestinationCountry: normalizedFields.otherDestinationCountry.value,
  });

  return {
    state: {
      schemaVersion: FUTURE_SHIPPING_STATE_SCHEMA_VERSION,
      fulfilmentMethod,
      destinationSelectionMode: destinationSelection.mode,
      otherDestinationCountry: destinationSelection.otherDestinationCountry,
      customerInformation: {
        fullName: normalizedFields.fullName.value,
        phone: normalizedFields.phone.value,
        email: normalizedFields.email.value,
        deliveryAddress: {
          addressLine1: normalizedFields.addressLine1.value,
          addressLine2: normalizedFields.addressLine2.value,
          city: normalizedFields.city.value,
          stateRegion: normalizedFields.stateRegion.value,
          postalCode: normalizedFields.postalCode.value,
          countryCode: destinationSelection.countryCode,
        },
        comment: normalizedFields.comment.value,
      },
      destinationZoneId: null,
      destinationZoneSource: null,
      quoteReference: normalizeQuoteReference(candidate.quoteReference),
    },
    diagnostics:
      candidate.schemaVersion !== FUTURE_SHIPPING_STATE_SCHEMA_VERSION ||
      !candidate.customerInformation ||
      hasMalformedField ||
      malformedIdentity
        ? [{
            code: "MALFORMED_SHIPPING_STATE",
            field: "state",
            message: "Saved Shipping information contains invalid values.",
          }]
        : [],
  };
};

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const getCustomerDiagnostics = (
  state: FutureShippingStateV1,
): FutureShippingStageDiagnostic[] => {
  const diagnostics: FutureShippingStageDiagnostic[] = [];
  const customer = state.customerInformation;
  const requireText = (
    field: FutureShippingFieldId,
    value: string,
    message: string,
  ) => {
    if (!value) diagnostics.push({ code: "REQUIRED_FIELD", field, message });
  };
  requireText("fullName", customer.fullName, "Enter the recipient's full name.");
  requireText("phone", customer.phone, "Enter a phone contact.");
  requireText("email", customer.email, "Enter an email address.");
  if (customer.email && !isValidEmail(customer.email)) {
    diagnostics.push({
      code: "INVALID_EMAIL",
      field: "email",
      message: "Enter a valid email address.",
    });
  }
  if (state.fulfilmentMethod === "destination_delivery") {
    requireText(
      "addressLine1",
      customer.deliveryAddress.addressLine1,
      "Enter the delivery address.",
    );
    requireText("city", customer.deliveryAddress.city, "Enter the delivery city.");
    requireText(
      "postalCode",
      customer.deliveryAddress.postalCode,
      "Enter the postal code.",
    );
    if (state.destinationSelectionMode === "other_destination") {
      requireText(
        "otherDestinationCountry",
        state.otherDestinationCountry,
        "Enter the destination country or territory.",
      );
    } else {
      requireText(
        "countryCode",
        customer.deliveryAddress.countryCode,
        "Select a destination country.",
      );
      if (
        customer.deliveryAddress.countryCode &&
        !isValidIsoCountryCode(customer.deliveryAddress.countryCode)
      ) {
        diagnostics.push({
          code: "INVALID_COUNTRY",
          field: "countryCode",
          message: "Select a valid ISO country.",
        });
      }
      if (
        step8RequiresRegion(customer.deliveryAddress.countryCode) &&
        !customer.deliveryAddress.stateRegion
      ) {
        diagnostics.push({
          code: "REQUIRED_FIELD",
          field: "stateRegion",
          message: "Enter the state, province, or region.",
        });
      }
    }
  }
  return diagnostics;
};

const createOpaqueFingerprint = (value: unknown): string => {
  const source = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const createQuoteInputFingerprint = ({
  state,
  garmentCount,
  destinationZoneId,
}: {
  state: FutureShippingStateV1;
  garmentCount: number;
  destinationZoneId: FutureShippingDestinationZone | null;
}): string => {
  const address = state.customerInformation.deliveryAddress;
  return createOpaqueFingerprint({
    rateVersion: STEP8_DELIVERY_RATE_VERSION,
    fulfilmentMethod: state.fulfilmentMethod,
    destinationSelectionMode: state.destinationSelectionMode,
    destinationZoneId,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 || "",
    city: address.city,
    stateRegion: address.stateRegion || "",
    postalCode: address.postalCode,
    countryCode: address.countryCode,
    otherDestinationCountry: state.otherDestinationCountry || "",
    garmentCount,
  });
};

const createRuleFingerprint = ({
  ruleId,
  destinationZoneId,
  weightTier,
  amountCents,
  quoteRequired,
}: {
  ruleId: string;
  destinationZoneId: FutureShippingDestinationZone | null;
  weightTier: FutureShippingWeightTier | null;
  amountCents: number | null;
  quoteRequired: boolean;
}): string =>
  createOpaqueFingerprint({
    rateVersion: STEP8_DELIVERY_RATE_VERSION,
    ruleId,
    destinationZoneId,
    weightTier,
    amountCents,
    quoteRequired,
  });

const baseResolution = ({
  state,
  status,
  diagnostics,
  postEindhovenAdjustmentCents = null,
  projectedTotalCents = null,
  destinationLabel = null,
  parcelWeightKg = null,
  weightTier = null,
  quoteRequired = false,
  quoteReady = false,
  formInputsComplete = false,
  formComplete = false,
  customerInformationComplete = false,
}: {
  state: FutureShippingStateV1;
  status: FutureShippingStageStatus;
  diagnostics: FutureShippingStageDiagnostic[];
  postEindhovenAdjustmentCents?: number | null;
  projectedTotalCents?: number | null;
  destinationLabel?: string | null;
  parcelWeightKg?: number | null;
  weightTier?: FutureShippingWeightTier | null;
  quoteRequired?: boolean;
  quoteReady?: boolean;
  formInputsComplete?: boolean;
  formComplete?: boolean;
  customerInformationComplete?: boolean;
}): FutureShippingStageResolution => ({
  state,
  status,
  customerInformationComplete,
  formInputsComplete,
  formComplete,
  quoteReady,
  quoteRequired,
  diagnostics,
  postEindhovenAdjustmentCents,
  projectedTotalCents,
  destinationLabel,
  parcelWeightKg,
  weightTier,
  rateVersion: STEP8_DELIVERY_RATE_VERSION,
  paymentLocked: true,
});

export const isFutureShippingStageUnlocked = (
  summaryStatus: FutureDesignStudioSummaryStatus,
): boolean => summaryStatus === "ready";

export const prefillFutureShippingContact = ({
  state,
  name,
  email,
  phone,
}: {
  state: FutureShippingStateV1;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): FutureShippingStateV1 => {
  const current = state.customerInformation;
  if (current.fullName || current.email || current.phone) {
    return state;
  }
  return {
    ...state,
    customerInformation: {
      ...current,
      fullName: (name || "").trim(),
      email: (email || "").trim(),
      phone: (phone || "").trim(),
    },
  };
};

export const reconcileFutureShippingState = ({
  state,
  garmentCount,
  selectedDesignPrice,
}: {
  state: unknown;
  garmentCount: number;
  selectedDesignPrice: number | null;
}): FutureShippingStageResolution => {
  const normalized = normalizeFutureShippingState(state);
  const normalizedState = normalized.state;
  if (!normalizedState.fulfilmentMethod) {
    return baseResolution({
      state: normalizedState,
      status: normalized.diagnostics.length > 0 ? "invalid" : "incomplete",
      diagnostics: [
        ...normalized.diagnostics,
        {
          code: "FULFILMENT_METHOD_REQUIRED",
          field: "fulfilmentMethod",
          message: "Choose pickup or delivery.",
        },
      ],
    });
  }

  const customerDiagnostics = getCustomerDiagnostics(normalizedState);
  const diagnostics = [...normalized.diagnostics, ...customerDiagnostics];
  const hasInvalidDiagnostic = diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "MALFORMED_SHIPPING_STATE" ||
      diagnostic.code === "INVALID_EMAIL" ||
      diagnostic.code === "INVALID_COUNTRY",
  );
  if (diagnostics.length > 0) {
    return baseResolution({
      state: {
        ...normalizedState,
        destinationZoneId: null,
        destinationZoneSource: null,
        quoteReference: null,
      },
      status: hasInvalidDiagnostic ? "invalid" : "incomplete",
      diagnostics,
    });
  }

  const delivery = resolveStep8AdditionalDelivery({
    deliveryMethod: normalizedState.fulfilmentMethod,
    countryCode: normalizedState.customerInformation.deliveryAddress.countryCode,
    city: normalizedState.customerInformation.deliveryAddress.city,
    physicalGarmentCount: garmentCount,
    destinationSelectionMode: normalizedState.destinationSelectionMode,
  });
  const selectedDesignPriceCents =
    selectedDesignPrice !== null && Number.isFinite(selectedDesignPrice)
      ? Math.round(selectedDesignPrice * 100)
      : null;
  const currentReference: FutureShippingQuoteReferenceV1 = {
    tariffVersion: delivery.rateVersion,
    ruleId: delivery.ruleId,
    ruleFingerprint: createRuleFingerprint({
      ruleId: delivery.ruleId,
      destinationZoneId: delivery.destinationZone,
      weightTier: delivery.weightTier,
      amountCents: delivery.additionalDeliveryFeeCents,
      quoteRequired: delivery.quoteRequired,
    }),
    inputFingerprint: createQuoteInputFingerprint({
      state: normalizedState,
      garmentCount,
      destinationZoneId: delivery.destinationZone,
    }),
    garmentCount,
    weightKg: delivery.shipmentWeightKg || 0,
    weightTier: delivery.weightTier,
    destinationZoneId: delivery.destinationZone,
    quoteRequired: delivery.quoteRequired,
  };
  const nextState: FutureShippingStateV1 = {
    ...normalizedState,
    destinationZoneId: delivery.destinationZone,
    destinationZoneSource: delivery.destinationZone ? "iso_resolved" : null,
    quoteReference:
      currentReference.weightKg > 0 ? currentReference : null,
  };

  if (delivery.status === "unavailable") {
    return baseResolution({
      state: nextState,
      status: "quote_unavailable",
      diagnostics: [{
        code: delivery.diagnosticCode || "QUOTE_UNAVAILABLE",
        field: "destinationZoneId",
        message:
          delivery.diagnosticMessage ||
          "Additional delivery cannot be resolved yet.",
      }],
      destinationLabel: delivery.destinationLabel,
      parcelWeightKg: delivery.shipmentWeightKg,
      weightTier: delivery.weightTier,
      customerInformationComplete: true,
      formInputsComplete: true,
      formComplete: false,
    });
  }

  if (delivery.quoteRequired || delivery.status === "quote_required") {
    return baseResolution({
      state: nextState,
      status: "quote_pending",
      diagnostics: [{
        code: delivery.diagnosticCode || "DELIVERY_QUOTE_REQUIRED",
        field: "destinationZoneId",
        message: delivery.diagnosticMessage || "Custom shipping quote required",
      }],
      destinationLabel: delivery.destinationLabel,
      parcelWeightKg: delivery.shipmentWeightKg,
      weightTier: delivery.weightTier,
      quoteRequired: true,
      customerInformationComplete: true,
      formInputsComplete: true,
      formComplete: false,
    });
  }

  const additionalDeliveryFeeCents = delivery.additionalDeliveryFeeCents;
  if (additionalDeliveryFeeCents === null) {
    return baseResolution({
      state: nextState,
      status: "quote_pending",
      diagnostics: [{
        code: "DELIVERY_QUOTE_REQUIRED",
        field: "destinationZoneId",
        message: "Custom shipping quote required",
      }],
      destinationLabel: delivery.destinationLabel,
      parcelWeightKg: delivery.shipmentWeightKg,
      weightTier: delivery.weightTier,
      quoteRequired: true,
      customerInformationComplete: true,
      formInputsComplete: true,
      formComplete: false,
    });
  }

  return baseResolution({
    state: nextState,
    status: "quote_ready",
    diagnostics: [],
    postEindhovenAdjustmentCents: additionalDeliveryFeeCents,
    projectedTotalCents:
      selectedDesignPriceCents === null
        ? null
        : selectedDesignPriceCents + additionalDeliveryFeeCents,
    destinationLabel: delivery.destinationLabel,
    parcelWeightKg: delivery.shipmentWeightKg,
    weightTier: delivery.weightTier,
    quoteReady: true,
    customerInformationComplete: true,
    formInputsComplete: true,
    formComplete: true,
  });
};

export const refreshFutureShippingQuote = ({
  state,
  garmentCount,
  selectedDesignPrice,
}: {
  state: FutureShippingStateV1;
  garmentCount: number;
  selectedDesignPrice: number | null;
}): FutureShippingStageResolution =>
  reconcileFutureShippingState({
    state: { ...state, quoteReference: null },
    garmentCount,
    selectedDesignPrice,
  });

export const persistFutureShippingState = <T extends object>({
  draft,
  state,
}: {
  draft: T;
  state: FutureShippingStateV1;
}): T & { futureShippingState: FutureShippingStateV1 } => ({
  ...draft,
  futureShippingState: normalizeFutureShippingState(state).state,
});

export const getFutureShippingRuleById = (ruleId: string): { ruleId: string } | null =>
  ruleId.startsWith("step8_") ? { ruleId } : null;

export const isFutureShippingStepComplete = (
  resolution: FutureShippingStageResolution,
): boolean =>
  resolution.formComplete &&
  resolution.quoteReady &&
  !resolution.quoteRequired &&
  resolution.status === "quote_ready";

export interface Step8OrderSummaryRow {
  readonly label: string;
  readonly value: string;
}

const formatAdditionalDeliverySummaryValue = (
  resolution: FutureShippingStageResolution,
): string => {
  if (resolution.quoteRequired) return "Custom shipping quote required";
  if (resolution.postEindhovenAdjustmentCents === null) return "Pending";
  return `${PRICING_CURRENCY_SYMBOL}${(resolution.postEindhovenAdjustmentCents / 100).toFixed(2)}`;
};

export const getStep8OrderSummaryRows = (
  resolution: FutureShippingStageResolution,
): readonly Step8OrderSummaryRow[] => {
  const method = resolution.state.fulfilmentMethod;
  if (!method) return [];
  const isPickup = method === "eindhoven_pickup";
  const rows: Step8OrderSummaryRow[] = [
    {
      label: "Delivery Method",
      value: isPickup ? "Pick Up in Eindhoven" : "Deliver to an Address",
    },
  ];
  if (!isPickup) {
    const address = resolution.state.customerInformation.deliveryAddress;
    rows.push({
      label: "Destination",
      value:
        formatStep8CustomerDestination({
          city: address.city,
          countryCode: address.countryCode,
          otherDestinationCountry: resolution.state.otherDestinationCountry,
        }) ||
        resolution.destinationLabel ||
        "Pending",
    });
    rows.push({
      label: "Estimated Shipment Weight",
      value:
        resolution.parcelWeightKg === null ||
        !Number.isFinite(resolution.parcelWeightKg)
          ? "Pending"
          : `${resolution.parcelWeightKg.toFixed(1)} kg`,
    });
  }
  rows.push({
    label: "Additional Delivery",
    value: formatAdditionalDeliverySummaryValue(resolution),
  });
  return rows;
};
