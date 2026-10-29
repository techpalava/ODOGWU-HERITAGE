import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DormantFutureShippingStep } from "./src/components/DormantFutureShippingStep";
import type { FutureShippingStateV1 } from "./src/types";
import {
  STEP8_OVER_20_KG_QUOTE_MESSAGE,
  STEP8_WEIGHT_BAND_PHRASES,
  STEP8_WEIGHT_TIER_LABELS,
} from "./src/config/Step8AdditionalDeliveryConfig";
import {
  formatStep8ShipmentWeightBreakdown,
  formatStep8WeightBandPhrase,
} from "./src/utils/step8AdditionalDelivery";
import {
  createEmptyFutureShippingState,
  reconcileFutureShippingState,
} from "./src/utils/designStudioFutureShipping";

// Helpers: one source for band wording; the internal tier labels are unchanged.
assert.deepEqual({ ...STEP8_WEIGHT_BAND_PHRASES }, {
  "0_2": "up to 2 kg",
  "2_5": "2–5 kg",
  "5_10": "5–10 kg",
  "10_20": "10–20 kg",
});
assert.deepEqual({ ...STEP8_WEIGHT_TIER_LABELS }, {
  "0_2": "0–2 kg",
  "2_5": ">2–5 kg",
  "5_10": ">5–10 kg",
  "10_20": ">10–20 kg",
  over_20: ">20 kg",
});
assert.equal(formatStep8WeightBandPhrase("0_2"), "up to 2 kg");
assert.equal(formatStep8WeightBandPhrase("over_20"), null);
assert.equal(formatStep8WeightBandPhrase(null), null);
assert.equal(formatStep8ShipmentWeightBreakdown(1, 0.5), "1 garment × 0.5 kg");
assert.equal(formatStep8ShipmentWeightBreakdown(2, 1), "2 garments × 0.5 kg");
assert.equal(formatStep8ShipmentWeightBreakdown(0, null), null);
assert.equal(formatStep8ShipmentWeightBreakdown(2, 3), null, "count must explain the weight");
assert.equal(STEP8_OVER_20_KG_QUOTE_MESSAGE, "Over 20 kg — we'll send you a custom shipping quote.");

const deliveryState = (
  countryCode: string,
  city: string,
  stateRegion: string,
  postalCode: string,
): FutureShippingStateV1 => {
  const empty = createEmptyFutureShippingState();
  return {
    ...empty,
    fulfilmentMethod: "destination_delivery",
    customerInformation: {
      ...empty.customerInformation,
      fullName: "Ada Okafor",
      phone: "+31 6 1234 5678",
      email: "ada@example.com",
      deliveryAddress: { addressLine1: "1 Heritage Way", addressLine2: "", city, stateRegion, postalCode, countryCode },
    },
  };
};
const NL = deliveryState("NL", "Amsterdam", "Noord-Holland", "1011 AB");
const US = deliveryState("US", "Houston", "Texas", "77002");

const render = (
  state: FutureShippingStateV1,
  garmentCount: number,
  orderType: string | null = null,
) => {
  const resolution = reconcileFutureShippingState({ state, garmentCount, selectedDesignPrice: 500 });
  const markup = renderToStaticMarkup(
    createElement(DormantFutureShippingStep, {
      state: resolution.state,
      resolution,
      selectedDesignPrice: 500,
      garmentCount,
      onChange: () => undefined,
      onRefreshQuote: () => undefined,
      onBack: () => undefined,
      canContinueToReview: true,
      onContinueToReview: () => undefined,
      orderType,
    }),
  );
  const summary = markup.slice(markup.indexOf('data-delivery-summary="true"'));
  const card = summary.slice(0, summary.indexOf("</section>"));
  assert.ok(card.length > 0, "Delivery Summary renders");
  const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
  const between = (attr: string) => {
    const at = card.indexOf(attr);
    assert.ok(at >= 0, attr);
    const rest = card.slice(at);
    return text(rest.slice(rest.indexOf(">") + 1, rest.indexOf("</dd>")));
  };
  return {
    resolution,
    card,
    weight: card.includes("data-delivery-shipment-weight")
      ? text(card.slice(card.indexOf("data-delivery-shipment-weight")).split("</dd>")[0]).replace(/^[^>]*>/, "")
      : "",
    shipping: card.includes('data-delivery-shipping-line="true"')
      ? between('data-delivery-shipping-line="true"')
      : "",
    markup,
  };
};

const commonChecks = (card: string) => {
  assert.doesNotMatch(card, /Weight Tier/);
  assert.doesNotMatch(card, /Typical 2–5 kg rate/);
  assert.doesNotMatch(card, /headline only/);
  assert.doesNotMatch(card, /Physical garments in this order/);
  assert.doesNotMatch(card, /&gt;\d/, "no >2–5 style ranges");
};

// 1 garment, Netherlands: 0.5 kg, singular noun, up to 2 kg band.
{
  const r = render(NL, 1);
  assert.equal(r.resolution.weightTier, "0_2");
  commonChecks(r.card);
  assert.equal(r.weight, "Shipment Weight0.5 kg (1 garment × 0.5 kg)");
  assert.equal(r.shipping, "€7.50 — Netherlands rate for parcels up to 2 kg");
}

// 2 garments, Netherlands.
{
  const r = render(NL, 2);
  commonChecks(r.card);
  assert.equal(r.weight, "Shipment Weight1.0 kg (2 garments × 0.5 kg)");
  assert.equal(r.shipping, "€7.50 — Netherlands rate for parcels up to 2 kg");
  // Desktop separator only; on phones the explanation sits on its own line.
  assert.match(r.card, /<span aria-hidden="true" class="hidden text-heritage-ink\/70 sm:inline"> — <\/span>/);
  assert.match(r.card, /<span class="block text-sm text-heritage-ink\/70 sm:inline">Netherlands rate for parcels <span class="whitespace-nowrap">up to 2 kg<\/span><\/span>/);
  assert.match(r.card, /<span class="whitespace-nowrap font-normal text-heritage-ink\/70"> \(2 garments × 0\.5 kg\)<\/span>/);
}

// 8 garments, North America: 4.0 kg, 2–5 kg band, rate from the table.
{
  const r = render(US, 8);
  assert.equal(r.resolution.weightTier, "2_5");
  assert.equal(r.resolution.postEindhovenAdjustmentCents, 6080);
  commonChecks(r.card);
  assert.equal(r.weight, "Shipment Weight4.0 kg (8 garments × 0.5 kg)");
  assert.equal(r.shipping, "€60.80 — North America rate for parcels 2–5 kg");
  assert.match(r.card, /<span class="whitespace-nowrap">2–5 kg<\/span>/);
}

// 42 garments: over 20 kg needs a custom quote.
{
  const r = render(NL, 42);
  assert.equal(r.resolution.weightTier, "over_20");
  assert.equal(r.resolution.quoteRequired, true);
  commonChecks(r.card);
  assert.equal(r.weight, "Shipment Weight21.0 kg (42 garments × 0.5 kg)");
  assert.equal(r.shipping, STEP8_OVER_20_KG_QUOTE_MESSAGE);
  assert.doesNotMatch(r.card, /Custom shipping quote required/);
}

// Pending: no garment count yet, so no weight, band or rate line.
{
  const r = render(NL, 0);
  assert.equal(r.resolution.parcelWeightKg, null);
  commonChecks(r.card);
  assert.equal(r.weight, "Shipment WeightPending");
  assert.equal(r.shipping, "Pending");
  assert.doesNotMatch(r.card, /rate for parcels/);
}

// A quote-only country (Australia) keeps the existing custom-quote wording:
// it is not an over-20 kg case, so it must not say "Over 20 kg".
{
  const r = render(deliveryState("AU", "Sydney", "New South Wales", "2000"), 2);
  assert.equal(r.resolution.quoteRequired, true);
  assert.notEqual(r.resolution.weightTier, "over_20");
  commonChecks(r.card);
  assert.equal(r.shipping, "Custom shipping quote required");
  assert.doesNotMatch(r.card, /Over 20 kg/);
  assert.equal(r.weight, "Shipment Weight1.0 kg (2 garments × 0.5 kg)");
}

// Individual home delivery (Lagos → Eindhoven, then Eindhoven → address).
// The Lagos leg is priced per 10 garments (ceil(garments/10) × €131.25), not by
// weight band, so it must stay in Cost Breakdown and never be described by the
// "<Region> rate for parcels <band>" line. That line explains only the
// Eindhoven → address final-mile fee, which is still a weight-band rate.
const lagosInbound = (markup: string) => {
  const at = markup.indexOf('data-shipping-lagos-inbound="true"');
  if (at < 0) return null;
  const amount = /data-amount-cents="(\d+)"/.exec(markup.slice(at));
  return amount ? Number(amount[1]) : null;
};
{
  const r = render(NL, 2, "Individual");
  commonChecks(r.card);
  assert.equal(r.weight, "Shipment Weight1.0 kg (2 garments × 0.5 kg)");
  assert.equal(r.shipping, "€7.50 — Netherlands rate for parcels up to 2 kg");
  assert.equal(r.resolution.postEindhovenAdjustmentCents, 750);
  assert.doesNotMatch(r.card, /Lagos|131\.25|per 10 garments/, "Lagos leg is not in the Delivery Summary");
  assert.equal(lagosInbound(r.markup), 13125, "Lagos leg is one €131.25 block in Cost Breakdown");
}
{
  // 12 garments: two Lagos blocks (€262.50); final mile is the NL 5–10 kg band.
  const r = render(NL, 12, "Individual");
  assert.equal(r.resolution.weightTier, "5_10");
  commonChecks(r.card);
  assert.equal(r.weight, "Shipment Weight6.0 kg (12 garments × 0.5 kg)");
  assert.match(r.shipping, /^€\d+\.\d{2} — Netherlands rate for parcels 5–10 kg$/);
  assert.doesNotMatch(r.card, /Lagos|131\.25|262\.50/);
  assert.equal(lagosInbound(r.markup), 26250);
}
{
  // Over 20 kg on Individual delivery: final mile needs a quote; Lagos stays per block.
  const r = render(NL, 42, "Individual");
  assert.equal(r.shipping, STEP8_OVER_20_KG_QUOTE_MESSAGE);
  assert.doesNotMatch(r.card, /rate for parcels|Lagos/);
  assert.equal(lagosInbound(r.markup), 5 * 13125);
}

// Individual Eindhoven pickup keeps the Lagos charge, but the Delivery Summary
// shows no shipment weight or shipping rate line at all.
{
  const empty = createEmptyFutureShippingState();
  const pickup: FutureShippingStateV1 = {
    ...empty,
    fulfilmentMethod: "eindhoven_pickup",
    customerInformation: {
      ...empty.customerInformation,
      fullName: "Ada Okafor",
      phone: "+31 6 1234 5678",
      email: "ada@example.com",
    },
  };
  const r = render(pickup, 2, "Individual");
  commonChecks(r.card);
  assert.match(r.card, /Pick Up in Eindhoven/);
  assert.equal(r.weight, "");
  assert.equal(r.shipping, "");
  assert.doesNotMatch(r.card, /Shipment Weight|rate for parcels|Over 20 kg|Lagos/);
  assert.equal(lagosInbound(r.markup), 13125, "pickup keeps the Lagos → Eindhoven charge");
}

// The component no longer hard-codes tier labels.
const source = readFileSync("src/components/DormantFutureShippingStep.tsx", "utf8");
assert.doesNotMatch(source, /"&gt;2–5 kg"|">2–5 kg"|"0–2 kg"/);
assert.match(source, /formatStep8WeightBandPhrase\(resolution\.weightTier\)/);

console.log("test_delivery_summary_weight_wording.tsx: all assertions passed");
