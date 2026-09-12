import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  PrivateBatchInviteError,
  createPrivateBatchInvite,
  redeemPrivateBatchInvite,
  revokePrivateBatchInvite,
  type PrivateBatchInviteStore,
} from "./privateBatchInvites.js";

type VerifiedPrivateBatchToken = {
  readonly uid: string;
  readonly firebase?: { readonly sign_in_provider?: unknown };
};

type PrivateBatchInviteAdminServices = {
  auth: { verifyIdToken(token: string): Promise<VerifiedPrivateBatchToken> };
  db: PrivateBatchInviteStore;
};

export interface PrivateBatchInviteHttpDependencies {
  getServices?: () => PrivateBatchInviteAdminServices;
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

const sendError = (
  res: HttpResponse,
  status: number,
  code: string,
  message: string,
) => setNoStore(res).status(status).json({ error: message, code });

const errorStatus: Record<PrivateBatchInviteError["code"], number> = {
  PRIVATE_BATCH_AUTH_REQUIRED: 401,
  PRIVATE_BATCH_NOT_FOUND: 404,
  PRIVATE_BATCH_OWNER_REQUIRED: 403,
  PRIVATE_BATCH_INVITE_INVALID: 400,
  PRIVATE_BATCH_INVITE_EXPIRED: 409,
  PRIVATE_BATCH_INVITE_REVOKED: 409,
  PRIVATE_BATCH_NOT_ACCEPTING_MEMBERS: 409,
  PRIVATE_BATCH_CAPACITY_REACHED: 409,
  PRIVATE_BATCH_MEMBERSHIP_INVALID: 409,
};

const getVerifiedUid = async ({
  req,
  getServices,
}: {
  req: HttpRequest;
  getServices: () => PrivateBatchInviteAdminServices;
}): Promise<{ uid: string; services: PrivateBatchInviteAdminServices }> => {
  const authorization = getHeader(req, "authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match) {
    throw new PrivateBatchInviteError(
      "PRIVATE_BATCH_AUTH_REQUIRED",
      "Firebase authentication is required.",
    );
  }
  const services = getServices();
  let token: VerifiedPrivateBatchToken;
  try {
    token = await services.auth.verifyIdToken(match[1]);
  } catch {
    throw new PrivateBatchInviteError(
      "PRIVATE_BATCH_AUTH_REQUIRED",
      "Firebase authentication could not be verified.",
    );
  }
  if (
    !token.uid ||
    token.firebase?.sign_in_provider === "anonymous" ||
    typeof token.firebase?.sign_in_provider !== "string"
  ) {
    throw new PrivateBatchInviteError(
      "PRIVATE_BATCH_AUTH_REQUIRED",
      "A non-anonymous Firebase account is required.",
    );
  }
  return { uid: token.uid, services };
};

const requireBody = (body: unknown): Record<string, unknown> =>
  body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

export const createPrivateBatchInviteHandler = (
  dependencies: PrivateBatchInviteHttpDependencies = {},
) => {
  const getServices = dependencies.getServices || (getAdminServices as unknown as () => PrivateBatchInviteAdminServices);
  const log = dependencies.log || ((message: string) => console.info(message));
  return async (req: HttpRequest, res: HttpResponse) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    }
    try {
      const { uid, services } = await getVerifiedUid({ req, getServices });
      const body = requireBody(req.body);
      const result = await createPrivateBatchInvite({
        store: services.db,
        authenticatedUid: uid,
        groupId: String(body.groupId || ""),
        expiresAt: String(body.expiresAt || ""),
        maxRedemptions: body.maxRedemptions === undefined ? 1 : body.maxRedemptions as number,
        now: dependencies.now,
      });
      log(`private-batch-invite-issued group=${result.groupId}`);
      return setNoStore(res).status(201).json(result);
    } catch (error) {
      if (error instanceof PrivateBatchInviteError) {
        log(`private-batch-invite-issued error=${error.code}`);
        return sendError(res, errorStatus[error.code], error.code, error.message);
      }
      log("private-batch-invite-issued error=PRIVATE_BATCH_INVITE_INVALID");
      return sendError(res, 503, "PRIVATE_BATCH_INVITE_UNAVAILABLE", "The secure invitation service is temporarily unavailable.");
    }
  };
};

export const redeemPrivateBatchInviteHandler = (
  dependencies: PrivateBatchInviteHttpDependencies = {},
) => {
  const getServices = dependencies.getServices || (getAdminServices as unknown as () => PrivateBatchInviteAdminServices);
  const log = dependencies.log || ((message: string) => console.info(message));
  return async (req: HttpRequest, res: HttpResponse) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    }
    try {
      const { uid, services } = await getVerifiedUid({ req, getServices });
      const body = requireBody(req.body);
      const result = await redeemPrivateBatchInvite({
        store: services.db,
        authenticatedUid: uid,
        inviteToken: String(body.inviteToken || ""),
        now: dependencies.now,
      });
      log(`private-batch-invite-redeemed group=${result.groupId} status=${result.status}`);
      return setNoStore(res).status(200).json(result);
    } catch (error) {
      if (error instanceof PrivateBatchInviteError) {
        log(`private-batch-invite-redeemed error=${error.code}`);
        return sendError(res, errorStatus[error.code], error.code, error.message);
      }
      log("private-batch-invite-redeemed error=PRIVATE_BATCH_INVITE_INVALID");
      return sendError(res, 503, "PRIVATE_BATCH_INVITE_UNAVAILABLE", "The secure invitation service is temporarily unavailable.");
    }
  };
};

export const revokePrivateBatchInviteHandler = (
  dependencies: PrivateBatchInviteHttpDependencies = {},
) => {
  const getServices = dependencies.getServices || (getAdminServices as unknown as () => PrivateBatchInviteAdminServices);
  const log = dependencies.log || ((message: string) => console.info(message));
  return async (req: HttpRequest, res: HttpResponse) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    }
    try {
      const { uid, services } = await getVerifiedUid({ req, getServices });
      const body = requireBody(req.body);
      const result = await revokePrivateBatchInvite({
        store: services.db,
        authenticatedUid: uid,
        inviteToken: String(body.inviteToken || ""),
      });
      log(`private-batch-invite-revoked group=${result.groupId}`);
      return setNoStore(res).status(200).json(result);
    } catch (error) {
      if (error instanceof PrivateBatchInviteError) {
        log(`private-batch-invite-revoked error=${error.code}`);
        return sendError(res, errorStatus[error.code], error.code, error.message);
      }
      log("private-batch-invite-revoked error=PRIVATE_BATCH_INVITE_INVALID");
      return sendError(res, 503, "PRIVATE_BATCH_INVITE_UNAVAILABLE", "The secure invitation service is temporarily unavailable.");
    }
  };
};

export const handleCreatePrivateBatchInvite = createPrivateBatchInviteHandler();
export const handleRedeemPrivateBatchInvite = redeemPrivateBatchInviteHandler();
export const handleRevokePrivateBatchInvite = revokePrivateBatchInviteHandler();
