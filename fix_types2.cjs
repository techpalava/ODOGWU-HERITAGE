const fs = require('fs');
let content = fs.readFileSync('src/types.ts', 'utf8');

// find the exact locations.
const regex = /export interface DesignSelections \{[\s\S]*?\}/;
let designSelectionsMatch = content.match(regex);
if (designSelectionsMatch) {
  let inner = designSelectionsMatch[0];
  inner = inner.replace(/  targetDemographic\?\: "male" \| "female" \| "unisex";\n  featuresMaleAndFemale\?\: boolean;\n  garmentCompositionList\?\: string\[\];\n  supportedGarmentDetails\?\: string\[\];\n\n/g, '');
  content = content.replace(designSelectionsMatch[0], inner);
}

fs.writeFileSync('src/types.ts', content);
