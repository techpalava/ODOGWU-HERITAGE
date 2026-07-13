const fs = require('fs');
let content = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

content = content.replace(/setShowGoogleDialog\(true\);/g, 'handleGoogleSignIn();');
content = content.replace(/setGoogleStep\("select"\);/g, '');

fs.writeFileSync('src/components/LoginView.tsx', content);
