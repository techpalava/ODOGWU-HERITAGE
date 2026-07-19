const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

content = content.replace(/fabric\.name\.toLowerCase/g, '(fabric.name || "").toLowerCase');
content = content.replace(/fabric\?\.code\.toLowerCase/g, '(fabric?.code || "").toLowerCase');
content = content.replace(/fabric\.description\.toLowerCase/g, '(fabric.description || "").toLowerCase');
content = content.replace(/fabric\.color\.toLowerCase/g, '(fabric.color || "").toLowerCase');

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
