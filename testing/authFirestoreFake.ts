import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

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

export function createFakeDb() {
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

export type FakeUser = {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  phoneNumber?: string;
  providerData: Array<{ providerId: string; email?: string }>;
  customClaims: Record<string, unknown>;
};

export function createFakeAuth(users: FakeUser[] = []) {
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

