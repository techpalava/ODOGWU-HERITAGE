import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type { BusinessSettings, CartItem, Fabric } from "./src/types";
import {
  createCartDesignPricingSnapshot,
  createCartDesignSource,
  getCartFabricQuantity,
  getCartGarmentAssignmentPresentation,
  UPLOADED_DESIGN_TRUSTED_TRANSFER_BLOCKER,
} from "./src/utils/cartDesignDomain";
import { calculateDesignPricing, resolveStructuredBaseGarmentPricing } from "./src/utils/designPricing";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { revalidateCartForCheckout } from "./src/utils/checkoutValidation";
import {
  confirmCartShippingReprice,
  migrateLegacyCartShippingItems,
} from "./src/utils/shippingPricing";

const settings = {
  pricingSettings: {
    depositPercentage: 50,
    balancePercentage: 50,
    currency: "EUR",
    vatTaxPercentage: 0,
    discountRulesEnabled: false,
    standardAccessoryCharge: 0,
  },
} as BusinessSettings;

const fabric = {
  code: "HI-TARGET",
  name: "Imperial Sapphire Link",
  description: "Fabric",
  color: "Blue",
  colorHex: "#0000aa",
  priceMultiplier: 1,
  category: "HiTarget Ankara",
  stockStatus: "IN_STOCK",
} as Fabric;

const cartSource = createCartDesignSource(
  {
    kind: "uploaded",
    sourceKey: "uploaded:checkout-design",
    displayLabel: "Your Uploaded Design",
    uploadReference: createCustomerDesignUploadReference({
      ownerUid: "owner-one",
      designReferenceId: "checkout-design",
      mimeType: "image/png",
      createdAt: "2026-08-12T00:00:00.000Z",
    }),
    fabricCapacityComposition: [
      { key: "main-shirt", garmentType: "shirt", fabricUnits: 1 },
    ],
    demographic: "male",
  },
  null,
);
assert.ok(cartSource && cartSource.kind === "uploaded");

const defaults = resolveStructuredBaseGarmentPricing(
  cartSource.fabricCapacityComposition,
).defaultSelections;
const allocations = [
  {
    allocationId: "allocation-1",
    fabricCode: fabric.code,
    garmentAssignments: [
      {
        garmentKey: "main-shirt",
        code: "UPLOADED_SHIRT",
        garmentType: "shirt" as const,
        fabricUnits: 1 as const,
        garmentSpec: { key: "main-shirt", garmentType: "shirt" as const, fabricUnits: 1 as const },
        sourceRole: "main" as const,
      },
      {
        garmentKey: "additional-shirt-1",
        code: "ADDITIONAL_SHIRT_1",
        garmentType: "shirt" as const,
        fabricUnits: 1 as const,
        garmentSpec: { key: "additional-shirt-1", garmentType: "shirt" as const, fabricUnits: 1 as const },
        sourceRole: "additional" as const,
        mainGarmentKey: "main-shirt",
        mainGarmentType: "shirt" as const,
        dependencyStatus: "valid" as const,
      },
    ],
  },
];
const materialPricing = resolveFabricAllocationMaterialPricing(allocations, [fabric]);
assert.equal(materialPricing.status, "resolved");
if (materialPricing.status !== "resolved") throw new Error("Expected material pricing.");
const pricing = calculateDesignPricing({
  route: "alone",
  design: defaults,
  materialPricing,
  designContext: cartSource,
  baseGarmentComposition: cartSource.fabricCapacityComposition,
  additionalGarments: allocations[0].garmentAssignments.filter(
    (assignment) => assignment.sourceRole === "additional",
  ),
  garment: { type: "Uploaded Shirt" },
  catalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings: settings,
});
assert.ok(pricing);

const item: CartItem = {
  id: "uploaded-cart-item",
  customer: { name: "Customer", email: "customer@example.com", phone: "" },
  cartDesignSource: cartSource,
  cartDesignPricingSnapshot: createCartDesignPricingSnapshot({
    garmentSubtotal: pricing.garmentSubtotal,
    capturedAt: "2026-08-12T00:00:00.000Z",
  }),
  fabric,
  fabricAllocations: allocations,
  design: defaults,
  garment: {
    type: "Uploaded Shirt",
    clothingPrice: pricing.clothingPrice,
    totalPrice: pricing.garmentSubtotal,
  },
  measurements: {
    height: 170, weight: 70, age: 30, bodyBuild: "Average",
    fitPreference: "Standard", neck: 15, shoulder: 18, chest: 40,
    waist: 34, hip: 40, sleeve: 24, trouserLength: 40, isAiEstimated: false,
  },
  specialInstructions: "",
  notesAboutLeftoverFabric: "",
  batchType: "alone",
  deliverySelection: {
    method: "PICKUP",
    pickupLocation: "Eindhoven",
    pickupWindow: "To be arranged",
  },
};

const synchronized = migrateLegacyCartShippingItems([item], "2026-08-12T00:00:00.000Z").items;
const context = {
  fabrics: [fabric],
  styles: [],
  batches: [],
  customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG,
  businessSettings: settings,
  depositRatio: 0.5,
};
const shippingConfirmed = confirmCartShippingReprice(synchronized);
const validResult = revalidateCartForCheckout(shippingConfirmed, context, "2026-08-12T00:01:00.000Z");
assert.equal(validResult.blockers.length, 1);
assert.deepEqual(validResult.blockers, [UPLOADED_DESIGN_TRUSTED_TRANSFER_BLOCKER]);
assert.equal(validResult.items[0].pricingReview?.status, "CURRENT");
assert.equal(getCartFabricQuantity(validResult.items[0]), 1);
assert.deepEqual(
  getCartGarmentAssignmentPresentation(validResult.items[0]).map((garment) => garment.role),
  ["Main", "Additional"],
);

const preparedResult = revalidateCartForCheckout(
  validResult.items,
  {
    ...context,
    preparedUploadedDesignReferences: {
      "uploaded-cart-item": {
        sourceKey: cartSource.sourceKey,
        designReferenceId: cartSource.uploadReference.designReferenceId,
        orderReference: {
          orderId: "CHECKOUT-001-uploaded-cart-item",
          storagePath:
            "customer-order-designs/owner-one/CHECKOUT-001-uploaded-cart-item/checkout-design/reference.png",
          mimeType: "image/png",
          createdAt: "2026-08-12T00:01:00.000Z",
        },
      },
    },
  },
  "2026-08-12T00:01:00.000Z",
);
assert.equal(preparedResult.blockers.includes(UPLOADED_DESIGN_TRUSTED_TRANSFER_BLOCKER), false);
assert.equal(preparedResult.canProceed, true);

const changedFabric: Fabric = { ...fabric, category: "Custom material", price: 12 };
const changedPrice = revalidateCartForCheckout(synchronized, { ...context, fabrics: [changedFabric] });
assert.equal(changedPrice.items[0].pricingReview?.status, "CONFIRMATION_REQUIRED");
assert(changedPrice.blockers.includes("Confirm the updated garment price before payment."));
assert(changedPrice.blockers.includes(UPLOADED_DESIGN_TRUSTED_TRANSFER_BLOCKER));

const unavailableFabric = revalidateCartForCheckout(synchronized, {
  ...context,
  fabrics: [{ ...fabric, stockStatus: "OUT_OF_STOCK" }],
});
assert(unavailableFabric.blockers.includes("Imperial Sapphire Link is currently unavailable."));

const orphaned = revalidateCartForCheckout(
  [{
    ...item,
    fabricAllocations: [{
      ...allocations[0],
      garmentAssignments: allocations[0].garmentAssignments.map((assignment) =>
        assignment.sourceRole === "additional"
          ? { ...assignment, dependencyStatus: "orphaned" as const }
          : assignment,
      ),
    }],
  }],
  context,
);
assert(orphaned.blockers.includes("Uploaded design has an orphaned Additional garment."));
assert.equal(orphaned.blockers.includes(UPLOADED_DESIGN_TRUSTED_TRANSFER_BLOCKER), false);

console.log("PASS: uploaded cart repricing and trusted-transfer checkout boundary");
