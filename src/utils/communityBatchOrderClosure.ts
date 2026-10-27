import { normalizeBatchOngoingUntil } from "./batchDateRange.js";
import { getBatchOrderWindow } from "./batchOrderWindow.js";
import type { Batch } from "../types.js";
import type { CanonicalOrderIdentity } from "./orderContextIdentity.js";

export const COMMUNITY_BATCH_CLOSED_CODE = "COMMUNITY_BATCH_CLOSED" as const;
export const COMMUNITY_BATCH_CLOSED_MESSAGE = "This batch is closed" as const;
/** Shown inline when Review Order is clicked on a closed community batch. */
export const COMMUNITY_BATCH_CLOSED_REVIEW_MESSAGE =
  `${COMMUNITY_BATCH_CLOSED_MESSAGE}. It no longer accepts new orders, so this order can't be reviewed or paid.` as const;

export type CommunityBatchOrderClosure =
  | { readonly closed: false }
  | {
      readonly closed: true;
      readonly code: typeof COMMUNITY_BATCH_CLOSED_CODE;
      readonly message: typeof COMMUNITY_BATCH_CLOSED_MESSAGE;
    };

const closedResult = (): CommunityBatchOrderClosure => ({
  closed: true,
  code: COMMUNITY_BATCH_CLOSED_CODE,
  message: COMMUNITY_BATCH_CLOSED_MESSAGE,
});

const numberOrZero = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/**
 * A passed end date closes ordering even when an administrator left the batch
 * status OPEN with auto-scheduling off (#785), unless the batch's
 * "Keep open after end date (ongoing)" toggle is on. One rule for Studio,
 * cart, payment, homepage and server: getBatchOrderWindow.
 */
export const isCommunityBatchClosedForOrders = (
  batch: Batch | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!batch) return true;
  return !getBatchOrderWindow(batch, now).open;
};

export const communityBatchClosureForIdentity = (
  identity: CanonicalOrderIdentity | null | undefined,
  batches: readonly Batch[],
  now: Date = new Date(),
): CommunityBatchOrderClosure => {
  if (!identity || identity.orderType !== "Community") return { closed: false };
  const batch = batches.find((entry) => entry.id === identity.batchId) ?? null;
  return isCommunityBatchClosedForOrders(batch, now)
    ? closedResult()
    : { closed: false };
};

/**
 * Customer-facing closure state for a Community order.
 *
 * "loading" means the batch list has not arrived from Firestore yet, so the
 * batch is unknown: show no closed message, but keep Review and PAY waiting.
 * Once the list has loaded it is the complete batches collection, so a batch
 * that is missing from it is treated as closed (it cannot accept orders).
 */
export type CommunityBatchClosureStatus =
  | "not_applicable"
  | "loading"
  | "open"
  | "closed";

/** Quiet note shown while the batch list is still loading. */
export const COMMUNITY_BATCH_CHECKING_MESSAGE =
  "Checking that this batch is still open\u2026" as const;

export const resolveCommunityBatchClosureStatus = (
  identity: CanonicalOrderIdentity | null | undefined,
  batches: readonly Batch[] | null | undefined,
  batchesLoaded: boolean,
  now: Date = new Date(),
): CommunityBatchClosureStatus => {
  if (!identity || identity.orderType !== "Community") return "not_applicable";
  if (!batchesLoaded) return "loading";
  return communityBatchClosureForIdentity(identity, batches || [], now).closed
    ? "closed"
    : "open";
};

/** Reads the batch fields the closure rule needs from a Firestore document. */
export const communityBatchFromRecord = (
  batchId: string,
  raw: unknown,
): Batch | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id : batchId;
  if (!id.trim()) return null;
  const status = typeof record.status === "string" ? record.status : "CLOSED";
  return {
    id,
    batchNumber: numberOrZero(record.batchNumber),
    name: typeof record.name === "string" ? record.name : "",
    startDate: typeof record.startDate === "string" ? record.startDate : "",
    endDate: typeof record.endDate === "string" ? record.endDate : "",
    duration: typeof record.duration === "string" ? record.duration : "",
    targetGarments: numberOrZero(record.targetGarments),
    currentGarments: numberOrZero(record.currentGarments),
    currentOrders: numberOrZero(record.currentOrders),
    currentCustomers: numberOrZero(record.currentCustomers),
    status: status as Batch["status"],
    allowOrders: record.allowOrders !== false,
    isAutoScheduled: record.isAutoScheduled === false ? false : record.isAutoScheduled === true ? true : undefined,
    // Same keep-open fields the client reads, so the server agrees.
    ...(record.keepOpenAfterEndDate === true
      ? {
          keepOpenAfterEndDate: true,
          ...(normalizeBatchOngoingUntil(record.ongoingUntil)
            ? { ongoingUntil: normalizeBatchOngoingUntil(record.ongoingUntil) }
            : {}),
        }
      : {}),
    isActive: record.isActive === true,
    visibility: record.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
  };
};

export const requestFutureOrderCartAdmission = async (
  orderIdentity: CanonicalOrderIdentity | null,
  fetchImpl: typeof fetch = fetch,
): Promise<{ readonly accepted: boolean; readonly message: string }> => {
  try {
    const response = await fetchImpl("/api/future-order-v2/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-to-cart", orderIdentity }),
    });
    if (response.ok) return { accepted: true, message: "" };
    const payload = (await response.json().catch(() => null)) as
      | { error?: unknown }
      | null;
    const message =
      payload && typeof payload.error === "string" && payload.error.trim()
        ? payload.error
        : COMMUNITY_BATCH_CLOSED_MESSAGE;
    return { accepted: false, message };
  } catch {
    return { accepted: false, message: COMMUNITY_BATCH_CLOSED_MESSAGE };
  }
};
