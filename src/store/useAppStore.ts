import { create } from 'zustand';
import { Customer, MasterOrder, CustomGroup, Fabric, StyleCategory, Showpiece, CommunityPhoto, HistoricalOrder, CartItem, OrderContext, Batch, BusinessSettings, MediaItem, Plugin, AuditLog, Role } from '../types';
import { ApiService } from '../services/api';
import { MOCK_HISTORICAL_ORDERS, FABRICS, STYLE_CATEGORIES, MOCK_COMMUNITY_PHOTOS, MOCK_BATCHES, DEFAULT_BUSINESS_SETTINGS } from '../data/mockData';
import { MOCK_MEDIA_LIBRARY, MOCK_PLUGINS, MOCK_AUDIT_LOGS, MOCK_ROLES } from '../data/foundationMockData';
import { StorageService } from '../services/storageService';

interface AppState {
  // Navigation & UI
  activeTab: 'home' | 'design' | 'dashboard' | 'about' | 'gallery' | 'database' | 'custom-order';
  setActiveTab: (tab: 'home' | 'design' | 'dashboard' | 'about' | 'gallery' | 'database' | 'custom-order') => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (isOpen: boolean) => void;
  notification: { message: string; type: 'success' | 'info' } | null;
  setNotification: (notif: { message: string; type: 'success' | 'info' } | null) => void;

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
  setCustomers: (customers: Customer[] | ((prev: Customer[]) => Customer[])) => void;
  orders: MasterOrder[];
  setOrders: (orders: MasterOrder[] | ((prev: MasterOrder[]) => MasterOrder[])) => void;
  customGroups: CustomGroup[];
  setCustomGroups: (groups: CustomGroup[] | ((prev: CustomGroup[]) => CustomGroup[])) => void;
  batches: Batch[];
  setBatches: (batches: Batch[] | ((prev: Batch[]) => Batch[])) => void;
  cartItems: CartItem[];
  setCartItems: (items: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  historicalOrders: HistoricalOrder[];
  setHistoricalOrders: (orders: HistoricalOrder[] | ((prev: HistoricalOrder[]) => HistoricalOrder[])) => void;

  fabrics: Fabric[];
  setFabrics: (fabrics: Fabric[] | ((prev: Fabric[]) => Fabric[])) => void;
  styles: StyleCategory[];
  setStyles: (styles: StyleCategory[] | ((prev: StyleCategory[]) => StyleCategory[])) => void;
  showpieces: Showpiece[];
  setShowpieces: (showpieces: Showpiece[] | ((prev: Showpiece[]) => Showpiece[])) => void;
  communityPhotos: CommunityPhoto[];
  setCommunityPhotos: (photos: CommunityPhoto[] | ((prev: CommunityPhoto[]) => CommunityPhoto[])) => void;
  businessSettings: BusinessSettings;
  setBusinessSettings: (settings: BusinessSettings | ((prev: BusinessSettings) => BusinessSettings)) => void;

  // Foundation Platform Data
  mediaLibrary: MediaItem[];
  setMediaLibrary: (media: MediaItem[] | ((prev: MediaItem[]) => MediaItem[])) => void;
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
  activeTab: 'home',
  setActiveTab: (tab) => set({ activeTab: tab }),
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
    const newCustomers = typeof customers === 'function' ? customers(get().customers) : customers;
    set({ customers: newCustomers });
    ApiService.saveAccounts(newCustomers);
  },
  orders: [],
  setOrders: (orders) => {
    const newOrders = typeof orders === 'function' ? orders(get().orders) : orders;
    set({ orders: newOrders });
    ApiService.saveOrders(newOrders);
  },
  customGroups: [],
  setCustomGroups: (groups) => {
    const newGroups = typeof groups === 'function' ? groups(get().customGroups) : groups;
    set({ customGroups: newGroups });
    ApiService.saveGroups(newGroups);
  },
  batches: [],
  setBatches: (batches) => {
    const newBatches = typeof batches === 'function' ? batches(get().batches) : batches;
    set({ batches: newBatches });
    StorageService.saveBatches(newBatches);
  },
  cartItems: [],
  setCartItems: (items) => {
    const newItems = typeof items === 'function' ? items(get().cartItems) : items;
    set({ cartItems: newItems });
  },
  historicalOrders: MOCK_HISTORICAL_ORDERS,
  setHistoricalOrders: (orders) => {
    const newOrders = typeof orders === 'function' ? orders(get().historicalOrders) : orders;
    set({ historicalOrders: newOrders });
  },

  fabrics: FABRICS,
  setFabrics: (fabrics) => {
    const newFabrics = typeof fabrics === 'function' ? fabrics(get().fabrics) : fabrics;
    set({ fabrics: newFabrics });
    StorageService.saveFabrics(newFabrics);
  },
  styles: STYLE_CATEGORIES,
  setStyles: (styles) => {
    const newStyles = typeof styles === 'function' ? styles(get().styles) : styles;
    set({ styles: newStyles });
    StorageService.saveStyles(newStyles);
  },
  showpieces: [],
  setShowpieces: (showpieces) => {
    const newShowpieces = typeof showpieces === 'function' ? showpieces(get().showpieces) : showpieces;
    set({ showpieces: newShowpieces });
    StorageService.saveShowpieces(newShowpieces);
  },
  communityPhotos: MOCK_COMMUNITY_PHOTOS,
  setCommunityPhotos: (communityPhotos) => {
    const newPhotos = typeof communityPhotos === 'function' ? communityPhotos(get().communityPhotos) : communityPhotos;
    set({ communityPhotos: newPhotos });
    StorageService.saveCommunityPhotos(newPhotos);
  },
  businessSettings: DEFAULT_BUSINESS_SETTINGS,
  setBusinessSettings: (settings) => {
    const newSettings = typeof settings === 'function' ? settings(get().businessSettings) : settings;
    set({ businessSettings: newSettings });
    StorageService.saveBusinessSettings(newSettings);
  },

  mediaLibrary: [],
  setMediaLibrary: (media) => {
    const newMedia = typeof media === 'function' ? media(get().mediaLibrary) : media;
    set({ mediaLibrary: newMedia });
  },
  
  plugins: [],
  setPlugins: (plugins) => {
    const newPlugins = typeof plugins === 'function' ? plugins(get().plugins) : plugins;
    set({ plugins: newPlugins });
  },

  auditLogs: [],
  setAuditLogs: (logs) => {
    const newLogs = typeof logs === 'function' ? logs(get().auditLogs) : logs;
    set({ auditLogs: newLogs });
  },

  roles: [],
  setRoles: (roles) => {
    const newRoles = typeof roles === 'function' ? roles(get().roles) : roles;
    set({ roles: newRoles });
  },

  // Initialization
  initializeData: async () => {
    set({ isLoadingData: true });
    try {
      const [accounts, session, ordersData, groupsData] = await Promise.all([
        ApiService.fetchAccounts(),
        ApiService.fetchSession(),
        ApiService.fetchOrders(),
        ApiService.fetchGroups()
      ]);

      const savedFabrics = StorageService.getFabrics() || FABRICS;
      const savedStyles = StorageService.getStyles() || STYLE_CATEGORIES;
      const savedBatches = StorageService.getBatches() || MOCK_BATCHES;
      const savedBusinessSettings = {
        ...DEFAULT_BUSINESS_SETTINGS,
        ...(StorageService.getBusinessSettings() || {})
      };
      const savedShowpieces = StorageService.getShowpieces() || [
        {
          id: 'item-1',
          title: 'The Classic Royal Emerald Senator',
          category: 'male',
          styleId: 'royal-senator',
          fabricCode: 'ODG-902',
          styleName: 'Royal Senator',
          fabricName: 'Royal Emerald Cotton',
          colorHex: '#0D3E26',
          description: 'Elegant asymmetric front seam, custom mandarin collar, and gold accent buttons.',
          tag: 'Bestseller'
        },
        {
          id: 'item-2',
          title: 'The Stately Ochre Gold Damask Agbada',
          category: 'male',
          styleId: 'grand-agbada',
          fabricCode: 'ODG-771',
          styleName: 'Grand Agbada Suite',
          fabricName: 'Odogwu Gold Damask',
          colorHex: '#C5A85C',
          description: 'Stately three-piece attire with expansive robes, majestic chest embroidery, and matching cap.',
          tag: 'Prestige'
        },
        {
          id: 'item-3',
          title: 'The Sovereign Teal Monogram Kaftan',
          category: 'male',
          styleId: 'executive-kaftan',
          fabricCode: 'ODG-841',
          styleName: 'Executive Kaftan',
          fabricName: 'Classic Teal Monogram',
          colorHex: '#0D5C75',
          description: 'Comfort-focused executive tunic with deep side slit seams and matching trousers.',
          tag: 'Trending'
        },
        {
          id: 'item-4',
          title: 'The Empress Indigo Boubou',
          category: 'female',
          styleId: 'classic-boubou',
          fabricCode: 'ODG-309',
          styleName: 'Classic Boubou',
          fabricName: 'Biafran Indigo Tie-Dye',
          colorHex: '#22325F',
          description: 'Flowing regal drape with hand-dyed adire cultural textures and gold thread piping.',
          tag: 'Artisanal'
        },
        {
          id: 'item-5',
          title: 'The Onyx Velvet Couture Gown',
          category: 'female',
          styleId: 'couture-gown',
          fabricCode: 'ODG-510',
          styleName: 'Couture Gown',
          fabricName: 'Ebony Velvet Luxury',
          colorHex: '#121212',
          description: 'Heavy luxury fitted gown featuring structured mermaid flare lines and luxury seam detailing.',
          tag: 'Exclusive'
        }
      ];
      let savedCommunityPhotos = StorageService.getCommunityPhotos();
      if (!Array.isArray(savedCommunityPhotos)) {
        savedCommunityPhotos = MOCK_COMMUNITY_PHOTOS;
      }

      set({
        customers: accounts || [
          {
            name: 'Xavier E.',
            email: 'x.e@asml-corp.nl',
            phone: '+31 6 1234 5678',
            location: 'ASML Building 4 Veldhoven Locker (Pickup: Monday Afternoon)',
            role: 'Active Cohort Member (The Transformers)',
            passcode: '1960',
            measurementProfile: {
              height: 180, weight: 78, age: 32, bodyBuild: 'Average', fitPreference: 'Standard',
              neck: 16, shoulder: 18.5, chest: 41.5, waist: 36, hip: 39, sleeve: 24.5, trouserLength: 40, isAiEstimated: true
            },
            measurementProfiles: []
          },
          {
            name: 'Fredrick Ezeh',
            email: 'f.ezeh@asml.com',
            phone: '+234 80 1234 5678',
            location: 'ASML Veldhoven HQ',
            role: 'NTCC Founder & Coordinator',
            passcode: '1960',
            measurementProfile: {
              height: 178, weight: 82, age: 40, bodyBuild: 'Broad', fitPreference: 'Relaxed',
              neck: 16.5, shoulder: 19.5, chest: 43, waist: 38, hip: 41, sleeve: 25, trouserLength: 41, isAiEstimated: true
            },
            measurementProfiles: []
          }
        ],
        currentUser: session || null,
        orders: ordersData || [
          {
            customer: {
              name: 'Xavier E.',
              email: 'x.e@asml-corp.nl',
              phone: '+31 6 1234 5678',
              location: 'ASML Building 4 Veldhoven Locker (Pickup: Monday Afternoon)'
            },
            style: STYLE_CATEGORIES[0], // Royal Senator
            fabric: FABRICS[0], // Royal Emerald Cotton
            design: {
              collar: 'Mandarin High Collar',
              embroidery: 'Classic Chest Geometric Pattern',
              sleeve: 'Long Sleeve with Rounded Cuffs',
              pocket: 'Hidden Side Slit Seam Pockets',
              additionalCap: true,
              hemFinish: 'Traditional Split Side-Vents'
            },
            garment: {
              type: 'Shirt + Trouser Set',
              tailoringFee: 45,
              totalPrice: 215
            },
            measurements: {
              height: 180, weight: 78, age: 32, bodyBuild: 'Average', fitPreference: 'Standard',
              neck: 16, shoulder: 18.5, chest: 41.5, waist: 36, hip: 39, sleeve: 24.5, trouserLength: 40, isAiEstimated: true
            },
            payment: {
              subtotal: 215, deposit: 107.5, remaining: 107.5,
              method: 'Escrow Portal Transaction', date: 'June 24, 2026', isPaid: true
            },
            shipment: {
              trackingId: 'ODG-TRK-3950',
              status: 'Pattern Drafting & Sewing on Lagos floor',
              currentStage: 3,
              estimatedDeliveryDate: 'May 30'
            },
            specialInstructions: 'Please ensure gold embroidery thread tones are high-contrast matching the cuff linings.',
            notesAboutLeftoverFabric: 'Return leftover fabric pieces with garment'
          }
        ],
        customGroups: groupsData || [
          // Remove old hardcoded community batch since we are migrating to pure batches
          {
            batchId: 'GRP-LagosExpress',
            batchName: 'Lagos Express 2026',
            occasion: 'ASML Summer Festival',
            description: 'ASML engineers dressing in Lagos traditional custom Senator style for the summer festival.',
            country: 'Netherlands',
            city: 'Veldhoven',
            preferredDeliveryMonth: 'July 2026',
            expectedParticipants: 15,
            maxParticipants: 25,
            visibility: 'Public',
            organizer: 'Xavier E.',
            currentMembers: 12,
            closingDate: 'July 05, 2026',
            deliveryWindow: 'July 25, 2026',
            status: 'Open'
          },
          {
            batchId: 'GRP-EindhovenCulture',
            batchName: 'Eindhoven Culture Fest',
            occasion: 'Cultural Pride Showcase',
            description: 'A customized batch for church members and local colleagues celebrating traditional beauty.',
            country: 'Netherlands',
            city: 'Eindhoven',
            preferredDeliveryMonth: 'August 2026',
            expectedParticipants: 8,
            maxParticipants: 10,
            visibility: 'Public',
            organizer: 'Amadi O.',
            currentMembers: 9,
            closingDate: 'August 12, 2026',
            deliveryWindow: 'August 28, 2026',
            status: 'Almost Full'
          },
          {
            batchId: 'GRP-RotterdamGalas',
            batchName: 'Rotterdam Gala Pride',
            occasion: 'Agbada Gala Night',
            description: 'Premium custom order batch for the Nigerian traditional Agbada gala in Rotterdam.',
            country: 'Netherlands',
            city: 'Rotterdam',
            preferredDeliveryMonth: 'September 2026',
            expectedParticipants: 20,
            maxParticipants: 20,
            visibility: 'Public',
            organizer: 'Tunde W.',
            currentMembers: 20,
            closingDate: 'September 01, 2026',
            deliveryWindow: 'September 20, 2026',
            status: 'Full'
          }
        ],
        batches: savedBatches,
        fabrics: savedFabrics,
        styles: savedStyles,
        showpieces: savedShowpieces,
        communityPhotos: savedCommunityPhotos,
        businessSettings: savedBusinessSettings,
        mediaLibrary: MOCK_MEDIA_LIBRARY,
        plugins: MOCK_PLUGINS,
        auditLogs: MOCK_AUDIT_LOGS,
        roles: MOCK_ROLES,
        isLoadingData: false
      });
    } catch (error) {
      console.error("Failed to initialize app data:", error);
      set({ isLoadingData: false });
    }
  }
}));
