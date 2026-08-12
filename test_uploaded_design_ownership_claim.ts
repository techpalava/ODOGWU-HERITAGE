import assert from "node:assert/strict";
import type { CustomerDesignUploadReference } from "./src/types.js";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes.js";
import {
  UploadedDesignOwnershipClaimError,
  createUploadedDesignOwnershipClaim,
  redeemUploadedDesignOwnershipClaim,
  type OwnershipClaimCollection,
  type OwnershipClaimDocumentReference,
  type OwnershipClaimDocumentSnapshot,
  type OwnershipClaimQuery,
  type OwnershipClaimStore,
  type OwnershipClaimTransaction,
  type UploadedDesignOwnershipClaimRecord,
} from "./src/server/uploadedDesignOwnershipClaim.js";
import { createUploadedDesignOwnershipClaimHandler } from "./src/server/uploadedDesignOwnershipClaimHttp.js";
import { createUploadedDesignTransferHandler } from "./src/server/uploadedDesignTransferHttp.js";
import type {
  TrustedStorageBucket,
  TrustedStorageObject,
  TrustedStorageObjectMetadata,
} from "./src/server/uploadedDesignTransfer.js";

const ANON_UID = "anonymous-owner-001";
const ACCOUNT_UID = "account-owner-002";
const ORDER_ID = "CHECKOUT-001-item-001";
const NOW = new Date("2026-08-12T12:00:00.000Z");

const draftReference = (
  ownerUid = ANON_UID,
  designReferenceId = "design-001",
): CustomerDesignUploadReference => ({
  ownerUid,
  designReferenceId,
  storagePath: `customer-design-drafts/${ownerUid}/${designReferenceId}/original.jpg`,
  mimeType: "image/jpeg",
  createdAt: NOW.toISOString(),
});

class MockStorageObject implements TrustedStorageObject {
  existsValue = false;
  metadata: TrustedStorageObjectMetadata = {};

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
    const target = destination as MockStorageObject;
    if (target.existsValue) throw { code: "412" };
    target.existsValue = true;
    target.metadata = {
      contentType: options.metadata.contentType,
      size: 1000,
      timeCreated: NOW.toISOString(),
      metadata: options.metadata.metadata,
    };
  }
}

class MockBucket implements TrustedStorageBucket {
  readonly objects = new Map<string, MockStorageObject>();

  file(path: string): MockStorageObject {
    let result = this.objects.get(path);
    if (!result) {
      result = new MockStorageObject(path);
      this.objects.set(path, result);
    }
    return result;
  }
}

const seedDraft = (bucket: MockBucket, reference = draftReference()) => {
  const source = bucket.file(reference.storagePath);
  source.existsValue = true;
  source.metadata = { contentType: reference.mimeType, size: 1000 };
  return source;
};

class MockClaimStore implements OwnershipClaimStore {
  readonly records = new Map<string, UploadedDesignOwnershipClaimRecord>();
  private transactionQueue: Promise<void> = Promise.resolve();

  collection(_name: string): OwnershipClaimCollection {
    return {
      doc: (id) => ({ id }),
      where: (_fieldPath, _operation, value): OwnershipClaimQuery => {
        const query: OwnershipClaimQuery = {
          limit: () => query,
          get: async () => {
            const matched = [...this.records.entries()]
              .filter(([, record]) => record.tokenHash === value)
              .map(([id, record]) => this.snapshot(id, record));
            return { empty: matched.length === 0, docs: matched };
          },
        };
        return query;
      },
    };
  }

  async runTransaction<T>(
    update: (transaction: OwnershipClaimTransaction) => Promise<T>,
  ): Promise<T> {
    const previousTransaction = this.transactionQueue;
    let releaseTransaction: () => void = () => undefined;
    this.transactionQueue = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    await previousTransaction;
    const transaction: OwnershipClaimTransaction = {
      get: async (reference) => this.snapshot(reference.id),
      create: (reference, record) => {
        if (this.records.has(reference.id)) throw new Error("already exists");
        this.records.set(reference.id, structuredClone(record));
      },
      set: (reference, patch) => {
        const existing = this.records.get(reference.id);
        if (!existing) throw new Error("not found");
        this.records.set(reference.id, { ...existing, ...patch });
      },
    };
    try {
      return await update(transaction);
    } finally {
      releaseTransaction();
    }
  }

  private snapshot(
    id: string,
    record = this.records.get(id),
  ): OwnershipClaimDocumentSnapshot {
    const ref: OwnershipClaimDocumentReference = { id };
    return {
      id,
      ref,
      exists: Boolean(record),
      data: () => (record ? structuredClone(record) : undefined),
    };
  }
}

const expectError = async (
  action: () => Promise<unknown>,
  code: UploadedDesignOwnershipClaimError["code"],
) => {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof UploadedDesignOwnershipClaimError);
    assert.equal(error.code, code);
    return true;
  });
};

type ResponseState = { status: number; body: unknown };
const createResponse = () => {
  const state: ResponseState = { status: 200, body: undefined };
  const response: HttpResponse = {
    status(code) {
      state.status = code;
      return response;
    },
    setHeader() {
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
  const store = new MockClaimStore();
  const bucket = new MockBucket();
  const reference = draftReference();
  seedDraft(bucket, reference);

  const created = await createUploadedDesignOwnershipClaim({
    authenticatedUid: ANON_UID,
    draftReference: reference,
    store,
    bucket,
    now: () => NOW,
  });
  assert.ok(created.claimToken.length >= 43);
  assert.equal(created.expiresAt, "2026-08-12T12:15:00.000Z");
  const stored = [...store.records.values()][0]!;
  assert.notEqual(stored.tokenHash, created.claimToken);
  assert.equal(JSON.stringify(stored).includes(created.claimToken), false);
  assert.equal(stored.sourceOwnerUid, ANON_UID);
  assert.equal(stored.draftReference.storagePath, reference.storagePath);
  assert.equal(stored.redeemedByUid, undefined);

  await expectError(
    () =>
      createUploadedDesignOwnershipClaim({
        authenticatedUid: ANON_UID,
        draftReference: draftReference("another-owner"),
        store,
        bucket,
      }),
    "CLAIM_OWNER_MISMATCH",
  );
  await expectError(
    () =>
      createUploadedDesignOwnershipClaim({
        authenticatedUid: ANON_UID,
        draftReference: { ...reference, storagePath: "fabrics/public.jpg" },
        store,
        bucket,
      }),
    "CLAIM_INVALID_REFERENCE",
  );

  const redemption = await redeemUploadedDesignOwnershipClaim({
    authenticatedUid: ACCOUNT_UID,
    claimToken: created.claimToken,
    orderId: ORDER_ID,
    draftReference: reference,
    store,
    now: () => NOW,
  });
  assert.deepEqual(redemption, { status: "REDEEMED", sourceOwnerUid: ANON_UID });
  assert.equal([...store.records.values()][0]!.redeemedByUid, ACCOUNT_UID);
  assert.equal([...store.records.values()][0]!.redeemedOrderId, ORDER_ID);
  assert.deepEqual(
    await redeemUploadedDesignOwnershipClaim({
      authenticatedUid: ACCOUNT_UID,
      claimToken: created.claimToken,
      orderId: ORDER_ID,
      draftReference: reference,
      store,
      now: () => new Date("2026-08-12T13:00:00.000Z"),
    }),
    { status: "ALREADY_REDEEMED", sourceOwnerUid: ANON_UID },
  );
  await expectError(
    () =>
      redeemUploadedDesignOwnershipClaim({
        authenticatedUid: "account-owner-003",
        claimToken: created.claimToken,
        orderId: ORDER_ID,
        draftReference: reference,
        store,
      }),
    "CLAIM_REDEEMED_BY_DIFFERENT_USER",
  );
  await expectError(
    () =>
      redeemUploadedDesignOwnershipClaim({
        authenticatedUid: ACCOUNT_UID,
        claimToken: created.claimToken,
        orderId: "CHECKOUT-ANOTHER",
        draftReference: reference,
        store,
      }),
    "CLAIM_ALREADY_USED",
  );
  await expectError(
    () =>
      redeemUploadedDesignOwnershipClaim({
        authenticatedUid: ACCOUNT_UID,
        claimToken: created.claimToken,
        orderId: ORDER_ID,
        draftReference: draftReference(ANON_UID, "design-002"),
        store,
      }),
    "TRUSTED_OWNERSHIP_CLAIM_INVALID",
  );
  await expectError(
    () =>
      redeemUploadedDesignOwnershipClaim({
        authenticatedUid: ACCOUNT_UID,
        claimToken: "z".repeat(43),
        orderId: ORDER_ID,
        draftReference: reference,
        store,
      }),
    "CLAIM_NOT_FOUND",
  );

  const concurrentStore = new MockClaimStore();
  const concurrentBucket = new MockBucket();
  seedDraft(concurrentBucket, reference);
  const concurrentClaim = await createUploadedDesignOwnershipClaim({
    authenticatedUid: ANON_UID,
    draftReference: reference,
    store: concurrentStore,
    bucket: concurrentBucket,
    now: () => NOW,
  });
  const concurrentResults = await Promise.allSettled([
    redeemUploadedDesignOwnershipClaim({
      authenticatedUid: ACCOUNT_UID,
      claimToken: concurrentClaim.claimToken,
      orderId: ORDER_ID,
      draftReference: reference,
      store: concurrentStore,
      now: () => NOW,
    }),
    redeemUploadedDesignOwnershipClaim({
      authenticatedUid: "account-owner-003",
      claimToken: concurrentClaim.claimToken,
      orderId: ORDER_ID,
      draftReference: reference,
      store: concurrentStore,
      now: () => NOW,
    }),
  ]);
  assert.equal(
    concurrentResults.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    concurrentResults.filter((result) => result.status === "rejected").length,
    1,
  );

  const expiredStore = new MockClaimStore();
  const expiredBucket = new MockBucket();
  seedDraft(expiredBucket, reference);
  const expiredClaim = await createUploadedDesignOwnershipClaim({
    authenticatedUid: ANON_UID,
    draftReference: reference,
    store: expiredStore,
    bucket: expiredBucket,
    now: () => NOW,
  });
  await expectError(
    () =>
      redeemUploadedDesignOwnershipClaim({
        authenticatedUid: ACCOUNT_UID,
        claimToken: expiredClaim.claimToken,
        orderId: ORDER_ID,
        draftReference: reference,
        store: expiredStore,
        now: () => new Date("2026-08-12T12:15:00.000Z"),
      }),
    "CLAIM_EXPIRED",
  );

  const integrationStore = new MockClaimStore();
  const integrationBucket = new MockBucket();
  seedDraft(integrationBucket, reference);
  const integrationClaim = await createUploadedDesignOwnershipClaim({
    authenticatedUid: ANON_UID,
    draftReference: reference,
    store: integrationStore,
    bucket: integrationBucket,
    now: () => NOW,
  });
  const services = {
    auth: {
      verifyIdToken: async (token: string) => {
        if (token === "account-token") return { uid: ACCOUNT_UID };
        if (token === "anon-token") return { uid: ANON_UID };
        throw new Error("invalid token");
      },
    },
    db: integrationStore,
    storage: { bucket: () => integrationBucket },
  };
  const transferHandler = createUploadedDesignTransferHandler({
    getServices: () => services,
    now: () => NOW.toISOString(),
    log: () => undefined,
  });
  const withoutClaim = createResponse();
  await transferHandler(
    {
      method: "POST",
      headers: { authorization: "Bearer account-token" },
      body: { orderId: ORDER_ID, draftReference: reference },
    },
    withoutClaim.response,
  );
  assert.equal(withoutClaim.state.status, 409);
  assert.deepEqual(withoutClaim.state.body, {
    error:
      "This design belongs to a previous secure guest identity and needs a trusted ownership transfer before checkout.",
    code: "TRUSTED_OWNERSHIP_CLAIM_REQUIRED",
  });

  const withClaim = createResponse();
  await transferHandler(
    {
      method: "POST",
      headers: { authorization: "Bearer account-token" },
      body: {
        orderId: ORDER_ID,
        draftReference: reference,
        ownershipClaimToken: integrationClaim.claimToken,
        previousOwnerUid: "attacker-controlled-value",
      },
    },
    withClaim.response,
  );
  assert.equal(withClaim.state.status, 200);
  assert.deepEqual(withClaim.state.body, {
    status: "SUCCESS",
    orderReference: {
      orderId: ORDER_ID,
      storagePath:
        "customer-order-designs/account-owner-002/CHECKOUT-001-item-001/design-001/reference.jpg",
      mimeType: "image/jpeg",
      createdAt: NOW.toISOString(),
    },
  });
  assert.equal(integrationBucket.file(reference.storagePath).existsValue, true);

  const invalidClaim = createResponse();
  await transferHandler(
    {
      method: "POST",
      headers: { authorization: "Bearer account-token" },
      body: {
        orderId: "CHECKOUT-INVALID-CLAIM",
        draftReference: reference,
        ownershipClaimToken: "x".repeat(43),
      },
    },
    invalidClaim.response,
  );
  assert.equal(invalidClaim.state.status, 403);
  assert.deepEqual(invalidClaim.state.body, {
    error: "The uploaded design ownership claim could not be verified.",
    code: "TRUSTED_OWNERSHIP_CLAIM_INVALID",
  });

  const createHandler = createUploadedDesignOwnershipClaimHandler({
    getServices: () => services,
    now: () => NOW,
    log: () => undefined,
  });
  const noAuth = createResponse();
  await createHandler(
    { method: "POST", headers: {}, body: {} } satisfies HttpRequest,
    noAuth.response,
  );
  assert.equal(noAuth.state.status, 401);
  const invalidAuth = createResponse();
  await createHandler(
    { method: "POST", headers: { authorization: "Bearer invalid" }, body: {} },
    invalidAuth.response,
  );
  assert.equal(invalidAuth.state.status, 401);

  const handlerDraft = draftReference(ANON_UID, "design-003");
  seedDraft(integrationBucket, handlerDraft);
  const createdByAnonymous = createResponse();
  await createHandler(
    {
      method: "POST",
      headers: { authorization: "Bearer anon-token" },
      body: { draftReference: handlerDraft },
    },
    createdByAnonymous.response,
  );
  assert.equal(createdByAnonymous.state.status, 201);
  assert.equal(
    typeof (createdByAnonymous.state.body as { claimToken?: unknown }).claimToken,
    "string",
  );

  console.log("PASS: trusted anonymous-to-account uploaded-design ownership claims");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
