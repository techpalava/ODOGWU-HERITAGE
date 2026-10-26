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
import type {
  Auth,
  DecodedIdToken,
  UserRecord,
} from "firebase-admin/auth";
import type { Customer } from "../types.js";
import { isAllowedAdminEmail } from "./adminAllowlist.js";
import {
  getCanonicalEmail,
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
  pinDisabledAt?: string;
  pinDisabledReason?: string;
};

export type PublicCustomer = Omit<
  StoredCustomer,
  | "passcode"
  | "passcodeHash"
  | "authFailedAttempts"
  | "authLockedUntil"
  | "pinDisabledAt"
  | "pinDisabledReason"
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

export function validateLoginPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^(?:\d{4}|\d{6})$/.test(pin);
}

export function validateRegisterPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{6}$/.test(pin);
}

function toPublicCustomer(customer: StoredCustomer): PublicCustomer {
  const {
    passcode: _passcode,
    passcodeHash: _passcodeHash,
    authFailedAttempts: _authFailedAttempts,
    authLockedUntil: _authLockedUntil,
    pinDisabledAt: _pinDisabledAt,
    pinDisabledReason: _pinDisabledReason,
    ...publicCustomer
  } = customer;
  return publicCustomer;
}

async function firstMatch(
  customers: ReturnType<Firestore["collection"]>,
  field: string,
  candidates: string[],
): Promise<DocumentSnapshot | null> {
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    const match = await customers.where(field, "==", candidate).limit(1).get();
    if (!match.empty) return match.docs[0];
  }
  return null;
}

/**
 * Indexed lookups only. A miss must never read the whole collection: that
 * let any anonymous login attempt trigger a full `customers` scan.
 */
async function findCustomerDocument(
  db: Firestore,
  identifier: string,
): Promise<DocumentSnapshot | null> {
  const customers = db.collection("customers");
  const normalizedIdentifier = identifier.trim();

  if (normalizedIdentifier.includes("@")) {
    const canonicalEmail = getCanonicalEmail(normalizedIdentifier);
    return (
      (await firstMatch(customers, "canonicalEmail", [canonicalEmail])) ||
      (await firstMatch(customers, "email", [
        normalizedIdentifier.toLowerCase(),
        canonicalEmail,
        normalizedIdentifier,
      ]))
    );
  }

  return firstMatch(customers, "phone", [
    normalizedIdentifier,
    normalizePhone(normalizedIdentifier),
  ]);
}

async function readFirebaseUserByEmail(auth: Auth, email: string) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error: any) {
    if (error?.code !== "auth/user-not-found") throw error;
    return null;
  }
}

async function ensureFirebaseUser(
  auth: Auth,
  email: string,
  displayName: string,
) {
  const existing = await readFirebaseUserByEmail(auth, email);
  if (existing) return existing;
  // A PIN is not mailbox proof. Leave the address unverified.
  return auth.createUser({ email, displayName, emailVerified: false });
}

async function createUnverifiedPinUser(
  auth: Auth,
  email: string,
  displayName: string,
) {
  if (await readFirebaseUserByEmail(auth, email)) {
    throw new Error("EMAIL_ALREADY_REGISTERED");
  }
  try {
    return await auth.createUser({
      email,
      displayName,
      emailVerified: false,
    });
  } catch (error: any) {
    if (error?.code === "auth/email-already-exists") {
      throw new Error("EMAIL_ALREADY_REGISTERED");
    }
    throw error;
  }
}

/**
 * Links older orders that have no owner to the signed-in account. Callers
 * must only invoke this after the email address is proven (Google-verified
 * or verified by Firebase). Uses equality queries instead of reading every
 * order.
 */
async function migrateOwnedOrders(
  db: Firestore,
  ownerUid: string,
  email: string,
) {
  const canonicalEmail = getCanonicalEmail(email);
  const lowerEmail = email.trim().toLowerCase();
  const orders = db.collection("orders");
  const queries: Array<[string, string]> = [
    ["customer.canonicalEmail", canonicalEmail],
    ["customer.email", canonicalEmail],
  ];
  if (lowerEmail && lowerEmail !== canonicalEmail) {
    queries.push(["customer.email", lowerEmail]);
  }

  const candidates = new Map<string, DocumentSnapshot>();
  for (const [field, value] of queries) {
    const snapshot = await orders.where(field, "==", value).get();
    for (const orderDocument of snapshot.docs) {
      candidates.set(orderDocument.id, orderDocument);
    }
  }

  const batch = db.batch();
  let migratedCount = 0;

  for (const orderDocument of candidates.values()) {
    const order = orderDocument.data() || {};
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
  // Only documents that still hold a plaintext string `passcode`.
  const customers = await db
    .collection("customers")
    .where("passcode", ">=", "")
    .get();
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

/**
 * Administrator access needs all three: an allowlisted email, a verified
 * email, and a linked Google identity for that same address.
 */
function hasVerifiedGoogleIdentity(
  user: UserRecord,
  canonicalEmail: string,
): boolean {
  return (
    user.emailVerified === true &&
    (user.providerData || []).some(
      (provider) =>
        provider?.providerId === "google.com" &&
        getCanonicalEmail(provider.email || user.email) === canonicalEmail,
    )
  );
}

async function setServerRole(
  auth: Auth,
  uid: string,
  email: string,
) {
  const user = await auth.getUser(uid);
  const admin =
    isAllowedAdminEmail(email) &&
    hasVerifiedGoogleIdentity(user, getCanonicalEmail(email));
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
    const existing = customerDocument.data() as StoredCustomer;
    // Pre-registration takeover guard: a PIN can be set by anyone who types
    // an address, without proving the mailbox. Once the real mailbox owner
    // signs in with a verified email, that unproven PIN stops working. The
    // hash is kept (not deleted) so the change is reversible by an admin.
    const disableUnprovenPin =
      firebaseUser.emailVerified === true &&
      !existing.pinDisabledAt &&
      Boolean(existing.passcodeHash || existing.passcode);
    await customerDocument.ref.set(
      {
        ownerUid: token.uid,
        canonicalEmail,
        email: canonicalEmail,
        role: admin ? "Super Administrator" : "Customer",
        method: existing.method || "gmail",
        ...(disableUnprovenPin
          ? {
              pinDisabledAt: new Date().toISOString(),
              pinDisabledReason: "verified-email-sign-in",
            }
          : {}),
      },
      { merge: true },
    );
    customerDocument = await customerDocument.ref.get();
  }

  // Only a proven mailbox may claim older orders that have no owner.
  // PIN accounts are created unverified, so they never reach this branch.
  // The raw provider address is passed so both its lowercase form and the
  // canonical form are matched (e.g. dotted Gmail addresses on old orders).
  if (firebaseUser.emailVerified === true) {
    await migrateOwnedOrders(db, token.uid, email);
  }
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
  if (!validateLoginPin(pin)) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const customerDocument = await findCustomerDocument(db, identifier);
  if (!customerDocument) throw new Error("INVALID_CREDENTIALS");

  const account = customerDocument.data() as StoredCustomer;
  if (isAllowedAdminEmail(account.email)) {
    throw new Error("ADMIN_GOOGLE_REQUIRED");
  }

  // Check the lock, verify the PIN, and count a failure in one transaction so
  // parallel requests cannot exceed MAX_PIN_FAILURES.
  const outcome = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(customerDocument.ref);
    const latest = (current.data() || account) as StoredCustomer;
    const lockedUntil = latest.authLockedUntil
      ? new Date(latest.authLockedUntil).getTime()
      : 0;
    if (lockedUntil > Date.now()) return "PIN_LOCKED" as const;

    const matches =
      !latest.pinDisabledAt &&
      (verifyPin(pin, latest.passcodeHash) ||
        (typeof latest.passcode === "string" && latest.passcode === pin));
    if (matches) return "MATCHED" as const;

    const failedAttempts = (latest.authFailedAttempts || 0) + 1;
    transaction.set(
      customerDocument.ref,
      {
        authFailedAttempts: failedAttempts,
        authLockedUntil:
          failedAttempts >= MAX_PIN_FAILURES
            ? new Date(Date.now() + PIN_LOCK_MS).toISOString()
            : null,
      },
      { merge: true },
    );
    return failedAttempts >= MAX_PIN_FAILURES
      ? ("PIN_LOCKED" as const)
      : ("INVALID_CREDENTIALS" as const);
  });
  if (outcome !== "MATCHED") throw new Error(outcome);

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
  // A PIN does not prove mailbox ownership, so older unowned orders are not
  // linked here. They link after a verified sign-in (Google today).

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
  if (!name || !canonicalEmail.includes("@") || !validateRegisterPin(input.pin)) {
    throw new Error("INVALID_REGISTRATION");
  }
  if (isAllowedAdminEmail(canonicalEmail)) {
    throw new Error("ADMIN_GOOGLE_REQUIRED");
  }
  if (await findCustomerDocument(db, canonicalEmail)) {
    throw new Error("ACCOUNT_EXISTS");
  }

  const firebaseUser = await createUnverifiedPinUser(
    auth,
    canonicalEmail,
    name,
  );
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
