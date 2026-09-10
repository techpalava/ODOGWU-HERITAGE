import assert from "node:assert/strict";
import type { GuestDesignDraft } from "./src/types";
import { createDesignStylePersistenceAcknowledgement, DESIGN_STYLE_DRAFT_FIELD } from "./src/utils/designStyleDraftPersistence";
import { coordinateUploadedSourceCleanup, createUploadedSourceCleanupCandidate } from "./src/utils/designStyleUploadedSourceCleanup";
import { createEmptyGarmentScopedDesignStyleAssignmentLedger } from "./src/utils/garmentScopedDesignStyleAssignment";

const ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
const candidate = createUploadedSourceCleanupCandidate({
  sourceRef: "history-cleanup-source", reason: "detach", draftIdentity: "guest",
  expectedSaveGeneration: 1, expectedIdentityGeneration: 1, ledger,
});
assert.ok(candidate);
const acknowledgement = createDesignStylePersistenceAcknowledgement({
  persistenceKind: "guest", draftIdentity: "guest", saveGeneration: 1, currentSaveGeneration: 1,
  identityGeneration: 1, currentIdentityGeneration: 1,
  persistedDraft: { [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 2, ledger } } as GuestDesignDraft,
});
let deletes = 0;
const run = (historySafetyStatus: "safe-to-delete" | "retain" | "unknown") =>
  coordinateUploadedSourceCleanup({
    candidate: candidate!, acknowledgement, currentSaveGeneration: 1, currentIdentityGeneration: 1,
    activeOccurrences: [],
    lifecycleProof: {
      referenceAuthorityStatus: "complete", currentDraftReferenceStatus: "not-referenced",
      ownershipStatus: "unknown", ownershipTransferStatus: "unknown", confirmationStatus: "unknown",
      historySafetyStatus,
    },
    deleteCanonicalSource: async () => { deletes += 1; },
  });

assert.equal((await run("retain")).status, "retained-ownership-unresolved");
assert.equal((await run("unknown")).status, "retained-history-unknown");
assert.equal((await run("safe-to-delete")).status, "retained-ownership-unresolved");
assert.equal(deletes, 0, "history evidence alone must not call low-level deletion");

console.log("PASS: Task 5F-F2 history cleanup integration remains fail-closed");
