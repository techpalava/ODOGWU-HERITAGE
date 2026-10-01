import { presentFutureOrderV2History } from "./futureOrderV2History.js";

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

const v2TotalLabel = (exactTotalCents: number | null): string =>
  exactTotalCents === null ? "N/A" : `V2 total €${(exactTotalCents / 100).toFixed(2)}`;

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

const manifestValues = (order: unknown): string[] => {
  try {
    const history = presentFutureOrderV2History(order);
    if (history.status === "valid") {
      return [
        history.value.orderId,
        text(history.value.customer.fullName, "N/A"),
        text(history.value.customer.email, "N/A"),
        text(history.value.customer.phone, "N/A"),
        ...workshopNotAvailable(),
        v2TotalLabel(history.value.exactTotalCents),
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

export const buildProductionManifestCsv = (orders: readonly unknown[]): string => {
  const rows = [PRODUCTION_MANIFEST_HEADERS.join(",")];
  for (const order of orders) {
    rows.push(manifestValues(order).map(escapeCSV).join(","));
  }
  return rows.join("\n");
};
