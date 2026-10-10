import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { ALLOWED_ADMIN_EMAILS } from "./src/server/adminAllowlist";
import { authErrorResponse } from "./src/server/authHttp";
import {
  hashPin,
  loginWithPin,
  registerWithPin,
  validateLoginPin,
  validateRegisterPin,
} from "./src/server/customerAuth";

type StoredUser = {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  customClaims: Record<string, unknown>;
};

type CreateUserInput = {
  email: string;
  displayName: string;
  emailVerified?: boolean;
};

const createHarness = (options?: { failCreateAsExisting?: boolean }) => {
  const users = new Map<string, StoredUser>();
  const customers = new Map<string, Record<string, unknown>>();
  const createUserCalls: CreateUserInput[] = [];
  const customTokens: Array<{ uid: string; claims?: object }> = [];
  let created = 0;

  const userNotFound = () => {
    const error = new Error("missing") as Error & { code: string };
    error.code = "auth/user-not-found";
    return error;
  };

  const auth = {
    async getUserByEmail(email: string) {
      const user = [...users.values()].find((candidate) => candidate.email === email);
      if (!user) throw userNotFound();
      return user;
    },
    async getUser(uid: string) {
      const user = users.get(uid);
      if (!user) throw new Error("missing user");
      return user;
    },
    async createUser(input: CreateUserInput) {
      createUserCalls.push(input);
      if (
        options?.failCreateAsExisting ||
        [...users.values()].some((user) => user.email === input.email)
      ) {
        const error = new Error("exists") as Error & { code: string };
        error.code = "auth/email-already-exists";
        throw error;
      }
      created += 1;
      const user: StoredUser = {
        uid: `pin-user-${created}`,
        email: input.email,
        displayName: input.displayName,
        emailVerified: input.emailVerified === true,
        customClaims: {},
      };
      users.set(user.uid, user);
      return user;
    },
    async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
      const user = users.get(uid);
      if (!user) throw new Error("missing user");
      user.customClaims = claims;
    },
    async createCustomToken(uid: string, claims?: object) {
      customTokens.push({ uid, claims });
      return `custom-token:${uid}`;
    },
  };

  const snapshot = (id: string) => ({
    id,
    data: () => customers.get(id),
    ref: {
      async set(value: Record<string, unknown>, setOptions?: { merge?: boolean }) {
        const current = customers.get(id) || {};
        customers.set(id, setOptions?.merge ? { ...current, ...value } : value);
      },
      async get() {
        return { data: () => customers.get(id) };
      },
    },
  });

  const db = {
    batch() {
      return {
        set() {
          return undefined;
        },
        async commit() {
          return undefined;
        },
      };
    },
    collection(name: string) {
      if (name === "orders") {
        return {
          async get() {
            return { docs: [] };
          },
        };
      }
      if (name !== "customers") throw new Error(`unexpected collection ${name}`);
      return {
        doc(id: string) {
          return {
            async set(value: Record<string, unknown>) {
              customers.set(id, value);
            },
            async get() {
              return { data: () => customers.get(id) };
            },
          };
        },
        where(field: string, op: string, value: unknown) {
          if (op !== "==") throw new Error(`unexpected operator ${op}`);
          const docs = [...customers.entries()]
            .filter(([, data]) => data[field] === value)
            .map(([id]) => snapshot(id));
          return {
            limit() {
              return {
                async get() {
                  return { empty: docs.length === 0, docs: docs.slice(0, 1) };
                },
              };
            },
          };
        },
        async get() {
          return {
            docs: [...customers.keys()].map((id) => snapshot(id)),
          };
        },
      };
    },
  };

  return {
    auth,
    db,
    users,
    customers,
    createUserCalls,
    customTokens,
  };
};

const customerAuthSource = readFileSync("src/server/customerAuth.ts", "utf8");
assert.equal(
  customerAuthSource.includes("emailVerified: true"),
  false,
  "PIN registration and login must not create a verified email",
);
assert.match(customerAuthSource, /emailVerified: false/);

for (const rulesPath of ["firestore.rules", "storage.rules"]) {
  const rules = readFileSync(rulesPath, "utf8");
  assert.equal(rules.includes("email_verified"), false, rulesPath);
  assert.equal(rules.includes("emailVerified"), false, rulesPath);
}

const listServerSources = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listServerSources(fullPath));
      continue;
    }
    if (entry.name.endsWith(".ts")) files.push(fullPath);
  }
  return files;
};

for (const file of listServerSources("src/server")) {
  if (file.endsWith(`${path.sep}customerAuth.ts`)) continue;
  const source = readFileSync(file, "utf8");
  const relative = file.replace(/\\/g, "/");
  assert.equal(source.includes("email_verified"), false, relative);
  assert.equal(source.includes("emailVerified"), false, relative);
}

assert.equal(validateRegisterPin("482619"), true);
assert.equal(validateRegisterPin("4826"), false);
assert.equal(validateLoginPin("4826"), true);
assert.equal(validateLoginPin("482619"), true);

{
  const harness = createHarness();
  const result = await registerWithPin(
    harness.db as unknown as Firestore,
    harness.auth as unknown as Auth,
    {
      name: "Ada Lovelace",
      email: "Ada.Lovelace+shop@gmail.com",
      pin: "482619",
    },
  );
  assert.equal(result.customToken, "custom-token:pin-user-1");
  assert.equal(harness.createUserCalls.length, 1);
  assert.equal(harness.createUserCalls[0]?.email, "adalovelace@gmail.com");
  assert.equal(harness.createUserCalls[0]?.emailVerified, false);
  assert.equal(harness.users.get("pin-user-1")?.emailVerified, false);
  assert.equal(
    harness.customers.get("adalovelace@gmail.com")?.ownerUid,
    "pin-user-1",
  );
  assert.equal(harness.customTokens.length, 1);
}

{
  const harness = createHarness();
  harness.users.set("google-user", {
    uid: "google-user",
    email: "adalovelace@gmail.com",
    displayName: "Existing",
    emailVerified: true,
    customClaims: { admin: false },
  });
  await assert.rejects(
    registerWithPin(harness.db as unknown as Firestore, harness.auth as unknown as Auth, {
      name: "Ada Lovelace",
      email: "Ada.Lovelace+shop@gmail.com",
      pin: "482619",
    }),
    (error: unknown) =>
      error instanceof Error && error.message === "EMAIL_ALREADY_REGISTERED",
  );
  assert.equal(harness.createUserCalls.length, 0);
  assert.equal(harness.customTokens.length, 0);
  assert.equal(harness.customers.size, 0);
  assert.equal(harness.users.get("google-user")?.emailVerified, true);
}

{
  const harness = createHarness();
  harness.users.set("google-user", {
    uid: "google-user",
    email: "ada@example.test",
    displayName: "Existing",
    emailVerified: true,
    customClaims: { admin: false },
  });
  await assert.rejects(
    registerWithPin(harness.db as unknown as Firestore, harness.auth as unknown as Auth, {
      name: "Ada Lovelace",
      email: "ada@example.test",
      pin: "482619",
    }),
    (error: unknown) =>
      error instanceof Error && error.message === "EMAIL_ALREADY_REGISTERED",
  );
  assert.equal(harness.createUserCalls.length, 0);
  assert.equal(harness.customTokens.length, 0);
  assert.equal(harness.customers.size, 0);
  assert.equal(harness.users.get("google-user")?.emailVerified, true);
  assert.equal(harness.users.size, 1);
}

{
  const harness = createHarness({ failCreateAsExisting: true });
  await assert.rejects(
    registerWithPin(harness.db as unknown as Firestore, harness.auth as unknown as Auth, {
      name: "Ada Lovelace",
      email: "ada@example.test",
      pin: "482619",
    }),
    (error: unknown) =>
      error instanceof Error && error.message === "EMAIL_ALREADY_REGISTERED",
  );
  assert.equal(harness.customTokens.length, 0);
  assert.equal(harness.customers.size, 0);
  assert.equal(harness.users.size, 0);
}

{
  const harness = createHarness();
  harness.customers.set("ada@example.test", {
    canonicalEmail: "ada@example.test",
    email: "ada@example.test",
    name: "Ada Lovelace",
    phone: "",
  });
  await assert.rejects(
    registerWithPin(harness.db as unknown as Firestore, harness.auth as unknown as Auth, {
      name: "Ada Lovelace",
      email: "ada@example.test",
      pin: "482619",
    }),
    (error: unknown) => error instanceof Error && error.message === "ACCOUNT_EXISTS",
  );
  assert.equal(harness.createUserCalls.length, 0);
  assert.equal(harness.customTokens.length, 0);
}

{
  const harness = createHarness();
  const allowlistedEmail = ALLOWED_ADMIN_EMAILS[0];
  await assert.rejects(
    registerWithPin(harness.db as unknown as Firestore, harness.auth as unknown as Auth, {
      name: "Allowlisted Admin",
      email: allowlistedEmail,
      pin: "482619",
    }),
    (error: unknown) =>
      error instanceof Error && error.message === "ADMIN_GOOGLE_REQUIRED",
  );
  assert.equal(harness.createUserCalls.length, 0);
  assert.equal(harness.customTokens.length, 0);
  assert.equal(harness.customers.size, 0);
  assert.equal(harness.users.size, 0);
}

{
  const harness = createHarness();
  await assert.rejects(
    registerWithPin(harness.db as unknown as Firestore, harness.auth as unknown as Auth, {
      name: "Ada Lovelace",
      email: "ada@example.test",
      pin: "4826",
    }),
    (error: unknown) =>
      error instanceof Error && error.message === "INVALID_REGISTRATION",
  );
  assert.equal(harness.createUserCalls.length, 0);
  assert.equal(harness.customTokens.length, 0);
}

{
  const harness = createHarness();
  harness.customers.set("ada@example.test", {
    canonicalEmail: "ada@example.test",
    email: "ada@example.test",
    name: "Ada Lovelace",
    phone: "",
    passcodeHash: hashPin("4826", "0123456789abcdef0123456789abcdef"),
    role: "Customer",
  });
  const result = await loginWithPin(
    harness.db as unknown as Firestore,
    harness.auth as unknown as Auth,
    "ada@example.test",
    "4826",
  );
  assert.equal(result.customToken, "custom-token:pin-user-1");
  assert.equal(harness.createUserCalls.length, 1);
  assert.equal(harness.createUserCalls[0]?.emailVerified, false);
  assert.equal(harness.users.get("pin-user-1")?.emailVerified, false);
}

{
  const harness = createHarness();
  harness.users.set("google-user", {
    uid: "google-user",
    email: "ada@example.test",
    displayName: "Existing",
    emailVerified: true,
    customClaims: {},
  });
  harness.customers.set("ada@example.test", {
    canonicalEmail: "ada@example.test",
    email: "ada@example.test",
    name: "Ada Lovelace",
    phone: "",
    passcodeHash: hashPin("482619", "0123456789abcdef0123456789abcdef"),
    role: "Customer",
  });
  const result = await loginWithPin(
    harness.db as unknown as Firestore,
    harness.auth as unknown as Auth,
    "ada@example.test",
    "482619",
  );
  assert.equal(result.customToken, "custom-token:google-user");
  assert.equal(harness.createUserCalls.length, 0);
  assert.equal(harness.users.get("google-user")?.emailVerified, true);
}

const existingFirebaseUser = authErrorResponse(
  new Error("EMAIL_ALREADY_REGISTERED"),
);
assert.deepEqual(existingFirebaseUser, {
  status: 409,
  message:
    "This email is already registered. Sign in with Google or your existing PIN.",
});
const adminGoogle = authErrorResponse(new Error("ADMIN_GOOGLE_REQUIRED"));
assert.equal(adminGoogle.status, 403);
assert.equal(
  adminGoogle.message,
  "Administrator accounts must sign in with Google.",
);

console.log("PASS: PIN registration leaves email unverified and rejects an existing Firebase user");
