import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  UploadedDesignDraftTransferError,
  getUploadedDesignDraftTransferRedemptionId,
  parseUploadedDesignDraftTransferRequest,
  transferVerifiedUploadedDesignDraft,
} from "./uploadedDesignDraftTransfer.js";
import type {
  TrustedStorageBucket,
  VerifiedFirebaseToken,
} from "./uploadedDesignTransfer.js";
import {
  UploadedDesignOwnershipClaimError,
  redeemUploadedDesignOwnershipClaim,
  type OwnershipClaimStore,
} from "./uploadedDesignOwnershipClaim.js";

type DraftTransferAdminServices = {
  auth: { verifyIdToken(token: string): Promise<VerifiedFirebaseToken> };
  db: OwnershipClaimStore;
  storage: { bucket(): TrustedStorageBucket };
};

export interface UploadedDesignDraftTransferHttpDependencies {
  getServices?: () => DraftTransferAdminServices;
  redeemOwnershipClaim?: typeof redeemUploadedDesignOwnershipClaim;
  now?: () => Date;
  log?: (message: string) => void;
}

const getHeader = (req: HttpRequest, name: string): string | undefined => {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const setNoStore = (res: HttpResponse): HttpResponse => {
  res.setHeader("Cache-Control", "no-store");
  return res;
};

const statusByCode: Record<
  UploadedDesignDraftTransferError["code"],
  number
> = {
  AUTH_FAILED: 401,
  INVALID_REFERENCE: 400,
  TRUSTED_OWNERSHIP_CLAIM_REQUIRED: 409,
  TRUSTED_OWNERSHIP_CLAIM_INVALID: 403,
  SOURCE_NOT_FOUND: 404,
  INVALID_FILE: 400,
  DESTINATION_CONFLICT: 409,
  TRANSFER_FAILED: 503,
};

const sendError = (
  res: HttpResponse,
  error: UploadedDesignDraftTransferError,
) =>
  setNoStore(res)
    .status(statusByCode[error.code])
    .json({ error: error.message, code: error.code });

export const createUploadedDesignDraftTransferHandler = (
  dependencies: UploadedDesignDraftTransferHttpDependencies = {},
) => {
  const getServices = dependencies.getServices || getAdminServices;
  const redeemOwnershipClaim =
    dependencies.redeemOwnershipClaim || redeemUploadedDesignOwnershipClaim;
  const now = dependencies.now || (() => new Date());
  const log = dependencies.log || ((message: string) => console.info(message));

  return async (req: HttpRequest, res: HttpResponse) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return setNoStore(res).status(405).json({ error: "Method not allowed." });
    }
    const authorization = getHeader(req, "authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return sendError(
        res,
        new UploadedDesignDraftTransferError(
          "AUTH_FAILED",
          "Firebase authentication is required.",
        ),
      );
    }

    try {
      const request = parseUploadedDesignDraftTransferRequest(req.body);
      const services = getServices();
      let token: VerifiedFirebaseToken;
      try {
        token = await services.auth.verifyIdToken(authorization.slice(7));
      } catch {
        throw new UploadedDesignDraftTransferError(
          "AUTH_FAILED",
          "Firebase authentication could not be verified.",
        );
      }

      let trustedSourceOwnerUid: string;
      try {
        const ownership = await redeemOwnershipClaim({
          authenticatedUid: token.uid,
          claimToken: request.ownershipClaimToken,
          orderId: getUploadedDesignDraftTransferRedemptionId(
            token.uid,
            request.draftReference.designReferenceId,
          ),
          draftReference: request.draftReference,
          store: services.db as unknown as OwnershipClaimStore,
          now,
        });
        trustedSourceOwnerUid = ownership.sourceOwnerUid;
      } catch (error) {
        if (error instanceof UploadedDesignOwnershipClaimError) {
          throw new UploadedDesignDraftTransferError(
            "TRUSTED_OWNERSHIP_CLAIM_INVALID",
            "The uploaded design ownership claim could not be verified.",
          );
        }
        throw error;
      }

      const result = await transferVerifiedUploadedDesignDraft({
        authenticatedUid: token.uid,
        request,
        bucket: services.storage.bucket() as unknown as TrustedStorageBucket,
        trustedSourceOwnerUid,
        now: () => now().toISOString(),
      });
      log(`uploaded-design-draft-transfer status=${result.status}`);
      return setNoStore(res).status(200).json(result);
    } catch (error) {
      if (error instanceof UploadedDesignDraftTransferError) {
        log(`uploaded-design-draft-transfer error=${error.code}`);
        return sendError(res, error);
      }
      log("uploaded-design-draft-transfer error=TRANSFER_FAILED");
      return sendError(
        res,
        new UploadedDesignDraftTransferError(
          "TRANSFER_FAILED",
          "The private customer design could not be transferred.",
        ),
      );
    }
  };
};

export const handleUploadedDesignDraftTransfer =
  createUploadedDesignDraftTransferHandler();
