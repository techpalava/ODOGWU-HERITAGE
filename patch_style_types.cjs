const fs = require('fs');
let content = fs.readFileSync('src/types.ts', 'utf8');

const replacement = `export interface StyleCategory {
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
  
  // Garment detail configs
  supportedGarmentDetails?: {
    trousers?: boolean;
    shorts?: boolean;
    skirt?: boolean;
    dress?: boolean;
    sleeves?: boolean;
    pockets?: boolean;
    embroidery?: boolean;
    accessories?: boolean;
    lining?: boolean;
  };
  defaultGarmentDetails?: DesignSelections;
}`;

content = content.replace(/export interface StyleCategory \{[\s\S]*?constructionDetails\?\: ConstructionDetail\[\];\n\}/, replacement);
fs.writeFileSync('src/types.ts', content);
