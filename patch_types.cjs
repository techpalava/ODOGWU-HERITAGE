const fs = require('fs');
let content = fs.readFileSync('src/types.ts', 'utf8');

const interfaceStyleCategory = `export interface StyleCategory {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  gender: "male" | "female" | "unisex" | "couple" | "family";
  outfitType?: string;
  garmentComposition?: string;
  fabricCategory?: string;
  designCategories?: string[]; // E.g., "Male Designs", "Family-Look Designs", etc.
  options: string[]; // specific sub-styles
  image?: string;
  detectedColors?: {
    main: string;
    secondary: string;
  };
  constructionDetails?: ConstructionDetail[];

  // Premium features
  hasMonogram?: boolean;
  hasEmbroidery?: boolean;
  hasMonogramTrimming?: boolean;
  
  // Garment detail configs`;

content = content.replace(/export interface StyleCategory \{[\s\S]*?\/\/ Garment detail configs/, interfaceStyleCategory);

const interfaceDesignSelections = `export interface DesignSelections {
  // Old fields for backward compat
  collar?: string;
  embroidery?: string;
  sleeve?: string;
  pocket?: string;
  additionalCap?: boolean;
  hemFinish?: string;
  hasLining?: boolean;
  optionalAccessories?: string[];

  // Premium features
  hasMonogram?: boolean;
  hasEmbroidery?: boolean;
  hasMonogramTrimming?: boolean;

  // New detailed garment fields`;

content = content.replace(/export interface DesignSelections \{[\s\S]*?\/\/ New detailed garment fields/, interfaceDesignSelections);

fs.writeFileSync('src/types.ts', content);
