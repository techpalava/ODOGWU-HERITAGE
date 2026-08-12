import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CustomerDesignUploadReference } from "./src/types";
import {
  CustomerDesignUploadError,
  createCustomerDesignUploadService,
  type CustomerDesignStorageGateway,
} from "./src/services/customerDesignUploadService";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";

const createFile = (
  type: string,
  size = 1024,
  name = "untrusted-source-name.png",
) => ({ type, size, name }) as File;

const ownerUid = "anonymous-owner";
const oldReference = createCustomerDesignUploadReference({
  ownerUid,
  designReferenceId: "old-design-reference",
  mimeType: "image/jpeg",
  originalFileName: "old-photo.jpg",
  createdAt: "2026-08-10T00:00:00.000Z",
});

let sequence = 0;
let currentOwner: { uid: string } | null = { uid: ownerUid };
let ensureIdentityCalls = 0;
const operations: string[] = [];
const storageGateway: CustomerDesignStorageGateway = {
  createReference: (storagePath) => storagePath as never,
  upload: async (storageReference, _file, contentType) => {
    operations.push(`upload:${String(storageReference)}:${contentType}`);
  },
  readBlob: async (storageReference) => {
    operations.push(`read:${String(storageReference)}`);
    return new Blob(["private design"]);
  },
  remove: async (storageReference) => {
    operations.push(`delete:${String(storageReference)}`);
  },
};
const service = createCustomerDesignUploadService({
  ensureIdentity: async () => {
    ensureIdentityCalls += 1;
    return { uid: ownerUid, isAnonymous: true };
  },
  getCurrentOwner: () => currentOwner,
  decodeDimensions: async () => ({ width: 3000, height: 4000 }),
  storageGateway,
  createReference: (input) =>
    createCustomerDesignUploadReference({
      ...input,
      designReferenceId: `new-design-reference-${++sequence}`,
      createdAt: "2026-08-10T00:00:00.000Z",
    }),
});

for (const type of ["image/jpeg", "image/png", "image/webp"]) {
  await service.validateCustomerDesignFile(createFile(type));
}
for (const type of [
  "image/svg+xml",
  "image/gif",
  "",
  "application/pdf",
  "image/heic",
]) {
  await assert.rejects(
    () => service.validateCustomerDesignFile(createFile(type)),
    (error: unknown) =>
      error instanceof CustomerDesignUploadError &&
      error.code === "UNSUPPORTED_FILE_TYPE",
  );
}
await assert.rejects(
  () => service.validateCustomerDesignFile(createFile("image/jpeg", 5 * 1024 * 1024 + 1)),
  (error: unknown) =>
    error instanceof CustomerDesignUploadError && error.code === "FILE_TOO_LARGE",
);
const identityCallsBeforeInvalidUpload = ensureIdentityCalls;
const operationsBeforeInvalidUpload = operations.length;
await assert.rejects(
  () => service.uploadCustomerDesignDraft(createFile("image/svg+xml")),
  (error: unknown) =>
    error instanceof CustomerDesignUploadError &&
    error.code === "UNSUPPORTED_FILE_TYPE",
);
assert.equal(ensureIdentityCalls, identityCallsBeforeInvalidUpload);
assert.equal(operations.length, operationsBeforeInvalidUpload);

const oversizedWidthService = createCustomerDesignUploadService({
  decodeDimensions: async () => ({ width: 5000, height: 1000 }),
});
await assert.rejects(
  () => oversizedWidthService.validateCustomerDesignFile(createFile("image/jpeg")),
  (error: unknown) =>
    error instanceof CustomerDesignUploadError &&
    error.code === "IMAGE_DIMENSIONS_TOO_LARGE",
);
const decodeFailureService = createCustomerDesignUploadService({
  decodeDimensions: async () => {
    throw new Error("unreadable image");
  },
});
await assert.rejects(
  () => decodeFailureService.validateCustomerDesignFile(createFile("image/jpeg")),
  (error: unknown) =>
    error instanceof CustomerDesignUploadError && error.code === "IMAGE_DECODE_FAILED",
);
const oversizedHeightService = createCustomerDesignUploadService({
  decodeDimensions: async () => ({ width: 1000, height: 5000 }),
});
await assert.rejects(
  () => oversizedHeightService.validateCustomerDesignFile(createFile("image/jpeg")),
  (error: unknown) =>
    error instanceof CustomerDesignUploadError &&
    error.code === "IMAGE_DIMENSIONS_TOO_LARGE",
);

const uploadedReference = await service.uploadCustomerDesignDraft(
  createFile("image/png", 2048, "customer supplied/name.png"),
);
assert.equal(ensureIdentityCalls, 1);
assert.equal(uploadedReference.ownerUid, ownerUid);
assert.equal(uploadedReference.mimeType, "image/png");
assert.match(uploadedReference.storagePath, /^customer-design-drafts\/anonymous-owner\/new-design-reference-1\/original\.png$/);
assert.doesNotMatch(uploadedReference.storagePath, /customer supplied|name\.png/);
assert.deepEqual(operations, [
  "upload:customer-design-drafts/anonymous-owner/new-design-reference-1/original.png:image/png",
]);

const customerUploadService = createCustomerDesignUploadService({
  ensureIdentity: async () => ({ uid: "customer-owner", isAnonymous: false }),
  decodeDimensions: async () => ({ width: 100, height: 100 }),
  storageGateway,
  createReference: (input) =>
    createCustomerDesignUploadReference({
      ...input,
      designReferenceId: "real-customer-reference",
    }),
});
const customerReference = await customerUploadService.uploadCustomerDesignDraft(
  createFile("image/jpeg"),
);
assert.equal(customerReference.ownerUid, "customer-owner");
assert.match(
  customerReference.storagePath,
  /^customer-design-drafts\/customer-owner\/real-customer-reference\/original\.jpg$/,
);

const privateBlob = await service.readCustomerDesignDraft(oldReference);
assert.equal(await privateBlob.text(), "private design");
assert.equal(operations.at(-1), `read:${oldReference.storagePath}`);

currentOwner = { uid: "different-owner" };
const operationCountBeforeUnauthorizedRead = operations.length;
await assert.rejects(
  () => service.readCustomerDesignDraft(oldReference),
  (error: unknown) =>
    error instanceof CustomerDesignUploadError && error.code === "READ_NOT_AUTHORIZED",
);
assert.equal(operations.length, operationCountBeforeUnauthorizedRead);
await assert.rejects(
  () => service.deleteCustomerDesignDraft(oldReference),
  (error: unknown) =>
    error instanceof CustomerDesignUploadError && error.code === "DELETE_NOT_AUTHORIZED",
);
assert.equal(operations.length, operationCountBeforeUnauthorizedRead);

currentOwner = { uid: ownerUid };
await service.deleteCustomerDesignDraft(oldReference);
assert.equal(operations.at(-1), `delete:${oldReference.storagePath}`);

const notFoundCleanupService = createCustomerDesignUploadService({
  getCurrentOwner: () => ({ uid: ownerUid }),
  storageGateway: {
    ...storageGateway,
    remove: async () => {
      throw { code: "storage/object-not-found" };
    },
  },
});
await notFoundCleanupService.deleteCustomerDesignDraft(oldReference);

const orderReference: CustomerDesignUploadReference = {
  ...oldReference,
  storagePath: "customer-order-designs/anonymous-owner/order/ref/original.jpg",
};
await assert.rejects(
  () => service.readCustomerDesignDraft(orderReference),
  (error: unknown) =>
    error instanceof CustomerDesignUploadError && error.code === "INVALID_DRAFT_REFERENCE",
);
await assert.rejects(
  () => service.deleteCustomerDesignDraft(orderReference),
  (error: unknown) =>
    error instanceof CustomerDesignUploadError && error.code === "INVALID_DRAFT_REFERENCE",
);

operations.length = 0;
const replacementResult = await service.replaceCustomerDesignDraft(
  oldReference,
  createFile("image/webp"),
);
assert.equal(replacementResult.previousDraftCleanupError, undefined);
assert.equal(replacementResult.reference.designReferenceId, "new-design-reference-2");
assert.deepEqual(operations, [
  "upload:customer-design-drafts/anonymous-owner/new-design-reference-2/original.webp:image/webp",
  `delete:${oldReference.storagePath}`,
]);

const failingUploadService = createCustomerDesignUploadService({
  ensureIdentity: async () => ({ uid: ownerUid, isAnonymous: true }),
  getCurrentOwner: () => ({ uid: ownerUid }),
  decodeDimensions: async () => ({ width: 100, height: 100 }),
  createReference: (input) => createCustomerDesignUploadReference(input),
  storageGateway: {
    ...storageGateway,
    upload: async () => {
      throw new Error("storage unavailable");
    },
    remove: async () => {
      throw new Error("Old draft must remain when upload fails.");
    },
  },
});
await assert.rejects(
  () => failingUploadService.replaceCustomerDesignDraft(oldReference, createFile("image/jpeg")),
  (error: unknown) =>
    error instanceof CustomerDesignUploadError && error.code === "UPLOAD_FAILED",
);

const cleanupFailureService = createCustomerDesignUploadService({
  ensureIdentity: async () => ({ uid: ownerUid, isAnonymous: false }),
  getCurrentOwner: () => ({ uid: ownerUid }),
  decodeDimensions: async () => ({ width: 100, height: 100 }),
  createReference: (input) =>
    createCustomerDesignUploadReference({
      ...input,
      designReferenceId: "successful-new-reference",
    }),
  storageGateway: {
    ...storageGateway,
    upload: async () => undefined,
    remove: async () => {
      throw { code: "storage/retry-limit-exceeded" };
    },
  },
});
const cleanupFailureResult = await cleanupFailureService.replaceCustomerDesignDraft(
  oldReference,
  createFile("image/jpeg"),
);
assert.equal(cleanupFailureResult.reference.designReferenceId, "successful-new-reference");
assert.equal(cleanupFailureResult.previousDraftCleanupError?.code, "DELETE_FAILED");

const unavailableIdentityService = createCustomerDesignUploadService({
  ensureIdentity: async () => {
    throw new Error("Anonymous auth disabled");
  },
  decodeDimensions: async () => ({ width: 100, height: 100 }),
  storageGateway,
});
await assert.rejects(
  () => unavailableIdentityService.uploadCustomerDesignDraft(createFile("image/jpeg")),
  (error: unknown) =>
    error instanceof CustomerDesignUploadError &&
    error.code === "UPLOAD_IDENTITY_UNAVAILABLE",
);

const serviceSource = readFileSync(
  fileURLToPath(
    new URL("./src/services/customerDesignUploadService.ts", import.meta.url),
  ),
  "utf8",
);
assert.doesNotMatch(serviceSource, /getDownloadURL/);
assert.doesNotMatch(serviceSource, /guestCartId/);

console.log("PASS: private customer design upload service");
