import fs from 'fs';

let content = fs.readFileSync('src/engine/BusinessIntelligenceEngine.ts', 'utf8');

content = content.replace(
  'import { Batch, BusinessSettings } from "../types";',
  'import { Batch, BusinessSettings } from "../types";\nimport { CapacityService } from "../services/CapacityService";'
);

content = content.replace(
  /calculateCapacityPercentage: \(batch: Batch, settings: BusinessSettings\) => \{[\s\S]*?\},/,
  `calculateCapacityPercentage: (batch: Batch, settings: BusinessSettings) => {\n    return CapacityService.getCapacityBreakdown(batch).percentage;\n  },`
);

content = content.replace(
  /getRemainingGarments: \(batch: Batch, settings: BusinessSettings\) => \{[\s\S]*?\},/,
  `getRemainingGarments: (batch: Batch, settings: BusinessSettings) => {\n    return CapacityService.getRemainingCapacity(batch);\n  },`
);

fs.writeFileSync('src/engine/BusinessIntelligenceEngine.ts', content);
