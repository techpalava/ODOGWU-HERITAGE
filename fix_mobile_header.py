import re

with open('src/components/Header.tsx', 'r') as f:
    header_content = f.read()

# Remove Home and WhatsApp buttons from mobile header
# Keep: Cart, Login/Logout, Menu
mobile_nav_start = header_content.find('          {/* Mobile Navigation Controls */}')
mobile_nav_end = header_content.find('        </div>', mobile_nav_start)

mobile_nav_section = header_content[mobile_nav_start:mobile_nav_end]

# Modify mobile nav section
new_mobile_nav_section = """          {/* Mobile Navigation Controls */}
          <div className="flex lg:hidden items-center gap-1.5 shrink-0">
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
          </div>"""

header_content = header_content.replace(mobile_nav_section, new_mobile_nav_section)

# Also update the branding wrapper so it can shrink and wrap properly
# Find the wrapping div for the logo:
# <div
#             className="flex items-center gap-3 cursor-pointer shrink-0 sm:shrink max-w-[60%] sm:max-w-none"
#             onClick={() => setActiveTab("home")}
#           >

branding_start_str = """          {/* Logo & Branding */}
          <div
            className="flex items-center gap-2 sm:gap-3 cursor-pointer shrink sm:max-w-none"
            onClick={() => setActiveTab("home")}
          >"""
# Wait, let's just replace the exact block if possible, or use regex.
header_content = re.sub(
    r'<div\s+className="flex items-center gap-3 cursor-pointer shrink-0 sm:shrink max-w-\[60%\] sm:max-w-none"\s+onClick=\{\(\) => setActiveTab\("home"\)\}\s*>',
    '<div className="flex items-center gap-2 sm:gap-3 cursor-pointer shrink min-w-0" onClick={() => setActiveTab("home")}>',
    header_content
)

# And update the title wrapping and tagline:
# Current: 
# <div className="block sm:hidden leading-[1.05] uppercase">
#   <span className="block text-[10.5px] font-extrabold tracking-[0.06em] text-heritage-gold font-display">
#     THE ODOGWU
#   </span>
#   <span className="block text-[10.5px] font-extrabold tracking-[0.06em] text-heritage-gold font-display">
#     HERITAGE
#   </span>
#   <span className="block text-[9px] tracking-[0.12em] text-heritage-beige font-sans font-semibold mt-0.5">
#     NTCC
#   </span>
# </div>

new_mobile_branding = """              <div className="block sm:hidden leading-[1.1] uppercase min-w-0 pr-1">
                <span className="block text-[11px] font-extrabold tracking-[0.05em] text-heritage-gold font-display truncate">
                  THE ODOGWU HERITAGE
                </span>
                <span className="block text-[8px] tracking-[0.05em] text-heritage-beige font-sans font-semibold mt-0.5 truncate">
                  {businessSettings.applicationSettings.tagline || "NIGERIAN TRADITIONAL CLOTHING"}
                </span>
              </div>"""

header_content = re.sub(
    r'<div className="block sm:hidden leading-\[1\.05\] uppercase">.*?</div>',
    new_mobile_branding,
    header_content,
    flags=re.DOTALL
)

with open('src/components/Header.tsx', 'w') as f:
    f.write(header_content)


with open('src/components/MobileMenu.tsx', 'r') as f:
    menu_content = f.read()

# Add MessageCircle to imports
if 'MessageCircle' not in menu_content:
    menu_content = menu_content.replace('  Database,\n} from "lucide-react";', '  Database,\n  MessageCircle,\n} from "lucide-react";')

# Add Community Chat to mobile menu
chat_item = """                  { id: "database", label: "Admin & DB Panel", icon: Database },
                ].map((tab) => {"""

new_chat_item = """                  { id: "database", label: "Admin & DB Panel", icon: Database },
                ].map((tab) => {"""

# Wait, let's add the WhatsApp Chat link explicitly after the nav, or inside the nav.
# Better to add it inside the nav mapping by making it a special case, or just below the nav mapping block.

new_nav = """                  );
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
              </nav>"""

menu_content = menu_content.replace("""                  );
                })}
              </nav>""", new_nav)

with open('src/components/MobileMenu.tsx', 'w') as f:
    f.write(menu_content)

