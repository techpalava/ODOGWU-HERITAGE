const fs = require('fs');
let lines = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8').split('\n');
lines.splice(4446, 21); // Removes from 4447 to 4467
fs.writeFileSync('src/components/DesignStudioView.tsx', lines.join('\n'));
console.log('Removed journey banner');
