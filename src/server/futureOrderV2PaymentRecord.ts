import Stripe from "stripe";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  FUTURE_ORDER_V2_COLLECTION,
  parsePersistedFutureOrderV2,
} from "../utils/futureOrderV2PersistenceContract.js";
import {
  FUTURE_ORDER_V2_PAYMENT_COLLECTION,
  parseFutureOrderV2PaymentRecord,
  type FutureOrderV2PaymentRecord,
} from "../utils/futureOrderV2PaymentRecord.js";

interface VerifiedPaymentRecordToken {
  readonly uid: string;
  readonly firebase?: { readonly sign_in_provider?: unknown };
}

type PaymentRecordAdminServices = {
  auth: { verifyIdToken(token: string): Promise<VerifiedPaymentRecordToken> };
  db: unknown;
};

export interface StripePaymentIntentSummary {
  readonly id: string;
  readonly status: string;
  readonly amount: number;
  readonly currency: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface FutureOrderV2PaymentRecordTransaction {
  getPayment(orderId: string): Promise<unknown | null>;
  createPayment(orderId: string, record: FutureOrderV2PaymentRecord): void;
}

export interface FutureOrderV2PaymentRecordStore {
  readOrder(orderId: string): Promise<unknown | null>;
  runTransaction<T>(
    operation: (transaction: FutureOrderV2PaymentRecordTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface FutureOrderV2PaymentRecordDependencies {
  getServices?: () => PaymentRecordAdminServices;
  createStore?: (db: unknown) => FutureOrderV2PaymentRecordStore;
  readSecretKey?: () => string;
  retrievePaymentIntent?: (paymentIntentId: string) => Promise<StripePaymentIntentSummary>;
  now?: () => Date;
  log?: (message: string) => void;
}

const SAFE_ORDER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9_]{1,255}$/;

const getBearerToken = (req: HttpRequest): string | null => {
  const header = req.headers.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const createAdminFutureOrderV2PaymentRecordStore = (
  db: Firestore,
): FutureOrderV2PaymentRecordStore => {
  const paymentReference = (orderId: string) =>
    db.collection(FUTURE_ORDER_V2_PAYMENT_COLLECTION).doc(orderId);
  return {
    async readOrder(orderId) {
      const snapshot = await db.collection(FUTURE_ORDER_V2_COLLECTION).doc(orderId).get();
      return snapshot.exists ? snapshot.data() : null;
    },
    runTransaction: (operation) =>
      db.runTransaction((adminTransaction) =>
        operation({
          async getPayment(orderId) {
            const snapshot = await adminTransaction.get(paymentReference(orderId));
            return snapshot.exists ? snapshot.data() : null;
          },
          createPayment(orderId, record) {
            adminTransaction.create(paymentReference(orderId), {
              ...record,
              recordedAt: Timestamp.fromDate(new Date(record.recordedAt)),
            });
          },
        }),
      ),
  };
};

let stripeTestClient: Stripe | null = null;

const retrieveStripeTestPaymentIntent = async (
  paymentIntentId: string,
): Promise<StripePaymentIntentSummary> => {
  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key.startsWith("sk_test_")) {
    throw new Error("Stripe test payments are not configured.");
  }
  if (!stripeTestClient) stripeTestClient = new Stripe(key);
  const paymentIntent = await stripeTestClient.paymentIntents.retrieve(paymentIntentId);
  return {
    id: paymentIntent.id,
    status: paymentIntent.status,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    metadata: paymentIntent.metadata ?? {},
  };
};

/**
 * Records a Stripe test payment only after the server has checked the signed-in
 * owner, the persisted order, and the PaymentIntent itself. Repeating the call
 * for the same PaymentIntent is safe.
 */
export const createFutureOrderV2PaymentRecordHandler = (
  dependencies: FutureOrderV2PaymentRecordDependencies = {},
) => {
  const getServices =
    dependencies.getServices ||
    (getAdminServices as unknown as () => PaymentRecordAdminServices);
  const createStore =
    dependencies.createStore ||
    ((db: unknown) => createAdminFutureOrderV2PaymentRecordStore(db as Firestore));
  const retrievePaymentIntent =
    dependencies.retrievePaymentIntent || retrieveStripeTestPaymentIntent;
  const now = dependencies.now || (() => new Date());
  const log = dependencies.log || ((message: string) => console.info(message));

  return async (req: HttpRequest, res: HttpResponse) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    }

    const bearerToken = getBearerToken(req);
    if (!bearerToken) {
      return sendError(res, 401, "AUTH_REQUIRED", "Firebase authentication is required.");
    }

    const secret = (dependencies.readSecretKey?.() ?? process.env.STRIPE_SECRET_KEY ?? "").trim();
    if (!secret.startsWith("sk_test_")) {
      return sendError(
        res,
        503,
        "STRIPE_TEST_KEY_REQUIRED",
        "Stripe test payments are not configured.",
      );
    }

    const body = isRecord(req.body) ? req.body : null;
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    const paymentIntentId =
      typeof body?.paymentIntentId === "string" ? body.paymentIntentId : "";
    if (!SAFE_ORDER_ID.test(orderId) || !PAYMENT_INTENT_ID.test(paymentIntentId)) {
      return sendError(
        res,
        400,
        "INVALID_PAYMENT_RECORD_REQUEST",
        "This payment does not match a prepared order.",
      );
    }

    let services: PaymentRecordAdminServices;
    let token: VerifiedPaymentRecordToken;
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
    if (typeof signInProvider !== "string" || !signInProvider) {
      return sendError(
        res,
        401,
        "AUTH_REQUIRED",
        "Firebase authentication could not be verified.",
      );
    }
    if (signInProvider === "anonymous") {
      return sendError(
        res,
        403,
        "ANONYMOUS_NOT_ALLOWED",
        "Sign in with your account to record this payment.",
      );
    }

    try {
      const store = createStore(services.db);
      const order = parsePersistedFutureOrderV2(await store.readOrder(orderId), orderId);
      if (order.status !== "valid") {
        return sendError(
          res,
          404,
          "ORDER_NOT_FOUND",
          "This prepared order could not be found.",
        );
      }
      if (order.value.ownerUid !== token.uid) {
        return sendError(res, 403, "OWNER_MISMATCH", "This order belongs to another account.");
      }
      const pricing = order.value.masterOrder.cartItem.candidate.pricing;
      if (pricing.status !== "exact" || !Number.isSafeInteger(pricing.exactTotalCents)) {
        return sendError(
          res,
          409,
          "ORDER_NOT_PAYABLE",
          "This order does not have a confirmed total.",
        );
      }

      let paymentIntent: StripePaymentIntentSummary;
      try {
        paymentIntent = await retrievePaymentIntent(paymentIntentId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Stripe error";
        console.warn("Future order V2 payment could not be read from Stripe:", message);
        return sendError(
          res,
          502,
          "STRIPE_LOOKUP_FAILED",
          "Stripe could not confirm this payment yet. Retry saving it.",
        );
      }
      if (paymentIntent.status !== "succeeded") {
        return sendError(
          res,
          409,
          "PAYMENT_NOT_SUCCEEDED",
          "Stripe has not completed this payment.",
        );
      }
      if (
        paymentIntent.id !== paymentIntentId ||
        paymentIntent.metadata.orderId !== orderId ||
        paymentIntent.metadata.paymentReference !== `future-v2-payment-${orderId}` ||
        paymentIntent.currency !== "eur" ||
        paymentIntent.amount !== pricing.exactTotalCents
      ) {
        return sendError(
          res,
          409,
          "PAYMENT_MISMATCH",
          "This payment does not match the prepared order.",
        );
      }

      const proposed: FutureOrderV2PaymentRecord = {
        schemaVersion: 1,
        orderId,
        ownerUid: token.uid,
        paymentIntentId,
        amountCents: paymentIntent.amount,
        currency: "eur",
        status: "succeeded",
        testMode: true,
        recordedAt: now().toISOString(),
      };
      const outcome = await store.runTransaction(async (transaction) => {
        const existingValue = await transaction.getPayment(orderId);
        if (existingValue === null) {
          transaction.createPayment(orderId, proposed);
          return { status: "recorded" as const, record: proposed };
        }
        const existing = parseFutureOrderV2PaymentRecord(existingValue);
        if (
          existing &&
          existing.paymentIntentId === paymentIntentId &&
          existing.ownerUid === token.uid
        ) {
          return { status: "already_recorded" as const, record: existing };
        }
        return { status: "conflict" as const };
      });

      if (outcome.status === "conflict") {
        log("future-order-v2-payment-record status=conflict");
        return sendError(
          res,
          409,
          "PAYMENT_ALREADY_RECORDED",
          "A different payment is already recorded for this order.",
        );
      }
      log(`future-order-v2-payment-record status=${outcome.status}`);
      return setNoStore(res)
        .status(outcome.status === "recorded" ? 201 : 200)
        .json(outcome);
    } catch {
      log("future-order-v2-payment-record error=PAYMENT_RECORD_UNAVAILABLE");
      return sendError(
        res,
        503,
        "PAYMENT_RECORD_UNAVAILABLE",
        "The payment could not be saved right now. Retry saving it.",
      );
    }
  };
};

export const handleFutureOrderV2PaymentRecord = createFutureOrderV2PaymentRecordHandler();
