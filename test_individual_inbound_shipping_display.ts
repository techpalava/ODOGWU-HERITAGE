import assert from "node:assert/strict";
import {
  INDIVIDUAL_INBOUND_SHIPPING_DISPLAY_LABEL,
  INDIVIDUAL_INBOUND_SHIPPING_INCLUDED_LABEL,
  individualLagosToEindhovenChargeCents,
  resolveIndividualInboundShippingDisplay,
} from "./src/utils/individualInboundShippingDisplay";
import { calculateIndividualShipping } from "./src/utils/shippingPricing";

const bands = [
  [1, 14, "0 - 2 kg"],
  [5, 35, ">2 - 5 kg"],
  [13, 70, ">5 - 10 kg"],
  [25, 140, ">10 - 20 kg"],
  [49, 210, ">20 kg"],
] as const;

for (const [pieceCount, priceEur, weightBand] of bands) {
  const display = resolveIndividualInboundShippingDisplay({
    orderType: "Individual",
    physicalGarmentCount: pieceCount,
  });
  assert.ok(display, `Individual ${pieceCount} pieces has a display quote`);
  assert.equal(display.label, INDIVIDUAL_INBOUND_SHIPPING_DISPLAY_LABEL);
  assert.equal(display.includedLabel, INDIVIDUAL_INBOUND_SHIPPING_INCLUDED_LABEL);
  assert.equal(display.priceEur, priceEur);
  assert.equal(display.amountCents, priceEur * 100);
  assert.equal(display.weightBand, weightBand);
  assert.equal(display.physicalGarmentCount, pieceCount);
  assert.equal(display.priceEur, calculateIndividualShipping(pieceCount).priceEur);
  assert.equal(
    individualLagosToEindhovenChargeCents({
      orderType: "Individual",
      physicalGarmentCount: pieceCount,
    }),
    priceEur * 100,
  );
  assert.equal(
    resolveIndividualInboundShippingDisplay({
      batchType: "alone",
      physicalGarmentCount: pieceCount,
    })?.priceEur,
    priceEur,
  );
}

for (const orderType of ["Community", "Group Organizer", "Group Member"]) {
  assert.equal(
    resolveIndividualInboundShippingDisplay({
      orderType,
      physicalGarmentCount: 13,
    }),
    null,
    `${orderType} does not display the individual band`,
  );
  assert.equal(
    individualLagosToEindhovenChargeCents({
      orderType,
      physicalGarmentCount: 13,
    }),
    null,
  );
}

for (const batchType of ["community", "personalized", "actual"]) {
  assert.equal(
    resolveIndividualInboundShippingDisplay({
      batchType,
      physicalGarmentCount: 1,
    }),
    null,
    `${batchType} does not display the individual band`,
  );
}

assert.equal(
  resolveIndividualInboundShippingDisplay({
    orderType: "Community",
    batchType: "alone",
    physicalGarmentCount: 1,
  }),
  null,
  "a community order type stays clear of the individual band",
);
assert.equal(
  resolveIndividualInboundShippingDisplay({ physicalGarmentCount: 1 }),
  null,
);
assert.equal(
  resolveIndividualInboundShippingDisplay({
    orderType: "Individual",
    physicalGarmentCount: 0,
  }),
  null,
);

console.log("test_individual_inbound_shipping_display.ts: all assertions passed");
