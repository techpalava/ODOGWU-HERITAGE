import { presentFutureOrderV2History, unwrapDocumentProjection } from "./futureOrderV2History.js";
import { parsePersistedFutureOrderV2 } from "./futureOrderV2PersistenceContract.js";
import {
  presentPersonalizedAdditionSettlement,
  reportedPaidTotalCents,
  type FutureOrderV2PersonalizedPriceRecord,
} from "./futureOrderV2PersonalizedPrice.js";
import { formatFutureOrderV2PaidAmount } from "./futureOrderV2PaymentRecord.js";
import type {
  TailoringMeasurementValue,
  TailoringWearerReadout,
} from "./tailoringMeasurementProjection.js";

export const PRODUCTION_MANIFEST_HEADERS = [
  "Order / Tracking ID",
  "Customer Name",
  "Customer Email",
  "Customer Phone",
  "Garment Style ID",
  "Garment Style Name",
  "Garment Selection / Type",
  "Fabric Sourcing Code",
  "Fabric Name",
  "Collar Option",
  "Embroidery Code / Style",
  "Sleeve Option",
  "Pocket Style",
  "Additional Cap Included",
  "Hem Finish Style",
  "Measurement Unit",
  "Height (cm)",
  "Weight (kg)",
  "Age",
  "Body Build",
  "Fit Preference",
  "Neck Dimension",
  "Shoulder Dimension",
  "Chest Dimension",
  "Waist Dimension",
  "Hip Dimension",
  "Sleeve Dimension",
  "Trouser Length",
  "Head Size (Cap)",
  "Trouser Crotch Depth",
  "Leftover Fabric Instructions",
  "Special Workshop Instructions",
] as const;

const escapeCSV = (value: unknown): string => {
  if (value === undefined || value === null) return '""';
  return `"${String(value).replaceAll('"', '""')}"`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() ? value : fallback;

const workshopNotAvailable = (): string[] =>
  PRODUCTION_MANIFEST_HEADERS.slice(4, -1).map(() => "N/A");

/** Header indexes of the workshop columns a V2 order fills from its saved measurements. */
const MANIFEST_COLUMN = (header: (typeof PRODUCTION_MANIFEST_HEADERS)[number]): number =>
  PRODUCTION_MANIFEST_HEADERS.indexOf(header);

/**
 * Legacy single-value columns that map one-to-one to a V2 measurement. Sleeve and
 * Trouser Length have several V2 fields (short/long sleeve; ankle, side and back
 * lengths), so they stay blank and the full readout carries them.
 */
const V2_ONE_TO_ONE_COLUMNS: ReadonlyArray<readonly [(typeof PRODUCTION_MANIFEST_HEADERS)[number], string]> = [
  ["Height (cm)", "total_height"],
  ["Neck Dimension", "neck_circumference"],
  ["Shoulder Dimension", "shoulder_length"],
  ["Chest Dimension", "chest_bust_circumference"],
  ["Waist Dimension", "waist_circumference"],
  ["Hip Dimension", "hip_circumference"],
  ["Head Size (Cap)", "head_circumference"],
  ["Trouser Crotch Depth", "waist_to_crotch_depth_length"],
];

/** V2 does not ask for these, so they stay "N/A". */
const V2_NOT_COLLECTED_COLUMNS = ["Weight (kg)", "Age", "Body Build", "Fit Preference"] as const;

const roundCm = (valueCm: number): number => Math.round(valueCm * 10) / 10;

/**
 * Column cell for one measurement: centimetres to 1 decimal, and a height estimate says so.
 * Blank when the order has more than one person, is Sample Cloth (laid-flat widths are not
 * body dimensions) or holds different values for the field (per-garment estimates).
 */
const v2ColumnValue = (
  readout: readonly TailoringWearerReadout[],
  measurementId: string,
): string => {
  if (readout.length !== 1 || readout[0].methodNote) return "";
  const wearer = readout[0];
  const values: TailoringMeasurementValue[] = [
    ...wearer.shared,
    ...wearer.garments.flatMap((garment) => garment.values),
  ].filter((value) => value.measurementId === measurementId);
  const distinct = new Set(values.map((value) => `${roundCm(value.valueCm)}|${value.estimated}`));
  if (values.length === 0 || distinct.size !== 1) return "";
  const value = values[0];
  return `${roundCm(value.valueCm)}${value.estimated ? " (estimated from height)" : ""}`;
};

/**
 * The staff readout as one line: "Ada — Method: …: Shared Total Height: 172 cm; … |
 * Standard Shirt: Head Circumference: 59.1 cm (estimated from height); …", people " || ".
 */
const v2MeasurementsText = (readout: readonly TailoringWearerReadout[]): string =>
  readout
    .map((wearer) =>
      [
        `${wearer.displayName} — Method: ${wearer.methodLabel}${wearer.methodNote ? ` (${wearer.methodNote})` : ""}`,
        ...(wearer.shared.length
          ? [wearer.shared.map((value) => `Shared ${value.label}: ${value.display}`).join("; ")]
          : []),
        ...wearer.garments
          .filter((garment) => garment.values.length > 0)
          .map(
            (garment) =>
              `${garment.label}: ${garment.values.map((value) => `${value.label}: ${value.display}`).join("; ")}`,
          ),
      ].join(" | "),
    )
    .join(" || ");

/** Workshop columns of a V2 row: saved measurements where they map, "N/A" elsewhere. */
const v2WorkshopValues = (readout: readonly TailoringWearerReadout[] | null): string[] => {
  const values = workshopNotAvailable();
  if (!readout || readout.length === 0) return values;
  // workshopNotAvailable starts at header index 4.
  const set = (header: (typeof PRODUCTION_MANIFEST_HEADERS)[number], value: string) => {
    values[MANIFEST_COLUMN(header) - 4] = value;
  };
  set("Measurement Unit", "cm");
  V2_ONE_TO_ONE_COLUMNS.forEach(([header, measurementId]) =>
    set(header, v2ColumnValue(readout, measurementId)),
  );
  set("Sleeve Dimension", "");
  set("Trouser Length", "");
  V2_NOT_COLLECTED_COLUMNS.forEach((header) => set(header, "N/A"));
  return values;
};

const v2TotalLabel = (exactTotalCents: number | null): string =>
  exactTotalCents === null ? "N/A" : `V2 total €${(exactTotalCents / 100).toFixed(2)}`;

export interface ProductionManifestContext {
  readonly personalizedPricesByOrderId?: ReadonlyMap<string, FutureOrderV2PersonalizedPriceRecord>;
  readonly paymentsByOrderId?: ReadonlyMap<string, { readonly amountCents: number }>;
}

const settledTotalLabel = (
  order: unknown,
  context: ProductionManifestContext | undefined,
): string | null => {
  if (!context?.personalizedPricesByOrderId) return null;
  const parsed = parsePersistedFutureOrderV2(unwrapDocumentProjection(order));
  if (parsed.status !== "valid") return null;
  const price = context.personalizedPricesByOrderId.get(parsed.value.orderId) ?? null;
  const settlement = presentPersonalizedAdditionSettlement(
    parsed.value.masterOrder.cartItem.candidate,
    price,
  );
  if (!settlement.additionSettled) return null;
  const totalPaidCents = reportedPaidTotalCents({
    basePaymentCents: context.paymentsByOrderId?.get(parsed.value.orderId)?.amountCents ?? null,
    settlement,
  });
  if (totalPaidCents === null) return null;
  const references = settlement.additionPaymentReferences.join(", ");
  return `V2 total ${formatFutureOrderV2PaidAmount(totalPaidCents)} (addition ${formatFutureOrderV2PaidAmount(settlement.paidAdditionCents)}${references ? `, ${references}` : ""})`;
};

const legacyManifestValues = (order: unknown): string[] => {
  const source = isRecord(order) ? order : {};
  const shipment = isRecord(source.shipment) ? source.shipment : {};
  const customer = isRecord(source.customer) ? source.customer : {};
  const style = isRecord(source.style) ? source.style : {};
  const garment = isRecord(source.garment) ? source.garment : {};
  const fabric = isRecord(source.fabric) ? source.fabric : {};
  const design = isRecord(source.design) ? source.design : {};
  const measurements = isRecord(source.measurements) ? source.measurements : {};
  return [
    text(shipment.trackingId, "N/A"),
    text(customer.name, "N/A"),
    text(customer.email, "N/A"),
    text(customer.phone, "N/A"),
    text(style.id, "N/A"),
    text(style.name, "N/A"),
    text(garment.type, "N/A"),
    text(fabric.code, "N/A"),
    text(fabric.name, "N/A"),
    text(design.collar, "Standard Mandarin"),
    text(design.embroidery, "None"),
    text(design.sleeve, "Long Sleeve"),
    text(design.pocket, "None"),
    design.additionalCap ? "Yes" : "No",
    text(design.hemFinish, "Standard Custom"),
    text(measurements.unit, "inch"),
    measurements.height ?? "",
    measurements.weight ?? "",
    measurements.age ?? "",
    text(measurements.bodyBuild, "Average"),
    text(measurements.fitPreference, "Standard"),
    measurements.neck ?? "",
    measurements.shoulder ?? "",
    measurements.chest ?? "",
    measurements.waist ?? "",
    measurements.hip ?? "",
    measurements.sleeve ?? "",
    measurements.trouserLength ?? "",
    measurements.head ?? "",
    measurements.trouserCrotchDepth ?? "",
    text(source.notesAboutLeftoverFabric, "Return with garment"),
    typeof source.specialInstructions === "string" ? source.specialInstructions : "",
  ].map((value) => String(value));
};

const manifestValues = (order: unknown, context?: ProductionManifestContext): string[] => {
  try {
    const history = presentFutureOrderV2History(order);
    if (history.status === "valid") {
      return [
        history.value.orderId,
        text(history.value.customer.fullName, "N/A"),
        text(history.value.customer.email, "N/A"),
        text(history.value.customer.phone, "N/A"),
        ...v2WorkshopValues(history.value.tailoringMeasurements),
        [
          settledTotalLabel(order, context) ?? v2TotalLabel(history.value.exactTotalCents),
          ...(history.value.tailoringMeasurements?.length
            ? [`Measurements: ${v2MeasurementsText(history.value.tailoringMeasurements)}`]
            : []),
        ].join(" || "),
      ];
    }
    if (history.status === "invalid_history") {
      const orderId = isRecord(order) ? order.orderId : undefined;
      return [
        text(orderId, "N/A"),
        "N/A",
        "N/A",
        "N/A",
        ...workshopNotAvailable(),
        "N/A",
      ];
    }
  } catch {
    return PRODUCTION_MANIFEST_HEADERS.map(() => "N/A");
  }
  return legacyManifestValues(order);
};

export const buildProductionManifestCsv = (
  orders: readonly unknown[],
  context?: ProductionManifestContext,
): string => {
  const rows = [PRODUCTION_MANIFEST_HEADERS.join(",")];
  for (const order of orders) {
    rows.push(manifestValues(order, context).map(escapeCSV).join(","));
  }
  return rows.join("\n");
};
