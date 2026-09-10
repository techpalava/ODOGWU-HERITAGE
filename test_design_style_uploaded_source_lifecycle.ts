import assert from "node:assert/strict";
import type { CanonicalPhysicalGarmentType } from "./src/types";
import type { PhysicalGarmentOccurrence } from "./src/utils/designSourceState";
import {
  buildUploadedSourceReferenceIndex,
  evaluateUploadedSourceDeletionEligibility,
  getUploadedSourceReferenceState,
  projectUploadedSourceOccurrenceDetach,
} from "./src/utils/designStyleUploadedSourceLifecycle";
import {
  assignUploadedDesignStyleToGarmentOccurrence,
  createEmptyGarmentScopedDesignStyleAssignmentLedger,
  type GarmentDesignStyleAssignmentTarget,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
} from "./src/utils/garmentScopedDesignStyleAssignment";
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

const assign = ({
  ledger,
  activeOccurrences,
  occurrence: targetOccurrence,
  sourceRef,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  occurrence: PhysicalGarmentOccurrence;
  sourceRef: string;
}): GarmentScopedDesignStyleAssignmentLedgerV2 => {
  const result = assignUploadedDesignStyleToGarmentOccurrence({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences,
    target: targetFor(targetOccurrence),
    source: {
      sourceKey: `uploaded:${sourceRef}`,
      uploadedSourceRef: sourceRef,
    },
  });
  assert.equal(result.status, "applied");
  return result.ledger;
};

const completeSafeProof = {
  referenceAuthorityStatus: "complete",
  currentDraftReferenceStatus: "not-referenced",
  ownershipStatus: "settled",
  ownershipTransferStatus: "settled",
  confirmationStatus: "settled",
  historySafetyStatus: "safe-to-delete",
} as const;

// A. One canonical source referenced by one exact occurrence is retained.
{
  const shirt = occurrence("base:shirt:1", "shirt", 1);
  const ledger = assign({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [shirt],
    occurrence: shirt,
    sourceRef: "source-a",
  });
  const index = buildUploadedSourceReferenceIndex({
    ledger,
    activeOccurrences: [shirt],
  });
  const state = getUploadedSourceReferenceState({ index, sourceRef: "source-a" });
  assert.equal(state.status, "ready");
  assert.equal(state.referenceCount, 1);
  assert.equal(state.classification, "single-reference");
  const deletion = evaluateUploadedSourceDeletionEligibility({
    index,
    sourceRef: "source-a",
    proof: completeSafeProof,
  });
  assert.equal(deletion.status, "retain");
  assert.deepEqual(deletion.reasons, ["ACTIVE_OCCURRENCE_REFERENCE"]);
}

// B. Explicit sharing survives detaching only one of two references.
{
  const shirt = occurrence("base:shirt:1", "shirt", 1);
  const skirt = occurrence("base:skirt:1", "skirt", 2);
  const activeOccurrences = [shirt, skirt];
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assign({ ledger, activeOccurrences, occurrence: shirt, sourceRef: "shared" });
  ledger = assign({ ledger, activeOccurrences, occurrence: skirt, sourceRef: "shared" });
  const index = buildUploadedSourceReferenceIndex({ ledger, activeOccurrences });
  const shared = getUploadedSourceReferenceState({ index, sourceRef: "shared" });
  assert.equal(shared.status, "ready");
  assert.equal(shared.referenceCount, 2);
  assert.equal(shared.classification, "multi-reference");
  const detach = projectUploadedSourceOccurrenceDetach({
    index,
    sourceRef: "shared",
    target: targetFor(shirt),
  });
  assert.deepEqual(detach, {
    status: "detachable",
    sourceRef: "shared",
    referenceCountBefore: 2,
    referenceCountAfter: 1,
    classificationAfter: "single-reference",
    physicalDeletionAuthorized: false,
  });
}

// C. Repeated garment types remain distinct exact references when sharing.
{
  const shirtOne = occurrence("base:shirt:1", "shirt", 1);
  const shirtTwo = occurrence("additional:shirt:1", "shirt", 2);
  const activeOccurrences = [shirtOne, shirtTwo];
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assign({ ledger, activeOccurrences, occurrence: shirtOne, sourceRef: "shared-shirt" });
  ledger = assign({ ledger, activeOccurrences, occurrence: shirtTwo, sourceRef: "shared-shirt" });
  const index = buildUploadedSourceReferenceIndex({ ledger, activeOccurrences });
  const state = getUploadedSourceReferenceState({ index, sourceRef: "shared-shirt" });
  assert.equal(state.status, "ready");
  assert.deepEqual(
    state.references.map((reference) => reference.garmentKey),
    [shirtOne.garmentKey, shirtTwo.garmentKey],
  );
  assert.notEqual(state.references[0]?.occurrenceToken, state.references[1]?.occurrenceToken);
}

// D. Different source refs remain isolated across garments.
{
  const shirt = occurrence("base:shirt:1", "shirt", 1);
  const skirt = occurrence("base:skirt:1", "skirt", 2);
  const activeOccurrences = [shirt, skirt];
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assign({ ledger, activeOccurrences, occurrence: shirt, sourceRef: "source-shirt" });
  ledger = assign({ ledger, activeOccurrences, occurrence: skirt, sourceRef: "source-skirt" });
  const index = buildUploadedSourceReferenceIndex({ ledger, activeOccurrences });
  const shirtState = getUploadedSourceReferenceState({ index, sourceRef: "source-shirt" });
  const skirtState = getUploadedSourceReferenceState({ index, sourceRef: "source-skirt" });
  assert.equal(shirtState.status, "ready");
  assert.equal(skirtState.status, "ready");
  assert.equal(shirtState.status === "ready" ? shirtState.referenceCount : null, 1);
  assert.equal(skirtState.status === "ready" ? skirtState.referenceCount : null, 1);
}

// E. Zero occurrence references do not authorize deletion when history is unknown.
{
  const index = buildUploadedSourceReferenceIndex({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [],
  });
  const deletion = evaluateUploadedSourceDeletionEligibility({
    index,
    sourceRef: "detached-source",
    proof: { ...completeSafeProof, historySafetyStatus: "unknown" },
  });
  assert.equal(deletion.status, "retain");
  assert.deepEqual(deletion.reasons, ["HISTORY_SAFETY_UNKNOWN"]);
}

// F. Zero references plus every explicit safe proof is deletion-eligible.
{
  const index = buildUploadedSourceReferenceIndex({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [],
  });
  const deletion = evaluateUploadedSourceDeletionEligibility({
    index,
    sourceRef: "safe-source",
    proof: completeSafeProof,
  });
  assert.deepEqual(deletion, {
    status: "eligible-for-deletion",
    sourceRef: "safe-source",
    referenceCount: 0,
    reasons: [],
    deletionEligible: true,
  });
}

// G. Missing proof authorities fail closed.
{
  const index = buildUploadedSourceReferenceIndex({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [],
  });
  const deletion = evaluateUploadedSourceDeletionEligibility({
    index,
    sourceRef: "unknown-source",
    proof: {},
  });
  assert.equal(deletion.status, "retain");
  assert.equal(deletion.deletionEligible, false);
  assert.ok(deletion.reasons.includes("REFERENCE_AUTHORITY_INCOMPLETE"));
  assert.ok(deletion.reasons.includes("OWNERSHIP_UNRESOLVED"));
  assert.ok(deletion.reasons.includes("HISTORY_SAFETY_UNKNOWN"));
}

// H. A stale token is excluded after remove/re-add identity reconciliation.
{
  const oldShirt = occurrence("base:shirt:1", "shirt", 1);
  const newShirt = occurrence("base:shirt:1", "shirt", 2);
  const ledger = assign({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [oldShirt],
    occurrence: oldShirt,
    sourceRef: "stale-source",
  });
  const index = buildUploadedSourceReferenceIndex({
    ledger,
    activeOccurrences: [newShirt],
  });
  assert.equal(index.status, "ready");
  const staleState = getUploadedSourceReferenceState({ index, sourceRef: "stale-source" });
  assert.equal(staleState.status, "ready");
  assert.equal(staleState.status === "ready" ? staleState.referenceCount : null, 0);
  assert.equal(index.excludedAssignments[0]?.reason, "STALE_OCCURRENCE_TOKEN");
}

// I. Equal-looking preview metadata cannot merge distinct opaque source refs.
{
  const shirt = occurrence("base:shirt:1", "shirt", 1);
  const skirt = occurrence("base:skirt:1", "skirt", 2);
  const identicalPreviewMetadata = { fileName: "design.png", previewUrl: "blob:same" };
  assert.deepEqual(identicalPreviewMetadata, { fileName: "design.png", previewUrl: "blob:same" });
  const activeOccurrences = [shirt, skirt];
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assign({ ledger, activeOccurrences, occurrence: shirt, sourceRef: "opaque-a" });
  ledger = assign({ ledger, activeOccurrences, occurrence: skirt, sourceRef: "opaque-b" });
  const index = buildUploadedSourceReferenceIndex({ ledger, activeOccurrences });
  assert.equal(index.status, "ready");
  assert.deepEqual(Object.keys(index.entriesBySourceRef).sort(), ["opaque-a", "opaque-b"]);
  assert.equal(index.entriesBySourceRef["opaque-a"]?.classification, "single-reference");
  assert.equal(index.entriesBySourceRef["opaque-b"]?.classification, "single-reference");
}

console.log("design style uploaded source lifecycle tests passed");
