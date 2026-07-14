const fs = require('fs');
let code = fs.readFileSync('src/services/firebase.ts', 'utf8');

const note = `/**
 * ============================================================================
 * DEPLOYMENT CHECKLIST & FIREBASE CONSOLE SETUP NOTE
 * ============================================================================
 * For Google Authentication to work correctly in production and development:
 * 1. Go to Firebase Console -> Authentication -> Sign-in method.
 * 2. Ensure the "Google" provider is ENABLED.
 * 3. Go to Firebase Console -> Authentication -> Settings -> Authorized domains.
 * 4. Add "odogwu-heritage.vercel.app" to the Authorized domains list.
 * 5. Add "localhost" to the Authorized domains list (for development).
 * ============================================================================
 */\n\n`;

code = note + code;
fs.writeFileSync('src/services/firebase.ts', code);
console.log('Updated firebase.ts');
