const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

content = content.replace(/const baseRateRaw = getBaseSewingPrice\(\n      selectedStyle,\n      selectedGarment,\n      businessSettings.pricingSettings\?.baseSewingPrices,\n    \);/g, 
  'const baseRateRaw = (selectedStyle && selectedGarment) ? getBaseSewingPrice(selectedStyle, selectedGarment, businessSettings.pricingSettings?.baseSewingPrices) : (selectedGarment?.fee || 0);');

content = content.replace(/const discountRatio = \(selectedGarment.discountFee && selectedGarment.fee\)/g,
  'const discountRatio = (selectedGarment?.discountFee && selectedGarment?.fee)');
content = content.replace(/\? selectedGarment.discountFee \/ selectedGarment.fee/g,
  '? selectedGarment.discountFee / selectedGarment.fee');

content = content.replace(/const baseRateRaw = selectedFabric \? getBaseSewingPrice\(\n    selectedStyle,\n    selectedGarment,\n    businessSettings.pricingSettings\?.baseSewingPrices,\n  \) : 0;/g,
  'const baseRateRaw = (selectedFabric && selectedStyle && selectedGarment) ? getBaseSewingPrice(selectedStyle, selectedGarment, businessSettings.pricingSettings?.baseSewingPrices) : (selectedGarment?.fee || 0);');

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
