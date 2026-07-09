import fs from 'fs';

// 1. Fix DatabaseView import
let dbContent = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');
if (!dbContent.includes('BatchProgressEngine')) {
  dbContent = dbContent.replace(
    'import { BatchBusinessRules } from "../engine/BatchBusinessRules";',
    'import { BatchBusinessRules } from "../engine/BatchBusinessRules";\nimport { BatchProgressEngine } from "../engine/BatchProgressEngine";'
  );
  fs.writeFileSync('src/components/DatabaseView.tsx', dbContent);
}

// 2. Fix OrderRoutingPanel unused imports
let orpContent = fs.readFileSync('src/components/OrderRoutingPanel.tsx', 'utf8');
orpContent = orpContent.replace(/import \{ Batch \} from '\.\.\/types';\n/g, '');
orpContent = orpContent.replace(/RoutingPresentationModel, RoutingActionModel, /g, '');
orpContent = orpContent.replace(/import React from 'react';\n/g, '');
fs.writeFileSync('src/components/OrderRoutingPanel.tsx', orpContent);

// 3. Fix BatchBusinessRules unused variables and signature
let bbrContent = fs.readFileSync('src/engine/BatchBusinessRules.ts', 'utf8');
bbrContent = bbrContent.replace(
  /static canAcceptOrders\(data: Batch \| OrderContext \| null \| undefined\): BatchEligibility \{/g,
  `static canAcceptOrders(data: Batch | Partial<OrderContext> | null | undefined): BatchEligibility {`
);
bbrContent = bbrContent.replace(/let currentGarments = 0;\n    let targetGarments = 0;\n/g, '');
bbrContent = bbrContent.replace(/currentGarments = ctx\.currentMembers \|\| 0;\n      targetGarments = ctx\.expectedParticipants \|\| 0;\n/g, '');
bbrContent = bbrContent.replace(/currentGarments = batch\.currentGarments \|\| 0;\n      targetGarments = batch\.targetGarments \|\| 0;\n/g, '');
fs.writeFileSync('src/engine/BatchBusinessRules.ts', bbrContent);

// 4. Fix BusinessIntelligenceEngine unused settings
let bieContent = fs.readFileSync('src/engine/BusinessIntelligenceEngine.ts', 'utf8');
bieContent = bieContent.replace(
  /calculateCapacityPercentage: \(batch: Batch, settings: BusinessSettings\) => \{/g,
  `calculateCapacityPercentage: (batch: Batch, _settings: BusinessSettings) => {`
);
bieContent = bieContent.replace(
  /getRemainingGarments: \(batch: Batch, settings: BusinessSettings\) => \{/g,
  `getRemainingGarments: (batch: Batch, _settings: BusinessSettings) => {`
);
fs.writeFileSync('src/engine/BusinessIntelligenceEngine.ts', bieContent);
