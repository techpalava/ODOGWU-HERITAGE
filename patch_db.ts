import fs from 'fs';

let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

content = content.replace(
  'import { BatchProgressEngine } from "../engine/BatchProgressEngine";',
  'import { CapacityService } from "../services/CapacityService";'
);

content = content.replace(/BatchProgressEngine\.getSummary/g, 'CapacityService.getCapacitySummary');

fs.writeFileSync('src/components/DatabaseView.tsx', content);
