const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

code = code.replace(/f\.code/g, 'f?.code');
code = code.replace(/c\.code/g, 'c?.code');
code = code.replace(/p\.code/g, 'p?.code');
code = code.replace(/g\.code/g, 'g?.code');
code = code.replace(/fabric\.code/g, 'fabric?.code');

code = code.replace(/garment\.code/g, 'garment?.code');

fs.writeFileSync('src/components/DesignStudioView.tsx', code);
