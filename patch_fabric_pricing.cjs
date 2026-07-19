const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const replacement = `export const getBaseSewingPrice = (
  style: StyleCategory,
  garment: { type: string; fee: number; code?: string },
  baseSewingPrices?: { [key: string]: number },
): number => {
  const oType = style.outfitType || style.name;
  const comp = getGarmentCompositionFromCode(
    garment?.code || "",
    style.garmentComposition || "2-Piece Set",
  );
  const key = \`\${oType}_\${comp}\`;
  const configuredPrice = baseSewingPrices?.[key];
  if (configuredPrice !== undefined) {
    return configuredPrice;
  }
  return garment.fee || 0; // fallback to default garment fee
};

export const FABRIC_PRICING: Record<string, number> = {
  "HiTarget Ankara": 3.91,
  "Hollandis Ankara": 3.91,
  "Kampala": 5.00,
  "Aso-Oke": 6.25,
  "Adire": 6.88,
  "Isiagu (Akwa-Oche)": 28.13,
  "Lace": 28.13,
};

export const getNormalizedFabricName = (name: string): string => {
  if (!name) return "";
  const lower = name.toLowerCase();
  if (lower.includes("hitarget") || lower.includes("hi-target")) return "HiTarget Ankara";
  if (lower.includes("hollandis")) return "Hollandis Ankara";
  if (lower.includes("kampala")) return "Kampala";
  if (lower.includes("aso oke") || lower.includes("aso-oke") || lower.includes("asioke")) return "Aso-Oke";
  if (lower.includes("adire")) return "Adire";
  if (lower.includes("isiagu")) return "Isiagu (Akwa-Oche)";
  if (lower.includes("lace")) return "Lace";
  return name;
};

export const getFabricPrice = (fabric: Fabric | null): number => {
  if (!fabric) return 0;
  const category = fabric.category || fabric.name || "";
  const normalized = getNormalizedFabricName(category);
  return FABRIC_PRICING[normalized] || 0;
};
`;

content = content.replace(/export const getBaseSewingPrice = \([\s\S]*?return garment\.fee \|\| 0; \/\/ fallback to default garment fee\n\};\n/m, replacement);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
