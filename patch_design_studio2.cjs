const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const regex2 = /export const getGarmentDetailsBreakdown = [\s\S]*?return items;\n\};/m;
const rep2 = `export const getGarmentDetailsBreakdown = (details: DesignSelections, catalog: any[] = []): {label: string; value: string; price: number; originalId?: string}[] => {
  if (catalog && catalog.length > 0) {
    return getCustomDetailsBreakdown(details, catalog);
  }
  return []; // Legacy fallback
};`;

content = content.replace(regex2, rep2);

const regex3 = /export const calculateGarmentDetailsPrice = [\s\S]*?return total;\n\};/m;
const rep3 = `export const calculateGarmentDetailsPrice = (details: DesignSelections, catalog: any[] = []): number => {
  if (catalog && catalog.length > 0) {
    return calculateCustomDetailsPrice(details, catalog);
  }
  return 0; // Legacy fallback
};`;

content = content.replace(regex3, rep3);

const regex4 = /export const getConstructionSewingCost = [\s\S]*?return cost;\n\};/m;
const rep4 = `export const getConstructionSewingCost = (details: DesignSelections): number => {
  return 0;
};`;
content = content.replace(regex4, rep4);


fs.writeFileSync('src/components/DesignStudioView.tsx', content);
