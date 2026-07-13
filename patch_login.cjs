const fs = require('fs');
let content = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

content = content.replace('Client Passport Portal', 'Customer Login');
content = content.replace('Or Quick-Login as', 'Gmail Login');

fs.writeFileSync('src/components/LoginView.tsx', content);
