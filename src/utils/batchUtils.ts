import { Batch } from "../types";
import { BatchBusinessRules } from "../engine/BatchBusinessRules";
import {
  normalizeBatchStatus,
  PRODUCTION_OR_CLOSED_STATUSES,
  REGISTRATION_OPEN_STATUSES,
} from "./batchStatus";
import { BATCH_MINIMUM_GARMENTS } from "./shippingPricing";
import { getBatchDateWindow } from "./batchDateRange";

export function processDynamicBatches(
  batches: Batch[],
  now: Date = new Date(),
): Batch[] {
  // ARCHITECTURAL COMPLIANCE:
  // Apply explicit deterministic ordering before lifecycle evaluation
  // Prefer displayOrder if present, fallback to batchNumber
  const sortedBatches = [...batches].sort((a, b) => {
    const orderA = a.displayOrder !== undefined ? a.displayOrder : a.batchNumber;
    const orderB = b.displayOrder !== undefined ? b.displayOrder : b.batchNumber;
    return orderA - orderB;
  });


  
  // First, figure out if there's any manually overridden active batch
  const manualActiveBatch = sortedBatches.find(b => b.isAutoScheduled === false && b.isActive);
  let autoActiveAssigned = false;

  return sortedBatches.map(batch => {
    const normalizedStatus = normalizeBatchStatus(batch.status);
    const normalizedBatch = {
      ...batch,
      status: normalizedStatus as Batch["status"],
    };

    // If auto-scheduling is explicitly disabled for this batch, keep its status
    if (batch.isAutoScheduled === false) {
      return normalizedBatch;
    }

    // Default: auto-scheduled is true if not set



    let newStatus = normalizedBatch.status;
    const eligibility = BatchBusinessRules.canAcceptOrders(
      normalizedBatch,
      now,
    );
    
    // Do not override advanced downstream production states
    const productionStates = new Set<Batch["status"]>(
      PRODUCTION_OR_CLOSED_STATUSES.filter(
        (status) => status !== "FULL" && status !== "CLOSED",
      ),
    );
    
    if (!productionStates.has(normalizedBatch.status)) {
        if (eligibility.canAcceptOrders) {
            newStatus = "OPEN";
        } else {
            if (eligibility.statusCode === "NOT_YET_OPEN") {
                newStatus = "COMING_SOON";
            } else if (eligibility.statusCode === "BATCH_FULL" || eligibility.statusCode === "ORDERS_DISABLED") {
                newStatus = "FULL";
            } else if (eligibility.statusCode === "EXPIRED" || eligibility.statusCode === "REGISTRATION_CLOSED") {
                newStatus = "CLOSED";
            } else {
                newStatus = eligibility.statusCode as Batch["status"];
            }
        }
    }

    let isNowActive = false;
    
    // We only set this auto-scheduled batch to active if it's in a live state, 
    // AND there's no manual active batch, 
    // AND we haven't already assigned an active batch this run (to ensure only ONE is active).
    if (
      (newStatus === "OPEN" || newStatus === "RECRUITING" || newStatus === "ALMOST_FULL" || newStatus === "FULL" || 
       newStatus === "PRODUCTION_READY" || newStatus === "PRODUCTION_STARTED" || 
       newStatus === "QUALITY_CONTROL" || newStatus === "PACKED" || newStatus === "SHIPPED" || 
       newStatus === "ARRIVED_NETHERLANDS" || newStatus === "READY_FOR_PICKUP") &&
      !manualActiveBatch &&
      !autoActiveAssigned
    ) {
      isNowActive = true;
      autoActiveAssigned = true;
    }

    return {
      ...normalizedBatch,
      status: newStatus as Batch["status"],
      isActive: isNowActive
    };
  });
}

export function getCurrentCommunityBatch(batches: Batch[]): Batch | undefined {
  const processedBatches = processDynamicBatches(batches);
  return processedBatches.find(b => b.isActive);
}

/**
 * Upcoming (not yet open) batches whose ordering window has not already
 * passed, earliest start first. A YET_TO_START batch whose end date (or
 * keep-open "Open until" date) is behind us is stale and never offered.
 */
function getUpcomingBatchesWithLiveWindow(
  batches: Batch[],
  now: Date,
): Batch[] {
  const processedBatches = processDynamicBatches(batches, now);
  const upcoming = processedBatches.filter(
    (b) =>
      (b.status === "COMING_SOON" || b.status === "YET_TO_START") &&
      getBatchDateWindow(b, now).open,
  );
  upcoming.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return upcoming;
}

export function getNextUpcomingBatch(
  batches: Batch[],
  now: Date = new Date(),
): Batch | undefined {
  return getUpcomingBatchesWithLiveWindow(batches, now)[0];
}

export function getNextUpcomingBatches(
  batches: Batch[],
  count: number = 3,
  now: Date = new Date(),
): Batch[] {
  return getUpcomingBatchesWithLiveWindow(batches, now).slice(0, count);
}

type RegistrationBatchFilter = "joinable" | "ignore_end_date";

function rankRegistrationBatches(
  batches: Batch[],
  now: Date,
  filter: RegistrationBatchFilter,
): Batch[] {
  const processedBatches = processDynamicBatches(batches, now);

  const candidates = processedBatches.filter((batch) => {
    const status = normalizeBatchStatus(batch.status);
    const eligibility = BatchBusinessRules.canAcceptOrders(
      filter === "ignore_end_date"
        ? { ...batch, keepOpenAfterEndDate: true, ongoingUntil: undefined }
        : batch,
      now,
    );
    const isEnabledManualOverride =
      batch.isAutoScheduled !== false || batch.isActive === true;

    return (
      batch.visibility !== "PRIVATE" &&
      isEnabledManualOverride &&
      batch.targetGarments >= BATCH_MINIMUM_GARMENTS &&
      REGISTRATION_OPEN_STATUSES.includes(status as Batch["status"]) &&
      eligibility.canAcceptOrders
    );
  });

  return candidates.sort((a, b) => {
    const priority = (batch: Batch) => {
      if (batch.isAutoScheduled === false && batch.isActive) return 0;
      if (batch.isActive) return 1;
      return 2;
    };
    return priority(a) - priority(b);
  });
}

/**
 * Public community batches a customer can join right now, best first: the
 * manual active batch, then the active batch, then any other open batch.
 * Joinability is BatchBusinessRules.canAcceptOrders (via getBatchOrderWindow
 * elsewhere), so a batch the Studio calls closed is never offered here.
 */
export function getJoinableRegistrationBatches(
  batches: Batch[],
  now: Date = new Date(),
): Batch[] {
  return rankRegistrationBatches(batches, now, "joinable");
}

/**
 * The homepage's current community batch when only its end date (or its
 * keep-open "Open until" date) has closed it: the batch that would be the
 * current registration batch if the date had not passed. The homepage keeps
 * a closed Join card for it. Undefined when the top batch is open, or when
 * anything other than the date closes it (status, allowOrders, capacity).
 */
export function getHomepageClosedCurrentBatch(
  batches: Batch[],
  now: Date = new Date(),
): Batch | undefined {
  const current = rankRegistrationBatches(batches, now, "ignore_end_date")[0];
  if (!current) return undefined;
  return BatchBusinessRules.canAcceptOrders(current, now).canAcceptOrders
    ? undefined
    : current;
}

export function getCurrentRegistrationBatch(
  batches: Batch[],
  now: Date = new Date(),
): Batch | undefined {
  return getJoinableRegistrationBatches(batches, now)[0];
}

/**
 * The batch behind a closed community order's "Join next open batch" button:
 * the current registration batch (the only one the homepage Join flow
 * accepts), unless it is the closed batch itself. Never auto-applied.
 */
export function getNextOpenCommunityBatch(
  batches: Batch[],
  closedBatchId: string | null | undefined,
  now: Date = new Date(),
): Batch | undefined {
  const next = getCurrentRegistrationBatch(batches, now);
  return next && next.id !== closedBatchId ? next : undefined;
}

export function getCurrentProductionBatch(batches: Batch[]): Batch | undefined {
  const processedBatches = processDynamicBatches(batches);
  const productionStates = [
    "FULL",
    "CLOSED",
    "PRODUCTION_READY",
    "PRODUCTION_STARTED",
    "QUALITY_CONTROL",
    "PACKED",
    "SHIPPED",
    "ARRIVED_NETHERLANDS",
    "READY_FOR_PICKUP"
  ];
  
  const prodBatches = processedBatches.filter(b => productionStates.includes(b.status));
  // Sort by endDate descending to get the most recent production batch
  prodBatches.sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
  
  return prodBatches[0];
}
