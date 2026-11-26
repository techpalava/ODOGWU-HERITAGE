import assert from "node:assert/strict";
import {
  formatIndividualShippingNote,
  INDIVIDUAL_INBOUND_SHIPPING_DISPLAY_LABEL,
  INDIVIDUAL_INBOUND_SHIPPING_INCLUDED_LABEL,
  individualLagosToEindhovenChargeCents,
  resolveIndividualInboundShippingDisplay,
} from "./src/utils/individualInboundShippingDisplay";
import { calculateIndividualShipping } from "./src/utils/shippingPricing";

const bands = [
  [1, 131.25, ">2 - 5 kg"],
  [5, 131.25, ">2 - 5 kg"],
  [13, 262.5, ">5 - 10 kg"],
  [25, 393.75, ">10 - 20 kg"],
  [49, 656.25, ">20 kg"],
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
    `${orderType} with 13 garments does not display the individual band`,
  );
  assert.equal(
    individualLagosToEindhovenChargeCents({
      orderType,
      physicalGarmentCount: 13,
    }),
    null,
  );
}

for (const batchType of ["community", "actual"]) {
  assert.equal(
    resolveIndividualInboundShippingDisplay({
      batchType,
      physicalGarmentCount: 1,
    }),
    null,
    `${batchType} does not display the individual band`,
  );
}

for (const count of [1, 3, 9]) {
  for (const input of [
    { orderType: "Group Organizer", physicalGarmentCount: count },
    { orderType: "Group Member", physicalGarmentCount: count },
    { batchType: "personalized", physicalGarmentCount: count },
  ]) {
    const display = resolveIndividualInboundShippingDisplay(input);
    assert.ok(display, `Private Batch with ${count} garments charges €131.25`);
    assert.equal(display.amountCents, 13125);
    assert.equal(display.priceEur, 131.25);
    assert.equal(display.blockCount, 1);
    assert.equal(display.reason, "private_batch_below_minimum");
    assert.equal(
      formatIndividualShippingNote(display),
      "Private Batch orders require at least 10 garments to waive the €131.25 Lagos → Eindhoven shipping fee. Add more garments to reach 10, or continue with €131.25 shipping included.",
    );
    assert.equal(individualLagosToEindhovenChargeCents(input), 13125);
  }
}

for (const count of [10, 12]) {
  for (const input of [
    { orderType: "Group Organizer", physicalGarmentCount: count },
    { orderType: "Group Member", physicalGarmentCount: count },
    { batchType: "personalized", physicalGarmentCount: count },
  ]) {
    assert.equal(
      resolveIndividualInboundShippingDisplay(input),
      null,
      `Private Batch with ${count} garments waives the Lagos shipping fee`,
    );
    assert.equal(individualLagosToEindhovenChargeCents(input), null);
  }
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
assert.equal(
  resolveIndividualInboundShippingDisplay({
    orderType: "Individual",
    physicalGarmentCount: 1,
    fulfilmentMethod: "eindhoven_pickup",
  })?.amountCents,
  13125,
  "Eindhoven pickup keeps the Lagos shipping charge",
);
assert.equal(
  individualLagosToEindhovenChargeCents({
    orderType: "Individual",
    physicalGarmentCount: 1,
    fulfilmentMethod: "eindhoven_pickup",
  }),
  13125,
);
assert.equal(
  individualLagosToEindhovenChargeCents({
    orderType: "Individual",
    physicalGarmentCount: 1,
    fulfilmentMethod: "destination_delivery",
  }),
  13125,
  "address delivery uses the €131.25 block",
);

const baselineNote =
  "Shipping covers up to 10 garments (under 5 kg).";
const fourteenNote =
  "Shipping covers up to 10 garments (under 5 kg). Your order has 14 garments, so it uses the 10 kg range: 2 × €131.25.";
assert.equal(
  formatIndividualShippingNote(
    resolveIndividualInboundShippingDisplay({
      orderType: "Individual",
      physicalGarmentCount: 1,
      fulfilmentMethod: "destination_delivery",
    })!,
  ),
  baselineNote,
);
assert.equal(
  formatIndividualShippingNote(
    resolveIndividualInboundShippingDisplay({
      orderType: "Individual",
      physicalGarmentCount: 14,
      fulfilmentMethod: "destination_delivery",
    })!,
  ),
  fourteenNote,
);
assert.equal(
  resolveIndividualInboundShippingDisplay({
    orderType: "Individual",
    physicalGarmentCount: 14,
    fulfilmentMethod: "eindhoven_pickup",
  })?.amountCents,
  26250,
  "14-garment pickup uses the same 2-block Lagos charge as delivery",
);
assert.equal(
  resolveIndividualInboundShippingDisplay({
    orderType: "Community",
    physicalGarmentCount: 14,
    fulfilmentMethod: "destination_delivery",
  }),
  null,
);

console.log("test_individual_inbound_shipping_display.ts: all assertions passed");
