import type { Firestore } from "firebase-admin/firestore";
import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  createAdminFutureOrderV2PersistenceAdapter,
  FutureOrderV2ServerError,
  persistFutureOrderV2ForVerifiedIdentity,
} from "./futureOrderV2Persistence.js";
import {
  parseFutureOrderV2PersistenceRequest,
  type FutureOrderV2PersistenceAdapter,
} from "../utils/futureOrderV2PersistenceContract.js";

export interface VerifiedFutureOrderV2Token {
  readonly uid: string;
  readonly firebase?: {
    readonly sign_in_provider?: unknown;
  };
}

type FutureOrderV2AdminServices = {
  auth: {
    verifyIdToken(token: string): Promise<VerifiedFutureOrderV2Token>;
  };
  db: unknown;
};

export interface FutureOrderV2PersistenceHttpDependencies {
  getServices?: () => FutureOrderV2AdminServices;
  createAdapter?: (db: unknown) => FutureOrderV2PersistenceAdapter;
  now?: () => Date;
  log?: (message: string) => void;
}

const getHeader = (req: HttpRequest, name: string): string | undefined => {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const getBearerToken = (req: HttpRequest): string | null => {
  const authorization = getHeader(req, "authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  return match?.[1] || null;
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

const statusByServerError: Record<FutureOrderV2ServerError["code"], number> = {
  AUTH_REQUIRED: 401,
  ANONYMOUS_NOT_ALLOWED: 403,
  OWNER_MISMATCH: 403,
  ORDER_ID_UNAVAILABLE: 409,
};

export const createFutureOrderV2PersistenceHandler = (
  dependencies: FutureOrderV2PersistenceHttpDependencies = {},
) => {
  const getServices =
    dependencies.getServices ||
    (getAdminServices as unknown as () => FutureOrderV2AdminServices);
  const createAdapter =
    dependencies.createAdapter ||
    ((db: unknown) =>
      createAdminFutureOrderV2PersistenceAdapter(db as Firestore));
  const log = dependencies.log || ((message: string) => console.info(message));

  return async (req: HttpRequest, res: HttpResponse) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    }

    const bearerToken = getBearerToken(req);
    if (!bearerToken) {
      return sendError(
        res,
        401,
        "AUTH_REQUIRED",
        "Firebase authentication is required.",
      );
    }

    try {
      const services = getServices();
      let token: VerifiedFutureOrderV2Token;
      try {
        token = await services.auth.verifyIdToken(bearerToken);
      } catch {
        throw new FutureOrderV2ServerError(
          "AUTH_REQUIRED",
          "Firebase authentication could not be verified.",
        );
      }

      const signInProvider = token.firebase?.sign_in_provider;
      if (typeof signInProvider !== "string" || signInProvider.length === 0) {
        throw new FutureOrderV2ServerError(
          "AUTH_REQUIRED",
          "Firebase authentication could not be verified.",
        );
      }
      const request = parseFutureOrderV2PersistenceRequest(req.body);
      if (request.status !== "valid") {
        log(`future-order-v2-persistence invalid=${request.code}`);
        return setNoStore(res).status(400).json(request);
      }

      const result = await persistFutureOrderV2ForVerifiedIdentity({
        identity: {
          uid: token.uid,
          isAnonymous: signInProvider === "anonymous",
        },
        request: request.value,
        adapter: createAdapter(services.db),
        now: dependencies.now,
      });
      const status =
        result.status === "created"
          ? 201
          : result.status === "already_persisted"
            ? 200
            : result.status === "conflict"
              ? 409
              : 400;
      log(`future-order-v2-persistence status=${result.status}`);
      return setNoStore(res).status(status).json(result);
    } catch (error) {
      if (error instanceof FutureOrderV2ServerError) {
        log(`future-order-v2-persistence error=${error.code}`);
        if (error.code === "ORDER_ID_UNAVAILABLE") {
          return setNoStore(res).status(409).json({
            status: "conflict",
            code: "ORDER_ID_UNAVAILABLE",
          });
        }
        return sendError(
          res,
          statusByServerError[error.code],
          error.code,
          error.message,
        );
      }
      log("future-order-v2-persistence error=ORDER_PERSISTENCE_UNAVAILABLE");
      return sendError(
        res,
        503,
        "ORDER_PERSISTENCE_UNAVAILABLE",
        "The secure future order service is temporarily unavailable.",
      );
    }
  };
};

export const handleFutureOrderV2Persistence =
  createFutureOrderV2PersistenceHandler();
