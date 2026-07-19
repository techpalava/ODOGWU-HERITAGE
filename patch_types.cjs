const fs = require('fs');
let content = fs.readFileSync('src/types.ts', 'utf8');

const replacement = `export interface DesignSelections {
  // Old fields for backward compat
  collar?: string;
  embroidery?: string;
  sleeve?: string;
  pocket?: string;
  additionalCap?: boolean;
  hemFinish?: string;
  hasLining?: boolean;
  optionalAccessories?: string[];

  // New detailed garment fields
  topLength?: string;
  topPocket?: string;
  dressLength?: string;
  dressPocket?: string;
  sleeveLength?: string;
  trouserFastening?: string;
  trouserPocket?: string;
  shortFastening?: string;
  shortPocket?: string;
  skirtLength?: string;
  skirtPocket?: string;
  embroideryDesign?: string;
  accessories?: string[];
}`;

content = content.replace(/export interface DesignSelections \{[\s\S]*?\}/, replacement);
fs.writeFileSync('src/types.ts', content);
