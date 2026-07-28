const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

content = content.replace(/import \{ GARMENT_DETAIL_OPTIONS, SelectionGroup \} from '\.\.\/config\/GarmentDetailsConfig';/, `import { SelectionGroup } from '../config/GarmentDetailsConfig';\nimport { getApplicableCustomDetailGroups, getCustomDetailsBreakdown, calculateCustomDetailsPrice } from '../utils/catalogHelpers';`);

// Remove old hardcoded getConstructionSewingCost and GARMENT_DETAIL_PRICING
// It is complicated, so I'll just change getConstructionSewingCost to return 0 always and calculateGarmentDetailsPrice to use calculateCustomDetailsPrice.
const replaceCalculations = `export const calculateGarmentDetailsPrice = (details: DesignSelections, catalog: any[] = []): number => {
  if (catalog && catalog.length > 0) {
    return calculateCustomDetailsPrice(details, catalog);
  }
  return 0; // Legacy fallback
};

export const getGarmentDetailsBreakdown = (details: DesignSelections, catalog: any[] = []): {label: string; value: string; price: number; originalId?: string}[] => {
  if (catalog && catalog.length > 0) {
    return getCustomDetailsBreakdown(details, catalog);
  }
  return []; // Legacy fallback
};`;

content = content.replace(/export const GARMENT_DETAIL_PRICING: Record<string, number> = \{[\s\S]*?export const calculateGarmentDetailsPrice = \(details: DesignSelections\): number => \{[\s\S]*?return items;\n\};/m, replaceCalculations);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
