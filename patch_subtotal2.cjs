const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `    // Resolve dynamic Base Sewing Price based on Outfit Type and Garment Composition
    const baseRateRaw = (selectedStyle && selectedGarment) ? getBaseSewingPrice(selectedStyle, selectedGarment, businessSettings.pricingSettings?.baseSewingPrices) : (selectedGarment?.fee || 0);

    // Maintain standard group buy/cohort discount ratio
    const discountRatio = (selectedGarment?.discountFee && selectedGarment?.fee)
      ? selectedGarment?.discountFee / selectedGarment?.fee
      : 1;
    const baseRate = isActualRate
      ? baseRateRaw
      : Math.round(baseRateRaw * discountRatio);

    // Fabric pricing based on normalized fabric type
    const fabricSurcharge = getFabricPrice(selectedFabric);

    // Surcharges from accessories and lining
    let extras = 0;
    const accessoryPrice =
      businessSettings.pricingSettings?.standardAccessoryCharge ?? 10;

    // Ladies Lining (L5): adds +€10.00 (Customization)
    if (selectedStyle && hasLining && selectedStyle?.gender === "female" && selectedGarment && ["L1", "L2", "L3", "L4"].includes(selectedGarment?.code || "")) {
      extras += 10.0;
    }

    // Traditional Hat / Fila (Accessory)
    if (designSelections.additionalCap) {
      extras += accessoryPrice;
    }

    // Optional Accessories
    if (batchType !== "alone") {
      extras += optionalAccessories.length * 10.0;
    }

    // Individual Courier Surcharge
    const courierSurcharge =
      batchType === "alone"
        ? 35.0
        : 0;

    return baseRate + fabricSurcharge + extras + courierSurcharge;
  };

  const discountEnabled =
    businessSettings.pricingSettings?.discountRulesEnabled ?? false;
  const isActualRateForDisplay = batchType === "alone" || !discountEnabled;

  // Expose base rate variables for display
  const baseRateRaw = (selectedFabric && selectedStyle && selectedGarment) ? getBaseSewingPrice(selectedStyle, selectedGarment, businessSettings.pricingSettings?.baseSewingPrices) : (selectedGarment?.fee || 0);
  const discountRatio = (selectedGarment?.discountFee && selectedGarment?.fee)
    ? selectedGarment?.discountFee / selectedGarment?.fee
    : 1;
  const baseRate = (!selectedFabric) ? 0 : (isActualRateForDisplay
    ? baseRateRaw
    : Math.round(baseRateRaw * discountRatio));`;

const replacement = `    // Resolve dynamic Base Sewing Price based on Outfit Type and Garment Composition
    const baseRateRaw = (selectedStyle && selectedGarment) ? getBaseSewingPrice(selectedStyle, selectedGarment, businessSettings.pricingSettings?.baseSewingPrices) : 0;

    // Maintain standard group buy/cohort discount ratio
    const discountRatio = (selectedGarment?.discountFee && selectedGarment?.fee)
      ? selectedGarment?.discountFee / selectedGarment?.fee
      : 1;
    const baseRate = isActualRate
      ? baseRateRaw
      : Math.round(baseRateRaw * discountRatio);

    // Fabric pricing based on normalized fabric type
    const fabricSurcharge = getFabricPrice(selectedFabric);

    // New Garment Details Pricing
    const garmentDetailsPrice = calculateGarmentDetailsPrice(designSelections);

    // Ladies Lining (L5): adds +€10.00 (Customization)
    let liningPrice = 0;
    if (selectedStyle && hasLining && selectedStyle?.gender === "female" && selectedGarment && ["L1", "L2", "L3", "L4"].includes(selectedGarment?.code || "")) {
      liningPrice = 10.0;
    }

    // Individual Courier Surcharge
    const courierSurcharge =
      batchType === "alone"
        ? 35.0
        : 0;

    // Only include baseRate and garment details if a style has been selected.
    const effectiveBaseRate = (selectedFabric && selectedStyle && selectedGarment) ? baseRate : 0;
    const effectiveDetailsPrice = (selectedFabric && selectedStyle && selectedGarment) ? garmentDetailsPrice : 0;
    const effectiveLiningPrice = (selectedFabric && selectedStyle && selectedGarment) ? liningPrice : 0;

    return fabricSurcharge + effectiveBaseRate + effectiveDetailsPrice + effectiveLiningPrice + courierSurcharge;
  };

  const discountEnabled =
    businessSettings.pricingSettings?.discountRulesEnabled ?? false;
  const isActualRateForDisplay = batchType === "alone" || !discountEnabled;

  // Expose variables for display
  const baseRateRaw = (selectedFabric && selectedStyle && selectedGarment) ? getBaseSewingPrice(selectedStyle, selectedGarment, businessSettings.pricingSettings?.baseSewingPrices) : 0;
  const discountRatio = (selectedGarment?.discountFee && selectedGarment?.fee)
    ? selectedGarment?.discountFee / selectedGarment?.fee
    : 1;
  const baseRate = (!selectedFabric || !selectedStyle || !selectedGarment) ? 0 : (isActualRateForDisplay
    ? baseRateRaw
    : Math.round(baseRateRaw * discountRatio));
  const garmentDetailsPrice = (!selectedFabric || !selectedStyle || !selectedGarment) ? 0 : calculateGarmentDetailsPrice(designSelections);`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
