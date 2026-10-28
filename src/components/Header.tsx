import {
  Compass,
  Shirt,
  ClipboardList,
  Layers,
  Info,
  Database,
  ShoppingCart,
  Menu,
  LogIn,
  LogOut,
  Star,
  MessageSquare,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { auth } from "../services/firebase";
import { signOut } from "firebase/auth";
import odogwuLogo from "../assets/images/odogwu_logo_1782556303014.jpg";
import { AuthorizationEngine } from "../engine/AuthorizationEngine";

export function Header() {
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const requestDesignStudioFromNav = useAppStore(
    (state) => state.requestDesignStudioFromNav,
  );
  const setIsMobileMenuOpen = useAppStore((state) => state.setIsMobileMenuOpen);
  const setIsCartOpen = useAppStore((state) => state.setIsCartOpen);
  const requestSiteFeedbackOpen = useAppStore(
    (state) => state.requestSiteFeedbackOpen,
  );
  const cartItemsCount = useAppStore(
    (state) => state.cartItems.length + state.futureOrderV2CartItems.length,
  );
  const businessSettings = useAppStore((state) => state.businessSettings);

  const { currentUser, setCurrentUser } = useAppStore();
  const handleAuth = async () => {
    try {
      if (currentUser) {
        await signOut(auth);
        setCurrentUser(null);
        setActiveTab("home");
      } else {
        setActiveTab("login" as any);
      }
    } catch (error) {
      console.error("Auth error:", error);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-heritage-green border-b border-heritage-gold/25 shadow-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Phones: a 3-column grid so the community line can use the full width
            under the title and controls. sm+: a single flex row. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 py-2 min-h-20 sm:flex sm:h-20 sm:py-0 sm:justify-between sm:gap-4">
          {/* Logo */}
          <div
            onClick={() => {
              setActiveTab("home");
              setIsMobileMenuOpen(false);
            }}
            className="contents sm:flex sm:items-center sm:gap-3 sm:min-w-0 sm:flex-1 cursor-pointer select-none"
          >
            <img
              loading="lazy"
              src={odogwuLogo}
              alt="The Odogwu Heritage Logo"
              className="col-start-1 row-start-1 row-span-2 self-center w-11 h-11 rounded-full border border-heritage-gold/35 object-cover bg-heritage-forest shrink-0 shadow-md cursor-pointer"
              referrerPolicy="no-referrer"
            />
            <div className="contents sm:flex sm:flex-col sm:justify-center sm:min-w-0">
              <span
                data-header-brand-title
                className="col-start-2 row-start-1 self-center sm:self-stretch min-w-0 cursor-pointer text-[12px] min-[380px]:text-[13px] sm:text-sm md:text-base leading-tight font-bold tracking-[0.08em] sm:tracking-[0.16em] xl:tracking-[0.14em] text-heritage-gold uppercase font-display break-words text-balance"
              >
                THE ODOGWU HERITAGE
              </span>
              <span
                data-header-community-line
                className="col-start-2 col-span-2 row-start-2 min-w-0 cursor-pointer sm:mt-0.5 text-[10px] md:text-[11px] leading-snug sm:leading-tight tracking-[0.04em] sm:tracking-wide text-heritage-beige uppercase font-sans font-extrabold break-words text-balance"
              >
                {businessSettings.applicationSettings.tagline ||
                  "NIGERIAN TRADITIONAL CLOTHING COMMUNITY (NTCC)"}
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden xl:flex items-center gap-1.5 shrink-0">
            <nav className="flex space-x-0.5 bg-heritage-forest p-1 rounded-2xl border border-heritage-gold/15">
              {[
                { id: "home", label: "Home", icon: Compass },
                { id: "design", label: "Design Studio", icon: Shirt },
                (currentUser
                  ? {
                      id: "dashboard",
                      label: "My Dashboard",
                      icon: ClipboardList,
                    }
                  : null),
                { id: "about", label: "About", icon: Info },
                { id: "gallery", label: "Gallery", icon: Layers },
                { id: "reviews", label: "Reviews", icon: Star },
                (AuthorizationEngine.canViewStaffDashboard(currentUser) ? { id: "database", label: "Admin Portal & DB", icon: Database } : null),
              ].filter(Boolean).map((tab, _index, tabs) => {
                if (!tab) return null;
                // Staff see 7 tabs; drop the tab icons then so the full brand title still fits.
                const showTabIcon = tabs.length <= 6;
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.id === "design") {
                        requestDesignStudioFromNav();
                        return;
                      }
                      setActiveTab(tab.id as any);
                    }}
                    className={`flex items-center gap-2 px-2 py-1.5 min-h-[38px] text-[10px] font-bold uppercase tracking-wider whitespace-nowrap rounded-xl transition-all duration-200 ${
                      isActive
                        ? "bg-heritage-green text-heritage-gold border border-heritage-gold/25 shadow-md font-extrabold"
                        : "text-heritage-beige hover:text-heritage-gold"
                    }`}
                  >
                    {showTabIcon && <Icon size={12} className="shrink-0" />}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="relative flex items-center justify-center min-h-[38px] px-3 rounded-xl bg-heritage-forest text-heritage-gold hover:bg-heritage-gold hover:text-heritage-forest transition border border-heritage-gold/20 cursor-pointer select-none"
              title="View Tailoring Cart"
            >
              <ShoppingCart size={12} className="mr-1.5 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Cart
              </span>
              {cartItemsCount > 0 && (
                <span className="absolute -top-1.5 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-600 text-[8px] font-black text-white shadow-md">
                  {cartItemsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleAuth}
              className="flex items-center justify-center min-h-[38px] px-3 rounded-xl bg-heritage-forest text-heritage-gold hover:bg-heritage-gold hover:text-heritage-forest transition border border-heritage-gold/20 cursor-pointer select-none"
              title={currentUser ? "Logout" : "Login"}
            >
              {currentUser ? (
                <LogOut size={12} className="mr-1.5 shrink-0" />
              ) : (
                <LogIn size={12} className="mr-1.5 shrink-0" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {currentUser ? "Logout" : "Login"}
              </span>
            </button>
            <button
              type="button"
              data-site-feedback-header-button="true"
              onClick={requestSiteFeedbackOpen}
              aria-label="Send feedback"
              aria-haspopup="dialog"
              title="Send feedback"
              className="flex items-center justify-center min-h-[38px] px-3.5 rounded-xl bg-heritage-gold text-heritage-forest hover:brightness-110 transition border border-heritage-gold shadow-md cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-beige focus-visible:ring-offset-2 focus-visible:ring-offset-heritage-green"
            >
              <MessageSquare size={14} aria-hidden="true" className="mr-1.5 shrink-0" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider">
                Feedback
              </span>
            </button>
          </div>

          {/* Mobile Navigation Controls */}
          <div className="col-start-3 row-start-1 self-center flex xl:hidden items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="relative flex items-center justify-center w-11 h-11 sm:h-10 sm:w-auto sm:px-3.5 rounded-xl bg-heritage-forest text-heritage-gold hover:bg-heritage-gold hover:text-heritage-forest transition border border-heritage-gold/15 cursor-pointer select-none shadow-sm"
              title="View Tailoring Cart"
              aria-label="Cart"
            >
              <ShoppingCart size={16} className="sm:mr-1 shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider hidden sm:inline">
                Cart
              </span>
              {cartItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-600 text-[8px] font-black text-white shadow-md">
                  {cartItemsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleAuth}
              className="flex items-center justify-center w-11 h-11 sm:h-10 sm:px-3.5 rounded-xl bg-heritage-forest text-heritage-gold hover:bg-heritage-gold hover:text-heritage-forest transition border border-heritage-gold/15 cursor-pointer select-none shadow-sm"
              title={currentUser ? "Logout" : "Login"}
              aria-label={currentUser ? "Logout" : "Login"}
            >
              {currentUser ? (
                <LogOut size={16} className="sm:mr-1 shrink-0" />
              ) : (
                <LogIn size={16} className="sm:mr-1 shrink-0" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex items-center justify-center w-11 h-11 sm:h-10 sm:w-10 rounded-xl bg-heritage-forest text-heritage-gold hover:bg-heritage-gold hover:text-heritage-forest transition border border-heritage-gold/15 cursor-pointer select-none shadow-sm"
              aria-label="Open main navigation menu"
            >
              <Menu size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
