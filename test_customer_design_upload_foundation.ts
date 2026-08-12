import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CustomerUploadIdentityError,
  ensureCustomerUploadIdentity,
  type CustomerUploadAuthClient,
} from "./src/services/customerDesignUploadIdentity";
import {
  CUSTOMER_DESIGN_IMAGE_MIME_TYPES,
  MAX_CUSTOMER_DESIGN_IMAGE_BYTES,
  MAX_CUSTOMER_DESIGN_IMAGE_DIMENSION,
  createCustomerDesignUploadReference,
  getCustomerDesignImageExtension,
} from "./src/services/customerDesignUploadReference";

const customerAuth: CustomerUploadAuthClient = {
  currentUser: { uid: "customer-uid", isAnonymous: false },
};
let signInCalls = 0;
assert.deepEqual(
  await ensureCustomerUploadIdentity(customerAuth, async () => {
    signInCalls += 1;
    return { user: { uid: "unexpected", isAnonymous: true } };
  }),
  { uid: "customer-uid", isAnonymous: false },
);
assert.equal(signInCalls, 0);

const anonymousAuth: CustomerUploadAuthClient = {
  currentUser: { uid: "anonymous-uid", isAnonymous: true },
};
assert.deepEqual(
  await ensureCustomerUploadIdentity(anonymousAuth, async () => {
    signInCalls += 1;
    return { user: { uid: "unexpected", isAnonymous: true } };
  }),
  { uid: "anonymous-uid", isAnonymous: true },
);
assert.equal(signInCalls, 0);

const loggedOutAuth: CustomerUploadAuthClient = { currentUser: null };
assert.deepEqual(
  await ensureCustomerUploadIdentity(loggedOutAuth, async (authClient) => {
    signInCalls += 1;
    const user = { uid: "new-anonymous-uid", isAnonymous: true };
    authClient.currentUser = user;
    return { user };
  }),
  { uid: "new-anonymous-uid", isAnonymous: true },
);
assert.equal(signInCalls, 1);
await ensureCustomerUploadIdentity(loggedOutAuth, async () => {
  signInCalls += 1;
  return { user: { uid: "unexpected", isAnonymous: true } };
});
assert.equal(signInCalls, 1, "Existing anonymous identities must be reused.");

const concurrentAuth: CustomerUploadAuthClient = { currentUser: null };
let concurrentSignInCalls = 0;
let resolveConcurrentSignIn: ((value: { user: { uid: string; isAnonymous: boolean } }) => void) | undefined;
const concurrentSignIn = async () => {
  concurrentSignInCalls += 1;
  return await new Promise<{ user: { uid: string; isAnonymous: boolean } }>((resolve) => {
    resolveConcurrentSignIn = resolve;
  });
};
const firstIdentity = ensureCustomerUploadIdentity(concurrentAuth, concurrentSignIn);
const secondIdentity = ensureCustomerUploadIdentity(concurrentAuth, concurrentSignIn);
assert.equal(
  concurrentSignInCalls,
  1,
  "Concurrent upload identity calls must share one sign-in.",
);
resolveConcurrentSignIn?.({ user: { uid: "concurrent-anonymous-uid", isAnonymous: true } });
assert.deepEqual(await firstIdentity, { uid: "concurrent-anonymous-uid", isAnonymous: true });
assert.deepEqual(await secondIdentity, { uid: "concurrent-anonymous-uid", isAnonymous: true });

await assert.rejects(
  () =>
    ensureCustomerUploadIdentity(
      { currentUser: null },
      async () => {
        throw { code: "auth/operation-not-allowed" };
      },
    ),
  (error: unknown) =>
    error instanceof CustomerUploadIdentityError &&
    error.code === "ANONYMOUS_AUTH_UNAVAILABLE",
);
await assert.rejects(
  () =>
    ensureCustomerUploadIdentity(
      { currentUser: null },
      async () => {
        throw new Error("network unavailable");
      },
    ),
  (error: unknown) =>
    error instanceof CustomerUploadIdentityError &&
    error.code === "ANONYMOUS_AUTH_FAILED",
);

assert.deepEqual(CUSTOMER_DESIGN_IMAGE_MIME_TYPES, [
  "image/jpeg",
  "image/png",
  "image/webp",
]);
assert.equal(getCustomerDesignImageExtension("image/jpeg"), "jpg");
assert.equal(getCustomerDesignImageExtension("image/png"), "png");
assert.equal(getCustomerDesignImageExtension("image/webp"), "webp");
assert.equal(getCustomerDesignImageExtension("image/svg+xml"), null);
assert.equal(getCustomerDesignImageExtension("image/gif"), null);
assert.equal(getCustomerDesignImageExtension("application/pdf"), null);
assert.equal(MAX_CUSTOMER_DESIGN_IMAGE_BYTES, 5 * 1024 * 1024);
assert.equal(MAX_CUSTOMER_DESIGN_IMAGE_DIMENSION, 4096);

const reference = createCustomerDesignUploadReference({
  ownerUid: "anonymous-uid",
  designReferenceId: "design-reference-id",
  mimeType: "image/png",
  originalFileName: "customer name / source.png",
  createdAt: "2026-08-10T00:00:00.000Z",
});
assert.equal(
  reference.storagePath,
  "customer-design-drafts/anonymous-uid/design-reference-id/original.png",
);
assert.equal(reference.originalFileName, "customer name / source.png");
assert.doesNotMatch(reference.storagePath, /customer name|source\.png/);
assert.throws(
  () =>
    createCustomerDesignUploadReference({
      ownerUid: "anonymous-uid",
      designReferenceId: "design-reference-id",
      mimeType: "image/svg+xml",
    }),
  /Unsupported customer design image type/,
);

const identitySource = readFileSync(
  fileURLToPath(
    new URL("./src/services/customerDesignUploadIdentity.ts", import.meta.url),
  ),
  "utf8",
);
const referenceSource = readFileSync(
  fileURLToPath(
    new URL("./src/services/customerDesignUploadReference.ts", import.meta.url),
  ),
  "utf8",
);
assert.doesNotMatch(identitySource, /guestCartId/);
assert.doesNotMatch(referenceSource, /guestCartId/);
assert.doesNotMatch(
  `${identitySource}\n${referenceSource}`,
  /uploadBytes|uploadString|getDownloadURL|getBlob|deleteObject/,
);

const storeSource = readFileSync(
  fileURLToPath(new URL("./src/store/useAppStore.ts", import.meta.url)),
  "utf8",
);
assert.match(
  storeSource,
  /firebaseUser && !firebaseUser\.isAnonymous/,
  "Anonymous Firebase users must remain outside normal customer-account bootstrap.",
);

console.log("PASS: customer design upload identity and reference foundation");
