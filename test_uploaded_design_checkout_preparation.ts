import assert from "node:assert/strict";
import type { CartItem } from "./src/types";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type {
  FirebaseCheckoutIdentity,
  TrustedUploadedDesignTransferClient,
} from "./src/services/customerDesignOrderTransfer";
import {
  __resetUploadedDesignCheckoutPreparationForTests,
  createAnonymousUploadedDesignClaims,
  prepareUploadedDesignOrderReferences,
} from "./src/utils/uploadedDesignCheckoutPreparation";

const draftItem = (id: string, ownerUid: string): CartItem => ({
  id,
  cartDesignSource: {
    kind: "uploaded",
    sourceKey: `uploaded:${id}`,
    displayLabel: "Your Uploaded Design",
    uploadReference: createCustomerDesignUploadReference({
      ownerUid,
      designReferenceId: `design-${id}`,
      mimeType: "image/png",
      createdAt: "2026-08-12T00:00:00.000Z",
    }),
    fabricCapacityComposition: [],
    demographic: "male",
  },
} as CartItem);

const catalogItem = (id: string): CartItem => ({
  id,
  cartDesignSource: { kind: "catalog", sourceKey: `catalog:${id}`, styleId: id },
} as CartItem);

const identity = (uid: string): FirebaseCheckoutIdentity => ({
  uid,
  async getIdToken() {
    return `token-${uid}`;
  },
});

const transfers: Array<{
  orderId: string;
  itemReferenceId: string;
  claimToken?: string;
  uid: string;
}> = [];
let failReferenceId: string | null = null;

const client: TrustedUploadedDesignTransferClient = {
  async createOwnershipClaim(reference) {
    return {
      claimToken: `opaque-${reference.designReferenceId}-token-1234567890`,
      expiresAt: "2026-08-12T00:15:00.000Z",
    };
  },
  async transferUploadedDesign(input) {
    transfers.push({
      orderId: input.orderId,
      itemReferenceId: input.draftReference.designReferenceId,
      claimToken: input.ownershipClaimToken,
      uid: input.identity.uid,
    });
    if (input.draftReference.designReferenceId === failReferenceId) {
      throw new Error("mock transfer failure");
    }
    return {
      orderId: input.orderId,
      storagePath: `customer-order-designs/${input.identity.uid}/${input.orderId}/${input.draftReference.designReferenceId}/reference.png`,
      mimeType: "image/png",
      createdAt: "2026-08-12T00:02:00.000Z",
    };
  },
};

let claimCalls = 0;
const trackedClient: TrustedUploadedDesignTransferClient = {
  ...client,
  async createOwnershipClaim(reference, currentIdentity) {
    claimCalls += 1;
    return client.createOwnershipClaim(reference, currentIdentity);
  },
};

// Same-UID checkout calls transfer directly and never creates a claim.
__resetUploadedDesignCheckoutPreparationForTests();
transfers.length = 0;
const sameUidItem = draftItem("same", "customer-a");
const sameUidPrepared = await prepareUploadedDesignOrderReferences({
  items: [sameUidItem],
  identity: identity("customer-a"),
  client,
  prepareRequestId: "PREP-TEST-SAME-UID",
});
assert.equal(transfers.length, 1);
assert.equal(transfers[0].claimToken, undefined);
assert.equal(
  sameUidPrepared.preparedByItemId.same.orderReference.orderId,
  transfers[0].orderId,
);

// Concurrent preparation requests share the same transfer rather than racing.
__resetUploadedDesignCheckoutPreparationForTests();
transfers.length = 0;
const slowClient: TrustedUploadedDesignTransferClient = {
  ...client,
  async transferUploadedDesign(input) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return client.transferUploadedDesign(input);
  },
};
const concurrentItem = draftItem("concurrent", "customer-concurrent");
const concurrentPrepareRequestId = "PREP-TEST-CONCURRENT";
await Promise.all([
  prepareUploadedDesignOrderReferences({
    items: [concurrentItem],
    identity: identity("customer-concurrent"),
    client: slowClient,
    prepareRequestId: concurrentPrepareRequestId,
  }),
  prepareUploadedDesignOrderReferences({
    items: [concurrentItem],
    identity: identity("customer-concurrent"),
    client: slowClient,
    prepareRequestId: concurrentPrepareRequestId,
  }),
]);
assert.equal(transfers.length, 1);

// Anonymous A claims before login; account B consumes the opaque token once.
__resetUploadedDesignCheckoutPreparationForTests();
transfers.length = 0;
const crossUidItem = draftItem("cross", "anonymous-a");
const crossUidPrepareRequestId = "PREP-TEST-CROSS-UID";
await createAnonymousUploadedDesignClaims({
  items: [crossUidItem],
  identity: identity("anonymous-a"),
  client,
  prepareRequestId: crossUidPrepareRequestId,
});
const crossUidPrepared = await prepareUploadedDesignOrderReferences({
  items: [crossUidItem],
  identity: identity("customer-b"),
  client,
  prepareRequestId: crossUidPrepareRequestId,
});
assert.equal(transfers.length, 1);
assert.ok(transfers[0].claimToken?.startsWith("opaque-design-cross"));
assert.match(
  crossUidPrepared.preparedByItemId.cross.orderReference.storagePath,
  /^customer-order-designs\/customer-b\//,
);
assert.equal(
  JSON.stringify(crossUidPrepared).includes("opaque-design-cross"),
  false,
);

// A cross-UID draft without the claim remains blocked and is never transferred.
__resetUploadedDesignCheckoutPreparationForTests();
transfers.length = 0;
await assert.rejects(
  () =>
    prepareUploadedDesignOrderReferences({
      items: [crossUidItem],
      identity: identity("customer-b"),
      client,
      prepareRequestId: "PREP-TEST-CROSS-UID-BLOCKED",
    }),
  /authorization needs to be refreshed/,
);
assert.equal(transfers.length, 0);

// Catalog-only carts never create claims or call the secure transfer endpoint.
__resetUploadedDesignCheckoutPreparationForTests();
transfers.length = 0;
claimCalls = 0;
const catalogPrepareRequestId = "PREP-TEST-CATALOG";
await createAnonymousUploadedDesignClaims({
  items: [catalogItem("catalog-only")],
  identity: identity("anonymous-catalog"),
  client: trackedClient,
  prepareRequestId: catalogPrepareRequestId,
});
const catalogPrepared = await prepareUploadedDesignOrderReferences({
  items: [catalogItem("catalog-only")],
  identity: identity("customer-catalog"),
  client: trackedClient,
  prepareRequestId: catalogPrepareRequestId,
});
assert.equal(claimCalls, 0);
assert.equal(transfers.length, 0);
assert.deepEqual(catalogPrepared.preparedByItemId, {});

// A mixed final identity uses a claim only for the draft stranded by login.
__resetUploadedDesignCheckoutPreparationForTests();
transfers.length = 0;
claimCalls = 0;
const ownedByAnonymous = draftItem("anonymous-owned", "anonymous-mixed");
const alreadyOwnedByAccount = draftItem("account-owned", "customer-mixed");
const mixedOwnership = [ownedByAnonymous, alreadyOwnedByAccount];
const mixedPrepareRequestId = "PREP-TEST-MIXED";
await createAnonymousUploadedDesignClaims({
  items: mixedOwnership,
  identity: identity("anonymous-mixed"),
  client: trackedClient,
  prepareRequestId: mixedPrepareRequestId,
});
await prepareUploadedDesignOrderReferences({
  items: mixedOwnership,
  identity: identity("customer-mixed"),
  client: trackedClient,
  prepareRequestId: mixedPrepareRequestId,
});
assert.equal(claimCalls, 1);
assert.ok(
  transfers.find((transfer) => transfer.itemReferenceId === "design-anonymous-owned")
    ?.claimToken,
);
assert.equal(
  transfers.find((transfer) => transfer.itemReferenceId === "design-account-owned")
    ?.claimToken,
  undefined,
);

// Mixed carts only transfer uploaded items. A failed second transfer keeps the
// first prepared reference and retries it idempotently with the same order ID.
__resetUploadedDesignCheckoutPreparationForTests();
transfers.length = 0;
const first = draftItem("first", "customer-c");
const second = draftItem("second", "customer-c");
const mixed = [catalogItem("catalog"), first, second];
const retryPrepareRequestId = "PREP-TEST-RETRY";
failReferenceId = "design-second";
await assert.rejects(() =>
  prepareUploadedDesignOrderReferences({
    items: mixed,
    identity: identity("customer-c"),
    client,
    prepareRequestId: retryPrepareRequestId,
  }),
);
assert.deepEqual(
  transfers.map((transfer) => transfer.itemReferenceId),
  ["design-first", "design-second"],
);
const firstOrderId = transfers[0].orderId;
failReferenceId = null;
const retryPrepared = await prepareUploadedDesignOrderReferences({
  items: mixed,
  identity: identity("customer-c"),
  client,
  prepareRequestId: retryPrepareRequestId,
});
assert.deepEqual(
  transfers.map((transfer) => transfer.itemReferenceId),
  ["design-first", "design-second", "design-second"],
);
assert.equal(retryPrepared.preparedByItemId.first.orderReference.orderId, firstOrderId);
assert.ok(retryPrepared.preparedByItemId.second);

console.log("PASS: uploaded-design checkout preparation protects claims, order IDs, and retries");
