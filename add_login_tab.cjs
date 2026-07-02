const fs = require('fs');
let code = fs.readFileSync('src/store/useAppStore.ts', 'utf8');

code = code.replace(
  '| "custom-order";',
  '| "custom-order" | "login";\n  pendingRedirect: string | null;\n  setPendingRedirect: (redirect: string | null) => void;'
);

code = code.replace(
  '| "custom-order",',
  '| "custom-order" | "login",'
);

code = code.replace(
  'isMobileMenuOpen: false,',
  'pendingRedirect: null,\n  setPendingRedirect: (redirect) => set({ pendingRedirect: redirect }),\n  isMobileMenuOpen: false,'
);

fs.writeFileSync('src/store/useAppStore.ts', code);
