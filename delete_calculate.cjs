const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const lines = content.split('\n');
let start = -1;
let end = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const calculateSubtotal = () => {')) {
    start = i;
  }
  if (start !== -1 && lines[i].includes('const discountEnabled =')) {
    end = i;
    break;
  }
}

if (start !== -1 && end !== -1) {
  const block = lines.slice(start, end).join('\n');
  console.log("Found block:");
  console.log(block);
  
  const replacement = `  // Centralized Pricing Helper
  const getPricingBreakdown = () => {
    let fabricPrice = 0;
    let customDetailsPrice = 0;
    let baseRate = 0;
    let courierSurcharge = 0;

    if (selectedFabric) {
      fabricPrice = getFabricPrice(selectedFabric);
    }

    if (selectedFabric && selectedStyle && selectedGarment) {
      // Custom Garment Details Pricing
      let detailsPrice = calculateGarmentDetailsPrice(designSelections);
      
      if (designSelections.additionalCap) {
        detailsPrice += (businessSettings.pricingSettings?.standardAccessoryCharge ?? 10);
      }
      
      if (optionalAccessories && optionalAccessories.length > 0) {
        detailsPrice += (optionalAccessories.length * 10);
      }

      const isLiningSupported = ['L1', 'L2', 'L3', 'L4'].includes(selectedGarment?.code || "");
      if (hasLining && selectedStyle?.gender === "female" && isLiningSupported) {
        detailsPrice += 10.0;
      }
      
      customDetailsPrice = detailsPrice;

      // Base Sewing Price (not included in subtotal for step 1-3 summary)
      const isActualRate = batchType === "alone" || !(businessSettings.pricingSettings?.discountRulesEnabled ?? false);
      const baseRateRaw = getBaseSewingPrice(selectedStyle, selectedGarment, businessSettings.pricingSettings?.baseSewingPrices);
      const discountRatio = (selectedGarment?.discountFee && selectedGarment?.fee)
        ? selectedGarment?.discountFee / selectedGarment?.fee
        : 1;
      baseRate = isActualRate ? baseRateRaw : Math.round(baseRateRaw * discountRatio);
    }

    if (selectedFabric && batchType === "alone") {
      courierSurcharge = 35.0;
    }

    const subtotal = fabricPrice + customDetailsPrice;

    return {
      fabricPrice,
      customDetailsPrice,
      baseRate,
      courierSurcharge,
      subtotal
    };
  };

`;

  lines.splice(start, end - start, replacement);
  fs.writeFileSync('src/components/DesignStudioView.tsx', lines.join('\n'));
} else {
  console.log("Could not find block");
}
