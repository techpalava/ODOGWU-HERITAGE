import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import {
  applyLegacyStyleFabricCapacityConfig,
  getConfiguredStyleDefaultGarmentDetails,
  getStyleBaseFabricGarmentSelections,
} from "./src/config/StyleFabricCapacityConfig";
import type { BusinessSettings, DesignSelections, StyleCategory } from "./src/types";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  getConfirmedStyleIdAfterSelection,
  getPriceActivatedFabricCodeAfterSelection,
  isDesignStylePricingActive,
} from "./src/utils/designStylePricingActivation";

const pricingSettings = {
  pricingSettings: {
    depositPercentage: 50,
    balancePercentage: 50,
    currency: "EUR",
    vatTaxPercentage: 0,
    discountRulesEnabled: false,
    standardAccessoryCharge: 10,
  },
} as BusinessSettings;

const casualNative: StyleCategory = applyLegacyStyleFabricCapacityConfig({
  id: "casual-native-1",
  name: "Config-driven style name",
  description: "Uses the structured legacy composition, not its display name.",
  gender: "male",
  options: [],
  customDetailConfig: {
    representedGenders: ["male"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: ["shirt", "neck", "trousers"],
    requiredSelectionGroups: [],
    enabled: true,
  },
});

assert.deepEqual(
  getStyleBaseFabricGarmentSelections(casualNative).map(
    (selection) => selection.garmentSpec?.garmentType,
  ),
  ["shirt", "trouser"],
  "Casual Native pricing must resolve its configured Shirt + Trouser composition.",
);

const configuredSelections = getConfiguredStyleDefaultGarmentDetails(casualNative);
assert.ok(configuredSelections);

const getVisibleDesignPrice = (
  selectedStyleId: string | null,
  confirmedStyleId: string | null,
  selectedFabricCode: string | null,
  priceActivatedFabricCode: string | null,
  selections: DesignSelections = configuredSelections,
) => {
  if (
    !isDesignStylePricingActive(
      selectedStyleId,
      confirmedStyleId,
      selectedFabricCode,
      priceActivatedFabricCode,
    )
  ) {
    return 0;
  }
  return calculateDesignPricing({
    route: "alone",
    design: selections,
    style: casualNative,
    garment: { type: "Use Exact Design Style", code: "EXACT" },
    catalog: SEED_CUSTOM_DETAIL_CATALOG,
    businessSettings: pricingSettings,
    allowUnresolvedMaterialPricing: true,
  })?.clothingPrice ?? 0;
};

const primaryFabricCode = "ODG-001";

assert.equal(
  getVisibleDesignPrice(null, null, null, null),
  0,
  "No style must price at zero.",
);
assert.equal(
  getVisibleDesignPrice(casualNative.id, null, null, null),
  0,
  "A visually selected style must not be financially active before Proceed.",
);

const confirmedStyleId = casualNative.id;
assert.equal(
  getVisibleDesignPrice(casualNative.id, confirmedStyleId, null, null),
  0,
  "Proceeding with the style must not activate price before Fabric proceeds.",
);
assert.equal(
  getVisibleDesignPrice(
    casualNative.id,
    confirmedStyleId,
    primaryFabricCode,
    null,
  ),
  0,
  "Selecting a fabric must not activate price before Fabric proceeds.",
);
const priceActivatedFabricCode = primaryFabricCode;
assert.equal(
  getVisibleDesignPrice(
    casualNative.id,
    confirmedStyleId,
    primaryFabricCode,
    priceActivatedFabricCode,
  ),
  140,
  "Proceeding with Fabric must activate the catalog-derived Shirt + Trouser price (€65 + €75).",
);
assert.equal(
  getVisibleDesignPrice(
    casualNative.id,
    confirmedStyleId,
    primaryFabricCode,
    priceActivatedFabricCode,
    {
      customDetails: {
        ...configuredSelections.customDetails,
        trouser_fastening: "trouser_belt",
      },
    },
  ),
  145,
  "Confirmed styles must keep using centralized Custom Details pricing.",
);
assert.equal(
  getVisibleDesignPrice(null, null, null, null),
  0,
  "Clearing the design must return the visible design price to zero.",
);
assert.equal(
  getConfirmedStyleIdAfterSelection(confirmedStyleId, "replacement-style"),
  null,
  "Selecting a replacement card must remove its predecessor's confirmation.",
);
assert.equal(
  getPriceActivatedFabricCodeAfterSelection(
    priceActivatedFabricCode,
    "ODG-002",
  ),
  null,
  "Changing the primary fabric must remove the previous price activation.",
);
assert.equal(
  getVisibleDesignPrice("replacement-style", null, primaryFabricCode, null),
  0,
  "An unconfirmed replacement card must not inherit the prior design price.",
);

assert.equal(
  getVisibleDesignPrice(
    casualNative.id,
    confirmedStyleId,
    primaryFabricCode,
    priceActivatedFabricCode,
  ),
  140,
  "The price must remain active after progressing beyond Custom Details.",
);

console.log("PASS: design style pricing activates only after Fabric Proceed");
