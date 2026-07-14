const fs = require('fs');
let code = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

if (!code.includes('import { AuthorizationEngine }')) {
    code = code.replace(
        'import { Customer } from "../types";',
        'import { Customer } from "../types";\nimport { AuthorizationEngine } from "../engine/AuthorizationEngine";'
    );
}

code = code.replace(
  /role: "New Cohort Member"/,
  'role: AuthorizationEngine.resolveRole({ email: regEmail.trim() } as any)'
);

code = code.replace(
  /role: "Verified Mobile Member"/,
  'role: AuthorizationEngine.resolveRole({ email: simEmail } as any)'
);

// We should also remove the legacy localStorage write to "asml_accounts" since we have AppStore that saves it to Firebase
code = code.replace(/localStorage\.setItem\("asml_accounts", JSON\.stringify\(updated\)\);/g, '');

fs.writeFileSync('src/components/LoginView.tsx', code);
console.log('LoginView.tsx email/phone role patched');
