import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  CustomerDesignUploadReference,
  GuestDesignDraft,
} from "./src/types.js";
import type { HttpResponse } from "./src/server/httpTypes.js";
import {
  UploadedDesignDraftTransferError,
  getUploadedDesignDraftTransferRedemptionId,
  parseUploadedDesignDraftTransferRequest,
  transferVerifiedUploadedDesignDraft,
} from "./src/server/uploadedDesignDraftTransfer.js";
import { createUploadedDesignDraftTransferHandler } from "./src/server/uploadedDesignDraftTransferHttp.js";
import type {
  TrustedStorageBucket,
  TrustedStorageObject,
  TrustedStorageObjectMetadata,
} from "./src/server/uploadedDesignTransfer.js";
import {
  CustomerDesignDraftTransferClientError,
  customerDesignDraftOwnershipTransferClient,
} from "./src/services/customerDesignDraftOwnershipTransfer.js";
import { createGuestUploadedDesignOwnershipContinuity } from "./src/services/guestUploadedDesignOwnershipContinuity.js";
import { createUploadedDesignSource } from "./src/utils/designSourceState.js";

const ANONYMOUS_UID = "anonymous-owner-001";
const ACCOUNT_UID = "account-owner-002";
const NOW = new Date("2026-08-15T12:00:00.000Z");
const CLAIM_TOKEN = "trusted-ownership-claim-token-1234567890abcdef";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const referenceFor = (
  ownerUid = ANONYMOUS_UID,
  designReferenceId = "design-reference-001",
): CustomerDesignUploadReference => ({
  ownerUid,
  designReferenceId,
  storagePath: `customer-design-drafts/${ownerUid}/${designReferenceId}/original.png`,
  mimeType: "image/png",
  originalFileName: "private-design.png",
  createdAt: "2026-08-15T10:00:00.000Z",
});

const uploadedDraft = (
  reference = referenceFor(),
): GuestDesignDraft =>
  ({
    journeySchemaVersion: 1,
    currentStageId: "design_style",
    designSource: createUploadedDesignSource({
      uploadReference: reference,
      fabricCapacityComposition: [
        {
          key: "base:shirt",
          garmentType: "shirt",
          fabricUnits: 1,
        },
      ],
      demographic: "male",
    }),
  }) as GuestDesignDraft;

class MemoryStorageObject implements TrustedStorageObject {
  existsValue = false;
  metadata: TrustedStorageObjectMetadata = {};
  deleteCalls = 0;
  deleteError: unknown = null;
  copyCalls: Array<{ destinationPath: string; options: unknown }> = [];

  constructor(
    readonly storagePath: string,
    private readonly events: string[],
  ) {}

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
    this.events.push(`copy:${this.storagePath}`);
    this.copyCalls.push({
      destinationPath: (destination as MemoryStorageObject).storagePath,
      options,
    });
    const target = destination as MemoryStorageObject;
    if (target.existsValue) throw { code: "412" };
    target.existsValue = true;
    target.metadata = {
      contentType: options.metadata.contentType,
      size: 1200,
      timeCreated: NOW.toISOString(),
      metadata: { ...options.metadata.metadata },
    };
  }

  async delete(): Promise<void> {
    this.events.push(`delete:${this.storagePath}`);
    this.deleteCalls += 1;
    if (this.deleteError) throw this.deleteError;
    this.existsValue = false;
  }
}

class MemoryBucket implements TrustedStorageBucket {
  readonly objects = new Map<string, MemoryStorageObject>();
  readonly events: string[] = [];

  file(storagePath: string): MemoryStorageObject {
    let object = this.objects.get(storagePath);
    if (!object) {
      object = new MemoryStorageObject(storagePath, this.events);
      this.objects.set(storagePath, object);
    }
    return object;
  }
}

const seedSource = (
  bucket: MemoryBucket,
  reference = referenceFor(),
): MemoryStorageObject => {
  const source = bucket.file(reference.storagePath);
  source.existsValue = true;
  source.metadata = {
    contentType: reference.mimeType,
    size: 1200,
  };
  return source;
};

const expectTransferError = async (
  action: () => Promise<unknown>,
  code: UploadedDesignDraftTransferError["code"],
) => {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof UploadedDesignDraftTransferError);
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

const accountIdentity = {
  uid: ACCOUNT_UID,
  getIdToken: async () => "account-token",
};

async function testTrustedServerTransfer() {
  const sourceReference = referenceFor();
  const bucket = new MemoryBucket();
  const source = seedSource(bucket, sourceReference);
  const request = parseUploadedDesignDraftTransferRequest({
    draftReference: sourceReference,
    ownershipClaimToken: CLAIM_TOKEN,
    previousOwnerUid: "client-asserted-owner-must-be-ignored",
  });
  assert.deepEqual(Object.keys(request).sort(), [
    "draftReference",
    "ownershipClaimToken",
  ]);

  await expectTransferError(
    () =>
      transferVerifiedUploadedDesignDraft({
        authenticatedUid: ACCOUNT_UID,
        request,
        bucket,
        now: () => NOW.toISOString(),
      }),
    "TRUSTED_OWNERSHIP_CLAIM_INVALID",
  );
  assert.equal(source.copyCalls.length, 0);

  const transferred = await transferVerifiedUploadedDesignDraft({
    authenticatedUid: ACCOUNT_UID,
    request,
    bucket,
    trustedSourceOwnerUid: ANONYMOUS_UID,
    now: () => NOW.toISOString(),
  });
  assert.equal(transferred.status, "SUCCESS");
  assert.deepEqual(transferred.draftReference, {
    ...sourceReference,
    ownerUid: ACCOUNT_UID,
    storagePath:
      "customer-design-drafts/account-owner-002/design-reference-001/original.png",
    createdAt: NOW.toISOString(),
  });
  assert.equal(source.existsValue, false);
  assert.equal(source.deleteCalls, 1);
  assert.deepEqual(bucket.events.slice(0, 2), [
    `copy:${sourceReference.storagePath}`,
    `delete:${sourceReference.storagePath}`,
  ]);
  assert.deepEqual(source.copyCalls[0], {
    destinationPath:
      "customer-design-drafts/account-owner-002/design-reference-001/original.png",
    options: {
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: "image/png",
        metadata: {
          odogwuDraftSourceOwnerUid: ANONYMOUS_UID,
          odogwuDraftSourceReferenceId: "design-reference-001",
          odogwuDraftSourceStoragePath: sourceReference.storagePath,
          odogwuDraftDestinationOwnerUid: ACCOUNT_UID,
        },
      },
    },
  });

  const retry = await transferVerifiedUploadedDesignDraft({
    authenticatedUid: ACCOUNT_UID,
    request,
    bucket,
    trustedSourceOwnerUid: ANONYMOUS_UID,
    now: () => NOW.toISOString(),
  });
  assert.equal(retry.status, "ALREADY_TRANSFERRED");
  assert.equal(source.copyCalls.length, 1);

  const cleanupBucket = new MemoryBucket();
  const cleanupSource = seedSource(cleanupBucket, sourceReference);
  cleanupSource.deleteError = new Error("temporary cleanup failure");
  await expectTransferError(
    () =>
      transferVerifiedUploadedDesignDraft({
        authenticatedUid: ACCOUNT_UID,
        request,
        bucket: cleanupBucket,
        trustedSourceOwnerUid: ANONYMOUS_UID,
        now: () => NOW.toISOString(),
      }),
    "TRANSFER_FAILED",
  );
  assert.equal(cleanupSource.existsValue, true);
  cleanupSource.deleteError = null;
  const cleanupRetry = await transferVerifiedUploadedDesignDraft({
    authenticatedUid: ACCOUNT_UID,
    request,
    bucket: cleanupBucket,
    trustedSourceOwnerUid: ANONYMOUS_UID,
    now: () => NOW.toISOString(),
  });
  assert.equal(cleanupRetry.status, "ALREADY_TRANSFERRED");
  assert.equal(cleanupSource.existsValue, false);
}

async function testHttpClaimBinding() {
  const sourceReference = referenceFor();
  const bucket = new MemoryBucket();
  seedSource(bucket, sourceReference);
  let redemptionInput:
    | {
        authenticatedUid: string;
        claimToken: string;
        orderId: string;
        draftOwnerUid: string;
      }
    | undefined;
  const logs: string[] = [];
  const handler = createUploadedDesignDraftTransferHandler({
    getServices: () => ({
      auth: {
        verifyIdToken: async (token) => {
          assert.equal(token, "account-token");
          return { uid: ACCOUNT_UID };
        },
      },
      db: {} as never,
      storage: { bucket: () => bucket },
    }),
    redeemOwnershipClaim: async (input) => {
      redemptionInput = {
        authenticatedUid: input.authenticatedUid,
        claimToken: input.claimToken,
        orderId: input.orderId,
        draftOwnerUid: input.draftReference.ownerUid,
      };
      return { status: "REDEEMED", sourceOwnerUid: ANONYMOUS_UID };
    },
    now: () => NOW,
    log: (message) => logs.push(message),
  });
  const { response, state } = createResponse();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer account-token" },
      body: {
        draftReference: sourceReference,
        ownershipClaimToken: CLAIM_TOKEN,
        previousOwnerUid: "attacker-owner",
        destinationOwnerUid: "attacker-destination",
      },
    },
    response,
  );
  assert.equal(state.status, 200);
  assert.deepEqual(redemptionInput, {
    authenticatedUid: ACCOUNT_UID,
    claimToken: CLAIM_TOKEN,
    orderId: getUploadedDesignDraftTransferRedemptionId(
      ACCOUNT_UID,
      sourceReference.designReferenceId,
    ),
    draftOwnerUid: ANONYMOUS_UID,
  });
  assert.equal(
    (state.body as { draftReference: CustomerDesignUploadReference })
      .draftReference.ownerUid,
    ACCOUNT_UID,
  );
  assert.equal(
    (state.body as { draftReference: CustomerDesignUploadReference })
      .draftReference.storagePath,
    "customer-design-drafts/account-owner-002/design-reference-001/original.png",
  );
  assert.ok(logs.length > 0);
  assert.equal(logs.some((message) => message.includes(CLAIM_TOKEN)), false);
}

async function testClientReferenceValidation() {
  const originalFetch = globalThis.fetch;
  const sourceReference = referenceFor();
  try {
    globalThis.fetch = (async (_input, init) => {
      assert.equal(init?.method, "POST");
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer account-token",
      );
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal("previousOwnerUid" in body, false);
      return new Response(
        JSON.stringify({
          status: "SUCCESS",
          draftReference: {
            ...sourceReference,
            ownerUid: ACCOUNT_UID,
            storagePath:
              "customer-design-drafts/account-owner-002/design-reference-001/original.png",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    const accepted =
      await customerDesignDraftOwnershipTransferClient.transferDraftOwnership({
        draftReference: sourceReference,
        ownershipClaimToken: CLAIM_TOKEN,
        identity: accountIdentity,
      });
    assert.equal(accepted.ownerUid, ACCOUNT_UID);

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          status: "SUCCESS",
          draftReference: sourceReference,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;
    await assert.rejects(
      () =>
        customerDesignDraftOwnershipTransferClient.transferDraftOwnership({
          draftReference: sourceReference,
          ownershipClaimToken: CLAIM_TOKEN,
          identity: accountIdentity,
        }),
      (error: unknown) => {
        assert.ok(error instanceof CustomerDesignDraftTransferClientError);
        assert.equal(error.code, "INVALID_RESPONSE");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testGuestContinuityCoordinator() {
  let draft = uploadedDraft();
  let claimCalls = 0;
  let transferCalls = 0;
  let failTransfer = true;
  const coordinator = createGuestUploadedDesignOwnershipContinuity({
    loadDraft: () => clone(draft),
    saveDraft: (next) => {
      draft = clone(next);
    },
    claimClient: {
      createOwnershipClaim: async (reference, identity) => {
        claimCalls += 1;
        assert.equal(identity.uid, ANONYMOUS_UID);
        assert.equal(reference.ownerUid, ANONYMOUS_UID);
        return {
          claimToken: CLAIM_TOKEN,
          expiresAt: "2026-08-15T12:15:00.000Z",
        };
      },
    },
    transferClient: {
      transferDraftOwnership: async (input) => {
        transferCalls += 1;
        assert.equal(input.identity.uid, ACCOUNT_UID);
        assert.equal(input.ownershipClaimToken, CLAIM_TOKEN);
        if (failTransfer) throw new Error("temporary transfer failure");
        return referenceFor(ACCOUNT_UID);
      },
    },
    now: () => NOW.getTime(),
  });

  const prepared = await coordinator.prepare({
    uid: ANONYMOUS_UID,
    getIdToken: async () => "anonymous-token",
  });
  assert.equal(prepared.status, "ready");
  assert.equal(claimCalls, 1);

  const failed = await coordinator.ensure(accountIdentity);
  assert.deepEqual(failed, {
    status: "transfer_required",
    reason: "transfer_failed",
  });
  assert.equal(draft.designSource?.kind, "uploaded");
  assert.equal(
    draft.designSource?.kind === "uploaded" &&
      draft.designSource.uploadReference.ownerUid,
    ANONYMOUS_UID,
  );
  assert.doesNotMatch(JSON.stringify(draft), /trusted-ownership-claim-token/);

  failTransfer = false;
  const retried = await coordinator.ensure(accountIdentity);
  assert.deepEqual(retried, { status: "ready", method: "transferred" });
  assert.equal(transferCalls, 2);
  assert.equal(
    draft.designSource?.kind === "uploaded" &&
      draft.designSource.uploadReference.ownerUid,
    ACCOUNT_UID,
  );
  assert.equal(draft.uploadedDesignOwnershipTransition, undefined);

  draft = {
    ...uploadedDraft(referenceFor(ACCOUNT_UID)),
    uploadedDesignOwnershipTransition: {
      schemaVersion: 1,
      status: "transfer_required",
      reason: "claim_unavailable",
    },
  };
  const linked = await coordinator.ensure(accountIdentity);
  assert.deepEqual(linked, { status: "ready", method: "uid_preserved" });
  assert.equal(draft.uploadedDesignOwnershipTransition, undefined);
  assert.equal(transferCalls, 2);

  let unavailableDraft = uploadedDraft();
  let unavailableClaimCalls = 0;
  const unavailable = createGuestUploadedDesignOwnershipContinuity({
    loadDraft: () => clone(unavailableDraft),
    saveDraft: (next) => {
      unavailableDraft = clone(next);
    },
    claimClient: {
      createOwnershipClaim: async () => {
        unavailableClaimCalls += 1;
        throw new Error("must not be called");
      },
    },
    transferClient: {
      transferDraftOwnership: async () => {
        throw new Error("must not be called");
      },
    },
  });
  assert.deepEqual(await unavailable.prepare(null), {
    status: "transfer_required",
    reason: "source_identity_unavailable",
  });
  assert.equal(unavailableClaimCalls, 0);
  assert.equal(
    unavailableDraft.designSource?.kind === "uploaded" &&
      unavailableDraft.designSource.uploadReference.ownerUid,
    ANONYMOUS_UID,
  );

  let expiredDraft = uploadedDraft();
  let expiredTransferCalls = 0;
  const expired = createGuestUploadedDesignOwnershipContinuity({
    loadDraft: () => clone(expiredDraft),
    saveDraft: (next) => {
      expiredDraft = clone(next);
    },
    claimClient: {
      createOwnershipClaim: async () => ({
        claimToken: CLAIM_TOKEN,
        expiresAt: "not-an-iso-date",
      }),
    },
    transferClient: {
      transferDraftOwnership: async () => {
        expiredTransferCalls += 1;
        return referenceFor(ACCOUNT_UID);
      },
    },
    now: () => NOW.getTime(),
  });
  await expired.prepare({
    uid: ANONYMOUS_UID,
    getIdToken: async () => "anonymous-token",
  });
  assert.deepEqual(await expired.ensure(accountIdentity), {
    status: "transfer_required",
    reason: "claim_unavailable",
  });
  assert.equal(expiredTransferCalls, 0);

  let staleDraft = uploadedDraft();
  let resolveStaleTransfer:
    | ((reference: CustomerDesignUploadReference) => void)
    | undefined;
  const staleTransfer = new Promise<CustomerDesignUploadReference>((resolve) => {
    resolveStaleTransfer = resolve;
  });
  const staleCoordinator = createGuestUploadedDesignOwnershipContinuity({
    loadDraft: () => clone(staleDraft),
    saveDraft: (next) => {
      staleDraft = clone(next);
    },
    claimClient: {
      createOwnershipClaim: async () => ({
        claimToken: CLAIM_TOKEN,
        expiresAt: "2026-08-15T12:15:00.000Z",
      }),
    },
    transferClient: {
      transferDraftOwnership: async () => staleTransfer,
    },
    now: () => NOW.getTime(),
  });
  await staleCoordinator.prepare({
    uid: ANONYMOUS_UID,
    getIdToken: async () => "anonymous-token",
  });
  const staleCompletion = staleCoordinator.ensure(accountIdentity);
  await Promise.resolve();
  const newerDraft = uploadedDraft(
    referenceFor(ANONYMOUS_UID, "design-reference-002"),
  );
  staleDraft = clone(newerDraft);
  assert.ok(resolveStaleTransfer);
  resolveStaleTransfer(referenceFor(ACCOUNT_UID));
  assert.deepEqual(await staleCompletion, {
    status: "transfer_required",
    reason: "claim_unavailable",
  });
  assert.deepEqual(
    staleDraft,
    newerDraft,
    "An older completion must not rewrite or mark a newer uploaded design.",
  );
}

function testAuthIntegrationSourceContract() {
  const loginSource = readFileSync("src/components/LoginView.tsx", "utf8");
  const storeSource = readFileSync("src/store/useAppStore.ts", "utf8");
  assert.match(loginSource, /linkWithPopup\(existingIdentity, provider\)/);
  assert.match(loginSource, /prepareGuestUploadTransition\(\)/);
  assert.match(loginSource, /Retry Secure Design Transfer/);
  assert.match(
    storeSource,
    /guestUploadedDesignOwnershipContinuity\.ensure\(/,
  );
  assert.match(
    storeSource,
    /continuity\.status === "transfer_required"/,
  );
}

await testTrustedServerTransfer();
await testHttpClaimBinding();
await testClientReferenceValidation();
await testGuestContinuityCoordinator();
testAuthIntegrationSourceContract();

console.log(
  "PASS: guest-to-account uploaded-design ownership continuity is fail closed",
);
