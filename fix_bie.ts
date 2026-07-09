import fs from 'fs';

let content = fs.readFileSync('src/engine/BusinessIntelligenceEngine.ts', 'utf8');

content = content.replace(
  /calculateCapacityPercentage: \(batch: Batch, settings: BusinessSettings\) => \{/g,
  'calculateCapacityPercentage: (batch: Batch, _settings: BusinessSettings) => {'
);

content = content.replace(
  /getRemainingGarments: \(batch: Batch, settings: BusinessSettings\) => \{/g,
  'getRemainingGarments: (batch: Batch, _settings: BusinessSettings) => {'
);

fs.writeFileSync('src/engine/BusinessIntelligenceEngine.ts', content);
