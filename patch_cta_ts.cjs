const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

const regexDef = /const heroPrimaryAction =.*?;[\s\S]*?const firstHeroPrimaryAction =.*?;/;
const newDefs = `const heroPrimaryAction = canJoinActiveBatch ? \`Join \${(activeCommunityBatch as any)?.name || (activeCommunityBatch as any)?.batchName || ''}\`.trim() : "Create Custom Order";
  const firstHeroPrimaryAction = canJoinActiveBatch ? \`Join \${(activeCommunityBatch as any)?.name || (activeCommunityBatch as any)?.batchName || ''}\`.trim() : "Create Group";`;

content = content.replace(regexDef, newDefs);

fs.writeFileSync('src/components/HomeView.tsx', content);
