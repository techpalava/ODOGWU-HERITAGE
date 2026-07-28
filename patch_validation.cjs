const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const regex = /if \(currentStep === 3\) \{[\s\S]*?if \(missingField\) \{[\s\S]*?return;\n      \}\n    \}/;

const newValidation = `if (currentStep === 3) {
      const demo = selectedStyle?.targetDemographic || selectedStyle?.gender || "unisex";
      const explicitBoth = selectedStyle?.featuresMaleAndFemale || demo === "family" || demo === "couple";
      const supportDetails = selectedStyle?.supportedGarmentDetails || [];
      
      const shouldShow = (demographic: "male" | "female", requiredGarments: string[]) => {
        let demoMatch = false;
        if (explicitBoth) {
          demoMatch = true;
        } else if (demo === demographic || demo === "unisex") {
          demoMatch = true;
        }
        
        if (!demoMatch) return false;
    
        if (supportDetails && supportDetails.length > 0) {
          return requiredGarments.some(g => supportDetails.includes(g));
        } else {
          const comp = (selectedStyle?.garmentComposition || "").toLowerCase();
          const name = (selectedStyle?.name || "").toLowerCase();
          
          const hasWord = (word: string) => comp.includes(word) || name.includes(word);
          
          if (requiredGarments.includes('shirt') && (hasWord('shirt') || hasWord('top') || hasWord('senator') || hasWord('agbada'))) return true;
          if (requiredGarments.includes('trousers') && (hasWord('trouser') || hasWord('pant') || hasWord('2 piece') || hasWord('two piece'))) return true;
          if (requiredGarments.includes('dress') && (hasWord('dress') || hasWord('gown') || hasWord('boubou') || hasWord('bubu'))) return true;
          if (requiredGarments.includes('skirt') && (hasWord('skirt'))) return true;
          if (requiredGarments.includes('shorts') && (hasWord('short') || hasWord('nikka'))) return true;
          
          if (!comp && demographic === 'male') return requiredGarments.includes('shirt');
          if (!comp && demographic === 'female') return requiredGarments.includes('dress');
          return false;
        }
      };
    
      const showShirt = shouldShow('male', ['shirt']);
      const showTrouser = shouldShow('male', ['trousers']);
      const showShorts = shouldShow('male', ['shorts']);
      const showBumShorts = shouldShow('male', ['bum_shorts']) || shouldShow('female', ['bum_shorts']);
      const showDress = shouldShow('female', ['dress']);
      const showSkirt = shouldShow('female', ['skirt']);
      const showNeck = showShirt || showDress;

      const customDetails = designSelections.customDetails || {};
      let missing = "";

      if (showShirt) {
        if (!customDetails.shirt_length_sleeve) missing = "shirt length and sleeve option";
        else if (!customDetails.shirt_pockets) missing = "shirt pockets option";
      }
      if (!missing && showDress) {
        if (!customDetails.dress_length_sleeve) missing = "dress length and sleeve option";
        else if (!customDetails.dress_pockets) missing = "dress pockets option";
      }
      if (!missing && showNeck) {
        if (!customDetails.neck_design) missing = "neck design";
      }
      if (!missing && showTrouser) {
        if (!customDetails.trousers) missing = "trouser option";
        else if (!customDetails.trouser_pockets) missing = "trouser pockets option";
      }
      if (!missing && showShorts) {
        if (!customDetails.standard_shorts) missing = "shorts option";
        else if (!customDetails.standard_shorts_pockets) missing = "shorts pockets option";
      }
      if (!missing && showBumShorts) {
        if (!customDetails.bum_shorts) missing = "bum shorts option";
        else if (!customDetails.bum_shorts_pockets) missing = "bum shorts pockets option";
      }
      if (!missing && showSkirt) {
        if (!customDetails.skirt) missing = "skirt option";
        else if (!customDetails.skirt_pockets) missing = "skirt pockets option";
      }

      if (missing) {
        setValidationError(\`Please select a \${missing}.\`);
        setTimeout(() => {
          document.getElementById("design-studio-stepper")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
        return;
      }
    }`;
content = content.replace(regex, newValidation);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
