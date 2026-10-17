import type { Firestore } from "firebase-admin/firestore";
import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  FUTURE_ORDER_V2_COLLECTION,
  parsePersistedFutureOrderV2,
} from "../utils/futureOrderV2PersistenceContract.js";
import {
  decidePersonalizedAddition,
  FUTURE_ORDER_V2_PERSONALIZED_PRICE_COLLECTION,
  parseFutureOrderV2PersonalizedPrice,
  type FutureOrderV2PersonalizedPriceRecord,
} from "../utils/futureOrderV2PersonalizedPrice.js";

const SAFE_ORDER_ID = /^[A-Za-z0-9_-]{1,128}$/;

interface VerifiedDecisionToken {
  readonly uid: string;
  readonly firebase?: { readonly sign_in_provider?: unknown };
}

type DecisionAdminServices = {
  auth: { verifyIdToken(token: string): Promise<VerifiedDecisionToken> };
  db: unknown;
};

export interface PersonalizedPriceDecisionDependencies {
  getServices?: () => DecisionAdminServices;
  readOrder?: (db: unknown, orderId: string) => Promise<unknown | null>;
  readPrice?: (db: unknown, orderId: string) => Promise<unknown | null>;
  writePrice?: (
    db: unknown,
    orderId: string,
    record: FutureOrderV2PersonalizedPriceRecord,
  ) => Promise<void>;
}

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getBearerToken = (req: HttpRequest): string | null => {
  const header = req.headers.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  return match?.[1] || null;
};

const readOrderFromAdmin = async (db: unknown, orderId: string): Promise<unknown | null> => {
  const snapshot = await (db as Firestore)
    .collection(FUTURE_ORDER_V2_COLLECTION)
    .doc(orderId)
    .get();
  return snapshot.exists ? snapshot.data() ?? null : null;
};

const readPriceFromAdmin = async (db: unknown, orderId: string): Promise<unknown | null> => {
  const snapshot = await (db as Firestore)
    .collection(FUTURE_ORDER_V2_PERSONALIZED_PRICE_COLLECTION)
    .doc(orderId)
    .get();
  return snapshot.exists ? snapshot.data() ?? null : null;
};

const writePriceToAdmin = async (
  db: unknown,
  orderId: string,
  record: FutureOrderV2PersonalizedPriceRecord,
): Promise<void> => {
  await (db as Firestore)
    .collection(FUTURE_ORDER_V2_PERSONALIZED_PRICE_COLLECTION)
    .doc(orderId)
    .set({ ...record, updatedAt: new Date().toISOString() });
};

/** Query marker vercel.json adds when it rewrites the decision path onto a shared function. */
export const PERSONALIZED_PRICE_DECISION_ROUTE = "personalized-price-decision" as const;

/**
 * Vercel Hobby caps a deployment at 12 functions, so on Vercel this path is
 * rewritten onto `api/future-order-v2/payment-intent.ts`. Recognise it by the
 * rewrite marker (query or URL) or by its unique body shape, which never
 * overlaps a Stripe payment body (no `occurrenceKey`/`decision` there).
 */
export const isPersonalizedPriceDecisionRequest = (
  req: HttpRequest & { query?: unknown; url?: string },
): boolean => {
  const query = isRecord(req.query) ? req.query : null;
  const route = Array.isArray(query?.route) ? query?.route[0] : query?.route;
  if (route === PERSONALIZED_PRICE_DECISION_ROUTE) return true;
  if (typeof req.url === "string" && req.url.includes(PERSONALIZED_PRICE_DECISION_ROUTE)) {
    return true;
  }
  const body = isRecord(req.body) ? req.body : null;
  return (
    typeof body?.occurrenceKey === "string" &&
    (body.decision === "accepted" || body.decision === "declined")
  );
};

/**
 * Records accept or decline for one priced addition. It never creates a charge.
 */
export const handleFutureOrderV2PersonalizedPriceDecision = async (
  req: HttpRequest,
  res: HttpResponse,
  dependencies: PersonalizedPriceDecisionDependencies = {},
) => {
  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST for this decision.");
  }
  const bearerToken = getBearerToken(req);
  if (!bearerToken) {
    return sendError(res, 401, "AUTH_REQUIRED", "Firebase authentication is required.");
  }
  const getServices =
    dependencies.getServices ||
    (getAdminServices as unknown as () => DecisionAdminServices);
  let services: DecisionAdminServices;
  let token: VerifiedDecisionToken;
  try {
    services = getServices();
    token = await services.auth.verifyIdToken(bearerToken);
  } catch {
    return sendError(
      res,
      401,
      "AUTH_REQUIRED",
      "Firebase authentication could not be verified.",
    );
  }
  const signInProvider = token.firebase?.sign_in_provider;
  if (typeof signInProvider !== "string" || !signInProvider || signInProvider === "anonymous") {
    return sendError(res, 403, "ANONYMOUS_NOT_ALLOWED", "Sign in with your account to decide.");
  }
  if (typeof token.uid !== "string" || !token.uid.trim()) {
    return sendError(res, 401, "AUTH_REQUIRED", "Firebase authentication could not be verified.");
  }

  const body = isRecord(req.body) ? req.body : null;
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const occurrenceKey = typeof body?.occurrenceKey === "string" ? body.occurrenceKey : "";
  const decision = body?.decision === "accepted" || body?.decision === "declined"
    ? body.decision
    : null;
  if (!SAFE_ORDER_ID.test(orderId) || !occurrenceKey || !decision) {
    return sendError(res, 400, "INVALID_DECISION", "Choose accept or decline for this addition.");
  }

  const readOrder = dependencies.readOrder ?? readOrderFromAdmin;
  const readPrice = dependencies.readPrice ?? readPriceFromAdmin;
  const writePrice = dependencies.writePrice ?? writePriceToAdmin;

  let orderRaw: unknown | null;
  let priceRaw: unknown | null;
  try {
    [orderRaw, priceRaw] = await Promise.all([
      readOrder(services.db, orderId),
      readPrice(services.db, orderId),
    ]);
  } catch {
    return sendError(res, 503, "ORDER_LOOKUP_UNAVAILABLE", "The order could not be loaded right now.");
  }

  const order = parsePersistedFutureOrderV2(orderRaw, orderId);
  if (order.status !== "valid") {
    return sendError(res, 404, "ORDER_NOT_FOUND", "This order could not be found.");
  }
  if (order.value.ownerUid !== token.uid) {
    return sendError(res, 403, "OWNER_MISMATCH", "This order belongs to another account.");
  }
  const record = parseFutureOrderV2PersonalizedPrice(priceRaw);
  if (!record || record.orderId !== orderId || record.ownerUid !== order.value.ownerUid) {
    return sendError(
      res,
      409,
      "PRICE_NOT_READY",
      "This personalized addition does not have a price to accept or decline.",
    );
  }

  const decided = decidePersonalizedAddition(record, occurrenceKey, decision);
  if (decided.status === "invalid") {
    return sendError(res, 409, "DECISION_REJECTED", decided.message);
  }
  if (decided.status === "updated") {
    try {
      await writePrice(services.db, orderId, decided.record);
    } catch {
      return sendError(res, 503, "DECISION_NOT_SAVED", "The decision could not be saved. You were not charged.");
    }
  }
  return setNoStore(res).status(200).json({
    record: decided.record,
    charged: false,
  });
};
