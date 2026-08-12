import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import {
  createStyleBaseGarmentSpec,
  getFabricGarmentSelectionsForComposition,
} from "./src/config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { BusinessSettings, FabricAllocationState, StyleCategory } from "./src/types";
import {
  createAdditionalGarmentSelection,
  getAllowedAdditionalGarmentLabels,
  reconcileAdditionalGarmentDependencies,
  resolveAllowedAdditionalGarments,
} from "./src/utils/additionalGarmentDomain";
import { calculateDesignPricing } from "./src/utils/designPricing";
import { resolveCustomerFabricAssignmentSummary } from "./src/utils/fabricAssignmentSummary";
import { cloneFabricAllocations } from "./src/utils/fabricAllocationPersistence";

const mainComposition = [
  createStyleBaseGarmentSpec("shirt"),
  createStyleBaseGarmentSpec("trouser"),
] as const;
const alternateComposition = [createStyleBaseGarmentSpec("trouser")] as const;
const fabricCode = "ODG-PRIMARY";
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
const style: StyleCategory = {
  id: "additional-domain-test",
  name: "Shirt and Trouser",
  description: "Structured test composition",
  gender: "male",
  options: [],
  fabricCapacityComposition: [...mainComposition],
};

const initializeMainState = (): FabricAllocationState =>
  FabricAllocationStateEngine.syncPrimaryGarmentComposition(
    FabricAllocationStateEngine.initialize(),
    fabricCode,
    getFabricGarmentSelectionsForComposition(mainComposition),
  );

assert.deepEqual(
  resolveAllowedAdditionalGarments(mainComposition).map(
    (garment) => garment.garmentType,
  ),
  ["shirt", "trouser"],
  "Additional choices must derive from canonical main composition only",
);
assert.deepEqual(
  resolveAllowedAdditionalGarments([createStyleBaseGarmentSpec("shirt")]).map(
    (garment) => garment.garmentType,
  ),
  ["shirt"],
  "A shirt-only main composition permits only another shirt",
);
assert.deepEqual(
  resolveAllowedAdditionalGarments([
    ...mainComposition,
    createStyleBaseGarmentSpec("skirt"),
  ]).map((garment) => garment.garmentType),
  ["shirt", "trouser", "skirt"],
  "Main composition extensions are the only source of extra-garment eligibility",
);
assert.deepEqual(
  getAllowedAdditionalGarmentLabels(mainComposition),
  ["Shirt", "Trouser"],
  "C2 receives customer-facing labels from the canonical resolver",
);
assert.deepEqual(
  resolveAllowedAdditionalGarments([...mainComposition]).map(
    (garment) => garment.garmentType,
  ),
  ["shirt", "trouser"],
  "Catalog and uploaded compositions use the same canonical resolver",
);

let state = initializeMainState();
const firstAdditionalShirt = createAdditionalGarmentSelection({
  garmentType: "shirt",
  mainComposition,
  existingAssignments: state.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
});
assert.equal(firstAdditionalShirt.status, "resolved");
if (firstAdditionalShirt.status !== "resolved") throw new Error("Expected shirt");
assert.equal(firstAdditionalShirt.selection.garmentSpec?.key, "additional:shirt:1");
assert.equal(firstAdditionalShirt.selection.sourceRole, "additional");
assert.equal(firstAdditionalShirt.selection.mainGarmentType, "shirt");

const invalidSkirt = createAdditionalGarmentSelection({
  garmentType: "skirt",
  mainComposition,
  existingAssignments: [],
});
assert.equal(invalidSkirt.status, "invalid");
assert.equal(
  createAdditionalGarmentSelection({
    garmentType: "kaftan",
    mainComposition,
    existingAssignments: [],
  }).status,
  "invalid",
  "Kaftan cannot be added when it is absent from the main composition",
);
assert.equal(
  createAdditionalGarmentSelection({
    garmentType: "full_length_gown",
    mainComposition,
    existingAssignments: [],
  }).status,
  "invalid",
  "A gown cannot be added when it is absent from the main composition",
);

state = FabricAllocationStateEngine.attemptAppendGarment(
  state,
  firstAdditionalShirt.selection,
);
assert.equal(state.pendingFabricGarment?.garmentKey, "additional:shirt:1");
state = FabricAllocationStateEngine.useSameFabricForPendingGarment(state);
assert.equal(state.fabricAllocations.length, 2, "F1 overflow opens allocation 2");
assert.equal(state.fabricAllocations[1]?.fabricCode, fabricCode);

const firstExtraState = state;
const additionalTrouser = createAdditionalGarmentSelection({
  garmentType: "trouser",
  mainComposition,
  existingAssignments: firstExtraState.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
});
assert.equal(additionalTrouser.status, "resolved");
if (additionalTrouser.status !== "resolved") throw new Error("Expected trouser");
const mixedExtraState = FabricAllocationStateEngine.attemptAppendGarment(
  firstExtraState,
  additionalTrouser.selection,
);
assert.equal(mixedExtraState.pendingFabricGarment, null);
assert.deepEqual(
  mixedExtraState.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .filter((assignment) => assignment.sourceRole === "additional")
    .map((assignment) => assignment.mainGarmentType),
  ["shirt", "trouser"],
  "Different eligible additional types coexist as distinct physical records",
);

const secondAdditionalShirt = createAdditionalGarmentSelection({
  garmentType: "shirt",
  mainComposition,
  existingAssignments: state.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
});
assert.equal(secondAdditionalShirt.status, "resolved");
if (secondAdditionalShirt.status !== "resolved") throw new Error("Expected second shirt");
assert.equal(secondAdditionalShirt.selection.garmentSpec?.key, "additional:shirt:2");
state = FabricAllocationStateEngine.attemptAppendGarment(
  state,
  secondAdditionalShirt.selection,
);
assert.equal(state.pendingFabricGarment, null, "F2 assigns a second same-type record");
assert.equal(
  state.fabricAllocations.flatMap((allocation) => allocation.garmentAssignments)
    .filter((assignment) => assignment.sourceRole === "additional").length,
  2,
  "Additional records retain distinct physical identities",
);

const summary = resolveCustomerFabricAssignmentSummary({
  fabricAllocations: state.fabricAllocations,
  fabrics: [
    {
      code: fabricCode,
      name: "Test Ankara",
      category: "HiTarget Ankara",
      description: "Test",
      color: "Blue",
      colorHex: "#0000ff",
      priceMultiplier: 1,
      stockStatus: "IN_STOCK",
    },
  ],
  unassignedGarments: [],
});
assert.equal(summary.garmentRows.filter((row) => row.isAssigned).length, 4, "F3 summary keeps each physical garment");

const cloned = cloneFabricAllocations(state.fabricAllocations);
assert.equal(
  cloned?.flatMap((allocation) => allocation.garmentAssignments)
    .filter((assignment) => assignment.sourceRole === "additional").length,
  2,
  "Draft persistence preserves typed additional assignments",
);

const pricingWithAdditional = calculateDesignPricing({
  route: "community",
  design: { customDetails: {} },
  fabric: null,
  allowUnresolvedMaterialPricing: true,
  style,
  baseGarmentComposition: mainComposition,
  additionalGarments: mixedExtraState.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings: pricingSettings,
});
assert.ok(pricingWithAdditional);
assert.equal(pricingWithAdditional.additionalGarmentPricingStatus, "resolved");
assert.equal(pricingWithAdditional.additionalGarmentPriceRows.length, 2);
const shirtPrice = pricingWithAdditional.baseGarmentPriceRows.find(
  (row) => row.garmentType === "shirt",
)?.price;
assert.ok(shirtPrice);
assert.equal(
  pricingWithAdditional.additionalGarmentPriceRows.find(
    (row) => row.garmentType === "shirt",
  )?.price,
  shirtPrice,
  "Additional shirt inherits the current matching main garment price",
);
assert.equal(
  pricingWithAdditional.additionalGarmentPriceRows.find(
    (row) => row.garmentType === "trouser",
  )?.price,
  pricingWithAdditional.baseGarmentPriceRows.find(
    (row) => row.garmentType === "trouser",
  )?.price,
  "Additional trouser inherits the current matching main garment price",
);
assert.equal(
  pricingWithAdditional.constructionUpgradesPrice,
  calculateDesignPricing({
    route: "community",
    design: { customDetails: {} },
    fabric: null,
    allowUnresolvedMaterialPricing: true,
    style,
    baseGarmentComposition: mainComposition,
    catalog: SEED_CUSTOM_DETAIL_CATALOG,
    businessSettings: pricingSettings,
  })?.constructionUpgradesPrice,
  "Optional garments do not multiply unrelated construction upgrades",
);

const repricedCatalog = SEED_CUSTOM_DETAIL_CATALOG.map((option) =>
  option.id === "shirt_std_short" ? { ...option, priceCents: 7000 } : option,
);
const repricedAdditional = calculateDesignPricing({
  route: "community",
  design: { customDetails: {} },
  fabric: null,
  allowUnresolvedMaterialPricing: true,
  style,
  baseGarmentComposition: mainComposition,
  additionalGarments: mixedExtraState.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
  catalog: repricedCatalog,
  businessSettings: pricingSettings,
});
assert.equal(
  repricedAdditional?.additionalGarmentPriceRows.find(
    (row) => row.garmentType === "shirt",
  )?.price,
  70,
  "Additional garments are repriced from the current main configuration, not a stored copy",
);

const reconciled = reconcileAdditionalGarmentDependencies(
  mixedExtraState,
  alternateComposition,
);
assert.equal(
  reconciled.fabricAllocations.flatMap((allocation) => allocation.garmentAssignments)
    .filter((assignment) => assignment.sourceRole === "additional")
    .find((assignment) => assignment.mainGarmentType === "shirt")
    ?.dependencyStatus,
  "orphaned",
  "Main removal invalidates only the dependent optional garment",
);
assert.equal(
  reconciled.fabricAllocations.flatMap((allocation) => allocation.garmentAssignments)
    .filter((assignment) => assignment.sourceRole === "additional")
    .find((assignment) => assignment.mainGarmentType === "trouser")
    ?.dependencyStatus,
  "valid",
  "Unrelated optional garments remain valid when their matching main garment remains",
);
const afterOneRemoval = FabricAllocationStateEngine.removeGarmentAssignments(
  mixedExtraState,
  ["additional:shirt:1"],
);
assert.equal(
  afterOneRemoval.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .filter((assignment) => assignment.sourceRole === "additional").length,
  1,
  "Removing one optional garment does not remove the other",
);
assert.equal(
  reconciled.fabricAllocations.flatMap((allocation) => allocation.garmentAssignments)
    .filter((assignment) => assignment.sourceRole === "additional")
    .some((assignment) => assignment.dependencyStatus === "valid"),
  true,
  "No orphaned additional garment is silently treated as valid",
);
const unresolvedPricing = calculateDesignPricing({
  route: "community",
  design: { customDetails: {} },
  fabric: null,
  allowUnresolvedMaterialPricing: true,
  style: { ...style, fabricCapacityComposition: [...alternateComposition] },
  baseGarmentComposition: alternateComposition,
  additionalGarments: reconciled.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings: pricingSettings,
});
assert.ok(unresolvedPricing);
assert.equal(unresolvedPricing.additionalGarmentPricingStatus, "unresolved");
assert.equal(unresolvedPricing.additionalGarmentPriceRows.length, 0);

console.log("PASS: Optional garment domain validates dependencies, identities, allocation compatibility, persistence, and inherited pricing");
