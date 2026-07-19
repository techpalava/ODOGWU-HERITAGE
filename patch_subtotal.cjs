const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `  // Total pricing calculations based on dynamic base sewing prices & standard accessory charge
  const calculateSubtotal = () => {
    if (!selectedFabric) return 0;

    const isActualRate =
      batchType === "alone" ||
      !(businessSettings.pricingSettings?.discountRulesEnabled ?? false);

    // Resolve dynamic Base Sewing Price based on Outfit Type and Garment Composition
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
  };`;

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
  };`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
