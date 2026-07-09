const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');
content = content.replace('const activeBatchEligibility = BatchBusinessRules.canAcceptOrders(activeCommunityBatch);\n  const canJoinActiveBatch = activeBatchEligibility.canAcceptOrders;', '');
fs.writeFileSync('src/components/HomeView.tsx', content);
