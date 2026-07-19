const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `  // STEP 3: Design Details
  const [designSelections, setDesignSelections] = useState<DesignSelections>({
    collar: DESIGN_OPTIONS.collars[0].name,
    embroidery: DESIGN_OPTIONS.embroideries[1].name,
    sleeve: DESIGN_OPTIONS.sleeves[1].name,
    pocket: DESIGN_OPTIONS.pockets[0].name,
    additionalCap: false,
    hemFinish: DESIGN_OPTIONS.hemFinishes[0].name,
  });`;

const replacement = `  // STEP 3: Design Details
  const [designSelections, setDesignSelections] = useState<DesignSelections>({
    accessories: []
  });`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
