const fs = require('fs');
let content = fs.readFileSync('src/components/Footer.tsx', 'utf8');

const target = `  const quickLinks = [
    { label: "Home", tab: "home" },
    { label: "Design Studio", tab: "design" },
    { label: "Gallery", tab: "gallery" },
    { label: "How It Works", tab: "home" }, // Assuming it scrolls or goes to home
    { label: "Join Current Batch", tab: "home" }, // Depending on implementation
    { label: "Contact", tab: "home" }, // Depending on implementation
  ];`;

const replacement = `  const openBatch = getCurrentCommunityBatch(batches);
  const activeCommunityBatch = openBatch
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
        pickupLocation:
          openBatch.pickupLocation || businessSettings?.productionSettings?.defaultPickupLocation || "Veldhoven Campus Lockers",
      } as any
    : null;

  const activeBatchEligibility = BatchBusinessRules.canAcceptOrders(activeCommunityBatch);
  const canJoinActiveBatch = activeBatchEligibility.canAcceptOrders;

  const quickLinks = [
    { label: "Home", tab: "home" },
    { label: "Design Studio", tab: "design" },
    { label: "Gallery", tab: "gallery" },
    { label: "How It Works", tab: "home" }, // Assuming it scrolls or goes to home
    { label: activeCommunityBatch && canJoinActiveBatch ? "Join Current Batch" : "Create Custom Order", tab: activeCommunityBatch && canJoinActiveBatch ? "home" : "custom-order" },
    { label: "Contact", tab: "home" }, // Depending on implementation
  ];`;

content = content.replace(target, replacement);
fs.writeFileSync('src/components/Footer.tsx', content);
