const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const match = /const openBatch = getCurrentCommunityBatch\(batches\);\n\s*const activeCommunityBatch: OrderContext \| null = openBatch[\s\S]*?: null;/m;

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
        pickupLocation: registrationBatch.pickupLocation || businessSettings.productionSettings.defaultPickupLocation || "Veldhoven Campus Lockers",
      }
    : null;
    
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
        pickupLocation: productionBatch.pickupLocation || businessSettings.productionSettings.defaultPickupLocation || "Veldhoven Campus Lockers",
  } : null;
`;

code = code.replace(match, replacement);

fs.writeFileSync('src/App.tsx', code);
