const fs = require('fs');
let content = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

content = content.replace('Sign In to Passport', 'Sign In');
content = content.replace('Secure Passport Office', 'Secure Portal');
content = content.replace('Log in or create a custom tailoring profile passport with full cloud', 'Log in or create a custom tailoring profile with full cloud');

fs.writeFileSync('src/components/LoginView.tsx', content);
