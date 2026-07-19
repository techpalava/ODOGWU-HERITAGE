const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `  if (details.embroideryDesign && GARMENT_DETAIL_PRICING.embroideryDesign[details.embroideryDesign]) {
    total += GARMENT_DETAIL_PRICING.embroideryDesign[details.embroideryDesign];
  }
  
  if (details.hasMonogram) total += 12.00;
  if (details.hasEmbroidery) total += 12.00;
  if (details.hasMonogramTrimming) total += 12.00;`;
const replacement = `  // Prevent double counting if both enum and boolean are present
  if (hasMonogram(details)) total += GARMENT_DETAIL_PRICING.embroideryDesign["Name Monogram"] || 12.00;
  if (hasEmbroidery(details)) total += GARMENT_DETAIL_PRICING.embroideryDesign["Embroidery"] || 12.00;
  if (hasMonogramTrimming(details)) total += GARMENT_DETAIL_PRICING.embroideryDesign["Monogram Trimming"] || 12.00;`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
