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
