const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const regex = /const GarmentDetailSelector = \(\{[\s\S]*?\};\n\nconst GarmentDetailSummaryItems =/g;
const match = content.match(regex);
fs.writeFileSync('selector_code.txt', match ? match[0] : "NOT FOUND");
