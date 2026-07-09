const fs = require('fs');
let content = fs.readFileSync('src/components/CartDrawer.tsx', 'utf8');

const oldBtn = `<CreditCard size={12} /> Place Group Order Securely`;
const newBtn = `<CreditCard size={12} /> {journey.destination === "login" || journey.primaryAction === "Complete Profile" ? journey.primaryAction : "Place Group Order Securely"}`;

content = content.replace(oldBtn, newBtn);
fs.writeFileSync('src/components/CartDrawer.tsx', content);
