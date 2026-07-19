const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `      const isSkirt = name.includes('skirt')
        || comp.includes('skirt')
        || comp.includes('wrapper');

      let missingField = "";
      if ((isMale || isFamily) && isShirt) {
        if (!designSelections.topLength) missingField = "Top Length";
        if (!designSelections.topPocket) missingField = "Top Pocket";
      }
      if ((isFemale || isFamily) && isDress) {
        if (!designSelections.dressLength) missingField = "Dress Length";
        if (!designSelections.dressPocket) missingField = "Dress Pocket";
      }
      if ((isFemale || isFamily) && isSkirt) {
        if (!designSelections.skirtLength) missingField = "Skirt Length";
        if (!designSelections.skirtPocket) missingField = "Skirt Pocket";
      }
      if (isShirt || isDress) {
        if (!designSelections.sleeveLength) missingField = "Sleeve Length";
      }
      if (isTrouser) {
        if (!designSelections.trouserFastening) missingField = "Trouser Fastening";
        if (!designSelections.trouserPocket) missingField = "Trouser Pocket";
      }
      if (isShorts) {
        if (!designSelections.shortFastening) missingField = "Short Fastening";
        if (!designSelections.shortPocket) missingField = "Short Pocket";
      }`;

const replacement = `      const isSkirt = name.includes('skirt')
        || comp.includes('skirt')
        || comp.includes('wrapper');

      const supported = selectedStyle?.supportedGarmentDetails || {};
      const showTrousers = isTrouser && (supported.trousers !== false);
      const showShorts = isShorts && (supported.shorts !== false);
      const showSkirt = isSkirt && (supported.skirt !== false);
      const showDress = isDress && (supported.dress !== false);
      const showSleeves = (isShirt || isDress) && (supported.sleeves !== false);
      const showPockets = supported.pockets !== false;
      const showEmbroidery = supported.embroidery !== false;
      const showAccessories = supported.accessories !== false;

      let missingField = "";
      if ((isMale || isFamily) && isShirt) {
        if (!designSelections.topLength) missingField = "Top Length";
        if (showPockets && !designSelections.topPocket) missingField = "Top Pocket";
      }
      if ((isFemale || isFamily) && showDress) {
        if (!designSelections.dressLength) missingField = "Dress Length";
        if (showPockets && !designSelections.dressPocket) missingField = "Dress Pocket";
      }
      if ((isFemale || isFamily) && showSkirt) {
        if (!designSelections.skirtLength) missingField = "Skirt Length";
        if (showPockets && !designSelections.skirtPocket) missingField = "Skirt Pocket";
      }
      if (showSleeves) {
        if (!designSelections.sleeveLength) missingField = "Sleeve Length";
      }
      if (showTrousers) {
        if (!designSelections.trouserFastening) missingField = "Trouser Fastening";
        if (showPockets && !designSelections.trouserPocket) missingField = "Trouser Pocket";
      }
      if (showShorts) {
        if (!designSelections.shortFastening) missingField = "Short Fastening";
        if (showPockets && !designSelections.shortPocket) missingField = "Short Pocket";
      }`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
