/**
 * Dry-run only. Lists how unpaid Individual home-delivery ledgers that still
 * store the retired €14 Lagos band would be repriced to ceil(n/10)×€131.25.
 *
 * This script does not connect to Firestore and must not be run against
 * production. Needs Xavier's OK before any live rewrite.
 */
import {
  INDIVIDUAL_SHIPPING_BLOCK_PRICE_CENTS,
  INDIVIDUAL_SHIPPING_GARMENTS_PER_BLOCK,
} from "../src/utils/shippingPricing";
import { individualLagosToEindhovenChargeCents } from "../src/utils/individualInboundShippingDisplay";

const OLD_BAND_CENTS = 1400;

const samples = [
  { label: "unpaid 1-garment Paris draft", garments: 1, storedLagosCents: OLD_BAND_CENTS, paid: false },
  { label: "unpaid 11-garment Paris cart item", garments: 11, storedLagosCents: OLD_BAND_CENTS, paid: false },
  { label: "paid 1-garment Paris order", garments: 1, storedLagosCents: OLD_BAND_CENTS, paid: true },
  { label: "unpaid Eindhoven pickup", garments: 1, storedLagosCents: null, paid: false },
] as const;

console.log("Individual Lagos → Eindhoven block migration dry-run");
console.log(
  `formula: ceil(garment rows / ${INDIVIDUAL_SHIPPING_GARMENTS_PER_BLOCK}) × €${(INDIVIDUAL_SHIPPING_BLOCK_PRICE_CENTS / 100).toFixed(2)}`,
);
console.log("garment count = candidate.garments.length (a set counts as 1)");
console.log("Unpaid Eindhoven pickup now carries the same Lagos charge.");
console.log("");

let unpaidWouldChange = 0;
let paidLeftAlone = 0;
for (const sample of samples) {
  const expected = individualLagosToEindhovenChargeCents({
    orderType: "Individual",
    physicalGarmentCount: sample.garments,
    fulfilmentMethod: sample.storedLagosCents === null ? "eindhoven_pickup" : "destination_delivery",
  });
  const wouldChange =
    !sample.paid &&
    expected !== null &&
    sample.storedLagosCents !== expected;
  if (sample.paid) paidLeftAlone += 1;
  if (wouldChange) unpaidWouldChange += 1;
  console.log(
    `${wouldChange ? "REWRITE" : "LEAVE  "} ${sample.label}: stored ${sample.storedLagosCents ?? "none"} → ${expected ?? "no Lagos charge"}`,
  );
}

console.log("");
console.log(`unpaid Individual delivery rows that would reprice: ${unpaidWouldChange}`);
console.log(`paid orders left byte-identical: ${paidLeftAlone}`);
console.log("not run against production; needs Xavier's OK");
