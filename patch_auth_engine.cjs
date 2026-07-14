const fs = require('fs');
let code = fs.readFileSync('src/engine/AuthorizationEngine.ts', 'utf8');

code = code.replace(
  /"milltechbox@gmail\.com"/,
  '"milltechbox@gmail.com",\n    "millstechbox@gmail.com"'
);

fs.writeFileSync('src/engine/AuthorizationEngine.ts', code);
console.log('Patched AuthorizationEngine.ts');
