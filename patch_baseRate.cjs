const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `  // Expose variables for display
  const baseRateRaw = (selectedFabric && selectedStyle && selectedGarment) ? getBaseSewingPrice(selectedStyle, selectedGarment, businessSettings.pricingSettings?.baseSewingPrices) : 0;
  const discountRatio = (selectedGarment?.discountFee && selectedGarment?.fee)
    ? selectedGarment?.discountFee / selectedGarment?.fee
    : 1;
  const baseRate = (!selectedFabric || !selectedStyle || !selectedGarment) ? 0 : (isActualRateForDisplay
    ? baseRateRaw
    : Math.round(baseRateRaw * discountRatio));

  const pricing = getPricingBreakdown();`;

const replacement = `  const pricing = getPricingBreakdown();
  const baseRate = pricing.baseRate;`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
