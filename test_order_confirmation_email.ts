/**
 * PR 5: order confirmation email. Mock only: Brevo's fetch and the Gmail
 * transport are fakes; nothing is sent.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import type { Firestore } from "firebase-admin/firestore";
import {
  ORDER_CONFIRMATION_EMAIL_COLLECTION,
  ORDER_CONFIRMATION_EMAIL_SENDING_STALE_MS,
  ORDER_CONFIRMATION_EMAIL_TIMEOUT_MS,
  orderConfirmationOrderUrl,
  renderOrderConfirmationEmail,
  sendOrderConfirmationEmail,
} from "./src/server/orderConfirmationEmail";
import { AI_TRY_ON_ORDER_IMAGE_COLLECTION } from "./src/server/aiTryOnOrderImages";
import { AI_TRY_ON_ORDER_IMAGE_COPY as COPY } from "./src/utils/aiTryOnOrderImageCopy";

type Doc = Record<string, unknown>;
class FakeFirestore {
  readonly docs = new Map<string, Doc>();
  private lock: Promise<unknown> = Promise.resolve();
  private snap(path: string) {
    const data = this.docs.get(path);
    return { exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  }
  collection(name: string) {
    return {
      doc: (id: string) => {
        const path = `${name}/${id}`;
        return { path, get: async () => this.snap(path), set: async (data: Doc) => void this.docs.set(path, { ...data }) };
      },
    };
  }
  runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const run = this.lock.then(() =>
      fn({
        get: async (ref: { path: string }) => this.snap(ref.path),
        set: (ref: { path: string }, data: Doc) => void this.docs.set(ref.path, { ...data }),
      }),
    );
    this.lock = run.catch(() => undefined);
    return run;
  }
  asFirestore() {
    return this as unknown as Firestore;
  }
}

const ORDER = "future-order-pr5";
const SITE = "https://odogwu.example";
const env = {
  ORDER_CONFIRMATION_EMAIL_ENABLED: "true",
  BREVO_API_KEY: "fake-brevo-key-for-tests-only",
  AUTH_EMAIL_FROM: "orders@odogwu.example",
  PUBLIC_SITE_URL: SITE,
};

// ------------------------------------------------------------ template: links to the order, never the image
{
  const { subject, html } = renderOrderConfirmationEmail({ brandName: "The Odogwu Heritage", siteUrl: SITE, orderId: ORDER, name: "Ada <b>", hasAiPreview: true });
  assert.equal(subject, COPY.emailSubject(ORDER));
  assert.ok(html.includes(`href="${SITE}/?future_order_v2_order_id=${ORDER}"`), "links to this one order");
  assert.equal((html.match(/href="/g) || []).length, 1, "the only link is the order");
  assert.ok(html.includes(COPY.emailViewOrder));
  assert.ok(html.includes("Hello Ada &lt;b&gt;,"), "name escaped");
  for (const line of [COPY.emailIntro(ORDER), COPY.emailNextSteps, COPY.emailSignOff, COPY.emailFooter]) {
    assert.ok(html.includes(line.replace(/'/g, "'")), line);
  }
  assert.ok(html.includes("Your AI preview is saved with your order for 60 days. You can see it, or delete it, in My Orders. We don&#39;t attach it to this email.") || html.includes("We don't attach it to this email."));
  assert.equal(/<img/i.test(html), false, "no image in the email");
  assert.equal(/ai-try-on|data:image|base64/i.test(html), false, "no preview path or data");
  writeFileSync(
    "/tmp/order-confirmation-email-with-preview.html",
    renderOrderConfirmationEmail({ brandName: "The Odogwu Heritage", siteUrl: SITE, orderId: ORDER, name: "Ada", hasAiPreview: true }).html,
  );
  const plain = renderOrderConfirmationEmail({ brandName: "The Odogwu Heritage", siteUrl: SITE, orderId: ORDER, name: null, hasAiPreview: false });
  assert.ok(plain.html.includes("Hello,"));
  assert.equal(plain.html.includes("Your AI preview is saved"), false, "no preview line without a saved preview");
  writeFileSync("/tmp/order-confirmation-email-no-preview.html", plain.html);
  assert.equal(orderConfirmationOrderUrl(SITE, ORDER), `${SITE}/?future_order_v2_order_id=${ORDER}`);
  assert.equal(orderConfirmationOrderUrl(`${SITE}//`, "a b&c"), `${SITE}/?future_order_v2_order_id=a%20b%26c`, "trailing slashes, escaping");
  // The same param the app already reads to open one order's details (App -> dashboard tab, DashboardView -> open order).
  const app = readFileSync("src/App.tsx", "utf8");
  assert.match(app, /params\.get\("future_order_v2_order_id"\)[\s\S]{0,200}stashFutureOrderV2OpenOrderId\(orderId\);\s*setActiveTab\("dashboard"\)/);
  const dashboard = readFileSync("src/components/DashboardView.tsx", "utf8");
  assert.match(dashboard, /params\.get\("future_order_v2_order_id"\)[\s\S]{0,200}if \(orderId\) setOpenV2OrderId\(orderId\)/);
}

// ------------------------------------------------------------ send: once, mocked Brevo, Gmail fallback, never throws
const harness = (environment: Record<string, string> = env) => {
  const db = new FakeFirestore();
  const brevoCalls: { url: string; body: Record<string, unknown> }[] = [];
  const gmailCalls: unknown[] = [];
  const logs: string[] = [];
  let brevoFails = false;
  let gmailFails = false;
  const deps = {
    environment,
    getDb: () => db.asFirestore(),
    readRecipient: async () => ({ email: "ada@example.com", name: "Ada" }),
    fetchImpl: (async (url: string, init: RequestInit) => {
      brevoCalls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return brevoFails ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ messageId: "m1" }), { status: 201 });
    }) as unknown as typeof fetch,
    createGmailTransport: () => ({
      sendMail: async (message: unknown) => {
        gmailCalls.push(message);
        if (gmailFails) throw new Error("smtp down");
        return {};
      },
    }),
    log: (line: string) => logs.push(line),
  };
  return { db, deps, brevoCalls, gmailCalls, logs, failBrevo: () => { brevoFails = true; }, failGmail: () => { gmailFails = true; } };
};

{
  const h = harness({ ...env, ORDER_CONFIRMATION_EMAIL_ENABLED: "" });
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "disabled", "off unless switched on");
  assert.equal(h.brevoCalls.length, 0);
}
{
  const h = harness({ ORDER_CONFIRMATION_EMAIL_ENABLED: "true" });
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "not_configured");
}
{
  const h = harness();
  h.db.docs.set(`${AI_TRY_ON_ORDER_IMAGE_COLLECTION}/${ORDER}`, { status: "saved", ownerUid: "uid-ada", images: [] });
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "sent");
  assert.equal(h.brevoCalls.length, 1);
  const body = h.brevoCalls[0].body;
  assert.deepEqual(body.to, [{ email: "ada@example.com" }]);
  assert.equal(body.subject, COPY.emailSubject(ORDER));
  assert.ok(String(body.htmlContent).includes("Your AI preview is saved with your order"));
  assert.equal("attachment" in body, false, "nothing attached");
  assert.equal(h.db.docs.get(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`)!.status, "sent");
  // Webhook + browser record: the second event sends nothing.
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "already_sent");
  assert.equal(h.brevoCalls.length, 1);
  const logText = h.logs.join("\n");
  assert.equal(logText.includes("ada@example.com") || logText.includes(ORDER) || logText.includes("uid-ada"), false, "no PII in logs");
  assert.equal(logText.includes("fake-brevo-key"), false);
}
{
  const h = harness({ ...env, GMAIL_SMTP_USER: "shop@example.com", GMAIL_SMTP_APP_PASSWORD: "fake pass word only" });
  h.failBrevo();
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "sent", "Gmail fallback");
  assert.equal(h.gmailCalls.length, 1);
}
{
  const h = harness();
  h.failBrevo();
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "failed");
  assert.equal(h.db.docs.get(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`)!.status, "failed", "a later payment event may retry");
}
{
  const h = harness();
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, { ...h.deps, readRecipient: async () => ({ email: null, name: null }) } as never), "no_recipient");
  assert.equal(h.brevoCalls.length, 0);
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, { ...h.deps, getDb: () => { throw new Error("no db"); } } as never), "failed", "never throws");
  const started = Date.now();
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: "other" }, { ...h.deps, readRecipient: () => new Promise(() => undefined), timeoutMs: 30 } as never), "timeout");
  assert.ok(Date.now() - started < 1000);
}

// ------------------------------------------------------------ the send finishes before the function ends; a stuck send retries once
{
  assert.equal(ORDER_CONFIRMATION_EMAIL_TIMEOUT_MS, 15_000);
  assert.equal(ORDER_CONFIRMATION_EMAIL_SENDING_STALE_MS, 15_000);
  const h = harness();
  let releaseRecipient!: () => void;
  const recipientGate = new Promise<{ email: string; name: string }>((resolve) => {
    releaseRecipient = () => resolve({ email: "ada@example.com", name: "Ada" });
  });
  let settled = false;
  const pending = sendOrderConfirmationEmail(
    { ownerUid: "uid-ada", orderId: ORDER },
    { ...h.deps, readRecipient: () => recipientGate } as never,
  ).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(settled, false, "the function stays open while the email is still being prepared");
  assert.equal(h.brevoCalls.length, 0);
  releaseRecipient();
  assert.equal(await pending, "sent");
  assert.equal(settled, true, "the send has finished when the function ends");
  assert.equal(h.brevoCalls.length, 1);
  assert.equal(h.db.docs.get(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`)!.status, "sent");
}
{
  // A previous attempt claimed "sending" and then died. The next payment
  // event sends once, and the one after that does not.
  const h = harness();
  h.db.docs.set(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`, {
    orderId: ORDER,
    status: "sending",
    claimedAt: Date.now() - ORDER_CONFIRMATION_EMAIL_SENDING_STALE_MS - 1,
    claimId: "stuck-claim",
  });
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "sent");
  assert.equal(h.brevoCalls.length, 1, "stuck sending is retried");
  assert.equal(h.db.docs.get(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`)!.status, "sent");
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "already_sent");
  assert.equal(h.brevoCalls.length, 1, "retried exactly once");
}
{
  const h = harness();
  h.db.docs.set(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`, {
    orderId: ORDER,
    status: "failed",
    claimedAt: Date.now(),
    claimId: "failed-claim",
  });
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "sent", "failed is retried");
  assert.equal(h.brevoCalls.length, 1);
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "already_sent");
  assert.equal(h.brevoCalls.length, 1);
}
{
  // The attempt timed out before the provider was called, so the claim is
  // failed and the next confirmation call sends exactly once.
  const h = harness();
  assert.equal(
    await sendOrderConfirmationEmail(
      { ownerUid: "uid-ada", orderId: ORDER },
      { ...h.deps, readRecipient: () => new Promise(() => undefined), timeoutMs: 40 } as never,
    ),
    "timeout",
  );
  assert.equal(h.db.docs.get(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`)!.status, "failed");
  assert.equal(h.brevoCalls.length, 0);
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "sent");
  assert.equal(h.brevoCalls.length, 1);
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "already_sent");
  assert.equal(h.brevoCalls.length, 1, "the timed-out sending claim is retried exactly once");
}
{
  // A live send is not stolen, so two overlapping payment events send once.
  const h = harness();
  h.db.docs.set(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`, {
    orderId: ORDER,
    status: "sending",
    claimedAt: Date.now(),
    claimId: "live-claim",
  });
  const live = await sendOrderConfirmationEmail(
    { ownerUid: "uid-ada", orderId: ORDER },
    { ...h.deps, timeoutMs: 60 } as never,
  );
  assert.ok(live === "already_sent" || live === "timeout");
  assert.equal(h.brevoCalls.length, 0, "a fresh sending claim is not stolen");
  assert.equal(h.db.docs.get(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`)!.status, "sending");

  let releaseSend!: () => void;
  const sendGate = new Promise<void>((resolve) => {
    releaseSend = resolve;
  });
  const overlapping = harness();
  overlapping.deps.fetchImpl = (async () => {
    await sendGate;
    overlapping.brevoCalls.push({ url: "https://brevo.test/send", body: {} });
    return new Response(JSON.stringify({ messageId: "m-live" }), { status: 201 });
  }) as unknown as typeof fetch;
  const first = sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, overlapping.deps as never);
  const second = sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, overlapping.deps as never);
  await new Promise((resolve) => setTimeout(resolve, 40));
  releaseSend();
  const results = (await Promise.all([first, second])).sort();
  assert.deepEqual(results, ["already_sent", "sent"]);
  assert.equal(overlapping.brevoCalls.length, 1, "webhook and browser send one email");
  assert.equal(overlapping.db.docs.get(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`)!.status, "sent");
}

// ------------------------------------------------------------ an attempt abandoned at the deadline never sends next to the retry; its tail is kept alive
{
  // Attempt A claims, then stalls reading the AI preview record past its
  // budget. Its claim is released as "failed", the next payment event (B)
  // retries and sends. When A's read finally returns, A must not send too.
  const h = harness();
  const kept: Promise<unknown>[] = [];
  let releaseRecord!: () => void;
  const recordGate = new Promise<void>((resolve) => {
    releaseRecord = resolve;
  });
  const fake = h.db.asFirestore() as unknown as FakeFirestore;
  const slowRecordDb = {
    runTransaction: fake.runTransaction.bind(fake),
    collection: (name: string) => {
      const inner = fake.collection(name);
      if (name !== AI_TRY_ON_ORDER_IMAGE_COLLECTION) return inner;
      return {
        doc: (id: string) => {
          const ref = inner.doc(id);
          return { ...ref, get: async () => { await recordGate; return ref.get(); } };
        },
      };
    },
  } as unknown as Firestore;
  const a = await sendOrderConfirmationEmail(
    { ownerUid: "uid-ada", orderId: ORDER },
    { ...h.deps, getDb: () => slowRecordDb, timeoutMs: 40, keepAlive: (work: Promise<unknown>) => void kept.push(work) } as never,
  );
  assert.equal(a, "timeout");
  assert.equal(kept.length, 1, "the unfinished attempt is handed to waitUntil");
  assert.equal(h.db.docs.get(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`)!.status, "failed");
  assert.equal(await sendOrderConfirmationEmail({ ownerUid: "uid-ada", orderId: ORDER }, h.deps as never), "sent");
  assert.equal(h.brevoCalls.length, 1);
  releaseRecord();
  await Promise.all(kept);
  assert.equal(h.brevoCalls.length, 1, "the abandoned attempt does not send a second email");
  assert.equal(h.db.docs.get(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`)!.status, "sent");
}
{
  // Claim taken over while preparing (no timeout): the old owner stops.
  const h = harness();
  let releaseRecipient!: () => void;
  const gate = new Promise<{ email: string; name: string }>((resolve) => {
    releaseRecipient = () => resolve({ email: "ada@example.com", name: "Ada" });
  });
  const pending = sendOrderConfirmationEmail(
    { ownerUid: "uid-ada", orderId: ORDER },
    { ...h.deps, readRecipient: () => gate } as never,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  h.db.docs.set(`${ORDER_CONFIRMATION_EMAIL_COLLECTION}/${ORDER}`, {
    orderId: ORDER,
    status: "sent",
    claimedAt: Date.now(),
    claimId: "other-event",
  });
  releaseRecipient();
  assert.equal(await pending, "already_sent");
  assert.equal(h.brevoCalls.length, 0, "a call that lost its claim never reaches the provider");
}
{
  // A normal send finishes inside the budget and needs no keep-alive.
  const h = harness();
  const kept: Promise<unknown>[] = [];
  assert.equal(
    await sendOrderConfirmationEmail(
      { ownerUid: "uid-ada", orderId: ORDER },
      { ...h.deps, keepAlive: (work: Promise<unknown>) => void kept.push(work) } as never,
    ),
    "sent",
  );
  assert.equal(kept.length, 0);
}

// ------------------------------------------------------------ wiring: after the AI preview copy, on every payment path; rules
{
  for (const file of ["src/server/futureOrderV2PaymentRecord.ts", "src/server/futureOrderV2PayPalPayment.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /await retireAiTryOnSessionForPaidOrder\([\s\S]*?\);\s*\/\/ After the AI preview copy[^\n]*\n\s*await sendOrderConfirmationEmail\(/, file);
  }
  const rules = readFileSync("firestore.rules", "utf8");
  assert.match(rules, /match \/orderConfirmationEmails\/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
}

console.log("PASS: order confirmation email (template, once, mocked Brevo/Gmail, wiring)");
