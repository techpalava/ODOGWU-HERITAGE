import { CUSTOMER_WORKSHOP_DELIVERY_UNSCHEDULED, presentCustomerWorkshopProgress } from "./customerWorkshopProgress.js";

export const FUTURE_ORDER_V2_WORKSHOP_COLLECTION = "future_order_v2_workshop" as const;

export interface FutureOrderV2WorkshopProgress {
  readonly schemaVersion: 1;
  readonly orderId: string;
  readonly ownerUid: string;
  readonly currentStage: number;
  readonly status: string;
  readonly estimatedDeliveryDate: string;
  readonly pickupPin: string;
  readonly dispatchStatus: WorkshopDispatchStatus;
}

export const WORKSHOP_DISPATCH_STATUSES = ["not_dispatched", "dispatched", "arrived"] as const;

export type WorkshopDispatchStatus = (typeof WORKSHOP_DISPATCH_STATUSES)[number];

const DISPATCH_LABELS: Record<WorkshopDispatchStatus, string> = {
  not_dispatched: "Not dispatched",
  dispatched: "Dispatched",
  arrived: "Arrived for pickup",
};

export const parseWorkshopDispatchStatus = (value: unknown): WorkshopDispatchStatus =>
  value === "dispatched" || value === "arrived" || value === "not_dispatched"
    ? value
    : "not_dispatched";

export const workshopDispatchLabel = (status: WorkshopDispatchStatus): string =>
  DISPATCH_LABELS[status];

const STAGE_STATUSES = [
  "Deposit Verified. Securing Fabric Swatch...",
  "Fabric Cut & Registered with Lagos Atelier floor",
  "Pattern Drafting & Sewing on Lagos floor",
  "Garment Sewing Completed. Passing QA & Fit Checks...",
  "Consolidated & Dispatched via Lagos-Schiethol Air Freight Route",
] as const;

const PICKUP_PIN = /^\d{6}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const generateWorkshopPickupPin = (): string => {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
};

export const resolveWorkshopPickupPin = (
  stage: number,
  existing: FutureOrderV2WorkshopProgress | undefined,
): string => {
  if (stage !== 6) return "";
  if (existing?.currentStage === 6 && PICKUP_PIN.test(existing.pickupPin)) return existing.pickupPin;
  return generateWorkshopPickupPin();
};

export const workshopStageStatus = (stage: number, pickupLocation: string): string => {
  if (stage === 6) {
    const location = pickupLocation.trim() || "the pickup location";
    return `Arrived at ${location}. Ready for secure PIN pickup!`;
  }
  return STAGE_STATUSES[stage - 1] || "In Production Pipeline";
};

export const parseFutureOrderV2WorkshopProgress = (
  value: unknown,
): FutureOrderV2WorkshopProgress | null => {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const stage = value.currentStage;
  if (
    typeof value.orderId !== "string" ||
    !value.orderId ||
    typeof value.ownerUid !== "string" ||
    !value.ownerUid ||
    typeof stage !== "number" ||
    !Number.isInteger(stage) ||
    stage < 1 ||
    stage > 6 ||
    typeof value.status !== "string" ||
    !value.status.trim() ||
    typeof value.estimatedDeliveryDate !== "string"
  ) {
    return null;
  }
  const pickupPin = value.pickupPin === undefined ? "" : value.pickupPin;
  if (typeof pickupPin !== "string" || (pickupPin !== "" && !PICKUP_PIN.test(pickupPin))) return null;
  return {
    schemaVersion: 1,
    orderId: value.orderId,
    ownerUid: value.ownerUid,
    currentStage: stage,
    status: value.status,
    estimatedDeliveryDate: value.estimatedDeliveryDate,
    pickupPin,
    dispatchStatus: parseWorkshopDispatchStatus(value.dispatchStatus),
  };
};

export interface FutureOrderV2WorkshopCard {
  readonly statusLabel: string;
  readonly stageLabel: string | null;
  readonly deliveryLabel: string;
  readonly pickupPinLabel: string | null;
  readonly dispatchLabel: string | null;
}

export const presentFutureOrderV2WorkshopCard = (
  record: FutureOrderV2WorkshopProgress | undefined,
): FutureOrderV2WorkshopCard => {
  if (!record) {
    return {
      statusLabel: "Production has not started",
      stageLabel: null,
      deliveryLabel: CUSTOMER_WORKSHOP_DELIVERY_UNSCHEDULED,
      pickupPinLabel: null,
      dispatchLabel: null,
    };
  }
  const progress = presentCustomerWorkshopProgress({
    shipment: {
      status: record.status,
      currentStage: record.currentStage,
      estimatedDeliveryDate: record.estimatedDeliveryDate,
    },
  });
  return {
    statusLabel: progress.statusLabel,
    stageLabel: progress.stageLabel,
    deliveryLabel: progress.deliveryLabel,
    pickupPinLabel: record.currentStage === 6 && PICKUP_PIN.test(record.pickupPin) ? record.pickupPin : null,
    dispatchLabel: workshopDispatchLabel(record.dispatchStatus),
  };
};
