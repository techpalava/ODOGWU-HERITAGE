import fs from 'fs';
let bbr = fs.readFileSync('src/engine/BatchBusinessRules.ts', 'utf8');
if (!bbr.includes('import { CapacityService }')) {
  bbr = 'import { CapacityService } from "../services/CapacityService";\n' + bbr;
  fs.writeFileSync('src/engine/BatchBusinessRules.ts', bbr);
}
