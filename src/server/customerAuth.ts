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
  /** Set once the mailbox is proven (email code or verified Google). */
  emailProvenAt?: string;
  /** Set once the PIN holder has also proven the mailbox. */
  pinProvenAt?: string;
};

export type PublicCustomer = Omit<
  StoredCustomer,
  | "passcode"
  | "passcodeHash"
  | "authFailedAttempts"
  | "authLockedUntil"
  | "emailProvenAt"
  | "pinProvenAt"
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
    emailProvenAt: _emailProvenAt,
    pinProvenAt: _pinProvenAt,
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
  const emailProven = firebaseUser.emailVerified === true;
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
      ...(emailProven ? { emailProvenAt: new Date().toISOString() } : {}),
    });
    customerDocument = await newDocument.get();
  } else {
    const existing = customerDocument.data() as StoredCustomer;
    await customerDocument.ref.set(
      {
        ownerUid: token.uid,
        canonicalEmail,
        email: canonicalEmail,
        role: admin ? "Super Administrator" : "Customer",
        method: existing.method || "gmail",
        ...(emailProven && !existing.emailProvenAt
          ? { emailProvenAt: new Date().toISOString() }
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
  if (emailProven) {
    await migrateOwnedOrders(db, token.uid, email);
  }
  return {
    customer: toPublicCustomer(customerDocument.data() as StoredCustomer),
    admin,
  };
}

export type PinLoginOptions = {
  /** 6-digit code for the one-time mailbox confirmation step. */
  emailCode?: string;
  sendConfirmationCode?: (canonicalEmail: string) => Promise<void>;
  /** Must throw when the code is wrong, expired or used. */
  verifyConfirmationCode?: (
    canonicalEmail: string,
    code: string,
  ) => Promise<void>;
};

export async function loginWithPin(
  db: Firestore,
  auth: Auth,
  identifier: string,
  pin: string,
  options: PinLoginOptions = {},
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
      verifyPin(pin, latest.passcodeHash) ||
      (typeof latest.passcode === "string" && latest.passcode === pin);
    if (matches) return { status: "MATCHED" as const, latest };

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
  if (typeof outcome === "string") throw new Error(outcome);

  // Takeover guard that keeps PIN and Google/email-code working together:
  // a PIN set without mailbox proof (anyone could type the address) must be
  // confirmed once with an emailed code after the mailbox owner has proven
  // the address. Until then the PIN alone cannot open the account.
  const pinNeedsMailboxProof =
    Boolean(outcome.latest.emailProvenAt) && !outcome.latest.pinProvenAt;
  let pinProvenNow = false;
  if (pinNeedsMailboxProof) {
    const canonical = getCanonicalEmail(outcome.latest.email || account.email);
    if (!options.emailCode) {
      if (options.sendConfirmationCode) {
        await options.sendConfirmationCode(canonical);
      }
      throw new Error("PIN_EMAIL_CONFIRMATION_REQUIRED");
    }
    if (!options.verifyConfirmationCode) {
      throw new Error("PIN_EMAIL_CONFIRMATION_REQUIRED");
    }
    await options.verifyConfirmationCode(canonical, options.emailCode);
    pinProvenNow = true;
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
      ...(pinProvenNow ? { pinProvenAt: new Date().toISOString() } : {}),
    },
    { merge: true },
  );
  // A PIN does not prove mailbox ownership, so older unowned orders are not
  // linked here. They link after an email code or a verified Google sign-in.

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

/**
 * Completes a passwordless sign-in or sign-up after the caller has verified
 * a one-time email code for `email`. The code proves the mailbox, so this
 * is the one non-Google path that may link older unowned orders.
 */
export async function completeEmailCodeSignIn(
  db: Firestore,
  auth: Auth,
  input: { email: string; name?: string },
) {
  const canonicalEmail = getCanonicalEmail(input.email);
  if (!canonicalEmail.includes("@")) throw new Error("INVALID_EMAIL");
  if (isAllowedAdminEmail(canonicalEmail)) {
    throw new Error("ADMIN_GOOGLE_REQUIRED");
  }

  const existingDocument = await findCustomerDocument(db, canonicalEmail);
  const existing = existingDocument?.data() as StoredCustomer | undefined;
  const name =
    existing?.name || input.name?.trim().slice(0, 120) || "Customer";
  const firebaseUser = await ensureFirebaseUser(auth, canonicalEmail, name);
  await setServerRole(auth, firebaseUser.uid, canonicalEmail);
  const provenAt = new Date().toISOString();

  let customerReference;
  if (!existingDocument) {
    customerReference = db.collection("customers").doc(canonicalEmail);
    await customerReference.set({
      ownerUid: firebaseUser.uid,
      canonicalEmail,
      name,
      email: canonicalEmail,
      phone: "",
      role: "Customer",
      orderStatus: "Fresh Passport Activation",
      method: "email-code",
      emailProvenAt: provenAt,
    });
  } else {
    customerReference = existingDocument.ref;
    await customerReference.set(
      {
        ownerUid: firebaseUser.uid,
        canonicalEmail,
        email: canonicalEmail,
        role: "Customer",
        ...(existing?.emailProvenAt ? {} : { emailProvenAt: provenAt }),
      },
      { merge: true },
    );
  }

  await migrateOwnedOrders(db, firebaseUser.uid, input.email);

  const customToken = await auth.createCustomToken(firebaseUser.uid, {
    admin: false,
    authMethod: "email-code",
  });
  const refreshed = await customerReference.get();
  return {
    customToken,
    created: !existingDocument,
    customer: toPublicCustomer(refreshed.data() as StoredCustomer),
  };
}

export function syntheticPhoneEmail(phone: string): string {
  const digest = createHash("sha256")
    .update(normalizePhone(phone))
    .digest("hex")
    .slice(0, 24);
  return `phone.${digest}@phone-member.invalid`;
}
