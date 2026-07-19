const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `  const isShirt = ['G1', 'G2', 'G5', 'G6'].includes(gCode) || name.includes('shirt') || name.includes('kaftan') || name.includes('senator');
  const isDress = ['L1', 'L2', 'L3', 'L4'].includes(gCode);
  const isTrouser = ['G4', 'G5', 'G6', 'L6', 'L7', 'L8', 'L9', 'L10'].includes(gCode) || name.includes('trouser') || name.includes('pant');
  const isShorts = ['G3'].includes(gCode) || name.includes('short');
  const isSkirt = name.includes('skirt');
  const isLiningSupported = ['L1', 'L2', 'L3', 'L4'].includes(gCode);`;

const replacement = `  const comp = (selectedStyle?.garmentComposition || "").toLowerCase();
  
  const isShirt = ['G1', 'G2', 'G5', 'G6'].includes(gCode) 
    || name.includes('shirt') 
    || name.includes('kaftan') 
    || name.includes('senator') 
    || name.includes('agbada')
    || comp.includes('shirt')
    || comp.includes('top');

  const isDress = ['L1', 'L2', 'L3', 'L4'].includes(gCode)
    || name.includes('dress')
    || name.includes('gown')
    || name.includes('boubou')
    || comp.includes('dress')
    || comp.includes('gown');

  const isTrouser = ['G4', 'G5', 'G6', 'L6', 'L7', 'L8', 'L9', 'L10'].includes(gCode) 
    || name.includes('trouser') 
    || name.includes('pant')
    || name.includes('senator')
    || name.includes('kaftan set')
    || name.includes('agbada')
    || comp.includes('2-piece')
    || comp.includes('3-piece')
    || comp.includes('set')
    || comp.includes('trouser')
    || comp.includes('pant');

  const isShorts = ['G3'].includes(gCode) 
    || name.includes('short')
    || comp.includes('short')
    || name.includes('nikka')
    || comp.includes('nikka');

  const isSkirt = name.includes('skirt')
    || comp.includes('skirt')
    || comp.includes('wrapper');

  const isLiningSupported = ['L1', 'L2', 'L3', 'L4'].includes(gCode) 
    || isDress 
    || isSkirt;`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
