const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');
content = content.replace('  onStartDesigning: () => void;\n', '');
content = content.replace('  onStartDesigning,\n', '');
fs.writeFileSync('src/components/HomeView.tsx', content);

let appContent = fs.readFileSync('src/App.tsx', 'utf8');
appContent = appContent.replace('onStartDesigning={() => {\n                  handleSelectOrderContext({\n                    orderType: "Community",\n                    batchId: activeCommunityBatch?.id,\n                    batchName: activeCommunityBatch?.name,\n                  });\n                }}\n', '');
appContent = appContent.replace(/onStartDesigning=\{[\s\S]*?\}/, '');
fs.writeFileSync('src/App.tsx', appContent);
