import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import {
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import type { Customer } from "../types.js";
import {
  getCanonicalEmail,
  isAllowedAdminEmail,
  normalizePhone,
} from "../security/authIdentity.js";

const MAX_PIN_FAILURES = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;

type StoredCustomer = Customer & {
  ownerUid?: string;
  canonicalEmail?: string;
  passcodeHash?: string;
  authFailedAttempts?: number;
  authLockedUntil?: string | null;
};

export type PublicCustomer = Omit<
  StoredCustomer,
  | "passcode"
  | "passcodeHash"
  | "authFailedAttempts"
  | "authLockedUntil"
>;

export function hashPin(pin: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPin(pin: string, storedHash?: string): boolean {
  if (!storedHash) return false;
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;

  const actual = scryptSync(pin, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validatePin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

function toPublicCustomer(customer: StoredCustomer): PublicCustomer {
  const {
    passcode: _passcode,
    passcodeHash: _passcodeHash,
    authFailedAttempts: _authFailedAttempts,
    authLockedUntil: _authLockedUntil,
    ...publicCustomer
  } = customer;
  return publicCustomer;
}

async function findCustomerDocument(
  db: Firestore,
  identifier: string,
): Promise<DocumentSnapshot | null> {
  const customers = db.collection("customers");
  const normalizedIdentifier = identifier.trim();

  if (normalizedIdentifier.includes("@")) {
    const canonicalEmail = getCanonicalEmail(normalizedIdentifier);
    const canonicalMatch = await customers
      .where("canonicalEmail", "==", canonicalEmail)
      .limit(1)
      .get();
    if (!canonicalMatch.empty) return canonicalMatch.docs[0];

    const directCandidates = [
      ...new Set([normalizedIdentifier.toLowerCase(), canonicalEmail]),
    ];
    for (const candidate of directCandidates) {
      const directMatch = await customers
        .where("email", "==", candidate)
        .limit(1)
        .get();
      if (!directMatch.empty) return directMatch.docs[0];
    }

    const legacySnapshot = await customers.get();
    return (
      legacySnapshot.docs.find(
        (document) =>
          getCanonicalEmail(document.data().email) === canonicalEmail,
      ) || null
    );
  }

  const normalizedPhone = normalizePhone(normalizedIdentifier);
  const phoneMatch = await customers
    .where("phone", "==", normalizedIdentifier)
    .limit(1)
    .get();
  if (!phoneMatch.empty) return phoneMatch.docs[0];

  const legacySnapshot = await customers.get();
  return (
    legacySnapshot.docs.find(
      (document) =>
        normalizePhone(document.data().phone) === normalizedPhone,
    ) || null
  );
}

async function ensureFirebaseUser(
  auth: Auth,
  email: string,
  displayName: string,
) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error: any) {
    if (error?.code !== "auth/user-not-found") throw error;
    return auth.createUser({ email, displayName, emailVerified: true });
  }
}

async function migrateOwnedOrders(
  db: Firestore,
  ownerUid: string,
  email: string,
) {
  const canonicalEmail = getCanonicalEmail(email);
  const orders = await db.collection("orders").get();
  const batch = db.batch();
  let migratedCount = 0;

  for (const orderDocument of orders.docs) {
    const order = orderDocument.data();
    if (
      !order.ownerUid &&
      getCanonicalEmail(order.customer?.email) === canonicalEmail
    ) {
      batch.set(
        orderDocument.ref,
        {
          ownerUid,
          customer: {
            ...order.customer,
            ownerUid,
            canonicalEmail,
            email: canonicalEmail,
          },
        },
        { merge: true },
      );
      migratedCount += 1;
    }
  }

  if (migratedCount > 0) await batch.commit();
  return migratedCount;
}

async function migrateLegacyPins(db: Firestore) {
  const customers = await db.collection("customers").get();
  const legacyCustomers = customers.docs.filter((document) => {
    const customer = document.data() as StoredCustomer;
    return Boolean(customer.passcode && !customer.passcodeHash);
  });

  for (let offset = 0; offset < legacyCustomers.length; offset += 400) {
    const batch = db.batch();
    for (const customerDocument of legacyCustomers.slice(offset, offset + 400)) {
      const customer = customerDocument.data() as StoredCustomer;
      batch.set(
        customerDocument.ref,
        {
          passcodeHash: hashPin(customer.passcode!),
          passcode: FieldValue.delete(),
        },
        { merge: true },
      );
    }
    await batch.commit();
  }

  return legacyCustomers.length;
}

async function setServerRole(
  auth: Auth,
  uid: string,
  email: string,
) {
  const user = await auth.getUser(uid);
  const admin = isAllowedAdminEmail(email);
  const existingClaims = user.customClaims || {};
  if (existingClaims.admin !== admin) {
    await auth.setCustomUserClaims(uid, { ...existingClaims, admin });
  }
  return admin;
}

export async function bootstrapFirebaseCustomer(
  db: Firestore,
  auth: Auth,
  token: DecodedIdToken,
) {
  const firebaseUser = await auth.getUser(token.uid);
  const email = firebaseUser.email || token.email || "";
  if (!email) {
    throw new Error("A verified Firebase email is required.");
  }

  const canonicalEmail = getCanonicalEmail(email);
  const admin = await setServerRole(auth, token.uid, canonicalEmail);
  if (admin) {
    await migrateLegacyPins(db);
  }
  let customerDocument = await findCustomerDocument(db, canonicalEmail);

  if (!customerDocument) {
    const newDocument = db.collection("customers").doc(canonicalEmail);
    await newDocument.set({
      ownerUid: token.uid,
      canonicalEmail,
      name: firebaseUser.displayName || "Customer",
      email: canonicalEmail,
      phone: firebaseUser.phoneNumber || "",
      role: admin ? "Super Administrator" : "Customer",
      orderStatus: "Fresh Passport Activation",
      method: "gmail",
    });
    customerDocument = await newDocument.get();
  } else {
    await customerDocument.ref.set(
      {
        ownerUid: token.uid,
        canonicalEmail,
        email: canonicalEmail,
        role: admin ? "Super Administrator" : "Customer",
        method: customerDocument.data()?.method || "gmail",
      },
      { merge: true },
    );
    customerDocument = await customerDocument.ref.get();
  }

  await migrateOwnedOrders(db, token.uid, canonicalEmail);
  return {
    customer: toPublicCustomer(customerDocument.data() as StoredCustomer),
    admin,
  };
}

export async function loginWithPin(
  db: Firestore,
  auth: Auth,
  identifier: string,
  pin: string,
) {
  if (!validatePin(pin)) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const customerDocument = await findCustomerDocument(db, identifier);
  if (!customerDocument) throw new Error("INVALID_CREDENTIALS");

  const account = customerDocument.data() as StoredCustomer;
  if (isAllowedAdminEmail(account.email)) {
    throw new Error("ADMIN_GOOGLE_REQUIRED");
  }

  const lockedUntil = account.authLockedUntil
    ? new Date(account.authLockedUntil).getTime()
    : 0;
  if (lockedUntil > Date.now()) throw new Error("PIN_LOCKED");

  const matches =
    verifyPin(pin, account.passcodeHash) ||
    (typeof account.passcode === "string" && account.passcode === pin);

  if (!matches) {
    const failedAttempts = (account.authFailedAttempts || 0) + 1;
    await customerDocument.ref.set(
      {
        authFailedAttempts: failedAttempts,
        authLockedUntil:
          failedAttempts >= MAX_PIN_FAILURES
            ? new Date(Date.now() + PIN_LOCK_MS).toISOString()
            : null,
      },
      { merge: true },
    );
    throw new Error(
      failedAttempts >= MAX_PIN_FAILURES ? "PIN_LOCKED" : "INVALID_CREDENTIALS",
    );
  }

  const canonicalEmail = getCanonicalEmail(account.email);
  const firebaseUser = await ensureFirebaseUser(
    auth,
    canonicalEmail,
    account.name,
  );
  await setServerRole(auth, firebaseUser.uid, canonicalEmail);
  await customerDocument.ref.set(
    {
      ownerUid: firebaseUser.uid,
      canonicalEmail,
      email: canonicalEmail,
      passcodeHash: account.passcodeHash || hashPin(pin),
      passcode: FieldValue.delete(),
      authFailedAttempts: FieldValue.delete(),
      authLockedUntil: FieldValue.delete(),
      role: "Customer",
    },
    { merge: true },
  );
  await migrateOwnedOrders(db, firebaseUser.uid, canonicalEmail);

  const customToken = await auth.createCustomToken(firebaseUser.uid, {
    admin: false,
    authMethod: "pin",
  });
  const refreshedCustomer = await customerDocument.ref.get();
  return {
    customToken,
    customer: toPublicCustomer(
      refreshedCustomer.data() as StoredCustomer,
    ),
  };
}

export async function registerWithPin(
  db: Firestore,
  auth: Auth,
  input: { name: string; email: string; pin: string },
) {
  const name = input.name.trim();
  const canonicalEmail = getCanonicalEmail(input.email);
  if (!name || !canonicalEmail.includes("@") || !validatePin(input.pin)) {
    throw new Error("INVALID_REGISTRATION");
  }
  if (isAllowedAdminEmail(canonicalEmail)) {
    throw new Error("ADMIN_GOOGLE_REQUIRED");
  }
  if (await findCustomerDocument(db, canonicalEmail)) {
    throw new Error("ACCOUNT_EXISTS");
  }

  const firebaseUser = await ensureFirebaseUser(auth, canonicalEmail, name);
  await setServerRole(auth, firebaseUser.uid, canonicalEmail);

  const customer: StoredCustomer = {
    ownerUid: firebaseUser.uid,
    canonicalEmail,
    name,
    email: canonicalEmail,
    phone: "",
    passcodeHash: hashPin(input.pin),
    role: "Customer",
    orderStatus: "Fresh Passport Activation",
    method: "email",
  };
  await db.collection("customers").doc(canonicalEmail).set(customer);

  const customToken = await auth.createCustomToken(firebaseUser.uid, {
    admin: false,
    authMethod: "pin",
  });
  return { customToken, customer: toPublicCustomer(customer) };
}

export function syntheticPhoneEmail(phone: string): string {
  const digest = createHash("sha256")
    .update(normalizePhone(phone))
    .digest("hex")
    .slice(0, 24);
  return `phone.${digest}@phone-member.invalid`;
}
