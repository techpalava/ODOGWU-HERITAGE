const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

content = content.replace(/calculateGarmentDetailsPrice\(designSelections, selectedStyle\);/, 'calculateGarmentDetailsPrice(designSelections, selectedStyle, customDetailCatalog);');
content = content.replace(/getGarmentDetailsBreakdown\(designSelections, selectedStyle\);/, 'getGarmentDetailsBreakdown(designSelections, customDetailCatalog);');

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
