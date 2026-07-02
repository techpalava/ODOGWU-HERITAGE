const fs = require('fs');
let code = fs.readFileSync('src/store/useAppStore.ts', 'utf8');

const targetStr = `  setActiveTab: (tab) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("asml_active_tab", tab);
      sessionStorage.removeItem(\`asml_scroll_position_\${tab}\`);
    }
    set({ activeTab: tab });
  },`;

const replacement = `  setActiveTab: (tab) => {
    const state = get();
    // Protect Design Studio route
    if (tab === "design" && !state.currentUser) {
      set({ pendingRedirect: "design" });
      tab = "login";
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem("asml_active_tab", tab);
      sessionStorage.removeItem(\`asml_scroll_position_\${tab}\`);
    }
    set({ activeTab: tab });
  },`;

code = code.replace(targetStr, replacement);
fs.writeFileSync('src/store/useAppStore.ts', code);
