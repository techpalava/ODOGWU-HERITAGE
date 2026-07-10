const fs = require('fs');
let content = fs.readFileSync('src/components/MobileMenu.tsx', 'utf8');

if (!content.includes('const currentUser = useAppStore((state) => state.currentUser);')) {
    content = content.replace('const activeTab = useAppStore((state) => state.activeTab);', 'const activeTab = useAppStore((state) => state.activeTab);\n  const currentUser = useAppStore((state) => state.currentUser);');
}

content = content.replace('useAppStore.getState().currentUser', 'currentUser');

fs.writeFileSync('src/components/MobileMenu.tsx', content);
