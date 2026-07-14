const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

code = code.replace(
    /\{journey\.currentOrder && \(/,
    '{journey.requiresAttention && ('
);

fs.writeFileSync('src/components/DashboardView.tsx', code);
console.log('Patched dashboard');
