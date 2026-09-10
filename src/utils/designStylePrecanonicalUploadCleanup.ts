import type { CustomerDesignUploadReference } from "../types";
import {
  customerDesignDraftOwnershipTransferClient,
  type TrustedCustomerDesignDraftTransferClient,
} from "../services/customerDesignDraftOwnershipTransfer";
import {
  customerDesignOrderTransferClient,
  type FirebaseCheckoutIdentity,
  type TrustedUploadedDesignTransferClient,
  type UploadedDesignOwnershipClaim,
} from "../services/customerDesignOrderTransfer";
import { isCustomerDesignDraftStoragePath } from "../services/customerDesignUploadReference";
import { CustomerDesignUploadService } from "../services/customerDesignUploadService";

export interface DesignStylePrecanonicalUploadOperationIdentity {
  readonly operationGeneration: number;
  readonly garmentKey: string;
  readonly occurrenceToken: string;
}

export interface DesignStylePrecanonicalUploadCleanupHandle
  extends DesignStylePrecanonicalUploadOperationIdentity {
  readonly cleanupRecordId: number;
}

export type DesignStylePrecanonicalUploadCleanupDisposition =
  | "registered"
  | "reference-ready"
  | "claim-prepared"
  | "discard-requested"
  | "accepted-canonical"
  | "discarded-cleaned"
  | "discarded-cleanup-failed"
  | "discarded-cleanup-blocked";

export interface DesignStylePrecanonicalUploadCleanupSnapshot {
  readonly operation: DesignStylePrecanonicalUploadCleanupHandle;
  readonly originalOwnerUid: string | null;
  readonly reference: CustomerDesignUploadReference | null;
  readonly transferredReference: CustomerDesignUploadReference | null;
  readonly disposition: DesignStylePrecanonicalUploadCleanupDisposition;
  readonly uploadSettled: boolean;
  readonly hasPreparedClaim: boolean;
  readonly diagnosticPhase:
    | "owner-binding"
    | "reference-binding"
    | "claim-preparation"
    | "direct-delete"
    | "transfer"
    | "transferred-delete"
    | null;
}

export type DesignStylePrecanonicalUploadRecordUpdateResult =
  | { readonly status: "updated" }
  | {
      readonly status: "rejected";
      readonly reason:
        | "unknown-operation"
        | "terminal-operation"
        | "owner-mismatch"
        | "invalid-reference"
        | "reference-mismatch";
    };

export type DesignStylePrecanonicalAuthPreparationResult =
  | {
      readonly status: "ready";
      readonly preparedClaimCount: number;
    }
  | {
      readonly status: "blocked";
      readonly reason:
        | "identity-unavailable"
        | "owner-mismatch"
        | "reference-unavailable"
        | "claim-preparation-failed"
        | "cleanup-unresolved";
      readonly operation: DesignStylePrecanonicalUploadCleanupHandle;
    };

export type DesignStylePrecanonicalDiscardCleanupResult =
  | {
      readonly status: "accepted-canonical";
      readonly operation: DesignStylePrecanonicalUploadCleanupHandle;
    }
  | {
      readonly status: "discarded-cleaned";
      readonly method: "no-source" | "direct-delete" | "transfer-delete";
      readonly operation: DesignStylePrecanonicalUploadCleanupHandle;
    }
  | {
      readonly status: "discarded-cleanup-failed";
      readonly phase: "direct-delete" | "transfer" | "transferred-delete";
      readonly operation: DesignStylePrecanonicalUploadCleanupHandle;
      readonly error: unknown;
    }
  | {
      readonly status: "discarded-cleanup-blocked";
      readonly reason:
        | "identity-unavailable"
        | "owner-unresolved"
        | "reference-unavailable"
        | "reference-mismatch"
        | "claim-unavailable";
      readonly operation: DesignStylePrecanonicalUploadCleanupHandle;
    };

type CleanupIdentity = FirebaseCheckoutIdentity;
type CleanupIdentityProvider = () => CleanupIdentity | null;
type DeleteCustomerDesignDraft = (
  reference: CustomerDesignUploadReference,
) => Promise<void>;

interface DesignStylePrecanonicalUploadCleanupDependencies {
  claimClient: Pick<TrustedUploadedDesignTransferClient, "createOwnershipClaim">;
  transferClient: TrustedCustomerDesignDraftTransferClient;
  deleteDraft: DeleteCustomerDesignDraft;
  now?: () => number;
}

interface InternalPreparationReady {
  readonly status: "ready";
  readonly prepared: boolean;
}

interface InternalPreparationBlocked {
  readonly status: "blocked";
  readonly reason:
    | "identity-unavailable"
    | "owner-mismatch"
    | "reference-unavailable"
    | "claim-preparation-failed"
    | "cleanup-unresolved";
}

type InternalPreparationResult =
  | InternalPreparationReady
  | InternalPreparationBlocked;

interface InternalCleanupRecord {
  readonly operation: DesignStylePrecanonicalUploadCleanupHandle;
  originalOwnerUid: string | null;
  reference: CustomerDesignUploadReference | null;
  transferredReference: CustomerDesignUploadReference | null;
  disposition: DesignStylePrecanonicalUploadCleanupDisposition;
  uploadSettled: boolean;
  claim: UploadedDesignOwnershipClaim | null;
  diagnosticPhase: DesignStylePrecanonicalUploadCleanupSnapshot["diagnosticPhase"];
  referenceSettlementResolved: boolean;
  readonly referenceSettlement: Promise<void>;
  readonly resolveReferenceSettlement: () => void;
  claimPreparationPromise: Promise<InternalPreparationResult> | null;
  cleanupPromise: Promise<DesignStylePrecanonicalDiscardCleanupResult> | null;
  cleanupResult: DesignStylePrecanonicalDiscardCleanupResult | null;
}

const cloneReference = (
  reference: CustomerDesignUploadReference,
): CustomerDesignUploadReference => ({ ...reference });

const sameOperation = (
  left: DesignStylePrecanonicalUploadCleanupHandle,
  right: DesignStylePrecanonicalUploadCleanupHandle,
): boolean =>
  left.cleanupRecordId === right.cleanupRecordId &&
  left.operationGeneration === right.operationGeneration &&
  left.garmentKey === right.garmentKey &&
  left.occurrenceToken === right.occurrenceToken;

const sameReference = (
  left: CustomerDesignUploadReference,
  right: CustomerDesignUploadReference,
): boolean =>
  left.ownerUid === right.ownerUid &&
  left.designReferenceId === right.designReferenceId &&
  left.storagePath === right.storagePath &&
  left.mimeType === right.mimeType;

const isTerminalDisposition = (
  disposition: DesignStylePrecanonicalUploadCleanupDisposition,
): boolean =>
  disposition === "accepted-canonical" ||
  disposition === "discarded-cleaned" ||
  disposition === "discarded-cleanup-failed" ||
  disposition === "discarded-cleanup-blocked";

const hasUsableClaim = (
  claim: UploadedDesignOwnershipClaim | null,
  now: number,
): claim is UploadedDesignOwnershipClaim => {
  if (!claim || claim.claimToken.length < 32) return false;
  const expiresAt = new Date(claim.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
};

export const createDesignStylePrecanonicalUploadCleanupCoordinator = (
  dependencies: DesignStylePrecanonicalUploadCleanupDependencies,
) => {
  const now = dependencies.now || Date.now;
  const records = new Map<number, InternalCleanupRecord>();
  let nextCleanupRecordId = 1;

  const findRecord = (
    operation: DesignStylePrecanonicalUploadCleanupHandle,
  ): InternalCleanupRecord | null => {
    const record = records.get(operation.cleanupRecordId) || null;
    return record && sameOperation(record.operation, operation) ? record : null;
  };

  const resolveReferenceSettlement = (record: InternalCleanupRecord): void => {
    if (record.referenceSettlementResolved) return;
    record.referenceSettlementResolved = true;
    record.resolveReferenceSettlement();
  };

  const setCleanupResult = (
    record: InternalCleanupRecord,
    result: DesignStylePrecanonicalDiscardCleanupResult,
  ): DesignStylePrecanonicalDiscardCleanupResult => {
    record.cleanupResult = result;
    record.disposition = result.status;
    record.claim = null;
    return result;
  };

  const registerOperation = (
    identity: DesignStylePrecanonicalUploadOperationIdentity,
  ): DesignStylePrecanonicalUploadCleanupHandle => {
    if (
      !Number.isSafeInteger(identity.operationGeneration) ||
      identity.operationGeneration < 1 ||
      !identity.garmentKey ||
      !identity.occurrenceToken
    ) {
      throw new TypeError("Pre-canonical cleanup requires an exact upload operation identity.");
    }
    const operation = Object.freeze({
      cleanupRecordId: nextCleanupRecordId++,
      operationGeneration: identity.operationGeneration,
      garmentKey: identity.garmentKey,
      occurrenceToken: identity.occurrenceToken,
    });
    let resolveReferenceSettlementPromise = () => undefined;
    const referenceSettlement = new Promise<void>((resolve) => {
      resolveReferenceSettlementPromise = resolve;
    });
    records.set(operation.cleanupRecordId, {
      operation,
      originalOwnerUid: null,
      reference: null,
      transferredReference: null,
      disposition: "registered",
      uploadSettled: false,
      claim: null,
      diagnosticPhase: null,
      referenceSettlementResolved: false,
      referenceSettlement,
      resolveReferenceSettlement: resolveReferenceSettlementPromise,
      claimPreparationPromise: null,
      cleanupPromise: null,
      cleanupResult: null,
    });
    return operation;
  };

  const bindOriginalOwner = (
    operation: DesignStylePrecanonicalUploadCleanupHandle,
    ownerUid: string,
  ): DesignStylePrecanonicalUploadRecordUpdateResult => {
    const record = findRecord(operation);
    if (!record) return { status: "rejected", reason: "unknown-operation" };
    if (isTerminalDisposition(record.disposition)) {
      return { status: "rejected", reason: "terminal-operation" };
    }
    if (!ownerUid || (record.originalOwnerUid && record.originalOwnerUid !== ownerUid)) {
      record.diagnosticPhase = "owner-binding";
      return { status: "rejected", reason: "owner-mismatch" };
    }
    record.originalOwnerUid = ownerUid;
    return { status: "updated" };
  };

  const attachReference = (
    operation: DesignStylePrecanonicalUploadCleanupHandle,
    reference: CustomerDesignUploadReference,
  ): DesignStylePrecanonicalUploadRecordUpdateResult => {
    const record = findRecord(operation);
    if (!record) return { status: "rejected", reason: "unknown-operation" };
    if (isTerminalDisposition(record.disposition)) {
      return { status: "rejected", reason: "terminal-operation" };
    }
    if (record.reference && !sameReference(record.reference, reference)) {
      record.diagnosticPhase = "reference-binding";
      return { status: "rejected", reason: "reference-mismatch" };
    }
    record.reference = cloneReference(reference);
    resolveReferenceSettlement(record);
    if (!isCustomerDesignDraftStoragePath(reference)) {
      record.diagnosticPhase = "reference-binding";
      return { status: "rejected", reason: "invalid-reference" };
    }
    if (
      !record.originalOwnerUid ||
      record.originalOwnerUid !== reference.ownerUid
    ) {
      record.diagnosticPhase = "reference-binding";
      return { status: "rejected", reason: "owner-mismatch" };
    }
    if (record.disposition !== "discard-requested") {
      record.disposition = "reference-ready";
    }
    return { status: "updated" };
  };

  const settleUpload = (
    operation: DesignStylePrecanonicalUploadCleanupHandle,
  ): DesignStylePrecanonicalUploadRecordUpdateResult => {
    const record = findRecord(operation);
    if (!record) return { status: "rejected", reason: "unknown-operation" };
    record.uploadSettled = true;
    resolveReferenceSettlement(record);
    if (!record.reference && !record.cleanupResult) {
      setCleanupResult(record, {
        status: "discarded-cleaned",
        method: "no-source",
        operation: record.operation,
      });
    }
    return { status: "updated" };
  };

  const markDiscarded = (
    operation: DesignStylePrecanonicalUploadCleanupHandle,
  ): DesignStylePrecanonicalUploadRecordUpdateResult => {
    const record = findRecord(operation);
    if (!record) return { status: "rejected", reason: "unknown-operation" };
    if (record.disposition === "accepted-canonical") {
      return { status: "rejected", reason: "terminal-operation" };
    }
    if (
      record.disposition === "discarded-cleaned" ||
      record.disposition === "discarded-cleanup-failed" ||
      record.disposition === "discarded-cleanup-blocked"
    ) {
      return { status: "updated" };
    }
    record.disposition = "discard-requested";
    return { status: "updated" };
  };

  const acceptCanonical = (
    operation: DesignStylePrecanonicalUploadCleanupHandle,
    reference: CustomerDesignUploadReference,
  ): DesignStylePrecanonicalUploadRecordUpdateResult => {
    const record = findRecord(operation);
    if (!record) return { status: "rejected", reason: "unknown-operation" };
    if (record.disposition === "accepted-canonical") {
      return record.reference && sameReference(record.reference, reference)
        ? { status: "updated" }
        : { status: "rejected", reason: "reference-mismatch" };
    }
    if (
      isTerminalDisposition(record.disposition) ||
      record.disposition === "discard-requested" ||
      record.cleanupPromise
    ) {
      return { status: "rejected", reason: "terminal-operation" };
    }
    if (!record.reference || !sameReference(record.reference, reference)) {
      return { status: "rejected", reason: "reference-mismatch" };
    }
    record.disposition = "accepted-canonical";
    record.claim = null;
    record.diagnosticPhase = null;
    return { status: "updated" };
  };

  const prepareRecordClaim = async (
    record: InternalCleanupRecord,
    getIdentity: CleanupIdentityProvider,
  ): Promise<InternalPreparationResult> => {
    if (
      record.disposition === "accepted-canonical" ||
      record.disposition === "discarded-cleaned"
    ) {
      record.claim = null;
      return { status: "ready", prepared: false };
    }
    if (
      record.disposition === "discarded-cleanup-failed" ||
      record.disposition === "discarded-cleanup-blocked"
    ) {
      return { status: "blocked", reason: "cleanup-unresolved" };
    }
    if (!record.reference) {
      return { status: "blocked", reason: "reference-unavailable" };
    }
    if (
      !record.originalOwnerUid ||
      record.reference.ownerUid !== record.originalOwnerUid ||
      record.diagnosticPhase === "owner-binding" ||
      record.diagnosticPhase === "reference-binding"
    ) {
      return { status: "blocked", reason: "owner-mismatch" };
    }
    if (hasUsableClaim(record.claim, now())) {
      return { status: "ready", prepared: false };
    }
    record.claim = null;
    if (record.claimPreparationPromise) return record.claimPreparationPromise;

    const preparation = (async (): Promise<InternalPreparationResult> => {
      const identity = getIdentity();
      if (!identity) {
        return { status: "blocked", reason: "identity-unavailable" };
      }
      if (identity.uid !== record.originalOwnerUid) {
        return { status: "blocked", reason: "owner-mismatch" };
      }
      try {
        const claim = await dependencies.claimClient.createOwnershipClaim(
          record.reference!,
          identity,
        );
        if (!hasUsableClaim(claim, now())) {
          throw new Error("The server-issued upload ownership claim is unavailable.");
        }
        if (record.disposition === "accepted-canonical") {
          record.claim = null;
          return { status: "ready", prepared: false };
        }
        record.claim = { ...claim };
        record.diagnosticPhase = null;
        if (record.disposition !== "discard-requested") {
          record.disposition = "claim-prepared";
        }
        return { status: "ready", prepared: true };
      } catch {
        record.claim = null;
        record.diagnosticPhase = "claim-preparation";
        return { status: "blocked", reason: "claim-preparation-failed" };
      }
    })();
    record.claimPreparationPromise = preparation;
    try {
      return await preparation;
    } finally {
      if (record.claimPreparationPromise === preparation) {
        record.claimPreparationPromise = null;
      }
    }
  };

  const prepareForAuthTransition = async (
    getIdentity: CleanupIdentityProvider,
  ): Promise<DesignStylePrecanonicalAuthPreparationResult> => {
    let preparedClaimCount = 0;
    for (const record of [...records.values()]) {
      await record.referenceSettlement;
      if (record.cleanupPromise) {
        const cleanup = await record.cleanupPromise;
        if (
          cleanup.status === "accepted-canonical" ||
          cleanup.status === "discarded-cleaned"
        ) {
          continue;
        }
        return {
          status: "blocked",
          reason: "cleanup-unresolved",
          operation: record.operation,
        };
      }
      const prepared = await prepareRecordClaim(record, getIdentity);
      if (prepared.status === "blocked") {
        return {
          status: "blocked",
          reason: prepared.reason,
          operation: record.operation,
        };
      }
      if (prepared.prepared) preparedClaimCount += 1;
    }
    return { status: "ready", preparedClaimCount };
  };

  const finishBlocked = (
    record: InternalCleanupRecord,
    reason: Extract<
      DesignStylePrecanonicalDiscardCleanupResult,
      { status: "discarded-cleanup-blocked" }
    >["reason"],
  ): DesignStylePrecanonicalDiscardCleanupResult =>
    setCleanupResult(record, {
      status: "discarded-cleanup-blocked",
      reason,
      operation: record.operation,
    });

  const cleanupDiscarded = (
    operation: DesignStylePrecanonicalUploadCleanupHandle,
    getIdentity: CleanupIdentityProvider,
    deleteDraftOverride?: DeleteCustomerDesignDraft,
  ): Promise<DesignStylePrecanonicalDiscardCleanupResult> => {
    const deleteDraft = deleteDraftOverride || dependencies.deleteDraft;
    const record = findRecord(operation);
    if (!record) {
      return Promise.resolve({
        status: "discarded-cleanup-blocked",
        reason: "reference-unavailable",
        operation,
      });
    }
    if (record.disposition === "accepted-canonical") {
      return Promise.resolve({ status: "accepted-canonical", operation });
    }
    if (record.cleanupResult) return Promise.resolve(record.cleanupResult);
    if (record.cleanupPromise) return record.cleanupPromise;
    markDiscarded(operation);

    const cleanup = (async (): Promise<DesignStylePrecanonicalDiscardCleanupResult> => {
      await record.referenceSettlement;
      if (record.disposition === "accepted-canonical") {
        record.claim = null;
        return { status: "accepted-canonical", operation: record.operation };
      }
      if (!record.reference) {
        return setCleanupResult(record, {
          status: "discarded-cleaned",
          method: "no-source",
          operation: record.operation,
        });
      }
      if (
        !record.originalOwnerUid ||
        record.reference.ownerUid !== record.originalOwnerUid
      ) {
        return finishBlocked(record, "owner-unresolved");
      }
      if (
        !isCustomerDesignDraftStoragePath(record.reference) ||
        record.diagnosticPhase === "reference-binding"
      ) {
        return finishBlocked(record, "reference-mismatch");
      }
      if (record.claimPreparationPromise) {
        await record.claimPreparationPromise;
      }
      const identity = getIdentity();
      if (!identity) return finishBlocked(record, "identity-unavailable");

      if (identity.uid === record.originalOwnerUid) {
        record.claim = null;
        record.diagnosticPhase = "direct-delete";
        try {
          await deleteDraft(record.reference);
          record.diagnosticPhase = null;
          return setCleanupResult(record, {
            status: "discarded-cleaned",
            method: "direct-delete",
            operation: record.operation,
          });
        } catch (error) {
          return setCleanupResult(record, {
            status: "discarded-cleanup-failed",
            phase: "direct-delete",
            operation: record.operation,
            error,
          });
        }
      }

      if (!hasUsableClaim(record.claim, now())) {
        return finishBlocked(record, "claim-unavailable");
      }
      record.diagnosticPhase = "transfer";
      let transferredReference: CustomerDesignUploadReference;
      try {
        transferredReference = await dependencies.transferClient.transferDraftOwnership({
          draftReference: record.reference,
          ownershipClaimToken: record.claim.claimToken,
          identity,
        });
      } catch (error) {
        return setCleanupResult(record, {
          status: "discarded-cleanup-failed",
          phase: "transfer",
          operation: record.operation,
          error,
        });
      }
      if (
        transferredReference.ownerUid !== identity.uid ||
        transferredReference.designReferenceId !==
          record.reference.designReferenceId ||
        transferredReference.mimeType !== record.reference.mimeType ||
        !isCustomerDesignDraftStoragePath(transferredReference)
      ) {
        return finishBlocked(record, "reference-mismatch");
      }
      record.transferredReference = cloneReference(transferredReference);
      record.claim = null;
      record.diagnosticPhase = "transferred-delete";
      try {
        await deleteDraft(transferredReference);
        record.diagnosticPhase = null;
        return setCleanupResult(record, {
          status: "discarded-cleaned",
          method: "transfer-delete",
          operation: record.operation,
        });
      } catch (error) {
        return setCleanupResult(record, {
          status: "discarded-cleanup-failed",
          phase: "transferred-delete",
          operation: record.operation,
          error,
        });
      }
    })();
    record.cleanupPromise = cleanup;
    return cleanup;
  };

  const getSnapshot = (
    operation: DesignStylePrecanonicalUploadCleanupHandle,
  ): DesignStylePrecanonicalUploadCleanupSnapshot | null => {
    const record = findRecord(operation);
    if (!record) return null;
    return {
      operation: record.operation,
      originalOwnerUid: record.originalOwnerUid,
      reference: record.reference ? cloneReference(record.reference) : null,
      transferredReference: record.transferredReference
        ? cloneReference(record.transferredReference)
        : null,
      disposition: record.disposition,
      uploadSettled: record.uploadSettled,
      hasPreparedClaim: hasUsableClaim(record.claim, now()),
      diagnosticPhase: record.diagnosticPhase,
    };
  };

  return {
    registerOperation,
    bindOriginalOwner,
    attachReference,
    settleUpload,
    markDiscarded,
    acceptCanonical,
    prepareForAuthTransition,
    cleanupDiscarded,
    getSnapshot,
  };
};

export const designStylePrecanonicalUploadCleanupCoordinator =
  createDesignStylePrecanonicalUploadCleanupCoordinator({
    claimClient: customerDesignOrderTransferClient,
    transferClient: customerDesignDraftOwnershipTransferClient,
    deleteDraft: CustomerDesignUploadService.deleteCustomerDesignDraft,
  });
