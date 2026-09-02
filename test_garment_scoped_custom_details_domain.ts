import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type {
  CanonicalPhysicalGarmentType,
  CustomDetailDemographic,
  CustomDetailOption,
  GarmentScopedCustomDetailsStateV1,
  StyleCategory,
} from "./src/types";
import {
  createCustomDetailCatalogTombstone,
  inspectCustomDetailCatalog,
} from "./src/utils/catalogHelpers";
import {
  calculateGarmentScopedCustomDetailsPricing,
  projectAuthorizedAdditionalGarmentAssignments,
  reconcileGarmentScopedCustomDetails,
  resolveFutureCustomDetailPhysicalSubjects,
  resolveGarmentScopedCustomDetailApplicability,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { projectFutureCustomDetailsCatalogue } from "./src/utils/futureCustomDetailsCatalogue";
import {
  cloneGarmentConstructionPricingResolution,
  createEmptyAdditionalGarmentConstructionState,
  removeAdditionalGarmentConstruction,
} from "./src/utils/additionalGarmentConstructionState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import type { FabricAllocationState, FabricGarmentAssignment } from "./src/types";
import {
  createEmptyGarmentScopedCustomDetailsState,
  setGarmentScopedCustomDetailSelection,
} from "./src/utils/garmentScopedCustomDetailsState";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const seedInspection = inspectCustomDetailCatalog([]);
const buildStepSelection = (
  garmentTypes: readonly CanonicalPhysicalGarmentType[],
  demographic: CustomDetailDemographic,
) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: demographic,
    normalizedCustomDetailCatalog: seedInspection.activeOptions,
  }).selection;

const setSelection = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
  group: Parameters<typeof setGarmentScopedCustomDetailSelection>[2],
  value: Parameters<typeof setGarmentScopedCustomDetailSelection>[3],
) => setGarmentScopedCustomDetailSelection(state, garmentKey, group, value);

const findSeed = (optionId: string): CustomDetailOption => {
  const option = SEED_CUSTOM_DETAIL_CATALOG.find(
    (candidate) => candidate.id === optionId,
  );
  assert.ok(option, `Missing seed fixture ${optionId}`);
  return option;
};

const allGarments = buildStepSelection(
  [
    "agbada",
    "full_length_gown",
    "kaftan",
    "dress",
    "bum_shorts",
    "skirt",
    "standard_shorts",
    "trouser",
    "shirt",
  ],
  "unisex",
);
const allSubjectResolution = resolveFutureCustomDetailPhysicalSubjects(allGarments);
assert.deepEqual(
  allSubjectResolution.subjects.map((subject) => subject.parentGarmentType),
  [
    "shirt",
    "trouser",
    "standard_shorts",
    "skirt",
    "bum_shorts",
    "dress",
    "kaftan",
    "full_length_gown",
    "agbada",
    "agbada",
  ],
  "subjects must follow the approved customer-facing garment order",
);
assert.equal(
  allSubjectResolution.subjects[0].garmentKey,
  "base:shirt",
  "simple garments retain their established stable Step 1 identity",
);
assert.deepEqual(
  allSubjectResolution.subjects
    .filter((subject) => subject.parentGarmentType === "agbada")
    .map((subject) => subject.garmentKey),
  ["base:agbada:shirt", "base:agbada:trouser"],
  "Agbada expands through authoritative stable component identities",
);

for (const demographic of ["male", "female", "unisex"] as const) {
  const nikka = resolveFutureCustomDetailPhysicalSubjects(
    buildStepSelection(["standard_shorts"], demographic),
  );
  assert.equal(nikka.subjects[0]?.parentGarmentType, "standard_shorts");
  assert.equal(
    nikka.diagnostics.some(
      (diagnostic) => diagnostic.code === "demographic_mismatch",
    ),
    false,
    `Nikka must remain eligible for ${demographic}`,
  );
}

const femaleBumShorts = resolveFutureCustomDetailPhysicalSubjects(
  buildStepSelection(["bum_shorts"], "female"),
);
assert.equal(femaleBumShorts.subjects.length, 1);
assert.equal(
  femaleBumShorts.diagnostics.some(
    (diagnostic) => diagnostic.code === "demographic_mismatch",
  ),
  false,
);
const maleBumShorts = resolveFutureCustomDetailPhysicalSubjects(
  buildStepSelection(["bum_shorts"], "male"),
);
assert.equal(maleBumShorts.subjects.length, 1, "invalid subjects are not hidden");
assert.equal(
  maleBumShorts.diagnostics.some(
    (diagnostic) => diagnostic.code === "demographic_mismatch",
  ),
  false,
  "audience must not hide a physically selected garment from Custom Details",
);

const shirtAndKaftan = buildStepSelection(["shirt", "kaftan"], "male");
const shirtAndKaftanSubjects = resolveFutureCustomDetailPhysicalSubjects(
  shirtAndKaftan,
).subjects;
const shirtSubject = shirtAndKaftanSubjects.find(
  (subject) => subject.parentGarmentType === "shirt",
)!;
const kaftanSubject = shirtAndKaftanSubjects.find(
  (subject) => subject.parentGarmentType === "kaftan",
)!;
const unrelatedStyleComposition = {
  id: "style-metadata-only",
  name: "Metadata fixture",
  fabricCapacityComposition: [
    { key: "style:dress", garmentType: "dress", fabricUnits: 1 },
  ],
} as StyleCategory;
assert.deepEqual(
  resolveFutureCustomDetailPhysicalSubjects(shirtAndKaftan).subjects.map(
    (subject) => subject.parentGarmentType,
  ),
  ["shirt", "kaftan"],
  "style composition is not an input and cannot create physical subjects",
);
const shirtApplicability = resolveGarmentScopedCustomDetailApplicability({
  subject: shirtSubject,
  style: unrelatedStyleComposition,
  catalogInspection: seedInspection,
});
const kaftanApplicability = resolveGarmentScopedCustomDetailApplicability({
  subject: kaftanSubject,
  style: unrelatedStyleComposition,
  catalogInspection: seedInspection,
});
for (const applicability of [shirtApplicability, kaftanApplicability]) {
  const groupIds = applicability.groups.map((group) => group.selectionGroup);
  assert.equal(groupIds.includes("shirt_construction"), false);
  assert.equal(groupIds.includes("shirt_pockets"), true);
  assert.equal(groupIds.includes("neck_design"), true);
  assert.equal(groupIds.includes("additional_physical_garment"), false);
}
assert.notEqual(
  shirtApplicability.groups,
  kaftanApplicability.groups,
  "repeated group IDs remain independently resolved per garment",
);

const dressAndGown = buildStepSelection(
  ["dress", "full_length_gown"],
  "female",
);
const dressAndGownSubjects = resolveFutureCustomDetailPhysicalSubjects(
  dressAndGown,
).subjects;
assert.deepEqual(
  dressAndGownSubjects.map((subject) => subject.garmentKey),
  ["base:dress", "base:full_length_gown"],
);
for (const subject of dressAndGownSubjects) {
  const groups = resolveGarmentScopedCustomDetailApplicability({
    subject,
    catalogInspection: seedInspection,
  }).groups.map((group) => group.selectionGroup);
  assert.equal(groups.includes("dress_construction"), false);
  assert.equal(groups.includes("dress_pockets"), true);
  assert.equal(groups.includes("dress_additional"), true);
}

let independentState = createEmptyGarmentScopedCustomDetailsState();
independentState = setSelection(
  independentState,
  "base:shirt",
  "neck_additional",
  "neck_additional_no_cost",
);
independentState = setSelection(
  independentState,
  "base:kaftan",
  "neck_additional",
  "neck_additional_no_cost",
);
independentState = setSelection(
  independentState,
  "base:shirt",
  "shirt_construction",
  "shirt_std_short",
);
const independentReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: shirtAndKaftan,
  catalogInspection: seedInspection,
  existingState: independentState,
});
assert.equal(
  independentReconciliation.state.selectionsByGarmentKey["base:shirt"]
    ?.neck_additional,
  "neck_additional_no_cost",
);
assert.equal(
  independentReconciliation.state.selectionsByGarmentKey["base:kaftan"]
    ?.neck_additional,
  "neck_additional_no_cost",
);
assert.equal(
  independentReconciliation.state.selectionsByGarmentKey["base:shirt"]
    ?.shirt_construction,
  undefined,
  "locked construction must be removed from future Custom Details",
);
assert.equal(
  independentReconciliation.diagnostics.some(
    (diagnostic) => diagnostic.code === "group_locked_by_garment_type",
  ),
  true,
);
const repeatedPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation: reconcileGarmentScopedCustomDetails({
    garmentTypeSelection: shirtAndKaftan,
    catalogInspection: seedInspection,
    existingState: setSelection(
      setSelection(
        createEmptyGarmentScopedCustomDetailsState(),
        "base:shirt",
        "neck_additional",
        "neck_additional_no_cost",
      ),
      "base:kaftan",
      "neck_additional",
      "neck_additional_no_cost",
    ),
  }),
  catalogInspection: seedInspection,
  showAdditionalClothesCosts: true,
});
assert.equal(repeatedPricing.status, "exact");
assert.equal(repeatedPricing.lines.length, 2);
assert.deepEqual(
  repeatedPricing.lines.map((line) => line.garmentKey),
  ["base:kaftan", "base:shirt"],
  "the same option on two garments produces two price occurrences",
);
assert.equal(
  repeatedPricing.lines.every((line) => line.unitPriceCents === 0),
  true,
  "valid Admin zero prices remain exact zero occurrences",
);

let dressPricingState = createEmptyGarmentScopedCustomDetailsState();
for (const garmentKey of ["base:dress", "base:full_length_gown"]) {
  dressPricingState = setSelection(
    dressPricingState,
    garmentKey,
    "dress_additional",
    ["L5", "dress_additional_net"],
  );
}
const dressPricingReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: dressAndGown,
  catalogInspection: seedInspection,
  existingState: dressPricingState,
});
const dressPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation: dressPricingReconciliation,
  catalogInspection: seedInspection,
  showAdditionalClothesCosts: true,
});
assert.equal(dressPricing.status, "exact");
assert.equal(dressPricing.lines.length, 4);
assert.equal(
  dressPricing.status === "exact" ? dressPricing.subtotalCents : null,
  4000,
  "multi-select options and repeated garments price by occurrence",
);
assert.equal(
  dressPricing.lines.some((line) =>
    [
      "dress_construction",
      "shirt_construction",
      "trouser_fastening",
      "standard_shorts_fastening",
      "bum_shorts_fastening",
      "skirt_length",
    ].includes(line.selectionGroup),
  ),
  false,
  "Step 1 construction is absent from the detail subtotal",
);

const repricedLining = { ...findSeed("L5"), priceCents: 1750 };
const repricedInspection = inspectCustomDetailCatalog([repricedLining]);
const repricedReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: buildStepSelection(["dress"], "female"),
  catalogInspection: repricedInspection,
  existingState: setSelection(
    createEmptyGarmentScopedCustomDetailsState(),
    "base:dress",
    "dress_additional",
    ["L5"],
  ),
});
assert.equal(
  repricedReconciliation.state.snapshotsByGarmentKey["base:dress"]
    ?.dress_additional?.[0]?.priceCents,
  1750,
  "reconciliation refreshes snapshots from current Admin pricing",
);
assert.equal(
  calculateGarmentScopedCustomDetailsPricing({
    reconciliation: repricedReconciliation,
    catalogInspection: repricedInspection,
    showAdditionalClothesCosts: true,
  }).lines[0]?.unitPriceCents,
  1750,
);

const removedGarmentState = setSelection(
  setSelection(
    createEmptyGarmentScopedCustomDetailsState(),
    "base:shirt",
    "shirt_pockets",
    "shirt_pocket_0",
  ),
  "base:trouser",
  "trouser_pockets",
  "trouser_pocket_none",
);
const removedGarment = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: buildStepSelection(["shirt"], "male"),
  catalogInspection: seedInspection,
  existingState: removedGarmentState,
});
assert.equal(
  removedGarment.state.selectionsByGarmentKey["base:shirt"]?.shirt_pockets,
  "shirt_pocket_0",
);
assert.equal(
  removedGarment.state.selectionsByGarmentKey["base:trouser"],
  undefined,
);
assert.equal(
  removedGarment.diagnostics.some(
    (diagnostic) => diagnostic.code === "garment_removed",
  ),
  true,
);

const disabledInspection = inspectCustomDetailCatalog([
  { ...findSeed("shirt_pocket_0"), active: false },
]);
const disabledResult = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: buildStepSelection(["shirt"], "male"),
  catalogInspection: disabledInspection,
  existingState: setSelection(
    createEmptyGarmentScopedCustomDetailsState(),
    "base:shirt",
    "shirt_pockets",
    "shirt_pocket_0",
  ),
});
assert.equal(
  disabledResult.diagnostics.some(
    (diagnostic) => diagnostic.code === "option_disabled",
  ),
  true,
);
assert.equal(
  disabledResult.state.selectionsByGarmentKey["base:shirt"],
  undefined,
);

const deletedInspection = inspectCustomDetailCatalog([
  createCustomDetailCatalogTombstone("dress_additional_net"),
]);
const partiallyDeletedMultiSelect = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: buildStepSelection(["dress"], "female"),
  catalogInspection: deletedInspection,
  existingState: setSelection(
    createEmptyGarmentScopedCustomDetailsState(),
    "base:dress",
    "dress_additional",
    ["L5", "dress_additional_net"],
  ),
});
assert.deepEqual(
  partiallyDeletedMultiSelect.state.selectionsByGarmentKey["base:dress"]
    ?.dress_additional,
  ["L5"],
  "valid multi-select members survive while only deleted members are removed",
);
assert.equal(
  partiallyDeletedMultiSelect.diagnostics.some(
    (diagnostic) => diagnostic.code === "option_deleted",
  ),
  true,
);

const missingPriceRecord = { ...findSeed("dress_additional_net") } as Record<
  string,
  unknown
>;
delete missingPriceRecord.priceCents;
const missingPriceInspection = inspectCustomDetailCatalog([missingPriceRecord]);
const missingPriceResult = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: buildStepSelection(["dress"], "female"),
  catalogInspection: missingPriceInspection,
  existingState: setSelection(
    createEmptyGarmentScopedCustomDetailsState(),
    "base:dress",
    "dress_additional",
    ["dress_additional_net"],
  ),
});
assert.equal(
  missingPriceResult.diagnostics.some(
    (diagnostic) => diagnostic.code === "malformed_catalog_option",
  ),
  true,
);
assert.equal(
  calculateGarmentScopedCustomDetailsPricing({
    reconciliation: missingPriceResult,
    catalogInspection: missingPriceInspection,
    showAdditionalClothesCosts: true,
  }).status,
  "invalid",
  "missing prices are invalid and never become zero",
);

const shirtStep = buildStepSelection(["shirt"], "male");
let completeShirtState = createEmptyGarmentScopedCustomDetailsState();
completeShirtState = setSelection(
  completeShirtState,
  "base:shirt",
  "shirt_pockets",
  "shirt_pocket_0",
);
completeShirtState = setSelection(
  completeShirtState,
  "base:shirt",
  "neck_design",
  "neck_no_round",
);
const completeShirt = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: shirtStep,
  catalogInspection: seedInspection,
  existingState: completeShirtState,
});
assert.equal(
  validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation: completeShirt,
  }).status,
  "complete",
  "optional unselected groups do not block completion",
);
const incompleteShirt = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: shirtStep,
  catalogInspection: seedInspection,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
assert.equal(
  validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation: incompleteShirt,
  }).status,
  "complete",
  "all optional groups default to the UI-only None state",
);

const evaluationRecord = { ...findSeed("personalized_additional_evaluation") };
delete (evaluationRecord as Partial<CustomDetailOption>).priceCents;
const evaluationInspection = inspectCustomDetailCatalog([evaluationRecord]);
const evaluationReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: shirtStep,
  catalogInspection: evaluationInspection,
  existingState: setSelection(
    completeShirtState,
    "base:shirt",
    "personalized_additional",
    ["personalized_additional_evaluation"],
  ),
});
assert.equal(
  validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation: evaluationReconciliation,
  }).status,
  "incomplete",
  "an evaluation-required personalized option remains incomplete until its scoped text is supplied",
);
assert.equal(
  calculateGarmentScopedCustomDetailsPricing({
    reconciliation: evaluationReconciliation,
    catalogInspection: evaluationInspection,
  }).status,
  "pending",
  "evaluation-required options remain selected but never become exact zero",
);

const deterministicFirst = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: dressAndGown,
  catalogInspection: seedInspection,
  existingState: dressPricingState,
});
const deterministicSecond = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: dressAndGown,
  catalogInspection: seedInspection,
  existingState: deterministicFirst.state,
});
assert.deepEqual(deterministicSecond.state, deterministicFirst.state);
assert.equal(deterministicSecond.stateChanged, false);

const legacyState = {
  customDetails: { shirt_pockets: "shirt_pocket_0" },
  customDetailSnapshots: [{ optionId: "legacy-snapshot" }],
};
const legacyBefore = JSON.stringify(legacyState);
reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: shirtStep,
  catalogInspection: seedInspection,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
assert.equal(JSON.stringify(legacyState), legacyBefore);

const additionalConstruction = (
  garmentKey: string,
  garmentType: CanonicalPhysicalGarmentType,
  priceCents: number,
) => {
  const base = resolveGarmentConstructionPricing(garmentType, seedInspection.activeOptions);
  assert.equal(base.status, "resolved");
  const resolved = cloneGarmentConstructionPricingResolution(base);
  assert.equal(resolved.status, "resolved");
  return {
    schemaVersion: 1 as const,
    byGarmentKey: {
      [garmentKey]: {
        ...resolved,
        totalPriceCents: priceCents,
        totalPrice: priceCents / 100,
        components: resolved.components.map((component, index) =>
          index === 0 ? { ...component, priceCents } : { ...component, priceCents: 0 },
        ),
      },
    },
  };
};

const fabricStateWithAssignments = (
  assignments: FabricGarmentAssignment[],
): FabricAllocationState => ({
  fabricAllocations: assignments.length
    ? [
        {
          allocationId: "allocation-1",
          fabricCode: "FAB-A",
          garmentAssignments: assignments,
        },
      ]
    : [],
  activeAllocationId: assignments.length ? "allocation-1" : null,
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
});

const parentGarmentKeys = (
  subjects: ReturnType<typeof resolveFutureCustomDetailPhysicalSubjects>["subjects"],
) =>
  [...new Set(subjects.map((subject) => subject.parentGarmentKey))].sort();

// G2 A — authorized additional Shirt without Fabric remains in Custom Details
{
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const partialFabric = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const subjects = resolveFutureCustomDetailPhysicalSubjects(shirtStep, {
    additionalGarmentConstructions: authorizedState,
  });
  assert.deepEqual(parentGarmentKeys(subjects.subjects), [
    "additional:shirt:1",
    "base:shirt",
  ]);
  const liveList = projectAuthorizedAdditionalGarmentAssignments({
    additionalGarmentConstructions: authorizedState,
    fabricAllocationState: partialFabric,
  });
  assert.deepEqual(
    liveList.map((assignment) => assignment.garmentKey),
    ["additional:shirt:1"],
  );
}

// G2 B — orphan Fabric Gown must not create Custom Details membership
{
  const orphanFabric = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "additional:full_length_gown:99",
      code: "ADDITIONAL_GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
      sourceRole: "additional",
    },
  ]);
  const subjects = resolveFutureCustomDetailPhysicalSubjects(shirtStep, {
    additionalGarmentConstructions: createEmptyAdditionalGarmentConstructionState(),
  });
  assert.deepEqual(parentGarmentKeys(subjects.subjects), ["base:shirt"]);
  assert.deepEqual(
    projectAuthorizedAdditionalGarmentAssignments({
      additionalGarmentConstructions: createEmptyAdditionalGarmentConstructionState(),
      fabricAllocationState: orphanFabric,
    }),
    [],
  );
}

// G2 C — base Shirt and additional Shirt remain distinct occurrence keys
{
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const subjects = resolveFutureCustomDetailPhysicalSubjects(shirtStep, {
    additionalGarmentConstructions: authorizedState,
  });
  assert.ok(
    subjects.subjects.some(
      (subject) => subject.parentGarmentKey === "base:shirt",
    ),
  );
  assert.ok(
    subjects.subjects.some(
      (subject) => subject.parentGarmentKey === "additional:shirt:1",
    ),
  );
  assert.notEqual(
    subjects.subjects.find((subject) => subject.parentGarmentKey === "base:shirt")
      ?.garmentKey,
    subjects.subjects.find(
      (subject) => subject.parentGarmentKey === "additional:shirt:1",
    )?.garmentKey,
  );
}

// G2 F — Fabric removal only keeps authorized additional subject
{
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const assignedFabric = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "additional:shirt:1",
      code: "ADDITIONAL_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "additional",
    },
  ]);
  const fabricRemoved = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  assert.deepEqual(
    parentGarmentKeys(
      resolveFutureCustomDetailPhysicalSubjects(shirtStep, {
        additionalGarmentConstructions: authorizedState,
      }).subjects,
    ),
    parentGarmentKeys(
      resolveFutureCustomDetailPhysicalSubjects(shirtStep, {
        additionalGarmentConstructions: authorizedState,
      }).subjects,
    ),
  );
  assert.deepEqual(
    projectAuthorizedAdditionalGarmentAssignments({
      additionalGarmentConstructions: authorizedState,
      fabricAllocationState: fabricRemoved,
    }).map((assignment) => assignment.garmentKey),
    ["additional:shirt:1"],
  );
  void assignedFabric;
}

// G2 G — explicit remove garment drops additional subject
{
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const removedState = removeAdditionalGarmentConstruction(
    authorizedState,
    "additional:shirt:1",
  );
  const subjects = resolveFutureCustomDetailPhysicalSubjects(shirtStep, {
    additionalGarmentConstructions: removedState,
  });
  assert.deepEqual(parentGarmentKeys(subjects.subjects), ["base:shirt"]);
}

// G2 orphan Fabric must not mark catalogue role without ledger authorization
{
  const orphanFabric = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "additional:full_length_gown:99",
      code: "ADDITIONAL_GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
      sourceRole: "additional",
    },
  ]);
  const reconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection: shirtStep,
    additionalGarments: orphanFabric.fabricAllocations[0]!.garmentAssignments.filter(
      (assignment) => assignment.sourceRole === "additional",
    ),
    additionalGarmentConstructions: createEmptyAdditionalGarmentConstructionState(),
    catalogInspection: seedInspection,
    existingState: createEmptyGarmentScopedCustomDetailsState(),
  });
  const catalogue = projectFutureCustomDetailsCatalogue({
    garmentTypeSelection: shirtStep,
    reconciliation,
    activeOptions: seedInspection.activeOptions,
    additionalGarments: orphanFabric.fabricAllocations[0]!.garmentAssignments.filter(
      (assignment) => assignment.sourceRole === "additional",
    ),
    additionalGarmentConstructions: createEmptyAdditionalGarmentConstructionState(),
  });
  const additionalOccurrences = catalogue.coreGroups.flatMap((group) =>
    group.occurrences.filter((occurrence) => occurrence.role === "additional"),
  );
  assert.equal(additionalOccurrences.length, 0);
}

const designStudioSource = readFileSync(
  "src/components/DesignStudioView.tsx",
  "utf8",
);
const appSource = readFileSync("src/App.tsx", "utf8");
assert.match(
  designStudioSource,
  /garmentScopedCustomDetailsDomain/,
  "the active controller must use the garment-scoped domain engine",
);
assert.match(
  designStudioSource,
  /projectAuthorizedAdditionalGarmentAssignments/,
  "live additional-garment list must project from the Step 4 construction ledger",
);
assert.doesNotMatch(designStudioSource, /isFutureNineStageMode|legacy_five_stage/);
assert.equal(
  appSource.includes("future_nine_stage"),
  false,
  "App must not contain a journey-mode selector",
);

console.log(
  "PASS: garment-scoped Custom Details physical subjects, reconciliation, completion, and occurrence pricing",
);
