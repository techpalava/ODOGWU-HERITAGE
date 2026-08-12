import assert from "node:assert/strict";
import type {
  CartItem,
  Fabric,
  StyleCategory,
  StoredOrderDesignSource,
} from "./src/types";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import {
  createCartDesignPricingSnapshot,
  createCartDesignSource,
  createCatalogStoredOrderDesignSource,
  createUploadedDraftStoredOrderDesignSource,
  getCartDesignConfigurationFingerprintInput,
  getCartFabricQuantity,
  inspectCartDesignDomain,
  isUploadedOrderDesignImmutable,
  normalizeCartItemDesignDomain,
  normalizeMasterOrderDesignDomain,
  UPLOADED_DESIGN_TRUSTED_TRANSFER_BLOCKER,
} from "./src/utils/cartDesignDomain";
import {
  getCartItemConfigurationHash,
} from "./src/services/guestOrderSessionService";
import { revalidateCartForCheckout } from "./src/utils/checkoutValidation";

const style: StyleCategory = {
  id: "real-catalog-style",
  name: "Real Catalogue Style",
  description: "A real style.",
  gender: "male",
  options: [],
};
const fabric: Fabric = {
  code: "FABRIC-ONE",
  name: "Imperial Sapphire Link",
  description: "Fabric",
  color: "Blue",
  colorHex: "#0000aa",
  priceMultiplier: 1,
  category: "HiTarget Ankara",
  stockStatus: "IN_STOCK",
};

const makeItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: "cart-item",
  customer: { name: "Customer", email: "customer@example.com", phone: "" },
  style,
  fabric,
  design: { customDetails: {} },
  garment: { type: "Shirt", totalPrice: 80, clothingPrice: 80 },
  measurements: {
    height: 170, weight: 70, age: 30, bodyBuild: "Average",
    fitPreference: "Standard", neck: 15, shoulder: 18, chest: 40,
    waist: 34, hip: 40, sleeve: 24, trouserLength: 40, isAiEstimated: false,
  },
  specialInstructions: "",
  notesAboutLeftoverFabric: "",
  batchType: "alone",
  ...overrides,
});

const referenceOne = createCustomerDesignUploadReference({
  ownerUid: "owner-one",
  designReferenceId: "design-one",
  mimeType: "image/png",
  createdAt: "2026-08-12T00:00:00.000Z",
});
const uploadedSource = createCartDesignSource({
  kind: "uploaded",
  sourceKey: "uploaded:design-one",
  uploadReference: referenceOne,
  fabricCapacityComposition: [{ key: "main-shirt", garmentType: "shirt", fabricUnits: 1 }],
  demographic: "male",
  displayLabel: "Your Uploaded Design",
}, null);
assert(uploadedSource && uploadedSource.kind === "uploaded");

const uploadedItem = makeItem({
  id: "uploaded-item",
  style: undefined,
  cartDesignSource: uploadedSource,
  cartDesignPricingSnapshot: createCartDesignPricingSnapshot({ garmentSubtotal: 80, capturedAt: "2026-08-12T00:00:00.000Z" }),
  fabricAllocations: [
    {
      allocationId: "allocation-1",
      fabricCode: fabric.code,
      garmentAssignments: [{
        garmentKey: "main-shirt", code: "UPLOADED_SHIRT", garmentType: "shirt",
        fabricUnits: 1, garmentSpec: { key: "main-shirt", garmentType: "shirt", fabricUnits: 1 },
        sourceRole: "main",
      }],
    },
    {
      allocationId: "allocation-2",
      fabricCode: fabric.code,
      garmentAssignments: [
        {
          garmentKey: "additional-shirt-1", code: "ADDITIONAL_SHIRT_1", garmentType: "shirt",
          fabricUnits: 1, garmentSpec: { key: "additional-shirt-1", garmentType: "shirt", fabricUnits: 1 },
          sourceRole: "additional", mainGarmentKey: "main-shirt", mainGarmentType: "shirt", dependencyStatus: "valid",
        },
        {
          garmentKey: "additional-shirt-2", code: "ADDITIONAL_SHIRT_2", garmentType: "shirt",
          fabricUnits: 1, garmentSpec: { key: "additional-shirt-2", garmentType: "shirt", fabricUnits: 1 },
          sourceRole: "additional", mainGarmentKey: "main-shirt", mainGarmentType: "shirt", dependencyStatus: "valid",
        },
      ],
    },
  ],
});

// Legacy catalogue carts gain an explicit source without changing their real style identity.
const legacyCatalog = normalizeCartItemDesignDomain(makeItem());
assert.equal(legacyCatalog.cartDesignSource?.kind, "catalog");
assert.equal(legacyCatalog.cartDesignSource?.kind === "catalog" && legacyCatalog.cartDesignSource.styleId, style.id);
assert.equal(legacyCatalog.cartDesignValidation?.status, "valid");
assert.equal(getCartItemConfigurationHash(legacyCatalog), getCartItemConfigurationHash(normalizeCartItemDesignDomain(legacyCatalog)));

const hydratedUploaded = normalizeCartItemDesignDomain(JSON.parse(JSON.stringify(uploadedItem)));
assert.equal(hydratedUploaded.cartDesignValidation?.status, "valid");
assert.equal(hydratedUploaded.cartDesignSource?.kind, "uploaded");
assert.equal(hydratedUploaded.cartDesignSource?.kind === "uploaded" && hydratedUploaded.cartDesignSource.uploadReference.storagePath, referenceOne.storagePath);
assert.equal(JSON.stringify(hydratedUploaded).includes("downloadURL"), false);
assert.equal(getCartFabricQuantity(hydratedUploaded), 2, "Fabric quantity derives from allocations.");
assert.deepEqual(hydratedUploaded.fabricAllocations?.map((allocation) => allocation.allocationId), ["allocation-1", "allocation-2"]);
assert.equal(hydratedUploaded.fabricAllocations?.[0].fabricCode, hydratedUploaded.fabricAllocations?.[1].fabricCode);
assert.deepEqual(hydratedUploaded.fabricAllocations?.flatMap((allocation) => allocation.garmentAssignments.map((assignment) => assignment.garmentKey)), ["main-shirt", "additional-shirt-1", "additional-shirt-2"]);

const fingerprintOne = getCartItemConfigurationHash(hydratedUploaded);
const secondReferenceItem = normalizeCartItemDesignDomain({
  ...uploadedItem,
  cartDesignSource: {
    ...uploadedSource,
    uploadReference: { ...uploadedSource.uploadReference, designReferenceId: "design-two", storagePath: "customer-design-drafts/owner-one/design-two/original.png" },
    sourceKey: "uploaded:design-two",
  },
});
assert.notEqual(fingerprintOne, getCartItemConfigurationHash(secondReferenceItem));
assert.equal(JSON.stringify(getCartDesignConfigurationFingerprintInput(hydratedUploaded)).includes("object:"), false);

const malformedPath = normalizeCartItemDesignDomain({
  ...uploadedItem,
  cartDesignSource: { ...uploadedSource, uploadReference: { ...uploadedSource.uploadReference, storagePath: "public/not-private.png" } },
});
assert.equal(malformedPath.cartDesignValidation?.status, "invalid");
const missingReference = normalizeCartItemDesignDomain({
  ...uploadedItem,
  cartDesignSource: {
    ...uploadedSource,
    uploadReference: undefined as never,
  },
});
assert.equal(missingReference.cartDesignValidation?.status, "invalid");
const missingAllocation = normalizeCartItemDesignDomain({ ...uploadedItem, fabricAllocations: [] });
assert.equal(missingAllocation.cartDesignValidation?.status, "invalid");
const orphanedAdditional = normalizeCartItemDesignDomain({
  ...uploadedItem,
  fabricAllocations: [{
    allocationId: "allocation-only", fabricCode: fabric.code, garmentAssignments: [{
      garmentKey: "additional-only", code: "ADDITIONAL_SHIRT_1", garmentType: "shirt", fabricUnits: 1,
      garmentSpec: { key: "additional-only", garmentType: "shirt", fabricUnits: 1 }, sourceRole: "additional", mainGarmentType: "shirt", dependencyStatus: "orphaned",
    }],
  }],
});
assert.equal(orphanedAdditional.cartDesignValidation?.status, "invalid");
const unresolvedPricing = normalizeCartItemDesignDomain({
  ...uploadedItem,
  cartDesignPricingSnapshot: createCartDesignPricingSnapshot({ garmentSubtotal: 0 }),
});
assert.equal(unresolvedPricing.cartDesignValidation?.status, "invalid");
const contradictory = normalizeCartItemDesignDomain({ ...uploadedItem, style });
assert.equal(contradictory.cartDesignValidation?.status, "invalid");

// The cart snapshot is a deep durable copy, not a pointer into mutable Studio state.
const sourceBeforeMutation = JSON.stringify(hydratedUploaded.cartDesignSource);
uploadedSource.uploadReference.designReferenceId = "mutated-studio-reference";
assert.equal(JSON.stringify(hydratedUploaded.cartDesignSource), sourceBeforeMutation);

const catalogOrder = createCatalogStoredOrderDesignSource(style.id);
assert.equal(catalogOrder?.kind, "catalog");
assert.equal(
  normalizeMasterOrderDesignDomain<{
    style?: StyleCategory;
    orderDesignSource?: StoredOrderDesignSource;
  }>({ style }).orderDesignSource?.kind,
  "catalog",
);
const draftOrder = createUploadedDraftStoredOrderDesignSource(uploadedSource);
assert.equal(draftOrder.kind, "uploaded");
assert.equal(draftOrder.kind === "uploaded" && draftOrder.imageState.kind, "draft_pending_trusted_transfer");
assert.equal(isUploadedOrderDesignImmutable(draftOrder), false);
const immutableOrder = {
  kind: "uploaded" as const,
  sourceKey: uploadedSource.sourceKey,
  displayLabel: uploadedSource.displayLabel,
  fabricCapacityComposition: uploadedSource.fabricCapacityComposition.map((spec) => ({ ...spec })),
  demographic: uploadedSource.demographic,
  imageState: {
    kind: "immutable_order_asset" as const,
    orderReference: {
      orderId: "ORDER-123",
      storagePath: "customer-order-designs/ORDER-123/original.png",
      mimeType: "image/png" as const,
      createdAt: "2026-08-12T01:00:00.000Z",
    },
  },
};
assert.equal(isUploadedOrderDesignImmutable(immutableOrder), true);
assert.equal(inspectCartDesignDomain(hydratedUploaded).status, "valid");

const checkout = revalidateCartForCheckout([hydratedUploaded], {
  fabrics: [fabric], styles: [style], batches: [], customDetailCatalog: [],
  businessSettings: { pricingSettings: { depositPercentage: 50, balancePercentage: 50, currency: "EUR", vatTaxPercentage: 0, discountRulesEnabled: false, standardAccessoryCharge: 0 } } as never,
  depositRatio: 0.5,
});
assert.equal(checkout.canProceed, false);
assert(checkout.blockers.includes(UPLOADED_DESIGN_TRUSTED_TRANSFER_BLOCKER));

console.log("PASS: source-aware cart and order domain foundation");
