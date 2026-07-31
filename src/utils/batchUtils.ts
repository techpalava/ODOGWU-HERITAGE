import { Batch } from "../types";
import { BatchBusinessRules } from "../engine/BatchBusinessRules";
import {
  normalizeBatchStatus,
  PRODUCTION_OR_CLOSED_STATUSES,
  REGISTRATION_OPEN_STATUSES,
} from "./batchStatus";
import { BATCH_MINIMUM_GARMENTS } from "./shippingPricing";

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

export function getNextUpcomingBatch(batches: Batch[]): Batch | undefined {
  const processedBatches = processDynamicBatches(batches);
  // Get batches that are coming soon
  const upcoming = processedBatches.filter(b => b.status === "COMING_SOON" || b.status === "YET_TO_START");
  // Sort by start date ascending to get the earliest next one
  upcoming.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return upcoming[0];
}

export function getNextUpcomingBatches(batches: Batch[], count: number = 3): Batch[] {
  const processedBatches = processDynamicBatches(batches);
  // Get batches that are coming soon
  const upcoming = processedBatches.filter(b => b.status === "COMING_SOON" || b.status === "YET_TO_START");
  // Sort by start date ascending to get the earliest ones
  upcoming.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return upcoming.slice(0, count);
}

export function getCurrentRegistrationBatch(
  batches: Batch[],
  now: Date = new Date(),
): Batch | undefined {
  const processedBatches = processDynamicBatches(batches, now);

  const joinableBatches = processedBatches.filter((batch) => {
    const status = normalizeBatchStatus(batch.status);
    const eligibility = BatchBusinessRules.canAcceptOrders(batch, now);
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

  return joinableBatches.sort((a, b) => {
    const priority = (batch: Batch) => {
      if (batch.isAutoScheduled === false && batch.isActive) return 0;
      if (batch.isActive) return 1;
      return 2;
    };
    return priority(a) - priority(b);
  })[0];
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
