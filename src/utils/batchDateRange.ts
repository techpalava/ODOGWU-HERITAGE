const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BUSINESS_TIMEZONE_OFFSET = "+01:00";

export function parseBatchDateBoundary(
  value: string | undefined,
  boundary: "start" | "end",
): Date | null {
  if (!value) {
    return null;
  }

  const timestamp = DATE_ONLY_PATTERN.test(value)
    ? `${value}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}${BUSINESS_TIMEZONE_OFFSET}`
    : value;
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function isWithinBatchDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
  now: Date,
): boolean {
  const start = parseBatchDateBoundary(startDate, "start");
  const end = parseBatchDateBoundary(endDate, "end");

  return Boolean(start && end && now >= start && now <= end);
}

/**
 * The date part of a batch's ordering window. Admin's per-batch
 * "Keep open after end date (ongoing)" toggle (`keepOpenAfterEndDate`) only
 * moves this end boundary; it never overrides allowOrders, capacity or
 * production statuses (see BatchBusinessRules.canAcceptOrders).
 */
export interface BatchDateWindowInput {
  readonly endDate?: string | null;
  readonly keepOpenAfterEndDate?: boolean | null;
  readonly ongoingUntil?: string | null;
}

export type BatchDateWindowReason =
  /** No readable end date: the date never closes ordering. */
  | "no_end_date"
  /** On or before the batch's own end date. */
  | "before_end_date"
  /** Past the end date and kept open with no "Open until" date. */
  | "ongoing"
  /** Past the end date and kept open until `ongoingUntil`. */
  | "ongoing_until"
  /** Past the end date (toggle off). */
  | "ended"
  /** Past both the end date and the "Open until" date. */
  | "ongoing_ended";

export interface BatchDateWindow {
  /** True while the date part of the window accepts orders. */
  readonly open: boolean;
  readonly reason: BatchDateWindowReason;
  /** The batch's own end date boundary (end of day, +01:00). */
  readonly endDate: Date | null;
  /**
   * Last moment the dates accept orders: the end date, the later "Open until"
   * date, or null when the batch has no end (or is ongoing with no date).
   */
  readonly effectiveCloseDate: Date | null;
  /** The keep-open toggle is on for this batch. */
  readonly keepOpenAfterEndDate: boolean;
  /** Open now only because of the keep-open toggle (past its end date). */
  readonly ongoing: boolean;
}

/** A stored "Open until" value, or undefined when blank or not YYYY-MM-DD. */
export function normalizeBatchOngoingUntil(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!DATE_ONLY_PATTERN.test(trimmed)) return undefined;
  return parseBatchDateBoundary(trimmed, "end") ? trimmed : undefined;
}

export function getBatchDateWindow(
  input: BatchDateWindowInput | null | undefined,
  now: Date,
): BatchDateWindow {
  const endDate = parseBatchDateBoundary(input?.endDate || undefined, "end");
  const keepOpenAfterEndDate = input?.keepOpenAfterEndDate === true;
  if (!endDate) {
    return {
      open: true,
      reason: "no_end_date",
      endDate: null,
      effectiveCloseDate: null,
      keepOpenAfterEndDate,
      ongoing: false,
    };
  }
  const beforeEnd = now <= endDate;
  if (!keepOpenAfterEndDate) {
    return {
      open: beforeEnd,
      reason: beforeEnd ? "before_end_date" : "ended",
      endDate,
      effectiveCloseDate: endDate,
      keepOpenAfterEndDate,
      ongoing: false,
    };
  }
  const ongoingUntilValue = normalizeBatchOngoingUntil(input?.ongoingUntil);
  const ongoingUntil = ongoingUntilValue
    ? parseBatchDateBoundary(ongoingUntilValue, "end")
    : null;
  // "Open until" only extends the window; it never closes a batch early.
  const effectiveCloseDate = ongoingUntil
    ? ongoingUntil > endDate
      ? ongoingUntil
      : endDate
    : null;
  if (beforeEnd) {
    return {
      open: true,
      reason: "before_end_date",
      endDate,
      effectiveCloseDate,
      keepOpenAfterEndDate,
      ongoing: false,
    };
  }
  if (!effectiveCloseDate) {
    return {
      open: true,
      reason: "ongoing",
      endDate,
      effectiveCloseDate: null,
      keepOpenAfterEndDate,
      ongoing: true,
    };
  }
  const open = now <= effectiveCloseDate;
  return {
    open,
    reason: open ? "ongoing_until" : "ongoing_ended",
    endDate,
    effectiveCloseDate,
    keepOpenAfterEndDate,
    ongoing: open,
  };
}
