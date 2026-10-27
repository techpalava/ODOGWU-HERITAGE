import { BatchBusinessRules } from "../engine/BatchBusinessRules.js";
import type { Batch, OrderContext } from "../types.js";
import {
  getBatchDateWindow,
  normalizeBatchOngoingUntil,
  type BatchDateWindowReason,
} from "./batchDateRange.js";

/**
 * Single source of truth for "can a customer order in this community batch
 * right now?". Design Studio, cart, payment, the homepage Join card, the
 * footer link, admin and the server gate all read this, so they agree.
 *
 * Rules (BatchBusinessRules.canAcceptOrders): a passed end date closes the
 * batch in AUTO and MANUAL modes, unless the admin turned on
 * `keepOpenAfterEndDate`; then it stays open until `ongoingUntil` (blank =
 * until an admin closes it). allowOrders=false, full capacity, a manual
 * non-open status and production statuses still close the batch.
 */
export interface BatchOrderWindow {
  readonly open: boolean;
  /** BatchBusinessRules status code, e.g. OPEN_FOR_ORDERS or EXPIRED. */
  readonly statusCode: string;
  /** Human reason when closed, null when open. */
  readonly reason: string | null;
  readonly dateReason: BatchDateWindowReason;
  /** Last moment the dates accept orders, null for no end / ongoing. */
  readonly effectiveCloseDate: Date | null;
  /** The batch's own end date boundary. */
  readonly endDate: Date | null;
  /** The keep-open toggle is on. */
  readonly keepOpenAfterEndDate: boolean;
  /** The valid stored "Open until" date (YYYY-MM-DD), if any. */
  readonly ongoingUntil: string | undefined;
  /** Open past its end date because of the keep-open toggle. */
  readonly ongoing: boolean;
}

export function getBatchOrderWindow(
  batch: Batch | null | undefined,
  now: Date = new Date(),
): BatchOrderWindow {
  const eligibility = BatchBusinessRules.canAcceptOrders(batch, now);
  const dates = getBatchDateWindow(batch ?? null, now);
  const keepOpenAfterEndDate = batch?.keepOpenAfterEndDate === true;
  return {
    open: eligibility.canAcceptOrders,
    statusCode: eligibility.statusCode,
    reason: eligibility.canAcceptOrders ? null : eligibility.reason,
    dateReason: dates.reason,
    effectiveCloseDate: dates.effectiveCloseDate,
    endDate: dates.endDate,
    keepOpenAfterEndDate,
    ongoingUntil: keepOpenAfterEndDate
      ? normalizeBatchOngoingUntil(batch?.ongoingUntil)
      : undefined,
    ongoing: eligibility.canAcceptOrders && dates.ongoing,
  };
}

/**
 * Keep-open fields for an OrderContext built from a live batch, so
 * context-based checks (BatchBusinessRules on an OrderContext) honour the
 * toggle. Empty when the toggle is off, so default contexts are unchanged.
 */
export function batchOrderWindowContextFields(
  batch: Batch | null | undefined,
): Pick<OrderContext, "keepOpenAfterEndDate" | "ongoingUntil"> {
  if (batch?.keepOpenAfterEndDate !== true) return {};
  const ongoingUntil = normalizeBatchOngoingUntil(batch.ongoingUntil);
  return ongoingUntil
    ? { keepOpenAfterEndDate: true, ongoingUntil }
    : { keepOpenAfterEndDate: true };
}
