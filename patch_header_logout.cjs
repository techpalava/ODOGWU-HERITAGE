const fs = require('fs');
let code = fs.readFileSync('src/components/Header.tsx', 'utf8');

code = code.replace(
    '        setCurrentUser(null);',
    '        setCurrentUser(null);\n        StorageService.clearSession();'
);

if (!code.includes('import { StorageService }')) {
    code = code.replace(
        'import { auth } from "../services/firebase";',
        'import { auth } from "../services/firebase";\nimport { StorageService } from "../services/storageService";'
    );
}

fs.writeFileSync('src/components/Header.tsx', code);
console.log('Patched Header.tsx');
