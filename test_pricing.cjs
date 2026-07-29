const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) =>
  fs.readFileSync(path.join(__dirname, file), "utf8");

const designStudio = read("src/components/DesignStudioView.tsx");
const databaseView = read("src/components/DatabaseView.tsx");
const dashboardView = read("src/components/DashboardView.tsx");
const app = read("src/App.tsx");
const types = read("src/types.ts");
const cartDrawer = read("src/components/CartDrawer.tsx");
const shippingEngine = read("src/utils/individualShipping.ts");

const forbiddenPricingTerms = [
  "getBaseSewingPrice",
  "baseSewingPrices",
  "baseRate",
  "tailoringFee:",
  "Base Sewing Price",
  "style.basePrice",
];

for (const term of forbiddenPricingTerms) {
  assert.equal(
    designStudio.includes(term),
    false,
    `Design Studio must not use legacy pricing term: ${term}`,
  );
}

assert.equal(
  databaseView.includes("Base Sewing Prices"),
  false,
  "Admin settings must not expose the legacy base-sewing price editor",
);
assert.equal(
  databaseView.includes("Base Price (€)"),
  false,
  "Garment Options must not expose a design-style base price",
);
assert.equal(
  dashboardView.includes("Base Sewing Price"),
  false,
  "Dashboard summaries must not display a base sewing price",
);
assert.equal(
  app.includes("Base Sewing Price"),
  false,
  "Checkout summaries must not display a base sewing price",
);
assert.equal(
  types.includes("tailoringFee"),
  false,
  "New garment records must not define a tailoring/base fee",
);
for (const source of [designStudio, cartDrawer, app]) {
  assert.equal(
    source.includes("€35.00"),
    false,
    "Active ordering and checkout views must not display the legacy €35 rate",
  );
}
for (const rate of ["131.25", "236.25", "425.25", "765.45"]) {
  assert.ok(
    shippingEngine.includes(rate),
    `Shipping engine must include the ${rate} EUR rate`,
  );
}

const subtotalMatch = designStudio.match(
  /const subtotal =\s*([\s\S]*?);\s*\n\s*return \{/,
);
assert.ok(subtotalMatch, "Could not locate the Design Studio subtotal formula");

const subtotalFormula = subtotalMatch[1];
for (const component of [
  "fabricPrice",
  "fabricSewingCost",
  "constructionSewingCost",
  "customDetailsPrice",
  "shippingCost",
]) {
  assert.ok(
    subtotalFormula.includes(component),
    `Subtotal must include ${component}`,
  );
}
assert.equal(
  /base|style/i.test(subtotalFormula),
  false,
  "Subtotal must not include any design-style or base-price component",
);

console.log("PASS: design-style base price is absent from active pricing");
console.log("PASS: admin, checkout, and dashboard base-price labels are removed");
console.log("PASS: subtotal contains only supported pricing determinants");
