/**
 * PR 5: order confirmation email. Mock only: Brevo's fetch and the Gmail
 * transport are fakes; nothing is sent.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import type { Firestore } from "firebase-admin/firestore";
import {
  ORDER_CONFIRMATION_EMAIL_COLLECTION,
  orderConfirmationOrderUrl,
  renderOrderConfirmationEmail,
  sendOrderConfirmationEmail,
} from "./src/server/orderConfirmationEmail";
import { AI_TRY_ON_ORDER_IMAGE_COLLECTION } from "./src/server/aiTryOnOrderImages";
import { AI_TRY_ON_ORDER_IMAGE_COPY as COPY } from "./src/utils/aiTryOnOrderImageCopy";

type Doc = Record<string, unknown>;
class FakeFirestore {
  readonly docs = new Map<string, Doc>();
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
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return fn({
      get: async (ref: { path: string }) => this.snap(ref.path),
      set: (ref: { path: string }, data: Doc) => void this.docs.set(ref.path, { ...data }),
    });
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
  assert.ok(html.includes(`href="${SITE}/?tab=dashboard&amp;order=${ORDER}"`), "links to the order in My Orders");
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
  assert.equal(orderConfirmationOrderUrl(`${SITE}/`, "a b"), `${SITE}/?tab=dashboard&order=a%20b`);
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

// ------------------------------------------------------------ wiring: after the AI preview copy, on every payment path; rules
{
  for (const file of ["src/server/futureOrderV2PaymentRecord.ts", "src/server/futureOrderV2PayPalPayment.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /await retireAiTryOnSessionForPaidOrder\([\s\S]*?\);\s*\/\/ After the AI preview copy[^\n]*\n\s*await sendOrderConfirmationEmail\(/, file);
  }
  const rules = readFileSync("firestore.rules", "utf8");
  assert.match(rules, /match \/orderConfirmationEmails\/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  assert.match(readFileSync("src/store/useAppStore.ts", "utf8"), /get\("tab"\) === "dashboard" \? "dashboard"/);
}

console.log("PASS: order confirmation email (template, once, mocked Brevo/Gmail, wiring)");
