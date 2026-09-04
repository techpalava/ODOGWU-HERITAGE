import assert from "node:assert/strict";
import type { GuestDesignDraft } from "./src/types";
import {
  createDesignStylePersistenceAcknowledgement,
  DESIGN_STYLE_DRAFT_FIELD,
} from "./src/utils/designStyleDraftPersistence";
import type { PhysicalGarmentOccurrence } from "./src/utils/designSourceState";
import {
  coordinateUploadedSourceCleanup,
  createUploadedSourceCleanupCandidate,
} from "./src/utils/designStyleUploadedSourceCleanup";
import {
  assignUploadedDesignStyleToGarmentOccurrence,
  clearGarmentDesignStyleAssignment,
  createEmptyGarmentScopedDesignStyleAssignmentLedger,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
} from "./src/utils/garmentScopedDesignStyleAssignment";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";

const occurrence = (garmentKey: string, garmentType: "shirt" | "skirt", generation: number): PhysicalGarmentOccurrence => ({
  garmentKey,
  garmentType,
  occurrenceGeneration: generation,
  sourceRole: "main",
  fabricUnits: 1,
});
const target = (value: PhysicalGarmentOccurrence) => ({
  garmentKey: value.garmentKey,
  occurrenceToken: createPhysicalGarmentOccurrenceIdentityToken({
    garmentKey: value.garmentKey,
    generation: value.occurrenceGeneration!,
  }),
});
const assign = (
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2,
  occurrences: readonly PhysicalGarmentOccurrence[],
  value: PhysicalGarmentOccurrence,
  sourceRef: string,
) => {
  const result = assignUploadedDesignStyleToGarmentOccurrence({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences: occurrences,
    target: target(value),
    source: { sourceKey: `uploaded:${sourceRef}`, uploadedSourceRef: sourceRef },
  });
  assert.equal(result.status, "applied");
  return result.ledger;
};
const clear = (
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2,
  occurrences: readonly PhysicalGarmentOccurrence[],
  value: PhysicalGarmentOccurrence,
) => {
  const result = clearGarmentDesignStyleAssignment({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences: occurrences,
    target: target(value),
  });
  assert.equal(result.status, "applied");
  return result.ledger;
};
const acknowledgementFor = (ledger: GarmentScopedDesignStyleAssignmentLedgerV2, overrides = {}) =>
  createDesignStylePersistenceAcknowledgement({
    persistenceKind: "guest",
    draftIdentity: "guest",
    saveGeneration: 2,
    currentSaveGeneration: 2,
    identityGeneration: 3,
    currentIdentityGeneration: 3,
    persistedDraft: { [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 2, ledger } } as GuestDesignDraft,
    ...overrides,
  });
const safeProof = {
  referenceAuthorityStatus: "complete",
  currentDraftReferenceStatus: "not-referenced",
  ownershipStatus: "settled",
  ownershipTransferStatus: "settled",
  confirmationStatus: "settled",
  historySafetyStatus: "safe-to-delete",
} as const;

const shirt = occurrence("base:shirt", "shirt", 1);
const skirt = occurrence("base:skirt", "skirt", 2);
const occurrences = [shirt, skirt];
let initial = createEmptyGarmentScopedDesignStyleAssignmentLedger();
initial = assign(initial, occurrences, shirt, "source-A");
const detached = clear(initial, occurrences, shirt);
const candidate = createUploadedSourceCleanupCandidate({
  sourceRef: "source-A",
  reason: "detach",
  draftIdentity: "guest",
  expectedSaveGeneration: 2,
  expectedIdentityGeneration: 3,
  ledger: detached,
});
assert.ok(candidate);

let deletes = 0;
const run = (overrides: Partial<Parameters<typeof coordinateUploadedSourceCleanup>[0]> = {}) =>
  coordinateUploadedSourceCleanup({
    candidate,
    acknowledgement: acknowledgementFor(detached),
    currentSaveGeneration: 2,
    currentIdentityGeneration: 3,
    activeOccurrences: occurrences,
    lifecycleProof: safeProof,
    deleteCanonicalSource: async () => { deletes += 1; },
    ...overrides,
  });

// A/C: active reference or no acknowledgement cannot delete.
const referencedCandidate = createUploadedSourceCleanupCandidate({
  sourceRef: "source-A", reason: "detach", draftIdentity: "guest", expectedSaveGeneration: 2,
  expectedIdentityGeneration: 3, ledger: initial,
})!;
assert.equal((await run({
  candidate: referencedCandidate,
  acknowledgement: acknowledgementFor(initial),
})).status, "retained-source-still-present");
assert.equal((await run({ acknowledgement: null })).status, "retained-persistence-unproven");

// B/F: explicit sharing remains persisted and blocks deletion.
let shared = createEmptyGarmentScopedDesignStyleAssignmentLedger();
shared = assign(shared, occurrences, shirt, "source-A");
shared = assign(shared, occurrences, skirt, "source-A");
const sharedAfterDetach = clear(shared, occurrences, shirt);
const sharedCandidate = createUploadedSourceCleanupCandidate({
  sourceRef: "source-A", reason: "detach", draftIdentity: "guest", expectedSaveGeneration: 2,
  expectedIdentityGeneration: 3, ledger: sharedAfterDetach,
})!;
assert.equal((await run({ candidate: sharedCandidate, acknowledgement: acknowledgementFor(sharedAfterDetach) })).status, "retained-source-still-present");

// D/E/L: stale, fingerprint mismatch, and newer generations fail closed.
assert.equal((await run({ acknowledgement: acknowledgementFor(initial) })).status, "retained-persistence-unproven");
assert.equal((await run({ acknowledgement: acknowledgementFor(detached), currentSaveGeneration: 3 })).status, "retained-stale-persistence-proof");
assert.equal((await run({ candidate: { ...candidate, expectedFingerprint: "wrong" } })).status, "retained-persistence-unproven");

// G: production history remains unknown even after exact absence proof.
assert.equal((await run({ lifecycleProof: { ...safeProof, historySafetyStatus: "unknown" } })).status, "retained-history-unknown");

// H: only an injected complete authority can reach physical deletion.
assert.equal((await run()).status, "deleted");
assert.equal(deletes, 1);

// I: a physical failure never changes the already-detached ledger.
assert.equal((await run({ deleteCanonicalSource: async () => { throw new Error("storage failed"); } })).status, "deletion-failed");
assert.equal(detached.assignmentsByGarmentKey[shirt.garmentKey], undefined);

// J/K: replacement and detach candidates remain unproved before acknowledgement.
const replacement = assign(initial, occurrences, shirt, "source-B");
const replacementCandidate = createUploadedSourceCleanupCandidate({
  sourceRef: "source-A", reason: "replacement", draftIdentity: "guest", expectedSaveGeneration: 2,
  expectedIdentityGeneration: 3, ledger: replacement,
})!;
assert.equal((await run({ candidate: replacementCandidate, acknowledgement: null })).status, "retained-persistence-unproven");
assert.equal((await run({ acknowledgement: null })).status, "retained-persistence-unproven");

console.log("Uploaded source cleanup coordinator tests passed.");
