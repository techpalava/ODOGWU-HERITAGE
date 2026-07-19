const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `  // Helper to sync garment types when style changes
  const handleStyleChange = (style: StyleCategory) => {
    setSelectedStyle(style);
    const availableTypes = garmentTypesForStyle(style);
    setSelectedGarment(
      availableTypes[0] || {
        type: "Standard Garment",
        fee: style.basePrice || 150,
      },
    );`;

const replacement = `  // Helper to sync garment types when style changes
  const handleStyleChange = (style: StyleCategory) => {
    setSelectedStyle(style);
    const availableTypes = garmentTypesForStyle(style);
    const defaultGarment = availableTypes[0] || {
      type: "Standard Garment",
      fee: style.basePrice || 150,
    };
    setSelectedGarment(defaultGarment);
    
    if (defaultGarment.code === "EXACT" && style.defaultGarmentDetails) {
      setDesignSelections(style.defaultGarmentDetails);
    }`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
