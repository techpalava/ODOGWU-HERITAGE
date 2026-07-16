const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  'import { getCurrentCommunityBatch } from "./utils/batchUtils";', 
  'import { getCurrentCommunityBatch, getCurrentRegistrationBatch, getCurrentProductionBatch } from "./utils/batchUtils";'
);

const match = `
  const openBatch = getCurrentCommunityBatch(batches);
  const activeCommunityBatch: OrderContext | null = openBatch
    ? {
        orderType: "Community",
        batchId: openBatch.id,
        batchName: openBatch.name,
        closingDate: openBatch.endDate,
        deliveryWindow: openBatch.estimatedDelivery || "",
        expectedParticipants: CapacityService.getTargetCapacity(openBatch),
        currentMembers: CapacityService.getReservedCapacity(openBatch),
        allowOrders: openBatch.allowOrders,
        batchStatus: openBatch.status,
      }
    : null;
`;

const replacement = `
  const openBatch = getCurrentCommunityBatch(batches);
  const registrationBatch = getCurrentRegistrationBatch(batches);
  const productionBatch = getCurrentProductionBatch(batches);
  
  const activeCommunityBatch: OrderContext | null = registrationBatch
    ? {
        orderType: "Community",
        batchId: registrationBatch.id,
        batchName: registrationBatch.name,
        closingDate: registrationBatch.endDate,
        deliveryWindow: registrationBatch.estimatedDelivery || "",
        expectedParticipants: CapacityService.getTargetCapacity(registrationBatch),
        currentMembers: CapacityService.getReservedCapacity(registrationBatch),
        allowOrders: registrationBatch.allowOrders,
        batchStatus: registrationBatch.status,
      }
    : null;
    
  const latestProductionBatch = productionBatch ? {
        batchId: productionBatch.id,
        batchName: productionBatch.name,
        batchStatus: productionBatch.status,
  } : null;
`;
code = code.replace(match, replacement);

const match2 = `                activeCommunityBatch={activeCommunityBatch}`;
const replacement2 = `                activeCommunityBatch={activeCommunityBatch}\n                latestProductionBatch={latestProductionBatch}`;
code = code.replace(match2, replacement2);

fs.writeFileSync('src/App.tsx', code);
