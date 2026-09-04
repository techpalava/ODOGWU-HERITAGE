import assert from "node:assert/strict";
import type { CanonicalPhysicalGarmentType } from "./src/types";
import type { PhysicalGarmentOccurrence } from "./src/utils/designSourceState";
import {
  assignCatalogDesignStyleToGarmentOccurrence,
  assignUploadedDesignStyleToGarmentOccurrence,
  createEmptyGarmentScopedDesignStyleAssignmentLedger,
  reconcileGarmentScopedDesignStyleAssignmentLedger,
  type GarmentDesignStyleAssignmentTarget,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
} from "./src/utils/garmentScopedDesignStyleAssignment";
import {
  applyDesignStyleUploadOperation,
  beginDesignStyleUploadOperation,
  createDesignStyleUploadOperationState,
  failDesignStyleUploadOperation,
  validateDesignStyleUploadOperationCallback,
  type BeginDesignStyleUploadOperationResult,
  type DesignStyleUploadOperationState,
} from "./src/utils/designStyleUploadOperation";
import {
  applyDesignStyleUploadForActiveOccurrence,
  beginDesignStyleUploadForActiveOccurrence,
} from "./src/utils/designStyleStepRuntime";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";

const occurrence = (
  garmentKey: string,
  garmentType: CanonicalPhysicalGarmentType,
  occurrenceGeneration: number,
): PhysicalGarmentOccurrence => ({
  garmentKey,
  garmentType,
  occurrenceGeneration,
  sourceRole: "main",
  fabricUnits: 1,
});

const targetFor = (
  value: PhysicalGarmentOccurrence,
): GarmentDesignStyleAssignmentTarget => ({
  garmentKey: value.garmentKey,
  occurrenceToken: createPhysicalGarmentOccurrenceIdentityToken({
    garmentKey: value.garmentKey,
    generation: value.occurrenceGeneration!,
  }),
});

const uploadedSource = (suffix: string) => ({
  sourceKey: `uploaded:source-${suffix}`,
  uploadedSourceRef: `private-upload-reference-${suffix}`,
});

const assignCatalog = ({
  ledger,
  activeOccurrences,
  target,
  styleId,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  target: GarmentDesignStyleAssignmentTarget;
  styleId: string;
}): GarmentScopedDesignStyleAssignmentLedgerV2 => {
  const result = assignCatalogDesignStyleToGarmentOccurrence({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences,
    target,
    source: {
      sourceKey: `catalog:${styleId}`,
      catalogStyleId: styleId,
      eligibilityFingerprint: `${styleId}:eligibility:v1`,
    },
  });
  assert.equal(result.status, "applied");
  return result.ledger;
};

const assignUploaded = ({
  ledger,
  activeOccurrences,
  target,
  suffix,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  target: GarmentDesignStyleAssignmentTarget;
  suffix: string;
}): GarmentScopedDesignStyleAssignmentLedgerV2 => {
  const result = assignUploadedDesignStyleToGarmentOccurrence({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences,
    target,
    source: uploadedSource(suffix),
  });
  assert.equal(result.status, "applied");
  return result.ledger;
};

const expectBegun = (
  result: BeginDesignStyleUploadOperationResult,
): Extract<BeginDesignStyleUploadOperationResult, { status: "begun" }> => {
  assert.equal(result.status, "begun");
  return result as Extract<
    BeginDesignStyleUploadOperationResult,
    { status: "begun" }
  >;
};

const begin = ({
  state,
  ledger,
  activeOccurrences,
  target,
  operationKind,
}: {
  state: DesignStyleUploadOperationState;
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  target: GarmentDesignStyleAssignmentTarget;
  operationKind: "assign" | "replace";
}) =>
  expectBegun(
    beginDesignStyleUploadOperation({
      state,
      ledger,
      activeOccurrences,
      target,
      operationKind,
    }),
  );

// A. An exact callback crosses the Task 5D runtime bridge and applies through
// Task 5A to the intended occurrence only.
{
  const shirt = occurrence("base:shirt:1", "shirt", 1);
  const skirt = occurrence("base:skirt:1", "skirt", 2);
  const activeOccurrences = [shirt, skirt];
  const shirtTarget = targetFor(shirt);
  const skirtTarget = targetFor(skirt);
  let ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences,
    target: skirtTarget,
    styleId: "skirt-style",
  });
  const previousSkirt = ledger.assignmentsByGarmentKey[skirt.garmentKey];
  const started = expectBegun(
    beginDesignStyleUploadForActiveOccurrence({
      state: createDesignStyleUploadOperationState(),
      ledger,
      activeOccurrences,
      activeTarget: shirtTarget,
      operationKind: "assign",
    }),
  );
  assert.equal(started.ledger, ledger);
  assert.equal(Object.isFrozen(started.ticket), true);
  assert.deepEqual(started.ticket, {
    garmentKey: shirt.garmentKey,
    occurrenceToken: shirtTarget.occurrenceToken,
    expectedLedgerRevision: ledger.revision,
    operationGeneration: 1,
    operationKind: "assign",
  });
  const applied = applyDesignStyleUploadForActiveOccurrence({
    state: started.state,
    ticket: started.ticket,
    ledger,
    activeOccurrences,
    activeTarget: shirtTarget,
    operationKind: "assign",
    source: uploadedSource("shirt-a"),
  });
  assert.equal(applied.status, "accepted");
  assert.equal(applied.assignmentResult.status, "applied");
  ledger = applied.ledger;
  assert.equal(
    ledger.assignmentsByGarmentKey[shirt.garmentKey]?.sourceKind,
    "uploaded",
  );
  assert.equal(
    ledger.assignmentsByGarmentKey[skirt.garmentKey],
    previousSkirt,
  );
}

// B. Beginning a replacement preserves the previous catalogue assignment.
{
  const shirt = occurrence("base:shirt:1", "shirt", 1);
  const activeOccurrences = [shirt];
  const target = targetFor(shirt);
  const ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences,
    target,
    styleId: "current-catalogue-style",
  });
  const previousAssignment = ledger.assignmentsByGarmentKey[shirt.garmentKey];
  const started = begin({
    state: createDesignStyleUploadOperationState(),
    ledger,
    activeOccurrences,
    target,
    operationKind: "replace",
  });
  assert.equal(started.ledger, ledger);
  assert.equal(
    started.ledger.assignmentsByGarmentKey[shirt.garmentKey],
    previousAssignment,
  );
}

// C. External failure consumes only the pending operation and preserves the
// existing uploaded target and catalogue sibling by exact reference.
{
  const shirt = occurrence("base:shirt:1", "shirt", 1);
  const skirt = occurrence("base:skirt:1", "skirt", 2);
  const activeOccurrences = [shirt, skirt];
  let ledger = assignUploaded({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences,
    target: targetFor(shirt),
    suffix: "shirt-current",
  });
  ledger = assignCatalog({
    ledger,
    activeOccurrences,
    target: targetFor(skirt),
    styleId: "skirt-current",
  });
  const previousShirt = ledger.assignmentsByGarmentKey[shirt.garmentKey];
  const previousSkirt = ledger.assignmentsByGarmentKey[skirt.garmentKey];
  const started = begin({
    state: createDesignStyleUploadOperationState(),
    ledger,
    activeOccurrences,
    target: targetFor(shirt),
    operationKind: "replace",
  });
  const failed = failDesignStyleUploadOperation({
    state: started.state,
    ticket: started.ticket,
    ledger,
    reason: "external-operation-failed",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.ledger, ledger);
  assert.equal(failed.ledger.assignmentsByGarmentKey[shirt.garmentKey], previousShirt);
  assert.equal(failed.ledger.assignmentsByGarmentKey[skirt.garmentKey], previousSkirt);
  assert.equal(
    validateDesignStyleUploadOperationCallback({
      state: failed.state,
      ticket: started.ticket,
      ledger,
      activeOccurrences,
      callbackTarget: targetFor(shirt),
      callbackOperationKind: "replace",
    }).status,
    "rejected",
  );
}

// D. A ledger revision advance rejects the old callback without changing the
// new current ledger.
{
  const shirt = occurrence("base:shirt:1", "shirt", 1);
  const skirt = occurrence("base:skirt:1", "skirt", 2);
  const activeOccurrences = [shirt, skirt];
  const initialLedger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  const started = begin({
    state: createDesignStyleUploadOperationState(),
    ledger: initialLedger,
    activeOccurrences,
    target: targetFor(shirt),
    operationKind: "assign",
  });
  const currentLedger = assignCatalog({
    ledger: initialLedger,
    activeOccurrences,
    target: targetFor(skirt),
    styleId: "newer-skirt-style",
  });
  const rejected = applyDesignStyleUploadOperation({
    state: started.state,
    ticket: started.ticket,
    ledger: currentLedger,
    activeOccurrences,
    callbackTarget: targetFor(shirt),
    callbackOperationKind: "assign",
    source: uploadedSource("stale-ledger"),
  });
  assert.deepEqual(rejected, {
    status: "rejected",
    reason: "stale-ledger-revision",
    state: started.state,
    ledger: currentLedger,
  });
  assert.equal(rejected.ledger, currentLedger);
}

// E. Removal is reported as missing, and re-adding the same key with a new
// occurrence token rejects the token-1 callback without assigning token 2.
{
  const original = occurrence("base:shirt:1", "shirt", 1);
  const originalTarget = targetFor(original);
  const ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  const started = begin({
    state: createDesignStyleUploadOperationState(),
    ledger,
    activeOccurrences: [original],
    target: originalTarget,
    operationKind: "assign",
  });
  const missing = validateDesignStyleUploadOperationCallback({
    state: started.state,
    ticket: started.ticket,
    ledger,
    activeOccurrences: [],
    callbackTarget: originalTarget,
    callbackOperationKind: "assign",
  });
  assert.deepEqual(missing, {
    status: "rejected",
    reason: "missing-occurrence",
  });
  const readded = occurrence("base:shirt:1", "shirt", 2);
  const rejected = applyDesignStyleUploadOperation({
    state: started.state,
    ticket: started.ticket,
    ledger,
    activeOccurrences: [readded],
    callbackTarget: originalTarget,
    callbackOperationKind: "assign",
    source: uploadedSource("aba"),
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reason, "stale-occurrence-token");
  assert.equal(rejected.ledger, ledger);
  assert.equal(
    rejected.ledger.assignmentsByGarmentKey[readded.garmentKey],
    undefined,
  );
}

// F. A newer same-occurrence operation invalidates generation 1; generation 2
// remains current and may apply.
{
  const shirt = occurrence("base:shirt:1", "shirt", 1);
  const activeOccurrences = [shirt];
  const target = targetFor(shirt);
  const ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  const first = begin({
    state: createDesignStyleUploadOperationState(),
    ledger,
    activeOccurrences,
    target,
    operationKind: "assign",
  });
  const second = begin({
    state: first.state,
    ledger,
    activeOccurrences,
    target,
    operationKind: "assign",
  });
  assert.equal(first.ticket.operationGeneration, 1);
  assert.equal(second.ticket.operationGeneration, 2);
  const stale = applyDesignStyleUploadOperation({
    state: second.state,
    ticket: first.ticket,
    ledger,
    activeOccurrences,
    callbackTarget: target,
    callbackOperationKind: "assign",
    source: uploadedSource("generation-one"),
  });
  assert.equal(stale.status, "rejected");
  assert.equal(stale.reason, "stale-operation-generation");
  assert.equal(stale.ledger, ledger);
  const current = applyDesignStyleUploadOperation({
    state: second.state,
    ticket: second.ticket,
    ledger,
    activeOccurrences,
    callbackTarget: target,
    callbackOperationKind: "assign",
    source: uploadedSource("generation-two"),
  });
  assert.equal(current.status, "accepted");
  assert.equal(current.assignmentResult.status, "applied");
}

// G. Callback target and operation kind must match the immutable ticket;
// another occurrence, including another Shirt, cannot be mutated.
{
  const shirt = occurrence("base:shirt:1", "shirt", 1);
  const shirtTwo = occurrence("base:shirt:2", "shirt", 2);
  const skirt = occurrence("base:skirt:1", "skirt", 3);
  const activeOccurrences = [shirt, shirtTwo, skirt];
  const ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  const started = begin({
    state: createDesignStyleUploadOperationState(),
    ledger,
    activeOccurrences,
    target: targetFor(shirt),
    operationKind: "assign",
  });
  for (const wrongTarget of [targetFor(shirtTwo), targetFor(skirt)]) {
    const rejected = applyDesignStyleUploadOperation({
      state: started.state,
      ticket: started.ticket,
      ledger,
      activeOccurrences,
      callbackTarget: wrongTarget,
      callbackOperationKind: "assign",
      source: uploadedSource("wrong-target"),
    });
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.reason, "wrong-target");
    assert.equal(rejected.ledger, ledger);
  }
  const wrongKind = applyDesignStyleUploadOperation({
    state: started.state,
    ticket: started.ticket,
    ledger,
    activeOccurrences,
    callbackTarget: targetFor(shirt),
    callbackOperationKind: "replace",
    source: uploadedSource("wrong-kind"),
  });
  assert.equal(wrongKind.status, "rejected");
  assert.equal(wrongKind.reason, "invalid-operation-kind");
  assert.deepEqual(ledger.assignmentsByGarmentKey, {});
}

// H. Repeated Shirt occurrences remain exact; Shirt 2 changes while Shirt 1
// and Shirt 3 retain their independent assignments.
{
  const shirt = occurrence("base:shirt:1", "shirt", 1);
  const shirtTwo = occurrence("base:shirt:2", "shirt", 2);
  const shirtThree = occurrence("base:shirt:3", "shirt", 3);
  const activeOccurrences = [shirt, shirtTwo, shirtThree];
  let ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences,
    target: targetFor(shirt),
    styleId: "shirt-one-style",
  });
  ledger = assignCatalog({
    ledger,
    activeOccurrences,
    target: targetFor(shirtThree),
    styleId: "shirt-three-style",
  });
  const shirtOneAssignment = ledger.assignmentsByGarmentKey[shirt.garmentKey];
  const shirtThreeAssignment =
    ledger.assignmentsByGarmentKey[shirtThree.garmentKey];
  const started = begin({
    state: createDesignStyleUploadOperationState(),
    ledger,
    activeOccurrences,
    target: targetFor(shirtTwo),
    operationKind: "assign",
  });
  const applied = applyDesignStyleUploadOperation({
    state: started.state,
    ticket: started.ticket,
    ledger,
    activeOccurrences,
    callbackTarget: targetFor(shirtTwo),
    callbackOperationKind: "assign",
    source: uploadedSource("shirt-two"),
  });
  assert.equal(applied.status, "accepted");
  assert.equal(
    applied.ledger.assignmentsByGarmentKey[shirt.garmentKey],
    shirtOneAssignment,
  );
  assert.equal(
    applied.ledger.assignmentsByGarmentKey[shirtThree.garmentKey],
    shirtThreeAssignment,
  );
  assert.equal(
    applied.ledger.assignmentsByGarmentKey[shirtTwo.garmentKey]?.sourceKind,
    "uploaded",
  );
  const reconciled = reconcileGarmentScopedDesignStyleAssignmentLedger({
    ledger: applied.ledger,
    activeOccurrences,
  });
  assert.notEqual(reconciled.status, "blocked");
}

console.log(
  "PASS: occurrence-targeted Design Style upload operation identity and stale-callback guards",
);
