const fs = require('fs');
let code = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

// Add XCircle to lucide-react imports if not there
if (!code.includes('XCircle,')) {
    code = code.replace(/CheckCircle2,/g, 'CheckCircle2,\n  XCircle,');
}

// Replace handleLogin with handleSignIn
code = code.replace(/onSubmit={handleLogin}/g, 'onSubmit={handleSignIn}');

// Replace loginEmail with loginIdentifier
code = code.replace(/value={loginEmail}/g, 'value={loginIdentifier}');
code = code.replace(/setLoginEmail\(e.target.value\)/g, 'setLoginIdentifier(e.target.value)');

// Remove the SUBMODE B block
const submodeBRegex = /\{\/\* SUBMODE B: GMAIL\/GOOGLE SIGN UP INTERFACE \*\/\}\s*\{regMethod === "gmail" && \([\s\S]*?<\/div>\s*\)\}/g;
code = code.replace(submodeBRegex, '');

fs.writeFileSync('src/components/LoginView.tsx', code);
console.log('Fixed');
