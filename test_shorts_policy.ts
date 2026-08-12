import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import {
  createStyleBaseGarmentSpec,
} from "./src/config/StyleFabricCapacityConfig";
import type {
  BusinessSettings,
  CartItem,
  CustomDetailDesignContext,
  FabricGarmentAssignment,
  StyleCategory,
} from "./src/types";
import {
  createAdditionalGarmentSelection,
  reconcileAdditionalGarmentDependencies,
  resolveAllowedAdditionalGarments,
} from "./src/utils/additionalGarmentDomain";
import {
  filterDesignSelectionsForActivePhysicalGarments,
  groupApplicableCustomDetails,
  normalizeCustomDetailCatalog,
} from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  cloneFabricAllocations,
  inspectCartItemFabricAllocations,
} from "./src/utils/fabricAllocationPersistence";

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

const makeStyle = (
  gender: StyleCategory["gender"],
  composition: Parameters<typeof createStyleBaseGarmentSpec>[0][],
  overrides: Partial<StyleCategory> = {},
): StyleCategory => ({
  id: `shorts-policy-${gender}-${composition.join("-")}`,
  name: "Shorts policy fixture",
  description: "Structured shorts policy fixture",
  gender,
  targetDemographic:
    gender === "male" || gender === "female" ? gender : "unisex",
  options: [],
  fabricCapacityComposition: composition.map(createStyleBaseGarmentSpec),
  ...overrides,
});

const garmentTypes = (
  design: CustomDetailDesignContext,
  composition: StyleCategory["fabricCapacityComposition"] = [],
) =>
  resolveAllowedAdditionalGarments(composition || [], design).map(
    (garment) => garment.garmentType,
  );

const maleShirt = makeStyle("male", ["shirt"]);
assert.deepEqual(garmentTypes(maleShirt, maleShirt.fabricCapacityComposition), [
  "shirt",
  "standard_shorts",
]);

const maleTrouser = makeStyle("male", ["shirt", "trouser"]);
assert.deepEqual(
  garmentTypes(maleTrouser, maleTrouser.fabricCapacityComposition),
  ["shirt", "trouser", "standard_shorts"],
  "Male lower-garment options must place Trouser before Nikka",
);

const femaleDress = makeStyle("female", ["dress"]);
assert.deepEqual(
  garmentTypes(femaleDress, femaleDress.fabricCapacityComposition),
  ["dress", "bum_shorts"],
  "Female dress designs offer Bum Shorts but not derived Nikka",
);

const femaleSkirt = makeStyle("female", ["dress", "skirt"]);
assert.deepEqual(
  garmentTypes(femaleSkirt, femaleSkirt.fabricCapacityComposition),
  ["dress", "skirt", "bum_shorts"],
  "Female lower-garment options place Skirt before Bum Shorts",
);

const femaleTrouser = makeStyle("female", ["dress", "trouser"]);
assert.deepEqual(
  garmentTypes(femaleTrouser, femaleTrouser.fabricCapacityComposition),
  ["dress", "bum_shorts", "trouser", "standard_shorts"],
  "Female Trouser design adds Bum Shorts and Nikka in policy order",
);

for (const gender of ["unisex", "family", "couple"] as const) {
  const style = makeStyle(gender, ["shirt", "skirt", "trouser"], {
    customDetailConfig: {
      representedGenders: ["male", "female"],
      featuresMaleAndFemale: true,
      supportedGarmentGroups: ["shirt", "skirt", "trousers"],
      requiredSelectionGroups: [],
      enabled: true,
    },
  });
  assert.deepEqual(
    garmentTypes(style, style.fabricCapacityComposition),
    ["shirt", "skirt", "bum_shorts", "trouser", "standard_shorts"],
    `${gender} designs must offer both shorts types in lower-garment order`,
  );
}

const explicitNikka = makeStyle("female", ["standard_shorts"]);
assert.equal(
  resolveAllowedAdditionalGarments(
    explicitNikka.fabricCapacityComposition || [],
    explicitNikka,
  ).find((garment) => garment.garmentType === "standard_shorts")
    ?.eligibilityRule,
  "same_type",
  "Explicit Nikka remains a base/same-type garment",
);
const explicitMaleBum = makeStyle("male", ["bum_shorts"]);
assert.equal(
  resolveAllowedAdditionalGarments(
    explicitMaleBum.fabricCapacityComposition || [],
    explicitMaleBum,
  ).find((garment) => garment.garmentType === "bum_shorts")?.eligibilityRule,
  "same_type",
  "Explicit male Bum Shorts remains a deliberate base garment",
);

const normalizedCatalog = normalizeCustomDetailCatalog(
  SEED_CUSTOM_DETAIL_CATALOG.map((option) =>
    option.id === "shorts_std_rope" || option.id === "bum_elastic"
      ? { ...option, priceCents: 999999 }
      : option,
  ),
);
assert.equal(
  normalizedCatalog.find((option) => option.id === "shorts_std_rope")
    ?.priceCents,
  7000,
  "Saved catalog data cannot override canonical Nikka Rope pricing",
);
assert.equal(
  normalizedCatalog.find((option) => option.id === "bum_elastic")?.priceCents,
  7500,
  "Saved catalog data cannot override canonical Bum Shorts Elastic pricing",
);
for (const optionId of [
  "shorts_std_pocket_regular",
  "shorts_std_pocket_back",
  "shorts_std_pocket_none",
  "bum_pocket_regular",
  "bum_pocket_back",
  "bum_pocket_none",
]) {
  assert.equal(
    normalizedCatalog.find((option) => option.id === optionId)?.priceCents,
    0,
    `${optionId} must remain a no-cost modifier`,
  );
}

const unisexContext: CustomDetailDesignContext = {
  kind: "uploaded",
  sourceKey: "uploaded:shorts-policy",
  displayLabel: "Uploaded shorts policy",
  demographic: "unisex",
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("skirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};
const lowerGroupOrder = groupApplicableCustomDetails(
  unisexContext,
  SEED_CUSTOM_DETAIL_CATALOG,
  null,
  {},
  ["bum_shorts", "standard_shorts"],
)
  .map((group) => group.id)
  .filter((group) =>
    [
      "skirt_length",
      "bum_shorts_fastening",
      "trouser_fastening",
      "standard_shorts_fastening",
    ].includes(group),
  );
assert.deepEqual(lowerGroupOrder, [
  "skirt_length",
  "bum_shorts_fastening",
  "trouser_fastening",
  "standard_shorts_fastening",
]);

const maleBeforeAddGroups = groupApplicableCustomDetails(
  maleShirt,
  SEED_CUSTOM_DETAIL_CATALOG,
  null,
  {},
).map((group) => group.id);
assert.equal(maleBeforeAddGroups.includes("standard_shorts_fastening"), false);
const maleAfterAddGroups = groupApplicableCustomDetails(
  maleShirt,
  SEED_CUSTOM_DETAIL_CATALOG,
  null,
  {},
  ["standard_shorts"],
).map((group) => group.id);
assert.equal(maleAfterAddGroups.includes("standard_shorts_fastening"), true);
assert.equal(maleAfterAddGroups.includes("standard_shorts_pockets"), true);

const makeAdditionalAssignment = (
  garmentType: "standard_shorts" | "bum_shorts",
  sequence: number,
): FabricGarmentAssignment => ({
  garmentKey: `additional:${garmentType}:${sequence}`,
  code: `ADDITIONAL_${garmentType.toUpperCase()}_${sequence}`,
  garmentType,
  fabricUnits: 1,
  garmentSpec: {
    key: `additional:${garmentType}:${sequence}`,
    garmentType,
    fabricUnits: 1,
  },
  sourceRole: "additional",
  eligibilityRule: "demographic_policy",
  dependencyStatus: "valid",
});

const priceAdditional = (
  design: StyleCategory,
  assignment: FabricGarmentAssignment | FabricGarmentAssignment[],
  customDetails: Record<string, string>,
) => {
  const pricing = calculateDesignPricing({
    route: "community",
    design: { customDetails },
    fabric: null,
    allowUnresolvedMaterialPricing: true,
    style: design,
    designContext: design,
    baseGarmentComposition: design.fabricCapacityComposition,
    additionalGarments: Array.isArray(assignment) ? assignment : [assignment],
    catalog: normalizedCatalog,
    businessSettings,
  });
  assert(pricing);
  assert.equal(pricing.additionalGarmentPricingStatus, "resolved");
  return pricing;
};

const nikka = makeAdditionalAssignment("standard_shorts", 1);
assert.equal(
  priceAdditional(maleShirt, nikka, {
    standard_shorts_fastening: "shorts_std_rope",
  }).additionalGarmentPriceRows[0]?.price,
  70,
);
assert.equal(
  priceAdditional(maleShirt, nikka, {
    standard_shorts_fastening: "shorts_std_elastic",
  }).additionalGarmentPriceRows[0]?.price,
  75,
);
assert.equal(
  priceAdditional(maleShirt, nikka, {
    standard_shorts_fastening: "shorts_std_belt",
  }).additionalGarmentPriceRows[0]?.price,
  75,
);

const bum = makeAdditionalAssignment("bum_shorts", 1);
assert.equal(
  priceAdditional(femaleDress, bum, {
    bum_shorts_fastening: "bum_rope",
  }).additionalGarmentPriceRows[0]?.price,
  70,
);
assert.equal(
  priceAdditional(femaleDress, bum, {
    bum_shorts_fastening: "bum_elastic",
  }).additionalGarmentPriceRows[0]?.price,
  75,
);
assert.equal(
  priceAdditional(femaleDress, bum, {
    bum_shorts_fastening: "bum_belt",
  }).additionalGarmentPriceRows[0]?.price,
  75,
);

const ropePricing = priceAdditional(maleShirt, nikka, {
  standard_shorts_fastening: "shorts_std_rope",
  standard_shorts_pockets: "shorts_std_pocket_regular",
});
const pricingAfterNikkaRemoval = calculateDesignPricing({
  route: "community",
  design: {
    customDetails: {
      standard_shorts_fastening: "shorts_std_rope",
      standard_shorts_pockets: "shorts_std_pocket_none",
    },
  },
  fabric: null,
  allowUnresolvedMaterialPricing: true,
  style: maleShirt,
  designContext: maleShirt,
  baseGarmentComposition: maleShirt.fabricCapacityComposition,
  additionalGarments: [],
  catalog: normalizedCatalog,
  businessSettings,
});
assert(pricingAfterNikkaRemoval);
assert.equal(
  ropePricing.clothingPrice - pricingAfterNikkaRemoval.clothingPrice,
  70,
  "Removing Nikka removes its full garment price",
);
const elasticPricing = priceAdditional(maleShirt, nikka, {
  standard_shorts_fastening: "shorts_std_elastic",
  standard_shorts_pockets: "shorts_std_pocket_back",
});
assert.equal(elasticPricing.clothingPrice - ropePricing.clothingPrice, 5);
assert.equal(
  priceAdditional(maleShirt, nikka, {
    standard_shorts_fastening: "shorts_std_rope",
    standard_shorts_pockets: "shorts_std_pocket_none",
  }).clothingPrice,
  ropePricing.clothingPrice,
  "Pocket changes must not change clothing price",
);

const twoNikka = [nikka, makeAdditionalAssignment("standard_shorts", 2)];
assert.equal(
  priceAdditional(maleShirt, twoNikka, {
    standard_shorts_fastening: "shorts_std_rope",
  }).additionalGarmentPriceRows.reduce((total, row) => total + row.price, 0),
  140,
);
const mixedShorts = priceAdditional(
  makeStyle("unisex", ["shirt"]),
  [nikka, bum],
  {
    standard_shorts_fastening: "shorts_std_rope",
    bum_shorts_fastening: "bum_elastic",
  },
);
assert.equal(
  mixedShorts.additionalGarmentPriceRows.reduce(
    (total, row) => total + row.price,
    0,
  ),
  145,
);

const selection = createAdditionalGarmentSelection({
  garmentType: "standard_shorts",
  mainComposition: maleShirt.fabricCapacityComposition || [],
  design: maleShirt,
  existingAssignments: [],
});
assert.equal(selection.status, "resolved");
if (selection.status !== "resolved") throw new Error("Expected derived Nikka");
assert.equal(selection.selection.eligibilityRule, "demographic_policy");
assert.equal(selection.selection.garmentSpec?.fabricUnits, 1);
assert.equal(selection.selection.mainGarmentType, undefined);

const state = {
  fabricAllocations: [
    {
      allocationId: "fabric-1",
      fabricCode: "FABRIC-A",
      garmentAssignments: [
        {
          garmentKey: selection.selection.garmentSpec!.key,
          code: selection.selection.code!,
          garmentType: "standard_shorts" as const,
          fabricUnits: 1 as const,
          garmentSpec: selection.selection.garmentSpec,
          sourceRole: "additional" as const,
          eligibilityRule: "demographic_policy" as const,
          dependencyStatus: "valid" as const,
        },
      ],
    },
  ],
  activeAllocationId: "fabric-1",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};
assert.equal(
  cloneFabricAllocations(state.fabricAllocations)?.[0]?.garmentAssignments[0]
    ?.eligibilityRule,
  "demographic_policy",
  "Typed derived eligibility survives allocation persistence",
);
assert.equal(
  inspectCartItemFabricAllocations({
    fabricAllocations: state.fabricAllocations,
  } as CartItem).status,
  "valid",
  "A typed demographic-policy assignment restores as valid cart data",
);
const untypedDerivedAllocation = cloneFabricAllocations(
  state.fabricAllocations,
) || [];
delete untypedDerivedAllocation[0]?.garmentAssignments[0]?.eligibilityRule;
assert.equal(
  inspectCartItemFabricAllocations({
    fabricAllocations: untypedDerivedAllocation,
  } as CartItem).status,
  "invalid",
  "A derived assignment without its typed policy marker is rejected",
);
assert.equal(
  reconcileAdditionalGarmentDependencies(
    state,
    maleShirt.fabricCapacityComposition || [],
    maleShirt,
  ).fabricAllocations[0]?.garmentAssignments[0]?.dependencyStatus,
  "valid",
);
assert.equal(
  reconcileAdditionalGarmentDependencies(
    state,
    femaleDress.fabricCapacityComposition || [],
    femaleDress,
  ).fabricAllocations[0]?.garmentAssignments[0]?.dependencyStatus,
  "orphaned",
  "A design change retains but flags an invalid derived Nikka",
);

const filteredAfterBumRemoval = filterDesignSelectionsForActivePhysicalGarments(
  {
    customDetails: {
      dress_construction: "dress_std_short",
      bum_shorts_fastening: "bum_elastic",
      bum_shorts_pockets: "bum_pocket_back",
    },
  },
  normalizedCatalog,
  ["dress"],
);
assert.deepEqual(filteredAfterBumRemoval.customDetails, {
  dress_construction: "dress_std_short",
});

console.log(
  "PASS: demographic shorts eligibility, ordering, canonical pricing, persistence, and stale-selection cleanup",
);
