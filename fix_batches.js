const fs = require('fs');
let code = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

code = code.replace(/const active = batches\.find\(\(b\) =>\s+\[\s+"Open",\s+"Recruiting",\s+"Almost Full",\s+"In Progress",\s+\]\.includes\(b\.status\),\s+\);/g, 'const active = getActiveBatch(batches);');

fs.writeFileSync('src/components/DatabaseView.tsx', code);
