const fs = require('fs');
let code = fs.readFileSync('src/utils/batchUtils.ts', 'utf8');

code = code.replace(/b\.currentGarments < b\.maxGarmentsPerBatch/g, 'b.currentGarments < b.targetGarments');

fs.writeFileSync('src/utils/batchUtils.ts', code);
