import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Home,
  Shirt,
  ShoppingBag,
  ClipboardList,
  Layers,
  Info,
  Database,
  MessageCircle,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import odogwuLogo from "../assets/images/odogwu_logo_1782556303014.jpg";

export function MobileMenu() {
  const isMobileMenuOpen = useAppStore((state) => state.isMobileMenuOpen);
  const setIsMobileMenuOpen = useAppStore((state) => state.setIsMobileMenuOpen);
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const businessSettings = useAppStore((state) => state.businessSettings);

  // Keyboard accessibility and body scroll block for mobile menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen, setIsMobileMenuOpen]);

  return (
    <AnimatePresence>
      {isMobileMenuOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 z-50 bg-heritage-green/75 backdrop-blur-xs lg:hidden"
            aria-hidden="true"
          />

          <motion.div
            id="mobile-sidebar-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Menu"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[310px] bg-heritage-green border-l border-heritage-gold/25 p-5 sm:p-6 shadow-2xl flex flex-col justify-between lg:hidden font-sans"
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-heritage-gold/15 pb-4">
                <div className="flex items-center gap-2.5">
                  <img
                    loading="lazy"
                    src={odogwuLogo}
                    alt="The Odogwu Heritage"
                    className="w-9 h-9 rounded-full border border-heritage-gold/30 object-cover bg-heritage-forest shadow-sm shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold tracking-widest text-heritage-gold uppercase font-display">
                      THE ODOGWU
                    </span>
                    <span className="text-[7px] tracking-wider text-heritage-beige/70 uppercase font-sans font-medium">
                      Bespoke Heritage
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] rounded-xl border border-heritage-gold/20 text-heritage-gold hover:text-white bg-heritage-forest/40 transition cursor-pointer"
                  aria-label="Close menu"
                >
                  <X size={14} />
                </button>
              </div>

              <nav
                className="flex flex-col space-y-1.5"
                aria-label="Mobile Tab Navigation"
              >
                {[
                  { id: "home", label: "Home", icon: Home },
                  { id: "design", label: "Design Studio", icon: Shirt },
                  {
                    id: "custom-order",
                    label: "Custom Order",
                    icon: ShoppingBag,
                  },
                  {
                    id: "dashboard",
                    label: "My Dashboard",
                    icon: ClipboardList,
                  },
                  { id: "gallery", label: "Gallery", icon: Layers },
                  { id: "about", label: "About Us", icon: Info },
                  { id: "database", label: "Admin & DB Panel", icon: Database },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as any);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`group flex items-center justify-between w-full py-3.5 px-4 rounded-xl text-left text-[11px] font-bold uppercase tracking-wider transition-all duration-200 border cursor-pointer select-none ${
                        isActive
                          ? "bg-heritage-forest text-heritage-gold border-heritage-gold/30 pl-5 border-l-4 shadow-md font-extrabold"
                          : "bg-transparent text-heritage-beige border-transparent hover:text-white hover:bg-heritage-forest/30"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          size={14}
                          className={
                            isActive
                              ? "text-heritage-gold"
                              : "text-heritage-beige/60 group-hover:text-white transition-colors"
                          }
                        />
                        <span>{tab.label}</span>
                      </div>
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-heritage-gold animate-pulse" />
                      )}
                    </button>
                  );
                })}
                <a
                  href={`https://wa.me/${businessSettings?.applicationSettings?.whatsappNumber?.replace(/\D/g, "") || "31657903098"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="group flex items-center justify-between w-full py-3.5 px-4 rounded-xl text-left text-[11px] font-bold uppercase tracking-wider transition-all duration-200 border cursor-pointer select-none bg-transparent text-heritage-beige border-transparent hover:text-white hover:bg-heritage-forest/30"
                >
                  <div className="flex items-center gap-3">
                    <MessageCircle
                      size={14}
                      className="text-heritage-beige/60 group-hover:text-white transition-colors"
                    />
                    <span>Community Chat</span>
                  </div>
                </a>
              </nav>
            </div>

            <div className="border-t border-heritage-gold/10 pt-4 space-y-2">
              <p className="text-[8px] text-heritage-beige/50 text-center leading-relaxed">
                Connecting Lagos ateliers with{" "}
                {businessSettings.applicationSettings.communityName}.
              </p>
              <div className="flex justify-center items-center gap-1.5">
                <span className="h-px bg-heritage-gold/15 flex-grow" />
                <span className="text-[8px] text-heritage-gold/60 font-mono tracking-[0.25em] uppercase shrink-0">
                  Odogwu Heritage
                </span>
                <span className="h-px bg-heritage-gold/15 flex-grow" />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
