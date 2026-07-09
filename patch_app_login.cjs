const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const oldLogin = `    // Redirect if pending
    if (store.pendingRedirect) {
      setActiveTab(store.pendingRedirect as any);
      store.setPendingRedirect(null);
    } else if (activeTab === "login") {
      setActiveTab("dashboard");
    }`;

const newLogin = `    // Re-evaluate journey upon login
    if (store.pendingRedirect) {
      setActiveTab(store.pendingRedirect as any);
      store.setPendingRedirect(null);
    } else if (activeTab === "login") {
      const loginJourney = CustomerJourneyEngine.getCurrentJourney({
        currentUser: user as any,
        drafts: store.cartItems,
        activeOrders: store.orders,
        historicalOrders: store.historicalOrders,
        allBatches: store.batches,
      });
      setActiveTab(loginJourney.destination as any);
    }`;

content = content.replace(oldLogin, newLogin);
fs.writeFileSync('src/App.tsx', content);
