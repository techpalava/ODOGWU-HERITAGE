const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

const calcStr = `
  const canJoinActiveBatch = activeCommunityBatch ? BatchBusinessRules.canAcceptOrders(activeCommunityBatch as any).canAcceptOrders : false;
  const heroPrimaryAction = canJoinActiveBatch ? \`Join \${activeCommunityBatch?.name}\` : "Create Custom Order";
  const heroDestination = canJoinActiveBatch ? "design" : "custom-order";
`;

content = content.replace(/const \[\, setNow\] = useState\(new Date\(\)\);/, calcStr + '\n  const [, setNow] = useState(new Date());');

content = content.replace(/onClick=\{\(\) => onNavigateToTab\(journey\.destination as any\)\}/g, 'onClick={() => onNavigateToTab(heroDestination as any)}');
content = content.replace(/\{journey\.primaryAction\}/g, '{heroPrimaryAction}');

fs.writeFileSync('src/components/HomeView.tsx', content);
