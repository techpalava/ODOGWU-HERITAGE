import type { Batch } from "../types";

export type BatchStatus = Batch["status"];

const BATCH_STATUS_ALIASES: Record<string, BatchStatus> = {
  DRAFT: "DRAFT",
  YET_TO_START: "YET_TO_START",
  OPEN: "OPEN",
  RECRUITING: "RECRUITING",
  ALMOST_FULL: "ALMOST_FULL",
  FULL: "FULL",
  CLOSED: "CLOSED",
  COMING_SOON: "COMING_SOON",
  IN_PROGRESS: "PRODUCTION_STARTED",
  PRODUCTION_READY: "PRODUCTION_READY",
  PRODUCTION_STARTED: "PRODUCTION_STARTED",
  QUALITY_CONTROL: "QUALITY_CONTROL",
  PACKED: "PACKED",
  SHIPPED: "SHIPPED",
  ARRIVED_NETHERLANDS: "ARRIVED_NETHERLANDS",
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  COLLECTED: "COLLECTED",
  COMPLETED: "COMPLETED",
};

export const REGISTRATION_OPEN_STATUSES: BatchStatus[] = [
  "OPEN",
  "RECRUITING",
  "ALMOST_FULL",
];

export const PRODUCTION_OR_CLOSED_STATUSES: BatchStatus[] = [
  "FULL",
  "CLOSED",
  "PRODUCTION_READY",
  "PRODUCTION_STARTED",
  "QUALITY_CONTROL",
  "PACKED",
  "SHIPPED",
  "ARRIVED_NETHERLANDS",
  "READY_FOR_PICKUP",
  "COLLECTED",
  "COMPLETED",
];

export function normalizeBatchStatus(status?: string): BatchStatus | string {
  const normalized = (status || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  return BATCH_STATUS_ALIASES[normalized] || normalized;
}
