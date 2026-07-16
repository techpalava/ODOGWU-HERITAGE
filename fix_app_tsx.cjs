const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const match = `
  const latestProductionBatch = productionBatch ? {
        batchId: productionBatch.id,
        batchName: productionBatch.name,
        batchStatus: productionBatch.status,
  } : null;
`;

const replacement = `
  const latestProductionBatch = productionBatch ? {
        orderType: "Community",
        batchId: productionBatch.id,
        batchName: productionBatch.name,
        closingDate: productionBatch.endDate,
        deliveryWindow: productionBatch.estimatedDelivery || "",
        expectedParticipants: CapacityService.getTargetCapacity(productionBatch),
        currentMembers: CapacityService.getReservedCapacity(productionBatch),
        allowOrders: productionBatch.allowOrders,
        batchStatus: productionBatch.status,
  } : null;
`;
code = code.replace(match, replacement);
fs.writeFileSync('src/App.tsx', code);
