const fs = require('fs');
let code = fs.readFileSync('src/store/useAppStore.ts', 'utf8');

// Add import
if (!code.includes('AuthorizationEngine')) {
    code = code.replace(
        'import { auth } from "../services/firebase";',
        'import { auth } from "../services/firebase";\nimport { AuthorizationEngine } from "../engine/AuthorizationEngine";'
    );
}

// Replace existingCustomer find
code = code.replace(
  /c\.email\.toLowerCase\(\) === firebaseUser\.email\?\.toLowerCase\(\)/,
  '(c.email || "").trim().toLowerCase() === (firebaseUser.email || "").trim().toLowerCase()'
);

// Replace role assignment
code = code.replace(
  /role: "Verified Google Client",/,
  'role: AuthorizationEngine.resolveRole({ email: firebaseUser.email } as any),'
);

fs.writeFileSync('src/store/useAppStore.ts', code);
console.log('useAppStore.ts patched');
