import assert from "node:assert/strict";
import type {
  Batch,
  BusinessSettings,
  CartItem,
  GuestDesignDraft,
  StyleCategory,
  Fabric,
} from "./src/types";
import { AuthorizationEngine } from "./src/engine/AuthorizationEngine";
import {
  findCustomerByEmail,
  resolveGoogleCustomer,
} from "./src/services/customerAccountService";
import {
  confirmCartPricingUpdates,
  revalidateCartForCheckout,
} from "./src/utils/checkoutValidation";
import {
  getCartItemGarmentSubtotal,
  stampCurrentCartShippingItem,
} from "./src/utils/shippingPricing";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const memoryStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: memoryStorage,
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: memoryStorage },
});

const { StorageService } = await import(
  "./src/services/storageService"
);
const {
  GuestOrderSessionService,
  getCartItemConfigurationHash,
} = await import("./src/services/guestOrderSessionService");

const style: StyleCategory = {
  id: "guest-style",
  name: "Guest Test Style",
  description: "A checkout test style.",
  gender: "male",
  options: [],
  customDetailConfig: {
    representedGenders: ["male"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: ["neck"],
    requiredSelectionGroups: ["neck_design"],
    enabled: true,
  },
};

const fabric: Fabric = {
  code: "GUEST-001",
  name: "HiTarget Ankara",
  description: "Guest test fabric",
  color: "Green",
  colorHex: "#006b54",
  priceMultiplier: 1,
  category: "HiTarget Ankara",
  stockStatus: "IN_STOCK",
};

const businessSettings = {
  pricingSettings: {
    depositPercentage: 50,
    balancePercentage: 50,
    currency: "EUR",
    vatTaxPercentage: 0,
    discountRulesEnabled: false,
    standardAccessoryCharge: 10,
  },
} as BusinessSettings;

const makeCartItem = (
  id: string,
  overrides: Partial<CartItem> = {},
): CartItem => {
  const item = {
    id,
    customer: {
      name: "Guest Customer",
      email: "",
      phone: "",
    },
    style,
    fabric,
    design: {
      customDetails: {
        neck_design: "neck_no_round",
      },
    },
    garment: {
      type: "Shirt Only",
      totalPrice: 7.97,
      fabricPrice: 3.91,
      fabricSewingCost: 4.06,
    },
    measurements: {
      height: 178,
      weight: 78,
      age: 35,
      bodyBuild: "Average",
      fitPreference: "Standard",
      neck: 16,
      shoulder: 18,
      chest: 42,
      waist: 36,
      hip: 42,
      sleeve: 25,
      trouserLength: 41,
      isAiEstimated: false,
    },
    specialInstructions: "",
    notesAboutLeftoverFabric: "",
    batchType: "alone",
    garmentPieceCount: 1,
    deliverySelection: {
      method: "PICKUP",
      pickupLocation: "Veldhoven Campus Lockers",
    },
    ...overrides,
  } as CartItem;
  return stampCurrentCartShippingItem(
    item,
    "2026-07-30T10:00:00.000Z",
  );
};

const checkoutContext = {
  fabrics: [fabric],
  styles: [style],
  batches: [] as Batch[],
  customDetailCatalog: [],
  businessSettings,
  depositRatio: 0.5,
};

assert.equal(
  AuthorizationEngine.canAccessRoute("design", null),
  true,
  "guests can enter Design Studio",
);
assert.equal(
  AuthorizationEngine.canAccessRoute("dashboard", null),
  false,
  "guests cannot enter the customer dashboard",
);
assert.equal(
  AuthorizationEngine.canAccessRoute("database", null),
  false,
  "guests cannot enter the Admin Portal",
);
assert.equal(
  AuthorizationEngine.canSubmitOrder(null),
  false,
  "guests cannot submit payment",
);

const existingCustomer = {
  name: "Existing Customer",
  email: "first.last+orders@gmail.com",
  phone: "",
  passcode: "1234",
};
assert.equal(
  findCustomerByEmail(
    [existingCustomer],
    "f.i.r.s.t.l.a.s.t@gmail.com",
  ),
  existingCustomer,
  "canonical Gmail matching reuses the existing customer",
);
const existingResolution = resolveGoogleCustomer(
  [existingCustomer],
  {
    email: "firstlast@googlemail.com",
    displayName: "Duplicate Attempt",
  },
);
assert.equal(existingResolution.created, false);
assert.equal(existingResolution.customers.length, 1);

const newResolution = resolveGoogleCustomer([], {
  email: "new.customer@gmail.com",
  displayName: "New Customer",
});
assert.equal(newResolution.created, true);
assert.equal(
  newResolution.customer.role,
  AuthorizationEngine.ROLES.CUSTOMER,
);

memoryStorage.clear();
const firstSession = GuestOrderSessionService.getActiveSession();
assert.match(
  firstSession.guestCartId,
  /^guest_[0-9a-f-]{32,}$/,
  "guest cart IDs are random UUID/crypto tokens",
);

const guestDraft = {
  currentStep: 7,
  selectedFabricCode: fabric.code,
  selectedStyleId: style.id,
  selectedGarment: {
    type: "Shirt Only",
    fee: 0,
  },
  designSelections: {},
  measurements: makeCartItem("draft").measurements,
  sizingMode: "manual",
  deliveryMethod: "PICKUP",
  deliveryAddress: {
    addressLine1: "",
    city: "",
    postalCode: "",
    countryCode: "",
  },
  pickupTime: "Monday Afternoon",
  customerName: "Guest Customer",
  customerEmail: "",
  customerPhone: "",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "Keep the fit relaxed.",
  leftoverFabricChoice: "Return leftover fabric",
  hasLining: false,
  pricingBreakdown: {
    fabricPrice: 3.91,
    fabricSewingCost: 4.06,
    constructionSewingCost: 0,
    customDetailsPrice: 0,
    lagosToEindhovenShipping: 131.25,
    eindhovenToDestinationShipping: 0,
    total: 139.22,
  },
  shippingSnapshot: {},
  updatedAt: "2026-07-30T10:00:00.000Z",
} satisfies GuestDesignDraft;
GuestOrderSessionService.saveGuestDesignDraft(guestDraft);
assert.deepEqual(
  GuestOrderSessionService.getGuestDesignDraft(),
  guestDraft,
  "guest design step and configuration survive storage reload",
);

const firstItem = makeCartItem("guest-item-1");
const savedGuestItems =
  GuestOrderSessionService.saveGuestCartItems([firstItem]);
assert.equal(savedGuestItems.length, 1);
assert.equal(
  GuestOrderSessionService.getGuestCartItems()[0].style.id,
  style.id,
  "guest cart survives refresh",
);
const originalHash = savedGuestItems[0].configurationHash;
const editedItems = GuestOrderSessionService.saveGuestCartItems([
  {
    ...savedGuestItems[0],
    garmentPieceCount: 2,
    shippingSnapshot: undefined,
  },
]);
assert.notEqual(
  editedItems[0].configurationHash,
  originalHash,
  "editing quantity refreshes the configuration hash",
);
GuestOrderSessionService.saveGuestCartItems([]);
assert.equal(
  GuestOrderSessionService.getGuestCartItems().length,
  0,
  "guests can remove cart items",
);

StorageService.clearGuestOrderSession();
const duplicateConfiguration = makeCartItem("account-item");
GuestOrderSessionService.saveAccountCartItems(
  "customer@gmail.com",
  [duplicateConfiguration],
);
const sameConfiguration = {
  ...duplicateConfiguration,
  id: "guest-duplicate",
};
const uniqueConfiguration = makeCartItem("guest-unique", {
  style: {
    ...style,
    id: "guest-style-two",
    name: "Second Guest Style",
  },
});
GuestOrderSessionService.saveGuestCartItems([
  sameConfiguration,
  uniqueConfiguration,
]);
GuestOrderSessionService.setCheckoutIntent(true);
const beforeClaim = GuestOrderSessionService.getActiveSession();
assert.equal(beforeClaim.checkoutIntent, true);
assert.equal(beforeClaim.cartItems.length, 2);

const claimed = GuestOrderSessionService.claimGuestCart({
  name: "Customer",
  email: "customer@gmail.com",
  phone: "",
});
assert.equal(claimed.claimed, true);
assert.equal(claimed.addedItemCount, 2);
assert.equal(
  claimed.items.length,
  3,
  "an existing identical account item is preserved alongside the guest cart",
);
assert.equal(
  claimed.items.filter((item) => item.guestCartId).length,
  2,
);

StorageService.saveGuestOrderSession({
  ...beforeClaim,
  status: "ACTIVE",
});
const retryAfterPartialPersistence =
  GuestOrderSessionService.claimGuestCart({
    name: "Customer",
    email: "customer@gmail.com",
    phone: "",
  });
assert.equal(retryAfterPartialPersistence.addedItemCount, 0);
assert.equal(
  retryAfterPartialPersistence.items.length,
  3,
  "guestCartId and configuration hash make a partial claim retry idempotent",
);
const repeatedClaim = GuestOrderSessionService.claimGuestCart({
  name: "Customer",
  email: "customer@gmail.com",
  phone: "",
});
assert.equal(repeatedClaim.claimed, false);
assert.equal(
  repeatedClaim.items.length,
  3,
  "a repeated login callback cannot claim the same guest cart twice",
);
assert.equal(
  StorageService.getGuestOrderSession()?.status,
  "CLAIMED",
);

StorageService.clearGuestOrderSession();
GuestOrderSessionService.saveGuestCartItems([firstItem]);
GuestOrderSessionService.setCheckoutIntent(true);
assert.equal(
  GuestOrderSessionService.getGuestCartItems().length,
  1,
  "a failed or cancelled login leaves the guest cart intact",
);
assert.equal(
  GuestOrderSessionService.getCheckoutIntent(),
  true,
);

const currentValidation = revalidateCartForCheckout(
  [firstItem],
  checkoutContext,
  "2026-07-30T10:05:00.000Z",
);
assert.deepEqual(currentValidation.blockers, []);
assert.equal(currentValidation.canProceed, true);
assert.equal(currentValidation.changed, true);
const repeatedValidation = revalidateCartForCheckout(
  currentValidation.items,
  checkoutContext,
  "2026-07-30T10:06:00.000Z",
);
assert.equal(
  repeatedValidation.changed,
  false,
  "unchanged authoritative pricing is idempotent across retries",
);

const updatedFabric: Fabric = {
  ...fabric,
  category: "Future Fabric",
  name: "Future Fabric",
  price: 15,
};
const changedPriceValidation = revalidateCartForCheckout(
  [firstItem],
  {
    ...checkoutContext,
    fabrics: [updatedFabric],
  },
  "2026-07-30T10:07:00.000Z",
);
assert.equal(
  changedPriceValidation.items[0].pricingReview?.status,
  "CONFIRMATION_REQUIRED",
);
assert.ok(
  changedPriceValidation.blockers.some((reason) =>
    /updated garment price/i.test(reason),
  ),
);
assert.equal(changedPriceValidation.canProceed, false);
const acceptedPriceItems = confirmCartPricingUpdates(
  changedPriceValidation.items,
  "2026-07-30T10:08:00.000Z",
);
assert.equal(
  acceptedPriceItems[0].pricingReview?.status,
  "CURRENT",
);
assert.equal(
  getCartItemGarmentSubtotal(acceptedPriceItems[0]),
  15,
);

const missingShippingItem = {
  ...firstItem,
  deliverySelection: undefined,
  shippingSnapshot: undefined,
};
const missingShippingValidation = revalidateCartForCheckout(
  [missingShippingItem],
  checkoutContext,
);
assert.equal(missingShippingValidation.canProceed, false);
assert.ok(
  missingShippingValidation.blockers.some((reason) =>
    /review shipping details/i.test(reason),
  ),
);

const closedBatch: Batch = {
  id: "closed-batch",
  batchNumber: 9,
  name: "Closed Batch",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  duration: "30 days",
  targetGarments: 40,
  currentGarments: 40,
  currentOrders: 20,
  currentCustomers: 20,
  status: "CLOSED",
  allowOrders: false,
  visibility: "PUBLIC",
};
const closedBatchItem = makeCartItem("closed-batch-item", {
  batchType: "community",
  batchId: closedBatch.id,
  batchName: closedBatch.name,
});
const closedBatchValidation = revalidateCartForCheckout(
  [closedBatchItem],
  {
    ...checkoutContext,
    batches: [closedBatch],
  },
);
assert.equal(closedBatchValidation.canProceed, false);
assert.deepEqual(closedBatchValidation.rerouteItemIds, [
  closedBatchItem.id,
]);
assert.ok(
  closedBatchValidation.blockers.some((reason) =>
    /no longer joinable/i.test(reason),
  ),
  "a closed batch preserves the design and offers a valid reroute",
);
assert.equal(
  closedBatchItem.batchType,
  "community",
  "checkout revalidation does not mutate the original cart item",
);

assert.notEqual(
  getCartItemConfigurationHash(firstItem),
  getCartItemConfigurationHash({
    ...firstItem,
    garmentPieceCount: 3,
  }),
);

console.log("PASS: guest-first ordering and checkout regression suite");
