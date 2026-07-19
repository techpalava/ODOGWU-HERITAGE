const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `  const isSkirt = name.includes('skirt')
    || comp.includes('skirt')
    || comp.includes('wrapper');

  const isLiningSupported = ['L1', 'L2', 'L3', 'L4'].includes(gCode) 
    || isDress 
    || isSkirt;`;

const replacement = `  const isSkirt = name.includes('skirt')
    || comp.includes('skirt')
    || comp.includes('wrapper');

  const isLiningSupported = ['L1', 'L2', 'L3', 'L4'].includes(gCode) 
    || isDress 
    || isSkirt;

  const supported = selectedStyle?.supportedGarmentDetails || {};
  const showTrousers = isTrouser && (supported.trousers !== false);
  const showShorts = isShorts && (supported.shorts !== false);
  const showSkirt = isSkirt && (supported.skirt !== false);
  const showDress = isDress && (supported.dress !== false);
  const showSleeves = (isShirt || isDress) && (supported.sleeves !== false);
  const showPockets = supported.pockets !== false;
  const showEmbroidery = supported.embroidery !== false;
  const showAccessories = supported.accessories !== false;
  const showLining = isLiningSupported && (supported.lining !== false);`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
