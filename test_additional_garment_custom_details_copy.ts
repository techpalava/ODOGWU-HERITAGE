import assert from "node:assert/strict";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import { cloneGarmentConstructionPricingResolution } from "./src/utils/additionalGarmentConstructionState";
import {
  copyGarmentScopedCustomDetailsToAdditionalOccurrence,
  reconcileGarmentScopedCustomDetails,
  resolveCompatibleGarmentScopedCopySources,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import {
  createEmptyGarmentScopedCustomDetailsState,
  getGarmentScopedCustomDetailSelection,
  setGarmentScopedCustomDetailSelection,
} from "./src/utils/garmentScopedCustomDetailsState";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import type { FabricGarmentAssignment } from "./src/types";

const catalog = inspectCustomDetailCatalog([]);
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalog.activeOptions,
}).selection;
const sourceConstruction = garmentTypeSelection.constructionByGarment.shirt;
assert.equal(sourceConstruction?.status, "resolved");
if (sourceConstruction?.status === "resolved") {
  const clonedConstruction = cloneGarmentConstructionPricingResolution(
    sourceConstruction,
  );
  assert.notEqual(clonedConstruction, sourceConstruction);
  assert.equal(clonedConstruction.status, "resolved");
  if (clonedConstruction.status === "resolved") {
    assert.notEqual(clonedConstruction.components, sourceConstruction.components);
    assert.deepEqual(clonedConstruction, sourceConstruction);
  }
}

const makeBaseShirtAssignment = (): FabricGarmentAssignment => ({
  garmentKey: "base:shirt",
  code: "BASE_SHIRT",
  garmentType: "shirt",
  fabricUnits: 1,
  garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
  sourceRole: "main",
  dependencyStatus: "valid",
});

const makeAdditionalShirt = (
  existingAssignments: FabricGarmentAssignment[],
): FabricGarmentAssignment => {
  const result = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    existingAssignments:
      existingAssignments.length > 0
        ? existingAssignments
        : [makeBaseShirtAssignment()],
  });
  if (result.status !== "resolved" || !result.selection.garmentSpec) {
    throw new Error("Expected an additional Shirt selection.");
  }
  return {
    garmentKey: result.selection.garmentSpec.key,
    code: result.selection.code,
    garmentType: "shirt",
    fabricUnits: 1,
    garmentSpec: result.selection.garmentSpec,
    sourceRole: "additional",
    eligibilityRule: "catalog_all",
    dependencyStatus: "valid",
    mainGarmentKey: result.selection.mainGarmentKey,
    mainGarmentType: result.selection.mainGarmentType,
  };
};

const firstAdditional = makeAdditionalShirt([]);
const secondAdditional = makeAdditionalShirt([
  makeBaseShirtAssignment(),
  firstAdditional,
]);
const reconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection,
  additionalGarments: [firstAdditional],
  catalogInspection: catalog,
  existingState: undefined,
});

assert.deepEqual(
  resolveCompatibleGarmentScopedCopySources(
    reconciliation.subjects,
    "trouser",
  ),
  [],
  "copy is unavailable without an active same-type source",
);
assert.deepEqual(
  resolveCompatibleGarmentScopedCopySources(reconciliation.subjects, "shirt"),
  [
    { parentGarmentKey: "base:shirt", role: "main" },
    { parentGarmentKey: firstAdditional.garmentKey, role: "additional" },
  ],
  "multiple same-type occurrences remain explicit copy sources",
);

let sourceState = createEmptyGarmentScopedCustomDetailsState();
sourceState = setGarmentScopedCustomDetailSelection(
  sourceState,
  "base:shirt",
  "shirt_pockets",
  "shirt_pocket_1",
);
sourceState = setGarmentScopedCustomDetailSelection(
  sourceState,
  "base:shirt",
  "personalized_additional",
  "personalized_additional_evaluation",
);
sourceState = setGarmentScopedCustomDetailSelection(
  sourceState,
  "base:shirt",
  "shirt_construction",
  "shirt_std_short",
);

const copied = copyGarmentScopedCustomDetailsToAdditionalOccurrence({
  state: sourceState,
  sourceParentGarmentKey: "base:shirt",
  targetParentGarmentKey: secondAdditional.garmentKey,
  garmentType: "shirt",
  catalogInspection: catalog,
});
assert.equal(copied.status, "copied");
assert.equal(
  getGarmentScopedCustomDetailSelection(
    copied.state,
    secondAdditional.garmentKey,
    "shirt_pockets",
  ),
  "shirt_pocket_1",
  "valid current-catalogue selections copy to the independent occurrence",
);
assert.equal(
  getGarmentScopedCustomDetailSelection(
    copied.state,
    secondAdditional.garmentKey,
    "personalized_additional",
  ),
  undefined,
  "personalized requirements are never copied automatically",
);
assert.equal(
  getGarmentScopedCustomDetailSelection(
    copied.state,
    secondAdditional.garmentKey,
    "shirt_construction",
  ),
  undefined,
  "construction remains owned by the independent construction resolver",
);
assert.notEqual(
  copied.state.selectionsByGarmentKey[secondAdditional.garmentKey],
  copied.state.selectionsByGarmentKey["base:shirt"],
  "copied occurrences do not share selection objects",
);
assert.equal(
  getGarmentScopedCustomDetailSelection(
    copied.state,
    "base:shirt",
    "shirt_pockets",
  ),
  "shirt_pocket_1",
  "copying leaves the source occurrence unchanged",
);

let additionalSourceState = createEmptyGarmentScopedCustomDetailsState();
additionalSourceState = setGarmentScopedCustomDetailSelection(
  additionalSourceState,
  firstAdditional.garmentKey,
  "shirt_pockets",
  "shirt_pocket_1",
);
const copiedFromAdditional = copyGarmentScopedCustomDetailsToAdditionalOccurrence({
  state: additionalSourceState,
  sourceParentGarmentKey: firstAdditional.garmentKey,
  targetParentGarmentKey: secondAdditional.garmentKey,
  garmentType: "shirt",
  catalogInspection: catalog,
});
assert.equal(copiedFromAdditional.status, "copied");
assert.equal(
  getGarmentScopedCustomDetailSelection(
    copiedFromAdditional.state,
    secondAdditional.garmentKey,
    "shirt_pockets",
  ),
  "shirt_pocket_1",
  "an added garment can independently seed another same-type occurrence",
);

const invalidCopy = copyGarmentScopedCustomDetailsToAdditionalOccurrence({
  state: sourceState,
  sourceParentGarmentKey: "base:shirt",
  targetParentGarmentKey: "base:shirt",
  garmentType: "shirt",
  catalogInspection: catalog,
});
assert.equal(invalidCopy.status, "incompatible");
assert.deepEqual(invalidCopy.state, sourceState);

console.log("PASS: additional garment Custom Details copy sources and independent state");
