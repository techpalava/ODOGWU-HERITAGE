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
  getFutureOrderV2ProviderTransactionId,
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

export interface StripeEventSummary {
  readonly id: string;
  readonly type: string;
  readonly livemode: boolean;
  readonly paymentIntentId: string | null;
}

export interface FutureOrderV2PaymentRecordDependencies {
  getServices?: () => PaymentRecordAdminServices;
  createStore?: (db: unknown) => FutureOrderV2PaymentRecordStore;
  readSecretKey?: () => string;
  retrievePaymentIntent?: (paymentIntentId: string) => Promise<StripePaymentIntentSummary>;
  /**
   * Verifies the raw webhook body. Throw when the signature does not match.
   * The returned event is the only event the webhook path may trust.
   */
  constructEvent?: (
    rawBody: string | Uint8Array,
    signature: string,
    webhookSecret: string,
  ) => StripeEventSummary;
  /** Stripe TEST endpoint signing secret. Blank means webhooks fail closed. */
  readWebhookSecret?: () => string;
  now?: () => Date;
  log?: (message: string) => void;
}

const SAFE_ORDER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9_]{1,255}$/;
const MAX_RECORD_PAYMENT_BODY_BYTES = 1_048_576;

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

const getStripeTestClient = (): Stripe => {
  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key.startsWith("sk_test_")) {
    throw new Error("Stripe test payments are not configured.");
  }
  if (!stripeTestClient) stripeTestClient = new Stripe(key);
  return stripeTestClient;
};

const retrieveStripeTestPaymentIntent = async (
  paymentIntentId: string,
): Promise<StripePaymentIntentSummary> => {
  const paymentIntent = await getStripeTestClient().paymentIntents.retrieve(paymentIntentId);
  return {
    id: paymentIntent.id,
    status: paymentIntent.status,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    metadata: paymentIntent.metadata ?? {},
  };
};

const summarizeStripeEvent = (event: Stripe.Event): StripeEventSummary => {
  const object: unknown = event.data.object;
  const paymentIntentId =
    isRecord(object) && object.object === "payment_intent" && typeof object.id === "string"
      ? object.id
      : null;
  return { id: event.id, type: event.type, livemode: event.livemode, paymentIntentId };
};

const constructStripeWebhookEvent = (
  rawBody: string | Uint8Array,
  signature: string,
  webhookSecret: string,
): StripeEventSummary =>
  summarizeStripeEvent(
    getStripeTestClient().webhooks.constructEvent(rawBody, signature, webhookSecret),
  );

const isWebhookRawBody = (value: unknown): value is string | Uint8Array =>
  typeof value === "string" || value instanceof Uint8Array;

const headerText = (headers: HttpRequest["headers"], name: string): string | null => {
  const value = headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string" || first.trim() === "") return null;
  return first;
};

export const readRawHttpBody = async (
  source: AsyncIterable<Uint8Array | string>,
): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of source) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_RECORD_PAYMENT_BODY_BYTES) {
      throw new Error("RECORD_PAYMENT_BODY_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

/**
 * Builds the handler request from the exact bytes Express or Vercel read.
 * Webhook calls keep `body` unset so `body.id` cannot be consulted. Browser
 * calls parse those same bytes as JSON without re-serializing them.
 */
export const httpRequestFromRawBody = ({
  method,
  headers,
  rawBody,
}: {
  method?: string;
  headers: HttpRequest["headers"];
  rawBody: string | Uint8Array;
}): HttpRequest => {
  const request: HttpRequest = { method, headers, rawBody };
  if (!getBearerToken(request) && headerText(headers, "stripe-signature")) {
    return request;
  }
  const text = typeof rawBody === "string" ? rawBody : Buffer.from(rawBody).toString("utf8");
  if (text.length === 0) return { ...request, body: {} };
  try {
    return { ...request, body: JSON.parse(text) as unknown };
  } catch {
    return { ...request, body: undefined };
  }
};

export type FutureOrderV2PaymentSaveOutcome =
  | {
      readonly status: "recorded" | "already_recorded";
      readonly record: FutureOrderV2PaymentRecord;
    }
  | {
      readonly status:
        | "conflict"
        | "order_not_found"
        | "owner_mismatch"
        | "not_payable"
        | "not_succeeded"
        | "mismatch";
    }
  | { readonly status: "stripe_lookup_failed"; readonly message: string };

/**
 * Checks the persisted order and the Stripe PaymentIntent, then creates the
 * payment record once. `expectedOwnerUid` is the signed-in customer, or null
 * when Stripe itself reports the payment. Storage failures are thrown.
 */
export const saveVerifiedFutureOrderV2Payment = async ({
  store,
  orderId,
  paymentIntentId,
  readPaymentIntent,
  expectedOwnerUid,
  now,
}: {
  store: FutureOrderV2PaymentRecordStore;
  orderId: string;
  paymentIntentId: string;
  readPaymentIntent: () => Promise<StripePaymentIntentSummary>;
  expectedOwnerUid: string | null;
  now: () => Date;
}): Promise<FutureOrderV2PaymentSaveOutcome> => {
  const order = parsePersistedFutureOrderV2(await store.readOrder(orderId), orderId);
  if (order.status !== "valid") return { status: "order_not_found" };
  const ownerUid = order.value.ownerUid;
  if (expectedOwnerUid !== null && ownerUid !== expectedOwnerUid) {
    return { status: "owner_mismatch" };
  }
  const pricing = order.value.masterOrder.cartItem.candidate.pricing;
  if (pricing.status !== "exact" || !Number.isSafeInteger(pricing.exactTotalCents)) {
    return { status: "not_payable" };
  }

  let paymentIntent: StripePaymentIntentSummary;
  try {
    paymentIntent = await readPaymentIntent();
  } catch (error) {
    return {
      status: "stripe_lookup_failed",
      message: error instanceof Error ? error.message : "Unknown Stripe error",
    };
  }
  if (paymentIntent.status !== "succeeded") return { status: "not_succeeded" };
  if (
    paymentIntent.id !== paymentIntentId ||
    paymentIntent.metadata.orderId !== orderId ||
    paymentIntent.metadata.paymentReference !== `future-v2-payment-${orderId}` ||
    paymentIntent.currency !== "eur" ||
    paymentIntent.amount !== pricing.exactTotalCents
  ) {
    return { status: "mismatch" };
  }

  const proposed: FutureOrderV2PaymentRecord = {
    schemaVersion: 1,
    orderId,
    ownerUid,
    paymentIntentId,
    amountCents: paymentIntent.amount,
    currency: "eur",
    status: "succeeded",
    testMode: true,
    recordedAt: now().toISOString(),
  };
  return store.runTransaction(async (transaction) => {
    const existingValue = await transaction.getPayment(orderId);
    if (existingValue === null) {
      transaction.createPayment(orderId, proposed);
      return { status: "recorded" as const, record: proposed };
    }
    const existing = parseFutureOrderV2PaymentRecord(existingValue);
    if (
      existing &&
      getFutureOrderV2ProviderTransactionId(existing) === paymentIntentId &&
      existing.ownerUid === ownerUid
    ) {
      return { status: "already_recorded" as const, record: existing };
    }
    return { status: "conflict" as const };
  });
};

/**
 * Records a Stripe test payment only after the server has checked the signed-in
 * owner, the persisted order, and the PaymentIntent itself. Requests carrying a
 * `stripe-signature` header and no Bearer token are Stripe webhooks. Their
 * signature is verified with `stripe.webhooks.constructEvent` against the raw
 * body and `STRIPE_WEBHOOK_SECRET`. The body `id` is never trusted. Live mode
 * and non-succeeded events are ignored. Repeating either call for the same
 * PaymentIntent is safe.
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
  const constructEvent = dependencies.constructEvent || constructStripeWebhookEvent;
  const now = dependencies.now || (() => new Date());
  const log = dependencies.log || ((message: string) => console.info(message));
  const readSecret = () =>
    (dependencies.readSecretKey?.() ?? process.env.STRIPE_SECRET_KEY ?? "").trim();
  const readWebhookSecret = () =>
    (dependencies.readWebhookSecret?.() ?? process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();

  const handleStripeWebhook = async (req: HttpRequest, res: HttpResponse) => {
    const reply = (status: number, body: Record<string, unknown>) => {
      log(`future-order-v2-payment-webhook status=${String(body.status ?? body.code)}`);
      return setNoStore(res).status(status).json(body);
    };
    const rejectUnverified = () =>
      reply(400, {
        error: "Stripe webhook signature could not be verified.",
        code: "INVALID_STRIPE_SIGNATURE",
      });
    if (!readSecret().startsWith("sk_test_")) {
      return reply(503, {
        error: "Stripe test payments are not configured.",
        code: "STRIPE_TEST_KEY_REQUIRED",
      });
    }
    const webhookSecret = readWebhookSecret();
    if (!webhookSecret) {
      return reply(400, {
        error: "Stripe webhooks are not configured.",
        code: "STRIPE_WEBHOOK_SECRET_REQUIRED",
      });
    }
    const signature = headerText(req.headers, "stripe-signature");
    if (!signature || !isWebhookRawBody(req.rawBody)) return rejectUnverified();

    let event: StripeEventSummary;
    try {
      event = constructEvent(req.rawBody, signature, webhookSecret);
    } catch {
      return rejectUnverified();
    }
    if (event.livemode || event.type !== "payment_intent.succeeded" || !event.paymentIntentId) {
      return reply(200, { received: true, status: "ignored" });
    }

    let paymentIntent: StripePaymentIntentSummary;
    try {
      paymentIntent = await retrievePaymentIntent(event.paymentIntentId);
    } catch {
      return reply(500, { error: "Stripe could not be reached.", code: "STRIPE_LOOKUP_FAILED" });
    }
    const orderId = paymentIntent.metadata.orderId ?? "";
    if (
      !SAFE_ORDER_ID.test(orderId) ||
      paymentIntent.metadata.paymentReference !== `future-v2-payment-${orderId}`
    ) {
      return reply(200, { received: true, status: "ignored" });
    }

    let outcome: FutureOrderV2PaymentSaveOutcome;
    try {
      outcome = await saveVerifiedFutureOrderV2Payment({
        store: createStore(getServices().db),
        orderId,
        paymentIntentId: paymentIntent.id,
        readPaymentIntent: async () => paymentIntent,
        expectedOwnerUid: null,
        now,
      });
    } catch {
      return reply(500, {
        error: "The payment could not be saved right now.",
        code: "PAYMENT_RECORD_UNAVAILABLE",
      });
    }
    if (outcome.status === "recorded" || outcome.status === "already_recorded") {
      return reply(200, { received: true, status: outcome.status });
    }
    return reply(200, { received: true, status: "ignored", reason: outcome.status });
  };

  return async (req: HttpRequest, res: HttpResponse) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    }

    const bearerToken = getBearerToken(req);
    if (!bearerToken && headerText(req.headers, "stripe-signature")) {
      return handleStripeWebhook(req, res);
    }
    if (!bearerToken) {
      return sendError(res, 401, "AUTH_REQUIRED", "Firebase authentication is required.");
    }

    if (!readSecret().startsWith("sk_test_")) {
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

    let outcome: FutureOrderV2PaymentSaveOutcome;
    try {
      outcome = await saveVerifiedFutureOrderV2Payment({
        store: createStore(services.db),
        orderId,
        paymentIntentId,
        readPaymentIntent: () => retrievePaymentIntent(paymentIntentId),
        expectedOwnerUid: token.uid,
        now,
      });
    } catch {
      log("future-order-v2-payment-record error=PAYMENT_RECORD_UNAVAILABLE");
      return sendError(
        res,
        503,
        "PAYMENT_RECORD_UNAVAILABLE",
        "The payment could not be saved right now. Retry saving it.",
      );
    }

    switch (outcome.status) {
      case "order_not_found":
        return sendError(res, 404, "ORDER_NOT_FOUND", "This prepared order could not be found.");
      case "owner_mismatch":
        return sendError(res, 403, "OWNER_MISMATCH", "This order belongs to another account.");
      case "not_payable":
        return sendError(res, 409, "ORDER_NOT_PAYABLE", "This order does not have a confirmed total.");
      case "stripe_lookup_failed":
        console.warn("Future order V2 payment could not be read from Stripe:", outcome.message);
        return sendError(
          res,
          502,
          "STRIPE_LOOKUP_FAILED",
          "Stripe could not confirm this payment yet. Retry saving it.",
        );
      case "not_succeeded":
        return sendError(res, 409, "PAYMENT_NOT_SUCCEEDED", "Stripe has not completed this payment.");
      case "mismatch":
        return sendError(
          res,
          409,
          "PAYMENT_MISMATCH",
          "This payment does not match the prepared order.",
        );
      case "conflict":
        log("future-order-v2-payment-record status=conflict");
        return sendError(
          res,
          409,
          "PAYMENT_ALREADY_RECORDED",
          "A different payment is already recorded for this order.",
        );
      default:
        log(`future-order-v2-payment-record status=${outcome.status}`);
        return setNoStore(res)
          .status(outcome.status === "recorded" ? 201 : 200)
          .json(outcome);
    }
  };
};

export const handleFutureOrderV2PaymentRecord = createFutureOrderV2PaymentRecordHandler();
