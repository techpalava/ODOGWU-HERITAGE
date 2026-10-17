import { BatchBusinessRules } from "../engine/BatchBusinessRules.js";
import { CapacityService } from "../services/CapacityService.js";
import type { Batch, OrderContext } from "../types.js";
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
 * A passed registration date closes ordering even when an administrator left
 * the batch status OPEN with auto-scheduling off. The customer-facing order
 * context does not carry that manual schedule, so cart and payment must use
 * the same deadline.
 */
export const isCommunityBatchClosedForOrders = (
  batch: Batch | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!batch) return true;
  if (!BatchBusinessRules.canAcceptOrders(batch, now).canAcceptOrders) return true;
  const projected: OrderContext = {
    orderType: "Community",
    batchId: batch.id,
    batchName: batch.name,
    closingDate: batch.endDate || "",
    expectedParticipants: CapacityService.getTargetCapacity(batch),
    currentMembers: CapacityService.getReservedCapacity(batch),
    allowOrders: batch.allowOrders,
    batchStatus: batch.status,
  };
  return !BatchBusinessRules.canAcceptOrders(projected, now).canAcceptOrders;
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
