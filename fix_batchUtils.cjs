const fs = require('fs');

const content = `import { Batch } from "../types";

export function processDynamicBatches(batches: Batch[]): Batch[] {
  const now = new Date();
  
  // First, figure out if there's any manually overridden active batch
  const manualActiveBatch = batches.find(b => b.isAutoScheduled === false && b.isActive);
  let autoActiveAssigned = false;

  return batches.map(batch => {
    // If auto-scheduling is explicitly disabled for this batch, keep its status
    if (batch.isAutoScheduled === false) {
      return batch;
    }

    // Default: auto-scheduled is true if not set
    const startDate = new Date(batch.startDate);
    const endDate = new Date(batch.endDate);
    
    // Set hours to encompass the full day for end date
    endDate.setHours(23, 59, 59, 999);

    let newStatus = batch.status;

    if (now < startDate) {
      newStatus = "Coming Soon";
    } else if (now >= startDate && now <= endDate) {
      newStatus = "Open";
    } else if (now > endDate) {
      // If it's already a completed or shipped state, don't revert to just "Closed" unless it was open
      if (
        [
          "Completed", 
          "Collected", 
          "Ready For Pickup", 
          "Arrived Netherlands", 
          "Shipped", 
          "Packed", 
          "Quality Control", 
          "Production Started", 
          "Production Ready"
        ].includes(batch.status)
      ) {
        newStatus = batch.status;
      } else {
        newStatus = "Closed";
      }
    }

    let isNowActive = false;
    
    // We only set this auto-scheduled batch to active if it's open, 
    // AND there's no manual active batch, 
    // AND we haven't already assigned an active batch this run (to ensure only ONE is active).
    if (
      (newStatus === "Open" || newStatus === "Recruiting" || newStatus === "Almost Full") &&
      !manualActiveBatch &&
      !autoActiveAssigned
    ) {
      isNowActive = true;
      autoActiveAssigned = true;
    }

    return {
      ...batch,
      status: newStatus,
      isActive: isNowActive
    };
  });
}

export function getActiveBatch(batches: Batch[]): Batch | undefined {
  const processedBatches = processDynamicBatches(batches);
  return processedBatches.find(b => b.isActive);
}

export function getNextUpcomingBatch(batches: Batch[]): Batch | undefined {
  const processedBatches = processDynamicBatches(batches);
  // Get batches that are coming soon
  const upcoming = processedBatches.filter(b => b.status === "Coming Soon" || b.status === "Yet To Start");
  // Sort by start date ascending to get the earliest next one
  upcoming.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return upcoming[0];
}
`;

fs.writeFileSync('src/utils/batchUtils.ts', content);
