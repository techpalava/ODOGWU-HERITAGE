const fs = require('fs');
let content = fs.readFileSync('src/components/CartDrawer.tsx', 'utf8');

content = content.replace('if (!currentUser) {', 'if (journey.state === "NEW_VISITOR") {');
content = content.replace('{(!currentUser || journey.primaryAction === "Complete Profile") ? "Complete Profile" : "Place Order Securely"}', '{(journey.state === "NEW_VISITOR" || journey.state === "PROFILE_INCOMPLETE") ? "Complete Profile to Checkout" : "Place Order Securely"}');

fs.writeFileSync('src/components/CartDrawer.tsx', content);
