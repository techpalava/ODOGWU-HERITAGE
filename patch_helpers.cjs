const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `export const calculateGarmentDetailsPrice = (details: DesignSelections): number => {`;
const replacement = `export const hasMonogram = (item: any): boolean => {
  return item?.hasMonogram || item?.defaultGarmentDetails?.hasMonogram || item?.embroideryDesign === "Name Monogram" || item?.defaultGarmentDetails?.embroideryDesign === "Name Monogram";
};

export const hasEmbroidery = (item: any): boolean => {
  return item?.hasEmbroidery || item?.defaultGarmentDetails?.hasEmbroidery || item?.embroideryDesign === "Embroidery" || item?.defaultGarmentDetails?.embroideryDesign === "Embroidery";
};

export const hasMonogramTrimming = (item: any): boolean => {
  return item?.hasMonogramTrimming || item?.defaultGarmentDetails?.hasMonogramTrimming || item?.embroideryDesign === "Monogram Trimming" || item?.defaultGarmentDetails?.embroideryDesign === "Monogram Trimming";
};

export const calculateGarmentDetailsPrice = (details: DesignSelections): number => {`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
