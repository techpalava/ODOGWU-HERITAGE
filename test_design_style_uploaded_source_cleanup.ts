import assert from "node:assert/strict";
import type { CustomerDesignUploadReference, GuestDesignDraft } from "./src/types";
import {
  createDesignStylePersistenceAcknowledgement,
  DESIGN_STYLE_DRAFT_FIELD,
} from "./src/utils/designStyleDraftPersistence";
import type { PhysicalGarmentOccurrence } from "./src/utils/designSourceState";
import {
  coordinateUploadedSourceCleanup,
  createUploadedSourceCleanupCandidate,
} from "./src/utils/designStyleUploadedSourceCleanup";
import { deleteUploadedDesignCanonicalSource } from "./src/utils/uploadedDesignDeletionOrchestration";
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
assert.equal((await run({ lifecycleProof: { ...safeProof, historySafetyStatus: "retain" } })).status, "retained-lifecycle-incomplete");

// H: ownership, transfer, and confirmation are all independent fail-closed proofs.
assert.equal((await run({ lifecycleProof: { ...safeProof, ownershipStatus: "unknown" } })).status, "retained-ownership-unresolved");
assert.equal((await run({ lifecycleProof: { ...safeProof, ownershipTransferStatus: "unknown" } })).status, "retained-ownership-unresolved");
assert.equal((await run({ lifecycleProof: { ...safeProof, confirmationStatus: "unknown" } })).status, "retained-lifecycle-incomplete");

// I: only an injected complete authority can reach physical deletion exactly once.
assert.equal((await run()).status, "deleted");
assert.equal(deletes, 1);

// J: a physical failure never changes the already-detached ledger.
assert.equal((await run({ deleteCanonicalSource: async () => { throw new Error("storage failed"); } })).status, "deletion-failed");
assert.equal(detached.assignmentsByGarmentKey[shirt.garmentKey], undefined);

// K: replacement cannot delete A before its post-replacement ledger is persisted.
const replacement = assign(initial, occurrences, shirt, "source-B");
const replacementCandidate = createUploadedSourceCleanupCandidate({
  sourceRef: "source-A", reason: "replacement", draftIdentity: "guest", expectedSaveGeneration: 2,
  expectedIdentityGeneration: 3, ledger: replacement,
})!;
assert.equal((await run({ candidate: replacementCandidate, acknowledgement: null })).status, "retained-persistence-unproven");
assert.equal((await run({ acknowledgement: null })).status, "retained-persistence-unproven");

// L: only persisted replacement A is eligible; B remains independently referenced.
const replacementResult = await run({
  candidate: replacementCandidate,
  acknowledgement: acknowledgementFor(replacement),
});
assert.deepEqual(replacementResult, { status: "deleted", sourceRef: "source-A" });
assert.equal(deletes, 2);
const replacementAssignment = replacement.assignmentsByGarmentKey[shirt.garmentKey];
assert.equal(replacementAssignment?.sourceKind, "uploaded");
if (replacementAssignment?.sourceKind !== "uploaded") {
  throw new Error("expected replacement B to remain an uploaded assignment");
}
assert.equal(replacementAssignment.uploadedSourceRef, "source-B");

// M: physical deletion receives only the exact canonical reference, not a path.
const canonicalReference: CustomerDesignUploadReference = {
  designReferenceId: "source-A",
  ownerUid: "owner-A",
  storagePath: "customer-designs/owner-A/source-A.png",
  mimeType: "image/png",
  createdAt: "2026-01-01T00:00:00.000Z",
};
let deletedReference: typeof canonicalReference | null = null;
assert.deepEqual(
  await deleteUploadedDesignCanonicalSource({
    reference: canonicalReference,
    deleteDraft: async (reference) => { deletedReference = reference; },
  }),
  { status: "deleted" },
);
assert.strictEqual(deletedReference, canonicalReference);

console.log("Uploaded source cleanup coordinator tests passed.");
