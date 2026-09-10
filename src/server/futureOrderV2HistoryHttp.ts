import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  createAdminFutureOrderV2HistoryAdapter,
  lookupFutureOrderV2UploadedSourceHistory,
  type FutureOrderV2HistoryFirestore,
} from "./futureOrderV2History.js";

type VerifiedToken = {
  readonly uid: string;
  readonly firebase?: { readonly sign_in_provider?: unknown };
};

type HistoryAdminServices = {
  auth: { verifyIdToken(token: string): Promise<VerifiedToken> };
  db: unknown;
};

export interface FutureOrderV2HistoryHttpDependencies {
  getServices?: () => HistoryAdminServices;
  createAdapter?: (db: unknown) => ReturnType<typeof createAdminFutureOrderV2HistoryAdapter>;
}

const getBearerToken = (req: HttpRequest): string | null => {
  const value = req.headers.authorization;
  const authorization = Array.isArray(value) ? value[0] : value;
  return authorization?.match(/^Bearer ([^\s]+)$/)?.[1] || null;
};

const isRequest = (value: unknown): value is { uploadedSourceRef: string } =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value as Record<string, unknown>).length === 1 &&
  typeof (value as Record<string, unknown>).uploadedSourceRef === "string";

const send = (res: HttpResponse, status: number, body: unknown): unknown =>
  res.setHeader("Cache-Control", "no-store").status(status).json(body);

export const createFutureOrderV2HistoryHandler = (
  dependencies: FutureOrderV2HistoryHttpDependencies = {},
) => {
  const getServices =
    dependencies.getServices || (getAdminServices as unknown as () => HistoryAdminServices);
  const createAdapter =
    dependencies.createAdapter ||
    ((db: unknown) => createAdminFutureOrderV2HistoryAdapter(db as FutureOrderV2HistoryFirestore));

  return async (req: HttpRequest, res: HttpResponse) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return send(res, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    const bearerToken = getBearerToken(req);
    if (!bearerToken) {
      return send(res, 401, { error: "Firebase authentication is required.", code: "AUTH_REQUIRED" });
    }
    if (!isRequest(req.body)) {
      return send(res, 400, { error: "The history request is malformed.", code: "INVALID_REQUEST" });
    }

    let token: VerifiedToken;
    try {
      token = await getServices().auth.verifyIdToken(bearerToken);
    } catch {
      return send(res, 401, { error: "Firebase authentication could not be verified.", code: "AUTH_REQUIRED" });
    }
    const signInProvider = token.firebase?.sign_in_provider;
    if (!token.uid || signInProvider === "anonymous") {
      return send(res, 403, { error: "A non-anonymous account is required.", code: "ANONYMOUS_NOT_ALLOWED" });
    }
    if (typeof signInProvider !== "string" || signInProvider.length === 0) {
      return send(res, 401, { error: "Firebase authentication could not be verified.", code: "AUTH_REQUIRED" });
    }

    const status = await lookupFutureOrderV2UploadedSourceHistory({
      identity: { uid: token.uid, isAnonymous: false },
      uploadedSourceRef: req.body.uploadedSourceRef,
      adapter: createAdapter(getServices().db),
    });
    return send(res, 200, { status });
  };
};

export const handleFutureOrderV2History = createFutureOrderV2HistoryHandler();
