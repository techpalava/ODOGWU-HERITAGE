const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const injection = `
export const GARMENT_DETAIL_PRICING: Record<string, Record<string, number>> = {
  topLength: {
    "Standard length (at crotch area)": 15.77,
    "Long length (at or below knee)": 20.77,
  },
  topPocket: {
    "With 1 chest pocket": 0,
    "With 2 chest pockets": 0,
    "No pockets": 0,
  },
  dressLength: {
    "Standard length (above or at crotch area)": 20.77,
    "Long length (at or below knee, above ankle)": 25.77,
  },
  dressPocket: {
    "With Pocket(s)": 0,
    "No Pocket(s)": 0,
  },
  sleeveLength: {
    "Sleeveless (Over the Shoulder Sleeve)": 15.77,
    "Short sleeve": 15.77,
    "Mid sleeve (3-Quarter)": 20.77,
    "Long sleeve": 20.77,
  },
  trouserFastening: {
    "With Rope": 41.53,
    "With Elastic Band": 46.53,
    "With Belt Holder": 46.53,
  },
  trouserPocket: {
    "With Regular side waist-pockets": 0,
    "Back pocket": 0,
    "No pockets": 0,
  },
  shortFastening: {
    "With Rope": 36.53,
    "With Elastic Band": 41.53,
    "With Belt Holder": 41.53,
  },
  shortPocket: {
    "Combat (Extra side hip-pockets)": 5.00,
    "With Regular side waist-pockets": 0,
    "Back pocket": 0,
    "No pockets": 0,
  },
  skirtLength: {
    "Standard length (above knee)": 25.77,
    "Long length (at or below knee, above ankle)": 30.77,
  },
  skirtPocket: {
    "With 1 side-pocket": 0,
    "With 2 side-pockets": 0,
    "No pockets": 0,
  },
  embroideryDesign: {
    "Name Monogram": 12.00,
    "Embroidery": 12.00,
    "Monogram Trimming": 12.00,
  },
  accessories: {
    "Traditional Hat": 12.00,
    "Traditional Bead": 12.00,
    "Traditional Stick": 12.00,
  }
};

export const calculateGarmentDetailsPrice = (details: DesignSelections): number => {
  let total = 0;
  if (details.topLength && GARMENT_DETAIL_PRICING.topLength[details.topLength]) total += GARMENT_DETAIL_PRICING.topLength[details.topLength];
  if (details.topPocket && GARMENT_DETAIL_PRICING.topPocket[details.topPocket]) total += GARMENT_DETAIL_PRICING.topPocket[details.topPocket];
  if (details.dressLength && GARMENT_DETAIL_PRICING.dressLength[details.dressLength]) total += GARMENT_DETAIL_PRICING.dressLength[details.dressLength];
  if (details.dressPocket && GARMENT_DETAIL_PRICING.dressPocket[details.dressPocket]) total += GARMENT_DETAIL_PRICING.dressPocket[details.dressPocket];
  if (details.sleeveLength && GARMENT_DETAIL_PRICING.sleeveLength[details.sleeveLength]) total += GARMENT_DETAIL_PRICING.sleeveLength[details.sleeveLength];
  if (details.trouserFastening && GARMENT_DETAIL_PRICING.trouserFastening[details.trouserFastening]) total += GARMENT_DETAIL_PRICING.trouserFastening[details.trouserFastening];
  if (details.trouserPocket && GARMENT_DETAIL_PRICING.trouserPocket[details.trouserPocket]) total += GARMENT_DETAIL_PRICING.trouserPocket[details.trouserPocket];
  if (details.shortFastening && GARMENT_DETAIL_PRICING.shortFastening[details.shortFastening]) total += GARMENT_DETAIL_PRICING.shortFastening[details.shortFastening];
  if (details.shortPocket && GARMENT_DETAIL_PRICING.shortPocket[details.shortPocket]) total += GARMENT_DETAIL_PRICING.shortPocket[details.shortPocket];
  if (details.skirtLength && GARMENT_DETAIL_PRICING.skirtLength[details.skirtLength]) total += GARMENT_DETAIL_PRICING.skirtLength[details.skirtLength];
  if (details.skirtPocket && GARMENT_DETAIL_PRICING.skirtPocket[details.skirtPocket]) total += GARMENT_DETAIL_PRICING.skirtPocket[details.skirtPocket];
  if (details.embroideryDesign && GARMENT_DETAIL_PRICING.embroideryDesign[details.embroideryDesign]) total += GARMENT_DETAIL_PRICING.embroideryDesign[details.embroideryDesign];
  if (details.accessories) {
    for (const acc of details.accessories) {
      if (GARMENT_DETAIL_PRICING.accessories[acc]) {
        total += GARMENT_DETAIL_PRICING.accessories[acc];
      }
    }
  }
  return total;
};
`;

content = content.replace('export const FABRIC_PRICING:', injection + '\nexport const FABRIC_PRICING:');
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
