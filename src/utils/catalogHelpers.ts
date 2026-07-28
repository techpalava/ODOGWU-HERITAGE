import { CustomDetailOption, StyleCategory, DesignSelections } from '../types';

export const getApplicableCustomDetailGroups = (style: StyleCategory | null, catalog: CustomDetailOption[]) => {
  if (!style) return [];
  const conf = style.customDetailConfig;
  
  let supportedGroups: string[] = [];
  
  if (conf && conf.enabled) {
    supportedGroups = conf.supportedGarmentGroups || [];
  } else if (!conf) {
    // Legacy fallback mapping
    const isMale = style.gender === 'male' || style.targetDemographic === 'male';
    const isFemale = style.gender === 'female' || style.targetDemographic === 'female';
    const isUnisex = style.gender === 'unisex' || style.targetDemographic === 'unisex';
    const isFamily = style.gender === 'family' || style.gender === 'couple' || style.featuresMaleAndFemale;
    
    const comp = (style.garmentComposition || "").toLowerCase();
    const name = (style.name || "").toLowerCase();
    const hasWord = (w: string) => comp.includes(w) || name.includes(w);
    
    if (isMale || isFamily || isUnisex) {
      if (hasWord('shirt') || hasWord('top') || hasWord('senator') || hasWord('agbada')) supportedGroups.push('shirt', 'neck');
      if (hasWord('trouser') || hasWord('pant') || hasWord('2 piece') || hasWord('two piece')) supportedGroups.push('trousers');
      if (hasWord('short') && !hasWord('bum')) supportedGroups.push('standard_shorts');
      if (hasWord('bum')) supportedGroups.push('bum_shorts');
    }
    
    if (isFemale || isFamily || isUnisex) {
      if (hasWord('dress') || hasWord('gown') || hasWord('boubou') || hasWord('bubu')) supportedGroups.push('dress', 'neck');
      if (hasWord('skirt') || hasWord('wrapper')) supportedGroups.push('skirt');
      if (hasWord('bum')) supportedGroups.push('bum_shorts');
    }
    
    // Explicit exclusions based on legacy supportedGarmentDetails
    if (style.supportedGarmentDetails && Array.isArray(style.supportedGarmentDetails)) {
       supportedGroups = supportedGroups.filter(g => style.supportedGarmentDetails?.includes(g) || style.supportedGarmentDetails?.includes(g.replace('standard_', '')));
    }
  } else {
    return []; // conf explicitly disabled
  }

  // Find all active options matching these groups
  const applicableOptions = catalog.filter(o => o.active && supportedGroups.includes(o.garmentGroup));
  
  // Also filter by demographic
  const genders = conf?.representedGenders || (
    style.gender === 'male' ? ['male'] :
    style.gender === 'female' ? ['female'] :
    style.gender === 'family' ? ['male', 'female'] :
    style.gender === 'couple' ? ['male', 'female'] :
    ['male', 'female', 'unisex']
  );
  
  return applicableOptions.filter(o => o.eligibleDemographics.some(d => genders.includes(d) || d === 'unisex'));
};

export const getCustomDetailsBreakdown = (selections: DesignSelections, catalog: CustomDetailOption[]) => {
  const items: any[] = [];
  if (!selections.customDetailsByGarment) {
     // Check flat customDetails for legacy
     if (selections.customDetails) {
       Object.values(selections.customDetails).forEach(id => {
         const opt = catalog.find(o => o.id === id);
         if (opt) items.push({ label: opt.label, value: "", price: opt.priceCents / 100, originalId: opt.id });
       });
     }
     return items;
  }
  
  Object.values(selections.customDetailsByGarment).forEach(garmentSelections => {
    Object.values(garmentSelections).forEach(id => {
      const opt = catalog.find(o => o.id === id);
      if (opt) {
        items.push({ label: opt.label, value: "", price: opt.priceCents / 100, originalId: opt.id });
      }
    });
  });
  return items;
};

export const calculateCustomDetailsPrice = (selections: DesignSelections, catalog: CustomDetailOption[]): number => {
  return getCustomDetailsBreakdown(selections, catalog).reduce((acc, item) => acc + item.price, 0);
};
