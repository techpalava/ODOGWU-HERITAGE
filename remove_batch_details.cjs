const fs = require('fs');
let lines = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8').split('\n');
lines.splice(1684, 34); // lines 1685 to 1718 (inclusive)
fs.writeFileSync('src/components/DesignStudioView.tsx', lines.join('\n'));
console.log('Removed batch details');
