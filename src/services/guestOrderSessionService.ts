import type {
  CartItem,
  Customer,
  GuestDesignDraft,
  GuestOrderSession,
} from "../types";
import { AuthorizationEngine } from "../engine/AuthorizationEngine";
import { migrateLegacyCartShippingItems } from "../utils/shippingPricing";
import { StorageService } from "./storageService";

export const GUEST_ORDER_SESSION_VERSION = "2026-07-30-guest-order-v1";

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableSerialize(entryValue)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const getStableHash = (value: unknown): string => {
  const serialized = stableSerialize(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const createGuestCartId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `guest_${globalThis.crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `guest_${token}`;
};

export const getCartItemConfigurationHash = (
  item: CartItem,
): string =>
  `cartcfg_${getStableHash({
    styleId: item.style.id,
    fabricCode: item.fabric.code,
    additionalFabrics: item.additionalFabrics?.map((f) => f.code),
    fabricAllocations: item.fabricAllocations?.map((a) => ({
      id: a.id,
      fabricCode: a.fabric.code,
      assignments: a.garmentAssignments,
    })),
    design: item.design,
    garmentType: item.garment.type,
    measurements: item.measurements,
    specialInstructions: item.specialInstructions,
    notesAboutLeftoverFabric: item.notesAboutLeftoverFabric,
    batchType: item.batchType,
    batchId: item.batchId,
    batchName: item.batchName,
    customGroupCode: item.customGroupCode,
    garmentPieceCount: item.garmentPieceCount,
    deliverySelection: item.deliverySelection,
  })}`;

export const createGuestOrderSession = (
  cartItems: CartItem[] = [],
  createdAt = new Date().toISOString(),
): GuestOrderSession => {
  const guestCartId = createGuestCartId();
  const migratedItems = migrateLegacyCartShippingItems(
    cartItems.map((item) => ({
      ...item,
      guestCartId,
      configurationHash: getCartItemConfigurationHash(item),
    })),
    createdAt,
  ).items;

  return {
    schemaVersion: GUEST_ORDER_SESSION_VERSION,
    guestCartId,
    status: "ACTIVE",
    createdAt,
    updatedAt: createdAt,
    checkoutIntent: false,
    cartItems: migratedItems,
  };
};

const getOrCreateActiveGuestSession = (): GuestOrderSession => {
  const stored = StorageService.getGuestOrderSession();
  if (
    stored?.schemaVersion === GUEST_ORDER_SESSION_VERSION &&
    stored.status === "ACTIVE"
  ) {
    return stored;
  }

  const legacyItems = StorageService.getCartItems();
  const session = createGuestOrderSession(legacyItems);
  StorageService.saveGuestOrderSession(session);
  if (legacyItems.length > 0) {
    StorageService.clearCartItems();
  }
  return session;
};

export interface GuestCartClaimResult {
  items: CartItem[];
  claimed: boolean;
  addedItemCount: number;
}

const mergeCartItems = (
  accountItems: CartItem[],
  guestItems: CartItem[],
  customer: Customer,
  guestCartId: string,
): { items: CartItem[]; addedItemCount: number } => {
  const canonicalEmail = AuthorizationEngine.getCanonicalEmail(
    customer.email,
  );
  const existingIds = new Set(accountItems.map((item) => item.id));
  const previouslyClaimedHashes = new Set(
    accountItems
      .filter((item) => item.guestCartId === guestCartId)
      .map((item) => getCartItemConfigurationHash(item)),
  );
  const merged = accountItems.map((item) => ({
    ...item,
    configurationHash: getCartItemConfigurationHash(item),
  }));
  let addedItemCount = 0;

  guestItems.forEach((item) => {
    const configurationHash = getCartItemConfigurationHash(item);
    if (
      existingIds.has(item.id) ||
      previouslyClaimedHashes.has(configurationHash)
    ) {
      return;
    }
    merged.push({
      ...item,
      customer: {
        ...item.customer,
        name: customer.name || item.customer.name,
        email: canonicalEmail,
        phone: item.customer.phone || customer.phone,
      },
      guestCartId,
      configurationHash,
      claimedByEmail: canonicalEmail,
    });
    existingIds.add(item.id);
    previouslyClaimedHashes.add(configurationHash);
    addedItemCount += 1;
  });

  return { items: merged, addedItemCount };
};

export const GuestOrderSessionService = {
  getActiveSession: (): GuestOrderSession =>
    getOrCreateActiveGuestSession(),

  getGuestCartItems: (): CartItem[] => {
    const session = getOrCreateActiveGuestSession();
    return migrateLegacyCartShippingItems(session.cartItems).items;
  },

  saveGuestCartItems: (items: CartItem[]): CartItem[] => {
    const session = getOrCreateActiveGuestSession();
    const now = new Date().toISOString();
    const migratedItems = migrateLegacyCartShippingItems(
      items.map((item) => ({
        ...item,
        guestCartId: session.guestCartId,
        configurationHash: getCartItemConfigurationHash(item),
      })),
      now,
    ).items;
    StorageService.saveGuestOrderSession({
      ...session,
      updatedAt: now,
      cartItems: migratedItems,
    });
    return migratedItems;
  },

  getGuestDesignDraft: (): GuestDesignDraft | null =>
    getOrCreateActiveGuestSession().designDraft || null,

  saveGuestDesignDraft: (designDraft: GuestDesignDraft): void => {
    const session = getOrCreateActiveGuestSession();
    StorageService.saveGuestOrderSession({
      ...session,
      designDraft,
      updatedAt: designDraft.updatedAt,
    });
  },

  clearGuestDesignDraft: (): void => {
    const session = getOrCreateActiveGuestSession();
    const { designDraft: _discarded, ...sessionWithoutDraft } = session;
    StorageService.saveGuestOrderSession({
      ...sessionWithoutDraft,
      updatedAt: new Date().toISOString(),
    });
  },

  setCheckoutIntent: (checkoutIntent: boolean): void => {
    const session = getOrCreateActiveGuestSession();
    StorageService.saveGuestOrderSession({
      ...session,
      checkoutIntent,
      updatedAt: new Date().toISOString(),
    });
  },

  getCheckoutIntent: (): boolean =>
    getOrCreateActiveGuestSession().checkoutIntent,

  getAccountCartItems: (email: string): CartItem[] => {
    const canonicalEmail = AuthorizationEngine.getCanonicalEmail(email);
    return migrateLegacyCartShippingItems(
      StorageService.getAccountCartItems(canonicalEmail),
    ).items;
  },

  saveAccountCartItems: (
    email: string,
    items: CartItem[],
  ): CartItem[] => {
    const canonicalEmail = AuthorizationEngine.getCanonicalEmail(email);
    const migratedItems = migrateLegacyCartShippingItems(
      items.map((item) => ({
        ...item,
        configurationHash: getCartItemConfigurationHash(item),
      })),
    ).items;
    StorageService.saveAccountCartItems(canonicalEmail, migratedItems);
    return migratedItems;
  },

  claimGuestCart: (customer: Customer): GuestCartClaimResult => {
    const canonicalEmail = AuthorizationEngine.getCanonicalEmail(
      customer.email,
    );
    const storedSession = StorageService.getGuestOrderSession();
    const accountItems = GuestOrderSessionService.getAccountCartItems(
      canonicalEmail,
    );

    if (
      !storedSession ||
      storedSession.status === "CLAIMED" ||
      storedSession.cartItems.length === 0
    ) {
      return {
        items: accountItems,
        claimed: false,
        addedItemCount: 0,
      };
    }

    const merge = mergeCartItems(
      accountItems,
      storedSession.cartItems,
      customer,
      storedSession.guestCartId,
    );
    const migratedItems = migrateLegacyCartShippingItems(merge.items).items;

    // Persist the authenticated cart before removing any guest data.
    StorageService.saveAccountCartItems(canonicalEmail, migratedItems);
    const now = new Date().toISOString();
    StorageService.saveGuestOrderSession({
      ...storedSession,
      status: "CLAIMED",
      checkoutIntent: false,
      cartItems: [],
      designDraft: undefined,
      claimedAt: now,
      claimedByEmail: canonicalEmail,
      updatedAt: now,
    });

    return {
      items: migratedItems,
      claimed: true,
      addedItemCount: merge.addedItemCount,
    };
  },
};
