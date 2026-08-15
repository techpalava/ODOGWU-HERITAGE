import type {
  CartItem,
  Customer,
  GuestDesignDraft,
  GuestOrderSession,
} from "../types";
import { AuthorizationEngine } from "../engine/AuthorizationEngine";
import { migrateLegacyCartShippingItems } from "../utils/shippingPricing";
import {
  cloneFabricAllocations,
  inspectCartItemFabricAllocations,
  inspectDraftFabricAllocations,
  resolveLegacyCartItemFabricAllocations,
  resolveLegacyDraftFabricAllocations,
} from "../utils/fabricAllocationPersistence";
import { reconcileGuestDesignDraftDesignSource } from "../utils/designSourceState";
import { reconcileGuestDesignDraftGarmentTypeSelection } from "../utils/garmentTypeStepState";
import { normalizeGarmentScopedCustomDetailsState } from "../utils/garmentScopedCustomDetailsState";
import { normalizeGarmentScopedCustomDetailInputs } from "../utils/garmentScopedCustomDetailInputsState";
import { normalizeAiTryOnWorkflowState } from "../utils/aiTryOnWorkflow";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "../utils/designSourceJourney";
import {
  createEmptyFutureMeasurementState,
  migrateLegacyManualMeasurements,
  normalizeFutureMeasurementState,
} from "../utils/measurementBlueprint";
import {
  createDesignStudioDraftRepository,
  type DesignStudioDraftRepository,
} from "../utils/designStudioDraftPersistence";
import {
  getCartDesignConfigurationFingerprintInput,
  normalizeCartItemDesignDomain,
} from "../utils/cartDesignDomain";
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

export const normalizeGuestDesignDraft = (
  designDraft: GuestDesignDraft,
): GuestDesignDraft => {
  const sourceReconciledDraft = reconcileGuestDesignDraftDesignSource(designDraft);
  const garmentTypeReconciledDraft = reconcileGuestDesignDraftGarmentTypeSelection(
    sourceReconciledDraft,
  );
  const normalizedAiTryOnWorkflow = normalizeAiTryOnWorkflowState(
    garmentTypeReconciledDraft.aiTryOnWorkflow,
  );
  const normalizedMeasurementState =
    garmentTypeReconciledDraft.futureMeasurementState === undefined
      ? garmentTypeReconciledDraft.journeySchemaVersion ===
        DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION
        ? migrateLegacyManualMeasurements(
            garmentTypeReconciledDraft.measurements,
            garmentTypeReconciledDraft.sizingMode,
          )
        : null
      : normalizeFutureMeasurementState(
          garmentTypeReconciledDraft.futureMeasurementState,
        ) || createEmptyFutureMeasurementState();
  const {
    aiTryOnWorkflow: _discardedAiTryOnWorkflow,
    futureMeasurementState: _discardedFutureMeasurementState,
    ...draftWithoutAiTryOnWorkflow
  } = garmentTypeReconciledDraft;
  const workflowReconciledDraft: GuestDesignDraft = {
    ...draftWithoutAiTryOnWorkflow,
    ...(normalizedAiTryOnWorkflow
      ? { aiTryOnWorkflow: normalizedAiTryOnWorkflow }
      : {}),
    ...(normalizedMeasurementState
      ? { futureMeasurementState: normalizedMeasurementState }
      : {}),
  };
  const scopedCustomDetails =
    workflowReconciledDraft.designSelections.garmentScopedCustomDetails;
  const scopedCustomDetailInputs =
    workflowReconciledDraft.designSelections.garmentScopedCustomDetailInputs;
  const reconciledDraft =
    scopedCustomDetails === undefined && scopedCustomDetailInputs === undefined
      ? workflowReconciledDraft
      : {
          ...workflowReconciledDraft,
          designSelections: {
            ...workflowReconciledDraft.designSelections,
            ...(scopedCustomDetails === undefined
              ? {}
              : {
                  garmentScopedCustomDetails:
                    normalizeGarmentScopedCustomDetailsState(scopedCustomDetails)
                      .state,
                }),
            ...(scopedCustomDetailInputs === undefined
              ? {}
              : {
                  garmentScopedCustomDetailInputs:
                    normalizeGarmentScopedCustomDetailInputs(
                      scopedCustomDetailInputs,
                    ).state,
                }),
          },
        };
  const modernInspection = inspectDraftFabricAllocations(reconciledDraft);
  if (modernInspection.status === "valid") {
    return {
      ...reconciledDraft,
      fabricAllocations: cloneFabricAllocations(modernInspection.fabricAllocations),
    };
  }
  if (modernInspection.status === "invalid") {
    return reconciledDraft;
  }

  const legacyAllocations = resolveLegacyDraftFabricAllocations(reconciledDraft);
  if (!legacyAllocations) return reconciledDraft;
  return {
    ...reconciledDraft,
    fabricAllocations: cloneFabricAllocations(legacyAllocations),
  };
};

const normalizeCartItemForPersistence = (item: CartItem): CartItem => {
  const modernInspection = inspectCartItemFabricAllocations(item);
  if (modernInspection.status === "valid") {
    return normalizeCartItemDesignDomain({
      ...item,
      fabricAllocations: cloneFabricAllocations(modernInspection.fabricAllocations),
    });
  }
  if (modernInspection.status === "invalid") {
    return normalizeCartItemDesignDomain(item);
  }

  const legacyAllocations = resolveLegacyCartItemFabricAllocations(item);
  if (!legacyAllocations) return normalizeCartItemDesignDomain(item);
  return normalizeCartItemDesignDomain({
    ...item,
    fabricAllocations: cloneFabricAllocations(legacyAllocations),
  });
};

const normalizeCartItemsForPersistence = (items: CartItem[]): CartItem[] =>
  items.map((item) => {
    const normalizedItem = normalizeCartItemForPersistence(item);
    return {
      ...normalizedItem,
      configurationHash: getCartItemConfigurationHash(normalizedItem),
    };
  });

const normalizeSessionForPersistence = (
  session: GuestOrderSession,
): GuestOrderSession => {
  const normalizedCartItems = normalizeCartItemsForPersistence(session.cartItems);
  const normalizedDraft = session.designDraft
    ? normalizeGuestDesignDraft(session.designDraft)
    : undefined;
  if (normalizedDraft === undefined) {
    const { designDraft: _designDraft, ...sessionWithoutDraft } = session;
    return {
      ...sessionWithoutDraft,
      cartItems: normalizedCartItems,
    };
  }
  return {
    ...session,
    cartItems: normalizedCartItems,
    designDraft: normalizedDraft,
  };
};

const persistNormalizedSessionIfChanged = (
  session: GuestOrderSession,
): GuestOrderSession => {
  const normalized = normalizeSessionForPersistence(session);
  if (stableSerialize(normalized) !== stableSerialize(session)) {
    StorageService.saveGuestOrderSession(normalized);
  }
  return normalized;
};

export const getCartItemConfigurationHash = (
  item: CartItem,
): string => {
  return `cartcfg_${getStableHash(getCartDesignConfigurationFingerprintInput(item))}`;
};

export const createGuestOrderSession = (
  cartItems: CartItem[] = [],
  createdAt = new Date().toISOString(),
): GuestOrderSession => {
  const guestCartId = createGuestCartId();
  const normalizedItems = normalizeCartItemsForPersistence(
    cartItems.map((item) => ({
      ...item,
      guestCartId,
    })),
  );
  const migratedItems = migrateLegacyCartShippingItems(
    normalizedItems,
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
    return persistNormalizedSessionIfChanged(stored);
  }

  const legacyItems = StorageService.getCartItems();
  const session = createGuestOrderSession(legacyItems);
  StorageService.saveGuestOrderSession(session);
  if (legacyItems.length > 0) {
    StorageService.clearCartItems();
  }
  return session;
};

const loadLegacyDesignDraft = (): GuestDesignDraft | null =>
  getOrCreateActiveGuestSession().designDraft || null;

const saveLegacyDesignDraft = (designDraft: GuestDesignDraft): void => {
  const session = getOrCreateActiveGuestSession();
  StorageService.saveGuestOrderSession({
    ...session,
    designDraft: normalizeGuestDesignDraft(designDraft),
    updatedAt: designDraft.updatedAt,
  });
};

const clearLegacyDesignDraft = (): void => {
  const session = getOrCreateActiveGuestSession();
  const { designDraft: _discarded, ...sessionWithoutDraft } = session;
  StorageService.saveGuestOrderSession({
    ...sessionWithoutDraft,
    updatedAt: new Date().toISOString(),
  });
};

const getDesignStudioDraftRepository =
  (): DesignStudioDraftRepository | null => {
    if (typeof window === "undefined") return null;
    return createDesignStudioDraftRepository({
      storage: window.localStorage,
      legacy: {
        // Migration inspects the stored source without normalizing or rewriting it.
        load: () => StorageService.getGuestOrderSession()?.designDraft || null,
        save: saveLegacyDesignDraft,
        clear: clearLegacyDesignDraft,
      },
      normalizeDraft: normalizeGuestDesignDraft,
      legacySourceVersion: GUEST_ORDER_SESSION_VERSION,
    });
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
  const merged = normalizeCartItemsForPersistence(accountItems);
  let addedItemCount = 0;

  guestItems.forEach((item) => {
    const normalizedItem = normalizeCartItemForPersistence(item);
    const configurationHash = getCartItemConfigurationHash(normalizedItem);
    if (
      existingIds.has(item.id) ||
      previouslyClaimedHashes.has(configurationHash)
    ) {
      return;
    }
    merged.push({
      ...normalizedItem,
      customer: {
        ...normalizedItem.customer,
        name: customer.name || normalizedItem.customer.name,
        email: canonicalEmail,
        phone: normalizedItem.customer.phone || customer.phone,
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
    const normalizedItems = normalizeCartItemsForPersistence(
      items.map((item) => ({
        ...item,
        guestCartId: session.guestCartId,
      })),
    );
    const migratedItems = migrateLegacyCartShippingItems(
      normalizedItems,
      now,
    ).items;
    StorageService.saveGuestOrderSession({
      ...session,
      updatedAt: now,
      cartItems: migratedItems,
    });
    return migratedItems;
  },

  getLegacyDesignDraft: (): GuestDesignDraft | null =>
    loadLegacyDesignDraft(),

  saveLegacyDesignDraft: (designDraft: GuestDesignDraft): void => {
    saveLegacyDesignDraft(designDraft);
  },

  clearLegacyDesignDraft: (): void => {
    clearLegacyDesignDraft();
  },

  getFutureDesignDraft: (): GuestDesignDraft | null => {
    const repository = getDesignStudioDraftRepository();
    if (!repository) return null;
    const result = repository.loadFutureDraftWithMigration();
    return result.status === "loaded" ? result.draft : null;
  },

  saveFutureDesignDraft: (designDraft: GuestDesignDraft): void => {
    getDesignStudioDraftRepository()?.saveFutureDraftV1(designDraft);
  },

  clearFutureDesignDraft: (): void => {
    getDesignStudioDraftRepository()?.clearFutureDraftV1();
  },

  getFutureDesignDraftMigrationResult: () =>
    getDesignStudioDraftRepository()?.readMigrationResult() || null,

  recordFutureDesignDraftCloudSynchronization: (
    ownerUid: string,
    cloudRevision: number,
  ) =>
    getDesignStudioDraftRepository()?.recordCloudSynchronization({
      ownerUid,
      cloudRevision,
    }) || null,

  getFutureDesignDraftCloudSynchronization: () =>
    getDesignStudioDraftRepository()?.readCloudSyncResult() || null,

  clearFutureDesignDraftAfterCloudSynchronization: () =>
    getDesignStudioDraftRepository()?.clearFutureDraftAfterCloudSynchronization() ||
    false,

  // Compatibility aliases remain legacy-only for existing production callers.
  getGuestDesignDraft: (): GuestDesignDraft | null =>
    loadLegacyDesignDraft(),

  saveGuestDesignDraft: (designDraft: GuestDesignDraft): void => {
    saveLegacyDesignDraft(designDraft);
  },

  clearGuestDesignDraft: (): void => {
    clearLegacyDesignDraft();
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
    const normalizedItems = normalizeCartItemsForPersistence(
      StorageService.getAccountCartItems(canonicalEmail),
    );
    return migrateLegacyCartShippingItems(normalizedItems).items;
  },

  saveAccountCartItems: (
    email: string,
    items: CartItem[],
  ): CartItem[] => {
    const canonicalEmail = AuthorizationEngine.getCanonicalEmail(email);
    const normalizedItems = normalizeCartItemsForPersistence(items);
    const migratedItems = migrateLegacyCartShippingItems(
      normalizedItems,
    ).items;
    StorageService.saveAccountCartItems(canonicalEmail, migratedItems);
    return migratedItems;
  },

  claimGuestCart: (customer: Customer): GuestCartClaimResult => {
    const canonicalEmail = AuthorizationEngine.getCanonicalEmail(
      customer.email,
    );
    const rawStoredSession = StorageService.getGuestOrderSession();
    const storedSession = rawStoredSession
      ? normalizeSessionForPersistence(rawStoredSession)
      : null;
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
