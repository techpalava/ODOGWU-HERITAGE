const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

code = code.replace(/  onNavigateToTab: \(tabId: string\) => void;\n/g, '');
code = code.replace(/  onNavigateToTab,\n/g, '');

fs.writeFileSync('src/components/DesignStudioView.tsx', code);
console.log('Fixed onNavigateToTab');
