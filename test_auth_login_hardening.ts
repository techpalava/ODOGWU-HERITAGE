import assert from "node:assert/strict";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
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

// ---------------------------------------------------------------------------
// In-memory Firestore fake. Whole-collection reads of `customers` or `orders`
// throw, so any reintroduced full scan fails this test.
// ---------------------------------------------------------------------------
type Data = Record<string, any>;
const DELETE = Symbol("delete");

function readPath(data: Data, field: string) {
  return field.split(".").reduce<any>((value, key) => value?.[key], data);
}

function applyMerge(current: Data, value: Data): Data {
  const next = { ...current };
  for (const [key, entry] of Object.entries(value)) {
    if (
      entry &&
      typeof entry === "object" &&
      (entry as { constructor?: { name?: string } }).constructor?.name ===
        "DeleteTransform"
    ) {
      delete next[key];
    } else if (entry === DELETE) {
      delete next[key];
    } else {
      next[key] = entry;
    }
  }
  return next;
}

function createFakeDb() {
  const store = new Map<string, Map<string, Data>>();
  const fullScans: string[] = [];
  let transactionChain: Promise<unknown> = Promise.resolve();
  const table = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };

  const reference = (collection: string, id: string) => ({
    id,
    path: `${collection}/${id}`,
    async get() {
      const data = table(collection).get(id);
      return { id, exists: data !== undefined, data: () => data, ref: reference(collection, id) };
    },
    async set(value: Data, options?: { merge?: boolean }) {
      const current = table(collection).get(id) || {};
      table(collection).set(id, options?.merge ? applyMerge(current, value) : applyMerge({}, value));
    },
  });

  const query = (collection: string, filters: Array<[string, string, unknown]>, max?: number) => ({
    where(field: string, op: string, value: unknown) {
      return query(collection, [...filters, [field, op, value]], max);
    },
    limit(count: number) {
      return query(collection, filters, count);
    },
    async get() {
      if (filters.length === 0 && (collection === "customers" || collection === "orders")) {
        fullScans.push(collection);
        throw new Error(`FULL_SCAN:${collection}`);
      }
      let docs = [...table(collection).entries()]
        .filter(([, data]) =>
          filters.every(([field, op, value]) => {
            const actual = readPath(data, field);
            if (op === "==") return actual === value;
            if (op === ">=") return typeof actual === "string" && actual >= (value as string);
            throw new Error(`unsupported op ${op}`);
          }),
        )
        .map(([id]) => ({ id, data: () => table(collection).get(id), ref: reference(collection, id) }));
      if (max !== undefined) docs = docs.slice(0, max);
      return { empty: docs.length === 0, docs };
    },
  });

  const db = {
    collection(name: string) {
      return {
        doc: (id: string) => reference(name, id),
        ...query(name, []),
      };
    },
    batch() {
      const writes: Array<() => Promise<void>> = [];
      return {
        set(ref: ReturnType<typeof reference>, value: Data, options?: { merge?: boolean }) {
          writes.push(() => ref.set(value, options));
        },
        async commit() {
          for (const write of writes) await write();
        },
      };
    },
    // Serialized like Firestore's optimistic transactions under contention.
    runTransaction<T>(update: (transaction: any) => Promise<T>): Promise<T> {
      const run = transactionChain.then(async () => {
        const writes: Array<() => Promise<void>> = [];
        const result = await update({
          get: (ref: ReturnType<typeof reference>) => ref.get(),
          set: (ref: ReturnType<typeof reference>, value: Data, options?: { merge?: boolean }) => {
            writes.push(() => ref.set(value, options));
          },
        });
        for (const write of writes) await write();
        return result;
      });
      transactionChain = run.catch(() => undefined);
      return run;
    },
  };
  return { db: db as unknown as Firestore, table, fullScans };
}

type FakeUser = {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  phoneNumber?: string;
  providerData: Array<{ providerId: string; email?: string }>;
  customClaims: Record<string, unknown>;
};

function createFakeAuth(users: FakeUser[] = []) {
  const byUid = new Map(users.map((user) => [user.uid, user]));
  let created = 0;
  const auth = {
    async getUser(uid: string) {
      const user = byUid.get(uid);
      if (!user) throw new Error("missing user");
      return user;
    },
    async getUserByEmail(email: string) {
      const user = [...byUid.values()].find((candidate) => candidate.email === email);
      if (!user) throw Object.assign(new Error("missing"), { code: "auth/user-not-found" });
      return user;
    },
    async createUser(input: { email: string; displayName: string; emailVerified?: boolean }) {
      created += 1;
      const user: FakeUser = {
        uid: `pin-user-${created}`,
        email: input.email,
        displayName: input.displayName,
        emailVerified: input.emailVerified === true,
        providerData: [],
        customClaims: {},
      };
      byUid.set(user.uid, user);
      return user;
    },
    async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
      byUid.get(uid)!.customClaims = claims;
    },
    async createCustomToken(uid: string) {
      return `custom-token:${uid}`;
    },
  };
  return { auth: auth as unknown as Auth, byUid };
}

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

// --- Pre-registration takeover: verified owner disables an unproven PIN ----
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
    name: "Attacker",
    method: "email",
    passcodeHash: hashPin("482619", "0123456789abcdef0123456789abcdef"),
  });
  const result = await bootstrapFirebaseCustomer(db, auth, token("pin-uid", "victim@example.test"));
  const stored = table("customers").get("victim@example.test")!;
  assert.equal(typeof stored.pinDisabledAt, "string");
  assert.match(stored.passcodeHash, /^scrypt\$/, "the hash is kept, not deleted");
  assert.equal("pinDisabledAt" in result.customer, false, "not exposed to the client");
  assert.equal("passcodeHash" in result.customer, false);
  await assert.rejects(
    loginWithPin(db, auth, "victim@example.test", "482619"),
    (error: unknown) => error instanceof Error && error.message === "INVALID_CREDENTIALS",
  );
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
