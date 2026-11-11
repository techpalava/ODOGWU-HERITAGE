import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/App.tsx", "utf8");
const start = source.indexOf("const handleExecuteDepositPayment");
const end = source.indexOf("const handleReorder");
assert.ok(start > 0 && end > start, "legacy checkout handler must still exist");
const handler = source.slice(start, end);

assert.equal(handler.includes("saveOrder"), false, "the handler must not write an order");
assert.equal(handler.includes("setOrders"), false, "the handler must not append an order");
assert.equal(handler.includes("isPaid"), false, "the handler must not record a payment flag");
assert.equal(handler.includes("Deposit authorized"), false);
assert.equal(handler.includes("setCartItems([])"), false, "the restored cart must stay");
assert.equal(handler.includes("setIsCartOpen(false)"), false);
assert.match(handler, /setIsCartOpen\(true\)/);
assert.match(handler, /setIsCheckoutPaymentOpen\(false\)/);
assert.match(
  handler,
  /This cart can no longer take a payment here\. Your items are still in the cart\. Continue in Design Studio, or contact us and we will help you place the order\./,
);
assert.match(source, /onClick=\{handleExecuteDepositPayment\}/);
assert.equal(source.includes("Deposit authorized securely"), false);

const rules = readFileSync("firestore.rules", "utf8");
const orders = rules.slice(rules.indexOf("match /orders/{orderId}"));
assert.match(
  orders,
  /allow create: if !isFutureOrderV2\(request\.resource\.data\) && isAdmin\(\);/,
);
assert.doesNotMatch(
  orders.slice(0, orders.indexOf("allow update:")),
  /ownsIncomingDocument\(\)/,
);

console.log("PASS: legacy checkout no longer writes an order or claims a payment");
