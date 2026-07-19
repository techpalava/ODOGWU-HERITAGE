const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const oldPricing = `export const FABRIC_PRICING: Record<string, number> = {
  "HiTarget Ankara": 3.91,
  "Hollandis Ankara": 3.91,
  "Kampala": 5.00,
  "Aso-Oke": 6.25,
  "Adire": 6.88,
  "Isiagu (Akwa-Oche)": 28.13,
  "Lace": 28.13,
};`;

const newPricing = `export const FABRIC_PRICING: Record<string, number> = {
  "HiTarget Ankara": 3.91,
  "Hollandis Ankara": 3.91,
  "Kampala": 5.00,
  "Aso-Oke": 6.25,
  "Adire": 6.88,
  "Isiagu (Akwa-Oche)": 28.13,
  "Lace": 28.13,
};`; // Same, just confirming. Let's see if we need to replace anything else in FABRIC_PRICING just in case.

const actualPricing = content.match(/export const FABRIC_PRICING: Record<string, number> = \{[\s\S]*?\};/);
if (actualPricing) {
  content = content.replace(actualPricing[0], newPricing);
}

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
