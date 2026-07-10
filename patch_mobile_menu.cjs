const fs = require('fs');
let content = fs.readFileSync('src/components/MobileMenu.tsx', 'utf8');

if (!content.includes('import { AuthorizationEngine } from "../engine/AuthorizationEngine";')) {
    content = content.replace('import { useAppStore } from "../store/useAppStore";', 'import { useAppStore } from "../store/useAppStore";\nimport { AuthorizationEngine } from "../engine/AuthorizationEngine";');
}

const target = `                {[
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
                ].map((tab) => {`;

const replacement = `                {[
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
                  (AuthorizationEngine.canViewStaffDashboard(useAppStore.getState().currentUser) ? { id: "database", label: "Admin & DB Panel", icon: Database } : null),
                ].filter(Boolean).map((tab) => {
                  if (!tab) return null;`;

content = content.replace(target, replacement);
fs.writeFileSync('src/components/MobileMenu.tsx', content);
