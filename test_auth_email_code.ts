import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AUTH_EMAIL_CODE_COLLECTION,
  EMAIL_CODE_MAX_ATTEMPTS,
  emailCodeDocumentId,
  issueEmailCode,
  verifyEmailCode,
} from "./src/server/authEmailCode";
import {
  BREVO_SEND_URL,
  readAuthEmailConfig,
  renderLoginCodeEmail,
  sendBrevoEmail,
  readGmailSmtpConfig,
  requireAuthEmailConfig,
  type GmailSmtpConfig,
  sendLoginCodeEmail,
} from "./src/server/brevoEmail";
import {
  EMAIL_CODE_REQUEST_ROUTE,
  EMAIL_CODE_VERIFY_ROUTE,
  getAuthRoute,
  handleEmailCodeRequest,
  handleEmailCodeVerify,
} from "./src/server/authHttp";
import {
  completeEmailCodeSignIn,
  hashPin,
  loginWithPin,
} from "./src/server/customerAuth";
import { ALLOWED_ADMIN_EMAILS } from "./src/server/adminAllowlist";
import { createFakeAuth, createFakeDb } from "./testing/authFirestoreFake";
import {
  BREVO_DAILY_USAGE_COLLECTION,
  createBrevoDailyUsage,
  readBrevoDailyLimit,
  type BrevoDailyUsage,
} from "./src/server/brevoDailyCounter";

const MINUTE = 60_000;

// --- Issue: hashed, cooldown, same behaviour for any address --------------
{
  const { db, table } = createFakeDb();
  let now = 5_000_000;
  const sent: string[] = [];
  const first = await issueEmailCode(db, "ada@example.test", {
    purpose: "sign-in",
    name: "Ada",
    send: async (code) => {
      sent.push(code);
    },
    now: () => now,
    generate: () => "482913",
  });
  assert.deepEqual(first, { sent: true, resendAfterSeconds: 60, expiresInSeconds: 600 });
  assert.deepEqual(sent, ["482913"]);
  const stored = table(AUTH_EMAIL_CODE_COLLECTION).get(emailCodeDocumentId("ada@example.test"))!;
  assert.equal(JSON.stringify(stored).includes("482913"), false, "code is stored hashed");
  assert.equal(JSON.stringify(stored).includes("ada@example.test"), false);
  assert.match(stored.codeHash, /^scrypt\$/);
  assert.match(emailCodeDocumentId("ada@example.test"), /^[0-9a-f]{64}$/);

  now += 30_000;
  const early = await issueEmailCode(db, "ada@example.test", {
    purpose: "sign-in",
    send: async (code) => {
      sent.push(code);
    },
    now: () => now,
  });
  assert.deepEqual(early, { sent: false, resendAfterSeconds: 30, expiresInSeconds: 600 });
  assert.equal(sent.length, 1, "nothing is sent inside the 60s cooldown");

  // A send failure clears the cooldown so the person can retry at once.
  now += 31_000;
  await assert.rejects(
    issueEmailCode(db, "ada@example.test", {
      purpose: "sign-in",
      send: async () => {
        throw new Error("EMAIL_SEND_FAILED");
      },
      now: () => now,
    }),
    /EMAIL_SEND_FAILED/,
  );
  const retry = await issueEmailCode(db, "ada@example.test", {
    purpose: "sign-in",
    send: async (code) => {
      sent.push(code);
    },
    now: () => now + 1_000,
  });
  assert.equal(retry.sent, true);
}

// --- Verify: single use, expiry, purpose, 5 tries --------------------------
{
  const { db } = createFakeDb();
  let now = 10_000_000;
  const issue = (code: string, purpose: "sign-in" | "pin-confirmation" = "sign-in") =>
    issueEmailCode(db, "bob@example.test", {
      purpose,
      name: "Bob",
      send: async () => undefined,
      now: () => now,
      generate: () => code,
    });

  await issue("111222");
  const ok = await verifyEmailCode(db, "bob@example.test", "111222", { purpose: "sign-in", now: () => now });
  assert.equal(ok.name, "Bob");
  await assert.rejects(
    verifyEmailCode(db, "bob@example.test", "111222", { now: () => now }),
    /INVALID_CODE/,
    "a used code cannot be replayed",
  );

  now += MINUTE * 2;
  await issue("333444");
  await assert.rejects(
    verifyEmailCode(db, "bob@example.test", "333444", { now: () => now + 10 * MINUTE }),
    /INVALID_CODE/,
    "expired after 10 minutes",
  );

  now += MINUTE * 2;
  await issue("555666", "pin-confirmation");
  await assert.rejects(
    verifyEmailCode(db, "bob@example.test", "555666", { purpose: "sign-in", now: () => now }),
    /INVALID_CODE/,
    "a PIN-confirmation code cannot be used to sign in by code",
  );

  now += MINUTE * 2;
  await issue("777888");
  for (let attempt = 1; attempt < EMAIL_CODE_MAX_ATTEMPTS; attempt += 1) {
    await assert.rejects(
      verifyEmailCode(db, "bob@example.test", "000000", { now: () => now }),
      /INVALID_CODE/,
    );
  }
  await assert.rejects(
    verifyEmailCode(db, "bob@example.test", "000000", { now: () => now }),
    /CODE_ATTEMPTS_EXCEEDED/,
  );
  await assert.rejects(
    verifyEmailCode(db, "bob@example.test", "777888", { now: () => now }),
    /CODE_ATTEMPTS_EXCEEDED/,
    "after 5 wrong tries even the right code is refused",
  );
  await assert.rejects(verifyEmailCode(db, "bob@example.test", "12ab56"), /INVALID_CODE/);
}

// --- Brevo config, template and request shape ------------------------------
{
  assert.equal(readAuthEmailConfig({}), null);
  assert.equal(readAuthEmailConfig({ BREVO_API_KEY: "k" }), null);
  assert.deepEqual(
    readAuthEmailConfig({
      BREVO_API_KEY: "test-key",
      AUTH_EMAIL_FROM: "login@example.test",
      APP_URL: "https://shop.example.test/",
    }),
    {
      apiKey: "test-key",
      fromEmail: "login@example.test",
      fromName: "The Odogwu Heritage",
      siteUrl: "https://shop.example.test",
    },
  );
  const custom = readAuthEmailConfig({
    BREVO_API_KEY: "test-key",
    AUTH_EMAIL_FROM: "hello@new-domain.test",
    AUTH_EMAIL_FROM_NAME: "Odogwu",
    PUBLIC_SITE_URL: "https://new-domain.test",
    APP_URL: "https://old.example.test",
  });
  assert.equal(custom?.siteUrl, "https://new-domain.test", "PUBLIC_SITE_URL wins over APP_URL");
  assert.equal(custom?.fromName, "Odogwu");

  const email = renderLoginCodeEmail({
    code: "482913",
    brandName: "The Odogwu Heritage",
    siteUrl: "https://shop.example.test",
    purpose: "sign-in",
  });
  assert.equal(email.subject, "482913 is your The Odogwu Heritage code");
  assert.match(email.html, /font-size:40px[^>]*>482913</);
  assert.match(email.html, /expires in 10 minutes/);
  assert.match(email.html, /href="https:\/\/shop\.example\.test"/);
  const escaped = renderLoginCodeEmail({
    code: "111111",
    brandName: "<script>",
    siteUrl: "",
    purpose: "pin-confirmation",
  });
  assert.equal(escaped.html.includes("<script>"), false);
  assert.match(escaped.html, /Your PIN keeps working afterwards/);

  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ messageId: "<id>" }), { status: 201 });
  }) as unknown as typeof fetch;
  await sendLoginCodeEmail("ada@example.test", "482913", "sign-in", {
    environment: { BREVO_API_KEY: "test-key", AUTH_EMAIL_FROM: "login@example.test" },
    fetchImpl: fakeFetch,
    log: () => {},
  });
  assert.equal(calls[0].url, BREVO_SEND_URL);
  assert.equal((calls[0].init.headers as Record<string, string>)["api-key"], "test-key");
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.sender, { name: "The Odogwu Heritage", email: "login@example.test" });
  assert.deepEqual(body.to, [{ email: "ada@example.test" }]);
  assert.match(body.htmlContent, /482913/);

  await assert.rejects(
    sendLoginCodeEmail("a@b.test", "1", "sign-in", { environment: {}, log: () => {} }),
    /EMAIL_NOT_CONFIGURED/,
  );
  const failing = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(
    sendBrevoEmail(
      { apiKey: "k", fromEmail: "a@b.test", fromName: "n", siteUrl: "" },
      { to: "c@d.test", subject: "s", html: "h" },
      failing,
    ),
    /EMAIL_SEND_FAILED/,
  );
}

// --- Gmail SMTP fallback ----------------------------------------------------
{
  const brevoEnv = { BREVO_API_KEY: "brevo-secret-key", AUTH_EMAIL_FROM: "login@example.test" };
  const gmailEnv = {
    GMAIL_SMTP_USER: "odogwu.shop@gmail.com",
    GMAIL_SMTP_APP_PASSWORD: "abcd efgh ijkl mnop",
  };
  const bothEnv = { ...brevoEnv, ...gmailEnv, AUTH_EMAIL_FROM_NAME: "Odogwu" };

  assert.equal(readGmailSmtpConfig({}), null);
  assert.equal(readGmailSmtpConfig({ GMAIL_SMTP_USER: "x@gmail.com" }), null);
  assert.deepEqual(readGmailSmtpConfig({ ...gmailEnv, APP_URL: "https://s.test/" }), {
    user: "odogwu.shop@gmail.com",
    appPassword: "abcdefghijklmnop",
    fromName: "The Odogwu Heritage",
    siteUrl: "https://s.test",
  });
  assert.throws(() => requireAuthEmailConfig({}), /EMAIL_NOT_CONFIGURED/);
  assert.deepEqual(requireAuthEmailConfig(gmailEnv), ["gmail-smtp"]);
  assert.deepEqual(requireAuthEmailConfig(bothEnv), ["brevo", "gmail-smtp"]);

  const fakeGmail = (behaviour: "ok" | "fail") => {
    const sent: Array<{ config: GmailSmtpConfig; message: Record<string, unknown> }> = [];
    const factory = (config: GmailSmtpConfig) => ({
      async sendMail(message: Record<string, unknown>) {
        sent.push({ config, message });
        if (behaviour === "fail") {
          throw Object.assign(new Error("Invalid login: 535 secret detail"), {
            code: "EAUTH",
            responseCode: 535,
          });
        }
        return { messageId: "gmail-id" };
      },
    });
    return { sent, factory };
  };
  const brevoReturning = (status: number) => {
    let calls = 0;
    const impl = (async () => {
      calls += 1;
      return new Response("{}", { status });
    }) as unknown as typeof fetch;
    return { impl, calls: () => calls };
  };
  const logger = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };
  const assertNoSecretsLogged = (lines: string[]) => {
    const text = lines.join("\n");
    for (const forbidden of ["482913", "brevo-secret-key", "abcd", "abcdefghijklmnop", "ada@example.test", "secret detail"]) {
      assert.equal(text.includes(forbidden), false, `log must not contain ${forbidden}`);
    }
  };

  // 1. Brevo works: Gmail is never touched.
  {
    const brevo = brevoReturning(201);
    const gmail = fakeGmail("ok");
    const { lines, log } = logger();
    const provider = await sendLoginCodeEmail("ada@example.test", "482913", "sign-in", {
      environment: bothEnv,
      fetchImpl: brevo.impl,
      createGmailTransport: gmail.factory,
      log,
    });
    assert.equal(provider, "brevo");
    assert.equal(brevo.calls(), 1);
    assert.equal(gmail.sent.length, 0);
    assert.deepEqual(lines, ["Login code email sent via Brevo."]);
    assertNoSecretsLogged(lines);
  }

  // 2. Brevo quota/rate-limit errors (429, 402) and other failures fall back to Gmail.
  for (const status of [429, 402, 500]) {
    const brevo = brevoReturning(status);
    const gmail = fakeGmail("ok");
    const { lines, log } = logger();
    const provider = await sendLoginCodeEmail("ada@example.test", "482913", "pin-confirmation", {
      environment: bothEnv,
      fetchImpl: brevo.impl,
      createGmailTransport: gmail.factory,
      log,
    });
    assert.equal(provider, "gmail-smtp");
    assert.equal(gmail.sent.length, 1);
    const { config, message } = gmail.sent[0];
    assert.equal(config.user, "odogwu.shop@gmail.com");
    assert.equal(config.appPassword, "abcdefghijklmnop");
    assert.deepEqual(message.from, { name: "Odogwu", address: "odogwu.shop@gmail.com" });
    assert.equal(message.to, "ada@example.test");
    assert.equal(message.subject, "482913 is your Odogwu code");
    assert.match(String(message.html), /font-size:40px[^>]*>482913</);
    assert.match(lines[0], new RegExp(`Brevo failed \\(HTTP ${status}`));
    if (status !== 500) assert.match(lines[0], /quota or rate limit/);
    assert.equal(lines.at(-1), "Login code email sent via Gmail SMTP.");
    assertNoSecretsLogged(lines);
  }

  // 3. Brevo network error falls back too.
  {
    const gmail = fakeGmail("ok");
    const { log } = logger();
    const provider = await sendLoginCodeEmail("ada@example.test", "482913", "sign-in", {
      environment: bothEnv,
      fetchImpl: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
      createGmailTransport: gmail.factory,
      log,
    });
    assert.equal(provider, "gmail-smtp");
  }

  // 4. Brevo not configured: Gmail sends directly.
  {
    const gmail = fakeGmail("ok");
    let fetched = false;
    const { lines, log } = logger();
    const provider = await sendLoginCodeEmail("ada@example.test", "482913", "sign-in", {
      environment: gmailEnv,
      fetchImpl: (async () => {
        fetched = true;
        return new Response("{}", { status: 201 });
      }) as unknown as typeof fetch,
      createGmailTransport: gmail.factory,
      log,
    });
    assert.equal(provider, "gmail-smtp");
    assert.equal(fetched, false);
    assert.equal(lines.at(-1), "Login code email sent via Gmail SMTP.");
  }

  // 5. Both fail: EMAIL_SEND_FAILED (503), and logs stay free of secrets.
  {
    const gmail = fakeGmail("fail");
    const { lines, log } = logger();
    await assert.rejects(
      sendLoginCodeEmail("ada@example.test", "482913", "sign-in", {
        environment: bothEnv,
        fetchImpl: brevoReturning(429).impl,
        createGmailTransport: gmail.factory,
        log,
      }),
      /EMAIL_SEND_FAILED/,
    );
    assert.equal(gmail.sent.length, 1);
    assert.match(lines.at(-1)!, /Gmail SMTP failed \(EAUTH SMTP 535\)/);
    assertNoSecretsLogged(lines);
  }

  // 6. Brevo fails with no Gmail configured: EMAIL_SEND_FAILED, no fallback.
  {
    const { lines, log } = logger();
    await assert.rejects(
      sendLoginCodeEmail("ada@example.test", "482913", "sign-in", {
        environment: brevoEnv,
        fetchImpl: brevoReturning(402).impl,
        log,
      }),
      /EMAIL_SEND_FAILED/,
    );
    assert.equal(lines.some((line) => /falling back/.test(line)), false);
  }

  // 7. Neither configured: EMAIL_NOT_CONFIGURED (still 503).
  await assert.rejects(
    sendLoginCodeEmail("ada@example.test", "482913", "sign-in", { environment: {}, log: () => {} }),
    /EMAIL_NOT_CONFIGURED/,
  );
}

// --- Brevo daily send counter -----------------------------------------------
{
  assert.equal(readBrevoDailyLimit({}), 290);
  assert.equal(readBrevoDailyLimit({ BREVO_DAILY_LIMIT: "120" }), 120);
  for (const bad of ["0", "-5", "abc", "12.5", ""]) {
    assert.equal(readBrevoDailyLimit({ BREVO_DAILY_LIMIT: bad }), 290, bad);
  }

  const bothEnv = {
    BREVO_API_KEY: "brevo-secret-key",
    AUTH_EMAIL_FROM: "login@example.test",
    GMAIL_SMTP_USER: "odogwu.shop@gmail.com",
    GMAIL_SMTP_APP_PASSWORD: "abcdefghijklmnop",
  };
  const brevoOk = () => {
    let calls = 0;
    const impl = (async () => {
      calls += 1;
      return new Response("{}", { status: 201 });
    }) as unknown as typeof fetch;
    return { impl, calls: () => calls };
  };
  const gmailOk = () => {
    const sent: unknown[] = [];
    return {
      sent,
      factory: () => ({
        async sendMail(message: unknown) {
          sent.push(message);
          return {};
        },
      }),
    };
  };

  // Counter on the fake Firestore: per-UTC-day documents, transactional increment, TTL field.
  const { db, table } = createFakeDb();
  let now = Date.parse("2026-10-26T23:59:58.000Z");
  const usage = createBrevoDailyUsage(db as never, {
    environment: { BREVO_DAILY_LIMIT: "2" },
    now: () => now,
  });
  assert.equal(usage.limit, 2);
  assert.equal(await usage.readCount(), 0);

  const send = (environment: Record<string, string>, brevo = brevoOk(), gmail = gmailOk(), counter: BrevoDailyUsage = usage) =>
    sendLoginCodeEmail("ada@example.test", "482913", "sign-in", {
      environment,
      fetchImpl: brevo.impl,
      createGmailTransport: gmail.factory,
      brevoUsage: counter,
      log: () => {},
    }).then((provider) => ({ provider, brevo, gmail }));

  // Under the limit: Brevo sends and each success is counted.
  let result = await send(bothEnv);
  assert.equal(result.provider, "brevo");
  assert.equal(result.gmail.sent.length, 0);
  result = await send(bothEnv);
  assert.equal(result.provider, "brevo");
  const doc = table(BREVO_DAILY_USAGE_COLLECTION).get("brevo-2026-10-26")!;
  assert.equal(doc.count, 2);
  assert.equal(doc.day, "2026-10-26");
  assert.equal((doc.expiresAt as Date).toISOString(), "2026-10-28T00:00:00.000Z");

  // At the limit: straight to Gmail, Brevo not called, count unchanged.
  result = await send(bothEnv);
  assert.equal(result.provider, "gmail-smtp");
  assert.equal(result.brevo.calls(), 0);
  assert.equal(result.gmail.sent.length, 1);
  assert.equal(table(BREVO_DAILY_USAGE_COLLECTION).get("brevo-2026-10-26")!.count, 2);

  // At the limit but Gmail not configured: keep using Brevo.
  result = await send({ BREVO_API_KEY: "k", AUTH_EMAIL_FROM: "login@example.test" });
  assert.equal(result.provider, "brevo");
  assert.equal(result.brevo.calls(), 1);

  // Midnight UTC: a new day starts at zero and Brevo is used again.
  now = Date.parse("2026-10-27T00:00:01.000Z");
  assert.equal(await usage.readCount(), 0);
  result = await send(bothEnv);
  assert.equal(result.provider, "brevo");
  assert.equal(table(BREVO_DAILY_USAGE_COLLECTION).get("brevo-2026-10-27")!.count, 1);

  // Failed Brevo sends are not counted.
  const failing = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
  result = await send(bothEnv, { impl: failing, calls: () => 1 });
  assert.equal(result.provider, "gmail-smtp");
  assert.equal(table(BREVO_DAILY_USAGE_COLLECTION).get("brevo-2026-10-27")!.count, 1);

  // Counter read failure: still sends, trying Brevo first.
  const broken: BrevoDailyUsage = {
    limit: 290,
    readCount: async () => {
      throw new Error("firestore down");
    },
    recordSend: async () => {
      throw new Error("firestore down");
    },
  };
  result = await send(bothEnv, brevoOk(), gmailOk(), broken);
  assert.equal(result.provider, "brevo");
  assert.equal(result.brevo.calls(), 1);
  assert.equal(result.gmail.sent.length, 0);

  // At the limit and Gmail fails: Brevo is tried once as a last resort and counted.
  {
    const { db: lastDb, table: lastTable } = createFakeDb();
    const lastUsage = createBrevoDailyUsage(lastDb as never, {
      environment: { BREVO_DAILY_LIMIT: "1" },
      now: () => Date.parse("2026-10-26T12:00:00.000Z"),
    });
    await lastUsage.recordSend();
    const gmailFails = () => {
      const sent: unknown[] = [];
      return {
        sent,
        factory: () => ({
          async sendMail(message: unknown) {
            sent.push(message);
            throw Object.assign(new Error("boom"), { code: "ECONNECTION" });
          },
        }),
      };
    };
    const lines: string[] = [];
    const brevo = brevoOk();
    const gmail = gmailFails();
    const provider = await sendLoginCodeEmail("ada@example.test", "482913", "sign-in", {
      environment: bothEnv,
      fetchImpl: brevo.impl,
      createGmailTransport: gmail.factory,
      brevoUsage: lastUsage,
      log: (line) => lines.push(line),
    });
    assert.equal(provider, "brevo");
    assert.equal(gmail.sent.length, 1, "Gmail is tried first at the limit");
    assert.equal(brevo.calls(), 1, "Brevo is tried exactly once as the last resort");
    assert.equal(lastTable(BREVO_DAILY_USAGE_COLLECTION).get("brevo-2026-10-26")!.count, 2);
    assert.ok(lines.some((line) => /last resort/.test(line)));
    assert.equal(lines.join("\n").includes("482913"), false);

    // Both fail: the usual send-failed error, Brevo still tried only once, nothing counted.
    let brevoCalls = 0;
    await assert.rejects(
      sendLoginCodeEmail("ada@example.test", "482913", "sign-in", {
        environment: bothEnv,
        fetchImpl: (async () => {
          brevoCalls += 1;
          return new Response("{}", { status: 402 });
        }) as unknown as typeof fetch,
        createGmailTransport: gmailFails().factory,
        brevoUsage: lastUsage,
        log: () => {},
      }),
      /EMAIL_SEND_FAILED/,
    );
    assert.equal(brevoCalls, 1);
    assert.equal(lastTable(BREVO_DAILY_USAGE_COLLECTION).get("brevo-2026-10-26")!.count, 2);

    // Below the limit, a Gmail failure after a Brevo failure does not retry Brevo.
    let belowCalls = 0;
    await assert.rejects(
      sendLoginCodeEmail("ada@example.test", "482913", "sign-in", {
        environment: bothEnv,
        fetchImpl: (async () => {
          belowCalls += 1;
          return new Response("{}", { status: 500 });
        }) as unknown as typeof fetch,
        createGmailTransport: gmailFails().factory,
        log: () => {},
      }),
      /EMAIL_SEND_FAILED/,
    );
    assert.equal(belowCalls, 1);
  }

  // Concurrent successful sends are all counted (transactional increment).
  await Promise.all(Array.from({ length: 5 }, () => usage.recordSend()));
  assert.equal(table(BREVO_DAILY_USAGE_COLLECTION).get("brevo-2026-10-27")!.count, 6);
}

// --- Completing a code sign-in ---------------------------------------------
{
  // New address: the account is created, the email counts as proven, and
  // older unowned orders are linked.
  const { db, table, fullScans } = createFakeDb();
  const { auth, byUid } = createFakeAuth();
  table("orders").set("old-order", { customer: { email: "new.person@gmail.com" } });
  const created = await completeEmailCodeSignIn(db, auth, {
    email: "New.Person@gmail.com",
    name: "New Person",
  });
  assert.equal(created.created, true);
  assert.equal(created.customToken, "custom-token:pin-user-1");
  assert.equal(created.customer.name, "New Person");
  assert.equal("emailProvenAt" in created.customer, false);
  const doc = table("customers").get("newperson@gmail.com")!;
  assert.equal(doc.method, "email-code");
  assert.equal(typeof doc.emailProvenAt, "string");
  assert.equal(doc.passcodeHash, undefined);
  assert.equal(table("orders").get("old-order")!.ownerUid, "pin-user-1");
  assert.equal(byUid.get("pin-user-1")!.customClaims.admin, false);
  assert.deepEqual(fullScans, []);
}

{
  // Existing PIN customer switches to codes: same account, PIN untouched.
  const { db, table } = createFakeDb();
  const { auth } = createFakeAuth();
  table("customers").set("ada@example.test", {
    canonicalEmail: "ada@example.test",
    email: "ada@example.test",
    name: "Ada",
    method: "email",
    passcodeHash: hashPin("482619", "0123456789abcdef0123456789abcdef"),
  });
  const pinFirst = await loginWithPin(db, auth, "ada@example.test", "482619");
  const viaCode = await completeEmailCodeSignIn(db, auth, { email: "ada@example.test", name: "Ignored" });
  assert.equal(viaCode.created, false);
  assert.equal(viaCode.customToken, pinFirst.customToken, "same Firebase account");
  assert.equal(viaCode.customer.name, "Ada", "existing name kept");
  assert.match(table("customers").get("ada@example.test")!.passcodeHash, /^scrypt\$/);
}

{
  const { db } = createFakeDb();
  const { auth } = createFakeAuth();
  await assert.rejects(
    completeEmailCodeSignIn(db, auth, { email: ALLOWED_ADMIN_EMAILS[0] }),
    /ADMIN_GOOGLE_REQUIRED/,
    "administrators stay Google-only",
  );
}

// --- HTTP surface ------------------------------------------------------------
{
  assert.equal(getAuthRoute({ headers: {}, query: { route: EMAIL_CODE_REQUEST_ROUTE } }), EMAIL_CODE_REQUEST_ROUTE);
  assert.equal(
    getAuthRoute({ headers: {}, url: "/api/auth/pin-login?route=email-code-verify" }),
    EMAIL_CODE_VERIFY_ROUTE,
  );
  assert.equal(getAuthRoute({ headers: {}, url: "/api/auth/email-code/request" }), EMAIL_CODE_REQUEST_ROUTE);
  assert.equal(getAuthRoute({ headers: {}, url: "/api/auth/pin-login" }), null);

  const createResponse = () => {
    const state: { status: number; body: unknown; headers: Record<string, string> } = {
      status: 200,
      body: undefined,
      headers: {},
    };
    const response = {
      status(code: number) {
        state.status = code;
        return response;
      },
      setHeader(name: string, value: string) {
        state.headers[name.toLowerCase()] = value;
        return response;
      },
      json(body: unknown) {
        state.body = body;
        return body;
      },
    };
    return { state, response };
  };
  for (const handler of [handleEmailCodeRequest, handleEmailCodeVerify]) {
    const wrongMethod = createResponse();
    await handler({ method: "GET", headers: {} }, wrongMethod.response);
    assert.equal(wrongMethod.state.status, 405);
    const badEmail = createResponse();
    await handler({ method: "POST", headers: {}, body: { email: "nope", code: "123456" } }, badEmail.response);
    assert.equal(badEmail.state.status, 400);
    assert.deepEqual(badEmail.state.body, { error: "Enter a valid email address.", code: "INVALID_EMAIL" });
    assert.equal(badEmail.state.headers["cache-control"], "no-store");
  }

  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const rewrites = vercel.rewrites as Array<{ source: string; destination: string }>;
  assert.ok(rewrites.some((r) => r.source === "/api/auth/email-code/request" && r.destination === "/api/auth/pin-login?route=email-code-request"));
  assert.ok(rewrites.some((r) => r.source === "/api/auth/email-code/verify" && r.destination === "/api/auth/pin-login?route=email-code-verify"));

  // Secrets stay server-side.
  for (const file of ["src/components/LoginView.tsx", "src/services/firebaseCustomerAuth.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.equal(/BREVO|brevoEmail|AUTH_EMAIL_FROM|GMAIL_SMTP|nodemailer/.test(source), false, file);
  }
}

console.log("PASS: email-code sign-in (hashing, expiry, single use, tries, cooldown, Brevo + Gmail fallback, Brevo daily counter, routing)");
