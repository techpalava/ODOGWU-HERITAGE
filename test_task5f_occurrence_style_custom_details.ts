import assert from "node:assert/strict";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  reconcileGarmentScopedCustomDetails,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import {
  createEmptyGarmentScopedCustomDetailsState,
  removeGarmentScopedCustomDetails,
} from "./src/utils/garmentScopedCustomDetailsState";
import {
  removeExactGarmentDesignStyleAssignment,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
} from "./src/utils/garmentScopedDesignStyleAssignment";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const selection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "skirt"],
  selectedDemographic: "female",
  normalizedCustomDetailCatalog: [],
}).selection;

const ledger: GarmentScopedDesignStyleAssignmentLedgerV2 = {
  schemaVersion: 2,
  revision: 3,
  assignmentsByGarmentKey: {
    "base:shirt": {
      garmentKey: "base:shirt",
      occurrenceToken: "base:shirt#1",
      assignmentRevision: 1,
      sourceKind: "catalog",
      sourceKey: "catalog-style:style-a",
      catalogStyleId: "style-a",
      eligibilityFingerprint: "eligible-a",
    },
    "base:skirt": {
      garmentKey: "base:skirt",
      occurrenceToken: "base:skirt#1",
      assignmentRevision: 2,
      sourceKind: "uploaded",
      sourceKey: "uploaded:source-c",
      uploadedSourceRef: "source-c",
    },
  },
};

const reconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: selection,
  catalogInspection: inspectCustomDetailCatalog([]),
  existingState: createEmptyGarmentScopedCustomDetailsState(),
  designStyleOccurrences: [
    {
      target: { garmentKey: "base:shirt", occurrenceToken: "base:shirt#1" },
      assignment: ledger.assignmentsByGarmentKey["base:shirt"],
      status: "complete",
    },
    {
      target: { garmentKey: "base:skirt", occurrenceToken: "base:skirt#1" },
      assignment: ledger.assignmentsByGarmentKey["base:skirt"],
      status: "complete",
    },
  ],
});

assert.deepEqual(
  reconciliation.subjects.find((subject) => subject.garmentKey === "base:shirt")
    ?.designStyleContext,
  {
    status: "catalogue",
    occurrenceToken: "base:shirt#1",
    sourceKey: "catalog-style:style-a",
    catalogStyleId: "style-a",
  },
);
assert.deepEqual(
  reconciliation.subjects.find((subject) => subject.garmentKey === "base:skirt")
    ?.designStyleContext,
  {
    status: "uploaded",
    occurrenceToken: "base:skirt#1",
    sourceKey: "uploaded:source-c",
    uploadedSourceRef: "source-c",
  },
);

const removed = removeExactGarmentDesignStyleAssignment({
  ledger,
  expectedLedgerRevision: ledger.revision,
  target: { garmentKey: "base:skirt", occurrenceToken: "base:skirt#1" },
});
assert.equal(removed.status, "applied");
assert.deepEqual(Object.keys(removed.ledger.assignmentsByGarmentKey), ["base:shirt"]);
assert.equal(
  removeExactGarmentDesignStyleAssignment({
    ledger: removed.ledger,
    expectedLedgerRevision: removed.ledger.revision,
    target: { garmentKey: "base:shirt", occurrenceToken: "base:skirt#1" },
  }).status,
  "rejected",
  "a stale removed-occurrence token cannot affect the surviving shirt",
);
assert.deepEqual(
  Object.keys(
    removeGarmentScopedCustomDetails(
      createEmptyGarmentScopedCustomDetailsState(),
      "base:skirt",
    ).selectionsByGarmentKey,
  ),
  [],
);

console.log("PASS: Task 5F exact occurrence Design Style Custom Details boundary");
