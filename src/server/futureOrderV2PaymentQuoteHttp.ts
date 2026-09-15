import type { Firestore } from "firebase-admin/firestore";
import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  createAdminFutureOrderV2PaymentQuoteAdapter,
  createFutureOrderV2PaymentQuoteForVerifiedIdentity,
  type FutureOrderV2PaymentQuoteAdapter,
} from "./futureOrderV2PaymentQuote.js";
import type { VerifiedFutureOrderV2Token } from "./futureOrderV2PersistenceHttp.js";

type FutureOrderV2PaymentQuoteAdminServices = {
  auth: { verifyIdToken(token: string): Promise<VerifiedFutureOrderV2Token> };
  db: unknown;
};

export interface FutureOrderV2PaymentQuoteHttpDependencies {
  getServices?: () => FutureOrderV2PaymentQuoteAdminServices;
  createAdapter?: (db: unknown) => FutureOrderV2PaymentQuoteAdapter;
  now?: () => Date;
  createQuoteId?: () => string;
  log?: (message: string) => void;
}

const getBearerToken = (req: HttpRequest): string | null => {
  const header = req.headers.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  return authorization?.match(/^Bearer ([^\s]+)$/)?.[1] || null;
};

const send = (res: HttpResponse, status: number, value: unknown) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(value);
};

const parseOrderId = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    typeof record.orderId !== "string" ||
    record.orderId.trim() !== record.orderId ||
    record.orderId.length === 0 ||
    record.orderId.length > 512 ||
    record.orderId.includes("/")
  ) {
    return null;
  }
  return record.orderId;
};

export const createFutureOrderV2PaymentQuoteHandler = (
  dependencies: FutureOrderV2PaymentQuoteHttpDependencies = {},
) => {
  const getServices =
    dependencies.getServices ||
    (getAdminServices as unknown as () => FutureOrderV2PaymentQuoteAdminServices);
  const createAdapter =
    dependencies.createAdapter ||
    ((db: unknown) => createAdminFutureOrderV2PaymentQuoteAdapter(db as Firestore));
  const log = dependencies.log || ((message: string) => console.info(message));
  return async (req: HttpRequest, res: HttpResponse) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return send(res, 405, { code: "METHOD_NOT_ALLOWED", error: "Method not allowed." });
    }
    const token = getBearerToken(req);
    if (!token) return send(res, 401, { code: "AUTH_REQUIRED", error: "Firebase authentication is required." });
    const orderId = parseOrderId(req.body);
    if (!orderId) return send(res, 400, { code: "MALFORMED_PAYMENT_QUOTE_REQUEST", error: "A valid order ID is required." });
    try {
      const services = getServices();
      const verified = await services.auth.verifyIdToken(token);
      const provider = verified.firebase?.sign_in_provider;
      if (typeof provider !== "string" || provider.length === 0) {
        return send(res, 401, { code: "AUTH_REQUIRED", error: "Firebase authentication could not be verified." });
      }
      const readiness = await createFutureOrderV2PaymentQuoteForVerifiedIdentity({
        identity: { uid: verified.uid, isAnonymous: provider === "anonymous" },
        orderId,
        adapter: createAdapter(services.db),
        now: dependencies.now,
        createQuoteId: dependencies.createQuoteId,
      });
      log(`future-order-v2-payment-quote status=${readiness.status}`);
      return send(
        res,
        readiness.status === "ready" ? (readiness.reused ? 200 : 201) : 409,
        readiness,
      );
    } catch {
      log("future-order-v2-payment-quote status=unavailable");
      return send(res, 503, { code: "PERSISTENCE_UNAVAILABLE", error: "The secure payment quote service is temporarily unavailable." });
    }
  };
};

export const handleFutureOrderV2PaymentQuote =
  createFutureOrderV2PaymentQuoteHandler();
