const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');
code = code.replace(/<\/section>\n            \n/g, '</section>\n            )}\n');
fs.writeFileSync('src/components/DashboardView.tsx', code);
