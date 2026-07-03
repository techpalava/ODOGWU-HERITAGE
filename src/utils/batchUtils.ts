import { Batch } from "../types";
import { BatchBusinessRules } from "../engine/BatchBusinessRules";

export function processDynamicBatches(batches: Batch[]): Batch[] {

  
  // First, figure out if there's any manually overridden active batch
  const manualActiveBatch = batches.find(b => b.isAutoScheduled === false && b.isActive);
  let autoActiveAssigned = false;

  return batches.map(batch => {
    // If auto-scheduling is explicitly disabled for this batch, keep its status
    if (batch.isAutoScheduled === false) {
      return batch;
    }

    // Default: auto-scheduled is true if not set



    let newStatus = batch.status;
    const eligibility = BatchBusinessRules.canAcceptOrders(batch);
    
    // Do not override advanced downstream production states
    const productionStates = [
      "COMPLETED", 
      "COLLECTED", 
      "READY_FOR_PICKUP", 
      "ARRIVED_NETHERLANDS", 
      "SHIPPED", 
      "PACKED", 
      "QUALITY_CONTROL", 
      "PRODUCTION_STARTED", 
      "PRODUCTION_READY"
    ];
    
    if (!productionStates.includes(batch.status)) {
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
      ...batch,
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
