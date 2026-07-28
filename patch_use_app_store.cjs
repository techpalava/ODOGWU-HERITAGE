const fs = require('fs');
let content = fs.readFileSync('src/store/useAppStore.ts', 'utf8');

const importRegex = /import \{\s*Customer,/;
content = content.replace(importRegex, 'import { CustomDetailOption, Customer, ');

const interfaceRegex = /  styles\: StyleCategory\[\];/;
content = content.replace(interfaceRegex, '  customDetailCatalog: CustomDetailOption[];\n  setCustomDetailCatalog: (catalog: CustomDetailOption[]) => void;\n  styles: StyleCategory[];');

const initRegex = /  setBusinessSettings: \(/;
content = content.replace(initRegex, `  customDetailCatalog: [],
  setCustomDetailCatalog: (catalog) => set({ customDetailCatalog: catalog }),
  setBusinessSettings: (`);

// in initializeData:
const initDataRegex = /const storedSettings = await StorageService.getBusinessSettings\(\);/;
content = content.replace(initDataRegex, `
      const catalog = await StorageService.getCatalog();
      set({ customDetailCatalog: catalog });
      const storedSettings = await StorageService.getBusinessSettings();
`);

fs.writeFileSync('src/store/useAppStore.ts', content);
