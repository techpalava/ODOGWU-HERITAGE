import assert from "node:assert/strict";
import type { FabricAllocationState, FabricGarmentAssignment } from "./src/types";
import {
  createSummaryEditReturnLease,
  isSummaryEditReturnLeaseActive,
  shouldConsumeSummaryEditReturnOnContinue,
} from "./src/utils/designStudioSummaryEditReturn";
import { cancelFutureFabricCatalogueAssignment } from "./src/utils/designStudioFutureFabricStage";
import {
  assignCatalogDesignStyleToGarmentOccurrence,
  clearGarmentDesignStyleAssignment,
  createEmptyGarmentScopedDesignStyleAssignmentLedger,
} from "./src/utils/garmentScopedDesignStyleAssignment";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";
import type { PhysicalGarmentOccurrence } from "./src/utils/designSourceState";

const sessionIdentityKey = "test-session";

{
  const lease = createSummaryEditReturnLease({
    returnStageId: "summary",
    focusStageId: "fabric",
    focusGarmentKey: "base:shirt",
    generation: 3,
    sessionIdentityKey,
  });
  assert.equal(lease.kind, "summary_edit_return");
  assert.equal(lease.focusGarmentKey, "base:shirt");
  assert.equal(
    isSummaryEditReturnLeaseActive({
      lease,
      generation: 3,
      sessionIdentityKey,
      currentStageId: "fabric",
    }),
    true,
  );
  assert.equal(
    isSummaryEditReturnLeaseActive({
      lease,
      generation: 3,
      sessionIdentityKey,
      currentStageId: "summary",
    }),
    false,
  );
  assert.equal(
    shouldConsumeSummaryEditReturnOnContinue({
      lease,
      generation: 3,
      sessionIdentityKey,
      currentStageId: "fabric",
    }),
    true,
  );
  assert.equal(
    shouldConsumeSummaryEditReturnOnContinue({
      lease,
      generation: 4,
      sessionIdentityKey,
      currentStageId: "fabric",
    }),
    false,
  );
  const paymentLease = createSummaryEditReturnLease({
    returnStageId: "payment",
    focusStageId: "design_style",
    generation: 1,
    sessionIdentityKey,
  });
  assert.equal(paymentLease.returnStageId, "payment");
}

{
  // Removing fabric for one garment must not drop sibling fabric assignments.
  const shirtAssignment: FabricGarmentAssignment = {
    garmentKey: "base:shirt",
    code: "GARMENT_BASE:SHIRT",
    garmentType: "shirt",
    sourceRole: "main",
    fabricUnits: 1,
  };
  const trouserAssignment: FabricGarmentAssignment = {
    garmentKey: "base:trouser",
    code: "GARMENT_BASE:TROUSER",
    garmentType: "trouser",
    sourceRole: "main",
    fabricUnits: 1,
  };
  const state: FabricAllocationState = {
    activeAllocationId: "alloc-1",
    awaitingFabricForPendingGarment: false,
    pendingFabricGarment: null,
    fabricAllocations: [
      {
        allocationId: "alloc-1",
        fabricCode: "FAB-1",
        garmentAssignments: [shirtAssignment, trouserAssignment],
      },
    ],
  };
  const cancelled = cancelFutureFabricCatalogueAssignment({
    state,
    garmentKey: "base:shirt",
  });
  assert.equal(cancelled.status, "cancelled");
  const remainingKeys =
    cancelled.state.fabricAllocations[0]?.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ) || [];
  assert.deepEqual(remainingKeys, ["base:trouser"]);
}

{
  // Clearing design style keeps the garment occurrence available for reassignment.
  const shirt: PhysicalGarmentOccurrence = {
    garmentKey: "base:shirt",
    garmentType: "shirt",
    sourceRole: "main",
    fabricUnits: 1,
    occurrenceGeneration: 1,
  };
  const target = {
    garmentKey: shirt.garmentKey,
    occurrenceToken: createPhysicalGarmentOccurrenceIdentityToken({
      garmentKey: shirt.garmentKey,
      generation: 1,
    }),
  };
  const assigned = assignCatalogDesignStyleToGarmentOccurrence({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    expectedLedgerRevision: 0,
    activeOccurrences: [shirt],
    target,
    source: {
      sourceKey: "catalog:style-a",
      catalogStyleId: "style-a",
      eligibilityFingerprint: "style-a:eligibility:v1",
    },
  });
  assert.equal(assigned.status, "applied");
  const cleared = clearGarmentDesignStyleAssignment({
    ledger: assigned.ledger,
    expectedLedgerRevision: assigned.ledger.revision,
    activeOccurrences: [shirt],
    target,
  });
  assert.equal(cleared.status, "applied");
  assert.equal(
    cleared.ledger.assignmentsByGarmentKey[shirt.garmentKey],
    undefined,
  );
}

{
  // Removing garment 2 must leave garment 3's identity untouched.
  const shirt = {
    garmentKey: "base:shirt",
    garmentType: "shirt" as const,
    sourceRole: "main" as const,
    fabricUnits: 1,
    occurrenceGeneration: 1,
  };
  const longShirt = {
    garmentKey: "additional:bum_shorts:1",
    garmentType: "bum_shorts" as const,
    sourceRole: "additional" as const,
    fabricUnits: 1,
    occurrenceGeneration: 2,
  };
  const trouser = {
    garmentKey: "base:trouser",
    garmentType: "trouser" as const,
    sourceRole: "main" as const,
    fabricUnits: 1,
    occurrenceGeneration: 1,
  };
  const before = [shirt, longShirt, trouser];
  const after = before.filter(
    (occurrence) => occurrence.garmentKey !== longShirt.garmentKey,
  );
  assert.deepEqual(
    after.map((occurrence) => occurrence.garmentKey),
    ["base:shirt", "base:trouser"],
  );
  assert.equal(
    after.find((occurrence) => occurrence.garmentKey === "base:trouser")
      ?.occurrenceGeneration,
    1,
  );
  assert.equal(
    after.some(
      (occurrence) => occurrence.garmentKey === "additional:bum_shorts:1",
    ),
    false,
  );
}

console.log("test_summary_edit_remove_cancel.ts: all assertions passed");
