const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

code = code.replace(
    /\{journey\.requiresAttention && \(/,
    '{true && ('
);

fs.writeFileSync('src/components/DashboardView.tsx', code);
console.log('Restored Dashboard');
