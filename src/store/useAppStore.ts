import { create } from "zustand";
import {
  Customer,
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
} from "../types";
import { ApiService } from "../services/api";
import {
  FABRICS,
  STYLE_CATEGORIES,
  DEFAULT_BUSINESS_SETTINGS,
} from "../data/mockData";
import { StorageService } from "../services/storageService";
import { FabricService } from "../services/fabricService";
import { auth } from "../services/firebase";
import { signInAnonymously } from "firebase/auth";

interface AppState {

  // Navigation & UI
  activeTab:
    | "home"
    | "design"
    | "dashboard"
    | "about"
    | "gallery"
    | "database"
    | "custom-order";
  setActiveTab: (
    tab:
      | "home"
      | "design"
      | "dashboard"
      | "about"
      | "gallery"
      | "database"
      | "custom-order",
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

  // Data State
  isLoadingData: boolean;
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
  styles: StyleCategory[];
  setStyles: (
    styles: StyleCategory[] | ((prev: StyleCategory[]) => StyleCategory[]),
  ) => void;
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

export const useAppStore = create<AppState>((set, get) => ({
  activeTab:
    (typeof window !== "undefined" &&
      (sessionStorage.getItem("asml_active_tab") as any)) ||
    "home",
  setActiveTab: (tab) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("asml_active_tab", tab);
      sessionStorage.removeItem(`asml_scroll_position_${tab}`);
    }
    set({ activeTab: tab });
  },
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

  // Data State
  isLoadingData: true,
  currentUser: null,
  setCurrentUser: (user) => {
    set({ currentUser: user });
    if (user) {
      ApiService.saveSession(user);
    } else {
      ApiService.clearSession();
    }
  },
  customers: [],
  setCustomers: (customers) => {
    const newCustomers =
      typeof customers === "function" ? customers(get().customers) : customers;
    set({ customers: newCustomers });
    ApiService.saveAccounts(newCustomers);
  },
  orders: [],
  setOrders: (orders) => {
    const newOrders =
      typeof orders === "function" ? orders(get().orders) : orders;
    set({ orders: newOrders });
    ApiService.saveOrders(newOrders);
  },
  customGroups: [],
  setCustomGroups: (groups) => {
    const newGroups =
      typeof groups === "function" ? groups(get().customGroups) : groups;
    set({ customGroups: newGroups });
    ApiService.saveGroups(newGroups);
  },
  batches: [],
  setBatches: (batches) => {
    const newBatches =
      typeof batches === "function" ? batches(get().batches) : batches;
    set({ batches: newBatches });
    StorageService.saveBatches(newBatches);
  },
  cartItems: [],
  setCartItems: (items) => {
    const newItems =
      typeof items === "function" ? items(get().cartItems) : items;
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
  setStyles: (styles) => {
    const newStyles =
      typeof styles === "function" ? styles(get().styles) : styles;
    set({ styles: newStyles });
    StorageService.saveStyles(newStyles);
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
    set({ isLoadingData: true });
    try {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.warn("Failed to sign in anonymously:", err);
      }

      const [accounts, session, ordersData, groupsData] = await Promise.all([
        ApiService.fetchAccounts(),
        ApiService.fetchSession(),
        ApiService.fetchOrders(),
        ApiService.fetchGroups(),
      ]);

      const storedSettings = await StorageService.getBusinessSettings();
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
        await StorageService.saveBusinessSettings(savedBusinessSettings);
      }

      StorageService.subscribeToDocument<BusinessSettings>("settings", "business", (settings) => {
        if (settings) {
          set({ businessSettings: settings });
        }
      });

      // Real-time Fabric Listener
      FabricService.subscribeToFabrics((fabrics) => {
         set({ fabrics });
      });


      StorageService.subscribeToCollection<StyleCategory>("styles", (styles) => {
        set({ styles });
      });

      StorageService.subscribeToCollection<Batch>("batches", (batches) => {
        set({ batches });
      });

      StorageService.subscribeToCollection<Showpiece>("showpieces", (showpieces) => {
        set({ showpieces });
      });

      StorageService.subscribeToCollection<CommunityPhoto>("communityPhotos", (photos) => {
        set({ communityPhotos: photos });
      });

      StorageService.subscribeToCollection<Customer>("customers", (accountsList) => {
        set({ customers: accountsList });
      });

      StorageService.subscribeToCollection<MasterOrder>("orders", (ordersList) => {
        set({ orders: ordersList });
      });

      StorageService.subscribeToCollection<CustomGroup>("customGroups", (groupsList) => {
        set({ customGroups: groupsList });
      });

      set({
        currentUser: session || null,
        // others are set via subscriptions
        businessSettings: savedBusinessSettings,
        mediaLibrary: [],
        plugins: [],
        auditLogs: [],
        roles: [],
        isLoadingData: false,
      });
    } catch (error) {
      console.error("Failed to initialize app data:", error);
      set({ isLoadingData: false });
    }
  },
}));
