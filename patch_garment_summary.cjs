const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const regex = /const GarmentDetailSummaryItems = \(\{ designSelections, isLi = false, currencySymbol, style \}\: \{ designSelections\: any, isLi\?\: boolean, currencySymbol\: string, style\?\: any \}\) => \{/;

const rep = `const GarmentDetailSummaryItems = ({ designSelections, isLi = false, currencySymbol, catalog }: { designSelections: any, isLi?: boolean, currencySymbol: string, catalog?: any[] }) => {`;

content = content.replace(regex, rep);

content = content.replace(/getGarmentDetailsBreakdown\(designSelections, style\)/, 'getGarmentDetailsBreakdown(designSelections, catalog)');

// Also replace usages of GarmentDetailSummaryItems in DesignStudioView.tsx to pass catalog instead of style
content = content.replace(/<GarmentDetailSummaryItems\s+designSelections=\{designSelections\}\s+currencySymbol=\{currencySymbol\}\s+style=\{selectedStyle\}\s+\/>/g, '<GarmentDetailSummaryItems designSelections={designSelections} currencySymbol={currencySymbol} catalog={customDetailCatalog} />');
content = content.replace(/<GarmentDetailSummaryItems\s+designSelections=\{designSelections\}\s+isLi\s+currencySymbol=\{currencySymbol\}\s+style=\{selectedStyle\}\s+\/>/g, '<GarmentDetailSummaryItems designSelections={designSelections} isLi currencySymbol={currencySymbol} catalog={customDetailCatalog} />');

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
