const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');
const target = `  const handleStyleChange = (style: StyleCategory) => {
    setSelectedStyle(style);
    const availableTypes = garmentTypesForStyle(style);`;
const replacement = `  const handleStyleChange = (style: StyleCategory) => {
    setSelectedStyle(style);
    setDesignSelections({ customDetails: {} });
    const availableTypes = garmentTypesForStyle(style);`;
content = content.replace(target, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
