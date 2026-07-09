const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace('<HomeView\n                }\n                onNavigateToTab={(', '<HomeView\n                onNavigateToTab={(');

fs.writeFileSync('src/App.tsx', content);
