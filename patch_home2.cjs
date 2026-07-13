const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

content = content.replace(/activeCommunityBatch\?\.name/g, 'activeCommunityBatch?.batchName');

fs.writeFileSync('src/components/HomeView.tsx', content);
