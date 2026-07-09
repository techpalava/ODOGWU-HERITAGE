const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

content = content.replace(
  'import { OrderRoutingEngine, OrderRoutingDecision } from "../engine/OrderRoutingEngine";',
  'import { OrderRoutingEngine, OrderRoutingDecision } from "../engine/OrderRoutingEngine";\nimport { CustomerJourneyEngine } from "../engine/CustomerJourneyEngine";'
);

// We need cartItems and historicalOrders to build the journey. We can get them from useAppStore.
content = content.replace(
  'const setNotification = useAppStore((state) => state.setNotification);',
  `const setNotification = useAppStore((state) => state.setNotification);
  const cartItems = useAppStore((state) => state.cartItems);
  const historicalOrders = useAppStore((state) => state.historicalOrders);
  const activeOrders = useAppStore((state) => state.orders);

  const journey = CustomerJourneyEngine.getCurrentJourney({
    currentUser: storeUser as any,
    drafts: cartItems,
    activeOrders,
    historicalOrders,
    allBatches: storeBatches
  });`
);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
