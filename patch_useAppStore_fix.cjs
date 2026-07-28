const fs = require('fs');
let content = fs.readFileSync('src/store/useAppStore.ts', 'utf8');

// The incorrect part is:
//   businessSettings: BusinessSettings;
//   customDetailCatalog: [],
//   setCustomDetailCatalog: (catalog) => set({ customDetailCatalog: catalog }),
//   setBusinessSettings: (

content = content.replace(/  businessSettings: BusinessSettings;\n  customDetailCatalog: \[\],\n  setCustomDetailCatalog: \(catalog\) => set\(\{ customDetailCatalog: catalog \}\),\n  setBusinessSettings: \(/, `  businessSettings: BusinessSettings;\n  setBusinessSettings: (`);

// And we need to add the initialization inside the `create` call.
// Let's find:
// export const useAppStore = create<AppState>((set, get) => ({
// and add the initializations.

const createRegex = /export const useAppStore = create<AppState>\(\(set, get\) => \(\{/;
const createRep = `export const useAppStore = create<AppState>((set, get) => ({\n  customDetailCatalog: [],\n  setCustomDetailCatalog: (catalog) => set({ customDetailCatalog: catalog }),`;

content = content.replace(createRegex, createRep);
fs.writeFileSync('src/store/useAppStore.ts', content);
