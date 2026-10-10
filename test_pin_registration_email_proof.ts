import assert from "node:assert/strict";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { registerWithPin } from "./src/server/customerAuth";

type StoredUser = {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  customClaims: Record<string, unknown>;
};

const createHarness = () => {
  const users = new Map<string, StoredUser>();
  let created = 0;
  const auth = {
    async getUserByEmail(email: string) {
      const user = [...users.values()].find((candidate) => candidate.email === email);
      if (!user) {
        const error = new Error("missing") as Error & { code: string };
        error.code = "auth/user-not-found";
        throw error;
      }
      return user;
    },
    async getUser(uid: string) {
      const user = users.get(uid);
      if (!user) throw new Error("missing user");
      return user;
    },
    async createUser(input: {
      email: string;
      displayName: string;
      emailVerified?: boolean;
    }) {
      if ([...users.values()].some((user) => user.email === input.email)) {
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
    async createCustomToken(uid: string) {
      return `custom-token:${uid}`;
    },
  };
  const customers = new Map<string, Record<string, unknown>>();
  const db = {
    collection(name: string) {
      if (name !== "customers") throw new Error(`unexpected collection ${name}`);
      return {
        doc(id: string) {
          return {
            async set(value: Record<string, unknown>) {
              customers.set(id, value);
            },
          };
        },
        where() {
          return {
            limit() {
              return {
                async get() {
                  return { empty: true, docs: [] };
                },
              };
            },
          };
        },
        async get() {
          return { docs: [] };
        },
      };
    },
  };
  return { auth, db, users, customers };
};

{
  const { auth, db, users, customers } = createHarness();
  const result = await registerWithPin(
    db as unknown as Firestore,
    auth as unknown as Auth,
    { name: "Ada Lovelace", email: "Ada@Example.test", pin: "482619" },
  );
  assert.equal(result.customToken, "custom-token:pin-user-1");
  assert.equal(users.size, 1);
  const user = [...users.values()][0];
  assert.equal(user?.email, "ada@example.test");
  assert.equal(user?.emailVerified, false);
  assert.equal(customers.get("ada@example.test")?.ownerUid, user?.uid);
}

{
  const { auth, db, users } = createHarness();
  users.set("google-user", {
    uid: "google-user",
    email: "ada@example.test",
    displayName: "Existing",
    emailVerified: true,
    customClaims: {},
  });
  await assert.rejects(
    registerWithPin(db as unknown as Firestore, auth as unknown as Auth, {
      name: "Ada Lovelace",
      email: "ada@example.test",
      pin: "482619",
    }),
    (error: unknown) => error instanceof Error && error.message === "ACCOUNT_EXISTS",
  );
  assert.equal(users.size, 1);
  assert.equal(users.get("google-user")?.emailVerified, true);
}

{
  const { auth, db } = createHarness();
  await registerWithPin(db as unknown as Firestore, auth as unknown as Auth, {
    name: "Ada Lovelace",
    email: "ada@example.test",
    pin: "482619",
  });
  await assert.rejects(
    registerWithPin(db as unknown as Firestore, auth as unknown as Auth, {
      name: "Ada Lovelace",
      email: "ada@example.test",
      pin: "111111",
    }),
    (error: unknown) => error instanceof Error && error.message === "ACCOUNT_EXISTS",
  );
}

console.log("PASS: PIN registration does not verify email or adopt an existing Firebase user");
