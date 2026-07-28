const fs = require('fs');
let content = fs.readFileSync('src/components/CartDrawer.tsx', 'utf8');

const regex = /🪡 Accent\: <strong>\{item\.design\.collar\}<\/strong>/;
const replacement = `🪡 Accent: <strong>{item.design.customDetails?.neck_design ? item.design.customDetails.neck_design.replace('neck_', '') : item.design.collar || "Default"}</strong>`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/components/CartDrawer.tsx', content);
