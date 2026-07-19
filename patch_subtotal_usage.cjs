const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `  const garmentDetailsPrice = (!selectedFabric || !selectedStyle || !selectedGarment) ? 0 : calculateGarmentDetailsPrice(designSelections);

  const subtotal = calculateSubtotal();`;

const replacement = `  const pricing = getPricingBreakdown();
  const garmentDetailsPrice = pricing.customDetailsPrice;
  const subtotal = pricing.subtotal;`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
