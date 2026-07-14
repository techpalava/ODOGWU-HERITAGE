const fs = require('fs');
let code = fs.readFileSync('src/components/LoginView.tsx', 'utf8');
code = code.replace(/HelpCircle,\s*/g, '');
code = code.replace(/AlertCircle,\s*/g, '');
code = code.replace(/Globe,\s*/g, '');
fs.writeFileSync('src/components/LoginView.tsx', code);
console.log('Fixed imports');
