import assert from "node:assert/strict";
import type { CustomerDesignUploadReference, GuestDesignDraft } from "./src/types";
import { getAuthenticatedDraftUploadedDesignOwnershipIssue } from "./src/services/authenticatedFutureDraftService";
import {
  DESIGN_STYLE_DRAFT_FIELD,
  inspectPersistedDesignStyleDraft,
} from "./src/utils/designStyleDraftPersistence";
import { createUploadedDesignSource } from "./src/utils/designSourceState";
import { removeForeignUploadedDesignSources } from "./src/utils/foreignUploadedDesignSources";
import {
  createEmptyUploadedDesignSourceRegistry,
  inspectUploadedDesignSourceRegistry,
  UPLOADED_DESIGN_SOURCE_REGISTRY_FIELD,
  upsertUploadedDesignSources,
} from "./src/utils/uploadedDesignSourceRegistry";

const GUEST_UID = "anonymous-owner-001";
const ACCOUNT_UID = "account-owner-002";

const referenceFor = (
  ownerUid: string,
  designReferenceId: string,
): CustomerDesignUploadReference => ({
  ownerUid,
  designReferenceId,
  storagePath: `customer-design-drafts/${ownerUid}/${designReferenceId}/original.png`,
  mimeType: "image/png",
  originalFileName: "private-design.png",
  createdAt: "2026-08-15T10:00:00.000Z",
});

const sourceFor = (ownerUid: string, designReferenceId: string) =>
  createUploadedDesignSource({
    uploadReference: referenceFor(ownerUid, designReferenceId),
    fabricCapacityComposition: [
      { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    ],
    demographic: "male",
  });

const uploadedAssignment = (
  garmentKey: string,
  uploadedSourceRef: string,
  assignmentRevision = 1,
) => ({
  garmentKey,
  occurrenceToken: `token-${garmentKey}`,
  assignmentRevision,
  sourceKind: "uploaded" as const,
  sourceKey: `uploaded:${uploadedSourceRef}`,
  uploadedSourceRef,
});

const catalogAssignment = (garmentKey: string) => ({
  garmentKey,
  occurrenceToken: `token-${garmentKey}`,
  assignmentRevision: 2,
  sourceKind: "catalog" as const,
  sourceKey: "catalog-style:royal-senator",
  catalogStyleId: "royal-senator",
  eligibilityFingerprint: "eligibility-1",
});

const guestShirt = sourceFor(GUEST_UID, "guest-design-1");
const guestDress = sourceFor(GUEST_UID, "guest-design-2");
const ownShorts = sourceFor(ACCOUNT_UID, "account-design-1");

const draft = {
  journeySchemaVersion: 1,
  currentStageId: "design_style",
  selectedFabricCode: null,
  selectedStyleId: null,
  designSource: guestShirt,
  confirmedDesignSourceKey: guestShirt.sourceKey,
  uploadedDesignOwnershipTransition: {
    schemaVersion: 1,
    status: "transfer_required",
    reason: "claim_unavailable",
  },
  [DESIGN_STYLE_DRAFT_FIELD]: {
    schemaVersion: 2,
    ledger: {
      schemaVersion: 2,
      revision: 4,
      assignmentsByGarmentKey: {
        "shirt-1": uploadedAssignment("shirt-1", "guest-design-1"),
        "dress-1": uploadedAssignment("dress-1", "guest-design-2", 3),
        "shorts-1": uploadedAssignment("shorts-1", "account-design-1", 4),
        "shirt-2": catalogAssignment("shirt-2"),
      },
    },
  },
  [UPLOADED_DESIGN_SOURCE_REGISTRY_FIELD]: upsertUploadedDesignSources(
    createEmptyUploadedDesignSourceRegistry(),
    [guestShirt, guestDress, ownShorts],
  ),
} as unknown as GuestDesignDraft;

// The fixture is a real draft the account sync rejects.
{
  const registry = inspectUploadedDesignSourceRegistry(draft);
  assert.equal(registry.status, "valid");
  assert.equal(
    registry.status === "valid" &&
      Object.keys(registry.registry.sourcesByUploadedSourceRef).length,
    3,
  );
  assert.equal(inspectPersistedDesignStyleDraft(draft).status, "valid");
  assert.notEqual(
    getAuthenticatedDraftUploadedDesignOwnershipIssue(draft, ACCOUNT_UID),
    null,
  );
}

// Only guest-owned photos and their assignments are removed.
{
  const removal = removeForeignUploadedDesignSources(draft, ACCOUNT_UID);
  assert.deepEqual(removal.removedGarmentKeys, ["dress-1", "shirt-1"]);
  assert.deepEqual(removal.removedUploadedSourceRefs, [
    "guest-design-1",
    "guest-design-2",
  ]);

  const envelope = inspectPersistedDesignStyleDraft(removal.draft);
  assert.equal(envelope.status, "valid");
  if (envelope.status !== "valid") throw new Error("unreachable");
  assert.equal(envelope.envelope.ledger.revision, 5);
  assert.deepEqual(
    Object.keys(envelope.envelope.ledger.assignmentsByGarmentKey).sort(),
    ["shirt-2", "shorts-1"],
  );

  const registry = inspectUploadedDesignSourceRegistry(removal.draft);
  assert.equal(registry.status, "valid");
  assert.deepEqual(
    registry.status === "valid" &&
      Object.keys(registry.registry.sourcesByUploadedSourceRef),
    ["account-design-1"],
  );
  assert.equal(removal.draft.designSource, null);
  assert.equal(removal.draft.confirmedDesignSourceKey, null);
  assert.equal(removal.draft.uploadedDesignOwnershipTransition, undefined);
  assert.ok(
    registry.status === "valid" &&
      Object.values(registry.registry.sourcesByUploadedSourceRef).every(
        (source) => source.uploadReference.ownerUid === ACCOUNT_UID,
      ),
  );
  assert.equal(
    getAuthenticatedDraftUploadedDesignOwnershipIssue(
      removal.draft,
      ACCOUNT_UID,
    ),
    null,
  );
  assert.equal(
    draft.designSource,
    guestShirt,
    "the input draft is not mutated",
  );

  const again = removeForeignUploadedDesignSources(removal.draft, ACCOUNT_UID);
  assert.equal(again.draft, removal.draft, "a clean draft comes back unchanged");
  assert.deepEqual(again.removedGarmentKeys, []);
}

// A malformed envelope is left alone.
{
  const malformed = {
    ...draft,
    [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 2, ledger: "broken" },
  } as unknown as GuestDesignDraft;
  const removal = removeForeignUploadedDesignSources(malformed, ACCOUNT_UID);
  assert.equal(removal.draft, malformed);
  assert.deepEqual(removal.removedUploadedSourceRefs, []);
}

console.log("PASS: guest-owned uploaded design sources are removed and the rest is kept");
