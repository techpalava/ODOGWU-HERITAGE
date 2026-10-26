import assert from "node:assert/strict";
import type { DecodedIdToken } from "firebase-admin/auth";
import {
  ALLOWED_ADMIN_EMAILS,
  getAllowedAdminEmails,
  isAllowedAdminEmail,
} from "./src/server/adminAllowlist";
import {
  AUTH_RATE_LIMIT_COLLECTION,
  AuthRateLimitError,
  consumeAuthRateLimit,
  getClientIp,
  hashRateLimitKey,
} from "./src/server/authRateLimit";
import { authErrorResponse } from "./src/server/authHttp";
import {
  bootstrapFirebaseCustomer,
  hashPin,
  loginWithPin,
} from "./src/server/customerAuth";

import {
  createFakeAuth,
  createFakeDb,
} from "./testing/authFirestoreFake";

const token = (uid: string, email: string) =>
  ({ uid, email, firebase: { sign_in_provider: "google.com" } }) as unknown as DecodedIdToken;

// --- Admin allowlist: env var with fallback --------------------------------
{
  assert.deepEqual(getAllowedAdminEmails({}), ALLOWED_ADMIN_EMAILS);
  assert.deepEqual(getAllowedAdminEmails({ ADMIN_EMAILS: "  " }), ALLOWED_ADMIN_EMAILS);
  const env = { ADMIN_EMAILS: "Owner.Example+x@gmail.com, staff@heritage.test" };
  assert.deepEqual(getAllowedAdminEmails(env), ["ownerexample@gmail.com", "staff@heritage.test"]);
  assert.equal(isAllowedAdminEmail("ownerexample@googlemail.com", env), true);
  assert.equal(isAllowedAdminEmail(ALLOWED_ADMIN_EMAILS[0], env), false);
  assert.equal(isAllowedAdminEmail(ALLOWED_ADMIN_EMAILS[0]), true);
}

// --- Rate limiter ------------------------------------------------------------
{
  const { db, table } = createFakeDb();
  let now = 1_000_000;
  const rule = { bucket: "test-bucket", limit: 3, windowMs: 60_000 };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await consumeAuthRateLimit(db, rule, "Ada@Example.test", () => now);
  }
  await assert.rejects(
    consumeAuthRateLimit(db, rule, "Ada@Example.test", () => now + 10_000),
    (error: unknown) =>
      error instanceof AuthRateLimitError &&
      error.message === "RATE_LIMITED" &&
      error.retryAfterSeconds === 50,
  );
  // Another key has its own window.
  await consumeAuthRateLimit(db, rule, "someone@else.test", () => now);
  // Window expiry resets the count.
  now += 60_000;
  await consumeAuthRateLimit(db, rule, "Ada@Example.test", () => now);
  const ids = [...table(AUTH_RATE_LIMIT_COLLECTION).keys()];
  assert.ok(ids.includes(hashRateLimitKey("test-bucket", "Ada@Example.test")));
  for (const id of ids) {
    assert.match(id, /^[0-9a-f]{64}$/, "rate-limit keys must be hashed");
  }
  for (const data of table(AUTH_RATE_LIMIT_COLLECTION).values()) {
    assert.equal(JSON.stringify(data).includes("@"), false);
    assert.ok(data.expiresAt instanceof Date);
  }
}

{
  // Concurrent attempts cannot exceed the limit.
  const { db } = createFakeDb();
  const rule = { bucket: "burst", limit: 5, windowMs: 60_000 };
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, () => consumeAuthRateLimit(db, rule, "1.2.3.4")),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 5);
}

assert.equal(
  getClientIp({ headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }),
  "203.0.113.9",
);
assert.equal(getClientIp({ headers: { "x-real-ip": "198.51.100.2" } }), "198.51.100.2");
assert.equal(getClientIp({ headers: {} }), "unknown");
assert.deepEqual(authErrorResponse(new AuthRateLimitError(30)), {
  status: 429,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

// --- Unknown identifiers never read whole collections ---------------------
{
  const { db, fullScans } = createFakeDb();
  const { auth } = createFakeAuth();
  for (const identifier of ["nobody@example.test", "+234 801 234 5678"]) {
    await assert.rejects(
      loginWithPin(db, auth, identifier, "482619"),
      (error: unknown) => error instanceof Error && error.message === "INVALID_CREDENTIALS",
    );
  }
  assert.deepEqual(fullScans, []);
}

{
  // Legacy documents without canonicalEmail are still found by indexed email.
  const { db, table } = createFakeDb();
  const { auth } = createFakeAuth();
  table("customers").set("legacy-doc", {
    email: "ada@example.test",
    name: "Ada",
    passcode: "4826",
  });
  const result = await loginWithPin(db, auth, "ADA@example.test", "4826");
  assert.equal(result.customToken, "custom-token:pin-user-1");
  const stored = table("customers").get("legacy-doc")!;
  assert.equal(stored.passcode, undefined, "plaintext PIN is upgraded");
  assert.match(stored.passcodeHash, /^scrypt\$/);
}

// --- Transactional lockout --------------------------------------------------
{
  const { db, table } = createFakeDb();
  const { auth } = createFakeAuth();
  table("customers").set("ada@example.test", {
    canonicalEmail: "ada@example.test",
    email: "ada@example.test",
    name: "Ada",
    passcodeHash: hashPin("482619", "0123456789abcdef0123456789abcdef"),
  });
  const attempts = await Promise.allSettled(
    Array.from({ length: 8 }, () => loginWithPin(db, auth, "ada@example.test", "000000")),
  );
  const messages = attempts.map((attempt) =>
    attempt.status === "rejected" ? (attempt.reason as Error).message : "ok",
  );
  assert.equal(messages.filter((message) => message === "INVALID_CREDENTIALS").length, 4);
  assert.equal(messages.filter((message) => message === "PIN_LOCKED").length, 4);
  assert.equal(table("customers").get("ada@example.test")!.authFailedAttempts, 5);
  await assert.rejects(
    loginWithPin(db, auth, "ada@example.test", "482619"),
    (error: unknown) => error instanceof Error && error.message === "PIN_LOCKED",
    "a locked account rejects even the correct PIN",
  );
}

// --- PIN login never links unowned orders ------------------------------------
{
  const { db, table } = createFakeDb();
  const { auth } = createFakeAuth();
  table("customers").set("victim@example.test", {
    canonicalEmail: "victim@example.test",
    email: "victim@example.test",
    name: "Attacker",
    passcodeHash: hashPin("482619", "0123456789abcdef0123456789abcdef"),
  });
  table("orders").set("legacy-order", { customer: { email: "victim@example.test" } });
  await loginWithPin(db, auth, "victim@example.test", "482619");
  assert.equal(table("orders").get("legacy-order")!.ownerUid, undefined);
}

// --- Bootstrap: verified email links orders; unverified does not -----------
{
  const { db, table, fullScans } = createFakeDb();
  const { auth } = createFakeAuth([
    {
      uid: "google-uid",
      email: "ada.lovelace@gmail.com",
      displayName: "Ada",
      emailVerified: true,
      providerData: [{ providerId: "google.com", email: "ada.lovelace@gmail.com" }],
      customClaims: {},
    },
    {
      uid: "unverified-uid",
      email: "bob@example.test",
      displayName: "Bob",
      emailVerified: false,
      providerData: [],
      customClaims: {},
    },
  ]);
  // Old orders may hold the dotted or the canonical Gmail form.
  table("orders").set("ada-order", { customer: { email: "ada.lovelace@gmail.com" } });
  table("orders").set("ada-order-canonical", { customer: { email: "adalovelace@gmail.com" } });
  table("orders").set("ada-owned", { ownerUid: "someone", customer: { email: "adalovelace@gmail.com" } });
  table("orders").set("bob-order", { customer: { email: "bob@example.test" } });

  await bootstrapFirebaseCustomer(db, auth, token("google-uid", "ada.lovelace@gmail.com"));
  assert.equal(table("orders").get("ada-order")!.ownerUid, "google-uid");
  assert.equal(table("orders").get("ada-order-canonical")!.ownerUid, "google-uid");
  assert.equal(table("orders").get("ada-owned")!.ownerUid, "someone");

  await bootstrapFirebaseCustomer(db, auth, token("unverified-uid", "bob@example.test"));
  assert.equal(table("orders").get("bob-order")!.ownerUid, undefined);
  assert.deepEqual(fullScans, []);
}

// --- Pre-registration takeover: PIN and Google both keep working, but an
// unproven PIN needs a one-time emailed code once the mailbox is proven ----
{
  const { db, table } = createFakeDb();
  const { auth } = createFakeAuth([
    {
      uid: "pin-uid",
      email: "victim@example.test",
      displayName: "Victim",
      emailVerified: true,
      providerData: [{ providerId: "google.com", email: "victim@example.test" }],
      customClaims: {},
    },
  ]);
  table("customers").set("victim@example.test", {
    ownerUid: "pin-uid",
    canonicalEmail: "victim@example.test",
    email: "victim@example.test",
    name: "Someone",
    method: "email",
    passcodeHash: hashPin("482619", "0123456789abcdef0123456789abcdef"),
  });

  // Before the mailbox is proven, the PIN works on its own (unchanged).
  const before = await loginWithPin(db, auth, "victim@example.test", "482619");
  assert.equal(before.customToken, "custom-token:pin-uid");

  // Verified Google sign-in proves the mailbox; the PIN is NOT disabled.
  const result = await bootstrapFirebaseCustomer(db, auth, token("pin-uid", "victim@example.test"));
  const stored = table("customers").get("victim@example.test")!;
  assert.equal(typeof stored.emailProvenAt, "string");
  assert.match(stored.passcodeHash, /^scrypt\$/);
  assert.equal("emailProvenAt" in result.customer, false, "not exposed to the client");
  assert.equal("passcodeHash" in result.customer, false);

  // Now the PIN alone is not enough: a code is emailed instead of a token.
  const sent: string[] = [];
  await assert.rejects(
    loginWithPin(db, auth, "victim@example.test", "482619", {
      sendConfirmationCode: async (email) => {
        sent.push(email);
      },
    }),
    (error: unknown) =>
      error instanceof Error && error.message === "PIN_EMAIL_CONFIRMATION_REQUIRED",
  );
  assert.deepEqual(sent, ["victim@example.test"]);

  // A wrong code is rejected and the PIN stays unconfirmed.
  await assert.rejects(
    loginWithPin(db, auth, "victim@example.test", "482619", {
      emailCode: "000000",
      verifyConfirmationCode: async () => {
        throw new Error("INVALID_CODE");
      },
    }),
    (error: unknown) => error instanceof Error && error.message === "INVALID_CODE",
  );
  assert.equal(table("customers").get("victim@example.test")!.pinProvenAt, undefined);

  // PIN + correct code signs in once and marks the PIN as proven ...
  const confirmed = await loginWithPin(db, auth, "victim@example.test", "482619", {
    emailCode: "123456",
    verifyConfirmationCode: async (email, code) => {
      assert.equal(email, "victim@example.test");
      assert.equal(code, "123456");
    },
  });
  assert.equal(confirmed.customToken, "custom-token:pin-uid");
  assert.equal(typeof table("customers").get("victim@example.test")!.pinProvenAt, "string");

  // ... after which the PIN works on its own again, alongside Google.
  const after = await loginWithPin(db, auth, "victim@example.test", "482619");
  assert.equal(after.customToken, "custom-token:pin-uid");
}

// --- Admin requires verified email + Google identity ------------------------
{
  const adminEmail = ALLOWED_ADMIN_EMAILS[0];
  const { db } = createFakeDb();
  const { auth, byUid } = createFakeAuth([
    {
      uid: "admin-google",
      email: adminEmail,
      displayName: "Admin",
      emailVerified: true,
      providerData: [{ providerId: "google.com", email: adminEmail }],
      customClaims: {},
    },
    {
      uid: "admin-unverified",
      email: adminEmail.replace("@", "+x@"),
      displayName: "Impostor",
      emailVerified: false,
      providerData: [{ providerId: "password", email: adminEmail }],
      customClaims: { admin: true },
    },
    {
      uid: "admin-password-verified",
      email: adminEmail,
      displayName: "Password",
      emailVerified: true,
      providerData: [{ providerId: "password", email: adminEmail }],
      customClaims: {},
    },
  ]);
  const good = await bootstrapFirebaseCustomer(db, auth, token("admin-google", adminEmail));
  assert.equal(good.admin, true);
  assert.equal(byUid.get("admin-google")!.customClaims.admin, true);

  const unverified = await bootstrapFirebaseCustomer(db, auth, token("admin-unverified", adminEmail));
  assert.equal(unverified.admin, false);
  assert.equal(byUid.get("admin-unverified")!.customClaims.admin, false, "stale admin claim is removed");

  const passwordOnly = await bootstrapFirebaseCustomer(db, auth, token("admin-password-verified", adminEmail));
  assert.equal(passwordOnly.admin, false);
}

console.log("PASS: auth hardening (rate limits, lockout, scans, order linking, admin)");
