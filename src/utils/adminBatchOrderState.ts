import type { Batch } from "../types";
import { getBatchOrderWindow } from "./batchOrderWindow";
import { normalizeBatchStatus, REGISTRATION_OPEN_STATUSES } from "./batchStatus";
import { formatHomepageBatchDeadline } from "./homepageOrderGateway";

export interface AdminBatchOrderState {
  /** Short note shown next to the stored status badge. */
  readonly label: string;
  /** Whether customers can order in this batch right now. */
  readonly customersCanOrder: boolean;
}

/** Calendar day (YYYY-MM-DD) of an end-of-day +01:00 boundary. */
const boundaryDay = (value: Date): string =>
  new Date(value.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);

const formatDay = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;
  return formatHomepageBatchDeadline(
    typeof value === "string" ? value : boundaryDay(value),
    "short",
  );
};

/**
 * What customers see for a batch, from the same getBatchOrderWindow rule the
 * Studio, homepage and server use. Null when the stored status already says
 * it (for example COMPLETED, or OPEN inside its dates without the toggle).
 */
export function getAdminBatchOrderState(
  batch: Batch,
  now: Date = new Date(),
): AdminBatchOrderState | null {
  const status = String(normalizeBatchStatus(batch.status) || "");
  const keepOpen = batch.keepOpenAfterEndDate === true;
  const openStatus = REGISTRATION_OPEN_STATUSES.includes(
    status as Batch["status"],
  );
  if (!openStatus && !keepOpen) return null;
  const orderWindow = getBatchOrderWindow(batch, now);
  const untilLabel = formatDay(orderWindow.ongoingUntil);
  if (orderWindow.open) {
    if (orderWindow.ongoing) {
      return {
        label: untilLabel
          ? `${status} \u00b7 ongoing until ${untilLabel}`
          : `${status} \u00b7 ongoing`,
        customersCanOrder: true,
      };
    }
    if (keepOpen && orderWindow.endDate) {
      return {
        label: untilLabel
          ? `Stays open after ${formatDay(orderWindow.endDate)}, until ${untilLabel}`
          : `Stays open after ${formatDay(orderWindow.endDate)}`,
        customersCanOrder: true,
      };
    }
    return null;
  }
  if (!openStatus) return null;
  if (orderWindow.dateReason === "ended") {
    return {
      label: `${status} (expired ${formatDay(orderWindow.endDate)} \u2014 customers see closed)`,
      customersCanOrder: false,
    };
  }
  if (orderWindow.dateReason === "ongoing_ended") {
    return {
      label: `${status} (open until ${formatDay(orderWindow.effectiveCloseDate)} has passed \u2014 customers see closed)`,
      customersCanOrder: false,
    };
  }
  return {
    label: `${status} (customers see closed: ${orderWindow.reason || "not accepting orders"})`,
    customersCanOrder: false,
  };
}
