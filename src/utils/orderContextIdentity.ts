import type { Batch, GuestDesignDraft, OrderContext } from "../types";
import { CapacityService } from "../services/CapacityService";

export type CanonicalOrderIdentity =
  | Readonly<{ orderType: "Individual" }>
  | Readonly<{ orderType: "Community"; batchId: string }>;

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const getCanonicalOrderIdentity = (
  context: unknown,
): CanonicalOrderIdentity | null => {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return null;
  }
  const record = context as Pick<OrderContext, "orderType" | "batchId">;
  if (record.orderType === "Individual") {
    return { orderType: "Individual" };
  }
  if (record.orderType === "Community" && hasText(record.batchId)) {
    return { orderType: "Community", batchId: record.batchId };
  }
  return null;
};

export const getPersistedDraftOrderIdentity = (
  draft: Pick<GuestDesignDraft, "batchType" | "batchId"> | null | undefined,
): CanonicalOrderIdentity | null => {
  if (!draft) return null;
  if (draft.batchType === "alone") {
    return { orderType: "Individual" };
  }
  if (draft.batchType === "community" && hasText(draft.batchId)) {
    return { orderType: "Community", batchId: draft.batchId };
  }
  return null;
};

export const canonicalOrderIdentitiesMatch = (
  left: CanonicalOrderIdentity | null,
  right: CanonicalOrderIdentity | null,
): boolean =>
  Boolean(
    left &&
      right &&
      left.orderType === right.orderType &&
      (left.orderType !== "Community" ||
        (right.orderType === "Community" && left.batchId === right.batchId)),
  );

/**
 * Rebuilds a saved order context from its canonical identity. Community drafts
 * resolve live batch details by their retained ID only; they never fall back to
 * whichever batch is currently accepting homepage registrations.
 */
export const resolvePersistedDraftOrderContext = (
  draft: Pick<GuestDesignDraft, "batchType" | "batchId" | "batchName"> | null | undefined,
  batches: readonly Batch[],
  defaultPickupLocation: string,
): OrderContext | null => {
  const identity = getPersistedDraftOrderIdentity(draft);
  if (!identity) return null;
  if (identity.orderType === "Individual") {
    return { orderType: "Individual" };
  }

  const liveBatch = batches.find((batch) => batch.id === identity.batchId);
  if (!liveBatch) {
    return {
      orderType: "Community",
      batchId: identity.batchId,
      ...(hasText(draft?.batchName) ? { batchName: draft.batchName } : {}),
    };
  }

  return {
    orderType: "Community",
    batchId: identity.batchId,
    batchName: liveBatch.name,
    closingDate: liveBatch.endDate,
    deliveryWindow: liveBatch.estimatedDelivery || "",
    expectedParticipants: CapacityService.getTargetCapacity(liveBatch),
    currentMembers: CapacityService.getReservedCapacity(liveBatch),
    allowOrders: liveBatch.allowOrders,
    batchStatus: liveBatch.status,
    pickupLocation: liveBatch.pickupLocation || defaultPickupLocation,
  };
};

/**
 * The Studio uses this before hydrating any persisted selections. It keeps the
 * context-less reload path on the saved identity and gives malformed canonical
 * drafts no route through the current registration batch.
 */
export const resolvePersistedDraftHydrationContext = (
  draft: Pick<GuestDesignDraft, "batchType" | "batchId" | "batchName">,
  batches: readonly Batch[],
  defaultPickupLocation: string,
):
  | Readonly<{ status: "valid"; identity: CanonicalOrderIdentity; context: OrderContext }>
  | Readonly<{ status: "invalid"; reason: "persisted_order_identity_invalid" }> => {
  const identity = getPersistedDraftOrderIdentity(draft);
  if (!identity) {
    return { status: "invalid", reason: "persisted_order_identity_invalid" };
  }
  const context = resolvePersistedDraftOrderContext(
    draft,
    batches,
    defaultPickupLocation,
  );
  if (!context) {
    return { status: "invalid", reason: "persisted_order_identity_invalid" };
  }
  return { status: "valid", identity, context };
};
