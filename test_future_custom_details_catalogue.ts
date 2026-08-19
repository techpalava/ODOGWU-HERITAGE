import assert from "node:assert/strict";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  createEmptyAdditionalGarmentConstructionState,
  reconcileAdditionalGarmentConstructionState,
  removeAdditionalGarmentConstruction,
  selectAdditionalGarmentConstructionOption,
} from "./src/utils/additionalGarmentConstructionState";
import {
  createCatalogueAdditionalGarmentSelection,
  resolveAdditionalGarmentPriceRows,
} from "./src/utils/additionalGarmentDomain";
import {
  CUSTOM_DETAILS_CORE_SECTION_ORDER,
  partitionCatalogueGroupsByRole,
  projectFutureCustomDetailsCatalogue,
} from "./src/utils/futureCustomDetailsCatalogue";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { setGarmentScopedCustomDetailSelection } from "./src/utils/garmentScopedCustomDetailsState";
import {
  reconcileGarmentTypeStepSelection,
  selectGarmentConstructionOption,
} from "./src/utils/garmentTypeStepState";
import type {
  CanonicalPhysicalGarmentType,
  CustomDetailDemographic,
  FabricGarmentAssignment,
  StyleCategory,
} from "./src/types";

const catalog = inspectCustomDetailCatalog([]);

const project = ({
  garmentTypes,
  demographic = "male",
  style = null,
  additionalGarments = [],
}: {
  garmentTypes: CanonicalPhysicalGarmentType[];
  demographic?: CustomDetailDemographic;
  style?: StyleCategory | null;
  additionalGarments?: FabricGarmentAssignment[];
}) => {
  const garmentTypeSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: demographic,
    normalizedCustomDetailCatalog: catalog.activeOptions,
  }).selection;
  const additionalConstructions = reconcileAdditionalGarmentConstructionState({
    existingState: createEmptyAdditionalGarmentConstructionState(),
    assignments: additionalGarments,
    normalizedCustomDetailCatalog: catalog.activeOptions,
  });
  const reconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    additionalGarments,
    additionalGarmentConstructions: additionalConstructions.state,
    style,
    catalogInspection: catalog,
    existingState: undefined,
  });
  return {
    garmentTypeSelection,
    additionalConstructions,
    reconciliation,
    catalogue: projectFutureCustomDetailsCatalogue({
      garmentTypeSelection,
      style,
      reconciliation,
      activeOptions: catalog.activeOptions,
      additionalGarments,
      additionalGarmentConstructions: additionalConstructions.state,
    }),
  };
};

const casualNative = {
  id: "casual-native",
  name: "Casual Native",
  fabricCapacityComposition: [
    { key: "style:shirt", garmentType: "shirt", fabricUnits: 1 },
    { key: "style:trouser", garmentType: "trouser", fabricUnits: 1 },
  ],
  targetDemographic: "male",
} as StyleCategory;

const shirt = project({ garmentTypes: ["shirt"], style: casualNative });
assert.deepEqual(
  shirt.catalogue.coreGroups.map((group) => group.selectionGroup),
  [
    "shirt_construction",
    "shirt_pockets",
    "neck_design",
    "trouser_fastening",
    "trouser_pockets",
    "standard_shorts_fastening",
    "standard_shorts_pockets",
  ],
  "A Shirt selection uses structured style support and policy without unrelated sections",
);
assert.equal(shirt.catalogue.coreGroups.length, 7);
assert.equal(shirt.catalogue.coreGroups[0].occurrences.length, 1);
assert.deepEqual(
  partitionCatalogueGroupsByRole(shirt.catalogue.coreGroups, "main").map(
    (group) => group.selectionGroup,
  ),
  ["shirt_construction", "shirt_pockets", "neck_design"],
  "visible Main Custom Details exclude inactive policy and unselected style garments",
);
assert.equal(
  partitionCatalogueGroupsByRole(shirt.catalogue.coreGroups, "additional").length,
  0,
);
assert.equal(
  shirt.catalogue.coreGroups.some(
    (group) => group.selectionGroup === "dress_construction",
  ),
  false,
  "unrelated Dress construction is absent",
);

const staleDressState = setGarmentScopedCustomDetailSelection(
  {
    schemaVersion: 1,
    selectionsByGarmentKey: {},
    snapshotsByGarmentKey: {},
  },
  "base:dress",
  "dress_pockets",
  "dress_pocket_2",
);
const reconciledStaleDress = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: shirt.garmentTypeSelection,
  additionalGarments: [],
  style: casualNative,
  catalogInspection: catalog,
  existingState: staleDressState,
});
assert.deepEqual(
  reconciledStaleDress.state.selectionsByGarmentKey,
  {},
  "state owned only by a hidden inactive garment is reconciled away",
);
assert.equal(
  validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation: reconciledStaleDress,
  }).blockers.some((blocker) => blocker.code === "selection_reconciled"),
  false,
  "cleaning hidden inactive-garment state does not create a completion blocker",
);
const staleDressPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation: reconciledStaleDress,
  catalogInspection: catalog,
});
assert.equal(staleDressPricing.status, "exact");
assert.equal(
  staleDressPricing.status === "exact" ? staleDressPricing.subtotalCents : null,
  0,
  "hidden stale selections cannot contribute a charge",
);
assert.deepEqual(
  shirt.reconciliation.state.selectionsByGarmentKey,
  {},
  "visibility must not create scoped selections",
);
assert.equal(
  shirt.catalogue.coreGroups[0].occurrences[0].construction?.status,
  "resolved",
);
assert.equal(
  shirt.catalogue.coreGroups[0].occurrences[0].construction?.status === "resolved"
    ? shirt.catalogue.coreGroups[0].occurrences[0].construction.components[0].optionId
    : null,
  "shirt_std_short",
  "Step 1 default construction is projected as selected",
);

const shirtTrouser = project({
  garmentTypes: ["shirt", "trouser"],
  style: casualNative,
});
assert.deepEqual(
  shirtTrouser.catalogue.coreGroups.map((group) => group.selectionGroup),
  [
    "shirt_construction",
    "shirt_pockets",
    "neck_design",
    "trouser_fastening",
    "trouser_pockets",
    "standard_shorts_fastening",
    "standard_shorts_pockets",
  ],
);

const skirt = project({ garmentTypes: ["skirt"], demographic: "female" });
assert.deepEqual(
  skirt.catalogue.coreGroups.map((group) => group.selectionGroup),
  ["skirt_length", "skirt_pockets"],
);

const family = project({
  garmentTypes: ["shirt", "trouser", "skirt"],
  demographic: "unisex",
});
assert.equal(
  new Set(family.catalogue.coreGroups.map((group) => group.selectionGroup)).size,
  family.catalogue.coreGroups.length,
  "Family projections never duplicate Neck or optional shorts groups",
);

const maleSections = project({ garmentTypes: ["shirt"], demographic: "male" });
const femaleSections = project({ garmentTypes: ["shirt"], demographic: "female" });
assert.deepEqual(
  maleSections.catalogue.coreGroups.map((group) => group.selectionGroup).sort(),
  femaleSections.catalogue.coreGroups.map((group) => group.selectionGroup).sort(),
  "Step 1 audience does not remove sections required by the selected style",
);

const gownStyle = {
  id: "gown-led",
  name: "Gown led",
  targetDemographic: "female",
  fabricCapacityComposition: [
    { key: "style:gown", garmentType: "full_length_gown", fabricUnits: 2 },
    { key: "style:skirt", garmentType: "skirt", fabricUnits: 1 },
  ],
} as StyleCategory;
const gown = project({
  garmentTypes: ["full_length_gown"],
  demographic: "female",
  style: gownStyle,
});
assert.deepEqual(
  gown.catalogue.coreGroups.map((group) => group.selectionGroup),
  [
    "dress_construction",
    "dress_pockets",
    "neck_design",
    "skirt_length",
    "skirt_pockets",
    "bum_shorts_fastening",
    "bum_shorts_pockets",
  ],
  "Gown-led structured support projects Dress, Neck, Skirt, then Bum Shorts",
);
assert.equal(
  gown.catalogue.coreGroups.some((group) =>
    ["shirt_construction", "trouser_fastening", "standard_shorts_fastening"].includes(
      group.selectionGroup,
    ),
  ),
  false,
);

const agbada = project({ garmentTypes: ["agbada"], demographic: "male" });
assert.deepEqual(
  agbada.catalogue.coreGroups.map((group) => group.selectionGroup),
  [
    "shirt_construction",
    "shirt_pockets",
    "neck_design",
    "trouser_fastening",
    "trouser_pockets",
  ],
  "Agbada keeps its configured upper and Trouser physical components without duplicate sections",
);

const defaultShirt = shirt.garmentTypeSelection.constructionByGarment.shirt;
assert.equal(defaultShirt?.status, "resolved");
if (defaultShirt?.status === "resolved") {
  const replacement = selectGarmentConstructionOption({
    resolution: defaultShirt,
    selectionGroup: "shirt_construction",
    optionId: "shirt_std_midlong",
    normalizedCustomDetailCatalog: catalog.activeOptions,
  });
  assert.equal(replacement.status, "selected");
  if (
    replacement.status === "selected" &&
    replacement.resolution.status === "resolved"
  ) {
    assert.equal(replacement.resolution.totalPriceCents, 7000);
    assert.equal(replacement.resolution.components.length, 1);
    assert.equal(replacement.resolution.components[0].optionId, "shirt_std_midlong");
  }
}

const addition = createCatalogueAdditionalGarmentSelection({
  garmentType: "dress",
  existingAssignments: [],
});
assert.equal(addition.status, "resolved");
if (addition.status === "resolved") {
  const assignment: FabricGarmentAssignment = {
    garmentKey: addition.selection.garmentSpec!.key,
    code: addition.selection.code,
    garmentType: "dress",
    fabricUnits: 1,
    sourceRole: "additional",
    eligibilityRule: "catalog_all",
    dependencyStatus: "valid",
  };
  const added = project({
    garmentTypes: ["shirt"],
    additionalGarments: [assignment],
  });
  const dressGroup = added.catalogue.coreGroups.find(
    (group) => group.selectionGroup === "dress_construction",
  );
  assert.equal(dressGroup?.occurrences.length, 1);
  assert.equal(dressGroup?.occurrences[0].role, "additional");
  const additionalDressGroups = partitionCatalogueGroupsByRole(
    added.catalogue.coreGroups,
    "additional",
    assignment.garmentKey,
  ).map((group) => group.selectionGroup);
  assert.ok(additionalDressGroups.includes("dress_construction"));
  assert.ok(additionalDressGroups.includes("dress_pockets"));
  assert.equal(
    additionalDressGroups.includes("shirt_construction"),
    false,
    "added Dress Custom Details are partitioned away from Main Shirt groups",
  );
  assert.equal(
    partitionCatalogueGroupsByRole(added.catalogue.coreGroups, "main").some(
      (group) => group.selectionGroup === "dress_construction",
    ),
    false,
  );
  assert.equal(
    added.additionalConstructions.state.byGarmentKey[assignment.garmentKey]?.status,
    "resolved",
  );
  const changed = selectAdditionalGarmentConstructionOption({
    state: added.additionalConstructions.state,
    garmentKey: assignment.garmentKey,
    selectionGroup: "dress_construction",
    optionId: "dress_std_short",
    normalizedCustomDetailCatalog: catalog.activeOptions,
  });
  const changedConstruction = changed.byGarmentKey[assignment.garmentKey];
  assert.equal(changedConstruction?.status, "resolved");
  if (!changedConstruction || changedConstruction.status !== "resolved") {
    throw new Error("Expected the additional construction to resolve.");
  }
  const additionalPrice = resolveAdditionalGarmentPriceRows({
    additionalAssignments: [assignment],
    mainGarmentPriceRows: [],
    designSelections: {},
    constructionByGarmentKey: changed.byGarmentKey,
  });
  assert.deepEqual(additionalPrice.unresolvedAssignmentIds, []);
  assert.equal(
    additionalPrice.rows[0].price,
    changedConstruction.totalPrice,
    "additional construction contributes its replacement total exactly once",
  );
  const removed = removeAdditionalGarmentConstruction(changed, assignment.garmentKey);
  assert.equal(removed.byGarmentKey[assignment.garmentKey], undefined);
  const inactiveAgain = project({ garmentTypes: ["shirt"] });
  assert.equal(
    inactiveAgain.catalogue.coreGroups.some(
      (group) => group.selectionGroup === "dress_construction",
    ),
    false,
  );
}

assert.deepEqual(CUSTOM_DETAILS_CORE_SECTION_ORDER.length, 13);
console.log("PASS: relevant Custom Details projection, ordering, construction replacement, and additional occurrence lifecycle");
