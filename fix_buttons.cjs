const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

code = code.replace(
    /opacity-70 hover:opacity-100/g,
    'hover:shadow-sm'
);

fs.writeFileSync('src/components/DesignStudioView.tsx', code);
