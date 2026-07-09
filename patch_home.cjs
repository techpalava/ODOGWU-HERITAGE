const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

content = content.replace(
  'import { CapacityService } from "../services/CapacityService";',
  'import { CapacityService } from "../services/CapacityService";\nimport { CustomerJourneyEngine } from "../engine/CustomerJourneyEngine";'
);

content = content.replace(
  '  const { businessSettings, currentUser, customers, orders, batches, styles } =\n    useAppStore();',
  '  const { businessSettings, currentUser, customers, orders, batches, styles, cartItems, historicalOrders } =\n    useAppStore();\n\n  const journey = CustomerJourneyEngine.getCurrentJourney({\n    currentUser: currentUser as any,\n    drafts: cartItems,\n    activeOrders: orders,\n    historicalOrders,\n    allBatches: batches,\n  });'
);

// We need to find the hero CTAs and final CTAs.
// Looking around line 150-200, there's multiple buttons.
