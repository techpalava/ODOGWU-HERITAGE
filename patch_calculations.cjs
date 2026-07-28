const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const regexPrice = /export const calculateGarmentDetailsPrice = \([\s\S]*?return \{ total, monogramPrice \};\n\};/m;

const replacementPrice = `export const calculateGarmentDetailsPrice = (details: DesignSelections, style?: any, catalog: any[] = []): { total: number, monogramPrice: number } => {
  let total = 0;
  let monogramPrice = 0;
  
  const getPrice = (type: string, code: string): number => {
    if (style && style.constructionDetails) {
      const match = style.constructionDetails.find((c: any) => c.type === type && c.code === code);
      return match ? match.price : 0;
    }
    return (GARMENT_DETAIL_PRICING[type] || {})[code] || 0;
  };
  
  total += calculateCustomDetailsPrice(details, catalog);

  if (details.embroideryDesign) {
    const p = getPrice("embroideryDesign", details.embroideryDesign as string);
    total += p;
    monogramPrice += p;
  } else if (style) {
    if (hasMonogram(style)) {
      let p = getPrice("embroideryDesign", "Name Monogram");
      if (p === 0 && (!style.constructionDetails || !style.constructionDetails.some((c: any) => c.type === 'embroideryDesign'))) p = 12.00;
      total += p;
      monogramPrice += p;
    }
    if (hasEmbroidery(style)) {
      let p = getPrice("embroideryDesign", "Embroidery");
      if (p === 0 && (!style.constructionDetails || !style.constructionDetails.some((c: any) => c.type === 'embroideryDesign'))) p = 12.00;
      total += p;
      monogramPrice += p;
    }
    if (hasMonogramTrimming(style)) {
      let p = getPrice("embroideryDesign", "Monogram Trimming");
      if (p === 0 && (!style.constructionDetails || !style.constructionDetails.some((c: any) => c.type === 'embroideryDesign'))) p = 12.00;
      total += p;
      monogramPrice += p;
    }
  }

  if (details.accessories) {
    for (const acc of details.accessories) {
      total += getPrice("accessories", acc);
    }
  }

  return { total, monogramPrice };
};`;

content = content.replace(regexPrice, replacementPrice);

// Also remove the old getGarmentDetailsBreakdown from lines 530-580 if they are still there
// Wait, getGarmentDetailsBreakdown is currently defined at line 536 and again at line ???
// Let's replace the one that uses GARMENT_DETAIL_OPTIONS.

const regexBreakdown = /export const getGarmentDetailsBreakdown = \([\s\S]*?return items;\n\};/m;
content = content.replace(regexBreakdown, `export const getGarmentDetailsBreakdown = (details: DesignSelections, catalog: any[] = []): {label: string; value: string; price: number; originalId?: string}[] => {
  return getCustomDetailsBreakdown(details, catalog);
};`);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
