import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CUSTOMER_WORKSHOP_DELIVERY_UNSCHEDULED,
  presentCustomerWorkshopProgress,
  workshopDeliveryDateInputValue,
} from "./src/utils/customerWorkshopProgress";

const saved = presentCustomerWorkshopProgress({
  shipment: {
    status: "Pattern Drafting & Sewing on Lagos floor",
    currentStage: 3,
    estimatedDeliveryDate: "2026-05-30",
  },
});
assert.equal(saved.statusLabel, "Pattern Drafting & Sewing on Lagos floor");
assert.equal(saved.stageLabel, "Stage 3 of 6");
assert.equal(saved.deliveryLabel, "30 May 2026");

const phrase = presentCustomerWorkshopProgress({
  shipment: { status: "Sewing", currentStage: 9, estimatedDeliveryDate: "May 30" },
});
assert.equal(phrase.stageLabel, "Stage 6 of 6");
assert.equal(phrase.deliveryLabel, "May 30");

const missing = presentCustomerWorkshopProgress({
  shipment: { estimatedDelivery: "June 2026" },
});
assert.equal(missing.statusLabel, "In production");
assert.equal(missing.stageLabel, "Stage 1 of 6");
assert.equal(missing.deliveryLabel, "June 2026");

const empty = presentCustomerWorkshopProgress({});
assert.equal(empty.deliveryLabel, CUSTOMER_WORKSHOP_DELIVERY_UNSCHEDULED);
assert.equal(workshopDeliveryDateInputValue("2026-05-30"), "2026-05-30");
assert.equal(workshopDeliveryDateInputValue("May 30"), "");

const dashboard = readFileSync("src/components/DashboardView.tsx", "utf8");
assert.ok(dashboard.includes("presentCustomerWorkshopProgress"));
assert.equal(dashboard.includes("estimatedDelivery || 'TBD'"), false);
assert.equal(dashboard.includes("order.style.name"), false);
assert.ok(dashboard.includes("order.style?.name"));

const admin = readFileSync("src/components/DatabaseView.tsx", "utf8");
assert.ok(admin.includes("estimatedDeliveryDate: e.target.value"));
assert.ok(admin.includes('estimatedDeliveryDate: ""'));
assert.equal(admin.includes('estimatedDeliveryDate: "May 30"'), false);

console.log("Customer workshop progress tests passed.");
