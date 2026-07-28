const fs = require('fs');
let content = fs.readFileSync('src/services/storageService.ts', 'utf8');

const regexImport = /import \{\s*CustomGroup,/;
content = content.replace(regexImport, 'import { CustomDetailOption, CustomGroup, ');

const SEED_IMPORT = `import { SEED_CUSTOM_DETAIL_CATALOG } from "../config/GarmentDetailsConfig";\n`;
const imgImportRegex = /import \{ ImageService \} from "\.\/imageService";/;
content = content.replace(imgImportRegex, SEED_IMPORT + 'import { ImageService } from "./imageService";');

const classRegex = /export const StorageService = \{/;
const newMethods = `export const StorageService = {
  async getCatalog(): Promise<CustomDetailOption[]> {
    try {
      const snap = await getDocs(collection(db, "custom_detail_catalog"));
      const catalog: CustomDetailOption[] = [];
      snap.forEach((doc) => catalog.push(doc.data() as CustomDetailOption));
      
      if (catalog.length === 0) {
        console.warn("Catalog empty, using fallback seed...");
        return SEED_CUSTOM_DETAIL_CATALOG;
      }
      return catalog;
    } catch (e) {
      console.error("Failed to load catalog, using fallback", e);
      return SEED_CUSTOM_DETAIL_CATALOG;
    }
  },

  async saveCatalogOption(option: CustomDetailOption): Promise<void> {
    await setDoc(doc(db, "custom_detail_catalog", option.id), option);
  },
`;

content = content.replace(classRegex, newMethods);
fs.writeFileSync('src/services/storageService.ts', content);
