import type {
  CustomerDesignUploadReference,
  GuestDesignDraft,
  UploadedDesignSource,
} from "../types";
import { isValidUploadedDesignSource } from "../utils/designSourceState";
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
  | { status: "ready"; method: "not_required" | "uid_preserved" | "transferred" }
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
  isValidUploadedDesignSource(draft?.designSource)
    ? draft!.designSource
    : null;

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

const replaceUploadedReference = (
  draft: GuestDesignDraft,
  source: UploadedDesignSource,
  reference: CustomerDesignUploadReference,
): GuestDesignDraft => ({
  ...clearTransferMarker(draft),
  designSource: {
    ...source,
    uploadReference: { ...reference },
  },
});

export const createGuestUploadedDesignOwnershipContinuity = (
  dependencies: GuestUploadedDesignOwnershipContinuityDependencies,
) => {
  const now = dependencies.now || (() => Date.now());
  let pendingClaim: PendingOwnershipClaim | null = null;
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

  const prepare = async (
    identity: CustomerDesignDraftTransferIdentity | null,
  ): Promise<GuestUploadedDesignContinuityResult> => {
    const draft = dependencies.loadDraft();
    const source = getUploadedSource(draft);
    if (!draft || !source) {
      pendingClaim = null;
      return { status: "ready", method: "not_required" };
    }
    if (identity?.uid === source.uploadReference.ownerUid) {
      try {
        const claim = await dependencies.claimClient.createOwnershipClaim(
          source.uploadReference,
          identity,
        );
        pendingClaim = {
          reference: { ...source.uploadReference },
          claim: { ...claim },
        };
        return { status: "ready", method: "uid_preserved" };
      } catch {
        pendingClaim = null;
        return saveRequired(draft, "claim_preparation_failed");
      }
    }
    pendingClaim = null;
    return saveRequired(draft, "source_identity_unavailable");
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
    const completion = (async () => {
      const draft = dependencies.loadDraft();
      const source = getUploadedSource(draft);
      if (!draft || !source) {
        pendingClaim = null;
        return { status: "ready", method: "not_required" } as const;
      }
      if (source.uploadReference.ownerUid === identity.uid) {
        const reconciled = clearTransferMarker(draft);
        if (reconciled !== draft) dependencies.saveDraft(reconciled);
        pendingClaim = null;
        return { status: "ready", method: "uid_preserved" } as const;
      }
      const claimExpiresAt = pendingClaim
        ? new Date(pendingClaim.claim.expiresAt).getTime()
        : Number.NaN;
      if (
        !pendingClaim ||
        !sameReference(pendingClaim.reference, source.uploadReference) ||
        !Number.isFinite(claimExpiresAt) ||
        claimExpiresAt <= now()
      ) {
        pendingClaim = null;
        return saveRequired(draft, "claim_unavailable");
      }

      try {
        const transferredReference =
          await dependencies.transferClient.transferDraftOwnership({
            draftReference: source.uploadReference,
            ownershipClaimToken: pendingClaim.claim.claimToken,
            identity,
          });
        const currentDraft = dependencies.loadDraft();
        const currentSource = getUploadedSource(currentDraft);
        if (
          !currentDraft ||
          !currentSource ||
          !sameReference(currentSource.uploadReference, source.uploadReference)
        ) {
          pendingClaim = null;
          if (
            currentDraft &&
            currentSource?.uploadReference.ownerUid === identity.uid
          ) {
            dependencies.saveDraft(clearTransferMarker(currentDraft));
            return { status: "ready", method: "uid_preserved" } as const;
          }
          return currentDraft
            ? ({
                status: "transfer_required",
                reason: "claim_unavailable",
              } as const)
            : ({ status: "ready", method: "not_required" } as const);
        }
        dependencies.saveDraft(
          replaceUploadedReference(
            currentDraft,
            currentSource,
            transferredReference,
          ),
        );
        pendingClaim = null;
        return { status: "ready", method: "transferred" } as const;
      } catch {
        return saveRequired(draft, "transfer_failed");
      }
    })();
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

  return { prepare, ensure, getStatus };
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
