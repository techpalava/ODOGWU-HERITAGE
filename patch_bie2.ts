import fs from 'fs';

let content = fs.readFileSync('src/engine/BusinessIntelligenceEngine.ts', 'utf8');

content = content.replace(
  /const totalGarments = batches\.reduce\(\n\s*\(acc, b\) => acc \+ b\.currentGarments,\n\s*0,\n\s*\);/,
  `const totalGarments = batches.reduce(\n      (acc, b) => acc + CapacityService.getReservedCapacity(b),\n      0,\n    );`
);

fs.writeFileSync('src/engine/BusinessIntelligenceEngine.ts', content);
