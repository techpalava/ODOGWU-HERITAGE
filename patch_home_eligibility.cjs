const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

const marker = `  return (
    <div id="home-view-container" className="space-y-16">`;
const replacement = `  const activeBatchEligibility = BatchBusinessRules.canAcceptOrders(activeCommunityBatch);
  const canJoinActiveBatch = activeBatchEligibility.canAcceptOrders;

  return (
    <div id="home-view-container" className="space-y-16">`;

content = content.replace(marker, replacement);
fs.writeFileSync('src/components/HomeView.tsx', content);
