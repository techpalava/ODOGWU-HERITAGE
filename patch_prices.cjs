const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

// replace getGarmentDetailsBreakdown
const oldBreakdownRegex = /export const getGarmentDetailsBreakdown = [\s\S]*?add\('skirtPocket', 'Skirt Pocket'\);/;
const newBreakdown = `import { GARMENT_DETAIL_OPTIONS } from '../config/GarmentDetailsConfig';

export const getGarmentDetailsBreakdown = (details: DesignSelections, style?: any): { label: string, value: string, price: number }[] => {
  const getPrice = (type: string, code: string): number => {
    if (style && style.constructionDetails) {
      const match = style.constructionDetails.find((c: any) => c.type === type && c.code === code);
      return match ? match.price : 0;
    }
    return (GARMENT_DETAIL_PRICING[type] || {})[code] || 0;
  };

  const items: { label: string, value: string, price: number }[] = [];
  
  if (details.customDetails) {
    Object.values(details.customDetails).forEach(optId => {
      const opt = GARMENT_DETAIL_OPTIONS.find(o => o.id === optId);
      if (opt) {
        items.push({ label: opt.selectionGroup.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase()), value: opt.label, price: opt.priceCents / 100 });
      }
    });
  } else {
    // Legacy support
    const add = (key: string, label: string) => {
      if (details[key as keyof DesignSelections]) {
        const val = details[key as keyof DesignSelections] as string;
        items.push({ label, value: val, price: getPrice(key, val) });
      }
    };
    add('topLength', 'Top Length');
    add('topPocket', 'Top Pocket');
    add('dressLength', 'Dress Length');
    add('dressPocket', 'Dress Pocket');
    add('sleeveLength', 'Sleeve Length');
    add('trouserFastening', 'Trouser Fastening');
    add('trouserPocket', 'Trouser Pocket');
    add('shortFastening', 'Short Fastening');
    add('shortPocket', 'Short Pocket');
    add('skirtLength', 'Skirt Length');
    add('skirtPocket', 'Skirt Pocket');
  }`;
content = content.replace(oldBreakdownRegex, newBreakdown);

// replace calculateGarmentDetailsPrice
const oldCalcRegex = /export const calculateGarmentDetailsPrice = [\s\S]*?if \(details\.skirtPocket\) total \+= getPrice\("skirtPocket", details\.skirtPocket\);/;
const newCalc = `export const calculateGarmentDetailsPrice = (details: DesignSelections, style?: any): { total: number, monogramPrice: number } => {
  let total = 0;
  let monogramPrice = 0;
  const getPrice = (type: string, code: string): number => {
    if (style && style.constructionDetails) {
      const match = style.constructionDetails.find((c: any) => c.type === type && c.code === code);
      return match ? match.price : 0;
    }
    return (GARMENT_DETAIL_PRICING[type] || {})[code] || 0;
  };

  if (details.customDetails) {
    Object.values(details.customDetails).forEach(optId => {
      const opt = GARMENT_DETAIL_OPTIONS.find(o => o.id === optId);
      if (opt) {
        total += (opt.priceCents / 100);
      }
    });
  } else {
    // Legacy support
    if (details.topLength) total += getPrice("topLength", details.topLength);
    if (details.topPocket) total += getPrice("topPocket", details.topPocket);
    if (details.dressLength) total += getPrice("dressLength", details.dressLength);
    if (details.dressPocket) total += getPrice("dressPocket", details.dressPocket);
    if (details.sleeveLength) total += getPrice("sleeveLength", details.sleeveLength);
    if (details.trouserFastening) total += getPrice("trouserFastening", details.trouserFastening);
    if (details.trouserPocket) total += getPrice("trouserPocket", details.trouserPocket);
    if (details.shortFastening) total += getPrice("shortFastening", details.shortFastening);
    if (details.shortPocket) total += getPrice("shortPocket", details.shortPocket);
    if (details.skirtLength) total += getPrice("skirtLength", details.skirtLength);
    if (details.skirtPocket) total += getPrice("skirtPocket", details.skirtPocket);
  }`;
content = content.replace(oldCalcRegex, newCalc);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
