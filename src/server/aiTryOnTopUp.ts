import Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import { getCanonicalEmail } from "../security/authIdentity.js";
import { isAllowedAdminEmail } from "./adminAllowlist.js";
import type { AiTryOnResetIdentity } from "./aiTryOnAdminReset.js";
import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import { readFutureOrderV2RequestOrigin } from "./futureOrderV2StripePayment.js";
import {
  AI_TRY_ON_GLOBAL_USAGE_DOC,
  AI_TRY_ON_MAX_PURCHASED_TRIES,
  AI_TRY_ON_USAGE_COLLECTION,
  aiTryOnEffectiveGlobalCap,
  readPurchasedTries,
} from "./aiTryOnUsageLimits.js";

/**
 * Stripe TEST Checkout for one pack of AI Try-on generations.
 *
 * Xavier priced the pack at $64. Future Order V2 charges EUR (card + iDEAL).
 * This Checkout stays USD and card-only so the price on the admin page matches
 * that $64. iDEAL cannot charge USD. If the Stripe test account rejects USD,
 * change `AI_TRY_ON_TOP_UP_CURRENCY` only after Xavier picks a currency.
 * Recommended: keep USD.
 *
 * The browser can open Checkout. Only a signature-checked webhook credits
 * tries, and the same Checkout Session or event id credits exactly once.
 * Live keys and live-mode events are refused.
 */
export const AI_TRY_ON_TOP_UP_TRIES = 1000;
export const AI_TRY_ON_TOP_UP_AMOUNT_CENTS = 6400;
export const AI_TRY_ON_TOP_UP_CURRENCY = "usd" as const;
export const AI_TRY_ON_TOP_UP_PURPOSE = "ai_try_on_top_up";
export const AI_TRY_ON_TOP_UP_WEBHOOK_SECRET_ENV = "STRIPE_AI_TRY_ON_TOP_UP_WEBHOOK_SECRET";
export const AI_TRY_ON_TOP_UPS_COLLECTION = "aiTryOnTopUps";
export const AI_TRY_ON_TOP_UP_EVENTS_COLLECTION = "aiTryOnTopUpEvents";
export const AI_TRY_ON_TOP_UP_WEBHOOK_PATH = "/api/ai-try-on/top-up-webhook";
/** Query marker vercel.json adds when this path shares the record-payment function. */
export const AI_TRY_ON_TOP_UP_WEBHOOK_ROUTE = "ai-try-on-top-up";
export const AI_TRY_ON_TOP_UP_RETURN_QUERY = "ai_try_on_top_up";
/** Consumed once so a Stripe return opens Admin > System Settings. */
export const AI_TRY_ON_ADMIN_TAB_STORAGE_KEY = "asml_admin_portal_tab";

const SESSION_ID = /^cs_test_[A-Za-z0-9]{8,}$/;
const EVENT_ID = /^evt_[A-Za-z0-9]{8,}$/;
const PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9_]{8,}$/;
const CHECKOUT_URL = /^https:\/\/checkout\.stripe\.com\//;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export interface AiTryOnTopUpEventSummary {
  id: string;
  type: string;
  livemode: boolean;
  sessionId: string | null;
}

export interface AiTryOnTopUpCheckoutSession {
  id: string;
  livemode: boolean;
  mode: string | null;
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
  paymentIntentId: string | null;
  clientReferenceId: string | null;
  metadata: Record<string, string>;
}

export interface AiTryOnTopUpCheckoutRequest {
  adminUid: string;
  adminEmail: string;
  successUrl: string;
  cancelUrl: string;
  amountCents: number;
  currency: typeof AI_TRY_ON_TOP_UP_CURRENCY;
  tries: number;
  purpose: typeof AI_TRY_ON_TOP_UP_PURPOSE;
}

export interface AiTryOnTopUpHistoryRow {
  sessionId: string;
  paymentIntentId: string | null;
  adminEmail: string;
  amountCents: number;
  currency: typeof AI_TRY_ON_TOP_UP_CURRENCY;
  triesAdded: number;
  createdAt: string;
}

export const isSignedInAiTryOnTopUpAdmin = (
  identity: AiTryOnResetIdentity,
  environment: Record<string, string | undefined> = process.env,
): boolean =>
  Boolean(identity.uid) &&
  identity.admin === true &&
  identity.email_verified === true &&
  typeof identity.email === "string" &&
  isAllowedAdminEmail(identity.email, environment) &&
  typeof identity.firebase?.sign_in_provider === "string" &&
  Boolean(identity.firebase.sign_in_provider) &&
  identity.firebase.sign_in_provider !== "anonymous";

export const isAiTryOnTopUpWebhookRequest = (
  req: HttpRequest & { query?: unknown; url?: string },
): boolean => {
  const query = isRecord(req.query) ? req.query : null;
  const route = Array.isArray(query?.route) ? query.route[0] : query?.route;
  if (route === AI_TRY_ON_TOP_UP_WEBHOOK_ROUTE) return true;
  if (typeof req.url !== "string") return false;
  const path = req.url.split("?")[0] ?? "";
  return path === AI_TRY_ON_TOP_UP_WEBHOOK_PATH ||
    /[?&]route=ai-try-on-top-up(?:&|$)/.test(req.url);
};

const readTestSecretKey = (
  readSecretKey: (() => string) | undefined,
  environment: Record<string, string | undefined>,
): string => (readSecretKey?.() ?? environment.STRIPE_SECRET_KEY ?? "").trim();

const readWebhookSecret = (
  readSecret: (() => string) | undefined,
  environment: Record<string, string | undefined>,
): string =>
  (readSecret?.() ?? environment[AI_TRY_ON_TOP_UP_WEBHOOK_SECRET_ENV] ?? "").trim();

const summarizeCheckoutEvent = (event: Stripe.Event): AiTryOnTopUpEventSummary => {
  const object: unknown = event.data.object;
  const sessionId = isRecord(object) && object.object === "checkout.session" && typeof object.id === "string"
    ? object.id
    : null;
  return { id: event.id, type: event.type, livemode: event.livemode, sessionId };
};

const summarizeCheckoutSession = (session: Stripe.Checkout.Session): AiTryOnTopUpCheckoutSession => {
  const paymentIntent = session.payment_intent;
  const paymentIntentId = typeof paymentIntent === "string"
    ? paymentIntent
    : paymentIntent && typeof paymentIntent === "object" && typeof paymentIntent.id === "string"
      ? paymentIntent.id
      : null;
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(session.metadata ?? {})) {
    if (typeof value === "string") metadata[key] = value;
  }
  return {
    id: session.id,
    livemode: session.livemode,
    mode: session.mode,
    paymentStatus: session.payment_status,
    amountTotal: session.amount_total,
    currency: session.currency,
    paymentIntentId,
    clientReferenceId: session.client_reference_id,
    metadata,
  };
};

const createStripeTestCheckout = async (
  secretKey: string,
  input: AiTryOnTopUpCheckoutRequest,
): Promise<{ id: string; url: string }> => {
  const stripe = new Stripe(secretKey);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Card only. The EUR iDEAL method list cannot charge this USD price.
    payment_method_types: ["card"],
    client_reference_id: input.adminUid,
    customer_email: input.adminEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      purpose: input.purpose,
      tries: String(input.tries),
      adminUid: input.adminUid,
      adminEmail: input.adminEmail,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.amountCents,
          product_data: { name: "AI Try-on: 1,000 generations" },
        },
      },
    ],
  });
  if (!session.url || !CHECKOUT_URL.test(session.url)) {
    throw new Error("Stripe Checkout did not return a hosted test URL.");
  }
  return { id: session.id, url: session.url };
};

const constructStripeTestEvent = (
  secretKey: string,
  rawBody: string | Uint8Array,
  signature: string,
  webhookSecret: string,
): AiTryOnTopUpEventSummary =>
  summarizeCheckoutEvent(new Stripe(secretKey).webhooks.constructEvent(rawBody, signature, webhookSecret));

const retrieveStripeTestCheckout = async (
  secretKey: string,
  sessionId: string,
): Promise<AiTryOnTopUpCheckoutSession> => {
  const session = await new Stripe(secretKey).checkout.sessions.retrieve(sessionId);
  return summarizeCheckoutSession(session);
};

const headerText = (headers: HttpRequest["headers"], name: string): string | null => {
  const value = headers[name] ?? headers[name.toLowerCase()];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim() !== "" ? first : null;
};

const bearerToken = (req: HttpRequest): string | null => {
  const header = req.headers.authorization ?? req.headers.Authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  return authorization?.match(/^Bearer ([^\s]+)$/)?.[1] ?? null;
};

const setNoStore = (res: HttpResponse): HttpResponse => {
  res.setHeader("Cache-Control", "no-store");
  return res;
};

/** Null when this paid test session is the $64 / 1,000-try pack. */
export const aiTryOnTopUpSessionRejection = (
  session: AiTryOnTopUpCheckoutSession,
): string | null => {
  if (session.livemode || !SESSION_ID.test(session.id)) return "live_mode";
  if (session.mode !== "payment") return "mode";
  if (session.paymentStatus !== "paid") return "unpaid";
  if (session.currency !== AI_TRY_ON_TOP_UP_CURRENCY) return "currency";
  if (session.amountTotal !== AI_TRY_ON_TOP_UP_AMOUNT_CENTS) return "amount";
  if (session.metadata.purpose !== AI_TRY_ON_TOP_UP_PURPOSE) return "purpose";
  if (session.metadata.tries !== String(AI_TRY_ON_TOP_UP_TRIES)) return "tries";
  const adminUid = session.metadata.adminUid || session.clientReferenceId || "";
  const adminEmail = getCanonicalEmail(session.metadata.adminEmail || "");
  if (!adminUid || !adminEmail.includes("@")) return "admin";
  return null;
};

export interface AiTryOnTopUpCreditInput {
  eventId: string;
  session: AiTryOnTopUpCheckoutSession;
}

/**
 * Adds exactly 1,000 tries for one paid Checkout Session.
 * A repeated event id or session id does not add them again.
 */
export const creditVerifiedAiTryOnTopUp = async (
  db: Firestore,
  input: AiTryOnTopUpCreditInput,
  now: () => number = Date.now,
): Promise<{ status: "credited" | "already_recorded"; purchasedTries: number; cap: number }> => {
  const session = input.session;
  const adminUid = session.metadata.adminUid || session.clientReferenceId || "";
  const adminEmail = getCanonicalEmail(session.metadata.adminEmail || "");
  const paymentIntentId = session.paymentIntentId && PAYMENT_INTENT_ID.test(session.paymentIntentId)
    ? session.paymentIntentId
    : null;
  const topUps = db.collection(AI_TRY_ON_TOP_UPS_COLLECTION);
  const events = db.collection(AI_TRY_ON_TOP_UP_EVENTS_COLLECTION);
  const globalRef = db.collection(AI_TRY_ON_USAGE_COLLECTION).doc(AI_TRY_ON_GLOBAL_USAGE_DOC);
  return db.runTransaction(async (transaction) => {
    const sessionRef = topUps.doc(session.id);
    const eventRef = events.doc(input.eventId);
    const [sessionSnap, eventSnap, globalSnap] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(eventRef),
      transaction.get(globalRef),
    ]);
    const purchasedTries = readPurchasedTries(globalSnap.exists ? globalSnap.data() : undefined);
    const cap = aiTryOnEffectiveGlobalCap(purchasedTries);
    if (sessionSnap.exists || eventSnap.exists) {
      return { status: "already_recorded" as const, purchasedTries, cap };
    }
    const nextPurchased = Math.min(AI_TRY_ON_MAX_PURCHASED_TRIES, purchasedTries + AI_TRY_ON_TOP_UP_TRIES);
    if (nextPurchased === purchasedTries) {
      return { status: "already_recorded" as const, purchasedTries, cap };
    }
    const at = new Date(now());
    const createdAt = at.toISOString();
    transaction.set(sessionRef, {
      schemaVersion: 1,
      purpose: AI_TRY_ON_TOP_UP_PURPOSE,
      sessionId: session.id,
      eventId: input.eventId,
      paymentIntentId,
      adminUid,
      adminEmail,
      amountCents: AI_TRY_ON_TOP_UP_AMOUNT_CENTS,
      currency: AI_TRY_ON_TOP_UP_CURRENCY,
      triesAdded: AI_TRY_ON_TOP_UP_TRIES,
      testMode: true,
      livemode: false,
      createdAt,
    });
    transaction.set(eventRef, { sessionId: session.id, eventId: input.eventId, createdAt });
    transaction.set(globalRef, { purchasedTries: nextPurchased, updatedAt: at }, { merge: true });
    return {
      status: "credited" as const,
      purchasedTries: nextPurchased,
      cap: aiTryOnEffectiveGlobalCap(nextPurchased),
    };
  });
};

export const readAiTryOnTopUpHistory = async (db: Firestore): Promise<AiTryOnTopUpHistoryRow[]> => {
  const snapshot = await db.collection(AI_TRY_ON_TOP_UPS_COLLECTION).get();
  const rows: AiTryOnTopUpHistoryRow[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.triesAdded !== AI_TRY_ON_TOP_UP_TRIES) continue;
    if (data.amountCents !== AI_TRY_ON_TOP_UP_AMOUNT_CENTS) continue;
    if (data.currency !== AI_TRY_ON_TOP_UP_CURRENCY) continue;
    if (data.testMode !== true || data.livemode !== false) continue;
    if (typeof data.createdAt !== "string" || typeof data.adminEmail !== "string") continue;
    if (!SESSION_ID.test(doc.id)) continue;
    const paymentIntentId = typeof data.paymentIntentId === "string" && PAYMENT_INTENT_ID.test(data.paymentIntentId)
      ? data.paymentIntentId
      : null;
    rows.push({
      sessionId: doc.id,
      paymentIntentId,
      adminEmail: data.adminEmail,
      amountCents: AI_TRY_ON_TOP_UP_AMOUNT_CENTS,
      currency: AI_TRY_ON_TOP_UP_CURRENCY,
      triesAdded: AI_TRY_ON_TOP_UP_TRIES,
      createdAt: data.createdAt,
    });
  }
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)).slice(0, 20);
};

const defaultVerifyIdToken = (token: string, checkRevoked = false) =>
  getAdminServices().auth.verifyIdToken(token, checkRevoked);

export interface AiTryOnAdminTopUpDependencies {
  verifyIdToken?: (token: string, checkRevoked?: boolean) => Promise<AiTryOnResetIdentity>;
  environment?: Record<string, string | undefined>;
  readSecretKey?: () => string;
  readOrigin?: (req: HttpRequest) => string | null;
  createCheckoutSession?: (secretKey: string, input: AiTryOnTopUpCheckoutRequest) => Promise<{ id: string; url: string }>;
  now?: () => number;
}

/** Opens Stripe Checkout. Does not add tries. */
export const handleAiTryOnAdminTopUp = async (
  req: HttpRequest,
  res: HttpResponse,
  dependencies: AiTryOnAdminTopUpDependencies = {},
) => {
  setNoStore(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ code: "METHOD_NOT_ALLOWED" });
  }
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ code: "AUTH_REQUIRED" });
  const environment = dependencies.environment ?? process.env;
  let identity: AiTryOnResetIdentity;
  try {
    identity = await (dependencies.verifyIdToken ?? defaultVerifyIdToken)(token, true);
  } catch {
    return res.status(401).json({ code: "AUTH_REQUIRED" });
  }
  if (!isSignedInAiTryOnTopUpAdmin(identity, environment)) {
    return res.status(403).json({ code: "ADMIN_ONLY" });
  }
  const secretKey = readTestSecretKey(dependencies.readSecretKey, environment);
  if (!secretKey.startsWith("sk_test_")) {
    return res.status(503).json({
      error: "Stripe test payments are not configured.",
      code: "STRIPE_TEST_KEY_REQUIRED",
    });
  }
  const origin = (dependencies.readOrigin ?? readFutureOrderV2RequestOrigin)(req);
  if (!origin) return res.status(400).json({ code: "ORIGIN_REQUIRED" });
  const adminEmail = getCanonicalEmail(identity.email as string);
  try {
    const session = await (dependencies.createCheckoutSession ?? createStripeTestCheckout)(secretKey, {
      adminUid: identity.uid,
      adminEmail,
      successUrl: `${origin}/?${AI_TRY_ON_TOP_UP_RETURN_QUERY}=success`,
      cancelUrl: `${origin}/?${AI_TRY_ON_TOP_UP_RETURN_QUERY}=cancel`,
      amountCents: AI_TRY_ON_TOP_UP_AMOUNT_CENTS,
      currency: AI_TRY_ON_TOP_UP_CURRENCY,
      tries: AI_TRY_ON_TOP_UP_TRIES,
      purpose: AI_TRY_ON_TOP_UP_PURPOSE,
    });
    if (!CHECKOUT_URL.test(session.url)) {
      return res.status(502).json({ code: "CHECKOUT_UNAVAILABLE" });
    }
    return res.status(200).json({ url: session.url });
  } catch {
    return res.status(502).json({ code: "CHECKOUT_UNAVAILABLE" });
  }
};

export interface AiTryOnTopUpWebhookDependencies {
  environment?: Record<string, string | undefined>;
  getDb?: () => Promise<Firestore> | Firestore;
  readSecretKey?: () => string;
  readWebhookSecret?: () => string;
  constructEvent?: (
    secretKey: string,
    rawBody: string | Uint8Array,
    signature: string,
    webhookSecret: string,
  ) => AiTryOnTopUpEventSummary;
  retrieveCheckoutSession?: (secretKey: string, sessionId: string) => Promise<AiTryOnTopUpCheckoutSession>;
  now?: () => number;
  log?: (message: string) => void;
}

const isRawBody = (value: unknown): value is string | Uint8Array =>
  typeof value === "string" || value instanceof Uint8Array;

/**
 * Credits 1,000 tries after Stripe signs the event and the retrieved
 * Checkout Session is the paid $64 test pack. The event body is not trusted.
 */
export const handleAiTryOnTopUpWebhook = async (
  req: HttpRequest,
  res: HttpResponse,
  dependencies: AiTryOnTopUpWebhookDependencies = {},
) => {
  const log = dependencies.log ?? ((message: string) => console.info(message));
  const reply = (status: number, body: Record<string, unknown>) => {
    log(`ai-try-on-top-up status=${String(body.status ?? body.code)}`);
    return setNoStore(res).status(status).json(body);
  };
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(405, { code: "METHOD_NOT_ALLOWED" });
  }
  const environment = dependencies.environment ?? process.env;
  const secretKey = readTestSecretKey(dependencies.readSecretKey, environment);
  if (!secretKey.startsWith("sk_test_")) {
    return reply(503, {
      error: "Stripe test payments are not configured.",
      code: "STRIPE_TEST_KEY_REQUIRED",
    });
  }
  const webhookSecret = readWebhookSecret(dependencies.readWebhookSecret, environment);
  if (!webhookSecret) {
    return reply(400, {
      error: "Stripe webhooks are not configured.",
      code: "AI_TRY_ON_TOP_UP_WEBHOOK_SECRET_REQUIRED",
    });
  }
  const signature = headerText(req.headers, "stripe-signature");
  if (!signature || !isRawBody(req.rawBody)) {
    return reply(400, {
      error: "Stripe webhook signature could not be verified.",
      code: "INVALID_STRIPE_SIGNATURE",
    });
  }
  let event: AiTryOnTopUpEventSummary;
  try {
    event = (dependencies.constructEvent ?? constructStripeTestEvent)(
      secretKey,
      req.rawBody,
      signature,
      webhookSecret,
    );
  } catch {
    return reply(400, {
      error: "Stripe webhook signature could not be verified.",
      code: "INVALID_STRIPE_SIGNATURE",
    });
  }
  if (event.livemode || event.type !== "checkout.session.completed" || !event.sessionId || !SESSION_ID.test(event.sessionId) || !EVENT_ID.test(event.id)) {
    return reply(200, { received: true, status: "ignored" });
  }
  let session: AiTryOnTopUpCheckoutSession;
  try {
    session = await (dependencies.retrieveCheckoutSession ?? retrieveStripeTestCheckout)(secretKey, event.sessionId);
  } catch {
    return reply(500, { error: "Stripe could not be reached.", code: "STRIPE_LOOKUP_FAILED" });
  }
  if (session.id !== event.sessionId || aiTryOnTopUpSessionRejection(session)) {
    return reply(200, { received: true, status: "ignored" });
  }
  try {
    const db = await (dependencies.getDb ?? (() => getAdminServices().db))();
    const credit = await creditVerifiedAiTryOnTopUp(db, { eventId: event.id, session }, dependencies.now ?? Date.now);
    return reply(200, { received: true, status: credit.status, triesAdded: credit.status === "credited" ? AI_TRY_ON_TOP_UP_TRIES : 0 });
  } catch {
    return reply(500, { error: "The top-up could not be saved.", code: "TOP_UP_UNAVAILABLE" });
  }
};
