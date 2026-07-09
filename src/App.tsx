import { AuthorizationEngine } from "./engine/AuthorizationEngine";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, Suspense, lazy } from "react";

import {
  Check,
  Sparkles,
  X,
  CreditCard,
  Lock as LockIcon,
} from "lucide-react";
import {
  MasterOrder,
  CartItem,
  CustomGroup,
  OrderContext,
  Customer,
} from "./types";
import { StorageService } from "./services/storageService";
import { auth } from "./services/firebase";
import { signOut } from "firebase/auth";
import { useAppStore } from "./store/useAppStore";
import { CustomerJourneyEngine } from "./engine/CustomerJourneyEngine";
import { getCurrentCommunityBatch } from "./utils/batchUtils";
import { CapacityService } from "./services/CapacityService";

// Lazy load modular view components for performance optimization
const HomeView = lazy(() => import("./components/HomeView"));
const DesignStudioView = lazy(() => import("./components/DesignStudioView"));
const DashboardView = lazy(() => import("./components/DashboardView"));
const CustomOrderView = lazy(() => import("./components/CustomOrderView"));
const AboutView = lazy(() => import("./components/AboutView"));
const GalleryView = lazy(() => import("./components/GalleryView"));
const LoginView = lazy(() => import("./components/LoginView"));
const DatabaseView = lazy(() => import("./components/DatabaseView"));
import { Header } from "./components/Header";
import { MobileMenu } from "./components/MobileMenu";
import { CartDrawer } from "./components/CartDrawer";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Footer from "./components/Footer";


import { AdminAuthGuard } from "./components/AdminAuthGuard";

export default function App() {
  const store = useAppStore();
  const {
    activeTab,
    setActiveTab,
    customGroups,
    setCustomGroups,
    orderContext,
    setOrderContext,
    currentUser,
    setCurrentUser,
    fabrics,
    setFabrics,
    styles,
    setStyles,
    showpieces,
    setShowpieces,
    communityPhotos,
    setCommunityPhotos,
    customers,
    setCustomers,
    orders,
    setOrders,
    historicalOrders,
    cartItems,
    setCartItems,
    setIsCartOpen,
    presetStyleId,
    setPresetStyleId,
    presetFabricCode,
    setPresetFabricCode,
    isCheckoutPaymentOpen,
    setIsCheckoutPaymentOpen,
    notification,
    setNotification,
    initializeData,
    isLoadingData,
    batches,
    setBatches,
    businessSettings,
    setBusinessSettings,
  } = store;

  // Initialize async data
  React.useEffect(() => {
    initializeData();
  }, [initializeData]);

  // Scroll tracking to save position on active tab
  React.useEffect(() => {
    const handleScroll = () => {
      if (isLoadingData) return;
      const scrollY = window.scrollY;
      const savedScrollKey = `asml_scroll_position_${activeTab}`;
      sessionStorage.setItem(savedScrollKey, scrollY.toString());
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeTab, isLoadingData]);

  // Scroll restoration when navigation happens or page is loaded/refreshed
  React.useEffect(() => {
    if (isLoadingData) return;

    // Use a slight timeout to ensure DOM is fully rendered and sized
    const timer = setTimeout(() => {
      // Priority 1: Anchor hash
      if (window.location.hash) {
        const id = window.location.hash.substring(1);
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
          return;
        }
      }

      // Priority 2: Restoring scroll on refresh
      const savedScrollKey = `asml_scroll_position_${activeTab}`;
      const savedScrollY = sessionStorage.getItem(savedScrollKey);
      if (savedScrollY) {
        const yPos = parseInt(savedScrollY, 10);
        if (!isNaN(yPos) && yPos > 0) {
          window.scrollTo({ top: yPos, behavior: "auto" });
          return;
        }
      }

      // Default: Jump to top
      window.scrollTo(0, 0);
    }, 150);

    return () => clearTimeout(timer);
  }, [isLoadingData, activeTab]);

  // Simulate automated daily cron job / database trigger to lock registrations whose closingDate has passed
  React.useEffect(() => {
    let changed = false;
    const now = new Date();

    const updatedGroups = customGroups.map((g) => {
      try {
        const closeDate = new Date(g.closingDate);
        if (closeDate < now && g.status !== "CLOSED") {
          changed = true;
          return {
            ...g,
            status: "CLOSED" as const,
          };
        }
      } catch (e) {
        console.error("Failed parsing closingDate for", g.batchName, e);
      }
      return g;
    });

    if (changed) {
      setCustomGroups(updatedGroups);
    }
  }, [customGroups, setCustomGroups]);

  const openBatch = getCurrentCommunityBatch(batches);
  const activeCommunityBatch: OrderContext | null = openBatch
    ? {
        orderType: "Community",
        batchId: openBatch.id,
        batchName: openBatch.name,
        closingDate: openBatch.endDate,
        deliveryWindow: openBatch.estimatedDelivery || "",
        expectedParticipants: CapacityService.getTargetCapacity(openBatch),
        currentMembers: CapacityService.getReservedCapacity(openBatch),
        allowOrders: openBatch.allowOrders,
        batchStatus: openBatch.status,
        pickupLocation:
          openBatch.pickupLocation || businessSettings.productionSettings.defaultPickupLocation || "Veldhoven Campus Lockers",
      }
    : null;

  // Active masterOrder synced from current user's latest order in orders database, or first order as default
  const [masterOrder, setMasterOrder] = useState<MasterOrder | null>(null);

  React.useEffect(() => {
    if (orders.length > 0) {
      if (currentUser) {
        const userOrder = orders.find(
          (o) =>
            o.customer.email.toLowerCase() === currentUser.email?.toLowerCase(),
        );
        if (userOrder) {
          setMasterOrder(userOrder);
        } else {
          setMasterOrder(null);
        }
      } else {
        setMasterOrder(orders[0] || null);
      }
    }
  }, [currentUser, orders]);

  // Secure Deposit Checkout State
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<
    "ideal" | "stripe"
  >("ideal");
  const [checkoutIdealBank, setCheckoutIdealBank] =
    useState<string>("Rabobank");
  const [checkoutCardNumber, setCheckoutCardNumber] = useState<string>(
    "4242 4242 4242 4242",
  );
  const [checkoutCardExpiry, setCheckoutCardExpiry] = useState<string>("12/28");
  const [checkoutCardCvc, setCheckoutCardCvc] = useState<string>("315");
  const [isPaymentProcessing, setIsPaymentProcessing] =
    useState<boolean>(false);

  const triggerNotification = (
    message: string,
    type: "success" | "info" = "success",
  ) => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Keep track of batches joined by this user in localStorage
  const [joinedBatchIds, setJoinedBatchIds] = useState<string[]>(() => {
    return StorageService.getJoinedBatchIds() || [];
  });

  React.useEffect(() => {
    StorageService.saveJoinedBatchIds(joinedBatchIds);
  }, [joinedBatchIds]);

  const handleUpdateCustomGroup = (
    batchId: string,
    updatedFields: Partial<CustomGroup>,
  ) => {
    setCustomGroups((prev) =>
      prev.map((group) => {
        if (group.batchId === batchId) {
          return { ...group, ...updatedFields };
        }
        return group;
      }),
    );
    triggerNotification("Batch configuration updated successfully.", "success");
  };

  const handleDeleteCustomGroup = (batchId: string) => {
    setCustomGroups((prev) => prev.filter((g) => g.batchId !== batchId));
    triggerNotification("Batch deleted permanently.", "info");
  };

  const handleLeaveCustomGroup = (batchId: string) => {
    setCustomGroups((prev) =>
      prev.map((group) => {
        if (group.batchId === batchId) {
          return {
            ...group,
            currentMembers: Math.max(0, group.currentMembers - 1),
          };
        }
        return group;
      }),
    );
    setJoinedBatchIds((prev) => prev.filter((id) => id !== batchId));
    triggerNotification("You have successfully left the order batch.", "info");
  };

  const handleJoinCustomGroup = (batchId: string) => {
    if (joinedBatchIds.includes(batchId)) return;
    setCustomGroups((prev) =>
      prev.map((group) => {
        if (group.batchId === batchId) {
          return { ...group, currentMembers: group.currentMembers + 1 };
        }
        return group;
      }),
    );
    setJoinedBatchIds((prev) => [...prev, batchId]);
    triggerNotification("Successfully joined the order batch!", "success");
  };

  // State actions
  const handleAddToCart = (item: Omit<CartItem, "id">) => {
    const newItem: CartItem = {
      ...item,
      id: `CART-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
    setCartItems((prev) => [...prev, newItem]);
    triggerNotification(
      `"${item.style.name}" added to your tailoring cart!`,
      "success",
    );
  };

  const handleExecuteDepositPayment = () => {
    setIsPaymentProcessing(true);
    // Simulate payment processing...
    setTimeout(() => {
      setIsPaymentProcessing(false);
      setIsCheckoutPaymentOpen(false);
      setIsCartOpen(false);
      setCartItems([]);
      triggerNotification(
        "Deposit authorized securely! Atelier notified.",
        "success"
      );
      // Re-evaluate journey to determine post-checkout destination
      const nextJourney = CustomerJourneyEngine.getCurrentJourney({
        currentUser: store.currentUser as any,
        drafts: [],
        activeOrders: store.orders, // we would ideally add the order here
        historicalOrders: store.historicalOrders,
        allBatches: store.batches,
      });
      setActiveTab(nextJourney.destination as any);
    }, 2000);
  };

  const handleReorder = () => {
    // Navigate straight to Design Studio
    setActiveTab("design");
    triggerNotification(
      `Custom design selected. You can now edit your options.`,
      "info",
    );
  };

  const handleLogin = (email: string, name: string, phone?: string) => {
    const user: Customer = { email, name, phone: phone || "", location: "" };
    setCurrentUser(user);
    StorageService.saveSession(user);
    triggerNotification(
      `Welcome back, ${name}! Secure session activated.`,
      "success",
    );
    
    // Re-evaluate journey upon login
    if (store.pendingRedirect) {
      setActiveTab(store.pendingRedirect as any);
      store.setPendingRedirect(null);
    } else if (activeTab === "login") {
      const loginJourney = CustomerJourneyEngine.getCurrentJourney({
        currentUser: user as any,
        drafts: store.cartItems,
        activeOrders: store.orders,
        historicalOrders: store.historicalOrders,
        allBatches: store.batches,
      });
      setActiveTab(loginJourney.destination as any);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn("Firebase signout error", err);
    }
    setCurrentUser(null);
    StorageService.clearSession();
    setActiveTab("home");
    triggerNotification("Logged out successfully.", "info");
  };

  const handleUpdateProfile = (name: string, email: string, phone: string) => {
    if (masterOrder) {
      setMasterOrder((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          customer: {
            ...prev.customer,
            name,
            email,
            phone,
          },
        };
      });
    }
    triggerNotification("Contact info saved successfully.", "success");
  };

  const handleUpdateMeasurements = (
    measurements: MasterOrder["measurements"],
  ) => {
    if (masterOrder) {
      setMasterOrder((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          measurements,
        };
      });
    }
    triggerNotification("Sizes updated successfully.", "success");
  };

  const checkoutSubtotal = cartItems.reduce(
    (acc, item) => acc + item.garment.totalPrice,
    0,
  );
  const checkoutDepositRatio =
    businessSettings.pricingSettings.depositPercentage / 100;
  const checkoutDepositAmount = checkoutSubtotal * checkoutDepositRatio;
  const checkoutRemainingAmount = checkoutSubtotal - checkoutDepositAmount;
  const currencySymbol =
    businessSettings.pricingSettings.currency === "EUR"
      ? "€"
      : businessSettings.pricingSettings.currency === "USD"
        ? "$"
        : "₦";

  return (
    <div className="min-h-screen bg-heritage-cream text-heritage-ink flex flex-col justify-between">
      {/* Toast Notification HUD */}
      {notification && (
        <div className="fixed top-24 right-6 z-50 p-4 rounded-2xl bg-heritage-forest text-white border-2 border-heritage-gold shadow-2xl flex items-center gap-3 animate-fade-in text-xs font-sans max-w-sm select-none">
          <div className="h-6 w-6 rounded-full bg-heritage-gold/25 text-heritage-gold flex items-center justify-center shrink-0">
            {notification.type === "success" ? (
              <Check size={14} />
            ) : (
              <Sparkles size={14} />
            )}
          </div>
          <p className="font-semibold leading-normal">{notification.message}</p>
        </div>
      )}

      {/* STICKY STYLIZED HEADER & TAB SWITCHBOARD */}
      <Header />

      {/* MOBILE DRAWER PORTAL */}
      <MobileMenu />

      {/* CORE ACTIVE OUTLET VIEWPORT */}
      <main className="flex-grow mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 w-full">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-heritage-gold"></div>
              </div>
            }
          >
            {activeTab === "home" && (
              <HomeView
                onStartDesigning={() => {
                  setOrderContext(activeCommunityBatch);
                  setActiveTab("design");
                }}
                onNavigateToTab={(
                  tabId:
                    | "home"
                    | "design"
                    | "dashboard"
                    | "about"
                    | "gallery"
                    | "database"
                    | "custom-order"
                    | "login",
                ) => setActiveTab(tabId)}
                activeCommunityBatch={activeCommunityBatch}
                communityPhotos={communityPhotos}
                showpieces={showpieces}
                fabrics={fabrics}
                onSelectStyle={(styleId, fabricCode) => {
                  setPresetStyleId(styleId);
                  setPresetFabricCode(fabricCode);
                  if (!currentUser) {
                    setActiveTab("login");
                    triggerNotification(
                      "Please login to customize this look.",
                      "info"
                    );
                  } else {
                    setOrderContext(activeCommunityBatch);
                    setActiveTab("design");
                    triggerNotification(
                      "Design Studio loaded with your selected look.",
                      "info"
                    );
                  }
                }}
                onSelectFabric={(fabricCode) => {
                  setPresetStyleId(undefined);
                  setPresetFabricCode(fabricCode);
                  if (!currentUser) {
                    setActiveTab("login");
                    triggerNotification(
                      "Please login to customize this fabric.",
                      "info"
                    );
                  } else {
                    setOrderContext(activeCommunityBatch);
                    setActiveTab("design");
                    triggerNotification(
                      "Design Studio loaded with your selected fabric.",
                      "info"
                    );
                  }
                }}
              />
            )}

            {activeTab === "design" && (
              AuthorizationEngine.canAccessRoute("design", currentUser) ? (
                <DesignStudioView
                  onAddToCart={handleAddToCart}
                  onNavigateToTab={(
                    tabId:
                      | "home"
                      | "design"
                      | "dashboard"
                      | "about"
                      | "gallery"
                      | "database"
                      | "custom-order"
                      | "login",
                  ) => setActiveTab(tabId)}
                  openCartDrawer={() => setIsCartOpen(true)}
                  currentUser={currentUser}
                  orderContext={orderContext}
                  styles={styles}
                  fabrics={fabrics}
                  customers={customers}
                  setCustomers={setCustomers}
                  initialStyleId={presetStyleId}
                  initialFabricCode={presetFabricCode}
                  clearInitialPreset={() => {
                    setPresetStyleId(null);
                    setPresetFabricCode(null);
                  }}
                />
              ) : (
                <LoginView
                  onLogin={handleLogin}
                  customers={customers}
                  setCustomers={setCustomers}
                />
              )
            )}

            {activeTab === "custom-order" && (
              <CustomOrderView
                customGroups={customGroups}
                batches={batches}
                onCreateCustomGroup={(newGroup) => {
                  const fullGroup: CustomGroup = {
                    ...newGroup,
                    batchId: `GRP-${newGroup.batchName.replace(/\s+/g, "")}`,
                    currentMembers: 1,
                    organizer: currentUser?.name || "Xavier E.",
                    closingDate: "August 15, 2026",
                    deliveryWindow: `Late ${newGroup.preferredDeliveryMonth}`,
                    status: "OPEN",
                  };
                  setCustomGroups((prev) => [fullGroup, ...prev]);
                }}
                onSelectOrderContext={(context) => {
                  setOrderContext(context);
                  setActiveTab("design");
                  triggerNotification(
                    `Context initialized: ${context.orderType}. Launching Studio!`,
                    "success",
                  );
                }}
                currentUser={currentUser}
                onJoinCustomGroup={handleJoinCustomGroup}
              />
            )}

            {activeTab === "dashboard" &&
              (AuthorizationEngine.canViewCustomerPortal(currentUser) ? (
                <DashboardView
                  masterOrder={masterOrder}
                  historicalOrders={historicalOrders}
                  activeOrders={orders}
                  drafts={cartItems}
                  onDeleteDraft={(id) => setCartItems((prev) => prev.filter((i) => i.id !== id))}
                  onReorder={handleReorder}
                  onNavigateToTab={(
                    tabId:
                      | "home"
                      | "design"
                      | "dashboard"
                      | "about"
                      | "gallery"
                      | "database"
                      | "custom-order"
                    | "login",
                  ) => setActiveTab(tabId)}
                  onUpdateProfile={handleUpdateProfile}
                  onUpdateMeasurements={handleUpdateMeasurements}
                  onLogout={handleLogout}
                  customGroups={customGroups}
                  onUpdateCustomGroup={handleUpdateCustomGroup}
                  onDeleteCustomGroup={handleDeleteCustomGroup}
                  onSelectOrderContext={(context) => {
                    setOrderContext(context);
                    setActiveTab("design");
                    triggerNotification(
                      `Context loaded: ${context.batchName || context.orderType}. Opening Studio!`,
                      "success",
                    );
                  }}
                  joinedBatchIds={joinedBatchIds}
                  onLeaveCustomGroup={handleLeaveCustomGroup}
                  currentUser={currentUser}
                  batches={batches}
                />
              ) : (
                <LoginView
                  onLogin={handleLogin}
                  customers={customers}
                  setCustomers={setCustomers}
                />
              ))}

            
            {activeTab === "login" && !currentUser && (
              <LoginView
                onLogin={handleLogin}
                customers={customers}
                setCustomers={setCustomers}
              />
            )}

            {activeTab === "about" && <AboutView />}

            {activeTab === "gallery" && (
              <GalleryView
                showpieces={showpieces}
                communityPhotos={communityPhotos}
                fabrics={fabrics}
                styles={styles}
                batches={batches}
                onNavigateToTab={(tab) => setActiveTab(tab as any)}
                onSelectStyle={(styleId, fabricCode) => {
                  setPresetStyleId(styleId);
                  setPresetFabricCode(fabricCode);
                  setActiveTab("design");
                  triggerNotification(
                    `Gallery preset loaded: ${styleId} + ${fabricCode}`,
                    "info",
                  );
                }}
              />
            )}

            {activeTab === "database" && (
              <AdminAuthGuard onNavigateHome={() => setActiveTab("home")}>
                <DatabaseView
                  customers={customers}
                  setCustomers={setCustomers}
                  styles={styles}
                  setStyles={setStyles}
                  fabrics={fabrics}
                  setFabrics={setFabrics}
                  customGroups={customGroups}
                  setCustomGroups={setCustomGroups}
                  orders={orders}
                  setOrders={setOrders}
                  showpieces={showpieces}
                  setShowpieces={setShowpieces}
                  communityPhotos={communityPhotos}
                  setCommunityPhotos={setCommunityPhotos}
                  batches={batches}
                  setBatches={setBatches}
                  businessSettings={businessSettings}
                  setBusinessSettings={setBusinessSettings}
                />
              </AdminAuthGuard>
            )}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* PREMIUM FOOTER */}
      <Footer />

      {/* SHOPPING CART SLIDE-OVER DRAWER */}
      <CartDrawer />

      {isCheckoutPaymentOpen && (
        <div className="fixed inset-0 bg-heritage-ink/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-heritage-cream border border-heritage-gold/30 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-heritage-green p-6 text-white border-b border-heritage-gold/25 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="text-heritage-gold h-5 w-5 animate-pulse" />
                <div>
                  <h3 className="font-serif font-bold text-sm uppercase tracking-wide">
                    Heritage Escrow Deposit Gate
                  </h3>
                  <p className="text-[10px] text-heritage-beige/70">
                    Campus-Escrow Pipeline
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCheckoutPaymentOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 space-y-6 overflow-y-auto text-left font-sans text-xs text-heritage-ink">
              {/* Order Invoice Breakdown */}
              <div className="bg-white border border-heritage-gold/10 p-4 rounded-2xl space-y-3 shadow-sm">
                <h4 className="font-serif font-semibold text-heritage-green uppercase text-[10px] tracking-wider pb-1.5 border-b border-gray-100 flex justify-between">
                  <span>Escrow Invoice Details</span>
                  <span className="font-mono text-gray-400 font-normal">
                    Items: {cartItems.length}
                  </span>
                </h4>
                <div className="space-y-1.5 text-gray-600">
                  <div className="flex justify-between">
                    <span>Aggregate Garment Subtotal:</span>
                    <span className="font-mono">
                      {currencySymbol}
                      {checkoutSubtotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-heritage-green font-bold text-sm pt-1.5 border-t border-dashed border-gray-100 font-serif">
                    <span>
                      Escrow Activation Deposit (
                      {businessSettings.pricingSettings.depositPercentage}%):
                    </span>
                    <span className="font-mono text-heritage-gold">
                      {currencySymbol}
                      {checkoutDepositAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Remaining Balance Due at Locker Delivery:</span>
                    <span className="font-mono">
                      {currencySymbol}
                      {checkoutRemainingAmount.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Leftover Fabric Management Policy */}
                <div className="mt-3 p-3 bg-heritage-forest/5 rounded-xl border border-heritage-gold/15 space-y-1">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-heritage-green flex items-center gap-1">
                    ✂️ Leftover Fabric Preference:
                  </span>
                  <p className="text-[10px] text-gray-600 italic leading-relaxed">
                    "
                    {cartItems[0]?.notesAboutLeftoverFabric ||
                      "Return leftover fabric pieces with garment"}
                    "
                  </p>
                </div>
              </div>

              {/* Payment Methods Selector Tabs */}
              <div className="space-y-3">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-heritage-green">
                  Choose Deposit Settlement Option
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCheckoutPaymentMethod("ideal")}
                    className={`p-3.5 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition cursor-pointer ${
                      checkoutPaymentMethod === "ideal"
                        ? "border-heritage-gold bg-heritage-gold/10 text-heritage-green"
                        : "border-gray-200 bg-white hover:border-gray-300 text-gray-500"
                    }`}
                  >
                    <span className="text-xl">🇳🇱</span>
                    <span className="font-bold text-[10px] uppercase tracking-wider">
                      iDEAL Bank Transfer
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutPaymentMethod("stripe")}
                    className={`p-3.5 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition cursor-pointer ${
                      checkoutPaymentMethod === "stripe"
                        ? "border-heritage-gold bg-heritage-gold/10 text-heritage-green"
                        : "border-gray-200 bg-white hover:border-gray-300 text-gray-500"
                    }`}
                  >
                    <span className="text-lg">💳</span>
                    <span className="font-bold text-[10px] uppercase tracking-wider">
                      Stripe Credit Card
                    </span>
                  </button>
                </div>
              </div>

              {/* Payment Details Inputs */}
              {checkoutPaymentMethod === "ideal" ? (
                <div className="bg-white border border-heritage-gold/10 p-4 rounded-2xl space-y-3 shadow-sm">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-heritage-green">
                      Select Dutch Issuing Bank
                    </label>
                    <select
                      value={checkoutIdealBank}
                      onChange={(e) => setCheckoutIdealBank(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                    >
                      <option value="Rabobank">Rabobank</option>
                      <option value="ING Bank">ING Bank</option>
                      <option value="ABN AMRO">ABN AMRO</option>
                      <option value="SNS Bank">SNS Bank</option>
                      <option value="RegioBank">RegioBank</option>
                      <option value="Triodos Bank">Triodos Bank</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-gray-400 italic">
                    Upon pressing pay, you will be securely redirected to your
                    bank's authentication gateway to authorize the 50% escrow
                    deposit.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-heritage-gold/10 p-4 rounded-2xl space-y-3 shadow-sm">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-heritage-green">
                      Card Number
                    </label>
                    <input
                      type="text"
                      value={checkoutCardNumber}
                      onChange={(e) => setCheckoutCardNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-heritage-green">
                        Expiry Date
                      </label>
                      <input
                        type="text"
                        value={checkoutCardExpiry}
                        onChange={(e) => setCheckoutCardExpiry(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono font-medium"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-heritage-green">
                        CVC Security Code
                      </label>
                      <input
                        type="text"
                        value={checkoutCardCvc}
                        onChange={(e) => setCheckoutCardCvc(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono font-medium"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Secure Escrow Protection Badge */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl leading-relaxed text-[10px] flex items-start gap-2.5">
                <span className="text-sm">🛡️</span>
                <div>
                  <strong>Escrow Security Protocol Active:</strong> Your payment
                  remains frozen in the campus's verified locker holding vault.
                  Tailors receive fabrication materials only, and cannot access
                  the final sum until you scan your lockers passcode.
                </div>
              </div>
            </div>

            {/* Footer Pay Button */}
            <div className="p-6 bg-gray-50 border-t border-gray-150 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setIsCheckoutPaymentOpen(false)}
                className="px-4 py-2 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-[10px] font-bold uppercase tracking-wider transition cursor-pointer"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleExecuteDepositPayment}
                disabled={isPaymentProcessing}
                className="px-6 py-2 bg-heritage-green hover:bg-heritage-gold text-white hover:text-heritage-forest rounded-xl text-[10px] font-bold uppercase tracking-widest transition flex items-center gap-2 border border-heritage-gold/20 shadow-md cursor-pointer disabled:opacity-50"
              >
                {isPaymentProcessing ? (
                  <>
                    <span className="animate-spin inline-block h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                    Authorizing Escrow...
                  </>
                ) : (
                  <>
                    <LockIcon
                      size={11}
                      className="text-heritage-gold animate-bounce"
                    />
                    Authorize Escrow Deposit ({currencySymbol}
                    {checkoutDepositAmount.toFixed(2)})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
