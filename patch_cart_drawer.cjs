const fs = require('fs');
let content = fs.readFileSync('src/components/CartDrawer.tsx', 'utf8');

content = content.replace(/import \{ GARMENT_DETAIL_OPTIONS \} from '\.\.\/config\/GarmentDetailsConfig';\n/, '');

const catalogStoreLine = `  const customDetailCatalog = useAppStore((state) => state.customDetailCatalog);`;
content = content.replace(/  const batches = useAppStore\(\(state\) => state.batches\);/, `  const batches = useAppStore((state) => state.batches);\n${catalogStoreLine}`);

const mapReplace = `const opt = GARMENT_DETAIL_OPTIONS.find`;
content = content.replace(mapReplace, `const opt = customDetailCatalog.find`);

fs.writeFileSync('src/components/CartDrawer.tsx', content);
