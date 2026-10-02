import type {
  CustomerDesignUploadReference,
  GuestDesignDraft,
  UploadedDesignSource,
} from "../types";
import { isValidUploadedDesignDraftSource } from "../utils/designSourceState";
import { removeForeignUploadedDesignSources } from "../utils/foreignUploadedDesignSources";
import {
  inspectUploadedDesignSourceRegistry,
  UPLOADED_DESIGN_SOURCE_REGISTRY_FIELD,
  upsertUploadedDesignSources,
} from "../utils/uploadedDesignSourceRegistry";
import {
  customerDesignDraftOwnershipTransferClient,
  type CustomerDesignDraftTransferIdentity,
  type TrustedCustomerDesignDraftTransferClient,
} from "./customerDesignDraftOwnershipTransfer";
import {
  customerDesignOrderTransferClient,
  type TrustedUploadedDesignTransferClient,
  type UploadedDesignOwnershipClaim,
} from "./customerDesignOrderTransfer";
import { GuestOrderSessionService } from "./guestOrderSessionService";

export const GUEST_UPLOAD_TRANSFER_REQUIRED_MESSAGE =
  "Your guest design is still saved on this device, but its secure ownership transfer must finish before the account draft can be saved.";

export type GuestUploadedDesignContinuityResult =
  | {
      status: "ready";
      method: "not_required" | "uid_preserved" | "transferred";
      removedGarmentKeys?: readonly string[];
    }
  | {
      status: "transfer_required";
      reason: NonNullable<
        GuestDesignDraft["uploadedDesignOwnershipTransition"]
      >["reason"];
    };

interface PendingOwnershipClaim {
  reference: CustomerDesignUploadReference;
  claim: UploadedDesignOwnershipClaim;
}

interface TransferredReference {
  from: CustomerDesignUploadReference;
  to: CustomerDesignUploadReference;
}

interface GuestUploadedDesignOwnershipContinuityDependencies {
  loadDraft: () => GuestDesignDraft | null;
  saveDraft: (draft: GuestDesignDraft) => void;
  claimClient: Pick<TrustedUploadedDesignTransferClient, "createOwnershipClaim">;
  transferClient: TrustedCustomerDesignDraftTransferClient;
  now?: () => number;
}

const getUploadedSource = (
  draft: GuestDesignDraft | null,
): UploadedDesignSource | null =>
  isValidUploadedDesignDraftSource(draft?.designSource)
    ? draft!.designSource
    : null;

const collectUploadedSources = (
  draft: GuestDesignDraft,
): Map<string, UploadedDesignSource> => {
  const sources = new Map<string, UploadedDesignSource>();
  const registry = inspectUploadedDesignSourceRegistry(draft);
  if (registry.status === "valid") {
    for (const source of Object.values(
      registry.registry.sourcesByUploadedSourceRef,
    )) {
      sources.set(source.uploadReference.designReferenceId, source);
    }
  }
  const scalar = getUploadedSource(draft);
  if (scalar && !sources.has(scalar.uploadReference.designReferenceId)) {
    sources.set(scalar.uploadReference.designReferenceId, scalar);
  }
  return sources;
};

const sameReference = (
  left: CustomerDesignUploadReference,
  right: CustomerDesignUploadReference,
): boolean =>
  left.ownerUid === right.ownerUid &&
  left.designReferenceId === right.designReferenceId &&
  left.storagePath === right.storagePath &&
  left.mimeType === right.mimeType;

const clearTransferMarker = (draft: GuestDesignDraft): GuestDesignDraft => {
  if (!draft.uploadedDesignOwnershipTransition) return draft;
  const {
    uploadedDesignOwnershipTransition: _discardedTransition,
    ...draftWithoutTransition
  } = draft;
  return draftWithoutTransition;
};

const markTransferRequired = (
  draft: GuestDesignDraft,
  reason: NonNullable<
    GuestDesignDraft["uploadedDesignOwnershipTransition"]
  >["reason"],
): GuestDesignDraft => ({
  ...draft,
  uploadedDesignOwnershipTransition: {
    schemaVersion: 1,
    status: "transfer_required",
    reason,
  },
});

const applyTransferredReferences = (
  draft: GuestDesignDraft,
  transferred: ReadonlyMap<string, TransferredReference>,
): GuestDesignDraft => {
  if (transferred.size === 0) return draft;
  let next: GuestDesignDraft = clearTransferMarker(draft);
  const registry = inspectUploadedDesignSourceRegistry(draft);
  if (registry.status === "valid") {
    const moved = Object.values(registry.registry.sourcesByUploadedSourceRef)
      .flatMap((source) => {
        const transfer = transferred.get(
          source.uploadReference.designReferenceId,
        );
        return transfer && sameReference(source.uploadReference, transfer.from)
          ? [{ ...source, uploadReference: { ...transfer.to } }]
          : [];
      });
    next = {
      ...next,
      [UPLOADED_DESIGN_SOURCE_REGISTRY_FIELD]: upsertUploadedDesignSources(
        registry.registry,
        moved,
      ),
    };
  }
  const scalar = getUploadedSource(draft);
  const scalarTransfer = scalar
    ? transferred.get(scalar.uploadReference.designReferenceId)
    : undefined;
  if (
    scalar &&
    scalarTransfer &&
    sameReference(scalar.uploadReference, scalarTransfer.from)
  ) {
    next = {
      ...next,
      designSource: { ...scalar, uploadReference: { ...scalarTransfer.to } },
    };
  }
  return next;
};

export const createGuestUploadedDesignOwnershipContinuity = (
  dependencies: GuestUploadedDesignOwnershipContinuityDependencies,
) => {
  const now = dependencies.now || (() => Date.now());
  const pendingClaims = new Map<string, PendingOwnershipClaim>();
  let removedGarmentKeys: readonly string[] = [];
  let pendingCompletion: {
    targetUid: string;
    promise: Promise<GuestUploadedDesignContinuityResult>;
  } | null = null;

  const saveRequired = (
    draft: GuestDesignDraft,
    reason: NonNullable<
      GuestDesignDraft["uploadedDesignOwnershipTransition"]
    >["reason"],
  ): GuestUploadedDesignContinuityResult => {
    dependencies.saveDraft(markTransferRequired(draft, reason));
    return { status: "transfer_required", reason };
  };

  const usableClaim = (
    source: UploadedDesignSource,
  ): PendingOwnershipClaim | null => {
    const pending = pendingClaims.get(source.uploadReference.designReferenceId);
    if (!pending || !sameReference(pending.reference, source.uploadReference)) {
      return null;
    }
    const expiresAt = new Date(pending.claim.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt > now() ? pending : null;
  };

  const prepare = async (
    identity: CustomerDesignDraftTransferIdentity | null,
  ): Promise<GuestUploadedDesignContinuityResult> => {
    pendingClaims.clear();
    const draft = dependencies.loadDraft();
    if (!draft || !identity) return { status: "ready", method: "not_required" };
    const owned = [...collectUploadedSources(draft).values()].filter(
      (source) => source.uploadReference.ownerUid === identity.uid,
    );
    if (owned.length === 0) return { status: "ready", method: "not_required" };
    try {
      for (const source of owned) {
        const claim = await dependencies.claimClient.createOwnershipClaim(
          source.uploadReference,
          identity,
        );
        pendingClaims.set(source.uploadReference.designReferenceId, {
          reference: { ...source.uploadReference },
          claim: { ...claim },
        });
      }
      return { status: "ready", method: "uid_preserved" };
    } catch {
      pendingClaims.clear();
      return saveRequired(draft, "claim_preparation_failed");
    }
  };

  const complete = async (
    identity: CustomerDesignDraftTransferIdentity,
  ): Promise<GuestUploadedDesignContinuityResult> => {
    const draft = dependencies.loadDraft();
    if (!draft) {
      pendingClaims.clear();
      return { status: "ready", method: "not_required" };
    }
    const sources = collectUploadedSources(draft);
    const foreign = [...sources.values()].filter(
      (source) => source.uploadReference.ownerUid !== identity.uid,
    );
    if (foreign.length === 0) {
      const reconciled = clearTransferMarker(draft);
      if (reconciled !== draft) dependencies.saveDraft(reconciled);
      pendingClaims.clear();
      return {
        status: "ready",
        method: sources.size > 0 ? "uid_preserved" : "not_required",
      };
    }

    const transferred = new Map<string, TransferredReference>();
    let transferFailed = false;
    for (const source of foreign) {
      const pending = usableClaim(source);
      if (!pending) continue;
      const designReferenceId = source.uploadReference.designReferenceId;
      try {
        const reference =
          await dependencies.transferClient.transferDraftOwnership({
            draftReference: source.uploadReference,
            ownershipClaimToken: pending.claim.claimToken,
            identity,
          });
        if (
          reference.designReferenceId !== designReferenceId ||
          reference.ownerUid !== identity.uid
        ) {
          throw new Error("Transferred reference does not match the upload.");
        }
        transferred.set(designReferenceId, {
          from: { ...source.uploadReference },
          to: { ...reference },
        });
        pendingClaims.delete(designReferenceId);
      } catch {
        transferFailed = true;
      }
    }

    const currentDraft = dependencies.loadDraft();
    if (!currentDraft) {
      pendingClaims.clear();
      return { status: "ready", method: "not_required" };
    }
    const currentSources = collectUploadedSources(currentDraft);
    const stale = [...transferred.values()].some(({ from }) => {
      const current = currentSources.get(from.designReferenceId);
      return (
        !current ||
        (!sameReference(current.uploadReference, from) &&
          current.uploadReference.ownerUid !== identity.uid)
      );
    });
    if (stale) {
      pendingClaims.clear();
      return { status: "transfer_required", reason: "claim_unavailable" };
    }

    const moved = applyTransferredReferences(currentDraft, transferred);
    if (transferFailed) return saveRequired(moved, "transfer_failed");

    const removal = removeForeignUploadedDesignSources(moved, identity.uid);
    if (removal.draft !== currentDraft) dependencies.saveDraft(removal.draft);
    pendingClaims.clear();
    removedGarmentKeys = [
      ...new Set([...removedGarmentKeys, ...removal.removedGarmentKeys]),
    ];
    return {
      status: "ready",
      method: transferred.size > 0 ? "transferred" : "not_required",
      ...(removal.removedGarmentKeys.length > 0
        ? { removedGarmentKeys: removal.removedGarmentKeys }
        : {}),
    };
  };

  const ensure = async (
    identity: CustomerDesignDraftTransferIdentity,
  ): Promise<GuestUploadedDesignContinuityResult> => {
    if (pendingCompletion) {
      if (pendingCompletion.targetUid === identity.uid) {
        return pendingCompletion.promise;
      }
      await pendingCompletion.promise;
      return ensure(identity);
    }
    const completion = complete(identity);
    pendingCompletion = { targetUid: identity.uid, promise: completion };
    return completion.finally(() => {
      if (pendingCompletion?.promise === completion) {
        pendingCompletion = null;
      }
    });
  };

  const getStatus = (): GuestUploadedDesignContinuityResult => {
    const draft = dependencies.loadDraft();
    const transition = draft?.uploadedDesignOwnershipTransition;
    return transition?.status === "transfer_required"
      ? { status: "transfer_required", reason: transition.reason }
      : { status: "ready", method: "not_required" };
  };

  const takeRemovedGarmentKeys = (): readonly string[] => {
    const keys = removedGarmentKeys;
    removedGarmentKeys = [];
    return keys;
  };

  return { prepare, ensure, getStatus, takeRemovedGarmentKeys };
};

export type GuestUploadedDesignOwnershipContinuity = ReturnType<
  typeof createGuestUploadedDesignOwnershipContinuity
>;

export const guestUploadedDesignOwnershipContinuity =
  createGuestUploadedDesignOwnershipContinuity({
    loadDraft: GuestOrderSessionService.getFutureDesignDraft,
    saveDraft: GuestOrderSessionService.saveFutureDesignDraft,
    claimClient: customerDesignOrderTransferClient,
    transferClient: customerDesignDraftOwnershipTransferClient,
  });
