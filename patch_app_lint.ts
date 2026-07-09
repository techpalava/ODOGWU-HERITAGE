import fs from 'fs';

let app = fs.readFileSync('src/App.tsx', 'utf8');
if (!app.includes('import { CapacityService }')) {
  app = app.replace(
    /import \{ processDynamicBatches \} from "\.\/utils\/batchUtils";/,
    'import { processDynamicBatches } from "./utils/batchUtils";\nimport { CapacityService } from "./services/CapacityService";'
  );
}
fs.writeFileSync('src/App.tsx', app);
