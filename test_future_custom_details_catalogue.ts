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
  projectFutureCustomDetailsCatalogue,
} from "./src/utils/futureCustomDetailsCatalogue";
import { reconcileGarmentScopedCustomDetails } from "./src/utils/garmentScopedCustomDetailsDomain";
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
} as StyleCategory;

const shirt = project({ garmentTypes: ["shirt"], style: casualNative });
assert.deepEqual(
  shirt.catalogue.coreGroups.map((group) => group.selectionGroup),
  CUSTOM_DETAILS_CORE_SECTION_ORDER,
  "Shirt-led catalogue uses the canonical order with every section present",
);
assert.equal(shirt.catalogue.coreGroups.length, 13);
assert.equal(shirt.catalogue.coreGroups[0].occurrences.length, 1);
assert.equal(
  shirt.catalogue.coreGroups.find((group) => group.selectionGroup === "dress_construction")?.occurrences.length,
  0,
  "unselected construction remains visible but inactive",
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
  shirtTrouser.catalogue.coreGroups.slice(0, 4).map((group) => group.selectionGroup),
  ["shirt_construction", "shirt_pockets", "trouser_fastening", "trouser_pockets"],
);

const skirt = project({ garmentTypes: ["skirt"], demographic: "female" });
assert.deepEqual(
  skirt.catalogue.coreGroups.slice(0, 2).map((group) => group.selectionGroup),
  ["skirt_length", "skirt_pockets"],
);

const family = project({
  garmentTypes: ["shirt", "trouser", "skirt"],
  demographic: "unisex",
});
assert.deepEqual(
  family.catalogue.coreGroups.slice(0, 2).map((group) => group.selectionGroup),
  ["trouser_fastening", "trouser_pockets"],
  "Unisex/family prioritises Trouser without hiding other sections",
);

const maleSections = project({ garmentTypes: ["shirt"], demographic: "male" });
const femaleSections = project({ garmentTypes: ["shirt"], demographic: "female" });
assert.deepEqual(
  maleSections.catalogue.coreGroups.map((group) => group.selectionGroup).sort(),
  femaleSections.catalogue.coreGroups.map((group) => group.selectionGroup).sort(),
  "audience does not remove catalogue sections",
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
    inactiveAgain.catalogue.coreGroups.find((group) => group.selectionGroup === "dress_construction")?.occurrences.length,
    0,
  );
}

console.log("PASS: complete Custom Details catalogue, ordering, construction replacement, and additional occurrence lifecycle");
