import { OrderRoutingEngine } from './src/engine/OrderRoutingEngine';

const order1 = { payment: { isPaid: false } };
const order2 = { payment: { isPaid: true } };

console.log("Before payment:", OrderRoutingEngine.canChangeRouting(order1));
console.log("After payment:", OrderRoutingEngine.canChangeRouting(order2));
