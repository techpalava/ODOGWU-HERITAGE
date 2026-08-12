import assert from "node:assert/strict";
import type { CustomerDesignUploadReference } from "./src/types.js";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes.js";
import { createUploadedDesignTransferHandler } from "./src/server/uploadedDesignTransferHttp.js";
import {
  TrustedUploadedDesignTransferError,
  transferVerifiedUploadedDesign,
  type TrustedStorageBucket,
  type TrustedStorageObject,
  type TrustedStorageObjectMetadata,
} from "./src/server/uploadedDesignTransfer.js";

const OWNER_UID = "owner-001";
const ORDER_ID = "CHECKOUT-001-item-001";

const draftReference = (
  mimeType: CustomerDesignUploadReference["mimeType"] = "image/jpeg",
): CustomerDesignUploadReference => {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice(6);
  return {
    ownerUid: OWNER_UID,
    designReferenceId: "design-001",
    storagePath: `customer-design-drafts/${OWNER_UID}/design-001/original.${extension}`,
    mimeType,
    createdAt: "2026-08-12T10:00:00.000Z",
  };
};

class MockStorageObject implements TrustedStorageObject {
  existsValue = false;
  metadata: TrustedStorageObjectMetadata = {};
  copyCalls: Array<{ destinationPath: string; options: unknown }> = [];
  copyError: unknown = null;

  constructor(readonly storagePath: string) {}

  async exists(): Promise<[boolean]> {
    return [this.existsValue];
  }

  async getMetadata(): Promise<[TrustedStorageObjectMetadata, unknown]> {
    return [this.metadata, undefined];
  }

  async copy(
    destination: TrustedStorageObject,
    options: {
      preconditionOpts: { ifGenerationMatch: 0 };
      metadata: {
        contentType: CustomerDesignUploadReference["mimeType"];
        metadata: Record<string, string>;
      };
    },
  ): Promise<void> {
    this.copyCalls.push({
      destinationPath: (destination as MockStorageObject).storagePath,
      options,
    });
    if (this.copyError) throw this.copyError;

    const target = destination as MockStorageObject;
    if (target.existsValue) {
      throw { code: "412" };
    }
    target.existsValue = true;
    target.metadata = {
      contentType: options.metadata.contentType,
      timeCreated: "2026-08-12T11:00:00.000Z",
      metadata: { ...options.metadata.metadata },
    };
  }
}

class MockBucket implements TrustedStorageBucket {
  readonly objects = new Map<string, MockStorageObject>();

  file(storagePath: string): MockStorageObject {
    let object = this.objects.get(storagePath);
    if (!object) {
      object = new MockStorageObject(storagePath);
      this.objects.set(storagePath, object);
    }
    return object;
  }
}

const seedSource = (
  bucket: MockBucket,
  reference = draftReference(),
  metadata: Partial<TrustedStorageObjectMetadata> = {},
) => {
  const source = bucket.file(reference.storagePath);
  source.existsValue = true;
  source.metadata = {
    contentType: reference.mimeType,
    size: 1200,
    ...metadata,
  };
  return source;
};

const transfer = (
  bucket: MockBucket,
  reference = draftReference(),
  authenticatedUid = OWNER_UID,
) =>
  transferVerifiedUploadedDesign({
    authenticatedUid,
    request: { orderId: ORDER_ID, draftReference: reference },
    bucket,
    now: () => "2026-08-12T12:00:00.000Z",
  });

const expectErrorCode = async (
  action: () => Promise<unknown>,
  code: TrustedUploadedDesignTransferError["code"],
) => {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof TrustedUploadedDesignTransferError);
    assert.equal(error.code, code);
    return true;
  });
};

type ResponseState = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

const createResponse = () => {
  const state: ResponseState = { status: 200, headers: {}, body: undefined };
  const response: HttpResponse = {
    status(code) {
      state.status = code;
      return response;
    },
    setHeader(name, value) {
      state.headers[name.toLowerCase()] = value;
      return response;
    },
    json(body) {
      state.body = body;
      return body;
    },
  };
  return { response, state };
};

async function run() {
  const jpegBucket = new MockBucket();
  const source = seedSource(jpegBucket);
  const result = await transfer(jpegBucket);
  assert.equal(result.status, "SUCCESS");
  assert.deepEqual(result.orderReference, {
    orderId: ORDER_ID,
    storagePath:
      "customer-order-designs/owner-001/CHECKOUT-001-item-001/design-001/reference.jpg",
    mimeType: "image/jpeg",
    createdAt: "2026-08-12T12:00:00.000Z",
  });
  assert.equal(source.copyCalls.length, 1);
  assert.deepEqual(source.copyCalls[0]?.options, {
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: {
      contentType: "image/jpeg",
      metadata: {
        odogwuSourceOwnerUid: OWNER_UID,
        odogwuSourceReferenceId: "design-001",
        odogwuSourceStoragePath:
          "customer-design-drafts/owner-001/design-001/original.jpg",
        odogwuOrderId: ORDER_ID,
      },
    },
  });
  assert.equal(source.existsValue, true, "draft remains after the copy");
  assert.equal("downloadUrl" in result.orderReference, false);

  const retry = await transfer(jpegBucket);
  assert.equal(retry.status, "ALREADY_TRANSFERRED");
  assert.equal(source.copyCalls.length, 1, "retry must not copy again");

  for (const mimeType of ["image/png", "image/webp"] as const) {
    const bucket = new MockBucket();
    seedSource(bucket, draftReference(mimeType));
    const typedResult = await transfer(bucket, draftReference(mimeType));
    assert.equal(typedResult.status, "SUCCESS");
    assert.equal(typedResult.orderReference.mimeType, mimeType);
  }

  const missingSource = new MockBucket();
  await expectErrorCode(() => transfer(missingSource), "SOURCE_NOT_FOUND");

  const unsupportedMime = new MockBucket();
  seedSource(unsupportedMime, draftReference(), { contentType: "image/gif" });
  await expectErrorCode(() => transfer(unsupportedMime), "INVALID_FILE");

  const oversized = new MockBucket();
  seedSource(oversized, draftReference(), { size: 5 * 1024 * 1024 + 1 });
  await expectErrorCode(() => transfer(oversized), "INVALID_FILE");

  const failedCopy = new MockBucket();
  const failedCopySource = seedSource(failedCopy);
  failedCopySource.copyError = new Error("copy failed");
  await expectErrorCode(() => transfer(failedCopy), "TRANSFER_FAILED");
  assert.equal(
    failedCopySource.existsValue,
    true,
    "a failed transfer must retain the private draft",
  );

  const foreignReference = {
    ...draftReference(),
    ownerUid: "owner-002",
    storagePath: "customer-design-drafts/owner-002/design-001/original.jpg",
  };
  const foreignBucket = new MockBucket();
  seedSource(foreignBucket, foreignReference);
  await expectErrorCode(
    () => transfer(foreignBucket, foreignReference),
    "TRUSTED_OWNERSHIP_CLAIM_REQUIRED",
  );

  const invalidPath = new MockBucket();
  await expectErrorCode(
    () =>
      transferVerifiedUploadedDesign({
        authenticatedUid: OWNER_UID,
        request: {
          orderId: ORDER_ID,
          draftReference: {
            ...draftReference(),
            storagePath: "fabrics/public-image.jpg",
          },
        },
        bucket: invalidPath,
      }),
    "INVALID_REFERENCE",
  );

  const conflictBucket = new MockBucket();
  seedSource(conflictBucket);
  const conflictingDestination = conflictBucket.file(
    "customer-order-designs/owner-001/CHECKOUT-001-item-001/design-001/reference.jpg",
  );
  conflictingDestination.existsValue = true;
  conflictingDestination.metadata = {
    contentType: "image/jpeg",
    metadata: { odogwuOrderId: "another-order" },
  };
  await expectErrorCode(
    () => transfer(conflictBucket),
    "DESTINATION_CONFLICT",
  );

  const handlerBucket = new MockBucket();
  seedSource(handlerBucket);
  const handler = createUploadedDesignTransferHandler({
    getServices: () => ({
      auth: {
        verifyIdToken: async (token) => {
          if (token !== "valid-token") throw new Error("invalid");
          return { uid: OWNER_UID };
        },
      },
      storage: { bucket: () => handlerBucket },
    }),
    now: () => new Date("2026-08-12T12:00:00.000Z"),
    log: () => undefined,
  });

  const missingAuth = createResponse();
  await handler(
    { method: "POST", headers: {}, body: {} } satisfies HttpRequest,
    missingAuth.response,
  );
  assert.equal(missingAuth.state.status, 401);
  assert.deepEqual(missingAuth.state.body, {
    error: "Firebase authentication is required.",
    code: "AUTH_FAILED",
  });

  const invalidAuth = createResponse();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer invalid-token" },
      body: { orderId: ORDER_ID, draftReference: draftReference() },
    },
    invalidAuth.response,
  );
  assert.equal(invalidAuth.state.status, 401);
  assert.deepEqual(invalidAuth.state.body, {
    error: "Firebase authentication could not be verified.",
    code: "AUTH_FAILED",
  });

  const invalidReference = createResponse();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: {
        orderId: ORDER_ID,
        draftReference: {
          ...draftReference(),
          storagePath: "customer-order-designs/owner-001/old/reference.jpg",
        },
      },
    },
    invalidReference.response,
  );
  assert.equal(invalidReference.state.status, 400);
  assert.deepEqual(invalidReference.state.body, {
    error: "The customer design reference is not a valid private draft.",
    code: "INVALID_REFERENCE",
  });

  const valid = createResponse();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: {
        orderId: ORDER_ID,
        draftReference: draftReference(),
        destinationPath: "customer-order-designs/attacker/anything.jpg",
      },
    },
    valid.response,
  );
  assert.equal(valid.state.status, 200);
  assert.deepEqual(valid.state.body, {
    status: "SUCCESS",
    orderReference: {
      orderId: ORDER_ID,
      storagePath:
        "customer-order-designs/owner-001/CHECKOUT-001-item-001/design-001/reference.jpg",
      mimeType: "image/jpeg",
      createdAt: "2026-08-12T12:00:00.000Z",
    },
  });

  console.log("PASS: trusted uploaded-design ownership and immutable transfer");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
