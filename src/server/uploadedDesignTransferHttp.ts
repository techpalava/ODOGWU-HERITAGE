import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  TrustedUploadedDesignTransferError,
  parseUploadedDesignTransferRequest,
  transferVerifiedUploadedDesign,
  type TrustedStorageBucket,
  type VerifiedFirebaseToken,
} from "./uploadedDesignTransfer.js";
import {
  UploadedDesignOwnershipClaimError,
  redeemUploadedDesignOwnershipClaim,
  type OwnershipClaimStore,
} from "./uploadedDesignOwnershipClaim.js";

type TransferAdminServices = {
  auth: { verifyIdToken(token: string): Promise<VerifiedFirebaseToken> };
  db?: OwnershipClaimStore;
  storage: { bucket(): TrustedStorageBucket };
};

export interface UploadedDesignTransferHttpDependencies {
  getServices?: () => TransferAdminServices;
  now?: () => string;
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

const sendError = (
  res: HttpResponse,
  error: TrustedUploadedDesignTransferError,
) => {
  const statusByCode: Record<TrustedUploadedDesignTransferError["code"], number> = {
    AUTH_FAILED: 401,
    INVALID_REFERENCE: 400,
    SOURCE_NOT_AUTHORIZED: 403,
    TRUSTED_OWNERSHIP_CLAIM_REQUIRED: 409,
    SOURCE_NOT_FOUND: 404,
    INVALID_FILE: 400,
    DESTINATION_CONFLICT: 409,
    TRUSTED_OWNERSHIP_CLAIM_INVALID: 403,
    TRANSFER_FAILED: 503,
  };
  return setNoStore(res)
    .status(statusByCode[error.code])
    .json({ error: error.message, code: error.code });
};

export const createUploadedDesignTransferHandler = (
  dependencies: UploadedDesignTransferHttpDependencies = {},
) => {
  const getServices = dependencies.getServices || getAdminServices;
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
        new TrustedUploadedDesignTransferError(
          "AUTH_FAILED",
          "Firebase authentication is required.",
        ),
      );
    }

    try {
      const request = parseUploadedDesignTransferRequest(req.body);
      const services = getServices();
      let token: VerifiedFirebaseToken;
      try {
        token = await services.auth.verifyIdToken(authorization.slice(7));
      } catch {
        throw new TrustedUploadedDesignTransferError(
          "AUTH_FAILED",
          "Firebase authentication could not be verified.",
        );
      }

      const result = await transferVerifiedUploadedDesign({
        authenticatedUid: token.uid,
        request,
        // Firebase Admin's Bucket/File classes satisfy this narrow runtime
        // contract; keeping the cast here lets transfer tests use no-op mocks.
        bucket: services.storage.bucket() as unknown as TrustedStorageBucket,
        ...(request.draftReference.ownerUid !== token.uid && request.ownershipClaimToken
          ? {
              trustedSourceOwnerUid: await (async () => {
                if (!services.db) {
                  throw new TrustedUploadedDesignTransferError(
                    "TRUSTED_OWNERSHIP_CLAIM_INVALID",
                    "The uploaded design ownership claim could not be verified.",
                  );
                }
                try {
                  const ownership = await redeemUploadedDesignOwnershipClaim({
                    authenticatedUid: token.uid,
                    claimToken: request.ownershipClaimToken!,
                    orderId: request.orderId,
                    draftReference: request.draftReference,
                    store: services.db as unknown as OwnershipClaimStore,
                  });
                  return ownership.sourceOwnerUid;
                } catch (error) {
                  if (error instanceof UploadedDesignOwnershipClaimError) {
                    throw new TrustedUploadedDesignTransferError(
                      "TRUSTED_OWNERSHIP_CLAIM_INVALID",
                      "The uploaded design ownership claim could not be verified.",
                    );
                  }
                  throw error;
                }
              })(),
            }
          : {}),
        now: dependencies.now,
      });
      log(`uploaded-design-transfer status=${result.status}`);
      return setNoStore(res).status(200).json(result);
    } catch (error) {
      if (error instanceof TrustedUploadedDesignTransferError) {
        log(`uploaded-design-transfer error=${error.code}`);
        return sendError(res, error);
      }
      log("uploaded-design-transfer error=TRANSFER_FAILED");
      return sendError(
        res,
        new TrustedUploadedDesignTransferError(
          "TRANSFER_FAILED",
          "The private customer design could not be transferred to the order.",
        ),
      );
    }
  };
};

export const handleUploadedDesignTransfer = createUploadedDesignTransferHandler();
