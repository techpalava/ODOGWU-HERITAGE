const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

code = code.replace(/selectedGarment\.name/g, 'selectedGarment?.name');
code = code.replace(/selectedStyle\.gender/g, 'selectedStyle?.gender');
code = code.replace(/selectedStyle\.name/g, 'selectedStyle?.name');

fs.writeFileSync('src/components/DesignStudioView.tsx', code);
