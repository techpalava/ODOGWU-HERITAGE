const fs = require('fs');
let content = fs.readFileSync('src/components/Header.tsx', 'utf8');

if (!content.includes('import { AuthorizationEngine } from "../engine/AuthorizationEngine";')) {
    content = content.replace('import odogwuLogo from "../assets/images/odogwu_logo_1782556303014.jpg";', 'import odogwuLogo from "../assets/images/odogwu_logo_1782556303014.jpg";\nimport { AuthorizationEngine } from "../engine/AuthorizationEngine";');
}

const target = `              {[
                { id: "home", label: "Home", icon: Compass },
                { id: "design", label: "Design Studio", icon: Shirt },
                { id: "dashboard", label: "My Dashboard", icon: ClipboardList },
                { id: "about", label: "About", icon: Info },
                { id: "gallery", label: "Gallery", icon: Layers },
                { id: "database", label: "Admin Portal & DB", icon: Database },
              ].map((tab) => {`;

const replacement = `              {[
                { id: "home", label: "Home", icon: Compass },
                { id: "design", label: "Design Studio", icon: Shirt },
                { id: "dashboard", label: "My Dashboard", icon: ClipboardList },
                { id: "about", label: "About", icon: Info },
                { id: "gallery", label: "Gallery", icon: Layers },
                (AuthorizationEngine.canViewStaffDashboard(currentUser) ? { id: "database", label: "Admin Portal & DB", icon: Database } : null),
              ].filter(Boolean).map((tab) => {
                if (!tab) return null;`;

content = content.replace(target, replacement);
fs.writeFileSync('src/components/Header.tsx', content);
