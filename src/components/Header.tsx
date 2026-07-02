import { useState, useEffect } from "react";
import {
  Home,
  Compass,
  Shirt,
  ClipboardList,
  Layers,
  Info,
  Database,
  ShoppingCart,
  Menu,
  MessageCircle,
  LogIn,
  LogOut,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { auth } from "../services/firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import odogwuLogo from "../assets/images/odogwu_logo_1782556303014.jpg";

export function Header() {
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setIsMobileMenuOpen = useAppStore((state) => state.setIsMobileMenuOpen);
  const setIsCartOpen = useAppStore((state) => state.setIsCartOpen);
  const cartItemsCount = useAppStore((state) => state.cartItems.length);
  const businessSettings = useAppStore((state) => state.businessSettings);

  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
  }, []);

  const { currentUser, setCurrentUser } = useAppStore();
  const handleAuth = async () => {
    try {
      if (currentUser || user) {
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
        <div className="flex h-20 items-center justify-between">
          {/* Logo */}
          <div
            onClick={() => {
              setActiveTab("home");
              setIsMobileMenuOpen(false);
            }}
            className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0 max-w-[60%] sm:max-w-none"
          >
            <img
              loading="lazy"
              src={odogwuLogo}
              alt="The Odogwu Heritage Logo"
              className="w-11 h-11 sm:w-11 sm:h-11 rounded-full border border-heritage-gold/35 object-cover bg-heritage-forest shrink-0 shadow-md"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col min-w-0">
              <span className="hidden sm:block text-xs sm:text-sm md:text-base font-bold tracking-[0.1em] sm:tracking-[0.2em] text-heritage-gold uppercase font-display truncate">
                THE ODOGWU HERITAGE
              </span>
              <span className="hidden sm:block text-[7px] sm:text-[8px] tracking-wide text-heritage-beige uppercase font-sans font-medium truncate">
                {businessSettings.applicationSettings.tagline || "NIGERIAN TRADITIONAL CLOTHING COMMUNITY (NTCC)"}
              </span>
              <div className="block sm:hidden leading-[1.05] uppercase">
                <span className="block text-[10.5px] font-extrabold tracking-[0.06em] text-heritage-gold font-display">
                  THE ODOGWU
                </span>
                <span className="block text-[10.5px] font-extrabold tracking-[0.06em] text-heritage-gold font-display">
                  HERITAGE
                </span>
                <span className="block text-[9px] tracking-[0.12em] text-heritage-beige font-sans font-semibold mt-0.5">
                  NTCC
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-3">
            <nav className="flex space-x-1.5 bg-heritage-forest p-1 rounded-2xl border border-heritage-gold/15">
              {[
                { id: "home", label: "Home", icon: Compass },
                { id: "design", label: "Design Studio", icon: Shirt },
                { id: "dashboard", label: "My Dashboard", icon: ClipboardList },
                { id: "about", label: "About", icon: Info },
                { id: "gallery", label: "Lookbook", icon: Layers },
                { id: "database", label: "Admin Portal & DB", icon: Database },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 min-h-[38px] text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all duration-200 ${
                      isActive
                        ? "bg-heritage-green text-heritage-gold border border-heritage-gold/25 shadow-md font-extrabold"
                        : "text-heritage-beige hover:text-heritage-gold"
                    }`}
                  >
                    <Icon size={12} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="relative flex items-center justify-center min-h-[38px] px-3.5 rounded-xl bg-heritage-forest text-heritage-gold hover:bg-heritage-gold hover:text-heritage-forest transition border border-heritage-gold/20 cursor-pointer select-none"
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
              className="flex items-center justify-center min-h-[38px] px-3.5 rounded-xl bg-heritage-forest text-heritage-gold hover:bg-heritage-gold hover:text-heritage-forest transition border border-heritage-gold/20 cursor-pointer select-none"
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
          </div>

          {/* Mobile Navigation Controls */}
          <div className="flex lg:hidden items-center gap-1 sm:gap-2.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab("home");
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] rounded-xl bg-heritage-forest text-heritage-gold hover:bg-heritage-gold hover:text-heritage-forest transition border border-heritage-gold/15 cursor-pointer shadow-sm"
              aria-label="Home"
              title="Home"
            >
              <Home size={18} />
            </button>
            <a
              href={`https://wa.me/${businessSettings?.applicationSettings?.whatsappNumber?.replace(/\D/g, "") || "31657903098"}`}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] rounded-xl bg-heritage-forest text-heritage-gold hover:bg-heritage-gold hover:text-heritage-forest transition border border-heritage-gold/15 cursor-pointer shadow-sm"
              aria-label="WhatsApp Chat"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={18} />
            </a>

            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="relative flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:px-3.5 rounded-xl bg-heritage-forest text-heritage-gold hover:bg-heritage-gold hover:text-heritage-forest transition border border-heritage-gold/15 cursor-pointer select-none shadow-sm"
              title="View Tailoring Cart"
            >
              <ShoppingCart size={14} className="sm:mr-1 shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider hidden sm:inline">
                Cart
              </span>
              {cartItemsCount > 0 && (
                <span className="absolute -top-1 -right-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-600 text-[8px] font-black text-white shadow-md">
                  {cartItemsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleAuth}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:px-3.5 rounded-xl bg-heritage-forest text-heritage-gold hover:bg-heritage-gold hover:text-heritage-forest transition border border-heritage-gold/15 cursor-pointer select-none shadow-sm"
              title={currentUser ? "Logout" : "Login"}
            >
              {currentUser ? (
                <LogOut size={14} className="sm:mr-1 shrink-0" />
              ) : (
                <LogIn size={14} className="sm:mr-1 shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] rounded-xl bg-heritage-forest text-heritage-gold hover:bg-heritage-gold hover:text-heritage-forest transition border border-heritage-gold/15 cursor-pointer select-none shadow-sm"
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
