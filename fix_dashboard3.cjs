const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');
code = code.replace(
    'onClick={() => onNavigateToTab(journey.destination',
    'onClick={() => onNavigateToTab(journey.destination)}'
);
code = code.replace(
    '                </>\n              )}\n            </div>',
    '                </>\n            </div>'
);
fs.writeFileSync('src/components/DashboardView.tsx', code);
console.log('Fixed properly');
