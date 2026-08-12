import assert from "node:assert/strict";
import type {
  CartItem,
  StoredOrderDesignSource,
  UploadedCartDesignSource,
} from "./src/types";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type {
  FirebaseCheckoutIdentity,
  TrustedUploadedDesignTransferClient,
} from "./src/services/customerDesignOrderTransfer";
import {
  __resetUploadedDesignCheckoutPreparationForTests,
  prepareUploadedDesignOrderReferences,
} from "./src/utils/uploadedDesignCheckoutPreparation";
import {
  createCatalogStoredOrderDesignSource,
  createUploadedDraftStoredOrderDesignSource,
  isUploadedOrderDesignImmutable,
} from "./src/utils/cartDesignDomain";

const identity: FirebaseCheckoutIdentity = {
  uid: "customer-order-owner",
  async getIdToken() {
    return "test-token";
  },
};

const draftReference = createCustomerDesignUploadReference({
  ownerUid: identity.uid,
  designReferenceId: "order-regression-design",
  mimeType: "image/jpeg",
  createdAt: "2026-08-12T00:00:00.000Z",
});
const uploadedSource: UploadedCartDesignSource = {
    kind: "uploaded" as const,
    sourceKey: "uploaded:order-regression-design",
    displayLabel: "Your Uploaded Design",
    uploadReference: draftReference,
    fabricCapacityComposition: [],
    demographic: "male" as const,
};
const uploadedItem = {
  id: "uploaded-order-item",
  cartDesignSource: uploadedSource,
} as CartItem;

let transferCalls = 0;
const client: TrustedUploadedDesignTransferClient = {
  async createOwnershipClaim() {
    throw new Error("Same-UID orders must not request an ownership claim.");
  },
  async transferUploadedDesign(input) {
    transferCalls += 1;
    return {
      orderId: input.orderId,
      storagePath: `customer-order-designs/${input.identity.uid}/${input.orderId}/${input.draftReference.designReferenceId}/reference.jpg`,
      mimeType: "image/jpeg",
      createdAt: "2026-08-12T00:01:00.000Z",
    };
  },
};

__resetUploadedDesignCheckoutPreparationForTests();
const preparedFirst = await prepareUploadedDesignOrderReferences({
  items: [uploadedItem],
  identity,
  client,
});
const preparedRetry = await prepareUploadedDesignOrderReferences({
  items: [uploadedItem],
  identity,
  client,
});
assert.equal(transferCalls, 1);
assert.deepEqual(preparedRetry, preparedFirst);

const immutableUploadedOrder: StoredOrderDesignSource = {
  kind: "uploaded",
  sourceKey: uploadedSource.sourceKey,
  displayLabel: uploadedSource.displayLabel,
  fabricCapacityComposition: [],
  demographic: "male",
  imageState: {
    kind: "immutable_order_asset",
    orderReference:
      preparedFirst.preparedByItemId[uploadedItem.id].orderReference,
  },
};
assert.equal(isUploadedOrderDesignImmutable(immutableUploadedOrder), true);
assert.equal(JSON.stringify(immutableUploadedOrder).includes("draftReference"), false);
assert.equal(JSON.stringify(immutableUploadedOrder).includes("getDownloadURL"), false);

const draftOnly = createUploadedDraftStoredOrderDesignSource(
  uploadedSource,
);
assert.equal(isUploadedOrderDesignImmutable(draftOnly), false);
assert.equal(draftOnly.kind, "uploaded");
if (draftOnly.kind === "uploaded") {
  assert.equal(draftOnly.imageState.kind, "draft_pending_trusted_transfer");
}

const catalogOrder = createCatalogStoredOrderDesignSource("catalog-casual-native");
assert.deepEqual(catalogOrder, {
  kind: "catalog",
  sourceKey: "catalog:catalog-casual-native",
  styleId: "catalog-casual-native",
});

console.log("PASS: catalog and immutable uploaded order-source invariants");
