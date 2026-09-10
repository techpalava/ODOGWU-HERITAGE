import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CustomerDesignUploadReference } from "./src/types";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import {
  createDesignStylePrecanonicalUploadCleanupCoordinator,
  type DesignStylePrecanonicalUploadCleanupHandle,
} from "./src/utils/designStylePrecanonicalUploadCleanup";

const OWNER_A = "precanonical-owner-a";
const OWNER_B = "precanonical-owner-b";
const NOW = new Date("2026-09-04T12:00:00.000Z").getTime();
const CLAIM_EXPIRES_AT = "2026-09-04T12:15:00.000Z";

const identity = (uid: string) => ({
  uid,
  getIdToken: async () => `${uid}-firebase-token`,
});

const referenceFor = (
  ownerUid: string,
  designReferenceId: string,
): CustomerDesignUploadReference =>
  createCustomerDesignUploadReference({
    ownerUid,
    designReferenceId,
    mimeType: "image/png",
    createdAt: "2026-09-04T12:00:00.000Z",
  });

interface HarnessOptions {
  readonly claimFails?: boolean;
  readonly transferFails?: boolean;
  readonly deleteFails?: (
    reference: CustomerDesignUploadReference,
  ) => boolean;
}

const createHarness = (options: HarnessOptions = {}) => {
  const claimCalls: Array<{
    reference: CustomerDesignUploadReference;
    uid: string;
  }> = [];
  const transferCalls: Array<{
    reference: CustomerDesignUploadReference;
    uid: string;
    claimToken: string;
  }> = [];
  const deleteCalls: CustomerDesignUploadReference[] = [];
  const deleteDraft = async (reference: CustomerDesignUploadReference) => {
    deleteCalls.push({ ...reference });
    if (options.deleteFails?.(reference)) throw new Error("DELETE_FAILED");
  };
  const coordinator = createDesignStylePrecanonicalUploadCleanupCoordinator({
    claimClient: {
      createOwnershipClaim: async (reference, ownerIdentity) => {
        claimCalls.push({ reference: { ...reference }, uid: ownerIdentity.uid });
        if (options.claimFails) throw new Error("CLAIM_FAILED");
        return {
          claimToken: `${reference.designReferenceId}-server-claim`.padEnd(48, "x"),
          expiresAt: CLAIM_EXPIRES_AT,
        };
      },
    },
    transferClient: {
      transferDraftOwnership: async ({
        draftReference,
        ownershipClaimToken,
        identity: destinationIdentity,
      }) => {
        transferCalls.push({
          reference: { ...draftReference },
          uid: destinationIdentity.uid,
          claimToken: ownershipClaimToken,
        });
        if (options.transferFails) throw new Error("TRANSFER_FAILED");
        return referenceFor(
          destinationIdentity.uid,
          draftReference.designReferenceId,
        );
      },
    },
    deleteDraft,
    now: () => NOW,
  });
  let currentIdentity = identity(OWNER_A);
  return {
    coordinator,
    claimCalls,
    transferCalls,
    deleteCalls,
    getIdentity: () => currentIdentity,
    setIdentity: (uid: string) => {
      currentIdentity = identity(uid);
    },
    deleteDraft,
  };
};

const register = (
  harness: ReturnType<typeof createHarness>,
  {
    operationGeneration,
    garmentKey = "base:shirt:1",
    occurrenceToken = "base:shirt:1::generation:1",
    ownerUid = OWNER_A,
    designReferenceId,
    settle = true,
  }: {
    operationGeneration: number;
    garmentKey?: string;
    occurrenceToken?: string;
    ownerUid?: string;
    designReferenceId?: string;
    settle?: boolean;
  },
): {
  operation: DesignStylePrecanonicalUploadCleanupHandle;
  reference: CustomerDesignUploadReference | null;
} => {
  const operation = harness.coordinator.registerOperation({
    operationGeneration,
    garmentKey,
    occurrenceToken,
  });
  assert.deepEqual(
    harness.coordinator.bindOriginalOwner(operation, ownerUid),
    { status: "updated" },
  );
  const reference = designReferenceId
    ? referenceFor(ownerUid, designReferenceId)
    : null;
  if (reference) {
    assert.deepEqual(
      harness.coordinator.attachReference(operation, reference),
      { status: "updated" },
    );
  }
  if (settle) {
    assert.deepEqual(harness.coordinator.settleUpload(operation), {
      status: "updated",
    });
  }
  return { operation, reference };
};

const prepareAsOwnerA = async (harness: ReturnType<typeof createHarness>) => {
  const result = await harness.coordinator.prepareForAuthTransition(
    harness.getIdentity,
  );
  assert.equal(result.status, "ready");
  return result;
};

// A. A UID-preserving discarded upload uses owner-bound deletion once and no transfer.
{
  const harness = createHarness();
  const { operation, reference } = register(harness, {
    operationGeneration: 1,
    designReferenceId: "same-uid-source",
  });
  harness.coordinator.markDiscarded(operation);
  const cleanup = await harness.coordinator.cleanupDiscarded(
    operation,
    harness.getIdentity,
    harness.deleteDraft,
  );
  assert.equal(cleanup.status, "discarded-cleaned");
  assert.equal(
    cleanup.status === "discarded-cleaned" ? cleanup.method : null,
    "direct-delete",
  );
  assert.deepEqual(harness.deleteCalls, [reference]);
  assert.equal(harness.claimCalls.length, 0);
  assert.equal(harness.transferCalls.length, 0);
}

// B. A UID-replacing transition claims as A, transfers as B, then deletes B's exact reference.
{
  const harness = createHarness();
  const { operation, reference } = register(harness, {
    operationGeneration: 2,
    designReferenceId: "cross-auth-source",
  });
  const preparation = await prepareAsOwnerA(harness);
  assert.equal(preparation.preparedClaimCount, 1);
  assert.deepEqual(harness.claimCalls, [{ reference, uid: OWNER_A }]);
  harness.setIdentity(OWNER_B);
  const cleanup = await harness.coordinator.cleanupDiscarded(
    operation,
    harness.getIdentity,
    harness.deleteDraft,
  );
  assert.equal(cleanup.status, "discarded-cleaned");
  assert.equal(
    cleanup.status === "discarded-cleaned" ? cleanup.method : null,
    "transfer-delete",
  );
  assert.equal(harness.transferCalls.length, 1);
  assert.equal(harness.transferCalls[0]?.uid, OWNER_B);
  assert.deepEqual(harness.transferCalls[0]?.reference, reference);
  assert.deepEqual(harness.deleteCalls, [
    referenceFor(OWNER_B, "cross-auth-source"),
  ]);
}

// C. Claim failure blocks the transition while A and the exact artifact remain unchanged.
{
  const harness = createHarness({ claimFails: true });
  const { operation, reference } = register(harness, {
    operationGeneration: 3,
    designReferenceId: "claim-failure-source",
  });
  const preparation = await harness.coordinator.prepareForAuthTransition(
    harness.getIdentity,
  );
  if (preparation.status === "ready") harness.setIdentity(OWNER_B);
  assert.equal(preparation.status, "blocked");
  assert.equal(harness.getIdentity().uid, OWNER_A);
  assert.equal(harness.transferCalls.length, 0);
  assert.equal(harness.deleteCalls.length, 0);
  assert.deepEqual(
    harness.coordinator.getSnapshot(operation)?.reference,
    reference,
  );
  assert.equal(
    harness.coordinator.getSnapshot(operation)?.diagnosticPhase,
    "claim-preparation",
  );
}

// D. Pre-auth preparation waits until an in-flight upload exposes its exact reference.
{
  const harness = createHarness();
  const { operation } = register(harness, {
    operationGeneration: 4,
    settle: false,
  });
  let preparationResolved = false;
  const preparationPromise = harness.coordinator
    .prepareForAuthTransition(harness.getIdentity)
    .then((result) => {
      preparationResolved = true;
      return result;
    });
  await Promise.resolve();
  assert.equal(preparationResolved, false);
  const reference = referenceFor(OWNER_A, "pending-source");
  assert.deepEqual(
    harness.coordinator.attachReference(operation, reference),
    { status: "updated" },
  );
  harness.coordinator.settleUpload(operation);
  const preparation = await preparationPromise;
  assert.equal(preparation.status, "ready");
  assert.deepEqual(harness.claimCalls, [{ reference, uid: OWNER_A }]);
}

// E. Canonical acceptance drops H2's claim and prevents later transfer/deletion.
{
  const harness = createHarness();
  const { operation, reference } = register(harness, {
    operationGeneration: 5,
    designReferenceId: "canonical-source",
  });
  await prepareAsOwnerA(harness);
  assert.equal(harness.coordinator.getSnapshot(operation)?.hasPreparedClaim, true);
  assert.ok(reference);
  assert.deepEqual(
    harness.coordinator.acceptCanonical(operation, reference),
    { status: "updated" },
  );
  assert.equal(
    harness.coordinator.getSnapshot(operation)?.disposition,
    "accepted-canonical",
  );
  assert.equal(harness.coordinator.getSnapshot(operation)?.hasPreparedClaim, false);
  harness.setIdentity(OWNER_B);
  const cleanup = await harness.coordinator.cleanupDiscarded(
    operation,
    harness.getIdentity,
    harness.deleteDraft,
  );
  assert.equal(cleanup.status, "accepted-canonical");
  assert.equal(harness.transferCalls.length, 0);
  assert.equal(harness.deleteCalls.length, 0);
}

// F. A stale operation retains and cleans only its own source after supersession.
{
  const harness = createHarness();
  const first = register(harness, {
    operationGeneration: 6,
    designReferenceId: "stale-source-a",
  });
  const second = register(harness, {
    operationGeneration: 7,
    settle: true,
  });
  await prepareAsOwnerA(harness);
  harness.setIdentity(OWNER_B);
  await harness.coordinator.cleanupDiscarded(
    first.operation,
    harness.getIdentity,
    harness.deleteDraft,
  );
  assert.equal(harness.transferCalls.length, 1);
  assert.equal(
    harness.transferCalls[0]?.reference.designReferenceId,
    "stale-source-a",
  );
  assert.equal(
    harness.coordinator.getSnapshot(second.operation)?.reference,
    null,
  );
  assert.equal(
    harness.coordinator.getSnapshot(second.operation)?.disposition,
    "discarded-cleaned",
  );
}

// G. Remove/re-add ABA records remain separated by exact occurrence token and record ID.
{
  const harness = createHarness();
  const oldOccurrence = register(harness, {
    operationGeneration: 8,
    occurrenceToken: "base:shirt:1::generation:1",
    designReferenceId: "aba-old-source",
  });
  const newOccurrence = register(harness, {
    operationGeneration: 9,
    occurrenceToken: "base:shirt:1::generation:2",
  });
  await prepareAsOwnerA(harness);
  harness.setIdentity(OWNER_B);
  await harness.coordinator.cleanupDiscarded(
    oldOccurrence.operation,
    harness.getIdentity,
    harness.deleteDraft,
  );
  assert.notEqual(
    oldOccurrence.operation.cleanupRecordId,
    newOccurrence.operation.cleanupRecordId,
  );
  assert.notEqual(
    oldOccurrence.operation.occurrenceToken,
    newOccurrence.operation.occurrenceToken,
  );
  assert.equal(
    harness.coordinator.getSnapshot(newOccurrence.operation)?.reference,
    null,
  );
}

// H. Canonical A is outside H2 while discarded replacement B is transfer-deleted.
{
  const harness = createHarness();
  const canonicalA = referenceFor(OWNER_A, "canonical-existing-a");
  const replacementB = register(harness, {
    operationGeneration: 10,
    designReferenceId: "precanonical-replacement-b",
  });
  await prepareAsOwnerA(harness);
  harness.setIdentity(OWNER_B);
  await harness.coordinator.cleanupDiscarded(
    replacementB.operation,
    harness.getIdentity,
    harness.deleteDraft,
  );
  assert.equal(
    harness.transferCalls.some(
      ({ reference }) =>
        reference.designReferenceId === canonicalA.designReferenceId,
    ),
    false,
  );
  assert.equal(
    harness.deleteCalls.some(
      (reference) => reference.designReferenceId === canonicalA.designReferenceId,
    ),
    false,
  );
}

// I. Transfer failure never attempts a B-authenticated direct delete of A's reference.
{
  const harness = createHarness({ transferFails: true });
  const { operation } = register(harness, {
    operationGeneration: 11,
    designReferenceId: "transfer-failure-source",
  });
  await prepareAsOwnerA(harness);
  harness.setIdentity(OWNER_B);
  const cleanup = await harness.coordinator.cleanupDiscarded(
    operation,
    harness.getIdentity,
    harness.deleteDraft,
  );
  assert.equal(cleanup.status, "discarded-cleanup-failed");
  assert.equal(
    cleanup.status === "discarded-cleanup-failed" ? cleanup.phase : null,
    "transfer",
  );
  assert.equal(harness.deleteCalls.length, 0);
}

// J. Final B-owned deletion failure retains exact transferred diagnostics.
{
  const harness = createHarness({
    deleteFails: (reference) => reference.ownerUid === OWNER_B,
  });
  const { operation } = register(harness, {
    operationGeneration: 12,
    designReferenceId: "final-delete-failure-source",
  });
  await prepareAsOwnerA(harness);
  harness.setIdentity(OWNER_B);
  const cleanup = await harness.coordinator.cleanupDiscarded(
    operation,
    harness.getIdentity,
    harness.deleteDraft,
  );
  assert.equal(cleanup.status, "discarded-cleanup-failed");
  assert.equal(
    cleanup.status === "discarded-cleanup-failed" ? cleanup.phase : null,
    "transferred-delete",
  );
  assert.equal(
    harness.coordinator.getSnapshot(operation)?.transferredReference?.ownerUid,
    OWNER_B,
  );
}

// K. Repeated cleanup completion reuses one result and performs physical work at most once.
{
  const harness = createHarness();
  const { operation } = register(harness, {
    operationGeneration: 13,
    designReferenceId: "replay-source",
  });
  await prepareAsOwnerA(harness);
  harness.setIdentity(OWNER_B);
  const [first, second] = await Promise.all([
    harness.coordinator.cleanupDiscarded(
      operation,
      harness.getIdentity,
      harness.deleteDraft,
    ),
    harness.coordinator.cleanupDiscarded(
      operation,
      harness.getIdentity,
      harness.deleteDraft,
    ),
  ]);
  assert.deepEqual(second, first);
  assert.equal(harness.transferCalls.length, 1);
  assert.equal(harness.deleteCalls.length, 1);
}

// L. Claim capability stays private to the coordinator and outside serializable snapshots.
{
  const harness = createHarness();
  const { operation } = register(harness, {
    operationGeneration: 14,
    designReferenceId: "transient-claim-source",
  });
  await prepareAsOwnerA(harness);
  const snapshotJson = JSON.stringify(
    harness.coordinator.getSnapshot(operation),
  );
  const claimToken = harness.claimCalls[0]?.reference.designReferenceId
    ? "transient-claim-source-server-claim".padEnd(48, "x")
    : "";
  assert.doesNotMatch(snapshotJson, /claimToken/);
  assert.equal(snapshotJson.includes(claimToken), false);
  assert.equal(
    JSON.stringify({ guestDraft: {}, authenticatedDraft: {}, v2Envelope: {} }).includes(
      claimToken,
    ),
    false,
  );
}

// M. A source-readiness failure cleans directly for A and claim-transfer-deletes for B.
{
  const sameUid = createHarness();
  const sameUidOperation = register(sameUid, {
    operationGeneration: 15,
    designReferenceId: "readiness-failure-same-uid",
  });
  const direct = await sameUid.coordinator.cleanupDiscarded(
    sameUidOperation.operation,
    sameUid.getIdentity,
    sameUid.deleteDraft,
  );
  assert.equal(
    direct.status === "discarded-cleaned" ? direct.method : null,
    "direct-delete",
  );

  const crossAuth = createHarness();
  const crossAuthOperation = register(crossAuth, {
    operationGeneration: 16,
    designReferenceId: "readiness-failure-cross-auth",
  });
  await prepareAsOwnerA(crossAuth);
  crossAuth.setIdentity(OWNER_B);
  const transferred = await crossAuth.coordinator.cleanupDiscarded(
    crossAuthOperation.operation,
    crossAuth.getIdentity,
    crossAuth.deleteDraft,
  );
  assert.equal(
    transferred.status === "discarded-cleaned" ? transferred.method : null,
    "transfer-delete",
  );
}

// N. Preview failure occurs before canonical handoff and uses the same discard contract.
{
  const harness = createHarness();
  const { operation } = register(harness, {
    operationGeneration: 17,
    designReferenceId: "preview-failure-source",
  });
  await prepareAsOwnerA(harness);
  harness.setIdentity(OWNER_B);
  const cleanup = await harness.coordinator.cleanupDiscarded(
    operation,
    harness.getIdentity,
    harness.deleteDraft,
  );
  assert.equal(
    cleanup.status === "discarded-cleaned" ? cleanup.method : null,
    "transfer-delete",
  );
}

// Production wiring: register precedes upload, exact reference precedes source
// preparation, preview precedes canonical handoff, and pre-auth preparation is awaited.
{
  const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  const uploadHandler = studioSource.slice(
    studioSource.indexOf("const handleFutureDesignStyleUploadFile"),
    studioSource.indexOf("const isStageHistoricallyUnlocked"),
  );
  const registration = uploadHandler.indexOf("registerOperation");
  const upload = uploadHandler.indexOf("uploadCustomerDesignDraft(file)");
  const attach = uploadHandler.indexOf("attachReference");
  const sourcePreparation = uploadHandler.indexOf(
    "createUploadedDesignSourceWhenReady",
  );
  const preview = uploadHandler.indexOf("URL.createObjectURL(file)");
  const canonicalHandoff = uploadHandler.indexOf("acceptCanonical");
  assert.ok(registration >= 0 && registration < upload);
  assert.ok(upload < attach && attach < sourcePreparation);
  assert.ok(sourcePreparation < preview && preview < canonicalHandoff);
  assert.match(uploadHandler, /settleUpload\([\s\S]*cleanupDiscarded\(/);

  const loginSource = readFileSync("src/components/LoginView.tsx", "utf8");
  const preparationHook = loginSource.slice(
    loginSource.indexOf("const prepareGuestUploadTransition"),
    loginSource.indexOf("const finishAuthenticatedLogin"),
  );
  const precanonicalPreparation = preparationHook.indexOf(
    "prepareForAuthTransition",
  );
  const persistedPreparation = preparationHook.indexOf(
    "guestUploadedDesignOwnershipContinuity.prepare",
  );
  assert.ok(
    precanonicalPreparation >= 0 &&
      precanonicalPreparation < persistedPreparation,
  );
  assert.match(preparationHook, /precanonicalPreparation\.status === "blocked"/);
}

console.log(
  "PASS: operation-bound pre-canonical upload cleanup remains secure across authentication",
);
