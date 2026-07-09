const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

content = content.replace(
  'import { CapacityService } from "../services/CapacityService";',
  'import { CapacityService } from "../services/CapacityService";\nimport { CustomerJourneyEngine } from "../engine/CustomerJourneyEngine";'
);

content = content.replace(
  'const { businessSettings, currentUser, customers, orders, batches, styles } =\n    useAppStore();',
  `const { businessSettings, currentUser, customers, orders, batches, styles, cartItems, historicalOrders } = useAppStore();\n  const journey = CustomerJourneyEngine.getCurrentJourney({\n    currentUser: currentUser as any,\n    drafts: cartItems,\n    activeOrders: orders,\n    historicalOrders,\n    allBatches: batches,\n  });`
);

content = content.replace(
  'const { businessSettings, currentUser, customers, orders, batches, styles } =    useAppStore();',
  `const { businessSettings, currentUser, customers, orders, batches, styles, cartItems, historicalOrders } = useAppStore();\n  const journey = CustomerJourneyEngine.getCurrentJourney({\n    currentUser: currentUser as any,\n    drafts: cartItems,\n    activeOrders: orders,\n    historicalOrders,\n    allBatches: batches,\n  });`
);

fs.writeFileSync('src/components/HomeView.tsx', content);
