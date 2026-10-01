export const CUSTOMER_WORKSHOP_DELIVERY_UNSCHEDULED = "Not scheduled yet";

export interface CustomerWorkshopProgress {
  readonly statusLabel: string;
  readonly stageLabel: string;
  readonly deliveryLabel: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const formatIsoDate = (value: string): string | null => {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const workshopDeliveryDateInputValue = (value: unknown): string => {
  const dated = text(value);
  return ISO_DATE.test(dated) ? dated : "";
};

export const presentCustomerWorkshopProgress = (
  order: unknown,
): CustomerWorkshopProgress => {
  const source = isRecord(order) ? order : {};
  const shipment = isRecord(source.shipment) ? source.shipment : {};
  const status = text(shipment.status);
  const stageNumber = Number(shipment.currentStage);
  const stage = Number.isFinite(stageNumber)
    ? Math.min(6, Math.max(1, Math.trunc(stageNumber)))
    : 1;
  const dated = text(shipment.estimatedDeliveryDate) || text(shipment.estimatedDelivery);
  return {
    statusLabel: status || "In production",
    stageLabel: `Stage ${stage} of 6`,
    deliveryLabel: dated
      ? formatIsoDate(dated) ?? dated
      : CUSTOMER_WORKSHOP_DELIVERY_UNSCHEDULED,
  };
};
