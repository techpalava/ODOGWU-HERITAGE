const fs = require('fs');
let code = fs.readFileSync('src/engine/CustomerJourneyEngine.ts', 'utf8');

const targetStr = `        const canViewPortal = AuthorizationEngine.canViewCustomerPortal(currentUser);
        if (!canViewPortal) {
             state = "ACCOUNT_CREATED";
        }

        const activeOrder = activeOrders.length > 0 ? activeOrders[0] : null;`;

const replaceStr = `        const canViewPortal = AuthorizationEngine.canViewCustomerPortal(currentUser);
        if (!canViewPortal) {
             state = "ACCOUNT_CREATED";
        }

        const userActiveOrders = activeOrders.filter(o => 
            o.customer && currentUser && o.customer.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase()
        );
        const activeOrder = userActiveOrders.length > 0 ? userActiveOrders[0] : null;`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replaceStr);
    fs.writeFileSync('src/engine/CustomerJourneyEngine.ts', code);
    console.log('Fixed activeOrder filtering');
} else {
    console.log('Target string not found for activeOrder');
}
