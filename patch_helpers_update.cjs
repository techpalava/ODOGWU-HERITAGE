const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `export const hasMonogram = (item: any): boolean => {
  return item?.hasMonogram || item?.defaultGarmentDetails?.hasMonogram || item?.embroideryDesign === "Name Monogram" || item?.defaultGarmentDetails?.embroideryDesign === "Name Monogram";
};

export const hasEmbroidery = (item: any): boolean => {
  return item?.hasEmbroidery || item?.defaultGarmentDetails?.hasEmbroidery || item?.embroideryDesign === "Embroidery" || item?.defaultGarmentDetails?.embroideryDesign === "Embroidery";
};

export const hasMonogramTrimming = (item: any): boolean => {
  return item?.hasMonogramTrimming || item?.defaultGarmentDetails?.hasMonogramTrimming || item?.embroideryDesign === "Monogram Trimming" || item?.defaultGarmentDetails?.embroideryDesign === "Monogram Trimming";
};

export const calculateGarmentDetailsPrice = (details: DesignSelections): number => {`;

const replacement = `export const hasMonogram = (item: any): boolean => {
  const text = [item?.name, item?.description, ...(item?.options || [])].filter(Boolean).join(" ").toLowerCase();
  return item?.hasMonogram === true || item?.includedDesignFeatures?.hasMonogram === true || item?.defaultGarmentDetails?.hasMonogram === true || item?.embroideryDesign === "Name Monogram" || item?.defaultGarmentDetails?.embroideryDesign === "Name Monogram" || /\\bmonogram\\b/.test(text);
};

export const hasEmbroidery = (item: any): boolean => {
  const text = [item?.name, item?.description, ...(item?.options || [])].filter(Boolean).join(" ").toLowerCase();
  return item?.hasEmbroidery === true || item?.includedDesignFeatures?.hasEmbroidery === true || item?.defaultGarmentDetails?.hasEmbroidery === true || item?.embroideryDesign === "Embroidery" || item?.defaultGarmentDetails?.embroideryDesign === "Embroidery" || /embroider|embroid/.test(text);
};

export const hasMonogramTrimming = (item: any): boolean => {
  const text = [item?.name, item?.description, ...(item?.options || [])].filter(Boolean).join(" ").toLowerCase();
  return item?.hasMonogramTrimming === true || item?.includedDesignFeatures?.hasMonogramTrimming === true || item?.defaultGarmentDetails?.hasMonogramTrimming === true || item?.embroideryDesign === "Monogram Trimming" || item?.defaultGarmentDetails?.embroideryDesign === "Monogram Trimming" || /monogram trim|monogram trimming/.test(text);
};

export const calculateGarmentDetailsPrice = (details: DesignSelections, style?: any): number => {`;

content = content.replace(targetStr, replacement);

const calcStr = `  // Prevent double counting if both enum and boolean are present
  if (hasMonogram(details)) total += GARMENT_DETAIL_PRICING.embroideryDesign["Name Monogram"] || 12.00;
  if (hasEmbroidery(details)) total += GARMENT_DETAIL_PRICING.embroideryDesign["Embroidery"] || 12.00;
  if (hasMonogramTrimming(details)) total += GARMENT_DETAIL_PRICING.embroideryDesign["Monogram Trimming"] || 12.00;`;
const calcRep = `  // Prevent double counting if both enum and boolean are present
  if (hasMonogram(details) || (style && hasMonogram(style))) total += GARMENT_DETAIL_PRICING.embroideryDesign["Name Monogram"] || 12.00;
  if (hasEmbroidery(details) || (style && hasEmbroidery(style))) total += GARMENT_DETAIL_PRICING.embroideryDesign["Embroidery"] || 12.00;
  if (hasMonogramTrimming(details) || (style && hasMonogramTrimming(style))) total += GARMENT_DETAIL_PRICING.embroideryDesign["Monogram Trimming"] || 12.00;`;

content = content.replace(calcStr, calcRep);

const callStr = `let detailsPrice = calculateGarmentDetailsPrice(designSelections);`;
const callRep = `let detailsPrice = calculateGarmentDetailsPrice(designSelections, selectedStyle);`;
content = content.replace(callStr, callRep);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
