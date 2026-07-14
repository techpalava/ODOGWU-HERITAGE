const fs = require('fs');
let lines = fs.readFileSync('src/components/DashboardView.tsx', 'utf8').split('\n');
lines[118] = '            )}';
fs.writeFileSync('src/components/DashboardView.tsx', lines.join('\n'));
