const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

const regexDef = /const heroPrimaryAction =.*?;/;
const newDefs = `const heroPrimaryAction = canJoinActiveBatch ? \`Join \${activeCommunityBatch?.name || activeCommunityBatch?.batchName || ''}\`.trim() : "Create Custom Order";
  const firstHeroPrimaryAction = canJoinActiveBatch ? \`Join \${activeCommunityBatch?.name || activeCommunityBatch?.batchName || ''}\`.trim() : "Create Group";`;

content = content.replace(regexDef, newDefs);

// Replace the first occurrence of {heroPrimaryAction} with {firstHeroPrimaryAction}
// We can just find the one on line 173 which is around <ArrowRight
const regexFirst = /{heroPrimaryAction} <ArrowRight size=\{14\} \/>/;
content = content.replace(regexFirst, '{firstHeroPrimaryAction} <ArrowRight size={14} />');

fs.writeFileSync('src/components/HomeView.tsx', content);
