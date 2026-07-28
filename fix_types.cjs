const fs = require('fs');
let content = fs.readFileSync('src/types.ts', 'utf8');
content = content.replace(`  targetDemographic?: "male" | "female" | "unisex";
  featuresMaleAndFemale?: boolean;
  garmentCompositionList?: string[];
  supportedGarmentDetails?: string[];

  // Premium features`, `  // Premium features`);
content = content.replace(`  constructionDetails?: ConstructionDetail[];

  // Premium features`, `  constructionDetails?: ConstructionDetail[];

  // New metadata fields
  targetDemographic?: "male" | "female" | "unisex";
  featuresMaleAndFemale?: boolean;
  garmentCompositionList?: string[];
  supportedGarmentDetails?: string[];

  // Premium features`);
fs.writeFileSync('src/types.ts', content);
