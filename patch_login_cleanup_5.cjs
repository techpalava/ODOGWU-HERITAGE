const fs = require('fs');
let content = fs.readFileSync('src/components/LoginView.tsx', 'utf8');
content = content.replace(/  >\("select"\);\n/g, '');
fs.writeFileSync('src/components/LoginView.tsx', content);
