import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type {
  BusinessSettings,
  Fabric,
  FabricAllocation,
  FabricCapacityGarmentSpec,
  StyleCategory,
} from "./src/types";
import {
  calculateDesignPricing,
  type AuthoritativeDesignPricing,
} from "./src/utils/designPricing";
import { resolveCustomerDesignPriceBreakdown } from "./src/utils/designPriceBreakdownPresentation";
import { resolveCustomerFabricAssignmentSummary } from "./src/utils/fabricAssignmentSummary";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { roundMoney } from "./src/utils/money";

const businessSettings = {
  pricingSettings: {
    depositPercentage: 50,
    balancePercentage: 50,
    currency: "EUR",
    vatTaxPercentage: 0,
    discountRulesEnabled: false,
    standardAccessoryCharge: 10,
  },
} as BusinessSettings;

const makeCatalogStyle = (
  composition: FabricCapacityGarmentSpec[],
): StyleCategory => ({
  id: "catalog-summary-parity",
  name: "Catalog Summary Parity",
  description: "Summary parity fixture.",
  gender: "unisex",
  options: [],
  fabricCapacityComposition: composition,
  customDetailConfig: {
    representedGenders: ["male", "female"],
    featuresMaleAndFemale: true,
    supportedGarmentGroups: ["shirt", "neck", "trousers", "skirt", "dress"],
    requiredSelectionGroups: [],
    enabled: true,
  },
});

const priceComposition = (
  composition: FabricCapacityGarmentSpec[],
  source: "catalog" | "uploaded",
): AuthoritativeDesignPricing => {
  const style = makeCatalogStyle(composition);
  const pricing = calculateDesignPricing({
    route: "community",
    design: { customDetails: {} },
    allowUnresolvedMaterialPricing: true,
    style: source === "catalog" ? style : null,
    designContext: source === "catalog"
      ? style
      : {
          kind: "uploaded",
          sourceKey: "uploaded-summary-parity",
          displayLabel: "Your Uploaded Design",
          demographic: "unisex",
          fabricCapacityComposition: composition,
        },
    baseGarmentComposition: composition,
    catalog: SEED_CUSTOM_DETAIL_CATALOG,
    businessSettings,
  });
  assert.ok(pricing, `${source} pricing should resolve without material pricing.`);
  return pricing;
};

const shirtTrouser = [
  createStyleBaseGarmentSpec("shirt"),
  createStyleBaseGarmentSpec("trouser"),
];
const catalogPricing = priceComposition(shirtTrouser, "catalog");
const uploadedPricing = priceComposition(shirtTrouser, "uploaded");

for (const [source, pricing] of [
  ["catalog", catalogPricing],
  ["uploaded", uploadedPricing],
] as const) {
  const presentation = resolveCustomerDesignPriceBreakdown(pricing);
  assert.equal(pricing.baseGarmentPricingStatus, "resolved");
  assert.deepEqual(
    presentation.baseGarmentRows.map((row) => row.garmentType),
    ["shirt", "trouser"],
    `${source} summaries keep the structured garment order.`,
  );
  assert.equal(
    new Set(presentation.baseGarmentRows.map((row) => row.garmentKey)).size,
    presentation.baseGarmentRows.length,
    `${source} summary rows retain a unique physical-garment identity.`,
  );
  assert.equal(
    roundMoney(presentation.baseGarmentRows.reduce((sum, row) => sum + row.price, 0)),
    pricing.clothingPrice,
    `${source} garment rows reconcile to the authoritative clothing price.`,
  );
  assert.equal(
    pricing.garmentSubtotal,
    pricing.clothingPrice,
    `${source} explanatory rows do not alter the authoritative subtotal.`,
  );
  assert.equal(
    roundMoney(pricing.garmentSubtotal * 0.5),
    roundMoney(pricing.clothingPrice * 0.5),
    `${source} deposit allocation remains unchanged by summary rows.`,
  );
}

assert.deepEqual(
  catalogPricing.baseGarmentPriceRows,
  uploadedPricing.baseGarmentPriceRows,
  "Catalog and uploaded sources render the same per-garment price breakdown.",
);

const kaftanPricing = priceComposition(
  [createStyleBaseGarmentSpec("kaftan")],
  "uploaded",
);
assert.equal(kaftanPricing.baseGarmentPriceRows.length, 1);
assert.equal(kaftanPricing.baseGarmentPriceRows[0].garmentType, "kaftan");

const gownPricing = priceComposition(
  [createStyleBaseGarmentSpec("full_length_gown")],
  "uploaded",
);
assert.equal(gownPricing.baseGarmentPriceRows.length, 1);
assert.equal(gownPricing.baseGarmentPriceRows[0].garmentType, "full_length_gown");

const shirtTrouserSkirt = [
  ...shirtTrouser,
  createStyleBaseGarmentSpec("skirt"),
];
const threeGarmentPricing = priceComposition(shirtTrouserSkirt, "uploaded");
assert.deepEqual(
  threeGarmentPricing.baseGarmentPriceRows.map((row) => row.garmentType),
  ["shirt", "trouser", "skirt"],
  "A three-garment uploaded design retains one authoritative price row per garment.",
);

const makeFabric = (code: string, name: string): Fabric => ({
  code,
  name,
  description: "Summary parity fabric.",
  color: "Green",
  colorHex: "#006b54",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
});
const hiTarget = makeFabric("HI-TARGET", "HiTarget Ankara");
const lace = makeFabric("LACE", "Lace");
const twoAllocationAssignments = (secondFabricCode: string): FabricAllocation[] => [
  {
    allocationId: "allocation-1",
    fabricCode: hiTarget.code,
    garmentAssignments: [
      { garmentKey: "shirt", code: "shirt", garmentType: "shirt", fabricUnits: 1 },
      { garmentKey: "trouser", code: "trouser", garmentType: "trouser", fabricUnits: 1 },
    ],
  },
  {
    allocationId: "allocation-2",
    fabricCode: secondFabricCode,
    garmentAssignments: [
      { garmentKey: "skirt", code: "skirt", garmentType: "skirt", fabricUnits: 1 },
    ],
  },
];
for (const [label, allocations, fabrics] of [
  ["same fabric", twoAllocationAssignments(hiTarget.code), [hiTarget]],
  ["different fabrics", twoAllocationAssignments(lace.code), [hiTarget, lace]],
] as const) {
  const materialPricing = resolveFabricAllocationMaterialPricing(allocations, [...fabrics]);
  assert.equal(materialPricing.status, "resolved");
  const summary = resolveCustomerFabricAssignmentSummary({
    fabricAllocations: allocations,
    fabrics: [...fabrics],
  });
  assert.equal(summary.garmentRows.length, 3, `${label} preserves F3 garment-to-fabric mappings.`);
  assert.equal(summary.fabricQuantityRows.length, fabrics.length, `${label} preserves fabric identities.`);
  assert.deepEqual(
    threeGarmentPricing.baseGarmentPriceRows.map((row) => row.garmentKey),
    shirtTrouserSkirt.map((spec) => spec.key),
    `${label} allocations do not duplicate design garment price rows.`,
  );
}

const unresolvedPricing = priceComposition(
  [createStyleBaseGarmentSpec("other")],
  "uploaded",
);
assert.equal(unresolvedPricing.baseGarmentPricingStatus, "unresolved");
assert.deepEqual(
  resolveCustomerDesignPriceBreakdown(unresolvedPricing).baseGarmentRows,
  [],
  "Unresolved uploaded garments show no misleading summary rows.",
);

const studioSource = readFileSync(
  fileURLToPath(new URL("./src/components/DesignStudioView.tsx", import.meta.url)),
  "utf8",
);
assert.match(
  studioSource,
  /baseGarmentComposition:\s*futureFabricComposition/,
  "The Design Studio passes the same active composition to both catalog and uploaded pricing.",
);
assert.match(
  studioSource,
  /const futureSummaryInput = \{[\s\S]*?basePricing:\s*futureFabricAuthoritativePricing/,
  "The future summary consumes the authoritative pricing engine result without recomputing row totals.",
);
assert.match(
  studioSource,
  /projectFutureDesignStudioSummary\(futureSummaryInput\)/,
  "The future summary projector receives the shared authoritative input.",
);
const customDetailsSource = readFileSync(
  fileURLToPath(
    new URL("./src/components/DormantFutureCustomDetailsStep.tsx", import.meta.url),
  ),
  "utf8",
);
assert.doesNotMatch(
  customDetailsSource,
  /Fabric Selection \d|Fabric Price:|Fabric Sewing Cost:/,
  "The customer price summary does not restore raw internal fabric-cost rows.",
);

console.log("PASS: design source summary parity verified.");
