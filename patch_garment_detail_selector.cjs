const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const regex = /const GarmentDetailSelector = \(\{\n  selectedStyle,\n  selectedGarment,\n  designSelections,\n  setDesignSelections,\n  hasLining,\n  setHasLining,\n  currencySymbol\n\}: any\) => \{/;

const rep = `const GarmentDetailSelector = ({
  selectedStyle,
  selectedGarment,
  designSelections,
  setDesignSelections,
  hasLining,
  setHasLining,
  currencySymbol
}: any) => {
  const customDetailCatalog = useAppStore((state: any) => state.customDetailCatalog);`;

content = content.replace(regex, rep);

content = content.replace(/const options = GARMENT_DETAIL_OPTIONS\.filter\(o => o\.selectionGroup === groupId\);/g, `const options = customDetailCatalog.filter((o: any) => o.selectionGroup === groupId && o.active);`);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
