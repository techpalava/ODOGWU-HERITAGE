/** Stripe test top-up: webhook signature, idempotency, admin gating, +1,000 capacity. No network. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import recordPaymentHandler from "./api/future-order-v2/record-payment.js";
import { AdminAiTryOnUsage } from "./src/components/AdminAiTryOnUsage";
import { ALLOWED_ADMIN_EMAILS } from "./src/server/adminAllowlist";
import { getCanonicalEmail } from "./src/security/authIdentity";
import { handleAiTryOn } from "./src/server/aiTryOnHttp";
import {
  AI_TRY_ON_TOP_UP_AMOUNT_CENTS,
  AI_TRY_ON_TOP_UP_TRIES,
  AI_TRY_ON_TOP_UP_WEBHOOK_SECRET_ENV,
  creditVerifiedAiTryOnTopUp,
  handleAiTryOnTopUpWebhook,
  type AiTryOnTopUpCheckoutRequest,
  type AiTryOnTopUpCheckoutSession,
} from "./src/server/aiTryOnTopUp";
import { createAiTryOnUsageLimits } from "./src/server/aiTryOnUsageLimits";
import { AI_TRY_ON_GLOBAL_GENERATION_CAP } from "./src/utils/aiTryOnGatewayContract";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";
import type { AiTryOnAdminUsage } from "./src/services/aiTryOnAdminUsage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Doc = Record<string, unknown>;
class FakeFirestore {
  docs = new Map<string, Doc>();
  private lock: Promise<unknown> = Promise.resolve();
  private snapshot(path: string) {
    const value = this.docs.get(path);
    return { exists: value !== undefined, data: () => (value ? { ...value } : undefined) };
  }
  collection(name: string) {
    const docsFor = () =>
      [...this.docs]
        .filter(([path]) => path.startsWith(`${name}/`) && !path.slice(name.length + 1).includes("/"))
        .map(([path, data]) => ({ id: path.slice(name.length + 1), data: () => ({ ...data }) }));
    return {
      doc: (id: string) => ({ path: `${name}/${id}`, id, get: async () => this.snapshot(`${name}/${id}`) }),
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => ({ docs: docsFor().filter((doc) => doc.data()[field] === value) }),
      }),
      get: async () => ({ docs: docsFor() }),
    };
  }
  runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const run = this.lock.then(async () => {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (ref: { path: string }) => this.snapshot(ref.path),
        set: (ref: { path: string }, data: Doc, options?: { merge?: boolean }) => writes.push(() => {
          this.docs.set(ref.path, { ...(options?.merge ? this.docs.get(ref.path) : {}), ...data });
        }),
      };
      const result = await fn(tx);
      writes.forEach((write) => write());
      return result;
    });
    this.lock = run.catch(() => undefined);
    return run;
  }
  asFirestore() { return this as unknown as Firestore; }
}

const WEBHOOK_SECRET = "whsec_test_example_top_up";
const TEST_KEY = "sk_test_example";
const XAVIER = ALLOWED_ADMIN_EMAILS[0];
const FRED = ALLOWED_ADMIN_EMAILS[1];
const SESSION_A = "cs_test_aaaaaaaa";
const SESSION_B = "cs_test_bbbbbbbb";
const EVENT_A = "evt_aaaaaaaa";
const EVENT_B = "evt_bbbbbbbb";
const EVENT_C = "evt_cccccccc";

const paidSession = (overrides: Partial<AiTryOnTopUpCheckoutSession> = {}): AiTryOnTopUpCheckoutSession => ({
  id: SESSION_A,
  livemode: false,
  mode: "payment",
  paymentStatus: "paid",
  amountTotal: AI_TRY_ON_TOP_UP_AMOUNT_CENTS,
  currency: "usd",
  paymentIntentId: "pi_test_12345678",
  clientReferenceId: "xavier",
  metadata: {
    purpose: "ai_try_on_top_up",
    tries: "1000",
    adminUid: "xavier",
    adminEmail: XAVIER,
  },
  ...overrides,
});

const response = () => {
  const state = { status: 200, body: {} as Record<string, unknown> };
  const res: HttpResponse = {
    status(code) { state.status = code; return res; },
    setHeader() { return res; },
    json(body) { state.body = body as Record<string, unknown>; return body; },
  };
  return { res, state };
};

const purchased = (db: FakeFirestore) => db.docs.get("aiTryOnUsage/global")?.purchasedTries ?? 0;
const topUpCount = (db: FakeFirestore) => [...db.docs.keys()].filter((key) => key.startsWith("aiTryOnTopUps/")).length;

const identities: Record<string, Doc> = {
  xavier: { uid: "xavier", admin: true, email: XAVIER, email_verified: true, firebase: { sign_in_provider: "google.com" } },
  fred: { uid: "fred", admin: true, email: FRED, email_verified: true, firebase: { sign_in_provider: "google.com" } },
  customer: { uid: "c", admin: false, email: "someone@example.test", email_verified: true, firebase: { sign_in_provider: "password" } },
  anon: { uid: "a", admin: true, email: XAVIER, email_verified: true, firebase: { sign_in_provider: "anonymous" } },
  stranger: { uid: "s", admin: true, email: "not-on-the-list@example.test", email_verified: true, firebase: { sign_in_provider: "google.com" } },
  unverified: { uid: "u", admin: true, email: XAVIER, email_verified: false, firebase: { sign_in_provider: "google.com" } },
};

const checkout = async (db: FakeFirestore, who: string | null, body: unknown = {}) => {
  const created: AiTryOnTopUpCheckoutRequest[] = [];
  const state = response();
  await handleAiTryOn({
    method: "POST",
    url: "/api/ai-try-on?action=admin-top-up",
    query: { action: "admin-top-up" },
    headers: who ? { authorization: `Bearer ${who}`, host: "admin.example" } : { host: "admin.example" },
    body,
  }, state.res, {
    environment: {},
    getDb: () => db.asFirestore(),
    verifyIdToken: async (token, checkRevoked) => {
      assert.equal(checkRevoked, true);
      const id = identities[token];
      if (!id) throw new Error("bad");
      return id as never;
    },
    aiTryOnTopUp: {
      readSecretKey: () => TEST_KEY,
      async createCheckoutSession(_key, input) {
        created.push(input);
        return { id: "cs_test_newsession", url: "https://checkout.stripe.com/c/pay/cs_test_newsession" };
      },
    },
  });
  return { ...state.state, created, docs: JSON.stringify([...db.docs]) };
};

// ------------------------------------------------------------ admin gate: checkout adds nothing
{
  const db = new FakeFirestore();
  db.docs.set("aiTryOnUsage/global", { count: 4, purchasedTries: 0 });
  const before = JSON.stringify([...db.docs]);
  assert.equal((await checkout(db, null)).status, 401);
  assert.equal((await checkout(db, "bad")).status, 401);
  for (const who of ["customer", "anon", "stranger", "unverified"]) {
    const refused = await checkout(db, who, { amountCents: 50, currency: "eur", successUrl: "https://evil.test/phish" });
    assert.equal(refused.status, 403, who);
    assert.equal(refused.created.length, 0, who);
  }
  assert.equal((await checkout(db, "xavier", { amountCents: 50 })).docs, before, "a refused or unsent checkout writes nothing yet");
  const started = await checkout(db, "xavier", { amountCents: 50, currency: "eur", successUrl: "https://evil.test/phish", tries: 9999 });
  assert.equal(started.status, 200);
  assert.equal(started.body.url, "https://checkout.stripe.com/c/pay/cs_test_newsession");
  assert.equal(started.created.length, 1);
  assert.equal(started.created[0].amountCents, 6400);
  assert.equal(started.created[0].currency, "usd");
  assert.equal(started.created[0].tries, 1000);
  assert.equal(started.created[0].adminUid, "xavier");
  assert.equal(started.created[0].adminEmail, XAVIER);
  assert.equal(started.created[0].successUrl, "https://admin.example/?ai_try_on_top_up=success");
  assert.equal(started.created[0].cancelUrl, "https://admin.example/?ai_try_on_top_up=cancel");
  assert.equal(started.docs, before, "opening Checkout does not add tries");
  const fred = await checkout(db, "fred");
  assert.equal(fred.status, 200, "any signed-in admin may start Checkout");
  assert.equal(fred.created[0].adminEmail, getCanonicalEmail(FRED));
  const live = response();
  await handleAiTryOn({
    method: "POST",
    url: "/api/ai-try-on?action=admin-top-up",
    headers: { authorization: "Bearer xavier", host: "admin.example" },
  }, live.res, {
    environment: {},
    getDb: () => db.asFirestore(),
    verifyIdToken: async () => identities.xavier as never,
    aiTryOnTopUp: {
      readSecretKey: () => "sk_live_example",
      async createCheckoutSession() { throw new Error("live checkout must not be created"); },
    },
  });
  assert.equal(live.state.status, 503);
  assert.equal(live.state.body.code, "STRIPE_TEST_KEY_REQUIRED");
  assert.equal(JSON.stringify([...db.docs]), before);
  const get = response();
  await handleAiTryOn({ method: "GET", url: "/api/ai-try-on?action=admin-top-up", headers: { authorization: "Bearer xavier" } }, get.res, {
    verifyIdToken: async () => identities.xavier as never,
    getDb: () => db.asFirestore(),
  });
  assert.equal(get.state.status, 405);
}

// ------------------------------------------------------------ webhook: signature, amount, one credit per session
{
  const db = new FakeFirestore();
  db.docs.set("aiTryOnUsage/global", { count: AI_TRY_ON_GLOBAL_GENERATION_CAP });
  let retrieves = 0;
  const calls = { construct: 0 };
  const deliver = (event: { id: string; type?: string; livemode?: boolean; sessionId?: string | null }, session?: AiTryOnTopUpCheckoutSession, signature = "signed") => {
    const state = response();
    return handleAiTryOnTopUpWebhook({
      method: "POST",
      headers: { "stripe-signature": signature },
      rawBody: JSON.stringify({ id: "forged_event_body" }),
      body: { id: "forged_event_body", triesAdded: 5000 },
    }, state.res, {
      getDb: () => db.asFirestore(),
      readSecretKey: () => TEST_KEY,
      readWebhookSecret: () => WEBHOOK_SECRET,
      now: () => Date.parse("2026-11-08T12:00:00.000Z"),
      log: () => undefined,
      constructEvent(key, rawBody, header, secret) {
        calls.construct += 1;
        assert.equal(key, TEST_KEY);
        assert.equal(secret, WEBHOOK_SECRET);
        assert.equal(header, signature);
        assert.equal(typeof rawBody, "string");
        assert.equal((rawBody as string).includes("forged_event_body"), true);
        if (signature !== "signed") throw new Error("bad signature");
        return { id: event.id, type: event.type ?? "checkout.session.completed", livemode: event.livemode ?? false, sessionId: event.sessionId === undefined ? SESSION_A : event.sessionId };
      },
      async retrieveCheckoutSession(_key, sessionId) {
        retrieves += 1;
        assert.equal(sessionId, event.sessionId ?? SESSION_A);
        return session ?? paidSession({ id: sessionId });
      },
    }).then(() => state.state);
  };

  const missingSecret = response();
  await handleAiTryOnTopUpWebhook({ method: "POST", headers: { "stripe-signature": "signed" }, rawBody: "{}" }, missingSecret.res, {
    readSecretKey: () => TEST_KEY,
    readWebhookSecret: () => "  ",
    constructEvent() { throw new Error("must not verify without a secret"); },
    log: () => undefined,
  });
  assert.equal(missingSecret.state.status, 400);
  assert.equal(missingSecret.state.body.code, "AI_TRY_ON_TOP_UP_WEBHOOK_SECRET_REQUIRED");

  const liveKey = response();
  await handleAiTryOnTopUpWebhook({ method: "POST", headers: { "stripe-signature": "signed" }, rawBody: "{}" }, liveKey.res, {
    readSecretKey: () => "sk_live_example",
    readWebhookSecret: () => WEBHOOK_SECRET,
    constructEvent() { throw new Error("live mode must not verify"); },
    log: () => undefined,
  });
  assert.equal(liveKey.state.status, 503);
  assert.equal(liveKey.state.body.code, "STRIPE_TEST_KEY_REQUIRED");

  const forged = await deliver({ id: EVENT_A }, undefined, "forged");
  assert.equal(forged.status, 400);
  assert.equal(forged.body.code, "INVALID_STRIPE_SIGNATURE");
  assert.equal(retrieves, 0);
  assert.equal(purchased(db), 0);

  const unsigned = response();
  await handleAiTryOnTopUpWebhook({ method: "POST", headers: {}, rawBody: "{}", body: { id: EVENT_A } }, unsigned.res, {
    readSecretKey: () => TEST_KEY,
    readWebhookSecret: () => WEBHOOK_SECRET,
    constructEvent() { throw new Error("unsigned body must not be verified"); },
    log: () => undefined,
  });
  assert.equal(unsigned.state.status, 400);
  assert.equal(unsigned.state.body.code, "INVALID_STRIPE_SIGNATURE");

  const liveEvent = await deliver({ id: EVENT_A, livemode: true });
  assert.equal(liveEvent.status, 200);
  assert.equal(liveEvent.body.status, "ignored");
  assert.equal(retrieves, 0, "a live-mode event is not retrieved");

  const otherEvent = await deliver({ id: EVENT_A, type: "payment_intent.succeeded" });
  assert.equal(otherEvent.body.status, "ignored");
  assert.equal(retrieves, 0);

  const credited = await deliver({ id: EVENT_A });
  assert.equal(credited.status, 200);
  assert.equal(credited.body.status, "credited");
  assert.equal(credited.body.triesAdded, 1000);
  assert.equal(purchased(db), 1000);
  assert.equal(db.docs.get("aiTryOnUsage/global")?.count, 1000, "used tries stay put");
  const record = db.docs.get(`aiTryOnTopUps/${SESSION_A}`)!;
  assert.equal(record.adminEmail, XAVIER);
  assert.equal(record.adminUid, "xavier");
  assert.equal(record.amountCents, 6400);
  assert.equal(record.currency, "usd");
  assert.equal(record.triesAdded, 1000);
  assert.equal(record.paymentIntentId, "pi_test_12345678");
  assert.equal(record.eventId, EVENT_A);
  assert.equal(record.testMode, true);
  assert.equal(record.createdAt, "2026-11-08T12:00:00.000Z");
  assert.equal(db.docs.get(`aiTryOnTopUpEvents/${EVENT_A}`)?.sessionId, SESSION_A);

  const replay = await deliver({ id: EVENT_A });
  assert.equal(replay.body.status, "already_recorded");
  assert.equal(replay.body.triesAdded, 0);
  assert.equal(purchased(db), 1000);
  assert.equal(topUpCount(db), 1);

  const sameSession = await deliver({ id: EVENT_B });
  assert.equal(sameSession.body.status, "already_recorded");
  assert.equal(purchased(db), 1000, "a second event for the same session does not credit again");
  assert.equal(db.docs.has(`aiTryOnTopUpEvents/${EVENT_B}`), false);

  const wrongAmount = await deliver({ id: EVENT_C, sessionId: SESSION_B }, paidSession({ id: SESSION_B, amountTotal: 100 }));
  assert.equal(wrongAmount.body.status, "ignored");
  const wrongCurrency = await deliver({ id: EVENT_C, sessionId: SESSION_B }, paidSession({ id: SESSION_B, currency: "eur" }));
  assert.equal(wrongCurrency.body.status, "ignored");
  const unpaid = await deliver({ id: EVENT_C, sessionId: SESSION_B }, paidSession({ id: SESSION_B, paymentStatus: "unpaid" }));
  assert.equal(unpaid.body.status, "ignored");
  const wrongPurpose = await deliver({ id: EVENT_C, sessionId: SESSION_B }, paidSession({
    id: SESSION_B,
    metadata: { purpose: "future_order", tries: "1000", adminUid: "xavier", adminEmail: XAVIER },
  }));
  assert.equal(wrongPurpose.body.status, "ignored");
  assert.equal(purchased(db), 1000);
  assert.equal(topUpCount(db), 1);

  const second = await deliver({ id: EVENT_C, sessionId: SESSION_B }, paidSession({ id: SESSION_B }));
  assert.equal(second.body.status, "credited");
  assert.equal(purchased(db), 2000);
  assert.equal(topUpCount(db), 2);

  const [raceA, raceB] = await Promise.all([
    creditVerifiedAiTryOnTopUp(db.asFirestore(), { eventId: "evt_dddddddd", session: paidSession({ id: "cs_test_cccccccc" }) }),
    creditVerifiedAiTryOnTopUp(db.asFirestore(), { eventId: "evt_eeeeeeee", session: paidSession({ id: "cs_test_cccccccc" }) }),
  ]);
  assert.deepEqual([raceA.status, raceB.status].sort(), ["already_recorded", "credited"]);
  assert.equal(purchased(db), 3000, "parallel deliveries of one session add 1,000 once");
  assert.equal(topUpCount(db), 3);
}

// ------------------------------------------------------------ real Stripe signature, not the injected verifier
{
  const payload = JSON.stringify({
    id: "evt_1234567890ab",
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { id: SESSION_A, object: "checkout.session" } },
  });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const db = new FakeFirestore();
  let retrieves = 0;
  const recorded = response();
  await handleAiTryOnTopUpWebhook({
    method: "POST",
    headers: { "stripe-signature": header },
    body: { id: "forged_event_body" },
    rawBody: payload,
  }, recorded.res, {
    getDb: () => db.asFirestore(),
    readSecretKey: () => TEST_KEY,
    readWebhookSecret: () => WEBHOOK_SECRET,
    log: () => undefined,
    async retrieveCheckoutSession() {
      retrieves += 1;
      return paidSession();
    },
  });
  assert.equal(recorded.state.status, 200);
  assert.equal(recorded.state.body.status, "credited");
  assert.equal(retrieves, 1);
  assert.equal(purchased(db), 1000);

  const tampered = response();
  await handleAiTryOnTopUpWebhook({
    method: "POST",
    headers: { "stripe-signature": header },
    rawBody: payload.replace(SESSION_A, SESSION_B),
  }, tampered.res, {
    getDb: () => db.asFirestore(),
    readSecretKey: () => TEST_KEY,
    readWebhookSecret: () => WEBHOOK_SECRET,
    log: () => undefined,
    async retrieveCheckoutSession() { throw new Error("tampered payload must not be retrieved"); },
  });
  assert.equal(tampered.state.status, 400);
  assert.equal(tampered.state.body.code, "INVALID_STRIPE_SIGNATURE");
  assert.equal(purchased(db), 1000);
}

// ------------------------------------------------------------ capacity: the extra 1,000 is what lets generation continue
{
  const db = new FakeFirestore();
  db.docs.set("aiTryOnUsage/global", { count: AI_TRY_ON_GLOBAL_GENERATION_CAP });
  const limits = createAiTryOnUsageLimits(db.asFirestore(), { now: () => Date.parse("2026-11-08T12:00:00.000Z") });
  assert.deepEqual(await limits.readGlobalCapacity(), { count: 1000, purchasedTries: 0, cap: 1000 });
  assert.equal((await limits.reserve("order-at-cap")).ok, false);
  const availability = async () => {
    const state = response();
    await handleAiTryOn({ method: "GET", url: "/api/ai-try-on", headers: {} }, state.res, {
      environment: { AI_TRY_ON_ENABLED: "true", GEMINI_API_KEY: "test-key" },
      getDb: () => db.asFirestore(),
    });
    return state.state.body;
  };
  assert.deepEqual(await availability(), { status: "unavailable", code: "GLOBAL_LIMIT_REACHED" });
  await creditVerifiedAiTryOnTopUp(db.asFirestore(), { eventId: EVENT_A, session: paidSession() });
  assert.deepEqual(await limits.readGlobalCapacity(), { count: 1000, purchasedTries: 1000, cap: 2000 });
  assert.deepEqual(await availability(), { status: "available", triesPerOrder: 5 });
  const reserved = await limits.reserve("order-after-top-up");
  assert.equal(reserved.ok, true);
  assert.equal(db.docs.get("aiTryOnUsage/global")?.count, 1001);
  assert.equal(db.docs.get("aiTryOnUsage/global")?.purchasedTries, 1000, "a generation does not erase the top-up");
  if (reserved.ok) await limits.release(reserved.orderDocId, null, reserved.orderResetGeneration);
  assert.equal(db.docs.get("aiTryOnUsage/global")?.purchasedTries, 1000);
  assert.equal(await limits.readGlobalCount(), 1000);

  const usage = async (who: string) => {
    const state = response();
    await handleAiTryOn({
      method: "GET",
      url: "/api/ai-try-on?action=admin-usage",
      query: { action: "admin-usage" },
      headers: { authorization: `Bearer ${who}` },
    }, state.res, {
      environment: {},
      getDb: () => db.asFirestore(),
      now: () => Date.parse("2026-11-08T12:00:00.000Z"),
      verifyIdToken: async (token) => identities[token] as never,
    });
    return state.state;
  };
  const xavier = await usage("xavier");
  assert.equal(xavier.status, 200);
  assert.deepEqual(xavier.body.allTime, { tries: 1000, cap: 2000 });
  const history = xavier.body.topUps as Array<Record<string, unknown>>;
  assert.equal(history.length, 1);
  assert.equal(history[0].sessionId, SESSION_A);
  assert.equal(history[0].triesAdded, AI_TRY_ON_TOP_UP_TRIES);
  assert.equal(history[0].amountCents, 6400);
  assert.equal(history[0].adminEmail, XAVIER);
  const fred = await usage("fred");
  assert.deepEqual(fred.body.allTime, { tries: 1000, cap: 2000 });
  assert.equal("topUps" in fred.body, false, "other admins see the new cap, not the payment");
  assert.doesNotMatch(JSON.stringify(fred.body), /\$|usd|cost|top up|billing/i);
  assert.equal((await usage("customer")).status, 403);
  const signedOut = response();
  await handleAiTryOn({ method: "GET", url: "/api/ai-try-on?action=admin-usage", headers: {} }, signedOut.res, {
    getDb: () => db.asFirestore(),
  });
  assert.equal(signedOut.state.status, 401);
}

// ------------------------------------------------------------ routing: raw webhook path, no new Vercel function
{
  const vercel = JSON.parse(readFileSync("./vercel.json", "utf8")) as { rewrites?: Array<{ source: string; destination: string }> };
  assert.ok(vercel.rewrites?.some((rewrite) =>
    rewrite.source === "/api/ai-try-on/top-up-webhook" &&
    rewrite.destination === "/api/future-order-v2/record-payment?route=ai-try-on-top-up"));
  const server = readFileSync("server.ts", "utf8");
  const webhookAt = server.indexOf('"/api/ai-try-on/top-up-webhook"');
  const jsonAt = server.indexOf("app.use(express.json");
  assert.ok(webhookAt > 0 && webhookAt < jsonAt, "signature verification sees the raw body");
  const rules = readFileSync("firestore.rules", "utf8");
  assert.match(rules, /match \/aiTryOnTopUps\/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rules, /match \/aiTryOnTopUpEvents\/\{document=\*\*\} \{\s*allow read, write: if false;/);
  const envExample = readFileSync(".env.example", "utf8");
  assert.match(envExample, new RegExp(`^${AI_TRY_ON_TOP_UP_WEBHOOK_SECRET_ENV}=""$`, "m"));

  const previousKey = process.env.STRIPE_SECRET_KEY;
  const previousHook = process.env[AI_TRY_ON_TOP_UP_WEBHOOK_SECRET_ENV];
  process.env.STRIPE_SECRET_KEY = TEST_KEY;
  process.env[AI_TRY_ON_TOP_UP_WEBHOOK_SECRET_ENV] = WEBHOOK_SECRET;
  try {
    const routed = response();
    await recordPaymentHandler({
      method: "POST",
      query: { route: "ai-try-on-top-up" },
      headers: { "stripe-signature": "forged" },
      rawBody: "{}",
      body: { id: "forged_event_body", triesAdded: 1000 },
    } as HttpRequest, routed.res);
    assert.equal(routed.state.status, 400);
    assert.equal(routed.state.body.code, "INVALID_STRIPE_SIGNATURE");
  } finally {
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
    if (previousHook === undefined) delete process.env[AI_TRY_ON_TOP_UP_WEBHOOK_SECRET_ENV];
    else process.env[AI_TRY_ON_TOP_UP_WEBHOOK_SECRET_ENV] = previousHook;
  }

  const orderPayment = response();
  await recordPaymentHandler({ method: "POST", headers: {}, body: {} } as HttpRequest, orderPayment.res);
  assert.equal(orderPayment.state.status, 401, "Future Order payments still require the customer");
  assert.equal(orderPayment.state.body.code, "AUTH_REQUIRED");
}

// ------------------------------------------------------------ usage page: button, history, no client increment
{
  const base: AiTryOnAdminUsage = {
    view: "full",
    countingSince: "2026-11-08",
    days: [],
    months: [],
    allTime: { tries: 1000, cap: 2000 },
    cost: { estimate: true, perTryUsd: 0.064, allTimeUsd: 64, thisMonthUsd: 0, reminders: [] },
    topUps: [{
      sessionId: SESSION_A,
      paymentIntentId: "pi_test_12345678",
      adminEmail: XAVIER,
      amountCents: 6400,
      currency: "usd",
      triesAdded: 1000,
      createdAt: "2026-11-08T12:00:00.000Z",
    }],
  };
  let renderer!: ReturnType<typeof create>;
  const urls: Array<string | null> = [];
  await act(async () => {
    renderer = create(createElement(AdminAiTryOnUsage, {
      readUsage: async () => base,
      startTopUp: async () => {
        urls.push("https://checkout.stripe.com/c/pay/cs_test_newsession");
        return "https://checkout.stripe.com/c/pay/cs_test_newsession";
      },
    }));
  });
  const json = JSON.stringify(renderer.toJSON());
  assert.match(json, /Remaining:/);
  assert.match(json, /"2000"/);
  assert.match(json, /Top up 1,000 tries \(\$64\)/);
  assert.match(json, /techpalavabox@gmail.com/);
  assert.match(json, /\$64\.00/);
  assert.match(json, new RegExp(SESSION_A));
  assert.match(json, /pi_test_12345678/);
  const button = renderer.root.find((node) => node.props["data-admin-ai-try-on-usage-top-up"] !== undefined);
  await act(async () => { await button.props.onClick(); });
  assert.deepEqual(urls, ["https://checkout.stripe.com/c/pay/cs_test_newsession"]);
  act(() => renderer.unmount());
  const client = readFileSync("src/services/aiTryOnAdminUsage.ts", "utf8");
  assert.equal(client.includes("purchasedTries"), false, "the browser cannot write the cap");
  assert.match(client, /https:\/\/checkout\.stripe\.com\//);
}

console.log("PASS: AI Try-on Stripe test top-up (signature, idempotency, admin gate, +1000 capacity)");
