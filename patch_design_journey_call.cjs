const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

content = content.replace(
    'allBatches: storeBatches',
    'allBatches: storeBatches,\n    stepperContext: { currentStep, totalSteps: 9 }'
);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
