const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

code = code.replace(/selectedGarment\.code/g, 'selectedGarment?.code');

fs.writeFileSync('src/components/DesignStudioView.tsx', code);
