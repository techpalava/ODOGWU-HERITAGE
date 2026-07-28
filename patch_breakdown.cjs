const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const target = `items.push({ label: opt.selectionGroup.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase()), value: opt.label, price: opt.priceCents / 100 });`;
const rep = `items.push({ label: opt.label, value: "", price: opt.priceCents / 100 });`;
content = content.replace(target, rep);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
