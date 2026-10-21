import type { Batch, OrderContext } from "../types";
import { CapacityService } from "../services/CapacityService";
import { getCurrentRegistrationBatch } from "./batchUtils";
import { BATCH_MINIMUM_GARMENTS } from "./shippingPricing";
import { isCommunityBatchClosedForOrders } from "./communityBatchOrderClosure";

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

export const formatHomepageBatchDeadline = (
  value: string | null | undefined,
  month: "long" | "short" = "long",
): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const date = dateOnly
    ? new Date(
        Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])),
      )
    : new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month,
    year: "numeric",
    timeZone: dateOnly ? "UTC" : undefined,
  }).format(date);
};

export interface HomepageJoinBatchDescription {
  closed: boolean;
  text: string;
}

/**
 * Copy for the "Join an Existing Batch" homepage card. It uses the same
 * closure rule as Design Studio, cart and payment
 * (isCommunityBatchClosedForOrders), so a batch whose ordering deadline has
 * passed is described as closed even if its admin status still says OPEN.
 */
export function getHomepageJoinBatchDescription(
  batch: Batch | null | undefined,
  now: Date = new Date(),
): HomepageJoinBatchDescription {
  const name = batch?.name?.trim();
  if (!batch || isCommunityBatchClosedForOrders(batch, now)) {
    return {
      closed: true,
      text: `${
        name ? `The ${name} batch` : "This community batch"
      } is closed and is no longer accepting new orders. You can still start an individual order or create a private batch.`,
    };
  }
  return { closed: false, text: getHomepageOpenJoinBatchText(batch.endDate) };
}

/** Open-batch copy for the Join card, shared by the live and cached card. */
export function getHomepageOpenJoinBatchText(
  endDate: string | null | undefined,
): string {
  const deadline = formatHomepageBatchDeadline(endDate);
  return deadline
    ? `Join the currently open community batch before ordering closes on ${deadline}.`
    : "Join the currently open community batch before its ordering deadline.";
}

/**
 * Short deadline for the Join card pill ("16 Nov 2026"), or null when the
 * batch is closed for orders or has no readable endDate. Same closure rule as
 * getHomepageJoinBatchDescription.
 */
export function getHomepageJoinBatchDeadlinePill(
  batch: Batch | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!batch || isCommunityBatchClosedForOrders(batch, now)) return null;
  return formatHomepageBatchDeadline(batch.endDate, "short");
}

/**
 * Hero order button text. While batches load it reads "Start Your Order" and
 * leads to the order cards (which already work) instead of a disabled
 * loading label; afterwards the Join label or "Explore Options" as before.
 */
export function getHomepageHeroPrimaryActionLabel({
  isLoading,
  joinLabel,
}: {
  isLoading: boolean;
  joinLabel: string | null;
}): string {
  if (isLoading) return "Start Your Order";
  return joinLabel ?? "Explore Options";
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
