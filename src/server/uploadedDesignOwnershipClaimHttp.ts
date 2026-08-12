import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  UploadedDesignOwnershipClaimError,
  createUploadedDesignOwnershipClaim,
  type OwnershipClaimStore,
} from "./uploadedDesignOwnershipClaim.js";
import type { TrustedStorageBucket, VerifiedFirebaseToken } from "./uploadedDesignTransfer.js";
import { parseUploadedDesignTransferRequest } from "./uploadedDesignTransfer.js";

type OwnershipClaimAdminServices = {
  auth: { verifyIdToken(token: string): Promise<VerifiedFirebaseToken> };
  db: OwnershipClaimStore;
  storage: { bucket(): TrustedStorageBucket };
};

export interface UploadedDesignOwnershipClaimHttpDependencies {
  getServices?: () => OwnershipClaimAdminServices;
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

const statusByCode: Record<UploadedDesignOwnershipClaimError["code"], number> = {
  CLAIM_AUTH_REQUIRED: 401,
  CLAIM_INVALID_REFERENCE: 400,
  CLAIM_OWNER_MISMATCH: 403,
  CLAIM_NOT_FOUND: 404,
  CLAIM_EXPIRED: 409,
  CLAIM_ALREADY_USED: 409,
  CLAIM_REDEEMED_BY_DIFFERENT_USER: 403,
  TRUSTED_OWNERSHIP_CLAIM_INVALID: 403,
};

const sendError = (
  res: HttpResponse,
  error: UploadedDesignOwnershipClaimError,
) =>
  setNoStore(res)
    .status(statusByCode[error.code])
    .json({ error: error.message, code: error.code });

export const createUploadedDesignOwnershipClaimHandler = (
  dependencies: UploadedDesignOwnershipClaimHttpDependencies = {},
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
        new UploadedDesignOwnershipClaimError(
          "CLAIM_AUTH_REQUIRED",
          "Firebase authentication is required.",
        ),
      );
    }

    try {
      const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      const draftReference = body.draftReference;
      const services = getServices();
      let token: VerifiedFirebaseToken;
      try {
        token = await services.auth.verifyIdToken(authorization.slice(7));
      } catch {
        throw new UploadedDesignOwnershipClaimError(
          "CLAIM_AUTH_REQUIRED",
          "Firebase authentication could not be verified.",
        );
      }
      const parsed = parseUploadedDesignTransferRequest({
        orderId: "claim-preparation",
        draftReference,
      });
      const result = await createUploadedDesignOwnershipClaim({
        authenticatedUid: token.uid,
        draftReference: parsed.draftReference,
        store: services.db as unknown as OwnershipClaimStore,
        bucket: services.storage.bucket() as unknown as TrustedStorageBucket,
        now: dependencies.now,
      });
      log("uploaded-design-claim-created");
      return setNoStore(res).status(201).json(result);
    } catch (error) {
      if (error instanceof UploadedDesignOwnershipClaimError) {
        log(`uploaded-design-claim-create error=${error.code}`);
        return sendError(res, error);
      }
      log("uploaded-design-claim-create error=CLAIM_INVALID_REFERENCE");
      return sendError(
        res,
        new UploadedDesignOwnershipClaimError(
          "CLAIM_INVALID_REFERENCE",
          "The customer design reference is not a valid private draft.",
        ),
      );
    }
  };
};

export const handleCreateUploadedDesignOwnershipClaim =
  createUploadedDesignOwnershipClaimHandler();
