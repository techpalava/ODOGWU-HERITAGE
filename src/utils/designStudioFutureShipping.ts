import {
  FUTURE_SHIPPING_TARIFF_RULES,
  FUTURE_SHIPPING_TARIFF_VERSION,
  type FutureShippingTariffRuleV1,
} from "../config/FutureShippingTariffConfig";
import type {
  FutureShippingDestinationZone,
  FutureShippingQuoteReferenceV1,
  FutureShippingStateV1,
  FutureShippingFulfilmentSelection,
} from "../types";
import type { FutureDesignStudioSummaryStatus } from "./designStudioFutureSummary";
import {
  resolveFutureFinalMileFromGarmentCount,
  resolveFutureGarmentCountWeightReference,
} from "./futureShippingTariff";

export const FUTURE_SHIPPING_STATE_SCHEMA_VERSION = 1 as const;

export const FUTURE_SHIPPING_DESTINATION_ZONE_OPTIONS: readonly {
  id: FutureShippingDestinationZone;
  label: string;
}[] = Object.freeze([
  Object.freeze({ id: "EINDHOVEN", label: "Eindhoven" }),
  Object.freeze({
    id: "NETHERLANDS_OTHER",
    label: "Netherlands outside Eindhoven",
  }),
  Object.freeze({ id: "EUROPE", label: "Other parts of Europe" }),
  Object.freeze({ id: "NORTH_AMERICA", label: "North America" }),
  Object.freeze({ id: "SOUTH_AMERICA", label: "South America" }),
  Object.freeze({ id: "AFRICA", label: "Africa" }),
  Object.freeze({ id: "ASIA", label: "Asia" }),
]);

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
  | "state";

export interface FutureShippingStageDiagnostic {
  code: string;
  field: FutureShippingFieldId;
  message: string;
}

export interface FutureShippingStageResolution {
  state: FutureShippingStateV1;
  status: FutureShippingStageStatus;
  customerInformationComplete: boolean;
  formComplete: boolean;
  quoteReady: boolean;
  diagnostics: FutureShippingStageDiagnostic[];
  postEindhovenAdjustmentCents: number | null;
  projectedTotalCents: number | null;
  destinationLabel: string | null;
  parcelWeightKg: number | null;
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
  postalCode: 32,
  countryCode: 8,
  comment: 1000,
});

const FULFILMENT_METHODS = new Set<FutureShippingFulfilmentSelection>([
  "eindhoven_pickup",
  "destination_delivery",
]);
const DESTINATION_ZONES = new Set<FutureShippingDestinationZone>(
  FUTURE_SHIPPING_DESTINATION_ZONE_OPTIONS.map((zone) => zone.id),
);

const emptyAddress = () => ({
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  countryCode: "",
});

export const createEmptyFutureShippingState = (): FutureShippingStateV1 => ({
  schemaVersion: FUTURE_SHIPPING_STATE_SCHEMA_VERSION,
  fulfilmentMethod: null,
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

const normalizeQuoteReference = (
  value: unknown,
): FutureShippingQuoteReferenceV1 | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FutureShippingQuoteReferenceV1>;
  if (
    typeof candidate.tariffVersion !== "string" ||
    typeof candidate.ruleId !== "string" ||
    typeof candidate.ruleFingerprint !== "string" ||
    typeof candidate.inputFingerprint !== "string" ||
    !Number.isInteger(candidate.garmentCount) ||
    (candidate.garmentCount || 0) <= 0 ||
    !Number.isFinite(candidate.weightKg) ||
    (candidate.weightKg || 0) <= 0 ||
    !DESTINATION_ZONES.has(
      candidate.destinationZoneId as FutureShippingDestinationZone,
    )
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
    destinationZoneId: candidate.destinationZoneId!,
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
    postalCode: normalizeText({
      value: "postalCode" in address ? address.postalCode : undefined,
      maximumLength: MAX_LENGTHS.postalCode,
    }),
    countryCode: normalizeText({
      value: "countryCode" in address ? address.countryCode : undefined,
      maximumLength: MAX_LENGTHS.countryCode,
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
  const destinationZoneId = DESTINATION_ZONES.has(
    candidate.destinationZoneId as FutureShippingDestinationZone,
  )
    ? (candidate.destinationZoneId as FutureShippingDestinationZone)
    : null;
  const malformedIdentity =
    (candidate.fulfilmentMethod !== undefined &&
      candidate.fulfilmentMethod !== null &&
      !fulfilmentMethod) ||
    (candidate.destinationZoneId !== undefined &&
      candidate.destinationZoneId !== null &&
      !destinationZoneId);

  return {
    state: {
      schemaVersion: FUTURE_SHIPPING_STATE_SCHEMA_VERSION,
      fulfilmentMethod,
      customerInformation: {
        fullName: normalizedFields.fullName.value,
        phone: normalizedFields.phone.value,
        email: normalizedFields.email.value,
        deliveryAddress: {
          addressLine1: normalizedFields.addressLine1.value,
          addressLine2: normalizedFields.addressLine2.value,
          city: normalizedFields.city.value,
          postalCode: normalizedFields.postalCode.value,
          countryCode: normalizedFields.countryCode.value.toUpperCase(),
        },
        comment: normalizedFields.comment.value,
      },
      destinationZoneId,
      destinationZoneSource: destinationZoneId
        ? "customer_provisional"
        : null,
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
  requireText("fullName", customer.fullName, "Enter the customer's full name.");
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
    requireText(
      "countryCode",
      customer.deliveryAddress.countryCode,
      "Enter the country code.",
    );
    if (!state.destinationZoneId) {
      diagnostics.push({
        code: "DESTINATION_ZONE_REQUIRED",
        field: "destinationZoneId",
        message: "Select the destination region for a provisional quote.",
      });
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

const createRuleFingerprint = (rule: FutureShippingTariffRuleV1): string =>
  createOpaqueFingerprint({
    tariffVersion: rule.tariffVersion,
    ruleId: rule.ruleId,
    shippingLeg: rule.shippingLeg,
    fulfilmentMethod: rule.fulfilmentMethod,
    destinationZoneId: rule.destinationZoneId,
    amountCents: rule.amountCents,
    pricingUnit: rule.pricingUnit,
    supportedWeightBoundary: rule.supportedWeightBoundary,
    status: rule.status,
  });

const createQuoteInputFingerprint = ({
  state,
  garmentCount,
}: {
  state: FutureShippingStateV1;
  garmentCount: number;
}): string => {
  const address = state.customerInformation.deliveryAddress;
  return createOpaqueFingerprint({
    fulfilmentMethod: state.fulfilmentMethod,
    destinationZoneId: state.destinationZoneId,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 || "",
    city: address.city,
    postalCode: address.postalCode,
    countryCode: address.countryCode,
    garmentCount,
  });
};

const getDestinationLabel = (
  zoneId: FutureShippingDestinationZone | null,
): string | null =>
  FUTURE_SHIPPING_DESTINATION_ZONE_OPTIONS.find((zone) => zone.id === zoneId)
    ?.label || null;

export const isFutureShippingStageUnlocked = (
  summaryStatus: FutureDesignStudioSummaryStatus,
): boolean => summaryStatus === "ready";

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
    return {
      state: normalizedState,
      status: normalized.diagnostics.length > 0 ? "invalid" : "incomplete",
      customerInformationComplete: false,
      formComplete: false,
      quoteReady: false,
      diagnostics: [
        ...normalized.diagnostics,
        {
          code: "FULFILMENT_METHOD_REQUIRED",
          field: "fulfilmentMethod",
          message: "Choose collection or destination delivery.",
        },
      ],
      postEindhovenAdjustmentCents: null,
      projectedTotalCents: null,
      destinationLabel: null,
      parcelWeightKg: null,
      paymentLocked: true,
    };
  }

  const customerDiagnostics = getCustomerDiagnostics(normalizedState);
  const diagnostics = [...normalized.diagnostics, ...customerDiagnostics];
  const hasInvalidDiagnostic = diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "MALFORMED_SHIPPING_STATE" ||
      diagnostic.code === "INVALID_EMAIL",
  );
  if (diagnostics.length > 0) {
    return {
      state: normalizedState,
      status: hasInvalidDiagnostic ? "invalid" : "incomplete",
      customerInformationComplete: false,
      formComplete: false,
      quoteReady: false,
      diagnostics,
      postEindhovenAdjustmentCents: null,
      projectedTotalCents: null,
      destinationLabel: getDestinationLabel(normalizedState.destinationZoneId),
      parcelWeightKg: null,
      paymentLocked: true,
    };
  }

  if (normalizedState.fulfilmentMethod === "eindhoven_pickup") {
    return {
      state: {
        ...normalizedState,
        quoteReference: null,
      },
      status: "pickup_arrangement_pending",
      customerInformationComplete: true,
      formComplete: true,
      quoteReady: false,
      diagnostics: [],
      postEindhovenAdjustmentCents: null,
      projectedTotalCents: null,
      destinationLabel: "Arranged Eindhoven collection",
      parcelWeightKg: null,
      paymentLocked: true,
    };
  }

  const tariffResolution = resolveFutureFinalMileFromGarmentCount({
    fulfilmentMethod: "destination_delivery",
    destinationZoneId: normalizedState.destinationZoneId,
    garmentCount,
  });
  const existingReference = normalizedState.quoteReference;
  if (
    tariffResolution.status !== "resolved_baseline" ||
    !tariffResolution.rule ||
    tariffResolution.amountCents === null
  ) {
    const isStale = Boolean(existingReference);
    return {
      state: normalizedState,
      status: isStale
        ? "quote_stale"
        : tariffResolution.status === "estimate_pending" ||
            (tariffResolution.status === "quote_required" &&
              tariffResolution.diagnostic?.code === "WEIGHT_OUTSIDE_BASELINE")
          ? "quote_pending"
          : "quote_unavailable",
      customerInformationComplete: true,
      formComplete: true,
      quoteReady: false,
      diagnostics: [{
        code: tariffResolution.diagnostic?.code || "QUOTE_UNAVAILABLE",
        field: "destinationZoneId",
        message:
          tariffResolution.diagnostic?.message ||
          "A post-Eindhoven delivery quote is required.",
      }],
      postEindhovenAdjustmentCents: null,
      projectedTotalCents: null,
      destinationLabel: getDestinationLabel(normalizedState.destinationZoneId),
      parcelWeightKg: null,
      paymentLocked: true,
    };
  }

  const inputFingerprint = createQuoteInputFingerprint({
    state: normalizedState,
    garmentCount,
  });
  const ruleFingerprint = createRuleFingerprint(tariffResolution.rule);
  const weightReference = resolveFutureGarmentCountWeightReference(garmentCount);
  if (weightReference.status !== "exact") {
    return {
      state: normalizedState,
      status: "quote_pending",
      customerInformationComplete: true,
      formComplete: true,
      quoteReady: false,
      diagnostics: [{
        code: weightReference.diagnostic.code,
        field: "destinationZoneId",
        message: weightReference.diagnostic.message,
      }],
      postEindhovenAdjustmentCents: null,
      projectedTotalCents: null,
      destinationLabel: getDestinationLabel(normalizedState.destinationZoneId),
      parcelWeightKg: null,
      paymentLocked: true,
    };
  }
  const currentReference: FutureShippingQuoteReferenceV1 = {
    tariffVersion: FUTURE_SHIPPING_TARIFF_VERSION,
    ruleId: tariffResolution.rule.ruleId,
    ruleFingerprint,
    inputFingerprint,
    garmentCount,
    weightKg: weightReference.weightKg,
    destinationZoneId: normalizedState.destinationZoneId!,
  };
  const referenceMatches =
    !existingReference ||
    (existingReference.tariffVersion === currentReference.tariffVersion &&
      existingReference.ruleId === currentReference.ruleId &&
      existingReference.ruleFingerprint === currentReference.ruleFingerprint &&
      existingReference.inputFingerprint === currentReference.inputFingerprint &&
      existingReference.garmentCount === currentReference.garmentCount &&
      existingReference.destinationZoneId === currentReference.destinationZoneId);
  if (!referenceMatches) {
    return {
      state: normalizedState,
      status: "quote_stale",
      customerInformationComplete: true,
      formComplete: true,
      quoteReady: false,
      diagnostics: [{
        code: "QUOTE_STALE",
        field: "destinationZoneId",
        message: "Shipping inputs changed. Refresh the post-Eindhoven quote.",
      }],
      postEindhovenAdjustmentCents: null,
      projectedTotalCents: null,
      destinationLabel: getDestinationLabel(normalizedState.destinationZoneId),
      parcelWeightKg: null,
      paymentLocked: true,
    };
  }

  const selectedDesignPriceCents =
    selectedDesignPrice !== null && Number.isFinite(selectedDesignPrice)
      ? Math.round(selectedDesignPrice * 100)
      : null;
  return {
    state: {
      ...normalizedState,
      quoteReference: currentReference,
    },
    status: "quote_ready",
    customerInformationComplete: true,
    formComplete: true,
    quoteReady: true,
    diagnostics: [],
    postEindhovenAdjustmentCents: tariffResolution.amountCents,
    projectedTotalCents:
      selectedDesignPriceCents === null
        ? null
        : selectedDesignPriceCents + tariffResolution.amountCents,
    destinationLabel: getDestinationLabel(normalizedState.destinationZoneId),
    parcelWeightKg: currentReference.weightKg,
    paymentLocked: true,
  };
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

export const getFutureShippingRuleById = (
  ruleId: string,
): FutureShippingTariffRuleV1 | null =>
  FUTURE_SHIPPING_TARIFF_RULES.find((rule) => rule.ruleId === ruleId) || null;
