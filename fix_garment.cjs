const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

code = code.replace(/selectedGarment\.fee/g, 'selectedGarment?.fee');
code = code.replace(/selectedGarment\.discountFee/g, 'selectedGarment?.discountFee');
code = code.replace(/selectedGarment\.type/g, 'selectedGarment?.type');

fs.writeFileSync('src/components/DesignStudioView.tsx', code);
