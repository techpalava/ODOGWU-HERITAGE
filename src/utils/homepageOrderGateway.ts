import type { Batch, OrderContext } from "../types";
import { CapacityService } from "../services/CapacityService";
import { getCurrentRegistrationBatch } from "./batchUtils";
import { BATCH_MINIMUM_GARMENTS } from "./shippingPricing";

export interface HomepageOrderGatewayState {
  joinBatch: Batch | null;
  minimumGarments: number;
}

export interface HomepageCommunityBatchEntry {
  batch: Batch;
  orderContext: OrderContext;
}

export function getHomepageJoinBatchLabel(
  batchName: string | null | undefined,
  isLoading = false,
): string {
  const hasBatchName =
    typeof batchName === "string" && batchName.trim().length > 0;

  return !isLoading && hasBatchName
    ? `Join the ${batchName}`
    : "Join Current Batch";
}

export function getHomepageOrderGatewayState(
  batches: Batch[],
  now: Date = new Date(),
): HomepageOrderGatewayState {
  return {
    joinBatch: getCurrentRegistrationBatch(batches, now) || null,
    minimumGarments: BATCH_MINIMUM_GARMENTS,
  };
}

/**
 * Revalidates the batch rendered on the homepage without silently replacing it
 * with a different batch if the administrator changes the current batch before
 * the customer clicks. The resulting context is the snapshot consumed by the
 * Studio and later order flow.
 */
export function resolveHomepageCommunityBatchEntry(
  batches: Batch[],
  selectedBatchId: string | null | undefined,
  defaultPickupLocation: string,
  now: Date = new Date(),
): HomepageCommunityBatchEntry | null {
  if (!selectedBatchId) return null;

  const batch = getCurrentRegistrationBatch(batches, now);
  if (!batch || batch.id !== selectedBatchId) return null;

  return {
    batch,
    orderContext: {
      orderType: "Community",
      batchId: batch.id,
      batchName: batch.name,
      closingDate: batch.endDate,
      deliveryWindow: batch.estimatedDelivery || "",
      expectedParticipants: CapacityService.getTargetCapacity(batch),
      currentMembers: CapacityService.getReservedCapacity(batch),
      allowOrders: batch.allowOrders,
      batchStatus: batch.status,
      pickupLocation: batch.pickupLocation || defaultPickupLocation,
    },
  };
}
