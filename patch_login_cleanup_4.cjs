const fs = require('fs');
let content = fs.readFileSync('src/components/LoginView.tsx', 'utf8');
content = content.replace(/const \[googleStep, setGoogleStep\] = useState<.*?;\n/, '');
fs.writeFileSync('src/components/LoginView.tsx', content);
