const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `    // Fabric selection has NO impact on pricing (for design/appearance only)
    const fabricSurcharge = 0;`;

const newStr = `    // Fabric pricing based on normalized fabric type
    const fabricSurcharge = getFabricPrice(selectedFabric);`;

content = content.replace(targetStr, newStr);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
