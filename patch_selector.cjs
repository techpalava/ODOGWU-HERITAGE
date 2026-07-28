const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const regex = /const GarmentDetailSelector = \(\{[\s\S]*?const GarmentDetailSummaryItems =/m;

const newComponent = `import { GARMENT_DETAIL_OPTIONS, SelectionGroup } from '../config/GarmentDetailsConfig';

const GarmentDetailSelector = ({
  selectedStyle,
  selectedGarment,
  designSelections,
  setDesignSelections,
  hasLining,
  setHasLining,
  currencySymbol
}: any) => {
  const customDetails = designSelections.customDetails || {};

  const handleSelect = (groupId: string, optionId: string) => {
    setDesignSelections((prev: any) => ({
      ...prev,
      customDetails: {
        ...(prev.customDetails || {}),
        [groupId]: optionId
      }
    }));
  };

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
      
      // Defaults if we can't figure it out
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
  // Neck is shown if shirt or dress is shown
  const showNeck = showShirt || showDress;

  const renderGroup = (groupId: SelectionGroup, title: string) => {
    const options = GARMENT_DETAIL_OPTIONS.filter(o => o.selectionGroup === groupId);
    if (options.length === 0) return null;
    return (
      <div className="space-y-2 mb-4 col-span-1" key={groupId}>
        <label className="block font-bold text-heritage-green uppercase tracking-wider text-[10px]">
          {title}
        </label>
        <div className="space-y-2">
          {options.map(opt => (
            <label key={opt.id} className={\`flex items-start gap-3 cursor-pointer p-3 border \${customDetails[groupId] === opt.id ? 'border-heritage-gold bg-heritage-cream/20' : 'border-gray-150 bg-white'} rounded-xl hover:border-heritage-gold/50 transition\`}>
              <input 
                type="radio" 
                name={groupId} 
                checked={customDetails[groupId] === opt.id} 
                onChange={() => handleSelect(groupId, opt.id)}
                className="mt-1 h-4 w-4 text-heritage-green focus:ring-heritage-gold border-gray-300"
              />
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <span className="font-bold text-heritage-green text-xs block">{opt.label}</span>
                  {opt.priceCents > 0 && <span className="text-heritage-gold font-bold text-xs">+{currencySymbol}{(opt.priceCents/100).toFixed(2)}</span>}
                </div>
                <span className="text-[10px] text-heritage-ink/60 block leading-tight mt-1">{opt.description}</span>
              </div>
            </label>
          ))}
        </div>
      </div>
    );
  };

  const isLiningSupported = ['L1', 'L2', 'L3', 'L4'].includes(selectedGarment?.code || "");
  const showLining = (demo === "female" || explicitBoth) && isLiningSupported;

  return (
    <>
      {showShirt && renderGroup("shirt_length_sleeve", "Shirt Length & Sleeve")}
      {showNeck && renderGroup("neck_design", "Neck Design")}
      {showShirt && renderGroup("shirt_pockets", "Shirt Pockets")}
      
      {showDress && renderGroup("dress_length_sleeve", "Dress Length & Sleeve")}
      {showDress && renderGroup("dress_pockets", "Dress Pockets")}

      {showTrouser && renderGroup("trousers", "Trousers / Leg Pants")}
      {showTrouser && renderGroup("trouser_pockets", "Trouser Pockets")}

      {showShorts && renderGroup("standard_shorts", "Standard Leg Shorts (Nikka)")}
      {showShorts && renderGroup("standard_shorts_pockets", "Standard Shorts Pockets")}

      {showBumShorts && renderGroup("bum_shorts", "Bum / Leg Shorts")}
      {showBumShorts && renderGroup("bum_shorts_pockets", "Bum Shorts Pockets")}

      {showSkirt && renderGroup("skirt", "Skirt")}
      {showSkirt && renderGroup("skirt_pockets", "Skirt Pockets")}

      {showLining && (
        <div className="space-y-2 mb-4 col-span-1 md:col-span-2">
          <label className="block font-bold text-heritage-green uppercase tracking-wider text-[10px]">
            Dress Reinforcement
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-150 rounded-xl bg-heritage-cream/20 hover:border-heritage-gold/30 transition w-full md:w-1/2">
            <input
              type="checkbox"
              checked={hasLining}
              onChange={(e) => setHasLining(e.target.checked)}
              className="h-4 w-4 text-heritage-green focus:ring-heritage-gold rounded border-gray-300 cursor-pointer"
            />
            <div>
              <span className="font-bold text-heritage-green text-xs block">
                Add Inner Net / Lining (L5)
              </span>
              <span className="text-[10px] text-heritage-ink/50 block leading-tight">
                Provides structure & opacity (+{currencySymbol}10.00)
              </span>
            </div>
          </label>
        </div>
      )}
    </>
  );
};

const GarmentDetailSummaryItems =`;

content = content.replace(regex, newComponent);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
