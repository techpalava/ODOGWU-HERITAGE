const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

if (code.startsWith('import { AuthorizationEngine }')) {
    code = code.replace('import { AuthorizationEngine } from "./engine/AuthorizationEngine";\n', '');
    code = code.replace(
        'import { signOut } from "firebase/auth";',
        'import { signOut } from "firebase/auth";\nimport { AuthorizationEngine } from "./engine/AuthorizationEngine";'
    );
    fs.writeFileSync('src/App.tsx', code);
    console.log('Moved import');
}
