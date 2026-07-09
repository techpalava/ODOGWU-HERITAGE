const fs = require('fs');
let content = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');
content = content.replace('{/* Right Column */}', '</div>\n        {/* Right Column */}');
fs.writeFileSync('src/components/DashboardView.tsx', content);
