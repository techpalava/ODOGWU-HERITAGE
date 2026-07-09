const fs = require('fs');
let content = fs.readFileSync('src/components/CartDrawer.tsx', 'utf8');

content = content.replace(
  'import { useAppStore } from "../store/useAppStore";',
  'import { useAppStore } from "../store/useAppStore";\nimport { CustomerJourneyEngine } from "../engine/CustomerJourneyEngine";'
);

const stateInit = `  const businessSettings = useAppStore((state) => state.businessSettings);`;
const newInit = `  const businessSettings = useAppStore((state) => state.businessSettings);
  const currentUser = useAppStore((state) => state.currentUser);
  const orders = useAppStore((state) => state.orders);
  const historicalOrders = useAppStore((state) => state.historicalOrders);
  const batches = useAppStore((state) => state.batches);

  const journey = CustomerJourneyEngine.getCurrentJourney({
    currentUser: currentUser as any,
    drafts: cartItems,
    activeOrders: orders,
    historicalOrders,
    allBatches: batches,
  });`;

content = content.replace(stateInit, newInit);

const oldCheckout = `  const handleCheckout = () => {
    if (cartItems.length === 0) return;
    setIsCheckoutPaymentOpen(true);
  };`;

const newCheckout = `  const handleCheckout = () => {
    if (cartItems.length === 0) return;
    
    // Check journey for blockers
    if (journey.destination === "login") {
      setIsCartOpen(false);
      setActiveTab("login");
      setNotification({ message: journey.notification, type: "info" });
      setTimeout(() => { setNotification(null); }, 4000);
      return;
    } else if (journey.destination === "dashboard" && journey.primaryAction === "Complete Profile") {
      setIsCartOpen(false);
      setActiveTab("dashboard");
      setNotification({ message: journey.notification, type: "info" });
      setTimeout(() => { setNotification(null); }, 4000);
      return;
    }
    
    setIsCheckoutPaymentOpen(true);
  };`;

content = content.replace(oldCheckout, newCheckout);
fs.writeFileSync('src/components/CartDrawer.tsx', content);
