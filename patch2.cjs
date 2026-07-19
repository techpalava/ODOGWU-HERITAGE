const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

content = content.replace(/\{selectedStyle\?\.garmentComposition \|\| "Pending"\}/g, '{selectedStyle?.garmentComposition || "Pending"}');

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
