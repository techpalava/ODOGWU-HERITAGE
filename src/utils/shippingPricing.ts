import type {
  BatchShippingSnapshot,
  CartItem,
  CartShippingSnapshot,
  DeliveryAddress,
  DeliverySelection,
  FabricAllocation,
  FinalMileDestinationZone,
  FinalMileShippingSnapshot,
  FinalMileWeightBand,
  GarmentSelection,
  IndividualShippingSnapshot,
  ShippingQuoteStatus,
} from "../types";
import { clampRatio, roundMoney } from "./money";
import { inspectCartItemFabricAllocations } from "./fabricAllocationPersistence";

export const LAGOS_EINDHOVEN_EXCHANGE_RATE_NGN_PER_EUR = 1600;
export const GARMENT_WEIGHT_KG = 5 / 12;
export const BATCH_SHIPPING_PRICING_VERSION = "2026-07-30-flat-v1" as const;
export const INDIVIDUAL_SHIPPING_PRICING_VERSION =
  "2026-07-30-individual-v1" as const;
export const BATCH_FLAT_RATE_EUR_PER_GARMENT = 15.09;
export const BATCH_MINIMUM_GARMENTS = 10;
export const FINAL_MILE_PRICING_VERSION = "2026-07-30-final-mile-v1" as const;
export const CART_SHIPPING_SNAPSHOT_VERSION =
  "2026-07-30-cart-shipping-v1" as const;
const INDIVIDUAL_SHIPPING_RATE_EUR = Object.freeze({
  "0 - 2 kg": 131.25,
  ">2 - 5 kg": 131.25,
  ">5 - 10 kg": 236.25,
  ">10 - 20 kg": 425.25,
  ">20 kg": 765.45,
});

export const BATCH_SHIPPING_POLICY = Object.freeze({
  rateModel: "FLAT_PER_GARMENT" as const,
  rateEurPerGarment: BATCH_FLAT_RATE_EUR_PER_GARMENT,
  minimumBatchGarments: BATCH_MINIMUM_GARMENTS,
  allowsSplitShipments: true,
});

export type IndividualShippingQuote = IndividualShippingSnapshot;
export type BatchShippingQuote = BatchShippingSnapshot;
export type FinalMileShippingQuote = FinalMileShippingSnapshot;

export interface CartPricingSummary {
  garmentSubtotal: number;
  lagosToEindhovenShipping: number;
  eindhovenToDestinationShipping: number | null;
  totalShipping: number | null;
  shippingTotal: number | null;
  total: number | null;
  depositDueNow: number | null;
  remainingDue: number;
  individualShippingQuote: IndividualShippingQuote | null;
  batchShippingQuotes: BatchShippingQuote[];
  finalMileShippingQuotes: FinalMileShippingQuote[];
  shippingStatus: ShippingQuoteStatus;
  blockingReasons: string[];
  requiresShippingReview: boolean;
  requiresShippingConfirmation: boolean;
  requiresPriceConfirmation: boolean;
  canCheckout: boolean;
  // Compatibility for existing consumers while they migrate to the explicit name.
  shippingQuote: IndividualShippingQuote | null;
}

export interface CartPaymentAllocation {
  itemId: string;
  garmentSubtotal: number;
  garmentDeposit: number;
  remainingGarmentBalance: number;
  lagosToEindhovenShipping: number;
  eindhovenToDestinationShipping: number;
  totalShipping: number;
  orderSubtotal: number;
  dueNow: number;
}

interface BatchShippingInput {
  batchId: string;
  batchName: string;
  plannedGarmentCapacity: number;
  garmentPieceCount: number;
}

interface FinalMileShippingInput {
  deliverySelection?: DeliverySelection;
  garmentPieceCount: number;
  shipmentGroupId: string;
  arrivalGroupKey: string;
}

const FINAL_MILE_RATE_CENTS: Readonly<
  Record<
    FinalMileDestinationZone,
    Readonly<Record<Exclude<FinalMileWeightBand, ">20 kg">, number>>
  >
> = Object.freeze({
  EINDHOVEN: Object.freeze({
    "0 - 2 kg": 750,
    ">2 - 5 kg": 975,
    ">5 - 10 kg": 1268,
    ">10 - 20 kg": 2028,
  }),
  NETHERLANDS_OTHER: Object.freeze({
    "0 - 2 kg": 750,
    ">2 - 5 kg": 975,
    ">5 - 10 kg": 1268,
    ">10 - 20 kg": 2028,
  }),
  EUROPE: Object.freeze({
    "0 - 2 kg": 1900,
    ">2 - 5 kg": 2660,
    ">5 - 10 kg": 3724,
    ">10 - 20 kg": 5214,
  }),
  NORTH_AMERICA: Object.freeze({
    "0 - 2 kg": 3800,
    ">2 - 5 kg": 6080,
    ">5 - 10 kg": 9728,
    ">10 - 20 kg": 18483,
  }),
  SOUTH_AMERICA: Object.freeze({
    "0 - 2 kg": 4875,
    ">2 - 5 kg": 7800,
    ">5 - 10 kg": 12480,
    ">10 - 20 kg": 23712,
  }),
  AFRICA: Object.freeze({
    "0 - 2 kg": 4875,
    ">2 - 5 kg": 7800,
    ">5 - 10 kg": 12480,
    ">10 - 20 kg": 23712,
  }),
  ASIA: Object.freeze({
    "0 - 2 kg": 4875,
    ">2 - 5 kg": 7800,
    ">5 - 10 kg": 12480,
    ">10 - 20 kg": 23712,
  }),
});

const toCountryCodeSet = (codes: string): ReadonlySet<string> =>
  new Set(codes.trim().split(/\s+/));

const EUROPE_COUNTRY_CODES = toCountryCodeSet(`
  AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT
  LV LI LT LU MT MD MC ME MK NO PL PT RO RU SM RS SK SI ES SE
  CH TR UA GB VA
`);
const NORTH_AMERICA_COUNTRY_CODES = toCountryCodeSet("CA MX US");
const SOUTH_AMERICA_COUNTRY_CODES = toCountryCodeSet(`
  AR BO BR CL CO EC GY PY PE SR UY VE
`);
const AFRICA_COUNTRY_CODES = toCountryCodeSet(`
  DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET
  GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW
  ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW
`);
const ASIA_COUNTRY_CODES = toCountryCodeSet(`
  AF AM AZ BH BD BT BN KH CN GE HK IN ID IR IQ IL JP JO KZ KW
  KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY
  TW TJ TH TL TM AE UZ VN YE
`);
const MANUAL_QUOTE_COUNTRY_CODES = toCountryCodeSet(`
  AG AU BS BB BZ BM CR CU DM DO SV FJ GD GL GT HT HN JM KI MH
  FM NR NZ NI PW PA PG KN LC VC SB TO TT TV VU WS
`);

const COUNTRY_CODE_GROUPS = [
  EUROPE_COUNTRY_CODES,
  NORTH_AMERICA_COUNTRY_CODES,
  SOUTH_AMERICA_COUNTRY_CODES,
  AFRICA_COUNTRY_CODES,
  ASIA_COUNTRY_CODES,
  MANUAL_QUOTE_COUNTRY_CODES,
];

const countryDisplayNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export interface FinalMileCountryOption {
  code: string;
  label: string;
  requiresManualQuote: boolean;
}

export const FINAL_MILE_COUNTRY_OPTIONS: readonly FinalMileCountryOption[] =
  Object.freeze(
    Array.from(
      new Set([
        "NL",
        ...COUNTRY_CODE_GROUPS.flatMap((group) => Array.from(group)),
      ]),
    )
      .map((code) => ({
        code,
        label: countryDisplayNames?.of(code) || code,
        requiresManualQuote: MANUAL_QUOTE_COUNTRY_CODES.has(code),
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
  );

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

export const countPhysicalGarmentAssignments = (
  fabricAllocations: FabricAllocation[] | undefined,
): number =>
  fabricAllocations?.reduce(
    (total, allocation) => total + allocation.garmentAssignments.length,
    0,
  ) ?? 0;

export const resolveShippingGarmentPieceCount = ({
  fabricAllocations,
  legacyComposition,
}: {
  fabricAllocations?: FabricAllocation[];
  legacyComposition?: string;
}): number => {
  const modernPieceCount = countPhysicalGarmentAssignments(fabricAllocations);
  return modernPieceCount > 0
    ? modernPieceCount
    : getGarmentPieceCount(legacyComposition);
};

export const resolveAuthoritativeGarmentPieceCount = (
  item: CartItem,
): number | null => {
  const allocationInspection = inspectCartItemFabricAllocations(item);
  if (allocationInspection.status === "invalid") {
    return null;
  }
  if (allocationInspection.status === "valid") {
    const modernPieceCount = countPhysicalGarmentAssignments(
      allocationInspection.fabricAllocations,
    );
    if (modernPieceCount > 0) {
      return modernPieceCount;
    }
  }

  if (
    typeof item.garmentPieceCount === "number" &&
    Number.isInteger(item.garmentPieceCount) &&
    item.garmentPieceCount > 0
  ) {
    return item.garmentPieceCount;
  }

  const descriptors = [item.garment.type, item.style.garmentComposition]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" | ");
  const numericComposition = descriptors.match(/(\d+)\s*-\s*piece/i);
  if (numericComposition) {
    return normalizePositiveInteger(
      Number.parseInt(numericComposition[1], 10),
    );
  }

  const normalized = descriptors.toLocaleLowerCase("en");
  if (
    normalized.includes("couple") ||
    normalized.includes("parent & child") ||
    normalized.includes("parent and child")
  ) {
    return 2;
  }
  if (normalized.includes("family")) return 4;

  const plusSeparatedGarments = item.garment.type
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (plusSeparatedGarments.length > 1) {
    return plusSeparatedGarments.length;
  }

  if (
    /\b(shirt|top|dress|gown|trouser|pants|skirt|shorts|nikka|agbada)\s+only\b/i.test(
      descriptors,
    )
  ) {
    return 1;
  }

  return null;
};

const normalizeText = (value?: string): string =>
  (value || "").trim().replace(/\s+/g, " ");

const normalizePostalCodeForGrouping = (value?: string): string =>
  normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

export const normalizeDeliveryAddress = (
  address?: DeliveryAddress,
): DeliveryAddress | undefined => {
  if (!address) return undefined;

  return {
    addressLine1: normalizeText(address.addressLine1),
    addressLine2: normalizeText(address.addressLine2) || undefined,
    city: normalizeText(address.city),
    postalCode: normalizeText(address.postalCode).toUpperCase(),
    countryCode: normalizeText(address.countryCode).toUpperCase(),
  };
};

export const isCompleteDeliveryAddress = (
  address?: DeliveryAddress,
): boolean => {
  const normalized = normalizeDeliveryAddress(address);
  return Boolean(
    normalized?.addressLine1 &&
      normalized.city &&
      normalized.postalCode &&
      normalized.countryCode,
  );
};

interface ZoneResolution {
  zone: FinalMileDestinationZone | null;
  zoneLabel: string;
  manualQuoteReason?: string;
}

export const resolveFinalMileZone = (
  address?: DeliveryAddress,
): ZoneResolution => {
  const normalized = normalizeDeliveryAddress(address);
  const countryCode = normalized?.countryCode || "";

  if (!countryCode) {
    return {
      zone: null,
      zoneLabel: "Destination required",
    };
  }

  if (countryCode === "NL") {
    const normalizedCity = (normalized?.city || "")
      .toLocaleLowerCase("en")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");
    const isEindhoven = normalizedCity === "eindhoven";

    return {
      zone: isEindhoven ? "EINDHOVEN" : "NETHERLANDS_OTHER",
      zoneLabel: isEindhoven
        ? "Eindhoven"
        : "Netherlands outside Eindhoven",
    };
  }

  if (EUROPE_COUNTRY_CODES.has(countryCode)) {
    return { zone: "EUROPE", zoneLabel: "Other Europe" };
  }
  if (NORTH_AMERICA_COUNTRY_CODES.has(countryCode)) {
    return { zone: "NORTH_AMERICA", zoneLabel: "North America" };
  }
  if (SOUTH_AMERICA_COUNTRY_CODES.has(countryCode)) {
    return { zone: "SOUTH_AMERICA", zoneLabel: "South America" };
  }
  if (AFRICA_COUNTRY_CODES.has(countryCode)) {
    return { zone: "AFRICA", zoneLabel: "Africa" };
  }
  if (ASIA_COUNTRY_CODES.has(countryCode)) {
    return { zone: "ASIA", zoneLabel: "Asia" };
  }

  const countryName = countryDisplayNames?.of(countryCode) || countryCode;
  return {
    zone: null,
    zoneLabel: countryName,
    manualQuoteReason: `Final delivery to ${countryName} requires a manual shipping quote.`,
  };
};

interface WeightResolution {
  weightBand: FinalMileWeightBand;
  weightSource: FinalMileShippingSnapshot["weightSource"];
  actualParcelWeightKg?: number;
}

export const resolveFinalMileWeight = (
  garmentPieceCount: number,
  actualParcelWeightKg?: number,
): WeightResolution => {
  if (
    typeof actualParcelWeightKg === "number" &&
    Number.isFinite(actualParcelWeightKg) &&
    actualParcelWeightKg > 0
  ) {
    let weightBand: FinalMileWeightBand;
    if (actualParcelWeightKg <= 2) weightBand = "0 - 2 kg";
    else if (actualParcelWeightKg <= 5) weightBand = ">2 - 5 kg";
    else if (actualParcelWeightKg <= 10) weightBand = ">5 - 10 kg";
    else if (actualParcelWeightKg <= 20) weightBand = ">10 - 20 kg";
    else weightBand = ">20 kg";

    return {
      weightBand,
      weightSource: "ACTUAL_WEIGHT",
      actualParcelWeightKg,
    };
  }

  const normalizedPieceCount = normalizePositiveInteger(garmentPieceCount);
  let weightBand: FinalMileWeightBand;
  if (normalizedPieceCount <= 5) weightBand = "0 - 2 kg";
  else if (normalizedPieceCount <= 12) weightBand = ">2 - 5 kg";
  else if (normalizedPieceCount <= 24) weightBand = ">5 - 10 kg";
  else if (normalizedPieceCount <= 48) weightBand = ">10 - 20 kg";
  else weightBand = ">20 kg";

  return {
    weightBand,
    weightSource: "GARMENT_COUNT_ESTIMATE",
  };
};

export const calculateFinalMileShipping = ({
  deliverySelection,
  garmentPieceCount,
  shipmentGroupId,
  arrivalGroupKey,
}: FinalMileShippingInput): FinalMileShippingQuote => {
  const normalizedPieceCount = normalizePositiveInteger(garmentPieceCount);

  if (!deliverySelection) {
    return {
      routeId: "EINDHOVEN_DESTINATION",
      pricingVersion: FINAL_MILE_PRICING_VERSION,
      shipmentGroupId,
      arrivalGroupKey,
      status: "DESTINATION_REQUIRED",
      method: null,
      zone: null,
      zoneLabel: "Select in Step 7",
      garmentPieceCount: normalizedPieceCount,
      weightSource: null,
      weightBand: null,
      priceEur: null,
    };
  }

  if (deliverySelection.method === "PICKUP") {
    return {
      routeId: "EINDHOVEN_DESTINATION",
      pricingVersion: FINAL_MILE_PRICING_VERSION,
      shipmentGroupId,
      arrivalGroupKey,
      status: "READY",
      method: "PICKUP",
      zone: "EINDHOVEN",
      zoneLabel: "Eindhoven pickup",
      pickupLocation: normalizeText(deliverySelection.pickupLocation),
      pickupWindow: normalizeText(deliverySelection.pickupWindow),
      garmentPieceCount: normalizedPieceCount,
      weightSource: null,
      weightBand: null,
      priceEur: 0,
    };
  }

  const address = normalizeDeliveryAddress(deliverySelection.address);
  if (!isCompleteDeliveryAddress(address)) {
    return {
      routeId: "EINDHOVEN_DESTINATION",
      pricingVersion: FINAL_MILE_PRICING_VERSION,
      shipmentGroupId,
      arrivalGroupKey,
      status: "DESTINATION_REQUIRED",
      method: "DELIVERY",
      zone: null,
      zoneLabel: "Complete delivery address",
      address,
      garmentPieceCount: normalizedPieceCount,
      weightSource: null,
      weightBand: null,
      priceEur: null,
    };
  }

  const zoneResolution = resolveFinalMileZone(address);
  const weightResolution = resolveFinalMileWeight(
    normalizedPieceCount,
    deliverySelection.actualParcelWeightKg,
  );

  if (!zoneResolution.zone) {
    return {
      routeId: "EINDHOVEN_DESTINATION",
      pricingVersion: FINAL_MILE_PRICING_VERSION,
      shipmentGroupId,
      arrivalGroupKey,
      status: "MANUAL_QUOTE_REQUIRED",
      method: "DELIVERY",
      zone: null,
      zoneLabel: zoneResolution.zoneLabel,
      address,
      garmentPieceCount: normalizedPieceCount,
      weightSource: weightResolution.weightSource,
      actualParcelWeightKg: weightResolution.actualParcelWeightKg,
      weightBand: weightResolution.weightBand,
      priceEur: null,
      manualQuoteReason:
        zoneResolution.manualQuoteReason ||
        "This destination requires a manual shipping quote.",
    };
  }

  if (weightResolution.weightBand === ">20 kg") {
    return {
      routeId: "EINDHOVEN_DESTINATION",
      pricingVersion: FINAL_MILE_PRICING_VERSION,
      shipmentGroupId,
      arrivalGroupKey,
      status: "MANUAL_QUOTE_REQUIRED",
      method: "DELIVERY",
      zone: zoneResolution.zone,
      zoneLabel: zoneResolution.zoneLabel,
      address,
      garmentPieceCount: normalizedPieceCount,
      weightSource: weightResolution.weightSource,
      actualParcelWeightKg: weightResolution.actualParcelWeightKg,
      weightBand: weightResolution.weightBand,
      priceEur: null,
      manualQuoteReason:
        "Parcels over 20 kg require a manual final-delivery quote.",
    };
  }

  return {
    routeId: "EINDHOVEN_DESTINATION",
    pricingVersion: FINAL_MILE_PRICING_VERSION,
    shipmentGroupId,
    arrivalGroupKey,
    status: "READY",
    method: "DELIVERY",
    zone: zoneResolution.zone,
    zoneLabel: zoneResolution.zoneLabel,
    address,
    garmentPieceCount: normalizedPieceCount,
    weightSource: weightResolution.weightSource,
    actualParcelWeightKg: weightResolution.actualParcelWeightKg,
    weightBand: weightResolution.weightBand,
    priceEur:
      FINAL_MILE_RATE_CENTS[zoneResolution.zone][
        weightResolution.weightBand
      ] / 100,
  };
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
    priceEur = INDIVIDUAL_SHIPPING_RATE_EUR[weightBand];
  } else if (estimatedWeightKg <= 5) {
    weightBand = ">2 - 5 kg";
    priceEur = INDIVIDUAL_SHIPPING_RATE_EUR[weightBand];
  } else if (estimatedWeightKg <= 10) {
    weightBand = ">5 - 10 kg";
    priceEur = INDIVIDUAL_SHIPPING_RATE_EUR[weightBand];
  } else if (estimatedWeightKg <= 20) {
    weightBand = ">10 - 20 kg";
    priceEur = INDIVIDUAL_SHIPPING_RATE_EUR[weightBand];
  } else {
    weightBand = ">20 kg";
    priceEur = INDIVIDUAL_SHIPPING_RATE_EUR[weightBand];
  }

  return {
    routeId: "LAGOS_EINDHOVEN",
    pricingVersion: INDIVIDUAL_SHIPPING_PRICING_VERSION,
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

const getStoredGarmentPieceCount = (item: CartItem): number =>
  item.garmentPieceCount ??
  item.garment.individualShipping?.garmentPieceCount ??
  item.garment.batchShipping?.garmentPieceCount ??
  1;

export const getFinalMileArrivalGroupKey = (item: CartItem): string => {
  if (item.batchType === "alone") return "individual";

  const batchIdentifier =
    item.garment.batchShipping?.batchId ||
    item.batchId ||
    item.customGroupCode ||
    item.batchName;

  return batchIdentifier
    ? `batch:${normalizeText(batchIdentifier).toLocaleLowerCase("en")}`
    : `unassigned:${item.id}`;
};

const getDeliverySelectionKey = (
  selection: DeliverySelection | undefined,
): string => {
  if (!selection) return "destination-required";
  if (selection.method === "PICKUP") {
    return [
      "pickup",
      normalizeText(selection.pickupLocation).toLocaleLowerCase("en"),
      normalizeText(selection.pickupWindow).toLocaleLowerCase("en"),
    ].join("|");
  }

  const address = normalizeDeliveryAddress(selection.address);
  return [
    "delivery",
    address?.countryCode || "",
    normalizePostalCodeForGrouping(address?.postalCode),
    (address?.city || "").toLocaleLowerCase("en"),
    (address?.addressLine1 || "").toLocaleLowerCase("en"),
    (address?.addressLine2 || "").toLocaleLowerCase("en"),
  ].join("|");
};

const getStableGroupId = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `FM-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const getFinalMileShipmentGroupId = (item: CartItem): string =>
  getStableGroupId(
    `${getFinalMileArrivalGroupKey(item)}::${getDeliverySelectionKey(item.deliverySelection)}`,
  );

interface FinalMileCartGroup {
  key: string;
  arrivalGroupKey: string;
  deliverySelection?: DeliverySelection;
  garmentPieceCount: number;
  actualParcelWeightKg: number;
  hasAnyActualWeight: boolean;
  allItemsHaveActualWeight: boolean;
}

export const getCartItemGarmentSubtotal = (item: CartItem): number => {
  const persistedTaxInclusiveSubtotal =
    item.garment.taxInclusiveDesignSubtotal;
  if (
    typeof persistedTaxInclusiveSubtotal === "number" &&
    Number.isFinite(persistedTaxInclusiveSubtotal) &&
    persistedTaxInclusiveSubtotal >= 0
  ) {
    return roundMoney(persistedTaxInclusiveSubtotal);
  }

  return roundMoney(
    Math.max(
      0,
      item.garment.totalPrice - getStoredShippingCost(item.garment),
    ),
  );
};

export interface CartShippingMigrationResult {
  items: CartItem[];
  changed: boolean;
}

const getCartShippingSourceFingerprint = (
  cartItems: CartItem[],
  pieceCounts: ReadonlyMap<string, number | null>,
): string => {
  const source = cartItems
    .map((item) => ({
      id: item.id,
      batchType: item.batchType || null,
      batchId: normalizeText(
        item.batchId || item.customGroupCode || item.batchName,
      ).toLocaleLowerCase("en"),
      garmentPieceCount: pieceCounts.get(item.id) ?? null,
      delivery: getDeliverySelectionKey(item.deliverySelection),
      actualParcelWeightKg:
        item.deliverySelection?.actualParcelWeightKg ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return getStableGroupId(
    JSON.stringify({
      configuration: {
        exchangeRateNgnPerEur:
          LAGOS_EINDHOVEN_EXCHANGE_RATE_NGN_PER_EUR,
        individualPricingVersion:
          INDIVIDUAL_SHIPPING_PRICING_VERSION,
        individualRates: INDIVIDUAL_SHIPPING_RATE_EUR,
        batchPricingVersion: BATCH_SHIPPING_PRICING_VERSION,
        batchPolicy: BATCH_SHIPPING_POLICY,
        finalMilePricingVersion: FINAL_MILE_PRICING_VERSION,
        finalMileRates: FINAL_MILE_RATE_CENTS,
      },
      items: source,
    }),
  );
};

const getCartItemShippingReviewReason = (
  item: CartItem,
  garmentPieceCount: number | null,
): string | null => {
  if (
    item.batchType !== "alone" &&
    item.batchType !== "community" &&
    item.batchType !== "personalized" &&
    item.batchType !== "actual"
  ) {
    return "Review shipping details: select an individual or batch order route.";
  }
  if (garmentPieceCount === null) {
    return "Review shipping details: confirm the garment quantity.";
  }
  if (
    isBatchRoute(item) &&
    !normalizeText(item.batchId || item.customGroupCode || item.batchName)
  ) {
    return "Review shipping details: select the batch for this order.";
  }
  if (!item.deliverySelection) {
    return "Review shipping details";
  }
  if (
    item.deliverySelection.method === "DELIVERY" &&
    !isCompleteDeliveryAddress(item.deliverySelection.address)
  ) {
    return "Review shipping details: complete the delivery address.";
  }
  return null;
};

const getPreviousShippingTotal = (item: CartItem): number => {
  const snapshot = item.shippingSnapshot;
  if (typeof snapshot?.previousShippingTotal === "number") {
    return roundMoney(snapshot.previousShippingTotal);
  }
  if (typeof snapshot?.totalShipping === "number") {
    return roundMoney(snapshot.totalShipping);
  }
  return roundMoney(getStoredShippingCost(item.garment));
};

const makeReviewSnapshot = (
  item: CartItem,
  sourceFingerprint: string,
  repricedAt: string,
  garmentPieceCount: number | null,
  reason: string,
): CartShippingSnapshot => {
  const previousShippingTotal = getPreviousShippingTotal(item);
  return {
    pricingVersion: CART_SHIPPING_SNAPSHOT_VERSION,
    repricedAt,
    sourceFingerprint,
    status: "REVIEW_REQUIRED",
    garmentPieceCount,
    lagosToEindhovenShipping: getStoredShippingCost(item.garment),
    eindhovenToDestinationShipping: null,
    totalShipping: null,
    previousShippingTotal,
    reviewReason: reason,
  };
};

const prepareCartItemWithCurrentInboundShipping = (
  item: CartItem,
  garmentPieceCount: number,
  sourceFingerprint: string,
  repricedAt: string,
): CartItem => {
  const garmentSubtotal = getCartItemGarmentSubtotal(item);
  const individualShipping =
    item.batchType === "alone"
      ? calculateIndividualShipping(garmentPieceCount)
      : undefined;
  const batchIdentifier = normalizeText(
    item.batchId || item.customGroupCode || item.batchName,
  );
  const batchShipping = isBatchRoute(item)
    ? calculateBatchShipping({
        batchId: batchIdentifier,
        batchName: normalizeText(item.batchName || item.customGroupCode),
        plannedGarmentCapacity: BATCH_MINIMUM_GARMENTS,
        garmentPieceCount,
      })
    : undefined;
  const inboundShipping =
    individualShipping?.priceEur ?? batchShipping?.priceEur ?? 0;

  return {
    ...item,
    garmentPieceCount,
    garment: {
      ...item.garment,
      totalPrice: roundMoney(garmentSubtotal + inboundShipping),
      checkoutTotal: roundMoney(garmentSubtotal + inboundShipping),
      selectedDesignPrice: roundMoney(garmentSubtotal + inboundShipping),
      individualShipping,
      batchShipping,
      courierSurcharge: undefined,
    },
    shippingSnapshot: {
      pricingVersion: CART_SHIPPING_SNAPSHOT_VERSION,
      repricedAt,
      sourceFingerprint,
      status: "CURRENT",
      garmentPieceCount,
      lagosToEindhovenShipping: inboundShipping,
      eindhovenToDestinationShipping: 0,
      totalShipping: inboundShipping,
    },
  };
};

export const migrateLegacyCartShippingItems = (
  cartItems: CartItem[],
  repricedAt = new Date().toISOString(),
): CartShippingMigrationResult => {
  if (cartItems.length === 0) {
    return { items: cartItems, changed: false };
  }

  const pieceCounts = new Map(
    cartItems.map((item) => [
      item.id,
      resolveAuthoritativeGarmentPieceCount(item),
    ]),
  );
  const sourceFingerprint = getCartShippingSourceFingerprint(
    cartItems,
    pieceCounts,
  );
  const isAlreadySynchronized = cartItems.every(
    (item) =>
      item.shippingSnapshot?.pricingVersion ===
        CART_SHIPPING_SNAPSHOT_VERSION &&
      item.shippingSnapshot.sourceFingerprint === sourceFingerprint,
  );
  if (isAlreadySynchronized) {
    return { items: cartItems, changed: false };
  }

  const reviewReasons = new Map(
    cartItems.map((item) => [
      item.id,
      getCartItemShippingReviewReason(
        item,
        pieceCounts.get(item.id) ?? null,
      ),
    ]),
  );
  const hasIncompleteSource = Array.from(reviewReasons.values()).some(Boolean);
  if (hasIncompleteSource) {
    const items = cartItems.map((item) => {
      const ownReason = reviewReasons.get(item.id);
      const reviewReason =
        ownReason ||
        "Review shipping details: another cart item has incomplete shipping information.";
      return {
        ...item,
        shippingSnapshot: makeReviewSnapshot(
          item,
          sourceFingerprint,
          repricedAt,
          pieceCounts.get(item.id) ?? null,
          reviewReason,
        ),
      };
    });
    return { items, changed: true };
  }

  const preparedItems = cartItems.map((item) =>
    prepareCartItemWithCurrentInboundShipping(
      item,
      pieceCounts.get(item.id) as number,
      sourceFingerprint,
      repricedAt,
    ),
  );
  const pricing = calculateCartPricing(preparedItems, 0.5);
  const allocations =
    pricing.shippingStatus === "READY"
      ? calculateCartPaymentAllocations(preparedItems, pricing, 0.5)
      : [];
  const allocationByItemId = new Map(
    allocations.map((allocation) => [allocation.itemId, allocation]),
  );

  const items = preparedItems.map((item, index): CartItem => {
    const originalItem = cartItems[index];
    const allocation = allocationByItemId.get(item.id);
    const previousShippingTotal = getPreviousShippingTotal(originalItem);
    const currentInboundShipping = getStoredShippingCost(item.garment);
    const currentFinalMileShipping =
      allocation?.eindhovenToDestinationShipping ?? null;
    const currentTotalShipping = allocation?.totalShipping ?? null;
    const hasChangedRate =
      currentTotalShipping !== null &&
      Math.abs(currentTotalShipping - previousShippingTotal) >= 0.005;

    return {
      ...item,
      shippingSnapshot: {
        pricingVersion: CART_SHIPPING_SNAPSHOT_VERSION,
        repricedAt,
        sourceFingerprint,
        status: hasChangedRate ? "CONFIRMATION_REQUIRED" : "CURRENT",
        garmentPieceCount: item.garmentPieceCount ?? null,
        lagosToEindhovenShipping: currentInboundShipping,
        eindhovenToDestinationShipping: currentFinalMileShipping,
        totalShipping: currentTotalShipping,
        previousShippingTotal,
        updatedShippingTotal: currentTotalShipping ?? undefined,
      },
    };
  });

  return { items, changed: true };
};

export const stampCurrentCartShippingItem = (
  item: CartItem,
  repricedAt = new Date().toISOString(),
): CartItem => {
  const migration = migrateLegacyCartShippingItems([item], repricedAt);
  const migratedItem = migration.items[0];
  if (migratedItem.shippingSnapshot?.status !== "CONFIRMATION_REQUIRED") {
    return migratedItem;
  }

  return {
    ...migratedItem,
    shippingSnapshot: {
      ...migratedItem.shippingSnapshot,
      status: "CURRENT",
      previousShippingTotal:
        migratedItem.shippingSnapshot.updatedShippingTotal,
    },
  };
};

export const confirmCartShippingReprice = (
  cartItems: CartItem[],
  confirmedAt = new Date().toISOString(),
): CartItem[] =>
  cartItems.map((item) => {
    if (item.shippingSnapshot?.status !== "CONFIRMATION_REQUIRED") {
      return item;
    }
    return {
      ...item,
      shippingSnapshot: {
        ...item.shippingSnapshot,
        status: "CURRENT",
        confirmedAt,
        previousShippingTotal:
          item.shippingSnapshot.updatedShippingTotal ??
          item.shippingSnapshot.totalShipping ??
          item.shippingSnapshot.previousShippingTotal,
      },
    };
  });

export const allocateCentsByWeight = (
  totalCents: number,
  weights: number[],
): number[] => {
  const normalizedTotalCents = Math.max(0, Math.round(totalCents));
  if (weights.length === 0) return [];

  const normalizedWeights = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 0,
  );
  const totalWeight = normalizedWeights.reduce(
    (total, weight) => total + weight,
    0,
  );

  if (totalWeight === 0) {
    if (normalizedTotalCents === 0) return weights.map(() => 0);
    throw new Error("Cannot allocate a positive amount without positive weights.");
  }

  const exactAllocations = normalizedWeights.map(
    (weight) => (normalizedTotalCents * weight) / totalWeight,
  );
  const allocations = exactAllocations.map(Math.floor);
  let remainingCents =
    normalizedTotalCents -
    allocations.reduce((total, allocation) => total + allocation, 0);
  const remainderOrder = exactAllocations
    .map((exact, index) => ({
      index,
      remainder: exact - allocations[index],
    }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder || left.index - right.index,
    );

  for (let index = 0; index < remainingCents; index += 1) {
    allocations[remainderOrder[index].index] += 1;
  }

  return allocations;
};

export const calculateCartPricing = (
  cartItems: CartItem[],
  depositRatio: number,
): CartPricingSummary => {
  const normalizedDepositRatio = clampRatio(depositRatio);
  const garmentSubtotal = roundMoney(
    cartItems.reduce(
      (total, item) => total + getCartItemGarmentSubtotal(item),
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
  const lagosToEindhovenShipping = roundMoney(
    (individualShippingQuote?.priceEur ?? 0) +
      batchShippingQuotes.reduce((total, quote) => total + quote.priceEur, 0),
  );

  const finalMileGroups = new Map<string, FinalMileCartGroup>();
  cartItems.forEach((item) => {
    const arrivalGroupKey = getFinalMileArrivalGroupKey(item);
    const deliveryKey = getDeliverySelectionKey(item.deliverySelection);
    const key = `${arrivalGroupKey}::${deliveryKey}`;
    const garmentPieceCount = getStoredGarmentPieceCount(item);
    const actualParcelWeightKg =
      item.deliverySelection?.actualParcelWeightKg;
    const hasActualWeight =
      typeof actualParcelWeightKg === "number" &&
      Number.isFinite(actualParcelWeightKg) &&
      actualParcelWeightKg > 0;
    const existing = finalMileGroups.get(key);

    if (existing) {
      existing.garmentPieceCount += garmentPieceCount;
      existing.hasAnyActualWeight =
        existing.hasAnyActualWeight || hasActualWeight;
      existing.allItemsHaveActualWeight =
        existing.allItemsHaveActualWeight && hasActualWeight;
      if (hasActualWeight) {
        existing.actualParcelWeightKg += actualParcelWeightKg;
      }
      return;
    }

    finalMileGroups.set(key, {
      key,
      arrivalGroupKey,
      deliverySelection: item.deliverySelection,
      garmentPieceCount,
      actualParcelWeightKg: hasActualWeight ? actualParcelWeightKg : 0,
      hasAnyActualWeight: hasActualWeight,
      allItemsHaveActualWeight: hasActualWeight,
    });
  });

  const finalMileShippingQuotes = Array.from(finalMileGroups.values()).map(
    (group) => {
      const selection = group.deliverySelection
        ? {
            ...group.deliverySelection,
            actualParcelWeightKg: group.allItemsHaveActualWeight
              ? group.actualParcelWeightKg
              : undefined,
          }
        : undefined;

      const quote = calculateFinalMileShipping({
        deliverySelection: selection,
        garmentPieceCount: group.garmentPieceCount,
        shipmentGroupId: getStableGroupId(group.key),
        arrivalGroupKey: group.arrivalGroupKey,
      });

      if (
        quote.method === "DELIVERY" &&
        quote.status === "READY" &&
        group.hasAnyActualWeight &&
        !group.allItemsHaveActualWeight
      ) {
        return {
          ...quote,
          status: "MANUAL_QUOTE_REQUIRED" as const,
          weightSource: null,
          weightBand: null,
          actualParcelWeightKg: undefined,
          priceEur: null,
          manualQuoteReason:
            "Complete the actual parcel weight for every item in this shipment before payment.",
        };
      }

      return quote;
    },
  );

  const hasDestinationRequired = finalMileShippingQuotes.some(
    (quote) => quote.status === "DESTINATION_REQUIRED",
  );
  const hasManualQuoteRequired = finalMileShippingQuotes.some(
    (quote) => quote.status === "MANUAL_QUOTE_REQUIRED",
  );
  const shippingStatus: ShippingQuoteStatus = hasDestinationRequired
    ? "DESTINATION_REQUIRED"
    : hasManualQuoteRequired
      ? "MANUAL_QUOTE_REQUIRED"
      : "READY";
  const eindhovenToDestinationShipping =
    shippingStatus === "READY"
      ? roundMoney(
          finalMileShippingQuotes.reduce(
            (total, quote) => total + (quote.priceEur ?? 0),
            0,
          ),
        )
      : null;
  const totalShipping =
    eindhovenToDestinationShipping === null
      ? null
      : roundMoney(
          lagosToEindhovenShipping + eindhovenToDestinationShipping,
        );
  const garmentDeposit = roundMoney(
    garmentSubtotal * normalizedDepositRatio,
  );
  const requiresShippingReview = cartItems.some(
    (item) =>
      !item.shippingSnapshot ||
      item.shippingSnapshot.pricingVersion !==
        CART_SHIPPING_SNAPSHOT_VERSION ||
      item.shippingSnapshot.status === "REVIEW_REQUIRED",
  );
  const requiresShippingConfirmation = cartItems.some(
    (item) =>
      item.shippingSnapshot?.status === "CONFIRMATION_REQUIRED",
  );
  const requiresPriceConfirmation = cartItems.some(
    (item) =>
      item.pricingReview?.status === "CONFIRMATION_REQUIRED",
  );
  const blockingReasons = Array.from(
    new Set(
      [
        ...cartItems
          .filter(
            (item) =>
              !item.shippingSnapshot ||
              item.shippingSnapshot.pricingVersion !==
                CART_SHIPPING_SNAPSHOT_VERSION ||
              item.shippingSnapshot.status === "REVIEW_REQUIRED",
          )
          .map(
            (item) =>
              item.shippingSnapshot?.reviewReason ||
              "Review shipping details",
          ),
        ...(requiresShippingConfirmation
          ? ["Confirm the updated shipping amount before payment."]
          : []),
        ...(requiresPriceConfirmation
          ? ["Confirm the updated garment price before payment."]
          : []),
        ...finalMileShippingQuotes
          .filter((quote) => quote.status !== "READY")
          .map(
            (quote) =>
              quote.manualQuoteReason ||
              (quote.status === "DESTINATION_REQUIRED"
                ? "Select pickup or complete the delivery address in Design Studio Step 7."
                : "A final-delivery shipping quote is required."),
          ),
      ],
    ),
  );

  return {
    garmentSubtotal,
    lagosToEindhovenShipping,
    eindhovenToDestinationShipping,
    totalShipping,
    shippingTotal: totalShipping,
    total:
      totalShipping === null
        ? null
        : roundMoney(garmentSubtotal + totalShipping),
    depositDueNow:
      totalShipping === null
        ? null
        : roundMoney(garmentDeposit + totalShipping),
    remainingDue: roundMoney(garmentSubtotal - garmentDeposit),
    individualShippingQuote,
    batchShippingQuotes,
    finalMileShippingQuotes,
    shippingStatus,
    blockingReasons,
    requiresShippingReview,
    requiresShippingConfirmation,
    requiresPriceConfirmation,
    canCheckout:
      shippingStatus === "READY" &&
      !requiresShippingReview &&
      !requiresShippingConfirmation &&
      !requiresPriceConfirmation,
    shippingQuote: individualShippingQuote,
  };
};

const moneyToCents = (value: number): number =>
  Math.round(roundMoney(value) * 100);

const sumCents = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0);

export const calculateCartPaymentAllocations = (
  cartItems: CartItem[],
  pricing: CartPricingSummary,
  depositRatio: number,
): CartPaymentAllocation[] => {
  if (
    !pricing.canCheckout ||
    pricing.total === null ||
    pricing.depositDueNow === null ||
    pricing.eindhovenToDestinationShipping === null
  ) {
    throw new Error("Shipping must be fully priced before payment allocation.");
  }

  const itemIds = new Set(cartItems.map((item) => item.id));
  if (itemIds.size !== cartItems.length) {
    throw new Error("Cart item IDs must be unique before payment allocation.");
  }

  const allocationByItemId = new Map<
    string,
    {
      garmentSubtotalCents: number;
      garmentDepositCents: number;
      inboundShippingCents: number;
      finalMileShippingCents: number;
    }
  >(
    cartItems.map((item) => [
      item.id,
      {
        garmentSubtotalCents: moneyToCents(
          getCartItemGarmentSubtotal(item),
        ),
        garmentDepositCents: 0,
        inboundShippingCents: 0,
        finalMileShippingCents: 0,
      },
    ]),
  );

  const allocateToItems = (
    items: CartItem[],
    totalCents: number,
    field: "garmentDepositCents" | "inboundShippingCents" | "finalMileShippingCents",
    weights: number[],
  ) => {
    const itemAllocations = allocateCentsByWeight(totalCents, weights);
    items.forEach((item, index) => {
      const allocation = allocationByItemId.get(item.id);
      if (!allocation) {
        throw new Error(`Missing payment allocation record for ${item.id}.`);
      }
      allocation[field] += itemAllocations[index];
    });
  };

  const garmentSubtotalWeights = cartItems.map(
    (item) =>
      allocationByItemId.get(item.id)?.garmentSubtotalCents ?? 0,
  );
  allocateToItems(
    cartItems,
    moneyToCents(
      pricing.garmentSubtotal * clampRatio(depositRatio),
    ),
    "garmentDepositCents",
    garmentSubtotalWeights,
  );

  const individualItems = cartItems.filter(
    (item) => item.batchType === "alone",
  );
  if (pricing.individualShippingQuote) {
    if (individualItems.length === 0) {
      throw new Error("Individual shipping quote has no matching cart items.");
    }
    allocateToItems(
      individualItems,
      moneyToCents(pricing.individualShippingQuote.priceEur),
      "inboundShippingCents",
      individualItems.map(getStoredGarmentPieceCount),
    );
  }

  const batchItemsByArrivalGroup = new Map<string, CartItem[]>();
  cartItems.filter(isBatchRoute).forEach((item) => {
    const key = getFinalMileArrivalGroupKey(item);
    const items = batchItemsByArrivalGroup.get(key) || [];
    items.push(item);
    batchItemsByArrivalGroup.set(key, items);
  });
  pricing.batchShippingQuotes.forEach((quote) => {
    const key = `batch:${normalizeText(quote.batchId).toLocaleLowerCase("en")}`;
    const items = batchItemsByArrivalGroup.get(key);
    if (!items?.length) {
      throw new Error(
        `Batch shipping quote ${quote.batchId} has no matching cart items.`,
      );
    }
    allocateToItems(
      items,
      moneyToCents(quote.priceEur),
      "inboundShippingCents",
      items.map(getStoredGarmentPieceCount),
    );
    batchItemsByArrivalGroup.delete(key);
  });
  if (batchItemsByArrivalGroup.size > 0) {
    throw new Error("A batch cart item is missing its inbound shipping quote.");
  }

  const finalMileItemsByGroup = new Map<string, CartItem[]>();
  cartItems.forEach((item) => {
    const groupId = getFinalMileShipmentGroupId(item);
    const items = finalMileItemsByGroup.get(groupId) || [];
    items.push(item);
    finalMileItemsByGroup.set(groupId, items);
  });
  const finalMileQuoteIds = new Set(
    pricing.finalMileShippingQuotes.map((quote) => quote.shipmentGroupId),
  );
  if (finalMileQuoteIds.size !== pricing.finalMileShippingQuotes.length) {
    throw new Error("Final-mile shipment group IDs must be unique.");
  }
  pricing.finalMileShippingQuotes.forEach((quote) => {
    const items = finalMileItemsByGroup.get(quote.shipmentGroupId);
    if (!items?.length || quote.priceEur === null) {
      throw new Error(
        `Final-mile quote ${quote.shipmentGroupId} cannot be allocated.`,
      );
    }
    allocateToItems(
      items,
      moneyToCents(quote.priceEur),
      "finalMileShippingCents",
      items.map(getStoredGarmentPieceCount),
    );
    finalMileItemsByGroup.delete(quote.shipmentGroupId);
  });
  if (finalMileItemsByGroup.size > 0) {
    throw new Error("A cart item is missing its final-mile shipping quote.");
  }

  const allocations = cartItems.map((item): CartPaymentAllocation => {
    const cents = allocationByItemId.get(item.id);
    if (!cents) {
      throw new Error(`Missing completed allocation for ${item.id}.`);
    }
    const remainingGarmentCents =
      cents.garmentSubtotalCents - cents.garmentDepositCents;
    const totalShippingCents =
      cents.inboundShippingCents + cents.finalMileShippingCents;

    return {
      itemId: item.id,
      garmentSubtotal: cents.garmentSubtotalCents / 100,
      garmentDeposit: cents.garmentDepositCents / 100,
      remainingGarmentBalance: remainingGarmentCents / 100,
      lagosToEindhovenShipping: cents.inboundShippingCents / 100,
      eindhovenToDestinationShipping:
        cents.finalMileShippingCents / 100,
      totalShipping: totalShippingCents / 100,
      orderSubtotal:
        (cents.garmentSubtotalCents + totalShippingCents) / 100,
      dueNow: (cents.garmentDepositCents + totalShippingCents) / 100,
    };
  });

  const allocatedInboundCents = sumCents(
    allocations.map((allocation) =>
      moneyToCents(allocation.lagosToEindhovenShipping),
    ),
  );
  const allocatedFinalMileCents = sumCents(
    allocations.map((allocation) =>
      moneyToCents(allocation.eindhovenToDestinationShipping),
    ),
  );
  const allocatedDueNowCents = sumCents(
    allocations.map((allocation) => moneyToCents(allocation.dueNow)),
  );
  const allocatedTotalCents = sumCents(
    allocations.map((allocation) =>
      moneyToCents(allocation.orderSubtotal),
    ),
  );

  if (
    allocatedInboundCents !== moneyToCents(pricing.lagosToEindhovenShipping) ||
    allocatedFinalMileCents !==
      moneyToCents(pricing.eindhovenToDestinationShipping) ||
    allocatedDueNowCents !== moneyToCents(pricing.depositDueNow) ||
    allocatedTotalCents !== moneyToCents(pricing.total)
  ) {
    throw new Error("Checkout payment allocations do not reconcile.");
  }

  return allocations;
};
