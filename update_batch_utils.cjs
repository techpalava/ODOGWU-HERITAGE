const fs = require('fs');
let code = fs.readFileSync('src/utils/batchUtils.ts', 'utf8');

const newCode = `
export function getCurrentRegistrationBatch(batches: Batch[]): Batch | undefined {
  const processedBatches = processDynamicBatches(batches);
  const now = new Date();
  
  // Find a batch that is currently joinable
  const registrationStates = ["OPEN", "RECRUITING", "ALMOST_FULL"];
  const productionStates = [
    "PRODUCTION_STARTED", 
    "PRODUCTION_READY", 
    "QUALITY_CONTROL", 
    "PACKED", 
    "SHIPPED", 
    "ARRIVED_NETHERLANDS", 
    "READY_FOR_PICKUP", 
    "COMPLETED", 
    "CLOSED"
  ];
  
  return processedBatches.find(b => {
    const isWithinTimeline = now >= new Date(b.startDate) && now <= new Date(b.endDate);
    const hasCapacity = b.currentGarments < b.maxGarmentsPerBatch;
    const isAllowed = b.allowOrders !== false;
    
    // Explicitly reject production states
    if (productionStates.includes(b.status)) return false;
    
    return isWithinTimeline && registrationStates.includes(b.status) && isAllowed && hasCapacity;
  });
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
`;

code = code + newCode;
fs.writeFileSync('src/utils/batchUtils.ts', code);
