import { AuthorizationEngine } from "../engine/AuthorizationEngine";
import { create } from "zustand";
import { CustomDetailOption, Customer, 
  MasterOrder,
  CustomGroup,
  Fabric,
  StyleCategory,
  Showpiece,
  CommunityPhoto,
  HistoricalOrder,
  CartItem,
  OrderContext,
  Batch,
  BusinessSettings,
  MediaItem,
  Plugin,
  AuditLog,
  Role,
  ReferenceDataGroup,
} from "../types";
import { ApiService } from "../services/api";
import {
  DEFAULT_BUSINESS_SETTINGS,
} from "../data/mockData";
import { StorageService } from "../services/storageService";
import { FabricService } from "../services/fabricService";
import { auth, db } from "../services/firebase";
import {
  onAuthStateChanged,
  onIdTokenChanged,
} from "firebase/auth";
import { processDynamicBatches } from "../utils/batchUtils";
import { migrateLegacyCartShippingItems } from "../utils/shippingPricing";
import { GuestOrderSessionService } from "../services/guestOrderSessionService";
import { FirebaseCustomerAuth } from "../services/firebaseCustomerAuth";
import { guestUploadedDesignOwnershipContinuity } from "../services/guestUploadedDesignOwnershipContinuity";
import { DesignStyleAuthorityService } from "../services/designStyleAuthorityService";
import type { StylesLoadState } from "../utils/stylesCatalogueLoadState";
import {
  applyStylesCatalogueListenerEvent,
  invalidateStylesCatalogueLoadGeneration,
  isCurrentStylesCatalogueLoadGeneration,
} from "../utils/stylesCatalogueLoadState";
import {
  createFirestorePrivateBatchSubscriptionAdapter,
  createPrivateBatchSubscriptionController,
  type PrivateBatchSubscriptionAdapter,
} from "../services/privateBatchGroupSubscriptions";
import { createPrivateBatchAccessSession } from "../services/privateBatchAccessSession";
import type { PrivateBatchAccessById } from "../utils/orderContextIdentity";
import { createPrivateBatchAuthCoordinator } from "../services/privateBatchAuthCoordinator";

export interface AppState {

  // Navigation & UI
  activeTab:
    | "home"
    | "design"
    | "dashboard"
    | "about"
    | "gallery"
    | "database"
    | "custom-order" | "login";
  pendingRedirect: string | null;
  setPendingRedirect: (redirect: string | null) => void;
  setActiveTab: (
    tab:
      | "home"
      | "design"
      | "dashboard"
      | "about"
      | "gallery"
      | "database"
      | "custom-order" | "login",
  ) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (isOpen: boolean) => void;
  notification: { message: string; type: "success" | "info" } | null;
  setNotification: (
    notif: { message: string; type: "success" | "info" } | null,
  ) => void;

  // Presets & Context
  presetStyleId: string | null;
  setPresetStyleId: (id: string | null) => void;
  presetFabricCode: string | null;
  setPresetFabricCode: (code: string | null) => void;
  orderContext: OrderContext | null;
  setOrderContext: (ctx: OrderContext | null) => void;

  // Checkout UI
  isCheckoutPaymentOpen: boolean;
  setIsCheckoutPaymentOpen: (isOpen: boolean) => void;
  isCartOpen: boolean;
  setIsCartOpen: (isOpen: boolean) => void;
  guestCartId: string;
  checkoutIntent: boolean;
  setCheckoutIntent: (required: boolean) => void;

  // Data State
  isLoadingData: boolean;
  hasLoadedBatches: boolean;
  hasLoadedOrders: boolean;
  hasLoadedBusinessSettings: boolean;
  /** Authoritative Style catalogue readiness (first Firestore snapshot / error). */
  stylesLoadState: StylesLoadState;
  stylesLoadError: string | null;
  currentUser: Customer | null;
  setCurrentUser: (user: Customer | null) => void;
  customers: Customer[];
  setCustomers: (
    customers: Customer[] | ((prev: Customer[]) => Customer[]),
  ) => void;
  orders: MasterOrder[];
  setOrders: (
    orders: MasterOrder[] | ((prev: MasterOrder[]) => MasterOrder[]),
  ) => void;
  customGroups: CustomGroup[];
  /** Source-backed private-group authorization used by draft hydration only. */
  customGroupAccessById: PrivateBatchAccessById;
  customGroupPrivateAccessReady: boolean;
  /** Exact source lifecycle for personalized authority classification. */
  customGroupPrivateDiscoveryLifecycleId: number | null;
  /** Monotonic authorization epoch for protected Private Batch continuations. */
  customGroupPrivateAccessGeneration: number;
  setCustomGroups: (
    groups: CustomGroup[] | ((prev: CustomGroup[]) => CustomGroup[]),
  ) => void;
  batches: Batch[];
  setBatches: (batches: Batch[] | ((prev: Batch[]) => Batch[])) => void;
  cartItems: CartItem[];
  setCartItems: (
    items: CartItem[] | ((prev: CartItem[]) => CartItem[]),
  ) => void;
  historicalOrders: HistoricalOrder[];
  setHistoricalOrders: (
    orders:
      HistoricalOrder[] | ((prev: HistoricalOrder[]) => HistoricalOrder[]),
  ) => void;

  fabrics: Fabric[];
  setFabrics: (fabrics: Fabric[] | ((prev: Fabric[]) => Fabric[])) => void;
  customDetailCatalog: CustomDetailOption[];
  setCustomDetailCatalog: (
    catalog:
      | CustomDetailOption[]
      | ((prev: CustomDetailOption[]) => CustomDetailOption[]),
  ) => void;
  styles: StyleCategory[];
  setStyles: (
    styles: StyleCategory[] | ((prev: StyleCategory[]) => StyleCategory[]),
  ) => Promise<void>;
  showpieces: Showpiece[];
  setShowpieces: (
    showpieces: Showpiece[] | ((prev: Showpiece[]) => Showpiece[]),
  ) => void;
  communityPhotos: CommunityPhoto[];
  setCommunityPhotos: (
    photos: CommunityPhoto[] | ((prev: CommunityPhoto[]) => CommunityPhoto[]),
  ) => void;
  businessSettings: BusinessSettings;
  setBusinessSettings: (
    settings: BusinessSettings | ((prev: BusinessSettings) => BusinessSettings),
  ) => void;

  // Foundation Platform Data
  referenceData: ReferenceDataGroup[];
  setReferenceData: (
    data: ReferenceDataGroup[] | ((prev: ReferenceDataGroup[]) => ReferenceDataGroup[]),
  ) => void;
  mediaLibrary: MediaItem[];
  setMediaLibrary: (
    media: MediaItem[] | ((prev: MediaItem[]) => MediaItem[]),
  ) => void;
  plugins: Plugin[];
  setPlugins: (plugins: Plugin[] | ((prev: Plugin[]) => Plugin[])) => void;
  auditLogs: AuditLog[];
  setAuditLogs: (logs: AuditLog[] | ((prev: AuditLog[]) => AuditLog[])) => void;
  roles: Role[];
  setRoles: (roles: Role[] | ((prev: Role[]) => Role[])) => void;

  // Initialization
  initializeData: () => Promise<void>;
}

// Track global snapshot listeners to prevent duplicates
let storeUnsubs: (() => void)[] = [];
let privateStoreUnsubs: (() => void)[] = [];
let authBootstrapSequence = 0;
// Separate from the Private Batch access generation: this authority answers
// only whether an initializeData invocation is still the newest startup run.
let initializationRequestId = 0;
let privateBatchSubscriptionController: ReturnType<
  typeof createPrivateBatchSubscriptionController
> | null = null;
// Store-lifetime, never controller-lifetime. Every auth/listener/reset path
// passes this one authority to the controller and token coordinator.
const privateBatchAccessSession = createPrivateBatchAccessSession();
// Narrow observability seam for the initialization-race regression. It is
// unset in production and does not alter subscription behavior.
let privateBatchDiscoveryStartObserverForTests: (() => void) | null = null;
export const setPrivateBatchDiscoveryStartObserverForTests = (
  observer: (() => void) | null,
): (() => void) => {
  const previous = privateBatchDiscoveryStartObserverForTests;
  privateBatchDiscoveryStartObserverForTests = observer;
  return () => {
    if (privateBatchDiscoveryStartObserverForTests === observer) {
      privateBatchDiscoveryStartObserverForTests = previous;
    }
  };
};

const clearPrivateStoreSubscriptions = () => {
  privateStoreUnsubs.forEach((unsubscribe) => unsubscribe());
  privateStoreUnsubs = [];
};

// Token events, rather than only sign-in transitions, are the authoritative
// boundary for Private Batch visibility. This exact coordinator is also used
// by the lifecycle regression tests.
const privateBatchAuthCoordinator = createPrivateBatchAuthCoordinator({
  getTarget: () => privateBatchSubscriptionController,
  getCurrentUser: () => auth.currentUser,
  accessSession: privateBatchAccessSession,
  onClaimError: (error) =>
    console.error("Unable to verify Private Batch admin authority:", error),
});

const synchronizePrivateBatchIdentity = privateBatchAuthCoordinator.synchronize;

/**
 * Private persistence reaches the same store-lifetime discovery authority as
 * the Firestore listeners. These exports intentionally expose no group data:
 * callers can only await a token-scoped authorization result.
 */
export const getPrivateBatchDiscoveryAnchor = () =>
  privateBatchAuthCoordinator.getDiscoveryAnchor();

export const awaitPrivateBatchPostRefreshAccess =
  privateBatchAccessSession.awaitPrivateBatchAccess;

export const ensureFreshPrivateBatchDiscoveryForCurrentSession =
  privateBatchAuthCoordinator.ensureFreshPrivateDiscoveryForCurrentSession;

const initialGuestSession =
  typeof window !== "undefined"
    ? GuestOrderSessionService.getActiveSession()
    : null;

export const useAppStore = create<AppState>((set, get) => ({
  customDetailCatalog: [],
  setCustomDetailCatalog: (catalog) => {
    const nextCatalog =
      typeof catalog === "function"
        ? catalog(get().customDetailCatalog)
        : catalog;
    set({ customDetailCatalog: nextCatalog });
  },
  activeTab:
    (typeof window !== "undefined" &&
      (sessionStorage.getItem("asml_active_tab") as any)) ||
    "home",
  setActiveTab: (tab) => {
    const state = get();
    if (
      (tab === "dashboard" || tab === "database") &&
      !AuthorizationEngine.canAccessRoute(tab, state.currentUser)
    ) {
      set({ pendingRedirect: tab });
      tab = "login";
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem("asml_active_tab", tab);
      sessionStorage.removeItem(`asml_scroll_position_${tab}`);
    }
    set({ activeTab: tab });
  },
  pendingRedirect: null,
  setPendingRedirect: (redirect) => set({ pendingRedirect: redirect }),
  isMobileMenuOpen: false,
  setIsMobileMenuOpen: (isOpen) => set({ isMobileMenuOpen: isOpen }),
  notification: null,
  setNotification: (notif) => set({ notification: notif }),

  presetStyleId: null,
  setPresetStyleId: (id) => set({ presetStyleId: id }),
  presetFabricCode: null,
  setPresetFabricCode: (code) => set({ presetFabricCode: code }),
  orderContext: null,
  setOrderContext: (ctx) => set({ orderContext: ctx }),

  isCheckoutPaymentOpen: false,
  setIsCheckoutPaymentOpen: (isOpen) => set({ isCheckoutPaymentOpen: isOpen }),
  isCartOpen: false,
  setIsCartOpen: (isOpen) => set({ isCartOpen: isOpen }),
  guestCartId: initialGuestSession?.guestCartId || "",
  checkoutIntent: initialGuestSession?.checkoutIntent || false,
  setCheckoutIntent: (required) => {
    if (!get().currentUser) {
      GuestOrderSessionService.setCheckoutIntent(required);
    }
    set({ checkoutIntent: required });
  },

  // Data State
  isLoadingData: true,
  hasLoadedBatches: false,
  hasLoadedOrders: false,
  hasLoadedBusinessSettings: false,
  stylesLoadState: "loading",
  stylesLoadError: null,
  currentUser: null,
  setCurrentUser: (user) => {
    clearPrivateStoreSubscriptions();
    // Clear UID-scoped group state synchronously before a new identity can
    // subscribe. Public discovery remains intact; no private record survives
    // a guest → A → B → logout transition in this store.
    synchronizePrivateBatchIdentity(null);
    if (user) {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        console.error(
          "Rejected a local-only customer session without Firebase authentication.",
        );
        ApiService.clearSession();
        return;
      }
      const canonicalUser: Customer = {
        ...user,
        ownerUid: firebaseUser.uid,
        email: AuthorizationEngine.getCanonicalEmail(user.email),
        canonicalEmail: AuthorizationEngine.getCanonicalEmail(user.email),
        role: AuthorizationEngine.resolveRole(user),
      };
      const claim = GuestOrderSessionService.claimGuestCart(canonicalUser);
      set({
        currentUser: canonicalUser,
        cartItems: claim.items,
        customers: [canonicalUser],
        orders: [],
        hasLoadedOrders: false,
      });
      ApiService.saveSession(canonicalUser);
      if (!firebaseUser.isAnonymous) {
        synchronizePrivateBatchIdentity(firebaseUser);
      }

      if (AuthorizationEngine.canViewStaffDashboard(canonicalUser)) {
        privateStoreUnsubs.push(
          StorageService.subscribeToCollection<Customer>(
            "customers",
            (accountsList) => set({ customers: accountsList }),
          ),
          StorageService.subscribeToCollection<MasterOrder>(
            "orders",
            (ordersList) =>
              set({ orders: ordersList, hasLoadedOrders: true }),
          ),
        );
      } else {
        privateStoreUnsubs.push(
          StorageService.subscribeToCustomerAccount(
            canonicalUser.email,
            (account) =>
              set({
                customers: [
                  account
                    ? {
                        ...account,
                        email: AuthorizationEngine.getCanonicalEmail(
                          account.email,
                        ),
                      }
                    : canonicalUser,
                ],
              }),
          ),
          StorageService.subscribeToCustomerOrders(
            canonicalUser.email,
            (ordersList) =>
              set({ orders: ordersList, hasLoadedOrders: true }),
          ),
        );
      }
    } else {
      const previousUser = get().currentUser;
      if (previousUser) {
        GuestOrderSessionService.saveAccountCartItems(
          previousUser.email,
          get().cartItems,
        );
      }
      ApiService.clearSession();
      const guestSession = GuestOrderSessionService.getActiveSession();
      set({
        currentUser: null,
        cartItems: guestSession.cartItems,
        guestCartId: guestSession.guestCartId,
        checkoutIntent: guestSession.checkoutIntent,
        customers: [],
        orders: [],
        hasLoadedOrders: true,
      });
    }
  },
  customers: [],
  setCustomers: (customers) => {
    const newCustomers =
      typeof customers === "function" ? customers(get().customers) : customers;
    set({ customers: newCustomers });
    if (AuthorizationEngine.canViewStaffDashboard(get().currentUser)) {
      ApiService.saveAccounts(newCustomers);
    } else {
      void Promise.all(
        newCustomers.map((customer) =>
          StorageService.saveAccount(customer),
        ),
      );
    }
  },
  orders: [],
  setOrders: (orders) => {
    const newOrders =
      typeof orders === "function" ? orders(get().orders) : orders;
    set({ orders: newOrders });
    if (AuthorizationEngine.canViewStaffDashboard(get().currentUser)) {
      ApiService.saveOrders(newOrders);
    } else {
      void Promise.all(
        newOrders.map((order) => StorageService.saveOrder(order)),
      );
    }
  },
  customGroups: [],
  customGroupAccessById: {},
  customGroupPrivateAccessReady: false,
  customGroupPrivateDiscoveryLifecycleId: null,
  customGroupPrivateAccessGeneration: 0,
  setCustomGroups: (groups) => {
    const previousGroups = get().customGroups;
    const newGroups =
      typeof groups === "function" ? groups(get().customGroups) : groups;
    set({ customGroups: newGroups });
    const currentUser = get().currentUser;
    if (AuthorizationEngine.canViewStaffDashboard(currentUser)) {
      ApiService.saveGroups(newGroups);
    } else if (currentUser?.ownerUid) {
      const changedGroups = newGroups.filter((group) => {
        const previous = previousGroups.find(
          (candidate) => candidate.batchId === group.batchId,
        );
        return !previous || JSON.stringify(previous) !== JSON.stringify(group);
      });
      const removedOwnedGroups = previousGroups.filter(
        (group) =>
          group.ownerUid === currentUser.ownerUid &&
          !newGroups.some((candidate) => candidate.batchId === group.batchId),
      );
      void Promise.all([
        ...changedGroups.map((group) => StorageService.saveGroup(group)),
        ...removedOwnedGroups.map((group) =>
          StorageService.deleteDocument("customGroups", group.batchId),
        ),
      ]);
    }
  },
  batches: [],
  setBatches: (batches) => {
    const newBatches =
      typeof batches === "function" ? batches(get().batches) : batches;
    set({ batches: newBatches });
    StorageService.saveBatches(newBatches);
  },
  cartItems: initialGuestSession?.cartItems || [],
  setCartItems: (items) => {
    const requestedItems =
      typeof items === "function" ? items(get().cartItems) : items;
    const migration = migrateLegacyCartShippingItems(requestedItems);
    const currentUser = get().currentUser;
    const newItems = currentUser
      ? GuestOrderSessionService.saveAccountCartItems(
          currentUser.email,
          migration.items,
        )
      : GuestOrderSessionService.saveGuestCartItems(migration.items);
    set({ cartItems: newItems });
  },
  historicalOrders: [],
  setHistoricalOrders: (orders) => {
    const newOrders =
      typeof orders === "function" ? orders(get().historicalOrders) : orders;
    set({ historicalOrders: newOrders });
  },

  fabrics: [],
  setFabrics: (fabrics) => {
    const newFabrics =
      typeof fabrics === "function" ? fabrics(get().fabrics) : fabrics;
    set({ fabrics: newFabrics });
    StorageService.saveFabrics(newFabrics);
  },
  styles: [],
  setStyles: async (styles) => {
    const newStyles =
      typeof styles === "function" ? styles(get().styles) : styles;
    await StorageService.saveStyles(newStyles);
    set({ styles: newStyles });
  },
  showpieces: [],
  setShowpieces: (showpieces) => {
    const newShowpieces =
      typeof showpieces === "function"
        ? showpieces(get().showpieces)
        : showpieces;
    set({ showpieces: newShowpieces });
    StorageService.saveShowpieces(newShowpieces);
  },
  communityPhotos: [],
  setCommunityPhotos: (communityPhotos) => {
    const newPhotos =
      typeof communityPhotos === "function"
        ? communityPhotos(get().communityPhotos)
        : communityPhotos;
    set({ communityPhotos: newPhotos });
    StorageService.saveCommunityPhotos(newPhotos);
  },
  businessSettings: DEFAULT_BUSINESS_SETTINGS,
  setBusinessSettings: (settings) => {
    const newSettings =
      typeof settings === "function"
        ? settings(get().businessSettings)
        : settings;
    set({ businessSettings: newSettings });
    StorageService.saveBusinessSettings(newSettings);
  },

  referenceData: [],
  setReferenceData: (data) => {
    const newData =
      typeof data === "function" ? data(get().referenceData) : data;
    set({ referenceData: newData });
  },

  mediaLibrary: [],
  setMediaLibrary: (media) => {
    const newMedia =
      typeof media === "function" ? media(get().mediaLibrary) : media;
    set({ mediaLibrary: newMedia });
  },

  plugins: [],
  setPlugins: (plugins) => {
    const newPlugins =
      typeof plugins === "function" ? plugins(get().plugins) : plugins;
    set({ plugins: newPlugins });
  },

  auditLogs: [],
  setAuditLogs: (logs) => {
    const newLogs = typeof logs === "function" ? logs(get().auditLogs) : logs;
    set({ auditLogs: newLogs });
  },

  roles: [],
  setRoles: (roles) => {
    const newRoles = typeof roles === "function" ? roles(get().roles) : roles;
    set({ roles: newRoles });
  },

  // Initialization
  initializeData: async () => {
    const requestId = ++initializationRequestId;
    const isCurrentInitialization = () =>
      requestId === initializationRequestId;
    // This is a synchronous security boundary, not normal listener cleanup.
    // It must run before the first awaited data call so a stalled reload
    // cannot retain an earlier user's owner/member/admin capability.
    privateBatchAccessSession.invalidate();
    authBootstrapSequence += 1;
    storeUnsubs.forEach((unsub) => unsub && unsub());
    storeUnsubs = [];
    clearPrivateStoreSubscriptions();
    privateBatchSubscriptionController?.dispose();
    privateBatchSubscriptionController = null;
    set({
      customGroups: [],
      customGroupAccessById: {},
      customGroupPrivateAccessReady: false,
      customGroupPrivateDiscoveryLifecycleId: null,
      customGroupPrivateAccessGeneration:
        privateBatchAccessSession.getGeneration(),
    });
    // Invalidate + unsubscribe Style listeners BEFORE any await so a stale
    // first-snapshot callback cannot flip the new reload back to ready.
    const stylesSubscriptionGeneration =
      invalidateStylesCatalogueLoadGeneration();
    set({
      isLoadingData: true,
      stylesLoadState: "loading",
      stylesLoadError: null,
    });
    try {
      const catalog = await StorageService.getCatalog();
      if (!isCurrentInitialization()) return;
      set({ customDetailCatalog: catalog });
      const storedSettings = await StorageService.getBusinessSettings();
      if (!isCurrentInitialization()) return;

      const isInitialized =
        storedSettings?.applicationSettings?.hasInitializedData;

      const savedBusinessSettings: BusinessSettings = {
        ...DEFAULT_BUSINESS_SETTINGS,
        ...(storedSettings || {}),
        discountSettings:
          storedSettings?.discountSettings ||
          DEFAULT_BUSINESS_SETTINGS.discountSettings,
        outfitTypes:
          storedSettings?.outfitTypes || DEFAULT_BUSINESS_SETTINGS.outfitTypes,
        garmentCompositions:
          storedSettings?.garmentCompositions ||
          DEFAULT_BUSINESS_SETTINGS.garmentCompositions,
      };

      if (!isInitialized) {
        savedBusinessSettings.applicationSettings = {
          ...savedBusinessSettings.applicationSettings,
          hasInitializedData: true,
        };
      }

      // All listener installation and completion publishing belongs only to
      // the latest invocation. An older catalog/settings request is inert.
      if (!isCurrentInitialization()) return;

      storeUnsubs.push(
        StorageService.subscribeToDocument<BusinessSettings>("settings", "business", (settings) => {
          if (settings) {
            set({ businessSettings: settings, hasLoadedBusinessSettings: true });
          }
        })
      );

      // Private Batch authorization must react before the async customer
      // bootstrap below. This also receives custom-claim refreshes.
      storeUnsubs.push(
        privateBatchAuthCoordinator.bindTokenChanges((listener) =>
          onIdTokenChanged(auth, listener),
        ),
      );

      // Customer/session bootstrap remains sign-in based, but is deliberately
      // no longer the first point at which private state is cleared.
      storeUnsubs.push(
        onAuthStateChanged(auth, (firebaseUser) => {
          if (!isCurrentInitialization()) return;
          const sequence = ++authBootstrapSequence;
          if (firebaseUser && !firebaseUser.isAnonymous) {
            void (async () => {
              try {
                const continuity =
                  await guestUploadedDesignOwnershipContinuity.ensure(
                    firebaseUser,
                  );
                if (continuity.status === "transfer_required") {
                  if (
                    sequence === authBootstrapSequence &&
                    isCurrentInitialization()
                  ) {
                    ApiService.clearSession();
                    get().setCurrentUser(null);
                  }
                  return;
                }
                const customer =
                  await FirebaseCustomerAuth.bootstrap(firebaseUser);
                if (
                  sequence === authBootstrapSequence &&
                  isCurrentInitialization()
                ) {
                  get().setCurrentUser(customer);
                }
              } catch (error) {
                console.error(
                  "Failed to establish the secure Firebase customer session:",
                  error,
                );
                if (
                  sequence === authBootstrapSequence &&
                  isCurrentInitialization()
                ) {
                  ApiService.clearSession();
                  get().setCurrentUser(null);
                }
              }
            })();
          } else {
            ApiService.clearSession();
            get().setCurrentUser(null);
          }
        })
      );

      // Real-time Fabric Listener
      storeUnsubs.push(
        FabricService.subscribeToFabrics((fabrics) => {
           set({ fabrics });
        })
      );

      storeUnsubs.push(
        DesignStyleAuthorityService.subscribeToPublished(
          (styles) => {
            if (
              !isCurrentStylesCatalogueLoadGeneration(
                stylesSubscriptionGeneration,
              )
            ) {
              return;
            }
            const next = applyStylesCatalogueListenerEvent(
              {
                styles: get().styles,
                stylesLoadState: get().stylesLoadState,
                stylesLoadError: get().stylesLoadError,
              },
              {
                kind: "snapshot",
                callbackGeneration: stylesSubscriptionGeneration,
                styles,
              },
            );
            set(next);
          },
          (error) => {
            if (
              !isCurrentStylesCatalogueLoadGeneration(
                stylesSubscriptionGeneration,
              )
            ) {
              return;
            }
            const next = applyStylesCatalogueListenerEvent(
              {
                styles: get().styles,
                stylesLoadState: get().stylesLoadState,
                stylesLoadError: get().stylesLoadError,
              },
              {
                kind: "error",
                callbackGeneration: stylesSubscriptionGeneration,
                message:
                  error?.message ||
                  "The Design Style catalogue could not be loaded.",
              },
            );
            set(next);
          },
        ),
      );

      storeUnsubs.push(
        StorageService.subscribeToCollection<Batch>("batches", (batches) => {
          set({ batches: processDynamicBatches(batches), hasLoadedBatches: true });
        })
      );

      storeUnsubs.push(
        StorageService.subscribeToCollection<Showpiece>("showpieces", (showpieces) => {
          set({ showpieces });
        })
      );

      storeUnsubs.push(
        StorageService.subscribeToCollection<CommunityPhoto>("communityPhotos", (photos) => {
          set({ communityPhotos: photos });
        })
      );

      privateBatchSubscriptionController?.dispose();
      if (!isCurrentInitialization()) return;
      privateBatchDiscoveryStartObserverForTests?.();
      privateBatchSubscriptionController = createPrivateBatchSubscriptionController({
        adapter: createFirestorePrivateBatchSubscriptionAdapter(db),
        accessSession: privateBatchAccessSession,
        onSnapshot: ({
          groups,
          accessById,
          privateAccessReady,
          privateAccessGeneration,
          discoveryLifecycleId,
        }) => {
          set({
            customGroups: [...groups],
            customGroupAccessById: accessById,
            customGroupPrivateAccessReady: privateAccessReady,
            customGroupPrivateAccessGeneration: privateAccessGeneration,
            customGroupPrivateDiscoveryLifecycleId: discoveryLifecycleId,
          });
        },
        onError: (error) => {
          console.error("Error subscribing to authorized custom groups:", error);
        },
      });
      privateBatchSubscriptionController.startPublic();
      if (!isCurrentInitialization()) return;
      const existingAuthenticatedUser = get().currentUser;
      if (existingAuthenticatedUser && auth.currentUser && !auth.currentUser.isAnonymous) {
        synchronizePrivateBatchIdentity(auth.currentUser);
      }

      storeUnsubs.push(
        StorageService.subscribeToCollection<ReferenceDataGroup>("reference_data", (data) => {
          set({ referenceData: data });
        })
      );

      if (!isCurrentInitialization()) return;
      set({
        // others are set via subscriptions
        businessSettings: savedBusinessSettings,
        hasLoadedBusinessSettings: true,
        mediaLibrary: [],
        plugins: [],
        auditLogs: [],
        roles: [],
        isLoadingData: false,
      });
    } catch (error) {
      if (!isCurrentInitialization()) return;
      console.error("Failed to initialize app data:", error);
      set({
        isLoadingData: false,
        stylesLoadState: "error",
        stylesLoadError:
          error instanceof Error
            ? error.message
            : "The Design Style catalogue could not be loaded.",
      });
    }
  },
}));

/**
 * Test-only source adapter seam. It installs the same store-lifetime access
 * session, coordinator, controller, and snapshot publication used by
 * production; only Firestore callbacks are controlled by the test.
 */
export const installPrivateBatchSubscriptionAdapterForTests = (
  adapter: PrivateBatchSubscriptionAdapter,
): (() => void) => {
  privateBatchSubscriptionController?.dispose();
  privateBatchSubscriptionController = createPrivateBatchSubscriptionController({
    adapter,
    accessSession: privateBatchAccessSession,
    onSnapshot: ({
      groups,
      accessById,
      privateAccessReady,
      privateAccessGeneration,
      discoveryLifecycleId,
    }) => {
      useAppStore.setState({
        customGroups: [...groups],
        customGroupAccessById: accessById,
        customGroupPrivateAccessReady: privateAccessReady,
        customGroupPrivateAccessGeneration: privateAccessGeneration,
        customGroupPrivateDiscoveryLifecycleId: discoveryLifecycleId,
      });
    },
  });
  privateBatchSubscriptionController.startPublic();
  const installedController = privateBatchSubscriptionController;
  return () => {
    if (privateBatchSubscriptionController !== installedController) return;
    installedController.dispose();
    privateBatchSubscriptionController = null;
  };
};

/** Drives the production coordinator in controlled lifecycle tests. */
export const synchronizePrivateBatchIdentityForTests = () =>
  synchronizePrivateBatchIdentity(auth.currentUser);
